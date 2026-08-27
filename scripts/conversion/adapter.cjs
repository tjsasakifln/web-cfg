/**
 * Isolated adapter around frozen PR #85 lead/handoff libs.
 * Does not edit inbound-handoff.cjs, lead-core.cjs, or lead-store.cjs.
 * Extra conversion attribution lives on the adapter record and, when
 * transporting, is merged onto the inbound v1 payload for Goal 09.
 */
const crypto = require("crypto");
const path = require("path");

const leadCore = require("../../netlify/functions/lib/lead-core.cjs");
const leadStore = require("../../netlify/functions/lib/lead-store.cjs");
const inbound = require("../../netlify/functions/lib/inbound-handoff.cjs");
const { pickConversionAttribution, fieldsDroppedByInboundV1 } = require("./attribution.cjs");
const { hashCnpj } = require("./cnpj.cjs");
const { safeFields } = require("./minimize.cjs");
const { STEPS, recordStep } = require("./persist-order.cjs");

function frozenLibPaths() {
  const root = path.join(__dirname, "../..");
  return [
    path.join(root, "netlify/functions/lib/inbound-handoff.cjs"),
    path.join(root, "netlify/functions/lib/lead-core.cjs"),
    path.join(root, "netlify/functions/lib/lead-store.cjs"),
  ];
}

function buildXrayReceipt({
  receipt_id,
  cnpj,
  attribution,
  idempotency_key,
  correlation_id,
  received_at,
  xray_state,
}) {
  const attr = pickConversionAttribution(attribution || {});
  return {
    lead_id: receipt_id,
    receipt_id,
    receipt_kind: "xray_request",
    record_kind: "request",
    status: "persisted",
    cnpj,
    cnpj_hash: hashCnpj(cnpj),
    nome: null,
    email: null,
    telefone: null,
    consentimento: false,
    consent_state: attr.consent_state || "not_required",
    auto_send: false,
    source: "CONFENGE_WEB",
    idempotency_key,
    correlation_id: correlation_id || attr.correlation_id || receipt_id,
    conversion_attribution: attr,
    asset_family: attr.asset_family || "market_answer",
    market_answer_id: attr.market_answer_id || null,
    analysis_id: attr.analysis_id || null,
    intent: attr.intent || "ver_propria_empresa",
    question_class: attr.question_class || null,
    asset_version: attr.asset_version || null,
    method_version: attr.method_version || null,
    schema_version: attr.schema_version || null,
    cta: attr.cta || null,
    cta_id: attr.cta_id || null,
    drill_down_origin: attr.drill_down_origin || "answer_to_xray",
    route_family: attr.route_family || "market-answer-xray",
    asset_id: attr.asset_id || attr.market_answer_id || null,
    landing_page: attr.landing_page || null,
    landing_url: attr.landing_url || null,
    referrer: attr.referrer || null,
    evidence_pack_version: attr.evidence_pack_version || attr.method_version || null,
    public_contract_id: attr.public_contract_id || null,
    public_entity_id: attr.public_entity_id || null,
    utm_source: attr.utm_source || null,
    utm_medium: attr.utm_medium || null,
    utm_campaign: attr.utm_campaign || null,
    received_at,
    updated_at: received_at,
    xray_state: xray_state || null,
    handoff: {
      target: "warmbly_inbound",
      status: "SKIPPED",
      reason: "not_commercial",
      attempts: 0,
      last_error: null,
    },
    audit: [{ at: received_at, event: "created", status: "persisted", kind: "xray_request" }],
  };
}

function mergeCommercialRecord(base, attribution) {
  const attr = pickConversionAttribution(attribution || {});
  return {
    ...base,
    auto_send: false,
    conversion_attribution: attr,
    market_answer_id: attr.market_answer_id || base.market_answer_id || null,
    intent: attr.intent || base.intent || null,
    question_class: attr.question_class || null,
    asset_version: attr.asset_version || null,
    method_version: attr.method_version || null,
    schema_version: attr.schema_version || null,
    cta: attr.cta || null,
    drill_down_origin: attr.drill_down_origin || null,
    consent_state: attr.consent_state || (base.consentimento ? "granted" : "unknown"),
    evidence_pack_version: base.evidence_pack_version || attr.method_version || null,
  };
}

function extendInboundPayload(record) {
  const base = inbound.mapLeadToInboundV1(record);
  const attr = pickConversionAttribution({
    ...(record.conversion_attribution || {}),
    ...record,
  });
  const extra = {};
  for (const key of fieldsDroppedByInboundV1(attr)) {
    if (attr[key]) extra[key] = attr[key];
  }
  if (record.auto_send === false) extra.auto_send = false;
  extra.auto_send = false;
  if (Object.keys(extra).length) {
    base.conversion = extra;
  }
  return base;
}

