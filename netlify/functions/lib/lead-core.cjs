/**
 * Pure lead validation, sanitization, idempotency, and response DTO helpers.
 * No I/O — unit-testable without mocks of the unit under test.
 */
const crypto = require("crypto");
const { validateCnpj } = require("../../../scripts/conversion/cnpj.cjs");
const adaptiveIntake = require("./adaptive-intake.cjs");

const MAX_BODY_BYTES = 24 * 1024;
// Standard antivirus fixture. Rejected as bytes, never persisted. Not a real sample.
const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const FILE_FIELD_KEYS = new Set([
  "file",
  "files",
  "arquivo",
  "arquivos",
  "anexo",
  "anexos",
  "attachment",
  "attachments",
  "document",
  "documents",
  "documento",
  "documentos",
  "upload",
  "uploads",
  "filename",
  "file_name",
  "filedata",
  "file_data",
  "blob",
  "binary",
  "octet",
]);
const DOCUMENT_INTENT_ALLOWED = new Set(["secure_channel_request"]);
// Live-intelligence next-action kinds. Server-side allowlist, not free text: an
// unknown value is dropped to null rather than forwarded, so a tampered form
// cannot invent a commercial intent for warmbly to act on.
const INTENT_KIND_ALLOWED = new Set([
  "MONITOR_OPPORTUNITY",
  "MONITOR_COMPANY",
  "REQUEST_DEEP_DIVE",
  "REQUEST_HUMAN_REVIEW",
]);
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
  route_family: 80,
  cta_id: 80,
  asset_id: 80,
  correlation_id: 80,
  landing_url: 240,
  idempotency_key: 80,
  turnstile_token: 2048,
  public_contract_id: 80,
  public_entity_id: 80,
  public_id_slug: 80,
  cnpj: 20,
  analysis_id: 120,
  evidence_pack_version: 80,
  asset_family: 80,
  query_class: 80,
  deliverable_id: 16,
  analysis_cutoff: 10,
  opportunity_deadline: 10,
  contract_event: 32,
  contract_stage: 24,
  contract_value_band: 24,
  lot_count: 4,
  execution_regime: 40,
  decision_intent: 32,
  faixa_contrato: 24,
  risco_em_jogo: 24,
  frequencia: 24,
  maturidade_documental: 24,
  capacidade_interna: 24,
  offer_id: 80,
  terms_id: 80,
  amount_cents: 16,
  document_intent: 40,
  intent_kind: 40,
  session_id: 32,
};

/** Query/body keys that may persist as attribution. Everything else is dropped. */
const ATTR_ALLOWLIST = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "jornada",
  "origem",
  "origin_url",
  "landing_url",
  "landing_page",
  "referrer",
  "route_family",
  "cta_id",
  "asset_id",
  "correlation_id",
  "session_id",
  "tema",
  "pseo_page_id",
  "page_type",
  "archetype",
  "segment",
  "region",
  "agency_id",
  "intent",
  "source_run_id",
  "dataset_hash",
  "cta_position",
  "content_cluster",
  "analysis_id",
  "evidence_pack_version",
  "asset_family",
  "query_class",
  "deliverable_id",
  "offer_id",
  "terms_id",
];

const ATTR_LOCATION_KEYS = new Set([
  "origem",
  "origin_url",
  "landing_url",
  "landing_page",
  "referrer",
]);

// Attribution identifiers are machine-readable dimensions, not free text. Keeping
// them token-shaped prevents a visitor name/message from being smuggled into logs
// or analytics through a UTM/data-* field.
const ATTR_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const ATTR_PATH_RE = /^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/;

// Public catalogue IDs are accepted only from the versioned canonical source.
// A broken/missing registry makes a submitted selection fail closed; a generic
// hand-raise without deliverable_id remains valid.
let DELIVERABLE_STATE_BY_ID = new Map();
try {
  const registry = require("../../../data/commercial/deliverables-registry.v1.json");
  DELIVERABLE_STATE_BY_ID = new Map(
    (registry.deliverables || []).map((entry) => [entry.deliverable_id, entry.public_state]),
  );
} catch {
  DELIVERABLE_STATE_BY_ID = new Map();
}

function assertDeliverableSelection(raw) {
  const id = clamp(raw, MAX_FIELD.deliverable_id).toUpperCase();
  if (!id) return { ok: true, deliverable_id: null };
  const state = DELIVERABLE_STATE_BY_ID.get(id);
  if (!state) {
    return {
      ok: false,
      status: 422,
      error: "deliverable_id_unknown",
      message: "Entrega inexistente no catálogo vigente.",
    };
  }
  if (state === "BLOCKED") {
    return {
      ok: false,
      status: 422,
      error: "deliverable_unavailable",
      message: "Esta entrega ainda não está disponível para análise comercial.",
    };
  }
  return { ok: true, deliverable_id: id };
}

// The catalogue hub captures an initial hand-raise, not the qualification
// questionnaire of a product route. Keep this exception route-exact so a
// forged product-page payload cannot bypass the published fail-closed fields.
function isGenericDeliverablesHandraise(data) {
  if (!data || typeof data !== "object") return false;
  const landingPage = String(data.landing_page || data.landing_url || "").trim();
  return (
    (landingPage === "/entregas/" || landingPage === "https://confenge.com.br/entregas/") &&
    String(data.route_family || "").trim() === "entregas" &&
    String(data.origem || "").trim() === "entregas" &&
    String(data.estagio || "").trim() === "entregas-exemplos-hub" &&
    String(data.asset_id || "").trim() === "entregas-exemplos-hub" &&
    String(data.cta_id || "").trim() === "entregas-hub-handraise" &&
    !String(data.offer_id || "").trim()
  );
}

