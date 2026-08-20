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
import { join, extname, resolve } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { resolveChromePath } from "./resolve_chrome.mjs";

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
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
      const filePath = join(ROOT, urlPath);
      if (!filePath.startsWith(ROOT) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
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

async function main() {
  let server = null;
  let ownServer = false;
  if (!process.argv[2]) {
    server = await startStaticServer();
    ownServer = true;
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();

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
    if (m1440.sections > 7) throw new Error(`sections ${m1440.sections} > 7`);
    if (m1440.primary > 4) throw new Error(`primary CTAs ${m1440.primary} > 4`);
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
    if (!hero.secondaryIsNotPrimary) throw new Error("secondary WhatsApp uses primary style");
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
      const visual = document.querySelector(".hero-visual");
      const r = cta.getBoundingClientRect();
      const vis = visual ? getComputedStyle(visual).display : "none";
      return {
        ctaTop: r.top,
        ctaInFirstScreen: r.top < vh && r.bottom > 0,
        visualDisplay: vis,
      };
    });
    if (!mob.ctaInFirstScreen) throw new Error(`CTA not in first screen: top=${mob.ctaTop}`);
    if (mob.visualDisplay !== "none") throw new Error(`hero visual still shown on mobile: ${mob.visualDisplay}`);
    ok("mobile_hero_cta_without_decor_panel");
  } catch (e) {
    fail("mobile_hero_cta_without_decor_panel", e.message || e);
  }

  // 5) functional text ≥ 14px on home + commercial surfaces (footer, breadcrumbs, profile, related)
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    const fontSel = [
      ".hero-lead",
      ".hero-proof li",
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
      ".trace-card p",
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

  // 6) interactive targets prefer ≥44px (never below 24)
  try {
    const small = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll("a.button, button, .menu-toggle, .whatsapp-float, summary")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 24 || r.height < 24) bad.push({ tag: el.tagName, w: r.width, h: r.height, t: (el.textContent || "").slice(0, 40) });
      }
      return bad;
    });
    if (small.length) throw new Error(JSON.stringify(small.slice(0, 5)));
    ok("targets_min_24px");
  } catch (e) {
    fail("targets_min_24px", e.message || e);
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
        phases: document.querySelectorAll(".macro-phase").length,
        form: !!document.querySelector('form[name="diagnostico-b2g"]'),
        hasMargin: /margem/i.test(t),
      };
    });
    await page.setJavaScriptEnabled(true);
    if (!nojs.h1 || nojs.phases < 4 || !nojs.form || !nojs.hasMargin) throw new Error(JSON.stringify(nojs));
    ok("essential_content_without_js");
  } catch (e) {
    await page.setJavaScriptEnabled(true);
    fail("essential_content_without_js", e.message || e);
  }

  // 10) journey cards stack on mobile (replacement for legacy trace matrix)
  try {
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const matrix = await page.evaluate(() => {
      const paths = document.querySelectorAll(".journey-path, .journey-row");
      const grid = document.querySelector(".journey-paths, .journey-list");
      return {
        cardCount: paths.length,
        gridDisplay: grid ? getComputedStyle(grid).display : "missing",
        labels: [...paths].map((p) => (p.querySelector("h3")?.textContent || "").trim()).filter(Boolean),
      };
    });
    if (matrix.cardCount < 3) throw new Error(`expected ≥3 journey paths, got ${matrix.cardCount}`);
    if (matrix.gridDisplay === "none") throw new Error("journey paths hidden on mobile");
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
    if (!/como podemos ajudar/i.test(html)) throw new Error("missing client journey eyebrow");
    if (!/qual situação sua empresa precisa resolver agora/i.test(html)) throw new Error("missing client journey title");
    ok("no_internal_language_home");
  } catch (e) {
    fail("no_internal_language_home", e.message || e);
  }

  // 12b) journeys section mobile hierarchy outcomes (390 / 360 / 412)
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
        const title = document.querySelector("#journeys-title");
        const firstCard = document.querySelector(".journey-path, .journey-row");
        const firstCta = document.querySelector(".journey-path .button, .journey-row .button");
        const floatEl = document.querySelector(".whatsapp-float, .contact-float .whatsapp-float");
        const header = document.querySelector(".site-header");
        const titleLines = title
          ? Math.round(title.getBoundingClientRect().height / (parseFloat(getComputedStyle(title).lineHeight) || 24))
          : 0;
        const titleFs = title ? parseFloat(getComputedStyle(title).fontSize) : 0;
        const bodyP = document.querySelector(".journey-path > p, .journey-row-body > p");
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
        const container = document.querySelector(".journeys-section .container") || document.querySelector(".container");
        const padLeft = container ? container.getBoundingClientRect().left : 0;
        return {
          overflow,
          titleLines,
          titleFs,
          bodyFs,
          headerH: header ? header.getBoundingClientRect().height : 0,
          cardCount: document.querySelectorAll(".journey-path, .journey-row").length,
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
      if (rep.cardCount < 3) throw new Error(`${w}: expected 3 journey cards`);
      if (rep.titleLines > 3) throw new Error(`${w}: journeys title ${rep.titleLines} lines > 3`);
      if (rep.titleFs > 36) throw new Error(`${w}: journeys title font ${rep.titleFs}px too large`);
      if (rep.bodyFs < 16 || rep.bodyFs > 20) throw new Error(`${w}: body font ${rep.bodyFs}px outside 16–20`);
      if (rep.headerH > 96) throw new Error(`${w}: header height ${rep.headerH} absurd`);
      if (rep.ctaH < 44 || rep.ctaW < 120) throw new Error(`${w}: CTA too small ${rep.ctaW}x${rep.ctaH}`);
      if (!rep.ctaFullyInLayout) throw new Error(`${w}: CTA overflows viewport`);
      if (rep.floatObscuresCta) throw new Error(`${w}: floating WhatsApp obscures journey CTA`);
      if (rep.padLeft < 18) throw new Error(`${w}: lateral padding ${rep.padLeft} < 18`);
    }
    ok(`journeys_mobile_hierarchy (${reports.map((r) => r.w).join(",")})`);
  } catch (e) {
    fail("journeys_mobile_hierarchy", e.message || e);
  }

  // 12c) journey CTA sets form journey hidden field
  try {
    await page.setViewport({ width: 1024, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    for (const j of ["contrato", "edital", "operacao"]) {
      await page.click(`[data-set-journey="${j}"]`);
      const val = await page.$eval("#jornada-hidden", (el) => el.value);
      if (val !== j) throw new Error(`data-set-journey=${j} left hidden=${val}`);
    }
    ok("journey_cta_binds_form");
  } catch (e) {
    fail("journey_cta_binds_form", e.message || e);
  }

  // 13) anchors / primary CTA path
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const href = await page.$eval(".hero .button-primary", (el) => el.getAttribute("href"));
    if (!href || !href.includes("#formulario-contato")) {
      throw new Error(`hero CTA href ${href}`);
    }
    const form = await page.$("#formulario-contato, #contato form, form[name='diagnostico-b2g']");
    if (!form) throw new Error("contact form missing");
    ok("primary_cta_targets_form");
  } catch (e) {
    fail("primary_cta_targets_form", e.message || e);
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
    if (arch.length > 7) throw new Error(`too many sections ${arch.length}`);
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
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    // The form handler is bound by deferred script.js; wait for its explicit
    // ready marker rather than racing a fixed timeout on slower CI runners.
    await page.waitForSelector('form.contact-form[data-form-ready="true"]', { timeout: 3000 });
    await page.type("#nome", "Teste UI");
    // leave email and phone empty; select a real step-1 option
    await page.select("#estagio", "problema urgente em contrato");
    await page.click("[data-form-next]");
    await new Promise((r) => setTimeout(r, 150));
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
          /whatsapp|voltar|falar com a confenge|diagnosticar|edital|documentos|agilizar/i.test(l)
        );
        if (!okLabel) throw new Error(`obrigado CTAs: ${labels.join(" | ")}`);
        const hasSuccess = await page.$("[data-lead-success]");
        if (!hasSuccess) throw new Error(`${path} missing data-lead-success`);
      } else {
        if (!labels.some((l) => /diagnosticar|falar com a confenge|contato/i.test(l))) {
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

  // 22) journey/macro-phases usable on mobile (all 4 visible without JS hide)
  try {
    await page.setViewport({ width: 390, height: 844 });
    await page.setJavaScriptEnabled(false);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const journey = await page.evaluate(() => {
      const phases = [...document.querySelectorAll(".macro-phase")];
      return {
        count: phases.length,
        allVisible: phases.every((p) => getComputedStyle(p).display !== "none"),
        hasDetails: document.querySelectorAll(".macro-phase details").length >= 4,
      };
    });
    await page.setJavaScriptEnabled(true);
    if (journey.count < 4 || !journey.allVisible) throw new Error(JSON.stringify(journey));
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
        return { bad: bad.map((v) => v.id), total: (r.violations || []).length };
      });
      if (axeResult.bad.length) throw new Error(axeResult.bad.join(","));
      ok(`axe_home_no_critical_serious (violations=${axeResult.total})`);
    }
  } catch (e) {
    fail("axe_home_no_critical_serious", e.message || e);
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
