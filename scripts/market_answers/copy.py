"""Visitor-facing copy for the paving Market Answer.

Santa Catarina is the only published live claim. Surfaces that a reader
or crawler would treat as the answer (title, H1, pergunta, resumo, meta,
OpenGraph, JSON-LD, breadcrumbs, first fold, labels) are generated here
so the gate can scan the same strings the renderer emits.
"""

from __future__ import annotations

import re
from typing import Any

from scripts.market_answers import CANONICAL, QUESTION_TEXT, SITE
from scripts.market_answers.urls import geography_ufs


SC_QUESTION = (
    "Qual é o valor típico dos contratos públicos de pavimentação em Santa Catarina?"
)
RECORTE_QUESTION = (
    "Qual é o valor típico dos contratos públicos de pavimentação no recorte publicado?"
)
NATIONAL_CLAIM_RE = re.compile(
    r"\bbrasil\b|mercado\s+brasileiro|m[eé]dia\s+nacional|\bnacional\b",
    re.IGNORECASE,
)
SC_MARKERS = ("santa catarina", " sc")


def _text(value: Any) -> str:
    return str(value or "").strip()


def brl(value: Any) -> str:
    if value is None:
        return "n/d"
    number = float(value)
    formatted = f"{number:,.0f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {formatted}"


def format_n(payload: dict[str, Any]) -> str:
    stats = payload.get("statistics") if isinstance(payload.get("statistics"), dict) else {}
    n = stats.get("n")
    try:
        return str(int(n))
    except (TypeError, ValueError):
        return "n/d"


def period_label(payload: dict[str, Any]) -> str:
    period = payload.get("period") if isinstance(payload.get("period"), dict) else {}
    return _text(period.get("label")) or (
        f"{period.get('start') or ''}–{period.get('end') or ''}".strip("–")
    )


def geography_dict(payload: dict[str, Any]) -> dict[str, Any]:
    geo = payload.get("geography") if isinstance(payload.get("geography"), dict) else {}
    return geo


def is_sc_uf_payload(payload: dict[str, Any]) -> bool:
    geo = geography_dict(payload)
    kind = _text(geo.get("kind") or geo.get("scope")).lower()
    code = _text(geo.get("code")).upper()
    ufs = geography_ufs(payload)
    if kind in {"br", "national", "brasil", "nacional", "country"}:
        return False
    if code in {"BR", "BRASIL"}:
        return False
    if ufs == ["SC"] and code in {"", "SC"}:
        return True
    return kind in {"uf", "state", "estado"} and code == "SC" and (not ufs or ufs == ["SC"])


def geography_label(payload: dict[str, Any]) -> str:
    if is_sc_uf_payload(payload):
        return "Santa Catarina"
    geo = geography_dict(payload)
    label = _text(geo.get("label"))
    if label:
        return label
    ufs = geography_ufs(payload)
    if ufs:
        return ", ".join(ufs)
    return "recorte publicado"


def question_for(payload: dict[str, Any], record: dict[str, Any] | None = None) -> str:
    if is_sc_uf_payload(payload):
        return SC_QUESTION
    record = record or {}
    return _text(record.get("question")) or RECORTE_QUESTION or QUESTION_TEXT


def visible_limitations(payload: dict[str, Any]) -> list[str]:
    """Visitor-facing limits. Never invent strata. Never use national claim words."""
    items: list[str] = [
        "O número é o valor integral nominal do instrumento, não custo por km, m² ou unidade física.",
    ]
    if is_sc_uf_payload(payload):
        items.append(
            "O recorte é exclusivamente de Santa Catarina. Não descreve o país inteiro."
        )
    else:
        items.append(
            f"O recorte publicado é {geography_label(payload)}. Não descreve o país inteiro."
        )
    peer = payload.get("peer_group") if isinstance(payload.get("peer_group"), dict) else {}
    peer_status = _text(peer.get("status")).upper()
    if peer_status in {"NOT_COMPARABLE", "HOLD_FOR_DATA", "UNAVAILABLE", ""}:
        items.append(
            "Comparáveis oficiais permanecem indisponíveis neste recorte. "
            "Não há grupo de pares publicado."
        )
    refs = payload.get("contract_refs")
    if not refs or (isinstance(refs, list) and refs and not isinstance(refs[0], dict)):
        items.append(
            "O drill-down de contratos individuais permanece limitado. "
            "Não há páginas combinatórias por município, órgão ou métrica."
        )
    items.append(
        "A tipologia usa o classificador documental de pavimentação do recorte. "
        "Correspondências por palavra-chave podem misturar escopos de obra."
    )
    items.append(
        "Valores totais não positivos entram em missingness e não entram na amostra útil."
    )
    return items


