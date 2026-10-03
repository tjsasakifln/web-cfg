#!/usr/bin/env python3
"""Render six institutional service pages from a compact content source."""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "services" / "institutional-service-pages.v1.json"


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


def render_hero(page: dict, document: str) -> str:
    hero = page["hero"]
    contact_id = page["contact_id"]
    whatsapp = first_href(document, "https://wa.me/")
    email = first_href(document, "mailto:")
    phone = first_href(document, "tel:")
    family, asset = channel_meta(document, contact_id)
    attr = f'data-route-family="{esc(family)}" data-journey="{esc(page["journey"])}"' + (
        f' data-asset-id="{esc(asset)}"' if asset else ""
    )
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
<p class="svc-open__note">Converse diretamente com a CONFENGE por <a data-cta-id="{esc(page['route'])}-hero-email" {attr} href="{esc(email)}">e-mail</a> ou <a data-cta-id="{esc(page['route'])}-hero-phone" {attr} href="{esc(phone)}">telefone</a>. Referências não sigilosas ajudam a definir a proposta; materiais controlados seguem pelo canal adequado ao projeto. Se preferir, use a <a data-cta-id="{esc(page['route'])}-hero-calm" {attr} href="/triagem-tecnica/">triagem para escrever com calma</a>.</p>
</div>
<aside class="aside-note" aria-labelledby="service-signal-title">
<h2 id="service-signal-title">{esc(hero['signal_title'])}</h2><dl>{signals}</dl>
</aside>
</div></div>
</section>'''


def render_inspection_paths(document: str) -> str:
    _, asset = channel_meta(document, "contato-inspecao")
    attr = 'data-route-family="inspecao-diagnostico-edificacoes"' + (
        f' data-asset-id="{esc(asset)}"' if asset else ""
    )
    base = "https://wa.me/5548988344559?text="
    paths = [
        ("recebimento-entrega", "Recebimento e entrega", "Preciso de uma inspeção para recebimento ou entrega de uma edificação."),
        ("reforma-condominio", "Reforma em condomínio", "Preciso avaliar tecnicamente uma reforma em condomínio."),
        ("documentacao-as-built", "Documentação do construído", "Preciso reconciliar o construído com os documentos e avaliar um as-built."),
    ]
    from urllib.parse import quote
    cards = "\n".join(
        f'<li id="{slug}"><span class="list-ruled__index">{index:02d}</span><div><h3>{esc(title)}</h3><p>Enquadre o objetivo, a área e os documentos disponíveis.</p><p><a class="text-link" data-cta-id="inspection-path-{slug}" {attr} href="{base}{quote(message)}" rel="noopener" target="_blank">Conversar sobre {esc(title.lower())}</a></p></div></li>'
        for index, (slug, title, message) in enumerate(paths, 1)
    )
    return f'''<section aria-labelledby="inspection-paths-title" class="sec sec--soft" id="situacoes-inspecao"><div class="container"><header class="sec-head"><span class="t-kicker">Situações atendidas</span><h2 class="t-editorial" id="inspection-paths-title">Recebimento, reforma e documentação do construído pedem recortes próprios.</h2></header><ol class="list-ruled">{cards}</ol></div></section>'''


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
<div class="plate__sheet"><picture class="plate__picture"><source media="(max-width:699px)" srcset="{esc(item['mobile_src'])}" width="{int(item['mobile_width'])}" height="{int(item['mobile_height'])}"/><img alt="{esc(item['alt'])}" decoding="async" loading="lazy" src="{esc(item['desktop_src'])}" width="{int(item['desktop_width'])}" height="{int(item['desktop_height'])}"/></picture></div>
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
    prep = "\n".join(
        f"<li><strong>{esc(title)}:</strong> {esc(text)}</li>"
        for title, text in page["hero"]["signals"][:3]
    )
    if page["route"] == "quantitativos-orcamento-obras":
        calm = '<p class="contact-note">Se a situação não é de quantitativos nem de orçamento, descreva-a pela <a data-journey="orcamento" data-origem="servico-institucional" data-tema="quantitativos-orcamento-obras" href="/triagem-tecnica/">triagem técnica</a>.</p>'
    else:
        calm = (
            '<p class="contact-note">Se preferir escrever com calma, use a '
            f'<a data-journey="{esc(page["journey"])}" data-origem="servico-institucional" data-tema="{esc(page["route"])}" href="/triagem-tecnica/">triagem técnica</a>.</p>'
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


def render_page(page: dict, document: str) -> str:
    old_main = main_of(document)
    breadcrumb = re.search(r'<nav aria-label="Navegação estrutural"[\s\S]*?</nav>', old_main)
    if not breadcrumb:
        raise ValueError(f"breadcrumb not found: {page['route']}")
    technical = "\n".join(section_by_id(document, item) for item in page["preserve_sections"])
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
    ordered = "\n".join(blocks[name] for name in page["section_order"])
    related_guides = render_related_guides(page.get("related_guides"))
    route_specific = (
        render_inspection_paths(document)
        if page["route"] == "inspecao-diagnostico-edificacoes"
        else ""
    )
    new_main = "\n".join(
        [
            '<main id="conteudo">',
            breadcrumb.group(0),
            render_hero(page, document),
            route_specific,
            ordered,
            related_guides,
            render_contact(page, document),
            "</main>",
        ]
    )
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
    if changed and not write:
        print("OUT_OF_DATE " + " ".join(changed))
        return 1
    print(("WROTE " if write else "OK ") + str(len(changed) if write else len(data["pages"])))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    return run(args.write)


if __name__ == "__main__":
    raise SystemExit(main())
