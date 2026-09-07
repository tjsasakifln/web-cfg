/**
 * #617 — shared card components must not render flush against each other.
 *
 * Unifying .n-card on the tokenized shared rule dropped the `margin:1rem 0`
 * that four pages had been getting from an inline override. The shared rule
 * declares no margin, and .n-card elements are bare siblings inside .n-wrap
 * with no flex/grid gap, so consecutive cards rendered with bottom == top:
 * a 2px double border, no whitespace, white on white.
 *
 * Measured in Chromium, because the defect is a computed-geometry one: reading
 * the stylesheet would have shown a perfectly reasonable rule.
 */
import assert from "node:assert/strict";
import { createServer } from "http";
import { existsSync, readFileSync, statSync } from "fs";
import { extname, join, resolve, sep } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = 4631;
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const ROUTES = ["/nurture/", "/nurture/sair/", "/imprensa/", "/casos/", "/panorama-mercado-obras-publicas/"];
const MIN_GAP_PX = 8;

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
  await page.setViewport({ width: 1280, height: 900 });
  for (const route of ROUTES) {
    await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: "domcontentloaded" });
    observed.push({
      route,
      ...(await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".n-card")];
        if (!cards.length) return { count: 0, minGap: null };
        let minGap = null;
        for (let i = 1; i < cards.length; i += 1) {
          const previous = cards[i - 1].getBoundingClientRect();
          const current = cards[i].getBoundingClientRect();
          // Only compare cards genuinely stacked in the same column.
          if (current.top >= previous.bottom - 1) {
            const gap = current.top - previous.bottom;
            minGap = minGap === null ? gap : Math.min(minGap, gap);
          }
        }
        return { count: cards.length, minGap };
      })),
    });
  }
} finally { await browser.close(); server.close(); }

assert.ok(observed.some((row) => row.count > 1), "no route rendered stacked cards, so nothing was measured");
for (const row of observed) {
  if (row.minGap === null) continue;
  assert.ok(
    row.minGap >= MIN_GAP_PX,
    `${row.route}: consecutive .n-card elements are ${Math.round(row.minGap)}px apart, so they render flush with a doubled border`,
  );
}
console.log("CARD_SEPARATION_OK", JSON.stringify(observed.map((r) => `${r.route}:${r.count}:${r.minGap === null ? "n/a" : Math.round(r.minGap)}`)));
