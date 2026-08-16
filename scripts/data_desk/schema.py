"""Data Desk schema: package fields, request states, syndication slots."""

from __future__ import annotations

from typing import Any

SCHEMA_ID = "data_desk_asset_v1"
PACKAGE_SCHEMA = "data_desk_package_v1"
REQUEST_SCHEMA = "data_desk_request_contract_v1"
SYNDICATION_SCHEMA = "data_desk_syndication_v1"
WATERMARK = "FIXTURE_ONLY"

REQUEST_STATES = frozenset({"FULFILLED", "DECLINED", "NEEDS_SCOPE", "UNKNOWN"})
SYNDICATION_TARGET_COUNT = 5
SYNDICATION_STATUSES = frozenset({"PREPARED", "NAMED", "SENT_MANUAL", "DECLINED", "UNKNOWN"})

REQUIRED_PACKAGE_FIELDS = (
    "permalink",
    "canonical",
    "citation_text",
    "method_version",
    "schema_version",
    "data_version",
    "as_of",
    "coverage",
    "limitations",
    "correction_link",
    "creator",
    "publisher",
    "license",
    "usage_guidance",
    "identifier",
    "provenance",
    "package_hash",
    "package_version",
)

SENSITIVE_KEYS = frozenset(
    {
        "cpf",
        "rg",
        "cnpj_raw",
        "phone",
        "telefone",
        "email_list",
        "raw_rows",
        "datalake",
        "producer_rows",
        "national_candidate_inventory",
        "public_read_v1_internals",
        "password",
        "secret",
        "ssn",
    }
)

MIN_REQUEST_FIELDS = (
    "finalidade",
    "organization",
    "role",
    "consent",
    "prazo",
    "correlation_id",
    "attribution",
)

FORBIDDEN_REQUEST_FIELDS = frozenset(
    {
        "cpf",
        "rg",
        "personal_phone",
        "home_address",
        "date_of_birth",
        "raw_document",
        "contract_scan",
    }
)


class SchemaError(ValueError):
    """Data Desk payload failed its contract."""


def validate_request_state(token: Any) -> str:
    if token not in REQUEST_STATES:
        raise SchemaError(f"invalid_request_state:{token}")
    return str(token)
