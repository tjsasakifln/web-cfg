import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const root = resolve(".");
const port = Number(process.env.INLINE_SVG_LEGIBILITY_PORT || 8838);
const widths = [320, 390, 699, 700, 768, 1024, 1440];
const routes = [
  { route: "/casos/demonstrativo-infraestrutura/", count: 6 },
  { route: "/casos/demonstrativo-projeto-privado/", count: 5, contourChecks: 2 },
  { route: "/conteudos/bdi-diferenciado-obra-publica/", count: 1 },
];
const downloads = [
  "/casos/demonstrativo-projeto-privado/assets/planta-r00.svg",
  "/casos/demonstrativo-projeto-privado/assets/planta-r01.svg",
];
const mime = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const nonReadRequestsAtServer = [];

const server = createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method || "")) {
    nonReadRequestsAtServer.push({ method: request.method, url: request.url });
    response.writeHead(405); response.end("read-only probe"); return;
  }
  let url = decodeURIComponent((request.url || "/").split("?")[0]);
  if (url.endsWith("/")) url += "index.html";
  const file = join(root, url);
  if (!file.startsWith(`${root}${sep}`) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404); response.end("not found"); return;
  }
  response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
  response.end(readFileSync(file));
});

function assertReadable(state, label) {
  assert.equal(state.outsideCanvas.length, 0, `${label}: texto fora do canvas ${JSON.stringify(state.outsideCanvas)}`);
  assert.equal(state.overlaps.length, 0, `${label}: texto sobreposto ${JSON.stringify(state.overlaps)}`);
  assert.equal(state.missingContourTargets.length, 0, `${label}: alvo de contorno ausente ${JSON.stringify(state.missingContourTargets)}`);
  assert.equal(state.contourOverlaps.length, 0, `${label}: texto sobre contorno ${JSON.stringify(state.contourOverlaps)}`);
  assert.ok(state.texts.length > 0, `${label}: SVG sem texto mensurável`);
  for (const text of state.texts) assert.ok(text.effectivePx >= 12, `${label}: ${text.text} em ${text.effectivePx.toFixed(2)}px`);
}

async function inspect(page, selector) {
  return page.$$eval(selector, (svgs) => svgs.map((svg, svgIndex) => {
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const renderedRect = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const canvas = svg.getBoundingClientRect();
    const texts = [...svg.querySelectorAll("text")].map((node, index) => {
      const style = getComputedStyle(node); const matrix = node.getScreenCTM(); const rect = renderedRect(node);
      return { index, text: node.textContent.trim(), effectivePx: Number.parseFloat(style.fontSize) * Math.hypot(matrix.c, matrix.d), rect };
    });
    const outsideCanvas = texts.filter(({ rect }) => rect.left < canvas.left - .5 || rect.top < canvas.top - .5 || rect.right > canvas.right + .5 || rect.bottom > canvas.bottom + .5).map(({ index, text }) => ({ index, text }));
    const overlaps = [];
    for (let a = 0; a < texts.length; a += 1) for (let b = a + 1; b < texts.length; b += 1) if (overlap(texts[a].rect, texts[b].rect) > .25) overlaps.push({ first: texts[a].text, second: texts[b].text });
    const contours = new Map([...svg.querySelectorAll("[data-legibility-contour]")].map((node) => {
      const matrix = node.getScreenCTM(); const style = getComputedStyle(node); const rect = renderedRect(node);
      const strokeScale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
      const strokeExpansion = Number.parseFloat(style.strokeWidth || "0") * strokeScale / 2;
      return [node.getAttribute("data-legibility-contour"), {
        left: rect.left - strokeExpansion, top: rect.top - strokeExpansion,
        right: rect.right + strokeExpansion, bottom: rect.bottom + strokeExpansion,
      }];
    }));
    const contourOverlaps = []; const missingContourTargets = []; let contourChecks = 0;
    for (const node of svg.querySelectorAll("text[data-legibility-clearance-from]")) {
      const target = node.getAttribute("data-legibility-clearance-from"); const contour = contours.get(target);
      if (!contour) { missingContourTargets.push({ text: node.textContent.trim(), target }); continue; }
      contourChecks += 1;
      const area = overlap(renderedRect(node), contour);
      if (area > .25) contourOverlaps.push({ text: node.textContent.trim(), target, area });
    }
    return { svgIndex, texts, outsideCanvas, overlaps, contourChecks, contourOverlaps, missingContourTargets };
  }));
}

