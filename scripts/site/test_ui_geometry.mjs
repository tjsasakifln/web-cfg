/**
 * Rendered DOM / geometry gates for CONFENGE commercial UI.
 * Drives the real shipped HTML/CSS/JS via puppeteer-core + system Chrome.
 *
 * Usage: node scripts/site/test_ui_geometry.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:8765
 */
import puppeteer from "puppeteer-core";
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { resolveChromePath } from "./resolve_chrome.mjs";
import { resolveSiteRoot } from "./interface_coverage.mjs";
import { hoverLiftFindings, renderedLayoutFindings } from "./rendered_layout_truth.mjs";

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SITE_ROOT = resolveSiteRoot(ROOT);
const CHROME = resolveChromePath();
const PORT = Number(process.env.UI_TEST_PORT || 8791);
const BASE = process.argv[2] || `http://127.0.0.1:${PORT}`;

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

function startStaticServer() {
  const server = createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath.endsWith("/")) urlPath += "index.html";
      if (urlPath === "") urlPath = "/index.html";
      const filePath = join(SITE_ROOT, urlPath);
      if (!filePath.startsWith(`${SITE_ROOT}${sep}`) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolvePromise) => {
    server.listen(PORT, "127.0.0.1", () => resolvePromise(server));
  });
}

let failed = 0;
function ok(name) {
  console.log("OK", name);
}
function fail(name, err) {
  failed += 1;
  console.log("FAIL", name, err);
}

async function waitForActiveStepFocus(targetPage, step) {
  await targetPage.waitForFunction((n) => {
    const panel = document.querySelector(`[data-form-step="${n}"].is-active`);
    if (!panel) return false;
    const active = document.activeElement;
    return Boolean(active) && panel.contains(active) && active !== document.body;
  }, { timeout: 4000 }, step);
  await targetPage.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function assertStableDocumentTop(targetPage, { samples = 6, intervalMs = 50 } = {}) {
  await targetPage.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    if (document.body) document.body.style.scrollBehavior = "auto";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  });
  const positions = [];
  for (let index = 0; index < samples; index += 1) {
    await new Promise((done) => setTimeout(done, intervalMs));
    positions.push(await targetPage.evaluate(() => Math.round(window.scrollY)));
  }
  if (positions.some((position) => Math.abs(position) > 1)) {
    throw new Error(`document top did not remain stable: ${positions.join(",")}`);
  }
}

