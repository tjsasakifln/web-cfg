"""Contract-analysis editorial family (#83).

Fail-closed consumer of extra-cli `public-read-contract-analysis/1.0`
plus the publication gate. extra-cli DATA_* is never editorial INDEX.
ANÁLISE TÉCNICA DE CONTRATO PÚBLICO is mutually exclusive with CASO CONFENGE.
"""

from __future__ import annotations

GATE_VERSION = "contract-analysis-publication-gate/1.0"
FAMILY_SLUG = "analises-contratos-publicos"
FAMILY_PATH = f"/{FAMILY_SLUG}/"
CONTENT_CLASS_ANALYSIS = "ANALISE_TECNICA_CONTRATO_PUBLICO"
CONTENT_CLASS_CASE = "CASO_CONFENGE"
ASSET_FAMILY = "analise-tecnica-contrato-publico"
ROUTE_FAMILY = "analise-tecnica-contrato"
PUBLIC_READ_SCHEMA = "public-read-contract-analysis/1.0"
AUTHORITY_HANDOFF_SCHEMA = "authority-handoff-contract-analysis/1.0"
OFFICIAL_LIVE_DOSSIER_SCHEMA = "official-live-authority-dossier/1.0"
ANALYSIS_MODES = ("DOCUMENT_CHAIN", "TIMELINE", "COMPARATIVE")
NON_COMPARATIVE_MODES = ("DOCUMENT_CHAIN", "TIMELINE")
TEMPORAL_FIELDS = (
    "event_effective_at",
    "source_published_at",
    "retrieved_at",
    "verified_at",
    "source_as_of",
)
OWNER_CONDITIONAL_TOKEN = "OWNER_CONDITIONAL_APPROVAL_CONTRACT_ANALYSIS_CANARY_2026_08_17"
OWNER_CONDITIONAL_APPROVER = "OWNER_CONFENGE_CONDITIONAL"
OWNER_QUALITY_MIN = 88
OWNER_DIMENSION_MIN = 75
MAX_INDEX_PAGES = 1
PUBLICATION_STATES = (
    "REJECT",
    "HOLD_FOR_DATA",
    "EDITORIAL_REVIEW",
    "PUBLISHABLE_NOINDEX",
    "PUBLISHABLE_INDEX",
)
DATA_STATES = ("DATA_READY", "DATA_HOLD", "DATA_REJECT")
INDEX_CONDITIONS = (
    "data_readiness",
    "insight_singular",
    "conteudo_substancial",
    "utilidade_alem_da_fonte",
    "source_provenance",
    "freshness",
    "method_limitations",
    "author_reviewer",
    "reputational_safety",
    "maintenance_owner",
    "intent_plausivel",
    "unique_content",
)
MAX_CANARY = 10
MASTERPIECE_EVAL_CAP = 5
MASTERPIECE_WRITE_CAP = 3
SOURCE_OFFICIAL_LIVE = "official_live"
SOURCE_FIXTURE = "test_only_fixture"
QUALITY_VERSION = "authority-content-quality/1.0"
