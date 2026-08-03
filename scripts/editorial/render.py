"""Render editorial archetype pages into CONFENGE HTML shells."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from scripts.pseo.html_shell import (
    ORG_JSONLD,
    PERSON_JSONLD,
    SITE,
    breadcrumb_jsonld,
    breadcrumbs_html,
    e,
    page_shell,
    wa_link,
)
from scripts.editorial.sources import load_manifest


def _md_inline(text: str) -> str:
    """Minimal markdown: **bold**, [label](url)."""
    t = e(text)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(
        r"\[([^\]]+)\]\((https?://[^)]+)\)",
        r'<a href="\2" rel="noopener noreferrer" target="_blank">\1</a>',
        t,
    )
    return t


def markdown_to_html(md: str) -> str:
    lines = md.strip().splitlines()
    out: list[str] = []
    in_ul = False
    in_ol = False

    def close_lists() -> None:
        nonlocal in_ul, in_ol
        if in_ul:
            out.append("</ul>")
            in_ul = False
        if in_ol:
            out.append("</ol>")
            in_ol = False

    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            close_lists()
            continue
        if line.startswith("### "):
            close_lists()
            out.append(f"<h3>{_md_inline(line[4:])}</h3>")
        elif line.startswith("## "):
            close_lists()
            out.append(f"<h2>{_md_inline(line[3:])}</h2>")
        elif line.startswith("# "):
            close_lists()
            out.append(f"<h2>{_md_inline(line[2:])}</h2>")
        elif re.match(r"^\d+\.\s+", line):
            if not in_ol:
                close_lists()
                out.append('<ol class="action-list">')
                in_ol = True
            item = re.sub(r"^\d+\.\s+", "", line)
            out.append(f"<li><div>{_md_inline(item)}</div></li>")
        elif line.startswith("- "):
            if not in_ul:
                close_lists()
                out.append("<ul>")
                in_ul = True
            out.append(f"<li>{_md_inline(line[2:])}</li>")
        else:
            close_lists()
            out.append(f"<p>{_md_inline(line)}</p>")
    close_lists()
    return "\n".join(out)


def mailto_href(email: str, subject: str, body: str) -> str:
    return f"mailto:{email}?subject={quote(subject)}&body={quote(body)}"


def _sources_html(page: dict[str, Any]) -> str:
    man = load_manifest()
    by_id = {s["source_id"]: s for s in man.get("sources") or []}
    items = []
    for sid in page.get("sources") or []:
        src = by_id.get(sid)
        if not src:
            continue
        title = src.get("title") or sid
        url = src.get("url") or "#"
        items.append(
            f'<li><a href="{e(url)}" rel="noopener noreferrer" target="_blank">{e(title)}'
            f'<svg class="icon"><use href="#i-arrow"></use></svg></a></li>'
        )
    if not items:
        return ""
    return (
        '<section class="sources-section" id="fontes">'
        '<p class="eyebrow">Referências oficiais</p>'
        "<h2>Fontes</h2>"
        "<p>Base normativa e orientações oficiais consultadas. A aplicação ao caso concreto "
        "depende do edital, do contrato e da documentação produzida na obra.</p>"
        f"<ul>{''.join(items)}</ul>"
        '<p class="technical-note">Conteúdo técnico-educacional. Não substitui análise individual '
        "nem parecer jurídico quando necessário.</p>"
        "</section>"
    )


def _cta_block(page: dict[str, Any], position: str) -> str:
    wa = page.get("cta_whatsapp") or ""
    subject = page.get("cta_email_subject") or f"Análise inicial — {page.get('theme') or page.get('title')}"
    body = page.get("cta_email_body") or (
        f"Olá, Tiago.\n\nLi a página {page.get('url')} e gostaria de avaliar documentos "
        f"relacionados a {page.get('theme') or 'contrato de obra pública'}.\n\n"
        "Posso enviar: contrato, planilha, medições e notificações relevantes.\n"
    )
    email = page.get("contact_email") or "tiago.sasaki@confenge.com.br"
    wa_href = wa_link(wa)
    mail_href = mailto_href(email, subject, body)
    label_wa = page.get("cta_wa_label") or "Enviar a situação pelo WhatsApp"
    label_em = page.get("cta_email_label") or "Solicitar análise inicial por e-mail"
    offer = page.get("cta_offer") or "Avaliar os documentos deste caso"
    return f"""
