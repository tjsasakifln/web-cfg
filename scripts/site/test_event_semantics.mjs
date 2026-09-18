/**
 * Event semantics gate (G04-10): the correct event is present, the incorrect
 * one is absent, and no PII rides in the payload. Drives the shipped script.js
 * over the real HTML (repo root or _site when built), one route per case,
 * click with preventDefault and a dataLayer diff -- same harness pattern as
 * test_deliverables_hub_ui.mjs. Also covers TAREFAS-01 (hidden `origem`
 * precedence on the home form).
 *
 *   node scripts/site/test_event_semantics.mjs [http://external-base]
 */
import fs from "fs";
import path from "path";
import { createServer } from "http";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const externalBase = process.argv[2];
const artifactRoot = path.join(root, "_site");
const siteRoot = !externalBase && fs.existsSync(path.join(artifactRoot, "index.html"))
  ? artifactRoot
  : root;
const port = Number(process.env.EVENT_SEMANTICS_PORT || 8797);
const reportPath = String(process.env.EVENT_SEMANTICS_REPORT || "").trim();
const PII_PARAM_PATTERN = /address|arquivo|attach|cnpj|company|cpf|document|edital|email|empresa|endereco|comment|description|field|file|text|name|nome|message|mensagem|note|phone|query|search|tel|whatsapp/;
const FORBIDDEN_EVENTS = ["qualified_lead", "pipeline", "handoff_accepted", "conversion", "journey_nav_click"];

