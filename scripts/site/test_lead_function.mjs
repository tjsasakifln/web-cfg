/**
 * Drives the real netlify/functions/lead.cjs handler (not a reimplementation).
 * Covers: method, validation, consent, honeypot, rate limit, persist-before-success,
 * response whitelist (no topic/token/PII), idempotency, delivery failure ≠ drop lead.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

// Durable file store for tests (real I/O path of createStore when LEAD_STORE_DIR set)
const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-leads-"));
process.env.LEAD_STORE_DIR = storeDir;
process.env.NODE_ENV = "test";
delete process.env.NTFY_URL;
delete process.env.NTFY_TOKEN;
delete process.env.NTFY_TOPIC;
delete process.env.FORMSUBMIT_URL;
delete process.env.RESEND_API_KEY;
delete process.env.OPS_WEBHOOK_URL;
delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.LEAD_REQUIRE_TURNSTILE;

// Clear module cache so env is read fresh
const leadPath = path.join(root, "netlify/functions/lead.cjs");
const ratePath = path.join(root, "netlify/functions/lib/lead-rate-limit.cjs");

function loadHandler() {
  delete require.cache[require.resolve(leadPath)];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-core.cjs"))];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-store.cjs"))];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-delivery.cjs"))];
  delete require.cache[require.resolve(ratePath)];
  return require(leadPath);
}

// Parses the fetch target as a URL and compares the hostname exactly, so a
// look-alike host (e.g. "resend.com.evil.example" or a query string carrying
// the literal substring) cannot pass as the real provider (CodeQL
// js/incomplete-url-substring-sanitization).
function isRequestToHost(url, hostname) {
  try {
    return new URL(String(url)).hostname === hostname;
  } catch {
    return false;
  }
}

function event(body, method = "POST", extraHeaders = {}) {
  return {
    httpMethod: method,
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-lead-test/1.0",
      "x-forwarded-for": extraHeaders.ip || "203.0.113.50",
      ...extraHeaders,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log("PASS", name, detail || "");
}
function fail(name, detail) {
  console.error("FAIL", name, detail);
  process.exitCode = 1;
  throw new Error(`FAIL: ${name} — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

const { handler, setStoreForTests } = loadHandler();
const { MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
const { _reset } = require(ratePath);

// Use memory store with explicit test override for speed + assertions
const mem = new MemoryStore();
setStoreForTests(mem);
_reset();

// 1) method guard
{
  const res = await handler(event({}, "GET"));
  if (res.statusCode !== 405) fail("method", res);
  pass("method_405");
}

// 2) validation missing fields
{
  const res = await handler(event({ nome: "A" }));
  const data = JSON.parse(res.body);
  if (res.statusCode !== 400 || data.ok !== false) fail("validation", data);
  pass("validation_400");
}

// 3) consent required
{
  const res = await handler(
    event({
      nome: "QA Consent",
      telefone: "48999999999",
      estagio: "contrato sob pressao",
      jornada: "contrato",
    }),
  );
  const data = JSON.parse(res.body);
  if (res.statusCode !== 400 || data.error !== "consent") fail("consent", data);
  pass("consent_required");
}

// 3b) legitimate 400s name the field, never the value typed
{
  const res = await handler(
    event({ nome: "QA Campo", telefone: "123", estagio: "contrato sob pressao", consentimento: true }),
  );
  const data = JSON.parse(res.body);
  if (res.statusCode !== 400 || data.error !== "validation" || data.field !== "telefone") {
    fail("invalid_phone_names_field", { status: res.statusCode, data });
  }
  if (JSON.stringify(data).includes("123") && !/10 ou 11/.test(data.message)) fail("invalid_phone_leaks_value", data);
  const mail = await handler(
    event({ nome: "QA Campo", email: "sem-arroba", estagio: "contrato sob pressao", consentimento: true }),
  );
  const mailData = JSON.parse(mail.body);
  if (mail.statusCode !== 400 || mailData.field !== "email") fail("invalid_email_names_field", mailData);
  pass("validation_400_names_field", { telefone: data.field, email: mailData.field });
}

// 3c) "urgência sem dados": a valid person who does not yet know which service,
// budget, deadline or contract they need is RECEIVED (201, one record,
// receipt, NEEDS_CONTEXT). Not knowing never eliminates a valid contact.
{
  const { ESTAGIO_UNKNOWN_SERVICE } = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const urgent = {
    nome: "QA Urgência",
    telefone: "48988344559",
    consentimento: true,
    mensagem: "tenho urgência e quero falar mas ainda não tenho todos os dados",
  };
  const before = mem.map.size;
  const res = await handler(event(urgent, "POST", { ip: "203.0.113.77" }));
  const data = JSON.parse(res.body);
  const stored = data.lead_id ? await mem.get(data.lead_id) : null;
  if (
    res.statusCode !== 201 || data.ok !== true || !data.lead_id || !data.receipt_id ||
    data.qualification_state !== "NEEDS_CONTEXT" || mem.map.size !== before + 1 || !stored
  ) {
    fail("urgencia_sem_dados_received", { status: res.statusCode, data, size: mem.map.size, before });
  }
  if (stored.estagio !== ESTAGIO_UNKNOWN_SERVICE || stored.jornada !== "outro" ||
      stored.qualification_state !== "NEEDS_CONTEXT" || stored.mensagem !== urgent.mensagem ||
      !Array.isArray(stored.qualification_gaps) || !stored.qualification_gaps.includes("estagio_unknown_service")) {
    fail("urgencia_sem_dados_stored_shape", stored);
  }
  const byEmail = await handler(event({
    nome: "QA Urgência E-mail",
    email: "qa-urgencia@example.com",
    consentimento: "true",
    mensagem: urgent.mensagem,
  }, "POST", { ip: "203.0.113.78" }));
  const byEmailData = JSON.parse(byEmail.body);
  if (byEmail.statusCode !== 201 || byEmailData.qualification_state !== "NEEDS_CONTEXT" || mem.map.size !== before + 2) {
    fail("urgencia_sem_dados_email_received", { status: byEmail.statusCode, byEmailData });
  }
  // Pre-persistence rejections stay intact: no contact channel, no consent, honeypot.
  const noContact = await handler(event({ nome: "QA Sem Canal", consentimento: true, mensagem: urgent.mensagem }));
  const noConsent = await handler(event({ nome: "QA Sem Consentimento", telefone: "48988344559", mensagem: urgent.mensagem }));
  const bot = await handler(event({ ...urgent, "empresa-site": "http://spam.example" }));
  if (noContact.statusCode !== 400 || JSON.parse(noContact.body).error !== "validation") fail("urgencia_no_contact_still_400", noContact.body);
  if (noConsent.statusCode !== 400 || JSON.parse(noConsent.body).error !== "consent") fail("urgencia_no_consent_still_400", noConsent.body);
  if (bot.statusCode !== 200 || JSON.parse(bot.body).status !== "suppressed" || mem.map.size !== before + 2) {
    fail("urgencia_honeypot_still_suppressed", { status: bot.statusCode, size: mem.map.size });
  }
  pass("urgencia_sem_dados_received", { lead_id: data.lead_id, estagio: stored.estagio });
}

// 4) honeypot — no real store write for bot fields
{
  const before = (await mem.list()).length;
  const res = await handler(
    event({
      nome: "Bot",
      telefone: "48999999999",
      estagio: "outro",
      consentimento: "on",
      "empresa-site": "spam",
    }),
  );
  const data = JSON.parse(res.body);
  if (!data.ok || data.status !== "suppressed") fail("honeypot", data);
  if ((await mem.list()).length !== before) fail("honeypot_persisted", "store grew");
  pass("honeypot_suppressed");
}

// 4b) Diretoria handraise is catalog-bound but is not checkout.
{
  const base = {
    nome: "QA Diretoria",
    email: "qa-diretoria@example.com",
    estagio: "enquadramento-diretoria-b2g",
    jornada: "operacao",
    consentimento: "1",
    origem: "diretoria-b2g",
    route_family: "diretoria-b2g",
    landing_page: "https://confenge.com.br/diretoria-b2g/",
    offer_id: "CFG-DIRB2G-FLEX-v1",
  };
  const termsMismatch = await handler(event({ ...base, terms_id: "CFG-TERMS-STALE" }));
  const termsBody = JSON.parse(termsMismatch.body);
  if (termsMismatch.statusCode !== 422 || termsBody.error !== "terms_version_mismatch") {
    fail("diretoria_terms_mismatch", { status: termsMismatch.statusCode, body: termsBody });
  }
  const priceMismatch = await handler(event({
    ...base,
    terms_id: "CFG-TERMS-B2B-2026-08-17-v1",
    amount_cents: 1,
  }));
  const priceBody = JSON.parse(priceMismatch.body);
  if (priceMismatch.statusCode !== 422 || priceBody.error !== "price_mismatch") {
    fail("diretoria_price_mismatch", { status: priceMismatch.statusCode, body: priceBody });
  }
  pass("diretoria_catalog_fail_closed");
}

// 5) happy path — persist then 201, no secrets in body
{
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body, headers: init.headers });
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({ id: "msg" }) };
  };
  process.env.OPS_WEBHOOK_URL = "https://example.com/hooks/ops";
  process.env.OPS_WEBHOOK_SECRET = "test-secret-not-for-prod";
  try {
    const res = await handler(
      event({
        nome: "Maria Construtora",
        telefone: "48988344559",
        estagio: "problema urgente em contrato",
        jornada: "contrato",
        consentimento: "on",
        origem: "/",
        utm_source: "google",
        utm_medium: "organic",
        utm_campaign: "inbound",
        landing_page: "/defesa-margem-contratos-publicos/",
        mensagem: "SECRET_MESSAGE_SHOULD_NOT_LEAK",
      }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.ok || !data.lead_id) fail("persist_success", data);
    if (data.receipt_id !== data.lead_id) fail("receipt_compat", data);
    const bodyStr = JSON.stringify(data);
    if (bodyStr.includes("SECRET_MESSAGE") || bodyStr.includes("ntfy") || bodyStr.includes("topic") || bodyStr.includes("test-secret") || /\bexample\.com\b/.test(bodyStr)) {
      fail("response_leak", data);
    }
    // Full delivery object / secrets must not leak; notify_status/email_status are non-PII OK
    if (data.delivery || data.upstream || data.topic) fail("delivery_in_response", data);
    if (!data.notify_status || !data.email_status) fail("delivery_status_fields", data);
    const allowedSt = /^(ok|pending|skipped|error)$/;
    if (!allowedSt.test(data.notify_status) || !allowedSt.test(data.email_status)) {
      fail("delivery_status_values", data);
    }
    const stored = await mem.get(data.lead_id);
    if (!stored) fail("not_in_store", data.lead_id);
    if (stored.nome !== "Maria Construtora") fail("store_nome", stored);
    if (stored.utm_source !== "google" || stored.jornada !== "contrato") fail("store_attribution", stored);
    if (stored.mensagem !== "SECRET_MESSAGE_SHOULD_NOT_LEAK") fail("store_message", stored);
    if (!calls.some((c) => c.url.includes("example.com/hooks/ops"))) fail("webhook_not_called", calls);
    // Webhook body may contain PII over TLS to private endpoint — response must not
    pass("persist_201", { lead_id: data.lead_id, journey: data.journey });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPS_WEBHOOK_URL;
    delete process.env.OPS_WEBHOOK_SECRET;
  }
}

// 5b) Five unpriced service pillars persist distinct attribution without data-* PII.
{
  const pillars = [
    ["defesa-margem-contratos-publicos", "contrato"],
    ["atrasos-prorrogacao-obras-publicas", "contrato"],
    ["defesa-tecnica-contratos-publicos", "contrato"],
    ["acompanhamento-contratos-obras", "operacao"],
    ["bid-room-licitacoes-obras", "edital"],
  ];
  const ids = new Set();
  for (let i = 0; i < pillars.length; i += 1) {
    const [slug, jornada] = pillars[i];
    const html = fs.readFileSync(path.join(root, slug, "index.html"), "utf8");
    const form = html.match(/<form\b[^>]*action="\/\.netlify\/functions\/lead"[^>]*>[\s\S]*?<\/form>/i)?.[0] || "";
    if (!form) fail("pillar_form_missing", slug);
    if (/data-[a-z-]+="[^"]*(?:@|\b\d{8,}\b)[^"]*"/i.test(form)) {
      fail("pillar_form_data_attr_pii", slug);
    }
    if (!/name="offer_id" value=""/.test(form) || !/name="terms_id" value=""/.test(form)) {
      fail("pillar_form_invented_offer", slug);
    }
    const res = await handler(
      event(
        {
          nome: `QA Pilar ${i + 1}`,
          email: `qa-pillar-${i + 1}@example.com`,
          estagio: slug,
          jornada,
          consentimento: "1",
          offer_id: "",
          terms_id: "",
          origem: slug,
          landing_page: `https://confenge.com.br/${slug}/`,
          route_family: slug,
          asset_id: slug,
          cta_id: `${slug}-handraise`,
          record_kind: "qa",
          test_mode: true,
          idempotency_key: `qa-pillar-${i + 1}`,
        },
        "POST",
        { ip: `198.51.100.${20 + i}` },
      ),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.ok || !data.lead_id) {
      fail("pillar_form_persist", { slug, status: res.statusCode, data });
    }
    const stored = await mem.get(data.lead_id);
    if (!stored || stored.route_family !== slug || stored.origem !== slug) {
      fail("pillar_form_attribution", { slug, stored });
    }
    if (stored.offer_id || stored.terms_id || stored.source !== "CONFENGE_WEB") {
      fail("pillar_form_unpriced_contract", { slug, stored });
    }
    ids.add(data.lead_id);
  }
  if (ids.size !== pillars.length) fail("pillar_form_distinct_receipts", [...ids]);
  pass("pillar_forms_distinct_attribution", { routes: pillars.map(([slug]) => slug) });
}

// 5c) PII notification destinations are HTTPS + explicitly allowlisted in production.
{
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: String(init.body || "") });
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) };
  };
  const deliveryPath = path.join(root, "netlify/functions/lib/lead-delivery.cjs");
  delete require.cache[require.resolve(deliveryPath)];
  const { deliverOpsWebhook, deliverNtfyAuth, validatePiiDestination } = require(deliveryPath);
  const record = {
    lead_id: "pii-destination-probe",
    record_kind: "real",
    received_at: new Date().toISOString(),
    jornada: "contrato",
    estagio: "lead",
    nome: "Contato Sensível",
    email: "private@example.com",
    telefone: "48999999999",
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.OPS_WEBHOOK_URL = "http://ops.example.test/hook";
    delete process.env.OPS_WEBHOOK_ALLOWED_HOSTS;
    const plain = await deliverOpsWebhook(record);
    if (plain.status !== "error" || calls.length) fail("ops_webhook_plain_http_blocked", { plain, calls });

    for (const [name, url, reason] of [
      ["credentials", "https://user:secret@ops.example.test/hook", "embedded_credentials"],
      ["default_port", "https://ops.example.test:443/hook", "port_not_allowed"],
      ["custom_port", "https://ops.example.test:8443/hook", "port_not_allowed"],
      ["query", "https://ops.example.test/hook?token=secret", "query_or_fragment_not_allowed"],
      ["fragment", "https://ops.example.test/hook#secret", "query_or_fragment_not_allowed"],
    ]) {
      const checked = validatePiiDestination(url, "ops.example.test", process.env);
      if (checked.ok || checked.reason !== reason) {
        fail(`pii_destination_${name}_blocked`, checked);
      }
    }

    process.env.OPS_WEBHOOK_URL = "https://ops.example.test/hook";
    const noAllowlist = await deliverOpsWebhook(record);
    if (noAllowlist.status !== "error" || calls.length) {
      fail("ops_webhook_allowlist_required", { noAllowlist, calls });
    }

    process.env.OPS_WEBHOOK_ALLOWED_HOSTS = "ops.example.test";
    const allowed = await deliverOpsWebhook(record);
    if (allowed.status !== "ok" || calls.length !== 1 || !calls[0].body.includes("private@example.com")) {
      fail("ops_webhook_allowed_https", { allowed, calls });
    }

    process.env.NTFY_URL = "https://evil.example/topic";
    process.env.NTFY_TOKEN = "private-token";
    process.env.NTFY_ALLOWED_HOSTS = "ntfy.example.test";
    const ntfyDenied = await deliverNtfyAuth(record);
    if (ntfyDenied.status !== "error" || calls.length !== 1) {
      fail("ntfy_host_denied_before_fetch", { ntfyDenied, calls });
    }
    process.env.NTFY_URL = "https://ntfy.example.test/private-topic";
    const ntfyAllowed = await deliverNtfyAuth(record);
    if (
      ntfyAllowed.status !== "ok" ||
      calls.length !== 2 ||
      calls[1].url !== "https://ntfy.example.test/private-topic" ||
      !calls[1].body.includes("private@example.com")
    ) {
      fail("ntfy_allowed_https", { ntfyAllowed, calls });
    }
    pass("pii_notification_destinations_fail_closed");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = previous;
  }
}

// 5d) The two hub forms introduced by #290 reach the real persistence path
// with their shipped attribution. A static <form> alone is not conversion.
{
  const hubs = [
    {
      route: "casos",
      journey: "contrato",
      stage: "casos-hub",
      asset: "casos-hub",
      cta: "casos-hub-handraise",
    },
    {
      route: "entregas",
      journey: "operacao",
      stage: "entregas-exemplos-hub",
      asset: "entregas-exemplos-hub",
      cta: "entregas-hub-handraise",
    },
  ];
  const ids = new Set();
  for (let i = 0; i < hubs.length; i += 1) {
    const hub = hubs[i];
    const html = fs.readFileSync(path.join(root, hub.route, "index.html"), "utf8");
    const form = html.match(/<form\b[^>]*action="\/\.netlify\/functions\/lead"[^>]*>[\s\S]*?<\/form>/i)?.[0] || "";
    if (!form) fail("hub_form_missing", hub.route);
    if (/data-[a-z-]+="[^"]*(?:@|\b\d{8,}\b)[^"]*"/i.test(form)) {
      fail("hub_form_data_attr_pii", hub.route);
    }
    const hiddenValue = (name) => form.match(
      new RegExp(`<input\\b(?=[^>]*\\bname=["']${name}["'])[^>]*\\bvalue=["']([^"']*)["'][^>]*>`, "i"),
    )?.[1];
    const expectedHidden = {
      offer_id: "",
      terms_id: "",
      jornada: hub.journey,
      estagio: hub.stage,
      origem: hub.route,
      asset_id: hub.asset,
      cta_id: hub.cta,
      route_family: hub.route,
      landing_page: `https://confenge.com.br/${hub.route}/`,
    };
    for (const [name, expected] of Object.entries(expectedHidden)) {
      const got = hiddenValue(name);
      if (got !== expected) fail("hub_form_hidden_attribution", { route: hub.route, name, got, expected });
    }
    if (!/<input\b(?=[^>]*type="checkbox")(?=[^>]*name="consentimento")(?=[^>]*\brequired\b)[^>]*>/i.test(form)) {
      fail("hub_form_consent_required", hub.route);
    }

    const res = await handler(
      event(
        {
          nome: `QA Hub ${i + 1}`,
          email: `qa-hub-${i + 1}@example.com`,
          estagio: hub.stage,
          jornada: hub.journey,
          consentimento: "1",
          offer_id: "",
          terms_id: "",
          origem: hub.route,
          landing_page: `https://confenge.com.br/${hub.route}/`,
          route_family: hub.route,
          asset_id: hub.asset,
          cta_id: hub.cta,
          record_kind: "qa",
          test_mode: true,
          idempotency_key: `qa-hub-${i + 1}`,
        },
        "POST",
        { ip: `192.0.2.${30 + i}` },
      ),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.ok || !data.lead_id) {
      fail("hub_form_persist", { route: hub.route, status: res.statusCode, data });
    }
    const stored = await mem.get(data.lead_id);
    if (
      !stored
      || stored.route_family !== hub.route
      || stored.origem !== hub.route
      || stored.asset_id !== hub.asset
      || stored.cta_id !== hub.cta
      || stored.jornada !== hub.journey
    ) {
      fail("hub_form_attribution", { route: hub.route, stored });
    }
    if (stored.offer_id || stored.terms_id || stored.source !== "CONFENGE_WEB") {
      fail("hub_form_unpriced_contract", { route: hub.route, stored });
    }
    ids.add(data.lead_id);
  }
  if (ids.size !== hubs.length) fail("hub_form_distinct_receipts", [...ids]);
  pass("hub_forms_persisted_attribution", { routes: hubs.map(({ route }) => route) });
}

// 5e) The public catalogue captures a canonical deliverable selection without
// opening checkout. Unknown and blocked IDs fail before persistence.
{
  const html = fs.readFileSync(path.join(root, "entregas/index.html"), "utf8");
  const options = [...html.matchAll(/<option value="(CFG-D\d{2})"( disabled)?/g)]
    .map((match) => ({ id: match[1], disabled: Boolean(match[2]) }));
  const published = ["CFG-D01", "CFG-D02", "CFG-D03", "CFG-D04", "CFG-D05", "CFG-D06", "CFG-D07", "CFG-D08"];
  if (options.length !== 8 || JSON.stringify(options.map(({ id }) => id)) !== JSON.stringify(published)) {
    fail("catalog_deliverable_select_census", options);
  }
  if (options.some(({ disabled }) => disabled) || options.some(({ id }) => ["CFG-D11", "CFG-D43"].includes(id))) {
    fail("catalog_blocked_option_not_offered", options);
  }

  const base = {
    nome: "QA Catálogo",
    email: "qa-catalogo@example.com",
    estagio: "entregas-exemplos-hub",
    jornada: "operacao",
    consentimento: "1",
    offer_id: "",
    terms_id: "",
    origem: "entregas",
    landing_page: "https://confenge.com.br/entregas/",
    route_family: "entregas",
    asset_id: "entregas-exemplos-hub",
    cta_id: "entregas-hub-handraise",
    record_kind: "qa",
    test_mode: true,
  };
  for (const [deliverable_id, error] of [
    ["CFG-D99", "deliverable_id_unknown"],
    ["CFG-D11", "deliverable_unavailable"],
  ]) {
    const before = mem.map.size;
    const res = await handler(event({ ...base, deliverable_id }, "POST", { ip: "192.0.2.90" }));
    const data = JSON.parse(res.body);
    if (res.statusCode !== 422 || data.error !== error || mem.map.size !== before) {
      fail("catalog_deliverable_fail_closed", { deliverable_id, status: res.statusCode, data });
    }
  }

  const res = await handler(event({
    ...base,
    deliverable_id: "CFG-D49",
    idempotency_key: "qa-catalog-deliverable-49",
  }, "POST", { ip: "192.0.2.91" }));
  const data = JSON.parse(res.body);
  const stored = data.lead_id ? await mem.get(data.lead_id) : null;
  if (res.statusCode !== 201 || !stored || stored.deliverable_id !== "CFG-D49") {
    fail("catalog_deliverable_persisted", { status: res.statusCode, data, stored });
  }
  if (stored.offer_id || stored.terms_id || stored.asset_id !== "entregas-exemplos-hub") {
    fail("catalog_deliverable_does_not_invent_checkout", stored);
  }
  pass("catalog_deliverable_selection_persisted", stored.deliverable_id);
}

// The generic catalogue hand-raise may name a specialised deliverable without
// pretending to be its full product questionnaire.
{
  for (const [index, deliverableId] of ["CFG-D14", "CFG-D01", "CFG-D17"].entries()) {
    const before = mem.map.size;
    const res = await handler(event({
      nome: "QA Catálogo Especializado",
      email: "qa-catalogo-especializado@example.com",
      estagio: "entregas-exemplos-hub",
      jornada: "edital",
      consentimento: "1",
      origem: "entregas",
      landing_page: "https://confenge.com.br/entregas/",
      route_family: "entregas",
      asset_id: "entregas-exemplos-hub",
      cta_id: "entregas-hub-handraise",
      deliverable_id: deliverableId,
      record_kind: "qa",
      test_mode: true,
    }, "POST", { ip: `192.0.2.${91 + index}` }));
    const data = JSON.parse(res.body);
    const stored = data.lead_id ? await mem.get(data.lead_id) : null;
    if (res.statusCode !== 201 || mem.map.size !== before + 1 || stored?.deliverable_id !== deliverableId) {
      fail("catalog_specialised_deliverable_handraise", { deliverableId, status: res.statusCode, data, stored });
    }
    pass("catalog_specialised_deliverable_handraise", stored.deliverable_id);
  }
}

// 5f) The five #330 units have a prepared structured qualification contract,
// while the protected dedicated route remains dormant under the #291 freeze.
// Invalid context fails before persistence; valid context stays on the lead.
{
  const html = fs.readFileSync(path.join(root, "diagnostico-pre-licitacao/index.html"), "utf8");
  const licitacaoContract = JSON.parse(fs.readFileSync(
    path.join(root, "data/commercial/page-contract-licitacao.v1.json"),
    "utf8",
  ));
  const qualificationDeadline = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  for (const field of [
    "deliverable_id",
    "public_contract_id",
    "opportunity_deadline",
    "contract_value_band",
    "lot_count",
    "execution_regime",
    "decision_intent",
  ]) {
    if (!licitacaoContract.public_implementation.prepared_capture_fields.includes(field)) {
      fail("licitacao_prepared_qualification_field", field);
    }
  }
  if (html.includes("GENERATED:LICITACAO-PRODUCTS") || html.includes('id="captura-licitacao"')) {
    fail("licitacao_protected_route_must_remain_dormant");
  }

  const base = {
    nome: "QA Licitação",
    email: "qa-licitacao@example.com",
    estagio: "licitacao-produto",
    jornada: "edital",
    consentimento: "1",
    origem: "diagnostico-pre-licitacao",
    landing_page: "https://confenge.com.br/diagnostico-pre-licitacao/",
    route_family: "diagnostico-pre-licitacao",
    asset_id: "licitacao-products",
    cta_id: "licitacao-products-handraise",
    deliverable_id: "CFG-D14",
    public_contract_id: "EDITAL-DEMO-2026-001",
    opportunity_deadline: qualificationDeadline,
    contract_value_band: "20m_100m",
    lot_count: "2",
    execution_regime: "empreitada_preco_unitario",
    decision_intent: "avaliar_disputa",
    record_kind: "qa",
    test_mode: true,
  };
  for (const [index, invalid] of [
    { opportunity_deadline: "2026-99-99" },
    { contract_value_band: "valor_livre" },
    { lot_count: "0" },
    { execution_regime: "regime_livre" },
    { decision_intent: "decisao_livre" },
    { public_contract_id: "" },
  ].entries()) {
    // Chave explícita por caso: a lacuna deixa o material de idempotência
    // idêntico entre casos, e a persistência tem de ser provada UMA vez por
    // envio (size === before + 1), não tolerada por dedup.
    const before = mem.map.size;
    const res = await handler(event({
      ...base,
      ...invalid,
      idempotency_key: `qa-licitacao-gap-${index}`,
    }, "POST", { ip: "192.0.2.92" }));
    const data = JSON.parse(res.body);
    if (res.statusCode >= 400 || mem.map.size !== before + 1) {
      fail("licitacao_qualification_gap_is_received", { invalid, status: res.statusCode, size: [before, mem.map.size], data });
    }
    if (data.qualification_state !== "NEEDS_CONTEXT") {
      fail("licitacao_qualification_gap_is_recorded", { invalid, data });
    }
  }

  // Numa lacuna (edital sem numero), o que o visitante informou dentro do enum
  // publicado sobrevive no registro: faixa, lotes, regime e decisao. Texto
  // livre fora do enum continua descartado (null), nunca persistido.
  {
    const gap = await handler(event({
      ...base,
      public_contract_id: "",
      execution_regime: "regime_livre",
      idempotency_key: "qa-licitacao-gap-keeps-raw-fields",
    }, "POST", { ip: "192.0.2.93" }));
    const gapData = JSON.parse(gap.body);
    const gapStored = gapData.lead_id ? await mem.get(gapData.lead_id) : null;
    if (
      gap.statusCode !== 201 || !gapStored || gapStored.qualification_state !== "NEEDS_CONTEXT" ||
      gapStored.contract_value_band !== "20m_100m" || gapStored.lot_count !== 2 ||
      gapStored.decision_intent !== "avaliar_disputa" || gapStored.opportunity_deadline !== qualificationDeadline ||
      gapStored.execution_regime !== null || gapStored.public_contract_id !== null
    ) {
      fail("licitacao_gap_keeps_raw_qualification_fields", { status: gap.statusCode, gapData, gapStored });
    }
    pass("licitacao_gap_keeps_raw_qualification_fields", { lead_id: gapData.lead_id });

    // Por que NEEDS_CONTEXT: o registro guarda os códigos das checagens que
    // falharam (nunca o valor informado), e o handoff Warmbly continua
    // mapeando o mesmo registro sem quebrar nem vazar o campo como texto.
    const handoff = require(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"));
    if (
      !Array.isArray(gapStored.qualification_gaps) || gapStored.qualification_gaps.length === 0 ||
      !gapStored.qualification_gaps.includes("licitacao_qualification_invalid") ||
      gapStored.qualification_gaps.some((code) => /regime_livre|EDITAL|@/.test(String(code)))
    ) {
      fail("licitacao_gap_reasons_are_stored", { qualification_gaps: gapStored.qualification_gaps });
    }
    const gapHandoff = handoff.mapLeadToInboundV1({ ...gapStored, consentimento: true });
    if (
      gapHandoff.source !== "CONFENGE_WEB" || gapHandoff.lead_id !== gapData.lead_id ||
      !/qualificacao=NEEDS_CONTEXT/.test(gapHandoff.message || "")
    ) {
      fail("licitacao_gap_handoff_mapping_intact", { keys: Object.keys(gapHandoff), message: gapHandoff.message });
    }
    pass("licitacao_gap_reasons_are_stored", { qualification_gaps: gapStored.qualification_gaps });
  }

  for (const [index, deliverableId] of ["CFG-D12", "CFG-D13", "CFG-D14", "CFG-D15", "CFG-D16"].entries()) {
    const unsafeDeadline = await handler(event({
      ...base,
      deliverable_id: deliverableId,
      opportunity_deadline: new Date().toISOString().slice(0, 10),
    }, "POST", { ip: `192.0.2.${94 + index}` }));
    // O caso que mais importa: prazo hoje. O piso material continua publicado
    // na rota; quem chega fora dele passa a ser RECEBIDO e marcado, em vez de
    // descartado e informado de que o servidor falhou.
    const unsafeBody = JSON.parse(unsafeDeadline.body);
    if (unsafeDeadline.statusCode >= 400 || unsafeBody.qualification_state !== "NEEDS_CONTEXT") {
      fail("licitacao_urgent_deadline_is_received", { deliverableId, response: unsafeDeadline });
    }
  }

  const res = await handler(event({
    ...base,
    idempotency_key: "qa-licitacao-d14",
  }, "POST", { ip: "192.0.2.93" }));
  const data = JSON.parse(res.body);
  const stored = data.lead_id ? await mem.get(data.lead_id) : null;
  if (
    res.statusCode !== 201 ||
    !stored ||
    stored.deliverable_id !== "CFG-D14" ||
    stored.public_contract_id !== "EDITAL-DEMO-2026-001" ||
    stored.opportunity_deadline !== qualificationDeadline ||
    stored.contract_value_band !== "20m_100m" ||
    stored.lot_count !== 2 ||
    stored.execution_regime !== "empreitada_preco_unitario" ||
    stored.decision_intent !== "avaliar_disputa"
  ) {
    fail("licitacao_qualification_persisted", { status: res.statusCode, data, stored });
  }
  // Registro limpo: nenhuma lacuna gravada (null/ausente, nunca []).
  if (stored.qualification_state === "NEEDS_CONTEXT" || stored.qualification_gaps != null) {
    fail("licitacao_clean_record_has_no_gaps", { qualification_state: stored.qualification_state, qualification_gaps: stored.qualification_gaps });
  }
  pass("licitacao_qualification_persisted", stored?.deliverable_id);
}

// 5d) Every priced model form reaches the real persistence path. Static markup
// is insufficient: receipts must be distinct and retain the shipped attribution.
{
  const modelSlugs = fs.readdirSync(path.join(root, "casos"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("modelo-"))
    .map((entry) => entry.name)
    .sort();
  if (modelSlugs.length !== 8) fail("priced_model_census", modelSlugs);
  const analysisCutoff = new Date().toISOString().slice(0, 10);
  const opportunityDeadline = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);

  const ids = new Set();
  for (let i = 0; i < modelSlugs.length; i += 1) {
    const slug = modelSlugs[i];
    const html = fs.readFileSync(path.join(root, "casos", slug, "index.html"), "utf8");
    const form = html.match(
      /<form\b[^>]*action="\/\.netlify\/functions\/lead"[^>]*>[\s\S]*?<\/form>/i,
    )?.[0] || "";
    if (!form) fail("priced_model_form_missing", slug);
    if (/data-[a-z-]+="[^"]*(?:@|\b\d{8,}\b)[^"]*"/i.test(form)) {
      fail("priced_model_form_data_attr_pii", slug);
    }
    const openTag = form.split(">", 1)[0];
    const dataValue = (name) => openTag.match(
      new RegExp(`\\bdata-${name}=["']([^"']*)["']`, "i"),
    )?.[1];
    const hiddenValue = (name) => form.match(
      new RegExp(`<input\\b(?=[^>]*\\bname=["']${name}["'])[^>]*\\bvalue=["']([^"']*)["'][^>]*>`, "i"),
    )?.[1];
    const expected = {
      origem: `/casos/${slug}/`,
      landing_page: `https://confenge.com.br/casos/${slug}/`,
      asset_id: dataValue("asset-id"),
      cta_id: dataValue("cta-id"),
      route_family: dataValue("route-family"),
      jornada: hiddenValue("jornada"),
      estagio: slug,
      deliverable_id: hiddenValue("deliverable_id"),
    };
    for (const [name, value] of Object.entries(expected)) {
      if (!value || hiddenValue(name) !== value) {
        fail("priced_model_form_hidden_attribution", { slug, name, got: hiddenValue(name), expected: value });
      }
    }
    if (hiddenValue("offer_id") !== "" || hiddenValue("terms_id") !== "" || hiddenValue("amount_cents")) {
      fail("priced_model_form_invented_checkout", slug);
    }
    for (const field of ["cnpj", "analysis_cutoff", "opportunity_deadline", "decision_intent"]) {
      if (!form.includes(`name="${field}"`)) fail("priced_model_form_qualification_field", { slug, field });
    }

    const res = await handler(
      event(
        {
          nome: `QA Modelo ${i + 1}`,
          email: `qa-model-${i + 1}@example.com`,
          estagio: expected.estagio,
          jornada: expected.jornada,
          consentimento: "1",
          offer_id: "",
          terms_id: "",
          origem: expected.origem,
          landing_page: expected.landing_page,
          route_family: expected.route_family,
          asset_id: expected.asset_id,
          cta_id: expected.cta_id,
          deliverable_id: expected.deliverable_id,
          cnpj: "52407089000109",
          analysis_cutoff: analysisCutoff,
          opportunity_deadline: opportunityDeadline,
          decision_intent: "validar_mercado",
          record_kind: "qa",
          test_mode: true,
          idempotency_key: `qa-priced-model-${i + 1}`,
        },
        "POST",
        { ip: `203.0.113.${80 + i}` },
      ),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.ok || !data.lead_id) {
      fail("priced_model_form_persist", { slug, status: res.statusCode, data });
    }
    const stored = await mem.get(data.lead_id);
    if (
      !stored || stored.source !== "CONFENGE_WEB" ||
      stored.origem !== expected.origem || stored.landing_page !== expected.landing_page ||
      stored.route_family !== expected.route_family || stored.asset_id !== expected.asset_id ||
      stored.cta_id !== expected.cta_id || stored.jornada !== expected.jornada ||
      stored.deliverable_id !== expected.deliverable_id || stored.cnpj !== "52407089000109" ||
      stored.analysis_cutoff !== analysisCutoff || stored.opportunity_deadline !== opportunityDeadline ||
      stored.decision_intent !== "validar_mercado"
    ) {
      fail("priced_model_form_attribution", { slug, stored, expected });
    }
    if (stored.offer_id || stored.terms_id || stored.amount_cents) {
      fail("priced_model_form_checkout_state", { slug, stored });
    }
    ids.add(data.lead_id);
  }
  if (ids.size !== modelSlugs.length) fail("priced_model_form_distinct_receipts", [...ids]);

  const invalidBase = {
    nome: "QA Escopo",
    email: "qa-escopo@example.com",
    estagio: "modelo-relatorio-inteligencia-licitacoes",
    jornada: "edital",
    consentimento: "1",
    origem: "/casos/modelo-relatorio-inteligencia-licitacoes/",
    deliverable_id: "CFG-D01",
    cnpj: "52407089000109",
    analysis_cutoff: analysisCutoff,
    opportunity_deadline: opportunityDeadline,
    decision_intent: "priorizar_oportunidades",
    record_kind: "qa",
    test_mode: true,
  };
  for (const [index, invalid] of [
    { cnpj: "123" },
    { cnpj: "11111111111111" },
    { analysis_cutoff: "2026-99-99" },
    { opportunity_deadline: analysisCutoff },
    { decision_intent: "decisao_livre" },
  ].entries()) {
    // Propriedade da decisão vigente: uma lacuna de qualificação é REGISTRADA,
    // não usada para descartar o contato. O piso material continua publicado na
    // rota; o que acabou foi perder a pessoa que chega fora dele.
    // Chave explícita por caso: os dois CNPJs inválidos viram null e deixariam
    // o material de idempotência idêntico; a persistência é provada UMA vez
    // por envio (size === before + 1), não tolerada por dedup.
    const before = mem.map.size;
    const res = await handler(event({
      ...invalidBase,
      ...invalid,
      idempotency_key: `qa-priced-gap-${index}`,
    }, "POST", { ip: "203.0.113.99" }));
    const data = JSON.parse(res.body);
    if (res.statusCode >= 400 || mem.map.size !== before + 1) {
      fail("priced_model_qualification_gap_is_received", { invalid, status: res.statusCode, size: [before, mem.map.size], data });
    }
    if (data.qualification_state !== "NEEDS_CONTEXT") {
      fail("priced_model_qualification_gap_is_recorded", { invalid, data });
    }
    // O campo estruturado cnpj só guarda CNPJ VALIDADO: texto livre e dígitos
    // inválidos viram null (fora da chave de idempotência e do handoff);
    // um CNPJ válido sobrevive mesmo com lacuna em outro campo.
    const stored = data.lead_id ? await mem.get(data.lead_id) : null;
    const expectedCnpj = "cnpj" in invalid ? null : "52407089000109";
    if (!stored || stored.cnpj !== expectedCnpj) {
      fail("priced_model_gap_keeps_only_validated_cnpj", { invalid, stored_cnpj: stored && stored.cnpj, expectedCnpj });
    }
  }
  pass("priced_model_gap_keeps_only_validated_cnpj");

  // Fora dos oito produtos o fallback era o MESMO clamp sem guarda, então a
  // decisão vale para todos os formulários: texto livre nunca vira identidade
  // estruturada; um CNPJ válido (mesmo pontuado) sobrevive normalizado.
  {
    const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
    const generic = {
      nome: "QA CNPJ Genérico",
      email: "qa-cnpj-generico@example.com",
      estagio: "orcamento",
      jornada: "obra",
      consentimento: "1",
      origem: "/servicos/",
    };
    const freeText = core.validateAndNormalize({ ...generic, cnpj: "joao@x.com" });
    const badDigits = core.validateAndNormalize({ ...generic, cnpj: "11111111111111" });
    const punctuated = core.validateAndNormalize({ ...generic, cnpj: "52.407.089/0001-09" });
    if (
      !freeText.ok || freeText.lead.cnpj !== null ||
      !badDigits.ok || badDigits.lead.cnpj !== null ||
      !punctuated.ok || punctuated.lead.cnpj !== "52407089000109"
    ) {
      fail("generic_form_cnpj_only_validated", {
        freeText: freeText.lead && freeText.lead.cnpj,
        badDigits: badDigits.lead && badDigits.lead.cnpj,
        punctuated: punctuated.lead && punctuated.lead.cnpj,
      });
    }
    pass("generic_form_cnpj_only_validated");
  }
  pass("priced_model_forms_persisted_attribution", { routes: modelSlugs });
}

// 5h) The #333 contract products require contract, event, safe deadline and
// stage. All seven IDs share one fail-closed server contract; the hub captures
// the unrouted reajuste item as well.
{
  const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const deadline = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const base = {
    nome: "QA Contratos",
    email: "qa-contratos@example.com",
    estagio: "contract-defense-products",
    jornada: "contrato",
    consentimento: "1",
    origem: "servicos-obras-publicas",
    public_contract_id: "CONTRATO-DEMO-2026-01",
    contract_event: "medicao_glosa_pagamento",
    opportunity_deadline: deadline,
    contract_stage: "documentando",
    record_kind: "qa",
    test_mode: true,
  };
  for (let number = 17; number <= 23; number += 1) {
    const check = core.validateAndNormalize({ ...base, deliverable_id: `CFG-D${number}` });
    if (!check.ok || check.lead.deliverable_id !== `CFG-D${number}`) {
      fail("contract_product_server_contract", { number, check });
    }
  }
  for (const [index, invalid] of [
    { public_contract_id: "ab" },
    { contract_event: "evento_livre" },
    { opportunity_deadline: "2026-99-99" },
    { opportunity_deadline: "2020-01-01" },
    { contract_stage: "estagio_livre" },
  ].entries()) {
    const before = mem.map.size;
    const res = await handler(event({
      ...base,
      deliverable_id: "CFG-D18",
      ...invalid,
      idempotency_key: `qa-contract-gap-${index}`,
    }, "POST", { ip: "203.0.113.98" }));
    const data = JSON.parse(res.body);
    if (res.statusCode >= 400 || mem.map.size !== before + 1) {
      fail("contract_product_qualification_gap_is_received", { invalid, status: res.statusCode, size: [before, mem.map.size], data });
    }
    if (data.qualification_state !== "NEEDS_CONTEXT") {
      fail("contract_product_qualification_gap_is_recorded", { invalid, data });
    }
  }
  const res = await handler(event({
    ...base,
    deliverable_id: "CFG-D21",
    contract_event: "reajuste",
    contract_stage: "quantificando",
    idempotency_key: "qa-contract-product-21",
  }, "POST", { ip: "203.0.113.97" }));
  const data = JSON.parse(res.body);
  const stored = data.lead_id ? await mem.get(data.lead_id) : null;
  if (res.statusCode !== 201 || !stored || stored.deliverable_id !== "CFG-D21" ||
      stored.public_contract_id !== base.public_contract_id || stored.contract_event !== "reajuste" ||
      stored.opportunity_deadline !== deadline || stored.contract_stage !== "quantificando") {
    fail("contract_product_qualification_persisted", { status: res.statusCode, data, stored });
  }
  if (stored.offer_id || stored.terms_id || stored.source !== "CONFENGE_WEB") {
    fail("contract_product_no_checkout", stored);
  }
  pass("contract_products_fail_closed_and_persisted", { ids: 7, lead_id: data.lead_id });

  // Regressao (#650): a captura publica "(opcional)" o identificador do
  // contrato e o prazo; o servidor tem de aceitar a ausencia dos dois e
  // persistir o que foi informado. Antes, o formulario prometia opcional e o
  // servidor respondia 422 -- lead perdido.
  const partial = await handler(event({
    ...base,
    deliverable_id: "CFG-D18",
    public_contract_id: "",
    opportunity_deadline: "",
    idempotency_key: "qa-contract-product-18-optional",
  }, "POST", { ip: "203.0.113.96" }));
  const partialData = JSON.parse(partial.body);
  const partialStored = partialData.lead_id ? await mem.get(partialData.lead_id) : null;
  if (partial.statusCode !== 201 || !partialStored || partialStored.deliverable_id !== "CFG-D18" ||
      partialStored.contract_event !== base.contract_event || partialStored.contract_stage !== base.contract_stage ||
      partialStored.public_contract_id || partialStored.opportunity_deadline) {
    fail("contract_product_optional_id_and_deadline_accepted", { status: partial.statusCode, partialData, partialStored });
  }
  pass("contract_product_optional_id_and_deadline_accepted", { lead_id: partialData.lead_id });

  // Regressao (#650): o hub aceita "ainda nao sei qual entrega" (entrega
  // vazia) e publica evento e estagio como obrigatorios. Eles tem de ser
  // validados e persistidos mesmo sem entrega; antes eram descartados.
  const hubUnknown = await handler(event({
    ...base,
    deliverable_id: "",
    public_contract_id: "CONTRATO-HUB-2026-02",
    contract_event: "reajuste",
    contract_stage: "identificado",
    idempotency_key: "qa-hub-unknown-deliverable",
  }, "POST", { ip: "203.0.113.95" }));
  const hubData = JSON.parse(hubUnknown.body);
  const hubStored = hubData.lead_id ? await mem.get(hubData.lead_id) : null;
  if (hubUnknown.statusCode !== 201 || !hubStored || hubStored.deliverable_id ||
      hubStored.contract_event !== "reajuste" || hubStored.contract_stage !== "identificado" ||
      hubStored.public_contract_id !== "CONTRATO-HUB-2026-02" || hubStored.opportunity_deadline !== deadline) {
    fail("hub_unknown_deliverable_keeps_contract_fields", { status: hubUnknown.statusCode, hubData, hubStored });
  }
  // Um evento fora do enum e uma lacuna de qualificacao: o contato e recebido
  // e marcado NEEDS_CONTEXT; o texto livre nao e persistido como evento.
  const hubInvalid = await handler(event({
    ...base, deliverable_id: "", contract_event: "evento_livre",
  }, "POST", { ip: "203.0.113.94" }));
  const hubInvalidData = JSON.parse(hubInvalid.body);
  const hubInvalidStored = hubInvalidData.lead_id ? await mem.get(hubInvalidData.lead_id) : null;
  if (hubInvalid.statusCode !== 201 || hubInvalidData.qualification_state !== "NEEDS_CONTEXT" ||
      !hubInvalidStored || hubInvalidStored.contract_event !== null) {
    fail("hub_unknown_deliverable_still_validates_event", { status: hubInvalid.statusCode, body: hubInvalid.body, hubInvalidStored });
  }
  pass("hub_unknown_deliverable_keeps_contract_fields", { lead_id: hubData.lead_id });
}

// Regressao (#650): as familias de servico "por proposta" oferecidas pelo
// formulario de /entregas/ nao sao entregas do registro. Antes respondiam 422
// deliverable_id_unknown e nada era persistido. Agora viram o tipo de
// necessidade (mesmo valor da home) e a jornada e derivada dele, nunca do
// "operacao" oculto do formulario.
{
  const expected = new Map([
    ["SERV-PROJETO", ["projeto, revisão ou compatibilização", "outro"]],
    ["SERV-ORCAMENTO", ["quantitativos ou orçamento", "outro"]],
    ["SERV-DIAGNOSTICO", ["obra ou imóvel para inspecionar ou documentar", "outro"]],
    ["SERV-PERICIA", ["perícia, assistência técnica ou avaliação", "outro"]],
    ["SERV-SST", ["segurança do trabalho", "outro"]],
  ]);
  let n = 0;
  for (const [id, [stage, journey]] of expected) {
    n += 1;
    const res = await handler(event({
      nome: "QA Familias",
      email: "qa-familias@example.com",
      estagio: "entregas-exemplos-hub",
      jornada: "operacao",
      origem: "entregas",
      route_family: "entregas",
      asset_id: "entregas-exemplos-hub",
      cta_id: "entregas-hub-handraise",
      landing_page: "https://confenge.com.br/entregas/",
      deliverable_id: id,
      consentimento: "1",
      record_kind: "qa",
      test_mode: true,
      idempotency_key: `qa-service-family-${n}`,
    }, "POST", { ip: `203.0.113.${60 + n}` }));
    const data = JSON.parse(res.body);
    const stored = data.lead_id ? await mem.get(data.lead_id) : null;
    if (res.statusCode !== 201 || !stored || stored.deliverable_id || stored.estagio !== stage || stored.jornada !== journey) {
      fail("service_family_by_proposal_persisted", { id, status: res.statusCode, data, stored });
    }
  }
  const unknown = await handler(event({
    nome: "QA Familias", email: "qa-familias@example.com", estagio: "x", consentimento: "1",
    deliverable_id: "SERV-INEXISTENTE", record_kind: "qa", test_mode: true,
  }, "POST", { ip: "203.0.113.70" }));
  if (unknown.statusCode !== 422 || JSON.parse(unknown.body).error !== "deliverable_id_unknown") {
    fail("service_family_unknown_still_fails_closed", { status: unknown.statusCode, body: unknown.body });
  }
  pass("service_family_by_proposal_persisted", { families: expected.size });
}

// 5i) Issue #556 Art. 125 utility persists the CFG-D19 categorical handoff,
// while calculator money and the local artifact remain outside the public form
// and are dropped even if a forged client adds them.
{
  const routeHtml = fs.readFileSync(path.join(root, "ferramentas/limite-acrescimos-supressoes/index.html"), "utf8");
  const capture = routeHtml.match(/<form\b[^>]*id="cfg-d19-form"[^>]*>[\s\S]*?<\/form>/i)?.[0] || "";
  const forbiddenCalculatorFields = ["valor_inicial", "acrescimos_previos", "supressoes_previas", "acrescimo_proposto", "supressao_proposta", "artifact"];
  const exposed = forbiddenCalculatorFields.filter((name) => new RegExp(`name=["']${name}["']`, "i").test(capture));
  if (!capture || exposed.length || !capture.includes('value="CFG-D19"') || !capture.includes('value="mudanca_escopo"')) {
    fail("art125_cfg_d19_form_contract", { capture: Boolean(capture), exposed });
  }
  const deadline = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const payload = {
    nome: "QA Art125",
    email: "qa-art125@example.com",
    estagio: "triagem_numerica_art125",
    jornada: "contrato",
    consentimento: "1",
    origem: "/ferramentas/limite-acrescimos-supressoes/",
    landing_page: "/ferramentas/limite-acrescimos-supressoes/",
    route_family: "aditivos",
    asset_family: "aditivos",
    asset_id: "limite-acrescimos-supressoes",
    cta_id: "art125-numeric-scope-exceeded",
    deliverable_id: "CFG-D19",
    public_contract_id: "CTR-ART125-2026",
    contract_event: "mudanca_escopo",
    opportunity_deadline: deadline,
    contract_stage: "documentando",
    idempotency_key: "qa-art125-cfg-d19-001",
    valor_inicial: "10000000",
    acrescimos_previos: "1800000",
    artifact: "Triagem numérica do Art. 125 com R$ 10.000.000,00",
    record_kind: "qa",
    test_mode: true,
  };
  const res = await handler(event(payload, "POST", { ip: "203.0.113.96", "Idempotency-Key": payload.idempotency_key }));
  const data = JSON.parse(res.body);
  const stored = data.lead_id ? await mem.get(data.lead_id) : null;
  const storedLeak = forbiddenCalculatorFields.filter((key) => stored && Object.prototype.hasOwnProperty.call(stored, key));
  if (res.statusCode !== 201 || !data.receipt_id || !stored || stored.source !== "CONFENGE_WEB" ||
      stored.deliverable_id !== "CFG-D19" || stored.contract_event !== "mudanca_escopo" ||
      stored.route_family !== "aditivos" || stored.asset_id !== "limite-acrescimos-supressoes" || storedLeak.length) {
    fail("art125_cfg_d19_persisted_without_calculator_values", { status: res.statusCode, data, stored, storedLeak });
  } else pass("art125_cfg_d19_persisted_without_calculator_values", data.receipt_id);
}

// 6) idempotency — second submit same payload returns same lead_id + HTTP 200 + idempotent
{
  const payload = {
    nome: "QA Idem",
    email: "qa-idem@example.com",
    estagio: "edital em analise",
    jornada: "edital",
    consentimento: "true",
    idempotency_key: "fixed-key-abc-001",
  };
  const r1 = await handler(event(payload, "POST", { "Idempotency-Key": "fixed-key-abc-001" }));
  const d1 = JSON.parse(r1.body);
  const r2 = await handler(event(payload, "POST", { "Idempotency-Key": "fixed-key-abc-001" }));
  const d2 = JSON.parse(r2.body);
  if (!d1.lead_id || d1.lead_id !== d2.lead_id) fail("idempotency", { d1, d2, s1: r1.statusCode, s2: r2.statusCode });
  // Contract: replay MUST be 200 with idempotent:true (never re-create / re-deliver as 201)
  if (r2.statusCode !== 200) fail("idempotency_status_must_be_200", { status: r2.statusCode, body: d2 });
  if (d2.idempotent !== true) fail("idempotency_flag_required", d2);
  if (r1.statusCode !== 201 && r1.statusCode !== 200) fail("idempotency_first_status", r1.statusCode);
  // Deterministic: same key always same id even without map hit
  const { generateLeadId, idempotencyKeyFor } = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const k = idempotencyKeyFor({}, "fixed-key-abc-001");
  const expected = generateLeadId(`idem|${k}`, { deterministic: true });
  if (d1.lead_id !== expected) fail("idempotency_deterministic", { got: d1.lead_id, expected });
  pass("idempotency", { lead_id: d1.lead_id, second_status: r2.statusCode, idempotent: d2.idempotent });
}

// 6a) Reusing a normal-form key with changed commercial material is a conflict.
{
  const payload = {
    nome: "QA Material",
    email: "qa-material@example.com",
    estagio: "contrato em análise",
    jornada: "contrato",
    mensagem: "Preciso revisar uma medição.",
    consentimento: "1",
    idempotency_key: "fixed-material-key-001",
  };
  const first = await handler(event(payload, "POST", { "Idempotency-Key": payload.idempotency_key }));
  const replay = await handler(event(payload, "POST", { "Idempotency-Key": payload.idempotency_key }));
  const changed = await handler(event({
    ...payload,
    mensagem: "Preciso revisar um aditivo.",
  }, "POST", { "Idempotency-Key": payload.idempotency_key }));
  const firstBody = JSON.parse(first.body);
  const replayBody = JSON.parse(replay.body);
  const changedBody = JSON.parse(changed.body);
  const stored = firstBody.lead_id ? await mem.get(firstBody.lead_id) : null;
  if (first.statusCode !== 201 || replay.statusCode !== 200 || replayBody.idempotent !== true) {
    fail("standard_idempotency_exact_replay", { first: first.statusCode, replay: replay.statusCode, replayBody });
  }
  if (changed.statusCode !== 409 || changedBody.error !== "idempotency_conflict") {
    fail("standard_idempotency_material_conflict", { status: changed.statusCode, changedBody });
  }
  if (!stored?.idempotency_material_hash || stored.idempotency_material_hash.length !== 64) {
    fail("standard_idempotency_material_hash_persisted", stored?.idempotency_material_hash);
  }
  pass("standard_idempotency_material_conflict", { lead_id: firstBody.lead_id });
  _reset();
}

// 6aa) A paid Radar order binds its normalized purchase parameters to the key.
{
  const payload = {
    nome: "QA Radar Material",
    email: "qa-radar-material@example.com",
    estagio: "radar-decisorio-parametros",
    jornada: "edital",
    consentimento: "1",
    cnpj: "52.407.089/0001-09",
    radar_recorte: "cidade_base",
    radar_uf: "SC",
    radar_cidade_base: "Florianópolis",
    radar_raio_km: "80",
    radar_segmentos: ["edificacoes-publicas", "saneamento-hidraulica"],
    radar_acervo_tecnico: "Acervo técnico em edificações e saneamento para contratos públicos.",
    radar_email_entrega: "qa-radar-material@example.com",
    idempotency_key: "fixed-radar-material-key-001",
  };
  const headers = { "Idempotency-Key": payload.idempotency_key };
  const first = await handler(event(payload, "POST", headers));
  const replay = await handler(event(payload, "POST", headers));
  const changed = await handler(event({ ...payload, radar_raio_km: "120" }, "POST", headers));
  const replayBody = JSON.parse(replay.body);
  const changedBody = JSON.parse(changed.body);
  if (first.statusCode !== 201 || replay.statusCode !== 200 || replayBody.idempotent !== true) {
    fail("radar_idempotency_exact_replay", { first: first.statusCode, replay: replay.statusCode, replayBody });
  }
  if (changed.statusCode !== 409 || changedBody.error !== "idempotency_conflict") {
    fail("radar_idempotency_material_conflict", { status: changed.statusCode, changedBody });
  } else pass("radar_idempotency_material_conflict");
  _reset();
}

// 6b) Attribution cannot become a side-channel for PII in receipts/logs/analytics.
{
  const marker = "private-person@example.com";
  const originalLog = console.log;
  const capturedLogs = [];
  console.log = (...args) => {
    capturedLogs.push(args.map(String).join(" "));
  };
  try {
    const res = await handler(
      event({
        nome: "QA Attribution",
        email: "qa-attribution@example.com",
        estagio: "contrato em análise",
        jornada: "contrato",
        consentimento: "1",
        idempotency_key: "attribution-pii-guard-001",
        origem: `https://confenge.com.br/ferramentas/diagnostico-defesa-margem/?email=${marker}`,
        landing_page: `/ferramentas/diagnostico-defesa-margem/?telefone=48999999999`,
        referrer: `https://search.example/result?message=${marker}`,
        utm_source: marker,
        utm_campaign: "Maria Silva",
        route_family: "48999999999",
        asset_id: "diagnostico-defesa-margem",
        cta_id: "segunda-leitura-contrato",
      }),
    );
    const data = JSON.parse(res.body);
    const stored = await mem.get(data.lead_id);
    if (res.statusCode !== 201 || !stored) fail("attribution_pii_persist", { res, stored });
    if (stored.origem !== "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/") {
      fail("attribution_origin_query", stored.origem);
    }
    if (stored.landing_page !== "/ferramentas/diagnostico-defesa-margem/") {
      fail("attribution_landing_query", stored.landing_page);
    }
    if (stored.referrer !== "https://search.example/result") fail("attribution_referrer_query", stored.referrer);
    if (stored.utm_source || stored.utm_campaign || stored.route_family) {
      fail("attribution_pii_dimensions", {
        utm_source: stored.utm_source,
        utm_campaign: stored.utm_campaign,
        route_family: stored.route_family,
      });
    }
    const publicAndLogs = `${res.body}\n${capturedLogs.join("\n")}`;
    if (publicAndLogs.includes(marker) || publicAndLogs.includes("48999999999") || publicAndLogs.includes("Maria Silva")) {
      fail("attribution_pii_log_or_response", publicAndLogs);
    }
  } finally {
    console.log = originalLog;
  }
  pass("attribution_pii_guard");
}

// 6aa) Percent-encoding cannot hide PII inside an absolute attribution path.
{
  const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const encodedEmail = core.sanitizeAttributionLocation(
    "https://search.example/result/private-person%40example.com",
    240,
    "referrer",
  );
  if (encodedEmail !== "") fail("attribution_encoded_pii_path", encodedEmail);
  pass("attribution_encoded_pii_path");
}

// 6ab) JOR-03 / TAREFAS-01: `tema` (subject the visitor arrived with, from the article/case
// data-tema) persists on the record as a short text; `origem` keeps its own value. A PII-like
// tema (e-mail, phone-sized digit run) is dropped, never partially stored; absent -> null.
{
  const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const base = {
    nome: "QA Tema",
    email: "qa-tema@example.com",
    estagio: "medicoes-glosas-obras-publicas",
    jornada: "contrato",
    consentimento: "1",
    origem: "medicoes-glosas-obras-publicas",
    landing_page: "https://confenge.com.br/medicoes-glosas-obras-publicas/",
    route_family: "medicoes-glosas-obras-publicas",
    cta_id: "pillar_hero",
    record_kind: "qa",
    test_mode: true,
  };
  const withTema = await handler(event({
    ...base,
    tema: "glosa de medição obra pública",
    idempotency_key: "tema-persist-001",
  }, "POST", { ip: "198.51.100.61" }));
  const withTemaData = JSON.parse(withTema.body);
  const stored = await mem.get(withTemaData.lead_id);
  if (withTema.statusCode !== 201 || !stored) fail("tema_persist_status", { status: withTema.statusCode, stored });
  if (stored.tema !== "glosa de medição obra pública") fail("tema_persisted", { tema: stored.tema });
  if (stored.origem !== "medicoes-glosas-obras-publicas") fail("tema_must_not_change_origem", { origem: stored.origem });
  if (withTema.body.includes("tema")) fail("tema_in_public_response", withTema.body);

  const longTema = "x".repeat(200);
  const clipped = await handler(event({ ...base, tema: longTema, idempotency_key: "tema-persist-002" }, "POST", { ip: "198.51.100.62" }));
  const clippedStored = await mem.get(JSON.parse(clipped.body).lead_id);
  if (!clippedStored || clippedStored.tema !== "x".repeat(120)) {
    fail("tema_clipped_to_120", { len: clippedStored?.tema?.length });
  }

  const piiCases = [
    ["fale com maria.silva@example.com sobre a medição", "email"],
    ["glosa medição 48 99999-9999", "phone"],
    ["contrato do CNPJ 52407089000109", "cnpj"],
  ];
  for (let i = 0; i < piiCases.length; i += 1) {
    const [tema, kind] = piiCases[i];
    const res = await handler(event({ ...base, tema, idempotency_key: `tema-pii-${i}` }, "POST", { ip: `198.51.100.${70 + i}` }));
    const data = JSON.parse(res.body);
    const piiStored = await mem.get(data.lead_id);
    if (res.statusCode !== 201 || !piiStored) fail("tema_pii_persist_status", { kind, status: res.statusCode });
    if (piiStored.tema !== null) fail("tema_pii_not_dropped", { kind, tema: piiStored.tema });
  }

  const noTema = await handler(event({ ...base, idempotency_key: "tema-absent-001" }, "POST", { ip: "198.51.100.65" }));
  const noTemaStored = await mem.get(JSON.parse(noTema.body).lead_id);
  if (!noTemaStored || noTemaStored.tema !== null) fail("tema_absent_is_null", { tema: noTemaStored?.tema });
  if (!Object.prototype.hasOwnProperty.call(noTemaStored, "tema")) fail("tema_key_missing_from_record", Object.keys(noTemaStored));

  // The same sanitizer backs pickAttribution (tema is an allowlisted attribution key).
  const picked = core.pickAttribution({ tema: "SINAPI desonerado ou não desonerado", utm_source: "gsc" });
  if (picked.tema !== "SINAPI desonerado ou não desonerado") fail("tema_pickAttribution_text", picked);
  if (core.pickAttribution({ tema: "joao@example.com" }).tema) fail("tema_pickAttribution_pii", picked);
  // Handoff: tema rides in the versioned free-text next-action context of
  // confenge.inbound.v1 (same vehicle as the deliverable), never as a new key.
  const handoff = require(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"));
  const mapped = handoff.mapLeadToInboundV1(stored);
  if (!mapped.message || !mapped.message.includes("tema=glosa de medição obra pública")) {
    fail("tema_handoff_context", mapped.message);
  }
  if ("tema" in mapped) fail("tema_handoff_new_key", Object.keys(mapped));
  const mappedNoTema = handoff.mapLeadToInboundV1(noTemaStored);
  if (mappedNoTema.message && mappedNoTema.message.includes("tema=")) fail("tema_handoff_absent_leaks", mappedNoTema.message);
  pass("tema_persisted_sanitized_and_null_when_absent", { lead_id: withTemaData.lead_id });
}

// 6b) onlyIfNew path: lookup miss then create-only conflict still returns 200 (no re-delivery)
{
  const payload = {
    nome: "QA Idem OnlyIfNew",
    email: "qa-idem-oin@example.com",
    estagio: "edital em analise",
    jornada: "edital",
    consentimento: "true",
    idempotency_key: "fixed-key-onlyifnew-002",
  };
  const r1 = await handler(event(payload, "POST", { "Idempotency-Key": "fixed-key-onlyifnew-002" }));
  const d1 = JSON.parse(r1.body);
  if (r1.statusCode !== 201 || !d1.lead_id) fail("onlyifnew_first", { s: r1.statusCode, d1 });

  // Simulate eventual-consistency miss: wrap store so first get paths return null once
  const store = mem;
  const origGet = store.get.bind(store);
  const origIdem = store.getByIdempotency.bind(store);
  let missLeft = 8; // enough to exhaust lead.cjs retry loop (4 attempts × 2 lookups)
  store.get = async (id) => {
    if (missLeft > 0) {
      missLeft -= 1;
      return null;
    }
    return origGet(id);
  };
  store.getByIdempotency = async (key) => {
    if (missLeft > 0) {
      missLeft -= 1;
      return null;
    }
    return origIdem(key);
  };
  try {
    const r2 = await handler(event(payload, "POST", { "Idempotency-Key": "fixed-key-onlyifnew-002" }));
    const d2 = JSON.parse(r2.body);
    if (r2.statusCode !== 200) fail("onlyifnew_second_status", { status: r2.statusCode, body: d2 });
    if (d2.idempotent !== true) fail("onlyifnew_idempotent_flag", d2);
    if (d2.lead_id !== d1.lead_id) fail("onlyifnew_same_id", { d1, d2 });
    pass("idempotency_onlyifnew_conflict", { lead_id: d2.lead_id });
  } finally {
    store.get = origGet;
    store.getByIdempotency = origIdem;
  }
}

// 6c) NetlifyBlobsStore uses set()+onlyIfNew (not setJSON) so create-only is real
{
  const { NetlifyBlobsStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
  const map = new Map();
  let setOnlyIfNewCalls = 0;
  let setJsonOnlyIfNewCalls = 0;
  const fakeBlobs = {
    async setJSON(key, value, opts = {}) {
      // Simulate broken setJSON that ignores onlyIfNew (library bug we work around)
      if (opts && opts.onlyIfNew) setJsonOnlyIfNewCalls += 1;
      map.set(key, value);
      return { modified: true, etag: "e1" };
    },
    async set(key, data, opts = {}) {
      if (opts && opts.onlyIfNew) {
        setOnlyIfNewCalls += 1;
        if (map.has(key)) return { modified: false };
      }
      const val = typeof data === "string" ? JSON.parse(data) : data;
      map.set(key, val);
      return { modified: true, etag: "e2" };
    },
    async get(key, opts = {}) {
      const v = map.get(key);
      if (v == null) return null;
      if (opts && opts.type === "json") return v;
      if (opts && opts.type === "text") return JSON.stringify(v);
      return typeof v === "string" ? v : JSON.stringify(v);
    },
  };
  const bs = new NetlifyBlobsStore(fakeBlobs);
  const rec = {
    lead_id: "deadbeefdeadbeefdeadbeef",
    idempotency_key: "k-blobs-oin",
    nome: "X",
    received_at: new Date().toISOString(),
  };
  await bs.put(rec, { onlyIfNew: true });
  let threw = null;
  try {
    await bs.put({ ...rec, nome: "Y" }, { onlyIfNew: true });
  } catch (e) {
    threw = e;
  }
  if (!threw || threw.code !== "ALREADY_EXISTS") fail("blobs_onlyifnew_throw", threw);
  if (setOnlyIfNewCalls < 2) fail("blobs_must_use_set_onlyifnew", { setOnlyIfNewCalls, setJsonOnlyIfNewCalls });
  if (setJsonOnlyIfNewCalls !== 0) fail("blobs_must_not_use_setjson_onlyifnew", setJsonOnlyIfNewCalls);
  pass("blobs_store_onlyifnew_uses_set", { setOnlyIfNewCalls });
}

// 7) email delivery failure does not destroy persisted lead
{
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_NOTIFY_EMAIL = "ops@confenge.com.br";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (isRequestToHost(url, "api.resend.com")) {
      return { ok: false, status: 500, text: async () => "fail", json: async () => ({}) };
    }
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) };
  };
  try {
    const res = await handler(
      event({
        nome: "Carlos Diretor",
        email: "carlos.diretor@construtora.com.br",
        estagio: "diagnostico operacao",
        jornada: "operacao",
        consentimento: "on",
      }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("email_fail_persist", data);
    const stored = await mem.get(data.lead_id);
    if (!stored || stored.status === undefined) fail("email_fail_store", stored);
    pass("email_fail_keeps_lead", { lead_id: data.lead_id, delivery_email: stored.delivery?.email?.status });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.LEAD_NOTIFY_EMAIL;
  }
}

// 7a) G03-02: the Resend message id and HTTP status are persisted in the store
// (delivery.email.provider_id / .http) so an operator can correlate lead_id ->
// GET /emails/{id} from the host, and never appear in the public body.
{
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_NOTIFY_EMAIL = "ops@confenge.com.br";
  const originalFetch = globalThis.fetch;
  const providerId = "resend-msg-id-1234567890abcdef";
  globalThis.fetch = async (url) => {
    if (isRequestToHost(url, "api.resend.com")) {
      return { ok: true, status: 200, text: async () => "{}", json: async () => ({ id: providerId }) };
    }
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) };
  };
  try {
    const res = await handler(
      event({
        nome: "Helena Diretora",
        email: "helena.diretora@construtora.com.br",
        estagio: "diagnostico operacao",
        jornada: "operacao",
        consentimento: "on",
      }, "POST", { ip: "203.0.113.71" }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("email_provider_id_persist", data);
    if (data.email_status !== "ok") fail("email_provider_id_status", data);
    const bodyStr = JSON.stringify(data);
    if (bodyStr.includes(providerId) || bodyStr.includes("provider_id") || /"http"/.test(bodyStr)) {
      fail("email_provider_id_in_public_body", data);
    }
    const stored = await mem.get(data.lead_id);
    if (!stored || !stored.delivery || !stored.delivery.email) fail("email_provider_id_store_missing", stored);
    if (stored.delivery.email.provider_id !== providerId) fail("email_provider_id_store_value", stored.delivery.email);
    if (stored.delivery.email.http !== 200) fail("email_http_store_value", stored.delivery.email);
    if (stored.status !== "persisted_notified") fail("email_provider_id_store_status", stored.status);
    pass("email_provider_id_store_only", { lead_id: data.lead_id, http: stored.delivery.email.http });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.LEAD_NOTIFY_EMAIL;
  }
}

// 7c) G03-04: a hanging Resend (and a hanging ops webhook) never consumes the
// visitor's 15 s budget. The delivery channels share LEAD_DELIVERY_TIMEOUT_MS
// across all retries, the abort is not retried, and the record stays durable
// with email/notify status "error" (reason timeout) while the visitor gets 201.
{
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_NOTIFY_EMAIL = "ops@confenge.com.br";
  process.env.OPS_WEBHOOK_URL = "https://example.com/hooks/ops";
  process.env.OPS_WEBHOOK_ALLOWED_HOSTS = "example.com";
  process.env.LEAD_DELIVERY_TIMEOUT_MS = "150";
  const originalFetch = globalThis.fetch;
  let hangingCalls = 0;
  let abortedCalls = 0;
  let unsignaledCalls = 0;
  globalThis.fetch = (url, opts) => new Promise((_resolve, reject) => {
    hangingCalls += 1;
    if (!opts || !opts.signal) {
      unsignaledCalls += 1;
      return; // hangs forever: exactly the failure this case guards against
    }
    opts.signal.addEventListener("abort", () => {
      abortedCalls += 1;
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
  });
  try {
    const started = performance.now();
    const res = await handler(
      event({
        nome: "Paulo Diretor",
        email: "paulo.diretor@construtora.com.br",
        estagio: "diagnostico operacao",
        jornada: "operacao",
        consentimento: "on",
      }, "POST", { ip: "203.0.113.72" }),
    );
    const elapsed = Math.round(performance.now() - started);
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("delivery_hang_persist", data);
    if (data.email_status !== "error" || data.notify_status !== "error") fail("delivery_hang_status", data);
    // Two channels hang concurrently: the step costs one budget, not two, and
    // far less than the 15 s browser abort. 1500 ms leaves room for the store.
    if (elapsed > 1500) fail("delivery_hang_budget", { elapsed, budget_ms: 150 });
    if (unsignaledCalls !== 0) fail("delivery_fetch_without_signal", { unsignaledCalls });
    // One aborted attempt per channel: a timed-out send is never retried.
    if (hangingCalls !== 2 || abortedCalls !== 2) fail("delivery_hang_retry", { hangingCalls, abortedCalls });
    const stored = await mem.get(data.lead_id);
    if (!stored || stored.delivery?.email?.status !== "error" || stored.delivery?.email?.reason !== "timeout") {
      fail("delivery_hang_store", stored && stored.delivery);
    }
    if (stored.status !== "persisted") fail("delivery_hang_store_status", stored.status);
    pass("delivery_hang_within_budget", { elapsed_ms: elapsed, lead_id: data.lead_id });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.LEAD_NOTIFY_EMAIL;
    delete process.env.OPS_WEBHOOK_URL;
    delete process.env.OPS_WEBHOOK_ALLOWED_HOSTS;
    delete process.env.LEAD_DELIVERY_TIMEOUT_MS;
  }
}

// 7d) The channel budget covers the BODY, not only the headers: a Resend that
// answers 200 and then stalls the body (half-open connection) must end within
// LEAD_DELIVERY_TIMEOUT_MS with reason=timeout, record durable, 201 returned.
// A second variant: the body stream ignores the abort signal entirely — the
// bound must still hold (the read is raced against the deadline).
for (const bodyHonoursAbort of [true, false]) {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_NOTIFY_EMAIL = "ops@confenge.com.br";
  process.env.LEAD_DELIVERY_TIMEOUT_MS = "150";
  const originalFetch = globalThis.fetch;
  let bodyReads = 0;
  globalThis.fetch = async (_url, opts) => ({
    ok: true,
    status: 200,
    json: () => new Promise((_resolve, reject) => {
      bodyReads += 1;
      if (bodyHonoursAbort && opts && opts.signal) {
        opts.signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      }
      // otherwise: never settles — the body is stalled for good
    }),
    text: async () => "",
  });
  try {
    const started = performance.now();
    const res = await handler(
      event({
        nome: bodyHonoursAbort ? "Sandra Diretora" : "Sonia Diretora",
        email: bodyHonoursAbort ? "sandra.diretora@construtora.com.br" : "sonia.diretora@construtora.com.br",
        estagio: "diagnostico operacao",
        jornada: "operacao",
        consentimento: "on",
      }, "POST", { ip: bodyHonoursAbort ? "203.0.113.73" : "203.0.113.74" }),
    );
    const elapsed = Math.round(performance.now() - started);
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("delivery_body_hang_persist", { bodyHonoursAbort, data });
    if (data.email_status !== "error") fail("delivery_body_hang_status", { bodyHonoursAbort, data });
    if (elapsed > 1500) fail("delivery_body_hang_budget", { bodyHonoursAbort, elapsed, budget_ms: 150 });
    if (bodyReads !== 1) fail("delivery_body_hang_retry", { bodyHonoursAbort, bodyReads });
    const stored = await mem.get(data.lead_id);
    if (!stored || stored.delivery?.email?.status !== "error" || stored.delivery?.email?.reason !== "timeout") {
      fail("delivery_body_hang_store", { bodyHonoursAbort, delivery: stored && stored.delivery });
    }
    if (stored.delivery.email.provider_id) fail("delivery_body_hang_provider_id", stored.delivery.email);
    pass("delivery_body_hang_within_budget", { body_honours_abort: bodyHonoursAbort, elapsed_ms: elapsed });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.LEAD_NOTIFY_EMAIL;
    delete process.env.LEAD_DELIVERY_TIMEOUT_MS;
  }
}

// 7e) Deadline after a real HTTP failure: attempt 1 gets 500 late in the
// budget, attempt 2 has no time left. The operator sees the last real status
// (reason=timeout_after_http, http=500) instead of a bare timeout.
{
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_NOTIFY_EMAIL = "ops@confenge.com.br";
  process.env.LEAD_DELIVERY_TIMEOUT_MS = "150";
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 120));
    return { ok: false, status: 500, json: async () => ({}), text: async () => "" };
  };
  try {
    const res = await handler(
      event({
        nome: "Sergio Diretor",
        email: "sergio.diretor@construtora.com.br",
        estagio: "diagnostico operacao",
        jornada: "operacao",
        consentimento: "on",
      }, "POST", { ip: "203.0.113.75" }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || data.email_status !== "error") fail("delivery_timeout_after_http_status", data);
    const stored = await mem.get(data.lead_id);
    const email = stored && stored.delivery && stored.delivery.email;
    if (!email || email.reason !== "timeout_after_http" || email.http !== 500) {
      fail("delivery_timeout_after_http_store", { calls, email });
    }
    pass("delivery_timeout_after_http_keeps_last_status", { calls, http: email.http });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.LEAD_NOTIFY_EMAIL;
    delete process.env.LEAD_DELIVERY_TIMEOUT_MS;
  }
}

// 7f) A07/G1: a slow Warmbly handoff and a slow Resend at the same time cost
// max(budget), not the sum. Scaled budgets: CONFENGE_INBOUND_TIMEOUT_MS=400,
// LEAD_DELIVERY_TIMEOUT_MS=250 — the serial code added ≥ 650 ms after
// persist, the concurrent code ≈ 400 ms. With production budgets (8 s / 5 s)
// plus a 5 s siteverify, the fresh-lead lookup (≈ 0.6 s) and the store, the
// worst case is ≈ 14 s < 15 s browser abort. The pre-persist cost is measured
// on a baseline POST (no provider configured) and subtracted, so the
// assertion is about the post-persist step only.
// Both store patches must survive (handoff RETRYABLE and delivery error):
// the delivery update runs only after both tasks settled.
{
  const baselineStarted = performance.now();
  const baselineRes = await handler(
    event({
      nome: "Marina Baseline",
      email: "marina.baseline@construtora.com.br",
      estagio: "diagnostico operacao",
      jornada: "operacao",
      consentimento: "on",
    }, "POST", { ip: "203.0.113.78" }),
  );
  const baseline = Math.round(performance.now() - baselineStarted);
  if (baselineRes.statusCode !== 201) fail("concurrent_baseline_persist", baselineRes);
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_NOTIFY_EMAIL = "ops@confenge.com.br";
  process.env.LEAD_DELIVERY_TIMEOUT_MS = "250";
  process.env.CONFENGE_INBOUND_WEBHOOK_URL = "http://127.0.0.1:9/api/v1/webhooks/confenge/inbound";
  process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = "inbound-secret-fixture-with-at-least-32-chars";
  process.env.CONFENGE_INBOUND_TIMEOUT_MS = "400";
  const inboundBudget = 400;
  const deliveryBudget = 250;
  const originalFetch = globalThis.fetch;
  const hangs = { warmbly: 0, resend: 0 };
  // Hangs until the caller aborts — for the Warmbly POST (inbound-handoff
  // uses globalThis.fetch unless overridden) and for Resend alike.
  globalThis.fetch = (url, opts) => new Promise((_resolve, reject) => {
    if (isRequestToHost(url, "127.0.0.1")) hangs.warmbly += 1;
    else if (isRequestToHost(url, "api.resend.com")) hangs.resend += 1;
    if (!opts || !opts.signal) return;
    opts.signal.addEventListener("abort", () => {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
  });
  try {
    const inbound = require(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"));
    if (inbound.resolveInboundConfig(process.env).ok !== true) {
      fail("concurrent_fixture_destination_not_live", inbound.resolveInboundConfig(process.env));
    }
    const started = performance.now();
    const res = await handler(
      event({
        nome: "Marina Diretora",
        email: "marina.diretora@construtora.com.br",
        estagio: "diagnostico operacao",
        jornada: "operacao",
        consentimento: "on",
      }, "POST", { ip: "203.0.113.76" }),
    );
    const elapsed = Math.round(performance.now() - started);
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("concurrent_handoff_delivery_persist", data);
    if (data.email_status !== "error") fail("concurrent_handoff_delivery_email_status", data);
    if (hangs.warmbly !== 1 || hangs.resend !== 1) fail("concurrent_handoff_delivery_calls", hangs);
    // Concurrent: the post-persist step is strictly below the serial sum and
    // not shorter than the longest single budget (nothing was skipped).
    const step = elapsed - baseline;
    if (step >= inboundBudget + deliveryBudget) {
      fail("concurrent_handoff_delivery_serial", { elapsed, baseline, step, serial_sum_ms: inboundBudget + deliveryBudget });
    }
    if (step < inboundBudget - 100) fail("concurrent_handoff_delivery_too_fast", { elapsed, baseline, step, inboundBudget });
    const stored = await mem.get(data.lead_id);
    if (!stored || !stored.handoff || stored.handoff.status !== "RETRYABLE" || stored.handoff.attempts !== 1) {
      fail("concurrent_handoff_state_lost", stored && stored.handoff);
    }
    if (stored.delivery?.email?.status !== "error" || stored.delivery?.email?.reason !== "timeout") {
      fail("concurrent_delivery_state_lost", stored && stored.delivery);
    }
    if (stored.delivery.email.idempotency_key !== `lead-email/${data.lead_id}`) {
      fail("concurrent_delivery_idempotency_key_persisted", stored.delivery.email);
    }
    pass("handoff_and_delivery_concurrent_within_max_budget", {
      elapsed_ms: elapsed,
      baseline_ms: baseline,
      post_persist_step_ms: step,
      serial_sum_ms: inboundBudget + deliveryBudget,
      lead_id: data.lead_id,
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.LEAD_NOTIFY_EMAIL;
    delete process.env.LEAD_DELIVERY_TIMEOUT_MS;
    delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
    delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
    delete process.env.CONFENGE_INBOUND_TIMEOUT_MS;
  }
}

// 7g) A07/G2: every Resend POST carries `Idempotency-Key: lead-email/<lead_id>`
// with a payload that is a pure function of the record (two sends of the same
// record are byte-identical), and the key used is persisted with the record.
{
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_NOTIFY_EMAIL = "ops@confenge.com.br";
  const originalFetch = globalThis.fetch;
  const resendCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    if (isRequestToHost(url, "api.resend.com")) {
      resendCalls.push({ headers: init.headers || {}, body: String(init.body || "") });
      return { ok: true, status: 200, text: async () => "{}", json: async () => ({ id: "resend-idem-0001" }) };
    }
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) };
  };
  try {
    const res = await handler(
      event({
        nome: "Otavio Diretor",
        email: "otavio.diretor@construtora.com.br",
        estagio: "diagnostico operacao",
        jornada: "operacao",
        consentimento: "on",
      }, "POST", { ip: "203.0.113.77" }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || data.email_status !== "ok") fail("email_idempotency_key_persist", data);
    const expectedKey = `lead-email/${data.lead_id}`;
    if (resendCalls.length !== 1) fail("email_idempotency_key_calls", resendCalls.length);
    if (resendCalls[0].headers["Idempotency-Key"] !== expectedKey) {
      fail("email_idempotency_key_header", { got: resendCalls[0].headers["Idempotency-Key"], expectedKey });
    }
    if (expectedKey.length > 256) fail("email_idempotency_key_length", expectedKey.length);
    const stored = await mem.get(data.lead_id);
    if (stored.delivery?.email?.idempotency_key !== expectedKey) {
      fail("email_idempotency_key_store", stored && stored.delivery);
    }
    if (JSON.stringify(data).includes("idempotency_key")) fail("email_idempotency_key_public_body", data);
    // Deterministic payload: a second send of the stored record (what the
    // drain retry does) produces the same header and the same bytes.
    const { deliverResendEmail } = require(path.join(root, "netlify/functions/lib/lead-delivery.cjs"));
    const again = await deliverResendEmail(stored);
    if (again.status !== "ok" || again.idempotency_key !== expectedKey) fail("email_idempotency_key_direct", again);
    if (resendCalls.length !== 2 || resendCalls[1].body !== resendCalls[0].body) {
      fail("email_idempotency_payload_not_deterministic", { first: resendCalls[0].body.length, second: resendCalls[1] && resendCalls[1].body.length });
    }
    if (resendCalls[1].headers["Idempotency-Key"] !== expectedKey) fail("email_idempotency_key_header_second", resendCalls[1].headers);
    pass("email_idempotency_key_deterministic", { lead_id: data.lead_id, key: expectedKey });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.LEAD_NOTIFY_EMAIL;
  }
}

// 7h) A07/G2: Resend 409 classification. invalid_idempotent_request (same
// key, different payload) is final: one call, reason=payload_mismatch, never
// retried. concurrent_idempotent_requests (same key still in flight) is
// retried inside the channel budget; when the other request finishes the
// retry gets the ORIGINAL id (no second e-mail).
{
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_NOTIFY_EMAIL = "ops@confenge.com.br";
  const originalFetch = globalThis.fetch;
  const { deliverResendEmail } = require(path.join(root, "netlify/functions/lib/lead-delivery.cjs"));
  const record = {
    lead_id: "lead-409-classification-0001",
    record_kind: "real",
    received_at: "2026-09-18T12:00:00.000Z",
    jornada: "operacao",
    estagio: "diagnostico operacao",
    nome: "Ana Diretora",
    email: "ana.diretora@construtora.com.br",
  };
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return {
        ok: false,
        status: 409,
        json: async () => ({ statusCode: 409, name: "invalid_idempotent_request", message: "same key, different payload" }),
        text: async () => "",
      };
    };
    const mismatch = await deliverResendEmail(record);
    if (mismatch.status !== "error" || mismatch.reason !== "payload_mismatch" || mismatch.http !== 409) {
      fail("resend_409_payload_mismatch", mismatch);
    }
    if (calls !== 1) fail("resend_409_payload_mismatch_retried", calls);

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ statusCode: 409, name: "concurrent_idempotent_requests", message: "in flight" }),
          text: async () => "",
        };
      }
      return { ok: true, status: 200, json: async () => ({ id: "resend-original-id-0001" }), text: async () => "" };
    };
    const concurrent = await deliverResendEmail(record);
    if (concurrent.status !== "ok" || concurrent.provider_id !== "resend-original-id-0001" || calls !== 2) {
      fail("resend_409_concurrent_retry_gets_original", { concurrent, calls });
    }

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return {
        ok: false,
        status: 409,
        json: async () => ({ statusCode: 409, name: "concurrent_idempotent_requests", message: "in flight" }),
        text: async () => "",
      };
    };
    const stillConcurrent = await deliverResendEmail(record);
    if (stillConcurrent.status !== "error" || stillConcurrent.reason !== "concurrent_idempotent" || stillConcurrent.http !== 409) {
      fail("resend_409_concurrent_exhausted", stillConcurrent);
    }
    if (calls !== 3) fail("resend_409_concurrent_attempts", calls);
    pass("resend_409_idempotency_classification", { mismatch: mismatch.reason, concurrent: stillConcurrent.reason });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.LEAD_NOTIFY_EMAIL;
  }
}

// 7b) synthetic / non-real kinds must not call Resend even when the key is set
{
  process.env.RESEND_API_KEY = "re_test_key_must_not_send";
  process.env.LEAD_NOTIFY_EMAIL = "tiago.sasaki@confenge.com.br";
  const originalFetch = globalThis.fetch;
  const resendCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (isRequestToHost(href, "api.resend.com")) {
      resendCalls.push({ url: href, body: init.body });
      return { ok: true, status: 200, text: async () => "{}", json: async () => ({ id: "should-not-send" }) };
    }
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) };
  };
  try {
    const { deliverResendEmail } = require(path.join(root, "netlify/functions/lib/lead-delivery.cjs"));
    const direct = await deliverResendEmail({
      lead_id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      record_kind: "synthetic",
      jornada: "operacao",
      estagio: "synthetic probe — discard",
      nome: "SYNTHETIC-PROBE",
      email: "probe@example.com",
      test_mode: true,
    });
    if (direct.status !== "skipped" || direct.reason !== "non_real") {
      fail("deliverResendEmail_synthetic_skip", direct);
    }
    if (resendCalls.length) fail("deliverResendEmail_synthetic_called_resend", resendCalls);

    const res = await handler(
      event({
        nome: "SYNTHETIC-PROBE",
        email: "probe@example.com",
        estagio: "synthetic probe — discard",
        jornada: "operacao",
        consentimento: "true",
        origem: "/synthetic-probe",
        utm_source: "synthetic",
        utm_medium: "probe",
        utm_campaign: "slo",
        landing_page: "/",
        mensagem: "[QA] synthetic probe — do not contact",
        test_mode: true,
        record_kind: "synthetic",
      }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.ok || !data.lead_id) fail("synthetic_persist", data);
    if (data.email_status !== "skipped") fail("synthetic_email_status", data);
    if (resendCalls.length) fail("synthetic_handler_called_resend", resendCalls);
    const stored = await mem.get(data.lead_id);
    if (!stored || stored.record_kind !== "synthetic") fail("synthetic_store_kind", stored);
    if (stored.delivery?.email?.status !== "skipped") fail("synthetic_store_email", stored.delivery);
    pass("synthetic_skips_resend", { lead_id: data.lead_id, email_status: data.email_status });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.LEAD_NOTIFY_EMAIL;
  }
}

// 8) rate limit
{
  _reset();
  const ip = "198.51.100.99";
  let limited = false;
  for (let i = 0; i < 20; i++) {
    const res = await handler(
      event(
        {
          nome: `Rate ${i}`,
          telefone: `4899900${String(i).padStart(4, "0")}`,
          estagio: "teste",
          jornada: "outro",
          consentimento: "on",
        },
        "POST",
        { ip, "x-forwarded-for": ip },
      ),
    );
    if (res.statusCode === 429) {
      limited = true;
      break;
    }
  }
  if (!limited) fail("rate_limit", "never 429");
  pass("rate_limit_429");
}

// 9) origin denied
{
  _reset();
  const res = await handler(
    event(
      {
        nome: "Evil",
        telefone: "48988887777",
        estagio: "x",
        consentimento: "on",
      },
      "POST",
      { origin: "https://evil.example" },
    ),
  );
  if (res.statusCode !== 403) fail("origin", res);
  pass("origin_denied");
}

// 10) no hardcoded ntfy topic in source
{
  const src = fs.readFileSync(leadPath, "utf8");
  const core = fs.readFileSync(path.join(root, "netlify/functions/lib/lead-delivery.cjs"), "utf8");
  if (/confenge-prod-leads-b2g-9f3c2a1e7d4b6e80/.test(src + core)) {
    fail("hardcoded_topic", "old ntfy topic still present");
  }
  if (/formsubmit\.co/.test(src + core)) {
    fail("formsubmit_primary", "formsubmit still in delivery path");
  }
  pass("no_hardcoded_secrets");
}

// 11) core pure unit: phone/email normalize
{
  const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  if (core.normalizePhone("(48) 98834-4559") !== "48988344559") fail("phone_norm");
  if (core.normalizeEmail("  A@B.COM ") !== "a@b.com") fail("email_norm");
  if (core.normalizeJourney("", "glosa de medicao") !== "contrato") fail("journey_norm");
  pass("core_normalize");
}

// 12) collect scrub
{
  const collectPath = path.join(root, "netlify/functions/collect.cjs");
  const collect = require(collectPath);
  const scrubbed = collect._scrubProps({ path: "/x", email: "a@b.com", journey: "contrato", nome: "X" });
  if (scrubbed.email || scrubbed.nome) fail("collect_pii", scrubbed);
  if (scrubbed.journey !== "contrato") fail("collect_keep", scrubbed);
  const analyticsEvent = JSON.stringify({
    event: "cta_click",
    props: { event_id: "origin-gate-probe", cta_id: "origin-gate" },
    path: "/",
  });
  const recentBeforeDenied = collect._recent().length;
  for (const headers of [
    { origin: "https://evil.example" },
    { referer: "https://evil.example/page" },
  ]) {
    const denied = await collect.handler({ httpMethod: "POST", headers, body: analyticsEvent });
    const deniedBody = JSON.parse(denied.body);
    if (denied.statusCode !== 403 || deniedBody.error !== "origin_denied") {
      fail("collect_foreign_origin_denied", { headers, status: denied.statusCode, body: deniedBody });
    }
    if (denied.headers["Access-Control-Allow-Origin"] === "https://evil.example") {
      fail("collect_foreign_origin_echoed", denied.headers);
    }
  }
  if (collect._recent().length !== recentBeforeDenied) {
    fail("collect_foreign_origin_zero_persist", collect._recent());
  }
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  for (const headers of [
    { origin: "https://confenge.netlify.app" },
    { origin: "http://localhost:8765" },
    { referer: "https://confenge.netlify.app/page" },
    {},
  ]) {
    const denied = await collect.handler({ httpMethod: "POST", headers, body: analyticsEvent });
    const deniedBody = JSON.parse(denied.body);
    if (denied.statusCode !== 403 || deniedBody.error !== "origin_denied") {
      fail("collect_noncanonical_production_origin_denied", {
        headers,
        status: denied.statusCode,
        body: deniedBody,
      });
    }
  }
  if (collect._recent().length !== recentBeforeDenied) {
    fail("collect_noncanonical_production_zero_persist", collect._recent());
  }
  process.env.NODE_ENV = previousNodeEnv;
  const allowed = await collect.handler({
    httpMethod: "POST",
    headers: { origin: "https://confenge.com.br" },
    body: analyticsEvent,
  });
  if (allowed.statusCode !== 202 || JSON.parse(allowed.body).accepted !== 1) {
    fail("collect_canonical_origin_allowed", allowed);
  }
  pass("collect_origin_gate");
  pass("collect_scrub");
}

// 13) event_id remains idempotent after a collector cold start.
{
  const analyticsDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-analytics-replay-"));
  const previousDir = process.env.LEAD_STORE_DIR;
  const previousStore = process.env.LEAD_STORE;
  process.env.LEAD_STORE_DIR = analyticsDir;
  delete process.env.LEAD_STORE;
  const collectPath = path.join(root, "netlify/functions/collect.cjs");
  const replayEvent = {
    httpMethod: "POST",
    headers: { origin: "https://confenge.com.br", "x-forwarded-for": "203.0.113.77" },
    body: JSON.stringify({
      event: "cta_click",
      props: { event_id: "durable-cold-start-replay", cta_id: "durable-replay" },
      path: "/",
    }),
  };
  try {
    delete require.cache[require.resolve(collectPath)];
    let collector = require(collectPath);
    const first = await collector.handler(replayEvent);
    delete require.cache[require.resolve(collectPath)];
    collector = require(collectPath);
    const second = await collector.handler(replayEvent);
    const firstBody = JSON.parse(first.body);
    const secondBody = JSON.parse(second.body);
    const { HostFileBackend } = require(path.join(root, "netlify/functions/lib/host-file-store.cjs"));
    const rows = new HostFileBackend(analyticsDir).namespace("analytics-events").list();
    if (firstBody.accepted !== 1 || secondBody.accepted !== 0 || secondBody.rejected !== 1) {
      fail("collect_durable_replay_response", { firstBody, secondBody });
    }
    if (rows.length !== 1) fail("collect_durable_replay_records", rows);
    pass("collect_durable_replay", { records: rows.length });
  } finally {
    if (previousDir == null) delete process.env.LEAD_STORE_DIR;
    else process.env.LEAD_STORE_DIR = previousDir;
    if (previousStore == null) delete process.env.LEAD_STORE;
    else process.env.LEAD_STORE = previousStore;
    fs.rmSync(analyticsDir, { recursive: true, force: true });
  }
}

// 14) Blob create-only dedupe survives cold starts; failed writes stay retryable.
{
  const previousDir = process.env.LEAD_STORE_DIR;
  const previousStore = process.env.LEAD_STORE;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.LEAD_STORE_DIR;
  delete process.env.LEAD_STORE;
  const collectPath = path.join(root, "netlify/functions/collect.cjs");
  const blobRecords = new Map();
  let failWrites = false;
  let createOnlyCalls = 0;
  const fakeBlobStore = {
    async set(key, value, options) {
      if (failWrites) throw new Error("injected_blob_write_failure");
      if (options?.onlyIfNew !== true) fail("collect_blob_not_create_only", options);
      createOnlyCalls += 1;
      if (blobRecords.has(key)) return { modified: false };
      blobRecords.set(key, value);
      return { modified: true };
    },
    async setJSON(key, value) {
      blobRecords.set(key, JSON.stringify(value));
      return { modified: true };
    },
  };
  const blobEvent = (eventId) => ({
    httpMethod: "POST",
    headers: { origin: "https://confenge.com.br", "x-forwarded-for": "203.0.113.78" },
    body: JSON.stringify({
      event: "cta_click",
      props: { event_id: eventId, cta_id: "durable-blob" },
      path: "/",
    }),
  });
  try {
    delete require.cache[require.resolve(collectPath)];
    let collector = require(collectPath);
    collector._setBlobStoreForTests(fakeBlobStore);
    const first = await collector.handler(blobEvent("durable-blob-replay"));
    delete require.cache[require.resolve(collectPath)];
    collector = require(collectPath);
    collector._setBlobStoreForTests(fakeBlobStore);
    const second = await collector.handler(blobEvent("durable-blob-replay"));
    const firstBody = JSON.parse(first.body);
    const secondBody = JSON.parse(second.body);
    const keys = [...blobRecords.keys()];
    if (firstBody.accepted !== 1 || secondBody.accepted !== 0 || secondBody.rejected !== 1) {
      fail("collect_blob_replay_response", { firstBody, secondBody });
    }
    if (keys.length !== 1 || !keys[0].startsWith("events/by-id/id-")) {
      fail("collect_blob_global_event_key", keys);
    }
    if (createOnlyCalls !== 2) fail("collect_blob_create_only_calls", createOnlyCalls);

    failWrites = true;
    const failed = await collector.handler(blobEvent("durable-blob-retry"));
    const failedBody = JSON.parse(failed.body);
    if (
      failed.statusCode !== 503 ||
      failedBody.accepted !== 0 ||
      failedBody.error !== "durable_store_unavailable" ||
      failedBody.rejected_events?.[0]?.reason !== "durable_store_unavailable"
    ) {
      fail("collect_blob_write_fail_closed", failedBody);
    }
    failWrites = false;
    const retried = await collector.handler(blobEvent("durable-blob-retry"));
    const retriedBody = JSON.parse(retried.body);
    if (retried.statusCode !== 202 || retriedBody.accepted !== 1) {
      fail("collect_blob_write_retryable", retriedBody);
    }
    collector._setBlobStoreForTests(null);
    process.env.NODE_ENV = "production";
    process.env.LEAD_STORE = "memory";
    const unavailable = await collector.handler(blobEvent("durable-store-unavailable"));
    const unavailableBody = JSON.parse(unavailable.body);
    if (unavailable.statusCode !== 503 || unavailableBody.accepted !== 0) {
      fail("collect_production_store_unavailable_fail_closed", unavailableBody);
    }
    pass("collect_blob_durable_replay", { keys: blobRecords.size, createOnlyCalls });
  } finally {
    if (previousDir == null) delete process.env.LEAD_STORE_DIR;
    else process.env.LEAD_STORE_DIR = previousDir;
    if (previousStore == null) delete process.env.LEAD_STORE;
    else process.env.LEAD_STORE = previousStore;
    if (previousNodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

// Turnstile is mandatory in the production profile, which locked out the only
// non-fabricating way to exercise inbound plumbing in production. A synthetic
// probe proves itself with a server-side secret; Turnstile proves a human
// browser solved a challenge, which a probe is not and cannot be.
{
  const previous = {
    secret: process.env.TURNSTILE_SECRET_KEY,
    require: process.env.LEAD_REQUIRE_TURNSTILE,
    probe: process.env.LEAD_PROBE_SECRET,
    origin: process.env.LEAD_REQUIRE_ORIGIN,
  };
  const probeSecret = "probe-secret-with-at-least-32-characters";
  try {
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret-fixture-value";
    process.env.LEAD_REQUIRE_TURNSTILE = "1";
    process.env.LEAD_REQUIRE_ORIGIN = "1";
    process.env.LEAD_PROBE_SECRET = probeSecret;
    const reloaded = loadHandler();
    reloaded.setStoreForTests(mem);
    _reset();

    const payload = {
      nome: "SYNTHETIC-PROBE",
      email: "probe-turnstile-exemption@example.com",
      estagio: "synthetic probe — discard",
      jornada: "operacao",
      consentimento: "true",
      origem: "/synthetic-probe",
      utm_source: "synthetic",
      utm_medium: "probe",
      utm_campaign: "turnstile-exemption",
    };

    // A browser post with no Turnstile token is still refused.
    const noToken = await reloaded.handler(
      event({ ...payload }, "POST", { ip: "203.0.113.90" }),
    );
    if (noToken.statusCode !== 403 || JSON.parse(noToken.body).error !== "anti_abuse") {
      fail("turnstile_still_required_without_probe", noToken);
    }
    pass("turnstile_still_required_without_probe");

    // A wrong probe secret earns no exemption.
    _reset();
    const wrongSecret = await reloaded.handler(
      event({ ...payload }, "POST", {
        ip: "203.0.113.91",
        "x-confenge-probe": "wrong-secret-with-at-least-32-chars-here",
      }),
    );
    if (wrongSecret.statusCode !== 403 || JSON.parse(wrongSecret.body).error !== "anti_abuse") {
      fail("wrong_probe_secret_earns_no_exemption", wrongSecret);
    }
    pass("wrong_probe_secret_earns_no_exemption");

    // The authenticated probe passes and persists, with no Turnstile token and
    // no browser Origin at all.
    _reset();
    const probed = await reloaded.handler({
      httpMethod: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "confenge-synthetic-probe/1.0",
        "x-forwarded-for": "203.0.113.92",
        "x-confenge-probe": probeSecret,
      },
      body: JSON.stringify({ ...payload }),
    });
    // 201 on first persist, 200 on an idempotent replay; both prove the probe
    // reached the store instead of being refused at the anti-abuse gate.
    if (![200, 201].includes(probed.statusCode)) fail("authenticated_probe_persists", probed);
    const probedBody = JSON.parse(probed.body);
    if (probedBody.ok !== true || !probedBody.lead_id) fail("authenticated_probe_body", probedBody);
    if (probedBody.status !== "persisted") fail("authenticated_probe_not_persisted", probedBody);
    pass("authenticated_probe_skips_turnstile_and_persists", { lead_id: probedBody.lead_id });

    // Persist-only probe: with a live, resolvable inbound destination the row
    // is still born terminal (SKIPPED / persist_only_probe, never due) and a
    // scheduled drain never transports it. Zero POSTs reach Warmbly.
    const inbound = require(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"));
    const { MemoryStore: ProbeMemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
    const probeStore = new ProbeMemoryStore();
    let POST_COUNT = 0;
    process.env.CONFENGE_INBOUND_WEBHOOK_URL = "http://127.0.0.1:9/api/v1/webhooks/confenge/inbound";
    process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = "inbound-secret-fixture-with-at-least-32-chars";
    inbound.setFetchForTests(async () => {
      POST_COUNT += 1;
      return { ok: true, status: 201, text: async () => "{}", json: async () => ({}) };
    });
    try {
      if (inbound.resolveInboundConfig(process.env).ok !== true) {
        fail("persist_only_fixture_destination_not_live", inbound.resolveInboundConfig(process.env));
      }
      reloaded.setStoreForTests(probeStore);
      _reset();
      const persistOnly = await reloaded.handler({
        httpMethod: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "confenge-synthetic-probe/1.0",
          "x-forwarded-for": "203.0.113.93",
          "x-confenge-probe": probeSecret,
          "x-confenge-probe-persist-only": "1",
        },
        body: JSON.stringify({ ...payload, email: "probe-persist-only@example.com", idempotency_key: "probe-persist-only-001" }),
      });
      const persistOnlyBody = JSON.parse(persistOnly.body);
      if (persistOnly.statusCode !== 201 || !persistOnlyBody.lead_id) fail("persist_only_probe_capture", persistOnly);
      const stored = await probeStore.get(persistOnlyBody.lead_id);
      if (!stored || stored.synthetic_probe_authenticated !== true || stored.record_kind !== "synthetic") {
        fail("persist_only_probe_classification", stored);
      }
      if (
        stored.persist_only_probe !== true ||
        !stored.handoff ||
        stored.handoff.status !== "SKIPPED" ||
        stored.handoff.reason !== "persist_only_probe" ||
        stored.handoff.attempts !== 0 ||
        stored.handoff.next_attempt_at !== null
      ) fail("persist_only_probe_handoff_terminal", stored.handoff);
      if (POST_COUNT !== 0) fail("persist_only_probe_posted_at_capture", POST_COUNT);
      if (inbound.isDue(stored.handoff, new Date(Date.now() + 365 * 24 * 3600 * 1000))) {
        fail("persist_only_probe_due", stored.handoff);
      }
      const drain = await inbound.drainPendingHandoffs(probeStore, { now: new Date(), env: process.env });
      const afterDrain = await probeStore.get(persistOnlyBody.lead_id);
      if (
        !drain.ok ||
        drain.attempted !== 0 ||
        drain.delivered !== 0 ||
        afterDrain.handoff.status !== "SKIPPED" ||
        afterDrain.handoff.reason !== "persist_only_probe" ||
        POST_COUNT !== 0
      ) fail("persist_only_probe_drained", { drain, handoff: afterDrain.handoff, POST_COUNT });
      pass("persist_only_probe_never_crosses", { lead_id: persistOnlyBody.lead_id, drain_attempted: drain.attempted });
    } finally {
      inbound.setFetchForTests(null);
      delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
      delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
      reloaded.setStoreForTests(mem);
    }
  } finally {
    for (const [key, value] of [
      ["TURNSTILE_SECRET_KEY", previous.secret],
      ["LEAD_REQUIRE_TURNSTILE", previous.require],
      ["LEAD_PROBE_SECRET", previous.probe],
      ["LEAD_REQUIRE_ORIGIN", previous.origin],
    ]) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    loadHandler();
  }
}

// G03-03: a retry after the browser's 15 s abort reuses the same explicit
// idempotency key but its Turnstile token was consumed by the first POST. The
// handler answers the stored receipt (200 idempotent) BEFORE the anti-abuse
// gate, but only for an explicit key. Without an explicit key the derivable
// content-bucket key stays behind Turnstile (no unauthenticated oracle).
{
  const previous = {
    secret: process.env.TURNSTILE_SECRET_KEY,
    require: process.env.LEAD_REQUIRE_TURNSTILE,
    origin: process.env.LEAD_REQUIRE_ORIGIN,
  };
  const originalFetch = globalThis.fetch;
  let siteverifyCalls = 0;
  const consumed = new Set();
  globalThis.fetch = async (url, opts) => {
    if (isRequestToHost(url, "challenges.cloudflare.com")) {
      siteverifyCalls += 1;
      const token = new URLSearchParams(String(opts && opts.body)).get("response");
      // Real Turnstile tokens are single use: a second siteverify fails.
      const fresh = /^tok-valid-/.test(String(token)) && !consumed.has(token);
      if (fresh) consumed.add(token);
      return { ok: true, status: 200, text: async () => "{}", json: async () => ({ success: fresh }) };
    }
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) };
  };
  try {
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret-fixture-value";
    process.env.LEAD_REQUIRE_TURNSTILE = "1";
    delete process.env.LEAD_REQUIRE_ORIGIN;
    const reloaded = loadHandler();
    const { MemoryStore: IdemMemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
    const idemStore = new IdemMemoryStore();
    reloaded.setStoreForTests(idemStore);
    _reset();

    const key = "fe-2f1c6f5a-7c1e-4a0b-9d2e-6b8f0c3a1d55";
    const payload = {
      nome: "Renata Diretora",
      email: "renata.diretora@construtora.com.br",
      estagio: "diagnostico operacao",
      jornada: "operacao",
      consentimento: "on",
      idempotency_key: key,
    };

    // First POST: valid token, persisted.
    const first = await reloaded.handler(
      event({ ...payload, turnstile_token: "tok-valid-once" }, "POST", {
        ip: "203.0.113.120",
        "idempotency-key": key,
      }),
    );
    const firstBody = JSON.parse(first.body);
    if (first.statusCode !== 201 || !firstBody.lead_id) fail("idem_pre_verify_first_persist", first);
    if (siteverifyCalls !== 1) fail("idem_pre_verify_first_siteverify", siteverifyCalls);

    // Retry after timeout: same key, consumed token -> the receipt, no siteverify.
    const retry = await reloaded.handler(
      event({ ...payload, turnstile_token: "tok-valid-once" }, "POST", {
        ip: "203.0.113.120",
        "idempotency-key": key,
      }),
    );
    const retryBody = JSON.parse(retry.body);
    if (retry.statusCode !== 200 || retryBody.idempotent !== true || retryBody.lead_id !== firstBody.lead_id) {
      fail("idem_pre_verify_replay", { status: retry.statusCode, body: retryBody });
    }
    if (siteverifyCalls !== 1) fail("idem_pre_verify_replay_called_siteverify", siteverifyCalls);
    // Same key and no token at all: still the receipt, still no siteverify.
    const noToken = await reloaded.handler(
      event({ ...payload }, "POST", { ip: "203.0.113.120", "idempotency-key": key }),
    );
    if (noToken.statusCode !== 200 || JSON.parse(noToken.body).idempotent !== true) {
      fail("idem_pre_verify_replay_no_token", noToken);
    }
    if (siteverifyCalls !== 1) fail("idem_pre_verify_no_token_called_siteverify", siteverifyCalls);
    // The replay is the public receipt projection only: no PII, no delivery
    // object, no provider handle.
    const replayStr = JSON.stringify(retryBody);
    for (const forbidden of ["renata", "construtora", "provider_id", "delivery", "audit", "ip_hash"]) {
      if (replayStr.toLowerCase().includes(forbidden)) fail("idem_pre_verify_replay_leak", { forbidden, retryBody });
    }
    pass("idem_pre_verify_replays_receipt_without_turnstile", { lead_id: firstBody.lead_id });

    // Negative property: a new explicit key with a consumed token is refused.
    const newKey = "fe-9a8b7c6d-1e2f-4a3b-8c9d-0e1f2a3b4c5d";
    const newKeyConsumed = await reloaded.handler(
      event({ ...payload, idempotency_key: newKey, turnstile_token: "tok-valid-once" }, "POST", {
        ip: "203.0.113.120",
        "idempotency-key": newKey,
      }),
    );
    if (newKeyConsumed.statusCode !== 403 || JSON.parse(newKeyConsumed.body).error !== "anti_abuse") {
      fail("idem_pre_verify_new_key_refused", newKeyConsumed);
    }
    if (siteverifyCalls !== 2) fail("idem_pre_verify_new_key_siteverify", siteverifyCalls);
    if (await idemStore.getByIdempotency(`idk:${newKey}`)) fail("idem_pre_verify_new_key_persisted", newKey);

    // Negative property: an explicit key OUTSIDE the front's shapes (a probe
    // stamp, a bare timestamp, a harness key) is persistence-only. Its stored
    // receipt is NOT replayed before Turnstile even though the record exists:
    // consumed token -> 403 with siteverify called; no token -> 403 too. The
    // probe itself never needs this path (it authenticates with the probe
    // secret and Turnstile is skipped), so nothing legitimate regresses.
    const { CLIENT_REPLAY_KEY } = reloaded;
    const foreignKeys = [
      `synthetic-probe-${Date.now()}`,
      `fe-${Date.now()}`,
      "harness-idem",
      "fe-abc-def",
    ];
    for (const [foreignIndex, foreignKey] of foreignKeys.entries()) {
      if (CLIENT_REPLAY_KEY.test(foreignKey)) fail("idem_pre_verify_foreign_key_allowlisted", foreignKey);
      const foreignIp = `203.0.113.${140 + foreignIndex}`;
      const seeded = await reloaded.handler(
        event({ ...payload, idempotency_key: foreignKey, turnstile_token: `tok-valid-${foreignKey}` }, "POST", {
          ip: foreignIp,
          "idempotency-key": foreignKey,
        }),
      );
      if (seeded.statusCode !== 201) fail("idem_pre_verify_foreign_key_persist", { foreignKey, seeded });
      const beforeForeign = siteverifyCalls;
      const foreignConsumed = await reloaded.handler(
        event({ ...payload, idempotency_key: foreignKey, turnstile_token: `tok-valid-${foreignKey}` }, "POST", {
          ip: foreignIp,
          "idempotency-key": foreignKey,
        }),
      );
      if (foreignConsumed.statusCode !== 403 || JSON.parse(foreignConsumed.body).error !== "anti_abuse") {
        fail("idem_pre_verify_foreign_key_replayed", { foreignKey, status: foreignConsumed.statusCode, body: foreignConsumed.body });
      }
      if (siteverifyCalls !== beforeForeign + 1) fail("idem_pre_verify_foreign_key_skipped_siteverify", { foreignKey, siteverifyCalls });
      const foreignNoToken = await reloaded.handler(
        event({ ...payload, idempotency_key: foreignKey }, "POST", { ip: foreignIp, "idempotency-key": foreignKey }),
      );
      if (foreignNoToken.statusCode !== 403) fail("idem_pre_verify_foreign_key_no_token", { foreignKey, foreignNoToken });
    }
    pass("idem_pre_verify_foreign_key_stays_behind_turnstile", { keys: foreignKeys.length });

    // Positive property: every shape the front can mint (randomUUID, the
    // getRandomValues fallback and the Date.now+Math.random fallback, for the
    // shared form and for adaptive intake) replays without siteverify. This
    // is what stops a future "tighten to uuid only" from reintroducing the
    // 403-after-timeout bug for browsers without crypto.randomUUID.
    const frontShapes = [
      `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
      `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      "fe-1z141z3-a1b2c3d-9-zzzzzzz",
      `triage-${"7c9e6679-7425-40de-944b-e07fc1f90ae7"}`,
      `triage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
    ];
    for (const [index, shapeKey] of frontShapes.entries()) {
      if (!CLIENT_REPLAY_KEY.test(shapeKey)) fail("idem_pre_verify_front_shape_rejected", shapeKey);
      const shapeIp = `203.0.113.${130 + index}`;
      const shapeFirst = await reloaded.handler(
        event({ ...payload, idempotency_key: shapeKey, turnstile_token: `tok-valid-${shapeKey}` }, "POST", {
          ip: shapeIp,
          "idempotency-key": shapeKey,
        }),
      );
      if (shapeFirst.statusCode !== 201) fail("idem_pre_verify_front_shape_persist", { shapeKey, shapeFirst });
      const beforeShape = siteverifyCalls;
      const shapeReplay = await reloaded.handler(
        event({ ...payload, idempotency_key: shapeKey }, "POST", { ip: shapeIp, "idempotency-key": shapeKey }),
      );
      const shapeBody = JSON.parse(shapeReplay.body);
      if (shapeReplay.statusCode !== 200 || shapeBody.idempotent !== true || shapeBody.lead_id !== JSON.parse(shapeFirst.body).lead_id) {
        fail("idem_pre_verify_front_shape_replay", { shapeKey, status: shapeReplay.statusCode, body: shapeBody });
      }
      if (siteverifyCalls !== beforeShape) fail("idem_pre_verify_front_shape_called_siteverify", { shapeKey, siteverifyCalls });
    }
    pass("idem_pre_verify_replays_every_front_shape", { shapes: frontShapes.length });

    // Negative property: no explicit key -> content-bucket key stays behind
    // Turnstile even though an identical record now exists in the store.
    const { idempotency_key: _omit, ...contentOnly } = payload;
    const bucketPersisted = await reloaded.handler(
      event({ ...contentOnly, turnstile_token: "tok-valid-two" }, "POST", { ip: "203.0.113.121" }),
    );
    if (bucketPersisted.statusCode !== 201) fail("idem_pre_verify_bucket_persist", bucketPersisted);
    const beforeOracle = siteverifyCalls;
    const oracleConsumed = await reloaded.handler(
      event({ ...contentOnly, turnstile_token: "tok-valid-two" }, "POST", { ip: "203.0.113.121" }),
    );
    if (oracleConsumed.statusCode !== 403 || JSON.parse(oracleConsumed.body).error !== "anti_abuse") {
      fail("idem_pre_verify_content_key_oracle_consumed_token", oracleConsumed);
    }
    if (siteverifyCalls !== beforeOracle + 1) fail("idem_pre_verify_content_key_skipped_siteverify", siteverifyCalls);
    const oracleNoToken = await reloaded.handler(event({ ...contentOnly }, "POST", { ip: "203.0.113.121" }));
    if (oracleNoToken.statusCode !== 403 || JSON.parse(oracleNoToken.body).error !== "anti_abuse") {
      fail("idem_pre_verify_content_key_oracle_no_token", oracleNoToken);
    }
    pass("idem_pre_verify_requires_explicit_key", { siteverifyCalls });
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.secret == null) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = previous.secret;
    if (previous.require == null) delete process.env.LEAD_REQUIRE_TURNSTILE;
    else process.env.LEAD_REQUIRE_TURNSTILE = previous.require;
    if (previous.origin == null) delete process.env.LEAD_REQUIRE_ORIGIN;
    else process.env.LEAD_REQUIRE_ORIGIN = previous.origin;
  }
}

// Option B document intake: JSON channel-request succeeds; files never persist.
{
  const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const eicar = core.EICAR_SIGNATURE;
  const before = (await mem.list()).length;

  const channelReq = await handler(
    event({
      nome: "QA Canal Seguro",
      email: "qa-canal@example.com",
      estagio: "problema urgente em contrato",
      jornada: "contrato",
      consentimento: "on",
      document_intent: "secure_channel_request",
      canal_seguro: "1",
      origem: "/",
      mensagem: "Quero solicitar um canal seguro para envio.",
      idempotency_key: "qa-secure-channel-1",
    }),
  );
  const channelBody = JSON.parse(channelReq.body);
  if (channelReq.statusCode !== 201 || !channelBody.ok || !channelBody.lead_id) {
    fail("secure_channel_json_persist", channelBody);
  }
  if (channelBody.document_intent !== "secure_channel_request" || channelBody.channel_status !== "canal escolhido posteriormente") {
    fail("secure_channel_receipt_sla", channelBody);
  }
  const storedChannel = await mem.get(channelBody.lead_id);
  if (!storedChannel || storedChannel.document_intent !== "secure_channel_request" || storedChannel.canal_seguro !== true) {
    fail("secure_channel_store_flags", storedChannel);
  }
  if (core.leadHasFilePayload(storedChannel)) fail("secure_channel_store_has_file", storedChannel);
  const exported = core.titularExport(storedChannel);
  if (exported.lead_id !== storedChannel.lead_id || exported.channel_status !== "canal escolhido posteriormente") {
    fail("titular_export_receipt", exported);
  }
  if (JSON.stringify(exported).includes(eicar) || Object.keys(exported).some((k) => core.FILE_FIELD_KEYS.has(k))) {
    fail("titular_export_file_bytes", exported);
  }
  pass("secure_channel_json_success", { lead_id: channelBody.lead_id });

  const replay = await handler(
    event({
      nome: "QA Canal Seguro",
      email: "qa-canal@example.com",
      estagio: "problema urgente em contrato",
      jornada: "contrato",
      consentimento: "on",
      document_intent: "secure_channel_request",
      canal_seguro: "1",
      origem: "/",
      mensagem: "Quero solicitar um canal seguro para envio.",
      idempotency_key: "qa-secure-channel-1",
    }),
  );
  const replayBody = JSON.parse(replay.body);
  if (replay.statusCode !== 200 || replayBody.idempotent !== true || replayBody.lead_id !== channelBody.lead_id) {
    fail("secure_channel_duplicate", replayBody);
  }
  if ((await mem.list()).filter((r) => r.idempotency_key && String(r.idempotency_key).includes("qa-secure-channel-1")).length !== 1) {
    fail("secure_channel_duplicate_persisted_extra");
  }
  pass("secure_channel_duplicate_idempotent");

  const multipart = await handler({
    httpMethod: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=----CfgTest",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-lead-test/1.0",
      "x-forwarded-for": "203.0.113.60",
    },
    body: "------CfgTest\r\nContent-Disposition: form-data; name=\"file\"; filename=\"edital.pdf\"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 fake\r\n------CfgTest--",
  });
  const multipartBody = JSON.parse(multipart.body);
  if (multipart.statusCode !== 415 || multipartBody.error !== "file_payload_rejected") {
    fail("multipart_rejected", { status: multipart.statusCode, body: multipartBody });
  }
  if ((await mem.list()).length !== before + 1) fail("multipart_persisted");
  pass("multipart_rejected");

  const oversize = "x".repeat(core.MAX_BODY_BYTES + 8);
  const oversizeRes = await handler({
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-lead-test/1.0",
      "x-forwarded-for": "203.0.113.61",
    },
    body: oversize,
  });
  const oversizeBody = JSON.parse(oversizeRes.body);
  if (oversizeRes.statusCode !== 413 || oversizeBody.error !== "payload_too_large") {
    fail("oversize_413", { status: oversizeRes.statusCode, body: oversizeBody });
  }
  if ((await mem.list()).length !== before + 1) fail("oversize_persisted");
  pass("oversize_413");

  const spoof = await handler({
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-lead-test/1.0",
      "x-forwarded-for": "203.0.113.62",
    },
    body: "%PDF-1.4 spoofed as json",
  });
  const spoofBody = JSON.parse(spoof.body);
  if (spoof.statusCode !== 415 || spoofBody.error !== "file_payload_rejected") {
    fail("mime_spoof_rejected", { status: spoof.statusCode, body: spoofBody });
  }
  pass("mime_spoof_rejected");

  const fileKey = await handler(
    event({
      nome: "QA File Key",
      email: "qa-file@example.com",
      estagio: "problema urgente em contrato",
      consentimento: "on",
      file: "edital.pdf",
    }),
  );
  const fileKeyBody = JSON.parse(fileKey.body);
  if (fileKey.statusCode !== 415 || fileKeyBody.error !== "file_payload_rejected") {
    fail("file_field_rejected", { status: fileKey.statusCode, body: fileKeyBody });
  }
  pass("file_field_rejected");

  const eicarRes = await handler(
    event({
      nome: "QA Eicar",
      email: "qa-eicar@example.com",
      estagio: "problema urgente em contrato",
      consentimento: "on",
      mensagem: eicar,
    }),
  );
  const eicarBody = JSON.parse(eicarRes.body);
  if (eicarRes.statusCode !== 415 || eicarBody.error !== "file_payload_rejected") {
    fail("eicar_rejected", { status: eicarRes.statusCode, body: eicarBody });
  }
  const listed = JSON.stringify(await mem.list());
  if (listed.includes(eicar)) fail("eicar_persisted", "fixture bytes in store");
  pass("eicar_fixture_rejected_not_persisted");

  const timeoutLike = await handler({
    httpMethod: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=----Abort",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-lead-test/1.0",
      "x-forwarded-for": "203.0.113.63",
    },
    body: "------Abort\r\nContent-Disposition: form-data; name=\"file\"; filename=\"cut.bin\"\r\n\r\ntruncated",
  });
  if (timeoutLike.statusCode !== 415) fail("timeout_truncated_multipart", timeoutLike);
  if ((await mem.list()).length !== before + 1) fail("timeout_stored_file");
  pass("timeout_truncated_multipart_no_file");

  const deleted = await mem.delete(channelBody.lead_id);
  if (!deleted || (await mem.get(channelBody.lead_id))) fail("request_deletion_left_record");
  try {
    core.titularExport({ lead_id: channelBody.lead_id, file: eicar, mensagem: eicar });
    fail("titular_export_allowed_file");
  } catch (err) {
    if (!err || err.code !== "file_payload_forbidden") fail("titular_export_error_code", err);
  }
  pass("request_deletion_and_export_file_free");
}

// --- Canal de contato: presenca nao e validade (2026-08-31) ----------------
// Antes disto, normalizePhone e normalizeEmail devolviam "" tanto para campo
// vazio quanto para campo preenchido com lixo, e o servidor tratava os dois
// como o mesmo caso. Um WhatsApp digitado errado sumia em silencio, e o
// visitante que so tinha informado esse canal recebia "Informe WhatsApp ou
// e-mail para retorno.", culpando-o por um campo que ele havia preenchido.
{
  const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const base = {
    nome: "Tiago",
    estagio: "Edital ou proposta em análise",
    jornada: "edital",
    consentimento: "on",
    record_kind: "qa",
    test_mode: true,
  };

  const rejects = [
    ["telefone_invalido_sozinho", { telefone: "48988" }, "telefone", /WhatsApp/i],
    ["telefone_invalido_com_email_valido", { telefone: "48988", email: "a@b.com.br" }, "telefone", /WhatsApp/i],
    ["email_invalido_sozinho", { email: "asdf" }, "email", /E-mail/i],
    ["email_sem_tld", { email: "a@b" }, "email", /E-mail/i],
    ["telefone_longo_demais", { telefone: "4898834455912345678" }, "telefone", /WhatsApp/i],
  ];
  for (const [name, extra, field, messageRe] of rejects) {
    const check = core.validateAndNormalize({ ...base, ...extra });
    if (check.ok) fail(name, { reason: "aceitou valor incompativel", check });
    else if (check.field !== field) fail(name, { reason: "campo errado", got: check.field, want: field });
    else if (!messageRe.test(String(check.message || ""))) fail(name, { reason: "alerta sem o canal", message: check.message });
    else pass(name);
  }

  // O caso generico continua existindo: nada informado segue sendo "faltou canal".
  const empty = core.validateAndNormalize({ ...base });
  if (empty.ok || empty.field || !/Informe WhatsApp ou e-mail/i.test(String(empty.message || ""))) {
    fail("sem_canal_mantem_mensagem_generica", empty);
  } else pass("sem_canal_mantem_mensagem_generica");

  // Aceitos normalizam: o formato que o visitante digita nao e o que se grava.
  const accepts = [
    ["telefone_formatado_normaliza", { telefone: "(48) 98834-4559" }, (l) => l.telefone === "48988344559"],
    ["telefone_com_ddi_normaliza", { telefone: "+55 48 98834-4559" }, (l) => l.telefone === "5548988344559"],
    ["telefone_fixo_dez_digitos", { telefone: "48 3223-4455" }, (l) => l.telefone === "4832234455"],
    ["email_maiusculo_normaliza", { email: "TIAGO@CONFENGE.COM.BR" }, (l) => l.email === "tiago@confenge.com.br"],
  ];
  for (const [name, extra, predicate] of accepts) {
    const check = core.validateAndNormalize({ ...base, ...extra });
    if (!check.ok) fail(name, { reason: "recusou valor valido", check });
    else if (!predicate(check.lead)) fail(name, { reason: "nao normalizou", lead: { telefone: check.lead.telefone, email: check.lead.email } });
    else pass(name);
  }
}

// --- intent_kind: server-side allowlist, mirrored on document_intent --------
// The live-intelligence surfaces submit through this same endpoint. An intent
// the server does not recognize must be dropped, not forwarded: warmbly acts on
// this field, so an unknown value would be an invented commercial instruction.
{
  const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const handoff = require(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"));
  const base = {
    nome: "Tiago",
    email: "intent@example.com",
    estagio: "Edital ou proposta em análise",
    jornada: "edital",
    consentimento: "on",
    record_kind: "qa",
    test_mode: true,
  };

  const allowed = ["MONITOR_OPPORTUNITY", "MONITOR_COMPANY", "REQUEST_DEEP_DIVE", "REQUEST_HUMAN_REVIEW"];
  if (JSON.stringify([...core.INTENT_KIND_ALLOWED]) !== JSON.stringify(allowed)) {
    fail("intent_kind_allowlist_drift", [...core.INTENT_KIND_ALLOWED]);
  } else pass("intent_kind_allowlist_shape");

  for (const kind of allowed) {
    const check = core.validateAndNormalize({ ...base, intent_kind: kind });
    if (!check.ok) fail(`intent_kind_accept_${kind}`, check);
    else if (check.lead.intent_kind !== kind) fail(`intent_kind_accept_${kind}`, check.lead.intent_kind);
    else pass(`intent_kind_accept_${kind}`);
  }

  const unknowns = [
    ["desconhecido", "MONITOR_EVERYTHING"],
    ["minusculo", "monitor_company"],
    ["vazio", ""],
    ["injecao", "MONITOR_COMPANY; DROP"],
    ["longo_demais", "MONITOR_COMPANY".padEnd(120, "X")],
    ["nao_string", { kind: "MONITOR_COMPANY" }],
  ];
  for (const [name, value] of unknowns) {
    const check = core.validateAndNormalize({ ...base, intent_kind: value });
    if (!check.ok) fail(`intent_kind_reject_${name}`, { reason: "recusou o lead inteiro", check });
    else if (check.lead.intent_kind !== null) {
      fail(`intent_kind_reject_${name}`, { reason: "valor desconhecido persistiu", got: check.lead.intent_kind });
    } else pass(`intent_kind_reject_${name}`);
  }

  // The opaque analysis token must survive the attribution sanitizer. A token
  // shape it silently rejects would null the field and break the thread with no
  // error anywhere.
  const token = "li_3f9a2c7e-5b1d4068-9a7c2e0f-1b6d4a3c";
  const tokened = core.validateAndNormalize({
    ...base,
    intent_kind: "MONITOR_COMPANY",
    analysis_id: token,
  });
  if (!tokened.ok || tokened.lead.analysis_id !== token) {
    fail("intent_kind_analysis_token_survives", { analysis_id: tokened.lead && tokened.lead.analysis_id });
  } else pass("intent_kind_analysis_token_survives");

  // A live-intelligence share token is stored locally (so ops can see it in
  // the lead record), but it is exactly the opaque value embedded in a
  // publicly shareable URL — it must never also become a Warmbly-side
  // correlation key. intent_kind still reaches the handoff; analysis_id
  // specifically does not, only for this token shape.
  const forwarded = handoff.mapLeadToInboundV1({
    ...tokened.lead,
    lead_id: "lead-000000000000000000000000000",
    consentimento: true,
  });
  if (forwarded.intent_kind !== "MONITOR_COMPANY") {
    fail("intent_kind_reaches_handoff", { intent_kind: forwarded.intent_kind });
  } else if ("analysis_id" in forwarded) {
    fail("share_token_reached_commercial_handoff", forwarded.analysis_id);
  } else if (forwarded.source !== "CONFENGE_WEB") {
    fail("intent_kind_handoff_source", forwarded.source);
  } else pass("intent_kind_reaches_handoff_share_token_does_not");

  // A non-token analysis_id (e.g. an opportunity's stable public slug from
  // Surface A) is a different kind of value — public by design, not a share
  // token resolving a private-until-shared result — and is unaffected.
  const opportunityId = "pe-2026-000903-sinalizacao-viaria-caxias-rs";
  const opportunityLead = core.validateAndNormalize({
    ...base,
    intent_kind: "MONITOR_OPPORTUNITY",
    analysis_id: opportunityId,
  });
  const opportunityForwarded = handoff.mapLeadToInboundV1({
    ...opportunityLead.lead,
    lead_id: "lead-000000000000000000000000004",
    consentimento: true,
  });
  if (opportunityForwarded.analysis_id !== opportunityId) {
    fail("non_token_analysis_id_should_reach_handoff", opportunityForwarded.analysis_id);
  } else pass("opportunity_id_reaches_handoff_unlike_share_token");

  const dropped = core.validateAndNormalize({ ...base, intent_kind: "MONITOR_EVERYTHING" });
  const droppedBody = handoff.mapLeadToInboundV1({
    ...dropped.lead,
    lead_id: "lead-000000000000000000000000001",
    consentimento: true,
  });
  if ("intent_kind" in droppedBody) {
    fail("intent_kind_unknown_not_forwarded", droppedBody.intent_kind);
  } else pass("intent_kind_unknown_not_forwarded");

  // End to end through the real handler, not just the pure validator: the body
  // passes parseBody and attribution capture before it reaches the record, and
  // a field the wire drops is a field warmbly never sees.
  _reset();
  const wire = await handler(
    event({
      nome: "QA Intent",
      email: "qa-intent@example.com",
      estagio: "escolhendo oportunidades",
      jornada: "operacao",
      consentimento: "on",
      intent_kind: "MONITOR_COMPANY",
      analysis_id: token,
      origem: "/analise-cnpj/",
      idempotency_key: "qa-intent-kind-1",
    }),
  );
  const wireBody = JSON.parse(wire.body);
  if (wire.statusCode !== 201 || !wireBody.lead_id) fail("intent_kind_wire_persist", wireBody);
  const storedIntent = await mem.get(wireBody.lead_id);
  if (!storedIntent || storedIntent.intent_kind !== "MONITOR_COMPANY") {
    fail("intent_kind_not_stored_from_wire", { intent_kind: storedIntent && storedIntent.intent_kind });
  }
  if (storedIntent.analysis_id !== token) {
    fail("analysis_id_not_stored_from_wire", storedIntent.analysis_id);
  }
  // The public receipt stays a whitelist: no intent, no token echoed back.
  if ("intent_kind" in wireBody || "analysis_id" in wireBody) {
    fail("intent_kind_echoed_in_receipt", wireBody);
  }
  pass("intent_kind_survives_the_wire");

  _reset();
  const wireUnknown = await handler(
    event({
      nome: "QA Intent",
      email: "qa-intent2@example.com",
      estagio: "escolhendo oportunidades",
      jornada: "operacao",
      consentimento: "on",
      intent_kind: "MONITOR_EVERYTHING",
      idempotency_key: "qa-intent-kind-2",
    }),
  );
  const unknownBody = JSON.parse(wireUnknown.body);
  if (wireUnknown.statusCode !== 201) fail("intent_kind_unknown_wire_status", unknownBody);
  const storedUnknown = await mem.get(unknownBody.lead_id);
  if (!storedUnknown || storedUnknown.intent_kind !== null) {
    fail("intent_kind_unknown_stored_from_wire", storedUnknown && storedUnknown.intent_kind);
  }
  pass("intent_kind_unknown_dropped_on_the_wire");

  // A CNPJ must never ride the lead path as an intent or analysis token.
  const cnpjToken = core.validateAndNormalize({
    ...base,
    intent_kind: "MONITOR_COMPANY",
    analysis_id: "11222333000181",
  });
  const cnpjBody = handoff.mapLeadToInboundV1({
    ...cnpjToken.lead,
    lead_id: "lead-000000000000000000000000002",
    consentimento: true,
  });
  if (/(?<!\d)\d{14}(?!\d)/.test(JSON.stringify({ ...cnpjBody, message: "" }))) {
    fail("intent_kind_no_cnpj_in_handoff", cnpjBody.analysis_id);
  } else pass("intent_kind_no_cnpj_in_handoff");
}

// --- INB-20260911/02: private persist, origin vs edited need, consent split,
// privilege claims, persist-fail honesty, concurrent idempotency, no-JS path.
{
  const { FileStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
  const { publicSuccessBody } = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const inbound = require(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"));
  const formSrc = fs.readFileSync(path.join(root, "js/modules/form.js"), "utf8");
  if (!formSrc.includes("typeof window.fetch === 'function'") || !formSrc.includes("event.preventDefault()")) {
    fail("form_js_missing_fetch_guard");
  }
  if (!/if \(typeof window\.fetch === 'function'[\s\S]*event\.preventDefault\(\)/.test(formSrc)) {
    fail("form_js_preventdefault_unconditional");
  }
  if (/track\('lead_persisted'[\s\S]{0,200}wa\.me/.test(formSrc)) {
    fail("form_js_whatsapp_fallback_emits_lead_persisted");
  }
  pass("nojs_native_submit_guard_and_whatsapp_not_receipt");

  const privatePayload = {
    nome: "Ana Privada",
    telefone: "48988344559",
    estagio: "projeto, revisão ou compatibilização",
    jornada: "projeto",
    consentimento: "on",
    origem: "/ferramentas/checklist-reequilibrio/",
    landing_url: "/ferramentas/checklist-reequilibrio/",
    analytics_consent: false,
    marketing_consent: false,
    cookie_consent: "denied",
    paid_priority: true,
    authorized: true,
    approved: "yes",
    commercial_authorization: "VIP",
    public_contract_id: "",
    cnpj: "",
    empresa: "",
    mensagem: "",
    idempotency_key: "inb02-private-001",
  };
  const priv = await handler(event(privatePayload, "POST", { ip: "203.0.113.201" }));
  const privBody = JSON.parse(priv.body);
  const privStored = privBody.lead_id ? await mem.get(privBody.lead_id) : null;
  if (priv.statusCode !== 201 || !privStored) fail("private_without_b2g", { status: priv.statusCode, privBody, privStored });
  if (privStored.estagio !== "projeto, revisão ou compatibilização") fail("private_stage", privStored.estagio);
  if (privStored.origem !== "/ferramentas/checklist-reequilibrio/") fail("private_origem", privStored.origem);
  if (privStored.public_contract_id || privStored.cnpj) fail("private_got_b2g_fields", privStored);
  if (privStored.paid_priority || privStored.authorized || privStored.approved || privStored.commercial_authorization) {
    fail("privilege_claims_persisted", privStored);
  }
  if (privBody.handoff || privBody.handoff_status === "DELIVERED") fail("public_claimed_handoff", privBody);
  pass("private_persist_without_b2g_and_no_privilege");

  const analyticsOnly = await handler(event({
    nome: "Ana Privada",
    email: "ana.privada@example.com",
    estagio: "projeto, revisão ou compatibilização",
    analytics_consent: true,
    marketing_consent: true,
  }, "POST", { ip: "203.0.113.202" }));
  const analyticsOnlyBody = JSON.parse(analyticsOnly.body);
  if (analyticsOnly.statusCode !== 400 || analyticsOnlyBody.error !== "consent") {
    fail("analytics_consent_must_not_replace_request_consent", analyticsOnlyBody);
  }
  pass("analytics_consent_does_not_replace_request_consent");

  const altered = await handler(event({
    nome: "Ana Privada",
    email: "ana.privada@example.com",
    estagio: "perícia, assistência técnica ou avaliação",
    jornada: "pericia",
    consentimento: "on",
    origem: "/ferramentas/checklist-reequilibrio/",
    landing_url: "/ferramentas/checklist-reequilibrio/",
    analytics_consent: false,
    idempotency_key: "inb02-altered-need-001",
  }, "POST", { ip: "203.0.113.203" }));
  const alteredBody = JSON.parse(altered.body);
  const alteredStored = alteredBody.lead_id ? await mem.get(alteredBody.lead_id) : null;
  if (altered.statusCode !== 201 || !alteredStored) fail("altered_need_persist", alteredBody);
  if (alteredStored.estagio !== "perícia, assistência técnica ou avaliação") {
    fail("altered_need_not_current", alteredStored.estagio);
  }
  if (alteredStored.origem !== "/ferramentas/checklist-reequilibrio/") {
    fail("altered_need_overwrote_origin", alteredStored.origem);
  }
  pass("edited_need_prevails_origin_frozen");

  // Missao do fundador: nao saber qual servico precisa nunca elimina uma
  // pessoa valida. Sem estagio, o registro recebe o valor "ainda nao sei qual
  // servico" (mesmo da home) e e marcado NEEDS_CONTEXT; antes era 400.
  const missingNeed = await handler(event({
    nome: "Ana Privada",
    email: "ana.privada@example.com",
    consentimento: "on",
  }, "POST", { ip: "203.0.113.204" }));
  const missingNeedBody = JSON.parse(missingNeed.body);
  const missingNeedStored = missingNeedBody.lead_id ? await mem.get(missingNeedBody.lead_id) : null;
  if (missingNeed.statusCode !== 201 || missingNeedBody.qualification_state !== "NEEDS_CONTEXT" ||
      !missingNeedStored || missingNeedStored.estagio !== "ainda não sei qual serviço") {
    fail("need_defaults_to_unknown_service", { status: missingNeed.statusCode, missingNeedBody, missingNeedStored });
  }
  pass("need_defaults_to_unknown_service");

  const successShape = publicSuccessBody({
    lead_id: "lead-fffffffffffffffffffffffffff",
    received_at: "2026-09-11T00:00:00.000Z",
    journey: "outro",
    stage_category: "projeto, revisão ou compatibilização",
    status: "persisted",
  });
  if (!successShape.ok || !successShape.lead_id) fail("success_shape", successShape);
  if (Object.prototype.hasOwnProperty.call(successShape, "handoff")) fail("success_shape_handoff", successShape);
  pass("public_success_is_persist_not_handoff");

  if (inbound.handoffAcceptedSemantic(null) !== "UNKNOWN") fail("handoff_semantic_null");
  if (inbound.handoffAcceptedSemantic({ status: "DELIVERED" }) !== "handoff_accepted") {
    fail("handoff_semantic_delivered");
  }
  if (inbound.handoffAcceptedSemantic({ status: "RETRYABLE" }) !== "RETRYABLE") {
    fail("handoff_semantic_pending_claimed_accepted");
  }
  if (inbound.handoffAcceptedSemantic({ status: "SKIPPED", reason: "not_configured" }) !== "SKIPPED") {
    fail("handoff_missing_dest_not_accepted");
  }
  pass("handoff_accepted_semantic");

  const failingStore = {
    ephemeral: false,
    async getByIdempotency() { return null; },
    async get() { return null; },
    async put() { throw new Error("disk_full"); },
    async update() { return null; },
    async list() { return []; },
  };
  setStoreForTests(failingStore);
  const failed = await handler(event({
    nome: "Ana Privada",
    email: "ana.privada@example.com",
    estagio: "projeto, revisão ou compatibilização",
    consentimento: "on",
    idempotency_key: "inb02-persist-fail-001",
  }, "POST", { ip: "203.0.113.205" }));
  const failedBody = JSON.parse(failed.body);
  if (failed.statusCode !== 503 || failedBody.ok !== false) fail("persist_fail_status", failedBody);
  if (failedBody.lead_id || failedBody.receipt_id) fail("persist_fail_fictitious_protocol", failedBody);
  setStoreForTests(mem);
  pass("persist_failure_has_no_protocol");

  const concDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-inb02-"));
  const concStore = new FileStore(concDir);
  setStoreForTests(concStore);
  const concPayload = {
    nome: "Ana Privada",
    email: "ana.privada@example.com",
    estagio: "projeto, revisão ou compatibilização",
    consentimento: "on",
    origem: "/ferramentas/checklist-reequilibrio/",
    idempotency_key: "inb02-concurrent-001",
  };
  const concHeaders = { ip: "203.0.113.206", "Idempotency-Key": "inb02-concurrent-001" };
  const concResults = await Promise.all([
    handler(event(concPayload, "POST", concHeaders)),
    handler(event(concPayload, "POST", concHeaders)),
    handler(event(concPayload, "POST", concHeaders)),
  ]);
  const concBodies = concResults.map((r) => JSON.parse(r.body));
  const concIds = [...new Set(concBodies.map((b) => b.lead_id).filter(Boolean))];
  const concList = await concStore.list();
  if (concIds.length !== 1) fail("concurrent_ids", concBodies);
  if (concList.length !== 1) fail("concurrent_store_rows", concList.length);
  const retry = await handler(event(concPayload, "POST", concHeaders));
  const retryBody = JSON.parse(retry.body);
  if (retry.statusCode !== 200 || retryBody.idempotent !== true || retryBody.lead_id !== concIds[0]) {
    fail("retry_same_key", retryBody);
  }
  if ((await concStore.list()).length !== 1) fail("retry_created_duplicate");
  setStoreForTests(mem);
  try { fs.rmSync(concDir, { recursive: true, force: true }); } catch { /* ignore */ }
  pass("concurrent_and_retry_one_receipt", { lead_id: concIds[0] });
}