const LICITACAO_PRODUCT_IDS = new Set(["CFG-D12", "CFG-D13", "CFG-D14", "CFG-D15", "CFG-D16"]);
const CONTRACT_VALUE_BANDS = new Set(["ate_5m", "5m_20m", "20m_100m", "acima_100m", "UNKNOWN"]);
const EXECUTION_REGIMES = new Set([
  "empreitada_preco_global",
  "empreitada_preco_unitario",
  "contratacao_integrada",
  "contratacao_semi_integrada",
  "outro",
  "UNKNOWN",
]);
const LICITACAO_DECISION_INTENTS = new Set([
  "avaliar_disputa",
  "avancar",
  "avancar_condicoes",
  "esclarecer_impugnar",
  "recusar",
  "UNKNOWN",
]);
const ICP_TICKET_BANDS = new Set(["ate_250k", "250k_1m", "acima_1m", "unknown"]);
const ICP_RISK_BANDS = new Set([
  "abaixo_entrada",
  "faixa_entrada",
  "faixa_diagnostico",
  "faixa_dossie",
  "acima_dossie",
  "unknown",
]);
const ICP_FREQUENCY = new Set(["pontual", "recorrente", "unknown"]);
const ICP_DOCS = new Set(["forte", "parcial", "fraca", "unknown"]);
const ICP_CAPACITY = new Set(["suficiente", "limitada", "inexistente", "unknown"]);

function pickEnum(value, allowed, maxLen) {
  const raw = clamp(value, maxLen);
  return allowed.has(raw) ? raw : null;
}

function isCanonicalIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function businessDaysUntil(value, now = new Date()) {
  if (!isCanonicalIsoDate(value)) return -1;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const end = new Date(`${value}T00:00:00Z`);
  const calendarDays = Math.ceil((end.getTime() - cursor.getTime()) / 86400000) + 1;
  if (calendarDays < 0 || calendarDays > 366) return -1;
  let days = 0;
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function assertLicitacaoQualification(data, deliverableId) {
  if (!LICITACAO_PRODUCT_IDS.has(deliverableId)) return { ok: true, qualification: null };
  const publicContractId = clamp(data.public_contract_id, MAX_FIELD.public_contract_id);
  const deadline = clamp(data.opportunity_deadline, MAX_FIELD.opportunity_deadline);
  const valueBand = clamp(data.contract_value_band, MAX_FIELD.contract_value_band);
  const regime = clamp(data.execution_regime, MAX_FIELD.execution_regime);
  const decisionIntent = clamp(data.decision_intent, MAX_FIELD.decision_intent);
  const lotRaw = clamp(data.lot_count, MAX_FIELD.lot_count);
  const lotCount = Number(lotRaw);
  const deadlineBusinessDays = businessDaysUntil(deadline);
  const minimumBusinessDays = deliverableId === "CFG-D12" ? 5 : 1;
  if (
    publicContractId.length < 3 ||
    !isCanonicalIsoDate(deadline) ||
    !CONTRACT_VALUE_BANDS.has(valueBand) ||
    !EXECUTION_REGIMES.has(regime) ||
    !LICITACAO_DECISION_INTENTS.has(decisionIntent) ||
    !/^\d{1,3}$/.test(lotRaw) ||
    !Number.isInteger(lotCount) ||
    lotCount < 1 ||
    lotCount > 999 ||
    deadlineBusinessDays < minimumBusinessDays
  ) {
    return {
      ok: false,
      status: 422,
      error: "licitacao_qualification_invalid",
      message: "Informe edital, prazo seguro, faixa de valor, lotes, regime e decisão nos formatos publicados.",
    };
  }
  return {
    ok: true,
    qualification: {
      opportunity_deadline: deadline,
      contract_value_band: valueBand,
      lot_count: lotCount,
      execution_regime: regime,
      decision_intent: decisionIntent,
    },
  };
}

const EIGHT_PRODUCT_IDS = new Set([
  "CFG-D01", "CFG-D02", "CFG-D03", "CFG-D04",
  "CFG-D05", "CFG-D06", "CFG-D07", "CFG-D08",
]);
const EXPANSION_DECISION_INTENTS = new Set([
  "priorizar_oportunidades",
  "validar_mercado",
  "escolher_territorio",
  "monitorar_renovacoes",
  "comparar_concorrentes",
  "referenciar_precos",
  "consolidar_plano",
  "UNKNOWN",
]);

function assertEightProductQualification(data, deliverableId) {
  if (!EIGHT_PRODUCT_IDS.has(deliverableId)) return { ok: true, qualification: null };
  const cnpjCheck = validateCnpj(clamp(data.cnpj || data.cnpj14, MAX_FIELD.cnpj));
  const analysisCutoff = clamp(data.analysis_cutoff, MAX_FIELD.analysis_cutoff);
  const deadline = clamp(data.opportunity_deadline, MAX_FIELD.opportunity_deadline);
  const decisionIntent = clamp(data.decision_intent, MAX_FIELD.decision_intent);
  const cutoffTime = isCanonicalIsoDate(analysisCutoff) ? Date.parse(`${analysisCutoff}T00:00:00Z`) : NaN;
  const deadlineTime = isCanonicalIsoDate(deadline) ? Date.parse(`${deadline}T00:00:00Z`) : NaN;
  if (
    !cnpjCheck.ok ||
    !Number.isFinite(cutoffTime) ||
    !Number.isFinite(deadlineTime) ||
    cutoffTime < Date.parse("2000-01-01T00:00:00Z") ||
    cutoffTime > deadlineTime ||
    businessDaysUntil(deadline) < 1 ||
    !EXPANSION_DECISION_INTENTS.has(decisionIntent)
  ) {
    return {
      ok: false,
      status: 422,
      error: "expansion_qualification_invalid",
      message: "Informe CNPJ, data de corte, prazo e decisão nos formatos publicados.",
    };
  }
  return {
    ok: true,
    qualification: {
      cnpj: cnpjCheck.cnpj,
      analysis_cutoff: analysisCutoff,
      opportunity_deadline: deadline,
      decision_intent: decisionIntent,
    },
  };
}

const CONTRACT_DEFENSE_IDS = new Set([
  "CFG-D17", "CFG-D18", "CFG-D19", "CFG-D20", "CFG-D21", "CFG-D22", "CFG-D23",
]);
const CONTRACT_EVENTS = new Set([
  "risco_margem",
  "medicao_glosa_pagamento",
  "mudanca_escopo",
  "atraso_prorrogacao",
  "reajuste",
  "reequilibrio",
  "notificacao_sancao",
  "outro",
]);
const CONTRACT_STAGES = new Set([
  "identificado", "documentando", "quantificando", "em_resposta", "UNKNOWN",
]);

function assertContractDefenseQualification(data, deliverableId) {
  if (!CONTRACT_DEFENSE_IDS.has(deliverableId)) return { ok: true, qualification: null };
  const publicContractId = clamp(data.public_contract_id, MAX_FIELD.public_contract_id);
  const contractEvent = clamp(data.contract_event, MAX_FIELD.contract_event);
  const deadline = clamp(data.opportunity_deadline, MAX_FIELD.opportunity_deadline);
  const contractStage = clamp(data.contract_stage, MAX_FIELD.contract_stage);
  const safeDays = businessDaysUntil(deadline);
  const minDays = deliverableId === "CFG-D23" ? 5 : 1;
  if (
    publicContractId.length < 3 ||
    !CONTRACT_EVENTS.has(contractEvent) ||
    !CONTRACT_STAGES.has(contractStage) ||
    safeDays < minDays
  ) {
    return {
      ok: false,
      status: 422,
      error: "contract_qualification_invalid",
      message: "Informe contrato, evento, prazo seguro e estágio nos formatos publicados.",
    };
  }
  return {
    ok: true,
    qualification: {
      public_contract_id: publicContractId,
      contract_event: contractEvent,
      opportunity_deadline: deadline,
      contract_stage: contractStage,
    },
  };
}

function looksLikePii(value, key) {
  const s = String(value || "");
  if (!s) return false;
  if (/@/.test(s)) return true;
  if (key === "correlation_id" || key === "session_id" || key === "lead_id") return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return false;
  if (s.startsWith("c-")) return false;
  if (/^(sess|lead|opp|prop|sale|evt)-/.test(s)) return false;
  const compactDigits = s.replace(/[\s()./+\-]/g, "");
  return /^\d{10,15}$/.test(compactDigits);
}

function sanitizeAttributionValue(val, maxLen, key) {
  if (val == null) return "";
  const s = stripControl(val).slice(0, maxLen || 180);
  if (!s || looksLikePii(s, key) || !ATTR_TOKEN_RE.test(s)) return "";
  return s;
}

function sanitizeAttributionLocation(val, maxLen, key) {
  if (val == null) return "";
  const raw = stripControl(val).slice(0, maxLen || 240);
  if (!raw) return "";

  try {
    // Absolute URLs retain only scheme/host/path. Query and fragment are never
    // attribution storage because they can contain email, phone or message text.
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    const clean = `${url.origin}${url.pathname}`.slice(0, maxLen || 240);
    let decodedPath = url.pathname;
    try {
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      return "";
    }
    return looksLikePii(clean, key) || looksLikePii(decodedPath, key) ? "" : clean;
  } catch {
    // Same-site paths are stored without query/fragment; plain origin slugs use
    // the same strict token contract as the remaining attribution dimensions.
    if (raw.startsWith("/")) {
      const path = raw.split(/[?#]/, 1)[0].slice(0, maxLen || 240);
      return path && !looksLikePii(path, key) && ATTR_PATH_RE.test(path) ? path : "";
    }
    return sanitizeAttributionValue(raw, maxLen, key);
  }
}

function normalizeSessionId(value) {
  const sessionId = String(value || "").slice(0, MAX_FIELD.session_id);
  return /^sess-[0-9a-f]{27}$/i.test(sessionId) ? sessionId.toLowerCase() : "";
}

/**
 * Keep only allowlisted attribution keys. Drops arbitrary query params and PII.
 */
function pickAttribution(data) {
  const src = data && typeof data === "object" ? data : {};
  const out = {};
  for (const key of ATTR_ALLOWLIST) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const max = MAX_FIELD[key] || 180;
    const v = key === "session_id"
      ? normalizeSessionId(src[key])
      : ATTR_LOCATION_KEYS.has(key)
        ? sanitizeAttributionLocation(src[key], max, key)
        : sanitizeAttributionValue(src[key], max, key);
    if (v) out[key] = v;
  }
  return out;
}

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
  // Sem sinal, nao adivinhe: classificar como "operacao" rebaixava em silencio
  // um contrato urgente para a jornada de menor urgencia.
  return "outro";
}

function looksLikeBinaryPayload(raw) {
  if (raw == null) return false;
  const text = typeof raw === "string" ? raw : String(raw);
  if (!text) return false;
  if (text.includes("\0")) return true;
  if (text.includes(EICAR_SIGNATURE)) return true;
  if (text.startsWith("%PDF") || text.startsWith("PK\u0003\u0004") || text.startsWith("MZ")) return true;
  if (/^data:[^;]+;base64,/i.test(text.slice(0, 96))) return true;
  return false;
}

function contentTypeRejectsFiles(contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (!ct) return false;
  if (ct.includes("multipart/")) return true;
  if (ct.includes("application/octet-stream")) return true;
  if (ct.includes("application/pdf") || ct.includes("application/zip")) return true;
  if (ct.startsWith("image/") || ct.startsWith("audio/") || ct.startsWith("video/")) return true;
  if (ct.includes("application/vnd")) return true;
  return false;
}

function isBufferLike(value) {
  return (
    Buffer.isBuffer(value) ||
    (value && typeof value === "object" && value.type === "Buffer" && Array.isArray(value.data))
  );
}

function rejectFileShape(raw, contentType, data) {
  if (contentTypeRejectsFiles(contentType)) {
    return { ok: false, error: "file_payload_rejected", status: 415 };
  }
  if (looksLikeBinaryPayload(raw)) {
    return { ok: false, error: "file_payload_rejected", status: 415 };
  }
  if (data && typeof data === "object") {
    for (const key of Object.keys(data)) {
      const lower = String(key).toLowerCase();
      if (FILE_FIELD_KEYS.has(lower) || /\.(pdf|xlsx?|docx?|zip|exe|bin)$/i.test(lower)) {
        return { ok: false, error: "file_payload_rejected", status: 415 };
      }
      const value = data[key];
      if (isBufferLike(value)) {
        return { ok: false, error: "file_payload_rejected", status: 415 };
      }
      if (typeof value === "string" && looksLikeBinaryPayload(value)) {
        return { ok: false, error: "file_payload_rejected", status: 415 };
      }
    }
  }
  return null;
}

function leadHasFilePayload(record) {
  if (!record || typeof record !== "object") return false;
  return Boolean(rejectFileShape("", "", record));
}

function titularExport(record) {
  if (leadHasFilePayload(record)) {
    const err = new Error("file_payload_forbidden");
    err.code = "file_payload_forbidden";
    throw err;
  }
  const exported = {
    lead_id: record.lead_id || null,
    received_at: record.received_at || null,
    jornada: record.jornada || null,
    estagio: record.estagio || null,
    document_intent: record.document_intent || null,
    // The record holds what the subject asked for; a subject export that omits
    // it would be less honest than the record it describes.
    intent_kind: record.intent_kind || null,
    canal_seguro: Boolean(record.canal_seguro),
    channel_status: record.document_intent ? "canal escolhido posteriormente" : null,
    source: record.source || "CONFENGE_WEB",
  };
  for (const key of Object.keys(exported)) {
    if (FILE_FIELD_KEYS.has(key.toLowerCase())) {
      const err = new Error("file_payload_forbidden");
      err.code = "file_payload_forbidden";
      throw err;
    }
  }
  return exported;
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
  const early = rejectFileShape(raw, ct, null);
  if (early) return early;

  let data;
  if (ct.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed;
      } else {
        return { ok: false, error: "invalid_json", status: 400 };
      }
    } catch {
      return { ok: false, error: "invalid_json", status: 400 };
    }
  } else if (!ct || ct.includes("application/x-www-form-urlencoded") || ct.includes("text/plain")) {
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
    data = out;
  } else {
    return { ok: false, error: "unsupported_media_type", status: 415 };
  }
  const after = rejectFileShape(raw, ct, data);
  if (after) return after;
  return { ok: true, data };
}

