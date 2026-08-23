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
  pass("collect_scrub");
}

console.log("LEAD_FUNCTION_OK", JSON.stringify({ tests: results.length, storeDir }));
// cleanup store dir
try {
  fs.rmSync(storeDir, { recursive: true, force: true });
} catch {
  /* ignore */
}
