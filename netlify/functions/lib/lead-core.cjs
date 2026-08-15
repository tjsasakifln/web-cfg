/**
 * Pure lead validation, sanitization, idempotency, and response DTO helpers.
 * No I/O — unit-testable without mocks of the unit under test.
 */
const crypto = require("crypto");

const MAX_BODY_BYTES = 24 * 1024;
const MAX_FIELD = {
  nome: 120,
  telefone: 40,
  email: 180,
  empresa: 180,
  estagio: 120,
  jornada: 40,
  urgencia: 80,
  mensagem: 2000,
  origem: 180,
  landing_page: 240,
  referrer: 240,
  utm_source: 80,
  utm_medium: 80,
  utm_campaign: 80,
  utm_content: 80,
  utm_term: 80,
  content_cluster: 80,
  idempotency_key: 80,
  turnstile_token: 2048,
  asset_id: 80,
  route_family: 80,
  public_contract_id: 80,
  public_entity_id: 80,
  public_id_slug: 80,
  cta_id: 80,
  correlation_id: 80,
  cnpj: 20,
};

const ALLOWED_JOURNEYS = new Set(["contrato", "edital", "operacao", "conteudo", "pseo", "outro"]);
const ALLOWED_ORIGINS = new Set([
  "https://confenge.com.br",
  "https://www.confenge.com.br",
  "https://confenge.netlify.app",
  "http://127.0.0.1:8765",
  "http://127.0.0.1:8766",
  "http://localhost:8765",
  "http://localhost:8766",
]);

function stripControl(s) {
  return String(s || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(s, n) {
  const t = stripControl(s);
  return t.length > n ? t.slice(0, n) : t;
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "";
  return digits;
}

function normalizeEmail(raw) {
  const e = clamp(raw, MAX_FIELD.email).toLowerCase();
  if (!e) return "";
  // Practical RFC-ish check — server-side only
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "";
  if (e.length > 180) return "";
  return e;
}

function normalizeJourney(raw, estagio) {
  const j = clamp(raw, MAX_FIELD.jornada).toLowerCase();
  if (ALLOWED_JOURNEYS.has(j)) return j;
  const e = clamp(estagio, MAX_FIELD.estagio).toLowerCase();
  if (/edital|proposta|licita/.test(e)) return "edital";
  if (/contrato|glosa|medi[cç][aã]o|aditivo|reequil|atraso|san[cç]/.test(e)) return "contrato";
  if (/diagn[oó]stico|opera[cç][aã]o|diretoria|b2g/.test(e)) return "operacao";
  return "operacao";
}

function parseBody(event) {
  if (!event || event.body == null) return { ok: true, data: {} };
  let raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : String(event.body);
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return { ok: false, error: "payload_too_large", status: 413 };
  }
  const headers = event.headers || {};
  const ct = String(headers["content-type"] || headers["Content-Type"] || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const data = JSON.parse(raw || "{}");
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return { ok: true, data };
      }
      return { ok: false, error: "invalid_json", status: 400 };
    } catch {
      return { ok: false, error: "invalid_json", status: 400 };
    }
  }
  const out = {};
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? "" : part.slice(eq + 1);
    try {
      out[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(v.replace(/\+/g, " "));
    } catch {
      /* skip bad pair */
    }
  }
  return { ok: true, data: out };
}

function isHoneypot(data) {
  const hp = data["empresa-site"] || data.bot_field || data.website || data.fax;
  return Boolean(hp && String(hp).trim());
}

/**
 * Validate and normalize inbound lead payload.
 * @returns {{ ok: true, lead: object } | { ok: false, status: number, error: string, message: string }}
 */
