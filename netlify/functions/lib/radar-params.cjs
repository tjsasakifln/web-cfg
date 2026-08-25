/**
 * Radar Decisorio de Licitacoes AEC - Edicao Avulsa (R$ 599).
 *
 * Purchase parameters collected at the moment of purchase. Pure module:
 * no I/O, no provider calls, no URLs, no secrets.
 *
 * Policy invariants enforced here:
 *  1) Required fields are validated server-side, never only in the browser.
 *  2) The payment correlation is `cfg:{offer_id}:{correlation_id}` and is the
 *     only value that may be written to Asaas `externalReference`.
 *  3) The delivery clock starts when the form is submitted, not when the
 *     payment is confirmed.
 *  4) The number of opportunities is never promised: it follows the tenders
 *     published in the requested cut at search time.
 *  5) No personal datum from the form is analytics-safe. `analyticsShape()` is
 *     the only projection allowed to leave the server for measurement.
 */
const crypto = require("crypto");
const { validateCnpj, normalizeCnpj } = require("../../../scripts/conversion/cnpj.cjs");

/** Stage marker that turns a lead submission into a Radar parameter order. */
const RADAR_ESTAGIO = "radar-decisorio-parametros";

/**
 * Owner-approved non-catalog action identity for the R$ 599 adapted report.
 * Lives in docs/contracts/intent-action/intent-action-matrix.v1.json; it is
 * deliberately NOT a frozen catalog SKU (data/offers/catalog.snapshot.json).
 */
const RADAR_OFFER_ID = "handraise-report-intelligence-599-v1";
const RADAR_AMOUNT_CENTS = 59900;
const RADAR_CURRENCY = "BRL";

/** Delivery clock. Starts at a valid form submission, never at payment confirmation. */
const DELIVERY_CLOCK = Object.freeze({
  business_days: 3,
  starts_at: "form_submitted",
  never_starts_at: "payment_confirmed",
});

/** Opportunity count is market-dependent and is never promised. */
const OPPORTUNITY_COUNT_RULE = "published_availability_in_scope_at_search_time";

/** Construction segments, using the vocabulary already published in the reports. */
const SEGMENTS = Object.freeze([
  { id: "edificacoes-publicas", label: "Edificações públicas" },
  { id: "pavimentacao-infraestrutura-viaria", label: "Pavimentação e infraestrutura viária" },
  { id: "saneamento-hidraulica", label: "Saneamento e hidráulica" },
  { id: "manutencao-predial-engenharia", label: "Manutenção predial e serviços de engenharia" },
]);
const SEGMENT_IDS = Object.freeze(SEGMENTS.map((s) => s.id));
const MAX_SEGMENTS = SEGMENT_IDS.length;

const UFS = Object.freeze([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
]);

/** Geographic cut: a base city with a radius, or a whole state. */
const CUTS = Object.freeze(["cidade_base", "uf"]);

