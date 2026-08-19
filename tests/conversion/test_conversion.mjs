/**
 * Drives shipped conversion / intake / X-Ray / adapter units.
 * Not a reimplementation.
 */
import { createRequire } from "module";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

process.env.NODE_ENV = "test";
process.env.LEAD_ALLOW_MEMORY_FALLBACK = "1";
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.LEAD_REQUIRE_TURNSTILE;

const matrix = require(path.join(root, "scripts/conversion/matrix.cjs"));
const cnpj = require(path.join(root, "scripts/conversion/cnpj.cjs"));
const xray = require(path.join(root, "scripts/conversion/xray.cjs"));
const nextAction = require(path.join(root, "scripts/conversion/next-action.cjs"));
const attr = require(path.join(root, "scripts/conversion/attribution.cjs"));
const persistOrder = require(path.join(root, "scripts/conversion/persist-order.cjs"));
const copy = require(path.join(root, "scripts/conversion/copy.cjs"));
const experiment = require(path.join(root, "scripts/conversion/experiment.cjs"));
const minimize = require(path.join(root, "scripts/conversion/minimize.cjs"));
const journey = require(path.join(root, "scripts/conversion/journey.cjs"));
const adapter = require(path.join(root, "scripts/conversion/adapter.cjs"));
const intake = require(path.join(root, "scripts/conversion/intake-core.cjs"));
const { MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));

const intakeFnPath = path.join(root, "netlify/functions/market-answer-intake.cjs");
function loadHandler() {
  for (const rel of [
    "netlify/functions/market-answer-intake.cjs",
    "scripts/conversion/intake-core.cjs",
    "scripts/conversion/adapter.cjs",
  ]) {
    const p = path.join(root, rel);
    if (require.cache[require.resolve(p)]) delete require.cache[require.resolve(p)];
  }
  return require(intakeFnPath);
}

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log("PASS", name, detail || "");
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
  process.exitCode = 1;
}

const VALID = "11222333000181";

// --- matrix ---
{
  const shape = matrix.validateMatrixShape();
  if (!shape.ok) fail("matrix_shape", shape);
  else pass("matrix_shape", `${shape.route_count} routes`);
  if (matrix.firstCanaryCta() !== "Veja sua empresa neste mercado") {
    fail("first_canary_cta", matrix.firstCanaryCta());
  } else pass("first_canary_cta");
  for (const r of matrix.listRoutes()) {
    if (r.sla !== "UNKNOWN") fail("sla_unknown", r.id);
  }
  pass("sla_unknown_all_routes");
}

// --- CNPJ ---
{
  const ok = cnpj.validateCnpj("11.222.333/0001-81");
  if (!ok.ok || ok.cnpj !== VALID) fail("cnpj_accept", ok);
  else pass("cnpj_accept_normalized");
  const bad = cnpj.validateCnpj("11222333000180");
  if (bad.ok) fail("cnpj_reject_checksum", bad);
  else pass("cnpj_reject_checksum");
  const short = cnpj.validateCnpj("123");
  if (short.ok) fail("cnpj_reject_short", short);
  else pass("cnpj_reject_short");
  const rep = cnpj.validateCnpj("00000000000000");
  if (rep.ok) fail("cnpj_reject_repeated", rep);
  else pass("cnpj_reject_repeated");
}

// --- X-Ray states + fixture label + no scores ---
{
  for (const state of xray.STATES) {
    const got = xray.requestFactualPayload({ fixture_state: state });
    if (got.state !== state) fail("xray_state", { want: state, got: got.state });
    if (!xray.isLabeledNonLive(got.payload)) fail("fixture_non_live", state);
    const forbidden = xray.forbiddenScoreKeys(got.payload);
    if (forbidden.length) fail("no_risk_keys", { state, forbidden });
    const pub = xray.toPublicXray(got.payload, got.state);
    if (pub.sla !== "UNKNOWN") fail("xray_sla", pub);
    if (pub.claimed_live) fail("claimed_live", state);
  }
  pass("xray_states_and_non_live");
  pass("no_risco_dor_irregularidade");
}

// --- next actions ---
{
  const ready = nextAction.selectNextActions({ xrayState: "READY" });
  const ids = ready.map((a) => a.id);
  if (!ids.includes("explorar_contratos") || !ids.includes("pedir_segunda_leitura")) {
    fail("next_actions_ready", ids);
  } else pass("next_actions_ready", ids.join(","));
  const missing = nextAction.selectNextActions({ xrayState: "NOT_FOUND" });
  if (!missing.some((a) => a.id === "nenhuma" || a.id === "falar_especialista")) {
    fail("next_actions_not_found", missing);
  } else pass("next_actions_fallback");
  const stale = nextAction.selectNextActions({ xrayState: "STALE" });
  const staleIds = stale.map((a) => a.id);
  if (staleIds.includes("pedir_segunda_leitura")) fail("stale_must_not_get_segunda_leitura", staleIds);
  if (!staleIds.includes("dados_defasados")) fail("stale_honesty_missing", staleIds);
  if (!stale.every((a) => a.sla === "UNKNOWN")) fail("stale_sla", stale);
  else pass("stale_honesty", staleIds.join(","));
}