function validateAndNormalize(data) {
  if (isHoneypot(data)) {
    return { ok: true, honeypot: true };
  }

  const nome = clamp(data.nome || data.name, MAX_FIELD.nome);
  const telefone = normalizePhone(data.telefone || data.whatsapp || data.phone || data.tel);
  const email = normalizeEmail(data.email);
  const estagio = clamp(data.estagio || data.tipo_demanda || data.demand_type, MAX_FIELD.estagio);
  const jornada = normalizeJourney(data.jornada || data.journey, estagio);
  const consentRaw = data.consentimento ?? data.consent ?? data.lgpd;
  const consentimento =
    consentRaw === true ||
    consentRaw === "true" ||
    consentRaw === "on" ||
    consentRaw === "1" ||
    consentRaw === "yes" ||
    consentRaw === "sim";

  if (!nome || nome.length < 2) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      message: "Informe seu nome.",
    };
  }
  if (!telefone && !email) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      message: "Informe WhatsApp ou e-mail para retorno.",
    };
  }
  if (!estagio) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      message: "Informe o tipo de necessidade.",
    };
  }
  if (!consentimento) {
    return {
      ok: false,
      status: 400,
      error: "consent",
      message: "É necessário autorizar o uso dos dados para retorno.",
    };
  }

  const lead = {
    nome,
    telefone: telefone || null,
    email: email || null,
    empresa: clamp(data.empresa, MAX_FIELD.empresa) || null,
    estagio,
    jornada,
    urgencia: clamp(data.urgencia, MAX_FIELD.urgencia) || null,
    mensagem: clamp(data.mensagem || data.message, MAX_FIELD.mensagem) || null,
    consentimento: true,
    origem: clamp(data.origem, MAX_FIELD.origem) || null,
    landing_page: clamp(data.landing_page || data.landing, MAX_FIELD.landing_page) || null,
    referrer: clamp(data.referrer || data.ref, MAX_FIELD.referrer) || null,
    utm_source: clamp(data.utm_source, MAX_FIELD.utm_source) || null,
    utm_medium: clamp(data.utm_medium, MAX_FIELD.utm_medium) || null,
    utm_campaign: clamp(data.utm_campaign, MAX_FIELD.utm_campaign) || null,
    utm_content: clamp(data.utm_content, MAX_FIELD.utm_content) || null,
    utm_term: clamp(data.utm_term, MAX_FIELD.utm_term) || null,
    content_cluster: clamp(data.content_cluster, MAX_FIELD.content_cluster) || null,
    turnstile_token: clamp(data["cf-turnstile-response"] || data.turnstile_token, MAX_FIELD.turnstile_token) || null,
    idempotency_key: clamp(data.idempotency_key || data.idempotencyKey, MAX_FIELD.idempotency_key) || null,
    asset_id: clamp(data.asset_id, MAX_FIELD.asset_id) || null,
    route_family: clamp(data.route_family, MAX_FIELD.route_family) || null,
    public_contract_id: clamp(data.public_contract_id, MAX_FIELD.public_contract_id) || null,
    public_entity_id: clamp(data.public_entity_id, MAX_FIELD.public_entity_id) || null,
    public_id_slug: clamp(data.public_id_slug, MAX_FIELD.public_id_slug) || null,
    cta_id: clamp(data.cta_id, MAX_FIELD.cta_id) || null,
    correlation_id: clamp(data.correlation_id, MAX_FIELD.correlation_id) || null,
    cnpj: clamp(data.cnpj || data.cnpj14, MAX_FIELD.cnpj) || null,
    source: "CONFENGE_WEB",
  };

  return { ok: true, honeypot: false, lead };
}

/**
 * Lead id generation.
 * When `deterministic: true` (preferred for explicit idempotency keys), same seed
 * always yields the same id — critical for Netlify Blobs eventual-consistency races.
 */
function generateLeadId(seedMaterial, options = {}) {
  if (options && options.deterministic) {
    return crypto
      .createHash("sha256")
      .update(String(seedMaterial || "empty"))
      .digest("hex")
      .slice(0, 24);
  }
  const material = [
    seedMaterial || "",
    String(Date.now()),
    crypto.randomBytes(16).toString("hex"),
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 24);
}

function idempotencyKeyFor(lead, explicit) {
  if (explicit) {
    // Normalize: strip accidental idk: prefix double-wrap; clamp length
    let e = String(explicit).trim();
    if (e.toLowerCase().startsWith("idk:")) e = e.slice(4);
    e = e.slice(0, 120);
    if (e) return `idk:${e}`;
  }
  // 15-minute window bucket to collapse double-submit
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const material = [
    lead.nome,
    lead.telefone || "",
    lead.email || "",
    lead.jornada,
    lead.estagio,
    String(bucket),
  ].join("|");
  return `auto:${crypto.createHash("sha256").update(material).digest("hex").slice(0, 32)}`;
}

