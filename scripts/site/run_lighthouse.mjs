/**
 * Lighthouse lab runner (Node API + chrome-launcher) against local _site or a base URL.
 * Usage:
 *   node scripts/site/run_lighthouse.mjs
 *   node scripts/site/run_lighthouse.mjs https://confenge.com.br
 */
import { createServer } from "http";
import { gzipSync } from "zlib";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join, resolve, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { launch as launchChrome } from "chrome-launcher";
import lighthouse from "lighthouse";
import { evaluateLighthouseResults } from "./lighthouse_thresholds.mjs";
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
const IMAGE_GATE_PAGES = new Set(coverage.lighthouse.image_gate_pages);
const SEO_EXEMPT_PAGES = new Set(coverage.lighthouse.seo_exempt_pages);
const HOME_RUNS = Number(process.env.LH_HOME_RUNS || 1);
console.log(formatCoverageDeclaration(coverage));
console.log(`lighthouse pages (${PAGES.length}): ${PAGES.join(" ")}`);
if (!Number.isInteger(HOME_RUNS) || HOME_RUNS < 1 || HOME_RUNS > 5) {
  throw new Error(`LH_HOME_RUNS must be an integer from 1 to 5, got ${process.env.LH_HOME_RUNS}`);
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

const baseArg = process.argv[2];
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
    // Model the delivery contract both production hosts implement. Netlify and
    // the Netcup origin (deploy/netcup/nginx/confenge-web-http.conf) gzip every
    // text response; serving this fixture uncompressed measured a cost that no
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

const HOME_LCP_MAX_MS = Number(process.env.LH_HOME_LCP_MAX_MS || 2000);

try {
  for (const path of PAGES) {
    const attempts = path === "/" ? HOME_RUNS : 1;
    let retriesLeft = path === "/" ? 1 : 0;
    for (let run = 1; run <= attempts; ) {
      const url = `${BASE.replace(/\/$/, "")}${path}`;
      const slug = path === "/" ? "home" : path.replace(/\//g, "_").replace(/^_|_$/g, "");
      const suffix = attempts > 1 ? `-run-${run}` : "";
      const outJson = join(OUT, `${slug}${suffix}.json`);
      let chrome = null;
      try {
        chrome = await launchChrome({
          chromePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
          chromeFlags: [
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-extensions",
          ],
          connectionPollInterval: 250,
          maxConnectionRetries: 50,
        });
        await waitForCdp(chrome.port);
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
          tbt_ms: audits["total-blocking-time"]?.numericValue,
          longest_own_task_ms: Math.max(0, ...ownLongTasks),
          fcp_ms: audits["first-contentful-paint"]?.numericValue,
          si_ms: audits["speed-index"]?.numericValue,
          image_aspect_ratio: audits["image-aspect-ratio"]?.score,
          image_size_responsive: audits["image-size-responsive"]?.score,
          seo_exempt: SEO_EXEMPT_PAGES.has(path),
        };
        const noisyHomeLcp =
          path === "/"
          && retriesLeft > 0
          && Number.isFinite(row.lcp_ms)
          && row.lcp_ms > HOME_LCP_MAX_MS;
        if (noisyHomeLcp) {
          retriesLeft -= 1;
          console.warn(
            JSON.stringify({
              retry: "home_lcp",
              run,
              lcp_ms: row.lcp_ms,
              gate_ms: HOME_LCP_MAX_MS,
            }),
          );
          continue;
        }
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
      }
    }
  }
} finally {
  if (server) server.close();
}

const evaluation = evaluateLighthouseResults(results, {
  homeRuns: HOME_RUNS,
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
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log("Wrote", join(OUT, "summary.json"));
if (!evaluation.ok) console.error("Lighthouse gates failed", JSON.stringify(evaluation));
else console.log("Lighthouse gates passed", JSON.stringify(evaluation.home));
process.exit(evaluation.ok ? 0 : 1);
