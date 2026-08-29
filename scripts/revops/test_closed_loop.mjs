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
  const observationContract = FUNNEL.warmbly_observation_contract || {};
  if (
    observationContract.access !== "read_only"
    || observationContract.owner !== "warmbly"
    || observationContract.analytics_shape !== "aggregated_non_pii"
  ) {
    fail("warmbly_observation_contract", observationContract);
  } else pass("warmbly_observation_contract_read_only");
  const observationBlob = JSON.stringify(observationContract);
  if (/email|phone|telefone|nome|name|cnpj|cpf|mensagem|message_body/i.test(observationBlob)) {
    fail("warmbly_observation_contract_pii", observationContract);
  } else pass("warmbly_observation_contract_no_pii");
  for (const name of FUNNEL.rates) {
    if (!closedLoop.RATE_NAMES.includes(name)) fail("rate_named", name);
  }
  pass("named_rates", FUNNEL.rates.join(","));
  for (const forbiddenPolicy of ["commercial_transitions", "accept_reasons", "reject_reasons", "sla"]) {
    if (Object.prototype.hasOwnProperty.call(FUNNEL, forbiddenPolicy)) {
      fail("warmbly_policy_duplicated", forbiddenPolicy);
    }
  }
  pass("warmbly_policy_not_redeclared");
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
  if (
    report.response_time?.observed_count !== 1
    || report.response_time?.median_seconds !== expectedTempo()
    || report.response_time?.p95_seconds !== expectedTempo()
    || report.response_time?.unit !== "seconds"
  ) {
    fail("response_time_aggregate", report.response_time);
  } else pass("response_time_joined_by_lead", JSON.stringify(report.response_time));
  for (const name of FUNNEL.rates) {
    if (!(name in report.rates)) fail("missing_rate", name);
    const value = report.rates[name];
    if (value == null || typeof value !== "number") fail("rate_not_numeric", { name, value });
  }
  const expectedDenominators = {
    view_to_cta: ["cta", "view"],
    cta_to_start: ["form_start", "cta"],
    step1_to_step2: ["step2", "step1"],
    step2_to_persisted: ["persisted_after_step2_sessions", "step2"],
    persisted_to_qualified: ["qualified_leads", "persisted_leads"],
    qualified_to_proposal: ["proposal_leads", "qualified_leads"],
    proposal_to_won: ["won_leads", "proposal_leads"],
  };
  for (const [name, [numerator, denominator]] of Object.entries(expectedDenominators)) {
    const declared = report.denominators && report.denominators[name];
    if (
      !declared
      || declared.numerator !== numerator
      || declared.denominator !== denominator
      || declared.numerator_count !== report.counts[numerator]
      || declared.denominator_count !== report.counts[denominator]
      || declared.numerator_unit !== declared.denominator_unit
    ) {
      fail("denominator_contract", { name, declared, numerator, denominator });
    }
  }
  pass("denominators_explicit");
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

