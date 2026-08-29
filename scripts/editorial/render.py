"""Render editorial archetype pages into CONFENGE HTML shells."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit

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
from scripts.editorial.checklist_ui import render_structured_checklist
from scripts.editorial.registry import material_hash


ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def _legacy_redirect_destinations() -> dict[str, str]:
    """Resolve internal editorial links from the canonical migration inventory."""
    inventory = json.loads(
        (ROOT / "data" / "organic" / "legacy-url-inventory.json").read_text(
            encoding="utf-8"
        )
    )
    destinations: dict[str, str] = {}
    for item in inventory.get("items") or []:
        if item.get("current_action") not in {"301", "301!"}:
            continue
        source = urlsplit(str(item.get("legacy_url") or "")).path
        destination = str(item.get("destination") or "")
        if source.startswith("/") and destination.startswith("/"):
            destinations[source] = destination
    return destinations


def _resolved_internal_url(url: str) -> str:
    return _legacy_redirect_destinations().get(url, url)


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



_MONTHS_PT = ("", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro")

def format_date_br(iso):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", str(iso or "").strip())
    if not m: return str(iso or "")
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mo <= 12): return str(iso)
    return f"{d} de {_MONTHS_PT[mo]} de {y}"

INTERACTION_TYPES = frozenset({"article", "operational_guide", "checklist", "calculator", "diagnostic"})

def resolve_interaction_type(page):
    if not page: return "article"
    raw = str(page.get("interaction_type") or "").strip().lower()
    if raw in INTERACTION_TYPES: return raw
    if page.get("checklist_items") or page.get("checklist_ui") is True: return "checklist"
    pid = str(page.get("page_id") or "").lower()
    title = str(page.get("title") or "").lower()
    url = str(page.get("url") or "").lower()
    if pid.startswith("guia-"):
        if "checklist" in pid or "checklist" in title or "checklist" in url: return "checklist"
        return "operational_guide"
    return "article"

def _is_checklist_page(page):
    return resolve_interaction_type(page) == "checklist"


def markdown_to_html(md: str, *, checklist: bool = False) -> str:
    """Convert editorial markdown to HTML.

    When checklist=True, bullet lines become interactive checkbox items
    grouped under section cards. Explicit '- [ ]' / '- [x]' always render
    as checkboxes even outside checklist mode.
    """
    lines = md.strip().splitlines()
    out: list[str] = []
    in_ul = False
    in_ol = False
    in_check = False
    in_section = False
    check_i = 0

    def close_lists() -> None:
        nonlocal in_ul, in_ol, in_check
        if in_ul:
            out.append("</ul>")
            in_ul = False
        if in_ol:
            out.append("</ol>")
            in_ol = False
        if in_check:
            out.append("</ul>")
            in_check = False

    def close_section() -> None:
        nonlocal in_section
        close_lists()
        if in_section:
            out.append("</section>")
            in_section = False

    def open_checklist() -> None:
        nonlocal in_check
        if not in_check:
            close_lists()
            out.append('<ul class="checklist" role="list">')
            in_check = True

    def checklist_item(text: str, checked: bool = False) -> str:
        nonlocal check_i
        check_i += 1
        cid = f"chk-{check_i}"
        chk = " checked" if checked else ""
        return (
            f'<li class="checklist-item">'
            f'<label class="checklist-label" for="{cid}">'
            f'<input class="checklist-input" type="checkbox" id="{cid}"{chk}/>'
            f'<span class="checklist-box" aria-hidden="true"></span>'
            f'<span class="checklist-text">{_md_inline(text)}</span></label></li>'
        )

    def heading_html(level: str, raw_title: str) -> str:
        title = raw_title.strip()
        m = re.match(r"^(\d+)\.\s+(.+)$", title)
        if m:
            num, rest = m.group(1), m.group(2)
            return (
                f"<{level} class=\"editorial-heading editorial-heading--numbered\">"
                f'<span class="editorial-heading-num" aria-hidden="true">{num}</span>'
                f'<span class="editorial-heading-label">{_md_inline(rest)}</span></{level}>'
            )
        return f"<{level} class=\"editorial-heading\">{_md_inline(title)}</{level}>"

    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            close_lists()
            continue
        if line.startswith("### "):
            close_lists()
            out.append(heading_html("h3", line[4:]))
        elif line.startswith("## ") or line.startswith("# "):
            title = line[3:] if line.startswith("## ") else line[2:]
            close_section()
            out.append('<section class="editorial-section">')
            in_section = True
            out.append(heading_html("h2", title))
        elif re.match(r"^\d+\.\s+", line):
            if not in_ol:
                close_lists()
                out.append('<ol class="action-list">')
                in_ol = True
            item = re.sub(r"^\d+\.\s+", "", line)
            out.append(f"<li><div>{_md_inline(item)}</div></li>")
        elif re.match(r"^-\s+\[[ xX]\]\s+", line):
            open_checklist()
            checked = bool(re.match(r"^-\s+\[[xX]\]\s+", line))
            item = re.sub(r"^-\s+\[[ xX]\]\s+", "", line)
            out.append(checklist_item(item, checked=checked))
        elif line.startswith("- "):
            item = line[2:].strip()
            if checklist:
                open_checklist()
                out.append(checklist_item(item))
            else:
                if not in_ul:
                    close_lists()
                    out.append("<ul class=\"editorial-list\">")
                    in_ul = True
                out.append(f"<li>{_md_inline(item)}</li>")
        else:
            close_lists()
            out.append(f"<p>{_md_inline(line)}</p>")
    close_section()
    body = "\n".join(out)
    if checklist and check_i:
        progress = (
            '<div class="checklist-toolbar" data-checklist-toolbar>'
            '<div class="checklist-progress" role="status" aria-live="polite">'
            '<div class="checklist-progress-track"><span class="checklist-progress-fill" data-progress-fill style="width:0%"></span></div>'
            '<p class="checklist-progress-label">'
            '<strong data-progress-checked>0</strong> de <strong data-progress-total>'
            f"{check_i}</strong> itens conferidos"
            "</p></div>"
            '<button type="button" class="checklist-reset" data-checklist-reset>Limpar marcações</button>'
            "</div>"
        )
        body = progress + "\n" + body
    return body



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
        organ = src.get("organ") or src.get("issuer") or src.get("authority") or ""
        device = src.get("device") or src.get("article") or src.get("legal_device") or ""
        consulted = src.get("accessed") or src.get("date_consulted") or src.get("retrieved") or ""
        meta_bits = [b for b in (organ, device, consulted and f"Consulta: {consulted}") if b]
        meta = (
            f'<span class="sources-meta">{e(" · ".join(meta_bits))}</span>'
            if meta_bits
            else ""
        )
        items.append(
            f'<li><a href="{e(url)}" rel="noopener noreferrer" target="_blank">'
            f'<span class="sources-title">{e(title)}</span>{meta}</a></li>'
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
        "nem parecer jurídico quando necessário. Âmbito: obras e contratos públicos sob a "
        "Lei nº 14.133/2021 e regimes aplicáveis ao caso.</p>"
        "</section>"
    )


def _cta_block(page: dict[str, Any], position: str) -> str:
    wa = page.get("cta_whatsapp") or ""
    subject = page.get("cta_email_subject") or f"Análise inicial: {page.get('theme') or page.get('title')}"
    body = page.get("cta_email_body") or (
        f"Olá, Tiago.\n\nLi a página {page.get('url')} e gostaria de avaliar "
        f"{page.get('theme') or 'contrato de obra pública'}.\n\n"
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem.\n"
    )
    email = page.get("contact_email") or "tiago.sasaki@confenge.com.br"
    wa_href = wa_link(wa)
    mail_href = mailto_href(email, subject, body)
    label_wa = page.get("cta_wa_label") or "Enviar a situação pelo WhatsApp"
    label_em = page.get("cta_email_label") or "Solicitar análise inicial por e-mail"
    offer = page.get("cta_offer") or "Avaliar os documentos deste caso"
    blurb = page.get("cta_blurb") or (
        "Solicite um canal seguro para envio. O site não recebe arquivo; "
        "o canal é escolhido posteriormente."
    )
    if page.get("page_id") == "lei-limite-25-50":
        landmark_label = (
            "Próximo passo no conteúdo" if position == "mid" else "Próximo passo ao final"
        )
    else:
        landmark_label = "Próximo passo"
    return f"""
