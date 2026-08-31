"""Render canary analyses with optional sections and fail-closed SEO."""

from __future__ import annotations

import json
import os
import re
from html import escape
from pathlib import Path
from typing import Any

from scripts.contract_analysis import (
    ASSET_FAMILY,
    AUTHORIZED_CANONICAL_PATH,
    FAMILY_PATH,
    FAMILY_SLUG,
    GATE_VERSION,
    ROUTE_FAMILY,
    SINGULAR_COMPARABLE_REASON,
)
from scripts.contract_analysis.approval import material_hash
from scripts.contract_analysis.attribution import attribution_payload
from scripts.contract_analysis.gate import PublicationDecision
from scripts.contract_analysis.graph import related_assets
from scripts.contract_analysis.taxonomy import ANALYSIS_LABEL_PT, DISCLAIMER_PT
from scripts.pseo.html_shell import (
    ORG_JSONLD,
    PERSON_JSONLD,
    SITE,
    author_box,
    breadcrumb_jsonld,
    breadcrumbs_html,
    e,
    page_shell,
)
from scripts.site.responsive_text import escape_prose_with_opaque_tokens

PUBLIC_DIR = Path(FAMILY_SLUG)
SITEMAP_NAME = "sitemap-analises-contratos.xml"

# One archetype per top-level narrative block of an analysis page. The label
# names the editorial job the block performs, so the archetype and skeleton
# drift gate (data/site/design-system.json → archetype_gated_surfaces) can run
# on this family. Every value here must exist in section_archetypes; a section
# that repeats a neighbour's job changes composition, never its label.
ARCHETYPE_BY_SECTION_ID = {
    "masthead": "analysis_masthead",
    "resumo": "analysis_abstract",
    "por-que": "analysis_relevance",
    "analise": "analysis_argument",
    "ficha": "evidence_record",
    "timeline": "evidence_timeline",
    "fatos": "evidence_claims",
    "calculos": "evidence_calculation",
    "comparacoes": "evidence_comparables",
    "interpretacao": "editorial_interpretation",
    "nao-concluir": "epistemic_boundary",
    "fontes": "source_ledger",
    "metodologia": "method_disclosure",
    "limitacoes": "limitation_notice",
    "manutencao": "maintenance_owner",
    "historico": "update_log",
    "relacionados": "related_assets",
    "proximo-passo": "contextual_next_action",
    "hashes": "provenance_hashes",
    "correcao": "correction_channel",
    "author-box": "author_identity",
}


def archetype_attr(section_id: str) -> str:
    """Rendered ``data-section-archetype`` attribute for a declared section."""
    return f' data-section-archetype="{ARCHETYPE_BY_SECTION_ID[section_id]}"'


# Visible meta and CollectionPage must share this string so discovery
# structured_data_matches_visible does not fail when the hub file exists.
HUB_DESCRIPTION = (
    "Análises editoriais independentes de contratos públicos. Não são casos CONFENGE."
)
AI_DISCLOSURE_HTML = (
    '<p id="ai-disclosure" class="ai-disclosure" data-ai-disclosure="assistive">'
    "Uso de IA: assistência de redação e consistência; o responsável técnico humano "
    "assina o que está publicado. Política: "
    '<a href="/uso-de-ia/">Uso de IA</a>.</p>'
)
HUB_METHOD_HTML = (
    '<section class="section authority-method" id="metodo">'
    "<h2>Método e classe editorial</h2>"
    '<p class="case-badge">ANÁLISE TÉCNICA DE CONTRATO PÚBLICO · NÃO É CASO CONFENGE · NÃO É CASE DE CLIENTE</p>'
    "<p>Método: cada afirmação visível entra numa trilha FACT, CALCULATION, INFERENCE ou UNKNOWN. "
    "Fonte pública, recorte e data de referência acompanham o texto. Sem fonte, o campo permanece UNKNOWN.</p>"
    "<p>Esta família lê instrumentos e registros públicos. A publicação não implica relação comercial "
    "com o órgão, o contratado ou as partes. Não é Caso CONFENGE. Não é customer success. Não é review.</p>"
    "<p>Limitação: não é parecer jurídico, não julga irregularidade e não transforma "
    "“atípico” em “irregular”.</p>"
    f"{AI_DISCLOSURE_HTML}"
    "<p>Como citar: CONFENGE. Análise técnica de contrato público. "
    f"https://confenge.com.br{FAMILY_PATH} (as of 2026-08-16).</p>"
    "</section>"
)
KIND_LABEL = {
    "FACT": "Fato",
    "CALCULATION": "Cálculo",
    "INFERENCE": "Interpretação técnica CONFENGE",
    "INTERPRETACAO": "Interpretação técnica CONFENGE",
    "INTERPRETAÇÃO TÉCNICA CONFENGE": "Interpretação técnica CONFENGE",
    "UNKNOWN": "UNKNOWN",
    "LIMITATION": "Limitação",
    "LIMITACAO": "Limitação",
    "LIMITAÇÃO": "Limitação",
    "COMPARISON": "Comparação",
}


def _root() -> Path:
    env = os.environ.get("CONFENGE_CONTRACT_ANALYSIS_ROOT")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2]


def _text(value: Any) -> str:
    return str(value or "").strip()


def _items(value: Any) -> list[Any]:
    return [item for item in value] if isinstance(value, list) else []


def _iso(value: Any) -> str:
    return _text(value)[:10]


