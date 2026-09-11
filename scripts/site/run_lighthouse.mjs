/**
 * Lighthouse lab runner (Node API + chrome-launcher) against local _site or a base URL.
 * Usage:
 *   node scripts/site/run_lighthouse.mjs
 *   node scripts/site/run_lighthouse.mjs https://confenge.com.br
 */
import { createServer } from "http";
import { gzipSync } from "zlib";
import { createHash } from "crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  statSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { CRITICAL_MONEY_PATHS, evaluateLighthouseResults } from "./lighthouse_thresholds.mjs";
import {
  INFRASTRUCTURE_ATTEMPTS,
  MEASUREMENT_TIMEOUT_MS,
  OUTCOME,
  deriveTerminalState,
  isRetryableOutcome,
  installSupervisorShutdown,
  runMeasurement,
} from "./lighthouse_infra.mjs";
import {
  deriveCoverage,
  formatCoverageDeclaration,
  loadPolicy,
  resolveSiteRoot,
  runtimeLighthouseContractForRoute,
  verifyRuntimeAcceptedProjectionDocument,
  verifyRuntimeInventoryDocument,
} from "./interface_coverage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs", "lighthouse-runs");
const cliArgs = process.argv.slice(2);
const option = (name) => cliArgs.find((arg) => arg.startsWith(`--${name}=`))?.split("=", 2)[1] || "";
const evidenceLabel = option("label");
if (evidenceLabel && !/^[a-z0-9-]+$/.test(evidenceLabel)) {
  throw new Error(`--label must contain only lowercase letters, numbers and dashes: ${evidenceLabel}`);
}
const FINAL_REPEATED_RUNS = 3;
const configuredRuns = option("runs") || process.env.LH_HOME_RUNS;
const REPEATED_RUNS = Number(configuredRuns || FINAL_REPEATED_RUNS);
if (!Number.isInteger(REPEATED_RUNS) || REPEATED_RUNS < 1 || REPEATED_RUNS > 5) {
  throw new Error(`--runs/LH_HOME_RUNS must be an integer from 1 to 5, got ${configuredRuns}`);
}
const diagnosticRunCount = REPEATED_RUNS !== FINAL_REPEATED_RUNS;
if (diagnosticRunCount && !evidenceLabel) {
  throw new Error(
    `--runs/LH_HOME_RUNS=${REPEATED_RUNS} is diagnostic-only and requires --label; final evidence requires ${FINAL_REPEATED_RUNS} runs`,
  );
}
const coverage = deriveCoverage({ policy: loadPolicy(), siteRoot: resolveSiteRoot() });
const runtimeRoutes = option("runtime-route").split(",").map((value) => value.trim()).filter(Boolean);
if (new Set(runtimeRoutes).size !== runtimeRoutes.length) {
  throw new Error("--runtime-route contains duplicate routes");
}
const runtimeContracts = runtimeRoutes.map((route) => runtimeLighthouseContractForRoute(route));
const PAGES = [...coverage.lighthouse.pages, ...runtimeRoutes];
const only = option("only");
const requestedPages = only ? only.split(",").map((value) => value.trim()).filter(Boolean) : PAGES;
const unknownPages = requestedPages.filter((page) => !PAGES.includes(page));
if (unknownPages.length) throw new Error(`--only contains route(s) outside derived coverage: ${unknownPages.join(", ")}`);
const RUN_PAGES = [...new Set(requestedPages)];
if (only && !RUN_PAGES.includes("/")) {
  throw new Error("focused Lighthouse evidence must include / so the repeated home gate cannot be bypassed");
}
const omittedRuntimeRoutes = runtimeRoutes.filter((route) => !RUN_PAGES.includes(route));
if (omittedRuntimeRoutes.length) {
  throw new Error(`--only omitted mandatory runtime Lighthouse route(s): ${omittedRuntimeRoutes.join(", ")}`);
}
const IMAGE_GATE_PAGES = new Set(coverage.lighthouse.image_gate_pages);
const SEO_EXEMPT_PAGES = new Set(coverage.lighthouse.seo_exempt_pages);
console.log(formatCoverageDeclaration(coverage));
console.log(`lighthouse pages (${RUN_PAGES.length}/${PAGES.length}): ${RUN_PAGES.join(" ")}`);
for (const [name, configuredPages] of [
  ["image_gate_pages", IMAGE_GATE_PAGES],
  ["seo_exempt_pages", SEO_EXEMPT_PAGES],
]) {
  const missingPages = [...configuredPages].filter((path) => !PAGES.includes(path));
  if (missingPages.length) {
    throw new Error(`${name} must be included in derived Lighthouse pages: ${missingPages.join(", ")}`);
  }
}
// Kept in step with gzip_types/gzip_min_length in the packaged nginx http wrapper.
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|json|manifest\+json|xml|xml\+rss|rss\+xml)|image\/svg\+xml)/;
const GZIP_MIN_LENGTH = 1024;
const PORT = Number(process.env.LH_PORT || 8766);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".txt": "text/plain",
};

