/**
 * POS-INB-20260911/01 — local capture against the shipped lead handler.
 * Isolated FileStore, outbound env unset. Does not mock the handler.
 */
import fs from "fs";
import path from "path";
import {
  ROOT,
  isolateEnv,
  makeStoreDir,
  loadLeadHandler,
  loadFileStore,
  event,
  pass,
  fail,
  privatePayload,
  tmpCleanup,
  getResults,
} from "./helpers.mjs";

const storeDir = makeStoreDir("capture");
isolateEnv(storeDir);
const { handler, setStoreForTests } = loadLeadHandler();
const FileStore = loadFileStore();
const store = new FileStore(storeDir);
setStoreForTests(null);

async function durableStore() {
  return new FileStore(process.env.LEAD_STORE_DIR);
}

{
  const formSrc = fs.readFileSync(path.join(ROOT, "js/modules/form.js"), "utf8");
  if (!formSrc.includes("fetch('/api/web/lead'")) fail("form_post_target");
  if (formSrc.includes("fetch('/.netlify/functions/lead'")) fail("form_preference_swap");
  if (!formSrc.includes("event.preventDefault()")) fail("form_ajax_preventdefault");
  if (/track\('lead_persisted'[\s\S]{0,240}wa\.me/.test(formSrc)) {
    fail("whatsapp_emits_lead_persisted");
  }
  const authority = JSON.parse(
    fs.readFileSync(path.join(ROOT, "netlify/functions/data/adaptive-intake-authority.json"), "utf8"),
  );
  if (authority.status !== "WITHHELD") fail("adaptive_not_withheld", authority.status);
  const functions = fs.readFileSync(path.join(ROOT, "runtime/lib/functions.mjs"), "utf8");
  if (!functions.includes('"/.netlify/functions/" + name') || !functions.includes('"/api/web/" + name')) {
    fail("runtime_alias_missing");
  }
  pass("form_runtime_alias_and_withheld");
}

{
  const res = await handler(event(privatePayload({
    idempotency_key: "pos-inb-01-private-001",
  }), "POST", { ip: "203.0.113.11" }));
  const body = JSON.parse(res.body);
  const durable = await durableStore();
  const stored = body.lead_id ? await durable.get(body.lead_id) : null;
  if (res.statusCode !== 201 || !body.ok || !body.lead_id) fail("private_persist", body);
  if (body.receipt_id !== body.lead_id) fail("receipt_mismatch", body);
  if (!stored) fail("private_not_durable");
  if (stored.nome !== "Ana Privada") fail("private_nome");
  if (!stored.telefone) fail("private_channel");
  if (stored.estagio !== "projeto, revisão ou compatibilização") fail("private_need");
  if (stored.cnpj || stored.public_contract_id) fail("private_invented_b2g", { cnpj: stored.cnpj });
  if (stored.paid_priority || stored.qualified || stored.authorized) fail("privilege_copied");
  if (body.handoff || body.handoff_status === "DELIVERED") fail("public_handoff_claimed", body);
  if (stored.source !== "CONFENGE_WEB") fail("source");
  pass("private_pf_without_cnpj", { lead_id: body.lead_id });
}

{
  const res = await handler(event({
    nome: "Ana Privada",
    email: "ana.privada@construtora-norte.com.br",
    estagio: "perícia, assistência técnica ou avaliação",
    jornada: "pericia",
    consentimento: "on",
    origem: "/ferramentas/checklist-reequilibrio/",
    landing_url: "/ferramentas/checklist-reequilibrio/",
    analytics_consent: false,
    cookie_consent: "denied",
    idempotency_key: "pos-inb-01-need-changed-001",
  }, "POST", { ip: "203.0.113.12" }));
  const body = JSON.parse(res.body);
  const stored = body.lead_id ? await (await durableStore()).get(body.lead_id) : null;
  if (res.statusCode !== 201 || !stored) fail("changed_need_persist", body);
  if (stored.estagio !== "perícia, assistência técnica ou avaliação") fail("need_not_current", stored.estagio);
  if (stored.origem !== "/ferramentas/checklist-reequilibrio/") fail("origin_overwritten", stored.origem);
  if (stored.landing_url !== "/ferramentas/checklist-reequilibrio/") fail("landing_overwritten", stored.landing_url);
  pass("need_changed_origin_frozen");
}

{
  const denied = await handler(event({
    nome: "Ana Privada",
    email: "ana.privada@construtora-norte.com.br",
    estagio: "projeto, revisão ou compatibilização",
    analytics_consent: true,
    marketing_consent: true,
    cookie_consent: "granted",
  }, "POST", { ip: "203.0.113.13" }));
  const deniedBody = JSON.parse(denied.body);
  if (denied.statusCode !== 400 || deniedBody.error !== "consent") {
    fail("analytics_replaced_request_consent", deniedBody);
  }
  const ok = await handler(event(privatePayload({
    email: "ana.privada@construtora-norte.com.br",
    telefone: "",
    analytics_consent: false,
    marketing_consent: false,
    cookie_consent: "denied",
    idempotency_key: "pos-inb-01-consent-split-001",
  }), "POST", { ip: "203.0.113.14" }));
  const okBody = JSON.parse(ok.body);
  if (ok.statusCode !== 201 || !okBody.lead_id) fail("cookie_reject_blocked_post", okBody);
  pass("request_consent_independent_of_analytics");
}

{
  const before = (await (await durableStore()).list()).length;
  const res = await handler(event(privatePayload({
    nome: "Carla Mendes",
    email: "carla.mendes@construtora-norte.com.br",
    telefone: "",
    record_kind: "synthetic",
    test_mode: true,
    synthetic: true,
    paid_priority: true,
    qualified: true,
    qualification_state: "qualified_lead",
    commercial_authorization: "VIP",
    approved: "yes",
    authorized: true,
    idempotency_key: "pos-inb-01-browser-claims-001",
  }), "POST", { ip: "203.0.113.15" }));
  const body = JSON.parse(res.body);
  const stored = body.lead_id ? await (await durableStore()).get(body.lead_id) : null;
  if (res.statusCode !== 201 || !stored) fail("browser_claim_dropped_lead", body);
  if (stored.record_kind !== "real") fail("browser_self_declared_synthetic", stored.record_kind);
  if (stored.synthetic_probe_authenticated === true) fail("browser_earned_probe");
  if (stored.paid_priority || stored.qualified || stored.authorized || stored.commercial_authorization) {
    fail("privilege_persisted", stored);
  }
  if (stored.next_action === "exclude_from_commercial") fail("real_lead_excluded_by_browser_claim");
  if ((await (await durableStore()).list()).length !== before + 1) fail("browser_claim_duplicate");
  pass("browser_claims_do_not_bypass", { record_kind: stored.record_kind });
}

{
  const res = await handler(event(privatePayload({
    origem: "javascript:alert(1)",
    landing_url: "https://evil.example/path?email=leak@x.com#token",
    landing_page: "/ok-path/?phone=48999999999",
    utm_source: "<script>alert(1)</script>",
    utm_campaign: "onclick=steal",
    cta_id: "home-form",
    route_family: "projeto",
    arbitrary_debug: "drop-me",
    fbclid: "abc.123",
    email_extra: "should-not-copy@x.com",
    idempotency_key: "pos-inb-01-malicious-001",
  }), "POST", { ip: "203.0.113.16" }));
  const body = JSON.parse(res.body);
  const stored = body.lead_id ? await (await durableStore()).get(body.lead_id) : null;
  if (res.statusCode !== 201 || !stored) fail("malicious_persist", body);
  if (stored.origem) fail("javascript_origem_kept", stored.origem);
  if (stored.landing_url && /email=|token/.test(stored.landing_url)) fail("query_copied_to_landing", stored.landing_url);
  if (stored.utm_source) fail("script_utm_kept", stored.utm_source);
  if (stored.arbitrary_debug || stored.fbclid || stored.email_extra) fail("unlisted_copied");
  if (JSON.stringify(body).includes("leak@") || JSON.stringify(body).includes("48999999999")) {
    fail("pii_in_public_body", body);
  }
  pass("malicious_params_dropped");
}

{
  const missing = path.join(storeDir, "missing-root-does-not-exist");
  const prev = process.env.LEAD_STORE_DIR;
  process.env.LEAD_STORE_DIR = missing;
  const isolated = loadLeadHandler();
  isolated.setStoreForTests(null);
  const res = await isolated.handler(event(privatePayload({
    idempotency_key: "pos-inb-01-store-missing-001",
  }), "POST", { ip: "203.0.113.17" }));
  const body = JSON.parse(res.body);
  if (res.statusCode !== 503 || body.ok !== false) fail("missing_store_status", body);
  if (body.lead_id || body.receipt_id) fail("missing_store_protocol", body);
  process.env.LEAD_STORE_DIR = prev;
  pass("store_unavailable_has_no_protocol");
}

{
  const failing = {
    ephemeral: false,
    async getByIdempotency() { return null; },
    async get() { return null; },
    async put() { throw new Error("disk_full"); },
    async update() { return null; },
    async list() { return []; },
  };
  const { handler: h2, setStoreForTests: set2 } = loadLeadHandler();
  set2(failing);
  const res = await h2(event(privatePayload({
    idempotency_key: "pos-inb-01-persist-fail-001",
  }), "POST", { ip: "203.0.113.18" }));
  const body = JSON.parse(res.body);
  if (res.statusCode !== 503 || body.ok !== false) fail("persist_fail_status", body);
  if (body.lead_id || body.receipt_id || body.ok === true) fail("persist_fail_protocol", body);
  if (body.status === "persisted") fail("persist_fail_status_field", body);
  pass("persist_failure_has_no_protocol");
}

{
  setStoreForTests(null);
  const adaptive = await handler(event({
    nome: "Ana Privada",
    email: "ana.privada@construtora-norte.com.br",
    estagio: "projeto, revisão ou compatibilização",
    consentimento: "on",
    need_code: "licitacao_obra_ou_contrato_publico",
    "form-name": "triagem-tecnica",
    idempotency_key: "pos-inb-01-adaptive-001",
  }, "POST", { ip: "203.0.113.19" }));
  const body = JSON.parse(adaptive.body);
  if (adaptive.statusCode === 201 && body.ok === true) fail("adaptive_activated", body);
  if (![422, 503, 400].includes(adaptive.statusCode)) fail("adaptive_unexpected", { status: adaptive.statusCode, body });
  if (body.lead_id || body.receipt_id) fail("adaptive_protocol", body);
  pass("adaptive_intake_stays_withheld", { status: adaptive.statusCode, error: body.error });
}

{
  const key = "pos-inb-01-concurrent-001";
  const payload = privatePayload({
    email: "ana.concorrencia@construtora-norte.com.br",
    telefone: "",
    idempotency_key: key,
  });
  const headers = { ip: "203.0.113.20", "Idempotency-Key": key };
  const conc = await Promise.all([
    handler(event(payload, "POST", headers)),
    handler(event(payload, "POST", headers)),
    handler(event(payload, "POST", headers)),
  ]);
  const bodies = conc.map((r) => JSON.parse(r.body));
  const ids = [...new Set(bodies.map((b) => b.lead_id).filter(Boolean))];
  const durable = await durableStore();
  if (ids.length !== 1) fail("concurrent_ids", bodies.map((b) => ({ s: b.ok, id: b.lead_id })));
  const stored = await durable.get(ids[0]);
  if (!stored) fail("concurrent_not_durable", ids[0]);
  const rows = (await durable.list()).filter((r) => r.lead_id === ids[0]);
  if (rows.length !== 1) fail("concurrent_rows", rows.length);
  const replay = await handler(event(payload, "POST", headers));
  const replayBody = JSON.parse(replay.body);
  if (replay.statusCode !== 200 || replayBody.idempotent !== true || replayBody.lead_id !== ids[0]) {
    fail("replay", replayBody);
  }
  if ((await durable.list()).filter((r) => r.lead_id === ids[0]).length !== 1) {
    fail("replay_duplicate");
  }
  pass("replay_and_concurrency_one_record", { lead_id: ids[0] });
}

{
  const listed = await (await durableStore()).list();
  const waClicks = listed.filter((r) => r.cta_id === "home-situation-whatsapp" && !r.idempotency_key);
  if (waClicks.length) fail("whatsapp_click_became_row");
  pass("whatsapp_click_without_post_is_not_a_lead");
}

console.log("POS_INB_01_LOCAL_CAPTURE_OK", JSON.stringify({ tests: getResults().length, storeDir: "isolated" }));
tmpCleanup(storeDir);
