"""Exactly one local-surface decision. This PR never creates a new public URL."""

from __future__ import annotations

from typing import Any

from scripts.local_entity.constants import (
    CAMPAIGN_AS_OF,
    DECISION_STATE,
    EXISTING_SERVICE_PATHS,
    SURFACE_DECISIONS,
)
from scripts.local_entity.graph import invented_type_hits


class SurfaceDecisionError(ValueError):
    """Invalid or multiple surface decisions."""


def decide_surface(
    *,
    classified: dict[str, Any],
    graph: dict[str, Any],
    honesty_errors: list[str] | None = None,
    existing_paths: tuple[str, ...] | list[str] | None = None,
) -> dict[str, Any]:
    """Choose one enum from facts. Invented NAP cannot justify a local landing."""
    if honesty_errors:
        raise SurfaceDecisionError("cannot_decide_on_invented_nap:" + ",".join(honesty_errors))
    hits = invented_type_hits(graph)
    if hits:
        raise SurfaceDecisionError(f"invented_local_types:{sorted(hits)}")

    paths = tuple(existing_paths or EXISTING_SERVICE_PATHS)
    specialist_exists = any("especialista/tiago-jun-sasaki" in p for p in paths)
    service_exists = any(
        p.startswith("/diagnostico") or p.startswith("/diretoria") or p.startswith("/bid-room")
        or p.startswith("/defesa")
        for p in paths
    )

    city_verified = False
    for claim in classified.get("claims") or []:
        if claim.get("field") == "areaServed" and claim.get("status") == "VERIFIED":
            val = claim.get("value")
            if isinstance(val, dict) and str(val.get("@type") or "") in {
                "City",
                "AdministrativeArea",
            }:
                city_verified = True
            if claim.get("id") == "org-areaServed-city" and claim.get("status") == "VERIFIED":
                city_verified = True

    if city_verified:
        token = "REGIONAL_LANDING_CANDIDATE"
        why = (
            "A city-level areaServed claim is third-party VERIFIED. A regional landing remains "
            "a candidate only; this PR still creates no public URL."
        )
    elif specialist_exists or service_exists:
        token = "USE_EXISTING_SERVICE"
        why = (
            "CONFENGE publishes a Person specialist page and national service pages. "
            "There is no public street address and no city-level VERIFIED areaServed. "
            "Entity recognition uses those existing URLs. A city-page farm would add "
            "page count without distinct local utility."
        )
    else:
        token = "NO_LOCAL_SURFACE"
        why = "No existing specialist or service URL is available to carry the entity graph."

    if token not in SURFACE_DECISIONS:
        raise SurfaceDecisionError(f"unknown_decision:{token}")

    return {
        "decision": token,
        "new_public_landing_created": False,
        "decision_state": DECISION_STATE,
        "as_of": CAMPAIGN_AS_OF,
        "existing_surfaces": list(paths),
        "reason": why,
        "rejected_alternatives": {
            "REGIONAL_SECTION_ONLY": (
                "A regional section on existing pages would still need a city-level fact "
                "with distinct visitor utility. DDD 48 is a phone prefix, not that fact."
            ),
            "REGIONAL_LANDING_CANDIDATE": (
                "No city-level VERIFIED areaServed or local dataset justifies a landing. "
                "Candidate status is withheld to avoid city-page farming."
            )
            if token != "REGIONAL_LANDING_CANDIDATE"
            else "Selected only as a candidate; new_public_landing_created stays false.",
            "NO_LOCAL_SURFACE": (
                "Would erase the specialist Person page and national service URLs that already "
                "carry Organization/Person recognition."
            )
            if token != "NO_LOCAL_SURFACE"
            else "Selected because no existing service/specialist URL exists.",
            "USE_EXISTING_SERVICE": "Selected."
            if token == "USE_EXISTING_SERVICE"
            else "Not selected for this graph.",
        },
        "gbp_note": (
            "A future service-area Google Business Profile (address hidden) is a founder "
            "decision outside this PR. It is not a new confenge.com.br URL."
        ),
    }


def assert_single_decision(doc: dict[str, Any]) -> None:
    token = doc.get("decision")
    if token not in SURFACE_DECISIONS:
        raise SurfaceDecisionError(f"decision_not_in_enum:{token}")
    if doc.get("new_public_landing_created") is not False:
        raise SurfaceDecisionError("new_public_landing_created_must_be_false")
    extras = [k for k in SURFACE_DECISIONS if k != token and doc.get(k) is True]
    if extras:
        raise SurfaceDecisionError(f"multiple_decisions:{extras}")
