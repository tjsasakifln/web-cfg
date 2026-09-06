/**
 * #619 — the demonstrativo disclosure must read as a label wherever it appears.
 *
 * .case-badge carries the "DEMONSTRATIVO · NÃO É CASO CONFENGE" /
 * "ESTRUTURA REAL, NÚMEROS HIPOTÉTICOS" notice. It was styled only in an inline
 * block present on 3 of the 12 pages that use it, so on the other 9 -- including
 * priced demonstration models that display values like R$ 2.400 -- it rendered
 * as an ordinary paragraph. A demonstration label that looks like body text next
 * to real-looking numbers is exactly what must not ship.
 *
 * Rendered check in Chromium, not a CSS text assertion: a declared rule proves
 * nothing while .report-disclaimer p outranks .case-badge on specificity, which
 * is how the defect survived on the model pages.
 */
import assert from "node:assert/strict";
import { createServer } from "http";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { extname, join, resolve, sep } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = 4604;
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

function findRoutes(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "_site"
        || entry.name === "dist" || entry.name === "build") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) findRoutes(full, out);
    else if (entry.name === "index.html"
             && readFileSync(full, "utf-8").includes('class="case-badge"')) {
      out.push(`/${full.slice(ROOT.length + 1).replace(/index\.html$/, "")}`);
    }
  }
  return out;
}

const routes = findRoutes(ROOT).sort();
assert.ok(routes.length >= 10, `expected the demonstrativo pages, found ${routes.length}`);

const server = await new Promise((done) => {
  const s = createServer((q, r) => {
    try {
      let p = decodeURIComponent((q.url || "/").split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const f = join(ROOT, p);
      if (!f.startsWith(ROOT + sep) || !existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
      r.end(readFileSync(f));
    } catch { r.writeHead(500); r.end(); }
  });
  s.listen(PORT, "127.0.0.1", () => done(s));
});

const browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const observed = [];
try {
  const page = await browser.newPage();
  for (const route of routes) {
    await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: "domcontentloaded" });
    const row = await page.evaluate(() => {
      const el = document.querySelector(".case-badge");
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color, weight: cs.fontWeight, size: parseFloat(cs.fontSize), text: (el.textContent || "").trim().slice(0, 40) };
    });
    observed.push({ route, ...(row || {}) });
  }
} finally { await browser.close(); server.close(); }

const TRANSPARENT = new Set(["rgba(0, 0, 0, 0)", "transparent"]);
for (const row of observed) {
  assert.ok(row.bg, `${row.route}: no .case-badge rendered`);
  assert.equal(TRANSPARENT.has(row.bg), false,
    `${row.route}: the demonstrativo notice has no background, so it reads as body text next to the numbers it disclaims`);
  assert.ok(Number(row.weight) >= 600,
    `${row.route}: the demonstrativo notice renders at weight ${row.weight}`);
  // Critical-microcopy floor from the design system (floors_px.critical_microcopy
  // = 12.8). A disclosure below it is a disclosure people do not read.
  assert.ok(row.size >= 12.8,
    `${row.route}: the demonstrativo notice renders at ${row.size}px, under the 12.8px critical-microcopy floor`);
}
// One treatment sitewide, not a per-page accident.
const treatments = new Set(observed.map((r) => `${r.bg}|${r.color}|${r.weight}|${r.size}`));
assert.equal(treatments.size, 1,
  `the demonstrativo notice renders ${treatments.size} different ways: ${[...treatments].join(" / ")}`);

console.log("DEMONSTRATION_BADGE_OK", JSON.stringify({ routes: observed.length, treatment: [...treatments][0] }));
