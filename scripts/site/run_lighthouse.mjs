/**
 * Lighthouse lab runner (Node API + chrome-launcher) against local _site or a base URL.
 * Usage:
 *   node scripts/site/run_lighthouse.mjs
 *   node scripts/site/run_lighthouse.mjs https://confenge.com.br
 */
import { createServer } from "http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join, resolve, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { launch as launchChrome } from "chrome-launcher";
import lighthouse from "lighthouse";
import { evaluateLighthouseResults } from "./lighthouse_thresholds.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs", "lighthouse-runs");
const PAGES = process.env.LH_PAGES
  ? process.env.LH_PAGES.split(",").map((s) => s.trim()).filter(Boolean)
  : ["/", "/diretoria-b2g/", "/conteudos/"];
const IMAGE_GATE_PAGES = new Set(
  (process.env.LH_IMAGE_GATE_PAGES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const SEO_EXEMPT_PAGES = new Set(
  (process.env.LH_SEO_EXEMPT_PAGES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const HOME_RUNS = Number(process.env.LH_HOME_RUNS || 1);
if (!Number.isInteger(HOME_RUNS) || HOME_RUNS < 1 || HOME_RUNS > 5) {
  throw new Error(`LH_HOME_RUNS must be an integer from 1 to 5, got ${process.env.LH_HOME_RUNS}`);
}
for (const [name, configuredPages] of [
  ["LH_IMAGE_GATE_PAGES", IMAGE_GATE_PAGES],
  ["LH_SEO_EXEMPT_PAGES", SEO_EXEMPT_PAGES],
]) {
  const missingPages = [...configuredPages].filter((path) => !PAGES.includes(path));
  if (missingPages.length) {
    throw new Error(`${name} must be included in LH_PAGES: ${missingPages.join(", ")}`);
  }
}
const PORT = 8766;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
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
  server = createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = join(siteRoot, urlPath);
    if (!filePath.startsWith(siteRoot) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(readFileSync(filePath));
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

try {
  for (const path of PAGES) {
    const attempts = path === "/" ? HOME_RUNS : 1;
    for (let run = 1; run <= attempts; run += 1) {
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
          formFactor: "mobile",
          screenEmulation: {
            mobile: true,
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
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
        results.push(row);
        console.log(JSON.stringify(row));
      } catch (err) {
        const detail = (err && err.message) || String(err);
        console.error("lighthouse failed", path, `run ${run}`, detail);
        results.push({ path, run, error: detail, status: "error" });
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
});
const summary = { base: BASE, generated_at: new Date().toISOString(), results, evaluation };
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log("Wrote", join(OUT, "summary.json"));
if (!evaluation.ok) console.error("Lighthouse gates failed", JSON.stringify(evaluation));
else console.log("Lighthouse gates passed", JSON.stringify(evaluation.home));
process.exit(evaluation.ok ? 0 : 1);
