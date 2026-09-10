/** Post-promote acceptance for the runtime-only opportunity family. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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

async function runAcceptance(args = process.argv.slice(2)) {
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
      const runner = spawnSync(
        process.execPath,
        [
          join(ROOT, "scripts/site/run_lighthouse.mjs"),
          origin,
          `--runtime-route=${route}`,
          `--expected-sha=${expectedSha}`,
          `--label=${expectedSha}`,
          `--only=/,${route}`,
          "--runs=3",
        ],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "inherit", "inherit"] },
      );
      const summaryPath = join(ROOT, "docs", "lighthouse-runs", `summary-${expectedSha}.json`);
      if (runner.status !== 0 || !existsSync(summaryPath)) {
        throw new Error(`runtime Lighthouse execution failed: exit=${runner.status ?? "signal"}`);
      }
      const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
      const measured = (summary.results || []).filter((row) => row.path === route && !row.error);
      const accepted = summary.coverage?.runtime_evidence?.routes || [];
      if (
        summary.evaluation?.ok !== true
        || measured.length !== 1
        || !accepted.some((item) => item.route === route && item.html_sha256)
      ) {
        throw new Error("runtime Lighthouse summary does not prove the exact accepted route");
      }
      report.mode = "official_live_lighthouse";
      report.evidence.runtime_route = route;
      report.evidence.lighthouse_summary = summaryPath.slice(ROOT.length + 1);
      report.evidence.lighthouse_evaluation = summary.evaluation;
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