// --- POS-INB-20260911/01: browser cannot self-declare synthetic; adaptive stays
// WITHHELD; malicious attribution dropped; FileStore persist without override.
{
  const authority = JSON.parse(fs.readFileSync(
    path.join(root, "netlify/functions/data/adaptive-intake-authority.json"),
    "utf8",
  ));
  if (authority.status !== "WITHHELD") fail("pos_inb_01_adaptive_withheld", authority.status);
  const formSrc = fs.readFileSync(path.join(root, "js/modules/form.js"), "utf8");
  if (!formSrc.includes("fetch('/api/web/lead'")) fail("pos_inb_01_canonical_post");
  if (formSrc.includes("fetch('/.netlify/functions/lead'")) fail("pos_inb_01_endpoint_swap");

  const claim = await handler(event({
    nome: "Carla Mendes",
    email: "carla.mendes@construtora-norte.com.br",
    estagio: "projeto, revisão ou compatibilização",
    consentimento: "on",
    record_kind: "synthetic",
    test_mode: true,
    paid_priority: true,
    qualified: true,
    authorized: true,
    idempotency_key: "pos-inb-01-wired-claim-001",
  }, "POST", { ip: "203.0.113.221" }));
  const claimBody = JSON.parse(claim.body);
  const claimStored = claimBody.lead_id ? await mem.get(claimBody.lead_id) : null;
  if (claim.statusCode !== 201 || !claimStored) fail("pos_inb_01_claim_persist", claimBody);
  if (claimStored.record_kind !== "real") fail("pos_inb_01_browser_synthetic", claimStored.record_kind);
  if (claimStored.synthetic_probe_authenticated === true) fail("pos_inb_01_browser_probe");
  if (claimStored.paid_priority || claimStored.qualified) fail("pos_inb_01_privilege");
  pass("pos_inb_01_browser_claims_ignored");

  const malicious = await handler(event({
    nome: "Carla Mendes",
    telefone: "48988344559",
    estagio: "projeto, revisão ou compatibilização",
    consentimento: "on",
    origem: "javascript:alert(1)",
    landing_url: "https://evil.example/?email=leak@x.com",
    utm_source: "<script>x</script>",
    fbclid: "drop",
    idempotency_key: "pos-inb-01-wired-malicious-001",
  }, "POST", { ip: "203.0.113.222" }));
  const malBody = JSON.parse(malicious.body);
  const malStored = malBody.lead_id ? await mem.get(malBody.lead_id) : null;
  if (malicious.statusCode !== 201 || !malStored) fail("pos_inb_01_malicious_persist", malBody);
  if (malStored.origem || malStored.utm_source || malStored.fbclid) fail("pos_inb_01_malicious_kept", malStored);
  if (malStored.landing_url && /email=/.test(malStored.landing_url)) fail("pos_inb_01_query_kept");
  pass("pos_inb_01_malicious_dropped");

  const adaptive = await handler(event({
    nome: "Carla Mendes",
    email: "carla.mendes@construtora-norte.com.br",
    estagio: "projeto, revisão ou compatibilização",
    consentimento: "on",
    need_code: "licitacao_obra_ou_contrato_publico",
    "form-name": "triagem-tecnica",
    idempotency_key: "pos-inb-01-wired-adaptive-001",
  }, "POST", { ip: "203.0.113.223" }));
  const adaptiveBody = JSON.parse(adaptive.body);
  if (adaptive.statusCode === 201 && adaptiveBody.ok === true) fail("pos_inb_01_adaptive_activated", adaptiveBody);
  if (adaptiveBody.lead_id) fail("pos_inb_01_adaptive_protocol", adaptiveBody);
  pass("pos_inb_01_adaptive_stays_withheld", { status: adaptive.statusCode });
}

