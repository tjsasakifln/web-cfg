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
    if (bodyStr.includes("SECRET_MESSAGE") || bodyStr.includes("ntfy") || bodyStr.includes("topic") || bodyStr.includes("test-secret") || bodyStr.includes("example.com")) {
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
  for (const invalid of [
    { opportunity_deadline: "2026-99-99" },
    { contract_value_band: "valor_livre" },
    { lot_count: "0" },
    { execution_regime: "regime_livre" },
    { decision_intent: "decisao_livre" },
    { public_contract_id: "" },
  ]) {
    const before = mem.map.size;
    const res = await handler(event({ ...base, ...invalid }, "POST", { ip: "192.0.2.92" }));
    const data = JSON.parse(res.body);
    if (res.statusCode !== 422 || data.error !== "licitacao_qualification_invalid" || mem.map.size !== before) {
      fail("licitacao_qualification_fail_closed", { invalid, status: res.statusCode, data });
    }
  }

  for (const [index, deliverableId] of ["CFG-D12", "CFG-D13", "CFG-D14", "CFG-D15", "CFG-D16"].entries()) {
    const unsafeDeadline = await handler(event({
      ...base,
      deliverable_id: deliverableId,
      opportunity_deadline: new Date().toISOString().slice(0, 10),
    }, "POST", { ip: `192.0.2.${94 + index}` }));
    if (
      unsafeDeadline.statusCode !== 422 ||
      JSON.parse(unsafeDeadline.body).error !== "licitacao_qualification_invalid"
    ) {
      fail("licitacao_safe_deadline_fail_closed", { deliverableId, response: unsafeDeadline });
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
  for (const invalid of [
    { cnpj: "123" },
    { cnpj: "11111111111111" },
    { analysis_cutoff: "2026-99-99" },
    { opportunity_deadline: analysisCutoff },
    { decision_intent: "decisao_livre" },
  ]) {
    const before = mem.map.size;
    const res = await handler(event({ ...invalidBase, ...invalid }, "POST", { ip: "203.0.113.99" }));
    const data = JSON.parse(res.body);
    if (res.statusCode !== 422 || data.error !== "expansion_qualification_invalid" || mem.map.size !== before) {
      fail("priced_model_qualification_fail_closed", { invalid, status: res.statusCode, data });
    }
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
  for (const invalid of [
    { public_contract_id: "" },
    { contract_event: "evento_livre" },
    { opportunity_deadline: "2026-99-99" },
    { contract_stage: "estagio_livre" },
  ]) {
    const before = mem.map.size;
    const res = await handler(event({ ...base, deliverable_id: "CFG-D18", ...invalid }, "POST", { ip: "203.0.113.98" }));
    const data = JSON.parse(res.body);
    if (res.statusCode !== 422 || data.error !== "contract_qualification_invalid" || mem.map.size !== before) {
      fail("contract_product_qualification_fail_closed", { invalid, status: res.statusCode, data });
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

// 6a) Attribution cannot become a side-channel for PII in receipts/logs/analytics.
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
    if (String(url).includes("resend.com")) {
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

// 7b) synthetic / non-real kinds must not call Resend even when the key is set
{
  process.env.RESEND_API_KEY = "re_test_key_must_not_send";
  process.env.LEAD_NOTIFY_EMAIL = "tiago.sasaki@confenge.com.br";
  const originalFetch = globalThis.fetch;
  const resendCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("resend.com")) {
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

console.log("LEAD_FUNCTION_OK", JSON.stringify({ tests: results.length, storeDir }));
// cleanup store dir
try {
  fs.rmSync(storeDir, { recursive: true, force: true });
} catch {
  /* ignore */
}
