/**
 * Drives scripts/revops/proposal_counting.mjs against the PROPOSED contract
 * data/revops/proposal-counting.v1.json and the eleven synthetic fixtures (a)–(k).
 * Same style as test_closed_loop.mjs: plain PASS/FAIL, exit 1 on any failure.
 *
 * Counter-proofs: a contract that sums revisions, credits UNKNOWN to inbound
 * or auto-picks the most expensive alternative must be refused, and the
 * fixture totals must differ from those undue sums.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ORIGIN_CLASSES,
  STAGES,
  assertContract,
  closeMonth,
  countFixture,
  countProposals,
  loadContract,
} from "./proposal_counting.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const fixturesDir = path.join(root, "scripts/revops/fixtures/proposal-counting.v1");

let failed = 0;
function pass(name, detail = "") {
  console.log("PASS", name, detail);
}
function fail(name, detail) {
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
  failed += 1;
}
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

const CONTRACT = loadContract();

// --- contract shape and state ---
{
  const checks = {
    schema: CONTRACT.schema === "confenge.proposal-counting/1.0",
    version: CONTRACT.version === "1.0.0",
    status: CONTRACT.status === "PROPOSED",
    official_live: CONTRACT.official_live === false,
    indicator_owner: CONTRACT.indicator_owner === "warmbly",
    web_owner: CONTRACT.web_owner === "web-cfg",
    effective_at: CONTRACT.effective_at === null,
  };
  const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (bad.length) fail("contract_header", bad);
  else pass("contract_header", `${CONTRACT.schema} ${CONTRACT.version} ${CONTRACT.status}`);

  try {
    assertContract(CONTRACT);
    pass("contract_valid");
  } catch (err) {
    fail("contract_valid", err.code || err.message);
  }

  const ruleIds = (CONTRACT.rules || []).map((r) => r.id);
  const expectedRules = ["PC-01", "PC-02", "PC-03", "PC-04", "PC-05", "PC-06", "PC-07", "PC-08", "PC-09", "PC-10", "PC-11"];
  if (!same(ruleIds, expectedRules)) fail("contract_rules", ruleIds);
  else pass("contract_rules_pc01_pc11");

  const classes = Object.keys(CONTRACT.origin_classes.values);
  if (!same(classes, [...ORIGIN_CLASSES])) fail("contract_origin_classes", classes);
  else pass("contract_origin_classes_five");
  if (CONTRACT.origin_classes.unknown_rule !== "zero") fail("contract_unknown_zero", CONTRACT.origin_classes);
  else pass("contract_unknown_contributes_zero");

  const recon = CONTRACT.reconciliation || {};
  const deltas = Array.isArray(recon.deltas) ? recon.deltas : [];
  if (deltas.length < 7) fail("reconciliation_deltas", deltas.length);
  else pass("reconciliation_deltas", String(deltas.length));
  // MEDICAO-07: the reconciliation section describes shipped behaviour by
  // pattern, never by line number (an insertion above must not fail this).
  const closedLoopSrc = fs.readFileSync(path.join(root, "netlify/functions/lib/closed-loop.cjs"), "utf8");
  if (!/duplicate_entity"?,\s*"opportunity_already_has_proposal"/.test(closedLoopSrc)) {
    fail("reconciliation_rc01_shipped_guard_missing");
  } else pass("reconciliation_rc01_shipped_guard_present");
  if (/contract_value = [^\n]*: revenue/.test(closedLoopSrc)) {
    fail("reconciliation_rc03_contract_value_still_inherits_revenue");
  } else pass("reconciliation_rc03_contract_value_never_inherits_revenue");
  if (/state\.proposal\.amount\)/.test(closedLoopSrc.split("to === \"won\"")[1] || "")) {
    fail("reconciliation_rc08_revenue_still_inherits_proposal");
  } else pass("reconciliation_rc08_revenue_never_inherits_proposal");
  const shippedTexts = deltas.map((d) => String(d.shipped || ""));
  if (shippedTexts.some((t) => /closed-loop\.cjs:\d+/.test(t))) fail("reconciliation_shipped_cites_line_numbers", shippedTexts.filter((t) => /:\d+/.test(t)));
  else pass("reconciliation_shipped_without_line_numbers");
  if (!deltas.some((d) => d.id === "RC-08")) fail("reconciliation_rc08_missing");
  else pass("reconciliation_rc08_present");
  const funnel = JSON.parse(fs.readFileSync(path.join(root, "data/revops/closed-loop-funnel.v1.json"), "utf8"));
  const allowed = new Set(funnel.warmbly_observation_contract.allowed_fields);
  const newFields = ["supersedes_proposal_id", "alternative_group_id", "fee_total_cents", "instalment_cents", "term_months", "origin_class"];
  const leaked = newFields.filter((f) => allowed.has(f));
  if (leaked.length) fail("reconciliation_rc04_premature_allowed_fields", leaked);
  else pass("reconciliation_rc04_envelope_still_closed");

  const blob = JSON.stringify(CONTRACT);
  if (/[\w.-]+@[\w-]+\.\w+|\+?55\d{9,}/.test(blob)) fail("contract_pii_values", "contract carries an e-mail or phone");
  else pass("contract_no_pii_values");
  if (/inteligência artificial|\bIA\b|algoritmo|chatbot/i.test(blob)) fail("contract_ai_mention");
  else pass("contract_no_ai_mention");
}

// --- fixtures (a)–(j) ---
const expectedFixtures = [
  "a-organic-known",
  "b-cold-email-then-site",
  "c-unknown-origin",
  "d-mixed",
  "e-revision-resend",
  "f-exclusive-options",
  "g-annual-proposal",
  "h-existing-client",
  "i-canary-synthetic",
  "j-persist-failure-retry",
  "k-revision-same-id",
];
const present = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
if (!same(present, expectedFixtures)) fail("fixtures_present", present);
else pass("fixtures_present", String(present.length));

const results = {};
for (const name of expectedFixtures) {
  const fixture = JSON.parse(fs.readFileSync(path.join(fixturesDir, `${name}.json`), "utf8"));
  if (fixture.kind !== "synthetic" || fixture.official_live !== false) {
    fail(`${name}_synthetic_header`, { kind: fixture.kind, official_live: fixture.official_live });
    continue;
  }
  if (/@|\+55\d{8,}|"nome"|"email"|"telefone"|"cnpj"/i.test(JSON.stringify(fixture.observations))) {
    fail(`${name}_pii_in_observations`);
    continue;
  }
  let result;
  try {
    result = countFixture(fixture, CONTRACT);
  } catch (err) {
    fail(`${name}_count`, err.code || err.message);
    continue;
  }
  results[name] = result;
  const exp = fixture.expected;
  const problems = [];
  if (result.emitted_total_cents !== exp.emitted_total_cents) {
    problems.push(`emitted_total_cents ${result.emitted_total_cents} != ${exp.emitted_total_cents}`);
  }
  if (result.proposals_counted.length !== exp.proposals_counted) {
    problems.push(`proposals_counted ${result.proposals_counted.length} != ${exp.proposals_counted}`);
  }
  const byId = (x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  const gotExcluded = result.excluded.map((e) => ({ id: e.id, reason: e.reason })).sort(byId);
  if (!same(gotExcluded, [...exp.excluded].sort(byId))) problems.push(`excluded ${JSON.stringify(gotExcluded)} != ${JSON.stringify(exp.excluded)}`);
  if (exp.counted_proposal_ids && !same(result.proposals_counted.map((p) => p.proposal_id), exp.counted_proposal_ids)) {
    problems.push(`counted_ids ${result.proposals_counted.map((p) => p.proposal_id)}`);
  }
  if (exp.by_origin_class && !same(result.by_origin_class, exp.by_origin_class)) {
    problems.push(`by_origin_class ${JSON.stringify(result.by_origin_class)}`);
  }
  if (exp.demonstrated_inbound_cents != null && result.demonstrated_inbound_cents !== exp.demonstrated_inbound_cents) {
    problems.push(`demonstrated_inbound_cents ${result.demonstrated_inbound_cents}`);
  }
  if (exp.by_stage && !same(result.by_stage, exp.by_stage)) problems.push(`by_stage ${JSON.stringify(result.by_stage)}`);
  if (exp.by_close_month && !same(result.by_close_month, exp.by_close_month)) {
    problems.push(`by_close_month ${JSON.stringify(result.by_close_month)}`);
  }
  if (exp.contract_value_total_cents != null && result.contract_value_total_cents !== exp.contract_value_total_cents) {
    problems.push(`contract_value_total_cents ${result.contract_value_total_cents}`);
  }
  if (exp.optional_items_total_cents != null && result.optional_items_total_cents !== exp.optional_items_total_cents) {
    problems.push(`optional_items_total_cents ${result.optional_items_total_cents}`);
  }
  if (exp.instalment_view) {
    if (result.instalment_view.monthly_instalments_total_cents !== exp.instalment_view.monthly_instalments_total_cents) {
      problems.push(`instalments_total ${result.instalment_view.monthly_instalments_total_cents}`);
    }
    if (!same(result.instalment_view.proposals, exp.instalment_view.proposals)) {
      problems.push(`instalment_proposals ${JSON.stringify(result.instalment_view.proposals)}`);
    }
  }
  if (exp.needs_decision_groups) {
    const groups = result.needs_decision.map((n) => n.alternative_group_id).filter(Boolean);
    if (!same(groups, exp.needs_decision_groups)) problems.push(`needs_decision ${JSON.stringify(result.needs_decision)}`);
  }
  // Structural invariants for every fixture.
  const stageSum = STAGES.reduce((s, st) => s + result.by_stage[st], 0);
  if (result.by_stage.emitted !== result.emitted_total_cents) problems.push("by_stage.emitted != emitted_total");
  if (result.stages_are_summable !== false || result.instalment_view.is_revenue !== false || result.contract_value_is_fee !== false) {
    problems.push("invariant flags drifted");
  }
  if (result.official_live !== false) problems.push("official_live leaked true");
  const classSum = ORIGIN_CLASSES.reduce((s, c) => s + result.by_origin_class[c], 0);
  if (classSum !== result.emitted_total_cents) problems.push(`origin classes ${classSum} != total`);
  if (!Number.isInteger(result.emitted_total_cents) || !Number.isInteger(stageSum)) problems.push("non-integer cents");
  for (const p of result.proposals_counted) {
    if (!Number.isInteger(p.fee_total_cents)) problems.push(`non-integer fee ${p.proposal_id}`);
  }
  if (problems.length) fail(name, problems);
  else pass(name, `total=${result.emitted_total_cents} counted=${result.proposals_counted.length} excluded=${result.excluded.length}`);
}

// --- close boundary in America/Sao_Paulo ---
{
  const sept = closeMonth("2026-09-30T23:30:00-03:00");
  const utcOct = closeMonth("2026-10-01T02:30:00Z");
  const oct = closeMonth("2026-10-01T00:00:00-03:00");
  if (sept !== "2026-09" || utcOct !== "2026-09" || oct !== "2026-10") fail("close_boundary", { sept, utcOct, oct });
  else pass("close_boundary_america_sao_paulo", `${sept} ${utcOct} ${oct}`);
  const a = JSON.parse(fs.readFileSync(path.join(fixturesDir, "a-organic-known.json"), "utf8"));
  const filtered = countProposals(a.observations, CONTRACT, { close_month: "2026-10" });
  if (filtered.emitted_total_cents !== 0 || !filtered.excluded.some((e) => e.reason === "outside_close_month")) {
    fail("close_month_filter", filtered);
  } else pass("close_month_filter_excludes_with_reason");
}

// --- counter-proof 1: summing a revision must fail ---
{
  const e = JSON.parse(fs.readFileSync(path.join(fixturesDir, "e-revision-resend.json"), "utf8"));
  const naive = e.observations.filter((o) => o.fee_total_cents).reduce((s, o) => s + o.fee_total_cents, 0);
  if (naive !== e.expected.naive_sum_cents) fail("revision_naive_sum_fixture", naive);
  if (results["e-revision-resend"] && results["e-revision-resend"].emitted_total_cents === naive) {
    fail("revision_summed", naive);
  } else pass("revision_not_summed", `${results["e-revision-resend"]?.emitted_total_cents} != ${naive}`);
  const summing = clone(CONTRACT);
  summing.rules.find((r) => r.id === "PC-02").revision_rule = "sum";
  try {
    countProposals(e.observations, summing);
    fail("revision_sum_contract_accepted");
  } catch (err) {
    if (err.code === "forbidden_rule") pass("revision_sum_contract_refused", err.message);
    else fail("revision_sum_contract_code", err.code || err.message);
  }
  // A revision that does not name what it supersedes is not silently counted.
  const orphan = countProposals(
    [{ record_kind: "real", event: "revised", proposal_id: "prop-x-2", opportunity_id: "opp-x", at: "2026-09-01T10:00:00-03:00", fee_total_cents: 100 }],
    CONTRACT,
  );
  if (orphan.emitted_total_cents !== 0 || orphan.excluded[0]?.reason !== "revision_without_supersedes") fail("revision_orphan", orphan);
  else pass("revision_without_supersedes_excluded");
}

// --- counter-proof 2: crediting UNKNOWN to inbound must fail ---
{
  const c = JSON.parse(fs.readFileSync(path.join(fixturesDir, "c-unknown-origin.json"), "utf8"));
  const r = results["c-unknown-origin"];
  if (!r || r.demonstrated_inbound_cents !== 0 || r.by_origin_class.demonstrated_inbound !== 0) fail("unknown_credited", r && r.by_origin_class);
  else pass("unknown_contributes_zero_to_inbound");
  for (const rule of ["split_50_50", "proportional", "direct_equals_organic"]) {
    const bad = clone(CONTRACT);
    bad.origin_classes.unknown_rule = rule;
    try {
      countProposals(c.observations, bad);
      fail(`unknown_rule_${rule}_accepted`);
    } catch (err) {
      if (err.code === "forbidden_rule") pass(`unknown_rule_${rule}_refused`);
      else fail(`unknown_rule_${rule}_code`, err.code || err.message);
    }
  }
  const promote = clone(CONTRACT);
  promote.origin_classes.missing_field = "demonstrated_inbound";
  try {
    countProposals(c.observations, promote);
    fail("missing_origin_promoted_accepted");
  } catch (err) {
    if (err.code === "forbidden_rule") pass("missing_origin_promotion_refused");
    else fail("missing_origin_promotion_code", err.code || err.message);
  }
  // The web-side class is not the commercial class: an observation carrying a
  // web value is excluded, never mapped.
  const webClass = countProposals(
    [{ record_kind: "real", event: "emitted", proposal_id: "prop-w-1", opportunity_id: "opp-w", at: "2026-09-01T10:00:00-03:00", fee_total_cents: 100, origin_class: "search_organic" }],
    CONTRACT,
  );
  if (webClass.emitted_total_cents !== 0 || webClass.excluded[0]?.reason !== "invalid_origin_class") fail("web_class_mapped", webClass);
  else pass("web_origin_class_not_mapped_to_commercial");
}

// --- counter-proof 3: most-expensive auto-pick must fail ---
{
  const f = JSON.parse(fs.readFileSync(path.join(fixturesDir, "f-exclusive-options.json"), "utf8"));
  const r = results["f-exclusive-options"];
  if (!r || r.emitted_total_cents === f.expected.most_expensive_cents || r.emitted_total_cents !== 3000000) {
    fail("most_expensive_picked", r && r.emitted_total_cents);
  } else pass("canonical_alternative_not_most_expensive", `${r.emitted_total_cents} != ${f.expected.most_expensive_cents}`);
  for (const rule of ["most_expensive", "sum", "first_emitted"]) {
    const bad = clone(CONTRACT);
    bad.rules.find((r2) => r2.id === "PC-04").alternative_rule = rule;
    try {
      countProposals(f.observations, bad);
      fail(`alternative_rule_${rule}_accepted`);
    } catch (err) {
      if (err.code === "forbidden_rule") pass(`alternative_rule_${rule}_refused`);
      else fail(`alternative_rule_${rule}_code`, err.code || err.message);
    }
  }
  // Two canonical flags in one group is a decision, not a count.
  const twoCanonical = countProposals(
    f.observations.filter((o) => o.alternative_group_id === "grp-f-1").map((o) => ({ ...o, canonical: true })),
    CONTRACT,
  );
  if (twoCanonical.emitted_total_cents !== 0 || !twoCanonical.excluded.every((e) => e.reason === "alternative_group_multiple_canonical")) {
    fail("two_canonical_counted", twoCanonical);
  } else pass("two_canonical_alternatives_fail_closed");
}

// --- money must be integer cents; floats and reais are refused ---
{
  try {
    countProposals(
      [{ record_kind: "real", event: "emitted", proposal_id: "prop-m", opportunity_id: "opp-m", at: "2026-09-01T10:00:00-03:00", fee_total_cents: 12000.5 }],
      CONTRACT,
    );
    fail("float_cents_accepted");
  } catch (err) {
    if (err.code === "invalid_money") pass("float_cents_refused");
    else fail("float_cents_code", err.code || err.message);
  }
  try {
    countProposals(
      [{ record_kind: "real", event: "emitted", proposal_id: "prop-p", opportunity_id: "opp-p", at: "2026-09-01T10:00:00-03:00", fee_total_cents: 100, email: "x@example.com" }],
      CONTRACT,
    );
    fail("pii_key_accepted");
  } catch (err) {
    if (err.code === "pii_key_admitted") pass("pii_key_refused");
    else fail("pii_key_code", err.code || err.message);
  }
  const live = clone(CONTRACT);
  live.official_live = true;
  try {
    countProposals([], live);
    fail("official_live_true_accepted");
  } catch (err) {
    if (err.code === "invalid_contract") pass("official_live_true_refused_while_proposed");
    else fail("official_live_code", err.code || err.message);
  }
}

// --- counter-proof 4 (PC-11): declared amount_cents overrides inheritance ---
{
  const base = [
    { record_kind: "real", event: "emitted", proposal_id: "prop-pc11-1", opportunity_id: "opp-pc11", at: "2026-09-01T10:00:00-03:00", fee_total_cents: 500000 },
  ];
  const inherited = countProposals(
    [...base, { record_kind: "real", event: "accepted", proposal_id: "prop-pc11-1", opportunity_id: "opp-pc11", at: "2026-09-05T10:00:00-03:00" }],
    CONTRACT,
  );
  if (inherited.by_stage.accepted !== 500000) fail("pc11_inherits_emission", inherited.by_stage);
  else pass("pc11_accepted_without_amount_inherits_emission", String(inherited.by_stage.accepted));

  const declared = countProposals(
    [...base, { record_kind: "real", event: "accepted", proposal_id: "prop-pc11-1", opportunity_id: "opp-pc11", at: "2026-09-05T10:00:00-03:00", amount_cents: 300000 }],
    CONTRACT,
  );
  if (declared.by_stage.accepted !== 300000 || declared.by_stage.accepted === declared.emitted_total_cents) {
    fail("pc11_declared_amount_overridden", declared.by_stage);
  } else pass("pc11_declared_divergent_amount_not_overwritten_by_inheritance", String(declared.by_stage.accepted));
}

// --- MEDICAO-02: a revision that reuses the stable proposal_id supersedes value and month ---
{
  const base = (o) => ({ record_kind: "real", opportunity_id: "opp-m02", at: "2026-09-01T10:00:00-03:00", ...o });
  const r = countProposals([
    base({ event: "emitted", proposal_id: "prop-m02", fee_total_cents: 5000000 }),
    base({ event: "revised", proposal_id: "prop-m02", supersedes_proposal_id: "prop-m02", at: "2026-10-04T10:00:00-03:00", fee_total_cents: 4500000 }),
  ], CONTRACT);
  const ok = r.emitted_total_cents === 4500000
    && same(r.by_close_month, { "2026-10": 4500000 })
    && r.excluded.length === 1 && r.excluded[0].reason === "superseded"
    && !r.excluded.some((e) => e.reason === "duplicate_delivery")
    && r.needs_decision.length === 0;
  if (!ok) fail("revision_same_id_supersedes", { total: r.emitted_total_cents, months: r.by_close_month, excluded: r.excluded, needs_decision: r.needs_decision });
  else pass("revision_same_id_supersedes", `${r.emitted_total_cents} @2026-10`);
  // Literal repetition of the same emission (same id + event + at) is still a retry.
  const retry = countProposals([
    base({ event: "emitted", proposal_id: "prop-m02", fee_total_cents: 5000000 }),
    base({ event: "emitted", proposal_id: "prop-m02", fee_total_cents: 5000000, delivery_attempt: 2 }),
  ], CONTRACT);
  if (retry.emitted_total_cents !== 5000000 || retry.excluded[0]?.reason !== "duplicate_delivery") fail("literal_retry_still_duplicate_delivery", retry.excluded);
  else pass("literal_retry_still_duplicate_delivery");
  // Two chained revisions on the same id: only the last one counts.
  const chain = countProposals([
    base({ event: "emitted", proposal_id: "prop-m02", fee_total_cents: 5000000 }),
    base({ event: "revised", proposal_id: "prop-m02", supersedes_proposal_id: "prop-m02", at: "2026-10-04T10:00:00-03:00", fee_total_cents: 4500000 }),
    base({ event: "revised", proposal_id: "prop-m02", supersedes_proposal_id: "prop-m02", at: "2026-11-02T10:00:00-03:00", fee_total_cents: 4000000 }),
  ], CONTRACT);
  if (chain.emitted_total_cents !== 4000000 || chain.proposals_counted.length !== 1 || chain.excluded.filter((e) => e.reason === "superseded").length !== 2) {
    fail("revision_chain_last_counts", { total: chain.emitted_total_cents, excluded: chain.excluded });
  } else pass("revision_chain_last_counts", "4000000 @2026-11");
}

// --- MEDICAO-03: instalment invoices at distinct instants are distinct stage events ---
{
  const base = (o) => ({ record_kind: "real", opportunity_id: "opp-m03", at: "2026-09-01T10:00:00-03:00", ...o });
  const r = countProposals([
    base({ event: "emitted", proposal_id: "prop-m03", fee_total_cents: 9000000, instalment_cents: 750000, term_months: 12 }),
    base({ event: "invoiced", proposal_id: "prop-m03", amount_cents: 750000, at: "2026-10-01T09:00:00-03:00" }),
    base({ event: "invoiced", proposal_id: "prop-m03", amount_cents: 750000, at: "2026-11-01T09:00:00-03:00" }),
    base({ event: "invoiced", proposal_id: "prop-m03", amount_cents: 750000, at: "2026-10-01T09:00:00-03:00", delivery_attempt: 2 }),
  ], CONTRACT);
  const dup = r.excluded.filter((e) => e.reason === "duplicate_delivery");
  if (r.by_stage.invoiced !== 1500000 || dup.length !== 1 || dup[0].delivery_attempt !== 2) {
    fail("two_instalment_invoices_counted", { by_stage: r.by_stage, excluded: r.excluded });
  } else pass("two_instalment_invoices_counted", `invoiced=${r.by_stage.invoiced} retries_excluded=${dup.length}`);
  if (r.emitted_total_cents !== 9000000 || r.by_stage.received !== 0) fail("instalments_never_revenue", r.by_stage);
  else pass("instalments_never_revenue_or_emission");
}

// --- MEDICAO-04: supersedes without a known target, or across opportunities, is a decision ---
{
  const base = (o) => ({ record_kind: "real", opportunity_id: "opp-m04", at: "2026-09-01T10:00:00-03:00", ...o });
  const orphan = countProposals([
    base({ event: "revised", proposal_id: "prop-m04b", supersedes_proposal_id: "prop-m04a", fee_total_cents: 4500000 }),
  ], CONTRACT);
  if (
    orphan.emitted_total_cents !== 0
    || orphan.excluded[0]?.reason !== "supersedes_target_unknown"
    || !orphan.needs_decision.some((n) => n.reason === "supersedes_target_unknown")
  ) fail("revision_orphan_target_needs_decision", { total: orphan.emitted_total_cents, excluded: orphan.excluded, needs_decision: orphan.needs_decision });
  else pass("revision_orphan_target_needs_decision");
  const cross = countProposals([
    base({ event: "emitted", proposal_id: "prop-m04a", opportunity_id: "opp-m04-A", fee_total_cents: 1000000 }),
    base({ event: "revised", proposal_id: "prop-m04b", opportunity_id: "opp-m04-B", supersedes_proposal_id: "prop-m04a", fee_total_cents: 2000000 }),
  ], CONTRACT);
  if (
    cross.emitted_total_cents !== 0
    || cross.excluded.length !== 2
    || !cross.excluded.every((e) => e.reason === "supersedes_cross_scope")
    || !cross.needs_decision.some((n) => n.reason === "supersedes_cross_scope")
  ) fail("revision_cross_opportunity_needs_decision", { total: cross.emitted_total_cents, excluded: cross.excluded, needs_decision: cross.needs_decision });
  else pass("revision_cross_opportunity_needs_decision");
  // Same opportunity, different effective scope is also cross-scope.
  const scope = countProposals([
    base({ event: "emitted", proposal_id: "prop-m04a", scope_id: "scope-1", fee_total_cents: 1000000 }),
    base({ event: "revised", proposal_id: "prop-m04b", scope_id: "scope-2", supersedes_proposal_id: "prop-m04a", fee_total_cents: 2000000 }),
  ], CONTRACT);
  if (scope.emitted_total_cents !== 0 || !scope.needs_decision.some((n) => n.reason === "supersedes_cross_scope")) {
    fail("revision_cross_scope_needs_decision", scope);
  } else pass("revision_cross_scope_needs_decision");
}

// --- MEDICAO-05: origin_evidence is a short token; PII-shaped values are refused everywhere ---
{
  const base = (o) => ({ record_kind: "real", opportunity_id: "opp-m05", at: "2026-09-01T10:00:00-03:00", event: "emitted", fee_total_cents: 100, ...o });
  for (const [label, value] of [
    ["url", "https://confenge.com.br/entregas/?email=x@example.com"],
    ["email", "x@example.com"],
    ["phone", "+55 48 99999-0000"],
    ["path", "/entregas/"],
    ["long", "a".repeat(65)],
  ]) {
    try {
      const r = countProposals([base({ proposal_id: "prop-m05", origin_evidence: value })], CONTRACT);
      fail(`origin_evidence_${label}_accepted`, { accepted: r.proposals_counted.length });
    } catch (err) {
      if (err.code === "invalid_observation" && /origin_evidence/.test(err.message)) pass(`origin_evidence_${label}_refused`);
      else fail(`origin_evidence_${label}_code`, err.code || err.message);
    }
  }
  const okToken = countProposals([base({ proposal_id: "prop-m05", origin_evidence: "lead-764fdf3765f48a03257979638b8" })], CONTRACT);
  if (okToken.proposals_counted.length !== 1) fail("origin_evidence_token_accepted", okToken.excluded);
  else pass("origin_evidence_token_accepted");
  // Any other string field carrying an e-mail, phone or URL is refused too (value scan, not only key scan).
  try {
    countProposals([base({ proposal_id: "prop-m05", scope_id: "escopo x@example.com" })], CONTRACT);
    fail("pii_value_in_scope_id_accepted");
  } catch (err) {
    if (err.code === "invalid_observation" && /pii_value/.test(err.message)) pass("pii_value_in_string_field_refused");
    else fail("pii_value_code", err.code || err.message);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nALL proposal-counting checks passed");