const MIN_RADIUS_KM = 10;
const MAX_RADIUS_KM = 1000;
const MIN_PORTFOLIO_CHARS = 40;
const MAX_PORTFOLIO_CHARS = 2000;
const MAX_CITY_CHARS = 120;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function text(raw, max) {
  if (raw == null) return "";
  return String(raw).replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function deny(error, message, field) {
  return { ok: false, status: 422, error, message, field };
}

function normalizeSegments(raw) {
  let list = raw;
  if (typeof list === "string") list = list.split(",");
  if (!Array.isArray(list)) list = list == null ? [] : [list];
  const out = [];
  for (const item of list) {
    const id = text(item, 80).toLowerCase();
    if (!id) continue;
    if (!SEGMENT_IDS.includes(id)) return { ok: false, invalid: id };
    if (!out.includes(id)) out.push(id);
  }
  return { ok: true, segments: out };
}

function normalizeDeliveryEmail(raw) {
  const value = text(raw, 180).toLowerCase();
  if (!value) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value : "";
}

/** True when the payload is (or is trying to be) a Radar parameter order. */
function isRadarSubmission(data) {
  if (!data || typeof data !== "object") return false;
  const stage = text(data.estagio || data.tipo_demanda || data.demand_type, 120).toLowerCase();
  if (stage === RADAR_ESTAGIO) return true;
  return Boolean(
    data.radar_recorte
      || data.radar_segmentos
      || data.radar_acervo_tecnico
      || data.radar_email_entrega
      || data.radar_raio_km
      || data.radar_cidade_base,
  );
}

/**
 * Server-side validation of the Radar purchase parameters. Fail-closed:
 * anything missing or outside the published vocabulary is refused, and the
 * caller must not let the visitor reach the payment step.
 */
function validateRadarParams(data) {
  const source = data || {};

  const cnpjCheck = validateCnpj(source.cnpj || source.cnpj14);
  if (!cnpjCheck.ok) {
    return deny("radar_cnpj_invalid", "Informe um CNPJ válido da empresa contratante.", "cnpj");
  }

  const cut = text(source.radar_recorte || source.recorte, 40).toLowerCase();
  if (!CUTS.includes(cut)) {
    return deny("radar_recorte_invalid", "Escolha o recorte geográfico: cidade-base ou UF.", "radar_recorte");
  }

  const uf = text(source.radar_uf || source.uf, 2).toUpperCase();
  if (!UFS.includes(uf)) {
    return deny("radar_uf_invalid", "Informe a UF do recorte.", "radar_uf");
  }

  let city = "";
  let radiusKm = null;
  if (cut === "cidade_base") {
    city = text(source.radar_cidade_base || source.cidade_base, MAX_CITY_CHARS);
    if (city.length < 2) {
      return deny("radar_cidade_base_required", "Informe a cidade-base do recorte.", "radar_cidade_base");
    }
    const rawRadius = source.radar_raio_km == null ? source.raio_km : source.radar_raio_km;
    const radiusText = text(rawRadius, 8);
    if (!/^\d{1,8}$/.test(radiusText)) {
      return deny("radar_raio_km_required", "Informe o raio em km a partir da cidade-base.", "radar_raio_km");
    }
    const parsed = Number(radiusText);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return deny("radar_raio_km_required", "Informe o raio em km a partir da cidade-base.", "radar_raio_km");
    }
    if (parsed < MIN_RADIUS_KM || parsed > MAX_RADIUS_KM) {
      return deny(
        "radar_raio_km_out_of_range",
        `O raio deve ficar entre ${MIN_RADIUS_KM} km e ${MAX_RADIUS_KM} km.`,
        "radar_raio_km",
      );
    }
    radiusKm = parsed;
  }

  const segCheck = normalizeSegments(source.radar_segmentos || source.segmentos);
  if (!segCheck.ok) {
    return deny("radar_segmento_unknown", "Segmento de obra fora do vocabulário publicado.", "radar_segmentos");
  }
  if (!segCheck.segments.length) {
    return deny("radar_segmentos_required", "Escolha pelo menos um segmento de obra.", "radar_segmentos");
  }
  if (segCheck.segments.length > MAX_SEGMENTS) {
    return deny("radar_segmentos_excess", "Selecione no máximo os segmentos publicados.", "radar_segmentos");
  }

  const portfolio = text(source.radar_acervo_tecnico || source.acervo_tecnico, MAX_PORTFOLIO_CHARS);
  if (portfolio.length < MIN_PORTFOLIO_CHARS) {
    return deny(
      "radar_acervo_tecnico_required",
      `Descreva o acervo técnico com pelo menos ${MIN_PORTFOLIO_CHARS} caracteres.`,
      "radar_acervo_tecnico",
    );
  }

  const deliveryEmail = normalizeDeliveryEmail(source.radar_email_entrega || source.email_entrega);
  if (!deliveryEmail) {
    return deny("radar_email_entrega_invalid", "Informe um e-mail válido para entrega do PDF.", "radar_email_entrega");
  }

  return {
    ok: true,
    params: {
      schema: "confenge.radar-decisorio-params/1.0",
      offer_id: RADAR_OFFER_ID,
      amount_cents: RADAR_AMOUNT_CENTS,
      currency: RADAR_CURRENCY,
      cnpj: cnpjCheck.cnpj,
      recorte: cut,
      uf,
      cidade_base: city || null,
      raio_km: radiusKm,
      segmentos: segCheck.segments,
      acervo_tecnico: portfolio,
      email_entrega: deliveryEmail,
      delivery_clock: { ...DELIVERY_CLOCK },
      opportunity_count_rule: OPPORTUNITY_COUNT_RULE,
      opportunity_count_promised: false,
    },
  };
}

/**
 * Deterministic correlation id. The same idempotency key always yields the
 * same value, so a retried submission reconciles against the same payment.
 */
function correlationIdFor(seed) {
  return crypto
    .createHash("sha256")
    .update(`cfg-radar-correlation|${String(seed == null ? "" : seed)}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * `externalReference` policy lives in scripts/offers/external-reference.cjs so
 * the provider write and this form path can never drift apart.
 */
const {
  EXTERNAL_REFERENCE_MAX,
  buildExternalReference,
  parseExternalReference,
} = require("../../../scripts/offers/external-reference.cjs");

/**
 * Non-PII projection. The CNPJ, the portfolio text and the delivery e-mail
 * never appear: only shape, vocabulary and geography class.
 */
function analyticsShape(params) {
  if (!params) return null;
  return {
    offer_id: params.offer_id,
    recorte: params.recorte,
    uf: params.uf,
    raio_km: params.raio_km,
    segmentos: Array.isArray(params.segmentos) ? params.segmentos.slice() : [],
    acervo_tecnico_len: String(params.acervo_tecnico || "").length,
    has_cidade_base: Boolean(params.cidade_base),
    delivery_business_days: DELIVERY_CLOCK.business_days,
    opportunity_count_promised: false,
  };
}

module.exports = {
  RADAR_ESTAGIO,
  RADAR_OFFER_ID,
  RADAR_AMOUNT_CENTS,
  RADAR_CURRENCY,
  DELIVERY_CLOCK,
  OPPORTUNITY_COUNT_RULE,
  SEGMENTS,
  SEGMENT_IDS,
  UFS,
  CUTS,
  MIN_RADIUS_KM,
  MAX_RADIUS_KM,
  MIN_PORTFOLIO_CHARS,
  MAX_PORTFOLIO_CHARS,
  EXTERNAL_REFERENCE_MAX,
  isRadarSubmission,
  validateRadarParams,
  correlationIdFor,
  buildExternalReference,
  parseExternalReference,
  analyticsShape,
  normalizeCnpj,
};
