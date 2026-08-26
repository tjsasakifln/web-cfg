/** Rendered quality gate for /entregas/, its analytics and static nav promotion. */
import fs from "fs";
import path from "path";
import { createServer } from "http";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

// One .deliverable-feature per published example in the value ladder.
const EXPECTED_EXAMPLES = 8;

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const externalBase = process.argv[2];
const artifactRoot = path.join(root, "_site");
const siteRoot = !externalBase && fs.existsSync(path.join(artifactRoot, "index.html"))
  ? artifactRoot
  : root;
const port = 8795;
const widths = [320, 390, 768, 1024, 1440];
const screenshotDir = String(process.env.DELIVERABLES_SCREENSHOT_DIR || "").trim();
const required = process.env.UI_GEOMETRY_REQUIRED === "1" || Boolean(process.env.CI);
const promotedNav = ["Serviços", "Problemas que resolvemos", "Entregas", "Conteúdos", "Ferramentas", "Especialista"];
const legacyNav = ["Serviços", "Problemas que resolvemos", "Conteúdos", "Ferramentas", "Especialista"];
const frozenRoutes = [
  "/aditivos-obras-publicas/",
  "/medicoes-glosas-obras-publicas/",
  "/reequilibrio-obras-publicas/",
  "/auditoria-orcamento-licitacao/",
  "/diagnostico-b2g-360/",
  "/diagnostico-pre-licitacao/",
];
const mutableCanonicalRoutes = [
  "/",
  "/ferramentas/",
  "/casos/",
  "/inteligencia/valor-tipico-contratos-pavimentacao/",
  "/privacidade/",
  "/radar/nacional-obras-publicas/",
];

