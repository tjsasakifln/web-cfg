import { createRequire } from "module";
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname } from "path";
import { pathToFileURL } from "url";

const require = createRequire(join(process.cwd(), "package.json"));
const puppeteer = require("puppeteer-core");

const ROOT = process.cwd();
const PORT = 8765 + Math.floor(Math.random() * 200);
const PAGE =
  process.argv[2] ||
  "/guias-contratos-obras/checklist-pedido-aditivo/";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
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
      res.writeHead(404);
      res.end("not found " + req.url);
      return;
    }
    const ext = extname(file);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(readFileSync(file));
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});

function relLuminance(r, g, b) {
  const f = (c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrast(rgb1, rgb2) {
  const L1 = relLuminance(...rgb1);
  const L2 = relLuminance(...rgb2);
  const a = Math.max(L1, L2);
  const b = Math.min(L1, L2);
  return (a + 0.05) / (b + 0.05);
}
function parseRgb(str) {
  const m = String(str).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const base = `http://127.0.0.1:${PORT}`;
const result = {
  url: base + PAGE,
  ok: false,
  checks: {},
  failures: [],
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const res = await page.goto(base + PAGE, { waitUntil: "networkidle0", timeout: 30000 });
  result.checks.http = res?.status();
  if (result.checks.http !== 200) result.failures.push("http_" + result.checks.http);

  // Checklists are real checkboxes
  const boxCount = await page.$$eval('.checklist input[type="checkbox"]', (els) => els.length);
  result.checks.checkbox_count = boxCount;
  if (boxCount < 5) result.failures.push("too_few_checkboxes:" + boxCount);

  // Not only plain ul for checklist sections - primary items in .checklist
  const plainListItems = await page.$$eval(
    ".article-main > ul:not(.checklist) li",
    (els) => els.length,
  );
  result.checks.plain_ul_items = plainListItems;

  // Heading spacing: first content h2 after answer-box
  const h2Metrics = await page.$$eval(".article-main > h2", (els) =>
    els.slice(0, 6).map((el) => {
      const s = getComputedStyle(el);
      return {
        text: (el.textContent || "").slice(0, 40),
        marginTop: parseFloat(s.marginTop) || 0,
        marginBottom: parseFloat(s.marginBottom) || 0,
      };
    }),
  );
  result.checks.h2 = h2Metrics;
  // After first, subsequent h2s should have >= 32px top margin
  const tight = h2Metrics.filter((h, i) => i > 0 && h.marginTop < 32);
  if (tight.length) result.failures.push("h2_spacing_tight:" + JSON.stringify(tight));

  // CTA contrast for email button inside lead-inline
  const cta = await page.evaluate(() => {
    const box = document.querySelector(".lead-inline");
    const btn = document.querySelector('.lead-inline a.button-secondary, .lead-inline .button-secondary');
    if (!box || !btn) return { missing: true };
    const bs = getComputedStyle(btn);
    const cs = getComputedStyle(box);
    return {
      btnColor: bs.color,
      btnBg: bs.backgroundColor,
      boxBg: cs.backgroundColor,
      btnText: (btn.textContent || "").trim().slice(0, 80),
      visible: bs.visibility !== "hidden" && bs.display !== "none" && bs.opacity !== "0",
    };
  });
  result.checks.cta = cta;
  if (cta.missing) result.failures.push("cta_missing");
  else {
    const fg = parseRgb(cta.btnColor);
    const bg = parseRgb(cta.btnBg);
    if (!fg || !bg) result.failures.push("cta_color_unparsed");
    else {
      const ratio = contrast(fg, bg);
      result.checks.cta_contrast = Number(ratio.toFixed(2));
      // WCAG AA for normal text is 4.5; buttons large text 3.0 — require 4.5 for safety
      if (ratio < 4.5) result.failures.push("cta_contrast_low:" + ratio.toFixed(2));
    }
  }

  // Screenshot
  const shot = join(process.env.OUT_DIR || ".", "wave1-checklist-ui.png");
  await page.screenshot({ path: shot, fullPage: false });
  result.screenshot = shot;

  result.ok = result.failures.length === 0;
} finally {
  await browser.close();
  server.close();
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
