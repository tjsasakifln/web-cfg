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
const ACCEPT_REASONS = Object.freeze([...(CONTRACT.accept_reasons || [])]);
const REJECT_REASONS = Object.freeze([...(CONTRACT.reject_reasons || [])]);
const SLA = Object.freeze({ ...(CONTRACT.sla || {}) });
const RATE_NAMES = Object.freeze([...(CONTRACT.rates || [])]);
const ATTR_FIELDS = Object.freeze([...(CONTRACT.attribution_fields || [])]);
const VISITOR_EVENT_MAP = Object.freeze({ ...(CONTRACT.visitor_event_map || {}) });
const COMMERCIAL_TRANSITIONS = Object.freeze({ ...(CONTRACT.commercial_transitions || {}) });

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
    throw codedError("invalid_entity_id", `invalid_entity_id:${kind}`, { kind, id: String(id || "").slice(0, 40) });
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
  if (/"mensagem"\s*:|"message_body"\s*:|"message"\s*:/i.test(blob)) {
    throw codedError("pii_value", "analytics_free_text");
  }
  if (/"email"\s*:|"telefone"\s*:|"phone"\s*:|"whatsapp"\s*:/i.test(blob)) {
    throw codedError("pii_value", "analytics_contact_key");
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
      throw codedError("invalid_entity_id", "invalid_session_id", { sid });
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

function applyObservation(state, observation) {
  if (!observation || typeof observation !== "object") {
    throw codedError("invalid_observation", "invalid_observation");
  }
  const owner = String(observation.owner || CONTRACT.commercial_owner).toLowerCase();
  if (owner !== "warmbly") {
    throw codedError("wrong_owner", "commercial_observation_requires_warmbly", { owner });
  }
  const to = String(observation.stage || observation.to || "");
  if (!COMMERCIAL_STAGE_SET.has(to)) {
    throw codedError("invalid_stage", `invalid_stage:${to}`, { stage: to });
  }
  if (!state || !state.lead || !state.lead.lead_id) {
    throw codedError("orphan_observation", "observation_without_persisted_lead");
  }
  if (observation.lead_id && observation.lead_id !== state.lead.lead_id) {
    throw codedError("orphan_observation", "observation_lead_mismatch", {
      expected: state.lead.lead_id,
      got: observation.lead_id,
    });
  }
  const from = commercialPeak(state) || "persisted";
  const allowed = COMMERCIAL_TRANSITIONS[from] || [];
  const sameEntity =
    (to === "qualified" && state.opportunity && observation.opportunity_id === state.opportunity.opportunity_id) ||
    (to === "proposal" && state.proposal && observation.proposal_id === state.proposal.proposal_id) ||
    (to === "won" && state.sale && observation.sale_id === state.sale.sale_id) ||
    (to === "lost" && state.lead.commercial_stage === "lost");
  if (from === to || sameEntity) {
    return { ...state, duplicated: true };
  }
  if (!allowed.includes(to)) {
    throw codedError("invalid_transition", `invalid_transition:${from}->${to}`, { from, to });
  }

  const at = String(observation.at || "");
  const next = {
    ...state,
    duplicated: false,
    lead: { ...state.lead },
  };

  if (to === "qualified") {
    if (!observation.accept_reason || !ACCEPT_REASONS.includes(observation.accept_reason)) {
      throw codedError("accept_reason_required", "accept_reason_required", {
        reason: observation.accept_reason || null,
      });
    }
    const opportunity_id = assertStableId("opportunity", observation.opportunity_id);
    if (state.opportunity && state.opportunity.opportunity_id !== opportunity_id) {
      throw codedError("duplicate_entity", "lead_already_has_opportunity");
    }
    next.opportunity = {
      opportunity_id,
      lead_id: state.lead.lead_id,
      session_id: state.lead.session_id,
      stage: "qualified",
      accept_reason: observation.accept_reason,
      at,
      owner: "warmbly",
    };
    next.lead.opportunity_id = opportunity_id;
    next.lead.accept_reason = observation.accept_reason;
    next.lead.commercial_stage = "qualified";
  } else if (to === "proposal") {
    if (!state.opportunity) throw codedError("invalid_transition", "proposal_without_opportunity");
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
    if (!reason || !REJECT_REASONS.includes(reason)) {
      throw codedError("loss_reason_required", "loss_reason_required");
    }
    next.lead.loss_reason = reason;
    next.lead.commercial_stage = "lost";
  }

  const history = Array.isArray(next.lead.stage_history) ? next.lead.stage_history.slice() : [];
  history.push({
    at: at || undefined,
    from,
    to,
    actor: String(observation.actor || "warmbly").slice(0, 80),
    note: observation.note ? String(observation.note).slice(0, 120) : undefined,
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
    out[field] = (explicit && explicit[field]) || fromLead[field] || fromEvents[field] || null;
  }
  return out;
}

function rate(num, den) {
  if (!den) return null;
  return Math.round((num / den) * 1000) / 1000;
}

function secondsBetween(fromIso, toIso) {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 1000);
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
  const entities = input && input.entities ? input.entities : {};

  const leadsById = new Map(leads.map((l) => [l.lead_id, l]));
  const leadsBySession = new Map();
  for (const lead of leads) {
    if (lead.session_id) leadsBySession.set(lead.session_id, lead);
  }

  const opportunities = [];
  const proposals = [];
  const sales = [];
  if (entities.opportunity) opportunities.push(entities.opportunity);
  if (entities.proposal) proposals.push(entities.proposal);
  if (entities.sale) sales.push(entities.sale);
  for (const obs of observations) {
    if (obs.opportunity_id && obs.stage === "qualified") {
      if (!opportunities.some((o) => o.opportunity_id === obs.opportunity_id)) {
        opportunities.push({
          opportunity_id: obs.opportunity_id,
          lead_id: obs.lead_id,
          session_id: obs.session_id,
          at: obs.at,
        });
      }
    }
    if (obs.proposal_id && obs.stage === "proposal") {
      if (!proposals.some((p) => p.proposal_id === obs.proposal_id)) {
        proposals.push({
          proposal_id: obs.proposal_id,
          opportunity_id: obs.opportunity_id,
          lead_id: obs.lead_id,
          amount: obs.amount,
          at: obs.at,
        });
      }
    }
    if (obs.sale_id && obs.stage === "won") {
      if (!sales.some((s) => s.sale_id === obs.sale_id)) {
        sales.push({
          sale_id: obs.sale_id,
          proposal_id: obs.proposal_id,
          lead_id: obs.lead_id,
          revenue: obs.revenue,
          at: obs.at,
        });
      }
    }
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

  for (const obs of observations) {
    if (obs.lead_id && !leadsById.has(obs.lead_id)) {
      throw codedError("orphan_observation", "observation_lead_not_persisted", { lead_id: obs.lead_id });
    }
  }

  for (const lead of leads) {
    if (lead.opportunity_id && !oppById.has(lead.opportunity_id) && lead.commercial_stage !== "lead_persisted") {
      throw codedError("orphan_observation", "lead_opportunity_id_unknown", { opportunity_id: lead.opportunity_id });
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

  const counts = {
    view: 0,
    cta: 0,
    form_start: 0,
    step1: 0,
    step2: 0,
    persisted: leads.length,
    raw_leads: leads.length,
    qualified: opportunities.length,
    proposal: proposals.length,
    won: sales.length,
  };
  for (const row of sessions.values()) {
    if (row.stages.has("view")) counts.view += 1;
    if (row.stages.has("cta")) counts.cta += 1;
    if (row.stages.has("form_start")) counts.form_start += 1;
    if (row.stages.has("step1") || row.stages.has("form_start")) counts.step1 += 1;
    if (row.stages.has("step2")) counts.step2 += 1;
  }

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
    step2_to_persisted: rate(counts.persisted, counts.step2),
    persisted_to_qualified: rate(counts.qualified, counts.persisted),
    qualified_to_proposal: rate(counts.proposal, counts.qualified),
    proposal_to_won: rate(counts.won, counts.proposal),
  };

  const persistedAt = leads[0] && leads[0].received_at;
  const qualifiedAt = (opportunities[0] && opportunities[0].at) || (observations.find((o) => o.stage === "qualified") || {}).at;
  const tempo = secondsBetween(persistedAt, qualifiedAt);

  const revenue = sales.reduce((sum, s) => sum + Number(s.revenue || 0), 0);

  const firstLead = leads[0] || null;
  const firstEvents = firstLead && firstLead.session_id && sessions.get(firstLead.session_id)
    ? sessions.get(firstLead.session_id).events
    : events;
  const attribution = pickAttribution(firstLead, firstEvents, input.attribution);

  const byRoute = new Map();
  const byOffer = new Map();
  const byOrigem = new Map();
  const attrFields = {
    view: counts.view,
    cta: counts.cta,
    form_start: counts.form_start,
    step1: counts.step1,
    step2: counts.step2,
    persisted: counts.persisted,
    qualified: counts.qualified,
    proposal: counts.proposal,
    won: counts.won,
    revenue,
  };
  incrementNamed(byRoute, bucketKey(attribution, "landing") || bucketKey(attribution, "route_family"), attrFields);
  incrementNamed(byOffer, bucketKey(attribution, "offer_id"), attrFields);
  incrementNamed(byOrigem, bucketKey(attribution, "origem"), attrFields);

  const report = {
    schema: "confenge.closed-loop-report/1.0",
    schema_version: CONTRACT.schema_version,
    kind: (input.kind || "synthetic"),
    official_live: false,
    source: CONTRACT.source,
    commercial_owner: CONTRACT.commercial_owner,
    sla: { ...SLA },
    counts,
    rates,
    tempo_de_resposta_seconds: tempo,
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
  if (raw.official_live === true) {
    throw codedError("fixture_or_synthetic", "ci_fixture_must_not_be_official_live");
  }
  return raw;
}

function defaultFixturePath() {
  return DEFAULT_FIXTURE_REL;
}

async function runFixture(fixture, store, options = {}) {
  const bundle = typeof fixture === "string" ? loadFixture(fixture) : fixture;
  if (!bundle || bundle.kind === "real") {
    throw codedError("fixture_or_synthetic", "runFixture_rejects_real_leads");
  }
  const timeoutMs = options.timeoutMs != null ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const admitted = admitVisitorEvents(bundle.events, {
    requireStableSession: options.requireStableSession !== false,
  });
  const persist = await withTimeout(persistLeadOnce(store, bundle.lead), timeoutMs, "timeout");
  let state = {
    lead: persist.record,
    opportunity: persist.record.opportunity_id
      ? {
          opportunity_id: persist.record.opportunity_id,
          lead_id: persist.record.lead_id,
          session_id: persist.record.session_id,
          at: persist.record.received_at,
        }
      : null,
    proposal: persist.record.proposal_id
      ? {
          proposal_id: persist.record.proposal_id,
          lead_id: persist.record.lead_id,
          amount: persist.record.proposal_value,
          at: persist.record.updated_at,
        }
      : null,
    sale: persist.record.sale_id
      ? {
          sale_id: persist.record.sale_id,
          lead_id: persist.record.lead_id,
          revenue: persist.record.revenue_received,
          at: persist.record.updated_at,
        }
      : null,
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
  ACCEPT_REASONS,
  REJECT_REASONS,
  SLA,
  RATE_NAMES,
  ATTR_FIELDS,
  VISITOR_EVENT_MAP,
  COMMERCIAL_TRANSITIONS,
  DEFAULT_TIMEOUT_MS,
  getContract,
  isStableId,
  assertStableId,
  mintStableId,
  sessionIdOf,
  leadIdOf,
  visitorStageOf,
  assertAnalyticsNoPii,
  admitVisitorEvents,
  persistLeadOnce,
  applyObservation,
  reconcileClosedLoop,
  reportClosedLoop,
  withTimeout,
  loadFixture,
  defaultFixturePath,
  runFixture,
  isRawLeadQualified,
  pickAttribution,
};