<section class="lead-inline" id="cta-{e(position)}" aria-label="Próximo passo" data-cta-position="{e(position)}">
<div class="lead-inline-copy">
<span>Próximo passo</span>
<strong>{e(offer)}</strong>
<p>{e(page.get('cta_blurb') or 'Envie o edital, a planilha, a notificação ou a medição. Retorno com enquadramento técnico e próximos passos.')}</p>
</div>
<div class="lead-inline-actions">
<a class="button button-primary" data-cta-position="{e(position)}" data-cta-channel="whatsapp" href="{e(wa_href)}" rel="noopener" target="_blank">{e(label_wa)}</a>
<a class="button button-secondary" data-cta-position="{e(position)}" data-cta-channel="email" href="{e(mail_href)}">{e(label_em)}</a>
</div>
</section>
"""


def _related_html(page: dict[str, Any]) -> str:
    rel = page.get("related") or []
    if not rel:
        return ""
    cards = []
    for r in rel[:6]:
        cards.append(
            f'<a class="related-card" href="{e(r["url"])}">'
            f'<span>{e(r.get("cluster") or "Relacionado")}</span>'
            f'<strong>{e(r["title"])}</strong>'
            f'<small>{e(r.get("kind") or "Guia")}</small></a>'
        )
    return (
        '<section class="related-section"><p class="eyebrow">Continue o diagnóstico</p>'
        f"<h2>Páginas relacionadas</h2><div class=\"related-grid\">{''.join(cards)}</div></section>"
    )


def _hub_label(archetype: str) -> tuple[str, str]:
    return {
        "lei_14133": ("Lei 14.133 em obras", "/lei-14133-obras/"),
        "jurisprudencia": ("Jurisprudência aplicada", "/jurisprudencia-contratos-obras/"),
        "guia": ("Guias e checklists", "/guias-contratos-obras/"),
        "inteligencia": ("Inteligência", "/inteligencia/"),
    }.get(archetype, ("Conteúdos", "/conteudos/"))


def render_page(page: dict[str, Any]) -> str:
    archetype = page.get("archetype") or "guia"
    hub_name, hub_url = _hub_label(archetype)
    title = page["title"]
    if "CONFENGE" not in title:
        full_title = f"{title} | CONFENGE"
    else:
        full_title = title
    desc = page.get("meta_description") or page.get("direct_answer", "")[:155]
    robots = (
        "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
        if page.get("status") in {"INDEXABLE", "PUBLISHED"}
        else "noindex,follow"
    )
    crumbs = [
        ("Início", "/"),
        (hub_name, hub_url),
        (title, None),
    ]
    body_html = markdown_to_html(page.get("body_markdown") or "")
    answer = page.get("direct_answer") or ""
    published = page.get("date_published") or "2026-08-02"
    modified = page.get("date_modified") or published
    author_name = page.get("author_public") or "Biblioteca técnica CONFENGE"
    # Do not claim Tiago authorship unless explicitly set after real approval flag
    use_tiago = bool(page.get("author_is_tiago"))

    faq = page.get("faq") or []
    faq_html = ""
    faq_ld = None
    if faq:
        blocks = []
        entities = []
        for item in faq:
            blocks.append(
                f"<details><summary>{e(item['q'])}</summary><p>{e(item['a'])}</p></details>"
            )
            entities.append(
                {
                    "@type": "Question",
                    "name": item["q"],
                    "acceptedAnswer": {"@type": "Answer", "text": item["a"]},
                }
            )
        faq_html = (
            '<section class="article-faq"><p class="eyebrow">Perguntas frequentes</p>'
            f"<h2>Dúvidas objetivas</h2><div class=\"faq-list\">{''.join(blocks)}</div></section>"
        )
        faq_ld = {"@type": "FAQPage", "mainEntity": entities}

    article_ld: dict[str, Any] = {
        "@type": "Article",
        "@id": f"{SITE}{page['url']}#article",
        "mainEntityOfPage": {"@type": "WebPage", "@id": f"{SITE}{page['url']}"},
        "headline": title,
        "description": desc,
        "datePublished": published,
        "dateModified": modified,
        "inLanguage": "pt-BR",
        "publisher": {"@id": f"{SITE}/#organization"},
        "author": (
            {"@id": f"{SITE}/#tiago"}
            if use_tiago
            else {"@type": "Organization", "name": author_name, "@id": f"{SITE}/#organization"}
        ),
    }
    graph = [ORG_JSONLD, breadcrumb_jsonld(crumbs), article_ld]
    if use_tiago:
        graph.insert(1, PERSON_JSONLD)
    if faq_ld:
        graph.append(faq_ld)

    meta_line = (
        f'<div class="article-meta"><span>{e(author_name)}</span>'
        f'<span>Publicado em <time datetime="{e(published)}">{e(published)}</time></span>'
        f'<span>Revisado em <time datetime="{e(modified)}">{e(modified)}</time></span></div>'
    )

    main = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div>
<p class="eyebrow">{e(hub_name)}</p>
<h1>{e(title)}</h1>
<p class="content-lead">{e(page.get('lead') or answer[:180])}</p>
{meta_line}
</div></div></header>
<div class="container article-layout">
<article class="article-main" itemscope itemtype="https://schema.org/Article">
<div class="answer-box" id="resposta"><span>Resposta direta</span><p>{e(answer)}</p></div>
{body_html}
{_cta_block(page, "mid")}
{faq_html}
{_sources_html(page)}
{_related_html(page)}
{_cta_block(page, "footer")}
</article>
<aside class="article-aside">
<div class="aside-card">
<span>Diagnóstico CONFENGE</span>
<h2>{e(page.get('aside_title') or 'Aplicar este enquadramento ao seu contrato')}</h2>
<p>{e(page.get('aside_blurb') or 'Organize documentos, riscos e próximos passos com base no cenário real da obra.')}</p>
<a class="button button-primary" data-cta-position="aside" data-cta-channel="whatsapp" href="{e(wa_link(page.get('cta_whatsapp') or ''))}" rel="noopener" target="_blank">Conversar pelo WhatsApp</a>
<a class="button button-secondary" style="margin-top:.75rem;display:inline-flex" data-cta-position="aside" data-cta-channel="email" href="{e(mailto_href(page.get('contact_email') or 'tiago.sasaki@confenge.com.br', page.get('cta_email_subject') or title, page.get('cta_email_body') or ''))}">Enviar por e-mail</a>
</div>
<div class="aside-card aside-compact"><strong>Hub</strong><a href="{e(hub_url)}">{e(hub_name)}</a></div>
</aside>
</div>
"""
    return page_shell(
        title=full_title,
        description=desc,
        canonical_path=page["url"],
        robots=robots,
        jsonld_graph=graph,
        body_main=main,
        wa_message=page.get("cta_whatsapp") or "Olá, Tiago. Li um conteúdo técnico da CONFENGE.",
        author_name=author_name if not use_tiago else "Engº Tiago Sasaki",
        data_attrs={
            "content-type": archetype,
            "editorial-topic": page.get("theme") or page.get("page_id") or "",
            "topic": page.get("theme") or "",
            "journey": page.get("journey") or "",
            "page-id": page.get("page_id") or "",
        },
    )


