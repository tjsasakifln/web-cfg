/**
 * Drives shipped closed-loop.cjs, event-contract, lead handler, collect and
 * the fixture report CLI. Does not reimplement admit/reconcile/report.
 */
import { createRequire } from "module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const closedLoop = require(path.join(root, "netlify/functions/lib/closed-loop.cjs"));
const stages = require(path.join(root, "netlify/functions/lib/lead-stages.cjs"));
const { MemoryStore, memoryFallbackAllowed, assertProductionStorePolicy } = require(
  path.join(root, "netlify/functions/lib/lead-store.cjs"),
);
const contract = require(path.join(root, "netlify/functions/lib/event-contract.cjs"));
const collect = require(path.join(root, "netlify/functions/collect.cjs"));
const { rateLimit, _reset } = require(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"));
const { renderClosedLoopReport } = await import(path.join(root, "scripts/revops/closed_loop_report.mjs"));

let failed = 0;
function pass(name, detail = "") {
  console.log("PASS", name, detail);
}
function fail(name, detail) {
  console.error("FAIL", name, detail);
  failed += 1;
}

const fixture = closedLoop.loadFixture(closedLoop.defaultFixturePath());
const FUNNEL = closedLoop.getContract();

function qualifiedAt() {
  return (fixture.observations.find((o) => o.stage === "qualified") || {}).at;
}

function expectedTempo() {
  const a = Date.parse(fixture.lead.received_at);
  const b = Date.parse(qualifiedAt());
  return Math.round((b - a) / 1000);
}

function expectedWonRevenue() {
  const won = fixture.observations.find((o) => o.stage === "won") || fixture.won || {};
  return Number(won.revenue);
}

function expectedCount(stage) {
  return (fixture.observations || []).filter((o) => o.stage === stage).length;
}

// --- contract versioning ---
{
  if (FUNNEL.schema !== "confenge.closed-loop-funnel/1.0") fail("contract_schema", FUNNEL.schema);
  else pass("contract_schema", FUNNEL.schema_version);
  if (FUNNEL.commercial_owner !== "warmbly") fail("commercial_owner", FUNNEL.commercial_owner);
  else pass("commercial_owner");
  for (const name of FUNNEL.rates) {
    if (!closedLoop.RATE_NAMES.includes(name)) fail("rate_named", name);
  }
  pass("named_rates", FUNNEL.rates.join(","));
  if (JSON.stringify(stages.LOSS_REASONS) !== JSON.stringify(FUNNEL.reject_reasons)) {
    fail("reject_reasons_mismatch", stages.LOSS_REASONS);
  } else pass("reject_reasons_versioned");
  if (JSON.stringify(stages.ACCEPT_REASONS) !== JSON.stringify(FUNNEL.accept_reasons)) {
    fail("accept_reasons_mismatch", stages.ACCEPT_REASONS);
  } else pass("accept_reasons_versioned");
  if (stages.SLA.version !== FUNNEL.sla.version) fail("sla_version", stages.SLA);
  else pass("sla_versioned", stages.SLA.version);
  const minted = closedLoop.mintStableId("session", fixture.seed);
  if (minted !== fixture.ids.session_id) fail("mint_session", { minted, expected: fixture.ids.session_id });
  else pass("mint_session_deterministic", minted);
  for (const kind of closedLoop.ID_KINDS) {
    const id = fixture.ids[`${kind}_id`] || fixture.ids[kind];
    if (!closedLoop.isStableId(kind, id)) fail("fixture_id", { kind, id });
  }
  pass("fixture_ids_stable");
}

// --- full synthetic walk from cold store ---
const store = new MemoryStore();
const walk = await closedLoop.runFixture(fixture, store);
{
  const report = walk.report;
  if (walk.duplicated) fail("first_walk_duplicated");
  else pass("first_walk_persisted");
  if (report.entities.session_id !== fixture.ids.session_id) fail("session_id", report.entities);
  else pass("session_id", report.entities.session_id);
  if (report.entities.lead_id !== fixture.ids.lead_id) fail("lead_id", report.entities);
  else pass("lead_id", report.entities.lead_id);
  if (report.entities.opportunity_id !== fixture.ids.opportunity_id) fail("opportunity_id", report.entities);
  else pass("opportunity_id", report.entities.opportunity_id);
  if (report.entities.proposal_id !== fixture.ids.proposal_id) fail("proposal_id", report.entities);
  else pass("proposal_id", report.entities.proposal_id);
  if (report.entities.sale_id !== fixture.ids.sale_id) fail("sale_id", report.entities);
  else pass("sale_id", report.entities.sale_id);
  if (report.counts.persisted !== (fixture.lead ? 1 : 0)) fail("persisted_count", report.counts);
  else pass("one_lead", report.counts.persisted);
  if (report.counts.qualified !== expectedCount("qualified")) fail("qualified_count", report.counts);
  else pass("qualified_observed", report.counts.qualified);
  if (report.counts.proposal !== expectedCount("proposal")) fail("proposal_count", report.counts);
  else pass("proposal_observed", report.counts.proposal);
  if (report.counts.won !== expectedCount("won")) fail("won_count", report.counts);
  else pass("won_observed", report.counts.won);
  if (report.revenue !== expectedWonRevenue()) fail("revenue", { got: report.revenue, expected: expectedWonRevenue() });
  else pass("revenue_matches_fixture", report.revenue);
  if (report.tempo_de_resposta_seconds !== expectedTempo()) {
    fail("tempo", { got: report.tempo_de_resposta_seconds, expected: expectedTempo() });
  } else pass("tempo_de_resposta_seconds", report.tempo_de_resposta_seconds);
  if (typeof report.tempo_de_resposta_seconds !== "number") fail("tempo_not_numeric");
  for (const name of FUNNEL.rates) {
    if (!(name in report.rates)) fail("missing_rate", name);
    const value = report.rates[name];
    if (value == null || typeof value !== "number") fail("rate_not_numeric", { name, value });
  }
  pass("closed_rates", JSON.stringify(report.rates));
  if (report.raw_lead_is_qualified !== false) fail("raw_flag", report.raw_lead_is_qualified);
  else pass("raw_lead_not_counted_as_qualified");
  if (report.derived_qualified || report.derived_proposal || report.derived_won) {
    fail("derived_flags", report);
  } else pass("commercial_stages_observed_only");
  for (const field of FUNNEL.attribution_fields) {
    if (!report.attribution[field]) fail("attr_missing", field);
  }
  pass("attribution_carried", JSON.stringify(report.attribution));
  if (!report.by_route.length || !report.by_offer.length || !report.by_origem.length) {
    fail("breakdown_empty", { route: report.by_route, offer: report.by_offer, origem: report.by_origem });
  } else pass("breakdown_route_offer_origem");
  const listed = await store.list();
  if (listed.length !== 1) fail("store_one_lead", listed.length);
  else pass("store_one_lead", listed[0].lead_id);
}

// --- replay is idempotent ---
{
  const again = await closedLoop.runFixture(fixture, store);
  if (!again.duplicated) fail("replay_not_idempotent");
  else pass("replay_idempotent_persist");
  if (JSON.stringify(again.report) !== JSON.stringify(walk.report)) {
    fail("replay_report_drift", { first: walk.report, second: again.report });
  } else pass("replay_report_identical");
  const listed = await store.list();
  if (listed.length !== 1) fail("replay_duplicated_lead", listed.length);
  else pass("replay_no_duplicate_lead", listed.length);
}

// --- CLI report twice, identical ---
{
  const a = await renderClosedLoopReport({ fixture: closedLoop.defaultFixturePath() });
  const b = await renderClosedLoopReport({ fixture: closedLoop.defaultFixturePath() });
  if (a.body !== b.body) fail("cli_report_drift");
  else pass("cli_report_deterministic");
  const cli1 = spawnSync(process.execPath, [path.join(root, "scripts/revops/closed_loop_report.mjs")], {
    encoding: "utf8",
    cwd: root,
  });
  const cli2 = spawnSync(process.execPath, [path.join(root, "scripts/revops/closed_loop_report.mjs")], {
    encoding: "utf8",
    cwd: root,
  });
  if (cli1.status !== 0) fail("cli_status_1", cli1.stderr);
  else if (cli2.status !== 0) fail("cli_status_2", cli2.stderr);
  else if (cli1.stdout !== cli2.stdout) fail("cli_stdout_drift");
  else pass("cli_spawn_identical");
  if (cli1.stdout !== a.body) fail("cli_vs_module");
  else pass("cli_matches_module");
}

// --- PII rejected on admit ---
{
  try {
    closedLoop.admitVisitorEvents([
      {
        event: "page_view",
        path: "/",
        sid: fixture.ids.session_id,
        props: { event_id: "evt-pii-1", email: "ceo@empresa.com.br" },
      },
    ]);
    fail("pii_email_admitted");
  } catch (err) {
    if (err.code === "pii_value" || err.code === "pii_key_admitted") pass("pii_email_rejected", err.code);
    else fail("pii_email_code", err.code || err.message);
  }
  try {
    closedLoop.admitVisitorEvents([
      {
        event: "cta_click",
        path: "/",
        sid: fixture.ids.session_id,
        props: { event_id: "evt-pii-2", telefone: "+5548999999999", cta_id: "hero" },
      },
    ]);
    fail("pii_phone_admitted");
  } catch (err) {
    if (err.code === "pii_value" || err.code === "pii_key_admitted") pass("pii_phone_rejected", err.code);
    else fail("pii_phone_code", err.code || err.message);
  }
  try {
    closedLoop.admitVisitorEvents([
      {
        event: "lead_form_start",
        path: "/",
        sid: fixture.ids.session_id,
        props: { event_id: "evt-pii-3", mensagem: "texto livre do contrato" },
      },
    ]);
    fail("pii_message_admitted");
  } catch (err) {
    if (err.code === "pii_value" || err.code === "pii_key_admitted") pass("pii_message_rejected", err.code);
    else fail("pii_message_code", err.code || err.message);
  }
  const admittedBlob = JSON.stringify(walk.admitted);
  if (/@|\+55\d{10}|mensagem|message_body/.test(admittedBlob)) fail("admitted_pii_scan", admittedBlob.slice(0, 200));
  else pass("admitted_events_no_pii");
  closedLoop.assertAnalyticsNoPii(walk.report);
  pass("report_no_pii");
}

// --- observed_only cannot enter visitor admit ---
{
  try {
    closedLoop.admitVisitorEvents([
      {
        event: "qualified_lead",
        path: "/",
        sid: fixture.ids.session_id,
        props: { event_id: "evt-ql-1" },
      },
    ]);
    fail("qualified_lead_admitted");
  } catch (err) {
    if (err.code === "observed_owner_only") pass("qualified_lead_observed_only", err.code);
    else fail("qualified_lead_code", err.code || err.message);
  }
}

// --- orphan event ---
{
  try {
    closedLoop.reconcileClosedLoop({
      events: [
        {
          event: "lead_persisted",
          sid: fixture.ids.session_id,
          session_id: fixture.ids.session_id,
          path: "/diagnostico-pre-licitacao/",
          props: { lead_id: "lead-fffffffffffffffffffffffffff", event_id: "evt-orphan-1" },
          visitor_stage: "persisted",
        },
      ],
      leads: [fixture.lead],
      observations: [],
      attribution: fixture.attribution,
    });
    fail("orphan_event_accepted");
  } catch (err) {
    if (err.code === "orphan_event") pass("orphan_event_fail_closed", err.message);
    else fail("orphan_event_code", err.code || err.message);
  }
}

// --- invalid commercial skip ---
{
  const mem = new MemoryStore();
  await closedLoop.persistLeadOnce(mem, { ...fixture.lead });
  const persisted = { lead: { ...fixture.lead }, opportunity: null, proposal: null, sale: null };
  try {
    closedLoop.applyObservation(persisted, {
      stage: "won",
      owner: "warmbly",
      lead_id: fixture.ids.lead_id,
      sale_id: fixture.ids.sale_id,
      revenue: expectedWonRevenue(),
      at: "2026-08-08T10:00:00.000Z",
    });
    fail("skip_to_won_allowed");
  } catch (err) {
    if (err.code === "invalid_transition") pass("invalid_transition_fail_closed", err.message);
    else fail("invalid_transition_code", err.code || err.message);
  }
  try {
    closedLoop.applyObservation(persisted, {
      stage: "proposal",
      owner: "warmbly",
      lead_id: fixture.ids.lead_id,
      proposal_id: fixture.ids.proposal_id,
      amount: expectedWonRevenue(),
      at: "2026-08-01T14:00:00.000Z",
    });
    fail("skip_to_proposal_allowed");
  } catch (err) {
    if (err.code === "invalid_transition") pass("proposal_without_qualified_denied", err.message);
    else fail("proposal_skip_code", err.code || err.message);
  }
}

// --- raw persisted lead is not qualified ---
{
  const mem = new MemoryStore();
  const admitted = closedLoop.admitVisitorEvents(fixture.events);
  const persist = await closedLoop.persistLeadOnce(mem, { ...fixture.lead, lead_id: fixture.lead.lead_id });
  const reconciled = closedLoop.reconcileClosedLoop({
    events: admitted.admitted,
    leads: [persist.record],
    observations: [],
    entities: { lead: persist.record, opportunity: null, proposal: null, sale: null },
    attribution: fixture.attribution,
    kind: "synthetic",
  });
  if (reconciled.report.counts.qualified !== 0) fail("raw_counted_qualified", reconciled.report.counts);
  else pass("raw_lead_not_qualified", reconciled.report.counts);
  if (reconciled.report.counts.won !== 0) fail("raw_counted_won", reconciled.report.counts);
  else pass("raw_lead_not_won");
  if (closedLoop.isRawLeadQualified(persist.record, null)) fail("helper_raw_qualified");
  else pass("helper_raw_not_qualified");
}

// --- observation without persist ---
{
  try {
    closedLoop.applyObservation(
      { lead: null },
      {
        stage: "qualified",
        owner: "warmbly",
        accept_reason: "icp_fit",
        opportunity_id: fixture.ids.opportunity_id,
        at: "2026-08-01T11:04:00.000Z",
      },
    );
    fail("obs_without_lead_allowed");
  } catch (err) {
    if (err.code === "orphan_observation") pass("observation_requires_lead", err.code);
    else fail("obs_without_lead_code", err.code || err.message);
  }
}

// --- wrong owner cannot promote ---
{
  try {
    closedLoop.applyObservation(
      { lead: { ...fixture.lead } },
      {
        stage: "qualified",
        owner: "web-cfg",
        accept_reason: "icp_fit",
        opportunity_id: fixture.ids.opportunity_id,
        lead_id: fixture.ids.lead_id,
        at: "2026-08-01T11:04:00.000Z",
      },
    );
    fail("webcfg_qualified_allowed");
  } catch (err) {
    if (err.code === "wrong_owner") pass("warmbly_owner_required", err.code);
    else fail("wrong_owner_code", err.code || err.message);
  }
}

// --- timeout fail-closed ---
{
  const hanging = {
    async get() {
      return null;
    },
    async getByIdempotency() {
      return null;
    },
    put() {
      return new Promise(() => {});
    },
  };
  try {
    await closedLoop.withTimeout(closedLoop.persistLeadOnce(hanging, fixture.lead), 40, "timeout");
    fail("timeout_not_raised");
  } catch (err) {
    if (err.code === "timeout") pass("persist_timeout", err.code);
    else fail("timeout_code", err.code || err.message);
  }
}

// --- production memory fallback forbidden ---
{
  if (memoryFallbackAllowed({ NODE_ENV: "production", LEAD_ALLOW_MEMORY_FALLBACK: "1" })) {
    fail("prod_memory_fallback_allowed");
  } else pass("prod_memory_fallback_denied");
  const policy = assertProductionStorePolicy({
    NODE_ENV: "production",
    LEAD_ALLOW_MEMORY_FALLBACK: "1",
  });
  if (policy.ok || policy.code !== "memory_fallback_forbidden_in_production") {
    fail("prod_policy", policy);
  } else pass("prod_policy_fail_closed", policy.code);
}

// --- collect production fallback (no durable store) ---
{
  const prevNode = process.env.NODE_ENV;
  const prevStore = process.env.LEAD_STORE;
  const prevCtx = process.env.CONTEXT;
  const prevBackend = process.env.CONFENGE_STORAGE_BACKEND;
  const prevDir = process.env.CONFENGE_STORAGE_DIR;
  const prevLeadDir = process.env.LEAD_STORE_DIR;
  process.env.NODE_ENV = "production";
  process.env.LEAD_STORE = "memory";
  delete process.env.CONTEXT;
  delete process.env.CONFENGE_STORAGE_BACKEND;
  delete process.env.CONFENGE_STORAGE_DIR;
  delete process.env.LEAD_STORE_DIR;
  try {
    const res = await collect.handler({
      httpMethod: "POST",
      headers: { origin: "https://confenge.com.br", "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            event: "page_view",
            path: "/diagnostico-pre-licitacao/",
            sid: fixture.ids.session_id,
            props: { event_id: `evt-fallback-${Date.now()}`, route_family: "diagnostico-pre-licitacao" },
          },
        ],
      }),
    });
    if (res.statusCode !== 503) fail("collect_fallback_status", res.statusCode + " " + res.body);
    else {
      const body = JSON.parse(res.body || "{}");
      if (body.error !== "durable_store_unavailable") fail("collect_fallback_error", body);
      else pass("collect_fallback_503", body.error);
    }
  } finally {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevStore === undefined) delete process.env.LEAD_STORE;
    else process.env.LEAD_STORE = prevStore;
    if (prevCtx === undefined) delete process.env.CONTEXT;
    else process.env.CONTEXT = prevCtx;
    if (prevBackend === undefined) delete process.env.CONFENGE_STORAGE_BACKEND;
    else process.env.CONFENGE_STORAGE_BACKEND = prevBackend;
    if (prevDir === undefined) delete process.env.CONFENGE_STORAGE_DIR;
    else process.env.CONFENGE_STORAGE_DIR = prevDir;
    if (prevLeadDir === undefined) delete process.env.LEAD_STORE_DIR;
    else process.env.LEAD_STORE_DIR = prevLeadDir;
  }
}