function isHoneypot(data) {
  const hp = data["empresa-site"] || data.bot_field || data.website || data.fax;
  return Boolean(hp && String(hp).trim());
}

/**
 * Owner-approved non-catalog action identities (intent-action matrix).
 * They are deliberately absent from the frozen catalog snapshot, so the price
 * authority is the matrix `authorized_amount_cents`, not the offer registry.
 */
function nonCatalogAction(offerId) {
  if (!offerId) return null;
  try {
    const matrix = require("../../../scripts/conversion/matrix.cjs");
    const route = matrix
      .listRoutes()
      .find((r) => r && r.offer_id === offerId && r.authorized_amount_cents != null);
    return route || null;
  } catch {
    return null;
  }
}

function assertOfferTermsAndPrice(data) {
  const offerId = clamp(data.offer_id, MAX_FIELD.offer_id);
  const termsId = clamp(data.terms_id || data.terms_version, MAX_FIELD.terms_id);
  const amountRaw = data.amount_cents;
  if (!offerId && !termsId && (amountRaw == null || amountRaw === "")) {
    return { ok: true, offer_id: "", terms_id: "" };
  }
  const action = nonCatalogAction(offerId);
  if (action) {
    // Non-catalog action: no catalog terms version applies before human acceptance.
    if (termsId) {
      return {
        ok: false,
        status: 422,
        error: "terms_version_mismatch",
        message: "Os termos submetidos não coincidem com o registro vigente.",
      };
    }
    if (amountRaw != null && amountRaw !== "") {
      const cents = Number(amountRaw);
      if (!Number.isFinite(cents) || cents !== action.authorized_amount_cents) {
        return {
          ok: false,
          status: 422,
          error: "price_mismatch",
          message: "O valor submetido não coincide com o registro.",
        };
      }
    }
    return { ok: true, offer_id: offerId, terms_id: "" };
  }
  let registry;
  try {
    registry = require("../../../scripts/offers/registry.cjs");
  } catch {
    return {
      ok: false,
      status: 422,
      error: "offer_registry_unavailable",
      message: "Registro de oferta indisponível.",
    };
  }
  const canonicalTerms = registry.AUTHORITY.terms_version;
  if (termsId && termsId !== canonicalTerms) {
    return {
      ok: false,
      status: 422,
      error: "terms_version_mismatch",
      message: "Os termos submetidos não coincidem com o registro vigente.",
    };
  }
  if (!offerId) {
    return {
      ok: false,
      status: 422,
      error: "offer_id_required",
      message: "Informe o offer_id do registro.",
    };
  }
  const offer = registry.getOffer(offerId);
  if (!offer) {
    return {
      ok: false,
      status: 422,
      error: "offer_id_unknown",
      message: "Oferta inexistente no registro.",
    };
  }
  if (amountRaw != null && amountRaw !== "") {
    const cents = Number(amountRaw);
    if (!Number.isFinite(cents) || cents !== offer.amount_cents) {
      return {
        ok: false,
        status: 422,
        error: "price_mismatch",
        message: "O valor submetido não coincide com o registro.",
      };
    }
  }
  return { ok: true, offer_id: offerId, terms_id: termsId || canonicalTerms };
}

/**
 * Validate and normalize inbound lead payload.
 * @returns {{ ok: true, lead: object } | { ok: false, status: number, error: string, message: string }}
 */