await new Promise((done) => server.listen(port, "127.0.0.1", done));
const localChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await puppeteer.launch({ executablePath: existsSync(localChrome) ? localChrome : resolveChromePath(), headless: true, args: ["--no-sandbox", "--disable-gpu"] });
let checked = 0;
try {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);
  const blocked = [];
  page.on("request", (request) => {
    if (["GET", "HEAD"].includes(request.method())) request.continue();
    else { blocked.push({ method: request.method(), url: request.url() }); request.abort("blockedbyclient"); }
  });
  for (const width of widths) for (const spec of routes) {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    const response = await page.goto(`http://127.0.0.1:${port}${spec.route}`, { waitUntil: "networkidle0", timeout: 30000 });
    assert.equal(response?.status(), 200, `${spec.route}@${width}: HTTP`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const state = await inspect(page, 'svg[role="img"]');
    assert.equal(state.length, spec.count, `${spec.route}@${width}: censo SVG`);
    for (const svg of state) assertReadable(svg, `${spec.route}@${width}#${svg.svgIndex}`);
    assert.equal(state.reduce((sum, svg) => sum + svg.contourChecks, 0), spec.contourChecks || 0, `${spec.route}@${width}: censo texto×contorno`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${spec.route}@${width}: overflow horizontal da página ${overflow}px`);
    checked += state.length;
  }
  assert.ok(blocked.every((row) => row.method === "POST" && new URL(row.url).pathname === "/api/web/collect"), `sonda bloqueou requisição inesperada: ${JSON.stringify(blocked)}`);
  assert.equal(nonReadRequestsAtServer.length, 0, `POST chegou ao servidor da sonda: ${JSON.stringify(nonReadRequestsAtServer)}`);

  // The downloadable R00/R01 plans retain the same non-overlapping source geometry.
  for (const asset of downloads) {
    const response = await page.goto(`http://127.0.0.1:${port}${asset}`, { waitUntil: "networkidle0", timeout: 30000 });
    assert.equal(response?.status(), 200, `${asset}: HTTP`);
    const state = await inspect(page, "svg");
    const labels = state[0].texts.filter((row) => row.text === "HS-01" || row.text === "1,80 m");
    assert.equal(labels.length, 2, `${asset}: rótulos HS/cota`);
    assert.equal(state[0].overlaps.filter((row) => row.first === "HS-01" || row.second === "HS-01").length, 0, `${asset}: HS-01 colide com cota`);
    assert.equal(state[0].contourChecks, 1, `${asset}: censo texto×contorno`);
    assert.equal(state[0].contourOverlaps.length, 0, `${asset}: cota cruza contorno ${JSON.stringify(state[0].contourOverlaps)}`);
    assert.equal(state[0].missingContourTargets.length, 0, `${asset}: alvo de contorno ausente`);
    checked += 1;
  }

  // Controls use the production detector. The contour fixture reproduces the former x=20 shaft collision;
  // the last fixture proves that unmarked backgrounds and grid lines do not create false positives.
  await page.goto(`data:text/html,${encodeURIComponent('<svg id="too-small" viewBox="0 0 320 120" width="320"><text x="10" y="40" font-size="10">pequeno</text></svg><svg id="outside" viewBox="0 0 320 120" width="320"><text x="310" y="40" font-size="12">fora do canvas</text></svg><svg id="overlap" viewBox="0 0 320 120" width="320"><text x="20" y="40" font-size="12">cruzado</text><text x="20" y="40" font-size="12">cruzado</text></svg><svg id="contour" viewBox="0 0 419 384" width="419"><rect x="18" y="150" width="48" height="48" fill="#f3f4f5" stroke="#071a31" stroke-width="1.2" data-legibility-contour="shaft-HS-01"/><text x="20" y="174" text-anchor="middle" font-size="12" data-legibility-clearance-from="shaft-HS-01" transform="rotate(-90 20 174)">1,80 m</text></svg><svg id="decorative" viewBox="0 0 320 120" width="320"><rect width="320" height="120" fill="#fff"/><g stroke="#dfe4e6"><line x1="0" y1="40" x2="320" y2="40"/><line x1="30" y1="0" x2="30" y2="120"/></g><rect x="200" y="20" width="40" height="40" fill="none" stroke="#071a31" data-legibility-contour="shaft-HS-01"/><text x="30" y="44" font-size="12" data-legibility-clearance-from="shaft-HS-01">grade legível</text></svg>')}`);
  const controls = await inspect(page, "svg");
  assert.throws(() => assertReadable(controls[0], "controle de fonte"), /pequeno/, "controle negativo de fonte deveria reprovar pelo mesmo verificador");
  assert.throws(() => assertReadable(controls[1], "controle de canvas"), /fora do canvas/, "controle negativo de canvas deveria reprovar pelo mesmo verificador");
  assert.throws(() => assertReadable(controls[2], "controle de sobreposição"), /sobreposto/, "controle negativo de sobreposição deveria reprovar pelo mesmo verificador");
  assert.throws(() => assertReadable(controls[3], "controle de contorno"), /sobre contorno/, "controle negativo com x=20 deveria reprovar pelo mesmo verificador");
  assert.doesNotThrow(() => assertReadable(controls[4], "controle de linhas decorativas"), "fundo e linhas de grade não marcados não devem gerar falso positivo");
  checked += 5;
  await page.close();
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
console.log(`OK inline SVG legibility: ${checked} SVG checks; widths ${widths.join(", ")}; negative controls 4; decorative-line control 1`);
