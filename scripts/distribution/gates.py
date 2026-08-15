"""Kill gates for earned distribution.

Utility, fit, and non-response are pure functions over dicts.
Absence of a reply is never scored as causal failure.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from scripts.distribution.schema import validate_target_row

UTILITY_FAIL_VERDICTS = frozenset(
    {"NEEDS_DATA", "REJECT", "DO_NOT_DISTRIBUTE"}
)

GENERIC_HOSTS = frozenset(
    {
        "linkedin.com",
        "www.linkedin.com",
        "www.gov.br",
        "gov.br",
    }
)


@dataclass(frozen=True)
class GateResult:
    allow: bool
    code: str
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {"allow": self.allow, "code": self.code, "reason": self.reason}


def evaluate_utility(asset: dict[str, Any]) -> GateResult:
    """Ativo sem utilidade → não distribuir."""
    if not isinstance(asset, dict):
        return GateResult(False, "no_utility", "asset_missing")
    if asset.get("needs_data") is True:
        return GateResult(False, "no_utility", "NEEDS_DATA")
    verdict = str(asset.get("verdict") or "")
    if verdict in UTILITY_FAIL_VERDICTS:
        return GateResult(False, "no_utility", verdict)
    if asset.get("do_not_index") is True:
        return GateResult(False, "no_utility", "do_not_index")
    if asset.get("press_allowed") is False:
        return GateResult(False, "no_utility", "press_not_allowed")
    if asset.get("indexable") is False:
        return GateResult(False, "no_utility", "not_indexable")
    utility = asset.get("utility") if isinstance(asset.get("utility"), dict) else {}
    if utility.get("distinct_user_utility") is not True:
        return GateResult(False, "no_utility", "no_distinct_user_utility")
    if utility.get("invented_national_contract_stats") is True:
        return GateResult(False, "no_utility", "invented_national_stats")
    canonical = str(asset.get("canonical_url") or "").strip()
    if not canonical:
        return GateResult(False, "no_utility", "no_canonical_url")
    primitives = asset.get("citation_primitives")
    if not isinstance(primitives, dict) or not primitives.get("stable_citation_link"):
        return GateResult(False, "no_utility", "no_stable_citation_link")
    return GateResult(True, "utility_ok", "distinct_utility_with_provenance")


def _generic_host(url: str) -> bool:
    if not url:
        return False
    host = (urlparse(url).hostname or "").lower()
    return host in GENERIC_HOSTS


def evaluate_fit(target: dict[str, Any], asset: dict[str, Any] | None = None) -> GateResult:
    """Target sem fit → não contatar."""
    del asset  # reserved for asset-specific recorte checks
    validate_target_row(target)
    if target.get("fit") is False:
        return GateResult(
            False,
            "no_fit",
            str(target.get("fit_reason") or "target_sem_fit"),
        )
    if not target.get("target_nominal"):
        return GateResult(False, "no_fit", "nominal_not_publicly_identifiable")
    if target.get("fit") is not True:
        return GateResult(False, "no_fit", "fit_not_asserted")
    if _generic_host(str(target.get("public_url") or "")):
        return GateResult(False, "no_fit", "generic_or_non_editorial_host")
    return GateResult(True, "fit", str(target.get("fit_reason") or "editorial_fit"))


def interpret_non_response() -> dict[str, Any]:
    """Ausência de resposta ≠ failure causal."""
    return {
        "causal_failure": False,
        "outcome": "UNKNOWN",
        "rule": "ausencia_de_resposta_nao_e_failure_causal",
        "note": "No reply is not a causal failure and does not mint a failure outcome.",
    }