function validateAndNormalize(data) {
  if (isHoneypot(data)) {
    return { ok: true, honeypot: true };
  }

  const conflictParties = adaptiveIntake.rejectConflictParties(data);
  if (conflictParties) return conflictParties;

  const adaptiveResult = adaptiveIntake.validateAdaptiveIntake(data);
  if (adaptiveResult.handled && !adaptiveResult.ok) return adaptiveResult;
  const adaptiveFields = adaptiveResult.handled && adaptiveResult.ok ? adaptiveResult.fields : null;

  const offerCheck = assertOfferTermsAndPrice(data);
  if (!offerCheck.ok) return offerCheck;
  const deliverableCheck = assertDeliverableSelection(data.deliverable_id);
  if (!deliverableCheck.ok) return deliverableCheck;
  const qualificationDeliverableId = isGenericDeliverablesHandraise(data)
    ? null
    : deliverableCheck.deliverable_id;
  let licitacaoCheck = { ok: true, qualification: null };
  let eightCheck = { ok: true, qualification: null };
  let contractCheck = { ok: true, qualification: null };
  // A qualificação descreve a necessidade; ela NÃO decide se o contato é
  // recebido. Documentação incompleta, contrato ainda sem número e prazo mais
  // curto que o piso publicado passaram a ser LACUNA REGISTRADA, nunca veto de
  // recebimento: antes devolviam 422 sem gravar nada, e o cliente apresentava
  // isso ao visitante como pane de servidor. O piso material continua publicado
  // na própria rota; o que acabou foi descartar a pessoa que chega fora dele.
  // Isto vale SOMENTE para as três qualificações de produto. Rejeições
  // estruturais e de segurança (payload, origem, honeypot, mídia) continuam
  // fail-closed e inalteradas.
  const qualificationGaps = [];
  if (!adaptiveFields) {
    licitacaoCheck = assertLicitacaoQualification(data, qualificationDeliverableId);
    if (!licitacaoCheck.ok) qualificationGaps.push(licitacaoCheck.error);
    eightCheck = assertEightProductQualification(data, qualificationDeliverableId);
    if (!eightCheck.ok) qualificationGaps.push(eightCheck.error);
    contractCheck = assertContractDefenseQualification(data, qualificationDeliverableId);
    if (!contractCheck.ok) qualificationGaps.push(contractCheck.error);
  }
  const productQualification = licitacaoCheck.qualification || eightCheck.qualification || contractCheck.qualification;

  // Radar Decisório purchase parameters. Server-side, fail-closed: the browser
  // check is a convenience, this one is the contract.
  let radarParams = null;
  let radar = null;
  try {
    radar = require("./radar-params.cjs");
  } catch {
    radar = null;
  }
  if (radar && radar.isRadarSubmission(data)) {
    if (offerCheck.offer_id && offerCheck.offer_id !== radar.RADAR_OFFER_ID) {
      return {
        ok: false,
        status: 422,
        error: "radar_offer_mismatch",
        message: "A oferta submetida não corresponde ao Radar Decisório.",
      };
    }
    const check = radar.validateRadarParams(data);
    if (!check.ok) return check;
    radarParams = check.params;
    offerCheck.offer_id = radar.RADAR_OFFER_ID;
  }

  const nome = clamp(data.nome || data.name, MAX_FIELD.nome);
  // Presenca e validade sao coisas diferentes. normalizePhone e normalizeEmail
  // devolvem "" nos dois casos, e ate 2026-08-31 o servidor tratava os dois
  // como o mesmo: um WhatsApp digitado errado era descartado em silencio, e o
  // visitante que so tinha informado esse canal recebia "Informe WhatsApp ou
  // e-mail para retorno." Ele TINHA informado. A mensagem culpava o visitante
  // por um campo que ele preencheu, e nao dizia o que estava errado.
  const rawTelefone = clamp(data.telefone || data.whatsapp || data.phone || data.tel, MAX_FIELD.telefone);
  const rawEmail = clamp(data.email, MAX_FIELD.email);
  const telefone = normalizePhone(rawTelefone);
  const normalizedEmail = normalizeEmail(rawEmail);
  // On a Radar order the delivery e-mail is also the contact channel.
  const email = normalizedEmail || (radarParams ? radarParams.email_entrega : "");
  const estagio = adaptiveFields
    ? adaptiveFields.estagio
    : clamp(data.estagio || data.tipo_demanda || data.demand_type, MAX_FIELD.estagio);
  const jornada = adaptiveFields
    ? adaptiveFields.jornada
    : normalizeJourney(data.jornada || data.journey, estagio);
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
  // Recusar antes de "faltou canal": quem digitou algo precisa saber o que
  // estava errado no que digitou, nao ser informado de que nao digitou nada.
  if (rawTelefone && !telefone) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      field: "telefone",
      message:
        "WhatsApp invalido. Informe DDD e numero, com 10 ou 11 digitos. Exemplo: (48) 98834-4559.",
    };
  }
  if (rawEmail && !normalizedEmail) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      field: "email",
      message:
        "E-mail invalido. Informe um endereco completo, como nome@empresa.com.br.",
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
    urgencia: adaptiveFields
      ? adaptiveFields.urgency
      : clamp(data.urgencia, MAX_FIELD.urgencia) || null,
    mensagem: adaptiveFields ? null : clamp(data.mensagem || data.message, MAX_FIELD.mensagem) || null,
    consentimento: true,
    origem: sanitizeAttributionLocation(data.origem, MAX_FIELD.origem, "origem") || null,
    landing_page:
      sanitizeAttributionLocation(
        data.landing_page || data.landing || data.landing_url,
        MAX_FIELD.landing_page,
        "landing_page",
      ) || null,
    landing_url:
      sanitizeAttributionLocation(
        data.landing_url || data.landing_page,
        MAX_FIELD.landing_url,
        "landing_url",
      ) || null,
    referrer:
      sanitizeAttributionLocation(data.referrer || data.ref, MAX_FIELD.referrer, "referrer") || null,
    utm_source: sanitizeAttributionValue(data.utm_source, MAX_FIELD.utm_source, "utm_source") || null,
    utm_medium: sanitizeAttributionValue(data.utm_medium, MAX_FIELD.utm_medium, "utm_medium") || null,
    utm_campaign:
      sanitizeAttributionValue(data.utm_campaign, MAX_FIELD.utm_campaign, "utm_campaign") || null,
    utm_content:
      sanitizeAttributionValue(data.utm_content, MAX_FIELD.utm_content, "utm_content") || null,
    utm_term: sanitizeAttributionValue(data.utm_term, MAX_FIELD.utm_term, "utm_term") || null,
    content_cluster:
      sanitizeAttributionValue(
        data.content_cluster,
        MAX_FIELD.content_cluster,
        "content_cluster",
      ) || null,
    route_family: sanitizeAttributionValue(data.route_family, MAX_FIELD.route_family, "route_family") || null,
    cta_id: sanitizeAttributionValue(data.cta_id, MAX_FIELD.cta_id, "cta_id") || null,
    asset_id: sanitizeAttributionValue(data.asset_id, MAX_FIELD.asset_id, "asset_id") || null,
    correlation_id: sanitizeAttributionValue(data.correlation_id, MAX_FIELD.correlation_id, "correlation_id") || null,
    session_id: normalizeSessionId(data.session_id || data.sid) || null,
    analysis_id: sanitizeAttributionValue(data.analysis_id, MAX_FIELD.analysis_id, "analysis_id") || null,
    evidence_pack_version: sanitizeAttributionValue(
      data.evidence_pack_version,
      MAX_FIELD.evidence_pack_version,
      "evidence_pack_version",
    ) || null,
    asset_family: sanitizeAttributionValue(data.asset_family, MAX_FIELD.asset_family, "asset_family") || null,
    query_class: sanitizeAttributionValue(data.query_class, MAX_FIELD.query_class, "query_class") || null,
    deliverable_id: deliverableCheck.deliverable_id,
    analysis_cutoff: productQualification?.analysis_cutoff || null,
    // Fallback ao valor bruto: numa lacuna, productQualification é null e um
    // prazo curto -- exatamente o caso que mais precisa de resposta rápida --
    // desapareceria do registro.
    opportunity_deadline:
      productQualification?.opportunity_deadline
      || clamp(data.opportunity_deadline, MAX_FIELD.opportunity_deadline)
      || null,
    contract_event:
      productQualification?.contract_event || clamp(data.contract_event, MAX_FIELD.contract_event) || null,
    contract_stage:
      productQualification?.contract_stage || clamp(data.contract_stage, MAX_FIELD.contract_stage) || null,
    contract_value_band: productQualification?.contract_value_band || null,
    lot_count: productQualification?.lot_count || null,
    execution_regime: productQualification?.execution_regime || null,
    decision_intent: productQualification?.decision_intent || null,
    faixa_contrato: pickEnum(data.faixa_contrato, ICP_TICKET_BANDS, MAX_FIELD.faixa_contrato),
    risco_em_jogo: pickEnum(data.risco_em_jogo, ICP_RISK_BANDS, MAX_FIELD.risco_em_jogo),
    frequencia: pickEnum(data.frequencia, ICP_FREQUENCY, MAX_FIELD.frequencia),
    maturidade_documental: pickEnum(data.maturidade_documental, ICP_DOCS, MAX_FIELD.maturidade_documental),
    capacidade_interna: pickEnum(data.capacidade_interna, ICP_CAPACITY, MAX_FIELD.capacidade_interna),
    turnstile_token: clamp(data["cf-turnstile-response"] || data.turnstile_token, MAX_FIELD.turnstile_token) || null,
    idempotency_key: clamp(data.idempotency_key || data.idempotencyKey, MAX_FIELD.idempotency_key) || null,
    public_contract_id: productQualification?.public_contract_id || clamp(data.public_contract_id, MAX_FIELD.public_contract_id) || null,
    public_entity_id: clamp(data.public_entity_id, MAX_FIELD.public_entity_id) || null,
    public_id_slug: clamp(data.public_id_slug, MAX_FIELD.public_id_slug) || null,
    cnpj: eightCheck.qualification?.cnpj || clamp(data.cnpj || data.cnpj14, MAX_FIELD.cnpj) || null,
    offer_id: offerCheck.offer_id || null,
    terms_id: offerCheck.terms_id || null,
    radar_params: radarParams,
    source: "CONFENGE_WEB",
    document_intent: DOCUMENT_INTENT_ALLOWED.has(clamp(data.document_intent, MAX_FIELD.document_intent))
      ? clamp(data.document_intent, MAX_FIELD.document_intent)
      : null,
    intent_kind: INTENT_KIND_ALLOWED.has(clamp(data.intent_kind, MAX_FIELD.intent_kind))
      ? clamp(data.intent_kind, MAX_FIELD.intent_kind)
      : null,
    canal_seguro:
      data.canal_seguro === true ||
      data.canal_seguro === "true" ||
      data.canal_seguro === "on" ||
      data.canal_seguro === "1" ||
      data.canal_seguro === "yes" ||
      data.canal_seguro === "sim" ||
      clamp(data.document_intent, MAX_FIELD.document_intent) === "secure_channel_request",
  };

  if (adaptiveFields) {
    lead.adaptive_intake = true;
    lead.need_code = adaptiveFields.need_code;
    lead.nucleus_id = adaptiveFields.nucleus_id;
    lead.offer_candidate_id = adaptiveFields.offer_candidate_id;
    lead.source_asset_id = adaptiveFields.source_asset_id;
    lead.source_origin_asset_id = adaptiveFields.source_origin_asset_id || null;
    lead.source_origin_route_family = adaptiveFields.source_origin_route_family || null;
    lead.landing_family = adaptiveFields.landing_family;
    lead.city_class = adaptiveFields.city_class;
    lead.site_class = adaptiveFields.site_class;
    lead.location_material = adaptiveFields.location_material;
    lead.city = adaptiveFields.city;
    lead.uf = adaptiveFields.uf;
    lead.decision_role = adaptiveFields.decision_role;
    lead.pessoa_tipo = adaptiveFields.pessoa_tipo;
    lead.canal_preferido = adaptiveFields.canal_preferido;
    lead.why_now = adaptiveFields.why_now;
    lead.desired_decision = adaptiveFields.desired_decision;
    lead.document_availability_class = adaptiveFields.document_availability_class;
    lead.qualification_state = adaptiveFields.qualification_state;
    lead.conflict_status = adaptiveFields.conflict_status;
    lead.conflict_reference = adaptiveFields.conflict_reference;
    lead.intake_contract_version = adaptiveFields.intake_contract_version;
    lead.intake_pin_hash = adaptiveFields.intake_pin_hash;
    lead.taxonomy_version = adaptiveFields.taxonomy_version;
    lead.offer_catalog_version = adaptiveFields.offer_catalog_version;
    lead.admission_policy_version = adaptiveFields.admission_policy_version;
    lead.admission_policy_id = adaptiveFields.admission_policy_id;
    lead.admission_policy_hash = adaptiveFields.admission_policy_hash;
    lead.governance_source_sha = adaptiveFields.governance_source_sha;
    lead.outbound_eligible = false;
    lead.auto_send = false;
    lead.sensitive_docs_ack = true;
    lead.claim_stage = adaptiveFields.claim_stage || null;
    lead.valuation_purpose = adaptiveFields.valuation_purpose || null;
    lead.inspection_window = adaptiveFields.inspection_window || null;
    lead.property_class = adaptiveFields.property_class || null;
    lead.work_type = adaptiveFields.work_type || null;
    lead.work_stage = adaptiveFields.work_stage || null;
    lead.project_status = adaptiveFields.project_status || null;
    lead.budget_class = adaptiveFields.budget_class || null;
    lead.bim_status = adaptiveFields.bim_status || null;
    lead.establishment_class = adaptiveFields.establishment_class || null;
    lead.risk_class = adaptiveFields.risk_class || null;
    lead.sst_doc_class = adaptiveFields.sst_doc_class || null;
    lead.certame_stage = adaptiveFields.certame_stage || null;
    lead.contract_relation = adaptiveFields.contract_relation || null;
    lead.entity_class = adaptiveFields.entity_class || null;
  }

  // Uma lacuna de qualificação marca o registro para leitura humana; ela não
  // impede o recebimento. NEEDS_CONTEXT já existe no contrato (ver
  // deriveQualification em adaptive-intake): nenhum enum novo é criado aqui.
  if (!lead.qualification_state && qualificationGaps.length) {
    lead.qualification_state = "NEEDS_CONTEXT";
  }

  return { ok: true, honeypot: false, lead };
}

