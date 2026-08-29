/**
 * Closed-loop funnel: visitor analytics joined to Warmbly commercial stages
 * by stable non-PII ids. Never derives qualified/proposal/won from collect.
 *
 * Contract: ../../../data/revops/closed-loop-funnel.v1.json
 */
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { admitEvent, looksLikePiiValue, keyLooksPii } = require("./event-contract.cjs");

const CONTRACT_PATH = path.join(__dirname, "../../../data/revops/closed-loop-funnel.v1.json");
const DEFAULT_FIXTURE_REL = "scripts/revops/fixtures/closed-loop-synthetic.v1.json";

const CONTRACT = Object.freeze(JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8")));

const ID_KINDS = Object.freeze(["session", "lead", "opportunity", "proposal", "sale"]);
const ID_FIELD = Object.freeze({
  session: "session_id",
  lead: "lead_id",
  opportunity: "opportunity_id",
  proposal: "proposal_id",
  sale: "sale_id",
});

const VISITOR_STAGE_SET = new Set(CONTRACT.visitor_stages);
const COMMERCIAL_STAGE_SET = new Set(CONTRACT.commercial_stages);
const RATE_NAMES = Object.freeze([...(CONTRACT.rates || [])]);
const RATE_DIMENSIONS = Object.freeze({
  view_to_cta: Object.freeze({ numerator: "cta", denominator: "view", unit: "sessions" }),
  cta_to_start: Object.freeze({ numerator: "form_start", denominator: "cta", unit: "sessions" }),
  step1_to_step2: Object.freeze({ numerator: "step2", denominator: "step1", unit: "sessions" }),
  step2_to_persisted: Object.freeze({ numerator: "persisted_after_step2_sessions", denominator: "step2", unit: "sessions" }),
  persisted_to_qualified: Object.freeze({ numerator: "qualified_leads", denominator: "persisted_leads", unit: "leads" }),
  qualified_to_proposal: Object.freeze({ numerator: "proposal_leads", denominator: "qualified_leads", unit: "leads" }),
  proposal_to_won: Object.freeze({ numerator: "won_leads", denominator: "proposal_leads", unit: "leads" }),
});
const ATTR_FIELDS = Object.freeze([...(CONTRACT.attribution_fields || [])]);
const VISITOR_EVENT_MAP = Object.freeze({ ...(CONTRACT.visitor_event_map || {}) });
const OBSERVATION_FIELDS = new Set([
  ...((CONTRACT.warmbly_observation_contract || {}).allowed_fields || []),
]);
const OBSERVATION_ACTORS = new Set([
  ...((CONTRACT.warmbly_observation_contract || {}).actor_enum || []),
]);
const SNAPSHOT_FIELDS = new Set([
  "schema", "schema_version", "kind", "official_live", "source",
  "commercial_owner", "generated_at", "events", "leads", "observations",
  "producer_contract", "artifact_id", "payload_sha256", "completeness",
  "window_start", "window_end", "complete_through",
]);
const SNAPSHOT_LEAD_FIELDS = new Set([
  "record_kind", "lead_id", "session_id", "received_at", "landing_page", "landing_url",
  "route_family", "asset_id", "cta_id", "jornada", "offer_id", "origem",
  "utm_source", "utm_medium", "utm_campaign",
]);
const LIVE_EVIDENCE = Symbol("verified_warmbly_snapshot");

const DEFAULT_TIMEOUT_MS = Number(process.env.CLOSED_LOOP_TIMEOUT_MS || 8000);

function getContract() {
  return CONTRACT;
}

function codedError(code, message, extra) {
  const err = new Error(message || code);
  err.code = code;
  if (extra && typeof extra === "object") Object.assign(err, extra);
  return err;
}

function isStableId(kind, id) {
  const spec = CONTRACT.ids[kind];
  if (!spec) return false;
  const value = String(id || "");
  if (!value || value.length > (spec.max_length || 32)) return false;
  if (spec.pattern && new RegExp(spec.pattern).test(value)) return true;
  if (spec.legacy_pattern && new RegExp(spec.legacy_pattern).test(value)) return true;
  return false;
}

function assertStableId(kind, id) {
  if (!isStableId(kind, id)) {
    throw codedError("invalid_entity_id", `invalid_entity_id:${kind}`, { kind });
  }
  return String(id);
}

function mintStableId(kind, seed) {
  const spec = CONTRACT.ids[kind];
  if (!spec) throw codedError("unknown_id_kind", `unknown_id_kind:${kind}`, { kind });
  const hex = crypto.createHash("sha256").update(`closed-loop:${kind}:${seed}`).digest("hex");
  const id = (spec.prefix + hex).slice(0, spec.max_length || 32);
  assertStableId(kind, id);
  return id;
}

function sessionIdOf(ev) {
  if (!ev || typeof ev !== "object") return "";
  const props = ev.props && typeof ev.props === "object" ? ev.props : {};
  return String(ev.sid || ev.session_id || props.session_id || props.sid || "").slice(0, 32);
}

function leadIdOf(ev) {
  if (!ev || typeof ev !== "object") return "";
  const props = ev.props && typeof ev.props === "object" ? ev.props : {};
  return String(ev.lead_id || props.lead_id || "").slice(0, 32);
}

function visitorStageOf(canonical, props) {
  if (canonical === "lead_form_start") return "form_start";
  if (canonical === "lead_form_step") {
    const step = Number(props && (props.form_step || props.step));
    if (step <= 1) return "step1";
    return "step2";
  }
  return VISITOR_EVENT_MAP[canonical] || null;
}

function assertAnalyticsNoPii(payload) {
  const blob = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (/@/.test(blob)) throw codedError("pii_value", "analytics_email_or_at");
  if (/"(?:mensagem|message_body|message|free_text|description|note|comment)"\s*:/i.test(blob)) {
    throw codedError("pii_value", "analytics_free_text");
  }
  if (/"email"\s*:|"telefone"\s*:|"phone"\s*:|"whatsapp"\s*:/i.test(blob)) {
    throw codedError("pii_value", "analytics_contact_key");
  }
  if (/"(?:nome|name|full_name|cnpj|cpf|empresa|company)"\s*:/i.test(blob)) {
    throw codedError("pii_value", "analytics_identity_key");
  }
  const compact = blob.replace(/[\s()-]/g, "");
  if (/\+\d{10,15}/.test(compact)) throw codedError("pii_value", "analytics_phone");
  return true;
}

function scanObjectForPii(obj, trail) {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    if (keyLooksPii(k)) {
      throw codedError("pii_key_admitted", `pii_key:${k}`, { key: k, trail });
    }
    if (typeof v === "string" && looksLikePiiValue(v, k)) {
      throw codedError("pii_value", `pii_value:${k}`, { key: k, trail });
    }
    if (v && typeof v === "object") scanObjectForPii(v, `${trail}.${k}`);
  }
}

