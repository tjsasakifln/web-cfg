/**
 * Commercial funnel stages for CONFENGE RevOps.
 * Visitor-side analytics stages are separate; this module covers lead CRM stages.
 *
 * Funnel (required):
 *  visitor → cta_triggered → form_started → lead_persisted → contacted
 *  → qualified → meeting → proposal → won | lost
 *
 * Public form creates leads at `lead_persisted` only.
 * Later transitions require authenticated ops (OPS_TOKEN).
 */

const STAGES = Object.freeze([
  "visitor",
  "cta_triggered",
  "form_started",
  "lead_persisted",
  "contacted",
  "qualified",
  "meeting",
  "proposal",
  "won",
  "lost",
]);

const STAGE_SET = new Set(STAGES);

/** Terminal commercial outcomes */
const TERMINAL = new Set(["won", "lost"]);

/**
 * Allowed transitions (fail-closed).
 * `lost` can be reached from any post-persist stage; reopen only via explicit ops note.
 */
const ALLOWED = Object.freeze({
  visitor: ["cta_triggered", "form_started", "lead_persisted"],
  cta_triggered: ["form_started", "lead_persisted"],
  form_started: ["lead_persisted"],
  lead_persisted: ["contacted", "qualified", "lost"],
  contacted: ["qualified", "meeting", "lost"],
  qualified: ["meeting", "proposal", "lost"],
  meeting: ["proposal", "qualified", "lost"],
  proposal: ["won", "lost", "meeting"],
  won: [], // terminal
  lost: ["contacted", "qualified"], // reopen with reason
});

const LOSS_REASONS = Object.freeze([
  "no_response",
  "out_of_icp",
  "timing",
  "budget",
  "competitor",
  "self_serve",
  "not_a_fit",
  "duplicate",
  "spam",
  "other",
]);

function isValidStage(stage) {
  return STAGE_SET.has(String(stage || ""));
}

function canTransition(from, to) {
  const f = String(from || "");
  const t = String(to || "");
  if (!isValidStage(f) || !isValidStage(t)) return false;
  if (f === t) return true;
  const allowed = ALLOWED[f] || [];
  return allowed.includes(t);
}

/**
 * Apply a stage change; returns patch for store.update or throws.
 * Never mutates PII beyond commercial fields.
 */
function applyStageChange(record, { stage, actor, note, loss_reason, next_action, owner, proposal_value, contract_value, revenue_received }) {
  if (!record || !record.lead_id) {
    const err = new Error("lead_not_found");
    err.code = "lead_not_found";
    throw err;
  }
  const from = record.commercial_stage || record.status || "lead_persisted";
  const to = String(stage || "");
  if (!isValidStage(to)) {
    const err = new Error("invalid_stage");
    err.code = "invalid_stage";
    throw err;
  }
  if (!canTransition(from, to) && from !== to) {
    const err = new Error(`transition_denied:${from}->${to}`);
    err.code = "transition_denied";
    throw err;
  }
  if (to === "lost" && !loss_reason && !record.loss_reason) {
    const err = new Error("loss_reason_required");
    err.code = "loss_reason_required";
    throw err;
  }
  if (loss_reason && !LOSS_REASONS.includes(loss_reason)) {
    const err = new Error("invalid_loss_reason");
    err.code = "invalid_loss_reason";
    throw err;
  }

  const now = new Date().toISOString();
  const history = Array.isArray(record.stage_history) ? record.stage_history.slice() : [];
  if (from !== to) {
    history.push({
      at: now,
      from,
      to,
      actor: String(actor || "ops").slice(0, 80),
      note: note ? String(note).slice(0, 500) : undefined,
    });
  }

  const patch = {
    commercial_stage: to,
    status: to === "lead_persisted" ? "persisted" : to,
    stage_history: history,
    last_contact_at: ["contacted", "qualified", "meeting", "proposal", "won"].includes(to)
      ? now
      : record.last_contact_at || null,
    updated_at: now,
  };
  if (loss_reason) patch.loss_reason = loss_reason;
  if (next_action !== undefined) patch.next_action = next_action ? String(next_action).slice(0, 400) : null;
  if (owner !== undefined) patch.owner = owner ? String(owner).slice(0, 80) : null;
  if (note) {
    const notes = Array.isArray(record.ops_notes) ? record.ops_notes.slice() : [];
    notes.push({ at: now, actor: String(actor || "ops").slice(0, 80), note: String(note).slice(0, 1000) });
    patch.ops_notes = notes.slice(-50);
  }
  if (proposal_value !== undefined && proposal_value !== null && proposal_value !== "") {
    const n = Number(proposal_value);
    if (!Number.isFinite(n) || n < 0) {
      const err = new Error("invalid_proposal_value");
      err.code = "invalid_proposal_value";
      throw err;
    }
    patch.proposal_value = n;
  }
  if (contract_value !== undefined && contract_value !== null && contract_value !== "") {
    const n = Number(contract_value);
    if (!Number.isFinite(n) || n < 0) {
      const err = new Error("invalid_contract_value");
      err.code = "invalid_contract_value";
      throw err;
    }
    patch.contract_value = n;
  }
  if (revenue_received !== undefined && revenue_received !== null && revenue_received !== "") {
    const n = Number(revenue_received);
    if (!Number.isFinite(n) || n < 0) {
      const err = new Error("invalid_revenue");
      err.code = "invalid_revenue";
      throw err;
    }
    patch.revenue_received = n;
  }
  if (to === "won" && !patch.contract_value && record.contract_value == null && proposal_value == null) {
    // won without value is allowed but flagged
    patch.won_without_value = true;
  }
  return patch;
}