function startStaticServer() {
  const mime = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript", ".png": "image/png", ".jpg": "image/jpeg",
    ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json",
  };
  const server = createServer((request, response) => {
    let urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.join(siteRoot, urlPath);
    if (!file.startsWith(siteRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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
if (required && !externalBase && siteRoot !== artifactRoot) {
  console.error("DELIVERABLES_UI_ARTIFACT_MISSING run npm run build:site first");
  if (server) server.close();
  process.exit(2);
}
try {
  browser = await puppeteer.launch({
    executablePath: resolveChromePath(), headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
  });
} catch (error) {
  console.log("DELIVERABLES_UI_UNAVAILABLE", String(error?.message || error).slice(0, 240));
  if (server) server.close();
  process.exit(required ? 2 : 0);
}

const findings = [];
let failed = 0;
const page = await browser.newPage();

for (const width of widths) {
  const height = width <= 390 ? 844 : width === 768 ? 1024 : 900;
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const response = await page.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
  const metrics = await page.evaluate(() => {
    const heroCtaElement = document.querySelector('.deliverables-hero [href="#enquadrar"]');
    const heroCta = heroCtaElement?.getBoundingClientRect();
    const firstReport = document.querySelector('[data-cta-id="deliverables-open-report"]')?.getBoundingClientRect();
    const compare = document.querySelector('#comparar .compare-table');
    const compareRows = document.querySelectorAll('#comparar .compare-table tbody tr').length;
    const compareScroll = document.querySelector('#comparar .compare-scroll');
    const archetypes = [...document.querySelectorAll('main > [data-section-archetype]')]
      .map((element) => element.getAttribute('data-section-archetype'));
    const primaries = document.querySelectorAll('main .button-primary').length;
    const desktopDeliverables = document.querySelector('.desktop-nav a[href="/entregas/"]');
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      compareVisible: Boolean(compare && compare.getBoundingClientRect().height > 0),
      compareRows,
      compareAboveExamples: Boolean(
        compare && document.querySelector("#primeiro-exemplo")
        && compare.getBoundingClientRect().top
          < document.querySelector("#primeiro-exemplo").getBoundingClientRect().top,
      ),
      compareScrollFocusable: compareScroll?.getAttribute("tabindex") === "0",
      longestArchetypeRun: archetypes.reduce(
        (state, value) => {
          const run = value === state.previous ? state.run + 1 : 1;
          return { previous: value, run, best: Math.max(state.best, run) };
        },
        { previous: null, run: 0, best: 0 },
      ).best,
      primaries,
      h1Count: document.querySelectorAll("h1").length,
      h1Text: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || "",
      heroCtaHref: heroCtaElement?.getAttribute("href") || "",
      heroCtaTargetExists: Boolean(document.querySelector("#enquadrar")),
      heroCtaVisible: Boolean(heroCta && heroCta.width > 0 && heroCta.height >= 44),
      heroCtaBottom: heroCta?.bottom || null,
      firstReportVisible: Boolean(firstReport && firstReport.width > 0 && firstReport.height >= 44),
      examples: document.querySelectorAll(".deliverable-feature").length,
      navDeliverables: desktopDeliverables?.textContent?.trim() || "",
      navCurrent: desktopDeliverables?.getAttribute("aria-current") || "",
      emptyPlaceholders: document.querySelectorAll("[data-placeholder], .placeholder").length,
      overflowOffenders: [...document.querySelectorAll("body *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return style.display !== "none" && style.position !== "fixed" &&
            (rect.left < -1 || rect.right > window.innerWidth + 1);
        })
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName, className: String(element.className || "").slice(0, 100),
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
        })),
    };
  });
  const errors = [];
  if (!response || ![200, 304].includes(response.status())) errors.push(`http=${response?.status()}`);
  if (metrics.overflow) errors.push("document_overflow");
  if (metrics.h1Count !== 1 || !metrics.h1Text.includes("54 entregas") || !metrics.h1Text.includes("decisão que cabe agora")) errors.push("hero_clarity");
  if (!metrics.heroCtaVisible || !metrics.heroCtaTargetExists || metrics.heroCtaHref !== "#enquadrar" ||
      (width <= 390 && metrics.heroCtaBottom > height)) errors.push("hero_cta");
  if (!metrics.firstReportVisible || metrics.examples !== EXPECTED_EXAMPLES) errors.push("ladder_examples");
  if (!metrics.compareVisible || metrics.compareRows !== EXPECTED_EXAMPLES) errors.push("compare_view");
  if (!metrics.compareAboveExamples) errors.push("compare_before_sections");
  if (!metrics.compareScrollFocusable) errors.push("compare_scroll_focus");
  if (metrics.longestArchetypeRun > 2) errors.push(`archetype_run=${metrics.longestArchetypeRun}`);
  // One primary leads to the progressive framing and the other submits the
  // hand-raise added by #290; neither replaces a priced offer path.
  if (metrics.primaries > 2) errors.push(`primary_cta_overuse=${metrics.primaries}`);
  if (metrics.navDeliverables !== "Entregas" || metrics.navCurrent !== "page") errors.push("nav_contract");
  if (metrics.emptyPlaceholders) errors.push("empty_placeholders");

  if (width <= 900) {
    await page.click(".menu-toggle");
    const mobile = await page.evaluate(() => {
      const menu = document.querySelector(".mobile-nav");
      const link = menu?.querySelector('a[href="/entregas/"]');
      return {
        expanded: document.querySelector(".menu-toggle")?.getAttribute("aria-expanded"),
        linkVisible: Boolean(link && link.getBoundingClientRect().height >= 44),
        linkText: link?.textContent?.trim() || "",
      };
    });
    if (mobile.expanded !== "true" || !mobile.linkVisible || mobile.linkText !== "Entregas") {
      errors.push("mobile_nav");
    }
    await page.click(".menu-toggle");
  }
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.mouse.move(1, 1);
    await page.screenshot({ path: path.join(screenshotDir, `deliverables-${width}.png`), fullPage: width === 1440 });
  }
  findings.push({ route: "/entregas/", width, height, ...metrics, errors });
  if (errors.length) failed += 1;
}

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
const catalogLazyBefore = await page.evaluate(() => performance.getEntriesByType("resource")
  .map((entry) => entry.name)
  .filter((name) => name.endsWith("/entregas/catalog.css") || name.endsWith("/entregas/catalog-data.js") || name.endsWith("/entregas/catalog.js")));
