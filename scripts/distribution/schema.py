"""Earned-distribution schema: required fields, classes, outcomes.

Pure validation. No I/O, no network, no send.
"""

from __future__ import annotations

from typing import Any

SCHEMA_ID = "earned_distribution_v1"
SCHEMA_VERSION = 1

ALLOWED_TARGET_CLASSES = frozenset(
    {
        "imprensa",
        "associação",
        "parceiro",
        "comunidade",
        "especialista",
    }
)

ALLOWED_OUTCOMES = frozenset(
    {
        "contacted/manual",
        "mentioned",
        "linked",
        "reused",
        "partner intro",
        "assisted lead",
        "UNKNOWN",
    }
)

# Verbatim required keys on every target row.
REQUIRED_TARGET_FIELDS = (
    "target_class",
    "target_nominal",
    "editorial_angle",
    "citation_url",
    "owner",
    "outcome",
    "source",
    "date",
)

REQUIRED_NONEMPTY_TEXT_FIELDS = (
    "editorial_angle",
    "citation_url",
    "owner",
    "source",
    "date",
)

INHERITED_TYPE_TO_CLASS = {
    "associacao": "associação",
    "sindicato": "associação",
    "portal_engenharia": "imprensa",
    "portal_licitacoes": "imprensa",
    "newsletter": "imprensa",
    "jornalista": "imprensa",
    "especialista": "especialista",
    "comunidade": "comunidade",
}

FORBIDDEN_KPI_KEYS = frozenset(
    {
        "backlink_target_count",
        "backlink_count",
        "target_count",
        "contact_count",
        "outreach_count",
    }
)

NAMED_METRICS = (
    "qualified_mentions",
    "relevant_referring_domains",
    "reuse",
    "branded_direct_lift",
    "assisted_qco_pipeline",
)


class SchemaError(ValueError):
    """Registry or row failed the earned-distribution contract."""


def validate_target_row(row: Any) -> dict[str, Any]:
    if not isinstance(row, dict):
        raise SchemaError("target_row_must_be_object")
    missing = [field for field in REQUIRED_TARGET_FIELDS if field not in row]
    if missing:
        raise SchemaError("missing_required_fields:" + ",".join(missing))
    target_class = row["target_class"]
    if target_class not in ALLOWED_TARGET_CLASSES:
        raise SchemaError(f"invalid_target_class:{target_class}")
    outcome = row["outcome"]
    if outcome not in ALLOWED_OUTCOMES:
        raise SchemaError(f"invalid_outcome:{outcome}")
    for field in REQUIRED_NONEMPTY_TEXT_FIELDS:
        value = row[field]
        if not isinstance(value, str) or not value.strip():
            raise SchemaError(f"empty_required_field:{field}")
    nominal = row["target_nominal"]
    if nominal is not None and (not isinstance(nominal, str) or not nominal.strip()):
        raise SchemaError("invalid_target_nominal")
    return row


def validate_outcome(token: Any) -> str:
    if token not in ALLOWED_OUTCOMES:
        raise SchemaError(f"invalid_outcome:{token}")
    return str(token)


def require_auto_send_false(registry: dict[str, Any]) -> None:
    if registry.get("auto_send") is not False:
        raise SchemaError("auto_send_must_be_false")
