"""Mutually exclusive content-class contract for #83 / #74.

ANÁLISE TÉCNICA DE CONTRATO PÚBLICO is independent editorial of a public
source. CASO CONFENGE requires real atuação, consent and proof gates.
The two classes never share schema, copy or CTA that would imply the other.
"""

from __future__ import annotations

import json
import re
from typing import Any

from scripts.contract_analysis import CONTENT_CLASS_ANALYSIS, CONTENT_CLASS_CASE

ANALYSIS_LABEL_PT = "Análise técnica de contrato público"
CASE_LABEL_PT = "Caso CONFENGE"

DISCLAIMER_PT = (
    "Esta é uma análise técnica editorial independente de fonte pública. "
    "Não implica relação comercial da CONFENGE com o órgão, o contratado "
    "ou qualquer parte, e não é um caso CONFENGE."
)

# Visible / structured-data tokens that collapse the analysis into a case,
# customer-success story or Review. Matching any of these on an analysis
# is a taxonomy failure (REJECT), not a soft warning.
_FORBIDDEN_ANALYSIS_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\bcasestudy\b", "taxonomy_casestudy"),
    (r"\bcase\s*study\b", "taxonomy_case_study"),
    (r"\bcustomer\s*success\b", "taxonomy_customer_success"),
    (r"\baggregaterating\b", "taxonomy_aggregate_rating"),
    (r"\"@type\"\s*:\s*\"review\"", "taxonomy_schema_review"),
    (r"\"@type\"\s*:\s*\"casestudy\"", "taxonomy_schema_casestudy"),
    (r"\bcaso\s+confenge\b", "taxonomy_caso_confenge_label"),
    (r"\bcase\s+de\s+cliente\b", "taxonomy_case_de_cliente"),
    (r"\bcliente\s+da\s+confenge\b", "taxonomy_cliente_confenge"),
    (r"\bnosso\s+cliente\b", "taxonomy_nosso_cliente"),
    (r"\batua[cç][aã]o\s+da\s+confenge\s+neste\s+contrato\b", "taxonomy_atuacao_neste_contrato"),
    (r"\batuamos\s+(neste|nesse|no)\s+contrato\b", "taxonomy_atuamos_neste_contrato"),
    (r"\bentregamos\s+(para|a)\s+(este|esse)\s+cliente\b", "taxonomy_entregamos_cliente"),
    (r"\bprova\s+de\s+cliente\b", "taxonomy_prova_de_cliente"),
    (r"\bsucesso\s+do\s+cliente\b", "taxonomy_sucesso_cliente"),
)

_ANALYSIS_CLASS_ALIASES = {
    CONTENT_CLASS_ANALYSIS,
    "analise_tecnica_contrato_publico",
    "análise técnica de contrato público",
    "analise tecnica de contrato publico",
}
_CASE_CLASS_ALIASES = {
    CONTENT_CLASS_CASE,
    "caso_confenge",
    "caso confenge",
}


def normalize_content_class(raw: Any) -> str | None:
    text = re.sub(r"\s+", " ", str(raw or "")).strip().lower()
    if not text:
        return None
    folded = (
        text.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ã", "a")
        .replace("ç", "c")
    )
    if text in {a.lower() for a in _ANALYSIS_CLASS_ALIASES} or folded.replace(" ", "_") in {
        "analise_tecnica_contrato_publico"
    }:
        return CONTENT_CLASS_ANALYSIS
    if text in {a.lower() for a in _CASE_CLASS_ALIASES} or folded.replace(" ", "_") == "caso_confenge":
        return CONTENT_CLASS_CASE
    return None


def _blob(record: dict[str, Any], extra_text: str = "", extra_schema: Any = None) -> str:
    parts = [
        str(record.get("title") or ""),
        str(record.get("executive_summary") or ""),
        str(record.get("why_analysis") or ""),
        str(record.get("insight_singular") or ""),
        str(record.get("utility_beyond_source") or ""),
        str(record.get("cta_label") or ""),
        str((record.get("cta") or {}).get("label") or ""),
        str((record.get("cta") or {}).get("text") or ""),
        extra_text,
    ]
    for key in ("interpretation", "facts", "cannot_conclude"):
        val = record.get(key)
        if isinstance(val, list):
            for item in val:
                if isinstance(item, dict):
                    parts.append(str(item.get("text") or ""))
                else:
                    parts.append(str(item))
        elif val:
            parts.append(str(val))
    schema = extra_schema if extra_schema is not None else record.get("schema") or record.get("jsonld")
    if schema:
        try:
            parts.append(json.dumps(schema, ensure_ascii=False).lower())
        except (TypeError, ValueError):
            parts.append(str(schema).lower())
    return " ".join(parts).lower()


def check_taxonomy(
    record: dict[str, Any],
    *,
    rendered_html: str = "",
    schema: Any = None,
) -> list[str]:
    """Return reason codes. Empty list means the record is a valid analysis class."""
    errors: list[str] = []
    declared = normalize_content_class(record.get("content_class"))
    if declared == CONTENT_CLASS_CASE:
        errors.append("taxonomy_declared_caso_confenge")
    elif declared is None:
        errors.append("taxonomy_content_class_missing_or_unknown")
    elif declared != CONTENT_CLASS_ANALYSIS:
        errors.append("taxonomy_content_class_not_analysis")

    blob = _blob(record, extra_text=rendered_html, extra_schema=schema)
    negation_before = re.compile(
        r"(n[aã]o(\s+\w+){0,6}|nem(\s+\w+){0,4}|sem|nunca|jamais)\s*$",
        re.I,
    )
    for pattern, code in _FORBIDDEN_ANALYSIS_PATTERNS:
        for match in re.finditer(pattern, blob, flags=re.I):
            window = blob[max(0, match.start() - 80) : match.start()]
            if negation_before.search(window):
                continue
            errors.append(code)
            break
    return sorted(set(errors))


def analysis_disclaimer() -> str:
    return DISCLAIMER_PT


def analysis_label() -> str:
    return ANALYSIS_LABEL_PT
