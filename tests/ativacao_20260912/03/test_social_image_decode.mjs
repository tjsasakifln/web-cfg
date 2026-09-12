/** Browser-level proof that the OG URL is an image, not an HTML 200 response. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifact = path.resolve(process.env.PUBLIC_ARTIFACT_DIR || root);
const chrome = process.env.CHROME_PATH;
assert.ok(chrome, "CHROME_PATH is required to decode the social image in Chromium");
const imagePath = path.join(artifact, "assets", "og-confenge.jpg");
assert.ok(fs.existsSync(imagePath), `missing packaged social image: ${imagePath}`);
const imageBytes = fs.readFileSync(imagePath);

const server = http.createServer((request, response) => {
  if (request.url === "/assets/og-confenge.jpg") {
    response.writeHead(200, { "content-type": "image/jpeg" });
    response.end(imageBytes);
    return;
  }
  if (request.url === "/invalid-html.jpg") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<!doctype html><title>not an image</title>");
    return;
  }
  if (request.url === "/invalid-bytes.jpg") {
    response.writeHead(200, { "content-type": "image/jpeg" });
    response.end("<!doctype html><title>not JPEG bytes</title>");
    return;
  }
  response.writeHead(404).end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

let browser;
try {
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const decode = (url) => page.evaluate(async (url) => {
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { ok: true, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
    } catch {
      return { ok: false };
    }
  }, url);
  assert.deepEqual(await decode(`${baseUrl}/assets/og-confenge.jpg`), {
    ok: true,
    naturalWidth: 1200,
    naturalHeight: 630,
  });
  assert.deepEqual(await decode(`${baseUrl}/invalid-html.jpg`), { ok: false });
  assert.deepEqual(await decode(`${baseUrl}/invalid-bytes.jpg`), { ok: false });
} finally {
  if (browser) await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
