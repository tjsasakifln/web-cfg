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
// Total wall-clock budget for one delivery channel (all retries included).
// The browser aborts the POST at 15 s (js/modules/form.js) and the Warmbly
// handoff already spends up to CONFENGE_INBOUND_TIMEOUT_MS (8 s) before the
// notifications run, so a provider that hangs must never consume the rest of
// that window. A channel that runs out of budget reports status "error"; the
// record is already durable and the visitor still receives the 201.
const DEFAULT_DELIVERY_TIMEOUT_MS = 5000;

function deliveryTimeoutMs(env = process.env) {
  const raw = Number(env.LEAD_DELIVERY_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DELIVERY_TIMEOUT_MS;
  return Math.min(30000, Math.max(100, Math.floor(raw)));
}

function isAbortError(err) {
  return Boolean(err && (err.name === "AbortError" || err.code === "delivery_timeout"));
}

/**
 * fetch bound to a deadline shared by every attempt of one channel. `deadline`
 * is an absolute epoch-ms value; when it has already passed the call fails
 * immediately with a delivery_timeout error instead of opening a connection.
 *
 * The deadline covers the BODY as well as the headers: with `parse: "json"`
 * the body is consumed here, while the AbortController is still armed, and the
 * result carries `data` (parsed JSON or `{}`). A provider that answers 200 and
 * then stalls the body (half-open connection, slow trailer) would otherwise
 * hang the POST for as long as the socket lived — the browser side already
 * obeys this rule (tests/intake/test_mv03_adaptive_intake.mjs: the timer is
 * stood down only after `response.text()` resolved). The read is raced
 * against the same deadline so the bound holds even for a fetch whose body
 * stream ignores the signal.
 */
async function fetchWithDeadline(url, init, deadline, { parse = null } = {}) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    const err = new Error("delivery_timeout");
    err.code = "delivery_timeout";
    throw err;
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let expire = null;
  const expired = new Promise((_resolve, reject) => {
    expire = () => {
      if (controller) controller.abort();
      const err = new Error("delivery_timeout");
      err.code = "delivery_timeout";
      reject(err);
    };
  });
  expired.catch(() => {});
  const timer = setTimeout(expire, remaining);
  try {
    const res = await Promise.race([
      fetch(url, { ...init, signal: controller ? controller.signal : undefined }),
      expired,
    ]);
    if (parse === "json") {
      const data = await Promise.race([res.json().catch(() => ({})), expired]);
      return { ok: res.ok, status: res.status, data };
    }
    return res;
  } catch (err) {
    if (isAbortError(err)) {
      const timeout = new Error("delivery_timeout");
      timeout.code = "delivery_timeout";
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isProductionProfile(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "").toLowerCase();
  const context = String(env.CONTEXT || env.NETLIFY_CONTEXT || "").toLowerCase();
  return nodeEnv === "production" || context === "production";
}

function hasExplicitPort(rawUrl) {
  const authority = String(rawUrl || "").match(/^https:\/\/([^/?#]*)/i)?.[1] || "";
  const hostPort = authority.split("@").pop() || "";
  if (hostPort.startsWith("[")) return /^\[[^\]]+\]:\d+$/.test(hostPort);
  return /:\d+$/.test(hostPort);
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
  if (parsed.port || hasExplicitPort(raw)) return { ok: false, reason: "port_not_allowed" };
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
  let lastHttp;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      // A timed-out request may already have been accepted by the provider
      // (an e-mail can be sent even when the response never arrives), so a
      // retry would risk a duplicate and would also exceed the channel budget.
      if (isAbortError(err)) {
        // The deadline expired after a real HTTP answer (e.g. 500 at 4.9 s,
        // then no time left for attempt 2): keep that status for the operator
        // instead of reporting a bare timeout.
        if (Number.isFinite(lastHttp) && !Number.isFinite(err.status)) err.last_http = lastHttp;
        break;
      }
      if (Number.isFinite(err && err.status)) lastHttp = err.status;
      if (i < attempts - 1) await sleep(100 * 2 ** i);
    }
  }
  throw lastErr;
}

function failureReason(err) {
  if (!isAbortError(err)) return "upstream_error";
  return Number.isFinite(err && err.last_http) ? "timeout_after_http" : "timeout";
}

function failureHttp(err) {
  if (Number.isFinite(err && err.status)) return err.status;
  if (Number.isFinite(err && err.last_http)) return err.last_http;
  return undefined;
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

  // Bounded like every other external call of the POST: a hanging siteverify
  // used to hold the request open until the browser's 15 s abort, before any
  // record existed. On timeout the answer is 403 anti_abuse; the front resets
  // the widget and the visitor retries with a fresh token (nothing was
  // written, so there is nothing to replay).
  let res;
  try {
    res = await fetchWithDeadline(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
      Date.now() + deliveryTimeoutMs(),
      { parse: "json" },
    );
  } catch (err) {
    safeLog("warn", "turnstile_siteverify_failed", {
      code: err && err.message ? String(err.message).slice(0, 80) : "error",
    });
    return { ok: false, error: isAbortError(err) ? "turnstile_timeout" : "turnstile_unreachable" };
  }
  if (res.data && res.data.success) return { ok: true };
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

  const deadline = Date.now() + deliveryTimeoutMs();
  return withBackoff(async () => {
    const res = await fetchWithDeadline(destination.url, { method: "POST", headers, body }, deadline);
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
      reason: failureReason(err),
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

  const deadline = Date.now() + deliveryTimeoutMs();
  return withBackoff(async () => {
    const res = await fetchWithDeadline(destination.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Title: `CONFENGE lead · ${record.jornada}`.slice(0, 120),
        Priority: record.jornada === "contrato" ? "high" : "default",
        Tags: "briefcase",
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: message,
    }, deadline);
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
    return { channel: "ntfy", status: "error", reason: failureReason(err) };
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
    record.faixa_contrato ? `Faixa de contrato: ${record.faixa_contrato}` : null,
    record.risco_em_jogo ? `Risco em jogo: ${record.risco_em_jogo}` : null,
    record.frequencia ? `Frequência: ${record.frequencia}` : null,
    record.maturidade_documental ? `Documentos: ${record.maturidade_documental}` : null,
    record.capacidade_interna ? `Capacidade: ${record.capacidade_interna}` : null,
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

  const deadline = Date.now() + deliveryTimeoutMs();
  return withBackoff(async () => {
    // Headers AND body inside the channel deadline (parse: "json"): a Resend
    // that answers 200 and stalls the body must not outlive the budget.
    const res = await fetchWithDeadline("https://api.resend.com/emails", {
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
    }, deadline, { parse: "json" });
    if (!res.ok) {
      const err = new Error(`resend_http_${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data = res.data || {};
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
    return {
      channel: "email",
      status: "error",
      reason: failureReason(err),
      http: failureHttp(err),
    };
  });
}

/**
 * Run all delivery channels. Persist-before-call is caller's responsibility.
 * Failures do not throw — return status map for audit.
 *
 * The channels are independent, so they run concurrently: the worst case for
 * the whole step is one channel budget (LEAD_DELIVERY_TIMEOUT_MS), not the sum.
 *
 * The returned map is for the durable store only. `email.provider_id` and
 * `email.http` are the provider's message id and HTTP status — not PII — and
 * exist so an operator can correlate a lead_id with Resend GET /emails/{id}
 * from the host. The public 201/200 body is built by publicSuccessBody, a
 * positive whitelist that only carries the status strings; nothing here may be
 * spread into that body.
 */
async function deliverAll(record) {
  const [opsResult, ntfyResult, emailResult] = await Promise.all([
    deliverOpsWebhook(record),
    deliverNtfyAuth(record),
    deliverResendEmail(record),
  ]);
  const notifyResults = [opsResult, ntfyResult];
  const notifyOk = notifyResults.some((r) => r.status === "ok");
  const notifySkipped = notifyResults.every((r) => r.status === "skipped");
  const email = { status: emailResult.status };
  if (emailResult.reason) email.reason = String(emailResult.reason).slice(0, 40);
  if (Number.isFinite(emailResult.http)) email.http = emailResult.http;
  if (emailResult.provider_id) email.provider_id = String(emailResult.provider_id).slice(0, 64);
  return {
    notify: {
      status: notifyOk ? "ok" : notifySkipped ? "skipped" : "error",
      channels: notifyResults.map((r) => ({
        channel: r.channel,
        status: r.status,
        reason: r.reason || undefined,
        // never return URL/topic/token
      })),
    },
    email,
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
  deliveryTimeoutMs,
  fetchWithDeadline,
};
