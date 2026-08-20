"use strict";

const SCHEMA_VERSION = "public-read-integrity/1.0";
const PRODUCER_VERSION = "public-read-integrity-producer/1.0";
const FRESHNESS_POLICY = "public-read-integrity-ttl/1.0";
const CONSUMER_VERSION = "public-read-integrity-consumer/1.0";
const VIEW_SCHEMA = "public-read-integrity-consumer-view/1.0";

const INTEGRITY_STATES = Object.freeze([
  "MATCHES_FOUND",
  "NO_MATCH_CONFIRMED",
  "PARTIAL",
  "UNKNOWN",
]);

const CONTRACTED_SOURCES = Object.freeze(["CEIS", "CNEP"]);

const FRESHNESS_STATUSES = Object.freeze(["current", "stale", "expired"]);

const REDACTED_CNPJ = "[REDACTED_CNPJ]";

const FORBIDDEN_PAYLOAD_FIELDS = Object.freeze([
  "score",
  "risk_score",
  "legal_score",
  "commercial_score",
  "recommendation",
  "legal_conclusion",
  "hire",
  "reject",
  "index",
]);

const PAYLOAD_FIELDS = Object.freeze([
  "schema",
  "schema_version",
  "query_id",
  "queried_cnpj",
  "checked_at",
  "as_of",
  "expires_at",
  "freshness",
  "aggregate_state",
  "sources",
  "records",
  "limitations",
  "reason_codes",
  "not_legal_conclusion",
  "content_hash",
  "producer_version",
  "contracted_sources",
]);

const SOURCE_FIELDS = Object.freeze([
  "source_id",
  "official_url",
  "api_url",
  "authority",
  "status",
  "pages_expected",
  "pages_fetched",
  "coverage_complete",
  "raw_count",
  "normalized_count",
  "deduped_count",
  "reason_codes",
  "as_of",
]);

const RECORD_FIELDS = Object.freeze([
  "source_id",
  "official_id",
  "record_type",
  "authority",
  "start_date",
  "end_date",
  "observed_status",
  "source_url",
  "captured_at",
]);

const ASSET = Object.freeze({
  source: "CONFENGE_WEB",
  asset_family: "public_integrity",
  asset_id: "consulta-ocorrencias-ceis-cnep",
  asset_version: "1.0",
  destination_service_id: "diagnostico-b2g-360",
  cta_id: "diligencia-humana-diagnostico",
  cta_version: "1.0",
  landing_path: "/piloto/consulta-ocorrencias-publicas/",
  result_path: "/piloto/consulta-ocorrencias-publicas/r/",
  intake_path: "/.netlify/functions/public-integrity-consult",
  correction_path: "/correcoes/",
  author: "Eng. Tiago Sasaki",
  reviewer: "Eng. Tiago Sasaki",
});

const FLAG_NAME = "PUBLIC_INTEGRITY_CONSUMER";
const TOKEN_TTL_SECONDS = 3600;
const STORE_TTL_SECONDS = 86400;
const TOKEN_BYTES = 32;

const SOURCE_SPECS = Object.freeze({
  CEIS: {
    source_id: "CEIS",
    official_url: "https://portaldatransparencia.gov.br/sancoes/ceis",
    api_url: "https://api.portaldatransparencia.gov.br/api-de-dados/ceis",
    authority: "Controladoria-Geral da Uniao (CGU) / Portal da Transparencia",
  },
  CNEP: {
    source_id: "CNEP",
    official_url: "https://portaldatransparencia.gov.br/sancoes/cnep",
    api_url: "https://api.portaldatransparencia.gov.br/api-de-dados/cnep",
    authority: "Controladoria-Geral da Uniao (CGU) / Portal da Transparencia",
  },
});

module.exports = {
  SCHEMA_VERSION,
  PRODUCER_VERSION,
  FRESHNESS_POLICY,
  CONSUMER_VERSION,
  VIEW_SCHEMA,
  INTEGRITY_STATES,
  CONTRACTED_SOURCES,
  FRESHNESS_STATUSES,
  REDACTED_CNPJ,
  FORBIDDEN_PAYLOAD_FIELDS,
  PAYLOAD_FIELDS,
  SOURCE_FIELDS,
  RECORD_FIELDS,
  ASSET,
  FLAG_NAME,
  TOKEN_TTL_SECONDS,
  STORE_TTL_SECONDS,
  TOKEN_BYTES,
  SOURCE_SPECS,
};