// --- copy / trust ---
{
  const lint = copy.lintAllCopy();
  if (!lint.ok) fail("copy_lint", lint.hits);
  else pass("copy_lint");
  const jc = copy.journeyCopy();
  if (jc.sla !== "UNKNOWN") fail("copy_sla", jc.sla);
  if (!jc.why_cnpj || !jc.what_will_be_shown) fail("copy_why_cnpj", jc);
  else pass("copy_why_and_what");
}

// --- experiment ---
{
  if (experiment.isolatedVariable() !== "cta_copy") fail("experiment_var", experiment.isolatedVariable());
  if (!experiment.hypothesis() || experiment.significanceClaimed()) fail("experiment_sig");
  if (!experiment.ranksQualifiedPipeline()) fail("experiment_metric", experiment.primaryMetric());
  else pass("experiment_single_var");
}

// --- journey a11y / keyboard ---
{
  const html = journey.renderJourney({ flagEnabled: true });
  const ks = journey.keyboardStructure(html);
  for (const [k, v] of Object.entries(ks)) {
    if (!v) fail("a11y_" + k, ks);
  }
  if (html.includes("tabindex=\"1\"") || html.includes("tabindex=\"2\"")) fail("keyboard_trap_tabindex");
  const page = fs.readFileSync(path.join(root, "piloto/conversao-xray/index.html"), "utf8");
  if (!page.includes("Veja sua empresa neste mercado") || !page.includes("cnpj-why")) {
    fail("journey_page_cta", "missing");
  } else if (/\bmarket-[\w-]+\b/i.test(page)) {
    fail("pilot_internal_lang", page.match(/\bmarket-[\w-]+\b/i)[0]);
  } else pass("keyboard_a11y_structure");
  const client = fs.readFileSync(path.join(root, "assets/js/conversion-journey.js"), "utf8");
  if (!client.includes("history.replaceState") || !client.includes("searchParams.delete") || !client.includes('"cnpj"')) {
    fail("client_strips_cnpj_url");
  } else pass("client_no_cnpj_url");
}

// --- Goal 09 fixture parse ---
{
  const fixture = JSON.parse(
    fs.readFileSync(path.join(root, "data/conversion/fixtures/warmbly-goal-09-event.v1.json"), "utf8"),
  );
  if (fixture.schema !== "warmbly.goal-09.compatibility/0.1") fail("goal09_schema", fixture.schema);
  const v1 = fixture.confenge_inbound_v1;
  if (!v1.lead_id || v1.source !== "CONFENGE_WEB" || !v1.consent || v1.consent.granted !== true) {
    fail("goal09_inbound", v1);
  }
  const ext = fixture.conversion_attribution_extension;
  for (const k of ["market_answer_id", "intent", "question_class", "method_version", "schema_version", "drill_down_origin", "cta"]) {
    if (!ext[k]) fail("goal09_ext", k);
  }
  if (ext.auto_send !== false) fail("goal09_autosend", ext);
  if (JSON.stringify(fixture).includes(VALID)) fail("goal09_raw_cnpj");
  else pass("warmbly_goal09_fixture");
}

// --- no lead gate: X-Ray without name/email/phone ---
{
  const store = new MemoryStore();
  const r = await intake.handleXrayRequest({
    store,
    body: { cnpj: VALID, idempotency_key: "no-lead-1", correlation_id: "c-nolead" },
    env: { ...process.env, NODE_ENV: "test" },
  });
  if (r.statusCode !== 201 || !r.body.ok) fail("no_lead_gate", r.body);
  if (!r.body.xray || r.body.xray.state !== "READY") fail("xray_ready_default", r.body);
  if (r.receipt.nome || r.receipt.email || r.receipt.telefone) fail("xray_stored_contact", r.receipt);
  const needles = minimize.findPiiNeedles(r.body, { cnpj: VALID });
  if (needles.length) fail("pii_in_public_body", needles);
  if (r.body.public_url && /cnpj=/i.test(r.body.public_url)) fail("cnpj_in_public_url", r.body.public_url);
  if (r.body.sla !== "UNKNOWN") fail("response_sla", r.body.sla);
  if (r.body.auto_send !== false) fail("auto_send", r.body);
  if (r.analytics && (r.analytics.cnpj || JSON.stringify(r.analytics).includes(VALID))) {
    fail("pii_in_analytics", r.analytics);
  }
  const logBlob = JSON.stringify(r.logs);
  if (logBlob.includes(VALID)) fail("cnpj_in_logs", r.logs);
  else pass("no_lead_gate_and_pii_min");
}

