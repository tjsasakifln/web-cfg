#!/usr/bin/env node
/*
 * Browser evidence for the commercial contact journeys.  It is deliberately
 * artifact-only by default. CONTACT_JOURNEY_BASE_URL=https://confenge.com.br
 * enables the same read-only journeys against the canonical production plane.
 * No WhatsApp, mail, telephone, lead, analytics or payment endpoint is
 * followed. The active-form persistence contract has its own controlled
 * synthetic probe (test_synthetic_lead_probe.mjs).
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
const requestedBase = String(process.env.CONTACT_JOURNEY_BASE_URL || "").trim();
const productionBase = "https://confenge.com.br";
const requestedBaseUrl = requestedBase ? new URL(requestedBase) : null;
if (requestedBase && requestedBaseUrl.href !== `${productionBase}/`) {
  throw new Error("CONTACT_JOURNEY_BASE_URL only permits https://confenge.com.br");
}
const productionMode = Boolean(requestedBase);
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
// Compact variation matrix for the real home form. This is deliberately not
// a cartesian product: each row represents a visitor need and, together, the
// rows cover the material inclusion risks without generating fake leads.
const intakeScenarios = [
  { id: "pf_reforma_sem_orcamento", audience: "pessoa_fisica", size: "pequeno", budget: "desconhecido", docs: "ausentes", stage: "obra ou imóvel para inspecionar ou documentar", journey: "obra", route: "/servicos/#servico-diagnostico", nextTerms: ["obra", "inspeção", "registro"] },
  { id: "pf_avaliacao_com_referencia", audience: "pessoa_fisica", size: "pequeno", budget: "conhecido", docs: "disponiveis", stage: "perícia, assistência técnica ou avaliação", journey: "pericia", route: "/servicos/#servico-pericia", nextTerms: ["provado", "avaliado", "papel técnico"] },
  { id: "profissional_compatibilizacao", audience: "profissional", size: "grande", budget: "conhecido", docs: "disponiveis", stage: "projeto, revisão ou compatibilização", journey: "projeto", route: "/servicos/#servico-projeto", nextTerms: ["finalidade", "projeto", "compatibilizar"] },
  { id: "profissional_disciplina_nao_listada", audience: "profissional", size: "pequeno", budget: "desconhecido", docs: "ausentes", stage: "outro", journey: "outro", route: "/servicos/", nextTerms: ["situação", "atuação", "próximo passo"] },
  { id: "condominio_anomalia", audience: "condominio", size: "grande", budget: "desconhecido", docs: "disponiveis", stage: "obra ou imóvel para inspecionar ou documentar", journey: "obra", route: "/servicos/#servico-diagnostico", nextTerms: ["obra", "diagnóstico", "local"] },
  { id: "condominio_orcamento_reparo", audience: "condominio", size: "pequeno", budget: "conhecido", docs: "ausentes", stage: "quantitativos ou orçamento", journey: "orcamento", route: "/quantitativos-orcamento-obras/", nextTerms: ["quantificado", "orçado", "projeto"] },
  { id: "empresa_projeto_estrutural", audience: "empresa", size: "grande", budget: "conhecido", docs: "disponiveis", stage: "projeto, revisão ou compatibilização", journey: "projeto", route: "/servicos/#servico-projeto", nextTerms: ["finalidade", "projetar", "material"] },
  { id: "empresa_sst_sem_documentos", audience: "empresa", size: "pequeno", budget: "desconhecido", docs: "ausentes", stage: "segurança do trabalho", journey: "sst", route: "/servicos/#servico-sst", nextTerms: ["risco", "documentação", "apoio técnico"] },
  { id: "orgao_planejando_projeto", audience: "orgao_publico", size: "grande", budget: "conhecido", docs: "disponiveis", stage: "planejamento de órgão público", journey: "orgao", route: "/servicos/#servico-obras-publicas", nextTerms: ["órgão", "etapa", "ajudar"] },
  { id: "orgao_inspecao_inicial", audience: "orgao_publico", size: "pequeno", budget: "desconhecido", docs: "ausentes", stage: "obra ou imóvel para inspecionar ou documentar", journey: "obra", route: "/servicos/#servico-diagnostico", nextTerms: ["obra", "documentação técnica", "local"] },
];
const localAdaptiveWithheld = JSON.parse(readFileSync(join(root, "netlify/functions/data/adaptive-intake-authority.json"), "utf8")).status === "WITHHELD";
let adaptiveWithheld = localAdaptiveWithheld;
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const readOnlyFunctionPaths = new Set(["/.netlify/functions/adaptive-intake-config"]);
const report = { mode: productionMode ? "canonical-production" : "local-artifact", base: productionMode ? productionBase : null, candidate: null, identity: { git_head: null, artifact_commit: null, served_build_commit: null, served_runtime_sha: null, consistent: null, before: null, after: null }, adaptiveIntake: { source: productionMode ? "served-readonly-config" : "local-authority-artifact", before: null, after: null }, requestSafety: { mutation_attempted: 0, mutation_blocked: 0, endpoint_reads_blocked: 0, external_reads_blocked: 0 }, site, planned: { journeys: journeys.length, viewport_route_checks: journeys.length * viewports.length, intake_scenarios: intakeScenarios.length, intake_audiences: [...new Set(intakeScenarios.map(row => row.audience))], intake_sizes: [...new Set(intakeScenarios.map(row => row.size))], intake_budgets: [...new Set(intakeScenarios.map(row => row.budget))], intake_document_states: [...new Set(intakeScenarios.map(row => row.docs))], intake_fields: ["nome", "email", "estagio", "jornada", "empresa", "mensagem"], intake_controls: ["data-form-next", "data-situation-next", "data-situation-detail", "data-situation-channels", "data-situation-route", "data-situation-whatsapp"] }, viewports: viewports.map(([width, height]) => ({ width, height })), journeys: [], intakeScenarios: [], checks: [], failures: [], blockedRequests: [], leadRequests: [] };
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
async function servedJson(path) {
  const response = await fetch(new URL(path, base), { headers: { Accept: "application/json", "Cache-Control": "no-cache" }, redirect: "error", signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  try { return { status: response.status, contentType: response.headers.get("content-type") || "", json: JSON.parse(text) }; } catch { return { status: response.status, contentType: response.headers.get("content-type") || "", json: null }; }
}
async function verifyServedIdentity(phase) {
  const build = await servedJson("/.well-known/build-info.json");
  const servedBuildCommit = build.json?.commit || build.json?.web_cfg_sha || null;
  let runtime = null;
  let servedRuntimeSha = null;
  // A static artifact intentionally has no runtime endpoint. Never fabricate
  // one here: only the canonical runtime can attest its own release identity.
  if (productionMode) {
    runtime = await servedJson("/.well-known/runtime-info.json");
    servedRuntimeSha = runtime.json?.release_sha || null;
  }
  const common = Boolean(build.status === 200 && /^application\/json(?:;|$)/i.test(build.contentType) && report.identity.git_head && report.identity.artifact_commit && servedBuildCommit
    && report.identity.git_head === report.identity.artifact_commit
    && report.identity.artifact_commit === servedBuildCommit);
  const consistent = productionMode ? common && runtime?.status === 200 && /^application\/json(?:;|$)/i.test(runtime?.contentType || "") && servedRuntimeSha === report.identity.artifact_commit : common;
  const observation = { build_status: build.status, build_content_type: build.contentType, build_commit: servedBuildCommit, runtime_status: runtime?.status ?? null, runtime_content_type: runtime?.contentType ?? null, runtime_sha: servedRuntimeSha, consistent };
  report.identity[phase] = observation;
  report.identity.served_build_commit = servedBuildCommit;
  report.identity.served_runtime_sha = servedRuntimeSha;
  report.identity.consistent = consistent;
  required(`journey_${phase}_served_identity_matches_candidate`, consistent, JSON.stringify({ git: report.identity.git_head, artifact: report.identity.artifact_commit, ...observation }), { route: productionMode ? "/.well-known/runtime-info.json" : "/.well-known/build-info.json" });
  return consistent;
}
async function verifyAdaptiveIntakeConfig(phase, expectedSnapshot = null) {
  if (!productionMode) {
    const observation = { state: localAdaptiveWithheld ? "WITHHELD" : "ACTIVE", source: "local-authority-artifact" };
    report.adaptiveIntake[phase] = observation;
    return { withheld: localAdaptiveWithheld, snapshot: observation.state };
  }
  const config = await servedJson("/.netlify/functions/adaptive-intake-config");
  const jsonContent = /^application\/json(?:;|$)/i.test(config.contentType);
  const withheld = config.status === 503 && config.json?.ok === false && config.json?.error === "intake_unavailable";
  const active = config.status === 200 && config.json?.ok === true && typeof config.json?.intake_version === "string"
    && Array.isArray(config.json?.options) && config.json.options.length > 0
    && config.json.options.every(option => typeof option?.value === "string" && typeof option?.label === "string" && typeof option?.location_required === "boolean");
  const snapshot = active ? JSON.stringify({ intake_version: config.json.intake_version, options: config.json.options }) : withheld ? "WITHHELD" : null;
  const observation = { status: config.status, content_type: config.contentType, state: withheld ? "WITHHELD" : active ? "ACTIVE" : "INVALID", option_count: active ? config.json.options.length : 0 };
  report.adaptiveIntake[phase] = observation;
  const valid = jsonContent && (withheld || active) && (!expectedSnapshot || snapshot === expectedSnapshot);
  required(`journey_${phase}_adaptive_intake_config`, valid, JSON.stringify(observation), { route: "/.netlify/functions/adaptive-intake-config" });
  if (!valid) throw new Error("adaptive intake config invalid or changed during journeys");
  return { withheld, snapshot };
}
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
    const method = request.method().toUpperCase();
    const firstParty = url.origin === base;
    const mutation = method !== "GET" && method !== "HEAD";
    const functionEndpoint = url.pathname.startsWith("/.netlify/functions/") && !readOnlyFunctionPaths.has(url.pathname);
    const apiEndpoint = url.pathname.startsWith("/api/");
    if (mutation) report.requestSafety.mutation_attempted += 1;
    if (firstParty && !mutation && !functionEndpoint && !apiEndpoint) return request.continue();
    const reason = !firstParty ? "external_origin" : mutation ? "unsafe_method" : "blocked_endpoint_read";
    if (mutation) report.requestSafety.mutation_blocked += 1;
    else if (!firstParty) report.requestSafety.external_reads_blocked += 1;
    else report.requestSafety.endpoint_reads_blocked += 1;
    report.blockedRequests.push({ url: request.url(), type: request.resourceType(), method, first_party: firstParty, reason });
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
const server = productionMode ? null : serve();
if (server) await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const base = productionMode ? productionBase : `http://127.0.0.1:${server.address().port}`;
report.base = base;
let browser;
try {
  // Do this before Chromium starts. A stale edge, runtime, artifact or checkout
  // therefore cannot turn a browser journey into misleading production evidence.
  if (!await verifyServedIdentity("before")) throw new Error("served identity does not match candidate");
  const adaptiveBefore = await verifyAdaptiveIntakeConfig("before");
  adaptiveWithheld = adaptiveBefore.withheld;
  browser = await puppeteer.launch({ executablePath: executable(), headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await blockExternal(page);
  page.on("request", request => {
    const url = new URL(request.url());
    if (/\/(?:api\/web\/lead|\.netlify\/functions\/lead)$/.test(url.pathname)) {
      report.leadRequests.push({ method: request.method(), url: request.url() });
    }
  });
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
  // Exercise the actual home form without submitting it. Each scenario must
  // pass step-one validation with only name, one contact channel and the
  // visitor's situation. Size, budget, documents, company and CNPJ are not
  // prerequisites. The free context remains in the form and is never copied
  // into analytics.
  await page.setViewport({ width: 390, height: 844 });
  for (const scenario of intakeScenarios) {
    await page.goto(routeUrl("/", `intake-${scenario.id}`), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#formulario-contato")?.dataset.formReady === "true");
    const syntheticName = `Teste controlado ${scenario.id}`;
    const syntheticEmail = `qa-${scenario.id}@example.invalid`;
    const syntheticCompany = ["empresa", "condominio", "orgao_publico"].includes(scenario.audience) ? `Organização sintética ${scenario.id}` : "";
    const contextToken = `CENARIO_${scenario.id.toUpperCase()}`;
    const userNeed = `${contextToken}. Público ${scenario.audience}; porte ${scenario.size}; orçamento ${scenario.budget}; documentos ${scenario.docs}. Necessidade técnica descrita sem dado real.`;
    await page.type("#nome", syntheticName);
    await page.type("#email", syntheticEmail);
    await page.select("#estagio", scenario.stage);
    await page.click("[data-form-next]");
    await page.waitForSelector('#form-step-2.is-active');
    // The UI intentionally focuses the new step after two animation frames.
    // Wait for that accessibility transition before typing; otherwise its
    // delayed focus can steal the first keystrokes from the target field and
    // make the probe report a preservation bug that the form did not cause.
    await page.waitForFunction(() => {
      const step = document.querySelector("#form-step-2.is-active");
      return Boolean(step && step.contains(document.activeElement));
    });
    if (syntheticCompany) {
      await page.click("#empresa");
      await page.type("#empresa", syntheticCompany);
    }
    await page.click("#mensagem");
    await page.type("#mensagem", userNeed);
    const state = await page.evaluate(({ scenario, syntheticName, syntheticEmail, syntheticCompany, contextToken, userNeed }) => {
      const form = document.querySelector("#formulario-contato");
      const requiredFields = [...form.querySelectorAll("[required]")].map(field => field.getAttribute("name") || field.id);
      const channels = form.querySelector("[data-situation-channels]");
      const route = form.querySelector("[data-situation-route]");
      const whatsapp = form.querySelector("[data-situation-whatsapp]");
      const next = form.querySelector("[data-situation-next]");
      const detail = form.querySelector("[data-situation-detail]");
      const b2g = form.querySelector("[data-b2g-qualification]");
      const analytics = JSON.stringify(window.dataLayer || []);
      const forbiddenAnalyticsValues = [syntheticName, syntheticEmail, syntheticCompany, contextToken, userNeed].filter(Boolean);
      const analyticsEvents = (window.dataLayer || []).map(event => event.event).filter(Boolean);
      return {
        step2Active: document.querySelector("#form-step-2")?.classList.contains("is-active") === true,
        selectedStage: form.querySelector("#estagio")?.value || "",
        hiddenJourney: form.querySelector("#jornada-hidden")?.value || "",
        successDestination: form.getAttribute("data-success-destination") || "",
        message: form.querySelector("#mensagem")?.value || "",
        company: form.querySelector("#empresa")?.value || "",
        requiredFields,
        hasCnpjField: Boolean(form.querySelector('[name*="cnpj" i], [id*="cnpj" i]')),
        hasFileField: Boolean(form.querySelector('input[type="file"]')),
        b2gHidden: Boolean(b2g?.hidden && b2g?.hasAttribute("inert")),
        nextVisible: Boolean(next && !next.hidden),
        nextText: next?.textContent?.trim() || "",
        detailVisible: Boolean(detail && !detail.hidden),
        detailText: detail?.textContent?.trim() || "",
        channelsVisible: Boolean(channels && !channels.hidden),
        routeHref: route?.getAttribute("href") || "",
        whatsappHref: whatsapp?.getAttribute("href") || "",
        analyticsContainsPrivateInput: forbiddenAnalyticsValues.some(value => analytics.includes(value)),
        analyticsSubmitOrSuccess: analyticsEvents.some(event => ["lead_form_submit", "lead_form_success", "lead_persisted"].includes(event)),
        exclusionCopy: /recusad[oa]|não atendemos|fora (?:da|de) (?:atuação|escopo)|incompatível/i.test(`${next?.textContent || ""} ${detail?.textContent || ""}`),
        scenario,
      };
    }, { scenario, syntheticName, syntheticEmail, syntheticCompany, contextToken, userNeed });
    const context = { scenario: scenario.id, audience: scenario.audience, size: scenario.size, budget: scenario.budget, docs: scenario.docs, route: "/" };
    required("intake_step_one_accepts_minimum_fields", state.step2Active, JSON.stringify(state), context);
    required("intake_need_and_audience_are_preserved", state.selectedStage === scenario.stage && state.hiddenJourney === scenario.journey && state.successDestination === "/obrigado" && state.message === userNeed && state.company === syntheticCompany, JSON.stringify(state), context);
    required("intake_company_budget_documents_and_cnpj_not_required", !state.hasCnpjField && !state.hasFileField && !state.requiredFields.some(name => /cnpj|empresa|faixa|risco|or[cç]amento|document|maturidade/i.test(name)), JSON.stringify(state.requiredFields), context);
    required("intake_contextual_next_step", state.nextVisible && state.detailVisible && scenario.nextTerms.every(term => state.nextText.toLocaleLowerCase("pt-BR").includes(term.toLocaleLowerCase("pt-BR"))) && !state.exclusionCopy, JSON.stringify({ next: state.nextText, detail: state.detailText }), context);
    required("intake_contextual_direct_channels", state.channelsVisible && state.routeHref === scenario.route && /^https:\/\/wa\.me\/5548988344559\?text=/.test(state.whatsappHref) && state.b2gHidden, JSON.stringify({ route: state.routeHref, whatsapp: state.whatsappHref, b2gHidden: state.b2gHidden }), context);
    required("intake_no_private_input_in_analytics", !state.analyticsContainsPrivateInput && !state.analyticsSubmitOrSuccess, JSON.stringify(state), context);
    report.intakeScenarios.push({ ...context, selectedStage: state.selectedStage, journey: state.hiddenJourney, nextText: state.nextText, routeHref: state.routeHref, requiredFields: state.requiredFields, leadSubmitted: false });
  }
  required("intake_no_lead_request_or_fake_persistence", report.leadRequests.length === 0, JSON.stringify(report.leadRequests), { route: "/", scenarios: intakeScenarios.length });
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
  const marketAction = await page.$('[data-ma-event="cta_click"][data-cta-id="veja-sua-empresa"]');
  required("market_answer_status", marketResponse?.status() === 200, String(marketResponse?.status()), { route: marketRoute });
  required("market_answer_contextual_action", Boolean(marketAction), "[data-ma-event=cta_click][data-cta-id=veja-sua-empresa]", { route: marketRoute });
  if (marketAction) {
    const href = await marketAction.evaluate(anchor => anchor.getAttribute("href") || "");
    const decoded = decodeURIComponent(href);
    required("market_answer_no_cta_loop", !["#cta", "#xray", ""].includes(href), href, { route: marketRoute });
    required("market_answer_contextual_whatsapp", /^https:\/\/wa\.me\/5548988344559\?text=/.test(href) && /pavimentação/i.test(decoded) && /valor-tipico-contratos-pavimentacao/.test(decoded), href, { route: marketRoute });
  }
  // These are isolated browser-state fixtures, never evidence of a real lead.
  // Direct links and forged query strings must not manufacture confirmation.
  for (const route of ["/obrigado.html", "/obrigado-contrato.html", "/obrigado-edital.html", "/obrigado-operacao.html"]) {
    const fixture = "lead-0123456789abcdef0123456789a";
    for (const state of ["direct", "query_only", "mismatch", "matching_session"]) {
      await page.goto(routeUrl(route, "confirmation-setup"), { waitUntil: "domcontentloaded" });
      await page.evaluate(({ state, fixture }) => {
        sessionStorage.removeItem("confenge_last_receipt");
        sessionStorage.removeItem("confenge_last_receipt_destination");
        if (state === "matching_session") {
          sessionStorage.setItem("confenge_last_receipt", fixture);
          sessionStorage.setItem("confenge_last_receipt_destination", location.pathname.replace(/\.html$/, ""));
        }
        if (state === "mismatch") sessionStorage.setItem("confenge_last_receipt", "lead-fffffffffffffffffffffffffff");
      }, { state, fixture });
      const url = new URL(route, base);
      if (state !== "direct") url.searchParams.set("receipt", fixture);
      const response = await page.goto(url.href, { waitUntil: "domcontentloaded" });
      const status = await page.evaluate(() => ({
        success: document.body.getAttribute("data-lead-success") === "1",
        receiptVisible: document.getElementById("receipt-id")?.hidden === false,
        title: document.getElementById("confirmation-title")?.textContent || "",
      }));
      const expected = state === "matching_session";
      required("confirmation_receipt_state", response?.status() === 200 && status.success === expected && status.receiptVisible === expected && (expected || !/recebemos|recebido|enviado com sucesso/i.test(status.title)), JSON.stringify({ state, ...status }), { route });
    }
  }
  // Essential contact content must survive without JavaScript.  This checks the
  // shared contact route plus the two routes whose adaptive form is withheld.
  const noJs = await browser.newPage(); await noJs.setJavaScriptEnabled(false);
  await blockExternal(noJs);
  for (const route of ["/triagem-tecnica/", "/quantitativos-orcamento-obras/", "/servicos/"]) { await noJs.goto(routeUrl(route, "js-off"), { waitUntil: "domcontentloaded" }); const data = await facts(noJs); required("journey_js_off_essential_content", data.activeForm || data.triageLink || Object.values(data.channels).some(Boolean), JSON.stringify(data), { route }); }
  await noJs.close();
  required("journey_all_mutation_requests_blocked", report.requestSafety.mutation_attempted === report.requestSafety.mutation_blocked, JSON.stringify(report.requestSafety));
  if (!await verifyServedIdentity("after")) throw new Error("served identity changed during journeys");
  await verifyAdaptiveIntakeConfig("after", adaptiveBefore.snapshot);
} catch (error) {
  record("journey_harness_runtime", false, error instanceof Error ? error.stack : String(error));
} finally { if (browser) await browser.close(); if (server) await new Promise(done => server.close(done)); }
report.ok = report.failures.length === 0; report.executed = { journeys_started: report.journeys.length, viewport_route_checks: report.journeys.reduce((total, row) => total + row.viewportChecks.length, 0), intake_scenarios_completed: report.intakeScenarios.length, intake_scenario_checks: report.checks.filter(row => row.name.startsWith("intake_")).length, lead_requests_observed: report.leadRequests.length, check_count: report.checks.length, failure_count: report.failures.length };
await import("node:fs/promises").then(fs => fs.writeFile(join(reportDir, "report.json"), JSON.stringify(report, null, 2)));
if (!report.ok) { console.error("CONTACT_JOURNEYS_FAIL", JSON.stringify(report.failures)); process.exit(1); }
console.log("CONTACT_JOURNEYS_OK", JSON.stringify(report.executed));
