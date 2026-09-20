/**
 * Drives real lead-stages.cjs + buildLeadRecord + ops auth helpers.
 * No reimplementation of transition rules inside the test.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const Module = require("module");

const stages = require(path.join(root, "netlify/functions/lib/lead-stages.cjs"));
const leadStorePath = path.join(root, "netlify/functions/lib/lead-store.cjs");
const { buildLeadRecord, MemoryStore } = require(leadStorePath);
const ops = require(path.join(root, "netlify/functions/ops.cjs"));
const { historyHash, observationHash } = require(path.join(root, "netlify/functions/lib/gsc-history.cjs"));
const { aggregateEvents, attributeLeads } = require(path.join(root, "netlify/functions/lib/analytics-agg.cjs"));

let failed = 0;
function pass(name, detail = "") {
  console.log("PASS", name, detail);
}
function fail(name, detail) {
  console.error("FAIL", name, detail);
  failed += 1;
}

function readyGscHistory(asOf, nowIso) {
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  const observations = [0, 1, 2].map((offset) => {
    const endMs = asOfMs - (2 - offset) * 864e5;
    const observedDates = Array.from({ length: 28 }, (_, day) =>
      new Date(endMs - (27 - day) * 864e5).toISOString().slice(0, 10)
    );
    const observation = {
      source: "search_analytics_api",
      synthetic: false,
      complete: true,
      as_of: new Date(endMs).toISOString().slice(0, 10),
      start: observedDates[0],
      end: new Date(endMs).toISOString().slice(0, 10),
      observed_dates: observedDates,
      reprocessed_dates: observedDates.slice(-3),
      snapshot_sha256: String(offset + 1).repeat(64),
      observed_at: new Date(Date.parse(nowIso) - (2 - offset) * 1000)
        .toISOString()
        .replace(/\.(\d{3})Z$/, ".$1000+00:00"),
      run_id: `run-${offset + 1}`,
    };
    observation.observation_id = observationHash(observation);
    return observation;
  });
  const latest = observations[2];
  const history = {
    schema: "confenge_private_gsc_history_v1",
    contract_version: "gsc-readiness/v2",
    window_days: 28,
    minimum_distinct_as_of: 3,
    max_as_of_lag_days: 14,
    created_at: observations[0].observed_at,
    updated_at: latest.observed_at,
    parent_state_sha256: null,
    observations,
    last_attempt: {
      attempted_at: latest.observed_at,
      // The producer preserves CI provenance only as a non-plaintext digest.
      run_id: "sha256:f765a77132602fc3f875cccefc67fcf4a0122195bc39bfc984b8ea441eac47b4",
      outcome: "OBSERVATION_MERGED",
      as_of: latest.as_of,
      snapshot_sha256: latest.snapshot_sha256,
      reason_codes: [],
    },
    last_known_good: {
      observation_id: latest.observation_id,
      snapshot_sha256: latest.snapshot_sha256,
      as_of: latest.as_of,
      observed_at: latest.observed_at,
    },
    readiness: {
      ready_for_product_decisions: true,
      status: "READY",
      access_mode: "READ_WRITE",
      reason_codes: [],
      window_start: latest.observed_dates[0],
      window_end: latest.as_of,
      observed_dates: latest.observed_dates,
      missing_dates: [],
      distinct_as_of: 3,
      freshness_as_of: latest.as_of,
    },
  };
  history.state_sha256 = historyHash(history);
  return history;
}

// 1) new lead gets commercial_stage
{
  const rec = buildLeadRecord({
    lead_id: "abc123",
    lead: {
      nome: "Teste",
      telefone: "48999999999",
      email: null,
      empresa: "Construtora X",
      estagio: "contrato",
      jornada: "contrato",
      urgencia: "alta",
      mensagem: null,
      origem: "test",
      landing_page: "/conteudos/limite-aditivo-25-50-obra-publica/",
      referrer: "/conteudos/",
      utm_source: "google",
      utm_medium: "organic",
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      content_cluster: "aditivos",
      idempotency_key: "idk:1",
      session_id: "sess1",
    },
    received_at: new Date().toISOString(),
    ip_hash: "x",
    fingerprint: "y",
    status: "persisted",
  });
  if (rec.commercial_stage !== "lead_persisted") fail("default_stage", rec.commercial_stage);
  else pass("default_stage", rec.commercial_stage);
  if (!Array.isArray(rec.stage_history) || !rec.stage_history.length) fail("stage_history", rec.stage_history);
  else pass("stage_history_len", rec.stage_history.length);
}

// 2) transitions
{
  const base = {
    lead_id: "t1",
    commercial_stage: "lead_persisted",
    stage_history: [],
    received_at: new Date().toISOString(),
  };
  try {
    const patch = stages.applyStageChange(base, { stage: "contacted", actor: "tiago" });
    if (patch.commercial_stage !== "contacted") fail("to_contacted", patch);
    else pass("to_contacted");
    const mid = { ...base, ...patch };
    const p2 = stages.applyStageChange(mid, { stage: "won", actor: "tiago" });
    fail("skip_to_won_should_deny", p2);
  } catch (e) {
    if (e.code === "transition_denied") pass("skip_to_won_denied");
    else fail("skip_to_won", e.message);
  }
}

// 3) lost requires reason
{
  const base = {
    lead_id: "t2",
    commercial_stage: "lead_persisted",
    stage_history: [],
    received_at: new Date().toISOString(),
  };
  try {
    stages.applyStageChange(base, { stage: "lost", actor: "ops" });
    fail("lost_without_reason_allowed");
  } catch (e) {
    if (e.code === "loss_reason_required") pass("lost_requires_reason");
    else fail("lost_reason", e.message);
  }
  const patch = stages.applyStageChange(base, {
    stage: "lost",
    actor: "ops",
    loss_reason: "out_of_icp",
  });
  if (patch.loss_reason !== "out_of_icp") fail("loss_reason_set", patch);
  else pass("loss_reason_set");
}

// 4) funnel rates use real function
{
  const leads = [
    { commercial_stage: "lead_persisted", stage_history: [], received_at: "2026-01-01" },
    {
      commercial_stage: "proposal",
      stage_history: [
        { to: "contacted" },
        { to: "qualified" },
        { to: "meeting" },
        { to: "proposal" },
      ],
      proposal_value: 10000,
      received_at: "2026-01-02",
    },
    {
      commercial_stage: "won",
      stage_history: [{ to: "contacted" }, { to: "qualified" }, { to: "meeting" }, { to: "proposal" }, { to: "won" }],
      contract_value: 8000,
      revenue_received: 4000,
      received_at: "2026-01-03",
    },
  ];
  const f = stages.funnelRates(leads);
  if (f.counts.lead_persisted !== 3) fail("funnel_n", f.counts);
  else pass("funnel_n", f.counts.lead_persisted);
  if (f.counts.won !== 1) fail("funnel_won", f.counts);
  else pass("funnel_won");
  if (f.revenue !== 4000) fail("funnel_revenue", f.revenue);
  else pass("funnel_revenue", f.revenue);
}

// 5) ops auth fail-closed
{
  const prev = process.env.OPS_TOKEN;
  delete process.env.OPS_TOKEN;
  delete process.env.REVOPS_TOKEN;
  const r = ops._authOk({ headers: {}, queryStringParameters: {} });
  if (r.ok) fail("auth_without_token");
  else pass("auth_fail_closed", r.reason);
  process.env.OPS_TOKEN = "x".repeat(20);
  const bad = ops._authOk({ headers: { authorization: "Bearer yyyyyyyyyyyyyyyyyyyy" } });
  if (bad.ok) fail("auth_wrong_token");
  else pass("auth_wrong_token_denied");
  const good = ops._authOk({ headers: { authorization: "Bearer " + "x".repeat(20) } });
  if (!good.ok) fail("auth_good", good);
  else pass("auth_good");
  if (prev === undefined) delete process.env.OPS_TOKEN;
  else process.env.OPS_TOKEN = prev;
}

// 6) memory store list + stage update path
{
  const mem = new MemoryStore();
  const rec = buildLeadRecord({
    lead_id: "store1",
    lead: {
      nome: "A",
      telefone: "48988887777",
      email: null,
      empresa: null,
      estagio: "edital",
      jornada: "edital",
      urgencia: null,
      mensagem: null,
      origem: "t",
      landing_page: "/",
      referrer: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      content_cluster: null,
      idempotency_key: "idk:store1",
    },
    received_at: new Date().toISOString(),
    ip_hash: "h",
    fingerprint: "f",
  });
  await mem.put(rec);
  const listed = await mem.list();
  if (listed.length !== 1) fail("mem_list", listed.length);
  else pass("mem_list");
  const patch = stages.applyStageChange(rec, { stage: "contacted", actor: "tiago", note: "ligou" });
  const updated = await mem.update("store1", patch);
  if (updated.commercial_stage !== "contacted") fail("mem_update", updated);
  else pass("mem_update_stage", updated.commercial_stage);
}

// 7) analytics aggregation
{
  const events = [
    { event: "page_view", path: "/conteudos/bdi-obra-publica/", sid: "sess-111111111111111111111111111", ts: "2026-08-01T10:00:00Z" },
    { event: "cta_click", path: "/conteudos/bdi-obra-publica/", sid: "sess-111111111111111111111111111", ts: "2026-08-01T10:01:00Z", props: { cta_id: "inline" } },
    { event: "lead_form_start", path: "/", sid: "sess-111111111111111111111111111", ts: "2026-08-01T10:02:00Z" },
    { event: "lead_form_success", path: "/", sid: "sess-111111111111111111111111111", ts: "2026-08-01T10:03:00Z" },
    { event: "web_vital", path: "/", sid: "sess-111111111111111111111111111", ts: "2026-08-01T10:00:05Z", props: { metric: "lcp", value: 1800 } },
    { event: "web_vital", path: "/", sid: "sess-111111111111111111111111111", ts: "2026-08-01T10:00:06Z", props: { metric: "cls", value: 0.02 } },
  ];
  const agg = aggregateEvents(events);
  if (!agg.daily.length) fail("agg_daily");
  else pass("agg_daily", agg.daily[0].events);
  if (!agg.web_vitals.lcp || agg.web_vitals.lcp.n !== 1) fail("agg_lcp", agg.web_vitals);
  else pass("agg_lcp", agg.web_vitals.lcp.p75);
  const attr = attributeLeads(
    [{ lead_id: "L1", session_id: "sess-111111111111111111111111111", received_at: "2026-08-01T10:03:00Z", landing_page: "/", commercial_stage: "lead_persisted" }],
    events
  );
  if (attr[0].first_touch_path !== "/conteudos/bdi-obra-publica/") fail("attr_first", attr[0]);
  else pass("attr_first_touch", attr[0].first_touch_path);
}

// 8) public summary never includes email/nome
{
  const summary = stages.publicLeadSummary({
    lead_id: "p1",
    nome: "SECRET",
    email: "secret@example.com",
    telefone: "48999",
    commercial_stage: "lead_persisted",
    received_at: new Date().toISOString(),
    landing_page: "/",
  });
  const blob = JSON.stringify(summary);
  if (/SECRET|secret@|48999/.test(blob)) fail("pii_leak", blob);
  else pass("public_summary_no_pii");
}

// 8b) 2026-09-19 (W6-ops-web): the redacted summary carries the e-mail provider
// handles (provider_id / http / reason / idempotency_key) so the operator can
// correlate lead_id -> Resend message with pii=0. Statuses stay plain strings.
{
  const summary = stages.publicLeadSummary({
    lead_id: "lead-p2",
    nome: "SECRET",
    email: "secret@example.com",
    telefone: "48999",
    mensagem: "texto livre",
    commercial_stage: "lead_persisted",
    received_at: new Date().toISOString(),
    landing_page: "/",
    delivery: {
      notify: { status: "ok", attempts: 1, channels: ["telegram"] },
      email: {
        status: "ok",
        attempts: 1,
        http: 200,
        provider_id: "8b2d1f0e-aaaa-4bbb-8ccc-0123456789ab",
        idempotency_key: "lead-email/lead-p2",
      },
    },
  });
  const d = summary.delivery || {};
  if (d.notify !== "ok" || d.email !== "ok") fail("delivery_status_shape", d);
  else pass("delivery_status_shape_kept");
  if (d.email_provider_id !== "8b2d1f0e-aaaa-4bbb-8ccc-0123456789ab" || d.email_http !== 200
      || d.email_idempotency_key !== "lead-email/lead-p2" || "email_reason" in d) {
    fail("delivery_provider_handles", d);
  } else pass("delivery_provider_handles_pii0");
  const blob = JSON.stringify(summary);
  if (/SECRET|secret@|48999|texto livre/.test(blob)) fail("pii_leak_with_delivery", blob);
  else pass("public_summary_no_pii_with_delivery");
  const failed = stages.publicLeadSummary({
    lead_id: "lead-p3",
    received_at: new Date().toISOString(),
    delivery: { notify: { status: "error" }, email: { status: "error", reason: "timeout", attempts: 1 } },
  }).delivery;
  if (failed.email !== "error" || failed.email_reason !== "timeout" || "email_provider_id" in failed || "email_http" in failed) {
    fail("delivery_error_reason", failed);
  } else pass("delivery_error_reason_pii0");
}


// peak stage: proposal implies contacted/qualified/meeting reached
{
  const leads = [{
    commercial_stage: "proposal",
    stage_history: [],
    proposal_value: 15000,
    received_at: "2026-08-01",
  }];
  const f = stages.funnelRates(leads);
  if (f.counts.proposal !== 1) fail("peak_proposal", f.counts);
  else pass("peak_proposal");
  if (f.counts.contacted !== 1 || f.counts.qualified !== 1 || f.counts.meeting !== 1)
    fail("peak_earlier_stages", f.counts);
  else pass("peak_earlier_stages", JSON.stringify(f.counts));
  if (f.pipeline_value !== 15000) fail("pipeline_value", f.pipeline_value);
  else pass("pipeline_value", f.pipeline_value);
}

// 8b) missing record_kind multi-signal probe must NOT enter commercial funnel
{
  const rk = require(path.join(root, "netlify/functions/lib/record-kind.cjs"));
  const legacyProbe = {
    lead_id: "legacy-no-kind",
    // no record_kind field — pre-migration
    nome: "SYNTHETIC-PROBE",
    email: "probe@example.com",
    utm_source: "synthetic",
    origem: "/synthetic-probe-daily",
    commercial_stage: "contacted",
    proposal_value: 999999,
    stage_history: [{ to: "contacted", actor: "daily-probe" }],
    received_at: "2026-07-01",
  };
  const kind = rk.effectiveRecordKind(legacyProbe);
  if (kind !== "synthetic" && kind !== "qa") fail("legacy_probe_effective_kind", kind);
  else pass("legacy_probe_effective_kind", kind);
  if (rk.isCommercialReal(legacyProbe)) fail("legacy_probe_commercial");
  else pass("legacy_probe_not_commercial");
  const f = stages.funnelRates([
    legacyProbe,
    {
      lead_id: "real-x",
      record_kind: "real",
      commercial_stage: "lead_persisted",
      received_at: "2026-07-02",
    },
  ]);
  if (f.n !== 1) fail("legacy_probe_excluded_from_funnel", f);
  else pass("legacy_probe_excluded_from_funnel", f.n);
  if (f.pipeline_value === 999999) fail("legacy_pipeline_leak", f.pipeline_value);
  else pass("legacy_pipeline_clean", f.pipeline_value);
}

// 9) record_kind: public lead defaults real; multi-signal probe is synthetic
{
  const rk = require(path.join(root, "netlify/functions/lib/record-kind.cjs"));
  const realRec = buildLeadRecord({
    lead_id: "rk-real",
    lead: {
      nome: "Maria Construtora",
      email: "maria@empresa.com.br",
      telefone: "48991112222",
      estagio: "contrato",
      jornada: "contrato",
      origem: "site",
      utm_source: "google",
      landing_page: "/conteudos/",
      consentimento: "true",
      empresa: "X",
      mensagem: null,
      idempotency_key: "idk:rk-real",
    },
    received_at: new Date().toISOString(),
    ip_hash: "h",
    fingerprint: "f",
  });
  if (realRec.record_kind !== "real") fail("default_real", realRec.record_kind);
  else pass("default_real", realRec.record_kind);

  const probeRec = buildLeadRecord({
    lead_id: "rk-probe",
    lead: {
      nome: "SYNTHETIC-PROBE",
      email: "probe@example.com",
      estagio: "synthetic probe — discard",
      jornada: "operacao",
      origem: "/synthetic-probe-daily",
      utm_source: "synthetic",
      landing_page: "/",
      consentimento: "true",
      test_mode: true,
      record_kind: "synthetic",
      mensagem: "[QA] do not contact",
      telefone: null,
      empresa: null,
      idempotency_key: "idk:rk-probe",
    },
    received_at: new Date().toISOString(),
    ip_hash: "h",
    fingerprint: "f",
    headers: { "user-agent": "confenge-daily-probe/1.0", "x-confenge-probe": "1" },
  });
  if (probeRec.record_kind !== "synthetic") fail("probe_synthetic", probeRec.record_kind);
  else pass("probe_synthetic", probeRec.record_kind);
  if (probeRec.next_action !== "exclude_from_commercial") fail("probe_next_action", probeRec.next_action);
  else pass("probe_excluded_from_commercial");

  const originalLoad = Module._load;
  Module._load = function failRecordKindLoad(request, parent, isMain) {
    if (request === "./record-kind.cjs" && parent?.filename === leadStorePath) {
      throw new Error("injected_classifier_failure");
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const failClosed = buildLeadRecord({
      lead_id: "rk-classifier-failure",
      lead: {
        nome: "SYNTHETIC-PROBE",
        email: "probe@example.com",
        record_kind: "synthetic",
        jornada: "operacao",
      },
      received_at: new Date().toISOString(),
      ip_hash: "h",
      fingerprint: "f",
    });
    if (failClosed.record_kind !== "internal") {
      fail("classifier_failure_kind_fail_closed", failClosed.record_kind);
    } else pass("classifier_failure_kind_fail_closed", failClosed.record_kind);
    if (failClosed.next_action !== "exclude_from_commercial") {
      fail("classifier_failure_excluded", failClosed.next_action);
    } else pass("classifier_failure_excluded");
  } finally {
    Module._load = originalLoad;
  }

  const recordKindPath = path.join(root, "netlify/functions/lib/record-kind.cjs");
  const realRecordKind = require(recordKindPath);
  Module._load = function failRecordKindClassification(request, parent, isMain) {
    if (request === "./record-kind.cjs" && parent?.filename === leadStorePath) {
      return {
        ...realRecordKind,
        resolveRecordKind() {
          throw new Error("injected_classification_failure");
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const failClosed = buildLeadRecord({
      lead_id: "rk-classification-failure",
      lead: { nome: "Lead humano", email: "humano@example.com", jornada: "operacao" },
      received_at: new Date().toISOString(),
      ip_hash: "h",
      fingerprint: "f",
    });
    if (failClosed.record_kind !== "internal") {
      fail("classification_failure_kind_fail_closed", failClosed.record_kind);
    } else pass("classification_failure_kind_fail_closed", failClosed.record_kind);
    if (failClosed.next_action !== "exclude_from_commercial") {
      fail("classification_failure_excluded", failClosed.next_action);
    } else pass("classification_failure_excluded");
  } finally {
    Module._load = originalLoad;
  }

  // Single ambiguous signal must not reclassify for backfill
  const amb = rk.classifyForBackfill({
    nome: "João",
    email: "joao@empresa.com.br",
    utm_source: "test", // alone is weak for backfill without multi-signal strength
    commercial_stage: "qualified",
  });
  // utm_source:test is a strong signal only with another signal — alone may keep
  if (amb.action === "mark" && amb.signals.length < 2) fail("single_signal_backfill", amb);
  else pass("backfill_requires_multi_signal", amb.reason);

  // Funnel excludes synthetic by default
  const mixed = [
    { ...realRec, commercial_stage: "lead_persisted", proposal_value: null },
    {
      ...probeRec,
      commercial_stage: "contacted",
      proposal_value: 999999,
      stage_history: [{ to: "contacted", actor: "daily-probe" }],
    },
    {
      lead_id: "won-real",
      record_kind: "real",
      commercial_stage: "won",
      contract_value: 5000,
      revenue_received: 5000,
      stage_history: [{ to: "contacted" }, { to: "qualified" }, { to: "meeting" }, { to: "proposal" }, { to: "won" }],
      received_at: "2026-08-01",
    },
  ];
  const fReal = stages.funnelRates(mixed);
  if (fReal.n !== 2) fail("funnel_excludes_synthetic", fReal);
  else pass("funnel_excludes_synthetic", fReal.n);
  if (fReal.pipeline_value === 999999) fail("pipeline_includes_probe", fReal.pipeline_value);
  else pass("pipeline_excludes_probe_value", fReal.pipeline_value);
  if (fReal.revenue !== 5000) fail("revenue_real_only", fReal.revenue);
  else pass("revenue_real_only", fReal.revenue);
  if (fReal.counts.contacted < 1) fail("real_contacted", fReal.counts);
  else pass("real_contacted_counted");

  const health = stages.systemHealth(mixed);
  if (health.synthetic_leads < 1) fail("health_synthetic", health);
  else pass("system_health_separates_synthetic", health.synthetic_leads);
  if (health.pipeline_real === 999999) fail("health_pipeline_mixed", health);
  else pass("system_health_pipeline_real", health.pipeline_real);
  if (health.real_leads !== 2) fail("health_real_count", health.real_leads);
  else pass("system_health_real_count", health.real_leads);

  // SLA never flags synthetic
  const sumProbe = stages.publicLeadSummary({
    ...probeRec,
    received_at: new Date(Date.now() - 10 * 3600e3).toISOString(),
    commercial_stage: "lead_persisted",
  });
  if (sumProbe.needs_contact) fail("sla_on_synthetic", sumProbe);
  else pass("sla_skips_synthetic");
}

// 10) GSC insights auth + sanitize (drive shipped ops helpers)
{
  const prev = process.env.OPS_TOKEN;
  process.env.OPS_TOKEN = "y".repeat(20);
  const denied = ops._authOk({ headers: {} });
  if (denied.ok) fail("gsc_auth_required_helper");
  else pass("gsc_auth_fail_without_token", denied.reason);

  const safe = ops._sanitizeGscForOps({ aggregate: 3, email: "private@example.invalid" });
  if (Object.hasOwn(safe, "email")) fail("gsc_pii_in_payload", safe);
  else pass("gsc_sanitize_no_pii_keys");
  if (prev === undefined) delete process.env.OPS_TOKEN;
  else process.env.OPS_TOKEN = prev;
}

// 11) ops handler: gsc without auth → 401; funnel real-only via MemoryStore
{
  const prevTok = process.env.OPS_TOKEN;
  const prevNode = process.env.NODE_ENV;
  const prevStore = process.env.LEAD_STORE;
  process.env.OPS_TOKEN = "z".repeat(24);
  process.env.NODE_ENV = "test";
  process.env.LEAD_STORE = "memory";
  process.env.LEAD_ALLOW_MEMORY_FALLBACK = "1";

  const unauth = await ops.handler({
    httpMethod: "GET",
    headers: {},
    queryStringParameters: { action: "gsc_insights" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights",
  });
  if (unauth.statusCode !== 401 && unauth.statusCode !== 403) {
    fail("gsc_http_unauthorized", unauth.statusCode + " " + unauth.body);
  } else pass("gsc_http_unauthorized", unauth.statusCode);

  const { globalMemory, buildLeadRecord: blr } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
  globalMemory.map.clear();
  globalMemory.byIdem.clear();
  globalMemory.system.clear();

  const emptyHistory = await ops.handler({
    httpMethod: "GET",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_history" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_history",
  });
  if (emptyHistory.statusCode !== 404) fail("gsc_history_empty_fail_closed", emptyHistory.body);
  else pass("gsc_history_empty_fail_closed");

  const realL = blr({
    lead_id: "ops-real",
    lead: {
      nome: "Real Co",
      email: "r@empresa.com.br",
      telefone: "48990001111",
      estagio: "edital",
      jornada: "edital",
      origem: "web",
      utm_source: "google",
      // lead-core derives origin_class before buildLeadRecord (UTM present => campaign)
      origin_class: "campaign",
      landing_page: "/",
      consentimento: "true",
      empresa: "R",
      mensagem: null,
      idempotency_key: "idk:ops-real",
    },
    received_at: new Date().toISOString(),
    ip_hash: "1",
    fingerprint: "2",
  });
  const synL = blr({
    lead_id: "ops-syn",
    lead: {
      nome: "SYNTHETIC-PROBE",
      email: "probe@example.com",
      estagio: "synthetic probe — discard",
      jornada: "operacao",
      origem: "/synthetic-probe",
      utm_source: "synthetic",
      landing_page: "/",
      consentimento: "true",
      record_kind: "synthetic",
      test_mode: true,
      mensagem: "[QA]",
      telefone: null,
      empresa: null,
      idempotency_key: "idk:ops-syn",
    },
    received_at: new Date().toISOString(),
    ip_hash: "3",
    fingerprint: "4",
    headers: { "user-agent": "confenge-synthetic-probe/1.0" },
  });
  await globalMemory.put(realL);
  await globalMemory.put(synL);

  const currentInsights = {
    source: "search_analytics_api",
    as_of: new Date().toISOString().slice(0, 10),
    // Python's datetime.isoformat() emits a valid RFC3339 UTC offset. The
    // authenticated consumer must not confuse that suffix with a phone number.
    generated_at: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000+00:00"),
    ready_for_product_decisions: true,
    synthetic: false,
    fixture: false,
    live_baseline_invented: false,
    query_text_redacted: true,
    raw_query_rows_in_git: false,
    analyses: [{ query_hash: "sha256:abc123", impressions: 12 }],
  };
  const currentHistory = readyGscHistory(currentInsights.as_of, currentInsights.generated_at);
  currentInsights.readiness_contract_version = "gsc-readiness/v2";
  currentInsights.history_state_sha256 = currentHistory.state_sha256;
  currentInsights.snapshot_sha256 = currentHistory.last_known_good.snapshot_sha256;
  const currentProducer = {
    schema_version: "gsc-sync-state/v1",
    manifest_schema_version: "gsc_snapshot_manifest_v1",
    manifest_sha256: currentInsights.snapshot_sha256,
    as_of: currentInsights.as_of,
    produced_at: currentInsights.generated_at,
    source: "search_analytics_api",
  };
  const rawQueryRejected = await ops.handler({
    httpMethod: "POST",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_insights_ingest" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights_ingest",
    body: JSON.stringify({ producer: currentProducer, history: currentHistory, insights: { ...currentInsights, query: "raw private term" } }),
  });
  if (rawQueryRejected.statusCode !== 422) fail("gsc_ingest_rejects_raw_query", rawQueryRejected.body);
  else pass("gsc_ingest_rejects_raw_query");
  const nestedRawRejected = ops._validateGscInsights({
    ...currentInsights,
    analyses: [{ raw_query: "private nested term" }],
  });
  if (nestedRawRejected.ok) fail("gsc_ingest_rejects_nested_raw_query", nestedRawRejected);
  else pass("gsc_ingest_rejects_nested_raw_query", nestedRawRejected.error);
  const dynamicPiiKeyRejected = ops._validateGscInsights({
    ...currentInsights,
    analyses: [{ contactPhoneNumber: "redacted" }],
  });
  if (dynamicPiiKeyRejected.ok) fail("gsc_ingest_rejects_dynamic_pii_key", dynamicPiiKeyRejected);
  else pass("gsc_ingest_rejects_dynamic_pii_key", dynamicPiiKeyRejected.error);
  const phoneValueRejected = ops._validateGscInsights({
    ...currentInsights,
    analyses: [{ note: "+55 (48) 99999-0000" }],
  });
  if (phoneValueRejected.ok) fail("gsc_ingest_rejects_phone_like_value", phoneValueRejected);
  else pass("gsc_ingest_rejects_phone_like_value", phoneValueRejected.error);
  const phoneAsRunIdRejected = ops._validateGscInsights({
    ...currentInsights,
    run_id: "+55 (48) 99999-0000",
  });
  if (phoneAsRunIdRejected.ok) fail("gsc_run_id_does_not_bypass_phone_guard", phoneAsRunIdRejected);
  else pass("gsc_run_id_does_not_bypass_phone_guard", phoneAsRunIdRejected.error);
  const staleRejected = ops._validateGscInsights({
    ...currentInsights,
    as_of: "2025-01-01",
    generated_at: "2025-01-02T00:00:00Z",
  });
  if (staleRejected.ok) fail("gsc_ingest_rejects_stale_snapshot", staleRejected);
  else pass("gsc_ingest_rejects_stale_snapshot", staleRejected.error);

  const ingested = await ops.handler({
    httpMethod: "POST",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_insights_ingest" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights_ingest",
    body: JSON.stringify({ producer: currentProducer, history: currentHistory, insights: currentInsights }),
  });
  const ingestedBody = JSON.parse(ingested.body || "{}");
  if (
    ingested.statusCode !== 200 ||
    !ingestedBody.durable ||
    !ingestedBody.content_sha256 ||
    ingestedBody.status !== "CURRENT" ||
    ingestedBody.producer_manifest_sha256 !== currentInsights.snapshot_sha256 ||
    ingestedBody.consumer_manifest_sha256 !== currentInsights.snapshot_sha256
  ) {
    fail("gsc_ingest_durable", ingested.body);
  } else pass("gsc_ingest_durable", ingestedBody.content_sha256.slice(0, 12));
  if (ingestedBody.history_state_sha256 !== currentHistory.state_sha256) {
    fail("gsc_history_durable_hash", ingestedBody);
  } else pass("gsc_history_durable_hash", ingestedBody.history_state_sha256.slice(0, 12));

  const historyRead = await ops.handler({
    httpMethod: "GET",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_history" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_history",
  });
  const historyReadBody = JSON.parse(historyRead.body || "{}");
  if (
    historyRead.statusCode !== 200 ||
    historyReadBody.meta?.state_sha256 !== currentHistory.state_sha256
  ) fail("gsc_history_read_after_write", historyReadBody);
  else pass("gsc_history_read_after_write", historyReadBody.meta.state_sha256.slice(0, 12));
  const leadOnlyRecords = await globalMemory.list();
  if (leadOnlyRecords.length !== 2) fail("gsc_state_separate_from_leads", leadOnlyRecords.length);
  else pass("gsc_state_separate_from_leads", leadOnlyRecords.length);

  const funnelRes = await ops.handler({
    httpMethod: "GET",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "funnel" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=funnel",
  });
  const funnelBody = JSON.parse(funnelRes.body || "{}");
  if (!funnelBody.ok) fail("ops_funnel_ok", funnelBody);
  else if (funnelBody.funnel?.n !== 1) fail("ops_funnel_real_only", funnelBody.funnel);
  else pass("ops_funnel_real_only", funnelBody.funnel.n);
  if (funnelBody.system_health?.synthetic_leads < 1) fail("ops_system_health", funnelBody.system_health);
  else pass("ops_system_health_has_synthetic");
  // MEDICAO-08: the funnel segments by web origin class and by CTA; the real
  // lead above carries utm_source=google (=> campaign) and no cta_id.
  const byOriginClass = funnelBody.by_origin_class || {};
  const byCta = funnelBody.by_cta || {};
  const realOriginClass = (await globalMemory.get("ops-real"))?.origin_class || null;
  if (realOriginClass !== "campaign") fail("ops_real_lead_origin_class_stored", realOriginClass);
  else if (!byOriginClass[realOriginClass] || byOriginClass[realOriginClass].lead_persisted !== 1) {
    fail("ops_funnel_by_origin_class", { realOriginClass, byOriginClass });
  } else pass("ops_funnel_by_origin_class", `${realOriginClass}=${byOriginClass[realOriginClass].lead_persisted}`);
  if (Object.keys(byOriginClass).some((k) => k === "unknown" || k === "organic")) fail("ops_funnel_origin_class_label", Object.keys(byOriginClass));
  else pass("ops_funnel_origin_class_labels_honest");
  if (!byCta.unknown || byCta.unknown.lead_persisted !== 1) fail("ops_funnel_by_cta", byCta);
  else pass("ops_funnel_by_cta", JSON.stringify(Object.keys(byCta)));
  const crossed = funnelBody.by_origin_class_x_cta || {};
  if (!crossed[`${realOriginClass}|unknown`] || crossed[`${realOriginClass}|unknown`].lead_persisted !== 1) fail("ops_funnel_origin_class_x_cta", crossed);
  else pass("ops_funnel_origin_class_x_cta");
  // Synthetic rows never enter the segmentation.
  const totalSegmented = Object.values(byOriginClass).reduce((a, r) => a + (r.lead_persisted || 0), 0);
  if (totalSegmented !== 1) fail("ops_funnel_segmentation_real_only", totalSegmented);
  else pass("ops_funnel_segmentation_real_only");

  // A06-RECEBIMENTO-02: a real-looking QA submission (no probe signals) can be
  // reclassified explicitly by an authenticated operator, with snapshot,
  // audit and rollback. The automatic backfill must keep it (proof that the
  // explicit path is necessary).
  const opsPost = (action, body, headers = { authorization: "Bearer " + "z".repeat(24) }) => ops.handler({
    httpMethod: "POST",
    headers: { ...headers, "content-type": "application/json" },
    queryStringParameters: { action },
    rawUrl: `https://confenge.com.br/.netlify/functions/ops?action=${action}`,
    body: JSON.stringify(body),
  });
  const opsGet = (action, extra = {}) => ops.handler({
    httpMethod: "GET",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action, ...extra },
    rawUrl: `https://confenge.com.br/.netlify/functions/ops?action=${action}`,
  });
  const dry = JSON.parse((await opsPost("backfill_record_kind", { dry_run: true })).body || "{}");
  if (!dry.ok || (dry.candidates || []).some((c) => c.lead_id === "ops-real")) fail("backfill_would_mark_real_qa", dry.candidates);
  else pass("backfill_keeps_signal_free_qa_as_real", `candidates=${dry.candidate_count}`);

  const unauthSet = await opsPost("set_record_kind", { lead_id: "ops-real", to: "qa", reason: "x" }, {});
  if (unauthSet.statusCode !== 401) fail("set_record_kind_unauthenticated", unauthSet.statusCode);
  else pass("set_record_kind_requires_auth");
  for (const [label, body] of [
    ["to_real", { lead_id: "ops-real", to: "real", reason: "qa pos-aceite", approval_reference: "g03" }],
    ["to_spam", { lead_id: "ops-real", to: "spam", reason: "qa pos-aceite", approval_reference: "g03" }],
    ["no_reason", { lead_id: "ops-real", to: "qa", approval_reference: "g03" }],
    ["no_approval", { lead_id: "ops-real", to: "qa", reason: "qa pos-aceite" }],
    ["no_lead", { to: "qa", reason: "qa pos-aceite", approval_reference: "g03" }],
  ]) {
    const res = await opsPost("set_record_kind", body);
    if (res.statusCode !== 400) fail(`set_record_kind_${label}_accepted`, res.statusCode + " " + res.body);
    else pass(`set_record_kind_${label}_refused`);
  }
  const missing = await opsPost("set_record_kind", { lead_id: "ops-nope", to: "qa", reason: "qa pos-aceite", approval_reference: "g03" });
  if (missing.statusCode !== 404) fail("set_record_kind_missing_lead", missing.statusCode);
  else pass("set_record_kind_missing_lead_404");

  const set = await opsPost("set_record_kind", {
    lead_id: "ops-real",
    to: "qa",
    reason: "protocolo g03 §7 baixa pós-QA",
    approval_reference: "g03-2026-09-19",
    actor: "operador-ops",
  });
  const setBody = JSON.parse(set.body || "{}");
  if (set.statusCode !== 200 || !setBody.ok || !setBody.snapshot_id) fail("set_record_kind_apply", set.statusCode + " " + set.body);
  else pass("set_record_kind_applied", setBody.snapshot_id);
  const afterSet = await globalMemory.get("ops-real");
  const lastAudit = (afterSet.audit || []).slice(-1)[0] || {};
  if (
    afterSet.record_kind !== "qa"
    || afterSet.next_action !== "exclude_from_commercial"
    || lastAudit.event !== "record_kind" || lastAudit.from !== "real" || lastAudit.to !== "qa"
    || lastAudit.actor === "system" || lastAudit.actor !== "operador-ops"
    || !/g03-2026-09-19/.test(String(lastAudit.note || ""))
  ) fail("set_record_kind_record_state", { record_kind: afterSet.record_kind, next_action: afterSet.next_action, lastAudit });
  else pass("set_record_kind_audited_by_operator", lastAudit.actor);
  const realAfter = JSON.parse((await opsGet("leads", { kind: "real" })).body || "{}");
  const qaAfter = JSON.parse((await opsGet("leads", { kind: "qa" })).body || "{}");
  if (realAfter.count !== 0 || realAfter.counts_by_kind?.real !== 0) fail("set_record_kind_real_count", realAfter.counts_by_kind);
  else pass("set_record_kind_real_count_minus_one");
  if (qaAfter.count !== 1 || !(qaAfter.leads || []).some((l) => l.lead_id === "ops-real")) fail("set_record_kind_qa_list", qaAfter);
  else pass("set_record_kind_qa_listed");
  const funnelAfter = JSON.parse((await opsGet("funnel")).body || "{}");
  if (funnelAfter.funnel?.n !== 0) fail("set_record_kind_funnel_excludes_qa", funnelAfter.funnel);
  else pass("set_record_kind_funnel_excludes_qa");
  const again = await opsPost("set_record_kind", { lead_id: "ops-real", to: "qa", reason: "repetido", approval_reference: "g03" });
  if (again.statusCode !== 409) fail("set_record_kind_repeat", again.statusCode + " " + again.body);
  else pass("set_record_kind_repeat_conflict");

  const rb = await opsPost("rollback_record_kind", { snapshot_id: setBody.snapshot_id, actor: "operador-ops" });
  const rbBody = JSON.parse(rb.body || "{}");
  const restored = await globalMemory.get("ops-real");
  if (rb.statusCode !== 200 || rbBody.restored !== 1 || restored.record_kind !== "real" || restored.next_action !== "first_contact") {
    fail("set_record_kind_rollback", { status: rb.statusCode, body: rbBody, record_kind: restored.record_kind, next_action: restored.next_action });
  } else pass("set_record_kind_rollback_restores_real");
  const realRestored = JSON.parse((await opsGet("leads", { kind: "real" })).body || "{}");
  if (realRestored.count !== 1) fail("set_record_kind_rollback_count", realRestored.count);
  else pass("set_record_kind_rollback_count_restored");

  const gscOk = await ops.handler({
    httpMethod: "GET",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_insights" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights",
  });
  const gscBody = JSON.parse(gscOk.body || "{}");
  if (gscOk.statusCode !== 200 || !gscBody.ok) fail("gsc_with_auth", gscOk.statusCode + " " + gscOk.body?.slice?.(0, 120));
  else {
    pass("gsc_with_auth");
    if (
      gscBody.meta?.delivery_source !== "durable_store" ||
      gscBody.meta?.snapshot_content_sha256 !== ingestedBody.content_sha256 ||
      gscBody.meta?.history_state_sha256 !== currentHistory.state_sha256 ||
      gscBody.meta?.ready_for_product_decisions !== true
    ) fail("gsc_durable_read_proof", gscBody.meta);
    else pass("gsc_durable_read_proof", gscBody.meta.snapshot_content_sha256.slice(0, 12));
    const b = JSON.stringify(gscBody);
    if (/"email"\s*:\s*"[^"]+@/.test(b)) fail("gsc_auth_response_pii", b.slice(0, 200));
    else pass("gsc_auth_response_no_email_pii");
  }

  const publishedAtBeforeFailure = gscBody.meta?.published_at;
  const failedHistory = {
    ...currentHistory,
    parent_state_sha256: currentHistory.state_sha256,
    updated_at: new Date().toISOString(),
    last_attempt: {
      attempted_at: new Date().toISOString(),
      run_id: "failed-run",
      outcome: "RUN_FAILED",
      as_of: null,
      snapshot_sha256: null,
      reason_codes: ["dependency_unavailable", "last_known_good_available"],
    },
    readiness: {
      ...currentHistory.readiness,
      ready_for_product_decisions: false,
      status: "STALE",
      access_mode: "READ_ONLY",
      reason_codes: ["dependency_unavailable", "last_known_good_available"],
    },
  };
  failedHistory.state_sha256 = historyHash(failedHistory);
  const failedProducer = {
    schema_version: "gsc-sync-state/v1",
    manifest_schema_version: "gsc_snapshot_manifest_v1",
    manifest_sha256: null,
    as_of: null,
    produced_at: failedHistory.updated_at,
    source: "search_analytics_api",
  };
  const stateOnly = await ops.handler({
    httpMethod: "POST",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_insights_ingest" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights_ingest",
    body: JSON.stringify({ producer: failedProducer, history: failedHistory }),
  });
  const stateOnlyBody = JSON.parse(stateOnly.body || "{}");
  if (stateOnly.statusCode !== 200 || stateOnlyBody.promoted !== false) {
    fail("gsc_failure_state_persisted", stateOnlyBody);
  } else pass("gsc_failure_state_persisted");
  const readOnly = await ops.handler({
    httpMethod: "GET",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_insights" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights",
  });
  const readOnlyBody = JSON.parse(readOnly.body || "{}");
  if (
    readOnly.statusCode !== 200 ||
    readOnlyBody.meta?.ready_for_product_decisions !== false ||
    readOnlyBody.access_mode !== "READ_ONLY" ||
    readOnlyBody.meta?.snapshot_content_sha256 !== ingestedBody.content_sha256 ||
    readOnlyBody.meta?.published_at !== publishedAtBeforeFailure
  ) fail("gsc_last_known_good_read_only", readOnlyBody);
  else pass("gsc_last_known_good_read_only");

  const repeatedState = await ops.handler({
    httpMethod: "POST",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_insights_ingest" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights_ingest",
    body: JSON.stringify({ producer: failedProducer, history: failedHistory }),
  });
  const repeatedStateBody = JSON.parse(repeatedState.body || "{}");
  if (!repeatedStateBody.idempotent || repeatedStateBody.published_at !== publishedAtBeforeFailure) {
    fail("gsc_identical_state_does_not_refresh", repeatedStateBody);
  } else pass("gsc_identical_state_does_not_refresh");

  const olderHistory = {
    ...failedHistory,
    parent_state_sha256: failedHistory.state_sha256,
    readiness: {
      ...failedHistory.readiness,
      window_end: new Date(Date.parse(`${currentInsights.as_of}T00:00:00Z`) - 864e5)
        .toISOString()
        .slice(0, 10),
    },
  };
  olderHistory.state_sha256 = historyHash(olderHistory);
  const staleOverwrite = await ops.handler({
    httpMethod: "POST",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_insights_ingest" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights_ingest",
    body: JSON.stringify({ producer: failedProducer, history: olderHistory }),
  });
  const afterStaleAttempt = await ops.handler({
    httpMethod: "GET",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_history" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_history",
  });
  const afterStaleBody = JSON.parse(afterStaleAttempt.body || "{}");
  if (
    staleOverwrite.statusCode < 400 ||
    afterStaleBody.meta?.state_sha256 !== failedHistory.state_sha256
  ) fail("gsc_out_of_order_store_protected", staleOverwrite.body);
  else pass("gsc_out_of_order_store_protected");

  const pointerRecord = [...globalMemory.system.values()].find(
    (value) => value?.schema_version === "confenge-private-gsc-pointer/v1",
  );
  const [durableId, durableRecord] = [...globalMemory.system.entries()].find(
    ([, value]) => value?.snapshot_sha256 === pointerRecord.latest_snapshot_sha256,
  );
  globalMemory.system.set(durableId, {
    ...durableRecord,
    history: { ...durableRecord.history, updated_at: "tampered" },
  });
  const corruptRead = await ops.handler({
    httpMethod: "GET",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "gsc_history" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_history",
  });
  if (corruptRead.statusCode !== 409) fail("gsc_corrupt_store_rejected", corruptRead.body);
  else pass("gsc_corrupt_store_rejected");
  globalMemory.system.set(durableId, durableRecord);

  const week = await ops.handler({
    httpMethod: "GET",
    headers: { authorization: "Bearer " + "z".repeat(24) },
    queryStringParameters: { action: "weekly_report" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=weekly_report",
  });
  const weekBody = JSON.parse(week.body || "{}");
  if (!weekBody.commercial_only || weekBody.leads_total !== 1) fail("weekly_real_only", weekBody);
  else pass("weekly_real_only", weekBody.leads_total);

  if (prevTok === undefined) delete process.env.OPS_TOKEN;
  else process.env.OPS_TOKEN = prevTok;
  if (prevNode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNode;
  if (prevStore === undefined) delete process.env.LEAD_STORE;
  else process.env.LEAD_STORE = prevStore;
  globalMemory.map.clear();
  globalMemory.byIdem.clear();
  globalMemory.system.clear();
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nALL lead-stages / revops unit checks passed");