def coverage_visible(payload: dict[str, Any]) -> str:
    coverage = payload.get("coverage") if isinstance(payload.get("coverage"), dict) else {}
    missing = payload.get("missingness") if isinstance(payload.get("missingness"), dict) else {}
    status = _text(coverage.get("status")) or "n/d"
    n = coverage.get("usable_n") or coverage.get("n")
    total = coverage.get("total_keyword_rows") or missing.get("total_keyword_rows")
    miss = coverage.get("missing_or_nonpositive")
    if miss is None:
        miss = missing.get("unknown_or_nonpositive") or missing.get("usable")
    parts = [f"Cobertura: {status or 'n/d'}"]
    if n is not None:
        parts.append(f"n útil = {n}")
    if total is not None:
        parts.append(f"denominador do recorte = {total}")
    if miss is not None:
        parts.append(f"missingness = {miss}")
    return " · ".join(parts)


def missingness_visible(payload: dict[str, Any]) -> str:
    missing = payload.get("missingness") if isinstance(payload.get("missingness"), dict) else {}
    if not missing:
        return "Missingness: não informado no payload."
    bits = []
    for key, value in missing.items():
        bits.append(f"{key}={value}")
    return "Missingness: " + "; ".join(bits)


def first_fold_copy(payload: dict[str, Any]) -> dict[str, str]:
    stats = payload.get("statistics") if isinstance(payload.get("statistics"), dict) else {}
    geo = geography_label(payload)
    return {
        "answer": (
            f"Em {geo}, o ticket contratual típico de pavimentação "
            f"é {brl(stats.get('median'))} (mediana do valor integral nominal do instrumento)."
        ),
        "range": (
            f"Faixa interquartil: {brl(stats.get('p25'))} (P25) a {brl(stats.get('p75'))} (P75)."
        ),
        "n": f"Amostra: {format_n(payload)} contratos.",
        "period": f"Período: {period_label(payload)}.",
        "geography": f"Geografia: {geo}.",
        "ticket_not_km": (
            "Este número é o valor integral nominal do instrumento, "
            "não custo por km, m² ou unidade."
        ),
    }