function assertWarmblyObservationEnvelope(observation) {
  const owner = String((observation && observation.owner) || "").toLowerCase();
  if (owner !== CONTRACT.commercial_owner) {
    throw codedError("wrong_owner", "commercial_observation_requires_warmbly");
  }
  for (const key of ["note", "message", "mensagem", "description", "free_text"]) {
    if (Object.prototype.hasOwnProperty.call(observation, key)) {
      throw codedError("pii_key_admitted", `commercial_observation_free_text:${key}`, { key });
    }
  }
  for (const key of Object.keys(observation || {})) {
    if (!OBSERVATION_FIELDS.has(key)) {
      throw codedError("unsupported_observation_field", `unsupported_observation_field:${key}`, { key });
    }
  }
  if (observation.actor != null && !OBSERVATION_ACTORS.has(String(observation.actor).toLowerCase())) {
    throw codedError("unsupported_actor", "commercial_observation_actor_must_be_warmbly");
  }
  for (const kind of ID_KINDS) {
    const field = ID_FIELD[kind];
    if (observation[field] != null) assertStableId(kind, observation[field]);
  }
  for (const field of ["accept_reason", "reject_reason", "loss_reason"]) {
    if (observation[field] != null) assertSafeToken(observation[field], field, 80);
  }
  scanObjectForPii(observation, "warmbly_observation");
  assertAnalyticsNoPii(observation);
  return observation;
}

/**
 * Admit visitor events. PII, observed-only, unknown and retired fail closed.
 * duplicate_event_id is an idempotent skip, not a failure.
 */
function admitVisitorEvents(events, options = {}) {
  const seen = options.seen instanceof Set ? options.seen : new Set();
  const admitted = [];
  const duplicates = [];
  for (const ev of events || []) {
    const result = admitEvent(ev);
    if (!result.ok) {
      if (result.reason === "duplicate_event_id") {
        duplicates.push({ event: result.canonical || ev.event, reason: result.reason });
        continue;
      }
      throw codedError(result.reason || "admit_rejected", result.reason || "admit_rejected", {
        original: result.original || (ev && ev.event),
      });
    }
    const eventId = String((result.event.props && result.event.props.event_id) || "").slice(0, 80);
    if (result.dropped && result.dropped.length) {
      throw codedError("pii_key_admitted", "pii_key_dropped_from_closed_loop", {
        original: result.original,
        dropped: result.dropped,
      });
    }
    if (eventId && seen.has(eventId)) {
      duplicates.push({ event: result.canonical, reason: "duplicate_event_id", event_id: eventId });
      continue;
    }
    if (eventId) seen.add(eventId);
    const sid = sessionIdOf({ ...result.event, session_id: ev.session_id || ev.sid });
    if (!sid) throw codedError("missing_session_id", "missing_session_id", { event: result.canonical });
    if (options.requireStableSession !== false && !isStableId("session", sid)) {
      throw codedError("invalid_entity_id", "invalid_session_id", { kind: "session" });
    }
    const ts = String(ev.ts || ev.at || (result.event.props && result.event.props.ts) || "");
    const row = {
      ...result.event,
      sid,
      session_id: sid,
      ts,
      visitor_stage: visitorStageOf(result.canonical, result.event.props),
    };
    scanObjectForPii(row.props || {}, result.canonical);
    assertAnalyticsNoPii(row);
    admitted.push(row);
  }
  return { admitted, duplicates, seen };
}

async function persistLeadOnce(store, record) {
  if (!store || typeof store.put !== "function") {
    throw codedError("store_required", "store_required");
  }
  if (!record || !record.lead_id) throw codedError("lead_id_required", "lead_id_required");
  if (record.session_id) assertStableId("session", record.session_id);
  if (isStableId("lead", record.lead_id) === false && !/^[0-9a-f]{24}$/i.test(record.lead_id)) {
    assertStableId("lead", record.lead_id);
  }
  if (record.idempotency_key && typeof store.getByIdempotency === "function") {
    const existing = await store.getByIdempotency(record.idempotency_key);
    if (existing) return { record: existing, duplicated: true };
  }
  const byId = typeof store.get === "function" ? await store.get(record.lead_id) : null;
  if (byId) return { record: byId, duplicated: true };
  try {
    const saved = await store.put(record, { onlyIfNew: true });
    return { record: saved, duplicated: false };
  } catch (err) {
    if (err && (err.code === "ALREADY_EXISTS" || err.message === "already_exists")) {
      const existing = err.existing || (typeof store.get === "function" ? await store.get(record.lead_id) : record);
      return { record: existing, duplicated: true };
    }
    throw err;
  }
}

