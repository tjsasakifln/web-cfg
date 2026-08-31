/**
 * Capture home (+ optional paths) screenshots at required viewports.
 * Usage: node scripts/site/capture_screenshots.mjs [outDir] [baseUrl]
 *
 * Environment (all additive; unset means exactly the historic behaviour):
 *   CAPTURE_PATHS="/,/entregas/"        routes to capture
 *   CAPTURE_VIEWPORTS="protocol"        viewport table; presets `default` and
 *                                       `protocol` (the five #494 viewports,
 *                                       including 1366x768 and 1363x936) mix
 *                                       freely with explicit WxH pairs
 *   CAPTURE_FULLPAGE=1                  whole document instead of first fold
 *   CAPTURE_JS=off                      render with script execution disabled
 *   CAPTURE_MOTION=reduced              render under prefers-reduced-motion
 *   CAPTURE_ALLOW_DIRTY=1               stamp an uncommitted tree as provisional
 *   CAPTURE_ALLOW_EPHEMERAL=1           accept an out dir under /tmp
 *
 * The three state keys combine. Each state writes its own filenames and its own
 * manifest, so one directory holds the whole matrix as durable evidence.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { join, relative, resolve } from "path";
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { extname } from "path";
import { fileURLToPath } from "url";
import { resolveChromePath } from "./resolve_chrome.mjs";
import {
  applyCaptureState,
  assertDurableOutDir,
  buildManifest,
  captureFileName,
  captureRecord,
  manifestFileName,
  prepareFullPageCapture,
  resolveCaptureState,
  resolveViewports,
  verifyFullPageCapture,
} from "./capture_states.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const OUT = assertDurableOutDir(process.argv[2] || join(ROOT, "docs/uiux-evidence/after"));
const PORT = 8792;
const CHROME = resolveChromePath();
const STATE = resolveCaptureState();
const VIEWPORTS = resolveViewports();
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
const browserVersion = await browser.version();
const page = await browser.newPage();
// JS-off and reduced-motion are page-level emulation: set once, before the
// first navigation, so no route is ever captured in a half-applied state.
await applyCaptureState(page, STATE);
const captures = [];
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
    let layout = await prepareFullPageCapture(page, STATE);
    const name = captureFileName({ slug, width: w, height: h, state: STATE });
    const file = join(OUT, name);
    await page.screenshot({ path: file, fullPage: STATE.fullPage });
    layout = await verifyFullPageCapture(page, STATE, layout);
    captures.push(captureRecord({
      file: name,
      path: file,
      route: path,
      slug,
      width: w,
      height: h,
      state: STATE,
      layout,
    }));
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
      const componentName = captureFileName({
        slug,
        width: w,
        height: h,
        state: STATE,
        componentIndex: index + 1,
      });
      const componentFile = join(OUT, componentName);
      await page.evaluate(() => {
        for (const element of document.querySelectorAll(".site-header,.skip-link")) {
          element.dataset.captureVisibility = element.style.visibility;
          element.style.visibility = "hidden";
        }
      });
      await component.screenshot({ path: componentFile });
      captures.push(captureRecord({
        file: componentName,
        path: componentFile,
        route: path,
        slug,
        width: w,
        height: h,
        state: STATE,
        selector,
        componentIndex: index + 1,
      }));
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

// Evidence is only evidence if it says which commit and which day produced it.
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
// A named commit whose tree is not what rendered is not evidence. Refuse rather
// than record a SHA the screenshots do not show.
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
if (dirty && process.env.CAPTURE_ALLOW_DIRTY !== "1") {
  throw new Error(
    `CAPTURE_TREE_DIRTY: refusing to stamp ${commit} on screenshots of an uncommitted tree.\n` +
      `Commit first, or set CAPTURE_ALLOW_DIRTY=1 to record it as provisional.\n${dirty}`,
  );
}
const manifestPath = join(OUT, manifestFileName(STATE));
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    buildManifest({
      capturedAt: new Date().toISOString(),
      commitSha: commit,
      treeDirty: Boolean(dirty),
      baseUrl: BASE,
      outputDir: relative(ROOT, OUT) || ".",
      routes: PATHS,
      viewports: VIEWPORTS,
      state: STATE,
      captures,
      browserVersion,
    }),
    null,
    2,
  )}\n`,
  "utf8",
);
console.log("state", STATE.id, "manifest", manifestPath);
console.log("done", OUT);
