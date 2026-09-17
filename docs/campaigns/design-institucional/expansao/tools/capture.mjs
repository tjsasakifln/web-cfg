// Captura de evidência visual (SALTO-INSTITUCIONAL-02). puppeteer-core + Chromium do repositório.
//   node docs/campaigns/design-institucional/expansao/tools/capture.mjs --base http://127.0.0.1:8740 \
//        --out docs/campaigns/design-institucional/expansao/evidence/lote-a --tag lote-a /rota-1/ /rota-2/
// Gera <slug>-<vw>x<vh>-fold-<tag>.jpg e -full-<tag>.jpg em 390x844 e 1440x1000 (cache desativado,
// fontes carregadas, content-visibility forçado visível, imagens lazy decodificadas), mais
// <slug>-390x844-menu-<tag>.jpg com o menu aberto, e grava manifest-<tag>.json com overflow em 320 px.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "../../../../../scripts/site/resolve_chrome.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt("--base", "http://127.0.0.1:8740");
const OUT = opt("--out", "docs/campaigns/design-institucional/expansao/evidence/tmp");
const TAG = opt("--tag", "cand");
const ROUTES = argv.filter((a, i) => a.startsWith("/") && !argv[i - 1]?.startsWith("--"));
if (!ROUTES.length) { console.error("no routes"); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const VIEWPORTS = [[390, 844], [1440, 1000]];
const slug = (r) => (r === "/" ? "home" : r.replace(/^\/|\/$/g, "").replace(/[\/#?=&]+/g, "-"));
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] });
const manifestPath = join(OUT, `manifest-${TAG}.json`);
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { base: BASE, tag: TAG, captures: [] };
async function settle(page) {
  await page.evaluate(async () => {
    document.querySelectorAll("*").forEach((el) => { const cs = getComputedStyle(el); if (cs.contentVisibility && cs.contentVisibility !== "visible") el.style.contentVisibility = "visible"; });
    document.querySelectorAll("img[loading=lazy]").forEach((img) => { img.loading = "eager"; });
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, document.body.scrollHeight); await new Promise((r) => setTimeout(r, 250)); window.scrollTo(0, 0); for (let i = 0; i < 20 && window.scrollY > 0; i++) await new Promise((r) => setTimeout(r, 50));
  });
}
for (const route of ROUTES) {
  const s = slug(route);
  for (const [w, h] of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    const res = await page.goto(BASE + route, { waitUntil: "networkidle0", timeout: 60000 });
    await settle(page);
    const fontH1 = await page.evaluate(() => { const h = document.querySelector("h1"); return h ? getComputedStyle(h).fontFamily.split(",")[0] : null; });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const fold = join(OUT, `${s}-${w}x${h}-fold-${TAG}.jpg`);
    const full = join(OUT, `${s}-${w}x${h}-full-${TAG}.jpg`);
    await page.screenshot({ path: fold, type: "jpeg", quality: 70 });
    await page.screenshot({ path: full, type: "jpeg", quality: 70, fullPage: true });
    const rec = { route, viewport: `${w}x${h}`, status: res?.status(), height, h1_font: fontH1, fold, full };
    if (w === 390) {
      const toggle = await page.$(".menu-toggle, [aria-controls][aria-expanded]");
      if (toggle) { await toggle.click(); await new Promise((r) => setTimeout(r, 400)); const menu = join(OUT, `${s}-390x844-menu-${TAG}.jpg`); await page.screenshot({ path: menu, type: "jpeg", quality: 70 }); rec.menu = menu; }
    }
    manifest.captures = manifest.captures.filter((c) => !(c.route === route && c.viewport === rec.viewport));
    manifest.captures.push(rec);
    await page.close();
  }
  const p = await browser.newPage();
  await p.setViewport({ width: 320, height: 700 });
  await p.goto(BASE + route, { waitUntil: "networkidle0", timeout: 60000 });
  await settle(p);
  const overflow = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  manifest.captures.push({ route, viewport: "320x700", overflow_px: overflow });
  await p.close();
  console.log(`${route} ok (overflow320=${overflow}px)`);
}
await browser.close();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("manifest", manifestPath);