const baseArg = cliArgs.find((arg) => !arg.startsWith("--"));
const expectedSha = option("expected-sha");
/**
 * Declares that this run measures the PUBLIC EDGE, so the observed server
 * latency is granted as an LCP allowance.
 *
 * Until now that semantics was implied by the presence of a runtime route,
 * which meant whether an opportunity happened to be published silently decided
 * how the home was judged: with the family withdrawn, the same public page
 * would have been measured with lab semantics and charged for real network
 * latency it cannot control. The network semantics are now stated, not
 * inferred.
 */
const publicEdge = cliArgs.includes("--public-edge");
if (publicEdge && !baseArg) {
  throw new Error("--public-edge requires an explicit public base URL; it must never describe the local lab server");
}
if (runtimeRoutes.length && !baseArg) {
  throw new Error("--runtime-route requires an explicit staged/production base URL");
}
if (runtimeRoutes.length && !/^[0-9a-f]{40}$/.test(expectedSha)) {
  throw new Error("--runtime-route requires --expected-sha=<40 lowercase hex> to bind runtime evidence to the release");
}
if (runtimeRoutes.length && evidenceLabel !== expectedSha) {
  throw new Error("--runtime-route requires --label=<expected-sha> so post-stage evidence cannot overwrite package evidence");
}
let server = null;
let BASE = baseArg;

if (!BASE) {
  const siteRoot = existsSync(join(ROOT, "_site", "index.html")) ? join(ROOT, "_site") : ROOT;
  const gzipCache = new Map();
  server = createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = join(siteRoot, urlPath);
    if (!filePath.startsWith(siteRoot) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    // Model the delivery contract implemented by the canonical Netcup origin
    // (deploy/netcup/nginx/confenge-web-http.conf). The legacy Netlify preview
    // also gzips text responses. Serving this fixture uncompressed measured a
    // cost that no
    // visitor pays and pushed the score of text-heavy pages down by hundreds of
    // milliseconds of imaginary transfer. Thresholds are unchanged — only the
    // transport now matches production. Cache the gzip so lab TTFB models nginx
    // rather than Node gzipSync on every repeated home run.
    const contentType = MIME[extname(filePath)] || "application/octet-stream";
    const body = readFileSync(filePath);
    const acceptsGzip = /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
    if (acceptsGzip && COMPRESSIBLE.test(contentType) && body.length >= GZIP_MIN_LENGTH) {
      let compressed = gzipCache.get(filePath);
      if (!compressed) {
        compressed = gzipSync(body, { level: 6 });
        gzipCache.set(filePath, compressed);
      }
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Encoding": "gzip",
        Vary: "Accept-Encoding",
      });
      res.end(compressed);
      return;
    }
    res.writeHead(200, { "Content-Type": contentType, Vary: "Accept-Encoding" });
    res.end(body);
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${PORT}`;
}

// Prerequisite fetches against the public edge get a timeout and a bounded
// retry so a transport blip cannot masquerade as a failed release; a stable
// non-200 still fails closed.
const EDGE_FETCH_TIMEOUT_MS = 20000;
const EDGE_FETCH_ATTEMPTS = 3;
async function fetchEdge(url, headers) {
  let last = null;
  for (let attempt = 1; attempt <= EDGE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "manual", headers, signal: AbortSignal.timeout(EDGE_FETCH_TIMEOUT_MS) });
      if (response.status === 200 || !(response.status === 403 || response.status === 429 || response.status >= 500)) return response;
      last = new Error(`${url} -> ${response.status}`);
    } catch (error) {
      last = error;
    }
    if (attempt < EDGE_FETCH_ATTEMPTS) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw last;
}

async function fetchRequired(url, kind) {
  const response = await fetchEdge(url, { accept: kind === "json" ? "application/json" : "application/xml,text/xml" });
  if (response.status !== 200) throw new Error(`runtime Lighthouse ${kind} fetch failed: ${url} -> ${response.status}`);
  return kind === "json" ? response.json() : response.text();
}

async function fetchExactRuntimeHtml(origin, route) {
  const response = await fetchEdge(`${origin}${route}`, { accept: "text/html" });
  if (response.status !== 200) {
    throw new Error(`runtime Lighthouse direct HTML fetch failed: ${route} -> ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  return { body, text: body.toString("utf8") };
}