function clientIp(event) {
  const h = event.headers || {};
  const xff = h["x-forwarded-for"] || h["X-Forwarded-For"] || "";
  if (xff) return String(xff).split(",")[0].trim().slice(0, 80);
  return String(h["client-ip"] || h["x-nf-client-connection-ip"] || h["x-real-ip"] || "").slice(0, 80) || "unknown";
}

function technicalFingerprint(event, lead) {
  const h = event.headers || {};
  const ua = String(h["user-agent"] || h["User-Agent"] || "").slice(0, 200);
  const al = String(h["accept-language"] || h["Accept-Language"] || "").slice(0, 80);
  const material = [clientIp(event), ua, al, lead?.jornada || ""].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 16);
}

function originAllowed(event) {
  const h = event.headers || {};
  const origin = String(h.origin || h.Origin || "").trim();
  const referer = String(h.referer || h.Referer || "").trim();
  if (origin && ALLOWED_ORIGINS.has(origin)) return { ok: true, origin };
  // Same-site form posts may omit Origin; allow if Referer is our host
  if (!origin && referer) {
    try {
      const u = new URL(referer);
      const base = `${u.protocol}//${u.host}`;
      if (ALLOWED_ORIGINS.has(base)) return { ok: true, origin: base };
    } catch {
      /* ignore */
    }
  }
  // Netlify scheduled/synthetic probes without browser origin (ops only when header set)
  const probe = h["x-confenge-probe"] || h["X-Confenge-Probe"];
  if (probe && process.env.LEAD_PROBE_SECRET && probe === process.env.LEAD_PROBE_SECRET) {
    return { ok: true, origin: "https://confenge.com.br", probe: true };
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return { ok: false, status: 403, error: "origin_denied", message: "Origem não autorizada." };
  }
  // Missing origin on POST from non-browser tools: deny in production-like config
  if (process.env.LEAD_REQUIRE_ORIGIN === "1" && !origin) {
    return { ok: false, status: 403, error: "origin_required", message: "Origem não autorizada." };
  }
  return { ok: true, origin: origin || "https://confenge.com.br" };
}

function corsHeaders(origin) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://confenge.com.br";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Idempotency-Key, X-Confenge-Probe",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

/** Public response whitelist — never include channels, topics, tokens, PII. */
function publicSuccessBody({
  lead_id,
  received_at,
  journey,
  stage_category,
  status,
  notify_status,
  email_status,
  idempotent,
}) {
  const body = {
    ok: true,
    lead_id,
    receipt_id: lead_id, // back-compat for front-end
    received_at,
    journey,
    stage_category: stage_category ? String(stage_category).slice(0, 80) : undefined,
    status: status || "persisted",
  };
  // Non-PII delivery status for probe/ops verification (never secrets/topics)
  if (notify_status) body.notify_status = String(notify_status).slice(0, 24);
  if (email_status) body.email_status = String(email_status).slice(0, 24);
  if (idempotent === true) body.idempotent = true;
  return body;
}

function publicErrorBody({ error, message }) {
  return {
    ok: false,
    error: error || "error",
    message: message || "Não foi possível processar a solicitação.",
  };
}

/** Structured log line — no PII fields. */
function safeLog(level, event, fields) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

function retentionPolicy() {
  return {
    retain_days: Number(process.env.LEAD_RETAIN_DAYS || 730),
    purpose: "contato comercial e atendimento de solicitação do titular",
    legal_basis: "consentimento (art. 7º, I, LGPD) e legítimo interesse operacional",
  };
}

module.exports = {
  MAX_BODY_BYTES,
  MAX_FIELD,
  ALLOWED_ORIGINS,
  ALLOWED_JOURNEYS,
  parseBody,
  isHoneypot,
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
  clamp,
  normalizePhone,
  normalizeEmail,
  normalizeJourney,
};
