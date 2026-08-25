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
const { aggregateEvents, attributeLeads } = require(path.join(root, "netlify/functions/lib/analytics-agg.cjs"));

let failed = 0;
function pass(name, detail = "") {
  console.log("PASS", name, detail);
}
function fail(name, detail) {
  console.error("FAIL", name, detail);
  failed += 1;
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
    { event: "page_view", path: "/conteudos/bdi-obra-publica/", sid: "s1", ts: "2026-08-01T10:00:00Z" },
    { event: "cta_click", path: "/conteudos/bdi-obra-publica/", sid: "s1", ts: "2026-08-01T10:01:00Z", props: { cta_id: "inline" } },
    { event: "lead_form_start", path: "/", sid: "s1", ts: "2026-08-01T10:02:00Z" },
    { event: "lead_form_success", path: "/", sid: "s1", ts: "2026-08-01T10:03:00Z" },
    { event: "web_vital", path: "/", sid: "s1", ts: "2026-08-01T10:00:05Z", props: { metric: "lcp", value: 1800 } },
    { event: "web_vital", path: "/", sid: "s1", ts: "2026-08-01T10:00:06Z", props: { metric: "cls", value: 0.02 } },
  ];
  const agg = aggregateEvents(events);
  if (!agg.daily.length) fail("agg_daily");
  else pass("agg_daily", agg.daily[0].events);
  if (!agg.web_vitals.lcp || agg.web_vitals.lcp.n !== 1) fail("agg_lcp", agg.web_vitals);
  else pass("agg_lcp", agg.web_vitals.lcp.p75);
  const attr = attributeLeads(
    [{ lead_id: "L1", session_id: "s1", received_at: "2026-08-01T10:03:00Z", landing_page: "/", commercial_stage: "lead_persisted" }],
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

  const loaded = ops._loadGscInsights();
  if (!loaded.ok) {
    // Fixture must exist under netlify/functions/data after PR1
    fail("gsc_insights_file_present", loaded.error);
  } else {
    pass("gsc_insights_file_present");
    const safe = ops._sanitizeGscForOps(loaded.data);
    const blob = JSON.stringify(safe);
    if (/@example\.com|telefone|whatsapp/i.test(blob) && /"email"\s*:/i.test(blob)) {
      fail("gsc_pii_in_payload", blob.slice(0, 200));
    } else pass("gsc_sanitize_no_pii_keys");
  }
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
    const b = JSON.stringify(gscBody);
    if (/"email"\s*:\s*"[^"]+@/.test(b)) fail("gsc_auth_response_pii", b.slice(0, 200));
    else pass("gsc_auth_response_no_email_pii");
  }

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
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nALL lead-stages / revops unit checks passed");