async function verifyRuntimeEvidenceInputs() {
  if (!runtimeContracts.length) return null;
  const origin = BASE.replace(/\/$/, "");
  const [buildInfo, runtimeInfo] = await Promise.all([
    fetchRequired(`${origin}/.well-known/build-info.json`, "json"),
    fetchRequired(`${origin}/.well-known/runtime-info.json`, "json"),
  ]);
  if (buildInfo.commit !== expectedSha || runtimeInfo.release_sha !== expectedSha) {
    throw new Error(
      `runtime Lighthouse identity mismatch: expected=${expectedSha} build=${buildInfo.commit || "missing"} runtime=${runtimeInfo.release_sha || "missing"}`,
    );
  }
  const inventories = new Map();
  const projections = new Map();
  const selectedRoutes = [];
  for (const contract of runtimeContracts) {
    if (!projections.has(contract.accepted_projection_route)) {
      projections.set(
        contract.accepted_projection_route,
        await fetchRequired(`${origin}${contract.accepted_projection_route}`, "json"),
      );
    }
    const projection = projections.get(contract.accepted_projection_route);
    const acceptedItem = verifyRuntimeAcceptedProjectionDocument(
      contract.route,
      projection,
      contract,
      expectedSha,
    );
    if (!inventories.has(contract.inventory_route)) {
      inventories.set(
        contract.inventory_route,
        await fetchRequired(`${origin}${contract.inventory_route}`, "xml"),
      );
    }
    verifyRuntimeInventoryDocument(
      contract.route,
      inventories.get(contract.inventory_route),
      contract,
      projection.routes.map((item) => item.route),
    );
    const page = await fetchExactRuntimeHtml(origin, contract.route);
    const observedSha256 = createHash("sha256").update(page.body).digest("hex");
    if (observedSha256 !== acceptedItem.sha256) {
      throw new Error(
        `runtime Lighthouse accepted HTML digest mismatch: route=${contract.route} accepted=${acceptedItem.sha256} observed=${observedSha256}`,
      );
    }
    if (
      !page.text.includes(`data-opportunity-id="${acceptedItem.opportunity_id}"`)
      || !page.text.includes('data-index-state="INDEX"')
    ) {
      throw new Error(`runtime Lighthouse accepted page identity is absent from rendered HTML: ${contract.route}`);
    }
    selectedRoutes.push({
      family_id: contract.family_id,
      route: contract.route,
      opportunity_id: acceptedItem.opportunity_id,
      content_hash: acceptedItem.content_hash,
      html_sha256: observedSha256,
      accepted_projection_sha256: projection.accepted_projection_sha256,
      producer_manifest_hash: projection.manifest_hash,
      consumer_observed_manifest_hash: projection.consumer_observed_manifest_hash,
      source_run_id: projection.source_run_id,
      as_of: projection.as_of,
    });
  }
  const staticHtml = [];
  for (const projection of projections.values()) {
    for (const htmlPath of projection.static_html_paths) {
      const route = htmlPath
        .replace(/^_site/, "")
        .replace(/index\.html$/, "");
      const page = await fetchExactRuntimeHtml(origin, route);
      const observedSha256 = createHash("sha256").update(page.body).digest("hex");
      if (observedSha256 !== projection.static_html_sha256[htmlPath]) {
        throw new Error(
          `runtime Lighthouse static HTML digest mismatch: route=${route} accepted=${projection.static_html_sha256[htmlPath]} observed=${observedSha256}`,
        );
      }
      staticHtml.push({ route, html_path: htmlPath, sha256: observedSha256 });
    }
  }
  return {
    expected_sha: expectedSha,
    build_commit: buildInfo.commit,
    runtime_release_sha: runtimeInfo.release_sha,
    routes: selectedRoutes,
    static_html: staticHtml,
  };
}

