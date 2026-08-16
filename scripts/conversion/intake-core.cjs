/**
 * Isolated CNPJ intake + commercial hand-raise. Persist first, then transport.
 * Does not call lead-core validateAndNormalize on the CNPJ-only path.
 */
const crypto = require("crypto");
const adapter = require("./adapter.cjs");
const { validateCnpj } = require("./cnpj.cjs");
const { requestFactualPayload, toPublicXray } = require("./xray.cjs");
const { selectNextActions } = require("./next-action.cjs");
const { defaultCanaryAttribution, pickConversionAttribution, attributionComplete } = require("./attribution.cjs");
const { publicUrlForJourney, sanitizeAnalytics, findPiiNeedles } = require("./minimize.cjs");
const { STEPS, createTrace, recordStep, persistBeforeHandoff } = require("./persist-order.cjs");
const { journeyCopy } = require("./copy.cjs");
const { canaryEnabled } = require("./flag.cjs");

function xrayIdempotencyKey(explicit, cnpj, correlationId) {
  if (explicit) {
    let e = String(explicit).trim();
    if (e.toLowerCase().startsWith("idk:")) e = e.slice(4);
    e = e.slice(0, 120);
    if (e) return `idk:${e}`;
  }
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const material = [cnpj || "", correlationId || "", String(bucket)].join("|");
  return `auto:${crypto.createHash("sha256").update(material).digest("hex").slice(0, 32)}`;
}

function isHoneypot(data) {
  const hp = data && (data["empresa-site"] || data.bot_field || data.website || data.fax);
  return Boolean(hp && String(hp).trim());
}

function publicXrayBody({ receipt, xray, next_actions, idempotent, copy }) {
  return {
    ok: true,
    receipt_id: receipt.receipt_id,
    correlation_id: receipt.correlation_id,
    status: receipt.status,
    idempotent: Boolean(idempotent),
    auto_send: false,
    sla: "UNKNOWN",
    public_url: publicUrlForJourney(receipt.landing_page || "/piloto/conversion-market-answer/"),
    xray,
    next_actions,
    copy: {
      what_happens_next: copy.what_happens_next,
      method_limits: copy.method_limits,
      privacy: copy.privacy,
      sla: "UNKNOWN",
    },
    consent_state: receipt.consent_state,
    handoff_status: receipt.handoff && receipt.handoff.status,
  };
}

async function persistNew(store, record) {
  await store.put(record, { onlyIfNew: true });
  return record;
}

async function lookupExisting(store, idemKey, receiptId) {
  if (store.getByIdempotency) {
    const byIdem = await store.getByIdempotency(idemKey);
    if (byIdem && (byIdem.lead_id || byIdem.receipt_id)) return byIdem;
  }
  if (store.get && receiptId) {
    const byId = await store.get(receiptId);
    if (byId && (byId.lead_id || byId.receipt_id)) return byId;
  }
  return null;
}

