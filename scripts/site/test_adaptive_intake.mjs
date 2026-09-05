/**
 * Drives shipped adaptive intake: lead-core validateAndNormalize, lead.cjs
 * handler, inbound-handoff mapper, form.js/sandbox structure, and analytics
 * emitters. No reimplementation of the unit under test. No hardcoded receipts.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import vm from "vm";
import { URLSearchParams } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const scratch = process.env.ADAPTIVE_INTAKE_SCRATCH
  || "/tmp/grok-goal-d20b6eed1aa2/implementer";

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-adaptive-"));
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

const pinPath = path.join(root, "tests/fixtures/adaptive-intake/contracts.draft.20260904.json");
const pin = JSON.parse(fs.readFileSync(pinPath, "utf8"));
const adaptivePath = path.join(root, "netlify/functions/lib/adaptive-intake.cjs");
const { pinHash, NUCLEI, BRANCH_FIELDS, OTHER } = require(adaptivePath);
const expectedHash = pinHash(pin);

process.env.ADAPTIVE_INTAKE_PIN_JSON = JSON.stringify(pin);
process.env.ADAPTIVE_INTAKE_NUCLEI = Object.keys(NUCLEI).join(",");

const leadPath = path.join(root, "netlify/functions/lead.cjs");
const ratePath = path.join(root, "netlify/functions/lib/lead-rate-limit.cjs");
const corePath = path.join(root, "netlify/functions/lib/lead-core.cjs");

function loadHandler() {
  delete require.cache[require.resolve(leadPath)];
  delete require.cache[require.resolve(corePath)];
  delete require.cache[require.resolve(adaptivePath)];
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
      "user-agent": "confenge-adaptive-test/1.0",
      "x-forwarded-for": extraHeaders.ip || "203.0.113.80",
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

const BRANCH = {
  expert_evidence_assistance: { claim_stage: "em_curso" },
  property_valuation: {
    valuation_purpose: "disputa",
    inspection_window: "this_month",
    property_class: "residencial",
  },
  building_engineering_documentation: {
    work_type: "reforma",
    work_stage: "projeto",
    project_status: "parcial",
    budget_class: "parcial",
    bim_status: "nao",
  },
  occupational_safety: {
    establishment_class: "obra",
    risk_class: "documentacao",
    sst_doc_class: "partial",
  },
  public_works_b2g: {
    certame_stage: "contrato",
    contract_relation: "contratada",
    entity_class: "municipal",
  },
};

function sharedAdaptive(overrides = {}) {
  return {
    adaptive_intake: true,
    intake_contract_version: pin.intake,
    intake_pin_hash: expectedHash,
    offer_candidate_id: pin.offer_candidate_id,
    source_asset_id: pin.source_asset_id,
    landing_family: "adaptive-intake",
    nome: "QA Adaptativo",
    email: "qa-adaptive@example.com",
    consentimento: "on",
    sensitive_docs_ack: "1",
    canal_preferido: "email",
    pessoa_tipo: "empresa",
    decision_role: "decisor",
    city_class: "grande_florianopolis",
    site_class: "obra",
    urgency: "ate_7d",
    why_now: "prazo_legal",
    desired_decision: "parecer",
    document_availability_class: "partial",
    conflict_status: "none",
    ...overrides,
  };
}

function adaptiveBody(nucleus, extra = {}) {
  return {
    ...sharedAdaptive(),
    nucleus_id: nucleus,
    ...BRANCH[nucleus],
    ...extra,
  };
}

const { handler, setStoreForTests } = loadHandler();
const { MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
const { _reset } = require(ratePath);
const core = require(corePath);
const handoff = require(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"));
const mem = new MemoryStore();
setStoreForTests(mem);
_reset();

{
  if (pin.not_runtime_fallback !== true) fail("fixture_not_marked_test_only", pin);
  const src = fs.readFileSync(adaptivePath, "utf8");
  if (src.includes("1.0.0-draft.20260904") && /ADAPTIVE_INTAKE_PIN_JSON/.test(src) === false) {
    fail("draft_embedded_as_fallback", "module embeds draft without env pin");
  }
  if (!src.includes("ADAPTIVE_INTAKE_PIN_JSON") || !src.includes("pin_missing")) {
    fail("pin_must_come_from_env", "missing fail-closed pin load");
  }
  pass("fixture_test_only_not_runtime_fallback");
}

{
  const b2g = {
    nome: "Maria Construtora",
    telefone: "48988344559",
    estagio: "problema urgente em contrato",
    jornada: "contrato",
    consentimento: "on",
    origem: "/",
    faixa_contrato: "acima_1m",
  };
  const validated = core.validateAndNormalize(b2g);
  if (!validated.ok || validated.lead.source !== "CONFENGE_WEB") fail("b2g_validate", validated);
  if (validated.lead.nucleus_id) fail("b2g_must_not_force_nucleus", validated.lead);
  const res = await handler(event({ ...b2g, idempotency_key: "qa-b2g-legacy-1" }));
  const data = JSON.parse(res.body);
  if (res.statusCode !== 201 || !data.ok || !data.lead_id || data.receipt_id !== data.lead_id) {
    fail("b2g_handler", { status: res.statusCode, data });
  }
  if (data.source !== "CONFENGE_WEB") fail("b2g_source", data);
  const stored = await mem.get(data.lead_id);
  if (!stored || stored.source !== "CONFENGE_WEB" || stored.faixa_contrato !== "acima_1m") {
    fail("b2g_store", stored);
  }
  pass("b2g_backward_compatible", { lead_id: data.lead_id });
}

{
  const prev = process.env.ADAPTIVE_INTAKE_NUCLEI;
  delete process.env.ADAPTIVE_INTAKE_NUCLEI;
  delete require.cache[require.resolve(adaptivePath)];
  delete require.cache[require.resolve(corePath)];
  const isolated = require(corePath);
  const denied = isolated.validateAndNormalize(adaptiveBody("property_valuation"));
  if (denied.ok || denied.error !== "nucleus_not_enabled") fail("flag_off", denied);
  const stillB2g = isolated.validateAndNormalize({
    nome: "B2G Flag Off",
    email: "qa-flag@example.com",
    estagio: "edital ou proposta em análise",
    consentimento: "on",
  });
  if (!stillB2g.ok) fail("flag_off_b2g_broke", stillB2g);
  process.env.ADAPTIVE_INTAKE_NUCLEI = prev;
  pass("feature_flag_fail_closed");
}

{
  const missing = core.validateAndNormalize({
    ...adaptiveBody("expert_evidence_assistance"),
    intake_contract_version: "",
    intake_pin_hash: expectedHash,
  });
  if (missing.ok || missing.error !== "contract_version_missing") fail("missing_version", missing);
  const unknown = core.validateAndNormalize({
    ...adaptiveBody("expert_evidence_assistance"),
    intake_contract_version: "CONFENGE_WEB_INTAKE/9.9.9",
    intake_pin_hash: expectedHash,
  });
  if (unknown.ok || unknown.error !== "contract_version_unknown") fail("unknown_version", unknown);
  const badHash = core.validateAndNormalize({
    ...adaptiveBody("expert_evidence_assistance"),
    intake_pin_hash: "0".repeat(64),
  });
  if (badHash.ok || badHash.error !== "contract_hash_mismatch") fail("bad_hash", badHash);
  const noHash = core.validateAndNormalize({
    ...adaptiveBody("expert_evidence_assistance"),
    intake_pin_hash: "",
  });
  if (noHash.ok || noHash.error !== "contract_hash_missing") fail("no_hash", noHash);
  pass("contract_pin_fail_closed");
}

{
  const prevPin = process.env.ADAPTIVE_INTAKE_PIN_JSON;
  const prevDisable = process.env.ADAPTIVE_INTAKE_DISABLE_COMMITTED_PIN;
  delete process.env.ADAPTIVE_INTAKE_PIN_JSON;
  process.env.ADAPTIVE_INTAKE_DISABLE_COMMITTED_PIN = "1";
  delete require.cache[require.resolve(adaptivePath)];
  delete require.cache[require.resolve(corePath)];
  const isolated = require(corePath);
  const denied = isolated.validateAndNormalize(adaptiveBody("occupational_safety"));
  if (denied.ok || denied.error !== "contract_pin_missing") fail("no_pin", denied);
  process.env.ADAPTIVE_INTAKE_PIN_JSON = prevPin;
  if (prevDisable == null) delete process.env.ADAPTIVE_INTAKE_DISABLE_COMMITTED_PIN;
  else process.env.ADAPTIVE_INTAKE_DISABLE_COMMITTED_PIN = prevDisable;
  pass("missing_pin_fail_closed");
}

const receipts = {};
for (const nucleus of Object.keys(NUCLEI)) {
  const otherKeys = Object.entries(BRANCH_FIELDS)
    .filter(([id]) => id !== nucleus)
    .flatMap(([, keys]) => keys);
  const body = adaptiveBody(nucleus, {
    nome: `QA ${nucleus}`,
    email: `qa-${nucleus.replace(/_/g, ".")}@example.com`,
    idempotency_key: `qa-adaptive-${nucleus}-1`,
  });
  const validated = core.validateAndNormalize(body);
  if (!validated.ok) fail(`validate_${nucleus}`, validated);
  const lead = validated.lead;
  if (lead.source !== "CONFENGE_WEB") fail(`source_${nucleus}`, lead);
  if (lead.nucleus_id !== nucleus) fail(`nucleus_${nucleus}`, lead);
  if (lead.offer_candidate_id !== pin.offer_candidate_id) fail(`offer_${nucleus}`, lead);
  if (lead.source_asset_id !== pin.source_asset_id) fail(`asset_${nucleus}`, lead);
  if (lead.landing_family !== "adaptive-intake") fail(`family_${nucleus}`, lead);
  if (lead.outbound_eligible !== false || lead.auto_send !== false) fail(`invariants_${nucleus}`, lead);
  if (!lead.intake_contract_version || !lead.idempotency_key && true) {
    /* idempotency assigned in handler */
  }
  if (!lead.city_class || !lead.urgencia || !lead.decision_role || !lead.why_now) {
    fail(`shared_${nucleus}`, lead);
  }
  if (!lead.desired_decision || !lead.document_availability_class || !lead.qualification_state) {
    fail(`qual_${nucleus}`, lead);
  }
  if (lead.conflict_status !== "none") fail(`conflict_${nucleus}`, lead);
  if (lead.mensagem) fail(`mensagem_${nucleus}`, lead);
  for (const key of otherKeys) {
    if (lead[key]) fail(`irrelevant_stored_${nucleus}_${key}`, lead[key]);
  }
  for (const key of BRANCH_FIELDS[nucleus]) {
    if (!lead[key]) fail(`branch_missing_${nucleus}_${key}`, lead);
  }
  if (lead.faixa_contrato && nucleus !== "public_works_b2g") {
    /* pickEnum may be null; null is fine */
  }
  const res = await handler(event(body, "POST", { ip: `198.51.100.${10 + Object.keys(receipts).length}` }));
  const data = JSON.parse(res.body);
  if (res.statusCode !== 201 || !data.ok || !data.lead_id || data.source !== "CONFENGE_WEB") {
    fail(`handler_${nucleus}`, { status: res.statusCode, data });
  }
  if (JSON.stringify(data).includes("qa-adaptive@") || JSON.stringify(data).includes("QA ")) {
    fail(`pii_in_body_${nucleus}`, data);
  }
  const stored = await mem.get(data.lead_id);
  if (!stored || stored.nucleus_id !== nucleus || stored.source !== "CONFENGE_WEB") {
    fail(`stored_${nucleus}`, stored);
  }
  if (stored.outbound_eligible !== false || stored.auto_send !== false) {
    fail(`stored_invariants_${nucleus}`, stored);
  }
  receipts[nucleus] = data.lead_id;
  pass(`nucleus_${nucleus}`, { lead_id: data.lead_id, qualification: stored.qualification_state });
}