def render_hub(hub: dict[str, Any], pages: list[dict[str, Any]]) -> str:
    title = hub["title"]
    desc = hub["description"]
    url = hub["url"]
    crumbs = [("Início", "/"), (title, None)]
    cards = []
    # List indexable children first; also surface EDITORIAL_REVIEWED /
    # READY_FOR_HUMAN_APPROVAL as preview so internal linking is not orphaned
    # while human approval is pending (robots stay noindex on those leaves).
    listable = {
        "INDEXABLE",
        "PUBLISHED",
        "EDITORIAL_REVIEWED",
        "READY_FOR_HUMAN_APPROVAL",
        "HUMAN_APPROVED",
    }
    ordered = sorted(
        pages,
        key=lambda p: (
            0 if p.get("status") in {"INDEXABLE", "PUBLISHED"} else 1,
            p.get("title") or "",
        ),
    )
    for p in ordered:
        st = p.get("status") or ""
        if st not in listable or st == "REJECTED":
            continue
        badge = p.get("archetype") or "guia"
        if st in {"EDITORIAL_REVIEWED", "READY_FOR_HUMAN_APPROVAL"}:
            badge = f"{badge} · preview (revisão)"
        cards.append(
            f'<article class="library-item"><div class="library-rank"></div><div>'
            f'<span class="content-badge guide-badge">{e(badge)}</span>'
            f'<h2><a href="{e(p["url"])}">{e(p["title"])}</a></h2>'
            f'<p>{e(p.get("meta_description") or p.get("direct_answer","")[:160])}</p>'
            f"</div></article>"
        )
    wa_msg = hub.get("cta_whatsapp") or (
        f"Olá, Tiago. Estou no hub {title} da CONFENGE e quero orientação sobre contratos de obras públicas."
    )
    mail_subject = hub.get("cta_email_subject") or f"Orientação — {title}"
    mail_body = hub.get("cta_email_body") or (
        f"Olá, Tiago.\n\nAcessei {url} e gostaria de orientação sobre o tema do hub.\n"
    )
    body = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero"><div class="container">