async function handleXrayRequest({ store, body, env, fetchFn, timeoutMs, now } = {}) {
  const trace = createTrace();
  const logs = [];
  const data = body && typeof body === "object" ? body : {};
  const copy = journeyCopy();

  if (!canaryEnabled(env || process.env) && (env || process.env).CONVERSION_CANARY !== "1") {
    if ((env || process.env).NODE_ENV !== "test") {
      return {
        statusCode: 404,
        body: { ok: false, error: "canary_disabled", message: "Jornada indisponivel." },
        trace,
        logs,
      };
    }
  }

  if (isHoneypot(data)) {
    return {
      statusCode: 200,
      body: { ok: true, status: "suppressed", receipt_id: adapter.newId("honeypot"), auto_send: false },
      trace,
      logs,
    };
  }

  const checked = validateCnpj(data.cnpj || data.cnpj14);
  if (!checked.ok) {
    return {
      statusCode: 400,
      body: { ok: false, error: checked.error, message: checked.message, auto_send: false },
      trace,
      logs,
    };
  }
  recordStep(trace, STEPS.VALIDATED, { field: "cnpj" });

  const correlation_id = String(data.correlation_id || `c-${crypto.randomBytes(8).toString("hex")}`).slice(0, 80);
  const idemKey = xrayIdempotencyKey(data.idempotency_key || data.idempotencyKey, checked.cnpj, correlation_id);
  const receipt_id = adapter.newId(`idem|${idemKey}`);
  const attribution = defaultCanaryAttribution({
    ...pickConversionAttribution(data),
    correlation_id,
    idempotency_key: idemKey,
    consent_state: "not_required",
    intent: data.intent || "ver_propria_empresa",
  });

  const existing = await lookupExisting(store, idemKey, receipt_id);
  if (existing) {
    const xrayState = existing.xray_state || "READY";
    const factual = requestFactualPayload({
      cnpj: checked.cnpj,
      fixture_state: data.fixture_state || xrayState,
    });
    const xray = toPublicXray(factual.payload, factual.state);
    const next_actions = selectNextActions({ xrayState: factual.state });
    logs.push({ event: "xray_idempotent_hit", fields: { receipt_id: existing.receipt_id || existing.lead_id } });
    return {
      statusCode: 200,
      body: publicXrayBody({
        receipt: { ...existing, receipt_id: existing.receipt_id || existing.lead_id },
        xray,
        next_actions,
        idempotent: true,
        copy,
      }),
      receipt: existing,
      persisted: false,
      trace,
      logs,
    };
  }

  const received_at = (now || new Date()).toISOString();
  const record = adapter.buildXrayReceipt({
    receipt_id,
    cnpj: checked.cnpj,
    attribution,
    idempotency_key: idemKey,
    correlation_id,
    received_at,
  });

  try {
    await persistNew(store, record);
  } catch (err) {
    if (err && err.code === "ALREADY_EXISTS" && err.existing) {
      const rec = err.existing;
      const factual = requestFactualPayload({ cnpj: checked.cnpj, fixture_state: data.fixture_state });
      return {
        statusCode: 200,
        body: publicXrayBody({
          receipt: rec,
          xray: toPublicXray(factual.payload, factual.state),
          next_actions: selectNextActions({ xrayState: factual.state }),
          idempotent: true,
          copy,
        }),
        receipt: rec,
        persisted: false,
        trace,
        logs,
      };
    }
    recordStep(trace, STEPS.EXCEPTION, { stage: "persist", error: String(err && err.message).slice(0, 80) });
    return {
      statusCode: 503,
      body: { ok: false, error: "persist_failed", message: "Nao foi possivel registrar a solicitacao.", auto_send: false },
      trace,
      logs,
    };
  }
  recordStep(trace, STEPS.PERSISTED, { receipt_id });
  logs.push({ event: "xray_persisted", fields: { receipt_id } });

  const handoff = await adapter.attemptAdapterHandoff(store, record, {
    env: env || process.env,
    fetchFn,
    timeoutMs,
    now: now || new Date(),
    trace,
  });
  record.handoff = handoff;

  const factual = requestFactualPayload({
    cnpj: checked.cnpj,
    fixture_state: data.fixture_state,
    forceError: data.force_error === true,
  });
  record.xray_state = factual.state;
  if (store.update) {
    try {
      await store.update(record.lead_id, { xray_state: factual.state, handoff });
    } catch {
      /* non-fatal */
    }
  }
  recordStep(trace, STEPS.FACTUAL_LOADED, { state: factual.state, catalog_mode: factual.payload && factual.payload.catalog_mode });

  const xray = toPublicXray(factual.payload, factual.state);
  const next_actions = selectNextActions({ xrayState: factual.state });
  const bodyOut = publicXrayBody({ receipt: record, xray, next_actions, idempotent: false, copy });

  const piiHits = findPiiNeedles(bodyOut, { cnpj: checked.cnpj });
  if (piiHits.length) {
    return {
      statusCode: 500,
      body: { ok: false, error: "pii_leak_blocked", message: "Resposta bloqueada.", auto_send: false },
      trace,
      logs,
    };
  }

  bodyOut.trace_persist_before_handoff = persistBeforeHandoff(trace);
  return {
    statusCode: 201,
    body: bodyOut,
    receipt: record,
    persisted: true,
    analytics: sanitizeAnalytics("xray_ready", {
      asset_family: attribution.asset_family,
      market_answer_id: attribution.market_answer_id,
      xray_state: factual.state,
      intent: attribution.intent,
    }, { cnpj: checked.cnpj }),
    trace,
    logs,
  };
}

