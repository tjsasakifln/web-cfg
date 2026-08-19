"""Fail-closed checks for cláusulas 12.2/12.3 on official PDF page text."""

from __future__ import annotations

from typing import Any

CLAUSE_12_2 = "interregno de um ano"
CLAUSE_12_3_INDEX = "Índice Nacional da Construção Civil"
CLAUSE_12_3_COLUMN = "Coluna 35"
CLAUSE_12_3_PUBLISHER = "Fundação Getúlio Vargas"


def clause_hits(page_text: str) -> dict[str, bool]:
    blob = page_text or ""
    return {
        "has_12_2": "12.2" in blob,
        "has_12_3": "12.3" in blob,
        "has_interregno": CLAUSE_12_2 in blob,
        "has_incc": CLAUSE_12_3_INDEX in blob,
        "has_coluna_35": CLAUSE_12_3_COLUMN in blob,
        "has_fgv": CLAUSE_12_3_PUBLISHER in blob,
    }


def pages_14_15_contain_cited_clauses(pages: dict[Any, str]) -> tuple[bool, list[str]]:
    """Require pages 14–15 of the official PDF to carry the cited cláusulas."""
    reasons: list[str] = []
    page14 = pages.get(14) or pages.get("14") or ""
    page15 = pages.get(15) or pages.get("15") or ""
    if not page14.strip():
        reasons.append("page_14_absent")
    if not page15.strip():
        reasons.append("page_15_absent")
    hits14 = clause_hits(page14)
    if not (hits14["has_12_2"] and hits14["has_interregno"]):
        reasons.append("page_14_missing_clause_12_2")
    if not (hits14["has_12_3"] and hits14["has_incc"] and hits14["has_coluna_35"] and hits14["has_fgv"]):
        reasons.append("page_14_missing_clause_12_3")
    if "reajuste" not in page15.lower():
        reasons.append("page_15_missing_reajuste_continuation")
    return not reasons, reasons
