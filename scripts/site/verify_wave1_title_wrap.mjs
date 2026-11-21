import { createRequire } from "module";
import { join } from "path";
import { createWave1QaServer } from "./wave1-qa-server.mjs";

const require = createRequire(join(process.cwd(), "package.json"));
const puppeteer = require("puppeteer-core");
const ROOT = process.cwd();
const PORT = 8900 + Math.floor(Math.random() * 100);
const server = createWave1QaServer(ROOT);
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
