"""Machine-checkable kill conditions. Fire from registered fields only."""

from __future__ import annotations

from typing import Any

from scripts.paid_search.schema import DEFAULT_KILL_THRESHOLDS, KILL_SPECS


def _num(value: Any) -> float:
    if value in (None, "", False):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def evaluate_kill_conditions(kill_doc: dict[str, Any] | None) -> dict[str, Any]:
    doc = kill_doc or {}
    observed = dict(DEFAULT_KILL_THRESHOLDS)
    observed.update(doc.get("thresholds") or {})
    observed.update(doc.get("observed") or {})
    # Allow a flat observation object (tests pass registered fields directly).
    for key in (
        "spend_brl",
        "hard_stop_spend_brl",
        "qualified_intent_signals",
        "search_term_mismatch_rate",
        "search_terms_observed",
        "valid_leads",
        "qualified_lead_rate",
        "tracking_reconcile_ok",
        *DEFAULT_KILL_THRESHOLDS,
    ):
        if key in doc and key not in (doc.get("observed") or {}):
            observed[key] = doc[key]

    fired: list[dict[str, Any]] = []

    cap = observed.get("hard_stop_spend_brl")
    if cap not in (None, "", 0, "0") and _num(observed.get("spend_brl")) >= _num(cap):
        if _num(observed.get("qualified_intent_signals")) <= 0:
            fired.append(
                {
                    "id": "cap_without_qualified_intent",
                    "action": "PAUSE",
                    "fields": {
                        "spend_brl": observed.get("spend_brl"),
                        "hard_stop_spend_brl": cap,
                        "qualified_intent_signals": observed.get("qualified_intent_signals"),
                    },
                }
            )

    mismatch = _num(observed.get("search_term_mismatch_rate"))
    terms = _num(observed.get("search_terms_observed"))
    if terms >= _num(observed.get("mismatch_min_terms")) and mismatch >= _num(
        observed.get("mismatch_rate_threshold")
    ):
        fired.append(
            {
                "id": "misaligned_search_terms",
                "action": "PAUSE",
                "fields": {
                    "search_term_mismatch_rate": mismatch,
                    "search_terms_observed": terms,
                    "mismatch_rate_threshold": observed.get("mismatch_rate_threshold"),
                    "mismatch_min_terms": observed.get("mismatch_min_terms"),
                },
            }
        )

    valid = _num(observed.get("valid_leads"))
    qrate = _num(observed.get("qualified_lead_rate"))
    if valid >= _num(observed.get("quality_min_valid_leads")) and qrate < _num(
        observed.get("quality_rate_threshold")
    ):
        fired.append(
            {
                "id": "low_lead_quality",
                "action": "PAUSE",
                "fields": {
                    "valid_leads": valid,
                    "qualified_lead_rate": qrate,
                    "quality_min_valid_leads": observed.get("quality_min_valid_leads"),
                    "quality_rate_threshold": observed.get("quality_rate_threshold"),
                },
            }
        )

    reconcile = observed.get("tracking_reconcile_ok")
    if reconcile is False or str(reconcile).lower() == "false":
        fired.append(
            {
                "id": "tracking_does_not_reconcile",
                "action": "PAUSE",
                "fields": {"tracking_reconcile_ok": reconcile},
            }
        )

    return {
        "specs": [dict(spec) for spec in KILL_SPECS],
        "fired": fired,
        "should_pause": bool(fired),
        "observed": {
            key: observed.get(key)
            for key in (
                "spend_brl",
                "hard_stop_spend_brl",
                "qualified_intent_signals",
                "search_term_mismatch_rate",
                "search_terms_observed",
                "valid_leads",
                "qualified_lead_rate",
                "tracking_reconcile_ok",
            )
        },
    }