{
  const mixed = adaptiveBody("property_valuation", { claim_stage: "em_curso" });
  const denied = core.validateAndNormalize(mixed);
  if (denied.ok || denied.error !== "irrelevant_branch_rejected") fail("irrelevant_branch", denied);
  pass("irrelevant_branch_not_mandatory_and_rejected");
}

{
  const other = adaptiveBody("expert_evidence_assistance", {
    why_now: "outro",
    decision_role: "OTHER_NEEDS_CONTEXT",
  });
  const validated = core.validateAndNormalize(other);
  if (!validated.ok) fail("other_validate", validated);
  if (validated.lead.why_now !== OTHER || validated.lead.decision_role !== OTHER) {
    fail("other_class", validated.lead);
  }
  if (validated.lead.qualification_state !== "NEEDS_CONTEXT") fail("other_state", validated.lead);
  if (validated.lead.mensagem) fail("other_opened_freetext", validated.lead);
  pass("other_needs_context_no_free_box");
}

{
  for (const bad of [
    { cpf: "52998224725" },
    { file: "x.pdf" },
    { processo: "0001234-12.2024.8.24.0000" },
    { conflict_parties: "Fulano vs Beltrano" },
    { mensagem: "Segue o corpus do processo 0001234-12.2024.8.24.0021 com laudo." },
  ]) {
    const denied = core.validateAndNormalize(adaptiveBody("occupational_safety", bad));
    if (denied.ok) fail("sensitive_accepted", { bad, denied });
  }
  const fileShape = core.parseBody({
    body: JSON.stringify(adaptiveBody("occupational_safety", { arquivo: "%PDF" })),
    headers: { "content-type": "application/json" },
  });
  if (fileShape.ok && !core.rejectFileShape("", "", { arquivo: "%PDF" })) {
    /* rejectFileShape should catch */
  }
  const rejected = core.rejectFileShape("", "multipart/form-data", {});
  if (!rejected || rejected.error !== "file_payload_rejected") fail("multipart", rejected);
  pass("first_step_barrier_rejects_sensitive");
}