// --- private read-only Warmbly snapshot produces the same aggregate report ---
{
  const snapshot = {
    schema: "confenge.closed-loop-snapshot/1.0",
    schema_version: "1.0.0",
    kind: "synthetic_warmbly_snapshot",
    official_live: false,
    source: "CONFENGE_WEB",
    commercial_owner: "warmbly",
    generated_at: "2026-08-08T11:00:00.000Z",
    events: fixture.events,
    leads: [{
      record_kind: "synthetic",
      lead_id: fixture.lead.lead_id,
      session_id: fixture.lead.session_id,
      received_at: fixture.lead.received_at,
      landing_page: fixture.lead.landing_page,
      route_family: fixture.lead.route_family,
      asset_id: fixture.lead.asset_id,
      cta_id: fixture.lead.cta_id,
      jornada: fixture.lead.jornada,
      offer_id: fixture.lead.offer_id,
      origem: fixture.lead.origem,
      utm_source: fixture.lead.utm_source,
    }],
    observations: fixture.observations,
  };
  try {
    const first = closedLoop.runSnapshot(snapshot);
    const second = closedLoop.runSnapshot(snapshot);
    if (first.body !== second.body) fail("snapshot_replay_drift");
    else if (first.report.official_live !== false) fail("synthetic_snapshot_marked_live");
    else if (first.report.counts.won !== 1) fail("snapshot_won_count", first.report.counts);
    else pass("warmbly_snapshot_replay_identical");

    const rendered = await renderClosedLoopReport({ snapshot });
    if (rendered.body !== first.body) fail("private_snapshot_report_drift");
    else pass("private_snapshot_report_matches_module");

    const snapshotDir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "confenge-closed-loop-"));
    const snapshotPath = path.join(snapshotDir, "warmbly-synthetic.json");
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    const cli = spawnSync(
      process.execPath,
      [path.join(root, "scripts/revops/closed_loop_report.mjs"), "--snapshot", snapshotPath],
      { encoding: "utf8", cwd: root },
    );
    fs.rmSync(snapshotDir, { recursive: true, force: true });
    if (cli.status !== 0) fail("private_snapshot_cli_status", cli.stderr);
    else if (cli.stdout !== first.body) fail("private_snapshot_cli_drift");
    else pass("private_snapshot_cli_read_only");
  } catch (err) {
    fail("warmbly_snapshot_runner", err.code || err.message);
  }
  try {
    closedLoop.runSnapshot({
      ...snapshot,
      leads: [{ ...snapshot.leads[0], email: "lead@example.com" }],
    });
    fail("warmbly_snapshot_pii_allowed");
  } catch (err) {
    if (err.code === "pii_key_admitted" || err.code === "unsupported_snapshot_field") {
      pass("warmbly_snapshot_pii_rejected", err.code);
    } else fail("warmbly_snapshot_pii_code", err.code || err.message);
  }
  for (const [name, candidate, expectedCode] of [
    [
      "fixture_flip_cannot_self_assert_live",
      {
        ...snapshot,
        kind: "synthetic",
        official_live: true,
        leads: snapshot.leads.map((lead) => ({ ...lead, record_kind: "real" })),
      },
      "invalid_snapshot",
    ],
    [
      "partial_live_snapshot_stays_unknown",
      {
        ...snapshot,
        kind: "warmbly_aggregate_snapshot",
        official_live: true,
        producer_contract: "warmbly.closed-loop-observations/1.0",
        artifact_id: "warmbly-export-20260808-01",
        payload_sha256: "a".repeat(64),
        completeness: "partial",
        window_start: "2026-08-01T00:00:00.000Z",
        window_end: "2026-08-08T00:00:00.000Z",
        complete_through: "2026-08-07T00:00:00.000Z",
        leads: snapshot.leads.map((lead) => ({ ...lead, record_kind: "real" })),
      },
      "snapshot_incomplete",
    ],
  ]) {
    try {
      closedLoop.runSnapshot(candidate);
      fail(name);
    } catch (err) {
      if (err.code === expectedCode) pass(name, err.code);
      else fail(`${name}_code`, err.code || err.message);
    }
  }
  const official = {
    ...snapshot,
    kind: "warmbly_aggregate_snapshot",
    official_live: true,
    producer_contract: "warmbly.closed-loop-observations/1.0",
    artifact_id: "warmbly-export-20260808-01",
    completeness: "complete",
    window_start: "2026-08-01T00:00:00.000Z",
    window_end: "2026-08-08T10:00:00.000Z",
    complete_through: "2026-08-08T10:30:00.000Z",
    leads: snapshot.leads.map((lead) => ({ ...lead, record_kind: "real" })),
  };
  official.payload_sha256 = closedLoop.computeSnapshotPayloadSha256(official);
  try {
    closedLoop.runSnapshot(official);
    fail("unpinned_live_snapshot_accepted");
  } catch (err) {
    if (err.code === "snapshot_not_approved") pass("unpinned_live_snapshot_stays_unknown", err.code);
    else fail("unpinned_live_snapshot_code", err.code || err.message);
  }
  try {
    const observed = closedLoop.runSnapshot(official, {
      approvedPayloadSha256: official.payload_sha256,
    });
    if (!observed.report.official_live || observed.report.measurement_status !== "OBSERVED") {
      fail("pinned_live_snapshot_not_observed", observed.report);
    } else pass("pinned_complete_live_snapshot_observed");
  } catch (err) {
    fail("pinned_live_snapshot", err.code || err.message);
  }
  for (const field of [
    "landing_page", "landing_url", "route_family", "asset_id", "cta_id", "jornada",
    "offer_id", "origem", "utm_source", "utm_medium", "utm_campaign",
  ]) {
    // Injected value stays realistic (a real URL for landing fields), but the
    // leak check below asserts on `leakSentinel` — a non-URL-shaped token
    // embedded in it — not the URL literal itself. This is a no-leak
    // assertion on an error object, not a URL allowlist/substring sanitizer;
    // comparing against a bare URL literal reads to static analysis as the
    // latter (js/incomplete-url-substring-sanitization), so the sentinel
    // keeps the check's semantics honest while still catching a full or
    // partial leak of the sensitive value (the sentinel is a substring of it).
    const leakSentinel = field.startsWith("landing") ? "cliente-nao-vaza-9f21ac" : "Nome Cliente";
    const sensitive = field.startsWith("landing")
      ? `https://evil.example/${leakSentinel}`
      : leakSentinel;
    try {
      closedLoop.runSnapshot({
        ...snapshot,
        leads: [{ ...snapshot.leads[0], [field]: sensitive }],
      });
      fail("snapshot_attribution_text_admitted", field);
    } catch (err) {
      const serialized = JSON.stringify(err);
      if (err.code !== "invalid_attribution" || serialized.indexOf(leakSentinel) !== -1) {
        fail("snapshot_attribution_error", { field, code: err.code, serialized });
      }
    }
  }
  pass("snapshot_attribution_allowlist_fail_closed");
}