async function handleHandraise({ store, body, env, fetchFn, timeoutMs, now } = {}) {
  const trace = createTrace();
  const logs = [];
  const data = body && typeof body === "object" ? body : {};

  if (isHoneypot(data)) {
    return {
      statusCode: 200,
      body: { ok: true, status: "suppressed", lead_id: adapter.newId("honeypot"), auto_send: false },
      trace,
      logs,
    };
  }

  const validated = adapter.commercialValidate(data);
  if (validated.honeypot) {
    return {
      statusCode: 200,
      body: { ok: true, status: "suppressed", auto_send: false },
      trace,
      logs,
    };
  }
  if (!validated.ok) {
    return {
      statusCode: validated.status || 400,
      body: { ok: false, error: validated.error, message: validated.message, auto_send: false },
      trace,
      logs,
    };
  }
  recordStep(trace, STEPS.VALIDATED, { kind: "commercial" });

  const lead = validated.lead;
  const headerIdem = data.idempotency_key || data.idempotencyKey;
  const idemKey = adapter.commercialIdempotency(lead, headerIdem || null);
  lead.idempotency_key = idemKey;
  const lead_id = adapter.newId(`idem|${idemKey}`);
  const attribution = defaultCanaryAttribution({
    ...pickConversionAttribution(data),
    correlation_id: lead.correlation_id || data.correlation_id || `c-${lead_id}`,
    idempotency_key: idemKey,
    consent_state: "granted",
    intent: data.intent || "revisar_contrato",
    question_class: data.question_class || "contract_review",
    handoff_status: "PENDING",
  });

  const existing = await lookupExisting(store, idemKey, lead_id);
  if (existing) {
    logs.push({ event: "handraise_idempotent_hit", fields: { lead_id: existing.lead_id } });
    return {
      statusCode: 200,
      body: {
        ok: true,
        lead_id: existing.lead_id,
        receipt_id: existing.lead_id,
        idempotent: true,
        auto_send: false,
        sla: "UNKNOWN",
        handoff_status: existing.handoff && existing.handoff.status,
        consent_state: "granted",
      },
      receipt: existing,
      persisted: false,
      trace,
      logs,
    };
  }

  const received_at = (now || new Date()).toISOString();
  const record = adapter.buildCommercialRecord({
    lead_id,
    lead: { ...lead, ...attribution, cnpj: data.cnpj || lead.cnpj || null },
    received_at,
    ip_hash: "test",
    fingerprint: "conversion",
    status: "persisted",
    attribution,
  });
  record.handoff = adapter.inbound.initialHandoff(env || process.env, record);
  record.auto_send = false;

  try {
    await persistNew(store, record);
  } catch (err) {
    if (err && err.code === "ALREADY_EXISTS" && err.existing) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          lead_id: err.existing.lead_id,
          receipt_id: err.existing.lead_id,
          idempotent: true,
          auto_send: false,
          sla: "UNKNOWN",
        },
        receipt: err.existing,
        persisted: false,
        trace,
        logs,
      };
    }
    recordStep(trace, STEPS.EXCEPTION, { stage: "persist" });
    return {
      statusCode: 503,
      body: { ok: false, error: "persist_failed", message: "Nao foi possivel registrar a solicitacao.", auto_send: false },
      receipt: null,
      trace,
      logs,
    };
  }
  recordStep(trace, STEPS.PERSISTED, { lead_id });
  logs.push({ event: "handraise_persisted", fields: { lead_id } });

  const handoff = await adapter.attemptAdapterHandoff(store, record, {
    env: env || process.env,
    fetchFn,
    timeoutMs,
    now: now || new Date(),
    trace,
  });
  record.handoff = handoff;
  if (handoff && (handoff.status === "RETRYABLE" || handoff.status === "DEAD" || handoff.status === "BLOCKED")) {
    recordStep(trace, STEPS.EXCEPTION, { stage: "handoff", status: handoff.status });
  }

  const completeness = attributionComplete({
    ...attribution,
    handoff_status: handoff && handoff.status,
  });

  return {
    statusCode: 201,
    body: {
      ok: true,
      lead_id,
      receipt_id: lead_id,
      received_at,
      status: "persisted",
      idempotent: false,
      auto_send: false,
      sla: "UNKNOWN",
      handoff_status: handoff && handoff.status,
      consent_state: "granted",
      persist_before_handoff: persistBeforeHandoff(trace),
      attribution_complete: completeness.ok,
    },
    receipt: record,
    persisted: true,
    trace,
    logs,
  };
}

module.exports = {
  xrayIdempotencyKey,
  handleXrayRequest,
  handleHandraise,
};