/**
 * Lead id generation.
 * When `deterministic: true` (preferred for explicit idempotency keys), same seed
 * always yields the same id across retries and concurrent durable-store writes.
 */
function generateLeadId(seedMaterial, options = {}) {
  if (options && options.deterministic) {
    const digest = crypto
      .createHash("sha256")
      .update(String(seedMaterial || "empty"))
      .digest("hex");
    return `lead-${digest.slice(0, 27)}`;
  }
  const material = [
    seedMaterial || "",
    String(Date.now()),
    crypto.randomBytes(16).toString("hex"),
  ].join("|");
  const digest = crypto.createHash("sha256").update(material).digest("hex");
  return `lead-${digest.slice(0, 27)}`;
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
  // A Radar submission is an order specification, not only a contact lead.
  // Two configurations from the same person in the same bucket must not
  // collapse into one record and silently discard the later parameters.
  // Normalize the set-valued field so a retry with a different checkbox order
  // still converges to the same key.
  const radar = lead && lead.radar_params;
  const radarMaterial = radar
    ? JSON.stringify({
        schema: radar.schema || "",
        offer_id: radar.offer_id || "",
        cnpj: radar.cnpj || "",
        recorte: radar.recorte || "",
        uf: radar.uf || "",
        cidade_base: radar.cidade_base || "",
        raio_km: radar.raio_km == null ? "" : radar.raio_km,
        segmentos: Array.isArray(radar.segmentos)
          ? [...new Set(radar.segmentos.map(String))].sort()
          : [],
        acervo_tecnico: radar.acervo_tecnico || "",
        email_entrega: radar.email_entrega || "",
      })
    : "";
  const productMaterial = lead?.deliverable_id
    ? JSON.stringify({
        deliverable_id: lead.deliverable_id,
        cnpj: lead.cnpj || "",
        public_contract_id: lead.public_contract_id || "",
        analysis_cutoff: lead.analysis_cutoff || "",
        opportunity_deadline: lead.opportunity_deadline || "",
        contract_event: lead.contract_event || "",
        contract_stage: lead.contract_stage || "",
        contract_value_band: lead.contract_value_band || "",
        lot_count: lead.lot_count == null ? "" : lead.lot_count,
        execution_regime: lead.execution_regime || "",
        decision_intent: lead.decision_intent || "",
      })
    : "";
  const adaptiveMaterial = lead?.nucleus_id
    ? JSON.stringify({
        need_code: lead.need_code || "",
        nucleus_id: lead.nucleus_id,
        offer_candidate_id: lead.offer_candidate_id || "",
        qualification_state: lead.qualification_state || "",
        conflict_status: lead.conflict_status || "",
        location_material: Boolean(lead.location_material),
        city: lead.city || "",
        uf: lead.uf || "",
        admission_policy_hash: lead.admission_policy_hash || "",
      })
    : "";
  const material = [
    lead.nome,
    lead.telefone || "",
    lead.email || "",
    lead.jornada,
    lead.estagio,
    radarMaterial,
    productMaterial,
    adaptiveMaterial,
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

function probeAuthorized(event, env = process.env) {
  const h = (event && event.headers) || {};
  const provided = String(h["x-confenge-probe"] || h["X-Confenge-Probe"] || "");
  const expected = String(env.LEAD_PROBE_SECRET || "");
  // This credential bypasses the human-only Turnstile challenge, so keep the
  // implementation aligned with the documented 32+ character requirement.
  if (!provided || expected.length < 32) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function originAllowed(event) {
  const h = event.headers || {};
  const origin = String(h.origin || h.Origin || "").trim();
  const referer = String(h.referer || h.Referer || "").trim();
  const probe = probeAuthorized(event);
  if (origin && ALLOWED_ORIGINS.has(origin)) return { ok: true, origin, probe };
  // Same-site form posts may omit Origin; allow if Referer is our host
  if (!origin && referer) {
    try {
      const u = new URL(referer);
      const base = `${u.protocol}//${u.host}`;
      if (ALLOWED_ORIGINS.has(base)) return { ok: true, origin: base, probe };
    } catch {
      /* ignore */
    }
  }
  // Netlify scheduled/synthetic probes without browser origin (ops only when header set)
  if (probe) {
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
  correlation_id,
  external_reference,
  delivery_business_days,
  document_intent,
  nucleus_id,
  qualification_state,
  conflict_status,
}) {
  const body = {
    ok: true,
    lead_id,
    receipt_id: lead_id, // back-compat for front-end
    received_at,
    source: "CONFENGE_WEB",
    journey,
    stage_category: stage_category ? String(stage_category).slice(0, 80) : undefined,
    status: status || "persisted",
  };
  if (nucleus_id) body.nucleus_id = String(nucleus_id).slice(0, 80);
  if (qualification_state) body.qualification_state = String(qualification_state).slice(0, 40);
  if (conflict_status) body.conflict_status = String(conflict_status).slice(0, 40);
  if (document_intent === "secure_channel_request") {
    body.document_intent = "secure_channel_request";
    body.channel_status = "canal escolhido posteriormente";
  }
  // Payment correlation for paid parameter orders. Never PII: an offer id and a
  // digest. Emitted only after the durable persist succeeded.
  if (correlation_id) body.correlation_id = String(correlation_id).slice(0, 60);
  if (external_reference) body.external_reference = String(external_reference).slice(0, 200);
  if (delivery_business_days) {
    body.delivery_business_days = Number(delivery_business_days);
    body.delivery_clock_starts_at = "form_submitted";
  }
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

const SENSITIVE_LOG_KEY = /(?:^|_)(?:authorization|bearer|cnpj|cpf|email|ip|mail|message|mensagem|name|nome|phone|secret|tel|token|whatsapp|file|arquivo|anexo|document|upload|eicar)(?:_|$)/i;

function redactSensitiveText(value) {
  let text = String(value == null ? "" : value);
  try {
    text = decodeURIComponent(text);
  } catch {
    // Keep malformed percent-encoding printable, then apply the same guards.
  }
  return text
    .replaceAll(EICAR_SIGNATURE, "[redacted]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted]")
    .replace(/\b\d{3}[.-]?\d{3}[.-]?\d{3}-?\d{2}\b/g, "[redacted]")
    .replace(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/]?\d{4}-?\d{2}\b/g, "[redacted]")
    .replace(/(?<![A-Za-z0-9])\+?\s*\(?(?:\d[\s().-]*){10,15}(?![A-Za-z0-9])/g, "[redacted]")
    .replace(/\b(?:Bearer\s+|Basic\s+)[A-Za-z0-9._~+/=-]+/gi, "[redacted]")
    .replace(/t=\d+,v1=[a-f0-9]+/gi, "t=…,v1=[redacted]")
    .replace(/((?:secret|token|password|authorization)[=:]\s*)[^\s,;&]+/gi, "$1[redacted]")
    .slice(0, 160);
}

function sanitizeLogFields(fields) {
  const safe = {};
  for (const [key, value] of Object.entries(fields && typeof fields === "object" ? fields : {})) {
    if (SENSITIVE_LOG_KEY.test(key)) {
      safe[key] = typeof value === "boolean" ? value : "[redacted]";
      continue;
    }
    if (typeof value === "string") safe[key] = redactSensitiveText(value);
    else if (typeof value === "number" || typeof value === "boolean" || value == null) safe[key] = value;
    else safe[key] = "[redacted]";
  }
  return safe;
}

/** Structured log line — defense-in-depth redaction even if a caller errs. */
function safeLog(level, event, fields) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeLogFields(fields),
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
  INTENT_KIND_ALLOWED,
  ATTR_ALLOWLIST,
  ALLOWED_ORIGINS,
  ALLOWED_JOURNEYS,
  looksLikePii,
  sanitizeAttributionValue,
  sanitizeAttributionLocation,
  pickAttribution,
  parseBody,
  looksLikeBinaryPayload,
  rejectFileShape,
  leadHasFilePayload,
  titularExport,
  EICAR_SIGNATURE,
  FILE_FIELD_KEYS,
  isHoneypot,
  nonCatalogAction,
  assertOfferTermsAndPrice,
  assertDeliverableSelection,
  assertLicitacaoQualification,
  assertEightProductQualification,
  assertContractDefenseQualification,
  validateAndNormalize,
  generateLeadId,
  idempotencyKeyFor,
  clientIp,
  technicalFingerprint,
  probeAuthorized,
  originAllowed,
  corsHeaders,
  publicSuccessBody,
  publicErrorBody,
  redactSensitiveText,
  sanitizeLogFields,
  safeLog,
  retentionPolicy,
  clamp,
  normalizePhone,
  normalizeEmail,
  normalizeJourney,
  adaptiveIntake,
};
