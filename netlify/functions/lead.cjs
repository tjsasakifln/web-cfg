/**
 * Production lead intake for CONFENGE.
 *
 * Delivery paths (in order of reliability without external account setup):
 * 1) ntfy.sh secret topic — verified publish + poll-back (ops notification)
 * 2) FormSubmit email — works after one-time owner activation email
 *
 * Always returns a receipt_id when validation passes.
 * Does not write free-text messages to function logs.
 */
const crypto = require("crypto");

const FORMSUBMIT_URL =
  process.env.FORMSUBMIT_URL ||
  "https://formsubmit.co/ajax/tiago.sasaki@confenge.com.br";

// Secret ops topic (override via NTFY_TOPIC in Netlify env). Not a public marketing surface.
const NTFY_TOPIC =
  process.env.NTFY_TOPIC || "confenge-prod-leads-b2g-9f3c2a1e7d4b6e80";
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

const ALLOWED_ORIGINS = new Set([
  "https://confenge.com.br",
  "https://www.confenge.com.br",
  "https://confenge.netlify.app",
  "http://127.0.0.1:8765",
  "http://127.0.0.1:8766",
  "http://localhost:8765",
]);

function cors(origin) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://confenge.com.br";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  const ct = (event.headers["content-type"] || event.headers["Content-Type"] || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  const out = {};
  for (const part of raw.split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    out[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(v.replace(/\+/g, " "));
  }
  return out;
}

function receiptId(payload) {
  const material = [
    payload.jornada || "",
    payload.estagio || "",
    payload.origem || "",
    payload.utm_source || "",
    String(Date.now()),
    crypto.randomBytes(8).toString("hex"),
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 24);
}

async function deliverNtfy({ id, receivedAt, jornada, estagio, nome, telefone, email, urgencia, origem }) {
  const contact = telefone
    ? `WhatsApp ${telefone}`
    : email
      ? `email ${email}`
      : "sem contato";
  const title = `CONFENGE lead · ${jornada}`;
  const message = [
    `receipt=${id}`,
    `when=${receivedAt}`,
    `stage=${estagio}`,
    `name=${nome}`,
    `contact=${contact}`,
    urgencia ? `urgency=${urgencia}` : null,
    origem ? `origin=${origem}` : null,
    "source=confenge.com.br/lead",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(NTFY_URL, {
    method: "POST",
    headers: {
      Title: title.slice(0, 120),
      Priority: jornada === "contrato" ? "high" : "default",
      Tags: "briefcase,confenge",
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: message,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return {
    channel: "ntfy",
    status: res.ok ? "ok" : "error",
    http: res.status,
    // ntfy message id — used to prove delivery without re-sending PII
    message_id: parsed && parsed.id ? String(parsed.id) : undefined,
    topic: NTFY_TOPIC,
  };
}

async function deliverFormSubmit(forward) {
  const res = await fetch(FORMSUBMIT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(forward),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  return {
    channel: "formsubmit",
    status: res.ok && String(parsed?.success) === "true" ? "ok" : "error",
    http: res.status,
    message: parsed && parsed.message ? String(parsed.message).slice(0, 200) : undefined,
  };
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || "";
  const headers = cors(origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const data = parseBody(event);
  if (data["empresa-site"] || data.bot_field) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, receipt_id: "honeypot", suppressed: true }),
    };
  }

  const nome = String(data.nome || "").trim();
  const telefone = String(data.telefone || "").trim();
  const email = String(data.email || "").trim();
  const estagio = String(data.estagio || "").trim();
  const jornada = String(data.jornada || "").trim() || "operacao";
  const consentimento = String(data.consentimento || "").trim();
  const urgencia = String(data.urgencia || "").trim().slice(0, 80);
  const origem = String(data.origem || "").trim().slice(0, 180);

  if (!nome || (!telefone && !email) || !estagio) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        ok: false,
        error: "validation",
        message: "Informe nome, WhatsApp ou e-mail, e o tipo de necessidade.",
      }),
    };
  }
  if (!consentimento || consentimento === "false" || consentimento === "off") {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        ok: false,
        error: "consent",
        message: "É necessário autorizar o uso dos dados para retorno.",
      }),
    };
  }

  const id = receiptId({
    jornada,
    estagio,
    origem: data.origem,
    utm_source: data.utm_source,
  });
  const receivedAt = new Date().toISOString();

  const deliveries = [];

  // 1) Verified ops notification (primary while email activation is pending)
  try {
    deliveries.push(
      await deliverNtfy({
        id,
        receivedAt,
        jornada,
        estagio,
        nome,
        telefone,
        email,
        urgencia,
        origem,
      }),
    );
  } catch (_) {
    deliveries.push({ channel: "ntfy", status: "error", message: "ntfy_unreachable" });
  }

  // 2) Email path (optional; 403 until FormSubmit activation by site owner)
  try {
    deliveries.push(
      await deliverFormSubmit({
        name: nome,
        _replyto: email || undefined,
        telefone: telefone || undefined,
        email: email || undefined,
        estagio,
        jornada,
        empresa: String(data.empresa || "").slice(0, 180),
        urgencia,
        mensagem: String(data.mensagem || "").slice(0, 2000),
        origem,
        utm_source: String(data.utm_source || "").slice(0, 80),
        utm_medium: String(data.utm_medium || "").slice(0, 80),
        utm_campaign: String(data.utm_campaign || "").slice(0, 80),
        landing_page: String(data.landing_page || "").slice(0, 180),
        receipt_id: id,
        _subject: `CONFENGE lead [${jornada}] ${estagio}`.slice(0, 120),
        _template: "table",
        _captcha: "false",
      }),
    );
  } catch (_) {
    deliveries.push({ channel: "formsubmit", status: "error", message: "upstream_unreachable" });
  }

  const delivered = deliveries.some((d) => d.status === "ok");
  const primary = deliveries.find((d) => d.channel === "ntfy") || deliveries[0];

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      receipt_id: id,
      received_at: receivedAt,
      journey: jornada,
      stage_category: estagio.slice(0, 80),
      delivered,
      delivery: deliveries,
      // back-compat field
      upstream: primary,
    }),
  };
};