await page.evaluate(() => document.querySelector("#indice-integral")?.scrollIntoView());
await page.waitForFunction(() => document.body.classList.contains("catalog-enhanced"), { timeout: 10000 });
const catalogErrors = [];
if (catalogLazyBefore.length) catalogErrors.push("catalog_not_lazy");
const catalogBoot = await page.evaluate(() => ({
  enhanced: document.body.classList.contains("catalog-enhanced"),
  dataSchema: window.CONFENGE_CATALOG_DATA?.schema || "",
  dataCount: window.CONFENGE_CATALOG_DATA?.items?.length || 0,
  filterVisible: !document.querySelector("[data-catalog-filters]")?.hidden,
}));
if (!catalogBoot.enhanced || !catalogBoot.filterVisible) catalogErrors.push("catalog_not_enhanced");
if (catalogBoot.dataSchema !== "confenge.public-deliverable-catalog/1.0" || catalogBoot.dataCount !== 54) {
  catalogErrors.push("catalog_data_contract");
}
await page.type("[data-filter-query]", "Radar de Licitações Prioritárias");
const filtered = await page.evaluate(() => ({
  visibleCards: document.querySelectorAll("article.catalog-item:not([hidden])").length,
  status: document.querySelector("[data-filter-status]")?.textContent?.trim() || "",
  query: new URL(location.href).searchParams.get("q"),
}));
if (filtered.visibleCards !== 1 || !filtered.status.startsWith("1 de 54") || filtered.query !== "Radar de Licitações Prioritárias") {
  catalogErrors.push("catalog_filter_behavior");
}
await page.click("[data-clear-filters]");
await page.select("[data-frame-task]", "GROW");
await page.select("[data-frame-object]", "mercado");
await page.select("[data-frame-input]", "dados");
await page.click("[data-catalog-recommend]");
const recommendation = await page.evaluate(() => ({
  hidden: document.querySelector("[data-catalog-recommendation]")?.hidden,
  count: document.querySelectorAll("[data-catalog-recommendation] article").length,
  text: document.querySelector("[data-catalog-recommendation]")?.textContent || "",
  task: new URL(location.href).searchParams.get("frame_task"),
}));
if (recommendation.hidden || recommendation.count < 1 || recommendation.count > 3 || !recommendation.text.includes("R$") || recommendation.task !== "GROW") {
  catalogErrors.push("catalog_recommendation_behavior");
}
await page.evaluate(() => {
  const boxes = [...document.querySelectorAll("article.catalog-item:not([hidden]) [data-compare-item]")].slice(0, 2);
  for (const box of boxes) box.click();
});
await page.click("[data-compare-open]");
const progressiveComparison = await page.evaluate(() => ({
  count: document.querySelectorAll("[data-comparison-items] > article").length,
  criteria: document.querySelectorAll("[data-comparison-items] dt").length,
  hidden: document.querySelector("[data-comparison]")?.hidden,
  selected: new URL(location.href).searchParams.get("compare")?.split(",").length || 0,
}));
if (progressiveComparison.hidden || progressiveComparison.count !== 2 || progressiveComparison.criteria !== 18 || progressiveComparison.selected !== 2) {
  catalogErrors.push("catalog_comparison_behavior");
}
findings.push({ route: "/entregas/", check: "progressive_catalog", catalogLazyBefore, catalogBoot, filtered, recommendation, progressiveComparison, errors: catalogErrors });
if (catalogErrors.length) failed += 1;

const noScriptPage = await browser.newPage();
await noScriptPage.setJavaScriptEnabled(false);
await noScriptPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await noScriptPage.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
const noScriptCatalog = await noScriptPage.evaluate(() => ({
  cards: document.querySelectorAll("article.catalog-item").length,
  visibleCards: [...document.querySelectorAll("article.catalog-item")].filter((card) => getComputedStyle(card).display !== "none").length,
  filtersHidden: getComputedStyle(document.querySelector("[data-catalog-filters]")).display === "none",
  compareControlsHidden: getComputedStyle(document.querySelector(".catalog-item__compare")).display === "none",
}));
const noScriptErrors = [];
if (noScriptCatalog.cards !== 54 || noScriptCatalog.visibleCards !== 54) noScriptErrors.push("catalog_noscript_content");
if (!noScriptCatalog.filtersHidden || !noScriptCatalog.compareControlsHidden) noScriptErrors.push("catalog_noscript_controls");
findings.push({ route: "/entregas/", check: "catalog_noscript", noScriptCatalog, errors: noScriptErrors });
if (noScriptErrors.length) failed += 1;
await noScriptPage.close();

