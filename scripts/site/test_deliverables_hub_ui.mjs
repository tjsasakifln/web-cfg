/** Rendered quality gate for /entregas/, its analytics and static nav promotion. */
import fs from "fs";
import path from "path";
import { createServer } from "http";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

// One primary card per published offer; the 54-item roll is reference-only.
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
const widths = [320, 360, 390, 768, 900, 901, 1024, 1200, 1366, 1440, 1661];
const screenshotDir = String(process.env.DELIVERABLES_SCREENSHOT_DIR || "").trim();
const reportPath = String(process.env.DELIVERABLES_HUB_REPORT || "").trim();
const required = process.env.UI_GEOMETRY_REQUIRED === "1" || Boolean(process.env.CI);
const brand = JSON.parse(fs.readFileSync(path.join(root, "data/site/brand.json"), "utf8"));
const promotedNav = (brand.navigation?.desktop || []).map((item) => item.label);
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
  const height = width <= 390 ? 844 : width === 768 ? 1024 : width === 1661 ? 939 : width === 1024 ? 768 : width === 1366 ? 768 : width === 1200 ? 800 : 900;
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const response = await page.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
  const metrics = await page.evaluate(() => {
    const lineCount = (element) => {
      if (!element) return 0;
      const range = document.createRange();
      range.selectNodeContents(element);
      const tops = [...range.getClientRects()]
        .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
        .map((rect) => Math.round(rect.top));
      return new Set(tops).size;
    };
    const visible = (element) => Boolean(
      element
      && getComputedStyle(element).display !== "none"
      && element.getBoundingClientRect().width > 0
      && element.getBoundingClientRect().height > 0,
    );
    const heroCtaElement = document.querySelector('.deliverables-hero [href="#enquadrar"]');
    const heroCta = heroCtaElement?.getBoundingClientRect();
    const firstReport = document.querySelector('[data-cta-id="deliverables-open-report"]')?.getBoundingClientRect();
    const decisionNav = document.querySelector(".offer-decision-nav");
    const decisionNavList = decisionNav?.querySelector("ol");
    const decisionNavBrokenWords = [];
    const decisionNavTextWidths = [];
    for (const link of decisionNav?.querySelectorAll("a") || []) {
      const style = getComputedStyle(link);
      const tracks = style.gridTemplateColumns.match(/[\d.]+px/g) || [];
      if (tracks.length) decisionNavTextWidths.push(Number.parseFloat(tracks.at(-1)));
      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        // Include terminal punctuation in the measured range. Otherwise a
        // question mark can be stranded on its own visual line while the word
        // itself appears intact and the regression slips through the gate.
        for (const match of node.data.matchAll(/\p{L}{4,}[?!…]?/gu)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const tops = new Set([...range.getClientRects()]
            .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
            .map((rect) => Math.round(rect.top * 2) / 2));
          if (tops.size > 1) decisionNavBrokenWords.push(match[0]);
        }
      }
    }
    const firstOffer = document.querySelector("#entrega-01");
    const archetypes = [...document.querySelectorAll('main > [data-section-archetype]')]
      .map((element) => element.getAttribute('data-section-archetype'));
    const primaries = document.querySelectorAll('main .button-primary').length;
    const desktopDeliverables = document.querySelector('.desktop-nav a[href="/conteudos/"]');
    const footerDeliverables = document.querySelector('footer a[href="/entregas/"]');
    const offerCards = [...document.querySelectorAll('article.vitrine-item[data-primary-offer="true"]')];
    const capabilityRows = [...document.querySelectorAll(".capability-item")];
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
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
      documentHeight: Math.round(document.documentElement.scrollHeight),
      decisionNavTop: Math.round((decisionNav?.getBoundingClientRect().top || 0) + window.scrollY),
      decisionNavHeight: Math.round(decisionNav?.getBoundingClientRect().height || 0),
      decisionNavColumns: decisionNavList
        ? getComputedStyle(decisionNavList).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
        : 0,
      decisionNavBrokenWords,
      decisionNavMinTextWidth: decisionNavTextWidths.length
        ? Math.round(Math.min(...decisionNavTextWidths) * 10) / 10
        : 0,
      decisionNavFontSize: decisionNav
        ? Number.parseFloat(getComputedStyle(decisionNav.querySelector("a")).fontSize)
        : 0,
      firstOfferTop: Math.round((firstOffer?.getBoundingClientRect().top || 0) + window.scrollY),
      mainLinks: document.querySelectorAll("main a").length,
      offers: offerCards.map((card) => {
        const name = card.querySelector("h2");
        const price = card.querySelector(".vitrine-item__price strong");
        const facts = [...card.querySelectorAll(".vitrine-item__facts>div")];
        const essential = [
          card.querySelector(".vitrine-item__facts"),
          card.querySelector(".vitrine-item__credit"),
          card.querySelector(".vitrine-item__actions"),
          ...facts,
        ];
        return {
          id: card.getAttribute("data-deliverable-id") || "",
          state: card.getAttribute("data-public-state") || "",
          visible: visible(card),
          hiddenEssential: essential.filter((element) => !visible(element)).length,
          factLabels: facts.map((fact) => fact.querySelector("dt")?.textContent?.trim() || ""),
          nameWidth: Math.round(name?.getBoundingClientRect().width || 0),
          priceText: price?.textContent?.replace(/\s+/g, " ").trim() || "",
          priceLines: lineCount(price),
          exampleCtaHeight: Math.round(card.querySelector(".button")?.getBoundingClientRect().height || 0),
          analysisCtaHeight: Math.round(card.querySelector(".text-link")?.getBoundingClientRect().height || 0),
        };
      }),
      capabilityRoll: {
        rowCount: capabilityRows.length,
        stateCounts: capabilityRows.reduce((counts, row) => {
          const state = row.getAttribute("data-public-state") || "";
          counts[state] = (counts[state] || 0) + 1;
          return counts;
        }, {}),
        groups: document.querySelectorAll(".capability-group").length,
        openGroups: document.querySelectorAll(".capability-group[open]").length,
        shortSummaries: [...document.querySelectorAll(".capability-group>summary")]
          .filter((summary) => summary.getBoundingClientRect().height < 44).length,
      },
      navDeliverables: desktopDeliverables?.textContent?.trim() || "",
      navCurrent: desktopDeliverables?.getAttribute("aria-current") || "",
      footerDeliverables: footerDeliverables?.textContent?.trim() || "",
      emptyPlaceholders: document.querySelectorAll("[data-placeholder], .placeholder").length,
      overflowOffenders: [...document.querySelectorAll("body *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return style.display !== "none" && style.position !== "fixed"
            && (rect.left < -1 || rect.right > window.innerWidth + 1);
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
  const h1 = metrics.h1Text.toLocaleLowerCase("pt-BR");
  if (metrics.h1Count !== 1 || !h1.includes("8 ofertas publicadas") || !h1.includes("decisão")) errors.push("hero_clarity");
  if (!metrics.heroCtaVisible || !metrics.heroCtaTargetExists || metrics.heroCtaHref !== "#enquadrar" ||
      (width <= 390 && metrics.heroCtaBottom > height)) errors.push("hero_cta");
  if (!metrics.firstReportVisible || metrics.offers.length !== EXPECTED_EXAMPLES) errors.push("published_offers");
  const expectedIds = Array.from({ length: EXPECTED_EXAMPLES }, (_, index) => `CFG-D${String(index + 1).padStart(2, "0")}`);
  if (JSON.stringify(metrics.offers.map(({ id }) => id)) !== JSON.stringify(expectedIds)) errors.push("published_offer_order");
  if (metrics.offers.some(({ state }) => state !== "PUBLISHED")) errors.push("published_offer_state");
  if (metrics.offers.some((offer) => !offer.visible || offer.hiddenEssential)) errors.push("published_offer_substance_hidden");
  const requiredFacts = ["Situação", "Decisão", "Entrada", "Objeto e limite", "Saída", "SLA"];
  if (metrics.offers.some(({ factLabels }) => !requiredFacts.every((label) => factLabels.includes(label)))) errors.push("published_offer_facts");
  const starvedName = metrics.offers.filter(({ nameWidth }) => nameWidth < 120);
  if (starvedName.length) errors.push(`offer_name_starved=${starvedName.map(({ nameWidth }) => nameWidth).join(",")}`);
  if (metrics.offers.some(({ exampleCtaHeight, analysisCtaHeight }) => exampleCtaHeight < 44 || analysisCtaHeight < 44)) {
    errors.push("published_offer_touch_targets");
  }
  // Price integrity remains a trust surface in the single primary representation.
  const priceShape = /^R\$ \d{1,3}(\.\d{3})*$/;
  const wrappedPrices = metrics.offers.filter(({ priceLines }) => priceLines !== 1);
  const brokenPrices = metrics.offers.filter(({ priceText }) => !priceShape.test(priceText));
  if (wrappedPrices.length) errors.push(`price_wrapped=${wrappedPrices.map(({ priceText, priceLines }) => `${priceText}/${priceLines}L`).join(",")}`);
  if (brokenPrices.length) errors.push(`price_text_corrupt=${brokenPrices.map(({ priceText }) => priceText).join(",")}`);
  const roll = metrics.capabilityRoll;
  if (roll.rowCount !== 54 || roll.groups !== 7) errors.push(`capability_roll=${roll.rowCount}/${roll.groups}`);
  if (JSON.stringify(roll.stateCounts) !== JSON.stringify({ PUBLISHED: 8, VALIDATE: 44, BLOCKED: 2 })) {
    errors.push(`capability_states=${JSON.stringify(roll.stateCounts)}`);
  }
  if (roll.openGroups !== 0 || roll.shortSummaries) errors.push("capability_progressive_disclosure");
  // #468 measured 13,098 px at 390 px with the same eight offers rendered three
  // times. The new budget is lower while retaining every essential fact and adding
  // the complete 54-capability roll behind native disclosure.
  if (width === 390 && metrics.documentHeight > 12500) errors.push(`document_height=${metrics.documentHeight}`);
  if (width === 390 && metrics.decisionNavTop > 1800) errors.push(`decision_nav_top=${metrics.decisionNavTop}`);
  if (width <= 360 && metrics.decisionNavColumns !== 2) {
    errors.push(`decision_nav_columns=${metrics.decisionNavColumns}`);
  }
  if (width <= 360 && metrics.decisionNavHeight > 330) errors.push(`decision_nav_height=${metrics.decisionNavHeight}`);
  if (width === 320 && metrics.decisionNavMinTextWidth < 110) {
    errors.push(`decision_nav_text_width=${metrics.decisionNavMinTextWidth}`);
  }
  if (width <= 360 && metrics.decisionNavFontSize < 12.8) {
    errors.push(`decision_nav_font_size=${metrics.decisionNavFontSize}`);
  }
  if (metrics.decisionNavBrokenWords.length) {
    errors.push(`decision_nav_broken_words=${metrics.decisionNavBrokenWords.join(",")}`);
  }
  if (metrics.mainLinks > 50) errors.push(`main_links=${metrics.mainLinks}`);
  if (metrics.longestArchetypeRun > 2) errors.push(`archetype_run=${metrics.longestArchetypeRun}`);
  // One primary leads to the progressive framing and the other submits the
  // terminal hand-raise added by #290; neither replaces a priced offer path.
  if (metrics.primaries > 2) errors.push(`primary_cta_overuse=${metrics.primaries}`);
  if (metrics.navDeliverables !== "Biblioteca" || metrics.footerDeliverables !== "Entregas") errors.push("nav_contract");
  if (metrics.emptyPlaceholders) errors.push("empty_placeholders");

  if (width <= 900) {
    await page.click(".menu-toggle");
    const mobile = await page.evaluate(() => {
      const menu = document.querySelector(".mobile-nav");
      const link = menu?.querySelector('a[href="/conteudos/"]');
      return {
        expanded: document.querySelector(".menu-toggle")?.getAttribute("aria-expanded"),
        linkVisible: Boolean(link && link.getBoundingClientRect().height >= 44),
        linkText: link?.textContent?.trim() || "",
      };
    });
    if (mobile.expanded !== "true" || !mobile.linkVisible || mobile.linkText !== "Biblioteca") {
      errors.push("mobile_nav");
    }
    await page.click(".menu-toggle");
  }
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.mouse.move(1, 1);
    await page.screenshot({
      path: path.join(screenshotDir, `deliverables-${width}.png`),
      fullPage: width === 390 || width === 1440,
    });
  }
  findings.push({ route: "/entregas/", width, height, ...metrics, errors });
  if (errors.length) failed += 1;
}

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
const catalogLazyBefore = await page.evaluate(() => performance.getEntriesByType("resource")
  .map((entry) => entry.name)
  .filter((name) => name.endsWith("/entregas/catalog.css") || name.endsWith("/entregas/catalog-data.js") || name.endsWith("/entregas/catalog.js")));
const catalogErrors = [];
if (catalogLazyBefore.length) catalogErrors.push("catalog_scripts_loaded");
const catalogBoot = await page.evaluate(() => ({
  enhanced: document.body.classList.contains("catalog-enhanced"),
  dataSchema: window.CONFENGE_CATALOG_DATA?.schema || "",
  dataCount: window.CONFENGE_CATALOG_DATA?.items?.length || 0,
  filterPresent: Boolean(document.querySelector("[data-catalog-filters]")),
  cards: document.querySelectorAll("article.vitrine-item").length,
  backlogCards: document.querySelectorAll("article.catalog-item").length,
  capabilityRows: document.querySelectorAll(".capability-item").length,
  capabilityGroups: document.querySelectorAll(".capability-group").length,
}));
if (catalogBoot.enhanced || catalogBoot.filterPresent || catalogBoot.dataCount) catalogErrors.push("catalog_not_retired");
if (
  catalogBoot.cards !== EXPECTED_EXAMPLES
  || catalogBoot.backlogCards !== 0
  || catalogBoot.capabilityRows !== 54
  || catalogBoot.capabilityGroups !== 7
) catalogErrors.push("catalog_data_contract");
const frameKeyboard = await page.evaluate(() => {
  const first = document.querySelector(".offer-decision-nav a");
  first?.focus();
  return { href: first?.getAttribute("href") || "", active: document.activeElement === first };
});
if (frameKeyboard.href !== "#entrega-01" || !frameKeyboard.active) catalogErrors.push("frame_keyboard");
findings.push({ route: "/entregas/", check: "public_vitrine", catalogLazyBefore, catalogBoot, frameKeyboard, errors: catalogErrors });
if (catalogErrors.length) failed += 1;

const noScriptPage = await browser.newPage();
await noScriptPage.setJavaScriptEnabled(false);
await noScriptPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await noScriptPage.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
const noScriptCatalog = await noScriptPage.evaluate(() => ({
  cards: document.querySelectorAll("article.vitrine-item").length,
  visibleCards: [...document.querySelectorAll("article.vitrine-item")].filter((card) => getComputedStyle(card).display !== "none").length,
  backlogCards: document.querySelectorAll("article.catalog-item").length,
  capabilityRows: document.querySelectorAll(".capability-item").length,
  capabilityGroups: document.querySelectorAll(".capability-group").length,
  decisionNav: Boolean(document.querySelector(".offer-decision-nav")),
  essentialFactSets: [...document.querySelectorAll("article.vitrine-item")]
    .map((card) => [...card.querySelectorAll(".vitrine-item__facts dt")].map((dt) => dt.textContent.trim())),
  filters: Boolean(document.querySelector("[data-catalog-filters]")),
}));
const noScriptErrors = [];
if (
  noScriptCatalog.cards !== EXPECTED_EXAMPLES
  || noScriptCatalog.visibleCards !== EXPECTED_EXAMPLES
  || noScriptCatalog.backlogCards !== 0
  || noScriptCatalog.capabilityRows !== 54
  || noScriptCatalog.capabilityGroups !== 7
) {
  noScriptErrors.push("catalog_noscript_content");
}
const noScriptFactLabels = ["Situação", "Decisão", "Entrada", "Objeto e limite", "Saída", "SLA"];
if (
  !noScriptCatalog.decisionNav
  || noScriptCatalog.essentialFactSets.some((labels) => !noScriptFactLabels.every((label) => labels.includes(label)))
) {
  noScriptErrors.push("catalog_noscript_decision_content");
}
if (noScriptCatalog.filters) noScriptErrors.push("catalog_noscript_controls");
findings.push({ route: "/entregas/", check: "catalog_noscript", noScriptCatalog, errors: noScriptErrors });
if (noScriptErrors.length) failed += 1;
await noScriptPage.close();

// The header must always offer a commercial path. .header-cta was hidden from
// 1240px down while .menu-toggle only appeared at 900px, so every width between
// 901 and 1240 showed navigation with no call to action and no menu either.
for (const width of [390, 901, 960, 1000, 1120, 1240, 1366, 1661]) {
  await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${base}/`, { waitUntil: "networkidle0", timeout: 30000 });
  const header = await page.evaluate(() => {
    const visible = (element) => Boolean(element && getComputedStyle(element).display !== "none"
      && element.getBoundingClientRect().width > 0);
    const cta = document.querySelector(".header-cta");
    const inner = document.querySelector(".header-inner");
    return {
      ctaVisible: visible(cta),
      navVisible: visible(document.querySelector(".desktop-nav")),
      toggleVisible: visible(document.querySelector(".menu-toggle")),
      ctaOverflowsHeader: Boolean(visible(cta) && inner
        && cta.getBoundingClientRect().right > inner.getBoundingClientRect().right + 1),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  const errors = [];
  // At or below the mobile breakpoint the opened menu carries the CTA instead.
  if (width > 900 && !header.ctaVisible) errors.push("header_cta_missing");
  if (!header.navVisible && !header.toggleVisible) errors.push("header_nav_unreachable");
  if (header.ctaOverflowsHeader) errors.push("header_cta_overflows");
  if (header.overflow) errors.push("document_overflow");
  findings.push({ route: "/", check: "header_commercial_path", width, ...header, errors });
  if (errors.length) failed += 1;
}

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
    if (metrics.nav.filter(({ href }) => href === "/conteudos/").length !== 1) errors.push("contents_nav_missing");
    if (metrics.nav.some(({ href }) => href === "/ferramentas/")) errors.push("tools_nav_not_consolidated");
    if (metrics.nav.some(({ text }) => text === "Entregas")) errors.push("entregas_still_in_header");
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
const report = { ok: failed === 0, generated_at: new Date().toISOString(), findings, axe, hardAxe };
if (reportPath) {
  const output = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log("DELIVERABLES_HUB_UI", JSON.stringify(report));
if (failed) process.exit(1);