// --- route/offer/origin breakdowns stay cohort-local with multiple sessions ---
{
  const secondSessionId = closedLoop.mintStableId("session", "closed-loop-second-session");
  const secondLeadId = closedLoop.mintStableId("lead", "closed-loop-second-lead");
  const secondEvents = fixture.events.map((event, index) => ({
    ...event,
    path: "/segunda-rota/",
    sid: secondSessionId,
    session_id: secondSessionId,
    props: {
      ...event.props,
      event_id: `evt-second-${index}`,
      page_path: "/segunda-rota/",
      session_id: secondSessionId,
      lead_id: event.visitor_stage === "persisted" || event.event === "lead_persisted" ? secondLeadId : undefined,
      route_family: "segunda-rota",
      offer_id: "segunda-oferta",
      origem: "referral",
    },
  }));
  const secondLead = {
    ...fixture.lead,
    lead_id: secondLeadId,
    session_id: secondSessionId,
    received_at: "2026-08-01T10:05:00.000Z",
    landing_page: "/segunda-rota/",
    route_family: "segunda-rota",
    offer_id: "segunda-oferta",
    origem: "referral",
  };
  const admitted = closedLoop.admitVisitorEvents([...fixture.events, ...secondEvents]).admitted;
  const report = closedLoop.reconcileClosedLoop({
    events: admitted,
    leads: [secondLead, fixture.lead],
    observations: fixture.observations,
    kind: "synthetic",
  }).report;
  const firstRoute = report.by_route.find((row) => row.key === "/diagnostico-pre-licitacao/");
  const secondRoute = report.by_route.find((row) => row.key === "/segunda-rota/");
  if (!firstRoute || firstRoute.view !== 1 || firstRoute.persisted !== 1 || firstRoute.qualified !== 1) {
    fail("first_route_breakdown", firstRoute || report.by_route);
  }
  if (!secondRoute || secondRoute.view !== 1 || secondRoute.persisted !== 1 || secondRoute.qualified !== 0) {
    fail("second_route_breakdown", secondRoute || report.by_route);
  }
  if (report.by_offer.length !== 2 || report.by_origem.length !== 2) {
    fail("cohort_breakdown_dimensions", {
      by_offer: report.by_offer,
      by_origem: report.by_origem,
    });
  } else pass("cohort_breakdowns_are_local");
  if (report.response_time.median_seconds !== expectedTempo() || report.response_time.observed_count !== 1) {
    fail("response_time_reordered_join", report.response_time);
  } else pass("response_time_reordered_join_by_lead");
}

