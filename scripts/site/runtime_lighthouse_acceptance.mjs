/** Post-promote acceptance for the runtime-only opportunity family. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Coordinated deadlines. Without them a hung edge or a stuck subprocess is
 * bounded only by the job timeout, which kills the runner before any report is
 * written — leaving a release with no evidence at all, the state that reprova
 * the upload and cannot be told apart from a run that never happened.
 */
const IDENTITY_FETCH_TIMEOUT_MS = Number(process.env.RUNTIME_ACCEPTANCE_FETCH_TIMEOUT_MS || 30000);

/**
 * The measurement's own budget must expire BEFORE the supervision that kills
 * it, or the graceful degradation is dead code: the child would be SIGKILLed
 * while still measuring and could never write the summary that says the run was
 * inconclusive. The earlier pairing had it backwards — a 15-minute kill over a
 * 21-minute budget — so the promote path could only ever produce a hard failure
 * or exhaust the 30-minute job, and a job that dies post-swap is never rolled
 * back at all.
 *
 * This path measures the home three times plus at most one runtime route, which
 * takes a couple of minutes; ten minutes is ample, and the ordering below
 * leaves the job budget room for the promotion, the served-HTML reconciliation
 * and the evidence upload.
 */
const LIGHTHOUSE_BUDGET_MS = Number(process.env.RUNTIME_ACCEPTANCE_LH_BUDGET_MS || 600000);
const LIGHTHOUSE_SUBPROCESS_TIMEOUT_MS = Number(
  process.env.RUNTIME_ACCEPTANCE_LH_TIMEOUT_MS || LIGHTHOUSE_BUDGET_MS + 120000,
);
if (LIGHTHOUSE_SUBPROCESS_TIMEOUT_MS <= LIGHTHOUSE_BUDGET_MS) {
  throw new Error(
    "the measurement budget must expire before the supervision that kills it, or an inconclusive run can never report itself",
  );
}
const SCHEMA = "confenge.live-intelligence-overlay/v1";
const WITHDRAWAL_PROBE = "/oportunidades/pe-2026-000188-reforma-ubs-londrina-pr/";

function option(args, name) {
  return args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
}

export function validateRuntimeIdentity(buildInfo, runtimeInfo, expectedSha) {
  if (!/^[0-9a-f]{40}$/.test(String(expectedSha || ""))) {
    throw new Error("runtime acceptance requires a 40-character lowercase release SHA");
  }
  if (buildInfo?.commit !== expectedSha || runtimeInfo?.release_sha !== expectedSha) {
    throw new Error(
      `runtime identity mismatch: expected=${expectedSha} build=${buildInfo?.commit || "missing"} runtime=${runtimeInfo?.release_sha || "missing"}`,
    );
  }
}

export function validateWithdrawnOverlay(document, expectedSha) {
  if (document?.schema !== SCHEMA || document?.release_sha !== expectedSha) {
    throw new Error("withdrawn overlay identity mismatch");
  }
  if (
    document.official_live !== false
    || document.source_kind !== null
    || document.source_run_id !== null
    || document.manifest_hash !== null
    || document.consumer_observed_manifest_hash !== null
    || document.accepted_projection_sha256 !== null
  ) {
    throw new Error("withdrawn overlay falsely claims accepted official input");
  }
  if (!Array.isArray(document.routes) || document.routes.length !== 0) {
    throw new Error("withdrawn overlay retains accepted opportunity routes");
  }
  if (
    !Array.isArray(document.static_html_paths)
    || document.static_html_paths.length !== 1
    || document.static_html_paths[0] !== "_site/oportunidades/index.html"
  ) {
    throw new Error("withdrawn overlay has no exact static commercial hub");
  }
  if (
    !document.static_html_sha256
    || Object.keys(document.static_html_sha256).length !== 1
    || !/^[0-9a-f]{64}$/.test(String(document.static_html_sha256["_site/oportunidades/index.html"] || ""))
  ) {
    throw new Error("withdrawn overlay static commercial hub digest is invalid");
  }
  if (!Array.isArray(document.removed_html_paths)) {
    throw new Error("withdrawn overlay removed_html_paths is invalid");
  }
  return true;
}

/**
 * A withdrawn fixture detail is gone when the host answers 410 (the release
 * contract: _redirects maps the packaged fixture paths to /404.html with 410,
 * and _withdraw_packaged_opportunity_pages never touches _redirects) or 404
 * (a host that never had the rule). Anything else means it is still exposed.
 */
export function assertWithdrawnDetailStatus(status) {
  if (status !== 410 && status !== 404) {
    throw new Error(`withdrawn fixture detail remains exposed: ${WITHDRAWAL_PROBE} -> ${status}`);
  }
  return status;
}

