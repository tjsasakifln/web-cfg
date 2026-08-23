/**
 * Capture home (+ optional paths) screenshots at required viewports.
 * Usage: node scripts/site/capture_screenshots.mjs [outDir] [baseUrl]
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";
import { join, resolve } from "path";
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { extname } from "path";
import { fileURLToPath } from "url";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const OUT = resolve(process.argv[2] || join(ROOT, "docs/uiux-evidence/after"));
const PORT = 8792;
const CHROME = resolveChromePath();
const VIEWPORTS = [
  [320, 568],
  [360, 800],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1440, 1000],
  [1920, 1080],
];
const DEFAULT_PATHS = ["/", "/diretoria-b2g/", "/diagnostico-b2g-360/", "/bid-room-licitacoes-obras/", "/defesa-margem-contratos-publicos/", "/conteudos/", "/analises-contratos-publicos/aditivo-saldo-art125-item-novo/", "/panorama-mercado-obras-publicas/obras-publicas-sc-2026-08/"];
const PATHS = String(process.env.CAPTURE_PATHS || "")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);
if (!PATHS.length) PATHS.push(...DEFAULT_PATHS);
const COMPONENTS = {
  "/diagnostico-b2g-360/": ["[data-offer-section='scope']"],
  "/bid-room-licitacoes-obras/": [".decision-map"],
  "/defesa-margem-contratos-publicos/": [".compare-split"],
  "/conteudos/": [".content-directory-item"],
  "/analises-contratos-publicos/aditivo-saldo-art125-item-novo/": ["#fatos"],
  "/panorama-mercado-obras-publicas/obras-publicas-sc-2026-08/": ["#faixas-de-valor"],
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

function startServer() {
  const server = createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(readFileSync(filePath));
  });
  return new Promise((r) => server.listen(PORT, "127.0.0.1", () => r(server)));
}

const baseArg = process.argv[3];
const server = baseArg ? null : await startServer();
const BASE = baseArg || `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
for (const path of PATHS) {
  const slug = path === "/" ? "home" : path.replace(/\//g, "").slice(0, 40);
  for (const [w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
    // ElementHandle.screenshot scrolls its target into view. Disable smooth
    // scrolling so the clip is measured after the final scroll position.
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
    });
    const file = join(OUT, `${slug}-${w}x${h}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log("wrote", file);
    for (const [index, selector] of (COMPONENTS[path] || []).entries()) {
      // Some shared primitives intentionally live inside a disclosure. Open
      // ancestor details so evidence captures the primitive, not an unrelated
      // painted region underneath a closed subtree.
      await page.$$eval(selector, (elements) => {
        for (const element of elements) {
          let details = element.closest("details");
          while (details) {
            details.open = true;
            details = details.parentElement?.closest("details") || null;
          }
        }
      });
      const component = await page.$(selector);
      if (!component) continue;
      const componentFile = join(OUT, `${slug}-component-${index + 1}-${w}x${h}.png`);
      await page.evaluate(() => {
        for (const element of document.querySelectorAll(".site-header,.skip-link")) {
          element.dataset.captureVisibility = element.style.visibility;
          element.style.visibility = "hidden";
        }
      });
      await component.screenshot({ path: componentFile });
      await page.evaluate(() => {
        for (const element of document.querySelectorAll("[data-capture-visibility]")) {
          element.style.visibility = element.dataset.captureVisibility || "";
          delete element.dataset.captureVisibility;
        }
      });
      console.log("wrote", componentFile);
    }
  }
}
await browser.close();
if (server) server.close();
console.log("done", OUT);