// --- consent via shipped lead handler ---
{
  const leadPath = path.join(root, "netlify/functions/lead.cjs");
  delete require.cache[require.resolve(leadPath)];
  const leadMod = require(leadPath);
  const mem = new MemoryStore();
  leadMod.setStoreForTests(mem);
  const denied = await leadMod.handler({
    httpMethod: "POST",
    headers: { origin: "https://confenge.com.br", "content-type": "application/json" },
    body: JSON.stringify({
      nome: "QA Consent",
      telefone: "48999990000",
      estagio: "edital",
      jornada: "edital",
      session_id: fixture.ids.session_id,
    }),
  });
  const deniedBody = JSON.parse(denied.body || "{}");
  if (denied.statusCode !== 400 || deniedBody.error !== "consent") fail("lead_consent", deniedBody);
  else pass("lead_consent_required", deniedBody.error);
}

// --- rate limit shipped helper ---
{
  _reset();
  process.env.LEAD_RATE_MAX_IP = "2";
  process.env.LEAD_RATE_WINDOW_MS = "60000";
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"))];
  const fresh = require(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"));
  fresh._reset();
  const ip = "203.0.113.90";
  const a = fresh.rateLimit({ ip, fingerprint: "fp-a" });
  const b = fresh.rateLimit({ ip, fingerprint: "fp-a" });
  const c = fresh.rateLimit({ ip, fingerprint: "fp-a" });
  if (!a.allowed || !b.allowed) fail("rate_allow_first", { a, b });
  else if (c.allowed) fail("rate_not_limited", c);
  else pass("rate_limit_blocks", c.reason);
  delete process.env.LEAD_RATE_MAX_IP;
  delete process.env.LEAD_RATE_WINDOW_MS;
}

// --- CRM stage helper still fail-closed for skip ---
{
  try {
    stages.applyStageChange(
      { lead_id: fixture.ids.lead_id, commercial_stage: "lead_persisted", stage_history: [] },
      { stage: "won", actor: "ops" },
    );
    fail("crm_skip_won");
  } catch (err) {
    if (err.code === "transition_denied") pass("crm_skip_won_denied");
    else fail("crm_skip_code", err.code);
  }
}

// --- event-contract still refuses to derive ---
{
  const rec = contract.reconcileFunnel({ events: fixture.events });
  if (rec.derived_qualified_lead !== false) fail("contract_derived_ql");
  else pass("contract_not_derived");
  if (rec.observed.qualified_lead !== "UNKNOWN") fail("contract_observed_unknown", rec.observed);
  else pass("contract_qualified_unknown_without_warmbly");
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nALL closed-loop checks passed");
