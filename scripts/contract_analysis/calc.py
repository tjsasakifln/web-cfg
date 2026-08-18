"""Decimal-only published-value calculations. Never silent float."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN
from typing import Any

QUANTIZE_0001 = Decimal("0.0001")
OFFICIAL_VALOR_GLOBAL = Decimal("719177.48")
OFFICIAL_AREA_M2 = Decimal("4710.00")
OFFICIAL_BRL_PER_M2 = Decimal("152.6916")


def as_decimal(value: Any) -> Decimal:
    text = str(value or "").strip().replace(" ", "").replace(",", ".")
    if not text:
        raise InvalidOperation("empty decimal")
    return Decimal(text)


def published_value_per_area(
    valor_global: Any,
    area_m2: Any,
    *,
    quantize: Decimal = QUANTIZE_0001,
) -> Decimal:
    """valor global publicado ÷ área publicada. Not a benchmark or full cost."""
    result = as_decimal(valor_global) / as_decimal(area_m2)
    return result.quantize(quantize, rounding=ROUND_HALF_EVEN)


def official_brl_per_m2() -> Decimal:
    return published_value_per_area(OFFICIAL_VALOR_GLOBAL, OFFICIAL_AREA_M2)
