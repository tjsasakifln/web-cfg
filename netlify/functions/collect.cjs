/**
 * First-party analytics collector — no PII.
 * Accepts batch of events from the site and stores aggregates/samples in Blobs when available.
 * Third-party export is deliberately absent; see the versioned #247 decision.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { corsHeaders, clientIp, safeLog, ALLOWED_ORIGINS } = require("./lib/lead-core.cjs");
const { admitEvent, admitBatch, scrubProps } = require("./lib/event-contract.cjs");

const seenEventIds = new Set();
const MAX_SEEN_EVENT_IDS = 4000;

const MAX_EVENTS = 25;
const MAX_BODY = 16 * 1024;

function originOk(event) {
  const h = event.headers || {};
  const origin = String(h.origin || h.Origin || "").trim();
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  const referer = String(h.referer || h.Referer || "").trim();
  if (referer) {
    try {
      const u = new URL(referer);
      const base = `${u.protocol}//${u.host}`;
      if (ALLOWED_ORIGINS.has(base)) return base;
    } catch {
      /* ignore */
    }
  }
  return "https://confenge.com.br";
}

function scrubPropsCompat(props) {
  return scrubProps(props);
}

// In-memory ring for cold-start diagnostics (not durable alone)
const recent = [];
function pushRecent(ev) {
  recent.push(ev);
  if (recent.length > 200) recent.shift();
}

/** Local/dev durable sample when LEAD_STORE_DIR is set (same dir as FileStore). */
function persistAnalyticsLocal(accepted) {
  const dir = process.env.LEAD_STORE_DIR;
  if (!dir || !accepted.length) return { handled: false, accepted, duplicates: [] };
  const day = new Date().toISOString().slice(0, 10);
  const dest = path.join(dir, "analytics", "events", day);
  const persisted = [];
  const duplicates = [];
  try {
    fs.mkdirSync(dest, { recursive: true });
  } catch {
    safeLog("warn", "analytics_local_store_skip", { reason: "mkdir_failed" });
    return { handled: false, accepted, duplicates: [] };
  }
  for (const event of accepted) {
    const eventId = String(event.props?.event_id || "").slice(0, 80);
    const key = eventId
      ? `id-${crypto.createHash("sha256").update(eventId).digest("hex")}.json`
      : `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.json`;
    try {
      fs.writeFileSync(
        path.join(dest, key),
        JSON.stringify({ events: [event] }),
        { encoding: "utf8", flag: eventId ? "wx" : "w" },
      );
      persisted.push(event);
    } catch (err) {
      if (eventId && err?.code === "EEXIST") {
        duplicates.push(event);
      } else {
        safeLog("warn", "analytics_local_store_skip", { reason: "write_failed" });
        persisted.push(event);
      }
    }
  }
  return { handled: true, accepted: persisted, duplicates };
}