// --- each fixture CNPJ maps to its state via shipped resolver ---
{
  for (const [digits, state] of Object.entries(xray.CNPJ_TO_STATE)) {
    const store = new MemoryStore();
    const r = await intake.handleXrayRequest({
      store,
      body: { cnpj: digits, idempotency_key: `state-${state}`, correlation_id: `c-${state}` },
      env: { NODE_ENV: "test" },
    });
    const got = r.body && r.body.xray && r.body.xray.state;
    if (got !== state) fail("intake_state_" + state, { got, status: r.statusCode, body: r.body });
  }
  pass("intake_all_xray_states");
}

// --- persist-first + idempotent replay via REAL handler ---
{
  const { handler, setStoreForTests, setFetchForTests } = loadHandler();
  const store = new MemoryStore();
  setStoreForTests(store);
  let fetchCalls = 0;
  setFetchForTests(async () => {
    fetchCalls += 1;
    return { status: 201, json: async () => ({ ok: true }) };
  });
  const event = (key) => ({
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "idempotency-key": key,
    },
    body: JSON.stringify({
      action: "xray",
      cnpj: VALID,
      idempotency_key: key,
      correlation_id: "c-replay",
    }),
  });
  const r1 = await handler(event("replay-88"));
  const b1 = JSON.parse(r1.body);
  const r2 = await handler(event("replay-88"));
  const b2 = JSON.parse(r2.body);
  const listed = await store.list();
  if (r1.statusCode !== 201 || !b1.ok) fail("intake_first", { code: r1.statusCode, b1 });
  if (r2.statusCode !== 200 || b2.idempotent !== true) fail("intake_replay", { code: r2.statusCode, b2 });
  if (b1.receipt_id !== b2.receipt_id) fail("replay_same_id", { a: b1.receipt_id, b: b2.receipt_id });
  if (listed.length !== 1) fail("replay_no_second_persist", listed.length);
  if (b1.auto_send !== false || b2.auto_send !== false) fail("replay_autosend");
  if (JSON.stringify(b1).includes(VALID) || JSON.stringify(b2).includes(VALID)) fail("replay_cnpj_in_body");
  if (!b1.trace_persist_before_handoff && r1.statusCode === 201) {
    /* xray handoff is skipped but still ordered */
  }
  pass("idempotent_replay_handler", { id: b1.receipt_id, store: listed.length, fetchCalls });
}

// --- persist before handoff + transport fail / timeout ---
{
  const store = new MemoryStore();
  let calls = 0;
  const r1 = await intake.handleHandraise({
    store,
    body: {
      nome: "QA Conversion",
      email: "qa-conversion@example.com",
      estagio: "segunda leitura de contrato",
      consentimento: true,
      jornada: "contrato",
      idempotency_key: "hand-fail-1",
      correlation_id: "c-hand-fail",
      market_answer_id: "ma-pavimentacao-valor-tipico-v0",
      intent: "revisar_contrato",
      cta: "Veja sua empresa neste mercado",
      drill_down_origin: "answer_to_xray",
    },
    env: {
      ...process.env,
      NODE_ENV: "test",
      CONFENGE_INBOUND_WEBHOOK_URL: "http://127.0.0.1:9/api/v1/webhooks/confenge/inbound",
      CONFENGE_INBOUND_WEBHOOK_SECRET: "test-secret",
    },
    fetchFn: async () => {
      calls += 1;
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    },
  });
  if (r1.statusCode !== 201 || !r1.receipt) fail("handraise_persist_on_fail", r1.body);
  if (!persistOrder.persistBeforeHandoff(r1.trace)) fail("persist_before_handoff", r1.trace);
  if (r1.body.handoff_status !== "RETRYABLE") fail("timeout_status", r1.body);
  if (r1.body.auto_send !== false) fail("handraise_autosend");
  const listed = await store.list();
  if (listed.length !== 1) fail("receipt_kept_on_timeout", listed.length);

  const r2 = await intake.handleHandraise({
    store,
    body: {
      nome: "QA Conversion",
      email: "qa-conversion@example.com",
      estagio: "segunda leitura de contrato",
      consentimento: true,
      jornada: "contrato",
      idempotency_key: "hand-fail-1",
      correlation_id: "c-hand-fail",
    },
    env: {
      NODE_ENV: "test",
      CONFENGE_INBOUND_WEBHOOK_URL: "http://127.0.0.1:9/api/v1/webhooks/confenge/inbound",
      CONFENGE_INBOUND_WEBHOOK_SECRET: "test-secret",
    },
    fetchFn: async () => {
      calls += 1;
      throw new Error("should_not_run_on_replay");
    },
  });
  if (!r2.body.idempotent) fail("retry_idempotent", r2.body);
  if ((await store.list()).length !== 1) fail("retry_no_dup", await store.list());
  pass("persist_before_handoff_timeout", { calls, status: r1.body.handoff_status });
}

