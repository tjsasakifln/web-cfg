/**
 * Cross-family rendered geometry gate for the public CONFENGE surface.
 *
 * This test observes the shipped artifact in Chromium. It intentionally avoids
 * selector-presence assertions: every verdict comes from computed styles and
 * rendered boxes.
 */
import { createServer } from "http";
import { existsSync, readFileSync, statSync } from "fs";
import { extname, join, resolve, sep } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";
import { resolveSiteRoot } from "./interface_coverage.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SITE_ROOT = resolveSiteRoot(ROOT);
const PORT = Number(process.env.RESPONSIVE_MATRIX_PORT || 8797);
const BASE_ARG = process.argv[2];
const BASE = (BASE_ARG || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const WIDTHS = [320, 360, 390, 430, 768, 900, 901, 960, 1000, 1024, 1120, 1240, 1366, 1440, 1661, 1920];
const ROUTES = [
  { family: "home", path: "/" },
  { family: "deliverables", path: "/entregas/" },
  { family: "services_hub", path: "/servicos-obras-publicas/" },
  { family: "problems_hub", path: "/problemas-que-resolvemos/" },
  { family: "content_hub", path: "/conteudos/" },
  { family: "tools_hub", path: "/ferramentas/" },
  { family: "cases_hub", path: "/casos/" },
  { family: "article", path: "/conteudos/limite-aditivo-25-50-obra-publica/" },
  { family: "offer", path: "/diretoria-b2g/" },
  { family: "tool", path: "/ferramentas/diagnostico-defesa-margem/" },
  { family: "case", path: "/casos/aditivo-art125-demonstrativo/" },
  { family: "specialist", path: "/especialista/tiago-jun-sasaki/" },
];

if (!BASE_ARG && SITE_ROOT === ROOT) {
  throw new Error("responsive_matrix_requires_built_public_artifact:_site");
}

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
};

function startStaticServer() {
  const server = createServer((request, response) => {
    try {
      let urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
      if (urlPath.endsWith("/")) urlPath += "index.html";
      if (!urlPath) urlPath = "/index.html";
      const filePath = join(SITE_ROOT, urlPath);
      if (!filePath.startsWith(`${SITE_ROOT}${sep}`)
          || !existsSync(filePath)
          || statSync(filePath).isDirectory()) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      response.end(readFileSync(filePath));
    } catch (error) {
      response.writeHead(500);
      response.end(String(error?.message || error));
    }
  });
  return new Promise((done) => server.listen(PORT, "127.0.0.1", () => done(server)));
}

const server = BASE_ARG ? null : await startStaticServer();
const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
});
let browserClosed = false;
let noJsBrowser = null;
const failures = [];
const observations = {
  renderedChecks: 0,
  wordCandidates: 0,
  prices: 0,
  commercialPathChecks: 0,
  jsOffChecks: 0,
};

function viewportHeight(width) {
  if (width <= 430) return 844;
  if (width <= 768) return 1024;
  if (width <= 1024) return 768;
  if (width === 1661) return 939;
  return 900;
}

async function waitForStyles(page) {
  const ready = await page.waitForFunction(
    () => [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => {
      if (!link.sheet) return false;
      try {
        return link.sheet.cssRules.length > 0;
      } catch {
        return false;
      }
    }),
    { timeout: 15000 },
  ).then(() => true).catch(() => false);
  await new Promise((done) => setTimeout(done, 50));
  return ready;
}