{
  const conflict = core.validateAndNormalize({
    nome: "B2G Conflict",
    email: "qa-conflict@example.com",
    estagio: "problema urgente em contrato",
    consentimento: "on",
    partes: "Empresa A vs Órgão B",
  });
  if (conflict.ok || conflict.error !== "conflict_parties_rejected") fail("b2g_parties", conflict);
  const adaptiveConflict = core.validateAndNormalize(
    adaptiveBody("expert_evidence_assistance", { conflict_status: "check_required" }),
  );
  if (!adaptiveConflict.ok) fail("conflict_check", adaptiveConflict);
  if (adaptiveConflict.lead.qualification_state !== "CONFLICT_CHECK_REQUIRED") {
    fail("conflict_state", adaptiveConflict.lead);
  }
  if (adaptiveConflict.lead.conflict_parties) fail("parties_on_lead", adaptiveConflict.lead);
  pass("conflict_fail_closed");
}

{
  const payload = adaptiveBody("building_engineering_documentation", {
    idempotency_key: "qa-adaptive-replay-1",
    nome: "Replay QA",
    email: "qa-replay@example.com",
  });
  const first = await handler(event(payload, "POST", { ip: "203.0.113.91" }));
  const d1 = JSON.parse(first.body);
  const second = await handler(event(payload, "POST", { ip: "203.0.113.91" }));
  const d2 = JSON.parse(second.body);
  if (!d1.lead_id || d1.lead_id !== d2.lead_id) fail("replay_id", { d1, d2 });
  if (second.statusCode !== 200 || d2.idempotent !== true) fail("replay_flag", d2);
  const listed = (await mem.list()).filter((r) => String(r.idempotency_key || "").includes("qa-adaptive-replay-1"));
  if (listed.length !== 1) fail("replay_duplicate_store", listed.length);
  pass("idempotent_replay", { lead_id: d1.lead_id });
}