async function postExtendedInbound(record, opts = {}) {
  const env = opts.env || process.env;
  const now = opts.now || new Date();
  const cfg = inbound.resolveInboundConfig(env);
  if (cfg.skip) {
    return { status: inbound.STATUS.SKIPPED, reason: cfg.reason, attemptsDelta: 0 };
  }
  if (cfg.blocked) {
    return {
      status: inbound.STATUS.BLOCKED,
      reason: cfg.reason,
      last_error: cfg.reason,
      attemptsDelta: 0,
    };
  }

  const payload = extendInboundPayload(record);
  if (!payload.lead_id && !payload.receipt_id) {
    return {
      status: inbound.STATUS.DEAD,
      reason: "missing_lead_id",
      last_error: "missing_lead_id",
      attemptsDelta: 0,
    };
  }
  const rawBody = JSON.stringify(payload);
  const unix = Math.floor(now.getTime() / 1000);
  const signature = inbound.signWarmblyInbound(cfg.secret, rawBody, unix);
  const fetchFn = opts.fetchFn || globalThis.fetch;
  const timeoutMs = opts.timeoutMs || cfg.timeoutMs;
  const started = Date.now();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetchFn(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "confenge-conversion-inbound/1.0",
        "X-Warmbly-Signature": signature,
        "Idempotency-Key": payload.lead_id || payload.receipt_id,
      },
      body: rawBody,
      signal: controller ? controller.signal : undefined,
    });
    const latency_ms = Date.now() - started;
    let status = inbound.STATUS.RETRYABLE;
    let downstream = null;
    if (res.status === 200 || res.status === 201) {
      const data = await res.json().catch(() => ({}));
      const inner = data && data.data ? data.data : data;
      const receipt = inner && (
        inner.receipt_id ||
        (inner.lead && (inner.lead.receipt_id || inner.lead.lead_id))
      );
      const actionId = inner && inner.action && (inner.action.id || inner.action.ID);
      const expectedReceipt = String(payload.receipt_id || payload.lead_id || "");
      if (receipt && String(receipt) === expectedReceipt) {
        status = inbound.STATUS.DELIVERED;
        downstream = {
          http: res.status,
          duplicate: Boolean(inner && inner.duplicate),
          downstream_receipt: String(receipt).slice(0, 80),
          action_id: actionId ? String(actionId).slice(0, 80) : undefined,
        };
      }
    }
    else if (res.status === 401 || res.status === 403) status = inbound.STATUS.BLOCKED;
    else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      status = inbound.STATUS.DEAD;
    }
    return {
      status,
      http: res.status,
      latency_ms,
      last_error: status === inbound.STATUS.DELIVERED
        ? null
        : res.status === 200 || res.status === 201
          ? "downstream_receipt_invalid"
          : `webhook_http_${res.status}`,
      attemptsDelta: 1,
      payload,
      downstream,
    };
  } catch (err) {
    const aborted = err && (err.name === "AbortError" || /aborted|timeout/i.test(String(err.message || "")));
    return {
      status: inbound.STATUS.RETRYABLE,
      latency_ms: Date.now() - started,
      last_error: aborted ? "timeout" : inbound.sanitizeError(err),
      attemptsDelta: 1,
      payload,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function attemptAdapterHandoff(store, record, opts = {}) {
  const trace = opts.trace;
  const commercial = record && record.receipt_kind !== "xray_request" && record.consentimento === true;
  recordStep(trace, STEPS.HANDOFF_ATTEMPTED, {
    commercial: Boolean(commercial),
    receipt_id: record && record.receipt_id,
  });

  if (!commercial) {
    const skipped = {
      target: "warmbly_inbound",
      status: inbound.STATUS.SKIPPED,
      reason: record && record.consentimento ? "not_commercial" : "consent_absent",
      attempts: 0,
      last_error: null,
    };
    recordStep(trace, STEPS.HANDOFF_RESULT, { status: skipped.status, reason: skipped.reason });
    return skipped;
  }

  const result = await postExtendedInbound(record, opts);
  const next = inbound.applyAttempt(record.handoff || inbound.initialHandoff(opts.env || process.env, record), result, {
    now: opts.now || new Date(),
    env: opts.env || process.env,
  });
  leadCore.safeLog("info", "conversion_handoff_attempt", safeFields({
    lead_id: record.lead_id,
    status: next.status,
    http: next.http_status || null,
    error: next.last_error || null,
  }));
  if (store && typeof store.update === "function") {
    try {
      await store.update(record.lead_id, { handoff: next });
    } catch (err) {
      leadCore.safeLog("error", "conversion_handoff_status_update_failed", {
        lead_id: record.lead_id,
        code: inbound.sanitizeError(err),
      });
    }
  }
  recordStep(trace, STEPS.HANDOFF_RESULT, { status: next.status, error: next.last_error || null });
  return next;
}

function commercialValidate(data) {
  return leadCore.validateAndNormalize(data);
}

function newId(seed) {
  return leadCore.generateLeadId(seed, { deterministic: true });
}

function commercialIdempotency(lead, explicit) {
  return leadCore.idempotencyKeyFor(lead, explicit);
}

function buildCommercialRecord(args) {
  const base = leadStore.buildLeadRecord(args);
  return mergeCommercialRecord(base, args.attribution || args.lead);
}

module.exports = {
  frozenLibPaths,
  leadCore,
  leadStore,
  inbound,
  buildXrayReceipt,
  mergeCommercialRecord,
  extendInboundPayload,
  postExtendedInbound,
  attemptAdapterHandoff,
  commercialValidate,
  newId,
  commercialIdempotency,
  buildCommercialRecord,
  hashIdem: (key) => crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 24),
};
