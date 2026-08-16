/**
 * PII minimization for URL, analytics and logs. Pure.
 */
const { containsCnpj, hashCnpj, normalizeCnpj } = require("./cnpj.cjs");

const PII_KEYS = new Set([
  "email",
  "e-mail",
  "mail",
  "phone",
  "telefone",
  "tel",
  "whatsapp",
  "name",
  "nome",
  "cnpj",
  "cnpj14",
  "message",
  "mensagem",
  "consent",
  "consentimento",
  "lead_name",
  "lead_email",
  "lead_phone",
]);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\b\+?\d[\d\s().-]{9,}\d\b/g;

function stripPiiText(text) {
  return String(text == null ? "" : text)
    .replace(EMAIL_RE, "[redacted]")
    .replace(PHONE_RE, "[redacted]");
}

function looksLikeCnpjKey(key) {
  return /cnpj/i.test(String(key || ""));
}

function sanitizeAnalytics(eventName, payload, { cnpj } = {}) {
  const src = payload && typeof payload === "object" ? payload : {};
  const out = { event: String(eventName || "").slice(0, 80) };
  for (const [k, v] of Object.entries(src)) {
    if (PII_KEYS.has(String(k).toLowerCase()) || looksLikeCnpjKey(k)) continue;
    if (v == null) continue;
    if (typeof v === "object") continue;
    const s = stripPiiText(v).slice(0, 180);
    if (!s) continue;
    if (cnpj && containsCnpj(s, cnpj)) continue;
    out[k] = s;
  }
  if (cnpj && normalizeCnpj(cnpj)) {
    out.cnpj_hash = hashCnpj(cnpj);
  }
  return out;
}

function safeFields(fields, { cnpj } = {}) {
  const src = fields && typeof fields === "object" ? fields : {};
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (PII_KEYS.has(String(k).toLowerCase()) || looksLikeCnpjKey(k)) continue;
    if (v == null) continue;
    const s = stripPiiText(v);
    if (cnpj && containsCnpj(String(s), cnpj)) continue;
    out[k] = typeof v === "string" ? s.slice(0, 160) : v;
  }
  return out;
}

function publicUrlForJourney(pathOnly) {
  const p = String(pathOnly || "/piloto/conversion-market-answer/").split("?")[0].split("#")[0];
  return `https://confenge.com.br${p.startsWith("/") ? p : `/${p}`}`;
}

function findPiiNeedles(haystack, { cnpj, email, phone, nome } = {}) {
  const text = typeof haystack === "string" ? haystack : JSON.stringify(haystack);
  const hits = [];
  if (cnpj && containsCnpj(text, cnpj)) hits.push("cnpj");
  if (email && text.includes(email)) hits.push("email");
  if (phone && text.includes(String(phone))) hits.push("phone");
  if (nome && text.includes(nome)) hits.push("nome");
  return hits;
}

module.exports = {
  PII_KEYS,
  stripPiiText,
  sanitizeAnalytics,
  safeFields,
  publicUrlForJourney,
  findPiiNeedles,
};
