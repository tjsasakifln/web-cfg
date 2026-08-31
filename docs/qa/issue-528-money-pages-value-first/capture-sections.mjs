#!/usr/bin/env node

/**
 * Evidence-only segmented capture for #528.
 * It intentionally never calls screenshot({ fullPage: true }); see #540.
 *
 * Usage:
 *   node capture-sections.mjs OUTPUT_DIR [BASE_URL]
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "../../../scripts/site/resolve_chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT = resolve(process.argv[2] || join(ROOT, "docs/qa/issue-528-money-pages-value-first/sections"));
const BASE_ARG = process.argv[3]?.replace(/\/$/, "");
const PORT = 8798;
const VIEWPORTS = [[390, 844], [1366, 768]];
const ROUTES = [
  { path: "/servicos-obras-publicas/", targets: [["decision", "main > .section"], ["contract-events", ".contract-products-hub"]] },
  { path: "/diagnostico-b2g-expansao/", targets: [["hero", ".offer-hero"], ["artifact", "[data-offer-section='outputs']"], ["proof", "[data-offer-section='proof']"]] },
  { path: "/bid-room-licitacoes-obras/", targets: [["hero", ".offer-hero"], ["decision", "[data-offer-section='urgency']"], ["artifact", "[data-offer-section='outputs']"], ["price-value", "[data-offer-section='wip']"]] },
  { path: "/defesa-margem-contratos-publicos/", targets: [["hero", ".offer-hero"], ["artifact", "[aria-label='Entregáveis e inputs']"], ["contract", ".contract-product"]] },
  { path: "/atrasos-prorrogacao-obras-publicas/", targets: [["hero", ".pillar-hero"], ["decision", ".pillar-overview"], ["contract", ".contract-product"]] },
  { path: "/defesa-tecnica-contratos-publicos/", targets: [["hero", ".pillar-hero"], ["decision", ".pillar-overview"], ["contract", ".contract-product"]] },
  { path: "/acompanhamento-contratos-obras/", targets: [["hero", ".pillar-hero"], ["decision", ".pillar-overview"], ["engagement", "[aria-label='Oferta comercial relacionada']"]] },
  { path: "/diretoria-b2g/", targets: [["hero", ".offer-hero"], ["decision", "[data-offer-section='problem']"], ["artifact", "[data-offer-section='outputs']"], ["price-value", "[data-offer-section='offer']"]] },
];

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

function startServer() {
  const server = createServer((request, response) => {
    try {
      let requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
      if (requestPath.endsWith("/")) requestPath += "index.html";
      const absolute = join(ROOT, requestPath);
      if (!absolute.startsWith(`${ROOT}${sep}`) || !existsSync(absolute) || statSync(absolute).isDirectory()) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, { "Content-Type": MIME[extname(absolute)] || "application/octet-stream" });
      response.end(readFileSync(absolute));
    } catch {
      response.writeHead(500);
      response.end("capture server error");
    }
  });
  return new Promise((done) => server.listen(PORT, "127.0.0.1", () => done(server)));
}

const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
if (dirty && process.env.CAPTURE_ALLOW_DIRTY !== "1") {
  throw new Error("ISSUE_528_CAPTURE_DIRTY: commit first or set CAPTURE_ALLOW_DIRTY=1 for provisional evidence");
}
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const server = BASE_ARG ? null : await startServer();
const baseUrl = BASE_ARG || `http://127.0.0.1:${PORT}`;
let remoteBuildInfo = null;
if (BASE_ARG) {
  try {
    const response = await fetch(`${baseUrl}/.well-known/build-info.json`);
    if (response.ok) remoteBuildInfo = await response.json();
  } catch {
    remoteBuildInfo = null;
  }
}
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  headless: true,
  args: ["--disable-gpu", "--font-render-hinting=none", "--no-sandbox"],
});
const captures = [];

for (const route of ROUTES) {
  const slug = route.path.replaceAll("/", "");
  for (const [width, height] of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle0", timeout: 60000 });
    if (!response || response.status() >= 400) throw new Error(`capture HTTP ${response?.status() || 0}: ${route.path}`);
    await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
      await document.fonts?.ready;
    });

    const foldFile = `${slug}-first-fold-${width}x${height}.png`;
    const foldAbsolute = join(OUT, foldFile);
    await page.screenshot({ path: foldAbsolute, fullPage: false });
    captures.push({
      route: route.path,
      selector: "viewport",
      section: "first-fold",
      viewport: `${width}x${height}`,
      file: foldFile,
      sha256: createHash("sha256").update(readFileSync(foldAbsolute)).digest("hex"),
    });

    for (const [name, selector] of route.targets) {
      await page.$$eval(selector, (elements) => {
        for (const element of elements) {
          for (let details = element.closest("details"); details; details = details.parentElement?.closest("details") || null) details.open = true;
          element.style.contentVisibility = "visible";
        }
      });
      const element = await page.$(selector);
      if (!element) throw new Error(`selector not found on ${route.path}: ${selector}`);
      await page.evaluate(() => {
        for (const node of document.querySelectorAll(".site-header,.contact-float,.skip-link")) node.style.visibility = "hidden";
      });
      const file = `${slug}-${name}-${width}x${height}.png`;
      const absolute = join(OUT, file);
      await element.screenshot({ path: absolute });
      captures.push({
        route: route.path,
        selector,
        section: name,
        viewport: `${width}x${height}`,
        file,
        sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex"),
      });
      await page.evaluate(() => {
        for (const node of document.querySelectorAll(".site-header,.contact-float,.skip-link")) node.style.visibility = "";
      });
    }
    await page.close();
  }
}

await browser.close();
if (server) server.close();
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify({
  schema: "confenge.issue-528-segmented-capture/1.1",
  issue: 528,
  capture_mode: "first_fold_and_element_sections_no_fullpage",
  fullpage_used: false,
  fullpage_limitation_issue: 540,
  captured_at: new Date().toISOString(),
  commit_sha: commit,
  rendered_content_sha: BASE_ARG ? (remoteBuildInfo?.commit || "UNKNOWN") : commit,
  remote_build_info: BASE_ARG ? remoteBuildInfo : null,
  tree_dirty: Boolean(dirty),
  base_url: baseUrl,
  output_dir: relative(ROOT, OUT),
  viewports: VIEWPORTS.map(([width, height]) => `${width}x${height}`),
  captures,
}, null, 2)}\n`);
console.log(`ISSUE_528_SEGMENTED_CAPTURE_OK captures=${captures.length} out=${OUT}`);