// W7 (#706) origin_class: server-derived at persist time from sanitized UTM tokens
// and the referrer HOST only. It is not an intake field: a posted value is ignored,
// no full URL or PII participates, and "no referrer" is direct_or_unknown, never
// organic. Contract: data/revops/proposal-counting.v1.json (web_origin_class).
{
  const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  if (JSON.stringify(core.ORIGIN_CLASS_VALUES) !== JSON.stringify(["campaign", "search_organic", "referral", "direct_or_unknown"])) {
    fail("origin_class_values", core.ORIGIN_CLASS_VALUES);
  }
  if (core.ATTR_ALLOWLIST.includes("origin_class")) fail("origin_class_in_intake_allowlist", "must stay server-derived");
  const base = {
    nome: "Origem Classe",
    telefone: "48988001122",
    estagio: "problema urgente em contrato",
    jornada: "contrato",
    consentimento: "on",
    landing_page: "/defesa-margem-contratos-publicos/",
  };
  const cases = [
    // referrer exactly as the store keeps it (origin + path, query stripped): www. must not defeat the match
    [{ referrer: "https://www.google.com/search" }, "search_organic"],
    [{ referrer: "https://www.google.com.br/" }, "search_organic"],
    [{ referrer: "https://www.bing.com/search" }, "search_organic"],
    [{ referrer: "https://duckduckgo.com/" }, "search_organic"],
    [{ referrer: "https://br.search.yahoo.com/search" }, "search_organic"],
    [{ referrer: "https://www.ecosia.org/search" }, "search_organic"],
    [{ referrer: "https://notgoogle.com/" }, "referral"],
    [{ referrer: "https://google.com.evil.example/" }, "referral"],
    // only the search host itself is organic; any other subdomain on the same
    // domain (mail, docs, drive, accounts, groups, translate, sites, images...)
    // is a referral, never credited as organic search.
    [{ referrer: "https://images.google.co.uk/imgres" }, "referral"],
    [{ referrer: "https://mail.google.com/mail/u/0/" }, "referral"],
    [{ referrer: "https://docs.google.com/document/d/x" }, "referral"],
    [{ referrer: "https://drive.google.com/drive/folders/x" }, "referral"],
    [{ referrer: "https://accounts.google.com/signin" }, "referral"],
    [{ referrer: "https://search.yahoo.com/search" }, "search_organic"],
    [{ referrer: "https://mail.yahoo.com/d/folders/1" }, "referral"],
    [{ referrer: "https://smartlic.tech/perguntas/indice-reajuste-contrato-publico" }, "referral"],
    // internal navigation is not acquisition
    [{ referrer: "https://confenge.com.br/ferramentas/checklist-reequilibrio/" }, "direct_or_unknown"],
    [{ referrer: "/ferramentas/checklist-reequilibrio/" }, "direct_or_unknown"],
    [{}, "direct_or_unknown"],
    // UTM present wins, including utm_medium=organic (a decision, not an accident)
    [{ utm_source: "google", utm_medium: "organic", referrer: "https://www.google.com/" }, "campaign"],
    [{ utm_medium: "organic" }, "campaign"],
    [{ utm_source: "newsletter", referrer: "https://smartlic.tech/" }, "campaign"],
    // a posted verdict is ignored
    [{ origin_class: "search_organic" }, "direct_or_unknown"],
    [{ origin_class: "campaign", referrer: "https://smartlic.tech/" }, "referral"],
    // a referrer the sanitizer drops (query-only PII, non-http) leaves no host
    [{ referrer: "mailto:ana@example.com" }, "direct_or_unknown"],
  ];
  for (const [attrs, expected] of cases) {
    const check = core.validateAndNormalize({ ...base, ...attrs });
    if (!check.ok) fail("origin_class_validate", { attrs, check });
    if (check.lead.origin_class !== expected) fail("origin_class_derived", { attrs, got: check.lead.origin_class, expected });
    if (attrs.referrer && check.lead.referrer && /\?|@/.test(check.lead.referrer)) fail("origin_class_referrer_unsanitized", check.lead.referrer);
  }
  pass("origin_class_derivation", { cases: cases.length });

  // The handler path: persisted lead keeps the class out of the public response.
  _reset();
  const res = await handler(event({
    ...base,
    referrer: "https://www.google.com/search",
    idempotency_key: "w7-origin-class-handler-001",
  }, "POST", { ip: "203.0.113.231" }));
  const data = JSON.parse(res.body);
  if (res.statusCode !== 201 || !data.ok) fail("origin_class_persist_201", data);
  if (Object.prototype.hasOwnProperty.call(data, "origin_class")) fail("origin_class_in_public_response", data);
  const stored = await mem.get(data.lead_id);
  if (!stored) fail("origin_class_not_stored", data.lead_id);
  if (stored.referrer !== "https://www.google.com/search") fail("origin_class_store_referrer", stored.referrer);
  // buildLeadRecord (lead-store.cjs) now persists origin_class in the durable row.
  if (stored.origin_class !== "search_organic") {
    fail("origin_class_store_value", stored.origin_class);
  }
  const forwardedOrigin = inbound.mapLeadToInboundV1(stored);
  if (forwardedOrigin.web_origin_class !== "search_organic" || Object.prototype.hasOwnProperty.call(forwardedOrigin, "origin_class")) {
    fail("origin_class_handoff_evidence_not_commercial_class", forwardedOrigin);
  }
  pass("origin_class_handler_no_leak", { stored_origin_class: stored.origin_class });
}