export function hasFunctionalOpportunityAlternative(html) {
  const source = String(html || "");
  return /href=["']\/triagem-tecnica\/["']/.test(source)
    && /href=["']mailto:[^"']+@[^"']+["']/.test(source)
    && /href=["']tel:\+\d+["']/.test(source);
}

async function fetchExact(origin, path, accept) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "manual",
    headers: { accept },
    signal: AbortSignal.timeout(IDENTITY_FETCH_TIMEOUT_MS),
  });
  return {
    status: response.status,
    body: Buffer.from(await response.arrayBuffer()),
  };
}

async function fetchJson200(origin, path) {
  const response = await fetchExact(origin, path, "application/json");
  if (response.status !== 200) throw new Error(`runtime JSON fetch failed: ${path} -> ${response.status}`);
  return JSON.parse(response.body.toString("utf8"));
}


/**
 * Measures the public home, and optionally one runtime route, with the
 * mandatory counts and the production rules.
 *
 * The home used to be measured only when an opportunity happened to be
 * published, because the Lighthouse call lived inside the active-overlay
 * branch. With the family withdrawn, the most important page on the site was
 * promoted with no public measurement at all. `--public-edge` states the
 * network semantics explicitly so they no longer depend on whether an
 * opportunity exists.
 */
export function publicFamilyArgs({ origin, expectedSha, route, runnerPath }) {
  const only = route ? `/,${route}` : "/";
  return [
    runnerPath,
    origin,
    ...(route ? [`--runtime-route=${route}`] : []),
    `--expected-sha=${expectedSha}`,
    `--label=${expectedSha}`,
    `--only=${only}`,
    "--runs=3",
    // Stated, never inferred from whether an opportunity exists.
    "--public-edge",
  ];
}

/**
 * Rejects a summary that is not evidence about THIS promotion: one that could
 * not conclude, one measured with lab semantics, one left over from an earlier
 * release, or one that did not measure the home the required number of times.
 */
export function assertPublicFamilySummary(summary) {
  // The terminal state is REQUIRED, not merely checked when present. Guarding
  // it with `&&` meant a summary carrying no state at all passed: exactly the
  // shape of a report produced before this contract existed, or left behind by
  // an earlier release. Evidence that does not state how its run ended cannot
  // approve a promotion.
  if (summary?.terminal_state !== "MEASURED_PASS") {
    throw new Error(
      `runtime Lighthouse terminal state is ${JSON.stringify(summary?.terminal_state ?? null)}; only MEASURED_PASS is evidence of a concluded run`,
    );
  }
  if (summary?.evaluation?.ok !== true) {
    throw new Error("runtime Lighthouse summary did not meet the public budgets");
  }
  if (summary?.coverage?.public_edge !== true) {
    throw new Error("runtime Lighthouse summary was not measured with public edge semantics");
  }
  const home = (summary?.results || []).filter((row) => row.path === "/" && !row.error);
  if (home.length !== 3) {
    throw new Error(`public home was not measured three times: observed ${home.length}`);
  }
  return home;
}

function measurePublicFamily({
  origin,
  expectedSha,
  route,
  runnerPath = join(ROOT, "scripts/site/run_lighthouse.mjs"),
  summaryDir = join(ROOT, "docs", "lighthouse-runs"),
}) {
  const runner = spawnSync(
    process.execPath,
    publicFamilyArgs({ origin, expectedSha, route, runnerPath }),
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "inherit", "inherit"],
      timeout: LIGHTHOUSE_SUBPROCESS_TIMEOUT_MS,
      killSignal: "SIGKILL",
      env: { ...process.env, LH_GLOBAL_BUDGET_MS: String(LIGHTHOUSE_BUDGET_MS) },
    },
  );
  const summaryPath = join(summaryDir, `summary-${expectedSha}.json`);
  if (runner.status !== 0 || !existsSync(summaryPath)) {
    throw new Error(
      `runtime Lighthouse execution failed: exit=${runner.status ?? "signal"}${runner.signal ? ` signal=${runner.signal}` : ""}`,
    );
  }
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const home = assertPublicFamilySummary(summary);
  return { summary, summaryPath, home };
}

/**
 * `measurement` exists so the integrated wrapper can be rehearsed end to end
 * against a controlled local candidate. It is an ordinary optional parameter:
 * the CLI never passes it, `{}` spreads to nothing, and `measurePublicFamily`
 * keeps its production defaults for the runner path and the summary directory.
 */