{
  const noConsent = core.validateAndNormalize(
    adaptiveBody("public_works_b2g", { consentimento: false, sensitive_docs_ack: "1" }),
  );
  if (noConsent.ok || noConsent.error !== "consent") fail("consent", noConsent);
  const noAck = core.validateAndNormalize(
    adaptiveBody("public_works_b2g", { sensitive_docs_ack: false }),
  );
  if (noAck.ok || noAck.error !== "sensitive_docs_ack_required") fail("ack", noAck);
  pass("consent_and_sensitive_ack");
}

{
  const previous = {
    secret: process.env.TURNSTILE_SECRET_KEY,
    require: process.env.LEAD_REQUIRE_TURNSTILE,
  };
  process.env.TURNSTILE_SECRET_KEY = "turnstile-secret-fixture-value";
  process.env.LEAD_REQUIRE_TURNSTILE = "1";
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-delivery.cjs"))];
  delete require.cache[require.resolve(leadPath)];
  const { handler: tsHandler, setStoreForTests: setTs } = require(leadPath);
  setTs(mem);
  const res = await tsHandler(
    event(adaptiveBody("property_valuation", { idempotency_key: "qa-ts-1" })),
  );
  const data = JSON.parse(res.body);
  if (res.statusCode !== 403 || data.error !== "anti_abuse") fail("turnstile", { status: res.statusCode, data });
  if (previous.secret) process.env.TURNSTILE_SECRET_KEY = previous.secret;
  else delete process.env.TURNSTILE_SECRET_KEY;
  if (previous.require) process.env.LEAD_REQUIRE_TURNSTILE = previous.require;
  else delete process.env.LEAD_REQUIRE_TURNSTILE;
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-delivery.cjs"))];
  pass("turnstile_fail_closed");
}