async function renderedGeometry(page, route, width) {
  const response = await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const stylesReady = await waitForStyles(page);
  if (!response || response.status() >= 400) {
    return { errors: [{ code: "http_status", detail: response?.status() || 0 }] };
  }
  if (!stylesReady) {
    return { errors: [{ code: "stylesheet_unavailable", detail: route.path }] };
  }

  const metrics = await page.evaluate(() => {
    const visible = (element) => {
      if (!element || element.closest("[hidden],[aria-hidden='true'],[inert],.honeypot")) return false;
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden"
            || style.visibility === "collapse" || Number(style.opacity) === 0) return false;
      }
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const descriptor = (element) => [
      element.tagName.toLowerCase(),
      element.id ? `#${element.id}` : "",
      element.className ? `.${String(element.className).trim().replace(/\s+/g, ".")}` : "",
    ].join("").slice(0, 140);
    const lineTops = (range) => new Set(
      [...range.getClientRects()]
        .filter((box) => box.width > 0.5 && box.height > 0.5)
        .map((box) => Math.round(box.top * 2) / 2),
    );

    const root = document.documentElement;
    const overflowOffenders = root.scrollWidth > root.clientWidth + 1
      ? [...document.querySelectorAll("body *")]
        .filter((element) => {
          if (!visible(element)) return false;
          const style = getComputedStyle(element);
          if (style.position === "fixed" || element.closest(".table-wrap,.compare-scroll,.report-table-wrap")) return false;
          const box = element.getBoundingClientRect();
          return box.left < -1 || box.right > innerWidth + 1;
        })
        .slice(0, 4)
        .map((element) => ({ selector: descriptor(element), box: Math.round(element.getBoundingClientRect().width) }))
      : [];

    const starved = [...document.querySelectorAll("main p,main li,main h1,main h2,main h3,main h4,main th,main td,main dd,main strong")]
      .filter((element) => {
        if (!visible(element) || element.closest(".table-wrap,.compare-scroll,.report-table-wrap")) return false;
        const text = (element.innerText || "").replace(/\s+/g, " ").trim();
        if (text.length < 12) return false;
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.width < 48;
      })
      .slice(0, 4)
      .map((element) => ({
        selector: descriptor(element),
        width: Math.round(element.getBoundingClientRect().width),
        text: (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80),
      }));

    const normalWordBreaks = [];
    let wordCandidates = 0;
    const main = document.querySelector("main") || document.body;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && normalWordBreaks.length < 5; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !visible(parent)
          || parent.closest("code,pre,kbd,samp,[data-opaque-token],.opaque-token,.honeypot")) continue;
      const style = getComputedStyle(parent);
      const permitsMidWord = style.overflowWrap === "anywhere"
        || style.wordBreak === "break-all"
        || style.wordBreak === "break-word";
      if (!permitsMidWord) continue;
      for (const match of node.data.matchAll(/\p{L}{4,}/gu)) {
        wordCandidates += 1;
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const tops = lineTops(range);
        if (tops.size > 1) {
          normalWordBreaks.push({
            selector: descriptor(parent),
            word: match[0],
            lines: tops.size,
            width: Math.round(parent.getBoundingClientRect().width),
          });
          if (normalWordBreaks.length >= 5) break;
        }
      }
    }

    const prices = [];
    const pricePattern = /R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g;
    const priceWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = priceWalker.nextNode(); node; node = priceWalker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !visible(parent)) continue;
      for (const match of node.data.matchAll(pricePattern)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        prices.push({
          selector: descriptor(parent),
          text: match[0].replace(/\s+/g, " "),
          lines: lineTops(range).size,
        });
      }
    }

    const boxOf = (element) => {
      if (!visible(element)) return null;
      const box = element.getBoundingClientRect();
      return {
        width: Math.round(box.width * 10) / 10,
        height: Math.round(box.height * 10) / 10,
        href: (element.getAttribute("href") || "").trim(),
      };
    };
    const header = document.querySelector(".site-header");
    const headerStyle = header ? getComputedStyle(header) : null;
    const headerColor = headerStyle?.backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
    const headerAlpha = headerColor.length >= 4 ? headerColor[3] : 1;
    const desktopLinks = [...document.querySelectorAll(".desktop-nav a")]
      .map((element) => ({ text: element.textContent.trim(), box: boxOf(element) }))
      .filter(({ box }) => box);
    return {
      documentOverflow: root.scrollWidth > root.clientWidth + 1,
      overflowOffenders,
      starved,
      normalWordBreaks,
      wordCandidates,
      prices,
      wrappedPrices: prices.filter(({ lines }) => lines !== 1),
      header: header ? {
        position: headerStyle.position,
        alpha: headerAlpha,
        color: headerStyle.backgroundColor,
        box: boxOf(header),
      } : null,
      headerCta: boxOf(document.querySelector(".header-cta")),
      toggle: boxOf(document.querySelector(".menu-toggle")),
      desktopLinks,
      hiddenDeliverableFacts: [...document.querySelectorAll(".eight-hub__item dl,.eight-hub__common")]
        .filter((element) => !visible(element)).length,
    };
  });

  const errors = [];
  if (metrics.documentOverflow) errors.push({ code: "document_overflow", detail: metrics.overflowOffenders });
  if (metrics.starved.length) errors.push({ code: "column_starvation", detail: metrics.starved });
  if (metrics.normalWordBreaks.length) errors.push({ code: "normal_word_broken", detail: metrics.normalWordBreaks });
  if (metrics.wrappedPrices.length) errors.push({ code: "price_not_atomic", detail: metrics.wrappedPrices });
  if (route.family === "deliverables" && metrics.hiddenDeliverableFacts) {
    errors.push({ code: "deliverable_substance_hidden", detail: metrics.hiddenDeliverableFacts });
  }

  const atLeast44 = (box) => Boolean(box && box.width >= 44 && box.height >= 44);
  if (width > 900) {
    if (!atLeast44(metrics.headerCta) || !metrics.headerCta.href) {
      errors.push({ code: "header_cta_unavailable", detail: metrics.headerCta });
    }
    if (metrics.desktopLinks.length && metrics.desktopLinks.some(({ box }) => !atLeast44(box))) {
      errors.push({ code: "desktop_menu_target_below_44", detail: metrics.desktopLinks });
    }
  }
  if (!metrics.desktopLinks.length && !atLeast44(metrics.toggle)) {
    errors.push({ code: "menu_unavailable", detail: metrics.toggle });
  }

  if (metrics.toggle) {
    if (width === 390) {
      await page.focus(".menu-toggle");
      await page.keyboard.press("Enter");
    } else {
      await page.click(".menu-toggle");
    }
    const menu = await page.evaluate(() => {
      const visible = (element) => {
        if (!element || getComputedStyle(element).display === "none" || getComputedStyle(element).visibility === "hidden") return false;
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      };
      const boxOf = (element) => {
        if (!visible(element)) return null;
        const box = element.getBoundingClientRect();
        return {
          width: Math.round(box.width * 10) / 10,
          height: Math.round(box.height * 10) / 10,
          href: (element.getAttribute("href") || "").trim(),
          text: element.textContent.trim(),
        };
      };
      const toggle = document.querySelector(".menu-toggle");
      return {
        expanded: toggle?.getAttribute("aria-expanded") || "",
        cta: boxOf(document.querySelector(".mobile-nav .button")),
        links: [...document.querySelectorAll(".mobile-nav a")].map(boxOf).filter(Boolean),
      };
    });
    if (menu.expanded !== "true") errors.push({ code: "menu_did_not_open", detail: menu.expanded });
    if (!atLeast44(menu.cta) || !menu.cta.href) errors.push({ code: "mobile_menu_cta_unavailable", detail: menu.cta });
    const undersized = menu.links.filter((box) => !atLeast44(box));
    if (undersized.length) errors.push({ code: "mobile_menu_target_below_44", detail: undersized });
    if (width === 390) {
      await page.keyboard.press("Escape");
      const expanded = await page.$eval(".menu-toggle", (element) => element.getAttribute("aria-expanded"));
      if (expanded !== "false") errors.push({ code: "menu_escape_failed", detail: expanded });
    } else {
      await page.click(".menu-toggle");
    }
  }

  if ([390, 901, 1024, 1440].includes(width)) {
    const sticky = await page.evaluate(async () => {
      const header = document.querySelector(".site-header");
      if (!header) return { ghost: false, anchorCollision: null };
      window.scrollTo({ top: Math.min(360, document.documentElement.scrollHeight - innerHeight), behavior: "instant" });
      await new Promise((done) => setTimeout(done, 50));
      const headerBox = header.getBoundingClientRect();
      const style = getComputedStyle(header);
      const color = style.backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
      const alpha = color.length >= 4 ? color[3] : 1;
      const underlay = [...document.querySelectorAll("main *")].find((element) => {
        const elementStyle = getComputedStyle(element);
        if (["none", "contents"].includes(elementStyle.display)
            || elementStyle.visibility === "hidden"
            || Number(elementStyle.opacity) === 0
            || ["fixed", "sticky"].includes(elementStyle.position)) return false;
        const box = element.getBoundingClientRect();
        return box.width > 2 && box.height > 2
          && box.bottom > headerBox.top + 2 && box.top < headerBox.bottom - 2;
      });
      const ghost = ["sticky", "fixed"].includes(style.position)
        && headerBox.top <= 1 && alpha < 0.99 && Boolean(underlay);

      document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
      let anchorCollision = null;
      const anchor = [...document.querySelectorAll('main a[href^="#"]')]
        .map((link) => ({ link, target: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
        .find(({ target }) => target);
      if (anchor) {
        anchor.target.scrollIntoView({ block: "start", behavior: "instant" });
        await new Promise((done) => setTimeout(done, 50));
        const targetBox = anchor.target.getBoundingClientRect();
        const newHeaderBox = header.getBoundingClientRect();
        const maxScroll = document.documentElement.scrollHeight - innerHeight;
        if (targetBox.top < newHeaderBox.bottom - 1 && scrollY < maxScroll - 1
            && targetBox.top + scrollY > newHeaderBox.height + 1) {
          anchorCollision = {
            href: anchor.link.getAttribute("href"),
            targetTop: Math.round(targetBox.top),
            headerBottom: Math.round(newHeaderBox.bottom),
            rootScrollPadding: getComputedStyle(document.documentElement).scrollPaddingTop,
            targetScrollMargin: getComputedStyle(anchor.target).scrollMarginTop,
            scrollY: Math.round(scrollY),
            maxScroll: Math.round(maxScroll),
          };
        }
      }
      return { ghost, alpha, color: style.backgroundColor, anchorCollision };
    });
    if (sticky.ghost) errors.push({ code: "translucent_sticky_header_ghost", detail: sticky });
    if (sticky.anchorCollision) errors.push({ code: "sticky_header_anchor_collision", detail: sticky.anchorCollision });
  }

  observations.renderedChecks += 1;
  observations.wordCandidates += metrics.wordCandidates;
  observations.prices += metrics.prices.length;
  observations.commercialPathChecks += 1;
  return { errors, metrics };
}

const tasks = WIDTHS.flatMap((width) => ROUTES.map((route) => ({ route, width })));
let cursor = 0;

async function worker() {
  const page = await browser.newPage();
  try {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      await page.setViewport({ width: task.width, height: viewportHeight(task.width), deviceScaleFactor: 1 });
      try {
        const result = await renderedGeometry(page, task.route, task.width);
        for (const error of result.errors) failures.push({
          family: task.route.family,
          route: task.route.path,
          width: task.width,
          ...error,
        });
      } catch (error) {
        failures.push({
          family: task.route.family,
          route: task.route.path,
          width: task.width,
          code: "navigation_or_evaluation",
          detail: String(error?.message || error),
        });
      }
    }
  } finally {
    await page.close();
  }
}

try {
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, () => worker()));

  // Keep progressive-enhancement evidence independent from the long rendered
  // matrix. Chromium can retain a partially evicted stylesheet cache after
  // hundreds of navigations; a fresh process proves the shipped JS-off state.
  await browser.close();
  browserClosed = true;
  noJsBrowser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
  });
  for (const route of ROUTES) {
    const noJsPage = await noJsBrowser.newPage();
    await noJsPage.setJavaScriptEnabled(false);
    await noJsPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    try {
      const response = await noJsPage.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const stylesReady = await waitForStyles(noJsPage);
      if (!stylesReady) {
        failures.push({ family: route.family, route: route.path, width: 390, mode: "js-off", code: "stylesheet_unavailable", detail: route.path });
        continue;
      }
      const noJs = await noJsPage.evaluate(() => {
        const visibleBox = (element) => {
          if (!element) return null;
          for (let current = element; current; current = current.parentElement) {
            const style = getComputedStyle(current);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
          }
          const box = element.getBoundingClientRect();
          if (!box.width || !box.height) return null;
          return {
            width: Math.round(box.width * 10) / 10,
            height: Math.round(box.height * 10) / 10,
            href: (element.getAttribute("href") || "").trim(),
            text: element.textContent.trim(),
          };
        };
        return {
          headerCta: visibleBox(document.querySelector(".header-cta")),
          menuCta: visibleBox(document.querySelector(".mobile-nav .button")),
          navLinks: [...document.querySelectorAll(".mobile-nav a")].map(visibleBox).filter(Boolean),
          mainChars: ((document.querySelector("main") || document.body).innerText || "").replace(/\s+/g, " ").trim().length,
          hiddenDeliverableFacts: [...document.querySelectorAll(".eight-hub__item dl,.eight-hub__common")]
            .filter((element) => getComputedStyle(element).display === "none").length,
        };
      });
      const cta = noJs.headerCta || noJs.menuCta;
      if (!response || response.status() >= 400) {
        failures.push({ family: route.family, route: route.path, width: 390, mode: "js-off", code: "http_status", detail: response?.status() || 0 });
      }
      if (!cta || cta.width < 44 || cta.height < 44 || !cta.href) {
        failures.push({ family: route.family, route: route.path, width: 390, mode: "js-off", code: "js_off_commercial_cta_unavailable", detail: { headerCta: noJs.headerCta, menuCta: noJs.menuCta } });
      }
      const undersized = noJs.navLinks.filter((box) => box.width < 44 || box.height < 44);
      if (undersized.length) {
        failures.push({ family: route.family, route: route.path, width: 390, mode: "js-off", code: "js_off_menu_target_below_44", detail: undersized });
      }
      if (noJs.mainChars < 200) {
        failures.push({ family: route.family, route: route.path, width: 390, mode: "js-off", code: "js_off_substance_missing", detail: noJs.mainChars });
      }
      if (route.family === "deliverables" && noJs.hiddenDeliverableFacts) {
        failures.push({ family: route.family, route: route.path, width: 390, mode: "js-off", code: "js_off_deliverable_substance_hidden", detail: noJs.hiddenDeliverableFacts });
      }
      observations.jsOffChecks += 1;
    } finally {
      await noJsPage.close();
    }
  }
} finally {
  if (noJsBrowser) await noJsBrowser.close();
  if (!browserClosed) await browser.close();
  if (server) server.close();
}

if (failures.length) {
  console.error("RESPONSIVE_MATRIX_FAIL", JSON.stringify({ count: failures.length, failures }, null, 2));
  process.exit(1);
}
console.log("RESPONSIVE_MATRIX_OK", JSON.stringify({
  routes: ROUTES.length,
  widths: WIDTHS,
  ...observations,
}));
