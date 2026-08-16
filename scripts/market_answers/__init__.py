"""Public Market Answer Engine (#84) — one paving-ticket canary.

SELECT-only consumer of the expected extra-cli Goal 03 payload. extra-cli
never authorizes INDEX. A CONTRACT_FIXTURE is previewable and cannot become
PUBLISHABLE_INDEX.
"""

from __future__ import annotations

SCHEMA_ID = "public-read-market-answer/1.0"
CONTRACT_VERSION = "v1.0.0"
SCORE_VERSION = "MARKET_ANSWER_VALUE_SCORE/1.0"
GATE_VERSION = "market-answer-publication-gate/1.0"
FAMILY_SLUG = "valor-tipico-contratos-pavimentacao"
FAMILY_PATH = f"/inteligencia/{FAMILY_SLUG}/"
ASSET_ID = FAMILY_SLUG
ASSET_FAMILY = "market-answer"
ROUTE_FAMILY = "market-answer"
QUESTION_ID = "valor-tipico-contratos-pavimentacao"
QUESTION_TEXT = "Qual é o valor típico dos contratos públicos de pavimentação?"
TYPOLOGY_ID = "pavimentacao-infraestrutura-viaria"
METHOD_ID = "ticket-integral-nominal-quartiles/1.0"
GRAIN = "valor_integral_nominal"
GRAIN_LABEL = "valor integral nominal do instrumento"
SITE = "https://confenge.com.br"
CANONICAL = f"{SITE}{FAMILY_PATH}"
SOURCE = "CONFENGE_WEB"

PUBLICATION_STATES = (
    "REJECT",
    "NEEDS_DATA",
    "PRIVATE_ANSWER_ONLY",
    "CANDIDATE",
    "EDITORIAL_REVIEW",
    "PUBLISHABLE_NOINDEX",
    "PUBLISHABLE_INDEX",
)

RECOMMENDATIONS = (
    "GO_NOINDEX",
    "NEEDS_DATA",
    "REJECT",
    "READY_FOR_OFFICIAL_PAYLOAD",
)

PRODUCER_STATUS_FIXTURE = "CONTRACT_FIXTURE"
SOURCE_OFFICIAL_LIVE = "official_live"
SOURCE_FIXTURE = "fixture"

CLAIM_AUTHORIZED = "AUTHORIZED"
CLAIM_UNAUTHORIZED = "UNAUTHORIZED"
CLAIM_STALE = "STALE"
CLAIM_FIXTURE = "FIXTURE_NOT_AUTHORIZABLE"

SCORE_COMPONENTS = (
    "demand",
    "data_quality",
    "answerability",
    "singularity",
    "utility",
    "freshness",
    "citation_potential",
    "commercial_fit",
    "maintenance_cost",
)

INDEX_CONDITIONS = (
    "official_live",
    "claim_authorized",
    "coverage_sufficient",
    "freshness_current",
    "method_present",
    "limitations_present",
    "answerability",
    "singular_substance",
    "canonical_robots_sitemap_schema",
    "attribution",
    "refresh_owner",
    "human_approval_hash",
    "not_fixture",
    "grain_ticket_not_km",
    "no_national_claim_without_coverage",
)

FORBIDDEN_GRAINS = frozenset(
    {
        "custo_por_km",
        "custo/km",
        "preco_por_km",
        "preço_por_km",
        "unit_price",
        "preco_unitario",
        "preço_unitário",
    }
)

PII_EVENT_KEYS = frozenset(
    {
        "nome",
        "name",
        "email",
        "telefone",
        "phone",
        "tel",
        "whatsapp",
        "empresa",
        "company",
        "mensagem",
        "message",
        "cpf",
        "cnpj",
        "documento",
        "document",
        "query",
        "q",
        "search_query",
    }
)

DEFAULT_CANDIDATE = "data/editorial/market-answers/candidates/valor-tipico-contratos-pavimentacao.v1.json"
DEFAULT_FIXTURE = "data/editorial/market-answers/fixtures/contract-fixture.v1.json"
DEFAULT_APPROVALS = "data/editorial/market-answers/approvals.json"
DEFAULT_LIVE = "data/extra-cli/public-read-market-answer/1.0/export.json"
PAGE_DIR = f"inteligencia/{FAMILY_SLUG}"
STATUS_STEM = "MARKET_ANSWER_CANARY_STATUS"

__all__ = [
    "ASSET_FAMILY",
    "ASSET_ID",
    "CANONICAL",
    "FAMILY_PATH",
    "GATE_VERSION",
    "GRAIN",
    "INDEX_CONDITIONS",
    "PUBLICATION_STATES",
    "QUESTION_ID",
    "QUESTION_TEXT",
    "SCHEMA_ID",
    "SCORE_COMPONENTS",
    "SCORE_VERSION",
]
