#!/usr/bin/env node
/* Browser smoke for the direct-convergence visitor surfaces. Loopback mocks only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const root = resolve(new URL("../..", import.meta.url).pathname);
const site = resolve(process.env.SITE_ROOT || join(root, "_site"));
const reportDir = resolve(root, "build/reports/convergence");
const chrome = process.env.CHROME_PATH || process.env.CHROME || "";
const axe = readFileSync(resolve(root, "node_modules/axe-core/axe.min.js"), "utf8");
const report = { site, chrome: chrome || null, checks: [], screenshots: [] };
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const globalHeaders = Object.fromEntries(readFileSync(join(site, "_headers"), "utf8").split(/\r?\n\s*\r?\n/, 1)[0].split(/\r?\n/).slice(1).map(line => line.match(/^\s{2}([^:]+):\s*(.*)$/)).filter(Boolean).filter(([, key]) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)).map(([, key, value]) => [key.toLowerCase(), value]));
if (globalHeaders["content-security-policy"]) globalHeaders["content-security-policy"] = globalHeaders["content-security-policy"].replace(/;?\s*upgrade-insecure-requests\b/, "");

function check(name, pass, detail = "") { report.checks.push({ name, pass, detail }); assert.ok(pass, `${name}: ${detail}`); }
function chromePath() {
  if (chrome && existsSync(chrome)) return chrome;
  throw new Error("Chrome unavailable: set CHROME_PATH to the downloaded browser binary");
}
function serve() {
  return createServer((req, res) => {
    const target = new URL(req.url, "http://loopback").pathname;
    const relative = target === "/" ? "index.html" : target.replace(/^\/+/, "");
    let file = normalize(join(site, relative));
    if (file.startsWith(site) && existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!file.startsWith(site) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { ...globalHeaders, "content-type": mime[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
}
async function axeClean(page, name) {
  await page.evaluate(axe);
  const violations = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }).then(r => r.violations.map(v => ({ id: v.id, nodes: v.nodes.length }))));
  check(`axe_${name}`, violations.length === 0, JSON.stringify(violations));
}
async function shot(page, name) { const file = join(reportDir, `${name}.png`); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file); }
async function chooseRequired(page) {
  const selectEnabled = () => page.$$eval("select:not([disabled])[required]", els => els.forEach(el => { const option = [...el.options].find(o => o.value && !o.disabled); if (option) { el.value = option.value; el.dispatchEvent(new Event("change", { bubbles: true })); } }));
  await selectEnabled();
  await selectEnabled();
  await page.$eval("#nome", e => { e.value = "Canario Sintetico"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.$eval("#email", e => { e.value = "canario@example.invalid"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.$$eval('input[type="checkbox"][required]', els => els.forEach(e => { e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); }));
}
async function runLive() {
  const live = process.env.LIVE_BASE_URL.replace(/\/$/, "");
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${live}/ferramentas/prontidao-tecnica-obra-privada/`, { waitUntil: "networkidle0" });
    await page.click("button.tool-run"); await page.waitForSelector("#resultado-corpo .pptr-domain");
    check("live_tool_value", await page.$$eval("#resultado-corpo .pptr-domain", rows => rows.length === 7), "seven domains not rendered");
    await page.goto(`${live}/confianca/`, { waitUntil: "networkidle0" });
    check("live_trust_schema_parity", await page.evaluate(() => {
      const graph = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => { try { const parsed = JSON.parse(s.textContent); return parsed["@graph"] || [parsed]; } catch { return []; } });
      const org = graph.find(item => item["@type"] === "Organization"); const person = graph.find(item => item["@type"] === "Person");
      return Boolean(org && person && [org.legalName, org.taxID, org.address?.streetAddress, person.jobTitle].every(value => document.body.innerText.includes(value)));
    }), "Organization/Person visible-schema parity missing");
    await page.goto(`${live}/triagem-tecnica/`, { waitUntil: "networkidle0" }); await new Promise(wait => setTimeout(wait, 400));
    const config = await fetch(`${live}/.netlify/functions/adaptive-intake-config`);
    check("live_triage_config_state", config.ok || await page.$eval('[type="submit"]', el => el.disabled), `config=${config.status}, submit enabled while unavailable`);
  } finally { await browser.close(); }
}

if (process.env.LIVE_BASE_URL) {
  await runLive(); report.ok = report.checks.every(item => item.pass); mkdirSync(reportDir, { recursive: true });
  await import("node:fs/promises").then(fs => fs.writeFile(join(reportDir, "report.json"), JSON.stringify(report, null, 2)));
  console.log("CONVERGENCE_BROWSER_OK", JSON.stringify(report)); process.exit(0);
}

if (!existsSync(site)) throw new Error(`site root missing: ${site}`);
mkdirSync(reportDir, { recursive: true });
const server = serve();
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
try {
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await mobile.goto(`${base}/ferramentas/prontidao-tecnica-obra-privada/`, { waitUntil: "networkidle0" });
  await mobile.click("button.tool-run");
  await mobile.waitForSelector("#resultado-corpo .pptr-domain");
  const tool = await mobile.evaluate(() => ({ domains: document.querySelectorAll("#resultado-corpo .pptr-domain").length, cta: !document.querySelector("#cta-comercial").hidden, text: document.querySelector("#resultado-corpo").textContent, events: window.dataLayer || [] }));
  check("tool_full_result_before_contact", tool.domains === 7 && tool.cta, JSON.stringify({ domains: tool.domains, cta: tool.cta }));
  check("tool_unknown_neutral", /Desconhecido/.test(tool.text) && !/Lacuna/.test(tool.text), tool.text.slice(0, 200));
  check("tool_complete_real_bus", tool.events.some(event => event.event === "tool_complete"), "tool_complete absent from dataLayer");
  check("tool_analytics_no_answers", !/UNKNOWN|work_stage|gap_count|present_count|unknown_count|nucleus_id/i.test(JSON.stringify(tool.events)), "response field present in dataLayer");
  await axeClean(mobile, "private_tool_mobile"); await shot(mobile, "private-tool-390");
  await mobile.setViewport({ width: 1366, height: 900 }); await shot(mobile, "private-tool-1366");

  const trust = await browser.newPage();
  await trust.setViewport({ width: 1366, height: 900 });
  await trust.goto(`${base}/confianca/`, { waitUntil: "networkidle0" });
  const parity = await trust.evaluate(() => {
    const graph = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => { try { const parsed = JSON.parse(s.textContent); return parsed["@graph"] || [parsed]; } catch { return []; } });
    const organization = graph.find(item => item["@type"] === "Organization");
    const person = graph.find(item => item["@type"] === "Person");
    const text = document.body.innerText;
    return { valid: Boolean(organization && person && [organization.legalName, organization.taxID, organization.address?.streetAddress, person.jobTitle].every(value => text.includes(value))) };
  });
  check("trust_visible_schema_parity", parity.valid, JSON.stringify(parity));
  await axeClean(trust, "trust_desktop"); await shot(trust, "trust-1366");
  await trust.setViewport({ width: 390, height: 844 }); await axeClean(trust, "trust_mobile"); await shot(trust, "trust-390");

  const triage = await browser.newPage();
  await triage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  let mode = "down"; let attempts = []; let collectorBodies = [];
  await triage.setRequestInterception(true);
  triage.on("request", request => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") return request.continue();
    if (url.pathname === "/.netlify/functions/adaptive-intake-config") {
      if (mode === "down") return request.respond({ status: 503, contentType: "application/json", body: '{"ok":false}' });
      return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, intake_contract_version: "CONFENGE_WEB_INTAKE/1.0", intake_pin_hash: "a".repeat(64), nuclei: ["building_engineering_documentation", "public_works_b2g", "property_valuation", "occupational_safety", "expert_evidence_assistance"], source_asset_id: "private_project_technical_readiness_v1", offer_candidate_id: "private_project_technical_readiness_assessment" }) });
    }
    if (url.pathname === "/.netlify/functions/lead") {
      const body = request.postData() || ""; attempts.push(body);
      if (attempts.length === 1) return request.respond({ status: 503, contentType: "application/json", body: '{"ok":false}' });
      return request.respond({ status: 201, contentType: "application/json", body: '{"ok":true,"lead_id":"lead-canary-receipt"}' });
    }
    if (url.pathname === "/collect" || url.pathname === "/.netlify/functions/collect" || url.pathname === "/api/web/collect") { collectorBodies.push(request.postData() || ""); return request.respond({ status: 204, body: "" }); }
    return request.continue();
  });
  await triage.goto(`${base}/triagem-tecnica/`, { waitUntil: "networkidle0" });
  check("triage_config_503_blocks", await triage.$eval('[type="submit"]', e => e.disabled), "submit enabled on config failure");
  mode = "ready"; await triage.reload({ waitUntil: "networkidle0" });
  check("triage_config_200_enables", !(await triage.$eval('[type="submit"]', e => e.disabled)), "submit remains disabled on config success");
  await chooseRequired(triage); await triage.click('[type="submit"]');
  await triage.waitForFunction(() => /não foi possível confirmar/i.test(document.querySelector("#form-status").textContent));
  await triage.click('[type="submit"]'); await triage.waitForSelector("[data-adaptive-confirmation]:not([hidden])");
  check("triage_retry_same_payload", attempts.length === 2 && attempts[0] === attempts[1], JSON.stringify({ attempts: attempts.length, same: attempts[0] === attempts[1] }));
  const triageResult = await triage.evaluate(() => ({ receipt: document.querySelector("[data-receipt-protocol]").textContent, events: window.dataLayer || [] }));
  check("triage_receipt_visible", triageResult.receipt === "lead-canary-receipt", JSON.stringify({ receipt: triageResult.receipt }));
  check("triage_real_bus_events", triageResult.events.some(event => event.event === "lead_form_submit") && triageResult.events.some(event => event.event === "lead_persisted"), "required events absent from dataLayer");
  check("triage_analytics_allowlist", !/nucleus|canario|email|nome|answer|urgency/i.test(JSON.stringify(triageResult.events)) && !/canario@example|Canario Sintetico/i.test(collectorBodies.join("")), "response or PII present in analytics");
  await axeClean(triage, "triage_mobile"); await shot(triage, "triage-390");
} finally {
  await browser.close(); server.close();
  report.ok = report.checks.every(item => item.pass);
  await import("node:fs/promises").then(fs => fs.writeFile(join(reportDir, "report.json"), JSON.stringify(report, null, 2)));
}
console.log("CONVERGENCE_BROWSER_OK", JSON.stringify(report));