function commercialPeak(entities) {
  if (entities && entities.sale) return "won";
  if (entities && entities.proposal) return "proposal";
  if (entities && entities.opportunity) return "qualified";
  if (entities && entities.lead) return "persisted";
  return null;
}

function timestampMs(value, field) {
  const raw = String(value || "");
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) {
    throw codedError("invalid_timestamp", `invalid_timestamp:${field}`, { field });
  }
  return parsed;
}

function assertSafeToken(value, field, maxLength = 120) {
  const raw = String(value || "");
  if (!raw || raw.length > maxLength || !/^[a-z0-9][a-z0-9._:/+-]*$/i.test(raw)) {
    throw codedError("invalid_token", `invalid_token:${field}`, { field });
  }
  return raw;
}

function assertAttributionValue(field, value) {
  if (value == null || value === "") return null;
  const raw = String(value);
  if (field === "landing" || field === "landing_page" || field === "landing_url") {
    let pathname = raw;
    if (/^https?:\/\//i.test(raw)) {
      let parsed;
      try {
        parsed = new URL(raw);
      } catch (_) {
        throw codedError("invalid_attribution", `invalid_attribution:${field}`, { field });
      }
      if (parsed.protocol !== "https:" || parsed.hostname !== "confenge.com.br" || parsed.username || parsed.password) {
        throw codedError("invalid_attribution", `invalid_attribution:${field}`, { field });
      }
      pathname = parsed.pathname;
    }
    if (
      pathname.length > 180
      || !/^\/[a-z0-9/_.,~+-]*$/i.test(pathname)
      || pathname.includes("//")
      || /@|%40/i.test(pathname)
    ) {
      throw codedError("invalid_attribution", `invalid_attribution:${field}`, { field });
    }
    return pathname;
  }
  try {
    return assertSafeToken(raw, field, 80);
  } catch (_) {
    throw codedError("invalid_attribution", `invalid_attribution:${field}`, { field });
  }
}

function applyObservation(state, observation) {
  if (!observation || typeof observation !== "object") {
    throw codedError("invalid_observation", "invalid_observation");
  }
  assertWarmblyObservationEnvelope(observation);
  const to = String(observation.stage || observation.to || "");
  if (!COMMERCIAL_STAGE_SET.has(to)) {
    throw codedError("invalid_stage", `invalid_stage:${to}`, { stage: to });
  }
  if (!state || !state.lead || !state.lead.lead_id) {
    throw codedError("orphan_observation", "observation_without_persisted_lead");
  }
  if (!observation.lead_id || observation.lead_id !== state.lead.lead_id) {
    throw codedError("orphan_observation", "observation_lead_mismatch", {
      expected: state.lead.lead_id,
      got: observation.lead_id || null,
    });
  }
  if (observation.session_id && observation.session_id !== state.lead.session_id) {
    throw codedError("orphan_observation", "observation_session_mismatch", {
      expected: state.lead.session_id || null,
      got: observation.session_id,
    });
  }
  const from = commercialPeak(state) || "persisted";
  const sameEntity =
    (to === "qualified" && state.opportunity && observation.opportunity_id === state.opportunity.opportunity_id) ||
    (to === "proposal" && state.proposal && observation.proposal_id === state.proposal.proposal_id) ||
    (to === "won" && state.sale && observation.sale_id === state.sale.sale_id) ||
    (to === "lost" && state.lead.commercial_stage === "lost");
  if (sameEntity || (to === "lost" && state.lead.commercial_stage === "lost")) {
    return { ...state, duplicated: true };
  }

  const at = String(observation.at || "");
  const observedAtMs = timestampMs(at, "observation.at");
  const previousAt =
    (state.sale && state.sale.at)
    || (state.proposal && state.proposal.at)
    || (state.opportunity && state.opportunity.at)
    || state.lead.received_at;
  if (previousAt && observedAtMs < timestampMs(previousAt, "previous_stage.at")) {
    throw codedError("non_monotonic_timestamp", `non_monotonic_timestamp:${from}->${to}`, {
      from,
      to,
    });
  }
  const next = {
    ...state,
    duplicated: false,
    lead: { ...state.lead },
  };

  if (to === "qualified") {
    if (state.opportunity || state.proposal || state.sale) {
      throw codedError("duplicate_entity", "lead_already_has_opportunity");
    }
    const acceptReason = observation.accept_reason == null
      ? null
      : assertSafeToken(observation.accept_reason, "accept_reason", 80);
    const opportunity_id = assertStableId("opportunity", observation.opportunity_id);
    next.opportunity = {
      opportunity_id,
      lead_id: state.lead.lead_id,
      session_id: state.lead.session_id,
      stage: "qualified",
      accept_reason: acceptReason,
      at,
      owner: "warmbly",
    };
    next.lead.opportunity_id = opportunity_id;
    if (acceptReason) next.lead.accept_reason = acceptReason;
    next.lead.commercial_stage = "qualified";
  } else if (to === "proposal") {
    if (!state.opportunity) throw codedError("invalid_transition", "proposal_without_opportunity");
    if (state.proposal || state.sale) throw codedError("duplicate_entity", "opportunity_already_has_proposal");
    if (observation.opportunity_id !== state.opportunity.opportunity_id) {
      throw codedError("orphan_observation", "proposal_opportunity_mismatch", {
        expected: state.opportunity.opportunity_id,
        got: observation.opportunity_id || null,
      });
    }
    const proposal_id = assertStableId("proposal", observation.proposal_id);
    const amount = Number(observation.amount ?? observation.proposal_value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw codedError("invalid_proposal_value", "invalid_proposal_value");
    }
    next.proposal = {
      proposal_id,
      opportunity_id: state.opportunity.opportunity_id,
      lead_id: state.lead.lead_id,
      session_id: state.lead.session_id,
      stage: "proposal",
      amount,
      at,
      owner: "warmbly",
    };
    next.lead.proposal_id = proposal_id;
    next.lead.proposal_value = amount;
    next.lead.commercial_stage = "proposal";
  } else if (to === "won") {
    if (!state.proposal) throw codedError("invalid_transition", "won_without_proposal");
    if (state.sale) throw codedError("duplicate_entity", "proposal_already_has_sale");
    if (
      observation.opportunity_id !== state.opportunity.opportunity_id
      || observation.proposal_id !== state.proposal.proposal_id
    ) {
      throw codedError("orphan_observation", "sale_commercial_chain_mismatch");
    }
    const sale_id = assertStableId("sale", observation.sale_id);
    const revenue = Number(observation.revenue ?? observation.revenue_received ?? state.proposal.amount);
    if (!Number.isFinite(revenue) || revenue < 0) {
      throw codedError("invalid_revenue", "invalid_revenue");
    }
    next.sale = {
      sale_id,
      proposal_id: state.proposal.proposal_id,
      opportunity_id: state.opportunity.opportunity_id,
      lead_id: state.lead.lead_id,
      session_id: state.lead.session_id,
      stage: "won",
      revenue,
      at,
      owner: "warmbly",
    };
    next.lead.sale_id = sale_id;
    next.lead.revenue_received = revenue;
    next.lead.contract_value = observation.contract_value != null ? Number(observation.contract_value) : revenue;
    next.lead.commercial_stage = "won";
  } else if (to === "lost") {
    const reason = observation.reject_reason || observation.loss_reason;
    if (reason) next.lead.loss_reason = assertSafeToken(reason, "loss_reason", 80);
    next.lead.commercial_stage = "lost";
  }

  const history = Array.isArray(next.lead.stage_history) ? next.lead.stage_history.slice() : [];
  history.push({
    at: at || undefined,
    from,
    to,
    actor: "warmbly",
  });
  next.lead.stage_history = history;
  next.lead.updated_at = at || next.lead.updated_at;
  return next;
}

