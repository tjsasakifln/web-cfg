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

/* #616 / #611 — applicability of the public-works matrix must hold on the whole
 * submit path, not only in the UI.
 *
 * The first fix made the `obra-publica` field group conditional: hidden and
 * disabled outside `public_works_b2g`, so its controls leave the FormData. That
 * covered the payload and nothing else. `lead_form_submit` is assembled by hand
 * from `el.value`, which ignores `disabled`, and the offer-fit router was called
 * unconditionally. Measured on the shipped bundle before this guard: answering
 * the bands under a public need and then switching to "Perícia" reported
 * ticket_band_category=acima_1m, risk_band_category=acima_dossie,
 * frequency_category=recorrente, docs_category=forte, capacity_category=limitada
 * and next_step_category=diretoria — the R$ 12.500–20.000/month recurring
 * offer — for a lead the visitor had just said was a survey. Choosing "Perícia"
 * directly, with no prior answers, reported next_step_category=diagnostico,
 * because all-unknown input is not "no classification" to the router.
 *
 * Absence of classification is the empty string an unanswered form already
 * emits. Not `nao_indicado`: that asserts an economic disqualification nobody
 * assessed.
 */
{
  const B2G_FIELDS = ["faixa_contrato", "risco_em_jogo", "frequencia", "maturidade_documental", "capacidade_interna"];
  const B2G_CATEGORIES = ["ticket_band_category", "risk_band_category", "frequency_category", "docs_category", "capacity_category"];
  // "No value reported" is either the empty string the form emits for an
  // unanswered field or the key being dropped from the transmitted props. Any
  // actual band or next_step fails, which is the property under test.
  const reported = (v) => (v === undefined || v === null || v === "" ? "" : v);
  const ANSWERS = [["#faixa_contrato", "acima_1m"], ["#risco_em_jogo", "acima_dossie"], ["#frequencia", "recorrente"],
    ["#maturidade_documental", "forte"], ["#capacidade_interna", "limitada"], ["#urgencia", "até 48 horas"]];
  const PORT3 = PORT + 2;

  const serve = (port) => new Promise((done) => {
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
    s.listen(port, "127.0.0.1", () => done(s));
  });

  const server3 = await serve(PORT3);
  const browser3 = await puppeteer.launch({
    executablePath: resolveChromePath(), headless: true, args: ["--no-sandbox", "--disable-gpu"],
  });
  const beacons = [];
  try {
    const page = await browser3.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const url = r.url();
      // The submit is never allowed to leave this process: the analytics beacon
      // is answered locally and recorded, and any non-local host is aborted. No
      // lead is created and no message is sent.
      if (url.includes("/api/web/collect")) { beacons.push(r.postData() || ""); return r.respond({ status: 204, body: "" }); }
      if (/^https?:\/\/(?!127\.0\.0\.1)/.test(url)) return r.abort();
      return r.continue();
    });

    const submitOnce = async ({ first, answers, second }) => {
      await page.goto(`http://127.0.0.1:${PORT3}/`, { waitUntil: "networkidle0" });
      // Registered last, so it runs after the page's own submit handler: the
      // handler does all of its work, then the navigation and POST are cancelled.
      await page.evaluate(() => {
        document.querySelector("#formulario-contato").addEventListener("submit", (e) => {
          e.preventDefault(); e.stopImmediatePropagation();
        });
      });
      const set = (sel, value) => page.evaluate(([s, v]) => {
        const el = document.querySelector(s); el.value = v;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, [sel, value]);
      await page.evaluate(() => {
        const f = document.querySelector("#formulario-contato");
        f.querySelector("#nome").value = "Teste Sintetico";
        const mail = f.querySelector("#email");
        mail.value = "sintetico@example.invalid";
        mail.dispatchEvent(new Event("input", { bubbles: true }));
        f.querySelectorAll('input[type="checkbox"][required]').forEach((c) => {
          c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
      await set("#estagio", first);
      await page.evaluate(() => document.querySelector('[data-form-next="1"]')?.click());
      await new Promise((r) => setTimeout(r, 250));
      for (const [sel, value] of (answers || [])) await set(sel, value);
      if (second) await set("#estagio", second);
      await new Promise((r) => setTimeout(r, 150));
      const payload = await page.evaluate(() => Object.fromEntries(
        [...new FormData(document.querySelector("#formulario-contato")).entries()].filter(([, v]) => v !== ""),
      ));
      beacons.length = 0;
      await page.evaluate(() => document.querySelector('#formulario-contato [type="submit"]').click());
      await new Promise((r) => setTimeout(r, 400));
      const bus = await page.evaluate(() => (window.dataLayer || []).filter((e) => e.event === "lead_form_submit"));
      // The collector flushes at unload; the real navigation was cancelled, so
      // leave the page to force it and read what was actually transmitted.
      await page.goto(`http://127.0.0.1:${PORT3}/404.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
      let wire = [];
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        wire = beacons.flatMap((b) => { try { return JSON.parse(b).events || []; } catch { return []; } })
          .filter((e) => e.event === "lead_form_submit");
        if (wire.length) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      assert.equal(bus.length >= 1, true, "the page recorded no lead_form_submit at all");
      assert.equal(wire.length >= 1, true, "no lead_form_submit reached the collector; the telemetry assertion would pass vacuously");
      return { payload, bus: bus[0], wire: wire[0].props };
    };

    const nonB2g = [...privateNuclei].map((r) => r.value);
    assert.equal(nonB2g.length, 5, "expected four private nuclei plus the undefined-need option");

    for (const value of nonB2g) {
      for (const [label, shape] of [
        [`${value} chosen directly`, { first: value, answers: [["#urgencia", "até 48 horas"]] }],
        [`public need answered, then switched to ${value}`, { first: "problema urgente em contrato", answers: ANSWERS, second: value }],
      ]) {
        const { payload, bus, wire } = await submitOnce(shape);
        for (const field of B2G_FIELDS) {
          assert.equal(payload[field], undefined, `${label}: ${field} is still in the submitted payload`);
        }
        for (const key of B2G_CATEGORIES) {
          assert.equal(reported(bus[key]), "", `${label}: ${key}=${bus[key]} recorded on lead_form_submit`);
          assert.equal(reported(wire[key]), "", `${label}: ${key}=${wire[key]} transmitted to the collector`);
        }
        assert.equal(reported(bus.next_step_category), "",
          `${label}: classified ${bus.next_step_category} by a matrix that does not cover this need`);
        assert.equal(reported(wire.next_step_category), "",
          `${label}: transmitted next_step_category=${wire.next_step_category} for a need outside the matrix`);
        // General fields are not collateral damage.
        assert.equal(bus.urgency_category, "até 48 horas", `${label}: urgency was dropped with the public-works group`);
        assert.equal(bus.stage_category, value, `${label}: stage recorded as ${bus.stage_category}`);
      }
    }

    // Returning to a public need restores the preserved answers AND the routing.
    {
      const { payload, bus, wire } = await submitOnce({
        first: "pericia-assistencia-tecnica", answers: ANSWERS, second: "problema urgente em contrato",
      });
      for (const field of B2G_FIELDS) {
        assert.notEqual(payload[field], undefined, `returning to a public need lost ${field}`);
      }
      assert.equal(bus.ticket_band_category, "acima_1m", "the preserved ticket band did not come back");
      assert.equal(bus.capacity_category, "limitada", "the preserved capacity answer did not come back");
      assert.equal(bus.next_step_category, "diretoria",
        `returning to a public need must classify again, got ${bus.next_step_category}`);
      assert.equal(wire.next_step_category, "diretoria", "the restored classification was not transmitted");
    }
  } finally {
    await browser3.close();
    server3.close();
  }
}

console.log("JOURNEY_ROUTING_OK", JSON.stringify(
  results.map((r) => `${r.nucleus}:${r.jornada}->${r.destination}`), null, 0));
