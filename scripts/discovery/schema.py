"""Discovery observatory schema: stages, fields, tokens. No I/O."""

from __future__ import annotations

from typing import Any

SCHEMA_ID = "discovery_observatory_v1"
SCHEMA_VERSION = 1
HOST = "confenge.com.br"
CANONICAL_ORIGIN = f"https://{HOST}"

METRIC_STAGES = (
    "ELIGIBILITY",
    "INDEX/APPEARANCE",
    "CITATION",
    "REFERRAL",
    "ENGAGEMENT",
    "LEAD/PIPELINE",
)

INDEX_INTENTS = frozenset({"INDEX", "DO_NOT_INDEX"})
RECOMMENDATIONS = frozenset({"READY_FOR_APPROVED_ASSET", "ADJUST", "STOP"})
CHANGE_STATES = frozenset({"added", "changed", "removed"})
UNKNOWN = "UNKNOWN"

REQUIRED_ASSET_FIELDS = (
    "id",
    "category",
    "canonical",
    "index_intent",
    "http",
    "robots_meta",
    "sitemap",
    "renderability",
    "structured_data_visible",
    "title",
    "description",
    "content_version",
    "method_version",
    "as_of",
    "freshness",
    "correction_owner",
    "google_index_state",
    "bing_index_state",
    "gsc_state",
    "generative_ai_visibility",
    "chatgpt_ai_referrals",
    "authorized_crawler_logs",
    "referring_domains",
    "citations",
    "downstream_attribution",
)

REQUIRED_CATEGORIES = (
    "utility",
    "contract_analysis",
    "market_answer",
    "methodology",
    "author_entity",
    "offer",
    "flagship",
)

# Events that must never be counted in the named target stage.
FORBIDDEN_STAGE_COUNTS = {
    ("bot_hit", "CITATION"),
    ("crawler_hit", "CITATION"),
    ("authorized_crawler_hit", "CITATION"),
    ("impression", "ENGAGEMENT"),
    ("impression", "LEAD/PIPELINE"),
    ("impression", "REFERRAL"),
    ("referral", "LEAD/PIPELINE"),
    ("referral", "CITATION"),
    ("indexnow_receipt", "INDEX/APPEARANCE"),
    ("indexnow_200", "INDEX/APPEARANCE"),
    ("indexnow_202", "INDEX/APPEARANCE"),
}

EVENT_TO_STAGE = {
    "eligibility_defect": "ELIGIBILITY",
    "robots_block": "ELIGIBILITY",
    "canonical_mismatch": "ELIGIBILITY",
    "noindex": "ELIGIBILITY",
    "http_status": "ELIGIBILITY",
    "impression": "INDEX/APPEARANCE",
    "index_state": "INDEX/APPEARANCE",
    "generative_ai_visibility": "INDEX/APPEARANCE",
    "citation": "CITATION",
    "manual_citation_spotcheck": "CITATION",
    "bot_hit": "ELIGIBILITY",
    "crawler_hit": "ELIGIBILITY",
    "authorized_crawler_hit": "ELIGIBILITY",
    "referral": "REFERRAL",
    "chatgpt_referral": "REFERRAL",
    "session": "ENGAGEMENT",
    "engaged_session": "ENGAGEMENT",
    "lead": "LEAD/PIPELINE",
    "qualified_opportunity": "LEAD/PIPELINE",
    "indexnow_receipt": "ELIGIBILITY",
}


class SchemaError(ValueError):
    """Registry or payload failed the discovery contract."""


def require_unknown_if_missing(value: Any) -> Any:
    if value is None or value == "":
        return UNKNOWN
    return value


def validate_recommendation(token: Any) -> str:
    if token not in RECOMMENDATIONS:
        raise SchemaError(f"invalid_recommendation:{token}")
    return str(token)


def validate_index_intent(token: Any) -> str:
    if token not in INDEX_INTENTS:
        raise SchemaError(f"invalid_index_intent:{token}")
    return str(token)


def validate_change_state(token: Any) -> str:
    if token not in CHANGE_STATES:
        raise SchemaError(f"invalid_change_state:{token}")
    return str(token)
