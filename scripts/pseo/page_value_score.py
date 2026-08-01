"""Multidimensional page_value_score — does not override semantic gates.

Score is advisory for ranking Wave candidates. Mandatory semantic fails still
block publish regardless of score magnitude.
"""

from __future__ import annotations

from typing import Any

# Weights sum to 100
WEIGHTS = {
    "icp_adherence": 12,
    "commercial_intent": 10,
    "demand_evidence": 8,
    "sample_sufficiency": 10,
    "classification_confidence": 8,
    "comparability": 6,
    "freshness": 6,
    "differentiation_vs_pncp": 10,
    "analysis_exclusivity": 6,
    "executive_answer_strength": 6,
    "service_link": 5,
    "conversion_potential": 5,
    "anti_cannibalization": 4,
    "anti_scaled_thin": 2,
    "temporal_stability": 2,
}


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def compute_page_value_score(
    *,
    page_type: str,
    observation_count: int = 0,
    unique_buyers: int = 0,
    unique_suppliers: int = 0,
    temporal_span_days: int = 0,
    classification_confidence: float = 0.8,
    demand_evidence: str = "unknown",  # gsc | analytics | unknown
    demand_strength: float = 0.0,
    freshness_ok: bool = True,
    has_executive_numbers: bool = True,
    has_service_cta: bool = True,
    differentiation_signals: int = 0,
    cannibal_risk: float = 0.0,
    thin_content_risk: float = 0.0,
    icp_fit: float = 0.8,
    intent_clarity: float = 0.8,
    mandatory_fail: list[str] | None = None,
) -> dict[str, Any]:
    """Return score 0–100 + component breakdown. mandatory_fail blocks publish."""
    fails = list(mandatory_fail or [])

    # Sample sufficiency by type
    if page_type == "market":
        sample = _clamp01(observation_count / 30.0) * 0.6 + _clamp01(unique_buyers / 8.0) * 0.4
    elif page_type == "price":
        sample = _clamp01(observation_count / 25.0) * 0.5 + _clamp01(unique_buyers / 5.0) * 0.5
    elif page_type == "radar":
        sample = _clamp01(observation_count / 8.0)
    elif page_type == "agency":
        sample = _clamp01(observation_count / 20.0) * 0.6 + _clamp01(unique_suppliers / 5.0) * 0.4
    elif page_type == "competition":
        sample = _clamp01(observation_count / 20.0) * 0.5 + _clamp01(unique_suppliers / 8.0) * 0.5
    else:
        sample = _clamp01(observation_count / 15.0)

    demand = demand_strength if demand_evidence != "unknown" else 0.35
    comps = {
        "icp_adherence": _clamp01(icp_fit),
        "commercial_intent": _clamp01(intent_clarity),
        "demand_evidence": _clamp01(demand),
        "sample_sufficiency": sample,
        "classification_confidence": _clamp01(classification_confidence),
        "comparability": _clamp01(min(unique_buyers, unique_suppliers) / 5.0)
        if unique_buyers and unique_suppliers
        else _clamp01(observation_count / 20.0),
        "freshness": 1.0 if freshness_ok else 0.3,
        "differentiation_vs_pncp": _clamp01(0.4 + 0.15 * differentiation_signals),
        "analysis_exclusivity": _clamp01(0.3 + 0.1 * differentiation_signals),
        "executive_answer_strength": 1.0 if has_executive_numbers else 0.2,
        "service_link": 1.0 if has_service_cta else 0.0,
        "conversion_potential": _clamp01(
            (1.0 if has_service_cta else 0.3) * (0.7 + 0.3 * intent_clarity)
        ),
        "anti_cannibalization": _clamp01(1.0 - cannibal_risk),
        "anti_scaled_thin": _clamp01(1.0 - thin_content_risk),
        "temporal_stability": _clamp01(temporal_span_days / 180.0)
        if temporal_span_days
        else 0.5,
    }
    breakdown = {k: int(round(comps[k] * WEIGHTS[k])) for k in WEIGHTS}
    total = int(sum(breakdown.values()))
    total = max(0, min(100, total))

    # Semantic gates cannot be compensated
    publish_blocked_by_gates = bool(fails)
    quality_band = "reject"
    if not fails:
        if total >= 80:
            quality_band = "eligible"
        elif total >= 65:
            quality_band = "review"
        else:
            quality_band = "weak"

    return {
        "page_value_score": total,
        "breakdown": breakdown,
        "weights": dict(WEIGHTS),
        "quality_band": quality_band,
        "mandatory_fail": fails,
        "publish_blocked_by_semantic_gates": publish_blocked_by_gates,
        "demand_evidence": demand_evidence,
        "note": (
            "page_value_score ranks candidates; it never overrides semantic gates "
            "or human editorial approval."
        ),
    }


def score_from_candidate_dict(c: dict[str, Any]) -> dict[str, Any]:
    ref = c.get("data_ref") or {}
    sm = ref.get("sample_metrics") or {}
    return compute_page_value_score(
        page_type=str(c.get("page_type") or "market"),
        observation_count=int(c.get("observation_count") or sm.get("primary_contract_count") or 0),
        unique_buyers=int(sm.get("unique_buyer_count") or ref.get("buyer_count") or 0),
        unique_suppliers=int(sm.get("unique_supplier_count") or ref.get("supplier_count") or 0),
        temporal_span_days=int(sm.get("temporal_span_days") or 0),
        demand_evidence=str(c.get("demand_evidence") or "unknown"),
        demand_strength=float(c.get("demand_strength") or 0),
        has_service_cta=bool(c.get("cta_label")),
        has_executive_numbers=int(c.get("observation_count") or 0) > 0,
        differentiation_signals=3 if c.get("page_type") in {"market", "price", "competition"} else 2,
        mandatory_fail=list(c.get("mandatory_fail") or []),
        icp_fit=0.85,
        intent_clarity=0.85,
    )