<section class="editorial-cta" id="cta-{e(position)}" aria-label="{e(landmark_label)}" data-cta-position="{e(position)}">
<div class="editorial-cta-inner">
<div class="editorial-cta-copy">
<span class="editorial-cta-kicker">Próximo passo</span>
<strong class="editorial-cta-title">{e(offer)}</strong>
<p class="editorial-cta-text">{e(blurb)}</p>
</div>
<div class="editorial-cta-actions">
<a class="button button-primary editorial-cta-primary" data-cta-position="{e(position)}" data-cta-channel="whatsapp" href="{e(wa_href)}" rel="noopener" target="_blank">{e(label_wa)}</a>
<a class="button button-secondary editorial-cta-secondary" data-cta-position="{e(position)}" data-cta-channel="email" href="{e(mail_href)}">{e(label_em)}</a>
</div>
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
            f'<a class="related-card" href="{e(_resolved_internal_url(r["url"]))}">'
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
    canonical_path = page.get("canonical_path") or page["url"]
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
    structured_html = render_structured_checklist(page) if page.get("checklist_items") else ""
    body_html = markdown_to_html(
        page.get("body_markdown") or "",
        checklist=(resolve_interaction_type(page)=="checklist" and not page.get("checklist_items")),
    )
    answer = page.get("direct_answer") or ""
    published = page.get("date_published") or "2026-08-02"
    modified = page.get("date_modified") or published
    author_name = page.get("author_public") or "Biblioteca técnica CONFENGE"
    # Do not claim Tiago authorship unless explicitly set after real approval flag
    use_tiago = bool(page.get("author_is_tiago"))
    # Same source fields feed visible HTML and JSON-LD in this render.
    reviewer_name = str(
        page.get("reviewer_public") or page.get("reviewed_by") or ""
    ).strip()
    data_version = str(
        page.get("data_version") or page.get("dataset_hash") or page.get("version") or ""
    ).strip()
    license_url = str(page.get("license") or "").strip()

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
        "@id": f"{SITE}{canonical_path}#article",
        "mainEntityOfPage": {"@type": "WebPage", "@id": f"{SITE}{canonical_path}"},
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
    if reviewer_name:
        article_ld["reviewedBy"] = {"@type": "Person", "name": reviewer_name}
    if data_version:
        article_ld["version"] = data_version
    if license_url:
        article_ld["license"] = license_url
    graph = [ORG_JSONLD, breadcrumb_jsonld(crumbs), article_ld]
    if use_tiago:
        graph.insert(1, PERSON_JSONLD)
    if faq_ld:
        graph.append(faq_ld)

    published_span = ""
    if published and published != modified:
        published_span = (
            f'<span>Publicado em <time datetime="{e(published)}">{e(format_date_br(published))}</time></span>'
            f'<span aria-hidden="true">·</span>'
        )
    extra_meta = ""
    if reviewer_name:
        extra_meta += (
            f'<span aria-hidden="true">·</span>'
            f'<span>Revisão técnica: <span data-reviewer="{e(reviewer_name)}">{e(reviewer_name)}</span></span>'
        )
    if data_version:
        extra_meta += (
            f'<span aria-hidden="true">·</span>'
            f'<span>Versão dos dados: <code data-version="{e(data_version)}">{e(data_version)}</code></span>'
        )
    if license_url:
        extra_meta += (
            f'<span aria-hidden="true">·</span>'
            f'<span>Licença: <a data-license="{e(license_url)}" href="{e(license_url)}">{e(license_url)}</a></span>'
        )
    meta_line = (
        f'<p class="article-meta-line">'
        f'<span>{e(author_name)}</span>'
        f'<span aria-hidden="true">·</span>'
        f"{published_span}"
        f'<span>Atualizado em <time datetime="{e(modified)}">{e(format_date_br(modified))}</time></span>'
        f"{extra_meta}"
        f"</p>"
    )

    checklist_script = ""
    if _is_checklist_page(page):
        checklist_script = """
<script>
(function () {
  function refresh(root) {
    var boxes = root.querySelectorAll('.checklist-input');
    var n = boxes.length, c = 0;
    boxes.forEach(function (b) { if (b.checked) c += 1; });
    var fill = root.querySelector('[data-progress-fill]');
    var checked = root.querySelector('[data-progress-checked]');
    var total = root.querySelector('[data-progress-total]');
    if (fill) fill.style.width = (n ? Math.round((c / n) * 100) : 0) + '%';
    if (checked) checked.textContent = String(c);
    if (total) total.textContent = String(n);
    root.querySelectorAll('.checklist-item').forEach(function (li) {
      var input = li.querySelector('.checklist-input');
      li.classList.toggle('is-checked', !!(input && input.checked));
    });
  }
  document.querySelectorAll('.article-main').forEach(function (root) {
    if (!root.querySelector('.checklist-input')) return;
    root.addEventListener('change', function (e) {
      if (e.target && e.target.classList.contains('checklist-input')) refresh(root);
    });
    var reset = root.querySelector('[data-checklist-reset]');
    if (reset) reset.addEventListener('click', function () {
      root.querySelectorAll('.checklist-input').forEach(function (b) { b.checked = false; });
      refresh(root);
    });
    refresh(root);
  });
})();
</script>
"""

    main = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div class="article-hero-copy">