/** Public redaction — never expose PII via ops list without token (caller enforces auth). */
function publicLeadSummary(record) {
  if (!record) return null;
  const record_kind = record.record_kind || "real";
  const isReal = record_kind === "real";
  return {
    lead_id: record.lead_id,
    record_kind,
    commercial_stage: record.commercial_stage || record.status || "lead_persisted",
    received_at: record.received_at,
    updated_at: record.updated_at,
    jornada: record.jornada,
    estagio: record.estagio,
    origem: record.origem,
    landing_page: record.landing_page,
    content_cluster: record.content_cluster,
    utm_source: record.utm_source,
    utm_campaign: record.utm_campaign,
    owner: record.owner || null,
    next_action: record.next_action || null,
    last_contact_at: record.last_contact_at || null,
    loss_reason: record.loss_reason || null,
    proposal_value: record.proposal_value ?? null,
    contract_value: record.contract_value ?? null,
    revenue_received: record.revenue_received ?? null,
    stage_history: Array.isArray(record.stage_history)
      ? record.stage_history.map((h) => ({
          at: h.at,
          from: h.from,
          to: h.to,
          actor: h.actor ? String(h.actor).slice(0, 40) : undefined,
        }))
      : [],
    sla_hours_open: hoursSince(record.received_at),
    // SLA only applies to commercial (real) leads
    needs_contact:
      isReal &&
      (record.commercial_stage || "lead_persisted") === "lead_persisted" &&
      hoursSince(record.received_at) >= Number(process.env.LEAD_SLA_HOURS || 4),
  };
}

function hoursSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.round((Date.now() - t) / 36e5 * 10) / 10;
}

/**
 * Funnel conversion rates between stages for a set of leads.
 * Uses peak stage reached (stage_history) when available.
 *
 * By default only `record_kind === "real"` (or missing kind treated as real for
 * pre-migration rows that were not multi-signal probes) are included when
 * `commercialOnly` is true. Pass commercialOnly:false for System Health views.
 */
