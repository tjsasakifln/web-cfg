/**
 * Production lead intake — CONFENGE.
 *
 * Contract:
 * 1) Validate + sanitize server-side
 * 2) Rate limit (IP + fingerprint)
 * 3) Turnstile when configured
 * 4) Persist durable record BEFORE success response
 * 5) Authenticated notify + transactional email (best-effort, non-blocking of persist)
 * 6) Public response never includes secrets, topics, tokens, or free-text PII fields
 * 7) Semantic HTTP codes — no 200 when not persisted
 */
const crypto = require("crypto");
const {
  parseBody,
  validateAndNormalize,
  generateLeadId,
  idempotencyKeyFor,
  clientIp,
  technicalFingerprint,
  originAllowed,
  corsHeaders,
  publicSuccessBody,
  publicErrorBody,
  safeLog,
  retentionPolicy,
} = require("./lib/lead-core.cjs");
const { createStore, buildLeadRecord } = require("./lib/lead-store.cjs");
const { rateLimit } = require("./lib/lead-rate-limit.cjs");
const { verifyTurnstile, deliverAll } = require("./lib/lead-delivery.cjs");
const { initialHandoff, attemptInboundHandoff } = require("./lib/inbound-handoff.cjs");

// Allow tests to inject store
let _storeOverride = null;
function setStoreForTests(store) {
  _storeOverride = store;
}

async function getStore(event) {
  if (_storeOverride) return _storeOverride;
  return createStore({ event });
}

exports.setStoreForTests = setStoreForTests;

