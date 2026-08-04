import { createRequire } from "module";
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname } from "path";

const require = createRequire(join(process.cwd(), "package.json"));
const puppeteer = require("puppeteer-core");
const ROOT = process.cwd();
const PORT = 8900 + Math.floor(Math.random() * 100);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
function resolvePath(urlPath) {
  let p = urlPath.split("?")[0].split("#")[0];
  if (p.endsWith("/")) p += "index.html";
  if (!extname(p)) {
    const asDir = join(ROOT, p, "index.html");
    if (existsSync(asDir)) return asDir;
  }
  return join(ROOT, p.replace(/^\//, ""));
}
const server = createServer((req, res) => {
  try {
    const file = resolvePath(req.url || "/");
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404); res.end("nf"); return;
    }
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const base = `http://127.0.0.1:${PORT}`;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const results = {};
for (const width of [1280, 390]) {
  await page.setViewport({ width, height: 900 });
  await page.goto(base + "/guias-contratos-obras/checklist-pedido-aditivo/", {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  results[width] = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const grid = document.querySelector(".content-hero-grid");
    const s = getComputedStyle(h1);
    const r = h1.getBoundingClientRect();
    const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
    const words = h1.textContent.trim().split(/\s+/).length;
    const lines = r.height / lh;
    const wordsPerLine = words / lines;
    const full = h1.textContent;
    let pos = 0;
    const ys = new Set();
    for (const w of h1.textContent.trim().split(/\s+/)) {
      const i = full.indexOf(w, pos);
      const range = document.createRange();
      const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
      let node, remaining = i;
      while ((node = walker.nextNode())) {
        if (remaining < node.length) {
          range.setStart(node, remaining);
          range.setEnd(node, Math.min(remaining + w.length, node.length));
          break;
        }
        remaining -= node.length;
      }
      ys.add(Math.round(range.getBoundingClientRect().y));
      pos = i + w.length;
    }
    const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean);
    return {
      h1W: Math.round(r.width),
      gridColCount: cols.length,
      gridCols: getComputedStyle(grid).gridTemplateColumns,
      lines: Number(lines.toFixed(2)),
      words,
      wordsPerLine: Number(wordsPerLine.toFixed(2)),
      distinctYs: ys.size,
      fontSize: s.fontSize,
    };
  });
}
await page.screenshot({
  path: (process.env.OUT_DIR || ".") + "/title-wrap-fixed.png",
  fullPage: false,
});
await browser.close();
server.close();

const failures = [];
for (const [w, desk] of Object.entries(results)) {
  // Must be single grid track (no empty second column)
  if (desk.gridColCount !== 1) failures.push(`w${w}_grid_cols:${desk.gridColCount}`);
  // Not one word per line: distinct Y positions must be fewer than words
  if (desk.distinctYs >= desk.words) failures.push(`w${w}_one_word_per_line:${desk.distinctYs}/${desk.words}`);
  // Average at least ~2 words/line on desktop; mobile at least 1.5
  const minWpl = Number(w) >= 1000 ? 2.5 : 1.8;
  if (desk.wordsPerLine < minWpl) failures.push(`w${w}_words_per_line:${desk.wordsPerLine}`);
}

const out = { results, failures, ok: failures.length === 0 };
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
