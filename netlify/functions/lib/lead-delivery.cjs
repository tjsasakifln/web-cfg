/**
 * Authenticated ops notification + transactional email.
 * Never uses public unauthenticated ntfy topics or FormSubmit as primary.
 * All credentials from environment only.
 */
const crypto = require("crypto");
const { safeLog } = require("./lead-core.cjs");
const { isCommercialReal, effectiveRecordKind } = require("./record-kind.cjs");

function skipNonReal(record, channel) {
  if (isCommercialReal(record)) return null;
  return {
    channel,
    status: "skipped",
    reason: "non_real",
    kind: effectiveRecordKind(record),
  };
}

const MAX_ATTEMPTS = 3;

function isProductionProfile(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "").toLowerCase();
  const context = String(env.CONTEXT || env.NETLIFY_CONTEXT || "").toLowerCase();
  return nodeEnv === "production" || context === "production";
}

function validatePiiDestination(rawUrl, allowedHostsRaw, env = process.env) {
  const raw = String(rawUrl || "").trim();
  if (!raw || raw.length > 2048) return { ok: false, reason: "invalid_url" };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "https_required" };
  if (parsed.username || parsed.password) return { ok: false, reason: "embedded_credentials" };
  if (parsed.port) return { ok: false, reason: "port_not_allowed" };
  if (parsed.search || parsed.hash) return { ok: false, reason: "query_or_fragment_not_allowed" };
  const allowedHosts = String(allowedHostsRaw || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (isProductionProfile(env) && !allowedHosts.length) {
    return { ok: false, reason: "host_allowlist_required" };
  }
  if (allowedHosts.length && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    return { ok: false, reason: "host_not_allowed" };
  }
  return { ok: true, url: parsed.toString() };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withBackoff(fn, attempts = MAX_ATTEMPTS) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(100 * 2 ** i);
    }
  }
  throw lastErr;
}

/**
 * Verify Cloudflare Turnstile token when secret configured.
 * If secret not set: skip (dev) unless LEAD_REQUIRE_TURNSTILE=1.
 */
async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.LEAD_REQUIRE_TURNSTILE === "1") {
      return { ok: false, error: "turnstile_not_configured" };
    }
    return { ok: true, skipped: true };
  }
  if (!token) {
    return { ok: false, error: "turnstile_missing" };
  }
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (data.success) return { ok: true };
  return { ok: false, error: "turnstile_failed" };
}

/**
 * Authenticated webhook (Slack/Discord/custom). HMAC optional.
 * Body contains operational fields including contact for ops — over TLS to private endpoint.
 * Never log the body.
 */
async function deliverOpsWebhook(record) {
  const skip = skipNonReal(record, "ops_webhook");
  if (skip) return skip;
  const url = process.env.OPS_WEBHOOK_URL;
  if (!url) {
    return { channel: "ops_webhook", status: "skipped", reason: "not_configured" };
  }
  const destination = validatePiiDestination(
    url,
    process.env.OPS_WEBHOOK_ALLOWED_HOSTS,
  );
  if (!destination.ok) {
    safeLog("error", "ops_webhook_misconfigured", { reason: destination.reason });
    return { channel: "ops_webhook", status: "error", reason: "misconfigured" };
  }
  const payload = {
    type: "confenge.lead",
    lead_id: record.lead_id,
    received_at: record.received_at,
    journey: record.jornada,
    stage: record.estagio,
    urgency: record.urgencia,
    name: record.nome,
    phone: record.telefone,
    email: record.email,
    company: record.empresa,
    origin: record.origem,
    landing_page: record.landing_page,
    utm_source: record.utm_source,
    utm_medium: record.utm_medium,
    utm_campaign: record.utm_campaign,
    content_cluster: record.content_cluster,
    whatsapp_deeplink: record.telefone
      ? `https://wa.me/${record.telefone.startsWith("55") ? record.telefone : `55${record.telefone}`}?text=${encodeURIComponent(`Olá, ref. protocolo ${record.lead_id}`)}`
      : null,
  };
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "confenge-lead/1.0",
    "X-Confenge-Lead-Id": record.lead_id,
  };
  const secret = process.env.OPS_WEBHOOK_SECRET;
  if (secret) {
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    headers["X-Confenge-Signature"] = `sha256=${sig}`;
  }
  // Optional Authorization bearer
  if (process.env.OPS_WEBHOOK_BEARER) {
    headers.Authorization = `Bearer ${process.env.OPS_WEBHOOK_BEARER}`;
  }

  return withBackoff(async () => {
    const res = await fetch(destination.url, { method: "POST", headers, body });
    if (!res.ok) {
      const err = new Error(`webhook_http_${res.status}`);
      err.status = res.status;
      throw err;
    }
    return { channel: "ops_webhook", status: "ok", http: res.status };
  }).catch((err) => {
    safeLog("error", "ops_webhook_failed", {
      lead_id: record.lead_id,
      code: err && err.message ? String(err.message).slice(0, 80) : "error",
    });
    return {
      channel: "ops_webhook",
      status: "error",
      reason: "upstream_error",
    };
  });
}

/**
 * Authenticated ntfy (optional): only when NTFY_URL is full URL with access token header.
 * No default public topic. NTFY_TOKEN required if NTFY_URL set.
 */
