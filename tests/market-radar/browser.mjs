import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const chrome = process.env.CHROME_PATH;
if (!chrome || !existsSync(chrome)) throw new Error("CHROME_PATH obrigatório");
const buyer = "0123456789abcdef01234567";
const supplier = "89abcdef0123456789012345";
const validPnpc = "https://pncp.gov.br/app/contratos/46068425000133/2026/9335";
const requests = [];
const radarSource = readFileSync(join(root, "assets/market-radar/radar.mjs"), "utf8")
  .replace('"/assets/js/tool-credits.mjs"', '"/assets/market-radar/credits-fixture.mjs"');
const creditsFixture = `export async function exportToolResult({toolId, format, content, deliver}) {
  const text = await content.text();
  window.__radarExports ??= [];
  window.__radarExportBlob = content;
  window.__radarExports.push({toolId, format, bytes: content.size, text});
  if (window.__radarWalletEnabled) {
    await new Promise((resolve) => { window.__releaseRadarAuthorization = resolve; });
    window.__radarAuthorized = true;
    return deliver();
  }
  const {exportToolResult: canonicalExport} = await import('/assets/js/tool-credits.mjs');
  return canonicalExport({toolId, format, content, deliver});
}`;

function result(filters, stale = false) {
  return { ok: true, meta: { generated_at: "2026-11-09T12:00:00Z", source_as_of: "2026-11-09T11:00:00Z", ingestion_latest_at: "2026-11-09T11:50:00Z", window_start: "2025-11-09", window_end: "2026-11-09", stale, excluded_count: 2, coverage_note: "Cobertura local de teste.", value_note: "Não totalize valores." }, filters, summary: { contracts: 501, buyers: 1, suppliers: 1, valued_contracts: 1 }, buyers: [{ id: buyer, name: "Órgão teste", contracts: 2, uf: "SC" }], suppliers: [{ id: supplier, name: "Fornecedor teste", contracts: 2, uf: "SC" }], records: [{ object: filters.q === "new" ? "Objeto novo" : "  =formula <img src=x onerror=alert(1)>", buyer_name: "Órgão teste", supplier_name: "Fornecedor teste", uf: "SC", city: "Florianópolis", value: null, published_at: null, ends_at: null, source_url: validPnpc }, { object: "sem link", buyer_name: "Órgão teste", supplier_name: "Fornecedor teste", uf: "SC", value: "9000000000000000.01", published_at: "2026-11-01", ends_at: "2027-01-01", source_url: "https://example.invalid/contract" }], pagination: { page: Number(filters.page || 1), pages: 21, total: 501, limited: true } };
}

