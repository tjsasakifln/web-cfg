/**
 * Lighthouse lab runner (Node API + chrome-launcher) against local _site or a base URL.
 * Usage:
 *   node scripts/site/run_lighthouse.mjs
 *   node scripts/site/run_lighthouse.mjs https://confenge.com.br
 */
import { createServer } from "http";
import { gzipSync } from "zlib";
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
import { launch as launchChrome } from "chrome-launcher";
import lighthouse from "lighthouse";
import { CRITICAL_MONEY_PATHS, evaluateLighthouseResults } from "./lighthouse_thresholds.mjs";
import {
  deriveCoverage,
  formatCoverageDeclaration,
  loadPolicy,
  resolveSiteRoot,
} from "./interface_coverage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs", "lighthouse-runs");
const coverage = deriveCoverage({ policy: loadPolicy(), siteRoot: resolveSiteRoot() });
const PAGES = coverage.lighthouse.pages;
const cliArgs = process.argv.slice(2);
const option = (name) => cliArgs.find((arg) => arg.startsWith(`--${name}=`))?.split("=", 2)[1] || "";
const only = option("only");
const evidenceLabel = option("label");
if (evidenceLabel && !/^[a-z0-9-]+$/.test(evidenceLabel)) {
  throw new Error(`--label must contain only lowercase letters, numbers and dashes: ${evidenceLabel}`);
}
const requestedPages = only ? only.split(",").map((value) => value.trim()).filter(Boolean) : PAGES;
const unknownPages = requestedPages.filter((page) => !PAGES.includes(page));
if (unknownPages.length) throw new Error(`--only contains route(s) outside derived coverage: ${unknownPages.join(", ")}`);
const RUN_PAGES = [...new Set(requestedPages)];
if (only && !RUN_PAGES.includes("/")) {
  throw new Error("focused Lighthouse evidence must include / so the repeated home gate cannot be bypassed");
}
const IMAGE_GATE_PAGES = new Set(coverage.lighthouse.image_gate_pages);
const SEO_EXEMPT_PAGES = new Set(coverage.lighthouse.seo_exempt_pages);
const REPEATED_RUNS = Number(option("runs") || process.env.LH_HOME_RUNS || 1);
console.log(formatCoverageDeclaration(coverage));
console.log(`lighthouse pages (${RUN_PAGES.length}/${PAGES.length}): ${RUN_PAGES.join(" ")}`);
if (!Number.isInteger(REPEATED_RUNS) || REPEATED_RUNS < 1 || REPEATED_RUNS > 5) {
  throw new Error(`--runs/LH_HOME_RUNS must be an integer from 1 to 5, got ${option("runs") || process.env.LH_HOME_RUNS}`);
}
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

mkdirSync(OUT, { recursive: true });
const results = [];