// --- duplicate leads in one session do not mix session and lead units ---
{
  const duplicateLead = {
    ...fixture.lead,
    lead_id: closedLoop.mintStableId("lead", "same-session-second-lead"),
    received_at: "2026-08-01T10:05:00.000Z",
  };
  const admitted = closedLoop.admitVisitorEvents(fixture.events).admitted;
  const report = closedLoop.reconcileClosedLoop({
    events: admitted,
    leads: [fixture.lead, duplicateLead],
    observations: fixture.observations,
    kind: "synthetic",
  }).report;
  if (
    report.counts.persisted_leads !== 2
    || report.counts.persisted_sessions !== 1
    || report.counts.persisted_after_step2_sessions !== 1
    || report.rates.step2_to_persisted > 1
    || report.denominators.step2_to_persisted.denominator_unit !== "sessions"
    || report.denominators.persisted_to_qualified.denominator_unit !== "leads"
  ) {
    fail("coherent_count_units", { counts: report.counts, denominators: report.denominators });
  } else pass("coherent_count_units");
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
  for (const [field, value] of [
    ["lead_id", "Joao Silva"],
    ["opportunity_id", "cliente importante"],
    ["proposal_id", "proposta do cliente"],
    ["sale_id", "venda para Maria"],
  ]) {
    const admitted = contract.admitEvent({
      event: "lead_persisted",
      path: "/",
      sid: fixture.ids.session_id,
      props: { event_id: `evt-invalid-${field}`, [field]: value },
    });
    if (admitted.ok || admitted.reason !== "invalid_entity_id") {
      fail("malformed_entity_id_admitted", { field, admitted });
    }
  }
  pass("malformed_entity_ids_fail_closed");
  for (const field of ["free_text", "description", "note", "comment"]) {
    const admitted = contract.admitEvent({
      event: "page_view",
      path: "/",
      sid: fixture.ids.session_id,
      props: { event_id: `evt-free-${field}`, [field]: "detalhes confidenciais" },
    });
    if (!admitted.ok || admitted.event.props[field]) {
      fail("free_text_key_admitted", { field, admitted });
    }
  }
  pass("free_text_keys_removed");
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

// --- local lead fields/entities can never substitute Warmbly observations ---
{
  const localOutcomeLead = {
    ...fixture.lead,
    commercial_stage: "won",
    opportunity_id: fixture.ids.opportunity_id,
    proposal_id: fixture.ids.proposal_id,
    sale_id: fixture.ids.sale_id,
    revenue_received: expectedWonRevenue(),
  };
  const localBundle = {
    ...fixture,
    id: "closed-loop-local-outcome-fields",
    lead: localOutcomeLead,
    observations: [],
  };
  const localWalk = await closedLoop.runFixture(localBundle, new MemoryStore());
  if (
    localWalk.report.counts.qualified !== 0
    || localWalk.report.counts.proposal !== 0
    || localWalk.report.counts.won !== 0
  ) {
    fail("local_lead_outcome_fields_counted", localWalk.report.counts);
  } else pass("local_lead_outcome_fields_ignored");

  const directEntities = closedLoop.reconcileClosedLoop({
    events: closedLoop.admitVisitorEvents(fixture.events).admitted,
    leads: [localOutcomeLead],
    observations: [],
    entities: {
      opportunity: fixture.observations[0],
      proposal: fixture.observations[1],
      sale: fixture.observations[2],
    },
    kind: "synthetic",
  });
  if (
    directEntities.report.counts.qualified !== 0
    || directEntities.report.counts.proposal !== 0
    || directEntities.report.counts.won !== 0
  ) {
    fail("direct_entities_bypassed_warmbly_contract", directEntities.report.counts);
  } else pass("commercial_entities_require_observations");

  try {
    closedLoop.reconcileClosedLoop({
      events: closedLoop.admitVisitorEvents(fixture.events).admitted,
      leads: [fixture.lead],
      observations: [
        fixture.observations[0],
        {
          ...fixture.observations[1],
          opportunity_id: closedLoop.mintStableId("opportunity", "wrong-link"),
        },
      ],
      kind: "synthetic",
    });
    fail("proposal_cross_entity_link_allowed");
  } catch (err) {
    if (err.code === "orphan_observation") pass("commercial_entity_links_verified", err.code);
    else fail("proposal_cross_entity_link_code", err.code || err.message);
  }
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
  try {
    closedLoop.applyObservation(
      { lead: { ...fixture.lead } },
      {
        stage: "qualified",
        accept_reason: "icp_fit",
        opportunity_id: fixture.ids.opportunity_id,
        lead_id: fixture.ids.lead_id,
        at: "2026-08-01T11:04:00.000Z",
      },
    );
    fail("missing_warmbly_owner_allowed");
  } catch (err) {
    if (err.code === "wrong_owner") pass("explicit_warmbly_owner_required", err.code);
    else fail("missing_owner_code", err.code || err.message);
  }
  try {
    closedLoop.reconcileClosedLoop({
      events: closedLoop.admitVisitorEvents(fixture.events).admitted,
      leads: [fixture.lead],
      observations: [{ ...fixture.observations[0], owner: "web-cfg" }],
      kind: "synthetic",
    });
    fail("reconcile_wrong_owner_allowed");
  } catch (err) {
    if (err.code === "wrong_owner") pass("reconcile_warmbly_owner_required", err.code);
    else fail("reconcile_owner_code", err.code || err.message);
  }
  try {
    closedLoop.applyObservation(
      { lead: { ...fixture.lead } },
      { ...fixture.observations[0], note: "Nome e detalhes livres do lead" },
    );
    fail("warmbly_free_text_allowed");
  } catch (err) {
    if (err.code === "pii_key_admitted") pass("warmbly_free_text_rejected", err.code);
    else fail("warmbly_free_text_code", err.code || err.message);
  }
  try {
    closedLoop.applyObservation(
      { lead: { ...fixture.lead } },
      { ...fixture.observations[0], comment: "detalhes comerciais livres" },
    );
    fail("warmbly_unknown_free_text_allowed");
  } catch (err) {
    if (err.code === "unsupported_observation_field") pass("warmbly_observation_allowlist", err.code);
    else fail("warmbly_unknown_free_text_code", err.code || err.message);
  }
  try {
    closedLoop.applyObservation(
      { lead: { ...fixture.lead } },
      { ...fixture.observations[0], actor: "Nome do vendedor" },
    );
    fail("warmbly_actor_identity_allowed");
  } catch (err) {
    if (err.code === "unsupported_actor") pass("warmbly_actor_enum_only", err.code);
    else fail("warmbly_actor_identity_code", err.code || err.message);
  }
  try {
    closedLoop.applyObservation(
      { lead: { ...fixture.lead } },
      { ...fixture.observations[0], session_id: "session-does-not-match-contract" },
    );
    fail("warmbly_malformed_session_allowed");
  } catch (err) {
    if (err.code === "invalid_entity_id") pass("warmbly_ids_are_contract_validated", err.code);
    else fail("warmbly_malformed_session_code", err.code || err.message);
  }
}

// --- Warmbly timestamps must be valid and monotonic after persistence ---
{
  try {
    closedLoop.applyObservation(
      { lead: { ...fixture.lead } },
      {
        stage: "qualified",
        owner: "warmbly",
        accept_reason: "icp_fit",
        opportunity_id: fixture.ids.opportunity_id,
        lead_id: fixture.ids.lead_id,
        at: "2026-08-01T09:59:59.000Z",
      },
    );
    fail("qualified_before_persisted_allowed");
  } catch (err) {
    if (err.code === "non_monotonic_timestamp") pass("qualified_after_persisted_required", err.code);
    else fail("qualified_timestamp_code", err.code || err.message);
  }
  try {
    closedLoop.applyObservation(
      { lead: { ...fixture.lead } },
      {
        stage: "qualified",
        owner: "warmbly",
        accept_reason: "icp_fit",
        opportunity_id: fixture.ids.opportunity_id,
        lead_id: fixture.ids.lead_id,
        at: "not-a-timestamp",
      },
    );
    fail("invalid_observation_timestamp_allowed");
  } catch (err) {
    if (err.code === "invalid_timestamp") pass("observation_timestamp_required", err.code);
    else fail("invalid_timestamp_code", err.code || err.message);
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