async function deliverNtfyAuth(record) {
  const skip = skipNonReal(record, "ntfy");
  if (skip) return skip;
  const url = process.env.NTFY_URL; // full URL e.g. https://ntfy.sh/private-topic — must be env, never hardcoded
  const token = process.env.NTFY_TOKEN;
  if (!url) return { channel: "ntfy", status: "skipped", reason: "not_configured" };
  if (!token) {
    safeLog("error", "ntfy_misconfigured", { reason: "token_missing" });
    return { channel: "ntfy", status: "error", reason: "misconfigured" };
  }
  const destination = validatePiiDestination(url, process.env.NTFY_ALLOWED_HOSTS);
  if (!destination.ok) {
    safeLog("error", "ntfy_misconfigured", { reason: destination.reason });
    return { channel: "ntfy", status: "error", reason: "misconfigured" };
  }
  // Never put full PII in title; body for private authenticated topic only
  const message = [
    `lead_id=${record.lead_id}`,
    `when=${record.received_at}`,
    `journey=${record.jornada}`,
    `stage=${record.estagio}`,
    `name=${record.nome}`,
    record.telefone ? `phone=${record.telefone}` : null,
    record.email ? `email=${record.email}` : null,
    record.origem ? `origin=${record.origem}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return withBackoff(async () => {
    const res = await fetch(destination.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Title: `CONFENGE lead · ${record.jornada}`.slice(0, 120),
        Priority: record.jornada === "contrato" ? "high" : "default",
        Tags: "briefcase",
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: message,
    });
    if (!res.ok) {
      const err = new Error(`ntfy_http_${res.status}`);
      throw err;
    }
    return { channel: "ntfy", status: "ok", http: res.status };
  }).catch((err) => {
    safeLog("error", "ntfy_failed", {
      lead_id: record.lead_id,
      code: err && err.message ? String(err.message).slice(0, 80) : "error",
    });
    return { channel: "ntfy", status: "error", reason: "upstream_error" };
  });
}

/**
 * Resend transactional email (CONFENGE domain).
 */
async function deliverResendEmail(record) {
  const skip = skipNonReal(record, "email");
  if (skip) return skip;
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_NOTIFY_EMAIL || process.env.OPS_EMAIL || "tiago.sasaki@confenge.com.br";
  const from =
    process.env.LEAD_FROM_EMAIL || "CONFENGE Leads <leads@confenge.com.br>";
  if (!apiKey) {
    return { channel: "email", status: "skipped", reason: "not_configured" };
  }

  const subject = `Lead CONFENGE [${record.jornada}] ${record.estagio} · ${record.lead_id}`.slice(0, 120);
  const text = [
    `Protocolo: ${record.lead_id}`,
    `Recebido: ${record.received_at}`,
    `Jornada: ${record.jornada}`,
    `Estágio: ${record.estagio}`,
    `Nome: ${record.nome}`,
    record.telefone ? `WhatsApp: ${record.telefone}` : null,
    record.email ? `E-mail: ${record.email}` : null,
    record.empresa ? `Empresa: ${record.empresa}` : null,
    record.urgencia ? `Urgência: ${record.urgencia}` : null,
    record.landing_page ? `Landing: ${record.landing_page}` : null,
    record.utm_source ? `utm_source: ${record.utm_source}` : null,
    record.utm_medium ? `utm_medium: ${record.utm_medium}` : null,
    record.utm_campaign ? `utm_campaign: ${record.utm_campaign}` : null,
    record.mensagem ? `Mensagem: ${record.mensagem}` : null,
    "",
    "— Enviado pelo pipeline de leads confenge.com.br (Resend).",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return withBackoff(async () => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: record.email || undefined,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const err = new Error(`resend_http_${res.status}`);
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    return {
      channel: "email",
      status: "ok",
      http: res.status,
      provider_id: data.id ? String(data.id).slice(0, 64) : undefined,
    };
  }).catch((err) => {
    safeLog("error", "email_failed", {
      lead_id: record.lead_id,
      code: err && err.message ? String(err.message).slice(0, 80) : "error",
    });
    return { channel: "email", status: "error", reason: "upstream_error" };
  });
}

/**
 * Run all delivery channels. Persist-before-call is caller's responsibility.
 * Failures do not throw — return status map for audit.
 */
async function deliverAll(record) {
  const notifyResults = await Promise.all([deliverOpsWebhook(record), deliverNtfyAuth(record)]);
  const emailResult = await deliverResendEmail(record);
  const notifyOk = notifyResults.some((r) => r.status === "ok");
  const notifySkipped = notifyResults.every((r) => r.status === "skipped");
  return {
    notify: {
      status: notifyOk ? "ok" : notifySkipped ? "skipped" : "error",
      channels: notifyResults.map((r) => ({
        channel: r.channel,
        status: r.status,
        // never return URL/topic/token
      })),
    },
    email: {
      status: emailResult.status,
      // never echo provider payload
    },
  };
}

module.exports = {
  verifyTurnstile,
  deliverOpsWebhook,
  deliverNtfyAuth,
  deliverResendEmail,
  deliverAll,
  withBackoff,
  validatePiiDestination,
};
