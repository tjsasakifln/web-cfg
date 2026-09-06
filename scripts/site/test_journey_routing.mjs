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

// other_technical_need is the undefined-need escape hatch. It is a real nucleus
// and routes identically, but it is not one of the four named private needs.
const privateNuclei = results.filter(
  (r) => r.nucleus && !["public_works_b2g", "other_technical_need"].includes(r.nucleus),
);
assert.equal(privateNuclei.length, 4, "expected the four private canonical nuclei in the capture");
const escapeHatch = results.filter((r) => r.nucleus === "other_technical_need");
assert.equal(escapeHatch.length, 1, "the undefined-need option is missing");
privateNuclei.push(...escapeHatch);

for (const row of privateNuclei) {
  // Asserted positively, not as "not operacao": a null jornada and the form's
  // static action would satisfy a negative assertion while meaning the wiring
  // died entirely.
  assert.equal(
    row.jornada,
    "outro",
    `${row.nucleus} is recorded as jornada=${row.jornada}, not the neutral journey`,
  );
  assert.equal(
    row.destination,
    "/obrigado",
    `${row.nucleus} confirms on ${row.destination} instead of the neutral confirmation`,
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

// The ?jornada= load path is where a journey is applied without the visitor
// touching the select. Five options share data-journey="outro", so a bare
// first-match here silently pre-filled a REQUIRED field with one specific
// private nucleus -- and, because the field was then non-empty, the change
// handler never fired to correct it.
{
  const browser2 = await puppeteer.launch({
    executablePath: resolveChromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const server2 = await new Promise((done) => {
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
    s.listen(PORT + 1, "127.0.0.1", () => done(s));
  });
  try {
    const page = await browser2.newPage();
    for (const journey of ["outro", "zzz", "obras"]) {
      await page.goto(`http://127.0.0.1:${PORT + 1}/?jornada=${journey}`, { waitUntil: "networkidle0" });
      const observed = await page.evaluate(() => {
        const form = document.querySelector("#formulario-contato");
        const select = form.querySelector("#estagio");
        const option = select.selectedOptions[0];
        return {
          value: select.value,
          nucleus: option ? option.getAttribute("data-nucleus") : null,
        };
      });
      assert.notEqual(
        observed.nucleus,
        "building_engineering_documentation",
        `?jornada=${journey} silently pre-selected a specific private nucleus (${observed.value}) the visitor never chose`,
      );
      if (observed.value) {
        assert.equal(
          observed.nucleus,
          "other_technical_need",
          `?jornada=${journey} pre-selected ${observed.nucleus} instead of the undefined-need option`,
        );
      }
    }
  } finally {
    await browser2.close();
    server2.close();
  }
}

console.log("JOURNEY_ROUTING_OK", JSON.stringify(
  results.map((r) => `${r.nucleus}:${r.jornada}->${r.destination}`), null, 0));
