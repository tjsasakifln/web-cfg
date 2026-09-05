/** Rendered mobile/desktop gate for the three MV-02 public surfaces. */

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const SITE = join(ROOT, "_site");
const PORT = 8792;
const ROUTES = ["/confianca/", "/especialista/tiago-jun-sasaki/", "/conflitos/"];
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1366, height: 768 },
];
const SCREENSHOT_DIR = String(process.env.TRUST_SCREENSHOT_DIR || "").trim();
const AXE_PATH = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
if (SCREENSHOT_DIR) mkdirSync(SCREENSHOT_DIR, { recursive: true });
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

if (!existsSync(join(SITE, "confianca", "index.html"))) {
  throw new Error("trust_responsive_requires_built_site");
}

const server = createServer((request, response) => {
  let pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = join(SITE, pathname);
  if (!file.startsWith(`${SITE}${sep}`) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(PORT, "127.0.0.1", done));

const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const failures = [];
try {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      const response = await page.goto(`http://127.0.0.1:${PORT}${route}`, {
        waitUntil: "networkidle0",
        timeout: 30_000,
      });
      await page.addScriptTag({ path: AXE_PATH });
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const duplicateIds = [...document.querySelectorAll("[id]")]
          .map((element) => element.id)
          .filter((id, index, ids) => ids.indexOf(id) !== index);
        const unlabeled = [...document.querySelectorAll("main input,main select,main textarea")]
          .filter((control) => control.type !== "hidden" && !control.closest(".honeypot"))
          .filter((control) => !control.labels?.length && !control.getAttribute("aria-label"))
          .map((control) => control.id || control.name);
        const tooSmall = [...document.querySelectorAll("main button,main select")]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.height < 44;
          })
          .map((element) => `${element.tagName.toLowerCase()}#${element.id || ""}:${Math.round(element.getBoundingClientRect().height)}`);
        return {
          horizontalOverflow: root.scrollWidth - root.clientWidth,
          scrollY: Math.round(window.scrollY),
          headerBox: (() => { const box = document.querySelector(".site-header")?.getBoundingClientRect(); return box ? { top: Math.round(box.top), height: Math.round(box.height) } : null; })(),
          breadcrumbLeft: Math.round(document.querySelector(".breadcrumbs")?.getBoundingClientRect().left || 0),
          h1Count: document.querySelectorAll("main h1").length,
          mainWidth: Math.round(document.querySelector("main")?.getBoundingClientRect().width || 0),
          duplicateIds,
          unlabeled,
          tooSmall,
          conflictFormVisible: location.pathname !== "/conflitos/" || Boolean(document.querySelector("#conflict-gate-form")?.getBoundingClientRect().height),
          credentialBlockVisible: location.pathname === "/conflitos/" || Boolean(document.querySelector(".credential-block")?.getBoundingClientRect().height),
        };
      });
      const axeViolations = await page.evaluate(async () => {
        const result = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
        });
        return result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.length,
        }));
      });
      let conflictStates = null;
      if (route === "/conflitos/") {
        conflictStates = await page.evaluate(() => {
          const form = document.querySelector("#conflict-gate-form");
          const result = document.querySelector("#conflict-gate-result");
          for (const select of form.querySelectorAll("select")) select.value = "no";
          form.elements.nucleus_id.value = "expert_evidence_assistance";
          form.elements.intended_role.value = "technical_assistant";
          form.elements.information_sufficient.value = "yes";
          form.elements.distinct_matter_no_signal.value = "yes";
          form.requestSubmit();
          const unavailablePath = result.dataset.conflictGateResult;
          form.elements.same_public_duty_matter.value = "yes";
          form.elements.distinct_matter_no_signal.value = "no";
          form.requestSubmit();
          return {
            unavailablePath,
            samePublicDuty: result.dataset.conflictGateResult,
            url: location.href,
          };
        });
      }
      if (!response || response.status() !== 200) failures.push({ route, viewport: viewport.name, code: "http", metrics });
      if (metrics.horizontalOverflow > 1) failures.push({ route, viewport: viewport.name, code: "horizontal_overflow", metrics });
      if (metrics.scrollY !== 0 || !metrics.headerBox || metrics.headerBox.top < 0 || metrics.headerBox.height < 60 || metrics.breadcrumbLeft < 0) failures.push({ route, viewport: viewport.name, code: "top_chrome_geometry", metrics });
      if (metrics.h1Count !== 1 || metrics.mainWidth < 300) failures.push({ route, viewport: viewport.name, code: "main_geometry", metrics });
      if (metrics.duplicateIds.length || metrics.unlabeled.length || metrics.tooSmall.length) failures.push({ route, viewport: viewport.name, code: "a11y_geometry", metrics });
      if (!metrics.conflictFormVisible || !metrics.credentialBlockVisible) failures.push({ route, viewport: viewport.name, code: "required_block_hidden", metrics });
      if (axeViolations.length) failures.push({ route, viewport: viewport.name, code: "axe", axeViolations });
      if (conflictStates && (conflictStates.unavailablePath !== "REVIEW_REQUIRED" || conflictStates.samePublicDuty !== "DECLINE" || /[?]/.test(conflictStates.url))) {
        failures.push({ route, viewport: viewport.name, code: "conflict_runtime", conflictStates });
      }
      if (SCREENSHOT_DIR) {
        const slug = route === "/confianca/" ? "confianca" : route.includes("especialista") ? "especialista" : "conflitos";
        await page.screenshot({ path: join(SCREENSHOT_DIR, `${slug}-${viewport.width}x${viewport.height}.png`), fullPage: false });
      }
      console.log("PASS", viewport.name, `${viewport.width}x${viewport.height}`, route, JSON.stringify({ ...metrics, axeViolations, conflictStates }));
      await page.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
