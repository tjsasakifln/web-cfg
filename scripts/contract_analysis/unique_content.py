"""Adversarial unique-content gate.

Question: removing company, agency, municipality and numbers, is the
analysis still substantially different from the others? No → block INDEX.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

# Fail-closed: near-duplicates after entity/number strip cannot INDEX.
JACCARD_DUP_THRESHOLD = 0.62
MIN_DISTINCTIVE_TOKENS = 36

_STOP = frozenset(
    {
        "para",
        "como",
        "esta",
        "este",
        "essa",
        "esse",
        "isso",
        "aqui",
        "quando",
        "onde",
        "porque",
        "pois",
        "ainda",
        "tambem",
        "também",
        "sobre",
        "entre",
        "depois",
        "antes",
        "durante",
        "contra",
        "pelo",
        "pela",
        "pelos",
        "pelas",
        "uma",
        "umas",
        "uns",
        "dos",
        "das",
        "nos",
        "nas",
        "com",
        "sem",
        "sob",
        "que",
        "nao",
        "não",
        "sim",
        "mais",
        "menos",
        "muito",
        "pouco",
        "todo",
        "toda",
        "todos",
        "todas",
        "outro",
        "outra",
        "outros",
        "outras",
        "mesmo",
        "mesma",
        "contrato",
        "publico",
        "público",
        "publica",
        "pública",
        "obra",
        "obras",
        "analise",
        "análise",
        "tecnica",
        "técnica",
        "fonte",
        "fontes",
        "dado",
        "dados",
        "valor",
        "preco",
        "preço",
        "empresa",
        "orgao",
        "órgão",
        "municipio",
        "município",
        "cidade",
        "confenge",
        "pncp",
        "item",
        "itens",
        "linha",
        "linhas",
    }
)

_ENTITY_KEYS = (
    "empresa",
    "contractor",
    "razao_social",
    "razão_social",
    "cnpj",
    "orgao",
    "órgão",
    "agency",
    "municipio",
    "município",
    "city",
    "uf",
    "estado",
    "pncp_id",
    "contract_id",
    "processo",
)


def _fold(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower()


def _entity_values(record: dict[str, Any] | None) -> list[str]:
    if not record:
        return []
    ficha = record.get("ficha") if isinstance(record.get("ficha"), dict) else {}
    values: list[str] = []
    for key in _ENTITY_KEYS:
        for src in (ficha, record):
            val = src.get(key) if isinstance(src, dict) else None
            if val:
                values.append(str(val))
    return values


def strip_entities_and_numbers(text: str, record: dict[str, Any] | None = None) -> str:
    """Remove empresa, órgão, município and numbers from analysis prose."""
    blob = _fold(text)
    for raw in _entity_values(record):
        token = _fold(str(raw))
        if len(token) >= 3:
            blob = blob.replace(token, " ")
    blob = re.sub(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}", " ", blob)
    blob = re.sub(r"r\$\s*[\d.,]+", " ", blob)
    blob = re.sub(r"\d+([.,]\d+)?\s*%", " ", blob)
    blob = re.sub(r"\b(prefeitura municipal de|camara municipal de|governo do estado d[eo])\s+\w+", " ", blob)
    blob = re.sub(r"\b\d+([.,]\d+)?\b", " ", blob)
    blob = re.sub(r"[^a-z\s]", " ", blob)
    return re.sub(r"\s+", " ", blob).strip()


def _analysis_prose(record: dict[str, Any]) -> str:
    parts = [
        str(record.get("title") or ""),
        str(record.get("executive_summary") or ""),
        str(record.get("why_analysis") or ""),
        str(record.get("insight_singular") or ""),
        str(record.get("utility_beyond_source") or ""),
        str(record.get("cannot_conclude") or ""),
        str(record.get("methodology") or ""),
        str(record.get("limitations") or ""),
        str(record.get("body") or ""),
        str(record.get("counterproof") or ""),
        str(record.get("thesis") or ""),
    ]
    for key in ("facts", "calculations", "comparisons", "interpretation"):
        val = record.get(key) or []
        if isinstance(val, list):
            for item in val:
                if isinstance(item, dict):
                    parts.append(str(item.get("text") or ""))
                else:
                    parts.append(str(item))
        else:
            parts.append(str(val))
    return " ".join(parts)


def distinctive_tokens(record: dict[str, Any]) -> frozenset[str]:
    stripped = strip_entities_and_numbers(_analysis_prose(record), record)
    tokens = [
        tok
        for tok in stripped.split()
        if len(tok) >= 4 and tok not in _STOP
    ]
    return frozenset(tokens)


def jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def are_substantially_different(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Adversarial test: after stripping entities/numbers, are they different?"""
    ta = distinctive_tokens(left)
    tb = distinctive_tokens(right)
    if len(ta) < MIN_DISTINCTIVE_TOKENS or len(tb) < MIN_DISTINCTIVE_TOKENS:
        return False
    return jaccard(ta, tb) < JACCARD_DUP_THRESHOLD


def check_unique_content(
    record: dict[str, Any],
    cohort: list[dict[str, Any]] | None = None,
) -> list[str]:
    """Return reason codes. Empty list means unique-content passed."""
    tokens = distinctive_tokens(record)
    errors: list[str] = []
    if len(tokens) < MIN_DISTINCTIVE_TOKENS:
        errors.append("unique_content_too_thin_after_strip")
    rid = str(record.get("id") or record.get("slug") or "")
    for other in cohort or []:
        oid = str(other.get("id") or other.get("slug") or "")
        if other is record or (rid and oid and rid == oid):
            continue
        if not are_substantially_different(record, other):
            errors.append(f"unique_content_near_duplicate:{oid or 'unknown'}")
    return sorted(set(errors))
