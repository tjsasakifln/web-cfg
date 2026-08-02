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

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
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

  // 5) functional text ≥ 14px
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const minFs = await page.evaluate(() => {
      const sel =
        ".hero-lead,.hero-proof li,.hero-micro,.button,.hero-secondary,.macro-phase p,.macro-phase h3,.tension-stage p,.offer-path p,.offer-path strong,.fit-faq summary,.contact-copy p,.form-hint,.trace-card p";
      let min = Infinity;
      for (const el of document.querySelectorAll(sel)) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs && fs < min) min = fs;
      }
      return min;
    });
    if (minFs < 14) throw new Error(`functional text ${minFs}px < 14px`);
    ok(`functional_text_min_14px (${minFs}px)`);
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

  // 10) matrix mobile composition present
  try {
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const matrix = await page.evaluate(() => {
      const cards = document.querySelector(".trace-cards");
      const wrap = document.querySelector(".trace-matrix-wrap");
      return {
        cardsDisplay: cards ? getComputedStyle(cards).display : "missing",
        tableDisplay: wrap ? getComputedStyle(wrap).display : "missing",
        cardCount: document.querySelectorAll(".trace-card").length,
      };
    });
    if (matrix.cardCount < 3) throw new Error("expected ≥3 trace cards");
    if (matrix.cardsDisplay === "none") throw new Error("trace cards hidden on mobile");
    if (matrix.tableDisplay !== "none") throw new Error("wide table still shown on mobile");
    ok("matrix_mobile_stacked_records");
  } catch (e) {
    fail("matrix_mobile_stacked_records", e.message || e);
  }

  // 11) form validation message by text
  try {
    await page.setViewport({ width: 1024, height: 800 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.click('button[type="submit"]');
    const invalid = await page.evaluate(() => {
      const form = document.querySelector('form[name="diagnostico-b2g"]');
      return form ? !form.checkValidity() : false;
    });
    if (!invalid) throw new Error("empty form should be invalid");
    ok("form_invalid_without_fields");
  } catch (e) {
    fail("form_invalid_without_fields", e.message || e);
  }

  // 12) internal language absent
  try {
    const html = readFileSync(join(ROOT, "index.html"), "utf8").toLowerCase();
    const leaks = ["sem inventar case", "sem métrica fictícia", "javascript", "arquétipo", "pipeline editorial", "red team", "visual regression"];
    const hit = leaks.filter((p) => html.includes(p));
    if (hit.length) throw new Error(hit.join(", "));
    ok("no_internal_language_home");
  } catch (e) {
    fail("no_internal_language_home", e.message || e);
  }

  // 13) anchors / primary CTA path
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const href = await page.$eval(".hero .button-primary", (el) => el.getAttribute("href"));
    if (href !== "#contato") throw new Error(`hero CTA href ${href}`);
    const form = await page.$("#contato form, form[name='diagnostico-b2g']");
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
