import { createRequire } from "module";
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname } from "path";

const require = createRequire(join(process.cwd(), "package.json"));
const puppeteer = require("puppeteer-core");
const ROOT = process.cwd();
const PORT = 8910 + Math.floor(Math.random() * 80);
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

function parseRgb(str) {
  const m = String(str).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function relLuminance(r, g, b) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const L1 = relLuminance(...a), L2 = relLuminance(...b);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const page = await browser.newPage();
const out = { failures: [], checks: {} };

for (const width of [1280, 390]) {
  await page.setViewport({ width, height: 900 });
  const res = await page.goto(base + "/guias-contratos-obras/checklist-pedido-aditivo/", {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  const c = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const grid = document.querySelector(".content-hero-grid");
    const s = getComputedStyle(h1);
    const r = h1.getBoundingClientRect();
    const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
    const words = h1.textContent.trim().split(/\s+/).length;
    const lines = r.height / lh;
    const boxes = document.querySelectorAll(".checklist-input").length;
    const toolbar = !!document.querySelector("[data-checklist-toolbar]");
    const cta = document.querySelector(".editorial-cta a.editorial-cta-secondary, .editorial-cta a.button-secondary");
    const ctaS = cta ? getComputedStyle(cta) : null;
    const sections = document.querySelectorAll(".editorial-section").length;
    const nums = document.querySelectorAll(".editorial-heading-num").length;
    // click one checkbox and see progress
    const first = document.querySelector(".checklist-input");
    if (first) {
      first.checked = true;
      first.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const checkedLabel = document.querySelector("[data-progress-checked]")?.textContent;
    const fillW = document.querySelector("[data-progress-fill]")?.style.width;
    return {
      httpOk: true,
      colCount: getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
      wordsPerLine: words / lines,
      boxes,
      toolbar,
      sections,
      nums,
      ctaColor: ctaS?.color,
      ctaBg: ctaS?.backgroundColor,
      ctaText: cta?.textContent?.trim(),
      progressChecked: checkedLabel,
      progressFill: fillW,
      h1Font: s.fontSize,
    };
  });
  c.http = res.status();
  out.checks[width] = c;
  if (c.http !== 200) out.failures.push(`w${width}_http`);
  if (c.colCount !== 1) out.failures.push(`w${width}_hero_cols`);
  if (c.wordsPerLine < (width >= 1000 ? 2.5 : 1.8)) out.failures.push(`w${width}_wpl`);
  if (c.boxes < 10) out.failures.push(`w${width}_boxes`);
  if (!c.toolbar) out.failures.push(`w${width}_toolbar`);
  if (c.sections < 3) out.failures.push(`w${width}_sections`);
  if (c.nums < 3) out.failures.push(`w${width}_nums`);
  const fg = parseRgb(c.ctaColor || "");
  const bg = parseRgb(c.ctaBg || "");
  if (!fg || !bg) out.failures.push(`w${width}_cta_parse`);
  else {
    const ratio = contrast(fg, bg);
    c.ctaContrast = Number(ratio.toFixed(2));
    if (ratio < 4.5) out.failures.push(`w${width}_cta_contrast:${ratio.toFixed(2)}`);
  }
  if (c.progressChecked !== "1") out.failures.push(`w${width}_progress_click`);
}

await page.setViewport({ width: 1280, height: 900 });
await page.goto(base + "/guias-contratos-obras/checklist-pedido-aditivo/", { waitUntil: "networkidle0" });
await page.screenshot({ path: (process.env.OUT_DIR || ".") + "/ux-polish-top.png", fullPage: false });
await page.evaluate(() => document.querySelector(".checklist")?.scrollIntoView({ block: "start" }));
await page.screenshot({ path: (process.env.OUT_DIR || ".") + "/ux-polish-checklist.png", fullPage: false });
await page.evaluate(() => document.querySelector(".editorial-cta")?.scrollIntoView({ block: "center" }));
await page.screenshot({ path: (process.env.OUT_DIR || ".") + "/ux-polish-cta.png", fullPage: false });

// lei page still readable (no force-checklist)
await page.goto(base + "/lei-14133-obras/art-124-alteracao-contratual-obra/", { waitUntil: "networkidle0" });
const lei = await page.evaluate(() => ({
  boxes: document.querySelectorAll(".checklist-input").length,
  cta: !!document.querySelector(".editorial-cta"),
  answer: !!document.querySelector(".answer-box"),
}));
out.checks.lei = lei;
if (!lei.cta || !lei.answer) out.failures.push("lei_structure");
// lei should not force checkboxes on prose pages
if (lei.boxes > 0) out.failures.push("lei_unexpected_checklist");

await browser.close();
server.close();
out.ok = out.failures.length === 0;
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
