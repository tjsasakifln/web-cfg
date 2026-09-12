"""Independent quantity arithmetic for the infrastructure demonstrative.

This module reads the declared source and recomputes area, volumes, pipe length,
invert mismatch and geometric slopes with its own Decimal helpers. Dual control
forbids loading the generator quantity module from here.
"""

from __future__ import annotations

import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

Q2 = Decimal("0.01")
Q4 = Decimal("0.0001")


def _D(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _q2(value: Any) -> Decimal:
    return _D(value).quantize(Q2, rounding=ROUND_HALF_UP)


def _q4(value: Any) -> Decimal:
    return _D(value).quantize(Q4, rounding=ROUND_HALF_UP)


def _money(value: Any) -> Decimal:
    return _q2(value)


def load_source_file(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("source must be an object")
    return payload


def _el(source: dict[str, Any], element_id: str) -> dict[str, Any]:
    for item in source["elements"]:
        if item["id"] == element_id:
            return item
    raise KeyError(element_id)


def compute(source: dict[str, Any]) -> dict[str, Any]:
    """Return expected named totals and quantity map from the source only."""
    pav = _el(source, "PV-01")
    mh1 = _el(source, "MH-01")
    mh2 = _el(source, "MH-02")
    pipe = _el(source, "DR-01")
    length = _q2(_D(pav["station_end_m"]) - _D(pav["station_start_m"]))
    width = _D(pav["width_m"])
    area = _q2(length * width)
    vol_sub = _q2(area * _D(pav["layers"]["subbase_m"]))
    vol_base = _q2(area * _D(pav["layers"]["base_m"]))
    vol_wear = _q2(area * _D(pav["layers"]["wearing_m"]))
    pipe_len = _q2(_D(mh2["station_m"]) - _D(mh1["station_m"]))
    drawn = _D(mh2["invert_drawn_m"])
    sheet_r00 = _D(mh2["invert_spreadsheet_by_revision"]["R00"])
    sheet_r01 = _D(mh2["invert_spreadsheet_by_revision"]["R01"])
    invert_up = _D(mh1["invert_m"])
    grade_drop = _q2(length * _D(pav["longitudinal_slope_m_per_m"]))

    prices = source["prices"]["items"]
    qty = {
        "Q-PAV-01": area,
        "Q-SUB-01": vol_sub,
        "Q-BASE-01": vol_base,
        "Q-CAP-01": vol_wear,
        "Q-TUB-01": pipe_len,
        "Q-PV-01": Decimal("2"),
        "Q-BOC-01": Decimal("1"),
    }
    subtotal = Decimal("0.00")
    amounts = {}
    for spec in source["service_rows"]:
        qid = spec["quantity_id"]
        amount = _money(qty[qid] * _D(prices[qid]))
        amounts[spec["id"]] = amount
        subtotal += amount
    subtotal = _money(subtotal)

    return {
        "pavement_length_m": length,
        "pavement_width_m": _q2(width),
        "pavement_area_m2": area,
        "subbase_m3": vol_sub,
        "base_m3": vol_base,
        "wearing_m3": vol_wear,
        "pipe_length_m": pipe_len,
        "pipe_diameter_mm": _q2(_D(pipe["diameter_mm"])),
        "mh02_invert_drawn_m": _q2(drawn),
        "mh02_invert_sheet_r00_m": _q2(sheet_r00),
        "mh02_invert_sheet_r01_m": _q2(sheet_r01),
        "mh02_mismatch_r00_m": _q2(abs(drawn - sheet_r00)),
        "mh02_mismatch_r01_m": _q2(abs(drawn - sheet_r01)),
        "pipe_slope_drawn_m_per_m": _q4((invert_up - drawn) / pipe_len),
        "pipe_slope_sheet_r00_m_per_m": _q4((invert_up - sheet_r00) / pipe_len),
        "pipe_slope_sheet_r01_m_per_m": _q4((invert_up - sheet_r01) / pipe_len),
        "pavement_grade_drop_m": grade_drop,
        "budget_subtotal_brl": subtotal,
        "quantities": {k: _q2(v) if k not in {"Q-PV-01", "Q-BOC-01"} else v for k, v in qty.items()},
        "amounts": amounts,
        "formulas": {
            "Q-PAV-01": f"{length}*7.00",
            "Q-SUB-01": f"{area}*0.15",
            "Q-BASE-01": f"{area}*0.12",
            "Q-CAP-01": f"{area}*0.04",
            "Q-TUB-01": f"{_q2(_D(mh2['station_m']))}-{_q2(_D(mh1['station_m']))}",
        },
    }
