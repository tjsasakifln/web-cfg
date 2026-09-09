#!/usr/bin/env node
/*
 * Browser evidence for the commercial contact journeys.  It is deliberately
 * artifact-only: no WhatsApp, mail, telephone, lead, analytics or payment
 * endpoint is followed.  The active-form persistence contract has its own
 * controlled synthetic probe (test_synthetic_lead_probe.mjs).
 */
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const root = resolve(new URL("../..", import.meta.url).pathname);
const site = resolve(process.env.SITE_ROOT || join(root, "_site"));
const reportDir = resolve(process.env.CONTACT_JOURNEY_REPORT_DIR || join(root, "build/reports/contact-journeys"));
const chrome = process.env.CHROME_PATH || process.env.CHROME;
const viewports = [[360, 800], [390, 844], [768, 900], [1366, 900]];
// These are visitor situations, rather than internal portfolio labels.  The
// direct targets can converge on a shared explanatory page, but each must
// still name an actionable contact path in the rendered result.
const journeys = [
  ["pequena_reforma", "/servicos/#servico-diagnostico", "situacao-obra-imovel", ".situation-action[href]"],
  ["condominio_anomalia", "/servicos/#servico-diagnostico", "situacao-obra-imovel", ".situation-action[href]"],
  ["arquiteto_compatibilizacao", "/servicos/#servico-projeto", "situacao-projeto", ".situation-action[href]"],
  ["projeto_estrutural", "/servicos/#servico-projeto", "situacao-projeto", ".situation-action[href]"],
  ["instalacoes", "/servicos/#servico-projeto", "situacao-projeto", ".situation-action[href]"],
  ["orcamento_publico", "/quantitativos-orcamento-obras/", "situacao-projeto", 'a[href="/quantitativos-orcamento-obras/"]'],
  ["orcamento_privado", "/quantitativos-orcamento-obras/", "situacao-projeto", 'a[href="/quantitativos-orcamento-obras/"]'],
  ["disciplina_nao_listada", "/servicos/#servico-projeto", "situacao-projeto", ".situation-action[href]"],
  // The public-works hub is the explanatory destination for both the public
  // entity and procurement entries; it must not be mistaken for the generic
  // services fragment merely because that fragment also names the discipline.
  ["orgao_preparando_projeto", "/servicos-obras-publicas/", "situacao-obras-publicas", ".situation-action[href]"],
  ["edital", "/servicos-obras-publicas/", "situacao-obras-publicas", ".situation-action[href]"],
  // Glosa/aditivo has its own visible shortcut in the public-works section.
  // Check that direct service destination, rather than treating the section's
  // general entry point as an erroneous mismatch.
  ["glosa_aditivo", "/medicoes-glosas-obras-publicas/", "jornada-contrato", "a[href]"],
  ["pericia_avaliacao", "/servicos/#servico-pericia", "situacao-pericia", ".situation-action[href]"],
  ["seguranca_trabalho", "/servicos/#servico-sst", "situacao-sst", ".situation-action[href]"],
].map(([id, direct, homeAnchor, homeSelector]) => ({ id, direct, homeAnchor, homeSelector }));
const adaptiveWithheld = JSON.parse(readFileSync(join(root, "netlify/functions/data/adaptive-intake-authority.json"), "utf8")).status === "WITHHELD";
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const report = { candidate: null, identity: { git_head: null, artifact_commit: null, consistent: null }, site, planned: { journeys: journeys.length, viewport_route_checks: journeys.length * viewports.length }, viewports: viewports.map(([width, height]) => ({ width, height })), journeys: [], checks: [], failures: [], blockedRequests: [] };
function record(name, pass, detail, context = {}) { const row = { name, pass, detail, ...context }; report.checks.push(row); if (!pass) report.failures.push(row); }
// Keep running after an individual failure.  The report is evidence for every
// planned route and viewport, not only the first broken CTA.
function required(name, pass, detail, context) { record(name, pass, detail, context); }
function executable() { if (chrome && existsSync(chrome)) return chrome; throw new Error("Chrome unavailable: set CHROME_PATH"); }
function serve() { return createServer((req, res) => {
  const pathname = new URL(req.url, "http://loopback").pathname;
  let file = normalize(join(site, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "")));
  if (file.startsWith(site) && existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!file.startsWith(site) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
}); }
async function facts(page, fragment = "") { return page.evaluate((targetFragment) => {
  const visible = element => { const style = getComputedStyle(element); const box = element.getBoundingClientRect(); return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0; };
  const main = document.querySelector("main") || document.body;
  const context = targetFragment ? document.querySelector(targetFragment) || main : main;
  const links = [...context.querySelectorAll("a[href]")];
  const channels = { whatsapp: links.some(a => /^https:\/\/wa\.me\//.test(a.href) && visible(a)), email: links.some(a => a.href.startsWith("mailto:") && visible(a)), phone: links.some(a => a.href.startsWith("tel:") && visible(a)) };
  const activeForm = [...context.querySelectorAll("form")].some(form => visible(form) && [...form.querySelectorAll("[type=submit]")].some(button => visible(button) && !button.disabled));
  const cnpjRequired = [...document.querySelectorAll("[required]")].filter(el => /cnpj/i.test(`${el.name} ${el.id} ${el.labels?.[0]?.textContent || ""}`)).length;
  const triageLink = links.some(a => /^\/triagem-tecnica\//.test(a.getAttribute("href") || "") && visible(a));
  return { channels, activeForm, triageLink, cnpjRequired, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
}, fragment); }
async function unnamedInteractiveNodes(page) {
  const client = await page.target().createCDPSession();
  try {
    const { nodes } = await client.send("Accessibility.getFullAXTree");
    return nodes.filter(node => ["button", "link", "textbox", "combobox"].includes(node.role?.value) && !node.ignored && !String(node.name?.value || "").trim()).length;
  } finally { await client.detach(); }
}
async function blockExternal(page) {
  await page.setRequestInterception(true);
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin === base) return request.continue();
    report.blockedRequests.push({ url: request.url(), type: request.resourceType() });
    return request.abort("blockedbyclient");
  });
}
function routeUrl(route, probe) { const url = new URL(route, base); url.searchParams.set("__contact_journey", probe); return url.href; }
async function focusableContextAction(page) { await page.evaluate(() => window.scrollTo(0, 0)); await page.keyboard.press("Tab"); for (let i = 0; i < 40; i += 1) { const found = await page.evaluate(() => { const e = document.activeElement; if (!e || !/^(A|BUTTON)$/.test(e.tagName)) return false; const href = e.getAttribute("href") || ""; return /^mailto:|^tel:|^https:\/\/wa\.me\/|^\/triagem-tecnica\//.test(href) || /proposta|conversar|contato/i.test(e.textContent || ""); }); if (found) return true; await page.keyboard.press("Tab"); } return false; }

if (!existsSync(site)) throw new Error(`site root missing: ${site}`);
try { report.identity.git_head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch (_) { report.identity.git_head = null; }
try { report.candidate = JSON.parse(readFileSync(join(site, ".well-known/build-info.json"), "utf8")); } catch (_) { report.candidate = { commit: null, identity: "build-info unavailable" }; }
report.identity.artifact_commit = report.candidate?.commit || null;
report.identity.consistent = Boolean(report.identity.git_head && report.identity.artifact_commit && report.identity.git_head === report.identity.artifact_commit);
// A build-info commit is an artifact claim, not evidence of the checked-out
// candidate.  Refuse to certify an isolated/final artifact when they differ.
required("journey_candidate_identity_matches_git", report.identity.consistent, `git=${report.identity.git_head || "unavailable"}; artifact=${report.identity.artifact_commit || "unavailable"}`, { route: "/.well-known/build-info.json" });
mkdirSync(reportDir, { recursive: true });
const server = serve(); await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await puppeteer.launch({ executablePath: executable(), headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await blockExternal(page);
  for (const journey of journeys) {
    const row = { id: journey.id, direct: journey.direct, homeAnchor: journey.homeAnchor, viewportChecks: [] }; report.journeys.push(row);
    for (const [width, height] of viewports) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      const response = await page.goto(routeUrl(journey.direct, `${journey.id}-${width}`), { waitUntil: "domcontentloaded" });
      const fragment = new URL(journey.direct, base).hash;
      const current = facts(page, fragment); const data = await current;
      const context = { journey: journey.id, route: journey.direct, viewport: `${width}x${height}` };
      required("journey_direct_status", response?.status() === 200, String(response?.status()), context);
      if (fragment) required("journey_direct_fragment", await page.$(fragment).then(Boolean), fragment, context);
      required("journey_direct_next_step", data.activeForm || data.triageLink || Object.values(data.channels).some(Boolean), JSON.stringify(data), context);
      if (adaptiveWithheld && ["/triagem-tecnica/#obra-imovel", "/triagem-tecnica/#planejamento-publico", "/triagem-tecnica/#pericia-avaliacao", "/triagem-tecnica/#sst", "/triagem-tecnica/", "/quantitativos-orcamento-obras/"].includes(journey.direct)) {
        required("journey_withheld_has_three_direct_channels", Object.values(data.channels).every(Boolean) && !data.activeForm, JSON.stringify(data), context);
      }
      required("journey_no_required_cnpj", data.cnpjRequired === 0, JSON.stringify(data), context);
      required("journey_no_overflow", !data.overflow, JSON.stringify(data), context);
      required("journey_accessible_control_names", (await unnamedInteractiveNodes(page)) === 0, "browser AX tree", context);
      row.viewportChecks.push({ viewport: context.viewport, status: response?.status(), overflow: data.overflow, channels: data.channels, activeForm: data.activeForm });
    }
    await page.setViewport({ width: 390, height: 844 }); await page.goto(routeUrl(journey.direct, `${journey.id}-keyboard`), { waitUntil: "domcontentloaded" });
    required("journey_keyboard_reaches_action", await focusableContextAction(page), journey.direct, { journey: journey.id, route: journey.direct, viewport: "390x844" });
    // At 200% browser zoom a 1366px desktop layout has roughly 683 CSS px of
    // available width.  Use that reflow width, rather than a pinch-zoom scale.
    await page.setViewport({ width: 683, height: 450 }); await page.goto(routeUrl(journey.direct, `${journey.id}-zoom`), { waitUntil: "domcontentloaded" });
    const zoomed = await facts(page, new URL(journey.direct, base).hash); required("journey_zoom_200_reflow_no_overflow", !zoomed.overflow, JSON.stringify(zoomed), { journey: journey.id, route: journey.direct, viewport: "1366@200%-equivalent(683css)" });
    await page.goto(routeUrl("/", `${journey.id}-home`), { waitUntil: "domcontentloaded" });
    const homeLink = await page.$(`#${journey.homeAnchor} ${journey.homeSelector}`);
    required("journey_home_entry_link", Boolean(homeLink), journey.homeAnchor, { journey: journey.id, route: "/" });
    if (!homeLink) continue;
    const href = await homeLink.evaluate(a => a.getAttribute("href"));
    required("journey_home_entry_internal", href.startsWith("/") && !href.startsWith("//"), href, { journey: journey.id, route: "/" });
    required("journey_home_entry_matches_explanation", new URL(href, base).pathname === new URL(journey.direct, base).pathname && new URL(href, base).hash === new URL(journey.direct, base).hash, `${href} != ${journey.direct}`, { journey: journey.id, route: "/" });
    const homeResult = await page.goto(routeUrl(href, `${journey.id}-home-destination`), { waitUntil: "domcontentloaded" });
    required("journey_home_entry_destination", homeResult?.status() === 200, `${href}: ${homeResult?.status()}`, { journey: journey.id, route: "/" });
  }
  if (adaptiveWithheld) {
    await page.setViewport({ width: 390, height: 844 });
    for (const route of ["/triagem-tecnica/", "/quantitativos-orcamento-obras/"]) {
      await page.goto(routeUrl(route, "withheld"), { waitUntil: "domcontentloaded" });
      const data = await facts(page);
      required("journey_withheld_has_three_direct_channels", Object.values(data.channels).every(Boolean) && !data.activeForm, JSON.stringify(data), { route, viewport: "390x844" });
    }
  }
  // The exported runtime classifier is the one the form module calls.  Test
  // its safe default directly so a new/unlisted need cannot become B2G
  // operation merely because it lacks a dictionary entry.
  await page.goto(routeUrl("/", "unknown-stage"), { waitUntil: "domcontentloaded" });
  const unknownJourney = await page.evaluate(() => window.confengeStageToJourney?.("necessidade ainda não classificada"));
  required("journey_unknown_stage_is_not_b2g_operation", unknownJourney === "outro", String(unknownJourney), { route: "/", journey: "disciplina_nao_listada" });
  // A market answer is useful without capture. Its optional commercial action
  // must therefore be a contextual direct channel, not an in-page CTA loop.
  await page.setViewport({ width: 390, height: 844 });
  const marketRoute = "/inteligencia/valor-tipico-contratos-pavimentacao/";
  const marketResponse = await page.goto(routeUrl(marketRoute, "market-answer"), { waitUntil: "domcontentloaded" });
  const marketAction = await page.$('[data-ma-event="xray_start"]');
  required("market_answer_status", marketResponse?.status() === 200, String(marketResponse?.status()), { route: marketRoute });
  required("market_answer_contextual_action", Boolean(marketAction), "[data-ma-event=xray_start]", { route: marketRoute });
  if (marketAction) {
    const href = await marketAction.evaluate(anchor => anchor.getAttribute("href") || "");
    const decoded = decodeURIComponent(href);
    required("market_answer_no_cta_loop", !["#cta", "#xray", ""].includes(href), href, { route: marketRoute });
    required("market_answer_contextual_whatsapp", /^https:\/\/wa\.me\/5548988344559\?text=/.test(href) && /pavimentação/i.test(decoded) && /valor-tipico-contratos-pavimentacao/.test(decoded), href, { route: marketRoute });
  }
  // Essential contact content must survive without JavaScript.  This checks the
  // shared contact route plus the two routes whose adaptive form is withheld.
  const noJs = await browser.newPage(); await noJs.setJavaScriptEnabled(false);
  await blockExternal(noJs);
  for (const route of ["/triagem-tecnica/", "/quantitativos-orcamento-obras/", "/servicos/"]) { await noJs.goto(routeUrl(route, "js-off"), { waitUntil: "domcontentloaded" }); const data = await facts(noJs); required("journey_js_off_essential_content", data.activeForm || data.triageLink || Object.values(data.channels).some(Boolean), JSON.stringify(data), { route }); }
  await noJs.close();
} catch (error) {
  record("journey_harness_runtime", false, error instanceof Error ? error.stack : String(error));
} finally { if (browser) await browser.close(); await new Promise(done => server.close(done)); }
report.ok = report.failures.length === 0; report.executed = { journeys_started: report.journeys.length, viewport_route_checks: report.journeys.reduce((total, row) => total + row.viewportChecks.length, 0), check_count: report.checks.length, failure_count: report.failures.length };
await import("node:fs/promises").then(fs => fs.writeFile(join(reportDir, "report.json"), JSON.stringify(report, null, 2)));
if (!report.ok) { console.error("CONTACT_JOURNEYS_FAIL", JSON.stringify(report.failures)); process.exit(1); }
console.log("CONTACT_JOURNEYS_OK", JSON.stringify(report.executed));