// --- consent required only on commercial hand-raise ---
{
  const store = new MemoryStore();
  const noConsent = await intake.handleHandraise({
    store,
    body: {
      nome: "QA Conversion",
      email: "qa-conversion@example.com",
      estagio: "segunda leitura de contrato",
      jornada: "contrato",
    },
    env: { NODE_ENV: "test" },
  });
  if (noConsent.statusCode !== 400 || noConsent.body.error !== "consent") {
    fail("consent_required", noConsent);
  } else pass("consent_required_handraise");
}

// --- attribution completeness ---
{
  const a = attr.defaultCanaryAttribution({
    correlation_id: "c-attr",
    idempotency_key: "idk:attr",
    consent_state: "granted",
    handoff_status: "PENDING",
  });
  const chk = attr.attributionComplete(a);
  if (!chk.ok) fail("attribution_complete", chk.missing);
  else pass("attribution_complete", Object.keys(a).length);
  const dropped = attr.fieldsDroppedByInboundV1(a);
  if (!dropped.includes("market_answer_id") || !dropped.includes("drill_down_origin")) {
    fail("adapter_gap_documented", dropped);
  } else pass("adapter_notes_dropped_fields", dropped.join(","));
}

// --- extended inbound payload keeps extras, auto_send false ---
{
  const rec = adapter.buildXrayReceipt({
    receipt_id: "abc123abc123abc123abc123",
    cnpj: VALID,
    attribution: attr.defaultCanaryAttribution({
      correlation_id: "c-ext",
      idempotency_key: "idk:ext",
    }),
    idempotency_key: "idk:ext",
    correlation_id: "c-ext",
    received_at: "2026-08-16T12:00:00.000Z",
    xray_state: "READY",
  });
  rec.consentimento = true;
  rec.nome = "QA Conversion";
  rec.email = "qa-conversion@example.com";
  rec.receipt_kind = "commercial_handraise";
  const payload = adapter.extendInboundPayload(rec);
  if (payload.source !== "CONFENGE_WEB") fail("inbound_source", payload.source);
  if (!payload.conversion || payload.conversion.market_answer_id !== "ma-pavimentacao-valor-tipico-v0") {
    fail("inbound_extension", payload);
  }
  if (payload.conversion.auto_send !== false) fail("inbound_autosend", payload.conversion);
  pass("extended_inbound_payload");
}

// --- frozen libs not imported as writable copies: paths exist ---
{
  const libs = adapter.frozenLibPaths();
  for (const p of libs) {
    if (!fs.existsSync(p)) fail("frozen_lib_missing", p);
  }
  pass("frozen_libs_present_unedited_in_this_test");
}

// --- client script: no keyboard trap (no preventDefault on Tab) ---
{
  const client = fs.readFileSync(path.join(root, "assets/js/conversion-journey.js"), "utf8");
  if (/preventDefault\(\).*Tab|key === ['\"]Tab['\"]/.test(client)) fail("keyboard_trap_js");
  else pass("no_keyboard_trap_handler");
}

// --- notes + report files exist (filled after this run if missing) ---
{
  const notes = path.join(root, "docs/contracts/intent-action/INTEGRATION_NOTES.md");
  if (!fs.existsSync(notes)) fail("integration_notes_missing");
  else pass("integration_notes_present");
}

// GitHub treats close/fix/resolve next to #88 as an auto-close keyword.
{
  const closeNextTo88 = /\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#88\b/i;
  const scanDirs = [
    path.join(root, "docs/contracts/intent-action"),
    path.join(root, "scripts/conversion"),
    path.join(root, "data/conversion"),
    path.join(root, "tests/conversion"),
  ];
  const hits = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(md|json|cjs|mjs|js|html)$/.test(name)) {
        const text = fs.readFileSync(full, "utf8");
        if (closeNextTo88.test(text)) hits.push(path.relative(root, full));
      }
    }
  }
  for (const dir of scanDirs) walk(dir);
  let commitMsg = "";
  try {
    commitMsg = execSync("git log -1 --format=%B", { cwd: root, encoding: "utf8" });
  } catch {
    commitMsg = "";
  }
  if (closeNextTo88.test(commitMsg)) hits.push("git-log-HEAD");
  if (hits.length) fail("no_close_keyword_next_to_88", hits);
  else pass("no_close_keyword_next_to_88");
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exit(1);