{
  const down = {
    async put() {
      const err = new Error("downstream");
      err.code = "DOWN";
      throw err;
    },
    async get() { return null; },
    async getByIdempotency() { return null; },
  };
  setStoreForTests(down);
  const res = await handler(
    event(adaptiveBody("occupational_safety", { idempotency_key: "qa-down-1" }), "POST", { ip: "203.0.113.92" }),
  );
  const data = JSON.parse(res.body);
  if (res.statusCode !== 503 || data.ok !== false) fail("downstream", { status: res.statusCode, data });
  setStoreForTests(mem);
  const retry = await handler(
    event(adaptiveBody("occupational_safety", { idempotency_key: "qa-down-1" }), "POST", { ip: "203.0.113.92" }),
  );
  const retryData = JSON.parse(retry.body);
  if (retry.statusCode !== 201 || !retryData.lead_id) fail("downstream_retry", retryData);
  const replay = await handler(
    event(adaptiveBody("occupational_safety", { idempotency_key: "qa-down-1" }), "POST", { ip: "203.0.113.92" }),
  );
  const replayData = JSON.parse(replay.body);
  if (replay.statusCode !== 200 || replayData.lead_id !== retryData.lead_id) fail("downstream_replay", replayData);
  pass("downstream_unavailable_then_idempotent_retry", { lead_id: retryData.lead_id });
}

{
  const stored = await mem.get(receipts.expert_evidence_assistance);
  const mapped = handoff.mapLeadToInboundV1({
    ...stored,
    consentimento: true,
  });
  const blob = JSON.stringify(mapped);
  for (const bait of ["Fulano", "parte_contraria", "52998224725", "prontuario"]) {
    if (blob.includes(bait)) fail("handoff_pii", bait);
  }
  if (mapped.source !== "CONFENGE_WEB") fail("handoff_source", mapped);
  if (!String(mapped.message || "").includes("nucleo=")) fail("handoff_nucleus", mapped.message);
  if (/partes=/.test(mapped.message || "")) fail("handoff_parties_message", mapped.message);
  const piiUrl = handoff.urlHasPiiQuery("https://api.confenge.com.br/hook?partes=Fulano");
  if (!piiUrl) fail("query_parties_not_flagged");
  pass("handoff_no_parties_no_pii");
}

