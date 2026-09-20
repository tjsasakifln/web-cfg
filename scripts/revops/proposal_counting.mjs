/**
 * Reference implementation of data/revops/proposal-counting.v1.json
 * (confenge.proposal-counting/1.0, status PROPOSED, official_live false).
 *
 * Pure functions. The contract is an input, never read implicitly from disk
 * except by the loadContract helper. Nothing here touches the lead store,
 * the closed-loop walk or production data: the only consumers are the
 * synthetic fixtures under scripts/revops/fixtures/proposal-counting.v1/.
 *
 * countProposals(observations, contract, options) returns
 *   { emitted_total_cents, proposals_counted, excluded: [{id, reason, ...}],
 *     by_origin_class, by_stage, by_close_month, instalment_view, ... }
 *
 * Every excluded observation carries a reason so that a zero or a total can be
 * audited line by line. Forbidden counting rules (summing revisions, splitting
 * UNKNOWN into inbound, auto-picking the most expensive alternative) are
 * refused at contract validation, not silently applied.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export const CONTRACT_SCHEMA = "confenge.proposal-counting/1.0";
export const OBSERVATION_SCHEMA = "confenge.proposal-observation/1.0";

export const EVENTS = Object.freeze(["emitted", "revised", "resent", "accepted", "invoiced", "received"]);
export const EMISSION_EVENTS = new Set(["emitted", "revised"]);
export const STAGE_EVENTS = new Set(["accepted", "invoiced", "received"]);
export const ORIGIN_CLASSES = Object.freeze([
  "demonstrated_inbound",
  "outbound_assisted",
  "mixed_or_unknown",
  "expansion_existing_client",
  "paid_or_partner",
]);
export const STAGES = Object.freeze(["emitted", "accepted", "invoiced", "received"]);

export function defaultContractPath() {
  return path.join(ROOT, "data/revops/proposal-counting.v1.json");
}

export function loadContract(file = defaultContractPath()) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function codedError(code, message, extra = {}) {
  const err = new Error(message || code);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/**
 * Fail-closed contract validation. A contract that asks for a forbidden
 * counting rule is refused here, so no caller can "configure" undue counting.
 */
