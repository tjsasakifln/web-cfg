"""Live-intelligence acquisition engine (CONFENGE-REVENUE-MULTI-ENGINE-W1).

Fail-closed consumer of the extra-cli `CONFENGE_LIVE_INTELLIGENCE/1.0` contract.
extra-cli DATA_* is never editorial INDEX. `catalog_mode=fixture` and
fixture-claimed-live payloads are labeled test-only and cannot reach
`PUBLISHABLE_INDEX`.

W1 ships Surface A (`/oportunidades/<opportunity_id>/`) as noindex, so the
family declares no entry in `data/organic/public-family-registry.json`.
"""

from __future__ import annotations

CONTRACT_DOC_REL = "docs/contracts/confenge-live-intelligence-v1.json"
LIVE_SCHEMA = "CONFENGE_LIVE_INTELLIGENCE/1.0"
FIXTURE_SCHEMA = "confenge-live-intelligence-fixture/1.0"
SCHEMA_PREFIX = "CONFENGE_LIVE_INTELLIGENCE/"
CONTRACT_VERSION = "v1.0.0"

OPPORTUNITY_FAMILY = "live-opportunity/1.0"
COMPANY_FAMILY = "company-fit-profile/1.0"

FAMILY_SLUG = "oportunidades"
FAMILY_PATH = f"/{FAMILY_SLUG}/"
ROUTE_FAMILY = "live-opportunity"
ASSET_FAMILY = "oportunidade-publica"
COMPANY_ROUTE_PREFIX = "/analise-cnpj/"

# Editorial states the consumer may reach. W1 stops at PUBLISHABLE_NOINDEX:
# INDEX needs a declared public family and the full editorial gate.
PUBLICATION_STATES = ("REJECT", "HOLD_FOR_DATA", "PUBLISHABLE_NOINDEX", "PUBLISHABLE_INDEX")
DATA_STATES = ("DATA_READY", "DATA_HOLD", "DATA_REJECT")
PRAZO_STATUS = ("ABERTA", "SUSPENSA", "ENCERRADA", "UNKNOWN")
EPISTEMIC_CLASSES = ("FACT", "CALCULATION", "INFERENCE", "UNKNOWN")

SOURCE_OFFICIAL_LIVE = "official_live"
SOURCE_FIXTURE = "test_only_fixture"

# Freshness SLO declared by the contract. `generated_at - source_as_of` beyond
# this window is stale; a missing or unparseable `source_as_of` is not fresh.
MAX_AGE_HOURS = 48

# Lead `intent_kind` values this engine may emit. The server-side allowlist in
# netlify/functions/lib/lead-core.cjs is the authority; this mirror exists so a
# renderer cannot invent a fifth intent.
INTENT_KINDS = (
    "MONITOR_OPPORTUNITY",
    "MONITOR_COMPANY",
    "REQUEST_DEEP_DIVE",
    "REQUEST_HUMAN_REVIEW",
)

# Fixed epistemic boundary rendered on every public live-intelligence surface.
ADHERENCE_DISCLAIMER_PT = (
    "Aderência histórica não é habilitação, capacidade nem recomendação. "
    "Os dados descrevem o histórico público declarado nas fontes citadas e "
    "podem estar incompletos."
)

DEFAULT_FIXTURE_DIR = "data/live_intelligence/fixtures"
# Official producer bundle (SELECT-only input). Distinct from DEFAULT_LIVE_DIR,
# which is the consumer projection output. Absent/invalid/stale official input
# FAIL CLOSED — the fixture catalog is never a silent fallback.
DEFAULT_OFFICIAL_DIR = "data/live_intelligence/official"
DEFAULT_LIVE_DIR = "data/live_intelligence/live"
OPPORTUNITIES_OUT = "opportunities.json"
COMPANIES_OUT = "companies.json"

IDENTITY_PROJECTION_SCHEMA = "CONFENGE_IDENTITY_PROJECTION/1.0"
IDENTITY_PROJECTION_FILE = "identity_projection.json"