async function persistAnalyticsBlobs(accepted, event) {
  if (!accepted.length || process.env.LEAD_STORE === "memory") {
    return { handled: false, accepted, duplicates: [] };
  }
  let store;
  try {
    const { getStore, connectLambda } = require("@netlify/blobs");
    if (event && event.blobs) connectLambda(event);
    store = getStore({ name: "confenge-analytics" });
  } catch {
    safeLog("warn", "analytics_store_skip", { reason: "store_unavailable" });
    return { handled: false, accepted, duplicates: [] };
  }
  const day = new Date().toISOString().slice(0, 10);
  const persisted = [];
  const duplicates = [];
  for (const analyticsEvent of accepted) {
    const eventId = String(analyticsEvent.props?.event_id || "").slice(0, 80);
    const key = eventId
      ? `events/${day}/id-${crypto.createHash("sha256").update(eventId).digest("hex")}`
      : `events/${day}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    try {
      if (eventId) {
        const result = await store.set(key, JSON.stringify({ events: [analyticsEvent] }), {
          onlyIfNew: true,
          contentType: "application/json",
        });
        if (result?.modified === false) {
          duplicates.push(analyticsEvent);
          continue;
        }
      } else {
        await store.setJSON(key, { events: [analyticsEvent] });
      }
      persisted.push(analyticsEvent);
    } catch (err) {
      if (eventId && /precondition|412|if-none-match/i.test(String(err?.message || err))) {
        duplicates.push(analyticsEvent);
      } else {
        safeLog("warn", "analytics_store_skip", { reason: "write_failed" });
        persisted.push(analyticsEvent);
      }
    }
  }
  return { handled: true, accepted: persisted, duplicates };
}

exports.handler = async (event) => {
  const origin = originOk(event);
  const headers = {
    ...corsHeaders(origin),
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod === "GET") {
    // Health + minimal ops count (no event payloads)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        collector: "confenge-first-party",
        recent_buffer: recent.length,
        ts: new Date().toISOString(),
      }),
    };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  let raw = event.body || "";
  if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY) {
    return {
      statusCode: 413,
      headers,
      body: JSON.stringify({ ok: false, error: "payload_too_large" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: "invalid_json" }),
    };
  }

  const events = Array.isArray(payload.events)
    ? payload.events
    : payload.event
      ? [payload]
      : [];
  if (!events.length || events.length > MAX_EVENTS) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: "invalid_events" }),
    };
  }

  const ip = clientIp(event);
  const ip_hash = crypto
    .createHash("sha256")
    .update(ip + (process.env.IP_HASH_SALT || "confenge"))
    .digest("hex")
    .slice(0, 12);

  const accepted = [];
  const rejected = [];
  const batch = admitBatch(events, seenEventIds);
  if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
    const extra = seenEventIds.size - MAX_SEEN_EVENT_IDS;
    let dropped = 0;
    for (const id of seenEventIds) {
      if (dropped >= extra) break;
      seenEventIds.delete(id);
      dropped += 1;
    }
  }
  for (const row of batch.rejected) {
    rejected.push({
      event: String((row && row.event) || "").slice(0, 64),
      reason: row.reason || "rejected",
    });
  }
  for (const admitted of batch.admitted) {
    const safe = {
      event: admitted.event.event,
      schema_version: admitted.event.schema_version,
      source: admitted.event.source,
      layer: admitted.event.layer,
      owner: admitted.event.owner,
      alias_from: admitted.event.alias_from,
      props: admitted.event.props,
      path: admitted.event.path,
      ts: new Date().toISOString(),
      ip_hash,
      sid: admitted.event.sid,
    };
    accepted.push(safe);

  }

  let durable = persistAnalyticsLocal(accepted);
  if (!durable.handled) durable = await persistAnalyticsBlobs(accepted, event);
  const finalAccepted = durable.accepted;
  for (const duplicate of durable.duplicates) {
    rejected.push({
      event: duplicate.event,
      reason: "duplicate_event_id",
    });
  }
  for (const safe of finalAccepted) {
    pushRecent({
      event: safe.event,
      path: safe.path,
      ts: safe.ts,
      layer: safe.layer,
      alias_from: safe.alias_from,
      correlation_id: safe.props && safe.props.correlation_id,
      idempotency_key: safe.props && safe.props.idempotency_key,
      event_id: safe.props && safe.props.event_id,
      offer_id: safe.props && safe.props.offer_id,
      next_action_id: safe.props && safe.props.next_action_id,
    });
  }

  safeLog("info", "analytics_batch", { count: finalAccepted.length, rejected: rejected.length });

  return {
    statusCode: 202,
    headers,
    body: JSON.stringify({
      ok: true,
      accepted: finalAccepted.length,
      rejected: rejected.length,
      rejected_events: rejected,
    }),
  };
};

// test helper
exports._recent = () => recent.slice();
exports._scrubProps = scrubPropsCompat;
exports._admitEvent = admitEvent;