def _fold_name(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").lower()).strip()


DRAFT_AUTHOR = "Rascunho editorial (autoria humana não confirmada)"


def _author_confirmed(record: dict[str, Any]) -> bool:
    if record.get("human_authorship_confirmed") is True:
        return True
    if record.get("editorial_status") == "approved" and record.get("approved_for_index"):
        return True
    return False


def _author_name(record: dict[str, Any]) -> str:
    author = record.get("author")
    if isinstance(author, dict):
        name = _text(author.get("name"))
    else:
        name = _text(author)
    if name:
        if not _author_confirmed(record) and "tiago" in _fold_name(name) and "rascunho" not in _fold_name(name):
            return DRAFT_AUTHOR
        return name
    return DRAFT_AUTHOR


def _reviewer_name(record: dict[str, Any]) -> str:
    reviewer = record.get("reviewer")
    if isinstance(reviewer, dict):
        return _text(reviewer.get("name"))
    return _text(reviewer)


def _canonical_path(slug: str | None = None) -> str:
    if not slug:
        return FAMILY_PATH
    return f"{FAMILY_PATH}{slug.strip('/')}/"


def _paragraphs(text: str) -> str:
    chunks = [chunk.strip() for chunk in re.split(r"\n\s*\n", text or "") if chunk.strip()]
    return "".join(f"<p>{escape_prose_with_opaque_tokens(chunk)}</p>" for chunk in chunks)


def _kind_items(items: list[Any], heading: str, section_id: str) -> str:
    if not items:
        return ""
    lis: list[str] = []
    for item in items:
        if isinstance(item, dict):
            kind = _text(item.get("kind") or item.get("epistemic") or "FACT").upper()
            label = KIND_LABEL.get(kind, kind)
            body = _text(item.get("text"))
            if not body:
                continue
            src = _text(item.get("source_ref") or item.get("url"))
            locator = item.get("locator")
            if isinstance(locator, dict):
                locator = "; ".join(f"{k}={v}" for k, v in locator.items() if v)
            locator_text = _text(locator)
            sha = _text(item.get("sha256") or item.get("content_hash"))
            extras = []
            if src:
                extras.append(f"Fonte: {e(src)}")
            if locator_text:
                extras.append(f"Locator: {e(locator_text)}")
            if sha:
                extras.append(f"SHA-256: <code>{e(sha)}</code>")
            method = _text(item.get("method"))
            result = _text(item.get("result"))
            if method:
                extras.append(f"Método: {e(method)}")
            if result:
                extras.append(f"Resultado: {e(result)}")
            src_html = f' <small>{" · ".join(extras)}</small>' if extras else ""
            lis.append(
                f'<li data-epistemic="{e(kind)}"><span class="ca-kind">{e(label)}</span> '
                f'{escape_prose_with_opaque_tokens(body)}{src_html}</li>'
            )
        else:
            body = _text(item)
            if body:
                lis.append(f"<li>{escape_prose_with_opaque_tokens(body)}</li>")
    if not lis:
        return ""
    return (
        f'<section class="section" id="{e(section_id)}"{archetype_attr(section_id)}>'
        f"<h2>{e(heading)}</h2><ul class=\"ca-list\">{''.join(lis)}</ul></section>"
    )


def _ficha_html(ficha: dict[str, Any]) -> str:
    if not ficha:
        return ""
    rows = []
    labels = (
        ("objeto", "Objeto"),
        ("orgao", "Órgão"),
        ("empresa", "Contratada (fonte pública)"),
        ("municipio", "Município (unidade listada)"),
        ("municipio_unidade_publicada", "Município publicado na unidade"),
        ("municipio_objeto_publicado", "Município publicado no objeto"),
        ("uf", "UF"),
        ("valor_label", "Valor publicado"),
        ("pncp_id", "Identificador público"),
        ("regime", "Regime"),
    )
    for key, label in labels:
        val = _text(ficha.get(key))
        if val:
            rows.append(f"<tr><th scope='row'>{e(label)}</th><td>{e(val)}</td></tr>")
    if not rows:
        return ""
    return (
        f'<section class="section" id="ficha"{archetype_attr("ficha")}><h2>Ficha do contrato</h2>'
        '<div class="table-wrap" role="group" tabindex="0" aria-label="Ficha do contrato"><table class="data-table">'
        f"<tbody>{''.join(rows)}</tbody></table></div>"
        "<p><small>Identificadores vêm da fonte pública. A ficha não afirma "
        "relação comercial da CONFENGE com as partes.</small></p></section>"
    )


def _timeline_html(items: list[Any]) -> str:
    rows = []
    for item in items:
        if not isinstance(item, dict):
            continue
        when = _text(item.get("date") or item.get("when"))
        what = _text(item.get("text") or item.get("label"))
        if when and what:
            rows.append(
                f"<tr><th scope='row'><time datetime='{e(_iso(when))}'>{e(when)}</time></th>"
                f"<td>{escape_prose_with_opaque_tokens(what)}</td></tr>"
            )
    if not rows:
        return ""
    return (
        f'<section class="section" id="timeline"{archetype_attr("timeline")}><h2>Linha do tempo</h2>'
        f'<div class="table-wrap" role="group" tabindex="0" aria-label="Linha do tempo"><table class="data-table"><tbody>{"".join(rows)}</tbody></table></div></section>'
    )


def _sources_html(sources: list[Any]) -> str:
    lis = []
    for src in sources:
        if not isinstance(src, dict):
            continue
        label = _text(src.get("label") or src.get("title") or src.get("url") or src.get("document_id"))
        url = _text(src.get("url"))
        as_of = _iso(src.get("as_of"))
        if not label:
            continue
        link = f'<a href="{e(url)}" rel="noopener noreferrer">{e(label)}</a>' if url else e(label)
        extra = f" · as_of {e(as_of)}" if as_of else ""
        sha = _text(src.get("sha256") or src.get("content_hash"))
        locator = src.get("locator")
        if isinstance(locator, dict):
            locator = "; ".join(f"{k}={v}" for k, v in locator.items() if v)
        locator_text = _text(locator)
        if sha:
            extra += f" · SHA-256 <code>{e(sha)}</code>"
        if locator_text:
            extra += f" · locator {e(locator_text)}"
        lis.append(f"<li>{link}{extra}</li>")
    if not lis:
        return ""
    return (
        f'<section class="section" id="fontes"{archetype_attr("fontes")}><h2>Fontes</h2>'
        f"<ul>{''.join(lis)}</ul></section>"
    )


def _history_html(items: list[Any]) -> str:
    lis = []
    for item in items:
        if isinstance(item, dict):
            when = _iso(item.get("date") or item.get("as_of"))
            note = _text(item.get("text") or item.get("note"))
            if when or note:
                lis.append(f"<li>{e(when)}: {escape_prose_with_opaque_tokens(note)}</li>")
        else:
            note = _text(item)
            if note:
                lis.append(f"<li>{escape_prose_with_opaque_tokens(note)}</li>")
    if not lis:
        return ""
    return (
        f'<section class="section" id="historico"{archetype_attr("historico")}><h2>Histórico de atualização e correção</h2>'
        f"<ul>{''.join(lis)}</ul></section>"
    )


def _cta_html(record: dict[str, Any]) -> str:
    cta = record.get("cta") if isinstance(record.get("cta"), dict) else {}
    label = _text(cta.get("label") or record.get("cta_label"))
    href = _text(cta.get("href") or record.get("cta_href"))
    text = _text(cta.get("text") or record.get("cta_text"))
    if not label or not href:
        return ""
    # Refuse CTAs that collapse the class into a case/client pitch.
    blob = f"{label} {text} {href}".lower()
    if any(tok in blob for tok in ("caso confenge", "case de cliente", "nosso cliente", "case study")):
        return ""
    attr = attribution_payload(record)
    sep = "&" if "?" in href else "?"
    query = "&".join(
        f"{key}={e(val)}"
        for key, val in attr.items()
        if val and key != "correlation_id"
    )
    href_attr = f"{href}{sep}{query}" if query else href
    return (
        f'<section class="section lead-inline" id="proximo-passo"{archetype_attr("proximo-passo")} aria-label="Próximo passo">'
        f"<p>{e(text) if text else 'Se a sua empresa enfrenta um problema semelhante, o caminho é o serviço correspondente — não este contrato.'}</p>"
        f'<p><a class="button button-primary" href="{e(href_attr)}" '
        f'data-analysis-id="{e(attr.get("analysis_id") or "")}" '
        f'data-evidence-pack-version="{e(attr.get("evidence_pack_version") or "")}" '
        f'data-asset-family="{e(attr.get("asset_family") or "")}" '
        f'data-route-family="{e(attr.get("route_family") or "")}" '
        f'data-asset-id="{e(attr.get("asset_id") or "")}" '
        f'data-cta-id="{e(attr.get("cta_id") or "")}" '
        f'data-source="{e(attr.get("source") or "CONFENGE_WEB")}" '
        f'data-destination-service-id="{e(attr.get("destination_service_id") or "")}">{e(label)}</a></p>'
        "</section>"
    )


def _related_html(record: dict[str, Any]) -> str:
    items = related_assets(record)
    if not items:
        return ""
    lis = "".join(f'<li><a href="{e(item["href"])}">{e(item["label"])}</a></li>' for item in items)
    return (
        f'<section class="section" id="relacionados"{archetype_attr("relacionados")}><h2>Ativos úteis relacionados</h2>'
        f"<ul>{lis}</ul>"
        "<p><small>Ligações só apontam para páginas já existentes. "
        "Empresa, órgão ou município não geram URL automática.</small></p></section>"
    )


def _comparisons_html(items: list[Any], record: dict[str, Any] | None = None) -> str:
    rec = record or {}
    available = rec.get("comparable_available")
    consumed = rec.get("comparable_consumed")
    reason = _text(rec.get("comparable_reason"))
    policy = ""
    if available is not None or consumed is not None or reason:
        available_s = "true" if available is True else "false"
        consumed_s = "true" if consumed is True else "false"
        reason_s = reason or SINGULAR_COMPARABLE_REASON
        policy = (
            f'<p data-comparable-available="{e(available_s)}" '
            f'data-comparable-consumed="{e(consumed_s)}" '
            f'data-comparable-reason="{e(reason_s)}">'
            f"comparable_available={e(available_s)} · comparable_consumed={e(consumed_s)} · "
            f"reason={e(reason_s)}. Esta página não consome grupo de pares nem afirma posição na distribuição."
            "</p>"
        )
    not_comp = any(
        isinstance(item, dict) and str(item.get("outcome") or "").upper() == "NOT_COMPARABLE"
        for item in items
    )
    if not items and not policy:
        return ""
    heading = "Comparações" if not not_comp else "Comparações (NOT_COMPARABLE)"
    inner = _kind_items(items, heading, "comparacoes") if items else ""
    if policy and inner:
        inner = inner.replace("</section>", f"{policy}</section>", 1)
        return inner
    if policy and not inner:
        return (
            f'<section class="section" id="comparacoes"{archetype_attr("comparacoes")}>'
            f"<h2>{e(heading)}</h2>{policy}</section>"
        )
    return inner


def build_schema(record: dict[str, Any], decision: PublicationDecision) -> list[dict[str, Any]]:
    path = _canonical_path(decision.slug)
    url = f"{SITE}{path}"
    published = _iso(record.get("date_published") or record.get("as_of"))
    modified = _iso(record.get("date_modified") or record.get("as_of") or published)
    author_name = _author_name(record)
    crumbs = [
        ("Início", "/"),
        (ANALYSIS_LABEL_PT, FAMILY_PATH),
        (_text(record.get("title")) or decision.slug, path),
    ]
    article: dict[str, Any] = {
        "@type": "Article",
        "@id": f"{url}#article",
        "headline": _text(record.get("title")),
        "description": _text(record.get("executive_summary") or record.get("meta_description")),
        "inLanguage": "pt-BR",
        "url": url,
        "mainEntityOfPage": url,
        "datePublished": published,
        "dateModified": modified,
        "author": (
            {"@id": f"{SITE}/#tiago", "name": author_name}
            if _author_confirmed(record) and "rascunho" not in _fold_name(author_name)
            else {"@type": "Organization", "name": author_name}
        ),
        "publisher": {"@id": f"{SITE}/#organization"},
        "about": {
            "@type": "CreativeWork",
            "name": _text((record.get("ficha") or {}).get("objeto") or record.get("title")),
            "description": DISCLAIMER_PT,
        },
    }
    reviewer = _reviewer_name(record)
    if (
        reviewer
        and _author_confirmed(record)
        and _fold_name(reviewer) != _fold_name(author_name)
        and "rascunho" not in _fold_name(author_name)
    ):
        article["reviewedBy"] = {"@type": "Person", "name": reviewer}
    return [
        dict(ORG_JSONLD),
        dict(PERSON_JSONLD),
        breadcrumb_jsonld(crumbs),
        article,
    ]


def render_analysis_html(record: dict[str, Any], decision: PublicationDecision) -> str:
    if not record.get("material_hash"):
        record = dict(record)
        record["material_hash"] = material_hash(record)
    title = _text(record.get("title")) or "Análise técnica de contrato público"
    description = _text(record.get("meta_description") or record.get("executive_summary"))
    if len(description) > 160:
        description = description[:157].rstrip() + "…"
    path = _canonical_path(decision.slug)
    published = _iso(record.get("date_published") or record.get("as_of"))
    modified = _iso(record.get("date_modified") or record.get("as_of") or published)
    author_name = _author_name(record)
    reviewer = _reviewer_name(record)
    if reviewer and _fold_name(reviewer) == _fold_name(author_name):
        reviewer = ""
        record = dict(record)
        record["solo_reviewer_disclosure"] = record.get("solo_reviewer_disclosure") or True
    crumbs = [
        ("Início", "/"),
        (ANALYSIS_LABEL_PT, FAMILY_PATH),
        (title, None),
    ]
    sections: list[str] = []
    fixture_banner = ""
    if record.get("is_fixture") or decision.is_fixture or decision.source_kind == "test_only_fixture":
        fixture_banner = (
            '<p class="ca-fixture-banner" role="status">'
            "Prévia editorial de teste (fixture). Não é um contrato real, "
            "não implica relação comercial e não deve ser indexada."
            "</p>"
        )
    elif not decision.indexable:
        ready_for_human_review = (
            _text(record.get("editorial_status")) == "ready_for_human_review"
            or _text(getattr(decision, "human_review_status", "")) == "READY_FOR_HUMAN_REVIEW"
        )
        review_ready = bool(reviewer)
        authorship_ready = _author_confirmed(record)
        if authorship_ready and review_ready:
            review_message = (
                "Autoria e revisão estão identificadas; a autorização hash-bound "
                "de INDEX está ausente ou desatualizada. "
            )
        elif authorship_ready:
            review_message = (
                "A autoria humana está confirmada, mas a revisão ou a autorização "
                "hash-bound de INDEX ainda não está válida. "
            )
        else:
            review_message = "Autoria e revisão humanas ainda não foram confirmadas. "
        fixture_banner = (
            '<p class="ca-draft-banner" role="status">'
            "Rascunho editorial noindex. "
            f"{'READY_FOR_HUMAN_REVIEW' if ready_for_human_review else 'HUMAN_REVIEW_PENDING'}. "
            f"{review_message}"
            "Esta página não deve ser indexada. Sem autorização de INDEX."
            "</p>"
        )
    sections.append(
        f'<header class="article-hero container"{archetype_attr("masthead")}>'
        f'<p class="eyebrow">{e(ANALYSIS_LABEL_PT)}</p>'
        f"<h1>{e(title)}</h1>"
        f'<p class="ca-disclaimer">{e(DISCLAIMER_PT)}</p>'
        f"{fixture_banner}"
        "</header>"
    )
    sections.append(breadcrumbs_html(crumbs))
    sections.append(
        '<nav class="ca-toc" aria-label="Seções da análise">'
        '<p>Navegação por seções</p>'
        "<ul>"
        '<li><a href="#resumo">Resumo</a></li>'
        '<li><a href="#ficha">Ficha</a></li>'
        '<li><a href="#fatos">Fatos</a></li>'
        '<li><a href="#calculos">Cálculos</a></li>'
        '<li><a href="#nao-concluir">O que não se pode concluir</a></li>'
        '<li><a href="#fontes">Fontes</a></li>'
        "</ul></nav>"
    )
    if author_name == DRAFT_AUTHOR or not _author_confirmed(record):
        byline = (
            f'<p class="authority-byline">Autoria: <span rel="author">{e(author_name)}</span>'
        )
        reviewer = ""
    else:
        byline = (
            f'<p class="authority-byline">Autoria: <a rel="author" href="/especialista/tiago-jun-sasaki/">{e(author_name)}</a>'
        )
    if reviewer and _author_confirmed(record):
        byline += f' · Revisão técnica: <span data-reviewer="{e(reviewer)}">{e(reviewer)}</span>'
    elif record.get("solo_reviewer_disclosure") or not _author_confirmed(record):
        byline += " · Responsável técnico sem revisão independente: não há segundo revisor nomeado"
    byline += (
        f' · Publicado em <time datetime="{e(published)}">{e(published)}</time>'
        f' · Atualizado em <time datetime="{e(modified)}">{e(modified)}</time>'
        f' · as_of <time datetime="{e(_iso(record.get("as_of")))}">{e(_iso(record.get("as_of")))}</time>'
        ' · <a href="/correcoes/">Como corrigir ou contestar</a></p>'
    )
    sections.append(f'<div class="container">{byline}{AI_DISCLOSURE_HTML}</div>')

    if _text(record.get("executive_summary")):
        sections.append(
            f'<section class="section" id="resumo"{archetype_attr("resumo")}><h2>Resumo executivo</h2>'
            f'{_paragraphs(record["executive_summary"])}</section>'
        )
    if _text(record.get("why_analysis")):
        sections.append(
            f'<section class="section" id="por-que"{archetype_attr("por-que")}><h2>Por que merece análise</h2>'
            f'{_paragraphs(record["why_analysis"])}</section>'
        )
    if _text(record.get("body")):
        sections.append(
            f'<section class="section" id="analise"{archetype_attr("analise")}><h2>Análise</h2>'
            f'{_paragraphs(record["body"])}</section>'
        )
    sections.append(_ficha_html(record.get("ficha") if isinstance(record.get("ficha"), dict) else {}))
    sections.append(_timeline_html(_items(record.get("timeline"))))
    sections.append(_kind_items(_items(record.get("facts")), "Fatos relevantes", "fatos"))
    sections.append(_kind_items(_items(record.get("calculations")), "Cálculos", "calculos"))
    sections.append(_comparisons_html(_items(record.get("comparisons")), record))
    sections.append(
        _kind_items(_items(record.get("interpretation")), "Interpretação técnica CONFENGE", "interpretacao")
    )
    if _text(record.get("cannot_conclude")):
        sections.append(
            f'<section class="section" id="nao-concluir"{archetype_attr("nao-concluir")}><h2>O que não é possível concluir</h2>'
            f'{_paragraphs(record["cannot_conclude"])}</section>'
        )
    sections.append(_sources_html(_items(record.get("sources"))))
    if _text(record.get("methodology")):
        sections.append(
            f'<section class="section authority-method" id="metodologia"{archetype_attr("metodologia")}><h2>Metodologia</h2>'
            f'{_paragraphs(record["methodology"])}'
            f"<p><small>Gate {e(GATE_VERSION)}. Fatos de exportação pública versionada; interpretação editorial CONFENGE.</small></p>"
            "</section>"
        )
    if _text(record.get("limitations")):
        sections.append(
            f'<section class="section" id="limitacoes"{archetype_attr("limitacoes")}><h2>Limitações</h2>'
            f'{_paragraphs(record["limitations"])}</section>'
        )
    owner = _text(record.get("maintenance_owner"))
    if owner:
        sections.append(
            f'<section class="section" id="manutencao"{archetype_attr("manutencao")}><h2>Manutenção</h2>'
            f"<p>Responsável pela atualização: {e(owner)}.</p></section>"
        )
    sections.append(_history_html(_items(record.get("update_history"))))
    sections.append(_related_html(record))
    sections.append(_cta_html(record))
    hash_rows = []
    for label, key in (
        ("material_hash", "material_hash"),
        ("rendered_hash", "rendered_hash"),
        ("content_hash", "content_hash"),
        ("evidence_pack_hash", "evidence_pack_hash"),
        ("READY root_content_hash", "root_content_hash"),
        ("producer_commit", "producer_commit"),
    ):
        val = _text(record.get(key))
        if val:
            hash_rows.append(f"<tr><th scope='row'>{e(label)}</th><td><code>{e(val)}</code></td></tr>")
    if hash_rows:
        sections.append(
            f'<section class="section" id="hashes"{archetype_attr("hashes")}><h2>Hashes e proveniência</h2>'
            '<div class="table-wrap" role="group" tabindex="0" aria-label="Hashes e proveniência"><table class="data-table">'
            f"<tbody>{''.join(hash_rows)}</tbody></table></div>"
            "<p>publication_authorization e index_authorization do produtor permanecem "
            "<code>false</code>. "
            + (
                "INDEX desta URL, se existir, é decisão do consumidor bound a hashes "
                "e token do responsável, não é autorização do produtor."
                if decision.indexable
                else "Esta página não autoriza INDEX."
            )
            + "</p></section>"
        )
    sections.append(
        f'<section class="section" id="correcao"{archetype_attr("correcao")}><h2>Correção e contestação</h2>'
        "<p>Erro material, contestação de fato público ou pedido de correção "
        'segue a <a href="/correcoes/">política pública de correções</a> e a '
        '<a href="/politica-editorial/">política editorial</a>.</p></section>'
    )
    sections.append(author_box(archetype=ARCHETYPE_BY_SECTION_ID["author-box"]))

    body = "".join(s for s in sections if s)
    schema = build_schema(record, decision)
    robots = decision.robots
    if not decision.indexable and "noarchive" not in robots:
        robots = f"{robots},noarchive" if robots else "noindex,nofollow,noarchive"
    return page_shell(
        title=f"{title} | CONFENGE",
        description=description or DISCLAIMER_PT,
        canonical_path=path,
        robots=robots,
        jsonld_graph=schema,
        body_main=body,
        wa_message=(
            "Olá. Li uma análise técnica de contrato público na CONFENGE e quero "
            "avaliar um problema semelhante na minha empresa — sem relação com o contrato analisado."
        ),
        data_attrs={
            "surface-type": "analise_tecnica_contrato",
            "content-class": "ANALISE_TECNICA_CONTRATO_PUBLICO",
            "content-type": "analise-tecnica-contrato",
            "editorial-topic": _text(record.get("intent") or "contrato-publico"),
            "publication-state": decision.state,
            "source-kind": decision.source_kind,
            "route-family": ROUTE_FAMILY,
            "asset-id": decision.slug,
            "asset-family": ASSET_FAMILY,
            "analysis-id": _text(record.get("analysis_id") or record.get("id")),
            "evidence-pack-version": _text(record.get("evidence_pack_version")),
            "cta-id": "analise-tecnica-contextual",
        },
        author_name=author_name,
    )


def render_hub_html(items: list[tuple[dict[str, Any], PublicationDecision]], *, index_count: int) -> str:
    robots = "index,follow" if index_count >= 3 else "noindex,nofollow,noarchive"
    cards = []
    drafts = []
    for record, decision in items:
        if decision.state == "PUBLISHABLE_INDEX" and decision.indexable:
            href = _canonical_path(decision.slug)
            summary = _text(record.get("executive_summary"))
            if len(summary) > 220:
                summary = summary[:217].rstrip() + "…"
            cards.append(
                '<article class="n-card">'
                f'<p class="eyebrow">{e(ANALYSIS_LABEL_PT)} · publicado</p>'
                f'<h2><a href="{e(href)}">{e(_text(record.get("title")))}</a></h2>'
                f"<p>{e(summary)}</p>"
                "</article>"
            )
        elif decision.state == "PUBLISHABLE_NOINDEX" and not (
            record.get("is_fixture") or decision.is_fixture
        ):
            drafts.append(decision.slug)
    listing = "".join(cards) or (
        "<p>Nenhuma análise aprovada para publicação. "
        "Prévia noindex não é listada como conteúdo publicado.</p>"
    )
    if drafts:
        listing += (
            '<p class="ca-draft-note">Há rascunhos HUMAN_REVIEW_PENDING fora do índice '
            f"({len(drafts)}). Eles não entram nesta listagem como publicados.</p>"
        )
    body = (
        f'<header class="article-hero container"{archetype_attr("masthead")}>'
        f'<p class="eyebrow">{e(ANALYSIS_LABEL_PT)}</p>'
        "<h1>Análises técnicas de contratos públicos</h1>"
        f'<p class="ca-disclaimer">{e(DISCLAIMER_PT)}</p>'
        "</header>"
        + breadcrumbs_html([("Início", "/"), (ANALYSIS_LABEL_PT, None)])
        + '<div class="container">'
        '<p class="authority-byline">Autoria: <a rel="author" href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a>'
        ' · Responsável técnico sem revisão independente: não há segundo revisor nomeado'
        ' · Atualizado em <time datetime="2026-08-16">2026-08-16</time>'
        ' · <a href="/correcoes/">Como corrigir ou contestar</a></p>'
        "<p>Família editorial seletiva. Página não é um diretório combinatório "
        "nem um case de cliente. Indexação só ocorre quando o gate "
        f"{e(GATE_VERSION)} concede <code>PUBLISHABLE_INDEX</code>.</p>"
        f"{HUB_METHOD_HTML}"
        f"{listing}</div>"
        + author_box(archetype=ARCHETYPE_BY_SECTION_ID["author-box"])
    )
    schema = [
        dict(ORG_JSONLD),
        dict(PERSON_JSONLD),
        breadcrumb_jsonld([("Início", "/"), (ANALYSIS_LABEL_PT, FAMILY_PATH)]),
        {
            "@type": "CollectionPage",
            "@id": f"{SITE}{FAMILY_PATH}#page",
            "name": "Análises técnicas de contratos públicos",
            "description": HUB_DESCRIPTION,
            "url": f"{SITE}{FAMILY_PATH}",
            "datePublished": "2026-08-16",
            "dateModified": "2026-08-16",
            "author": {"@id": f"{SITE}/#tiago", "name": "Engº Tiago Sasaki"},
            "publisher": {"@id": f"{SITE}/#organization"},
            "inLanguage": "pt-BR",
        },
    ]
    return page_shell(
        title="Análises técnicas de contratos públicos | CONFENGE",
        description=HUB_DESCRIPTION,
        canonical_path=FAMILY_PATH,
        robots=robots,
        jsonld_graph=schema,
        body_main=body,
        wa_message="Olá. Quero entender a família de análises técnicas de contratos públicos da CONFENGE.",
        data_attrs={
            "surface-type": "analise_tecnica_contrato",
            "content-class": "ANALISE_TECNICA_CONTRATO_PUBLICO",
            "content-type": "analise-tecnica-contrato",
            "editorial-topic": "analises-contratos",
        },
        author_name="Engº Tiago Sasaki",
    )


def write_pages(
    pairs: list[tuple[dict[str, Any], PublicationDecision]],
    *,
    index_count: int,
) -> dict[str, Path]:
    root = _root()
    written: dict[str, Path] = {}
    hub_dir = root / PUBLIC_DIR
    hub_dir.mkdir(parents=True, exist_ok=True)
    hub_path = hub_dir / "index.html"
    hub_path.write_text(render_hub_html(pairs, index_count=index_count), encoding="utf-8")
    written["hub"] = hub_path
    for record, decision in pairs:
        if decision.state not in {"PUBLISHABLE_NOINDEX", "PUBLISHABLE_INDEX"}:
            continue
        dest = root / PUBLIC_DIR / decision.slug
        dest.mkdir(parents=True, exist_ok=True)
        path = dest / "index.html"
        html = render_analysis_html(record, decision)
        decision, html = apply_rendered_hash_gate(record, decision, html)
        path.write_text(html, encoding="utf-8")
        written[decision.slug] = path
    return written


def sitemap_locs(pairs: list[tuple[dict[str, Any], PublicationDecision]]) -> list[str]:
    locs = []
    for _, decision in pairs:
        if decision.state == "PUBLISHABLE_INDEX" and decision.sitemap:
            locs.append(f"{SITE}{_canonical_path(decision.slug)}")
    return locs


def write_sitemap(pairs: list[tuple[dict[str, Any], PublicationDecision]]) -> Path | None:
    """Write the family sitemap only with INDEX urls. Do not advertise an empty set."""
    from scripts.organic.sitemap_graph import (
        close_graph,
        drop_index_member,
        ensure_index_member,
        render_urlset,
    )

    root = _root()
    path = root / SITEMAP_NAME
    locs = sitemap_locs(pairs)
    if not locs:
        if path.exists():
            path.unlink()
        drop_index_member(root, SITEMAP_NAME)
        if (root / "sitemap-index.xml").is_file():
            close_graph(root)
        return None

    path.write_text(render_urlset((loc, None) for loc in locs), encoding="utf-8")
    ensure_index_member(root, SITEMAP_NAME)
    close_graph(root)
    return path


def analysis_urls_in_sitemaps(root: Path | None = None) -> list[str]:
    base = root or _root()
    found: list[str] = []
    from scripts.organic.sitemap_graph import INDEX_NAME, TXT_NAME, load_index_members

    needle = f"{SITE}{FAMILY_PATH}"
    names = [member.filename for member in load_index_members(base)]
    names.extend([TXT_NAME, SITEMAP_NAME, INDEX_NAME])
    seen: set[str] = set()
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        path = base / name
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        if FAMILY_PATH.rstrip("/") in text or needle in text:
            found.append(name)
    return found


FAMILY_SITEMAP_LOC = f"{SITE}/{SITEMAP_NAME}"
ROBOTS_FAMILY_BEGIN = "# Contract-analysis family — generated by scripts.contract_analysis"
ROBOTS_FAMILY_END = "# Contract-analysis family — end"
HEADERS_FAMILY_BEGIN = "# Contract-analysis family — generated by scripts.contract_analysis"
HEADERS_FAMILY_END = "# Contract-analysis family — end"


def apply_rendered_hash_gate(
    record: dict[str, Any],
    decision: PublicationDecision,
    html: str,
) -> tuple[PublicationDecision, str]:
    """One-byte render drift against a stored approval hash refuses INDEX."""
    from dataclasses import replace

    from scripts.contract_analysis.approval import approval_rendered_hash_ok

    ok, reasons = approval_rendered_hash_ok(record, html)
    if ok or decision.state != "PUBLISHABLE_INDEX":
        return decision, html
    downgraded = replace(
        decision,
        state="PUBLISHABLE_NOINDEX",
        indexable=False,
        sitemap=False,
        robots="noindex,nofollow",
        reason_codes=tuple(decision.reason_codes) + tuple(reasons),
    )
    return downgraded, render_analysis_html(record, downgraded)


def _index_slugs(pairs: list[tuple[dict[str, Any], PublicationDecision]]) -> list[str]:
    return [
        decision.slug
        for _, decision in pairs
        if decision.state == "PUBLISHABLE_INDEX" and decision.indexable and decision.slug
    ]


def sync_family_crawler_rules(
    pairs: list[tuple[dict[str, Any], PublicationDecision]],
    *,
    root: Path | None = None,
) -> None:
    """Allow only INDEX slugs; keep the rest of the family Disallow / X-Robots noindex.

    Netlify last-match wins for X-Robots-Tag on overlapping paths, so the INDEX
    override is written after the family noindex block. A noindex URL is never
    Allowed: robots, X-Robots-Tag, sitemap and canonical are one decision.
    Recrawl of a previously indexed noindex URL is a GSC manifesto action.
    """
    root = root or _root()
    slugs = _index_slugs(pairs)
    robots_path = root / "robots.txt"
    if robots_path.is_file():
        robots = robots_path.read_text(encoding="utf-8")
        crawlable_paths = {f"{FAMILY_PATH}{slug}/" for slug in slugs}
        allow_lines = "".join(f"Allow: {path}\n" for path in sorted(crawlable_paths))
        block = (
            f"{ROBOTS_FAMILY_BEGIN}\n"
            f"{allow_lines}Disallow: {FAMILY_PATH}\n"
            f"{ROBOTS_FAMILY_END}\n"
        )
        robots = _replace_or_append_block(
            robots,
            begin_markers=(ROBOTS_FAMILY_BEGIN, "# Contract-analysis canary:"),
            end_marker=ROBOTS_FAMILY_END,
            new_block=block,
            crawler_format="robots",
        )
        robots_path.write_text(robots, encoding="utf-8")
    headers_path = root / "_headers"
    if headers_path.is_file():
        headers = headers_path.read_text(encoding="utf-8")
        allow_block_parts = tuple(
            f"{FAMILY_PATH}{slug}/*\n  X-Robots-Tag: index, follow\n\n" for slug in slugs
        )
        allow_blocks = "".join(allow_block_parts)
        family_noindex_block = (
            f"{FAMILY_PATH}*\n"
            "  X-Robots-Tag: noindex, nofollow, noarchive\n\n"
        )
        block = (
            f"{HEADERS_FAMILY_BEGIN}\n"
            f"{family_noindex_block}"
            f"{allow_blocks}"
            f"{HEADERS_FAMILY_END}\n"
        )
        headers = _replace_or_append_block(
            headers,
            begin_markers=(HEADERS_FAMILY_BEGIN, "# Contract-analysis canary:"),
            end_marker=HEADERS_FAMILY_END,
            new_block=block,
            crawler_format="headers",
        )
        headers_path.write_text(headers, encoding="utf-8")


def _legacy_block_close(lines: list[str], start: int) -> int:
    """Return the inclusive end of a pre-terminator generated block.

    Comments inside that owned region are replaced with the generated block,
    not moved outside it: legacy policy prose can become false when the set of
    generated ``Allow`` rules changes. Everything from the first unrelated
    boundary onward remains byte-for-byte outside the replacement.
    """
    def is_family_rule(line: str) -> bool:
        return (
            line.startswith(f"Allow: {FAMILY_PATH}")
            or line.startswith(f"Disallow: {FAMILY_PATH}")
            or line.startswith(FAMILY_PATH)
        )

    def is_unrelated_rule(line: str) -> bool:
        return (
            line.startswith("/")
            or line.startswith("User-agent:")
            or line.startswith("Sitemap:")
            or line.startswith("Allow:")
            or line.startswith("Disallow:")
        )

    def comment_belongs_to_legacy_block(comment_index: int) -> bool:
        for candidate in lines[comment_index + 1 :]:
            if is_family_rule(candidate):
                return True
            if is_unrelated_rule(candidate):
                return False
        return False

    saw_family_rule = False
    for idx in range(start + 1, len(lines)):
        line = lines[idx]
        if is_family_rule(line):
            saw_family_rule = True
            continue
        if not line.strip() or line[:1].isspace():
            continue
        is_generated_neighbor = line.startswith("#") and " family — generated by " in line
        is_adjacent_comment = (
            line.startswith("#")
            and not saw_family_rule
            and not comment_belongs_to_legacy_block(idx)
        )
        if (
            is_generated_neighbor
            or is_unrelated_rule(line)
            or is_adjacent_comment
            or (saw_family_rule and line.startswith("#"))
        ):
            return idx - 1
    return len(lines) - 1


def _replace_or_append_block(
    text: str,
    *,
    begin_markers: tuple[str, ...],
    end_marker: str,
    new_block: str,
    crawler_format: str,
) -> str:
    lines = text.splitlines(keepends=True)
    first_start = next(
        (
            candidate
            for candidate, line in enumerate(lines)
            if any(line.startswith(marker) for marker in begin_markers)
        ),
        len(lines),
    )
    robots_insert_at: int | None = None
    if crawler_format == "robots" and first_start == len(lines):
        robots_insert_at, owned_user_agent = _robots_wildcard_group_end(lines)
    else:
        owned_user_agent = _nearest_user_agent(lines, first_start)
    kept: list[str] = []
    kept_insert_at: int | None = None
    index = 0
    replaced = False
    while index < len(lines):
        if robots_insert_at == index and kept_insert_at is None:
            kept_insert_at = len(kept)
        if any(lines[index].startswith(marker) for marker in begin_markers):
            legacy_close = _legacy_block_close(lines, index)
            first_boundary = legacy_close + 1
            close = next(
                (
                    candidate
                    for candidate in range(index + 1, len(lines))
                    if lines[candidate].startswith(end_marker)
                ),
                None,
            )
            if close is None or (
                first_boundary < len(lines) and first_boundary < close
            ):
                close = legacy_close
            if not replaced:
                kept.append(new_block)
                replaced = True
            index = close + 1
            while index < len(lines) and not lines[index].strip():
                index += 1
            continue
        if lines[index].startswith(end_marker):
            index += 1
            continue
        orphan_end = _owned_orphan_end(
            lines,
            index,
            crawler_format=crawler_format,
            owned_user_agent=owned_user_agent,
        )
        if orphan_end is not None:
            index = orphan_end
            continue
        kept.append(lines[index])
        index += 1

    if not replaced:
        if crawler_format == "robots":
            if kept_insert_at is None:
                kept_insert_at = len(kept)
            insertion = (
                new_block
                if owned_user_agent is not None
                else f"User-agent: *\n{new_block}"
            )
            return _insert_generated_block(kept, kept_insert_at, insertion)
        body = "".join(kept)
        if body and not body.endswith("\n"):
            body += "\n"
        return body + "\n" + new_block
    rebuilt = "".join(kept)
    return rebuilt if rebuilt.endswith("\n") else rebuilt + "\n"


def _nearest_user_agent(lines: list[str], index: int) -> str | None:
    for candidate in range(index - 1, -1, -1):
        if lines[candidate].casefold().startswith("user-agent:"):
            return lines[candidate].strip().casefold()
    return None


def _robots_wildcard_group_end(lines: list[str]) -> tuple[int, str | None]:
    wildcard = next(
        (
            index
            for index, line in enumerate(lines)
            if line.strip().casefold() == "user-agent: *"
        ),
        None,
    )
    if wildcard is None:
        return len(lines), None
    saw_rule = False
    for index in range(wildcard + 1, len(lines)):
        line = lines[index].strip().casefold()
        if not line or line.startswith("#"):
            continue
        if line.startswith("user-agent:"):
            if saw_rule:
                return index, _nearest_user_agent(lines, index)
            continue
        saw_rule = True
    return len(lines), _nearest_user_agent(lines, len(lines))


def _insert_generated_block(kept: list[str], index: int, new_block: str) -> str:
    before = "".join(kept[:index])
    after = "".join(kept[index:])
    if before and not before.endswith("\n"):
        before += "\n"
    if before and not before.endswith(("\n\n", "\r\n\r\n")):
        before += "\n"
    rebuilt = before + new_block + after
    return rebuilt if rebuilt.endswith("\n") else rebuilt + "\n"


def _owned_orphan_end(
    lines: list[str],
    index: int,
    *,
    crawler_format: str,
    owned_user_agent: str | None,
) -> int | None:
    if crawler_format == "robots":
        if _nearest_user_agent(lines, index) != owned_user_agent:
            return None
        directive = lines[index].rstrip("\r\n")
        if directive.startswith(
            (f"Allow: {FAMILY_PATH}", f"Disallow: {FAMILY_PATH}")
        ):
            return index + 1
        return None

    if crawler_format != "headers":
        raise ValueError(f"unsupported crawler format: {crawler_format}")
    if not lines[index].rstrip("\r\n").startswith(FAMILY_PATH):
        return None

    cursor = index + 1
    headers: list[str] = []
    while (
        cursor < len(lines)
        and lines[cursor].strip()
        and lines[cursor][:1].isspace()
    ):
        headers.append(lines[cursor].strip())
        cursor += 1
    if headers not in (
        ["X-Robots-Tag: index, follow"],
        ["X-Robots-Tag: noindex, nofollow, noarchive"],
    ):
        return None
    if cursor < len(lines) and not lines[cursor].strip():
        return cursor + 1
    return cursor
