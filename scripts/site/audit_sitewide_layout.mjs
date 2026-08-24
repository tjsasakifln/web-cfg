/**
 * Rendered sitewide layout audit for the public CONFENGE artifact.
 *
 * Default: every route in seo/PUBLIC-ARTIFACT-MANIFEST.json at the six
 * production acceptance widths. Set LAYOUT_AUDIT_SCOPE=critical for the
 * shared-component regression set, or LAYOUT_AUDIT_ROUTES=/a/,/b/ for an
 * explicit cohort. An optional base URL is the first CLI argument.
 */
import puppeteer from "puppeteer-core";
import { createServer } from "http";
import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, extname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { resolveChromePath } from "./resolve_chrome.mjs";
import { loadManifestRoutes, resolveSiteRoot } from "./interface_coverage.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = Number(process.env.LAYOUT_AUDIT_PORT || 8796);
const CHROME = resolveChromePath();
const SITE_ROOT = resolveSiteRoot();
const VIEWPORTS = [360, 390, 768, 1024, 1440, 1920];
const CRITICAL_ROUTES = [
  "/",
  "/acompanhamento-contratos-obras/",
  "/atrasos-prorrogacao-obras-publicas/",
  "/bid-room-licitacoes-obras/",
  "/defesa-margem-contratos-publicos/",
  "/defesa-tecnica-contratos-publicos/",
  "/diagnostico-b2g-360/",
  "/diagnostico-b2g-expansao/",
  "/diretoria-b2g/",
  "/ferramentas/diagnostico-defesa-margem/",
  "/conteudos/documentos-reequilibrio-obra-publica/",
  "/conteudos/",
  "/inteligencia/",
  "/analises-contratos-publicos/aditivo-saldo-art125-item-novo/",
  "/panorama-mercado-obras-publicas/obras-publicas-sc-2026-08/",
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

function startStaticServer(siteRoot) {
  const server = createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath.endsWith("/")) urlPath += "index.html";
      if (!urlPath) urlPath = "/index.html";
      const filePath = join(siteRoot, urlPath);
      if (!filePath.startsWith(siteRoot) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    } catch {
      res.writeHead(500);
      res.end("internal server error");
    }
  });
  return new Promise((done) => server.listen(PORT, "127.0.0.1", () => done(server)));
}

