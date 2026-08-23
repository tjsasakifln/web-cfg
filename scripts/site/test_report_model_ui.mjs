/** Rendered quality gate for the public R$ 599 report model. */
import fs from "fs";
import path from "path";
import { createServer } from "http";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const externalBase = process.argv[2];
const port = 8794;
const route = "/casos/modelo-relatorio-inteligencia-licitacoes/";
const widths = [320, 390, 768, 1024, 1440];
const screenshotDir = String(process.env.REPORT_SCREENSHOT_DIR || "").trim();
const required = process.env.UI_GEOMETRY_REQUIRED === "1" || Boolean(process.env.CI);

function startStaticServer() {
  const mime = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript", ".png": "image/png", ".jpg": "image/jpeg",
    ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json",
  };
  const server = createServer((request, response) => {
    let urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.join(root, urlPath);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404); response.end("not found"); return;
    }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

const server = externalBase ? null : await startStaticServer();
const base = externalBase || `http://127.0.0.1:${port}`;

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
  });
} catch (error) {
  console.log("REPORT_MODEL_UI_UNAVAILABLE", String(error?.message || error).slice(0, 240));
  if (server) server.close();
  process.exit(required ? 2 : 0);
}

let failed = 0;
const findings = [];
const page = await browser.newPage();

for (const width of widths) {
  const height = width <= 390 ? 844 : width === 768 ? 1024 : 900;
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const response = await page.goto(`${base}${route}`, {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  const metrics = await page.evaluate(() => {
    const heroCta = document.querySelector('[data-cta-position="report_hero"]');
    const sticky = document.querySelector(".report-mobile-cta");
    const heroRect = heroCta?.getBoundingClientRect();
    const stickyRect = sticky?.getBoundingClientRect();
    const focusTarget = document.querySelector(".report-table-wrap");
    focusTarget?.focus();
    const focusStyle = focusTarget ? getComputedStyle(focusTarget) : null;
    return {
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      heroCtaBottom: heroRect?.bottom || null,
      heroCtaVisible: Boolean(heroRect && heroRect.width > 0 && heroRect.height >= 48),
      stickyVisible: Boolean(stickyRect && stickyRect.width > 0 && stickyRect.height > 0),
      stickyHeight: stickyRect?.height || 0,
      focusOutline: focusStyle?.outlineStyle || "none",
      tableOverflowContained: Boolean(
        focusTarget && focusTarget.scrollWidth >= focusTarget.clientWidth &&
        getComputedStyle(focusTarget).overflowX === "auto"
      ),
      h1Count: document.querySelectorAll("h1").length,
      reportSections: document.querySelectorAll(".report-section").length,
      whatsappCtas: document.querySelectorAll('a[href^="https://wa.me/5548988344559"]').length,
      overflowOffenders: [...document.querySelectorAll("body *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return style.display !== "none" && style.position !== "fixed" &&
            (rect.left < -1 || rect.right > window.innerWidth + 1);
        })
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName,
          className: String(element.className || "").slice(0, 100),
          width: Math.round(element.getBoundingClientRect().width),
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
        })),
    };
  });

  const errors = [];
  if (!response || ![200, 304].includes(response.status())) errors.push(`http=${response?.status()}`);
  if (metrics.documentOverflow) errors.push("document_overflow");
  if (!metrics.heroCtaVisible || metrics.heroCtaBottom > height) errors.push("hero_cta_below_fold");
  if (!metrics.tableOverflowContained) errors.push("table_overflow_not_contained");
  if (metrics.focusOutline === "none") errors.push("table_focus_missing");
  if (metrics.h1Count !== 1 || metrics.reportSections < 8) errors.push("report_structure");
  if (metrics.whatsappCtas < 4) errors.push("whatsapp_ctas");
  if (width <= 390 && (!metrics.stickyVisible || metrics.stickyHeight > 64)) errors.push("mobile_sticky");
  if (width > 620 && metrics.stickyVisible) errors.push("desktop_sticky_visible");

  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, `report-${width}.png`), fullPage: false });
  }
  findings.push({ width, height, ...metrics, errors });
  if (errors.length) failed += 1;
}

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
await page.addScriptTag({ content: axeSource });
const axe = await page.evaluate(async () => {
  const result = await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
  });
  return result.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })),
  }));
});
const hardAxe = axe.filter(({ impact }) => impact === "critical" || impact === "serious");
if (hardAxe.length) failed += 1;

if (screenshotDir) {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
  for (const [name, selector] of [["portfolio", "#carteira"], ["proof", "#ficha-a01"], ["final", ".report-final"]]) {
    const element = await page.$(selector);
    if (element) await element.screenshot({ path: path.join(screenshotDir, `report-${name}-1440.png`) });
  }
}

await browser.close();
if (server) server.close();
console.log("REPORT_MODEL_UI", JSON.stringify({ ok: failed === 0, findings, axe, hardAxe }));
if (failed) process.exit(1);
