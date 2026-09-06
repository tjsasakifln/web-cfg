/**
 * #616 — a private need must not be routed, recorded or confirmed as B2G.
 *
 * Rendered test, not a source assertion. It drives the real shipped bundle in
 * Chromium: it selects each situation in the home capture and reads back the
 * hidden `jornada` value and the success destination the form would use.
 *
 * The defect it locks out: JOURNEY_ACTIONS had no entry outside
 * edital/contrato/operacao, stageToJourney returned 'operacao' as its catch-all
 * and applyJourneyToForm coerced any unknown journey to 'operacao'. Every
 * private nucleus was therefore persisted as jornada=operacao and confirmed on
 * /obrigado-operacao, whose H1 reads "Recebemos o pedido de diagnóstico da
 * operação B2G."
 */
import assert from "node:assert/strict";
import { createServer } from "http";
import { existsSync, readFileSync, statSync } from "fs";
import { extname, join, resolve, sep } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = 4599;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const server = await new Promise((done) => {
  const s = createServer((req, res) => {
    try {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = join(ROOT, p);
      if (!file.startsWith(`${ROOT}${sep}`) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      res.end(readFileSync(file));
    } catch { res.writeHead(500); res.end("err"); }
  });
  s.listen(PORT, "127.0.0.1", () => done(s));
});

const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});

const B2G_CONFIRMATIONS = new Set(["/obrigado-contrato", "/obrigado-edital", "/obrigado-operacao"]);
const results = [];
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle0" });

  const options = await page.$$eval("#estagio option", (els) =>
    els.filter((e) => e.value).map((e) => ({
      value: e.value,
      nucleus: e.getAttribute("data-nucleus"),
      journey: e.getAttribute("data-journey"),
    })),
  );
  assert.ok(options.length >= 10, `expected the broadened option set, got ${options.length}`);

  for (const option of options) {
    const observed = await page.evaluate((value) => {
      const form = document.querySelector("#formulario-contato");
      const select = form.querySelector("#estagio");
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        jornada: (form.querySelector('[name="jornada"]') || {}).value ?? null,
        destination: form.getAttribute("data-success-destination") || form.getAttribute("action"),
      };
    }, option.value);
    results.push({ ...option, ...observed });
  }
} finally {
  await browser.close();
  server.close();
}

const privateNuclei = results.filter(
  (r) => r.nucleus && r.nucleus !== "public_works_b2g" && r.nucleus !== "OTHER_NEEDS_CONTEXT",
);
assert.equal(privateNuclei.length, 4, "expected the four private canonical nuclei in the capture");

for (const row of privateNuclei) {
  assert.notEqual(
    row.jornada,
    "operacao",
    `${row.nucleus} is recorded as jornada=operacao, i.e. filed as a B2G operation lead`,
  );
  assert.equal(
    B2G_CONFIRMATIONS.has(row.destination),
    false,
    `${row.nucleus} confirms on ${row.destination}, a B2G confirmation page`,
  );
}

// The B2G options must keep their existing routing untouched.
const b2g = results.filter((r) => r.nucleus === "public_works_b2g");
assert.equal(b2g.length, 5, "expected the five public-works options to be preserved");
for (const row of b2g) {
  assert.ok(
    B2G_CONFIRMATIONS.has(row.destination),
    `public-works option ${row.value} lost its journey confirmation (${row.destination})`,
  );
}

console.log("JOURNEY_ROUTING_OK", JSON.stringify(
  results.map((r) => `${r.nucleus}:${r.jornada}->${r.destination}`), null, 0));