function publicRoutes() {
  const explicit = String(process.env.LAYOUT_AUDIT_ROUTES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (explicit.length) return explicit;
  if (process.env.LAYOUT_AUDIT_SCOPE === "critical") return CRITICAL_ROUTES;
  return loadManifestRoutes();
}

const baseArg = process.argv[2];
const reportArg = process.env.LAYOUT_AUDIT_REPORT || process.argv[3] || "";
const server = baseArg ? null : await startStaticServer(SITE_ROOT);
const BASE = (baseArg || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const routes = publicRoutes();
const report = {
  generated_at: new Date().toISOString(),
  base_url: BASE,
  site_root: SITE_ROOT === ROOT ? "." : "_site",
  scope: process.env.LAYOUT_AUDIT_SCOPE || (process.env.LAYOUT_AUDIT_ROUTES ? "explicit" : "sitewide"),
  route_count: routes.length,
  widths: VIEWPORTS,
  checks: routes.length * VIEWPORTS.length,
  failures: [],
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
});

const tasks = [];
for (const width of VIEWPORTS) {
  for (const route of routes) tasks.push({ route, width });
}
let cursor = 0;
let completed = 0;
const workerCount = Math.min(Number(process.env.LAYOUT_AUDIT_WORKERS || 4), tasks.length);

async function auditWorker() {
  const page = await browser.newPage();
  while (cursor < tasks.length) {
    const task = tasks[cursor++];
    const { route, width } = task;
    const height = width <= 390 ? 844 : width <= 768 ? 1024 : width <= 1024 ? 768 : 1080;
    const issues = [];
    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      const response = await page.goto(`${BASE}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: Number(process.env.LAYOUT_AUDIT_TIMEOUT || 30000),
      });
      // DOMContentLoaded does not guarantee that linked stylesheets have been
      // parsed. Wait briefly so geometry is never sampled from raw HTML while
      // still retaining stylesheet_unloaded as a real failure signal.
      await page.waitForFunction(
        () => [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => {
          if (!link.sheet) return false;
          try {
            return link.sheet.cssRules.length > 0;
          } catch {
            return false;
          }
        }),
        { timeout: 5000 },
      ).catch(() => {});
      // CSSOM availability can precede the first styled layout on a newly
      // opened concurrent page. A process-clock pause avoids raw-HTML
      // geometry without relying on requestAnimationFrame, which Chromium
      // may indefinitely throttle in background worker tabs.
      await new Promise((done) => setTimeout(done, 50));
      const status = response?.status() || 0;
      if (!status || status >= 400) issues.push({ code: "http_status", detail: status });
      const rendered = await page.evaluate((viewportWidth) => {
        const problems = [];
        const root = document.documentElement;
        if (root.scrollWidth > root.clientWidth + 1) {
          const offenders = [...document.body.querySelectorAll("*")]
            .filter((element) => {
              const style = getComputedStyle(element);
              if (style.display === "none" || style.visibility === "hidden") return false;
              const box = element.getBoundingClientRect();
              return box.width > 0 && (
                box.right > root.clientWidth + 1 ||
                box.left < -1 ||
                element.scrollWidth > element.clientWidth + 1
              );
            })
            .slice(0, 5)
            .map((element) => ({
              tag: element.tagName.toLowerCase(),
              class: String(element.className || "").slice(0, 100),
              right: Math.round(element.getBoundingClientRect().right),
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth,
            }));
          problems.push({
            code: "horizontal_overflow",
            detail: `${root.scrollWidth}>${root.clientWidth}`,
            offenders,
          });
        }

        const unloaded = [...document.querySelectorAll('link[rel="stylesheet"]')]
          .filter((link) => {
            if (!link.sheet) return true;
            try {
              return link.sheet.cssRules.length === 0;
            } catch {
              return true;
            }
          })
          .map((link) => link.getAttribute("href"));
        if (unloaded.length) problems.push({ code: "stylesheet_unloaded", detail: unloaded });

        const primitiveRules = [
          [".content-editorial-layout", "grid", 0],
          [".content-trails", "grid", 0],
          [".content-trails > a", "grid", 12],
          [".content-feature", null, 16],
          [".content-reads", "grid", 16],
          [".compare-split", "grid", 0],
          [".compare-side", null, 16],
          [".decision-map", null, 16],
          [".decision-map-rail", "grid", 0],
          [".dm-node", null, 12],
          [".faq-layout", "grid", 0],
          [".offer-context", "grid", 0],
          [".stage-meta", "grid", 0],
          [".ca-list", "grid", 0],
          [".ca-kind", "inline-flex", 4],
          [".n-grid", "grid", 0],
          [".n-card", null, 16],
        ];
        for (const [selector, display, minPadding] of primitiveRules) {
          for (const element of document.querySelectorAll(selector)) {
            const box = element.getBoundingClientRect();
            if (!box.width || !box.height) continue;
            const style = getComputedStyle(element);
            if (display && style.display !== display) {
              problems.push({ code: "primitive_display", selector, detail: style.display });
              break;
            }
            if (minPadding && parseFloat(style.paddingLeft) < minPadding) {
              problems.push({ code: "primitive_spacing", selector, detail: style.paddingLeft });
              break;
            }
          }
        }

        const pairs = [
          [".content-trails > a", ".type-mono", "strong"],
          [".dm-node", ".type-mono", "strong"],
          [".offer-context-item", "dt", "dd"],
        ];
        for (const [parentSelector, labelSelector, valueSelector] of pairs) {
          for (const parent of document.querySelectorAll(parentSelector)) {
            const label = parent.querySelector(labelSelector);
            const value = parent.querySelector(valueSelector);
            if (!label || !value) continue;
            const a = label.getBoundingClientRect();
            const b = value.getBoundingClientRect();
            if (!a.width || !a.height || !b.width || !b.height) continue;
            const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (overlapX > 1 && overlapY > 1) {
              problems.push({ code: "label_value_overlap", selector: parentSelector });
              break;
            }
            const sameLine = Math.abs(a.top - b.top) < Math.min(a.height, b.height) * 0.6;
            const horizontalGap = b.left - a.right;
            const verticalGap = b.top - a.bottom;
            if ((sameLine && horizontalGap < 6) || (!sameLine && verticalGap < 2)) {
              problems.push({
                code: "label_value_concatenated",
                selector: parentSelector,
                detail: sameLine ? `horizontal-gap:${horizontalGap}` : `vertical-gap:${verticalGap}`,
              });
              break;
            }
          }
        }

        for (const body of document.querySelectorAll(".content-directory-item > .dir-body")) {
          const parent = body.parentElement;
          const bodyBox = body.getBoundingClientRect();
          const parentBox = parent.getBoundingClientRect();
          if (bodyBox.width < parentBox.width * 0.75) {
            problems.push({
              code: "compressed_grid_child",
              selector: ".content-directory-item > .dir-body",
              detail: `${Math.round(bodyBox.width)}/${Math.round(parentBox.width)}`,
            });
            break;
          }
        }

        const clippedText = [...document.querySelectorAll("h1,h2,h3,p:not(.honeypot),li,dd,strong")]
          .filter((element) => {
            const style = getComputedStyle(element);
            const visible = style.display !== "none" && style.visibility !== "hidden";
            const clips = ["hidden", "clip"].includes(style.overflowX);
            return visible && clips && element.scrollWidth > element.clientWidth + 1;
          })
          .slice(0, 5)
          .map((element) => `${element.tagName.toLowerCase()}.${String(element.className || "")}`);
        if (clippedText.length) problems.push({ code: "text_clipping", detail: clippedText });

        if (viewportWidth <= 390) {
          const undersized = [...document.querySelectorAll(
            ".button,button,summary,input:not([type='hidden']):not([type='checkbox']):not([type='radio']),select,textarea",
          )]
            .filter((element) => {
              const style = getComputedStyle(element);
              const box = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && box.height < 44;
            })
            .slice(0, 5)
            .map((element) => ({
              tag: element.tagName.toLowerCase(),
              class: String(element.className || "").slice(0, 80),
              height: Math.round(element.getBoundingClientRect().height),
            }));
          if (undersized.length) problems.push({ code: "touch_target_height", detail: undersized });
        }
        return problems;
      }, width);
      issues.push(...rendered);
    } catch (error) {
      issues.push({ code: "navigation_or_evaluation", detail: String(error?.message || error) });
    }
    if (issues.length) report.failures.push({ route, width, issues });
    completed += 1;
    if (completed % 100 === 0 || completed === tasks.length) {
      console.log(`layout audit ${completed}/${tasks.length}; failures=${report.failures.length}`);
    }
  }
  await page.close();
}

await Promise.all(Array.from({ length: workerCount }, () => auditWorker()));
await browser.close();
if (server) server.close();

report.ok = report.failures.length === 0;
if (reportArg) {
  const reportPath = resolve(reportArg);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${reportPath}`);
}
if (!report.ok) {
  console.error(JSON.stringify(report.failures.slice(0, 20), null, 2));
  console.error(`FAIL layout audit: ${report.failures.length}/${report.checks} rendered route-width checks`);
  process.exit(1);
}
console.log(`OK layout audit: ${report.route_count} routes × ${report.widths.length} widths (${report.checks} checks)`);