<p class="eyebrow">{e(hub_name)}</p>
<h1>{e(title)}</h1>
<p class="content-lead">{e(page.get('lead') or answer[:180])}</p>
{meta_line}
</div></div></header>
<div class="container article-layout">
<article class="article-main" itemscope itemtype="https://schema.org/Article">
<div class="answer-box" id="resposta">
<span class="answer-box-kicker">Resposta direta</span>
<p class="answer-box-body">{e(answer)}</p>
</div>
{structured_html}
<div class="editorial-body">
{body_html}
</div>
{_cta_block(page, "mid")}
{faq_html}
{_sources_html(page)}
{_related_html(page)}
{_cta_block(page, "footer")}
{checklist_script}
</article>
<aside class="article-aside" aria-label="Ações laterais">
<div class="aside-card aside-card--primary">
<span class="aside-kicker">Diagnóstico CONFENGE</span>
<h2 class="aside-title">{e(page.get('aside_title') or 'Aplicar este enquadramento ao seu contrato')}</h2>
<p class="aside-text">{e(page.get('aside_blurb') or 'Organize documentos, riscos e próximos passos com base no cenário real da obra.')}</p>
<div class="aside-actions">
<a class="button button-primary" data-cta-position="aside" data-cta-channel="whatsapp" href="{e(wa_link(page.get('cta_whatsapp') or ''))}" rel="noopener" target="_blank">Conversar pelo WhatsApp</a>
<a class="button button-secondary" data-cta-position="aside" data-cta-channel="email" href="{e(mailto_href(page.get('contact_email') or 'tiago.sasaki@confenge.com.br', page.get('cta_email_subject') or title, page.get('cta_email_body') or ''))}">Enviar por e-mail</a>
</div>
</div>
<div class="aside-card aside-compact">
<span class="aside-kicker">Hub</span>
<a class="aside-hub-link" href="{e(hub_url)}">{e(hub_name)}</a>
</div>
</aside>
</div>
"""
    current_material_hash = material_hash(page)
    return page_shell(
        title=full_title,
        description=desc,
        canonical_path=canonical_path,
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
        extra_head=(
            '<meta name="editorial-material-hash" content="'
            + e(current_material_hash)
            + '"/><link href="/assets/editorial-a11y-v293.css" rel="stylesheet"/>'
        ),
    )


def render_hub(hub: dict[str, Any], pages: list[dict[str, Any]]) -> str:
    title = hub["title"]
    desc = hub["description"]
    url = hub["url"]
    crumbs = [("Início", "/"), (title, None)]
    cards = []
    for p in pages:
        if p.get("status") not in {"INDEXABLE", "PUBLISHED"}:
            continue
        cards.append(
            f'<article class="library-item"><div class="library-rank"></div><div>'
            f'<span class="content-badge guide-badge">{e(p.get("archetype") or "guia")}</span>'
            f'<h2><a href="{e(p["url"])}">{e(p["title"])}</a></h2>'
            f'<p>{e(p.get("meta_description") or p.get("direct_answer","")[:160])}</p>'
            f"</div></article>"
        )
    wa_msg = hub.get("cta_whatsapp") or (
        f"Olá, Tiago. Estou no hub {title} da CONFENGE e quero orientação sobre contratos de obras públicas."
    )
    mail_subject = hub.get("cta_email_subject") or f"Orientação: {title}"
    mail_body = hub.get("cta_email_body") or (
        f"Olá, Tiago.\n\nAcessei {url} e gostaria de orientação sobre o tema do hub.\n"
    )
    # Never publish an empty library section or "0 guias" / empty-index copy.
    if cards:
        library_block = (
            '<section class="section library-section"><div class="container">'
            f'<div class="library-list">{"".join(cards)}</div>'
            "</div></section>"
        )
    else:
        library_block = ""
    case_cta = f"""
<section class="section section--tight" data-hub-case-cta><div class="container">
<div class="lead-inline" data-cta-position="hub-footer">
<div class="lead-inline-copy"><span>Próximo passo</span><strong>Levou uma dúvida do hub para o seu contrato?</strong>
<p>Envie o tema e os documentos principais. Retorno com enquadramento inicial.</p></div>
<div class="lead-inline-actions">
<a class="button button-primary" data-cta-position="hub-footer" data-cta-channel="whatsapp" href="{e(wa_link(wa_msg))}" rel="noopener" target="_blank">Enviar pelo WhatsApp</a>
<a class="button button-secondary" data-cta-position="hub-footer" data-cta-channel="email" href="{e(mailto_href('tiago.sasaki@confenge.com.br', mail_subject, mail_body))}">Solicitar análise por e-mail</a>
</div></div>
</div></section>
"""
    body = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero"><div class="container">
<p class="eyebrow">Biblioteca técnica</p>
<h1>{e(title)}</h1>
<p class="content-lead">{e(desc)}</p>
</div></header>
{library_block}
{case_cta}
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
