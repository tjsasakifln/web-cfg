"""MARKET_ANSWER_VALUE_SCORE/1.0 — versioned, auditable, explainable.

Components: demand, data_quality, answerability, singularity, utility,
freshness, citation_potential, commercial_fit, maintenance_cost.

UNKNOWN demand stays UNKNOWN and is excluded from the weighted total.
The method is a normalized weighted sum over known components, not a
multiplicative black box. extra-cli may supply factual components;
demand / editorial / commercial / index stay in web-cfg.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from scripts.market_answers import SCORE_COMPONENTS, SCORE_VERSION


# Higher weight = more influence. maintenance_cost is inverted at read time
# (higher stored cost → lower contribution).
WEIGHTS: dict[str, float] = {
    "demand": 0.12,
    "data_quality": 0.14,
    "answerability": 0.16,
    "singularity": 0.12,
    "utility": 0.12,
    "freshness": 0.10,
    "citation_potential": 0.08,
    "commercial_fit": 0.10,
    "maintenance_cost": 0.06,
}

UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class ScoreResult:
    version: str
    components: dict[str, float | None]
    weights_used: dict[str, float]
    total: float | None
    reason_codes: tuple[str, ...]
    unknown_components: tuple[str, ...]
    notes: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "components": dict(self.components),
            "weights_used": dict(self.weights_used),
            "total": self.total,
            "reason_codes": list(self.reason_codes),
            "unknown_components": list(self.unknown_components),
            "notes": dict(self.notes),
        }


def _as_score(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, str) and value.strip().upper() == UNKNOWN:
        return None
    if isinstance(value, dict):
        if str(value.get("status") or "").upper() == UNKNOWN:
            return None
        if "score" in value:
            return _as_score(value.get("score"))
        if "value" in value:
            return _as_score(value.get("value"))
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number < 0:
        return 0.0
    if number > 1:
        # Allow 0–100 editorial scales.
        if number <= 100:
            return number / 100.0
        return 1.0
    return number


def _reason_from_block(value: Any, component: str) -> list[str]:
    reasons: list[str] = []
    if isinstance(value, dict):
        raw = value.get("reason_codes") or value.get("reasons") or []
        if isinstance(raw, str):
            raw = [raw]
        for item in raw:
            text = str(item).strip()
            if text:
                reasons.append(text)
        status = str(value.get("status") or "").strip().upper()
        if status == UNKNOWN:
            reasons.append(f"{component}_UNKNOWN")
        note = value.get("note") or value.get("evidence")
        if status == UNKNOWN and not any(code.endswith("_UNKNOWN") for code in reasons):
            reasons.append(f"{component}_UNKNOWN")
        if note and status == UNKNOWN:
            reasons.append(f"{component}_UNKNOWN")
    elif isinstance(value, str) and value.strip().upper() == UNKNOWN:
        reasons.append(f"{component}_UNKNOWN")
    return reasons


def _read_component(record: dict[str, Any], name: str) -> Any:
    block = record.get(name)
    if block is not None:
        return block
    scores = record.get("score_components") if isinstance(record.get("score_components"), dict) else {}
    if name in scores:
        return scores[name]
    return None


def score_candidate(record: dict[str, Any], payload: dict[str, Any] | None = None) -> ScoreResult:
    """Produce component scores and reason codes from the candidate record.

    `payload` may override freshness / data_quality when the producer sent
    factual components. It never invents demand.
    """
    components: dict[str, float | None] = {}
    reasons: list[str] = []
    notes: dict[str, str] = {}
    unknown: list[str] = []

    payload = payload or {}
    coverage = payload.get("coverage") if isinstance(payload.get("coverage"), dict) else {}
    freshness = payload.get("freshness") if isinstance(payload.get("freshness"), dict) else {}

    for name in SCORE_COMPONENTS:
        raw = _read_component(record, name)
        if name == "demand":
            # Demand is never inferred from payload volume or page ambition.
            value = _as_score(raw)
            reasons.extend(_reason_from_block(raw, name))
            if value is None:
                components[name] = None
                unknown.append(name)
                if f"{name}_UNKNOWN" not in reasons:
                    reasons.append(f"{name}_UNKNOWN")
                notes[name] = "Demand stays UNKNOWN until observed GSC/search evidence exists."
            else:
                components[name] = value
                if value >= 0.6:
                    reasons.append("demand_observed")
                else:
                    reasons.append("demand_weak")
            continue

        if name == "data_quality" and payload:
            producer = payload.get("data_quality")
            if producer is not None:
                raw = producer
            elif coverage.get("status"):
                status = str(coverage.get("status")).upper()
                raw = {
                    "score": 0.7 if status == "SUFFICIENT" else 0.35,
                    "reason_codes": list(coverage.get("reason_codes") or [f"coverage_{status.lower()}"]),
                    "note": f"coverage.status={status}",
                }
        if name == "freshness" and payload:
            producer = payload.get("freshness_score")
            if producer is not None:
                raw = producer
            elif freshness:
                status = str(freshness.get("status") or "").upper()
                if status in {"STALE", "STALE_FOR_INDEX", "EXPIRED"}:
                    raw = {
                        "score": 0.2,
                        "reason_codes": ["freshness_stale"],
                        "note": status,
                    }
                elif status in {"FRESH", "CURRENT"}:
                    raw = {
                        "score": 0.85,
                        "reason_codes": ["freshness_current"],
                        "note": status,
                    }

        value = _as_score(raw)
        reasons.extend(_reason_from_block(raw, name))
        if value is None:
            components[name] = None
            unknown.append(name)
            if f"{name}_UNKNOWN" not in reasons:
                reasons.append(f"{name}_UNKNOWN")
            continue
        if name == "maintenance_cost":
            # Stored as cost (higher = worse). Contribution is inverted.
            contrib = 1.0 - value
            components[name] = contrib
            notes[name] = "maintenance_cost inverted (higher cost lowers contribution)"
            if value >= 0.7:
                reasons.append("maintenance_cost_high")
            else:
                reasons.append("maintenance_cost_acceptable")
        else:
            components[name] = value
            if value >= 0.6:
                reasons.append(f"{name}_sufficient")
            else:
                reasons.append(f"{name}_weak")

    weights_used: dict[str, float] = {}
    weighted = 0.0
    weight_sum = 0.0
    for name, value in components.items():
        if value is None:
            continue
        weight = WEIGHTS[name]
        weights_used[name] = weight
        weighted += value * weight
        weight_sum += weight
    total = round(weighted / weight_sum, 4) if weight_sum else None

    # Deduplicate reason codes while keeping order.
    seen: set[str] = set()
    ordered: list[str] = []
    for code in reasons:
        if code not in seen:
            seen.add(code)
            ordered.append(code)

    return ScoreResult(
        version=SCORE_VERSION,
        components=components,
        weights_used=weights_used,
        total=total,
        reason_codes=tuple(ordered),
        unknown_components=tuple(unknown),
        notes=notes,
    )