function funnelRates(leads, options = {}) {
  const commercialOnly = options.commercialOnly !== false;
  let pool = leads || [];
  if (commercialOnly) {
    try {
      const { filterCommercialLeads } = require("./record-kind.cjs");
      pool = filterCommercialLeads(pool);
    } catch {
      pool = pool.filter((l) => !l.record_kind || l.record_kind === "real");
    }
  }

  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const lead of pool) {
    const peak = peakStage(lead);
    const idx = STAGES.indexOf(peak);
    for (let i = 0; i <= idx && i < STAGES.length; i++) {
      // Only count commercial path from lead_persisted for CRM metrics
      if (STAGES[i] === "visitor" || STAGES[i] === "cta_triggered" || STAGES[i] === "form_started") continue;
      counts[STAGES[i]] += 1;
    }
    // Always count entry
    counts.lead_persisted = (counts.lead_persisted || 0);
  }
  // Recompute properly: every lead is at least lead_persisted
  const n = pool.length;
  counts.lead_persisted = n;
  for (const s of ["contacted", "qualified", "meeting", "proposal", "won"]) {
    counts[s] = pool.filter((l) => reachedStage(l, s)).length;
  }
  counts.lost = pool.filter((l) => (l.commercial_stage || l.status) === "lost").length;

  const rates = {};
  const pairs = [
    ["lead_persisted", "contacted"],
    ["contacted", "qualified"],
    ["qualified", "meeting"],
    ["meeting", "proposal"],
    ["proposal", "won"],
  ];
  for (const [a, b] of pairs) {
    rates[`${a}_to_${b}`] = counts[a] ? Math.round((counts[b] / counts[a]) * 1000) / 1000 : null;
  }
  const pipeline = pool.reduce((sum, l) => {
    const stage = l.commercial_stage || l.status;
    if (stage === "won") return sum;
    if (stage === "lost") return sum;
    const v = Number(l.proposal_value || l.contract_value || 0);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
  const revenue = pool.reduce((sum, l) => {
    const v = Number(l.revenue_received || (l.commercial_stage === "won" ? l.contract_value : 0) || 0);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  let last_real_conversion = null;
  for (const l of pool) {
    if ((l.commercial_stage || l.status) !== "won") continue;
    const t = l.updated_at || l.received_at;
    if (!t) continue;
    if (!last_real_conversion || String(t) > String(last_real_conversion)) {
      last_real_conversion = t;
    }
  }

  return {
    counts,
    rates,
    pipeline_value: pipeline,
    revenue,
    n,
    commercial_only: commercialOnly,
    last_real_conversion,
  };
}

function peakStage(lead) {
  const hist = lead.stage_history || [];
  let best = lead.commercial_stage || lead.status || "lead_persisted";
  let bestIdx = STAGES.indexOf(best);
  for (const h of hist) {
    const i = STAGES.indexOf(h.to);
    if (i > bestIdx) {
      bestIdx = i;
      best = h.to;
    }
  }
  return bestIdx >= 0 ? best : "lead_persisted";
}

function reachedStage(lead, stage) {
  if ((lead.commercial_stage || lead.status) === stage) return true;
  const hist = lead.stage_history || [];
  if (hist.some((h) => h.to === stage)) return true;
  // Peak-stage fallback: if current stage is later in funnel, earlier stages are reached
  const peak = peakStage(lead);
  const peakIdx = STAGES.indexOf(peak);
  const wantIdx = STAGES.indexOf(stage);
  if (peakIdx >= 0 && wantIdx >= 0 && peakIdx >= wantIdx && stage !== "lost" && peak !== "lost") {
    return true;
  }
  return false;
}

/** Default commercial fields for new lead records */
function commercialDefaults(received_at) {
  return {
    commercial_stage: "lead_persisted",
    stage_history: [
      {
        at: received_at,
        from: "form_started",
        to: "lead_persisted",
        actor: "system",
        note: "form_submit",
      },
    ],
    owner: null,
    next_action: "first_contact",
    last_contact_at: null,
    loss_reason: null,
    proposal_value: null,
    contract_value: null,
    revenue_received: null,
    ops_notes: [],
    session_id: null,
    previous_page: null,
    cta_id: null,
    offer_id: null,
  };
}

/**
 * System Health view: counts by kind + non-real funnel (never mixed into commercial totals).
 */
function systemHealth(leads) {
  let counts_by_kind = { real: 0, synthetic: 0, qa: 0, spam: 0, internal: 0 };
  try {
    const { countByKind } = require("./record-kind.cjs");
    counts_by_kind = countByKind(leads);
  } catch {
    for (const l of leads || []) {
      const k = l.record_kind || "real";
      counts_by_kind[k] = (counts_by_kind[k] || 0) + 1;
    }
  }
  const real = (leads || []).filter((l) => !l.record_kind || l.record_kind === "real");
  const nonReal = (leads || []).filter((l) => l.record_kind && l.record_kind !== "real");
  const realFunnel = funnelRates(real, { commercialOnly: false });
  const probeFunnel = funnelRates(nonReal, { commercialOnly: false });
  return {
    counts_by_kind,
    real_leads: real.length,
    synthetic_leads: counts_by_kind.synthetic || 0,
    qa_leads: counts_by_kind.qa || 0,
    spam_leads: counts_by_kind.spam || 0,
    internal_leads: counts_by_kind.internal || 0,
    pipeline_real: realFunnel.pipeline_value,
    revenue_real: realFunnel.revenue,
    last_real_conversion: realFunnel.last_real_conversion,
    probe_funnel: probeFunnel.counts,
    note: "Commercial metrics exclude non-real. Probes appear only here.",
  };
}

module.exports = {
  STAGES,
  LOSS_REASONS,
  TERMINAL,
  ALLOWED,
  isValidStage,
  canTransition,
  applyStageChange,
  publicLeadSummary,
  funnelRates,
  commercialDefaults,
  peakStage,
  reachedStage,
  systemHealth,
};