const types = { ".html": "text/html", ".mjs": "text/javascript", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".png": "image/png" };
const server = createServer((req, res) => {
  if (req.url === "/api/web/tool-credits?op=config") { res.writeHead(200, { "content-type": "application/json" }); res.end('{"enabled":false}'); return; }
  if (req.url === "/assets/market-radar/radar.mjs") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(radarSource); return; }
  if (req.url === "/assets/market-radar/credits-fixture.mjs") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(creditsFixture); return; }
  if (req.url === "/api/web/market-radar") {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const filters = JSON.parse(raw || "{}"); requests.push(filters);
      if (filters.q === "failure") { res.writeHead(503, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false })); return; }
      if (filters.q === "stale") { res.writeHead(503, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "data_stale" })); return; }
      setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(result(filters, filters.q === "stale"))); }, filters.q === "old" ? 120 : filters.q === "timeout" ? 600 : 0);
    }); return;
  }
  const route = req.url === "/" ? "/ferramentas/radar-mercado-publico/" : req.url.split("?")[0];
  const file = join(root, normalize(route).replace(/^[/\\]+/, "") + (route.endsWith("/") ? "index.html" : ""));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => original(fn, ms >= 12_000 ? 300 : ms, ...args);
    window.__radarBlobs = []; const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__radarBlobs.push({ blob, authorized: Boolean(window.__radarAuthorized) }); return create(blob); };
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (value) => { window.__copiedRadar = value; } } });
  });
  await page.setViewport({ width: 1280, height: 900 });
  const url = `http://127.0.0.1:${server.address().port}/ferramentas/radar-mercado-publico/`;
  await page.goto(url, { waitUntil: "networkidle0" });
  assert.equal(await page.$eval("#radar-fields", (e) => e.disabled), false);
  await page.select("#radar-uf", "SC"); await page.select("#radar-months", "24"); await page.select("#radar-ending", "90"); await page.select("#radar-sort", "ending");
  await page.click("[data-example='limpeza']"); await page.waitForSelector("#radar-results:not([hidden])");
  assert.deepEqual(requests.at(-1), { q: "limpeza", uf: "SC", months: "24", ending: "90", sort: "ending", page: 1 });
  assert.match(await page.$eval("#radar-meta", (e) => e.textContent), /Projeção preparada.*Base consultada.*Última observação/s);
  assert.equal(await page.$eval("#radar-records-body", (e) => e.textContent.includes("1970") || e.textContent.includes("R$ 0")), false);
  assert.match(await page.$eval("#radar-records-body", (e) => e.textContent), /9\.000\.000\.000\.000\.000,01/, "decimal cents remain exact above Number precision");
  assert.equal(await page.$eval("#radar-records-body", (e) => e.querySelectorAll("img").length), 0, "record text is escaped");
  assert.equal(await page.$eval("#radar-records-body", (e, href) => e.querySelectorAll(`a[href="${href}"]`).length, validPnpc), 1, "official PNCP link remains usable");
  assert.equal(await page.$eval("#radar-records-body", (e) => e.textContent.includes("example.invalid")), false, "untrusted link omitted");
  const targetGeometry = async () => page.evaluate(() => ({ overflow: document.documentElement.scrollWidth <= innerWidth, heights: [...document.querySelectorAll(".radar-ranking button,.radar-pagination button")].map((button) => button.getBoundingClientRect().height) }));
  let geometry = await targetGeometry(); assert.equal(geometry.overflow, true); assert.ok(geometry.heights.length > 0 && geometry.heights.every((height) => height >= 43), `desktop dynamic targets: ${geometry.heights.join(",")}`);
  for (let expected = 2; expected <= 21; expected += 1) {
    const before = requests.length;
    await page.$eval("#radar-pagination button:last-child", (e) => e.click());
    let current = "";
    for (let tries = 0; current !== String(expected) && tries < 40; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      current = await page.$eval("#radar-pagination [aria-current]", (e) => e.textContent);
    }
    assert.equal(current, String(expected), `page ${expected} renders before the next click`);
    assert.equal(requests.at(-1).page, expected, `page ${expected} reaches the API`);
  }
  assert.equal(requests.at(-1).page, 21, "page 21 reaches API");
  await page.$eval("#radar-pagination button:first-child", (e) => e.click()); await page.waitForFunction(() => document.querySelector("#radar-pagination [aria-current]")?.textContent === "20"); assert.equal(requests.at(-1).page, 20);
  await page.$eval("#radar-buyers button", (e) => e.click()); await page.waitForFunction(() => !document.querySelector("#radar-clear-entity").hidden); assert.equal(requests.at(-1).buyer, buyer);
  await page.$eval("#radar-clear-entity", (e) => e.click()); await page.waitForFunction(() => document.querySelector("#radar-clear-entity").hidden); assert.equal("buyer" in requests.at(-1), false);
  await page.$eval("#radar-suppliers button", (e) => e.click()); await page.waitForFunction(() => !document.querySelector("#radar-clear-entity").hidden); assert.equal(requests.at(-1).supplier, supplier);
  await page.$eval("#radar-clear-entity", (e) => e.click()); await page.waitForFunction(() => document.querySelector("#radar-clear-entity").hidden);
  await page.$eval("#radar-csv", (e) => e.click()); await page.waitForFunction(() => window.__radarBlobs.length === 1);
  const offExport = await page.evaluate(async () => ({ export: window.__radarExports.at(-1), csv: await window.__radarBlobs.at(-1).blob.text(), bytes: (await window.__radarBlobs.at(-1).blob.arrayBuffer()).byteLength, sameBlob: window.__radarBlobs.at(-1).blob === window.__radarExportBlob, authorized: window.__radarBlobs.at(-1).authorized }));
  assert.equal(offExport.authorized, false, "disabled shared wallet keeps the compatible local download");
  assert.deepEqual(Object.keys(offExport.export).sort(), ["bytes", "format", "text", "toolId"]);
  assert.equal(offExport.export.toolId, "radar-mercado-publico"); assert.equal(offExport.export.format, "csv"); assert.equal(offExport.export.bytes, offExport.bytes); assert.equal(offExport.sameBlob, true);
  const csv = offExport.csv;
  assert.match(csv, /"'  =formula <img src=x onerror=alert\(1\)>"/, "CSV escapes leading-space formula"); assert.match(csv, /"https:\/\/pncp\.gov\.br\/app\/contratos\/46068425000133\/2026\/9335"/);
  assert.match(await page.$eval("#radar-export-note", (e) => e.textContent), /Consulta e rankings são livres.*1 crédito.*primeira.*cortesia/i);
  const walletPage = await browser.newPage();
  await walletPage.evaluateOnNewDocument(() => {
    window.__radarWalletEnabled = true;
    window.__radarBlobs = []; const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__radarBlobs.push({ blob, authorized: Boolean(window.__radarAuthorized) }); return create(blob); };
  });
  await walletPage.goto(url, { waitUntil: "networkidle0" });
  await walletPage.click("[data-example='limpeza']"); await walletPage.waitForSelector("#radar-results:not([hidden])");
  await walletPage.$eval("#radar-csv", (e) => e.click()); await walletPage.waitForFunction(() => window.__radarExports?.length === 1);
  const frozenWalletCsv = await walletPage.evaluate(() => window.__radarExports.at(-1).text);
  await walletPage.$eval("#radar-q", (e) => { e.value = "new"; }); await walletPage.$eval("#market-radar-form", (e) => e.requestSubmit());
  await walletPage.waitForFunction(() => document.querySelector("#radar-result-title")?.textContent.includes("new"));
  assert.equal(await walletPage.evaluate(() => window.__radarBlobs.length), 0, "no delivery URL before authorization is released");
  await walletPage.evaluate(() => window.__releaseRadarAuthorization()); await walletPage.waitForFunction(() => window.__radarBlobs.length === 1);
  const walletExport = await walletPage.evaluate(async () => ({ export: window.__radarExports.at(-1), csv: await window.__radarBlobs.at(-1).blob.text(), bytes: (await window.__radarBlobs.at(-1).blob.arrayBuffer()).byteLength, sameBlob: window.__radarBlobs.at(-1).blob === window.__radarExportBlob, authorized: window.__radarBlobs.at(-1).authorized }));
  assert.equal(walletExport.authorized, true, "shared-wallet fixture authorizes before delivery creates the URL");
  assert.equal(walletExport.export.toolId, "radar-mercado-publico"); assert.equal(walletExport.export.format, "csv");
  assert.equal(walletExport.export.bytes, walletExport.bytes); assert.equal(walletExport.sameBlob, true, "the authorized delivery closes over the exact pre-authorized Blob");
  assert.equal(walletExport.csv, frozenWalletCsv, "a later search cannot alter the authorized CSV"); assert.equal(walletExport.csv, walletExport.export.text);
  await walletPage.close();
  await page.$eval("#radar-copy", (e) => e.click()); assert.equal(await page.evaluate(() => window.__copiedRadar), url, "copy excludes query");
  mkdirSync(join(root, "build/reports/market-radar"), { recursive: true }); await page.screenshot({ path: join(root, "build/reports/market-radar/desktop-1280.png"), fullPage: true });
  await page.setViewport({ width: 375, height: 820 }); geometry = await targetGeometry(); assert.equal(geometry.overflow, true); assert.ok(geometry.heights.length > 0 && geometry.heights.every((height) => height >= 43), `mobile dynamic targets: ${geometry.heights.join(",")}`); await page.screenshot({ path: join(root, "build/reports/market-radar/mobile-375.png"), fullPage: true }); await page.setViewport({ width: 1280, height: 900 });
  const submit = async (q) => { await page.$eval("#radar-q", (e, value) => { e.value = value; }, q); await page.$eval("#market-radar-form", (e) => e.requestSubmit()); };
  await submit("old"); await submit("new"); await page.waitForFunction(() => document.querySelector("#radar-result-title").textContent.includes("new")); await new Promise((resolve) => setTimeout(resolve, 150)); assert.match(await page.$eval("#radar-result-title", (e) => e.textContent), /new/, "late response cannot replace newer result");
  await submit("failure"); await page.waitForFunction(() => document.querySelector("#radar-status").textContent.includes("Não foi possível")); assert.equal(await page.$eval("#radar-results", (e) => e.hidden), true, "503 not empty result");
  await submit("timeout"); await page.waitForFunction(() => document.querySelector("#radar-status").textContent.includes("demorou demais")); assert.equal(await page.$eval("#radar-results", (e) => e.hidden), true, "timeout terminal state");
  await submit("stale"); await page.waitForFunction(() => document.querySelector("#radar-status").textContent.includes("atrasada")); assert.equal(await page.$eval("#radar-results", (e) => e.hidden), true, "stale fails closed");
  console.log("market-radar browser checks passed");
} finally { await browser.close(); server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); }
