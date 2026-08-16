/**
 * Conversion attribution keep-list. Extra fields the frozen lead-core
 * pickAttribution / mapLeadToInboundV1 drop stay here for the adapter.
 */
const CONVERSION_ATTR_KEEP = [
  "asset_family",
  "market_answer_id",
  "analysis_id",
  "intent",
  "question_class",
  "asset_version",
  "method_version",
  "schema_version",
  "cta",
  "cta_id",
  "source",
  "referrer",
  "drill_down_origin",
  "correlation_id",
  "idempotency_key",
  "public_entity_id",
  "public_contract_id",
  "consent_state",
  "handoff_status",
  "route_family",
  "asset_id",
  "landing_page",
  "landing_url",
  "evidence_pack_version",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];

/** Present on inbound v1 today via frozen mapper. */
const INBOUND_V1_KEEPS = new Set([
  "asset_family",
  "analysis_id",
  "cta_id",
  "source",
  "referrer",
  "correlation_id",
  "public_entity_id",
  "public_contract_id",
  "route_family",
  "asset_id",
  "landing_url",
  "evidence_pack_version",
]);

/** Frozen pickAttribution allowlist intersection (lead-core ATTR_ALLOWLIST). */
const LEAD_CORE_PICKS = new Set([
  "asset_family",
  "analysis_id",
  "intent",
  "cta_id",
  "referrer",
  "correlation_id",
  "route_family",
  "asset_id",
  "landing_page",
  "landing_url",
  "evidence_pack_version",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

function clamp(value, max) {
  const s = String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function pickConversionAttribution(src) {
  const data = src && typeof src === "object" ? src : {};
  const out = {};
  for (const key of CONVERSION_ATTR_KEEP) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    if (data[key] == null || data[key] === "") continue;
    const v = clamp(data[key], 180);
    if (v) out[key] = v;
  }
  if (!out.source) out.source = "CONFENGE_WEB";
  return out;
}

function fieldsDroppedByLeadCore(attr) {
  return Object.keys(attr).filter((k) => !LEAD_CORE_PICKS.has(k));
}

function fieldsDroppedByInboundV1(attr) {
  return Object.keys(attr).filter((k) => !INBOUND_V1_KEEPS.has(k) && k !== "source");
}

function defaultCanaryAttribution(overrides = {}) {
  return pickConversionAttribution({
    asset_family: "market_answer",
    market_answer_id: "ma-pavimentacao-valor-tipico-v0",
    intent: "ver_propria_empresa",
    question_class: "company_self_view",
    asset_version: "conversion-canary/1.0",
    method_version: "b2g-xray-fixture/0.1",
    schema_version: "public-read-b2g-xray/0.1-draft",
    cta: "Veja sua empresa neste mercado",
    cta_id: "veja-sua-empresa-neste-mercado",
    source: "CONFENGE_WEB",
    drill_down_origin: "answer_to_xray",
    route_family: "market-answer-xray",
    asset_id: "ma-pavimentacao-valor-tipico-v0",
    landing_page: "/piloto/conversion-market-answer/",
    landing_url: "https://confenge.com.br/piloto/conversion-market-answer/",
    consent_state: "not_required",
    ...overrides,
  });
}

function attributionComplete(attr) {
  const required = [
    "asset_family",
    "market_answer_id",
    "intent",
    "question_class",
    "asset_version",
    "method_version",
    "schema_version",
    "cta",
    "source",
    "drill_down_origin",
    "correlation_id",
    "idempotency_key",
    "consent_state",
  ];
  const missing = required.filter((k) => !attr || !attr[k]);
  return { ok: missing.length === 0, missing };
}

module.exports = {
  CONVERSION_ATTR_KEEP,
  INBOUND_V1_KEEPS,
  LEAD_CORE_PICKS,
  pickConversionAttribution,
  fieldsDroppedByLeadCore,
  fieldsDroppedByInboundV1,
  defaultCanaryAttribution,
  attributionComplete,
};