function pickAttribution(lead, events, explicit) {
  const fromEvents = {};
  for (const ev of events || []) {
    const props = ev.props || {};
    if (!fromEvents.landing) fromEvents.landing = ev.path || props.page_path || props.landing || "";
    if (!fromEvents.route_family) fromEvents.route_family = props.route_family || "";
    if (!fromEvents.asset_id) fromEvents.asset_id = props.asset_id || "";
    if (!fromEvents.cta_id && (ev.visitor_stage === "cta" || ev.event === "cta_click")) {
      fromEvents.cta_id = props.cta_id || "";
    }
    if (!fromEvents.journey) fromEvents.journey = props.journey || "";
    if (!fromEvents.offer_id) fromEvents.offer_id = props.offer_id || "";
    if (!fromEvents.origem) fromEvents.origem = props.origem || props.utm_source || "";
  }
  const fromLead = {
    landing: lead && (lead.landing_page || lead.landing_url),
    route_family: lead && lead.route_family,
    asset_id: lead && lead.asset_id,
    cta_id: lead && lead.cta_id,
    journey: lead && lead.jornada,
    offer_id: lead && lead.offer_id,
    origem: lead && (lead.origem || lead.utm_source),
  };
  const out = {};
  for (const field of ATTR_FIELDS) {
    out[field] = assertAttributionValue(
      field,
      (explicit && explicit[field]) || fromLead[field] || fromEvents[field] || null,
    );
  }
  return out;
}

function rate(num, den) {
  if (!den) return null;
  return Math.round((num / den) * 1000) / 1000;
}

function secondsBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw codedError("invalid_timestamp", "invalid_response_time_timestamp");
  }
  if (b < a) {
    throw codedError("non_monotonic_timestamp", "qualified_before_persisted");
  }
  return Math.round((b - a) / 1000);
}

function roundedMean(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) / 1000;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 1000) / 1000;
}

