/**
 * First-party analytics collector — no PII.
 * Accepts batch of events from the site, stores aggregates/samples in Blobs when available.
 * Optional forward to Plausible events API when PLAUSIBLE_DOMAIN + PLAUSIBLE_API_URL set.
 */
const crypto = require("crypto");
const { corsHeaders, clientIp, safeLog, ALLOWED_ORIGINS } = require("./lib/lead-core.cjs");

const MAX_EVENTS = 25;
const MAX_BODY = 16 * 1024;

const FORBIDDEN_KEYS = new Set([
  "nome",
  "name",
  "email",
  "telefone",
  "phone",
  "tel",
  "whatsapp",
  "empresa",
  "company",
  "mensagem",
  "message",
  "edital",
  "documento",
  "document",
  "cpf",
  "cnpj",
  "search_query",
  "q",
  "query",
]);

const ALLOWED_EVENTS = new Set([
  "page_view",
  "session_start",
  "cta_view",
  "cta_click",
  "whatsapp_click",
  "email_click",
  "lead_form_start",
  "lead_form_step",
  "lead_form_error",
  "lead_form_submit",
  "lead_form_success",
  "lead_form_backend_error",
  "lead_persisted",
  "confirmation_view",
  "internal_search",
  "content_to_service",
  "pseo_to_service",
  "return_visit",
  "conversion",
  "critical_decision_cta_click",
  "scroll_depth",
  "outbound_click",
]);

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

function scrubProps(props) {
  if (!props || typeof props !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    const key = String(k).toLowerCase();
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (/email|phone|tel|nome|name|mensagem|message|whatsapp|cpf|document/i.test(key)) continue;
    if (typeof v === "string") {
      out[k] = v.slice(0, 120);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

// In-memory ring for cold-start diagnostics (not durable alone)
const recent = [];
function pushRecent(ev) {
  recent.push(ev);
  if (recent.length > 200) recent.shift();
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
  for (const ev of events) {
    const name = String(ev.event || ev.name || "").slice(0, 64);
    if (!name || (!ALLOWED_EVENTS.has(name) && !name.startsWith("custom_"))) continue;
    const safe = {
      event: name,
      props: scrubProps(ev.props || ev),
      path: String(ev.path || ev.props?.path || "").slice(0, 180),
      ts: new Date().toISOString(),
      ip_hash,
      sid: String(ev.sid || ev.session_id || "").slice(0, 32),
    };
    // Drop any accidental PII strings in path
    if (/@|whatsapp|telefone/i.test(safe.path)) safe.path = "/[redacted]";
    pushRecent({ event: safe.event, path: safe.path, ts: safe.ts });
    accepted.push(safe);

    // Optional Plausible forward (server-side, no cookies)
    const domain = process.env.PLAUSIBLE_DOMAIN;
    if (domain && process.env.PLAUSIBLE_FORWARD === "1") {
      try {
        await fetch(process.env.PLAUSIBLE_API_URL || "https://plausible.io/api/event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "confenge-collect/1.0",
          },
          body: JSON.stringify({
            name: safe.event,
            url: `https://${domain}${safe.path || "/"}`,
            domain,
            props: safe.props,
          }),
        });
      } catch {
        /* never break client */
      }
    }
  }

  // Best-effort durable sample store
  if (accepted.length && process.env.LEAD_STORE !== "memory") {
    try {
      const { getStore, connectLambda } = require("@netlify/blobs");
      if (event && event.blobs) connectLambda(event);
      const store = getStore({ name: "confenge-analytics" });
      const day = new Date().toISOString().slice(0, 10);
      const key = `events/${day}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      await store.setJSON(key, { events: accepted });
    } catch (err) {
      safeLog("warn", "analytics_store_skip", {
        reason: err && err.message ? String(err.message).slice(0, 80) : "skip",
      });
    }
  }

  safeLog("info", "analytics_batch", { count: accepted.length });

  return {
    statusCode: 202,
    headers,
    body: JSON.stringify({ ok: true, accepted: accepted.length }),
  };
};

// test helper
exports._recent = () => recent.slice();
exports._scrubProps = scrubProps;
