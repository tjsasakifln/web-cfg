/** Exercise the deferred viewer runtime, including example failure/retry and local files. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const publicRoot = resolve(process.argv[2] || join(ROOT, "_site"));
assert.ok(existsSync(join(publicRoot, "bim", "web", "visualizador.html")), "built BIM viewer artifact is missing");

const mime = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".ifc": "text/plain", ".woff2": "font/woff2", ".wasm": "application/wasm" };
let exampleAttempts = 0;
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/bim/examples/modelo-piloto.ifc" && ++exampleAttempts === 1) {
    response.writeHead(503); response.end("temporary test failure"); return;
  }
  const file = resolve(publicRoot, `.${pathname}`);
  if (!file.startsWith(publicRoot + sep)) {
    response.writeHead(400); response.end(); return;
  }
  try { const body = readFileSync(file); response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" }); response.end(body); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();
  const threeRequests = [];
  page.on("request", (request) => { if (request.url().includes("/vendor/three/")) threeRequests.push(request.url()); });
  await page.goto(`http://127.0.0.1:${port}/bim/web/visualizador.html`, { waitUntil: "networkidle0" });
  assert.equal(threeRequests.length, 0, "Three must not load before an open action");

  await page.click("#exemplo");
  await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("exemplo não está disponível"));
  await page.click("#exemplo");
  await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("modelo-piloto.ifc ·"));
  assert.ok(threeRequests.length > 0, "Three must load after an example open action");

  await page.click("#fechar");
  const input = await page.$("#arquivo");
  await input.uploadFile(join(publicRoot, "bim", "examples", "modelo-piloto.ifc"));
  await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("modelo-piloto.ifc ·"));
  assert.equal(exampleAttempts, 2, "the retry must make a second example request");
  console.log("OK lazy viewer: deferred runtime, example retry, and local IFC file");
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
