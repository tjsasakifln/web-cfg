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
  opportunity_deadline: 10,
  contract_value_band: 24,
  lot_count: 4,
  execution_regime: 40,
  decision_intent: 32,
  offer_id: 80,
  terms_id: 80,
  amount_cents: 16,
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
const DECISION_INTENTS = new Set([
  "avaliar_disputa",
  "avancar",
  "avancar_condicoes",
  "esclarecer_impugnar",
  "recusar",
  "UNKNOWN",
]);

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
  if (
    publicContractId.length < 3 ||
    !isCanonicalIsoDate(deadline) ||
    !CONTRACT_VALUE_BANDS.has(valueBand) ||
    !EXECUTION_REGIMES.has(regime) ||
    !DECISION_INTENTS.has(decisionIntent) ||
    !/^\d{1,3}$/.test(lotRaw) ||
    !Number.isInteger(lotCount) ||
    lotCount < 1 ||
    lotCount > 999 ||
    (deliverableId === "CFG-D12" && businessDaysUntil(deadline) < 5)
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

function looksLikePii(value, key) {
  const s = String(value || "");
  if (!s) return false;
  if (/@/.test(s)) return true;
  if (key === "correlation_id") return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return false;
  if (s.startsWith("c-")) return false;
  const compact = s.replace(/[\s()-]/g, "");
  return /^\+?\d{10,15}$/.test(compact);
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

/**
 * Keep only allowlisted attribution keys. Drops arbitrary query params and PII.
 */
function pickAttribution(data) {
  const src = data && typeof data === "object" ? data : {};
  const out = {};
  for (const key of ATTR_ALLOWLIST) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const max = MAX_FIELD[key] || 180;
    const v = ATTR_LOCATION_KEYS.has(key)
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

  const offerCheck = assertOfferTermsAndPrice(data);
  if (!offerCheck.ok) return offerCheck;
  const deliverableCheck = assertDeliverableSelection(data.deliverable_id);
  if (!deliverableCheck.ok) return deliverableCheck;
  const licitacaoCheck = assertLicitacaoQualification(data, deliverableCheck.deliverable_id);
  if (!licitacaoCheck.ok) return licitacaoCheck;

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
  const telefone = normalizePhone(data.telefone || data.whatsapp || data.phone || data.tel);
  // On a Radar order the delivery e-mail is also the contact channel.
  const email = normalizeEmail(data.email) || (radarParams ? radarParams.email_entrega : "");
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
    analysis_id: sanitizeAttributionValue(data.analysis_id, MAX_FIELD.analysis_id, "analysis_id") || null,
    evidence_pack_version: sanitizeAttributionValue(
      data.evidence_pack_version,
      MAX_FIELD.evidence_pack_version,
      "evidence_pack_version",
    ) || null,
    asset_family: sanitizeAttributionValue(data.asset_family, MAX_FIELD.asset_family, "asset_family") || null,
    query_class: sanitizeAttributionValue(data.query_class, MAX_FIELD.query_class, "query_class") || null,
    deliverable_id: deliverableCheck.deliverable_id,
    opportunity_deadline: licitacaoCheck.qualification?.opportunity_deadline || null,
    contract_value_band: licitacaoCheck.qualification?.contract_value_band || null,
    lot_count: licitacaoCheck.qualification?.lot_count || null,
    execution_regime: licitacaoCheck.qualification?.execution_regime || null,
    decision_intent: licitacaoCheck.qualification?.decision_intent || null,
    turnstile_token: clamp(data["cf-turnstile-response"] || data.turnstile_token, MAX_FIELD.turnstile_token) || null,
    idempotency_key: clamp(data.idempotency_key || data.idempotencyKey, MAX_FIELD.idempotency_key) || null,
    public_contract_id: clamp(data.public_contract_id, MAX_FIELD.public_contract_id) || null,
    public_entity_id: clamp(data.public_entity_id, MAX_FIELD.public_entity_id) || null,
    public_id_slug: clamp(data.public_id_slug, MAX_FIELD.public_id_slug) || null,
    cnpj: clamp(data.cnpj || data.cnpj14, MAX_FIELD.cnpj) || null,
    offer_id: offerCheck.offer_id || null,
    terms_id: offerCheck.terms_id || null,
    radar_params: radarParams,
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
  const material = [
    lead.nome,
    lead.telefone || "",
    lead.email || "",
    lead.jornada,
    lead.estagio,
    radarMaterial,
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
  if (!provided || expected.length < 16) return false;
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
  delivery_business_hours,
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
  // Payment correlation for paid parameter orders. Never PII: an offer id and a
  // digest. Emitted only after the durable persist succeeded.
  if (correlation_id) body.correlation_id = String(correlation_id).slice(0, 60);
  if (external_reference) body.external_reference = String(external_reference).slice(0, 200);
  if (delivery_business_hours) {
    body.delivery_business_hours = Number(delivery_business_hours);
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
  ATTR_ALLOWLIST,
  ALLOWED_ORIGINS,
  ALLOWED_JOURNEYS,
  looksLikePii,
  sanitizeAttributionValue,
  sanitizeAttributionLocation,
  pickAttribution,
  parseBody,
  isHoneypot,
  nonCatalogAction,
  assertOfferTermsAndPrice,
  assertDeliverableSelection,
  assertLicitacaoQualification,
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
  safeLog,
  retentionPolicy,
  clamp,
  normalizePhone,
  normalizeEmail,
  normalizeJourney,
};