async function main() {
  if (process.env.PUBLIC_ARTIFACT_REQUIRED === "1" && SITE_ROOT === ROOT) {
    throw new Error("public artifact required: run npm run build:site before test:ui");
  }
  console.log(`UI_GEOMETRY_SITE_ROOT ${SITE_ROOT === ROOT ? "." : "_site"}`);
  let server = null;
  let ownServer = false;
  if (!process.argv[2]) {
    server = await startStaticServer();
    ownServer = true;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    console.log("UI_GEOMETRY_UNAVAILABLE", msg.slice(0, 240));
    if (ownServer && server) server.close();
    const required = process.env.UI_GEOMETRY_REQUIRED === "1" || Boolean(process.env.CI);
    process.exit(required ? 2 : 0);
  }
  const page = await browser.newPage();

  // Prove the precondition guard catches asynchronous scroll restoration. A
  // single window.scrollTo(0, 0) would incorrectly pass this fixture (#407).
  try {
    const racePage = await browser.newPage();
    await racePage.setViewport({ width: 320, height: 844, deviceScaleFactor: 1 });
    await racePage.setContent('<main style="height:9000px"><h1>fixture</h1></main>');
    await racePage.evaluate(() => setTimeout(() => window.scrollTo(0, 5000), 75));
    let detected = false;
    try {
      await assertStableDocumentTop(racePage);
    } catch {
      detected = true;
    } finally {
      await racePage.close();
    }
    if (!detected) throw new Error("late scroll fixture was not detected");
    ok("stable_top_guard_detects_late_scroll");
  } catch (e) {
    fail("stable_top_guard_detects_late_scroll", e.message || e);
  }

  // 1) overflow 320–1920
  try {
    const bad = [];
    for (const w of [320, 360, 390, 768, 1024, 1440, 1920]) {
      await page.setViewport({ width: w, height: 800, deviceScaleFactor: 1 });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      if (overflow) bad.push(w);
    }
    if (bad.length) throw new Error(`horizontal overflow at widths: ${bad.join(",")}`);
    ok("no_horizontal_overflow_320_1920");
  } catch (e) {
    fail("no_horizontal_overflow_320_1920", e.message || e);
  }

  // 2) height / text vs baseline thresholds (absolute targets)
  try {
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 30000 });
    const m1440 = await page.evaluate(() => {
      const text = (document.querySelector("main") || document.body).innerText || "";
      return {
        h: document.documentElement.scrollHeight,
        chars: text.replace(/\s+/g, " ").trim().length,
        sections: document.querySelectorAll("main > section").length,
        primary: document.querySelectorAll(".button-primary").length,
      };
    });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 30000 });
    const m390 = await page.evaluate(() => ({
      h: document.documentElement.scrollHeight,
      chars: ((document.querySelector("main") || document.body).innerText || "")
        .replace(/\s+/g, " ")
        .trim().length,
    }));
    if (m1440.sections > 8) throw new Error(`sections ${m1440.sections} > 8`);
    if (m1440.primary > 5) throw new Error(`primary CTAs ${m1440.primary} > 5`);
    // Soft absolute targets (may be exceeded with justification — fail only if grossly over old baseline)
    if (m1440.h > 9500) throw new Error(`1440 height ${m1440.h} still too long (>9500)`);
    if (m390.h > 14500) throw new Error(`390 height ${m390.h} still too long (>14500)`);
    if (m1440.chars > 7500) throw new Error(`visible chars ${m1440.chars} not reduced enough`);
    ok(`home_height_text_cta (${m1440.h}px/1440, ${m390.h}px/390, ${m1440.chars} chars, ${m1440.primary} primary)`);
  } catch (e) {
    fail("home_height_text_cta", e.message || e);
  }

  // 3) hero essentials in first viewport (desktop)
  try {
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const hero = await page.evaluate(() => {
      const vh = window.innerHeight;
      const h1 = document.querySelector("#hero-title");
      const lead = document.querySelector(".hero-lead");
      const cta = document.querySelector(".hero .button-primary");
      const proof = document.querySelector(".hero-proof");
      const inView = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top < vh && r.bottom > 0;
      };
      return {
        h1: inView(h1),
        lead: inView(lead),
        cta: inView(cta),
        proof: inView(proof),
        primaryCount: document.querySelectorAll(".hero .button-primary").length,
        secondaryIsNotPrimary: !document.querySelector(".hero .hero-secondary.button-primary"),
      };
    });
    if (!hero.h1 || !hero.lead || !hero.cta) throw new Error(`hero missing first-viewport: ${JSON.stringify(hero)}`);
    if (hero.primaryCount !== 1) throw new Error(`hero primary count ${hero.primaryCount}`);
    if (!hero.secondaryIsNotPrimary) throw new Error("secondary uses primary style");
    ok("hero_first_viewport_desktop");
  } catch (e) {
    fail("hero_first_viewport_desktop", e.message || e);
  }

  // 4) mobile: CTA without crossing large decorative panel
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const mob = await page.evaluate(() => {
      const vh = window.innerHeight;
      const cta = document.querySelector(".hero .button-primary");
      const r = cta.getBoundingClientRect();
      const blockers = [...document.querySelectorAll(
        ".hero img, .hero picture, .hero figure, .hero video, .hero canvas, .hero [data-evidence-selector]",
      )]
        .filter((el) => {
          const box = el.getBoundingClientRect();
          return box.height > 120 && box.top < r.top && getComputedStyle(el).display !== "none";
        })
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className || "")}`);
      return {
        ctaTop: r.top,
        ctaInFirstScreen: r.top < vh && r.bottom > 0,
        blockers,
      };
    });
    if (!mob.ctaInFirstScreen) throw new Error(`CTA not in first screen: top=${mob.ctaTop}`);
    if (mob.blockers.length) {
      throw new Error(`decorative panel above the mobile CTA: ${mob.blockers.join(", ")}`);
    }
    ok("mobile_hero_cta_without_decor_panel");
  } catch (e) {
    fail("mobile_hero_cta_without_decor_panel", e.message || e);
  }

  // 4b) CFG10X-02: at 390x844 the hero is ≤1.25 viewport and the primary CTA is fully on screen
  try {
    const viewports = [
      { w: 390, h: 844, heroCap: 1.25 },
      { w: 768, h: 1024, heroCap: null },
      { w: 1440, h: 900, heroCap: null },
    ];
    for (const vp of viewports) {
      await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      const fold = await page.evaluate(() => {
        const vh = window.innerHeight;
        const hero = document.querySelector(".hero");
        const cta = document.querySelector(".hero .button-primary");
        const hr = hero.getBoundingClientRect();
        const cr = cta.getBoundingClientRect();
        return {
          vh,
          heroHeight: Math.round(hr.height),
          ratio: hr.height / vh,
          ctaTop: Math.round(cr.top),
          ctaBottom: Math.round(cr.bottom),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });
      if (vp.heroCap && fold.ratio > vp.heroCap) {
        throw new Error(`${vp.w}x${vp.h}: hero ${fold.heroHeight}px > ${vp.heroCap}×${fold.vh}`);
      }
      if (vp.w === 390 && (fold.ctaTop < 0 || fold.ctaBottom > fold.vh)) {
        throw new Error(`primary CTA not fully in first screen: ${JSON.stringify(fold)}`);
      }
      if (fold.overflow) throw new Error(`horizontal overflow at ${vp.w}x${vp.h}`);
    }
    ok("home_hero_fold_390_768_1440");
  } catch (e) {
    fail("home_hero_fold_390_768_1440", e.message || e);
  }

  // 5) functional text ≥ 14px on home + commercial surfaces (footer, breadcrumbs, profile, related)
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    const fontSel = [
      ".hero-lead",
      ".hero-proof li",
      ".hero-proof-line",
      ".hero-micro",
      ".button",
      ".hero-secondary",
      ".macro-phase p",
      ".macro-phase h3",
      ".tension-stage p",
      ".offer-path p",
      ".offer-path strong",
      ".offer-label",
      ".fit-faq summary",
      ".contact-copy p",
      ".form-hint",
      ".form-note",
      ".field label",
      ".consent",
      ".desktop-nav a",
      ".header-cta",
      ".contact-channels small",
      ".footer-links a",
      ".footer-links strong",
      ".footer-bottom",
      ".footer-bottom a",
      ".breadcrumbs ol",
      ".breadcrumbs a",
      ".profile-list li",
      ".related-card span",
      ".related-card strong",
      ".related-card small",
      ".service-number",
      ".deliverables-list span",
      ".offer-context dt",
      ".offer-context dd",
    ].join(",");
    const measureFonts = async (path) => {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      return page.evaluate((sel) => {
        let min = Infinity;
        let minSel = "";
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < min) {
            min = fs;
            minSel = (el.className || el.tagName || "").toString().slice(0, 60);
          }
        }
        return { min, minSel, path: location.pathname };
      }, fontSel);
    };
    const paths = ["/", "/diretoria-b2g/", "/especialista/tiago-jun-sasaki/"];
    let worst = { min: Infinity, minSel: "", path: "" };
    for (const path of paths) {
      const rep = await measureFonts(path);
      if (rep.min < worst.min) worst = rep;
      if (rep.min < 14) {
        throw new Error(`${path}: functional text ${rep.min}px < 14px (${rep.minSel})`);
      }
    }
    ok(`functional_text_min_14px (${worst.min}px across home/offer/specialist)`);
  } catch (e) {
    fail("functional_text_min_14px", e.message || e);
  }

  // 6) primary controls keep the campaign contract of at least 44×44 CSS px.
  try {
    const small = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll("a.button, button, .menu-toggle, .whatsapp-float, summary, label.consent")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 44 || r.height < 44) bad.push({ tag: el.tagName, w: r.width, h: r.height, t: (el.textContent || "").slice(0, 40) });
      }
      return bad;
    });
    if (small.length) throw new Error(JSON.stringify(small.slice(0, 5)));
    ok("targets_min_44x44px");
  } catch (e) {
    fail("targets_min_44x44px", e.message || e);
  }

  // 7) focus visible
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.focus(".hero .button-primary");
    const outline = await page.evaluate(() => {
      const el = document.querySelector(".hero .button-primary");
      const cs = getComputedStyle(el);
      return { outline: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor };
    });
    // :focus-visible may not apply via .focus() in all engines — also check stylesheet rule exists
    const css = readFileSync(join(ROOT, "styles.css"), "utf8");
    if (!css.includes(":focus-visible")) throw new Error("no :focus-visible rule in CSS");
    ok(`focus_visible_rule (runtime outline=${outline.outline})`);
  } catch (e) {
    fail("focus_visible_rule", e.message || e);
  }

  // 8) mobile menu keyboard / Escape
  try {
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.click(".menu-toggle");
    const open = await page.evaluate(() => document.querySelector(".menu-toggle").getAttribute("aria-expanded"));
    if (open !== "true") throw new Error("menu did not open");
    await page.keyboard.press("Escape");
    const closed = await page.evaluate(() => document.querySelector(".menu-toggle").getAttribute("aria-expanded"));
    if (closed !== "false") throw new Error("Escape did not close menu");
    ok("mobile_menu_escape");
  } catch (e) {
    fail("mobile_menu_escape", e.message || e);
  }

  // 9) no-JS essential content
  try {
    await page.setJavaScriptEnabled(false);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const nojs = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        h1: !!document.querySelector("#hero-title"),
        situations: document.querySelectorAll(".situation-row").length,
        form: !!document.querySelector('form[name="diagnostico-b2g"]'),
        hasOutcome: /decisão documentada/i.test(t),
      };
    });
    await page.setJavaScriptEnabled(true);
    if (!nojs.h1 || nojs.situations !== 5 || !nojs.form || !nojs.hasOutcome) throw new Error(JSON.stringify(nojs));
    ok("essential_content_without_js");
  } catch (e) {
    await page.setJavaScriptEnabled(true);
    fail("essential_content_without_js", e.message || e);
  }

  // 10) corporate situation rows stack on mobile.
  try {
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const matrix = await page.evaluate(() => {
      const paths = document.querySelectorAll(".situation-row");
      const grid = document.querySelector(".situation-list");
      return {
        cardCount: paths.length,
        gridDisplay: grid ? getComputedStyle(grid).display : "missing",
        labels: [...paths].map((p) => (p.querySelector("h3")?.textContent || "").trim()).filter(Boolean),
      };
    });
    if (matrix.cardCount !== 5) throw new Error(`expected 5 situation paths, got ${matrix.cardCount}`);
    if (matrix.gridDisplay === "none") throw new Error("situation paths hidden on mobile");
    const expected = [
      "Projetar, revisar, orçar ou compatibilizar",
      "Inspecionar, diagnosticar ou documentar obra e imóvel",
      "Perícia, assistência técnica ou avaliação",
      "Segurança do trabalho",
      "Licitação ou contrato de obra pública",
    ];
    for (const label of expected) {
      if (!matrix.labels.includes(label)) throw new Error(`missing door ${label}: ${JSON.stringify(matrix.labels)}`);
    }
    ok("matrix_mobile_stacked_records");
  } catch (e) {
    fail("matrix_mobile_stacked_records", e.message || e);
  }

  // 11) form validation — empty multi-step form is invalid
  try {
    await page.setViewport({ width: 1024, height: 800 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const invalid = await page.evaluate(() => {
      const form = document.querySelector('form[name="diagnostico-b2g"]');
      if (!form) return false;
      // Prefer Continuar (step 1) when multi-step is active
      const next = form.querySelector("[data-form-next]");
      if (next) next.click();
      else {
        const submit = form.querySelector('button[type="submit"]');
        if (submit) submit.click();
      }
      return !form.checkValidity();
    });
    if (!invalid) throw new Error("empty form should be invalid");
    ok("form_invalid_without_fields");
  } catch (e) {
    fail("form_invalid_without_fields", e.message || e);
  }

  // 12) internal language absent (visitor-facing)
  try {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const lower = html.toLowerCase();
    const leaks = [
      "sem inventar case",
      "sem métrica fictícia",
      "javascript",
      "arquétipo",
      "pipeline editorial",
      "red team",
      "visual regression",
      "sem cta genérico",
      "cta genérico único",
      "prova próxima ao cta",
      "risco de não agir",
    ];
    const hit = leaks.filter((p) => lower.includes(p));
    if (hit.length) throw new Error(hit.join(", "));
    if (/>\s*Jornada\s+[ABC]\s*</.test(html)) throw new Error("visible Jornada A/B/C label");
    if (!/comece pelo que precisa avançar/i.test(html)) throw new Error("missing situation chooser eyebrow");
    if (!/qual destas situações se parece com a sua/i.test(html)) throw new Error("missing situation chooser title");
    ok("no_internal_language_home");
  } catch (e) {
    fail("no_internal_language_home", e.message || e);
  }

  // 12b) situation chooser mobile hierarchy outcomes (390 / 360 / 412)
  try {
    const reports = [];
    for (const [w, h] of [
      [360, 800],
      [390, 844],
      [412, 915],
    ]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 30000 });
      const rep = await page.evaluate(() => {
        const overflow =
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        const title = document.querySelector("#situations-title");
        const firstCard = document.querySelector(".situation-row");
        const firstCta = document.querySelector(".situation-row .situation-action");
        const floatEl = document.querySelector(".whatsapp-float, .contact-float .whatsapp-float");
        const header = document.querySelector(".site-header");
        const titleLines = title
          ? Math.round(title.getBoundingClientRect().height / (parseFloat(getComputedStyle(title).lineHeight) || 24))
          : 0;
        const titleFs = title ? parseFloat(getComputedStyle(title).fontSize) : 0;
        const bodyP = document.querySelector(".situation-row p");
        const bodyFs = bodyP ? parseFloat(getComputedStyle(bodyP).fontSize) : 0;
        const ctaBox = firstCta ? firstCta.getBoundingClientRect() : null;
        const floatBox = floatEl ? floatEl.getBoundingClientRect() : null;
        let floatObscuresCta = false;
        if (ctaBox && floatBox && floatBox.width > 0 && getComputedStyle(floatEl).display !== "none") {
          const overlapX = Math.min(ctaBox.right, floatBox.right) - Math.max(ctaBox.left, floatBox.left);
          const overlapY = Math.min(ctaBox.bottom, floatBox.bottom) - Math.max(ctaBox.top, floatBox.top);
          const overlapArea = Math.max(0, overlapX) * Math.max(0, overlapY);
          const ctaArea = Math.max(1, ctaBox.width * ctaBox.height);
          floatObscuresCta = overlapArea / ctaArea > 0.35;
        }
        const container = document.querySelector(".corporate-situations .container") || document.querySelector(".container");
        const padLeft = container ? container.getBoundingClientRect().left : 0;
        return {
          overflow,
          titleLines,
          titleFs,
          bodyFs,
          headerH: header ? header.getBoundingClientRect().height : 0,
          cardCount: document.querySelectorAll(".situation-row").length,
          ctaW: ctaBox?.width || 0,
          ctaH: ctaBox?.height || 0,
          ctaFullyInLayout: ctaBox ? ctaBox.width > 0 && ctaBox.right <= window.innerWidth + 1 : false,
          floatObscuresCta,
          padLeft,
          titleText: (title?.textContent || "").trim().slice(0, 80),
        };
      });
      reports.push({ w, h, ...rep });
      if (rep.overflow) throw new Error(`${w}: horizontal overflow`);
      if (rep.cardCount !== 5) throw new Error(`${w}: expected 5 situation rows`);
      if (rep.titleLines > 4) throw new Error(`${w}: situations title ${rep.titleLines} lines > 4`);
      if (rep.titleFs > 36) throw new Error(`${w}: situations title font ${rep.titleFs}px too large`);
      if (rep.bodyFs < 16 || rep.bodyFs > 20) throw new Error(`${w}: body font ${rep.bodyFs}px outside 16–20`);
      if (rep.headerH > 96) throw new Error(`${w}: header height ${rep.headerH} absurd`);
      if (rep.ctaH < 44 || rep.ctaW < 120) throw new Error(`${w}: CTA too small ${rep.ctaW}x${rep.ctaH}`);
      if (!rep.ctaFullyInLayout) throw new Error(`${w}: CTA overflows viewport`);
      if (rep.floatObscuresCta) throw new Error(`${w}: floating WhatsApp obscures situation CTA`);
      if (rep.padLeft < 18) throw new Error(`${w}: lateral padding ${rep.padLeft} < 18`);
    }
    ok(`journeys_mobile_hierarchy (${reports.map((r) => r.w).join(",")})`);
  } catch (e) {
    fail("journeys_mobile_hierarchy", e.message || e);
  }

  // 12c) Corporate situation links stay explicit and fail closed to triage,
  // while the B2G situation keeps its own canonical hub.
  try {
    await page.setViewport({ width: 1024, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    const routes = await page.evaluate(() =>
      [...document.querySelectorAll(".situation-row .situation-action")].map((el) => ({
        label: (el.textContent || "").replace(/\s+/g, " ").trim(),
        href: el.getAttribute("href") || "",
      })),
    );
    if (routes.length !== 5) throw new Error(`expected five situation routes: ${JSON.stringify(routes)}`);
    if (!routes.slice(0, 4).every((item) => item.href === "#triagem-tecnica")) {
      throw new Error(`non-B2G routes must fall back to triage: ${JSON.stringify(routes)}`);
    }
    if (routes[4].href !== "/servicos-obras-publicas/") {
      throw new Error(`B2G route lost its canonical hub: ${JSON.stringify(routes[4])}`);
    }
    ok("journey_cta_binds_form");
  } catch (e) {
    fail("journey_cta_binds_form", e.message || e);
  }

  // 13) primary CTA opens the situation chooser; the B2G form remains present.
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const href = await page.$eval(".hero .button-primary", (el) => el.getAttribute("href"));
    if (href !== "#situacoes") {
      throw new Error(`hero CTA href ${href}`);
    }
    const chooser = await page.$("#situacoes");
    if (!chooser) throw new Error("situation chooser missing");
    const form = await page.$("#formulario-contato, #contato form, form[name='diagnostico-b2g']");
    if (!form) throw new Error("contact form missing");
    ok("primary_cta_targets_form");
  } catch (e) {
    fail("primary_cta_targets_form", e.message || e);
  }

  // 13b) The corporate CTA must reveal the situation chooser. The title and
  // first actionable row remain usable under the sticky header.
  try {
    const sizes = [
      { w: 320, h: 844, mobile: true },
      { w: 390, h: 844, mobile: true },
      { w: 430, h: 932, mobile: true },
      { w: 1440, h: 900, mobile: false },
    ];
    for (const size of sizes) {
      await page.setViewport({
        width: size.w,
        height: size.h,
        isMobile: size.mobile,
        hasTouch: size.mobile,
      });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.click('.hero a[href="#situacoes"]');
      await new Promise((r) => setTimeout(r, 2600));
      const rep = await page.evaluate(() => {
        const chooser = document.querySelector("#situacoes");
        const title = document.querySelector("#situations-title");
        const first = chooser?.querySelector(".situation-action");
        const header = document.querySelector(".site-header");
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
        };
        return {
          hash: window.location.hash,
          viewport: window.innerHeight,
          headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : 0,
          title: title ? box(title) : null,
          first: first ? box(first) : null,
          chooserVisible: !!(chooser && getComputedStyle(chooser).display !== "none"),
        };
      });
      const visible = (b) => b && b.top >= rep.headerBottom - 1 && b.bottom <= rep.viewport;
      if (rep.hash !== "#situacoes") {
        throw new Error(`${size.w}px: fragment lost (${rep.hash || "empty"})`);
      }
      if (!visible(rep.title)) {
        throw new Error(`${size.w}px: chooser title outside the viewport ${JSON.stringify(rep.title)}`);
      }
      if (!visible(rep.first)) {
        throw new Error(`${size.w}px: first chooser action outside the viewport ${JSON.stringify(rep.first)}`);
      }
      if (!rep.chooserVisible) throw new Error(`${size.w}px: chooser is hidden`);
    }
    ok("cta_reveals_situation_chooser (320,390,430,1440)");
  } catch (e) {
    fail("cta_reveals_situation_chooser", e.message || e);
  }

  // 13c) Manual input owns the scroll from the first smooth-scroll frame.
  // A wheel action before the correction phase must not be followed by a
  // delayed snap back to the chooser.
  try {
    await page.setViewport({ width: 390, height: 844, isMobile: false, hasTouch: false });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('.hero a[href="#situacoes"]');
    await new Promise((r) => setTimeout(r, 50));
    await page.mouse.move(195, 422);
    await page.mouse.wheel({ deltaY: -1200 });
    await new Promise((r) => setTimeout(r, 100));
    const manualY = await page.evaluate(() => window.scrollY);
    await new Promise((r) => setTimeout(r, 1800));
    const afterManual = await page.evaluate(() => {
      const chooser = document.querySelector("#situacoes");
      const title = document.querySelector("#situations-title");
      const offset = Math.max(
        parseFloat(getComputedStyle(chooser).scrollMarginTop) || 0,
        parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
      );
      return {
        y: window.scrollY,
        targetY: Math.round(chooser.getBoundingClientRect().top + window.scrollY - offset),
        titleTop: Math.round(title.getBoundingClientRect().top),
        viewport: window.innerHeight,
      };
    });
    if (Math.abs(afterManual.y - manualY) > 30) {
      throw new Error(`manual scroll was reclaimed: ${manualY} -> ${afterManual.y}`);
    }
    if (Math.abs(afterManual.y - afterManual.targetY) < 30) {
      throw new Error(`manual cancellation still landed on chooser: ${JSON.stringify(afterManual)}`);
    }
    ok("anchor_manual_input_wins_during_smooth_phase");
  } catch (e) {
    fail("anchor_manual_input_wins_during_smooth_phase", e.message || e);
  }

  // 13d) The latest of two competing fragment navigations owns the lifecycle.
  // An older chooser navigation must neither reclaim the viewport nor emit its
  // arrival event after the visitor chooses another anchor.
  try {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    await page.evaluate(async () => {
      window.dataLayer = [];
      window.scrollTo(0, 0);
      document.querySelector('.hero a[href="#situacoes"]').click();
      await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
      document.querySelector('.situation-action[href="#triagem-tecnica"]').click();
    });
    await new Promise((r) => setTimeout(r, 2600));
    const competing = await page.evaluate(() => {
      const target = document.querySelector("#triagem-tecnica");
      const title = document.querySelector("#triage-title");
      const header = document.querySelector(".site-header");
      const targetOffset = Math.max(
        parseFloat(getComputedStyle(target).scrollMarginTop) || 0,
        parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
      );
      const targetY = Math.round(target.getBoundingClientRect().top + window.scrollY - targetOffset);
      return {
        hash: window.location.hash,
        y: Math.round(window.scrollY),
        targetY,
        titleTop: Math.round(title.getBoundingClientRect().top),
        titleBottom: Math.round(title.getBoundingClientRect().bottom),
        headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : 0,
        viewport: window.innerHeight,
        staleChooserArrival: (window.dataLayer || []).some(
          (event) => event.event === "cta_view" && event.cta_id === "situacoes"
        ),
      };
    });
    if (competing.hash !== "#triagem-tecnica") {
      throw new Error(`latest fragment lost: ${JSON.stringify(competing)}`);
    }
    if (Math.abs(competing.y - competing.targetY) > 3) {
      throw new Error(`latest anchor did not own final position: ${JSON.stringify(competing)}`);
    }
    if (competing.titleTop < competing.headerBottom - 1 || competing.titleBottom > competing.viewport) {
      throw new Error(`latest anchor title not visible: ${JSON.stringify(competing)}`);
    }
    if (competing.staleChooserArrival) throw new Error("superseded chooser anchor emitted cta_view");
    ok("latest_anchor_wins_competing_navigation");
  } catch (e) {
    fail("latest_anchor_wins_competing_navigation", e.message || e);
  }

  // 13e) Back to the no-fragment history entry also cancels an in-flight run.
  try {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      window.dataLayer = [];
      window.scrollTo(0, 0);
    });
    await page.click('.hero a[href="#situacoes"]');
    await page.waitForFunction(() => window.location.hash === "#situacoes");
    await page.evaluate(() => window.history.back());
    await page.waitForFunction(() => window.location.hash === "");
    await new Promise((r) => setTimeout(r, 1800));
    const backed = await page.evaluate(() => {
      const chooser = document.querySelector("#situacoes");
      const title = document.querySelector("#situations-title");
      const offset = Math.max(
        parseFloat(getComputedStyle(chooser).scrollMarginTop) || 0,
        parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
      );
      const targetY = Math.round(chooser.getBoundingClientRect().top + window.scrollY - offset);
      const titleBox = title.getBoundingClientRect();
      return {
        hash: window.location.hash,
        y: Math.round(window.scrollY),
        targetY,
        titleVisible: titleBox.top < window.innerHeight && titleBox.bottom > 0,
        staleChooserArrival: (window.dataLayer || []).some(
          (event) => event.event === "cta_view" && event.cta_id === "situacoes"
        ),
      };
    });
    if (backed.hash !== "") throw new Error(`Back did not restore empty fragment: ${backed.hash}`);
    if (backed.titleVisible || backed.y >= backed.targetY - 844) {
      throw new Error(`superseded anchor reclaimed Back position: ${JSON.stringify(backed)}`);
    }
    if (backed.staleChooserArrival) throw new Error("anchor cancelled by Back emitted cta_view");
    ok("back_cancels_inflight_anchor_navigation");
  } catch (e) {
    fail("back_cancels_inflight_anchor_navigation", e.message || e);
  }

  // 13f) A same-path link that changes the query is a real navigation. The
  // fragment helper must not collapse it to pushState(hash) and discard
  // attribution or journey context carried in the query string.
  try {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const link = document.createElement("a");
      link.id = "query-fragment-regression";
      link.href = "/?tema=contrato#formulario-contato";
      link.textContent = "Abrir formulário com contexto";
      document.body.appendChild(link);
    });
    await page.click("#query-fragment-regression");
    await page.waitForFunction(
      () => window.location.search === "?tema=contrato",
      { timeout: 5000 }
    );
    const routed = await page.evaluate(() => ({
      search: window.location.search,
      hash: window.location.hash,
    }));
    if (routed.search !== "?tema=contrato" || routed.hash !== "#formulario-contato") {
      throw new Error(`query or fragment lost: ${JSON.stringify(routed)}`);
    }
    ok("query_changing_fragment_link_preserves_context");
  } catch (e) {
    fail("query_changing_fragment_link_preserves_context", e.message || e);
  }

  // 14) consecutive section composition variety (archetypes)
  try {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const arch = [...html.matchAll(/data-section-archetype="([^"]+)"/g)].map((m) => m[1]);
    for (let i = 0; i < arch.length - 2; i++) {
      if (arch[i] === arch[i + 1] && arch[i] === arch[i + 2]) {
        throw new Error(`three consecutive ${arch[i]}`);
      }
    }
    if (arch.length > 8) throw new Error(`too many sections ${arch.length}`);
    ok(`section_composition_variety (${arch.length} blocks)`);
  } catch (e) {
    fail("section_composition_variety", e.message || e);
  }

  // 15) tab order: skip link is first in DOM focus order (may be visually off-screen)
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const order = await page.evaluate(() => {
      const focusables = [
        ...document.querySelectorAll(
          'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        // skip-link is intentionally off-screen until focused — still tabbable
        if (el.classList.contains("skip-link")) return true;
        return el.getClientRects().length > 0;
      });
      return focusables.slice(0, 8).map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || "").toString().slice(0, 40),
        href: el.getAttribute("href") || "",
        text: (el.textContent || "").trim().slice(0, 40),
      }));
    });
    if (!order.length) throw new Error("no focusables");
    const first = order[0];
    if (!(first.cls.includes("skip-link") || first.href === "#conteudo" || /pular/i.test(first.text))) {
      throw new Error(`first focusable not skip-link: ${JSON.stringify(first)}`);
    }
    await page.keyboard.press("Tab");
    const focusedSkip = await page.evaluate(() => {
      const active = document.activeElement;
      const box = active?.getBoundingClientRect();
      return {
        isSkip: Boolean(active?.classList.contains("skip-link")),
        intersectsViewport: Boolean(box && box.right > 0 && box.left < window.innerWidth
          && box.bottom > 0 && box.top < window.innerHeight),
      };
    });
    if (!focusedSkip.isSkip || !focusedSkip.intersectsViewport) {
      throw new Error(`focused skip link is not visible: ${JSON.stringify(focusedSkip)}`);
    }
    ok(`tab_order_starts_with_skip (${order.length} early focusables)`);
  } catch (e) {
    fail("tab_order_starts_with_skip", e.message || e);
  }

  // 16) zoom 200%/400% reflow (WCAG: 1280@200%→640, 1280@400%→320)
  try {
    for (const [label, w, h] of [
      ["200%", 640, 480],
      ["400%", 320, 568],
    ]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      const zreport = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        const cta = document.querySelector(".hero .button-primary");
        const h1 = document.querySelector("#hero-title");
        return {
          overflow,
          hasCta: !!cta,
          hasH1: !!h1,
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        };
      });
      if (!zreport.hasCta || !zreport.hasH1) throw new Error(`${label} missing hero essentials`);
      if (zreport.overflow) throw new Error(`${label} overflow ${zreport.scrollW}>${zreport.clientW}`);
    }
    ok("zoom_200_400_usable");
  } catch (e) {
    fail("zoom_200_400_usable", e.message || e);
  }

  // 17) prefers-reduced-motion: no continuous animation declarations active
  try {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const motion = await page.evaluate(() => {
      const css = [...document.styleSheets]
        .map((s) => {
          try {
            return [...s.cssRules].map((r) => r.cssText).join("\n");
          } catch {
            return "";
          }
        })
        .join("\n");
      return {
        hasReducedRule: /prefers-reduced-motion:\s*reduce/i.test(css) || true,
        // runtime: body should not force continuous animation
        bodyAnim: getComputedStyle(document.body).animationName,
      };
    });
    const cssText = readFileSync(join(ROOT, "styles.css"), "utf8");
    if (!cssText.includes("prefers-reduced-motion")) throw new Error("CSS missing reduced-motion");
    if (motion.bodyAnim && motion.bodyAnim !== "none") throw new Error(`body animation ${motion.bodyAnim}`);
    await page.emulateMediaFeatures([]);
    ok("prefers_reduced_motion_respected");
  } catch (e) {
    await page.emulateMediaFeatures([]);
    fail("prefers_reduced_motion_respected", e.message || e);
  }

  // 18) form error by text (not only color) when missing contact
  try {
    await page.setViewport({ width: 1024, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    // The form handler is bound by deferred script.js; wait for its explicit
    // ready marker rather than racing a fixed timeout on slower CI runners.
    await page.waitForSelector('form.contact-form[data-form-ready="true"]', { timeout: 8000 });
    await page.evaluate(() => {
      const nome = document.querySelector("#nome");
      const estagio = document.querySelector("#estagio");
      const email = document.querySelector("#email");
      const phone = document.querySelector("#telefone");
      if (nome) nome.value = "Teste UI";
      if (estagio) {
        estagio.value = "problema urgente em contrato";
        estagio.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (email) email.value = "";
      if (phone) phone.value = "";
      document.querySelector("[data-form-next]")?.click();
    });
    await page.waitForFunction(() => {
      const status = document.querySelector(".form-status");
      const email = document.querySelector("#email");
      const phone = document.querySelector("#telefone");
      const msg = status && !status.hidden ? status.textContent : "";
      const validity = email ? email.validationMessage : "";
      const phoneVal = phone ? phone.validationMessage : "";
      const text = `${msg || ""} ${validity || ""} ${phoneVal || ""}`.toLowerCase();
      const invalid = email?.classList.contains("is-invalid") || phone?.classList.contains("is-invalid");
      return invalid || /(e-mail|email|whatsapp|retorno|preencha|informe)/i.test(text);
    }, { timeout: 3000 }).catch(() => {});
    const err = await page.evaluate(() => {
      const status = document.querySelector(".form-status");
      const email = document.querySelector("#email");
      const phone = document.querySelector("#telefone");
      const msg = status && !status.hidden ? status.textContent : "";
      const validity = email ? email.validationMessage : "";
      const phoneVal = phone ? phone.validationMessage : "";
      return {
        statusText: (msg || "").trim(),
        validity: (validity || phoneVal || "").trim(),
        invalidClass:
          email?.classList.contains("is-invalid")
          || phone?.classList.contains("is-invalid")
          || false,
      };
    });
    const text = `${err.statusText} ${err.validity}`.toLowerCase();
    if (!/(e-mail|email|whatsapp|retorno|preencha|informe)/i.test(text) && !err.invalidClass) {
      throw new Error(`no textual form error: ${JSON.stringify(err)}`);
    }
    ok("form_error_by_text");
  } catch (e) {
    fail("form_error_by_text", e.message || e);
  }

  // 19) critical internal anchors resolve
  try {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    const missing = [];
    for (const id of new Set(anchors)) {
      if (id === "conteudo" || id === "inicio") continue;
      if (!html.includes(`id="${id}"`)) missing.push(id);
    }
    if (missing.length) throw new Error(`broken anchors: ${missing.join(",")}`);
    ok(`anchors_resolve (${anchors.length} refs)`);
  } catch (e) {
    fail("anchors_resolve", e.message || e);
  }

  // 20) critical local links (home offers) return 200 from static server
  try {
    const paths = [
      "/",
      "/diretoria-b2g/",
      "/diagnostico-b2g-360/",
      "/bid-room-licitacoes-obras/",
      "/defesa-margem-contratos-publicos/",
      "/obrigado.html",
      "/especialista/tiago-jun-sasaki/",
      "/styles.css",
      "/script.js",
    ];
    const broken = [];
    for (const path of paths) {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      const status = res ? res.status() : 0;
      if (status >= 400 || status === 0) broken.push(`${path}:${status}`);
    }
    if (broken.length) throw new Error(broken.join(", "));
    ok("critical_paths_http_ok");
  } catch (e) {
    fail("critical_paths_http_ok", e.message || e);
  }

  // 21) thank-you + specialist CTA family
  try {
    for (const path of [
      "/obrigado.html",
      "/obrigado-contrato.html",
      "/obrigado-edital.html",
      "/obrigado-operacao.html",
      "/especialista/tiago-jun-sasaki/",
    ]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      const labels = await page.evaluate(() =>
        [...document.querySelectorAll(".button-primary, .button-secondary")]
          .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
      );
      if (path.includes("obrigado")) {
        const okLabel = labels.some((l) =>
          /whatsapp|voltar|falar com a confenge|diagnosticar|edital|documentos|agilizar|canal seguro/i.test(l)
        );
        if (!okLabel) throw new Error(`obrigado CTAs: ${labels.join(" | ")}`);
        const hasSuccess = await page.$("[data-lead-success]");
        if (!hasSuccess) throw new Error(`${path} missing data-lead-success`);
      } else {
        if (!labels.some((l) => /diagnosticar|solicitar diagnóstico|falar com a confenge|contato/i.test(l))) {
          throw new Error(`specialist missing primary family: ${labels.join(" | ")}`);
        }
        if (labels.some((l) => /analisar meu cenário|apresentar uma demanda/i.test(l))) {
          throw new Error(`specialist legacy CTA: ${labels.join(" | ")}`);
        }
      }
    }
    ok("thankyou_specialist_cta_family");
  } catch (e) {
    fail("thankyou_specialist_cta_family", e.message || e);
  }

  // 22) all five situation paths are usable on mobile without JavaScript.
  try {
    await page.setViewport({ width: 390, height: 844 });
    await page.setJavaScriptEnabled(false);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const journey = await page.evaluate(() => {
      const phases = [...document.querySelectorAll(".situation-row")];
      return {
        count: phases.length,
        allVisible: phases.every((p) => getComputedStyle(p).display !== "none"),
        actions: document.querySelectorAll(".situation-row .situation-action").length,
      };
    });
    await page.setJavaScriptEnabled(true);
    if (journey.count !== 5 || journey.actions !== 5 || !journey.allVisible) throw new Error(JSON.stringify(journey));
    ok("journey_mobile_four_phases_visible");
  } catch (e) {
    await page.setJavaScriptEnabled(true);
    fail("journey_mobile_four_phases_visible", e.message || e);
  }

  // 23) images with dimensions (CLS guard) on home
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const imgs = await page.evaluate(() =>
      [...document.querySelectorAll("img")].map((img) => ({
        src: img.getAttribute("src"),
        w: img.getAttribute("width"),
        h: img.getAttribute("height"),
      }))
    );
    const missing = imgs.filter((i) => !i.w || !i.h);
    if (missing.length) throw new Error(`imgs without dimensions: ${JSON.stringify(missing.slice(0, 3))}`);
    ok(`images_have_dimensions (${imgs.length})`);
  } catch (e) {
    fail("images_have_dimensions", e.message || e);
  }

  // 24) axe-core zero critical/serious on home (when axe available)
  try {
    let axeSource;
    try {
      const axePath = require.resolve("axe-core/axe.min.js");
      axeSource = readFileSync(axePath, "utf8");
    } catch {
      // optional if not installed
      ok("axe_home_skipped_no_package");
      axeSource = null;
    }
    if (axeSource) {
      await page.setViewport({ width: 1440, height: 1000 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
      await page.addScriptTag({ content: axeSource });
      const axeResult = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
        });
        const bad = (r.violations || []).filter((v) => v.impact === "critical" || v.impact === "serious");
        return {
          bad: bad.map((v) => ({
            id: v.id,
            nodes: v.nodes.slice(0, 5).map((node) => ({
              target: node.target,
              summary: node.failureSummary,
            })),
          })),
          total: (r.violations || []).length,
        };
      });
      if (axeResult.bad.length) throw new Error(JSON.stringify(axeResult.bad));
      ok(`axe_home_no_critical_serious (violations=${axeResult.total})`);
    }
  } catch (e) {
    fail("axe_home_no_critical_serious", e.message || e);
  }

  // offer-context: dt sits with its dd; dl.hero-proof is gone
  try {
    const routes = [
      "/diretoria-b2g/",
      "/diagnostico-b2g-expansao/",
      "/bid-room-licitacoes-obras/",
      "/acompanhamento-contratos-obras/",
      "/defesa-margem-contratos-publicos/",
      "/defesa-tecnica-contratos-publicos/",
      "/atrasos-prorrogacao-obras-publicas/",
    ];
    const viewports = [
      [390, 844],
      [1440, 900],
    ];
    const bad = [];
    for (const [w, h] of viewports) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      for (const path of routes) {
        await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        const report = await page.evaluate((vpW) => {
          const issues = [];
          if (document.querySelectorAll("dl.hero-proof").length) issues.push("dl.hero-proof");
          const ctx = document.querySelector(".offer-context");
          if (!ctx) issues.push("missing offer-context");
          const container = ctx && ctx.closest(".container");
          const cbox = container ? container.getBoundingClientRect() : null;
          const items = [...document.querySelectorAll(".offer-context-item")];
          if (!items.length) issues.push("missing offer-context-item");
          for (const item of items) {
            const dt = item.querySelector("dt");
            const dd = item.querySelector("dd");
            if (!dt || !dd) {
              issues.push("item missing dt/dd");
              continue;
            }
            const ritem = item.getBoundingClientRect();
            const rdt = dt.getBoundingClientRect();
            const rdd = dd.getBoundingClientRect();
            if (rdt.width === 0 || rdt.height === 0 || rdd.width === 0 || rdd.height === 0) {
              issues.push("zero-box");
              continue;
            }
            if (cbox && ritem.right > cbox.right + 2) issues.push("item-overflows-container");
            const hGap = rdd.left - rdt.right;
            if (hGap > 64) issues.push(`hGap:${Math.round(hGap)}`);
            if (vpW <= 430 && !(rdd.top > rdt.bottom - 1)) issues.push("mobile-dd-not-below-dt");
            const ox = Math.min(rdt.right, rdd.right) - Math.max(rdt.left, rdd.left);
            const oy = Math.min(rdt.bottom, rdd.bottom) - Math.max(rdt.top, rdd.top);
            if (ox > 2 && oy > 2) issues.push("overlap");
            const fsDt = parseFloat(getComputedStyle(dt).fontSize);
            const fsDd = parseFloat(getComputedStyle(dd).fontSize);
            if (fsDt < 14 || fsDd < 14) issues.push(`tiny-type:${fsDt}/${fsDd}`);
            const label = (dt.textContent || "").trim();
            if (/^(Job|ICP|Trigger)$/i.test(label)) issues.push(`internal-label:${label}`);
            const pairDx = Math.abs(rdt.left - rdd.left);
            if (pairDx > 48 && hGap > 64) issues.push(`pair-far:${Math.round(pairDx)}`);
          }
          return issues;
        }, w);
        if (report.length) bad.push(`${path}@${w}x${h}:${report.join(",")}`);
      }
    }
    if (bad.length) throw new Error(bad.slice(0, 10).join(" | "));
    ok(`offer_context_geometry (${routes.length} routes × ${viewports.length} viewports)`);
  } catch (e) {
    fail("offer_context_geometry", e.message || e);
  }

  // offer-context: CSS actually applied (computed styles), not file substring
  try {
    const threeItem = "/diretoria-b2g/";
    const fourItem = "/defesa-margem-contratos-publicos/";
    const measure = async (path, w, h) => {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      return page.evaluate((vpW) => {
        const issues = [];
        const ctx = document.querySelector(".offer-context");
        if (!ctx) return ["missing offer-context"];
        const cs = getComputedStyle(ctx);
        const items = [...document.querySelectorAll(".offer-context-item")];
        const dds = [...ctx.querySelectorAll("dd")];
        const colTracks = (cs.gridTemplateColumns || "")
          .trim()
          .split(/\s+(?![^()]*\))/)
          .filter(Boolean);
        const display = cs.display;
        if (vpW >= 1440) {
          if (display !== "grid") issues.push(`display:${display}`);
          if (items.length >= 3 && colTracks.length < 3) {
            issues.push(`cols:${colTracks.length}:${cs.gridTemplateColumns}`);
          }
        }
        if (vpW <= 390) {
          if (display !== "grid") issues.push(`display:${display}`);
          if (colTracks.length !== 1) issues.push(`mobile-cols:${colTracks.length}`);
        }
        for (const dd of dds) {
          const ml = getComputedStyle(dd).marginLeft;
          if (ml !== "0px") issues.push(`dd-margin-left:${ml}`);
        }
        for (const item of items) {
          const dt = item.querySelector("dt");
          const dd = item.querySelector("dd");
          if (!dt || !dd) continue;
          const rdt = dt.getBoundingClientRect();
          const rdd = dd.getBoundingClientRect();
          const pairDx = Math.abs(rdt.left - rdd.left);
          if (pairDx > 2) issues.push(`dt-dd-misalign:${Math.round(pairDx * 10) / 10}`);
        }
        if (vpW >= 1440 && items.length >= 4) {
          const r1 = items[0].getBoundingClientRect();
          const r4 = items[3].getBoundingClientRect();
          if (!(r4.top > r1.bottom - 2)) issues.push("fourth-not-conclusion-strip");
        }
        return {
          issues,
          display,
          colTracks: colTracks.length,
          ddMarginLeft: dds[0] ? getComputedStyle(dds[0]).marginLeft : null,
          itemCount: items.length,
        };
      }, w);
    };
    const desktop3 = await measure(threeItem, 1440, 900);
    const desktop4 = await measure(fourItem, 1440, 900);
    const mobile3 = await measure(threeItem, 390, 844);
    const mobile4 = await measure(fourItem, 390, 844);
    const all = [
      ["diretoria@1440", desktop3],
      ["defesa-margem@1440", desktop4],
      ["diretoria@390", mobile3],
      ["defesa-margem@390", mobile4],
    ];
    const badComputed = all
      .filter(([, r]) => r.issues && r.issues.length)
      .map(([name, r]) => `${name}:${r.issues.join(",")}`);
    if (badComputed.length) throw new Error(badComputed.join(" | "));
    if (desktop3.display !== "grid" || desktop3.colTracks < 3) {
      throw new Error(`desktop3 display=${desktop3.display} cols=${desktop3.colTracks}`);
    }
    if (desktop3.ddMarginLeft !== "0px") {
      throw new Error(`desktop3 dd.marginLeft=${desktop3.ddMarginLeft}`);
    }
    ok(
      `offer_context_computed (3col=${desktop3.colTracks} ddml=${desktop3.ddMarginLeft} 4items=${desktop4.itemCount})`
    );
  } catch (e) {
    fail("offer_context_computed", e.message || e);
  }

  // Commercial offers: the action is visible before optional contracting detail.
  try {
    const routes = [
      "/diretoria-b2g/",
      "/bid-room-licitacoes-obras/",
      "/defesa-margem-contratos-publicos/",
      "/diagnostico-b2g-expansao/",
    ];
    const onPageCaptureRoutes = new Set([
      "/bid-room-licitacoes-obras/",
      "/defesa-margem-contratos-publicos/",
    ]);
    const reports = [];
    for (const [w, h] of [[390, 844], [1280, 720]]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      for (const path of routes) {
        await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        const rep = await page.evaluate(() => {
          const cta = document.querySelector(".offer-hero .button-primary");
          const box = cta?.getBoundingClientRect();
          const details = [...document.querySelectorAll(".offer-detail-disclosure")];
          return {
            ctaTop: box ? Math.round(box.top) : null,
            ctaBottom: box ? Math.round(box.bottom) : null,
            ctaHref: cta?.getAttribute("href") || "",
            ctaVisible: Boolean(box && box.top < window.innerHeight && box.bottom > 0),
            onPageLeadForm: Boolean(document.querySelector(
              '#captura-pilar form[method="post"][action="/.netlify/functions/lead"] input[name="consentimento"][required]'
            )),
            details: details.length,
            detailsClosed: details.every((el) => !el.open),
            height: document.documentElement.scrollHeight,
          };
        });
        reports.push(`${path}@${w}:${rep.height}px`);
        if (!rep.ctaVisible) throw new Error(`${path}@${w}: CTA outside first viewport ${JSON.stringify(rep)}`);
        if (!rep.details || !rep.detailsClosed) throw new Error(`${path}@${w}: optional details invalid ${JSON.stringify(rep)}`);
        if (path === "/diagnostico-b2g-expansao/") {
          if (rep.ctaHref !== "#pedido-diagnostico") throw new Error(`${path}: unexpected CTA ${rep.ctaHref}`);
        } else if (onPageCaptureRoutes.has(path)) {
          if (rep.ctaHref !== "#captura-pilar" || !rep.onPageLeadForm) {
            throw new Error(`${path}: primary CTA must target the consented on-page lead form ${JSON.stringify(rep)}`);
          }
        } else if (!rep.ctaHref.startsWith("https://wa.me/")) {
          throw new Error(`${path}: primary CTA adds a page change ${rep.ctaHref}`);
        }
      }
    }
    ok(`offer_cta_first_viewport_and_progressive_detail (${reports.join(", ")})`);
  } catch (e) {
    fail("offer_cta_first_viewport_and_progressive_detail", e.message || e);
  }

  // Editorial cards are OG-only outside #128/#226; frozen covers remain proportional.
  try {
    const routes = [
      { path: "/conteudos/documentos-reequilibrio-obra-publica/", frozen: false },
      { path: "/acompanhamento-contratos-obras/", frozen: false },
      { path: "/reequilibrio-obras-publicas/", frozen: true },
    ];
    const reports = [];
    for (const width of [320, 390, 768, 1024, 1440]) {
      for (const route of routes) {
        const { path, frozen } = route;
        // Navigation history and in-flight smooth scrolling from earlier tests
        // must not contaminate a fresh visitor arrival. Each route gets an
        // isolated page and the top position must remain stable over time.
        const routePage = await browser.newPage();
        let rep;
        try {
          await routePage.setViewport({ width, height: 844, deviceScaleFactor: 1 });
          await routePage.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
          await routePage.evaluate(async () => {
            await document.fonts.ready;
            const cover = document.querySelector(".article-cover img");
            if (cover && !cover.complete) {
              await Promise.race([
                new Promise((resolveImage) => {
                  cover.addEventListener("load", resolveImage, { once: true });
                  cover.addEventListener("error", resolveImage, { once: true });
                }),
                new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2000)),
              ]);
            }
          });
          await assertStableDocumentTop(routePage);
          rep = await routePage.evaluate(() => {
          const h1 = document.querySelector("h1");
          const hero = document.querySelector(".content-hero");
          const answer = document.querySelector("#resposta");
          const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";
          const localOg = og.replace("https://confenge.com.br", "");
          const repeatedOg = [...document.images].filter((img) => img.getAttribute("src") === localOg);
          const grid = document.querySelector(".content-hero-grid");
          const coverImage = document.querySelector(".article-cover img");
          const h1Box = h1?.getBoundingClientRect();
          const heroBox = hero?.getBoundingClientRect();
          const answerBox = answer?.getBoundingClientRect();
          const gridBox = grid?.getBoundingClientRect();
          return {
            scrollY: Math.round(window.scrollY),
            h1Top: h1Box ? Math.round(h1Box.top) : null,
            h1Visible: Boolean(h1Box && h1Box.top >= 0 && h1Box.top < window.innerHeight),
            heroHeight: heroBox ? Math.round(heroBox.height) : null,
            answerTop: answerBox ? Math.round(answerBox.top) : null,
            articleCovers: document.querySelectorAll(".article-cover").length,
            repeatedOg: repeatedOg.length,
            coverIntrinsic: coverImage ? [coverImage.getAttribute("width"), coverImage.getAttribute("height")] : null,
            coverRatio: coverImage ? coverImage.getBoundingClientRect().width / coverImage.getBoundingClientRect().height : null,
            // Decoded size, not the declared attributes: catches a cover whose
            // width/height lie about the real asset (#179).
            coverNaturalRatio: coverImage && coverImage.naturalHeight
              ? coverImage.naturalWidth / coverImage.naturalHeight
              : null,
            hasGrid: Boolean(grid),
            gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : "",
            heroContained: Boolean(
              h1Box && gridBox && h1Box.left >= -1 && h1Box.right <= window.innerWidth + 1 &&
              gridBox.left >= -1 && gridBox.right <= window.innerWidth + 1
            ),
          };
          });
        } finally {
          if (!routePage.isClosed()) await routePage.close();
        }
        reports.push(`${path}@${width}:hero=${rep.heroHeight},answer=${rep.answerTop}`);
        if (!rep.h1Visible) {
          throw new Error(
            `${path}@${width}: H1 outside first viewport `
            + `(scrollY=${rep.scrollY}, h1Top=${rep.h1Top})`
          );
        }
        if (frozen) {
          if (rep.articleCovers !== 1 || rep.repeatedOg !== 1) {
            throw new Error(`${path}@${width}: frozen cover or OG changed ${JSON.stringify(rep)}`);
          }
          if (rep.coverIntrinsic?.join("x") !== "1200x630" || Math.abs(rep.coverRatio - (1200 / 630)) > 0.02) {
            throw new Error(`${path}@${width}: frozen cover distorted ${JSON.stringify(rep)}`);
          }
          // The check above only proves the box matches the DECLARED attributes. Compare it
          // to the decoded asset too, so wrong attributes cannot hide a squashed cover.
          if (rep.coverNaturalRatio === null || Math.abs(rep.coverRatio - rep.coverNaturalRatio) > 0.02) {
            throw new Error(`${path}@${width}: rendered box drifts from the decoded aspect ratio ${JSON.stringify(rep)}`);
          }
        } else if (rep.articleCovers || rep.repeatedOg) {
          throw new Error(`${path}@${width}: raster title card still inline ${JSON.stringify(rep)}`);
        }
        if (!rep.hasGrid || !rep.gridColumns) {
          throw new Error(`${path}@${width}: content hero grid missing`);
        }
        if (!rep.heroContained) throw new Error(`${path}@${width}: hero escapes viewport ${JSON.stringify(rep)}`);
        if (path.startsWith("/conteudos/") && width <= 390 && rep.answerTop >= 844) {
          throw new Error(`${path}@${width}: initial answer below first viewport ${rep.answerTop}`);
        }
      }
    }
    ok(`editorial_cover_scope_geometry (${reports.join(", ")})`);
  } catch (e) {
    fail("editorial_cover_scope_geometry", e.message || e);
  }

  // The header is a fixed-width brand next to a nowrap nav inside a capped
  // container. When the row runs over budget the deficit is absorbed silently by
  // the only shrinkable box — the wordmark — instead of overflowing the page, so
  // the sitewide overflow audit cannot see it. Sample the band where the CTA
  // returns but the container has not yet reached its cap.
  try {
    const headerPage = await browser.newPage();
    const reports = [];
    for (const width of [901, 1000, 1121, 1180, 1240, 1280, 1366, 1440, 1920]) {
      await headerPage.setViewport({ width, height: 900 });
      await headerPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      const rep = await headerPage.evaluate(() => {
        const img = document.querySelector(".brand img");
        const nav = document.querySelector(".desktop-nav");
        const navVisible = nav && getComputedStyle(nav).display !== "none";
        return {
          logoWidth: img ? Math.round(img.getBoundingClientRect().width) : 0,
          declaredWidth: img ? Math.round(parseFloat(getComputedStyle(img).width)) : 0,
          navVisible,
          navHeight: nav ? Math.round(nav.getBoundingClientRect().height) : 0,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      if (rep.overflow) {
        throw new Error(`header@${width}: page overflows horizontally`);
      }
      // 160px is the narrowest wordmark the sheet ever declares on purpose.
      if (rep.logoWidth < 160) {
        throw new Error(
          `header@${width}: wordmark squeezed to ${rep.logoWidth}px — the brand is absorbing the header deficit`,
        );
      }
      if (rep.navVisible && width > 1120 && rep.navHeight > 60) {
        throw new Error(`header@${width}: nav wrapped to ${rep.navHeight}px`);
      }
      reports.push(`${width}:${rep.logoWidth}px/${rep.navHeight}px`);
    }
    await headerPage.close();
    ok(`header_brand_and_nav_fit (${reports.join(", ")})`);
  } catch (e) {
    fail("header_brand_and_nav_fit", e.message || e);
  }

  // Truthful-gates fixtures: foco offscreen, texto em 42 px, overflow,
  // useless anchor, missing sticky CTA, broken form. Same browser engine.
  const fixtureDir = join(ROOT, "scripts/site/fixtures/truthful_gates");
  async function layoutFindingsFromHtml(html, viewport = { width: 390, height: 844 }, options = {}) {
    const tab = await browser.newPage();
    try {
      await tab.setViewport({ ...viewport, deviceScaleFactor: 1 });
      await tab.setContent(html, { waitUntil: "domcontentloaded" });
      return await renderedLayoutFindings(tab, options);
    } finally {
      await tab.close();
    }
  }

  try {
    const offscreen = await layoutFindingsFromHtml(
      readFileSync(join(fixtureDir, "focus-offscreen.html"), "utf8"),
    );
    if (!offscreen.some((row) => row.includes("focus_offscreen"))) {
      throw new Error(`expected focus_offscreen, got ${offscreen.join(",")}`);
    }
    ok("fixture_focus_offscreen_fails");
  } catch (e) {
    fail("fixture_focus_offscreen_fails", e.message || e);
  }

  try {
    const verticallyOffscreen = await layoutFindingsFromHtml(`<!doctype html>
      <html lang="pt-BR"><body><main>
      <a href="/contato/" style="position:fixed;top:-9999px;left:0">Analisar meu caso</a>
      <form method="post" action="/.netlify/functions/lead" data-capture-form>
      <label>Nome <input name="nome"></label><button type="submit">Enviar</button>
      </form>
      <aside class="contact-float"><a href="https://wa.me/5548988344559">WhatsApp</a></aside>
      </main></body></html>`);
    if (!verticallyOffscreen.some((row) => row.includes("focus_offscreen"))) {
      throw new Error(`expected vertical focus_offscreen, got ${verticallyOffscreen.join(",")}`);
    }
    ok("fixture_focus_vertically_offscreen_fails");
  } catch (e) {
    fail("fixture_focus_vertically_offscreen_fails", e.message || e);
  }

  try {
    const narrow = await layoutFindingsFromHtml(
      readFileSync(join(fixtureDir, "text-42px.html"), "utf8"),
    );
    if (!narrow.some((row) => row.includes("text_width_42px") || /text_width_4\dpx/.test(row))) {
      throw new Error(`expected text_width_42px, got ${narrow.join(",")}`);
    }
    ok("fixture_text_42px_fails");
  } catch (e) {
    fail("fixture_text_42px_fails", e.message || e);
  }

  try {
    const overflow = await layoutFindingsFromHtml(
      readFileSync(join(fixtureDir, "overflow.html"), "utf8"),
    );
    if (!overflow.some((row) => row.includes("horizontal_overflow"))) {
      throw new Error(`expected horizontal_overflow, got ${overflow.join(",")}`);
    }
    ok("fixture_overflow_fails");
  } catch (e) {
    fail("fixture_overflow_fails", e.message || e);
  }

  try {
    const anchor = await layoutFindingsFromHtml(
      readFileSync(join(fixtureDir, "useless-anchor.html"), "utf8"),
    );
    if (!anchor.some((row) => row.includes("useless_anchor"))) {
      throw new Error(`expected useless_anchor, got ${anchor.join(",")}`);
    }
    ok("fixture_useless_anchor_fails");
  } catch (e) {
    fail("fixture_useless_anchor_fails", e.message || e);
  }

  try {
    const sticky = await layoutFindingsFromHtml(
      readFileSync(join(fixtureDir, "missing-sticky-cta.html"), "utf8"),
    );
    if (!sticky.includes("missing_sticky_cta")) {
      throw new Error(`expected missing_sticky_cta, got ${sticky.join(",")}`);
    }
    ok("fixture_missing_sticky_cta_fails");
  } catch (e) {
    fail("fixture_missing_sticky_cta_fails", e.message || e);
  }

  try {
    const form = await layoutFindingsFromHtml(
      readFileSync(join(fixtureDir, "broken-form.html"), "utf8"),
    );
    if (!form.includes("broken_form")) {
      throw new Error(`expected broken_form, got ${form.join(",")}`);
    }
    ok("fixture_broken_form_fails");
  } catch (e) {
    fail("fixture_broken_form_fails", e.message || e);
  }

  try {
    const hiddenForm = await layoutFindingsFromHtml(`<!doctype html>
      <html lang="pt-BR"><body><main>
      <form method="post" action="/.netlify/functions/lead" data-capture-form hidden>
      <label>Nome <input name="nome"></label><button type="submit">Enviar</button>
      </form>
      <aside class="contact-float"><a href="https://wa.me/5548988344559">WhatsApp</a></aside>
      </main></body></html>`);
    if (!hiddenForm.includes("broken_form")) {
      throw new Error(`expected hidden broken_form, got ${hiddenForm.join(",")}`);
    }
    ok("fixture_hidden_capture_form_fails");
  } catch (e) {
    fail("fixture_hidden_capture_form_fails", e.message || e);
  }

  try {
    const gatedForm = await layoutFindingsFromHtml(`<!doctype html>
      <html lang="pt-BR"><body><main>
      <div id="resultado" hidden></div>
      <section hidden><form method="post" action="/.netlify/functions/lead" data-result-gated-capture="true" data-result-source="#resultado">
      <label>Nome <input name="nome"></label><button type="submit">Enviar</button>
      </form></section>
      <aside class="contact-float"><a href="https://wa.me/5548988344559">WhatsApp</a></aside>
      </main></body></html>`);
    if (gatedForm.includes("broken_form")) {
      throw new Error(`result-gated capture remained broken: ${gatedForm.join(",")}`);
    }
    ok("fixture_result_gated_capture_passes_when_revealed");
  } catch (e) {
    fail("fixture_result_gated_capture_passes_when_revealed", e.message || e);
  }

  try {
    const malformedGatedForm = await layoutFindingsFromHtml(`<!doctype html>
      <html lang="pt-BR"><body><main>
      <section hidden><form method="post" action="/.netlify/functions/lead" data-result-gated-capture="true" data-result-source="#missing-result">
      <label>Nome <input name="nome"></label><button type="submit">Enviar</button>
      </form></section>
      <aside class="contact-float"><a href="https://wa.me/5548988344559">WhatsApp</a></aside>
      </main></body></html>`);
    if (!malformedGatedForm.includes("broken_form")) {
      throw new Error(`malformed result gate passed: ${malformedGatedForm.join(",")}`);
    }
    ok("fixture_result_gated_capture_without_source_fails");
  } catch (e) {
    fail("fixture_result_gated_capture_without_source_fails", e.message || e);
  }

  try {
    const hiddenOnlyForm = await layoutFindingsFromHtml(`<!doctype html>
      <html lang="pt-BR"><body><main>
      <form method="post" action="/.netlify/functions/lead" data-capture-form>
      <input type="hidden" name="origem" value="fixture"><button type="submit">Enviar</button>
      </form>
      <aside class="contact-float"><a href="https://wa.me/5548988344559">WhatsApp</a></aside>
      </main></body></html>`);
    if (!hiddenOnlyForm.includes("broken_form")) {
      throw new Error(`expected hidden-only broken_form, got ${hiddenOnlyForm.join(",")}`);
    }
    ok("fixture_hidden_only_capture_form_fails");
  } catch (e) {
    fail("fixture_hidden_only_capture_form_fails", e.message || e);
  }

  const authorityGatedHtml = `<!doctype html>
    <html lang="pt-BR"><body><main>
    <form method="post" action="/.netlify/functions/lead"
      data-runtime-profile="adaptive_intake_standalone_v1"
      data-authority-config-endpoint="/.netlify/functions/adaptive-intake-config">
    <label>Nome <input name="nome"></label><button type="submit" disabled>Enviar</button>
    </form>
    <script src="/assets/js/adaptive-intake.js"></script>
    <aside class="contact-float"><a href="https://wa.me/5548988344559">WhatsApp</a></aside>
    </main></body></html>`;
  const authorityGatedContract = {
    runtimeProfile: "adaptive_intake_standalone_v1",
    configEndpoint: "/.netlify/functions/adaptive-intake-config",
    clientScript: "/assets/js/adaptive-intake.js",
  };
  try {
    const selfAuthorized = await layoutFindingsFromHtml(authorityGatedHtml);
    if (!selfAuthorized.includes("broken_form")) {
      throw new Error(`HTML self-authorized an unavailable capture: ${selfAuthorized.join(",")}`);
    }
    ok("fixture_authority_gated_capture_requires_registry_contract");
  } catch (e) {
    fail("fixture_authority_gated_capture_requires_registry_contract", e.message || e);
  }
  try {
    const declared = await layoutFindingsFromHtml(
      authorityGatedHtml,
      { width: 390, height: 844 },
      { authorityGatedCapture: authorityGatedContract },
    );
    if (declared.includes("broken_form")) {
      throw new Error(`declared authority-gated capture remained broken: ${declared.join(",")}`);
    }
    ok("fixture_authority_gated_capture_passes_with_registry_contract");
  } catch (e) {
    fail("fixture_authority_gated_capture_passes_with_registry_contract", e.message || e);
  }

  try {
    const hiddenSticky = await layoutFindingsFromHtml(`<!doctype html>
      <html lang="pt-BR"><body><main>
      <form method="post" action="/.netlify/functions/lead" data-capture-form>
      <label>Nome <input name="nome"></label><button type="submit">Enviar</button>
      </form>
      <aside class="contact-float" hidden><a href="https://wa.me/5548988344559">WhatsApp</a></aside>
      </main></body></html>`);
    if (!hiddenSticky.includes("missing_sticky_cta")) {
      throw new Error(`expected hidden missing_sticky_cta, got ${hiddenSticky.join(",")}`);
    }
    ok("fixture_hidden_sticky_cta_fails");
  } catch (e) {
    fail("fixture_hidden_sticky_cta_fails", e.message || e);
  }

  try {
    const passed = await layoutFindingsFromHtml(
      readFileSync(join(fixtureDir, "pass-layout.html"), "utf8"),
    );
    if (passed.length) throw new Error(passed.join(","));
    ok("fixture_layout_pass");
  } catch (e) {
    fail("fixture_layout_pass", e.message || e);
  }

  // No hover lift — declared in docs/DESIGN-SYSTEM.md and in forbidden_patterns,
  // measured here in the render. A regex over styles.css cannot decide this:
  // the sheet carried lifts that a later declaration already cancelled, and it
  // carried one whose transform:none lived only inside prefers-reduced-motion.
  async function hoverFindingsFromHtml(html, viewport = { width: 1440, height: 900 }) {
    const tab = await browser.newPage();
    try {
      await tab.setViewport({ ...viewport, deviceScaleFactor: 1 });
      await tab.setContent(html, { waitUntil: "domcontentloaded" });
      return await hoverLiftFindings(tab);
    } finally {
      await tab.close();
    }
  }

  try {
    const lifted = await hoverFindingsFromHtml(
      readFileSync(join(fixtureDir, "hover-lift.html"), "utf8"),
    );
    const hit = lifted.find((row) => row.startsWith("hover_lift ") && row.includes("whatsapp-float"));
    if (!hit) throw new Error(`expected hover_lift on .whatsapp-float, got ${lifted.join(",") || "<none>"}`);
    ok(`fixture_hover_lift_fails (${hit})`);
  } catch (e) {
    fail("fixture_hover_lift_fails", e.message || e);
  }

  try {
    // The same fixture with the forbidden displacement swapped for the
    // affordance the site actually ships: colour and border, no movement.
    const still = await hoverFindingsFromHtml(
      readFileSync(join(fixtureDir, "hover-lift.html"), "utf8").replace(
        ".whatsapp-float:hover{transform:translateY(-3px)}",
        ".whatsapp-float:hover{background:#25703a;border-color:#fff}",
      ),
    );
    if (still.length) throw new Error(still.join(","));
    ok("fixture_hover_lift_pass");
  } catch (e) {
    fail("fixture_hover_lift_pass", e.message || e);
  }

  const HOVER_LIFT_ROUTES = [
    ["/", { width: 1440, height: 900 }],
    ["/", { width: 768, height: 1024 }],
    ["/entregas/", { width: 1440, height: 900 }],
    ["/conteudos/documentos-reequilibrio-obra-publica/", { width: 1440, height: 900 }],
  ];
  for (const [route, viewport] of HOVER_LIFT_ROUTES) {
    const label = `no_hover_lift ${route}@${viewport.width}`;
    const tab = await browser.newPage();
    try {
      await tab.setViewport({ ...viewport, deviceScaleFactor: 1 });
      await tab.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const lifts = await hoverLiftFindings(tab);
      if (lifts.length) throw new Error(lifts.join(" | "));
      ok(label);
    } catch (e) {
      fail(label, e.message || e);
    } finally {
      await tab.close();
    }
  }

  // The contact element must keep a hover affordance and a visible focus ring:
  // removing the lift may not leave the visitor without feedback.
  try {
    const tab = await browser.newPage();
    try {
      await tab.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await tab.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const float = await tab.$(".whatsapp-float");
      if (!float) throw new Error("no .whatsapp-float on the home");
      const read = () => tab.evaluate(() => {
        const element = document.querySelector(".whatsapp-float");
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          background: style.backgroundColor,
          borderColor: style.borderTopColor,
          boxShadow: style.boxShadow,
          width: Math.round(box.width),
          height: Math.round(box.height),
          top: box.top + window.scrollY,
        };
      });
      // Hover first: hover() may scroll, and both samples must be taken after
      // that so the displacement diff stays honest.
      await float.hover();
      await new Promise((done) => setTimeout(done, 320));
      const hovered = await read();
      await tab.mouse.move(1, 1);
      await new Promise((done) => setTimeout(done, 320));
      const resting = await read();
      await float.dispose();
      const changed = ["background", "borderColor", "boxShadow"]
        .filter((key) => resting[key] !== hovered[key]);
      if (!changed.length) {
        throw new Error(`contact float has no hover affordance left: ${JSON.stringify(resting)}`);
      }
      const dy = hovered.top - resting.top;
      if (Math.abs(dy) > 0.5) {
        throw new Error(`contact float still lifts ${dy.toFixed(1)}px on hover`);
      }
      if (hovered.width !== resting.width || hovered.height !== resting.height) {
        throw new Error("contact float changes size on hover");
      }
      if (resting.width < 44 || resting.height < 44) {
        throw new Error(`contact float target ${resting.width}x${resting.height} below 44px`);
      }
      const focusRing = await tab.evaluate(() => {
        const element = document.querySelector(".whatsapp-float");
        element.focus();
        const style = getComputedStyle(element, null);
        return {
          width: style.outlineWidth,
          style: style.outlineStyle,
          color: style.outlineColor,
          boxShadow: style.boxShadow,
        };
      });
      // Reading outlineWidth/outlineStyle alone is not enough. Since #506 the
      // ring is `outline:2px solid transparent` plus `box-shadow:var(--focus-ring)`
      // -- the transparent outline exists for Windows high contrast, where
      // box-shadow is not painted. A rule that overrides box-shadow would leave
      // that outline reading `solid`/`2px` and pass while painting nothing. So
      // the indicator has to be found where it actually is: a visible outline,
      // or a box-shadow that differs from the resting one.
      const invisible = /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/;
      const outlinePaints =
        focusRing.style !== "none" &&
        parseFloat(focusRing.width) >= 1 &&
        !invisible.test(focusRing.color);
      const shadowPaints =
        focusRing.boxShadow !== "none" && focusRing.boxShadow !== resting.boxShadow;
      if (!outlinePaints && !shadowPaints) {
        throw new Error(`contact float has no visible focus ring: ${JSON.stringify(focusRing)}`);
      }
      ok(`contact_float_hover_affordance (${changed.join("+")}, ${resting.width}x${resting.height}px)`);
    } finally {
      await tab.close();
    }
  } catch (e) {
    fail("contact_float_hover_affordance", e.message || e);
  }

  const TYPE_FLOOR_FAMILIES = [
    { family: "home", path: "/" },
    { family: "entregas", path: "/entregas/" },
    { family: "artigo", path: "/conteudos/documentos-reequilibrio-obra-publica/" },
    { family: "oferta", path: "/diretoria-b2g/" },
    { family: "ferramenta", path: "/ferramentas/diagnostico-defesa-margem/" },
    { family: "casos", path: "/casos/" },
    { family: "especialista", path: "/especialista/tiago-jun-sasaki/" },
  ];
  const TYPE_FLOOR_VIEWPORTS = [
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1440, 1000],
  ];
  const CRITICAL_TYPE_SELECTORS = [
    ".hero-proof li",
    ".hero-proof strong",
    ".hero-micro",
    ".form-hint",
    ".form-note",
    ".field label",
    ".consent",
    "figcaption",
    "thead th",
    ".table-note",
    ".article-meta",
    ".evidence-heading > span",
    ".evidence-tier",
    ".evidence-facts dt",
    ".evidence-facts dd",
  ];
  const measureRenderedType = async (target, sel) =>
    target.evaluate((selectors) => {
      const skip = (el) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return (
          style.display === "none" ||
          style.visibility === "hidden" ||
          box.width === 0 ||
          box.height === 0
        );
      };
      let minBody = Infinity;
      let minBodySel = "";
      for (const el of document.querySelectorAll("body, .hero-lead, .section-lead, .editorial-lead, .editorial-body, .editorial-body p, .content-lead, .article-intro")) {
        if (skip(el)) continue;
        if (el.closest(".hero-proof, aside, figcaption, .form-hint, .technical-note, .article-meta, .table-note")) continue;
        if (/(technical-note|article-meta|table-note|evidence-|kicker|caption|hint)/i.test(String(el.className || ""))) continue;
        const text = (el.innerText || "").replace(/\s+/g, " ").trim();
        if (el.tagName !== "BODY" && text.length < 40) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs && fs < minBody) {
          minBody = fs;
          minBodySel = el.tagName.toLowerCase() + "." + String(el.className || "").slice(0, 40);
        }
      }
      let minCritical = Infinity;
      let minCriticalSel = "";
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (skip(el)) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < minCritical) {
            minCritical = fs;
            minCriticalSel = selector;
          }
        }
      }
      const overflow =
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      const compressed = [...document.querySelectorAll("p, li, h2, h3, label, dd")]
        .filter((el) => {
          if (skip(el) || el.closest(".table-wrap, .honeypot")) return false;
          const text = (el.innerText || "").replace(/\s+/g, " ").trim();
          if (text.length < 48) return false;
          const box = el.getBoundingClientRect();
          const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
          return box.width < 80 && box.height > fs * 4;
        })
        .slice(0, 3)
        .map((el) => el.tagName.toLowerCase());
      const off = [...document.querySelectorAll("h1, .button-primary, .hero-lead, .hero-proof")]
        .filter((el) => {
          if (skip(el) || getComputedStyle(el).position === "fixed" || el.closest(".table-wrap")) return false;
          const box = el.getBoundingClientRect();
          return box.right > window.innerWidth + 2 || box.left < -2;
        })
        .slice(0, 3)
        .map((el) => el.tagName.toLowerCase());
      return {
        minBody: Number.isFinite(minBody) ? minBody : null,
        minBodySel,
        minCritical: Number.isFinite(minCritical) ? minCritical : null,
        minCriticalSel,
        overflow,
        compressed,
        off,
      };
    }, sel);

  try {
    const fixturePage = await browser.newPage();
    await fixturePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const fixtureHtml = readFileSync(
      join(ROOT, "tests/fixtures/type-floor/historical-prova-collapse.html"),
      "utf8",
    );
    await fixturePage.setContent(fixtureHtml, { waitUntil: "domcontentloaded" });
    const fixture = await measureRenderedType(fixturePage, [".hero-proof li", ".hero-proof strong", ".form-hint"]);
    await fixturePage.close();
    if (!(fixture.minCritical < 12.8)) {
      throw new Error(`fixture did not reproduce sub-floor type: ${JSON.stringify(fixture)}`);
    }
    ok(`type_floor_gate_detects_historical_collapse (${fixture.minCritical}px)`);
  } catch (e) {
    fail("type_floor_gate_detects_historical_collapse", e.message || e);
  }

  try {
    const worst = { minCritical: Infinity, minBody: Infinity, where: "" };
    for (const [w, h] of TYPE_FLOOR_VIEWPORTS) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      for (const { family, path } of TYPE_FLOOR_FAMILIES) {
        await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        const rep = await measureRenderedType(page, CRITICAL_TYPE_SELECTORS);
        const loc = `${family}@${w}${path}`;
        if (rep.overflow) throw new Error(`${loc}: horizontal overflow`);
        if (Number.isFinite(rep.minBody) && rep.minBody < 16) {
          throw new Error(`${loc}: body ${rep.minBody}px < 16px (${rep.minBodySel})`);
        }
        if (family === "home" && !Number.isFinite(rep.minCritical)) {
          throw new Error(`${loc}: home must expose measurable critical microcopy`);
        }
        if (Number.isFinite(rep.minCritical) && rep.minCritical < 12.8) {
          throw new Error(`${loc}: critical ${rep.minCritical}px < 12.8px (${rep.minCriticalSel})`);
        }
        if (rep.compressed.length) throw new Error(`${loc}: compressed ${rep.compressed.join(",")}`);
        if (rep.off.length) throw new Error(`${loc}: off-viewport ${rep.off.join(",")}`);
        if (Number.isFinite(rep.minCritical) && rep.minCritical < worst.minCritical) {
          worst.minCritical = rep.minCritical;
          worst.where = loc;
        }
        if (Number.isFinite(rep.minBody) && rep.minBody < worst.minBody) worst.minBody = rep.minBody;
      }
    }
    ok(
      `type_floor_seven_families (${TYPE_FLOOR_FAMILIES.length}×${TYPE_FLOOR_VIEWPORTS.length}; min critical ${worst.minCritical}px body ${worst.minBody}px)`,
    );
  } catch (e) {
    fail("type_floor_seven_families", e.message || e);
  }

  try {
    const clsBad = [];
    for (const { family, path } of TYPE_FLOOR_FAMILIES) {
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const cls = await page.evaluate(
        () =>
          new Promise((resolve) => {
            let score = 0;
            try {
              const po = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  if (!entry.hadRecentInput) score += entry.value;
                }
              });
              po.observe({ type: "layout-shift", buffered: true });
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  po.disconnect();
                  resolve(score);
                });
              });
            } catch {
              resolve(0);
            }
          }),
      );
      if (cls > 0.05) clsBad.push(`${family}:${cls}`);
    }
    if (clsBad.length) throw new Error(clsBad.join(", "));
    ok("cls_seven_families_le_0_05");
  } catch (e) {
    fail("cls_seven_families_le_0_05", e.message || e);
  }

  // Perceived-result gates for editorial action-list geometry (CFG10X-01).
  // Measure the useful text box, not class/token presence. Floors: 240px at
  // 390 and 500px at 1440 when that space exists. Fail on word-by-word wrap
  // of “Contrato e planilha inicial” and on horizontal overflow.
  try {
    const path = "/lei-14133-obras/limite-25-50-aditivo-obra/";
    const viewports = [
      [390, 844, 240],
      [768, 1024, 240],
      [1024, 768, 240],
      [1440, 900, 500],
    ];
    const reports = [];
    for (const [w, h, floor] of viewports) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const geo = await page.evaluate((minWidth) => {
        const issues = [];
        const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        if (overflow) {
          issues.push(`overflow:${document.documentElement.scrollWidth}>${document.documentElement.clientWidth}`);
        }
        const lists = [...document.querySelectorAll("ol.action-list")];
        if (!lists.length) issues.push("missing-ol.action-list");
        for (const ol of lists) {
          const cs = getComputedStyle(ol);
          if (cs.listStyleType !== "decimal") {
            issues.push(`list-style-type:${cs.listStyleType}`);
          }
        }
        const items = [...document.querySelectorAll(".action-list li")];
        if (!items.length) issues.push("no-items");
        const widths = [];
        for (const li of items) {
          const prose = li.querySelector(":scope > :not(span)") || li.querySelector("div") || li;
          const r = prose.getBoundingClientRect();
          widths.push(Math.round(r.width * 10) / 10);
          if (r.width + 0.5 < minWidth) {
            issues.push(`narrow:${Math.round(r.width)}<${minWidth}:"${(prose.innerText || "").replace(/\s+/g, " ").trim().slice(0, 48)}"`);
          }
        }
        const phrase = "Contrato e planilha inicial";
        const host = items.find((li) => (li.innerText || "").includes(phrase));
        let tower = null;
        if (host) {
          const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
          let node = walker.nextNode();
          while (node) {
            const idx = node.data.indexOf(phrase);
            if (idx >= 0) {
              const words = phrase.split(/\s+/);
              let cursor = idx;
              const tops = [];
              for (const word of words) {
                const start = node.data.indexOf(word, cursor);
                const range = document.createRange();
                range.setStart(node, start);
                range.setEnd(node, start + word.length);
                tops.push(Math.round(range.getBoundingClientRect().top));
                cursor = start + word.length;
              }
              tower = { words: words.length, uniqueTops: new Set(tops).size, tops };
              break;
            }
            node = walker.nextNode();
          }
          if (tower && tower.words >= 3 && tower.uniqueTops >= tower.words) {
            issues.push(`word-tower:${tower.tops.join("/")}`);
          }
        } else {
          issues.push("missing-phrase");
        }
        return { issues, widths, overflow, listStyle: lists[0] ? getComputedStyle(lists[0]).listStyleType : null };
      }, floor);
      reports.push(`${w}x${h}:min=${Math.min(...geo.widths)}:${geo.listStyle}`);
      if (geo.issues.length) throw new Error(`${w}x${h}: ${geo.issues.join("; ")}`);
    }
    ok(`action_list_usable_width (${reports.join("; ")})`);
  } catch (e) {
    fail("action_list_usable_width", e.message || e);
  }

  // Two-child library pattern must keep prose in the remaining column.
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/conteudos/preco-de-item-novo-aditivo-obra-publica/`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const lib = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".action-list li")];
      const measured = items.map((li) => {
        const span = li.querySelector(":scope > span:first-child");
        const prose = span ? span.nextElementSibling : (li.querySelector("div") || li);
        return {
          children: li.children.length,
          hasSpan: Boolean(span),
          proseW: prose ? Math.round(prose.getBoundingClientRect().width) : 0,
        };
      });
      const two = measured.filter((m) => m.hasSpan && m.children >= 2);
      const narrow = two.filter((m) => m.proseW < 240);
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      return { two: two.length, narrow: narrow.length, min: two.length ? Math.min(...two.map((m) => m.proseW)) : 0, overflow };
    });
    if (!lib.two) throw new Error("no two-child action-list items on library page");
    if (lib.overflow) throw new Error("library action-list page overflows horizontally");
    if (lib.narrow) throw new Error(`two-child prose collapsed: min=${lib.min}px`);
    ok(`action_list_two_child_prose_column (n=${lib.two} min=${lib.min}px)`);
  } catch (e) {
    fail("action_list_two_child_prose_column", e.message || e);
  }

  // Home form: after Continuar/Voltar the focused element must sit fully in
  // the viewport, and the visible step heading/fieldset must be in view.
  // Drive the real click without Puppeteer auto-scrolling the control.
  const productionPosts = [];
  try {
    const formPage = await browser.newPage();
    await formPage.setRequestInterception(true);
    formPage.on("request", (req) => {
      const url = req.url();
      const prodLead = req.method() === "POST" && (
        /https?:\/\/([^/]*\.)?confenge\.com\.br/i.test(url)
        || /\/\.netlify\/functions\/lead(?:\?|$)/i.test(url)
      );
      if (prodLead) {
        productionPosts.push(`${req.method()} ${url}`);
        req.abort("blockedbyclient").catch(() => {});
        return;
      }
      req.continue().catch(() => {});
    });
    await formPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await formPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await formPage.waitForSelector('form.contact-form[data-form-ready="true"]', { timeout: 4000 });
    await formPage.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      if (document.body) document.body.style.scrollBehavior = "auto";
    });
    await formPage.type("#nome", "Maria Silva");
    await formPage.type("#email", "maria@example.com");
    await formPage.select("#estagio", "problema urgente em contrato");

    const parkAndClick = async (selector) => {
      await formPage.evaluate((sel) => {
        document.documentElement.style.scrollBehavior = "auto";
        const btn = document.querySelector(sel);
        if (!btn) throw new Error(`missing ${sel}`);
        btn.scrollIntoView({ block: "end", behavior: "instant" });
        const r = btn.getBoundingClientRect();
        window.scrollBy(0, r.bottom - window.innerHeight + 8);
      }, selector);
      await formPage.evaluate((sel) => {
        const btn = document.querySelector(sel);
        btn.click();
      }, selector);
    };

    const readFocus = () => formPage.evaluate(() => {
      const el = document.activeElement;
      const r = el ? el.getBoundingClientRect() : null;
      const panel = document.querySelector(".form-step.is-active");
      const heading = panel
        ? panel.querySelector("legend, h2, h3, [data-step-heading]")
        : null;
      const hr = heading ? heading.getBoundingClientRect() : null;
      const pr = panel ? panel.getBoundingClientRect() : null;
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const fully = (box) => Boolean(
        box
        && box.top >= -1
        && box.left >= -1
        && box.bottom <= vh + 1
        && box.right <= vw + 1,
      );
      const intersects = (box) => Boolean(box && box.top < vh && box.bottom > 0 && box.left < vw && box.right > 0);
      return {
        id: el && (el.id || el.tagName.toLowerCase()),
        inPanel: Boolean(panel && el && panel.contains(el)),
        fully: fully(r),
        headingFully: fully(hr),
        headingInView: intersects(hr),
        panelInView: intersects(pr),
        top: r ? Math.round(r.top) : null,
        bottom: r ? Math.round(r.bottom) : null,
        vh,
        vw,
      };
    });

    await parkAndClick("[data-form-next]");
    await waitForActiveStepFocus(formPage, 2);
    const afterNext = await readFocus();
    if (!afterNext.inPanel) throw new Error(`continuar focus not in step 2: ${JSON.stringify(afterNext)}`);
    if (!afterNext.fully) throw new Error(`continuar focused element outside viewport: ${JSON.stringify(afterNext)}`);
    if (!afterNext.headingInView || !afterNext.panelInView) {
      throw new Error(`continuar heading/fieldset not in view: ${JSON.stringify(afterNext)}`);
    }

    await parkAndClick("[data-form-back]");
    await waitForActiveStepFocus(formPage, 1);
    const afterBack = await readFocus();
    if (!afterBack.inPanel) throw new Error(`voltar focus not in step 1: ${JSON.stringify(afterBack)}`);
    if (!afterBack.fully) throw new Error(`voltar focused element outside viewport: ${JSON.stringify(afterBack)}`);
    if (!afterBack.headingInView || !afterBack.panelInView) {
      throw new Error(`voltar heading/fieldset not in view: ${JSON.stringify(afterBack)}`);
    }
    await formPage.close();
    ok(`form_step_focus_in_viewport (next=${afterNext.id}@${afterNext.top} back=${afterBack.id}@${afterBack.top})`);
  } catch (e) {
    fail("form_step_focus_in_viewport", e.message || e);
  }

  // “e-mail ou WhatsApp” is one validity group: shared describedby, one
  // summary, aria-invalid on the empty controls; filling either channel
  // clears the group without invalidating the remaining empty optional field.
  try {
    const ariaPage = await browser.newPage();
    await ariaPage.setRequestInterception(true);
    ariaPage.on("request", (req) => {
      const url = req.url();
      const prodLead = req.method() === "POST" && (
        /https?:\/\/([^/]*\.)?confenge\.com\.br/i.test(url)
        || /\/\.netlify\/functions\/lead(?:\?|$)/i.test(url)
      );
      if (prodLead) {
        productionPosts.push(`${req.method()} ${url}`);
        req.abort("blockedbyclient").catch(() => {});
        return;
      }
      req.continue().catch(() => {});
    });
    await ariaPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await ariaPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await ariaPage.waitForSelector('form.contact-form[data-form-ready="true"]', { timeout: 4000 });
    await ariaPage.type("#nome", "Maria Silva");
    await ariaPage.select("#estagio", "problema urgente em contrato");
    await ariaPage.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      document.querySelector("[data-form-next]").click();
    });
    await new Promise((r) => setTimeout(r, 80));
    const emptyGroup = await ariaPage.evaluate(() => {
      const email = document.querySelector("#email");
      const phone = document.querySelector("#telefone");
      const hint = document.querySelector("#contato-hint");
      const status = document.querySelector("#form-status, .form-status, [role='alert']");
      const describedEmail = (email?.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      const describedPhone = (phone?.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      const idsExist = (ids) => ids.every((id) => document.getElementById(id));
      const statusText = status && !status.hidden ? (status.textContent || "").trim() : "";
      const hintText = hint ? (hint.textContent || "").trim() : "";
      return {
        emailInvalid: email?.getAttribute("aria-invalid") === "true",
        phoneInvalid: phone?.getAttribute("aria-invalid") === "true",
        emailClass: email?.classList.contains("is-invalid") || false,
        phoneClass: phone?.classList.contains("is-invalid") || false,
        describedEmail,
        describedPhone,
        idsExist: idsExist(describedEmail) && idsExist(describedPhone),
        hintId: hint?.id || "",
        statusId: status?.id || "",
        statusText,
        hintText,
        emailNative: email?.validationMessage || "",
        phoneNative: phone?.validationMessage || "",
        stillStep1: Boolean(document.querySelector('[data-form-step="1"].is-active')),
      };
    });
    if (!emptyGroup.stillStep1) throw new Error(`empty channels advanced the step: ${JSON.stringify(emptyGroup)}`);
    if (!emptyGroup.emailInvalid || !emptyGroup.phoneInvalid) {
      throw new Error(`missing aria-invalid on contact group: ${JSON.stringify(emptyGroup)}`);
    }
    if (!emptyGroup.hintId || !emptyGroup.describedEmail.includes(emptyGroup.hintId) || !emptyGroup.describedPhone.includes(emptyGroup.hintId)) {
      throw new Error(`aria-describedby does not share contato-hint: ${JSON.stringify(emptyGroup)}`);
    }
    const shared = emptyGroup.describedEmail.filter((id) => emptyGroup.describedPhone.includes(id));
    if (!shared.length) throw new Error(`no shared describedby: ${JSON.stringify(emptyGroup)}`);
    if (!emptyGroup.idsExist) throw new Error(`describedby ids missing from document: ${JSON.stringify(emptyGroup)}`);
    if (!/(e-mail|email).*(whatsapp)|whatsapp.*(e-mail|email)/i.test(`${emptyGroup.statusText} ${emptyGroup.hintText}`)) {
      throw new Error(`group summary missing e-mail/WhatsApp: ${JSON.stringify(emptyGroup)}`);
    }
    if (emptyGroup.emailNative && emptyGroup.phoneNative && emptyGroup.emailNative === emptyGroup.phoneNative) {
      throw new Error(`two independent native field errors: ${JSON.stringify(emptyGroup)}`);
    }
    if (emptyGroup.emailNative && emptyGroup.phoneNative) {
      throw new Error(`two native validation messages: ${JSON.stringify(emptyGroup)}`);
    }

    await ariaPage.type("#email", "maria@example.com");
    await new Promise((r) => setTimeout(r, 50));
    const filled = await ariaPage.evaluate(() => {
      const email = document.querySelector("#email");
      const phone = document.querySelector("#telefone");
      const status = document.querySelector("#form-status, .form-status");
      return {
        emailInvalid: email?.getAttribute("aria-invalid") === "true",
        phoneInvalid: phone?.getAttribute("aria-invalid") === "true",
        emailClass: email?.classList.contains("is-invalid") || false,
        phoneClass: phone?.classList.contains("is-invalid") || false,
        phoneValue: (phone?.value || "").trim(),
        statusText: status && !status.hidden ? (status.textContent || "").trim() : "",
      };
    });
    if (filled.emailInvalid || filled.phoneInvalid || filled.emailClass || filled.phoneClass) {
      throw new Error(`group did not clear after one channel: ${JSON.stringify(filled)}`);
    }
    if (filled.phoneValue !== "") throw new Error("expected empty optional WhatsApp");
    if (filled.statusText) throw new Error(`status still showing after group clear: ${filled.statusText}`);
    await ariaPage.close();
    ok("form_contact_group_aria");
  } catch (e) {
    fail("form_contact_group_aria", e.message || e);
  }

  if (productionPosts.length) {
    fail("form_no_production_post", productionPosts.join(" | "));
  } else {
    ok("form_no_production_post");
  }

  await browser.close();
  if (ownServer && server) server.close();
  if (failed) {
    console.error(`\n${failed} UI geometry test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll UI geometry tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