for (const { route, expectedNav } of [
  ...mutableCanonicalRoutes.map((route) => ({ route, expectedNav: promotedNav })),
  ...frozenRoutes.map((route) => ({ route, expectedNav: legacyNav })),
]) {
  await page.setViewport({ width: 1024, height: 900, deviceScaleFactor: 1 });
  const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
  const metrics = await page.evaluate((currentRoute) => {
    const nav = [...document.querySelectorAll(".desktop-nav a")].map((a) => ({
      text: a.textContent?.trim(), href: a.getAttribute("href"),
    }));
    const preview = document.querySelector(".home-deliverables")?.getBoundingClientRect();
    return {
      route: currentRoute,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      nav,
      navLabels: nav.map(({ text }) => text),
      previewVisible: currentRoute === "/" ? Boolean(preview && preview.height > 0) : null,
      sections: currentRoute === "/" ? document.querySelectorAll("main > section").length : null,
    };
  }, route);
  const errors = [];
  if (!response || ![200, 304].includes(response.status())) errors.push(`http=${response?.status()}`);
  if (metrics.overflow) errors.push("document_overflow");
  if (JSON.stringify(metrics.navLabels) !== JSON.stringify(expectedNav)) {
    errors.push(`nav_order=${JSON.stringify(metrics.navLabels)}`);
  }
  if (expectedNav === promotedNav) {
    if (metrics.nav.filter(({ href }) => href === "/entregas/").length !== 1) errors.push("deliverables_nav_missing");
    if (metrics.nav.filter(({ href }) => href === "/ferramentas/").length !== 1) errors.push("tools_nav_missing");
  } else {
    if (metrics.nav.some(({ text }) => text === "Entregas")) errors.push("frozen_nav_mutated");
    if (metrics.nav.filter(({ href }) => href === "/ferramentas/").length !== 1) errors.push("frozen_tools_missing");
  }
  if (route === "/" && (!metrics.previewVisible || metrics.sections > 7)) errors.push("home_preview_contract");
  if (route === "/" && screenshotDir) {
    const preview = await page.$(".home-deliverables");
    if (preview) await preview.screenshot({ path: path.join(screenshotDir, "home-deliverables.png") });
  }
  findings.push({ ...metrics, errors });
  if (errors.length) failed += 1;
}

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
await page.evaluate(() => {
  const target = document.querySelector('[data-cta-id="deliverables-open-report"]');
  target?.addEventListener("click", (event) => event.preventDefault(), { capture: true });
});
await page.click('[data-cta-id="deliverables-open-report"]');
const analytics = await page.evaluate(() => {
  const events = (window.dataLayer || []).filter(({ event }) => event === "cta_click");
  const event = events.at(-1) || null;
  const piiKeys = ["email", "phone", "cnpj", "document", "nome", "empresa", "query"];
  const hasPiiKey = Boolean(event && piiKeys.some((key) => Object.prototype.hasOwnProperty.call(event, key)));
  const hasPiiValue = Boolean(event && Object.values(event).some((value) => {
    if (typeof value !== "string") return false;
    if (value.includes("@")) return true;
    return /^\d{10,15}$/.test(value.replace(/[\s()+-]/g, ""));
  }));
  return { count: events.length, event, hasPiiKey, hasPiiValue };
});
if (
  analytics.count !== 1
  || analytics.event?.cta_id !== "deliverables-open-report"
  || analytics.event?.asset_id !== "entregas-exemplos-hub"
  || analytics.event?.source !== "CONFENGE_WEB"
  || analytics.event?.page_path !== "/entregas/"
  || analytics.hasPiiKey
  || analytics.hasPiiValue
) {
  failed += 1;
  findings.push({ route: "/entregas/", check: "analytics", analytics, errors: ["analytics_contract"] });
} else {
  findings.push({ route: "/entregas/", check: "analytics", analytics, errors: [] });
}
await page.addScriptTag({ content: axeSource });
const axe = await page.evaluate(async () => {
  const result = await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
  });
  return result.violations.map(({ id, impact, nodes }) => ({
    id, impact, nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })),
  }));
});
const hardAxe = axe.filter(({ impact }) => impact === "critical" || impact === "serious");
if (hardAxe.length) failed += 1;

await browser.close();
if (server) server.close();
console.log("DELIVERABLES_HUB_UI", JSON.stringify({ ok: failed === 0, findings, axe, hardAxe }));
if (failed) process.exit(1);
