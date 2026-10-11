#!/usr/bin/env python3
"""Render institutional service pages and the condominium editorial hub."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlencode


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "services" / "institutional-service-pages.v1.json"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.html_shell import breadcrumb_jsonld, breadcrumbs_html  # noqa: E402
from scripts.site.public_ia import breadcrumb_trail  # noqa: E402
from scripts.site.shell_nav import load_brand, sync_text  # noqa: E402


def section_by_id(document: str, section_id: str) -> str:
    pattern = re.compile(
        rf'<section\b(?=[^>]*\bid="{re.escape(section_id)}")[^>]*>[\s\S]*?</section>',
        re.IGNORECASE,
    )
    match = pattern.search(document)
    if not match:
        raise ValueError(f"section not found: {section_id}")
    return match.group(0)


def main_of(document: str) -> str:
    match = re.search(r'<main id="conteudo">[\s\S]*?</main>', document)
    if not match:
        raise ValueError("main#conteudo not found")
    return match.group(0)


def first_href(document: str, prefix: str) -> str:
    match = re.search(rf'href="({re.escape(prefix)}[^"]*)"', document)
    if not match:
        raise ValueError(f"channel not found: {prefix}")
    return match.group(1)


def channel_block(document: str, contact_id: str) -> str:
    section = section_by_id(document, contact_id)
    match = re.search(r'<div class="contact-primary">[\s\S]*?</div>', section)
    if not match:
        raise ValueError(f"contact-primary not found: {contact_id}")
    return match.group(0)


def channel_meta(document: str, contact_id: str) -> tuple[str, str]:
    section = section_by_id(document, contact_id)
    family = re.search(r'data-route-family="([^"]+)"', section)
    asset = re.search(r'data-asset-id="([^"]+)"', section)
    if not family:
        raise ValueError(f"route family not found: {contact_id}")
    return family.group(1), asset.group(1) if asset else ""


def esc(value: str) -> str:
    return html.escape(str(value), quote=True)


def tracking_attributes(page: dict, family: str | None = None) -> str:
    route = page["route"]
    attributes = {
        "data-route-family": family or route,
        "data-journey": page["journey"],
    }
    if route in {
        "engenharia-condominios",
        "inspecao-diagnostico-edificacoes",
        "assistencia-tecnica-pericial-engenharia",
    }:
        attributes.update(
            {
                "data-origem": f"/{route}/",
                "data-origin-url": f"/{route}/",
                "data-tema": route,
            }
        )
    if page.get("asset_id"):
        attributes["data-asset-id"] = page["asset_id"]
    return " ".join(f'{name}="{esc(value)}"' for name, value in attributes.items())


def contextual_form_href(
    page: dict,
    family: str | None = None,
    asset_id: str | None = None,
    topic: str | None = None,
) -> str:
    """Link to the existing form without losing the service request context."""
    route = page["route"]
    params = {
        "jornada": page["journey"],
        "tema": topic or page["hero"]["title"],
        "origem": f"/{route}/",
        "route_family": family or route,
    }
    if asset_id:
        params["asset_id"] = asset_id
    return f"/?{urlencode(params, quote_via=quote)}#contato"


def render_hero(page: dict, document: str) -> str:
    hero = page["hero"]
    contact_id = page["contact_id"]
    whatsapp = first_href(document, "https://wa.me/")
    email = first_href(document, "mailto:")
    phone = first_href(document, "tel:")
    family, asset = channel_meta(document, contact_id)
    page_with_asset = {**page, "asset_id": asset or page.get("asset_id")}
    attr = tracking_attributes(page_with_asset, family)
    calm_href = contextual_form_href(page, family, asset)
    signals = "\n".join(
        f"<div><dt>{esc(title)}</dt><dd>{esc(text)}</dd></div>"
        for title, text in hero["signals"]
    )
    return f'''<section aria-labelledby="service-title" class="svc-open" data-section-archetype="hero_split">
<div class="container"><div class="svc-open__grid">
<div class="svc-open__copy">
<p class="eyebrow t-kicker">{esc(hero['eyebrow'])}</p>
<h1 class="t-service" id="service-title">{esc(hero['title'])}</h1>
<p class="svc-open__lead">{esc(hero['lead'])}</p>
<p class="measure">{esc(hero['value'])}</p>
<div class="svc-open__actions">
<a class="button button-primary button-lg" data-cta-id="{esc(page['route'])}-hero-proposal" data-cta-position="hero" {attr} href="#{esc(contact_id)}">{esc(hero['cta'])} <svg class="icon"><use href="#i-arrow"></use></svg></a>
<a class="hero-secondary" data-cta-id="{esc(page['route'])}-hero-whatsapp" data-cta-position="hero" {attr} href="{esc(whatsapp)}" rel="noopener" target="_blank">WhatsApp (48) 98834-4559</a>
</div>
<p class="svc-open__note">Converse diretamente com a CONFENGE por <a data-cta-id="{esc(page['route'])}-hero-email" {attr} href="{esc(email)}">e-mail</a> ou <a data-cta-id="{esc(page['route'])}-hero-phone" {attr} href="{esc(phone)}">telefone</a>. Referências não sigilosas ajudam a definir a proposta; materiais controlados seguem pelo canal adequado ao projeto. Você também pode <a data-cta-id="{esc(page['route'])}-hero-calm" {attr} href="{esc(calm_href)}">preencher a solicitação com este contexto</a>.</p>
</div>
<aside class="aside-note" aria-labelledby="service-signal-title">
<h2 id="service-signal-title">{esc(hero['signal_title'])}</h2><dl>{signals}</dl>
</aside>
</div></div>
</section>'''


def render_inspection_paths(page: dict, document: str) -> str:
    _, asset = channel_meta(document, "contato-inspecao")
    attr = tracking_attributes({**page, "asset_id": asset}, "inspecao-diagnostico-edificacoes")
    base = "https://wa.me/5548988344559?text="
    cards = "\n".join(
        f'<li id="{esc(item["id"])}"><span class="list-ruled__index">{index:02d}</span><div><h3>{esc(item["title"])}</h3><p>{esc(item["text"])}</p><p><a class="text-link" data-cta-id="inspection-path-{esc(item["id"])}" {attr} href="{base}{quote(item["message"])}" rel="noopener" target="_blank">{esc(item["cta"])}</a></p></div></li>'
        for index, item in enumerate(page["situations"], 1)
    )
    return f'''<section aria-labelledby="inspection-paths-title" class="sec sec--soft" id="situacoes-inspecao"><div class="container"><header class="sec-head sec-head--split"><span class="t-kicker">{esc(page['situations_intro']['kicker'])}</span><h2 class="t-editorial" id="inspection-paths-title">{esc(page['situations_intro']['title'])}</h2><p>{esc(page['situations_intro']['intro'])}</p></header><ol class="list-ruled">{cards}</ol></div></section>'''


def render_grid(block: dict, section_id: str, soft: bool = False) -> str:
    cards = "\n".join(
        f"<article><h3>{esc(title)}</h3><p>{esc(text)}</p></article>"
        for title, text in block["items"]
    )
    section_class = "sec sec--soft" if soft else "sec"
    return f'''<section aria-labelledby="{section_id}-title" class="{section_class}" id="{section_id}">
<div class="container">
<header class="sec-head sec-head--split"><span class="t-kicker">{esc(block['kicker'])}</span><h2 class="t-editorial" id="{section_id}-title">{esc(block['title'])}</h2><p>{esc(block['intro'])}</p></header>
<div class="grid-2">{cards}</div>
</div></section>'''


def render_deliverables(block: dict, section_id: str, legacy_anchor_ids: list[str] | None = None) -> str:
    items = "\n".join(
        f'<li><span class="list-ruled__index">{index:02d}</span><div><h3>{esc(title)}</h3><p>{esc(text)}</p></div></li>'
        for index, (title, text) in enumerate(block["items"], 1)
    )
    legacy_anchors = "".join(
        f'<span aria-hidden="true" id="{esc(anchor_id)}"></span>'
        for anchor_id in (legacy_anchor_ids or [])
    )
    return f'''<section aria-labelledby="{section_id}-title" class="sec" id="{section_id}">
<div class="container">
{legacy_anchors}
<header class="sec-head sec-head--split"><span class="t-kicker">{esc(block['kicker'])}</span><h2 class="t-editorial" id="{section_id}-title">{esc(block['title'])}</h2><p>{esc(block['intro'])}</p></header>
<ol class="list-ruled">{items}</ol>
</div></section>'''


def render_engagement(block: dict, section_id: str) -> str:
    items = "\n".join(
        f"<li><b>{esc(title)}.</b> {esc(text)}</li>" for title, text in block["items"]
    )
    return f'''<section aria-labelledby="{section_id}-title" class="sec sec--soft" id="{section_id}">
<div class="container">
<header class="sec-head sec-head--split"><span class="t-kicker">{esc(block['kicker'])}</span><h2 class="t-editorial" id="{section_id}-title">{esc(block['title'])}</h2><p>{esc(block['intro'])}</p></header>
<div class="conditions"><ul>{items}</ul></div>
</div></section>'''


def render_faq(block: dict, section_id: str = "duvidas-contratacao") -> str:
    if not block:
        return ""
    items = "\n".join(
        f"<details><summary>{esc(question)}</summary><p>{esc(answer)}</p></details>"
        for question, answer in block["items"]
    )
    return f'''<section aria-labelledby="{esc(section_id)}-title" class="sec faq-section" id="{esc(section_id)}">
<div class="container faq-layout"><div class="faq-copy"><span class="t-kicker">{esc(block['kicker'])}</span><h2 class="t-editorial" id="{esc(section_id)}-title">{esc(block['title'])}</h2><p>{esc(block['intro'])}</p></div><div class="faq-list">{items}</div></div>
</section>'''


def strip_empty_client_frame(section: str) -> str:
    """Remove the legacy pseudo-client row while preserving demonstrative labels."""
    return re.sub(
        r'<div><dt>Cliente</dt><dd>Nenhum<small>[\s\S]*?</small></dd></div>',
        "",
        section,
        flags=re.IGNORECASE,
    )


def render_related_guides(block: dict) -> str:
    if not block:
        return ""
    items = "\n".join(
        f'<li><span class="list-ruled__index">{index:02d}</span><div><h3>{esc(title)}</h3><p>{esc(text)}</p><p><a class="text-link" href="{esc(href)}">Ler orientação</a></p></div></li>'
        for index, (title, text, href) in enumerate(block["items"], 1)
    )
    return f'''<section aria-labelledby="guias-relacionados-title" class="sec sec--soft" id="guias-relacionados">
<div class="container">
<header class="sec-head sec-head--split"><span class="t-kicker">Orientação para contratar</span><h2 class="t-editorial" id="guias-relacionados-title">{esc(block['title'])}</h2><p>{esc(block['intro'])}</p></header>
<ol class="list-ruled">{items}</ol>
</div></section>'''


def render_technical_figures(block: dict) -> str:
    if not block:
        return ""
    figures = []
    for item in block["items"]:
        figure_id = esc(item["id"])
        figures.append(
            f'''<figure class="plate plate--dominant proof-figure" aria-labelledby="{figure_id}-caption">
<div aria-label="Prancha técnica com rolagem horizontal" class="plate__sheet plate__sheet--native-pan" role="group" tabindex="0"><picture class="plate__picture"><source media="(max-width:699px)" srcset="{esc(item['mobile_src'])}" width="{int(item['mobile_width'])}" height="{int(item['mobile_height'])}"/><img alt="{esc(item['alt'])}" decoding="async" loading="lazy" src="{esc(item['desktop_src'])}" width="{int(item['desktop_width'])}" height="{int(item['desktop_height'])}"/></picture></div>
<figcaption class="plate__caption" id="{figure_id}-caption"><span class="tag">Exemplo demonstrativo</span> {esc(item['caption'])}</figcaption>
</figure>'''
        )
    return f'''<section aria-labelledby="provas-pacote-title" class="sec sec--soft" id="provas-pacote">
<div class="container">
<header class="sec-head sec-head--split"><span class="t-kicker">{esc(block['kicker'])}</span><h2 class="t-editorial" id="provas-pacote-title">{esc(block['title'])}</h2><p>{esc(block['intro'])}</p></header>
{''.join(figures)}
</div></section>'''


def render_contact(page: dict, document: str) -> str:
    contact = page["contact"]
    contact_id = page["contact_id"]
    channels = channel_block(document, contact_id)
    channels = re.sub(
        r'<a\b(?![^>]*\bdata-journey=)',
        f'<a data-journey="{esc(page["journey"])}"',
        channels,
    )
    contextual_routes = {
        "inspecao-diagnostico-edificacoes",
        "assistencia-tecnica-pericial-engenharia",
    }
    if page["route"] in contextual_routes:
        origin_attrs = (
            f' data-origem="/{esc(page["route"])}/"'
            f' data-origin-url="/{esc(page["route"])}/"'
            f' data-tema="{esc(page["route"])}"'
        )
        channels = re.sub(r'<a\b(?![^>]*\bdata-origem=)', f'<a{origin_attrs}', channels)
    else:
        channels = re.sub(
            r' data-(?:origem|origin-url|tema)="[^"]*"',
            "",
            channels,
        )
    prep = "\n".join(
        f"<li><strong>{esc(title)}:</strong> {esc(text)}</li>"
        for title, text in page.get("contact", {}).get("prep", page["hero"]["signals"][:3])
    )
    family, asset = channel_meta(document, contact_id)
    calm_attr = tracking_attributes(
        {**page, "asset_id": asset or page.get("asset_id")}, family
    )
    calm_href = contextual_form_href(page, family, asset)
    calm = (
        '<p class="contact-note">Se preferir escrever com calma, '
        f'<a data-cta-id="{esc(page["route"])}-contact-calm" {calm_attr} href="{esc(calm_href)}">preencha a solicitação com este contexto</a>.</p>'
    )
    boundary = esc(contact["boundary"])
    privacy_label = "Política de Privacidade"
    if privacy_label in contact["boundary"]:
        boundary = boundary.replace(
            privacy_label,
            f'<a href="/privacidade/">{privacy_label}</a>',
        )
    else:
        boundary += f' <a href="/privacidade/">{privacy_label}</a>.'
    return f'''<section aria-labelledby="contact-title" class="sec sec--dark" data-journey="{esc(page['journey'])}" data-section-archetype="cta_formal" id="{esc(contact_id)}">
<div class="container"><div class="capture-grid">
<div><span class="t-kicker">Próximo passo</span><h2 class="t-editorial" id="contact-title">{esc(contact['title'])}</h2><p data-form-value>{esc(contact['intro'])}</p><h3>Fale com a CONFENGE</h3>{channels}{calm}</div>
<aside aria-label="Informações para a proposta"><h3>Informações que ajudam a preparar a proposta</h3><ul>{prep}</ul><p class="contact-note" data-form-boundary>{boundary}</p></aside>
</div></div>
</section>'''


def update_social_meta(document: str, page: dict) -> str:
    sharing = page.get("sharing")
    if not sharing:
        return document
    fields = {
        "og:title": sharing["title"],
        "og:description": sharing["description"],
        "og:url": f'https://confenge.com.br/{page["route"]}/',
        "og:image": sharing.get("image", "https://confenge.com.br/assets/og-confenge.jpg"),
        "twitter:card": "summary_large_image",
        "twitter:title": sharing["title"],
        "twitter:description": sharing["description"],
        "twitter:image": sharing.get("image", "https://confenge.com.br/assets/og-confenge.jpg"),
    }
    for key, value in fields.items():
        attribute = "property" if key.startswith("og:") else "name"
        pattern = re.compile(rf'<meta\b(?=[^>]*\b{attribute}="{re.escape(key)}")[^>]*>', re.I)
        tag = f'<meta {attribute}="{esc(key)}" content="{esc(value)}"/>'
        if pattern.search(document):
            document = pattern.sub(tag, document, count=1)
        else:
            document = document.replace("</head>", f"{tag}\n</head>")
    return document


def update_structured_faq(document: str, page: dict) -> str:
    faq = page.get("faq")
    if not faq:
        return document
    pattern = re.compile(r'<script type="application/ld\+json">([\s\S]*?)</script>')
    match = pattern.search(document)
    if not match:
        raise ValueError(f"structured data not found: {page['route']}")
    data = json.loads(html.unescape(match.group(1)))
    graph = data.setdefault("@graph", [])
    if page.get("description"):
        for item in graph:
            if item.get("@type") == "WebPage":
                item["description"] = page["description"]
    graph = [item for item in graph if item.get("@type") != "FAQPage"]
    graph.append(
        {
            "@type": "FAQPage",
            "@id": f'https://confenge.com.br/{page["route"]}/#faq',
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": question,
                    "acceptedAnswer": {"@type": "Answer", "text": answer},
                }
                for question, answer in faq["items"]
            ],
        }
    )
    data["@graph"] = graph
    serialized = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return document[: match.start(1)] + serialized + document[match.end(1) :]


def render_hub_links(items: list[dict]) -> str:
    return "\n".join(
        f'''<article><h3>{esc(item['title'])}</h3><p>{esc(item['text'])}</p><p><a class="text-link" href="{esc(item['href'])}">{esc(item['cta'])} <svg class="icon"><use href="#i-arrow"></use></svg></a></p></article>'''
        for item in items
    )


def render_condominium_contact(hub: dict) -> str:
    attr = tracking_attributes(hub)
    message = quote(hub["contact"]["whatsapp_message"])
    subject = quote(hub["contact"]["email_subject"])
    calm_href = contextual_form_href(
        hub,
        asset_id=hub.get("asset_id"),
        topic="Engenharia para condomínio",
    )
    prep = "\n".join(
        f"<li><strong>{esc(title)}:</strong> {esc(text)}</li>"
        for title, text in hub["contact"]["prep"]
    )
    return f'''<section aria-labelledby="contact-title" class="sec sec--dark" data-journey="{esc(hub['journey'])}" data-section-archetype="cta_formal" id="contato-condominios">
<div class="container"><div class="capture-grid"><div><span class="t-kicker">Próximo passo</span><h2 class="t-editorial" id="contact-title">{esc(hub['contact']['title'])}</h2><p data-form-value>{esc(hub['contact']['intro'])}</p><h3>Fale com a CONFENGE</h3><div class="contact-primary">
<a class="button button-primary" data-cta-id="condominios-whatsapp" data-fallback-channel="whatsapp" {attr} href="https://wa.me/5548988344559?text={message}" rel="noopener" target="_blank">Conversar sobre o condomínio</a>
<ul class="contact-alt"><li><a data-cta-id="condominios-email" data-fallback-channel="email" {attr} href="mailto:tiago.sasaki@confenge.com.br?subject={subject}">Enviar o contexto por e-mail</a></li><li><a data-cta-id="condominios-phone" data-fallback-channel="phone" {attr} href="tel:+5548988344559">Ligar: <span class="nowrap">(48) 98834-4559</span></a></li></ul></div>
<p class="contact-note">Se preferir escrever com calma, <a data-cta-id="condominios-contact-calm" {attr} href="{esc(calm_href)}">preencha a solicitação com este contexto</a>.</p></div>
<aside aria-label="Informações para a proposta"><h3>Informações que ajudam a preparar a proposta</h3><ul>{prep}</ul><p class="contact-note" data-form-boundary>{esc(hub['contact']['boundary'])} <a href="/privacidade/">Política de Privacidade</a>.</p></aside></div></div>
</section>'''


def render_condominium_hub(hub: dict, template: str) -> str:
    crumbs = breadcrumb_trail(
        f'/{hub["route"]}/', current_label="Engenharia para condomínios"
    )
    situations = "\n".join(
        f'''<li id="{esc(item['id'])}"><span class="list-ruled__index">{index:02d}</span><div><h3>{esc(item['title'])}</h3><p>{esc(item['text'])}</p><p><strong>Decisão apoiada:</strong> {esc(item['decision'])}</p><p><a class="text-link" href="{esc(item['href'])}">{esc(item['cta'])} <svg class="icon"><use href="#i-arrow"></use></svg></a></p></div></li>'''
        for index, item in enumerate(hub["situations"], 1)
    )
    process = render_deliverables(hub["process"], "como-contratar")
    continuity = render_grid(hub["continuity"], "continuidade-tecnica", soft=True)
    samples = render_hub_links(hub["samples"])
    sample_section = f'''<section aria-labelledby="amostras-title" class="sec" id="amostras-demonstrativas"><div class="container"><header class="sec-head sec-head--split"><span class="t-kicker">Amostras de entrega</span><h2 class="t-editorial" id="amostras-title">Exemplos demonstrativos para avaliar a organização do trabalho.</h2><p>São materiais sintéticos, sem imóvel, processo ou resultado de cliente. Eles mostram como evidências, perguntas e encaminhamentos podem ser apresentados.</p></header><div class="grid-2">{samples}</div></div></section>'''
    hero = hub["hero"]
    attr = tracking_attributes(hub)
    main = f'''<main id="conteudo">
{breadcrumbs_html(crumbs)}
<section aria-labelledby="service-title" class="svc-open" data-section-archetype="hero_split"><div class="container"><div class="svc-open__grid"><div class="svc-open__copy"><p class="eyebrow t-kicker">{esc(hero['eyebrow'])}</p><h1 class="t-service" id="service-title">{esc(hero['title'])}</h1><p class="svc-open__lead">{esc(hero['lead'])}</p><p class="measure">{esc(hero['value'])}</p><div class="svc-open__actions"><a class="button button-primary button-lg" data-cta-id="condominios-hero-proposal" data-cta-position="hero" {attr} href="#contato-condominios">{esc(hero['cta'])} <svg class="icon"><use href="#i-arrow"></use></svg></a><a class="hero-secondary" href="#situacoes-condominio">Escolher pela situação</a></div></div><aside class="aside-note" aria-labelledby="service-signal-title"><h2 id="service-signal-title">{esc(hero['signal_title'])}</h2><dl>{''.join(f'<div><dt>{esc(title)}</dt><dd>{esc(text)}</dd></div>' for title, text in hero['signals'])}</dl></aside></div></div></section>
<section aria-labelledby="situacoes-title" class="sec sec--soft" id="situacoes-condominio"><div class="container"><header class="sec-head sec-head--split"><span class="t-kicker">Três situações de entrada</span><h2 class="t-editorial" id="situacoes-title">Comece pelo que precisa ser decidido no condomínio.</h2><p>O tipo de documento e a participação de síndico, conselho, administradora, advogado ou outros responsáveis dependem da situação. A proposta reúne as atividades necessárias sem obrigar uma sequência artificial de compras.</p></header><ol class="list-ruled">{situations}</ol></div></section>
{process}
{continuity}
<section aria-labelledby="cobertura-title" class="sec" id="atendimento"><div class="container"><header class="sec-head sec-head--split"><span class="t-kicker">Base e atendimento</span><h2 class="t-editorial" id="cobertura-title">Prioridade comercial na Grande Florianópolis, com escopo confirmado antes da visita.</h2><p>{esc(hub['coverage'])}</p></header></div></section>
{sample_section}
{render_faq(hub['faq'])}
{render_condominium_contact(hub)}
</main>'''
    rendered = template.replace(main_of(template), main)
    rendered = re.sub(r'<body\b[^>]*>', '<body data-content-cluster="engenharia-condominios" data-analytics-surface="engenharia-condominios">', rendered, count=1)
    rendered = rendered.replace('href="#contato-inspecao">Conversar sobre a edificação', 'href="#contato-condominios">Solicitar proposta para o condomínio')
    return sync_text(replace_hub_head(rendered, hub), load_brand(), f'/{hub["route"]}/')


def replace_hub_head(document: str, hub: dict) -> str:
    canonical = f'https://confenge.com.br/{hub["route"]}/'
    title = esc(hub["title"])
    description = esc(hub["description"])
    sharing = hub["sharing"]
    questions = [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
        for q, a in hub["faq"]["items"]
    ]
    item_list = [
        {"@type": "ListItem", "position": index, "name": item["title"], "url": f'https://confenge.com.br{item["href"]}'}
        for index, item in enumerate(hub["situations"], 1)
    ]
    crumbs = breadcrumb_trail(
        f'/{hub["route"]}/', current_label="Engenharia para condomínios"
    )
    schema = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "CollectionPage", "@id": canonical + "#webpage", "url": canonical, "name": hub["title"], "description": hub["description"], "inLanguage": "pt-BR", "isPartOf": {"@id": "https://confenge.com.br/#website"}, "publisher": {"@id": "https://confenge.com.br/#organization"}, "mainEntity": {"@id": canonical + "#situacoes"}},
            {"@type": "ItemList", "@id": canonical + "#situacoes", "name": "Situações de engenharia para condomínios", "numberOfItems": len(item_list), "itemListElement": item_list},
            {"@type": "FAQPage", "@id": canonical + "#faq", "mainEntity": questions},
            {**breadcrumb_jsonld(crumbs), "@id": canonical + "#breadcrumb"},
        ],
    }
    head = f'''<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<title>{title}</title>
<meta content="{description}" name="description"/>
<meta content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" name="robots"/>
<meta content="#061a33" name="theme-color"/>
<link href="{canonical}" rel="canonical"/>
<link href="/assets/favicon-32.png" rel="icon" sizes="32x32" type="image/png"/>
<link href="/assets/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180"/>
<link href="/manifest.webmanifest" rel="manifest"/>
<script>document.documentElement.classList.replace('no-js','js');</script>
<link rel="preload" as="font" type="font/woff2" href="/assets/archivo-var-latin-b19be0f7.woff2" crossorigin="anonymous"/>
<link href="/styles.css" rel="stylesheet"/>
<link href="/assets/editorial.css" rel="stylesheet"/>
<script defer="" src="/script.js?v=mv09"></script>
<meta content="website" property="og:type"/>
<meta content="pt_BR" property="og:locale"/>
<meta content="CONFENGE" property="og:site_name"/>
<meta content="{esc(sharing['title'])}" property="og:title"/>
<meta content="{esc(sharing['description'])}" property="og:description"/>
<meta content="{canonical}" property="og:url"/>
<meta content="https://confenge.com.br/assets/og-confenge.jpg" property="og:image"/>
<meta content="summary_large_image" name="twitter:card"/>
<meta content="{esc(sharing['title'])}" name="twitter:title"/>
<meta content="{esc(sharing['description'])}" name="twitter:description"/>
<meta content="https://confenge.com.br/assets/og-confenge.jpg" name="twitter:image"/>
<script type="application/ld+json">{json.dumps(schema, ensure_ascii=False, separators=(',', ':'))}</script>
</head>'''
    return re.sub(r'<head>[\s\S]*?</head>', head, document, count=1)


def render_page(page: dict, document: str) -> str:
    if page["route"] == "quantitativos-orcamento-obras" and "exemplos-conferiveis" not in page["preserve_sections"]:
        raise ValueError("canonical quantity examples must be preserved")
    old_main = main_of(document)
    breadcrumb = re.search(r'<nav aria-label="Navegação estrutural"[\s\S]*?</nav>', old_main)
    if not breadcrumb:
        raise ValueError(f"breadcrumb not found: {page['route']}")
    technical_sections = [section_by_id(document, item) for item in page["preserve_sections"]]
    if page["route"] in {
        "inspecao-diagnostico-edificacoes",
        "assistencia-tecnica-pericial-engenharia",
    }:
        technical_sections = [strip_empty_client_frame(item) for item in technical_sections]
    technical = "\n".join(technical_sections)
    blocks = {
        "competencies": render_grid(page["competencies"], "competencias", soft=False),
        "deliverables": render_deliverables(
            page["deliverables"],
            page.get("deliverables_id", "entregas-servico"),
            page.get("deliverables_legacy_anchor_ids"),
        ),
        "engagement": render_engagement(page["engagement"], "proposta-tecnica"),
        "technical": technical,
    }
    if page.get("distinctions"):
        blocks["distinctions"] = render_grid(
            page["distinctions"], "etapas-encadeadas", soft=True
        )
    if page.get("technical_figures"):
        blocks["technical_figures"] = render_technical_figures(
            page["technical_figures"]
        )
    if page.get("stages"):
        blocks["stages"] = render_grid(page["stages"], "etapas-da-assistencia", soft=True)
    ordered = "\n".join(blocks[name] for name in page["section_order"])
    related_guides = render_related_guides(page.get("related_guides"))
    route_specific = (
        render_inspection_paths(page, document)
        if page["route"] == "inspecao-diagnostico-edificacoes"
        else ""
    )
    main_parts = [
            '<main id="conteudo">',
            breadcrumb.group(0),
            render_hero(page, document),
            route_specific,
            ordered,
            related_guides,
    ]
    if page.get("faq"):
        main_parts.append(render_faq(page["faq"]))
    main_parts.extend([render_contact(page, document), "</main>"])
    new_main = "\n".join(main_parts)
    if page["route"] == "compatibilizacao-projetos-engenharia":
        new_main = new_main.replace('href="#condicoes-e-limites"', 'href="#proposta-tecnica"')
    rendered = document.replace(old_main, new_main)
    if page.get("description"):
        description = esc(page["description"])
        def update_meta(match):
            tag = match.group(0)
            if not re.search(r'(?:name|property)="(?:description|og:description|twitter:description)"', tag):
                return tag
            return re.sub(r'content="[^"]*"', lambda _: f'content="{description}"', tag)
        rendered = re.sub(r'<meta\b[^>]*>', update_meta, rendered)
    rendered = update_social_meta(rendered, page)
    rendered = update_structured_faq(rendered, page)
    return rendered


def run(write: bool) -> int:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    changed = []
    for page in data["pages"]:
        path = ROOT / page["route"] / "index.html"
        current = path.read_text(encoding="utf-8")
        rendered = render_page(page, current)
        if rendered != current:
            changed.append(str(path.relative_to(ROOT)))
            if write:
                path.write_text(rendered, encoding="utf-8", newline="\n")
    for hub in data.get("hubs", []):
        path = ROOT / hub["route"] / "index.html"
        template_path = ROOT / hub["template_route"] / "index.html"
        current = path.read_text(encoding="utf-8") if path.exists() else ""
        rendered = render_condominium_hub(
            hub,
            template_path.read_text(encoding="utf-8"),
        )
        if rendered != current:
            changed.append(str(path.relative_to(ROOT)))
            if write:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(rendered, encoding="utf-8", newline="\n")
    if changed and not write:
        print("OUT_OF_DATE " + " ".join(changed))
        return 1
    generated_count = len(data["pages"]) + len(data.get("hubs", []))
    print(("WROTE " if write else "OK ") + str(len(changed) if write else generated_count))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    return run(args.write)


if __name__ == "__main__":
    raise SystemExit(main())
