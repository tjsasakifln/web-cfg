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

// Allow tests to inject store
let _storeOverride = null;
function setStoreForTests(store) {
  _storeOverride = store;
}

/**
 * Wire Netlify Blobs credentials from the Lambda event (`event.blobs` + site headers).
 * Required on Netlify Functions before getStore() — see @netlify/blobs connectLambda.
 */
function bindBlobsContext(event) {
  try {
    // eslint-disable-next-line import/no-unresolved
    const { connectLambda } = require("@netlify/blobs");
    if (event && event.blobs) {
      connectLambda(event);
      return true;
    }
  } catch (err) {
    safeLog("warn", "blobs_connect_skip", {
      reason: err && err.message ? String(err.message).slice(0, 120) : "skip",
      has_blobs_field: Boolean(event && event.blobs),
    });
  }
  return false;
}

async function getStore(event) {
  if (_storeOverride) return _storeOverride;
  bindBlobsContext(event);
  return createStore();
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

  const turnstile = await verifyTurnstile(lead.turnstile_token, ip);
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
  record.retention = retentionPolicy();
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
      const existing = err.existing || (await store.get(lead_id).catch(() => null));
      if (existing && existing.lead_id) {
        safeLog("info", "lead_idempotent_hit", { lead_id: existing.lead_id, via: "only_if_new" });
        return idempotentOk(existing);
      }
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
  });

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
      }),
    ),
  };
};