// BOFU-FECHAMENTO-20260919 (WS-A): orgao contratante no hub, estagio opcional
// da contratada, entrega derivada da rota nos pilares e envio nativo sem JS.
// Contraprovas: cada bloco reprovava no estado anterior (rawEnum descartava
// `planejamento_contratacao`; `contract_stage=""` virava lacuna; pilar sem
// deliverable_id chegava sem `entrega=`; POST urlencoded devolvia JSON cru).
{
  const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const inbound = require(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"));
  const hub = {
    nome: "QA Orgao Contratante",
    email: "qa-orgao@example.com",
    consentimento: "1",
    origem: "servicos-obras-publicas",
    estagio: "contract-defense-products",
    jornada: "contrato",
    asset_id: "contract-defense-products",
    route_family: "servicos-obras-publicas",
    cta_id: "contract-defense-products-handraise",
    landing_page: "https://confenge.com.br/servicos-obras-publicas/",
    record_kind: "qa",
    test_mode: true,
  };
  // (a) Orgao: evento estruturado + campos preparatorios opcionais, sem
  // contrato e sem estagio de evento -> recebido sem lacuna, lado no handoff.
  const orgao = await handler(event({
    ...hub,
    contract_event: "planejamento_contratacao",
    procurement_object: "Reforma de escola municipal",
    procurement_stage: "dfd_etp",
    procurement_regulation: "Lei 14.133",
    funding_source: "transferencia_uniao",
    idempotency_key: "wsa-orgao-planejamento-001",
  }, "POST", { ip: "203.0.113.240" }));
  const orgaoData = JSON.parse(orgao.body);
  const orgaoStored = orgaoData.lead_id ? await mem.get(orgaoData.lead_id) : null;
  if (orgao.statusCode !== 201 || !orgaoStored) fail("wsa_orgao_planejamento_received", { status: orgao.statusCode, orgaoData });
  if (orgaoStored.contract_event !== "planejamento_contratacao" || orgaoStored.contract_stage !== null
      || orgaoStored.qualification_gaps || orgaoStored.qualification_state
      || orgaoStored.jornada !== "contrato" || orgaoStored.estagio !== "planejamento-contratacao-publica"
      || orgaoStored.procurement_stage !== "dfd_etp" || orgaoStored.procurement_regulation !== "Lei 14.133"
      || orgaoStored.procurement_object !== "Reforma de escola municipal" || orgaoStored.funding_source !== "transferencia_uniao") {
    fail("wsa_orgao_planejamento_persisted", orgaoStored);
  }
  const orgaoMessage = inbound.mapLeadToInboundV1(orgaoStored).message || "";
  for (const needle of ["lado=orgao_contratante", "estágio da contratação=dfd_etp", "evento contratual=planejamento_contratacao",
    "situação declarada=planejamento-contratacao-publica", "objeto=Reforma de escola municipal", "regulamento=Lei 14.133", "origem do recurso=transferencia_uniao"]) {
    if (!orgaoMessage.includes(needle)) fail("wsa_orgao_handoff_context", { needle, orgaoMessage });
  }
  if (Object.keys(orgaoData).some((key) => /procurement|funding|contract_event/.test(key))) fail("wsa_orgao_public_response_whitelist", orgaoData);
  pass("wsa_orgao_planejamento_sem_lacuna", { lead_id: orgaoData.lead_id });

  // (b) Enum fechado: texto livre em procurement_stage/funding_source vira null;
  // objeto/regulamento nao carregam e-mail nem digitos em serie (sem PII).
  const closed = core.validateAndNormalize({
    ...hub,
    contract_event: "planejamento_contratacao",
    procurement_stage: "texto livre",
    funding_source: "outro texto",
    procurement_object: "objeto com qa@example.com",
    procurement_regulation: "regulamento 48988344559",
  });
  if (!closed.ok || closed.lead.procurement_stage !== null || closed.lead.funding_source !== null
      || closed.lead.procurement_object !== null || closed.lead.procurement_regulation !== null || closed.lead.qualification_gaps) {
    fail("wsa_procurement_enum_closed", closed.lead);
  }
  pass("wsa_procurement_enum_closed");

  // (c) FAMILIAS-PUBLICAS-04: estagio vazio + evento valido = UNKNOWN, sem lacuna.
  const emptyStage = core.validateAndNormalize({
    ...hub, deliverable_id: "CFG-D20", contract_event: "atraso_prorrogacao", contract_stage: "",
  });
  if (!emptyStage.ok || emptyStage.lead.contract_stage !== "UNKNOWN" || emptyStage.lead.qualification_gaps || emptyStage.lead.qualification_state) {
    fail("wsa_contract_stage_empty_is_unknown", emptyStage.lead);
  }
  // O estagio informado continua valendo; texto livre continua lacuna.
  const informed = core.validateAndNormalize({ ...hub, contract_event: "reajuste", contract_stage: "quantificando" });
  const invalid = core.validateAndNormalize({ ...hub, contract_event: "reajuste", contract_stage: "estagio_livre" });
  if (informed.lead.contract_stage !== "quantificando" || !invalid.lead.qualification_gaps?.includes("contract_qualification_invalid")) {
    fail("wsa_contract_stage_informed_or_invalid", { informed: informed.lead.contract_stage, invalid: invalid.lead.qualification_gaps });
  }
  pass("wsa_contract_stage_empty_is_unknown");

  // (d) FAMILIAS-PUBLICAS-05: pilar congelado sem deliverable_id oculto ->
  // entrega derivada da rota para o registro e o handoff, SEM abrir a
  // qualificacao de produto (nenhuma lacuna num pilar sem campos de evento).
  const pillar = core.validateAndNormalize({
    nome: "QA Pilar", email: "qa-pilar@example.com", consentimento: "1", jornada: "contrato",
    estagio: "medicoes-glosas-obras-publicas", route_family: "medicoes-glosas",
    asset_id: "medicoes-glosas-obras-publicas", origem: "medicoes-glosas-obras-publicas",
    landing_page: "https://confenge.com.br/medicoes-glosas-obras-publicas/",
  });
  if (!pillar.ok || pillar.lead.deliverable_id !== "CFG-D18" || pillar.lead.qualification_gaps || pillar.lead.qualification_state) {
    fail("wsa_pillar_deliverable_derived_without_gap", pillar.lead);
  }
  if (!(inbound.mapLeadToInboundV1({ ...pillar.lead, lead_id: "lead-qa-pilar" }).message || "").includes("entrega=CFG-D18")) {
    fail("wsa_pillar_handoff_entrega", inbound.mapLeadToInboundV1({ ...pillar.lead, lead_id: "lead-qa-pilar" }).message);
  }
  for (const [slug, expected] of [
    ["aditivos-obras-publicas", "CFG-D19"], ["reequilibrio-obras-publicas", "CFG-D22"],
    ["auditoria-orcamento-licitacao", "CFG-D14"], ["diagnostico-pre-licitacao", "CFG-D12"],
    ["diagnostico-b2g-360", "CFG-D24"], ["acompanhamento-contratos-obras", "CFG-D25"], ["bid-room-licitacoes-obras", "CFG-D16"],
  ]) {
    const check = core.validateAndNormalize({
      nome: "QA Pilar", email: "qa-pilar@example.com", consentimento: "1", jornada: "contrato",
      estagio: slug, route_family: slug, asset_id: slug, origem: slug,
    });
    if (!check.ok || check.lead.deliverable_id !== expected || check.lead.qualification_gaps) {
      fail("wsa_pillar_deliverable_derived_each", { slug, expected, lead: check.lead });
    }
  }
  // Valor postado prevalece; rotas sem entrega no registro nao derivam nada.
  const explicit = core.validateAndNormalize({ ...hub, deliverable_id: "CFG-D21", contract_event: "reajuste", contract_stage: "identificado", estagio: "medicoes-glosas-obras-publicas" });
  const none = core.validateAndNormalize({ ...hub, contract_event: "reajuste", contract_stage: "identificado" });
  const homeLead = core.validateAndNormalize({ nome: "QA", email: "qa@example.com", consentimento: "1", estagio: "contrato em execução", jornada: "contrato", route_family: "home" });
  if (explicit.lead.deliverable_id !== "CFG-D21" || none.lead.deliverable_id !== null || homeLead.lead.deliverable_id !== null) {
    fail("wsa_pillar_deliverable_precedence", { explicit: explicit.lead.deliverable_id, none: none.lead.deliverable_id, home: homeLead.lead.deliverable_id });
  }
  // Rodada de correcao: `landing_page`/`landing_url` sao atribuicao de
  // primeiro toque (nav.js forca o hidden a partir da sessao); a entrega vem
  // SO da identidade pre-renderizada do formulario. Antes, o pilar de
  // aditivos com sessao iniciada em medicoes chegava como CFG-D18, a home
  // 'nao sei' chegava com CFG-D22 e o hub 'ainda nao sei qual entrega' com
  // evento reajuste chegava com CFG-D18 contradizendo o visitante.
  const crossPillar = core.validateAndNormalize({
    nome: "QA Pilar", email: "qa-pilar@example.com", consentimento: "1", jornada: "contrato",
    estagio: "aditivos-obras-publicas", route_family: "aditivos", asset_id: "aditivos-obras-publicas", origem: "aditivos-obras-publicas",
    landing_page: "/medicoes-glosas-obras-publicas/", landing_url: "https://confenge.com.br/medicoes-glosas-obras-publicas/",
  });
  const homeFromPillar = core.validateAndNormalize({
    nome: "QA", email: "qa@example.com", consentimento: "1", estagio: "ainda não sei qual serviço", route_family: "home",
    landing_page: "/reequilibrio-obras-publicas/", landing_url: "https://confenge.com.br/reequilibrio-obras-publicas/",
  });
  const hubUnsure = core.validateAndNormalize({
    ...hub, contract_event: "reajuste", contract_stage: "identificado",
    landing_page: "/medicoes-glosas-obras-publicas/", landing_url: "https://confenge.com.br/medicoes-glosas-obras-publicas/",
  });
  const hubUnsureMessage = inbound.mapLeadToInboundV1({ ...hubUnsure.lead, lead_id: "lead-qa-hub" }).message || "";
  if (crossPillar.lead.deliverable_id !== "CFG-D19" || homeFromPillar.lead.deliverable_id !== null
      || hubUnsure.lead.deliverable_id !== null || /entrega=/.test(hubUnsureMessage)) {
    fail("wsa_deliverable_never_from_landing_page", {
      crossPillar: crossPillar.lead.deliverable_id, home: homeFromPillar.lead.deliverable_id, hub: hubUnsure.lead.deliverable_id, hubUnsureMessage,
    });
  }
  pass("wsa_pillar_deliverable_derived_from_route", { routes: 8, landing_page_ignored: 3 });

  // (d2) Estagio pegajoso do CTA do orgao: hidden `planejamento-contratacao-
  // publica` + evento da contratada -> recai na identidade do formulario
  // (asset_id), sem 'situacao declarada' do orgao no handoff; sem asset_id,
  // recai no padrao de quem ainda nao sabe e e marcado NEEDS_CONTEXT. Evento
  // ausente ou invalido nao rebaixa o que o visitante declarou.
  const sticky = core.validateAndNormalize({ ...hub, estagio: "planejamento-contratacao-publica", contract_event: "reajuste", contract_stage: "identificado" });
  const stickyMessage = inbound.mapLeadToInboundV1({ ...sticky.lead, lead_id: "lead-qa-sticky" }).message || "";
  const stickyNoAsset = core.validateAndNormalize({ ...hub, asset_id: "", estagio: "planejamento-contratacao-publica", contract_event: "reajuste", contract_stage: "identificado" });
  const stickyNoEvent = core.validateAndNormalize({ ...hub, estagio: "planejamento-contratacao-publica" });
  if (!sticky.ok || sticky.lead.estagio !== "contract-defense-products" || sticky.lead.jornada !== "contrato"
      || sticky.lead.qualification_gaps || /situação declarada=|lado=/.test(stickyMessage)
      || stickyNoAsset.lead.estagio !== core.ESTAGIO_UNKNOWN_SERVICE || stickyNoAsset.lead.qualification_state !== "NEEDS_CONTEXT"
      || stickyNoEvent.lead.estagio !== "planejamento-contratacao-publica") {
    fail("wsa_sticky_planning_estagio_demoted", {
      sticky: sticky.lead.estagio, jornada: sticky.lead.jornada, stickyMessage,
      noAsset: [stickyNoAsset.lead.estagio, stickyNoAsset.lead.qualification_state], noEvent: stickyNoEvent.lead.estagio,
    });
  }
  pass("wsa_sticky_planning_estagio_demoted");

  // (d3) Orgao com o <select contract_stage> no padrao UNKNOWN: nao ha
  // contrato, entao o registro e o handoff nao carregam 'estagio contratual'.
  const planningUnknown = core.validateAndNormalize({ ...hub, contract_event: "planejamento_contratacao", contract_stage: "UNKNOWN" });
  const planningUnknownMessage = inbound.mapLeadToInboundV1({ ...planningUnknown.lead, lead_id: "lead-qa-orgao" }).message || "";
  const planningInformed = core.validateAndNormalize({ ...hub, contract_event: "planejamento_contratacao", contract_stage: "identificado" });
  if (!planningUnknown.ok || planningUnknown.lead.contract_stage !== null || planningUnknown.lead.qualification_gaps
      || /estágio contratual=/.test(planningUnknownMessage) || !planningUnknownMessage.includes("lado=orgao_contratante")
      || planningInformed.lead.contract_stage !== "identificado") {
    fail("wsa_planning_contract_stage_unknown_is_null", { stage: planningUnknown.lead.contract_stage, planningUnknownMessage, informed: planningInformed.lead.contract_stage });
  }
  pass("wsa_planning_contract_stage_unknown_is_null");

  // (e) CONTEXTO-CAPTURA-02: POST nativo (urlencoded, Accept text/html, sem
  // token) recebe 4xx text/html com os canais; nada e persistido; o cliente
  // JS (JSON) continua recebendo o JSON de validacao de antes.
  const before = mem.map.size;
  const native = await handler({
    httpMethod: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-lead-test/1.0",
      "x-forwarded-for": "203.0.113.241",
    },
    body: "nome=QA+Nativo&email=qa-nativo%40example.com&consentimento=1&estagio=contrato+em+execu%C3%A7%C3%A3o&jornada=contrato",
  });
  const nativeType = String(native.headers["Content-Type"] || native.headers["content-type"] || "");
  if (native.statusCode < 400 || native.statusCode >= 500 || !nativeType.startsWith("text/html")
      || !native.body.includes("wa.me/") || !native.body.includes("mailto:") || /qa-nativo|QA Nativo/.test(native.body)
      || mem.map.size !== before) {
    fail("wsa_native_form_post_html_fallback", { status: native.statusCode, nativeType, size: [before, mem.map.size], body: native.body.slice(0, 200) });
  }
  const acceptHtmlJson = await handler(event({ nome: "Q" }, "POST", { accept: "text/html" }));
  const jsonClient = await handler(event({ nome: "Q" }, "POST", { ip: "203.0.113.242" }));
  const jsonType = String(jsonClient.headers["Content-Type"] || "");
  if (jsonClient.statusCode !== 400 || !jsonType.startsWith("application/json") || JSON.parse(jsonClient.body).error !== "validation") {
    fail("wsa_json_client_unchanged", { status: jsonClient.statusCode, jsonType, body: jsonClient.body });
  }
  // JSON body pedindo text/html sem token tambem e tratado como envio nativo.
  if (!String(acceptHtmlJson.headers["Content-Type"] || "").startsWith("text/html")) {
    fail("wsa_accept_html_without_token_is_native", acceptHtmlJson.headers);
  }
  // Com token do Turnstile (cliente JS), urlencoded continua no caminho JSON.
  const withToken = await handler({
    httpMethod: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://confenge.com.br", "user-agent": "t", "x-forwarded-for": "203.0.113.243" },
    body: "nome=Q&turnstile_token=tok",
  });
  if (!String(withToken.headers["Content-Type"] || "").startsWith("application/json")) fail("wsa_urlencoded_with_token_stays_json", withToken.headers);
  pass("wsa_native_form_post_html_fallback", { status: native.statusCode });
}

console.log("LEAD_FUNCTION_OK", JSON.stringify({ tests: results.length, storeDir }));
// cleanup store dir
try {
  fs.rmSync(storeDir, { recursive: true, force: true });
} catch {
  /* ignore */
}