function percentileNearestRank(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

function bucketKey(attr, field) {
  return String((attr && attr[field]) || "UNKNOWN");
}

function incrementNamed(map, key, fields) {
  if (!map.has(key)) {
    map.set(key, { key, view: 0, cta: 0, form_start: 0, step1: 0, step2: 0, persisted: 0, qualified: 0, proposal: 0, won: 0, revenue: 0 });
  }
  const row = map.get(key);
  for (const [k, v] of Object.entries(fields)) row[k] = (row[k] || 0) + v;
}

function reconcileClosedLoop(input) {
  const events = Array.isArray(input && input.events) ? input.events : [];
  const leads = Array.isArray(input && input.leads) ? input.leads : [];
  const observations = Array.isArray(input && input.observations) ? input.observations : [];
  const officialLive = !!(input && input.official_live === true && input[LIVE_EVIDENCE] === true);
  if (input && input.official_live === true && !officialLive) {
    throw codedError("snapshot_not_approved", "official_snapshot_requires_governance_pin");
  }

  const leadsById = new Map(leads.map((l) => [l.lead_id, l]));
  const leadsBySession = new Map();
  for (const lead of leads) {
    if (lead.session_id) leadsBySession.set(lead.session_id, lead);
  }

  const opportunities = [];
  const proposals = [];
  const sales = [];
  const statesByLead = new Map(
    leads.map((lead) => [lead.lead_id, { lead, opportunity: null, proposal: null, sale: null }]),
  );
  for (const observation of observations) {
    assertWarmblyObservationEnvelope(observation);
    const current = statesByLead.get(observation.lead_id);
    if (!current) {
      throw codedError("orphan_observation", "observation_lead_not_persisted", {
        lead_id: observation.lead_id || null,
      });
    }
    statesByLead.set(observation.lead_id, applyObservation(current, observation));
  }
  for (const state of statesByLead.values()) {
    if (state.opportunity) opportunities.push(state.opportunity);
    if (state.proposal) proposals.push(state.proposal);
    if (state.sale) sales.push(state.sale);
  }

  const oppById = new Map(opportunities.map((o) => [o.opportunity_id, o]));
  const propById = new Map(proposals.map((p) => [p.proposal_id, p]));
  const saleById = new Map(sales.map((s) => [s.sale_id, s]));

  for (const ev of events) {
    const sid = sessionIdOf(ev);
    if (!sid) throw codedError("missing_session_id", "orphan_event_missing_session", { event: ev.event });
    const leadId = leadIdOf(ev);
    if (leadId && !leadsById.has(leadId)) {
      throw codedError("orphan_event", "event_lead_id_not_persisted", { lead_id: leadId, event: ev.event });
    }
    const props = ev.props || {};
    if (props.opportunity_id && !oppById.has(props.opportunity_id)) {
      throw codedError("orphan_event", "event_opportunity_id_unknown", { opportunity_id: props.opportunity_id });
    }
    if (props.proposal_id && !propById.has(props.proposal_id)) {
      throw codedError("orphan_event", "event_proposal_id_unknown", { proposal_id: props.proposal_id });
    }
    if (props.sale_id && !saleById.has(props.sale_id)) {
      throw codedError("orphan_event", "event_sale_id_unknown", { sale_id: props.sale_id });
    }
  }

  const sessions = new Map();
  for (const ev of events) {
    const sid = sessionIdOf(ev);
    if (!sessions.has(sid)) {
      sessions.set(sid, { session_id: sid, stages: new Set(), events: [], first_ts: ev.ts || null, lead_id: null });
    }
    const row = sessions.get(sid);
    row.events.push(ev);
    if (ev.visitor_stage && VISITOR_STAGE_SET.has(ev.visitor_stage)) row.stages.add(ev.visitor_stage);
    if (ev.visitor_stage === "form_start") row.stages.add("step1");
    const leadId = leadIdOf(ev);
    if (leadId) row.lead_id = leadId;
  }

  for (const lead of leads) {
    if (lead.session_id && sessions.has(lead.session_id)) {
      sessions.get(lead.session_id).lead_id = lead.lead_id;
      sessions.get(lead.session_id).stages.add("persisted");
    }
  }

  const persistedSessionIds = new Set(
    leads.map((lead) => String(lead.session_id || "")).filter(Boolean),
  );
  const persistedAfterStep2SessionIds = new Set();

  const counts = {
    view: 0,
    cta: 0,
    form_start: 0,
    step1: 0,
    step2: 0,
    persisted: leads.length,
    raw_leads: leads.length,
    persisted_leads: leads.length,
    persisted_sessions: persistedSessionIds.size,
    persisted_after_step2_sessions: 0,
    qualified: opportunities.length,
    qualified_leads: opportunities.length,
    proposal: proposals.length,
    proposal_leads: proposals.length,
    won: sales.length,
    won_leads: sales.length,
  };
  for (const row of sessions.values()) {
    if (row.stages.has("view")) counts.view += 1;
    if (row.stages.has("cta")) counts.cta += 1;
    if (row.stages.has("form_start")) counts.form_start += 1;
    if (row.stages.has("step1") || row.stages.has("form_start")) counts.step1 += 1;
    if (row.stages.has("step2")) counts.step2 += 1;
    if (row.stages.has("step2") && persistedSessionIds.has(row.session_id)) {
      persistedAfterStep2SessionIds.add(row.session_id);
    }
  }
  counts.persisted_after_step2_sessions = persistedAfterStep2SessionIds.size;

  if (counts.qualified > counts.persisted) {
    throw codedError("invalid_transition", "qualified_exceeds_persisted");
  }
  if (counts.proposal > counts.qualified) {
    throw codedError("invalid_transition", "proposal_exceeds_qualified");
  }
  if (counts.won > counts.proposal) {
    throw codedError("invalid_transition", "won_exceeds_proposal");
  }

  const rates = {
    view_to_cta: rate(counts.cta, counts.view),
    cta_to_start: rate(counts.form_start, counts.cta),
    step1_to_step2: rate(counts.step2, counts.step1),
    step2_to_persisted: rate(counts.persisted_after_step2_sessions, counts.step2),
    persisted_to_qualified: rate(counts.qualified_leads, counts.persisted_leads),
    qualified_to_proposal: rate(counts.proposal_leads, counts.qualified_leads),
    proposal_to_won: rate(counts.won_leads, counts.proposal_leads),
  };
  const denominators = Object.fromEntries(
    RATE_NAMES.map((name) => {
      const dimension = RATE_DIMENSIONS[name] || {};
      const { numerator, denominator, unit } = dimension;
      if (!numerator || !denominator) {
        throw codedError("unknown_rate_dimension", `unknown_rate_dimension:${name}`);
      }
      return [name, {
        numerator,
        numerator_count: counts[numerator],
        numerator_unit: unit,
        denominator,
        denominator_count: counts[denominator],
        denominator_unit: unit,
      }];
    }),
  );

  const responseSamples = opportunities.map((opportunity) => {
    const lead = leadsById.get(opportunity.lead_id);
    if (!lead) return null;
    return secondsBetween(lead.received_at, opportunity.at);
  }).filter((value) => value != null);
  const responseTime = {
    from_stage: "persisted",
    to_stage: "qualified",
    unit: "seconds",
    denominator: "qualified_leads",
    denominator_count: opportunities.length,
    observed_count: responseSamples.length,
    missing_count: opportunities.length - responseSamples.length,
    mean_seconds: roundedMean(responseSamples),
    median_seconds: median(responseSamples),
    p95_seconds: percentileNearestRank(responseSamples, 0.95),
  };
  const tempo = responseTime.median_seconds;

  const revenue = sales.reduce((sum, s) => sum + Number(s.revenue || 0), 0);

  const firstLead = leads[0] || null;
  const firstEvents = firstLead && firstLead.session_id && sessions.get(firstLead.session_id)
    ? sessions.get(firstLead.session_id).events
    : events;
  const attribution = pickAttribution(firstLead, firstEvents, input.attribution);

  const byRoute = new Map();
  const byOffer = new Map();
  const byOrigem = new Map();
  const opportunitiesByLead = new Map();
  const proposalsByLead = new Map();
  const salesByLead = new Map();
  for (const opportunity of opportunities) {
    const key = String(opportunity.lead_id || "");
    if (key) opportunitiesByLead.set(key, (opportunitiesByLead.get(key) || 0) + 1);
  }
  for (const proposal of proposals) {
    const key = String(proposal.lead_id || "");
    if (key) proposalsByLead.set(key, (proposalsByLead.get(key) || 0) + 1);
  }
  for (const sale of sales) {
    const key = String(sale.lead_id || "");
    if (!key) continue;
    const current = salesByLead.get(key) || { count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += Number(sale.revenue || 0);
    salesByLead.set(key, current);
  }

  const cohortExplicitAttribution = sessions.size <= 1 && leads.length <= 1
    ? input.attribution
    : null;
  const attributedLeadIds = new Set();
  const addCohort = (lead, cohortEvents, cohortStages) => {
    const leadId = String((lead && lead.lead_id) || "");
    if (leadId) attributedLeadIds.add(leadId);
    const attr = pickAttribution(lead, cohortEvents, cohortExplicitAttribution);
    const sale = salesByLead.get(leadId) || { count: 0, revenue: 0 };
    const fields = {
      view: cohortStages.has("view") ? 1 : 0,
      cta: cohortStages.has("cta") ? 1 : 0,
      form_start: cohortStages.has("form_start") ? 1 : 0,
      step1: cohortStages.has("step1") || cohortStages.has("form_start") ? 1 : 0,
      step2: cohortStages.has("step2") ? 1 : 0,
      persisted: lead ? 1 : 0,
      qualified: opportunitiesByLead.get(leadId) || 0,
      proposal: proposalsByLead.get(leadId) || 0,
      won: sale.count,
      revenue: sale.revenue,
    };
    const routeKey = String(attr.landing || attr.route_family || "UNKNOWN");
    incrementNamed(byRoute, routeKey, fields);
    incrementNamed(byOffer, bucketKey(attr, "offer_id"), fields);
    incrementNamed(byOrigem, bucketKey(attr, "origem"), fields);
  };

  for (const session of sessions.values()) {
    const lead = (session.lead_id && leadsById.get(session.lead_id))
      || leadsBySession.get(session.session_id)
      || null;
    addCohort(lead, session.events, session.stages);
  }
  for (const lead of leads) {
    if (!attributedLeadIds.has(String(lead.lead_id || ""))) {
      addCohort(lead, [], new Set(["persisted"]));
    }
  }

  const report = {
    schema: "confenge.closed-loop-report/1.0",
    schema_version: CONTRACT.schema_version,
    kind: (input.kind || "synthetic"),
    official_live: officialLive,
    measurement_status: officialLive ? "OBSERVED" : "SYNTHETIC",
    snapshot_generated_at: (input && input.generated_at) || null,
    evidence: {
      producer_contract: (input && input.producer_contract) || null,
      artifact_id: (input && input.artifact_id) || null,
      payload_sha256: (input && input.payload_sha256) || null,
      completeness: (input && input.completeness) || null,
      window_start: (input && input.window_start) || null,
      window_end: (input && input.window_end) || null,
      complete_through: (input && input.complete_through) || null,
    },
    source: CONTRACT.source,
    commercial_owner: CONTRACT.commercial_owner,
    counts,
    count_units: {
      view: "sessions",
      cta: "sessions",
      form_start: "sessions",
      step1: "sessions",
      step2: "sessions",
      persisted_sessions: "sessions",
      persisted_after_step2_sessions: "sessions",
      persisted: "leads",
      raw_leads: "leads",
      persisted_leads: "leads",
      qualified: "leads",
      qualified_leads: "leads",
      proposal: "leads",
      proposal_leads: "leads",
      won: "leads",
      won_leads: "leads",
    },
    rates,
    denominators,
    tempo_de_resposta_seconds: tempo,
    response_time: responseTime,
    revenue,
    entities: {
      session_id: (firstLead && firstLead.session_id) || (events[0] && sessionIdOf(events[0])) || null,
      lead_id: firstLead ? firstLead.lead_id : null,
      opportunity_id: opportunities[0] ? opportunities[0].opportunity_id : null,
      proposal_id: proposals[0] ? proposals[0].proposal_id : null,
      sale_id: sales[0] ? sales[0].sale_id : null,
    },
    attribution,
    by_route: [...byRoute.values()].sort((a, b) => a.key.localeCompare(b.key)),
    by_offer: [...byOffer.values()].sort((a, b) => a.key.localeCompare(b.key)),
    by_origem: [...byOrigem.values()].sort((a, b) => a.key.localeCompare(b.key)),
    raw_lead_is_qualified: false,
    derived_qualified: false,
    derived_proposal: false,
    derived_won: false,
  };

  assertAnalyticsNoPii(report);
  return {
    ok: true,
    admitted_count: events.length,
    session_count: sessions.size,
    lead_count: leads.length,
    opportunity_count: opportunities.length,
    proposal_count: proposals.length,
    sale_count: sales.length,
    report,
  };
}

function reportClosedLoop(reconciled) {
  if (!reconciled || !reconciled.report) {
    throw codedError("report_required", "report_required");
  }
  const out = reconciled.report;
  assertAnalyticsNoPii(out);
  return out;
}

function withTimeout(promise, ms, code) {
  const timeoutMs = Number.isFinite(Number(ms)) ? Number(ms) : DEFAULT_TIMEOUT_MS;
  const failCode = code || "timeout";
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(codedError(failCode, failCode)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function loadFixture(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(__dirname, "../../..", filePath);
  const raw = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!raw || raw.schema !== "confenge.closed-loop-fixture/1.0") {
    throw codedError("invalid_fixture", "invalid_fixture_schema");
  }
  if (
    raw.official_live === true
    || raw.kind !== "synthetic"
    || raw.record_kind !== "synthetic"
    || (raw.lead && raw.lead.record_kind !== "synthetic")
  ) {
    throw codedError("fixture_or_synthetic", "ci_fixture_must_not_be_official_live");
  }
  return raw;
}

function canonicalSnapshotValue(value) {
  if (Array.isArray(value)) return value.map(canonicalSnapshotValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "payload_sha256")
      .sort()
      .map((key) => [key, canonicalSnapshotValue(value[key])]),
  );
}

function computeSnapshotPayloadSha256(snapshot) {
  const canonical = JSON.stringify(canonicalSnapshotValue(snapshot));
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function loadSnapshot(snapshot, options = {}) {
  const raw = typeof snapshot === "string"
    ? JSON.parse(fs.readFileSync(path.resolve(snapshot), "utf8"))
    : snapshot;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw codedError("invalid_snapshot", "invalid_snapshot");
  }
  for (const key of Object.keys(raw)) {
    if (!SNAPSHOT_FIELDS.has(key)) {
      throw codedError("unsupported_snapshot_field", `unsupported_snapshot_field:${key}`, { key });
    }
  }
  if (raw.schema !== "confenge.closed-loop-snapshot/1.0" || raw.schema_version !== "1.0.0") {
    throw codedError("invalid_snapshot", "invalid_snapshot_schema");
  }
  if (raw.source !== CONTRACT.source || raw.commercial_owner !== CONTRACT.commercial_owner) {
    throw codedError("invalid_snapshot", "snapshot_authority_mismatch");
  }
  if (typeof raw.official_live !== "boolean") {
    throw codedError("invalid_snapshot", "snapshot_official_live_required");
  }
  const generatedAt = timestampMs(raw.generated_at, "snapshot.generated_at");
  if (!Array.isArray(raw.events) || !Array.isArray(raw.leads) || !Array.isArray(raw.observations)) {
    throw codedError("invalid_snapshot", "snapshot_arrays_required");
  }
  const liveGate = CONTRACT.warmbly_observation_contract.official_live_gate || {};
  if (raw.official_live === true) {
    if (raw.kind !== liveGate.kind) {
      throw codedError("invalid_snapshot", "official_snapshot_kind_mismatch");
    }
    if (raw.completeness !== liveGate.completeness) {
      throw codedError("snapshot_incomplete", "official_snapshot_coverage_incomplete");
    }
    if (raw.producer_contract !== CONTRACT.warmbly_observation_contract.producer_contract) {
      throw codedError("invalid_snapshot", "snapshot_producer_contract_mismatch");
    }
    assertSafeToken(raw.artifact_id, "artifact_id", 120);
    if (!/^[0-9a-f]{64}$/i.test(String(raw.payload_sha256 || ""))) {
      throw codedError("invalid_snapshot", "snapshot_payload_sha256_required");
    }
    const start = timestampMs(raw.window_start, "snapshot.window_start");
    const end = timestampMs(raw.window_end, "snapshot.window_end");
    const completeThrough = timestampMs(raw.complete_through, "snapshot.complete_through");
    if (start > end || end > completeThrough || completeThrough > generatedAt) {
      throw codedError("snapshot_incomplete", "snapshot_coverage_window_invalid");
    }
    const computed = computeSnapshotPayloadSha256(raw);
    if (computed !== String(raw.payload_sha256).toLowerCase()) {
      throw codedError("snapshot_hash_mismatch", "snapshot_payload_hash_mismatch");
    }
    const approved = String(
      options.approvedPayloadSha256 || process.env.WARMBLY_SNAPSHOT_APPROVED_SHA256 || "",
    ).toLowerCase();
    if (!approved || approved !== computed) {
      throw codedError("snapshot_not_approved", "official_snapshot_requires_governance_pin");
    }
  } else if (raw.kind !== "synthetic_warmbly_snapshot") {
    throw codedError("invalid_snapshot", "non_live_snapshot_must_be_synthetic");
  }
  for (const lead of raw.leads) {
    if (!lead || typeof lead !== "object" || Array.isArray(lead)) {
      throw codedError("invalid_snapshot", "snapshot_lead_invalid");
    }
    for (const key of Object.keys(lead)) {
      if (keyLooksPii(key)) throw codedError("pii_key_admitted", `pii_key:${key}`, { key });
      if (!SNAPSHOT_LEAD_FIELDS.has(key)) {
        throw codedError("unsupported_snapshot_field", `unsupported_snapshot_lead_field:${key}`, { key });
      }
    }
    assertStableId("lead", lead.lead_id);
    assertStableId("session", lead.session_id);
    timestampMs(lead.received_at, "snapshot.lead.received_at");
    if (raw.official_live === true && lead.record_kind !== "real") {
      throw codedError("fixture_or_synthetic", "official_snapshot_contains_non_real_lead");
    }
    if (raw.official_live === false && !new Set(["synthetic", "qa", "fixture"]).has(lead.record_kind)) {
      throw codedError("fixture_or_synthetic", "synthetic_snapshot_record_kind_required");
    }
    for (const [field, value] of Object.entries(lead)) {
      if (["record_kind", "lead_id", "session_id", "received_at"].includes(field)) continue;
      assertAttributionValue(field, value);
    }
    scanObjectForPii(lead, "snapshot.lead");
  }
  for (const observation of raw.observations) assertWarmblyObservationEnvelope(observation);
  return raw;
}

function runSnapshot(snapshot, options = {}) {
  const bundle = loadSnapshot(snapshot, options);
  const admitted = admitVisitorEvents(bundle.events, { requireStableSession: true });
  const reconciled = reconcileClosedLoop({
    events: admitted.admitted,
    leads: bundle.leads,
    observations: bundle.observations,
    kind: bundle.kind,
    official_live: bundle.official_live,
    generated_at: bundle.generated_at,
    producer_contract: bundle.producer_contract,
    artifact_id: bundle.artifact_id,
    payload_sha256: bundle.payload_sha256,
    completeness: bundle.completeness,
    window_start: bundle.window_start,
    window_end: bundle.window_end,
    complete_through: bundle.complete_through,
    [LIVE_EVIDENCE]: bundle.official_live === true,
  });
  const report = reportClosedLoop(reconciled);
  const body = `${JSON.stringify(report, null, 2)}\n`;
  assertAnalyticsNoPii(body);
  return { ok: true, report, body, admitted: admitted.admitted, duplicates: admitted.duplicates };
}

function defaultFixturePath() {
  return DEFAULT_FIXTURE_REL;
}

async function runFixture(fixture, store, options = {}) {
  const bundle = typeof fixture === "string" ? loadFixture(fixture) : fixture;
  if (
    !bundle
    || bundle.kind !== "synthetic"
    || bundle.record_kind !== "synthetic"
    || !bundle.lead
    || bundle.lead.record_kind !== "synthetic"
  ) {
    throw codedError("fixture_or_synthetic", "runFixture_rejects_real_leads");
  }
  const timeoutMs = options.timeoutMs != null ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const admitted = admitVisitorEvents(bundle.events, {
    requireStableSession: options.requireStableSession !== false,
  });
  const persist = await withTimeout(persistLeadOnce(store, bundle.lead), timeoutMs, "timeout");
  let state = {
    lead: persist.record,
    opportunity: null,
    proposal: null,
    sale: null,
  };
  for (const obs of bundle.observations || []) {
    state = applyObservation(state, obs);
  }
  const reconciled = reconcileClosedLoop({
    events: admitted.admitted,
    leads: [state.lead],
    observations: bundle.observations || [],
    entities: state,
    attribution: bundle.attribution,
    kind: bundle.kind || "synthetic",
  });
  const report = reportClosedLoop(reconciled);
  report.fixture = bundle.id || DEFAULT_FIXTURE_REL;
  return {
    ok: true,
    duplicated: persist.duplicated,
    admitted: admitted.admitted,
    duplicates: admitted.duplicates,
    lead: state.lead,
    opportunity: state.opportunity,
    proposal: state.proposal,
    sale: state.sale,
    reconciled,
    report,
  };
}

function isRawLeadQualified(lead, opportunity) {
  if (!lead) return false;
  if (lead.commercial_stage === "lead_persisted" && !opportunity) return false;
  if (!opportunity) return false;
  return true;
}

module.exports = {
  CONTRACT,
  CONTRACT_PATH,
  ID_KINDS,
  ID_FIELD,
  RATE_NAMES,
  RATE_DIMENSIONS,
  ATTR_FIELDS,
  VISITOR_EVENT_MAP,
  DEFAULT_TIMEOUT_MS,
  getContract,
  isStableId,
  assertStableId,
  mintStableId,
  sessionIdOf,
  leadIdOf,
  visitorStageOf,
  assertAnalyticsNoPii,
  assertWarmblyObservationEnvelope,
  admitVisitorEvents,
  persistLeadOnce,
  applyObservation,
  reconcileClosedLoop,
  reportClosedLoop,
  withTimeout,
  loadFixture,
  loadSnapshot,
  computeSnapshotPayloadSha256,
  defaultFixturePath,
  runFixture,
  runSnapshot,
  isRawLeadQualified,
  pickAttribution,
};
