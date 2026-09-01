#!/usr/bin/env node

/** Responsive synthetic evidence for issue #532 form states. */

import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "docs/uiux-evidence/issue-532-cta-form-next-state");
const receipt = "lead-532000000000000000000000000";
const viewports = [
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
];
const scenarios = [
  {
    id: "home",
    route: "/",
    form: "#formulario-contato",
    initialTarget: "#formulario-contato [data-form-value]",
    async validation(page) {
      await page.$eval("#formulario-contato", (form) => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await page.waitForSelector("#formulario-contato .is-invalid, #formulario-contato [aria-invalid=true]", { timeout: 3000 });
    },
    async fill(page) {
      await page.type("#nome", "Pessoa Sintética QA 532");
      await page.type("#email", "qa532@example.test");
      await page.select("#estagio", "problema urgente em contrato");
      await page.$eval("#formulario-contato", (form) => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await page.waitForSelector('[data-form-step="2"].is-active', { timeout: 3000 });
      await page.click("#consentimento");
    },
    submit: '.form-step.is-active button[type="submit"]',
    status: "#form-status",
  },
  {
    id: "servicos",
    route: "/servicos-obras-publicas/",
    form: 'form[data-cta-id="contract-defense-products-handraise"]',
    initialTarget: 'form[data-cta-id="contract-defense-products-handraise"] [data-form-value]',
    async validation(page) {
      await page.$eval('form[data-cta-id="contract-defense-products-handraise"]', (form) => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await page.waitForSelector('form[data-cta-id="contract-defense-products-handraise"] .is-invalid, form[data-cta-id="contract-defense-products-handraise"] [aria-invalid=true]', { timeout: 3000 });
    },
    async fill(page) {
      const form = 'form[data-cta-id="contract-defense-products-handraise"]';
      await page.select(`${form} [name="deliverable_id"]`, "CFG-D17");
      await page.type(`${form} [name="public_contract_id"]`, "PNCP-QA-532-SINTETICO");
      await page.select(`${form} [name="contract_event"]`, "risco_margem");
      await page.type(`${form} [name="opportunity_deadline"]`, "09/30/2026");
      await page.select(`${form} [name="contract_stage"]`, "identificado");
      await page.type(`${form} [name="nome"]`, "Pessoa Sintética QA 532");
      await page.type(`${form} [name="email"]`, "qa532@example.test");
      await page.click(`${form} [name="consentimento"]`);
    },
    submit: 'form[data-cta-id="contract-defense-products-handraise"] button[type="submit"]',
    status: 'form[data-cta-id="contract-defense-products-handraise"] .form-status',
  },
];

let leadMode = "success";
const pendingResponses = [];

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) return "application/json; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (request.method === "POST" && ["/api/web/lead", "/.netlify/functions/lead"].includes(url.pathname)) {
    request.resume();
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (leadMode === "loading") {
      pendingResponses.push(response);
      return;
    }
    if (leadMode === "turnstile") {
      response.statusCode = 403;
      response.end(JSON.stringify({ ok: false, error: "anti_abuse", message: "anti_abuse" }));
      return;
    }
    response.statusCode = 201;
    response.end(JSON.stringify({ ok: true, lead_id: receipt, receipt_id: receipt }));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/web/collect") {
    request.resume();
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.end();
    return;
  }
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!relative) relative = "index.html";
  else if (relative.endsWith("/")) relative += "index.html";
  else if (!path.extname(relative) && fs.existsSync(path.join(root, `${relative}.html`))) relative += ".html";
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    response.statusCode = 404;
    response.end("not found");
    return;
  }
  response.setHeader("content-type", contentType(absolute));
  response.end(fs.readFileSync(absolute));
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function closeServer() {
  for (const response of pendingResponses.splice(0)) response.destroy();
  return new Promise((resolve) => server.close(resolve));
}

