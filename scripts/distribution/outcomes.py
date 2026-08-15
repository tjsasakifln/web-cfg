"""Outcome tokens for earned distribution. Unobserved stays UNKNOWN."""

from __future__ import annotations

from typing import Any

from scripts.distribution.schema import ALLOWED_OUTCOMES, SchemaError, validate_outcome

UNOBSERVED_DEFAULT = "UNKNOWN"


def observed_or_unknown(token: Any) -> str:
    if token is None or token == "":
        return UNOBSERVED_DEFAULT
    return validate_outcome(token)


def reject_invented_success(token: str, evidence: Any) -> str:
    """Mentions, links, reuse, leads and pipeline stay UNKNOWN without evidence."""
    if token in {"mentioned", "linked", "reused", "partner intro", "assisted lead"}:
        if not evidence:
            raise SchemaError(f"unobserved_must_remain_unknown:{token}")
    return validate_outcome(token)


def allowed_outcome_list() -> list[str]:
    return sorted(ALLOWED_OUTCOMES)