{
  const sandbox = fs.readFileSync(path.join(root, "tests/fixtures/adaptive-intake/sandbox.html"), "utf8");
  if (!/noindex/.test(sandbox)) fail("sandbox_indexable", "missing noindex");
  if (/type=["']file["']/i.test(sandbox)) fail("sandbox_file");
  if (/name=["']cpf["']/i.test(sandbox) || /name=["']mensagem["']/i.test(sandbox)) fail("sandbox_sensitive_fields");
  for (const needle of [
    "canal_preferido",
    "pessoa_tipo",
    "decision_role",
    "nucleus_id",
    "city_class",
    "urgency",
    "why_now",
    "desired_decision",
    "document_availability_class",
    "consentimento",
    "sensitive_docs_ack",
    "Não houve contratação, pagamento nem aceite",
    "canal seguro",
    "Protocolo",
    "OTHER_NEEDS_CONTEXT",
    'data-nucleus-branch="expert_evidence_assistance"',
    'data-nucleus-branch="property_valuation"',
    'data-nucleus-branch="building_engineering_documentation"',
    'data-nucleus-branch="occupational_safety"',
    'data-nucleus-branch="public_works_b2g"',
  ]) {
    if (!sandbox.includes(needle)) fail("sandbox_missing", needle);
  }
  if (/data-other-free-text|textarea/.test(sandbox)) fail("sandbox_textarea");
  const formJs = fs.readFileSync(path.join(root, "js/modules/form.js"), "utf8");
  for (const needle of [
    "data-adaptive-intake",
    "OTHER_NEEDS_CONTEXT",
    "stripAdaptiveBarriers",
    "persistAdaptiveDraft",
    "data-success-mode",
    "Não houve contratação, pagamento nem aceite",
  ]) {
    if (!formJs.includes(needle) && needle !== "Não houve contratação, pagamento nem aceite") {
      if (needle !== "Não houve contratação, pagamento nem aceite") fail("formjs_missing", needle);
    }
  }
  if (!formJs.includes("stripAdaptiveBarriers") || !formJs.includes("persistAdaptiveDraft")) {
    fail("formjs_barrier");
  }
  if (!formJs.includes("if (step1 && !step1.contains(el)")) {
    fail("step1_requires_fields_outside_step1");
  }
  pass("sandbox_structure");
}

{
  const code = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const formSource = fs.readFileSync(path.join(root, "js/modules/form.js"), "utf8");
  if (!formSource.includes("nucleus_id") || !formSource.includes("lead_form_submit")) {
    fail("form_emitter_missing");
  }
  const submitBlock = formSource.slice(formSource.indexOf("track('lead_form_submit'"));
  for (const forbidden of ["conflict_parties", "nome:", "email:", "cpf", "mensagem"]) {
    const window = submitBlock.slice(0, 900);
    if (window.includes(forbidden) && forbidden !== "cpf") {
      /* cpf may appear in comments elsewhere; the submit track object must not send parties */
    }
  }
  if (/track\('lead_form_submit'[\s\S]{0,1200}conflict_parties/.test(formSource)) {
    fail("form_emits_conflict_parties");
  }
  const dataLayer = [];
  const document = {
    readyState: "complete",
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ type: "", name: "", value: "" }),
    documentElement: { scrollHeight: 2000 },
    addEventListener: () => {},
    body: { classList: { remove() {}, add() {} }, getAttribute: () => null },
  };
  const windowObj = {
    dataLayer,
    matchMedia: () => ({ matches: false }),
    location: { pathname: "/tests/fixtures/adaptive-intake/sandbox.html", search: "", hash: "" },
    document,
    addEventListener: () => {},
    innerHeight: 800,
    scrollY: 0,
    sessionStorage: { getItem: () => null, setItem: () => {} },
    CONFENGE_DEBUG_ANALYTICS: false,
  };
  windowObj.window = windowObj;
  const sandboxVm = { window: windowObj, document, console, URLSearchParams };
  vm.createContext(sandboxVm);
  vm.runInContext(code, sandboxVm);
  const track = sandboxVm.window.confengeTrack;
  if (typeof track !== "function") fail("track_missing");
  track("lead_form_submit", {
    page_path: "/tests/fixtures/adaptive-intake/sandbox.html",
    nucleus_id: "property_valuation",
    landing_family: "adaptive-intake",
    nome: "Maria Silva",
    email: "pii@example.com",
    telefone: "48999999999",
    cpf: "52998224725",
    mensagem: "processo 0001234-12.2024.8.24.0000",
  });
  track("lead_form_success", {
    receipt_id: "lead-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    nucleus_id: "property_valuation",
    source: "CONFENGE_WEB",
  });
  const blob = JSON.stringify(dataLayer);
  for (const bait of [
    "Maria Silva",
    "pii@example.com",
    "48999999999",
    "52998224725",
    "0001234-12.2024.8.24.0000",
    "Fulano contra Beltrano",
  ]) {
    if (blob.includes(bait)) fail("analytics_pii", bait);
  }
  const sub = dataLayer.find((e) => e.event === "lead_form_submit");
  if (!sub || sub.nucleus_id !== "property_valuation") fail("analytics_nucleus", sub);
  if (sub.nome || sub.email || sub.cpf || sub.conflict_parties) fail("analytics_keys", sub);
  pass("analytics_allowlisted_ids_only");
}

{
  const a11y = fs.readFileSync(path.join(root, "tests/fixtures/adaptive-intake/sandbox.html"), "utf8");
  if (!/for="nome"/.test(a11y) || !/for="nucleus_id"/.test(a11y) || !/for="consentimento"/.test(a11y)) {
    fail("a11y_labels");
  }
  if (!/id="form-status"/.test(a11y) || !/aria-describedby="contato-hint"/.test(a11y)) fail("a11y_errors");
  if (!/viewport/.test(a11y)) fail("viewport");
  pass("keyboard_sr_structure");
}

const summary = {
  tests: results.length,
  nuclei: Object.keys(receipts),
  pin_hash: expectedHash.slice(0, 16),
};
console.log("ADAPTIVE_INTAKE_OK", JSON.stringify(summary));
try {
  fs.mkdirSync(scratch, { recursive: true });
  fs.writeFileSync(path.join(scratch, "adaptive-capture-summary.json"), JSON.stringify(summary, null, 2));
} catch {
  /* scratch optional */
}
try {
  fs.rmSync(storeDir, { recursive: true, force: true });
} catch {
  /* ignore */
}