async function openScenario(browser, base, scenario, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const target = new URL(request.url());
    if (target.origin === base) request.continue();
    else request.abort();
  });
  await page.goto(`${base}${scenario.route}`, { waitUntil: "networkidle0" });
  await page.waitForFunction((selector) => {
    const form = document.querySelector(selector);
    return form && form.dataset.formReady === "true";
  }, {}, scenario.form);
  return page;
}

async function focus(page, selector) {
  await page.$eval(selector, (element) => {
    document.documentElement.style.scrollBehavior = "auto";
    const top = element.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo(0, Math.max(0, top));
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function shot(page, scenario, state, viewport) {
  const file = `${scenario.id}-${state}-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: path.join(output, file), fullPage: false });
  return file;
}

const port = await listen();
const base = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({
  headless: true,
  executablePath: resolveChromePath(),
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const captures = [];

try {
  fs.mkdirSync(output, { recursive: true });
  for (const scenario of scenarios) {
    for (const viewport of viewports) {
      leadMode = "success";
      let page = await openScenario(browser, base, scenario, viewport);
      await focus(page, scenario.initialTarget);
      captures.push({ route: scenario.route, state: "initial", viewport, file: await shot(page, scenario, "initial", viewport) });
      await page.close();

      page = await openScenario(browser, base, scenario, viewport);
      await focus(page, scenario.initialTarget);
      await scenario.validation(page);
      await focus(page, scenario.status);
      captures.push({ route: scenario.route, state: "validation-error", viewport, file: await shot(page, scenario, "validation-error", viewport) });
      await page.close();

      leadMode = "turnstile";
      page = await openScenario(browser, base, scenario, viewport);
      await scenario.fill(page);
      await page.click(scenario.submit);
      await page.waitForFunction((selector) => /protocolo|registrad/i.test(document.querySelector(selector)?.textContent || ""), {}, scenario.status);
      await focus(page, scenario.status);
      captures.push({ route: scenario.route, state: "turnstile-error", viewport, file: await shot(page, scenario, "turnstile-error", viewport) });
      await page.close();

      leadMode = "loading";
      page = await openScenario(browser, base, scenario, viewport);
      await scenario.fill(page);
      await page.click(scenario.submit);
      await page.waitForFunction(
        (statusSelector, submitSelector) => /Enviando/.test(document.querySelector(statusSelector)?.textContent || "")
          || document.querySelector(submitSelector)?.disabled === true,
        { timeout: 5000 },
        scenario.status,
        scenario.submit,
      );
      await focus(page, scenario.status);
      captures.push({ route: scenario.route, state: "submit-loading", viewport, file: await shot(page, scenario, "submit-loading", viewport) });
      for (const response of pendingResponses.splice(0)) response.destroy();
      await page.close();

      leadMode = "success";
      page = await openScenario(browser, base, scenario, viewport);
      await scenario.fill(page);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle0" }),
        page.click(scenario.submit),
      ]);
      await page.waitForFunction((expected) => document.body.textContent.includes(expected), {}, receipt);
      captures.push({ route: scenario.route, state: "success-receipt", viewport, file: await shot(page, scenario, "success-receipt", viewport) });
      await page.close();
    }
  }
  assert.equal(captures.length, scenarios.length * viewports.length * 5);
  const manifest = {
    schema: "confenge.issue-532-form-state-evidence/1.0",
    issue: "#532",
    baseline_sha: childProcess.execFileSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" }).trim(),
    synthetic_pii_only: true,
    synthetic_identity: "Pessoa Sintética QA 532 / qa532@example.test",
    routes: scenarios.map((scenario) => scenario.route),
    states: ["initial", "validation-error", "turnstile-error", "submit-loading", "success-receipt"],
    viewports,
    captures,
    note: "The shared runtime error string is frozen by #533; the Turnstile capture records its current fail-closed fallback without mutating script.js.",
  };
  fs.writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`ISSUE_532_FORM_EVIDENCE_OK captures=${captures.length} dir=${path.relative(root, output)}`);
} finally {
  await browser.close();
  await closeServer();
}
