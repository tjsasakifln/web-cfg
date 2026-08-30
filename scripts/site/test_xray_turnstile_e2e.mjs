#!/usr/bin/env node

/** Browser contract for the protected terminal handraise on the X-Ray route. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const fixtureSiteKey = "1x00000000000000000000AA";
const route = "/piloto/conversao-xray/";
const requests = [];

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function startServer() {
  const mime = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  return new Promise((resolve) => {
    const server = http.createServer(async (request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "POST" && url.pathname === "/.netlify/functions/conversion-intake") {
        let body;
        try {
          body = JSON.parse(await readBody(request));
        } catch {
          json(response, 400, { ok: false, error: "invalid_json" });
          return;
        }
        requests.push({ body, headers: request.headers });
        if (body.action === "xray") {
          json(response, 201, { ok: true, xray: { state: "READY", limitations: [] } });
          return;
        }
        const handraiseCount = requests.filter((entry) => entry.body.action === "handraise").length;
        if (handraiseCount === 1) {
          json(response, 403, {
            ok: false,
            error: "anti_abuse",
            message: "Falha na verificacao antiabuso. Recarregue a pagina e tente novamente.",
          });
          return;
        }
        setTimeout(() => json(response, 201, {
          ok: true,
          receipt_id: "xray-e2e-receipt-001",
          handoff_status: "DELIVERED",
        }), 120);
        return;
      }
      if (request.method === "POST" && url.pathname === "/.netlify/functions/collect") {
        response.writeHead(204).end();
        return;
      }

      let relative = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
      const target = path.resolve(root, `.${relative}`);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      let content = fs.readFileSync(target);
      if (relative === `${route}index.html`) {
        content = Buffer.from(
          content.toString("utf8").replace(
            'data-turnstile-sitekey=""',
            `data-turnstile-sitekey="${fixtureSiteKey}"`,
          ),
        );
      }
      response.writeHead(200, {
        "Content-Type": mime[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(content);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const turnstileStub = `(() => {
  const widget = document.querySelector('#handraise-turnstile-widget');
  if (!widget) throw new Error('turnstile_widget_missing');
  let input = widget.querySelector('[name="cf-turnstile-response"]');
  if (!input) {
    input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'cf-turnstile-response';
    widget.appendChild(input);
  }
  window.__turnstileResetCount = 0;
  const callback = (name, value) => {
    const fn = window[name];
    if (typeof fn !== 'function') throw new Error('callback_missing:' + name);
    return fn(value);
  };
  window.turnstile = {
    reset(selector) {
      if (selector !== '#handraise-turnstile-widget') throw new Error('wrong_reset_target');
      window.__turnstileResetCount += 1;
      input.value = '';
    },
  };
  window.__turnstileHarness = {
    solve(token) { input.value = token; callback(widget.dataset.callback, token); },
    expire() { input.value = ''; callback(widget.dataset.expiredCallback); },
    error() { input.value = ''; return callback(widget.dataset.errorCallback, '300030'); },
  };
})();`;

async function configurePage(page) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().startsWith("https://challenges.cloudflare.com/turnstile/v0/api.js")) {
      request.respond({ status: 200, contentType: "application/javascript", body: turnstileStub });
      return;
    }
    request.continue();
  });
}

async function revealHandraise(page, base) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.type("#cnpj", "11.222.333/0001-81");
  await page.click("#xray-submit");
  await page.waitForFunction(() => !document.querySelector("#next-actions")?.hidden);
  await page.focus("#action-second-reading");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector("#handraise-form")?.hidden);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "nome");
  await page.waitForFunction(() => Boolean(window.__turnstileHarness));
}

const server = await startServer();
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;
const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await configurePage(page);
  await revealHandraise(page, base);

  assert.equal(await page.$eval("#handraise-submit", (el) => el.disabled), true);
  const beforeMissing = requests.filter((entry) => entry.body.action === "handraise").length;
  await page.evaluate(() => {
    document.querySelector("#handraise-form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(requests.filter((entry) => entry.body.action === "handraise").length, beforeMissing);
  assert.match(await page.$eval("#handraise-status", (el) => el.textContent), /antiabuso/i);

  await page.evaluate(() => window.__turnstileHarness.solve("token-expiring"));
  assert.equal(await page.$eval("#handraise-submit", (el) => el.disabled), false);
  await page.evaluate(() => window.__turnstileHarness.expire());
  assert.equal(await page.$eval("#handraise-submit", (el) => el.disabled), true);
  assert.match(await page.$eval("#handraise-status", (el) => el.textContent), /expir/i);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "handraise-status");
  assert.equal(await page.evaluate(() => window.__turnstileResetCount), 1);

  await page.evaluate(() => window.__turnstileHarness.error());
  assert.equal(await page.$eval("#handraise-submit", (el) => el.disabled), true);
  assert.match(await page.$eval("#handraise-status", (el) => el.textContent), /verificacao|verificação/i);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "handraise-status");
  assert.equal(await page.evaluate(() => window.__turnstileResetCount), 2);

  await page.evaluate(() => window.__turnstileHarness.solve("token-invalid-on-server"));
  await page.type("#nome", "Pessoa X-Ray");
  await page.type("#telefone", "48999999999");
  await page.select("#estagio", "segunda leitura de contrato");
  await page.click("#consentimento");
  await page.click("#handraise-submit");
  await page.waitForFunction(() => /antiabuso/i.test(document.querySelector("#handraise-status")?.textContent || ""));
  assert.equal(requests.filter((entry) => entry.body.action === "handraise").length, 1);
  assert.equal(await page.$eval("#handraise-submit", (el) => el.disabled), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "handraise-status");
  assert.equal(await page.evaluate(() => window.__turnstileResetCount), 3);

  await page.evaluate(() => window.__turnstileHarness.solve("token-valid-on-retry"));
  await page.evaluate(() => {
    const button = document.querySelector("#handraise-submit");
    button.click();
    button.click();
  });
  await page.waitForFunction(() => /Pedido registrado/i.test(document.querySelector("#handraise-status")?.textContent || ""));
  const handraiseRequests = requests.filter((entry) => entry.body.action === "handraise");
  assert.equal(handraiseRequests.length, 2, "double submit must create only one retry request");
  assert.equal(handraiseRequests[0].body.turnstile_token, "token-invalid-on-server");
  assert.equal(handraiseRequests[0].body["cf-turnstile-response"], "token-invalid-on-server");
  assert.equal(handraiseRequests[1].body.turnstile_token, "token-valid-on-retry");
  assert.equal(handraiseRequests[1].body.source, "CONFENGE_WEB");
  assert.equal(handraiseRequests[1].body.route_family, "market-answer-xray");
  assert.equal(handraiseRequests[1].body.email || "", "", "WhatsApp-only contact must remain valid");
  assert.equal(handraiseRequests[0].body.idempotency_key, handraiseRequests[1].body.idempotency_key);
  assert.equal(handraiseRequests[1].headers["idempotency-key"], handraiseRequests[1].body.idempotency_key);
  assert.equal(await page.$eval("#handraise-submit", (el) => el.disabled), true);
  await page.evaluate(() => window.__turnstileHarness.expire());
  assert.match(await page.$eval("#handraise-status", (el) => el.textContent), /Pedido registrado/i);
  assert.equal(await page.evaluate(() => window.__turnstileResetCount), 3, "late expiry must not reset a completed handraise");

  const instrumentation = await page.evaluate(() => window.__conversionJourney?.INSTR || []);
  const forbidden = ["nome", "email", "telefone", "cnpj"];
  for (const event of instrumentation) {
    for (const key of forbidden) assert.equal(Object.hasOwn(event, key), false, `${key} leaked to analytics`);
    assert.equal(JSON.stringify(event).includes("xray-e2e@example.com"), false, "PII value leaked to analytics");
    assert.equal(JSON.stringify(event).includes("11222333000181"), false, "CNPJ leaked to analytics");
  }

  await page.evaluate(axeSource);
  const axe = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } });
    return result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  });
  assert.deepEqual(axe, []);
  await page.close();

  const geometries = [];
  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 1000 },
  ]) {
    const geometryPage = await browser.newPage();
    await geometryPage.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await configurePage(geometryPage);
    await revealHandraise(geometryPage, base);
    const geometry = await geometryPage.evaluate(() => {
      const form = document.querySelector("#handraise-form").getBoundingClientRect();
      const widget = document.querySelector("#handraise-turnstile-widget").getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        formLeft: form.left,
        formRight: form.right,
        widgetLeft: widget.left,
        widgetRight: widget.right,
        viewport: window.innerWidth,
      };
    });
    assert(geometry.overflow <= 1, `${viewport.name} horizontal overflow ${geometry.overflow}px`);
    assert(geometry.formLeft >= -1 && geometry.formRight <= geometry.viewport + 1, `${viewport.name} form clipped`);
    assert(geometry.widgetLeft >= geometry.formLeft - 1 && geometry.widgetRight <= geometry.formRight + 1, `${viewport.name} widget clipped`);
    geometries.push({ viewport: viewport.name, overflow: geometry.overflow });
    await geometryPage.close();
  }

  const beforeJsOff = requests.length;
  const noJs = await browser.newPage();
  await noJs.setJavaScriptEnabled(false);
  await noJs.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
  assert.equal(await noJs.$eval("#handraise-form", (el) => el.hidden), true);
  assert.match(await noJs.$eval("noscript .form-status", (el) => el.textContent), /Nada foi enviado/i);
  assert.equal(requests.length, beforeJsOff, "JS-off page must not submit the handraise");
  await noJs.close();

  console.log("XRAY_TURNSTILE_E2E_OK", JSON.stringify({
    route,
    handraise_requests: handraiseRequests.length,
    reset_count: 3,
    axe_critical_serious: 0,
    geometries,
    js_off: "fail_closed",
  }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