export function assertContract(contract) {
  if (!contract || typeof contract !== "object") throw codedError("invalid_contract", "contract_required");
  if (contract.schema !== CONTRACT_SCHEMA) {
    throw codedError("invalid_contract", `contract_schema:${contract.schema}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(String(contract.version || ""))) {
    throw codedError("invalid_contract", "contract_version_semver_required");
  }
  if (contract.official_live !== false) {
    throw codedError("invalid_contract", "official_live_must_be_false_while_proposed");
  }
  if (contract.indicator_owner !== "warmbly") {
    throw codedError("invalid_contract", "indicator_owner_must_be_warmbly");
  }
  const rules = Array.isArray(contract.rules) ? contract.rules : [];
  const byName = new Map(rules.map((r) => [r.name, r]));

  const revision = byName.get("revision_supersedes_never_sums");
  if (!revision || revision.revision_rule !== "supersedes") {
    throw codedError("forbidden_rule", "revision_rule_must_be_supersedes", {
      got: revision ? revision.revision_rule : null,
    });
  }

  const alternatives = byName.get("exclusive_alternatives_count_once");
  if (!alternatives || alternatives.alternative_rule !== "canonical_flag") {
    throw codedError("forbidden_rule", "alternative_rule_must_be_canonical_flag", {
      got: alternatives ? alternatives.alternative_rule : null,
    });
  }

  const origin = contract.origin_classes || {};
  if (origin.unknown_rule !== "zero") {
    throw codedError("forbidden_rule", "unknown_origin_must_contribute_zero", { got: origin.unknown_rule || null });
  }
  if (origin.missing_field !== "mixed_or_unknown") {
    throw codedError("forbidden_rule", "missing_origin_must_be_mixed_or_unknown", { got: origin.missing_field || null });
  }
  const values = Object.keys(origin.values || {});
  for (const cls of ORIGIN_CLASSES) {
    if (!values.includes(cls)) throw codedError("invalid_contract", `origin_class_missing:${cls}`);
  }
  if (values.length !== ORIGIN_CLASSES.length) {
    throw codedError("invalid_contract", "origin_classes_must_be_exactly_five", { values });
  }

  const close = contract.close || {};
  if (close.timezone !== "America/Sao_Paulo" || close.boundary !== "calendar_month") {
    throw codedError("invalid_contract", "close_must_be_calendar_month_america_sao_paulo", { close });
  }
  const money = contract.money || {};
  if (money.unit !== "BRL_cents" || money.type !== "integer" || money.floats_forbidden !== true) {
    throw codedError("invalid_contract", "money_must_be_integer_brl_cents", { money });
  }
  const kinds = contract.record_kind || {};
  if (!Array.isArray(kinds.counted) || kinds.counted.join(",") !== "real") {
    throw codedError("invalid_contract", "only_real_records_count", { counted: kinds.counted });
  }
  return contract;
}

function intCents(value, field, obsId) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw codedError("invalid_money", `${field}_must_be_non_negative_integer_cents`, { field, observation: obsId });
  }
  return value;
}

function timestampMs(at, obsId) {
  const ms = Date.parse(String(at || ""));
  if (!Number.isFinite(ms)) throw codedError("invalid_timestamp", "observation_at_invalid", { observation: obsId });
  return ms;
}

/** Calendar month (YYYY-MM) of an instant in the contract's close timezone. */
export function closeMonth(at, timezone = "America/Sao_Paulo") {
  const ms = Date.parse(String(at || ""));
  if (!Number.isFinite(ms)) throw codedError("invalid_timestamp", "close_month_at_invalid");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" })
    .formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  return `${year}-${month}`;
}

function observationId(obs, index) {
  if (obs && obs.observation_id) return String(obs.observation_id);
  const pid = obs && obs.proposal_id ? obs.proposal_id : `#${index}`;
  return `${pid}/${obs && obs.event ? obs.event : "?"}`;
}

const PII_KEYS = new Set(["nome", "name", "email", "telefone", "phone", "cnpj", "cpf", "mensagem", "message", "note", "free_text", "description", "url", "referrer"]);
// MEDICAO-05: keys are not enough — values are scanned too. `origin_evidence`
// is a short token (lead_id, campaign id), never a URL, path or identifier.
const ORIGIN_EVIDENCE_RE = /^[a-z0-9_.:-]{1,64}$/i;
// Phone runs are bounded by non-alphanumerics so a hex token (lead_id) with an
// embedded digit run is not mistaken for a number.
const PII_VALUE_RE = /@|https?:\/\/|www\.|(?<![a-z0-9])\+?\d[\d\s().-]{8,}\d(?![a-z0-9])/i;
// Timestamps are the only string field allowed to look like a long digit run.
const VALUE_SCAN_EXEMPT = new Set(["at"]);

function assertNoPiiValues(raw, id) {
  for (const [key, value] of Object.entries(raw)) {
    if (VALUE_SCAN_EXEMPT.has(key)) continue;
    const values = Array.isArray(value) ? value.map((v) => (v && typeof v === "object" ? Object.values(v) : v)).flat() : [value];
    for (const v of values) {
      if (typeof v === "string" && PII_VALUE_RE.test(v)) {
        throw codedError("invalid_observation", `pii_value_admitted:${key}`, { observation: id, field: key });
      }
    }
  }
  if (raw.origin_evidence != null && !ORIGIN_EVIDENCE_RE.test(String(raw.origin_evidence))) {
    throw codedError("invalid_observation", "origin_evidence_token_required", { observation: id, field: "origin_evidence" });
  }
}

function normalizeObservation(raw, index) {
  const id = observationId(raw, index);
  if (!raw || typeof raw !== "object") throw codedError("invalid_observation", "observation_object_required", { observation: id });
  for (const key of Object.keys(raw)) {
    if (PII_KEYS.has(key)) throw codedError("pii_key_admitted", `proposal_observation_pii_key:${key}`, { observation: id });
  }
  assertNoPiiValues(raw, id);
  if (!EVENTS.includes(raw.event)) throw codedError("invalid_event", `event:${raw.event}`, { observation: id });
  if (!raw.proposal_id || !raw.opportunity_id) {
    throw codedError("invalid_observation", "proposal_id_and_opportunity_id_required", { observation: id });
  }
  const at = String(raw.at || "");
  const atMs = timestampMs(at, id);
  return {
    id,
    raw,
    record_kind: raw.record_kind == null ? null : String(raw.record_kind),
    event: raw.event,
    proposal_id: String(raw.proposal_id),
    opportunity_id: String(raw.opportunity_id),
    scope_id: raw.scope_id ? String(raw.scope_id) : null,
    at,
    atMs,
    fee_total_cents: intCents(raw.fee_total_cents, "fee_total_cents", id),
    instalment_cents: intCents(raw.instalment_cents, "instalment_cents", id),
    term_months: raw.term_months == null ? null : (Number.isInteger(raw.term_months) && raw.term_months > 0
      ? raw.term_months
      : (() => { throw codedError("invalid_money", "term_months_must_be_positive_integer", { observation: id }); })()),
    contract_value_cents: intCents(raw.contract_value_cents, "contract_value_cents", id),
    amount_cents: intCents(raw.amount_cents, "amount_cents", id),
    supersedes_proposal_id: raw.supersedes_proposal_id ? String(raw.supersedes_proposal_id) : null,
    alternative_group_id: raw.alternative_group_id ? String(raw.alternative_group_id) : null,
    canonical: raw.canonical === true,
    optional_items: Array.isArray(raw.optional_items)
      ? raw.optional_items.map((item, i) => ({
        item_id: String(item.item_id || `${id}/opt${i}`),
        fee_cents: intCents(item.fee_cents, "optional_items.fee_cents", id) || 0,
      }))
      : [],
    origin_class: raw.origin_class == null ? null : String(raw.origin_class),
    origin_evidence: raw.origin_evidence == null ? null : String(raw.origin_evidence),
    delivery_attempt: raw.delivery_attempt == null ? 1 : Number(raw.delivery_attempt),
  };
}

function zeroByClass() {
  const out = {};
  for (const cls of ORIGIN_CLASSES) out[cls] = 0;
  return out;
}

function zeroByStage() {
  const out = {};
  for (const stage of STAGES) out[stage] = 0;
  return out;
}

/**
 * @param {Array<object>} observations proposal observations (confenge.proposal-observation/1.0)
 * @param {object} contract data/revops/proposal-counting.v1.json (validated here)
 * @param {{close_month?: string}} options optional YYYY-MM filter on the counting emission
 */
export function countProposals(observations, contract, options = {}) {
  assertContract(contract);
  if (!Array.isArray(observations)) throw codedError("invalid_observation", "observations_array_required");
  const timezone = contract.close.timezone;
  const counted = new Set(contract.record_kind.counted);
  const excluded = [];
  const needsDecision = [];
  const exclude = (obs, reason, extra = {}) => excluded.push({ id: obs.id, reason, ...extra });

  const normalized = observations.map(normalizeObservation);

  // PC-09: record_kind fail-closed.
  const live = [];
  for (const obs of normalized) {
    if (!obs.record_kind) exclude(obs, "record_kind_missing");
    else if (!counted.has(obs.record_kind)) exclude(obs, "record_kind_excluded", { record_kind: obs.record_kind });
    else live.push(obs);
  }

  // PC-03 / PC-10: resend is not an emission. A retry is the LITERAL
  // repetition of (proposal_id, event, at): only that is duplicate_delivery
  // (MEDICAO-02/03). Distinct instants of the same event are distinct
  // observations — a revision reusing the stable id, an instalment invoice, a
  // partial receipt.
  const seen = new Set();
  const emissionsByProposal = new Map(); // proposal_id -> [emission observations, in order]
  const stageEvents = [];
  for (const obs of live) {
    if (obs.event === "resent") {
      exclude(obs, "resend_not_emission");
      continue;
    }
    const key = `${obs.proposal_id}|${obs.event}|${obs.at}`;
    if (seen.has(key)) {
      exclude(obs, "duplicate_delivery", { delivery_attempt: obs.delivery_attempt });
      continue;
    }
    seen.add(key);
    if (EMISSION_EVENTS.has(obs.event)) {
      if (obs.fee_total_cents == null) {
        exclude(obs, "emission_without_fee_total");
        continue;
      }
      if (obs.event === "revised" && !obs.supersedes_proposal_id) {
        exclude(obs, "revision_without_supersedes");
        continue;
      }
      if (!emissionsByProposal.has(obs.proposal_id)) emissionsByProposal.set(obs.proposal_id, []);
      emissionsByProposal.get(obs.proposal_id).push(obs);
    } else {
      stageEvents.push(obs);
    }
  }

  // PC-02: revision supersedes, never sums. A revision may reuse the stable
  // proposal_id (supersedes_proposal_id === proposal_id) or name a new one.
  // The target must exist in the input and share opportunity + scope;
  // otherwise the chain is a decision, never a silent count (MEDICAO-04).
  const allEmissions = [...emissionsByProposal.values()].flat();
  const excludedObs = new Set(); // by object identity: derived ids may repeat inside a chain
  const supersededBy = new Map(); // observation object -> superseding proposal_id
  for (const obs of allEmissions) {
    if (obs.event !== "revised") continue;
    const targetId = obs.supersedes_proposal_id;
    const sameId = targetId === obs.proposal_id;
    const candidates = (emissionsByProposal.get(targetId) || []).filter((t) => t !== obs && (!sameId || t.atMs < obs.atMs));
    if (!candidates.length) {
      exclude(obs, "supersedes_target_unknown", { supersedes_proposal_id: targetId });
      excludedObs.add(obs);
      needsDecision.push({ reason: "supersedes_target_unknown", proposal_ids: [obs.proposal_id], supersedes_proposal_id: targetId });
      continue;
    }
    const crossScope = candidates.filter((t) => t.opportunity_id !== obs.opportunity_id || (t.scope_id || "") !== (obs.scope_id || ""));
    if (crossScope.length) {
      exclude(obs, "supersedes_cross_scope", { supersedes_proposal_id: targetId });
      excludedObs.add(obs);
      for (const t of crossScope) {
        if (!excludedObs.has(t)) {
          exclude(t, "supersedes_cross_scope", { by: obs.proposal_id });
          excludedObs.add(t);
        }
      }
      needsDecision.push({ reason: "supersedes_cross_scope", proposal_ids: [...new Set([targetId, obs.proposal_id])] });
      continue;
    }
    for (const t of candidates) {
      if (!supersededBy.has(t)) supersededBy.set(t, obs.proposal_id);
    }
  }
  let candidates = [];
  const emissions = new Map(); // proposal_id -> counting emission (latest of the chain)
  for (const obs of allEmissions) {
    if (excludedObs.has(obs)) continue;
    if (supersededBy.has(obs)) {
      exclude(obs, "superseded", { by: supersededBy.get(obs) });
      continue;
    }
    candidates.push(obs);
    emissions.set(obs.proposal_id, obs);
  }

  // PC-04: exclusive alternatives count once, by canonical flag only.
  const groups = new Map();
  for (const obs of candidates) {
    if (!obs.alternative_group_id) continue;
    if (!groups.has(obs.alternative_group_id)) groups.set(obs.alternative_group_id, []);
    groups.get(obs.alternative_group_id).push(obs);
  }
  const dropped = new Set();
  for (const [groupId, members] of groups) {
    const canonical = members.filter((m) => m.canonical);
    if (canonical.length === 1) {
      for (const m of members) {
        if (m !== canonical[0]) {
          exclude(m, "alternative_not_canonical", { alternative_group_id: groupId, canonical: canonical[0].proposal_id });
          dropped.add(m.id);
        }
      }
    } else {
      const reason = canonical.length === 0 ? "alternative_group_without_canonical" : "alternative_group_multiple_canonical";
      for (const m of members) {
        exclude(m, reason, { alternative_group_id: groupId });
        dropped.add(m.id);
      }
      needsDecision.push({ alternative_group_id: groupId, reason, proposal_ids: members.map((m) => m.proposal_id) });
    }
  }
  candidates = candidates.filter((c) => !dropped.has(c.id));

  // PC-01: one canonical proposal per opportunity + effective scope.
  const scopes = new Map();
  for (const obs of candidates) {
    const key = `${obs.opportunity_id}|${obs.scope_id || ""}`;
    if (!scopes.has(key)) scopes.set(key, []);
    scopes.get(key).push(obs);
  }
  const countedProposals = [];
  for (const [scopeKey, members] of scopes) {
    members.sort((a, b) => a.atMs - b.atMs);
    countedProposals.push(members[0]);
    for (const extra of members.slice(1)) {
      exclude(extra, "duplicate_scope_needs_decision", { scope: scopeKey, kept: members[0].proposal_id });
    }
    if (members.length > 1) {
      needsDecision.push({ scope: scopeKey, reason: "duplicate_scope_needs_decision", proposal_ids: members.map((m) => m.proposal_id) });
    }
  }

  // Close month + optional window filter.
  const inWindow = [];
  for (const obs of countedProposals) {
    obs.close_month = closeMonth(obs.at, timezone);
    if (options.close_month && obs.close_month !== options.close_month) {
      exclude(obs, "outside_close_month", { close_month: obs.close_month, window: options.close_month });
    } else inWindow.push(obs);
  }

  // Origin class: missing → mixed_or_unknown; unknown value → excluded.
  const byOrigin = zeroByClass();
  const byMonth = {};
  const byStage = zeroByStage();
  const proposals_counted = [];
  let emitted_total_cents = 0;
  let contract_value_total_cents = 0;
  let optional_items_total_cents = 0;
  const countedIds = new Set();
  for (const obs of inWindow) {
    const cls = obs.origin_class == null ? contract.origin_classes.missing_field : obs.origin_class;
    if (!ORIGIN_CLASSES.includes(cls)) {
      exclude(obs, "invalid_origin_class", { origin_class: obs.origin_class });
      continue;
    }
    emitted_total_cents += obs.fee_total_cents;
    byOrigin[cls] += obs.fee_total_cents;
    byMonth[obs.close_month] = (byMonth[obs.close_month] || 0) + obs.fee_total_cents;
    byStage.emitted += obs.fee_total_cents;
    contract_value_total_cents += obs.contract_value_cents || 0;
    optional_items_total_cents += obs.optional_items.reduce((s, i) => s + i.fee_cents, 0);
    countedIds.add(obs.proposal_id);
    proposals_counted.push({
      proposal_id: obs.proposal_id,
      opportunity_id: obs.opportunity_id,
      scope_id: obs.scope_id,
      event: obs.event,
      supersedes_proposal_id: obs.supersedes_proposal_id,
      fee_total_cents: obs.fee_total_cents,
      close_month: obs.close_month,
      origin_class: cls,
      origin_class_declared: obs.origin_class != null,
    });
  }

  // PC-07: stages are parallel readings, never summed with each other.
  for (const obs of stageEvents) {
    if (!countedIds.has(obs.proposal_id)) {
      exclude(obs, "stage_for_uncounted_proposal");
      continue;
    }
    // PC-11: accepted without a declared amount_cents inherits the canonical
    // emission's fee_total_cents; a declared amount_cents (even if it differs)
    // always overrides the inheritance.
    let amount = obs.amount_cents;
    if (amount == null && obs.event === "accepted") {
      amount = emissions.get(obs.proposal_id).fee_total_cents;
    }
    if (amount == null) {
      exclude(obs, "stage_without_amount");
      continue;
    }
    byStage[obs.event] += amount;
  }

  // PC-06: instalment view is a payment-form reading, never revenue.
  const instalments = [];
  let monthly_instalments_total_cents = 0;
  for (const obs of inWindow) {
    if (!countedIds.has(obs.proposal_id)) continue;
    if (obs.instalment_cents == null && obs.term_months == null) continue;
    const product = obs.instalment_cents != null && obs.term_months != null ? obs.instalment_cents * obs.term_months : null;
    monthly_instalments_total_cents += obs.instalment_cents || 0;
    instalments.push({
      proposal_id: obs.proposal_id,
      fee_total_cents: obs.fee_total_cents,
      instalment_cents: obs.instalment_cents,
      term_months: obs.term_months,
      consistent: product === obs.fee_total_cents,
    });
  }

  return {
    schema: OBSERVATION_SCHEMA,
    contract_schema: contract.schema,
    contract_version: contract.version,
    contract_status: contract.status,
    official_live: false,
    close_timezone: timezone,
    close_month_filter: options.close_month || null,
    emitted_total_cents,
    proposals_counted,
    excluded,
    needs_decision: needsDecision,
    by_origin_class: byOrigin,
    demonstrated_inbound_cents: byOrigin.demonstrated_inbound,
    by_stage: byStage,
    stages_are_summable: false,
    by_close_month: byMonth,
    instalment_view: {
      is_revenue: false,
      counts_toward_emitted_total: false,
      monthly_instalments_total_cents,
      proposals: instalments,
    },
    contract_value_total_cents,
    contract_value_is_fee: false,
    optional_items_total_cents,
    optional_items_counted: false,
  };
}

/** Counts a fixture file ({observations, expected}) with the given contract. */
export function countFixture(fixture, contract) {
  if (!fixture || fixture.kind !== "synthetic" || fixture.official_live !== false) {
    throw codedError("fixture_or_synthetic", "fixture_must_be_synthetic_and_not_live");
  }
  return countProposals(fixture.observations || [], contract, fixture.options || {});
}
