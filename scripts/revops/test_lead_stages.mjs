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

const stages = require(path.join(root, "netlify/functions/lib/lead-stages.cjs"));
const { buildLeadRecord, MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
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

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nALL lead-stages / revops unit checks passed");