export async function runAcceptance(args = process.argv.slice(2), measurement = {}) {
  const baseArg = args.find((arg) => !arg.startsWith("--"));
  const expectedSha = option(args, "expected-sha");
  const reportPath = resolve(option(args, "report") || join(ROOT, "build", "reports", `runtime-public-acceptance-${expectedSha || "invalid"}.json`));
  const report = {
    schema: "confenge.runtime-public-acceptance/v1",
    generated_at: new Date().toISOString(),
    base: baseArg || null,
    expected_sha: expectedSha || null,
    result: "FAILED",
    mode: null,
    evidence: {},
    errors: [],
  };
  try {
    if (!baseArg) throw new Error("runtime acceptance requires an explicit production base URL");
    const origin = new URL(baseArg).origin;
    if (origin !== baseArg.replace(/\/$/, "")) {
      throw new Error("runtime acceptance base URL must be a bare origin");
    }
    const [buildInfo, runtimeInfo, overlay] = await Promise.all([
      fetchJson200(origin, "/.well-known/build-info.json"),
      fetchJson200(origin, "/.well-known/runtime-info.json"),
      fetchJson200(origin, "/.well-known/live-intelligence-overlay.json"),
    ]);
    validateRuntimeIdentity(buildInfo, runtimeInfo, expectedSha);
    if (overlay.schema !== SCHEMA || overlay.release_sha !== expectedSha || !Array.isArray(overlay.routes)) {
      throw new Error("runtime overlay manifest identity or shape mismatch");
    }
    report.evidence.identity = {
      build_commit: buildInfo.commit,
      runtime_release_sha: runtimeInfo.release_sha,
      overlay_release_sha: overlay.release_sha,
    };

    if (overlay.routes.length > 0) {
      const route = [...overlay.routes]
        .map((item) => String(item?.route || ""))
        .sort()[0];
      if (!route.startsWith("/oportunidades/") || !route.endsWith("/")) {
        throw new Error(`runtime overlay selected an invalid opportunity route: ${route || "missing"}`);
      }
      const { summary, summaryPath, home } = measurePublicFamily({ origin, expectedSha, route, ...measurement });
      const measured = (summary.results || []).filter((row) => row.path === route && !row.error);
      const accepted = summary.coverage?.runtime_evidence?.routes || [];
      if (
        measured.length !== 1
        || !accepted.some((item) => item.route === route && item.html_sha256)
      ) {
        throw new Error("runtime Lighthouse summary does not prove the exact accepted route");
      }
      report.mode = "official_live_lighthouse";
      report.evidence.runtime_route = route;
      report.evidence.lighthouse_summary = summaryPath.slice(ROOT.length + 1);
      report.evidence.lighthouse_evaluation = summary.evaluation;
      report.evidence.public_home_runs = home.length;
    } else {
      validateWithdrawnOverlay(overlay, expectedSha);
      const [detail, sitemap, hub] = await Promise.all([
        fetchExact(origin, WITHDRAWAL_PROBE, "text/html"),
        fetchExact(origin, "/sitemap-oportunidades.xml", "application/xml,text/xml"),
        fetchExact(origin, "/oportunidades/", "text/html"),
      ]);
      assertWithdrawnDetailStatus(detail.status);
      if (sitemap.status !== 404 && !(sitemap.status === 200 && !/<loc>/i.test(sitemap.body.toString("utf8")))) {
        throw new Error(`withdrawn opportunity sitemap is neither absent nor empty: ${sitemap.status}`);
      }
      if (hub.status !== 200 || !hasFunctionalOpportunityAlternative(hub.body.toString("utf8"))) {
        throw new Error("withdrawn opportunity family has no functional contact alternative on its static hub");
      }
      const observedHubSha256 = createHash("sha256").update(hub.body).digest("hex");
      if (observedHubSha256 !== overlay.static_html_sha256["_site/oportunidades/index.html"]) {
        throw new Error("withdrawn opportunity contact hub digest differs from the stage manifest");
      }
      // The family is withdrawn, but the home is still the most important page
      // the release serves. It is measured with the same counts and the same
      // public semantics as in the active branch; none of the withdrawal
      // requirements above is relaxed to make room for it.
      const withdrawnHome = measurePublicFamily({ origin, expectedSha, route: null, ...measurement });
      report.evidence.lighthouse_summary = withdrawnHome.summaryPath.slice(ROOT.length + 1);
      report.evidence.lighthouse_evaluation = withdrawnHome.summary.evaluation;
      report.evidence.public_home_runs = withdrawnHome.home.length;
      report.mode = "verified_withdrawal_with_contact_alternative";
      report.evidence.withdrawn_detail = { route: WITHDRAWAL_PROBE, status: detail.status };
      report.evidence.opportunity_sitemap = { status: sitemap.status, loc_count: 0 };
      report.evidence.contact_hub = {
        route: "/oportunidades/",
        status: hub.status,
        channels: ["triagem", "email", "telefone"],
        sha256: observedHubSha256,
      };
    }
    report.result = "PASS";
  } catch (error) {
    report.errors.push(error?.message || String(error));
  } finally {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ result: report.result, mode: report.mode, report: reportPath }));
  }
  if (report.result !== "PASS") throw new Error(report.errors.join("; "));
  return report;
}

const invokedAsScript = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  runAcceptance().catch((error) => {
    console.error(`RUNTIME_PUBLIC_ACCEPTANCE_FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