<p class="eyebrow">Biblioteca técnica</p>
<h1>{e(title)}</h1>
<p class="content-lead">{e(desc)}</p>
</div></header>
<section class="section library-section"><div class="container">
<div class="library-list">{''.join(cards) if cards else '<p>Nenhum conteúdo indexável neste hub ainda.</p>'}</div>
<div class="lead-inline" style="margin-top:2rem" data-cta-position="hub-footer">
<div class="lead-inline-copy"><span>Próximo passo</span><strong>Levou uma dúvida do hub para o seu contrato?</strong>
<p>Envie o tema e os documentos principais. Retorno com enquadramento inicial.</p></div>
<div class="lead-inline-actions">
<a class="button button-primary" data-cta-position="hub-footer" data-cta-channel="whatsapp" href="{e(wa_link(wa_msg))}" rel="noopener" target="_blank">Enviar pelo WhatsApp</a>
<a class="button button-secondary" data-cta-position="hub-footer" data-cta-channel="email" href="{e(mailto_href('tiago.sasaki@confenge.com.br', mail_subject, mail_body))}">Solicitar análise por e-mail</a>
</div></div>
</div></section>
"""
    graph = [
        ORG_JSONLD,
        breadcrumb_jsonld(crumbs),
        {
            "@type": "CollectionPage",
            "name": title,
            "description": desc,
            "url": f"{SITE}{url}",
        },
    ]
    return page_shell(
        title=f"{title} | CONFENGE",
        description=desc,
        canonical_path=url,
        robots="index,follow",
        jsonld_graph=graph,
        body_main=body,
        wa_message=wa_msg,
        author_name="Biblioteca técnica CONFENGE",
        data_attrs={
            "content-type": "hub",
            "editorial-topic": hub.get("topic") or hub.get("id") or "",
            "topic": hub.get("topic") or "",
            "journey": hub.get("journey") or "navegacao",
            "page-id": hub.get("id") or "",
        },
    )
