import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";

const root = resolve(".");
const port = 8831;
const widths = [320, 390, 1440];
const figures = [
  {
    route: "/quantitativos-orcamento-obras/",
    selector: 'img[src$="/assets/quantitativos-orcamento-obras/banco-disciplinas.svg"]',
    mobile: "/assets/quantitativos-orcamento-obras/banco-disciplinas-mobile.svg",
    wide: "/assets/quantitativos-orcamento-obras/banco-disciplinas-wide.svg",
    altTerms: ["estrutura", "memória", "revisão"],
    captionTerms: ["elemento", "memória"],
    assetTerms: ["Quantidades e composições dependem dos documentos do empreendimento."],
  },
  {
    route: "/conteudos/como-contratar-projetos-complementares/",
    selector: '.article-cover img[src$="/assets/conteudos/como-contratar-projetos-complementares.svg"]',
    mobile: "/assets/conteudos/como-contratar-projetos-complementares-mobile.svg",
    wide: "/assets/conteudos/como-contratar-projetos-complementares-wide.svg",
    altTerms: ["três etapas", "preparar", "conferir"],
    captionTerms: ["contratar", "preço"],
    assetTerms: ["Isso só entra com autorização e evidência na proposta."],
  },
];

function routeFile(route) {
  return join(root, route.replace(/^\//, ""), "index.html");
}

function assertSharedPlateContracts() {
  const manifest = JSON.parse(readFileSync(join(root, "seo", "PUBLIC-ARTIFACT-MANIFEST.json"), "utf8"));
  let plateCount = 0;
  const routes = [];
  for (const route of manifest.html_routes) {
    const file = routeFile(route);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, "utf8");
    if (!html.includes("/assets/pranchas/")) continue;
    assert.ok(html.includes('/assets/editorial.css'), `${route}: prancha sem folha editorial`);
    const pictures = [...html.matchAll(/<div\b([^>]*class="[^"]*plate__sheet[^"]*"[^>]*)>\s*(?:<!--[\s\S]*?-->\s*)?<picture\b[^>]*>([\s\S]*?)<\/picture>\s*(?:<!--[\s\S]*?-->\s*)?<\/div>/gi)]
      .filter((match) => match[2].includes("/assets/pranchas/"));
    assert.ok(pictures.length, `${route}: picture de prancha não localizado`);
    routes.push(route);
    for (const [, divAttributes, picture] of pictures) {
      assert.match(divAttributes, /\bclass="[^"]*\bplate__sheet--native-pan\b[^"]*"/, `${route}: viewport sem classe de pan`);
      assert.match(divAttributes, /\btabindex="0"/, `${route}: viewport sem foco por teclado`);
      assert.match(divAttributes, /\brole="group"/, `${route}: viewport sem papel acessível`);
      const refs = [...picture.matchAll(/(?:src|srcset)="([^" ]+\.svg)"/gi)].map((match) => match[1]);
      const mobile = refs.find((ref) => /-mobile\.svg$/i.test(ref));
      assert.ok(mobile, `${route}: variante móvel ausente`);
      const mobileMeta = svgMetrics(mobile);
      assert.ok(mobileMeta.minFont * 360 / mobileMeta.viewBoxWidth >= 11.9, `${route}: variante móvel ilegível em largura nativa`);
      const desktop = refs.find((ref) => ref !== mobile);
      if (desktop) {
        const desktopMeta = svgMetrics(desktop);
        assert.ok(desktopMeta.minFont * 1372 / desktopMeta.viewBoxWidth >= 11.9, `${route}: variante desktop ilegível no viewport compartilhado`);
      }
      plateCount += 1;
    }
  }
  assert.ok(plateCount >= 20, `censo de pranchas incompleto: ${plateCount}`);
  return { plateCount, routes };
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function svgMetrics(asset) {
  const source = readFileSync(join(root, asset.replace(/^\//, "")), "utf8");
  const viewBox = /\bviewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/i.exec(source);
  assert.ok(viewBox, `${asset}: viewBox ausente`);
  const fontSizes = [
    ...[...source.matchAll(/font-size\s*[:=]\s*["']?([\d.]+)(?:px)?/gi)].map((match) => Number(match[1])),
    ...[...source.matchAll(/\bfont\s*:\s*[^;{}]*?([\d.]+)px\b/gi)].map((match) => Number(match[1])),
  ].filter((value) => Number.isFinite(value) && value > 0);
  assert.ok(fontSizes.length, `${asset}: tamanho de texto ausente`);
  return { viewBoxWidth: Number(viewBox[1]), minFont: Math.min(...fontSizes) };
}

function svgVisibleText(asset) {
  return readFileSync(join(root, asset.replace(/^\//, "")), "utf8")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const server = createServer((request, response) => {
  let url = decodeURIComponent((request.url || "/").split("?")[0]);
  if (url.endsWith("/")) url += "index.html";
  const file = join(root, url);
  if (!file.startsWith(`${root}${sep}`) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
  response.end(readFileSync(file));
});

await new Promise((done) => server.listen(port, "127.0.0.1", done));
const chrome = [
  process.env.CHROME_PATH,
  process.env.ProgramFiles && join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean).find(existsSync);
assert.ok(chrome, "Chrome/Chromium não encontrado");

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
let checked = 0;
try {
  const { plateCount: sharedPlateCount, routes: sharedPlateRoutes } = assertSharedPlateContracts();
  checked += sharedPlateCount;
  const page = await browser.newPage();
  for (const width of widths) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    for (const figure of figures) {
      await page.goto(`http://127.0.0.1:${port}${figure.route}`, { waitUntil: "networkidle0", timeout: 30000 });
      const state = await page.$eval(figure.selector, async (image) => {
        image.scrollIntoView({ block: "center" });
        await image.decode().catch(() => undefined);
        const style = getComputedStyle(image);
        const contentAsset = (style.content || "").match(/^url\(["']?([^"')]+)["']?\)$/i)?.[1] || "";
        const asset = new URL(contentAsset || image.currentSrc || image.src, location.href).pathname;
        const box = image.getBoundingClientRect();
        const figureNode = image.closest("figure");
        return {
          asset,
          width: box.width,
          alt: image.alt,
          caption: figureNode?.querySelector("figcaption")?.textContent?.replace(/\s+/g, " ").trim() || "",
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          cssContent: style.content,
        };
      });
      const expected = width <= 390 ? figure.mobile : figure.wide;
      assert.equal(state.asset, expected, `${figure.route}@${width}: variante incorreta (${state.cssContent})`);
      const metrics = svgMetrics(expected);
      const renderedFont = metrics.minFont * state.width / metrics.viewBoxWidth;
      assert.ok(renderedFont >= 11.9, `${figure.route}@${width}: texto efetivo ${renderedFont.toFixed(2)}px`);
      assert.ok(state.pageOverflow <= 1, `${figure.route}@${width}: overflow global ${state.pageOverflow}px`);
      const alt = state.alt.toLocaleLowerCase("pt-BR");
      const caption = state.caption.toLocaleLowerCase("pt-BR");
      for (const term of figure.altTerms) assert.ok(alt.includes(term), `${figure.route}: alt não contém ${term}`);
      for (const term of figure.captionTerms) assert.ok(caption.includes(term), `${figure.route}: legenda não contém ${term}`);
      const assetText = svgVisibleText(expected);
      for (const term of figure.assetTerms) assert.ok(assetText.includes(term), `${expected}: condição aprovada ausente: ${term}`);
      checked += 1;
    }
  }

  // Negative control: suppressing the responsive rule must expose the original illegible 1200px art.
  for (const figure of figures) {
    await page.setViewport({ width: 320, height: 900, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}${figure.route}`, { waitUntil: "networkidle0", timeout: 30000 });
    const negative = await page.$eval(figure.selector, async (image) => {
      image.style.setProperty("content", "normal", "important");
      image.style.setProperty("aspect-ratio", "auto", "important");
      await image.decode().catch(() => undefined);
      const box = image.getBoundingClientRect();
      return { asset: new URL(image.currentSrc || image.src, location.href).pathname, width: box.width };
    });
    const original = svgMetrics(negative.asset);
    const renderedFont = original.minFont * negative.width / original.viewBoxWidth;
    assert.ok(renderedFont < 5, `${figure.route}: controle negativo não reproduziu ilegibilidade (${renderedFont.toFixed(2)}px)`);
    checked += 1;
  }

  // Every public external plate is decoded and measured in the real browser.
  for (const width of [320, 1440]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    for (const route of sharedPlateRoutes) {
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
      const pans = await page.$$eval('.plate__sheet--native-pan img', async (images) => {
        const rows = [];
        for (const image of images) {
          image.scrollIntoView({ block: "center" });
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
          await image.decode().catch(() => undefined);
          const sheet = image.closest(".plate__sheet--native-pan");
          const before = getComputedStyle(sheet, "::before");
          rows.push({
            asset: new URL(image.currentSrc || image.src, location.href).pathname,
            width: image.getBoundingClientRect().width,
            clientWidth: sheet.clientWidth,
            tabIndex: sheet.tabIndex,
            hint: before.content,
            scrollable: sheet.scrollWidth > sheet.clientWidth,
            pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          });
        }
        return rows;
      });
      assert.ok(pans.length, `${route}@${width}: prancha externa não renderizada`);
      const sheets = await page.$$('.plate__sheet--native-pan');
      for (const [index, pan] of pans.entries()) {
        const metrics = svgMetrics(pan.asset);
        const renderedFont = metrics.minFont * pan.width / metrics.viewBoxWidth;
        assert.equal(pan.tabIndex, 0, `${route}@${width}: prancha sem foco por teclado`);
        assert.ok(pan.hint.includes("setas"), `${route}@${width}: prancha sem instrução visível`);
        if (pan.width > pan.clientWidth + 1) assert.ok(pan.scrollable, `${route}@${width}: prancha sem pan nativo`);
        assert.ok(pan.pageOverflow <= 1, `${route}@${width}: pan vazou para a página`);
        assert.ok(renderedFont >= 11.9, `${route}@${width}: ${pan.asset} renderizou ${renderedFont.toFixed(2)}px`);
        if (pan.scrollable) {
          await sheets[index].evaluate(sheet => { sheet.scrollLeft = 0; sheet.focus(); });
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction(index => document.querySelectorAll('.plate__sheet--native-pan')[index].scrollLeft > 0, { timeout: 2500 }, index);
          assert.equal(await page.evaluate(() => window.scrollX), 0, `${route}@${width}: teclado deslocou a página`);
        }
        checked += 1;
      }
    }
  }

  // An area that consumes arrow keys must fail the real keyboard interaction.
  await page.setViewport({ width: 320, height: 900, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/assistencia-tecnica-pericial-engenharia/`, { waitUntil: 'networkidle0' });
  const blockedPan = await page.$('.plate__sheet--native-pan');
  await blockedPan.evaluate(sheet => {
    sheet.scrollLeft = 0;
    sheet.addEventListener('keydown', event => event.preventDefault());
    sheet.focus();
  });
  await page.keyboard.press('ArrowRight');
  await new Promise(done => setTimeout(done, 250));
  assert.equal(await blockedPan.evaluate(sheet => sheet.scrollLeft), 0, 'contraprova deve bloquear pan pelo teclado');
  checked += 1;

  // The expert-report plate carries the smallest desktop source type (10.5px).
  // This browser negative proves that the former 1310px viewport is insufficient.
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/assistencia-tecnica-pericial-engenharia/`, { waitUntil: "networkidle0", timeout: 30000 });
  const forensic = await page.$eval('.plate__sheet--native-pan img', async (image) => {
    image.scrollIntoView({ block: "center" });
    await image.decode().catch(() => undefined);
    const picture = image.closest("picture");
    const measuredWidth = image.getBoundingClientRect().width;
    picture.style.setProperty("width", "1310px", "important");
    const negativeWidth = image.getBoundingClientRect().width;
    return { asset: new URL(image.currentSrc || image.src, location.href).pathname, measuredWidth, negativeWidth };
  });
  const forensicMeta = svgMetrics(forensic.asset);
  assert.ok(forensic.measuredWidth >= 1372, `prancha pericial renderizou só ${forensic.measuredWidth}px`);
  assert.ok(forensicMeta.minFont * forensic.measuredWidth / forensicMeta.viewBoxWidth >= 11.9, "prancha pericial abaixo do piso legível");
  assert.ok(forensicMeta.minFont * forensic.negativeWidth / forensicMeta.viewBoxWidth < 11.9, "controle negativo 1310px deveria reprovar a prancha pericial");
  checked += 1;
  await page.close();
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}

console.log(`OK svg figure legibility: ${checked} checks; widths ${widths.join(", ")}; negative controls 3; keyboard pan verified`);