exports.handler = async (event) => {
  const originCheck = originAllowed(event);
  const headers = corsHeaders(originCheck.origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify(publicErrorBody({ error: "method_not_allowed", message: "Método não permitido." })),
    };
  }

  if (!originCheck.ok) {
    safeLog("warn", "origin_denied", {});
    return {
      statusCode: originCheck.status || 403,
      headers,
      body: JSON.stringify(
        publicErrorBody({ error: originCheck.error, message: originCheck.message }),
      ),
    };
  }

  const parsed = parseBody(event);
  if (!parsed.ok) {
    return {
      statusCode: parsed.status || 400,
      headers,
      body: JSON.stringify(
        publicErrorBody({
          error: parsed.error,
          message:
            parsed.error === "payload_too_large"
              ? "Payload muito grande."
              : parsed.error === "file_payload_rejected"
                ? "Anexos não são aceitos por este formulário. Solicite um canal seguro para envio."
                : parsed.error === "unsupported_media_type"
                  ? "Tipo de conteúdo não suportado."
                : "Requisição inválida.",
        }),
      ),
    };
  }

  const validated = validateAndNormalize(parsed.data);
  if (validated.honeypot) {
    // Silent success for bots — no persist, no delivery, fake id shape
    const fake = generateLeadId("honeypot");
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(
        publicSuccessBody({
          lead_id: fake,
          received_at: new Date().toISOString(),
          journey: "operacao",
          stage_category: "suppressed",
          status: "suppressed",
        }),
      ),
    };
  }
  if (!validated.ok) {
    return {
      statusCode: validated.status || 400,
      headers,
      body: JSON.stringify(
        publicErrorBody({ error: validated.error, message: validated.message }),
      ),
    };
  }

  const lead = validated.lead;
  const ip = clientIp(event);
  const fingerprint = technicalFingerprint(event, lead);

  const rl = rateLimit({ ip, fingerprint });
  if (!rl.allowed) {
    safeLog("warn", "rate_limited", { reason: rl.reason, fp: fingerprint });
    return {
      statusCode: 429,
      headers: {
        ...headers,
        "Retry-After": String(rl.retryAfter || 60),
      },
      body: JSON.stringify(
        publicErrorBody({
          error: "rate_limited",
          message: "Muitas tentativas. Aguarde um momento e tente novamente.",
        }),
      ),
    };
  }

  // A synthetic probe proves itself with LEAD_PROBE_SECRET: a 32+ character
  // server-side secret, compared in constant time, that no browser ever holds.
  // Turnstile proves the opposite thing — that a human browser solved a
  // challenge — which a probe by definition is not and cannot be. Requiring it
  // of the probe made the only non-fabricating way to exercise inbound
  // plumbing in production impossible, so first-touch persistence and the
  // Warmbly handoff could no longer be verified without inventing a real lead.
  // Probe records are already tagged SYNTHETIC-PROBE and never reach commercial
  // totals.
  const turnstile = originCheck.probe
    ? { ok: true, skipped: true, reason: "synthetic_probe" }
    : await verifyTurnstile(lead.turnstile_token, ip);
  if (!turnstile.ok) {
    safeLog("warn", "turnstile_rejected", { error: turnstile.error });
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify(
        publicErrorBody({
          error: "anti_abuse",
          message: "Falha na verificação antiabuso. Recarregue a página e tente novamente.",
        }),
      ),
    };
  }

  const store = await getStore(event);
  if (!store) {
    safeLog("error", "store_unavailable", {});
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify(
        publicErrorBody({
          error: "store_unavailable",
          message: "Serviço temporariamente indisponível. Use o WhatsApp ou tente em instantes.",
        }),
      ),
    };
  }

  // Production profile: never acknowledge success on ephemeral store
  try {
    const { isProductionProfile, assertProductionStorePolicy } = require("./lib/lead-store.cjs");
    const pol = assertProductionStorePolicy(process.env, event);
    if (!pol.ok) {
      safeLog("error", "store_policy_violation", { code: pol.code });
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify(
          publicErrorBody({
            error: "store_unavailable",
            message: "Serviço temporariamente indisponível. Use o WhatsApp ou tente em instantes.",
          }),
        ),
      };
    }
    if (store.ephemeral && isProductionProfile()) {
      safeLog("error", "store_ephemeral_blocked_production", {});
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify(
          publicErrorBody({
            error: "store_unavailable",
            message: "Serviço temporariamente indisponível. Use o WhatsApp ou tente em instantes.",
          }),
        ),
      };
    }
  } catch (_) { /* keep legacy path */ }
  // Ephemeral memory without explicit allow is only for tests
  if (store.ephemeral && process.env.LEAD_ALLOW_MEMORY_FALLBACK !== "1" && process.env.NODE_ENV !== "test") {
    safeLog("error", "store_ephemeral_blocked", {});
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify(
        publicErrorBody({
          error: "store_unavailable",
          message: "Serviço temporariamente indisponível. Use o WhatsApp ou tente em instantes.",
        }),
      ),
    };
  }

  const headerIdem =
    (event.headers && (event.headers["idempotency-key"] || event.headers["Idempotency-Key"])) ||
    lead.idempotency_key;
  const idemKey = idempotencyKeyFor(lead, headerIdem || null);
  lead.idempotency_key = idemKey;

  // Paid parameter orders (Radar Decisório): mint the payment correlation from
  // the idempotency key so a retry reconciles against the same payment, and
  // fail closed if the `cfg:{offer_id}:{correlation_id}` policy cannot be met.
  // Nothing is emitted to the visitor before the durable persist succeeds.
  let radarPublic = null;
  if (lead.radar_params) {
    try {
      const radar = require("./lib/radar-params.cjs");
      const correlationId = radar.correlationIdFor(idemKey);
      const ref = radar.buildExternalReference(lead.radar_params.offer_id, correlationId);
      if (!ref.ok) throw new Error(ref.error || "external_reference_invalid");
      lead.radar_params = {
        ...lead.radar_params,
        correlation_id: correlationId,
        external_reference: ref.external_reference,
      };
      lead.external_reference = ref.external_reference;
      radarPublic = {
        correlation_id: correlationId,
        external_reference: ref.external_reference,
        delivery_business_days: radar.DELIVERY_CLOCK.business_days,
      };
      safeLog("info", "radar_params_correlated", {
        offer_id: lead.radar_params.offer_id,
        recorte: lead.radar_params.recorte,
        uf: lead.radar_params.uf,
        segment_count: (lead.radar_params.segmentos || []).length,
      });
    } catch (err) {
      safeLog("error", "radar_correlation_failed", {
        code: err && err.message ? String(err.message).slice(0, 80) : "error",
      });
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify(
          publicErrorBody({
            error: "radar_correlation_failed",
            message: "Não foi possível registrar os parâmetros do Radar. O pagamento não foi liberado.",
          }),
        ),
      };
    }
  }

  // Deterministic id from idempotency key — same key always same lead_id even if
  // the idempotency map read is eventually consistent on first retry.
  const lead_id = generateLeadId(`idem|${idemKey}`, { deterministic: true });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const idempotentOk = (rec) => ({
    statusCode: 200,
    headers,
    body: JSON.stringify(
      publicSuccessBody({
        lead_id: rec.lead_id,
        received_at: rec.received_at,
        journey: rec.jornada,
        stage_category: rec.estagio,
        status: rec.status || "persisted",
        notify_status: rec.delivery?.notify?.status,
        email_status: rec.delivery?.email?.status,
        idempotent: true,
        document_intent: rec.document_intent,
        // Correlation comes from the stored record, never from the request.
        correlation_id: rec.radar_params ? rec.radar_params.correlation_id : undefined,
        external_reference: rec.radar_params ? rec.external_reference : undefined,
        delivery_business_days: rec.radar_params
          ? rec.radar_params.delivery_clock && rec.radar_params.delivery_clock.business_days
          : undefined,
      }),
    ),
  });

  // Brief read-retry: Blobs eventual consistency can miss a just-written key on the
  // immediate second POST. Must return 200 + idempotent:true without re-delivery.
  try {
    let hit = null;
    for (let attempt = 0; attempt < 4 && !hit; attempt++) {
      if (attempt > 0) await sleep(100 * attempt);
      const existing = await store.getByIdempotency(idemKey);
      if (existing && existing.lead_id) {
        hit = { rec: existing, via: "idem_map", attempt };
        break;
      }
      const byId = await store.get(lead_id);
      if (byId && byId.lead_id) {
        hit = { rec: byId, via: "deterministic_id", attempt };
        break;
      }
    }
    if (hit) {
      safeLog("info", "lead_idempotent_hit", {
        lead_id: hit.rec.lead_id,
        via: hit.via,
        attempt: hit.attempt,
      });
      return idempotentOk(hit.rec);
    }
  } catch (err) {
    safeLog("error", "idempotency_lookup_failed", {
      code: err && err.message ? String(err.message).slice(0, 80) : "error",
    });
  }

  const received_at = new Date().toISOString();
  const ip_hash = crypto.createHash("sha256").update(ip + (process.env.IP_HASH_SALT || "confenge")).digest("hex").slice(0, 16);

  const record = buildLeadRecord({
    lead_id,
    lead,
    received_at,
    ip_hash,
    fingerprint,
    status: "persisted",
    headers: event.headers || {},
  });
  // Probe identity is established by the constant-time server credential, not
  // by user-controlled names, emails or record_kind fields. Force the durable
  // classification so even a human-looking probe payload can never enter the
  // commercial queue. This marker is intentionally store/server-only.
  if (originCheck.probe) {
    record.record_kind = "synthetic";
    record.record_kind_signals = [
      ...new Set([...(record.record_kind_signals || []), "authenticated_probe"]),
    ];
    record.record_kind_classified_at = received_at;
    record.synthetic_probe_authenticated = true;
    record.next_action = "exclude_from_commercial";
    record.audit = [
      ...(record.audit || []),
      {
        at: received_at,
        event: "record_kind",
        from: null,
        to: "synthetic",
        signals: ["authenticated_probe"],
        actor: "system",
        note: "server_authenticated_probe",
      },
    ];
  }
  record.retention = retentionPolicy();
  record.handoff = initialHandoff(process.env, record);
  // Safe operational log: kind only, never PII
  safeLog("info", "lead_record_kind", {
    lead_id,
    record_kind: record.record_kind || "real",
    classifier: (record.record_kind_signals || []).length ? "signals" : "default",
  });

  try {
    // Create-only: if the deterministic id already exists (lookup missed, race, or
    // retry), do not overwrite and do not re-run delivery — return 200 idempotent.
    await store.put(record, { onlyIfNew: true });
    // Read-back (retry) — if put did not throw, do not hard-fail on momentary
    // eventual-consistency miss. Deterministic lead_id keeps retries convergent.
    let verified = await store.get(lead_id);
    if (!verified || verified.lead_id !== lead_id) {
      await sleep(250);
      verified = await store.get(lead_id);
    }
    if (!verified || verified.lead_id !== lead_id) {
      safeLog("warn", "persist_verify_miss_soft", { lead_id });
    }
    try {
      const again = await store.getByIdempotency(idemKey);
      if (!again || again.lead_id !== lead_id) {
        safeLog("warn", "idem_map_verify_miss", { lead_id });
      }
    } catch {
      /* non-fatal */
    }
  } catch (err) {
    if (err && err.code === "ALREADY_EXISTS") {
      let existing = err.existing || null;
      if (!existing || !existing.lead_id) {
        for (let attempt = 0; attempt < 4 && (!existing || !existing.lead_id); attempt++) {
          if (attempt > 0) await sleep(100 * attempt);
          existing = await store.get(lead_id).catch(() => null);
        }
      }
      if (existing && existing.lead_id) {
        safeLog("info", "lead_idempotent_hit", { lead_id: existing.lead_id, via: "only_if_new" });
        return idempotentOk(existing);
      }
      // Key exists (412) but body not yet readable — still must not re-deliver.
      safeLog("info", "lead_idempotent_hit", { lead_id, via: "only_if_new_body_pending" });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(
          publicSuccessBody({
            lead_id,
            received_at: new Date().toISOString(),
            journey: record.jornada,
            stage_category: record.estagio,
            status: "persisted",
            notify_status: "pending",
            email_status: "pending",
            idempotent: true,
            document_intent: record.document_intent,
            ...(radarPublic || {}),
          }),
        ),
      };
    }
    // Race: another request may have written the same deterministic id
    try {
      const raced = await store.get(lead_id);
      if (raced && raced.lead_id === lead_id) {
        safeLog("info", "lead_idempotent_race", { lead_id });
        return idempotentOk(raced);
      }
    } catch {
      /* fall through */
    }
    safeLog("error", "persist_failed", {
      code: err && err.message ? String(err.message).slice(0, 120) : "error",
      name: err && err.name ? String(err.name).slice(0, 40) : undefined,
    });
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify(
        publicErrorBody({
          error: "persist_failed",
          message: "Não foi possível registrar a solicitação. Tente novamente ou use o WhatsApp.",
        }),
      ),
    };
  }

  safeLog("info", "lead_persisted", {
    lead_id,
    journey: record.jornada,
    stage_len: (record.estagio || "").length,
    has_phone: Boolean(record.telefone),
    has_email: Boolean(record.email),
    utm_source: record.utm_source || null,
    handoff: record.handoff && record.handoff.status,
  });

  // Warmbly inbound after persist + outbox row. Failures never drop the lead
  // or change the visitor capture response.
  const persistOnlyProbe = Boolean(
    originCheck.probe &&
      event.headers &&
      String(
        event.headers["x-confenge-probe-persist-only"] ||
          event.headers["X-Confenge-Probe-Persist-Only"] ||
          "",
      ) === "1",
  );
  if (persistOnlyProbe) {
    safeLog("info", "synthetic_probe_persist_only", { lead_id });
  } else {
    try {
      await attemptInboundHandoff(store, record);
    } catch (err) {
      safeLog("error", "inbound_handoff_unexpected", {
        lead_id,
        code: err && err.message ? String(err.message).slice(0, 80) : "error",
      });
    }
  }

  // Delivery after persist — failures update status, never drop the lead
  let delivery;
  try {
    delivery = await deliverAll(record);
  } catch (err) {
    safeLog("error", "delivery_unexpected", {
      lead_id,
      code: err && err.message ? String(err.message).slice(0, 80) : "error",
    });
    delivery = {
      notify: { status: "error" },
      email: { status: "error" },
    };
  }

  // Normalize channel statuses for public non-PII surface
  const notify_status = delivery?.notify?.status || "pending";
  const email_status = delivery?.email?.status || "pending";

  try {
    await store.update(lead_id, {
      delivery: {
        notify: {
          status: notify_status,
          attempts: 1,
          channels: delivery.notify.channels,
        },
        email: {
          status: email_status,
          attempts: 1,
        },
      },
      status:
        notify_status === "ok" || email_status === "ok" ? "persisted_notified" : "persisted",
      audit: [
        ...(record.audit || []),
        {
          at: new Date().toISOString(),
          event: "delivery_attempt",
          notify: notify_status,
          email: email_status,
        },
      ],
    });
  } catch (err) {
    safeLog("error", "delivery_status_update_failed", {
      lead_id,
      code: err && err.message ? String(err.message).slice(0, 80) : "error",
    });
  }

  // Success: durable persist confirmed (email/notify optional but status always reported)
  return {
    statusCode: 201,
    headers,
    body: JSON.stringify(
      publicSuccessBody({
        lead_id,
        received_at,
        journey: record.jornada,
        stage_category: record.estagio,
        status:
          notify_status === "ok" || email_status === "ok" ? "persisted_notified" : "persisted",
        notify_status,
        email_status,
        document_intent: record.document_intent,
        // Fail-closed contract: the visitor only ever learns the payment
        // correlation on this path, after the record is durably stored.
        ...(radarPublic || {}),
      }),
    ),
  };
};