function startStaticServer() {
  const mime = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript", ".png": "image/png", ".jpg": "image/jpeg",
    ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json",
    ".woff2": "font/woff2",
  };
  const server = createServer((request, response) => {
    let urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.join(siteRoot, urlPath);
    if (!file.startsWith(siteRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404); response.end("not found"); return;
    }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

const server = externalBase ? null : await startStaticServer();
const base = externalBase || `http://127.0.0.1:${port}`;
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: resolveChromePath(), headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
} catch (error) {
  console.log("EVENT_SEMANTICS_UNAVAILABLE", String(error?.message || error).slice(0, 240));
  if (server) server.close();
  process.exit(process.env.CI ? 1 : 0);
}

const findings = [];
let failed = 0;

/** Click `selector` (nth match) with preventDefault and return the dataLayer diff. */
async function clickAndDiff(page, selector, nth = 0) {
  return page.evaluate(async ({ selector, nth }) => {
    const before = (window.dataLayer || []).length;
    const target = document.querySelectorAll(selector)[nth];
    if (!target) return { missing: true, selector, added: [] };
    target.addEventListener("click", (event) => event.preventDefault(), { capture: true });
    target.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const added = (window.dataLayer || []).slice(before).map((row) => JSON.parse(JSON.stringify(row)));
    return { missing: false, selector, added, href: target.getAttribute("href") };
  }, { selector, nth });
}

function piiViolations(events) {
  const out = [];
  for (const event of events) {
    for (const [key, value] of Object.entries(event)) {
      if (PII_PARAM_PATTERN.test(String(key).toLowerCase())) out.push({ key, reason: "pii_key" });
      if (typeof value !== "string") continue;
      if (value.includes("@")) out.push({ key, reason: "email_like_value" });
      if (/^\+?\d{10,15}$/.test(value.replace(/[\s()-]/g, ""))) out.push({ key, reason: "phone_like_value" });
      if (/^(mailto:|tel:)/i.test(value)) out.push({ key, reason: "href_leaked" });
    }
  }
  return out;
}

function check(name, route, ok, detail) {
  // Same shape site_excellence.py reads from the hub probe: `check` + `errors[]`.
  findings.push({ check: name, route, ok, errors: ok ? [] : [name], detail });
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${route} ${ok ? "" : JSON.stringify(detail).slice(0, 600)}`);
}

async function open(page, route, { width = 1440, height = 1000 } = {}) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForFunction(() => typeof window.confengeTrack === "function", { timeout: 10000 });
}

const page = await browser.newPage();
page.setDefaultTimeout(20000);
await page.evaluateOnNewDocument(() => { window.CONFENGE_DEBUG_ANALYTICS = false; });

// (1) home hero "Ver serviços por situação" -> exactly one cta_click destination_type=route.
{
  await open(page, "/");
  const diff = await clickAndDiff(page, 'a[data-event-name="cta_click"][href="/servicos/"]');
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  const others = diff.added.filter((e) => /^(whatsapp_click|lead_form_|content_to_service)/.test(e.event));
  check("home_hero_route_cta", "/", !diff.missing && clicks.length === 1 && clicks[0].destination_type === "route"
    && clicks[0].cta_position === "hero" && others.length === 0 && piiViolations(diff.added).length === 0, diff);
}

// (11) home situation link (no data-event-name) -> cta_click route with its own cta_id.
{
  await open(page, "/");
  const diff = await clickAndDiff(page, 'a.situation-action[data-cta-id="home-private-quantities-budget"]');
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  check("home_situation_action_route_cta", "/", !diff.missing && clicks.length === 1
    && clicks[0].destination_type === "route" && clicks[0].cta_id === "home-private-quantities-budget"
    && diff.added.length === 1, diff);
}

// (2) home #contato -> one cta_click alias_from=service_cta_click destination_type=form.
{
  await open(page, "/");
  const diff = await clickAndDiff(page, 'a[data-cta-position="corporate_triage"][href="#contato"]');
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  check("home_contact_anchor_form_cta", "/", !diff.missing && clicks.length === 1
    && clicks[0].alias_from === "service_cta_click" && clicks[0].destination_type === "form"
    && clicks[0].cta_kind === "service" && diff.added.length === 1, diff);
}

// (5) home wa.me link declared critical_decision_cta_click -> whatsapp_click with cta_kind, alias never in dataLayer.
{
  await open(page, "/");
  const diff = await clickAndDiff(page, 'a[data-event-name="critical_decision_cta_click"]');
  const wa = diff.added.filter((e) => e.event === "whatsapp_click");
  const wrong = diff.added.filter((e) => e.event === "critical_decision_cta_click");
  check("home_whatsapp_cta_kind_from_alias", "/", !diff.missing && wa.length === 1
    && wa[0].cta_kind === "critical_decision" && wa[0].destination_type === "whatsapp"
    && wrong.length === 0 && diff.added.length === 1 && piiViolations(diff.added).length === 0, diff);
}

// (7) header "Solicitar proposta" -> one cta_click destination_type=route on three routes.
for (const route of ["/", "/servicos/", "/triagem-tecnica/"]) {
  await open(page, route);
  const diff = await clickAndDiff(page, "a.header-cta");
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  const transitions = diff.added.filter((e) => e.event === "content_to_service");
  check("header_cta_route", route, !diff.missing && clicks.length === 1 && clicks[0].destination_type === "route"
    && transitions.length === 0 && diff.added.length === 1 && clicks[0].page_path === route, diff);
}

// (7b) G04-02: header "Solicitar proposta" with a same-page capture anchor (private routes and the
// readiness tool) -> exactly one cta_click destination_type=form, page_path kept, no content_to_service.
// The /triagem-tecnica/ header stays route; a tool page whose header goes to /triagem-tecnica/ stays route.
for (const [route, hash] of [
  ["/quantitativos-orcamento-obras/", "#triagem-quantitativos"],
  ["/projetos-complementares-engenharia/", "#escopo-projeto"],
  ["/inspecao-diagnostico-edificacoes/", "#contato-inspecao"],
  ["/compatibilizacao-projetos-engenharia/", "#pedido-compatibilizacao"],
  ["/ferramentas/prontidao-tecnica-obra-privada/", "#diagnostico"],
]) {
  await open(page, route);
  const diff = await clickAndDiff(page, "a.header-cta");
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  check("header_cta_capture_anchor_form", route, !diff.missing && diff.href === hash && clicks.length === 1
    && clicks[0].destination_type === "form" && clicks[0].page_path === route
    && diff.added.length === 1 && piiViolations(diff.added).length === 0, diff);
}
{
  await open(page, "/ferramentas/diagnostico-defesa-margem/");
  const diff = await clickAndDiff(page, "a.header-cta");
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  check("header_cta_route_on_tool", "/ferramentas/diagnostico-defesa-margem/", !diff.missing
    && diff.href === "/triagem-tecnica/" && clicks.length === 1 && clicks[0].destination_type === "route"
    && diff.added.length === 1, diff);
}

// (3b) G04-02: hero capture anchors whose hash is outside the historical pattern (#escopo-projeto is a
// cta_formal section, #encaminhar is the partner contact block) -> exactly one cta_click destination_type=form
// with their own cta_id.
for (const [route, ctaId, hash] of [
  ["/projetos-complementares-engenharia/", "frame-elaboration-hero", "#escopo-projeto"],
  ["/parcerias-engenharia/", "partner-hero-describe", "#encaminhar"],
]) {
  await open(page, route);
  const diff = await clickAndDiff(page, `a[data-cta-id="${ctaId}"]`);
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  check("hero_capture_anchor_form_cta", route, !diff.missing && diff.href === hash && clicks.length === 1
    && clicks[0].cta_id === ctaId && clicks[0].destination_type === "form" && clicks[0].cta_position === "hero"
    && diff.added.length === 1, diff);
}

// (3c) G04-02: a capture anchor without data-cta-id or data-event-name (inline button to
// #triagem-quantitativos) still emits one cta_click destination_type=form; a table-of-contents link to a prose
// section (#diagnostico on an article) emits nothing.
{
  await open(page, "/quantitativos-orcamento-obras/");
  const diff = await clickAndDiff(page, 'a.button[href="#triagem-quantitativos"]:not(.header-cta):not([data-cta-id])');
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  check("capture_anchor_without_cta_id_form", "/quantitativos-orcamento-obras/", !diff.missing && clicks.length === 1
    && clicks[0].destination_type === "form" && diff.added.length === 1, diff);
}
{
  await open(page, "/conteudos/calculo-reequilibrio-economico-financeiro/");
  const diff = await clickAndDiff(page, 'nav.article-toc a[href="#diagnostico"]');
  check("toc_prose_anchor_silent", "/conteudos/calculo-reequilibrio-economico-financeiro/", !diff.missing
    && diff.added.length === 0, diff);
}

// (3d) tool submit button declared cta_click (data-tool-to-form, no href) -> destination_type=form.
{
  await open(page, "/ferramentas/diagnostico-defesa-margem/");
  const diff = await clickAndDiff(page, 'button[type="submit"][data-event-name="cta_click"]');
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  check("tool_submit_cta_click_form", "/ferramentas/diagnostico-defesa-margem/", !diff.missing && clicks.length === 1
    && clicks[0].destination_type === "form" && clicks[0].cta_id === "segunda-leitura-contrato"
    && piiViolations(diff.added).length === 0, diff);
}

// (4b) home footer mailto whose visible text is the address -> email_click without cta_label or any '@' value.
{
  await open(page, "/");
  const diff = await clickAndDiff(page, 'a[data-cta-position="contact"][href^="mailto:"]');
  const mailEv = diff.added.filter((e) => e.event === "email_click");
  check("home_footer_mailto_no_address_in_payload", "/", !diff.missing && mailEv.length === 1
    && mailEv[0].destination_type === "email" && !("cta_label" in mailEv[0])
    && diff.added.length === 1 && piiViolations(diff.added).length === 0, { diff, pii: piiViolations(diff.added) });
}

// (3) /quantitativos-orcamento-obras/ hero capture anchor -> one cta_click with its own cta_id, destination_type=form.
{
  await open(page, "/quantitativos-orcamento-obras/");
  const diff = await clickAndDiff(page, 'a[data-cta-id="frame-quantities-budget-hero"]');
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  check("quantities_hero_form_cta", "/quantitativos-orcamento-obras/", !diff.missing && clicks.length === 1
    && clicks[0].cta_id === "frame-quantities-budget-hero" && clicks[0].destination_type === "form"
    && diff.added.length === 1, diff);
}

// (4) mailto / tel in the same block -> email_click / outbound_click(tel) carry attribution and no PII.
{
  await open(page, "/quantitativos-orcamento-obras/");
  const mail = await clickAndDiff(page, 'a[data-cta-id="quantities-budget-alternative-email"]');
  const mailEv = mail.added.filter((e) => e.event === "email_click");
  check("quantities_email_click_attribution", "/quantitativos-orcamento-obras/", !mail.missing && mailEv.length === 1
    && mailEv[0].destination_type === "email"
    && mailEv[0].cta_id === "quantities-budget-alternative-email"
    && mailEv[0].route_family === "private-engineering-quantities-budget"
    && mailEv[0].asset_id === "private_quantities_budget_route_v1"
    && mail.added.length === 1 && piiViolations(mail.added).length === 0, { mail, pii: piiViolations(mail.added) });
  const tel = await clickAndDiff(page, 'a[data-cta-id="quantities-budget-alternative-phone"]');
  const telEv = tel.added.filter((e) => e.event === "outbound_click");
  check("quantities_tel_click_attribution", "/quantitativos-orcamento-obras/", !tel.missing && telEv.length === 1
    && telEv[0].destination_type === "tel"
    && telEv[0].cta_id === "quantities-budget-alternative-phone"
    && telEv[0].route_family === "private-engineering-quantities-budget"
    && telEv[0].asset_id === "private_quantities_budget_route_v1"
    && tel.added.length === 1 && piiViolations(tel.added).length === 0, { tel, pii: piiViolations(tel.added) });
  const wa = await clickAndDiff(page, 'a[data-cta-id="quantities-budget-alternative-whatsapp"]');
  const waEv = wa.added.filter((e) => e.event === "whatsapp_click");
  check("quantities_whatsapp_click_attribution", "/quantitativos-orcamento-obras/", !wa.missing && waEv.length === 1
    && waEv[0].route_family === "private-engineering-quantities-budget"
    && waEv[0].asset_id === "private_quantities_budget_route_v1"
    && wa.added.length === 1 && piiViolations(wa.added).length === 0, wa);
}

// (8) hub /servicos/ -> private service route is content_to_service with a known destination_service_id.
{
  await open(page, "/servicos/");
  const diff = await clickAndDiff(page, 'a[data-cta-id="services-private-quantities-budget"]');
  const trans = diff.added.filter((e) => e.event === "content_to_service");
  check("hub_servicos_content_to_service_known", "/servicos/", !diff.missing && trans.length === 1
    && trans[0].destination_service_id === "quantitativos-orcamento-obras"
    && trans[0].destination_path === "/quantitativos-orcamento-obras/"
    && trans[0].destination_type === "service" && diff.added.length === 1, diff);
}

// (9) hub /servicos/ -> triage route link is cta_click route, never content_to_service UNKNOWN_SERVICE.
{
  await open(page, "/servicos/");
  const diff = await clickAndDiff(page, 'a[href="/triagem-tecnica/#projetos"]');
  const clicks = diff.added.filter((e) => e.event === "cta_click");
  const unknown = diff.added.filter((e) => e.destination_service_id === "UNKNOWN_SERVICE");
  check("hub_servicos_triage_link_route_cta", "/servicos/", !diff.missing && clicks.length === 1
    && clicks[0].destination_type === "route" && unknown.length === 0 && diff.added.length === 1, diff);
}

// (6) global negative: click every [data-event-name] on the home; commercial/retired names never appear.
{
  await open(page, "/");
  const result = await page.evaluate(async () => {
    const nodes = [...document.querySelectorAll("[data-event-name], a.header-cta, a.situation-action")];
    for (const node of nodes) {
      node.addEventListener("click", (event) => event.preventDefault(), { capture: true });
      node.click();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { clicked: nodes.length, events: (window.dataLayer || []).map((row) => row.event) };
  });
  const forbidden = result.events.filter((name) => FORBIDDEN_EVENTS.includes(name));
  const untyped = await page.evaluate(() => (window.dataLayer || [])
    .filter((row) => row.event === "cta_click" && !row.destination_type).length);
  check("home_no_forbidden_events", "/", result.clicked > 5 && forbidden.length === 0 && untyped === 0,
    { clicked: result.clicked, forbidden, untyped, events: [...new Set(result.events)] });
}

// TAREFAS-01: hidden `origem` on the home form honours attributed origin over the pre-rendered '/'.
{
  await page.goto("about:blank");
  await page.evaluateOnNewDocument(() => { try { sessionStorage.clear(); } catch (_) { /* ignore */ } });
  await open(page, "/?origem=/radar/pavimentacao-infraestrutura-viaria-sc/#contato");
  const fromQuery = await page.evaluate(() => document.querySelector('form input[name="origem"]')?.value || null);
  check("origem_from_query_overrides_prerendered", "/", fromQuery === "/radar/pavimentacao-infraestrutura-viaria-sc/", { fromQuery });

  await page.goto("about:blank");
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.clear();
      sessionStorage.setItem("confenge_pseo_attribution", JSON.stringify({ origem: "artigo", landing_url: "/conteudos/documentos-reequilibrio-obra-publica/", saved_at: String(Date.now()) }));
    } catch (_) { /* ignore */ }
  });
  await open(page, "/#contato");
  const fromSession = await page.evaluate(() => ({
    origem: document.querySelector('form input[name="origem"]')?.value || null,
    landing: document.querySelector('form input[name="landing_page"]')?.value || null,
  }));
  check("origem_from_session_overrides_prerendered", "/", fromSession.origem === "artigo"
    && fromSession.landing === "/conteudos/documentos-reequilibrio-obra-publica/", fromSession);

  // PII in ?origem= never reaches the hidden field: the pre-rendered '/' stays.
  await page.goto("about:blank");
  await page.evaluateOnNewDocument(() => { try { sessionStorage.clear(); } catch (_) { /* ignore */ } });
  await open(page, "/?origem=foo%40bar.com#contato");
  const piiOrigem = await page.evaluate(() => ({
    origem: document.querySelector('form input[name="origem"]')?.value || null,
    stored: (() => { try { return sessionStorage.getItem("confenge_pseo_attribution") || ""; } catch (_) { return ""; } })(),
    layer: JSON.stringify(window.dataLayer || []),
  }));
  check("origem_query_pii_dropped", "/", piiOrigem.origem === "/" && !piiOrigem.stored.includes("@")
    && !piiOrigem.layer.includes("@"), piiOrigem);

  await page.goto("about:blank");
  await page.evaluateOnNewDocument(() => { try { sessionStorage.clear(); } catch (_) { /* ignore */ } });
  await open(page, "/");
  const plain = await page.evaluate(() => document.querySelector('form input[name="origem"]')?.value || null);
  check("origem_prerendered_kept_without_attribution", "/", plain === "/", { plain });

  // A route that pre-renders its own identity (lead-core reads origem === 'entregas') keeps it
  // even when the session carries an attributed origin: only the generic '/' placeholder yields.
  await page.goto("about:blank");
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.clear();
      sessionStorage.setItem("confenge_pseo_attribution", JSON.stringify({ origem: "artigo", saved_at: String(Date.now()) }));
    } catch (_) { /* ignore */ }
  });
  await open(page, "/entregas/");
  const routeIdentity = await page.evaluate(() => document.querySelector('form input[name="origem"]')?.value || null);
  check("origem_route_identity_not_overwritten", "/entregas/", routeIdentity === "entregas", { routeIdentity });
}

await browser.close();
if (server) server.close();
const report = { ok: failed === 0, generated_at: new Date().toISOString(), site_root: siteRoot === artifactRoot ? "_site" : "repo", findings };
if (reportPath) {
  const output = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log("EVENT_SEMANTICS", JSON.stringify({ ok: report.ok, failed, checks: findings.length }));
if (failed) process.exit(1);
