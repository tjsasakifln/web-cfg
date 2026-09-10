/**
 * The home web font (Archivo) is loaded with font-display:swap. On the edge,
 * when the font arrives after first paint, the swap reflows the hero and
 * measured CLS 0.065-0.068 (netcup-release run 34517284468) while the lab,
 * where the font arrives first, measured 0. The fix is a metric-matched local
 * fallback face ("Archivo Fallback") whose overrides are derived from the real
 * font file. This gate keeps the three parts consistent:
 *   1. the fallback face exists, with all four overrides, and every Archivo
 *      stack names it right after "Archivo Var";
 *   2. the override numbers still match the shipped woff2 (recomputed with
 *      fontTools, so a font update cannot leave stale metrics behind);
 *   3. in a browser that has one of the local fonts, blocking the woff2 must
 *      not move the hero blocks by more than a couple of pixels.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const css = readFileSync(join(ROOT, "assets/home-10x.css"), "utf8");
const FONT = "assets/archivo-var-latin-bf6e041e.woff2";

// 1. Static contract.
const face = css.match(/@font-face\{[^}]*font-family:"Archivo Fallback";[^}]*\}/);
assert.ok(face, "home-10x.css must declare the metric-matched fallback face");
const descriptor = (name) => Number((face[0].match(new RegExp(`${name}:([0-9.]+)%`)) || [])[1]);
const sizeAdjust = descriptor("size-adjust");
const ascent = descriptor("ascent-override");
const descent = descriptor("descent-override");
const lineGap = descriptor("line-gap-override");
for (const [name, value] of Object.entries({ sizeAdjust, ascent, descent, lineGap })) {
  assert.ok(Number.isFinite(value), `fallback face must declare ${name}`);
}
assert.match(face[0], /local\("Liberation Sans"\)/, "the CI runner has Liberation Sans; it must be a source");
// Stacks only: the @font-face declaration itself also says font-family:"Archivo Var".
const stacks = (css.match(/font-family:"Archivo Var"[^;]*;/g) || []).filter((stack) => stack !== 'font-family:"Archivo Var";');
assert.ok(stacks.length >= 3, "expected the Archivo stacks in home-10x.css");
for (const stack of stacks) {
  assert.match(stack, /^font-family:"Archivo Var","Archivo Fallback",/, `stack must name the fallback right after Archivo: ${stack}`);
}

// 2. The numbers track the font file.
const metrics = JSON.parse(execFileSync("python3", ["-c", `
import json
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
f=TTFont(${JSON.stringify(join(ROOT, FONT))})
inst=instancer.instantiateVariableFont(f,{"wght":400,"wdth":100})
cmap=inst.getBestCmap(); hmtx=inst["hmtx"]; upm=inst["head"].unitsPerEm
arial={'a':1139,'b':1139,'c':1024,'d':1139,'e':1139,'f':569,'g':1139,'h':1139,'i':455,'j':455,'k':1024,'l':455,'m':1706,'n':1139,'o':1139,'p':1139,'q':1139,'r':682,'s':1024,'t':569,'u':1139,'v':1024,'w':1479,'x':1024,'y':1024,'z':1024,' ':569}
freq={'a':14.6,'e':12.6,'o':10.7,'s':7.8,'r':6.5,'i':6.2,'n':5.0,'d':5.0,'m':4.7,'u':4.6,'t':4.3,'c':3.9,'l':2.8,'p':2.5,'v':1.7,'g':1.3,'h':1.3,'q':1.2,'b':1.0,'f':1.0,'z':0.5,'j':0.4,'x':0.2,'k':0.02,'w':0.01,'y':0.01,' ':18.0}
tot=sum(freq.values())
arch=sum(freq[c]*hmtx[cmap[ord(c)]][0]/upm for c in freq)/tot
ari=sum(freq[c]*arial[c]/2048 for c in freq)/tot
sa=arch/ari; os2=inst["OS/2"]
print(json.dumps({"size_adjust":sa*100,"ascent":os2.sTypoAscender/upm/sa*100,"descent":-os2.sTypoDescender/upm/sa*100,"line_gap":os2.sTypoLineGap/upm/sa*100}))
`], { encoding: "utf8" }));
const close = (a, b, tol = 0.15) => Math.abs(a - b) <= tol;
assert.ok(close(sizeAdjust, metrics.size_adjust), `size-adjust ${sizeAdjust} vs font ${metrics.size_adjust.toFixed(2)}`);
assert.ok(close(ascent, metrics.ascent), `ascent-override ${ascent} vs font ${metrics.ascent.toFixed(2)}`);
assert.ok(close(descent, metrics.descent), `descent-override ${descent} vs font ${metrics.descent.toFixed(2)}`);
assert.ok(close(lineGap, metrics.line_gap), `line-gap-override ${lineGap} vs font ${metrics.line_gap.toFixed(2)}`);

// 3. Browser: blocking the web font must not move the hero.
// CI serves the built artifact; FONT_FALLBACK_SOURCE=1 serves the source tree
// (for a checkout whose _site predates the stylesheet under test).
const siteRoot = process.env.FONT_FALLBACK_SOURCE !== "1" && existsSync(join(ROOT, "_site", "index.html")) ? join(ROOT, "_site") : ROOT;
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = join(siteRoot, p);
  if (!file.startsWith(siteRoot) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ["--no-sandbox", "--disable-gpu"] });
try {
  const measure = async (blockFont) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (blockFont && request.url().endsWith(".woff2")) request.abort();
      else request.continue();
    });
    await page.goto(`${base}/`, { waitUntil: "networkidle0" });
    // fonts.check() answers true when no face matches, so ask the face itself:
    // a local() source that does not exist on this machine ends in "error".
    const out = await page.evaluate(async () => {
      const fallback = [...document.fonts].find((face) => face.family.replace(/"/g, "") === "Archivo Fallback");
      if (fallback) { try { await fallback.load(); } catch { /* status becomes error */ } }
      return {
      fallbackDeclared: Boolean(fallback),
      fallbackAvailable: fallback?.status === "loaded",
      archivoLoaded: document.fonts.check('16px "Archivo Var"'),
      deliverable: document.querySelector(".hero-deliverable")?.getBoundingClientRect().height,
      actionsTop: document.querySelector(".hero-actions")?.getBoundingClientRect().top,
      h1: document.querySelector(".hero h1")?.getBoundingClientRect().height,
      };
    });
    await page.close();
    return out;
  };
  const withFont = await measure(false);
  const withoutFont = await measure(true);
  assert.equal(withFont.archivoLoaded, true, "Archivo must load normally");
  assert.equal(withoutFont.fallbackDeclared, true, "the served stylesheet must declare the fallback face");
  if (!withoutFont.fallbackAvailable) {
    console.log("FONT_FALLBACK_METRICS_OK static+metrics; browser step skipped: no Arial/Liberation Sans/Helvetica on this machine");
  } else {
    const drift = Math.abs(withFont.actionsTop - withoutFont.actionsTop);
    const deliverableDrift = Math.abs(withFont.deliverable - withoutFont.deliverable);
    assert.ok(drift <= 4 && deliverableDrift <= 4, `hero moves ${drift.toFixed(1)}px (deliverable ${deliverableDrift.toFixed(1)}px) when the web font is late`);
    console.log("FONT_FALLBACK_METRICS_OK", JSON.stringify({ drift, deliverableDrift, withFont, withoutFont }));
  }
} finally {
  await browser.close();
  server.close();
}