// The evidence directory exists before any step that can fail, so a terminal
// summary can always be written. A run that ends without one is indistinguishable
// from a run that never happened, and the release evidence upload requires it.
mkdirSync(OUT, { recursive: true });

const results = [];
/** Non-null once something made the run unable to continue. It never turns a
 * failure into a pass; it names the cause inside the terminal summary. */
let fatal = null;

let runtimeEvidence = null;
try {
  runtimeEvidence = await verifyRuntimeEvidenceInputs();
} catch (error) {
  fatal = `runtime evidence prerequisites did not verify: ${String(error?.message || error)}`;
}

const CHILD = join(ROOT, "scripts", "site", "lighthouse_measure_child.mjs");
const WORK = mkdtempSync(join(tmpdir(), "confenge-lighthouse-supervisor-"));

/** Whole-run budget. The release job allows 30 minutes and the site-ci gates
 * 45; reserving time here means the supervisor, not the job timeout, ends the
 * run, so the terminal summary and its evidence are always persisted. */
const GLOBAL_BUDGET_MS = Number(process.env.LH_GLOBAL_BUDGET_MS || 21 * 60 * 1000);
const startedAt = Date.now();

// The acceptance wrapper supervises this process and will SIGKILL it if it
// overruns. SIGKILL cannot be trapped, so the signals we CAN trap must take the
// measurement children — and their browsers — down with us; the child covers
// the untrappable case by watching for being orphaned.
// SIGTERM first, then escalation: a child killed outright never gets to tear
// down its own detached browser, which would then outlive the run.
installSupervisorShutdown(() => {
  if (server) server.close();
});
/** Whether a whole measurement still fits, so none is started only to be cut
 * short and blamed on the page it was measuring. */
const affordsMeasurement = () =>
  GLOBAL_BUDGET_MS - (Date.now() - startedAt) >= MEASUREMENT_TIMEOUT_MS;

/**
 * Performs one attempt in a disposable child process.
 *
 * The supervisor never launches a browser itself: it owns only the deadline,
 * the attempt bookkeeping and the evidence. That is what keeps an asynchronous
 * rejection inside Lighthouse from ending the run.
 */
async function measureOnce(spec, lhrPath) {
  const specPath = join(WORK, `spec-${spec.slug}-${spec.run}-${spec.attempt}.json`);
  const outcomePath = join(WORK, `outcome-${spec.slug}-${spec.run}-${spec.attempt}.json`);
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  return runMeasurement({
    childPath: CHILD,
    specPath,
    outcomePath,
    lhrPath,
    // A full deadline or none at all. Shrinking it to whatever budget is left
    // would terminate a healthy page early and then report the truncation as
    // evidence about that page — Lighthouse alone waits up to 45s for load, so
    // a 30s remainder guarantees a false verdict. The caller refuses to start a
    // measurement it cannot afford (see the budget check below).
    timeoutMs: MEASUREMENT_TIMEOUT_MS,
  });
}