async function waitForCdp(port, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Chrome CDP not ready on port ${port}`);
}

async function launchIsolatedChrome() {
  // chrome-launcher mistakes this WSL host for Windows and otherwise hands the
  // Linux Chrome a relative C:\\Users\\... profile path inside the checkout.
  // The final duplicate flag wins, keeps all mutable browser state in /tmp and
  // lets us remove the exact profile after every run.
  const profileDir = mkdtempSync(join(tmpdir(), "confenge-lighthouse-profile-"));
  try {
    const chrome = await launchChrome({
      chromePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
      // Keep chrome-launcher's logs and pid file in the same exact temporary
      // profile that we own. Under WSL its platform detection otherwise makes
      // a Windows-looking relative directory inside the checkout before the
      // final Linux --user-data-dir flag below takes precedence.
      userDataDir: profileDir,
      chromeFlags: [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        `--user-data-dir=${profileDir}`,
      ],
      connectionPollInterval: 250,
      maxConnectionRetries: 50,
    });
    await waitForCdp(chrome.port);
    return { chrome, profileDir };
  } catch (error) {
    rmSync(profileDir, { recursive: true, force: true });
    throw error;
  }
}

async function warmChromeHost() {
  // A deterministic, result-free preflight warms the Chromium executable and
  // shared-library page cache. It runs once for every matrix and never depends
  // on a score, so no failing page result is retried or discarded.
  let launched = null;
  try {
    launched = await launchIsolatedChrome();
    console.log("Lighthouse browser preflight", "clean_port=", launched.chrome.port);
  } finally {
    if (launched?.chrome) await launched.chrome.kill();
    if (launched?.profileDir) rmSync(launched.profileDir, { recursive: true, force: true });
  }
}

try {
  await warmChromeHost();
  for (const path of RUN_PAGES) {
    const attempts = CRITICAL_MONEY_PATHS.has(path) ? REPEATED_RUNS : 1;
    for (let run = 1; run <= attempts; ) {
      const url = `${BASE.replace(/\/$/, "")}${path}`;
      const baseSlug = path === "/" ? "home" : path.replace(/\//g, "_").replace(/^_|_$/g, "");
      const slug = evidenceLabel ? `${baseSlug}-${evidenceLabel}` : baseSlug;
      const suffix = attempts > 1 ? `-run-${run}` : "";
      const outJson = join(OUT, `${slug}${suffix}.json`);
      let chrome = null;
      let profileDir = null;
      try {
        ({ chrome, profileDir } = await launchIsolatedChrome());
        console.log("Lighthouse", url, `run=${run}`, "clean_port=", chrome.port);
        const runnerResult = await lighthouse(url, {
          port: chrome.port,
          hostname: "127.0.0.1",
          output: "json",
          logLevel: "error",
          onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
          formFactor: coverage.lighthouse.form_factor,
          screenEmulation: {
            mobile: coverage.lighthouse.form_factor === "mobile",
            width: coverage.lighthouse.viewport.width,
            height: coverage.lighthouse.viewport.height,
            deviceScaleFactor: coverage.lighthouse.viewport.device_scale_factor,
            disabled: false,
          },
          maxWaitForLoad: 45000,
        });
        if (!runnerResult?.lhr) throw new Error("empty lighthouse result");
        writeFileSync(outJson, JSON.stringify(runnerResult.lhr, null, 2));
        const cats = runnerResult.lhr.categories || {};
        const audits = runnerResult.lhr.audits || {};
        const ownLongTasks = (audits["long-tasks"]?.details?.items || [])
          .filter((item) => String(item.url || "").startsWith(BASE))
          .map((item) => Number(item.duration) || 0);
        const row = {
          path,
          run,
          performance: Math.round((cats.performance?.score || 0) * 100),
          accessibility: Math.round((cats.accessibility?.score || 0) * 100),
          best_practices: Math.round((cats["best-practices"]?.score || 0) * 100),
          seo: Math.round((cats.seo?.score || 0) * 100),
          lcp_ms: audits["largest-contentful-paint"]?.numericValue,
          cls: audits["cumulative-layout-shift"]?.numericValue,
          // A CLS breach is only actionable if the summary says what moved. The
          // raw report is written next to this file, but it does not survive a
          // job rerun, so the shifted nodes are carried in the row itself.
          layout_shift_elements: ((audits["layout-shifts"] || audits["layout-shift-elements"])?.details?.items || [])
            .slice(0, 5)
            .map((item) => ({
              node: String(item.node?.selector || item.node?.snippet || "").slice(0, 200),
              score: Number(item.score) || 0,
            })),
          tbt_ms: audits["total-blocking-time"]?.numericValue,
          longest_own_task_ms: Math.max(0, ...ownLongTasks),
          fcp_ms: audits["first-contentful-paint"]?.numericValue,
          si_ms: audits["speed-index"]?.numericValue,
          image_aspect_ratio: audits["image-aspect-ratio"]?.score,
          image_size_responsive: audits["image-size-responsive"]?.score,
          dom_elements: audits["dom-size-insight"]?.numericValue,
          total_byte_weight: audits["total-byte-weight"]?.numericValue,
          render_blocking_savings_ms:
            audits["render-blocking-insight"]?.metricSavings?.LCP || 0,
          image_delivery_savings_bytes:
            audits["image-delivery-insight"]?.details?.debugData?.wastedBytes || 0,
          font_display_score: audits["font-display-insight"]?.score,
          benchmark_index: runnerResult.lhr.environment?.benchmarkIndex,
          seo_exempt: SEO_EXEMPT_PAGES.has(path),
        };
        results.push(row);
        console.log(JSON.stringify(row));
        run += 1;
      } catch (err) {
        const detail = (err && err.message) || String(err);
        console.error("lighthouse failed", path, `run ${run}`, detail);
        results.push({ path, run, error: detail, status: "error" });
        run += 1;
      } finally {
        if (chrome) await chrome.kill();
        if (profileDir) rmSync(profileDir, { recursive: true, force: true });
      }
    }
  }
} finally {
  if (server) server.close();
}

const evaluation = evaluateLighthouseResults(results, {
  homeRuns: REPEATED_RUNS,
  criticalRuns: REPEATED_RUNS,
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
    pages: PAGES,
    measured_pages: RUN_PAGES,
    critical_money_pages: [...CRITICAL_MONEY_PATHS],
    repeated_runs: REPEATED_RUNS,
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
const summaryName = evidenceLabel ? `summary-${evidenceLabel}.json` : "summary.json";
writeFileSync(join(OUT, summaryName), JSON.stringify(summary, null, 2));
console.log("Wrote", join(OUT, summaryName));
if (!evaluation.ok) console.error("Lighthouse gates failed", JSON.stringify(evaluation));
else console.log("Lighthouse gates passed", JSON.stringify(evaluation.home));
process.exit(evaluation.ok ? 0 : 1);