def visitor_copy(record: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    fold = first_fold_copy(payload)
    question = question_for(payload, record)
    geo = geography_label(payload)
    breadcrumb = (
        "Valor típico de contratos de pavimentação em Santa Catarina"
        if is_sc_uf_payload(payload)
        else f"Valor típico de contratos de pavimentação ({geo})"
    )
    dataset_name = (
        "Ticket contratual típico de pavimentação em Santa Catarina"
        if is_sc_uf_payload(payload)
        else f"Ticket contratual típico de pavimentação ({geo})"
    )
    method_short = _text(payload.get("method_short") or (payload.get("method") or {}).get("short"))
    if not method_short or NATIONAL_CLAIM_RE.search(method_short):
        method_short = (
            "Mediana e quartis do valor integral nominal do instrumento, "
            f"tipologia de pavimentação, recorte {geo}. Não é custo por km."
        )
    freshness = payload.get("freshness") if isinstance(payload.get("freshness"), dict) else {}
    source_as_of = _text(
        freshness.get("source_as_of") or payload.get("as_of") or freshness.get("as_of")
    )
    validity = (
        f"Política de validade: {_text(freshness.get('policy')) or 'publication-slo'}; "
        f"source_as_of {source_as_of or 'n/d'}; "
        f"max_age_hours {freshness.get('max_age_hours') if freshness.get('max_age_hours') is not None else 48}; "
        f"expires_at {_text(freshness.get('expires_at')) or 'n/d'}."
    )
    resumo = f"{fold['answer']} {fold['range']} {fold['n']} {fold['geography']}"
    description = f"{fold['answer']} {fold['ticket_not_km']}"
    return {
        "question": question,
        "title": f"{question} | CONFENGE",
        "h1": question,
        "resumo": resumo,
        "meta_description": description,
        "og_title": question,
        "og_description": description,
        "og_url": CANONICAL,
        "og_type": "website",
        "og_locale": "pt_BR",
        "og_site_name": "CONFENGE",
        "og_image": f"{SITE}/assets/og-confenge.jpg",
        "json_ld_name": question,
        "json_ld_dataset_name": dataset_name,
        "json_ld_description": description,
        "breadcrumbs": ["Início", "Inteligência", breadcrumb],
        "breadcrumb_current": breadcrumb,
        "first_fold": fold,
        "limitations": visible_limitations(payload),
        "coverage": coverage_visible(payload),
        "missingness": missingness_visible(payload),
        "method_short": method_short,
        "source_as_of": source_as_of,
        "validity_policy": validity,
        "fonte": "Contratos públicos do recorte, leitura SELECT-only do payload official_live.",
        "kicker": f"Market Answer · {geo}",
    }


def editorial_surfaces(record: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Canonical surfaces bound to rendered_content_hash."""
    copy = visitor_copy(record, payload)
    stats = payload.get("statistics") if isinstance(payload.get("statistics"), dict) else {}
    coverage = payload.get("coverage") if isinstance(payload.get("coverage"), dict) else {}
    missing = payload.get("missingness") if isinstance(payload.get("missingness"), dict) else {}
    freshness = payload.get("freshness") if isinstance(payload.get("freshness"), dict) else {}
    geo = geography_dict(payload)
    return {
        "question": copy["question"],
        "title": copy["title"],
        "h1": copy["h1"],
        "resumo": copy["resumo"],
        "meta_description": copy["meta_description"],
        "og_title": copy["og_title"],
        "og_description": copy["og_description"],
        "json_ld_name": copy["json_ld_name"],
        "json_ld_dataset_name": copy["json_ld_dataset_name"],
        "json_ld_description": copy["json_ld_description"],
        "breadcrumbs": copy["breadcrumbs"],
        "first_fold": copy["first_fold"],
        "limitations": copy["limitations"],
        "coverage_visible": copy["coverage"],
        "missingness_visible": copy["missingness"],
        "method_short": copy["method_short"],
        "fonte": copy["fonte"],
        "period": period_label(payload),
        "n": stats.get("n"),
        "p25": stats.get("p25"),
        "median": stats.get("median"),
        "p75": stats.get("p75"),
        "as_of": payload.get("as_of"),
        "source_as_of": freshness.get("source_as_of") or payload.get("as_of"),
        "coverage_status": coverage.get("status"),
        "coverage_n": coverage.get("usable_n") or coverage.get("n"),
        "missingness": missing,
        "method_id": payload.get("method_id"),
        "schema": payload.get("schema"),
        "geography_kind": geo.get("kind") or geo.get("scope"),
        "geography_code": geo.get("code"),
        "grain": payload.get("grain"),
    }


def national_claim_hits(text: str) -> list[str]:
    found: list[str] = []
    for match in NATIONAL_CLAIM_RE.finditer(text or ""):
        token = match.group(0).lower()
        if token not in found:
            found.append(token)
    return found


def surfaces_claim_national(surfaces: dict[str, Any]) -> list[str]:
    """Scan visitor surfaces. Payload internals are not visitor copy."""
    blobs: list[str] = []
    for key in (
        "question",
        "title",
        "h1",
        "resumo",
        "meta_description",
        "og_title",
        "og_description",
        "json_ld_name",
        "json_ld_dataset_name",
        "json_ld_description",
        "method_short",
        "fonte",
        "kicker",
        "breadcrumb_current",
    ):
        blobs.append(_text(surfaces.get(key)))
    fold = surfaces.get("first_fold") if isinstance(surfaces.get("first_fold"), dict) else {}
    blobs.extend(_text(value) for value in fold.values())
    crumbs = surfaces.get("breadcrumbs") or []
    blobs.extend(_text(item) for item in crumbs)
    for item in surfaces.get("limitations") or []:
        blobs.append(_text(item))
    hits: list[str] = []
    for blob in blobs:
        for token in national_claim_hits(blob):
            if token not in hits:
                hits.append(token)
    return hits


def surfaces_name_santa_catarina(surfaces: dict[str, Any]) -> bool:
    required = (
        "question",
        "title",
        "h1",
        "resumo",
        "meta_description",
        "og_title",
        "og_description",
        "json_ld_name",
        "json_ld_dataset_name",
        "breadcrumb_current",
    )
    for key in required:
        blob = _text(surfaces.get(key)).lower()
        if "santa catarina" not in blob and not re.search(r"\bsc\b", blob):
            return False
    crumbs = " ".join(_text(item) for item in (surfaces.get("breadcrumbs") or [])).lower()
    if "santa catarina" not in crumbs and not re.search(r"\bsc\b", crumbs):
        return False
    fold = surfaces.get("first_fold") if isinstance(surfaces.get("first_fold"), dict) else {}
    geo = _text(fold.get("geography")).lower()
    answer = _text(fold.get("answer")).lower()
    if "santa catarina" not in geo and not re.search(r"\bsc\b", geo):
        return False
    if "santa catarina" not in answer and not re.search(r"\bsc\b", answer):
        return False
    return True