try {
  // A deterministic, result-free preflight warms the Chromium executable and
  // shared-library page cache. It runs once and never depends on a score, so
  // no failing page result is retried or discarded.
  const preflight = await measureOnce(
    { preflight: true, slug: "preflight", run: 0, attempt: 1, chrome_path: process.env.CHROME_PATH },
    null,
  );
  if (preflight.outcome !== OUTCOME.MEASURED) {
    // The preflight is not evidence, but a browser that cannot start at all is
    // an instrument failure that must be named, not silently absorbed.
    console.error("lighthouse preflight failed", preflight.phase, preflight.error);
  }

  for (const path of RUN_PAGES) {
    if (fatal) break;
    const attempts = CRITICAL_MONEY_PATHS.has(path) ? REPEATED_RUNS : 1;
    for (let run = 1; run <= attempts; ) {
      // Enough budget for a FULL measurement, not merely some budget left.
      if (!affordsMeasurement()) {
        fatal = `the Lighthouse budget of ${GLOBAL_BUDGET_MS}ms cannot afford a full measurement of ${path} run ${run}`;
        break;
      }
      const url = `${BASE.replace(/\/$/, "")}${path}`;
      const baseSlug = path === "/" ? "home" : path.replace(/\//g, "_").replace(/^_|_$/g, "");
      const slug = evidenceLabel ? `${baseSlug}-${evidenceLabel}` : baseSlug;
      const suffix = attempts > 1 ? `-run-${run}` : "";
      const outJson = join(OUT, `${slug}${suffix}.json`);

      let outcome = null;
      // Only an instrument failure raised before the artifact was touched is
      // attempted again, and only a bounded number of times. A measurement
      // that exists is never re-sampled, whatever its score.
      for (let attempt = 1; attempt <= INFRASTRUCTURE_ATTEMPTS; attempt += 1) {
        outcome = await measureOnce(
          {
            url,
            path,
            slug: baseSlug,
            run,
            attempt,
            out_json: outJson,
            base: BASE,
            form_factor: coverage.lighthouse.form_factor,
            viewport: coverage.lighthouse.viewport,
            runtime_mode: runtimeContracts.length > 0 || publicEdge,
            seo_exempt: SEO_EXEMPT_PAGES.has(path),
            chrome_path: process.env.CHROME_PATH,
          },
          outJson,
        );
        if (!isRetryableOutcome(outcome) || attempt === INFRASTRUCTURE_ATTEMPTS) break;
        console.error(
          "lighthouse infrastructure failure",
          path,
          `run ${run}`,
          `attempt ${attempt}/${INFRASTRUCTURE_ATTEMPTS}`,
          outcome.phase,
          outcome.error,
        );
        if (!affordsMeasurement()) {
          fatal = fatal || `the Lighthouse budget of ${GLOBAL_BUDGET_MS}ms was exhausted while re-attempting ${path} run ${run}`;
          break;
        }
      }

      if (outcome?.outcome === OUTCOME.MEASURED && outcome.row) {
        results.push(outcome.row);
      } else {
        // Every other outcome is recorded as a failing row carrying its class,
        // phase and cause. Nothing unknown becomes a pass, and nothing here
        // starts another navigation for this run.
        console.error("lighthouse failed", path, `run ${run}`, outcome?.outcome, outcome?.phase, outcome?.error);
        results.push({
          path,
          run,
          error: `${outcome?.outcome || OUTCOME.INVALID_OR_INCOMPLETE} in ${outcome?.phase || "unknown"}: ${outcome?.error || "no outcome recorded"}`,
          status: "error",
          outcome: outcome?.outcome || OUTCOME.INVALID_OR_INCOMPLETE,
          phase: outcome?.phase || "unknown",
          lhr_written: Boolean(outcome?.lhr_written),
        });
      }
      run += 1;
    }
  }
} catch (error) {
  fatal = `the Lighthouse supervisor stopped: ${String(error?.message || error)}`;
} finally {
  if (server) server.close();
  rmSync(WORK, { recursive: true, force: true });
}

const evaluation = evaluateLighthouseResults(results, {
  homeRuns: REPEATED_RUNS,
  criticalRuns: REPEATED_RUNS,
  measuredPages: RUN_PAGES,
  imageGatePages: IMAGE_GATE_PAGES,
  seoExemptPages: SEO_EXEMPT_PAGES,
  thresholds: coverage.lighthouse.thresholds,
});
const summary = {
  base: BASE,
  generated_at: new Date().toISOString(),
  coverage: {
    policy_path: coverage.policy_path,
    public_route_count: coverage.route_count,
    family_count: coverage.lighthouse.families.length,
    families: coverage.lighthouse.families,
    runtime_families: coverage.lighthouse.runtime_families,
    runtime_evidence: runtimeEvidence,
    pages: PAGES,
    measured_pages: RUN_PAGES,
    critical_money_pages: [...CRITICAL_MONEY_PATHS],
    repeated_runs: REPEATED_RUNS,
    public_edge: publicEdge,
    additional_pages: coverage.lighthouse.additional_pages,
    image_gate_pages: [...IMAGE_GATE_PAGES],
    seo_exempt_pages: [...SEO_EXEMPT_PAGES],
    not_sampled_count: coverage.lighthouse.not_sampled_count,
    not_sampled: coverage.lighthouse.not_sampled,
    thresholds: coverage.lighthouse.thresholds,
  },
  results,
  evaluation,
};
// A run that could not complete is reported as incomplete evidence, never as
// a pass and never as a measured verdict about the artifact.
if (fatal) {
  evaluation.ok = false;
  evaluation.errors = [...(evaluation.errors || []), fatal];
}

// MEASURED_FAIL is a statement ABOUT THE ARTIFACT, so it may only be used when
// every row that failed did so with a measurement behind it. A row that never
// produced one — the browser died, the attempt was terminated, the evidence was
// inconclusive — makes the run inconclusive, not the site defective. Without
// this the originating incident inverts: three failed browser launches on one
// page would be reported as "the site is defective", which is exactly the
// confusion this contract exists to remove. It cannot weaken the barrier:
// promotion already requires MEASURED_PASS, so downgrading a failure to
// INVALID_OR_INCOMPLETE forbids strictly more.
const unmeasured = results.filter(
  (row) => row.error && row.outcome && row.outcome !== OUTCOME.MEASURED,
);
summary.terminal_state = deriveTerminalState({ results, fatal, evaluationOk: evaluation.ok });
summary.fatal = fatal;
summary.unmeasured = unmeasured.map((row) => ({
  path: row.path,
  run: row.run,
  outcome: row.outcome,
  phase: row.phase,
  error: row.error,
}));

// The terminal summary is written on every path — passed, failed, or unable to
// finish. The release evidence upload requires it, and a missing summary must
// never be mistaken for an accessory error.
const summaryName = evidenceLabel ? `summary-${evidenceLabel}.json` : "summary.json";
writeFileSync(join(OUT, summaryName), JSON.stringify(summary, null, 2));
console.log("Wrote", join(OUT, summaryName), summary.terminal_state);
if (!evaluation.ok) console.error("Lighthouse gates failed", JSON.stringify(evaluation));
else if (diagnosticRunCount) {
  console.log(
    "Lighthouse diagnostic completed; evidence is labelled and is not final",
    JSON.stringify(evaluation.home),
  );
} else console.log("Lighthouse gates passed", JSON.stringify(evaluation.home));
process.exit(evaluation.ok ? 0 : 1);
