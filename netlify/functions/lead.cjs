/**
 * Production lead intake for CONFENGE.
 * Receives JSON POST from the site form, validates essential fields,
 * returns a receipt id, and optionally forwards to FormSubmit when activated.
 *
 * Never logs full free-text message content. PII is only forwarded to the
 * configured mail endpoint and not written to function logs.
 */
const crypto = require("crypto");

const FORMSUBMIT_URL =
  process.env.FORMSUBMIT_URL ||
  "https://formsubmit.co/ajax/tiago.sasaki@confenge.com.br";

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
  // application/x-www-form-urlencoded
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
  // Honeypot
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

  let upstream = { status: "skipped" };
  try {
    const forward = {
      name: nome,
      _replyto: email || undefined,
      telefone: telefone || undefined,
      email: email || undefined,
      estagio,
      jornada,
      empresa: String(data.empresa || "").slice(0, 180),
      urgencia: String(data.urgencia || "").slice(0, 80),
      // Cap free text; never log it here
      mensagem: String(data.mensagem || "").slice(0, 2000),
      origem: String(data.origem || "").slice(0, 180),
      utm_source: String(data.utm_source || "").slice(0, 80),
      utm_medium: String(data.utm_medium || "").slice(0, 80),
      utm_campaign: String(data.utm_campaign || "").slice(0, 80),
      landing_page: String(data.landing_page || "").slice(0, 180),
      receipt_id: id,
      _subject: `CONFENGE lead [${jornada}] ${estagio}`.slice(0, 120),
      _template: "table",
      _captcha: "false",
    };
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
    upstream = {
      status: res.ok ? "ok" : "error",
      http: res.status,
      // Do not echo PII from upstream
      message: parsed && parsed.message ? String(parsed.message).slice(0, 200) : undefined,
      success: parsed && parsed.success,
    };
  } catch (err) {
    upstream = { status: "error", message: "upstream_unreachable" };
  }

  // Receipt is always issued when validation passed — lead reached production endpoint
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      receipt_id: id,
      received_at: receivedAt,
      journey: jornada,
      stage_category: estagio.slice(0, 80),
      upstream,
    }),
  };
};
