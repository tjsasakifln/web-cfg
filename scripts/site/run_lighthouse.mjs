/**
 * Reproducible Lighthouse runner against local static root or production URLs.
 * Usage:
 *   node scripts/site/run_lighthouse.mjs
 *   node scripts/site/run_lighthouse.mjs https://confenge.com.br
 * Writes summary JSON to docs/LIGHTHOUSE-REPORT.md companion + stdout.
 */
import { spawnSync } from "child_process";
import { createServer } from "http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join, resolve, extname, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs", "lighthouse-runs");
const PAGES = [
  "/",
  "/diretoria-b2g/",
  "/diagnostico-b2g-360/",
  "/bid-room-licitacoes-obras/",
  "/defesa-margem-contratos-publicos/",
  "/inteligencia/",
  "/conteudos/",
];
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
const lhBin = join(ROOT, "node_modules", "lighthouse", "cli", "index.js");
const results = [];

for (const path of PAGES) {
  const url = `${BASE.replace(/\/$/, "")}${path}`;
  const slug = path === "/" ? "home" : path.replace(/\//g, "_").replace(/^_|_$/g, "");
  const outJson = join(OUT, `${slug}.json`);
  const chrome = process.env.CHROME_PATH || "/usr/bin/google-chrome";
  const args = [
    lhBin,
    url,
    "--only-categories=performance,accessibility,best-practices,seo",
    "--form-factor=mobile",
    "--screenEmulation.mobile=true",
    "--screenEmulation.width=390",
    "--screenEmulation.height=844",
    "--output=json",
    `--output-path=${outJson}`,
    `--chrome-path=${chrome}`,
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage",
    "--quiet",
  ];
  console.log("Lighthouse", url, "chrome=", chrome);
  const run = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: 240000,
    env: { ...process.env, CHROME_PATH: chrome },
  });
  if (run.status !== 0) {
    console.error("lighthouse failed", run.stderr || run.stdout);
    results.push({ path, error: run.stderr || run.stdout || "failed", status: "error" });
    continue;
  }
  const report = JSON.parse(readFileSync(outJson, "utf8"));
  const cats = report.categories || {};
  const audits = report.audits || {};
  const row = {
    path,
    performance: Math.round((cats.performance?.score || 0) * 100),
    accessibility: Math.round((cats.accessibility?.score || 0) * 100),
    best_practices: Math.round((cats["best-practices"]?.score || 0) * 100),
    seo: Math.round((cats.seo?.score || 0) * 100),
    lcp_ms: audits["largest-contentful-paint"]?.numericValue,
    cls: audits["cumulative-layout-shift"]?.numericValue,
    tbt_ms: audits["total-blocking-time"]?.numericValue,
    fcp_ms: audits["first-contentful-paint"]?.numericValue,
    si_ms: audits["speed-index"]?.numericValue,
  };
  results.push(row);
  console.log(JSON.stringify(row));
}

if (server) server.close();
const summary = { base: BASE, generated_at: new Date().toISOString(), results };
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log("Wrote", join(OUT, "summary.json"));
const failed = results.filter(
  (r) =>
    r.error ||
    r.performance < 90 ||
    r.accessibility < 95 ||
    r.best_practices < 95 ||
    r.seo < 95
);
process.exit(failed.length ? 1 : 0);
