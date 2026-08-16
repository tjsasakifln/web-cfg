/**
 * Pure correction-request validation and receipt helpers.
 * No I/O — the handler and tests call these functions directly.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  parseBody,
  isHoneypot,
  originAllowed,
  corsHeaders,
  publicErrorBody,
  clamp,
  normalizeEmail,
  normalizePhone,
  generateLeadId,
} = require("./lead-core.cjs");

const MAX_FIELD = {
  page_url: 240,
  contested_excerpt: 2000,
  proposed_correction: 2000,
  contact: 180,
  contact_name: 80,
  policy_version: 32,
};

const ALLOWED_KEYS = new Set([
  "page_url",
  "url",
  "contested_excerpt",
  "excerpt",
  "proposed_correction",
  "correction",
  "contact",
  "email",
  "telefone",
  "whatsapp",
  "phone",
  "contact_name",
  "nome",
  "name",
  "consentimento",
  "consent",
  "lgpd",
  "policy_version",
  "idempotency_key",
  "idempotencyKey",
  "form-name",
  "origem",
  "empresa-site",
  "bot_field",
  "website",
  "fax",
]);

const EXTRA_PII_KEYS = [
  "cpf",
  "rg",
  "date_of_birth",
  "birth_date",
  "data_nascimento",
  "nascimento",
  "dob",
  "endereco",
  "endereço",
  "address",
  "home_address",
  "residencia",
  "residência",
  "cnh",
  "titulo_eleitor",
  "titulo",
];

const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;

function loadCurrentPolicyVersion() {
  const candidates = [
    path.join(__dirname, "../../../data/site/editorial-policy.json"),
    path.join(process.cwd(), "data/site/editorial-policy.json"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const rec = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (rec && rec.current_version) return String(rec.current_version);
      }
    } catch {
      /* next */
    }
  }
  return "UNKNOWN";
}

function hasExtraPiiFields(data) {
  const src = data && typeof data === "object" ? data : {};
  for (const key of EXTRA_PII_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const value = src[key];
    if (value == null) continue;
    if (String(value).trim()) return key;
  }
  return null;
}

function looksLikeDocumentId(value) {
  const s = String(value || "");
  if (!s) return false;
  if (CPF_RE.test(s)) return true;
  if (/data de nascimento|date of birth|endere[cç]o residencial/i.test(s)) return true;
  return false;
}

function normalizePageUrl(raw) {
  const s = clamp(raw, MAX_FIELD.page_url);
  if (!s) return "";
  if (s.startsWith("/")) {
    if (s.includes("://")) return "";
    return s;
  }
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "confenge.com.br" && host !== "confenge.netlify.app") return "";
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return "";
  }
}

function normalizeContact(raw) {
  const email = normalizeEmail(raw);
  if (email) return { kind: "email", value: email };
  const phone = normalizePhone(raw);
  if (phone) return { kind: "phone", value: phone };
  return null;
}

/**
 * Validate a correction request. Extra PII fields fail closed.
 * @returns {{ ok: true, honeypot?: boolean, request?: object } | { ok: false, status: number, error: string, message: string }}
 */
function validateCorrectionRequest(data) {
  const src = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  if (isHoneypot(src)) {
    return { ok: true, honeypot: true };
  }

  const extra = hasExtraPiiFields(src);
  if (extra) {
    return {
      ok: false,
      status: 400,
      error: "extra_pii_rejected",
      message: "Não envie CPF, RG, data de nascimento nem endereço residencial.",
    };
  }

  for (const key of Object.keys(src)) {
    if (ALLOWED_KEYS.has(key)) continue;
    if (EXTRA_PII_KEYS.includes(key.toLowerCase())) {
      return {
        ok: false,
        status: 400,
        error: "extra_pii_rejected",
        message: "Não envie CPF, RG, data de nascimento nem endereço residencial.",
      };
    }
  }

  const pageUrl = normalizePageUrl(src.page_url || src.url);
  const excerpt = clamp(src.contested_excerpt || src.excerpt, MAX_FIELD.contested_excerpt);
  const proposed = clamp(
    src.proposed_correction || src.correction,
    MAX_FIELD.proposed_correction,
  );
  const contactRaw = src.contact || src.email || src.telefone || src.whatsapp || src.phone;
  const contact = normalizeContact(contactRaw);
  const contactName = clamp(src.contact_name || src.nome || src.name, MAX_FIELD.contact_name);
  const consentRaw = src.consentimento ?? src.consent ?? src.lgpd;
  const consent =
    consentRaw === true ||
    consentRaw === "true" ||
    consentRaw === "on" ||
    consentRaw === "1" ||
    consentRaw === "yes" ||
    consentRaw === "sim";

  if (looksLikeDocumentId(contactRaw) || looksLikeDocumentId(contactName)) {
    return {
      ok: false,
      status: 400,
      error: "extra_pii_rejected",
      message: "Não envie CPF, RG, data de nascimento nem endereço residencial.",
    };
  }

  if (!pageUrl) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      message: "Informe a URL da página na CONFENGE.",
    };
  }
  if (!excerpt || excerpt.length < 4) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      message: "Informe o trecho contestado.",
    };
  }
  if (!proposed || proposed.length < 4) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      message: "Informe a correção proposta.",
    };
  }
  if (!contact) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      message: "Informe e-mail ou WhatsApp para resposta.",
    };
  }
  if (!consent) {
    return {
      ok: false,
      status: 400,
      error: "consent",
      message: "É necessário autorizar o uso dos dados para responder ao pedido.",
    };
  }

  return {
    ok: true,
    honeypot: false,
    request: {
      page_url: pageUrl,
      contested_excerpt: excerpt,
      proposed_correction: proposed,
      contact_kind: contact.kind,
      contact: contact.value,
      contact_name: contactName || null,
      consentimento: true,
      policy_version: clamp(src.policy_version, MAX_FIELD.policy_version) || null,
    },
  };
}

function generateReceiptId(seedMaterial, options = {}) {
  const raw = generateLeadId(seedMaterial, options);
  return `corr-${raw}`;
}

function issueReceipt(request, options = {}) {
  const policyVersion = options.policyVersion || loadCurrentPolicyVersion();
  const entropy = options.entropy || crypto.randomBytes(16).toString("hex");
  const seed = [
    request && request.page_url,
    request && request.contested_excerpt,
    request && request.proposed_correction,
    request && request.contact,
    entropy,
  ].join("|");
  return {
    ok: true,
    receipt_id: generateReceiptId(seed, options),
    prazo: "UNKNOWN",
    policy_version: policyVersion,
  };
}

function publicCorrectionBody(receipt) {
  return {
    ok: true,
    receipt_id: receipt.receipt_id,
    prazo: "UNKNOWN",
    policy_version: receipt.policy_version || "UNKNOWN",
  };
}

module.exports = {
  MAX_FIELD,
  ALLOWED_KEYS,
  EXTRA_PII_KEYS,
  parseBody,
  originAllowed,
  corsHeaders,
  publicErrorBody,
  loadCurrentPolicyVersion,
  validateCorrectionRequest,
  generateReceiptId,
  issueReceipt,
  publicCorrectionBody,
};
