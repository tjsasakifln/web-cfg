#!/usr/bin/env python3
"""Render the CONFENGE engineering-project page family from one data contract.

The pages are source artifacts and are intentionally dependency-free.  This
renderer escapes all editorial data, emits stable JSON-LD and supports the same
write/check workflow used by the rest of the repository.

Usage:
    python scripts/site/render_project_pages.py --write
    python scripts/site/render_project_pages.py --check
"""

from __future__ import annotations

import argparse
import html
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/projects/project-pages.v1.json"
SITE = "https://confenge.com.br"


def esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def _icon(name: str) -> str:
    return f'<svg class="pp-icon" aria-hidden="true"><use href="#pp-{esc(name)}"></use></svg>'


SPRITE = """<svg class="pp-sprite" aria-hidden="true" width="0" height="0">
<symbol id="pp-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="pp-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
</svg>"""


def _crumbs(page: dict[str, Any], by_route: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    crumbs = [{"name": "Início", "route": "/"}]
    if page.get("parent"):
        parent = by_route[page["parent"]]
        crumbs.append({"name": parent["breadcrumb"], "route": parent["route"]})
    crumbs.append({"name": page["breadcrumb"], "route": page["route"]})
    return crumbs


def _jsonld(page: dict[str, Any], crumbs: list[dict[str, str]]) -> str:
    url = f"{SITE}{page['route']}"
    graph: list[dict[str, Any]] = [
        {
            "@type": "WebPage",
            "@id": f"{url}#webpage",
            "url": url,
            "name": page["title"],
            "description": page["description"],
            "datePublished": page["published_at"],
            "dateModified": page["modified_at"],
            "inLanguage": "pt-BR",
            "isPartOf": {"@id": f"{SITE}/#website"},
            "breadcrumb": {"@id": f"{url}#breadcrumb"},
        },
        {
            "@type": "BreadcrumbList",
            "@id": f"{url}#breadcrumb",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": index,
                    "name": crumb["name"],
                    "item": f"{SITE}{crumb['route']}",
                }
                for index, crumb in enumerate(crumbs, start=1)
            ],
        },
    ]
    service_type = page.get("service_type")
    if service_type:
        graph[0]["about"] = {"@id": f"{url}#service"}
        graph.append(
            {
                "@type": "Service",
                "@id": f"{url}#service",
                "name": page["h1"],
                "serviceType": service_type,
                "description": page["description"],
                "provider": {"@id": f"{SITE}/#organization"},
                "url": url,
            }
        )
    return json.dumps(
        {"@context": "https://schema.org", "@graph": graph},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _header(active: str) -> str:
    links = [
        ("/projetos/", "Projetos"),
        ("/servicos/", "Serviços"),
        ("/servicos-obras-publicas/", "Obras públicas"),
        ("/como-trabalhamos/", "Como trabalhamos"),
        ("/empresa/", "Empresa"),
    ]
    nav = "".join(
        f'<a href="{route}"{current}>{label}</a>'
        for route, label in links
        for current in (' aria-current="page"' if route == active else "",)
    )
    return f"""<header class="pp-header">
<div class="pp-container pp-header__inner">
<a class="pp-brand" href="/" aria-label="CONFENGE, página inicial"><img src="/assets/logo-confenge-500-f8a83f6d.png" width="224" height="58" alt="CONFENGE Inteligência Técnica"/></a>
<nav class="pp-nav" aria-label="Navegação principal">{nav}</nav>
<a class="pp-button pp-button--compact" href="#contato-projetos" data-value-first-cta="true" data-event-name="project_cta_click" data-journey="projetos" data-cta-id="project-header" data-cta-position="header">Solicitar proposta</a>
<details class="pp-mobile"><summary aria-label="Menu">{_icon('menu')}<span>Menu</span></summary><nav aria-label="Navegação móvel">{nav}<a href="#contato-projetos" data-value-first-cta="true" data-event-name="project_cta_click" data-journey="projetos" data-cta-id="project-header-mobile" data-cta-position="mobile-menu">Solicitar proposta</a></nav></details>
</div>
</header>"""


def _active_header_route(page: dict[str, Any]) -> str:
    route = page["route"]
    project_branch = {
        "/edificacoes/",
        "/terceirizacao-projetos-engenharia/",
        "/projeto-estrutural-concreto-armado/",
        "/projeto-estrutura-metalica/",
        "/projeto-eletrico/",
        "/projeto-hidrossanitario/",
    }
    if route.startswith("/projetos/") or route in project_branch:
        return "/projetos/"
    return route


def _footer(modified_at: str, published_at: str) -> str:
    months = (
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    )
    parsed = date.fromisoformat(modified_at)
    display_date = f"{parsed.day} de {months[parsed.month - 1]} de {parsed.year}"
    return f"""<footer class="pp-footer">
<div class="pp-container pp-footer__grid">
<div><a class="pp-brand pp-brand--footer" href="/"><img src="/assets/logo-confenge-500-f8a83f6d.png" width="224" height="58" alt="CONFENGE Inteligência Técnica"/></a><p>Engenharia, Perícias e Inteligência Técnica.</p></div>
<nav aria-label="Projetos"><strong>Projetos</strong><a href="/projetos/estruturas/">Estruturas</a><a href="/projetos/instalacoes/">Instalações</a><a href="/projetos/infraestrutura/">Infraestrutura</a><a href="/projetos/coordenacao-multidisciplinar/">Coordenação multidisciplinar</a></nav>
<nav aria-label="Outros serviços"><strong>Outros serviços</strong><a href="/servicos/">Serviços de engenharia</a><a href="/edificacoes/">Edificações</a><a href="/seguranca-trabalho-apoio-tecnico/">Segurança do trabalho</a><a href="/servicos-obras-publicas/">Obras públicas</a></nav>
<nav aria-label="Institucional"><strong>CONFENGE</strong><a href="/como-trabalhamos/">Como trabalhamos</a><a href="/empresa/">Empresa</a><a href="/triagem-tecnica/">Contato técnico</a><a href="/privacidade/">Privacidade</a></nav>
</div>
<div class="pp-container pp-footer__bottom"><span>© CONFENGE · publicada em <time datetime="{esc(published_at)}">{esc(published_at)}</time> · atualizada em <time datetime="{esc(modified_at)}">{esc(display_date)}</time></span><a href="/termos-de-uso/">Termos de uso</a></div>
</footer>"""


def _breadcrumbs(crumbs: list[dict[str, str]]) -> str:
    rows = []
    for index, crumb in enumerate(crumbs):
        current = index == len(crumbs) - 1
        if current:
            rows.append(f'<li aria-current="page">{esc(crumb["name"])}</li>')
        else:
            rows.append(f'<li><a href="{esc(crumb["route"])}">{esc(crumb["name"])}</a></li>')
    return f'<nav class="breadcrumbs pp-breadcrumb pp-container" aria-label="Trilha de navegação"><ol>{"".join(rows)}</ol></nav>'


def _scope_groups(page: dict[str, Any]) -> str:
    groups = []
    for group in page["scope_groups"]:
        items = "".join(f"<li>{esc(item)}</li>" for item in group["items"])
        groups.append(
            f'<article class="pp-scope"><p class="pp-kicker">{esc(group["label"])}</p>'
            f'<h3>{esc(group["title"])}</h3><p>{esc(group["body"])}</p><ul>{items}</ul></article>'
        )
    return "".join(groups)


def _deliverables(page: dict[str, Any]) -> str:
    rows = []
    for index, item in enumerate(page["deliverables"], start=1):
        rows.append(
            f'<li><span class="pp-number">{index:02d}</span><div><h3>{esc(item["title"])}</h3>'
            f'<p>{esc(item["body"])}</p><p class="pp-use"><strong>Uso na decisão:</strong> {esc(item["use"])}</p></div></li>'
        )
    return "".join(rows)


def _method(page: dict[str, Any]) -> str:
    return "".join(
        f'<li><span>{index:02d}</span><div><p class="pp-kicker">{esc(step["label"])}</p>'
        f'<h3>{esc(step["title"])}</h3><p>{esc(step["body"])}</p></div></li>'
        for index, step in enumerate(page["method"], start=1)
    )


def _interfaces(page: dict[str, Any]) -> str:
    return "".join(
        f'<article><h3>{esc(item["title"])}</h3><p>{esc(item["body"])}</p></article>'
        for item in page["interfaces"]
    )


def _related(page: dict[str, Any]) -> str:
    return "".join(
        f'<li><a href="{esc(item["route"])}"><span>{esc(item["label"])}</span>'
        f'<strong>{esc(item["title"])}</strong>{_icon("arrow")}</a></li>'
        for item in page["related"]
    )


SECTION_NAV = {
    "scope": ("escopo", "Atuação"),
    "deliverables": ("entregaveis", "Entregas"),
    "interfaces": ("coordenacao", "Integração"),
    "demonstration": ("demonstracao", "Demonstração"),
    "method": ("metodo", "Desenvolvimento"),
    "inputs": ("insumos", "Informações iniciais"),
    "responsibility": ("responsabilidade", "Responsabilidade"),
    "leadership": ("lideranca", "Liderança"),
    "contact": ("contato-projetos", "Proposta"),
    "related": ("relacionadas", "Relacionadas"),
}


def _page_index(page: dict[str, Any]) -> str:
    links = "".join(
        f'<a href="#{anchor}">{label}</a>'
        for key in page["section_order"]
        if key in SECTION_NAV
        for anchor, label in (SECTION_NAV[key],)
        if key != "related"
    )
    return f'<nav class="pp-index pp-container" aria-label="Nesta página">{links}</nav>'


def _render_section(key: str, page: dict[str, Any]) -> str:
    if key == "scope":
        return f'''<section class="pp-section" id="escopo" aria-labelledby="scope-title"><div class="pp-container"><header class="pp-section__head"><p class="pp-kicker">{esc(page.get('scope_kicker', 'Atuação técnica'))}</p><h2 id="scope-title">{esc(page['scope_title'])}</h2><p>{esc(page['scope_intro'])}</p></header><div class="pp-scope-grid">{_scope_groups(page)}</div></div></section>'''
    if key == "deliverables":
        return f'''<section class="pp-section pp-section--ink" id="entregaveis" aria-labelledby="deliverables-title"><div class="pp-container"><header class="pp-section__head"><p class="pp-kicker">{esc(page.get('deliverables_kicker', 'Documentação e resultados'))}</p><h2 id="deliverables-title">{esc(page.get('deliverables_title', 'Entregas que sustentam a próxima decisão.'))}</h2><p>{esc(page.get('deliverables_intro', 'A proposta relaciona entregáveis, formatos, revisões e finalidade de uso para que o pacote técnico seja compreendido e contratado com clareza.'))}</p></header><ol class="pp-deliverables">{_deliverables(page)}</ol></div></section>'''
    if key == "interfaces":
        return f'''<section class="pp-section pp-section--soft" id="coordenacao" aria-labelledby="interfaces-title"><div class="pp-container"><header class="pp-section__head"><p class="pp-kicker">{esc(page.get('interfaces_kicker', 'Integração'))}</p><h2 id="interfaces-title">{esc(page['interfaces_title'])}</h2><p>{esc(page['interfaces_intro'])}</p></header><div class="pp-interface-grid">{_interfaces(page)}</div></div></section>'''
    if key == "demonstration":
        demonstration = page["demonstration"]
        note = demonstration.get("note", demonstration.get("limit", ""))
        return f'''<section class="pp-section" id="demonstracao" aria-labelledby="demo-title"><div class="pp-container pp-demo"><div><p class="pp-kicker">Representação demonstrativa</p><h2 id="demo-title">{esc(demonstration['title'])}</h2><p>{esc(demonstration['body'])}</p><p class="pp-demo__limit">{esc(note)}</p></div><figure><p class="pp-demo__pan-hint">Deslize para ver o diagrama completo.</p><div class="pp-demo__canvas" tabindex="0" role="group" aria-label="Diagrama técnico com rolagem horizontal"><img loading="lazy" decoding="async" src="{esc(demonstration['src'])}" width="960" height="600" alt="{esc(demonstration['alt'])}"/></div><figcaption><span>Ilustração técnica</span>{esc(demonstration['caption'])}</figcaption></figure></div></section>'''
    if key == "method":
        return f'''<section class="pp-section pp-section--rule" id="metodo" aria-labelledby="method-title"><div class="pp-container"><header class="pp-section__head"><p class="pp-kicker">{esc(page.get('method_kicker', 'Desenvolvimento'))}</p><h2 id="method-title">{esc(page['method_title'])}</h2><p>{esc(page['method_intro'])}</p></header><ol class="pp-method">{_method(page)}</ol></div></section>'''
    if key == "inputs":
        requirements = "".join(f"<li>{esc(item)}</li>" for item in page["requirements"])
        return f'''<section class="pp-section pp-section--soft" id="insumos" aria-labelledby="inputs-title"><div class="pp-container pp-inputs"><div><p class="pp-kicker">Para preparar a proposta</p><h2 id="inputs-title">Comece com as informações que já possui.</h2><p>Finalidade, fase, local e documentos disponíveis já permitem iniciar a conversa. A CONFENGE ajuda a identificar as informações adicionais necessárias para formar o escopo.</p></div><ul>{requirements}</ul></div></section>'''
    if key == "responsibility":
        return f'''<section class="pp-section" id="responsabilidade" aria-labelledby="responsibility-title"><div class="pp-container pp-responsibility"><div><p class="pp-kicker">Responsabilidade técnica</p><h2 id="responsibility-title">{esc(page.get('responsibility_title', 'Responsáveis definidos para o objeto contratado.'))}</h2></div><p>{esc(page.get('responsibility_body', 'A proposta identifica objeto, disciplinas, autoria, interfaces e condições de campo. A responsabilidade técnica e as formalidades profissionais são confirmadas para as atividades efetivamente contratadas.'))}</p></div></section>'''
    if key == "leadership":
        leadership = page["leadership"]
        items = "".join(
            f'<article><h3>{esc(item["title"])}</h3><p>{esc(item["body"])}</p></article>'
            for item in leadership["items"]
        )
        return f'''<section class="pp-section pp-section--soft" id="lideranca" aria-labelledby="leadership-title"><div class="pp-container"><header class="pp-section__head"><p class="pp-kicker">Liderança técnica</p><h2 id="leadership-title">{esc(leadership['title'])}</h2><p>{esc(leadership['intro'])}</p></header><div class="pp-interface-grid">{items}</div></div></section>'''
    if key == "contact":
        return _contact_section(page)
    if key == "related":
        return f'''<section class="pp-section pp-section--related" id="relacionadas" aria-labelledby="related-title"><div class="pp-container"><header class="pp-section__head"><p class="pp-kicker">Continue a análise</p><h2 id="related-title">Páginas relacionadas</h2></header><ul>{_related(page)}</ul></div></section>'''
    raise ValueError(f"unknown project section: {key}")


def _contact_section(page: dict[str, Any]) -> str:
    whatsapp_context = page.get("whatsapp_context") or page["breadcrumb"].lower()
    whatsapp_message = quote(
        "Olá. Quero solicitar uma proposta para " + whatsapp_context
        + ". Posso informar finalidade, fase, local e documentos disponíveis."
    )
    whatsapp = f"https://wa.me/5548988344559?text={whatsapp_message}"
    email_subject = quote("Solicitação de proposta de engenharia", safe="")
    email_body = quote(
        "Olá, equipe CONFENGE.\n\nQuero solicitar uma proposta para " + whatsapp_context
        + ".\n\nFinalidade:\nFase:\nLocal:\nDocumentos disponíveis:\n",
        safe="",
    )
    email = (
        "mailto:tiago.sasaki@confenge.com.br?subject=" + email_subject
        + "&amp;body=" + email_body
    )
    return f'''<section class="pp-section pp-section--cta" id="contato-projetos" aria-labelledby="proposal-title"><div class="pp-container pp-cta"><div><p class="pp-kicker">Solicite uma proposta</p><h2 id="proposal-title">{esc(page.get('proposal_title', 'Conte o que precisa projetar ou decidir.'))}</h2><p>{esc(page.get('proposal_body', 'Envie a finalidade, a fase, o local e as referências que já possui. A CONFENGE retorna com as perguntas necessárias para definir disciplinas, entregas e condições da proposta.'))}</p></div><div class="pp-cta__actions"><a class="pp-button pp-button--light" href="/triagem-tecnica/" data-event-name="project_cta_click" data-journey="projetos" data-cta-id="{esc(page['id'])}-final" data-cta-position="final">Solicitar proposta {_icon('arrow')}</a><a class="pp-whatsapp" href="{esc(whatsapp)}" target="_blank" rel="noopener" data-event-name="whatsapp_click" data-journey="projetos" data-route-family="{esc(page['id'])}" data-cta-id="{esc(page['id'])}-whatsapp" data-cta-position="final">Conversar pelo WhatsApp</a><div class="pp-direct"><a href="{email}" data-event-name="email_click" data-journey="projetos" data-route-family="{esc(page['id'])}" data-cta-id="{esc(page['id'])}-email" data-cta-position="final">Enviar por e-mail</a><a href="tel:+5548988344559" data-journey="projetos" data-route-family="{esc(page['id'])}" data-cta-id="{esc(page['id'])}-phone" data-cta-position="final">Ligar: (48) 98834-4559</a></div></div></div></section>'''


def _render(page: dict[str, Any], by_route: dict[str, dict[str, Any]]) -> str:
    route = page["route"]
    crumbs = _crumbs(page, by_route)
    visual = page["visual"]
    sections = "\n".join(_render_section(key, page) for key in page["section_order"])
    first_anchor, first_label = SECTION_NAV[page["section_order"][0]]
    return f"""<!DOCTYPE html>
<html class="no-js" lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{esc(page['title'])} | CONFENGE</title>
<meta name="description" content="{esc(page['description'])}"/>
<meta name="robots" content="index,follow,max-image-preview:large"/>
<meta name="theme-color" content="#081b2e"/>
<link rel="canonical" href="{SITE}{esc(route)}"/>
<link rel="icon" href="/assets/favicon-32.png" sizes="32x32" type="image/png"/>
<link rel="manifest" href="/manifest.webmanifest"/>
<meta property="og:type" content="website"/><meta property="og:locale" content="pt_BR"/>
<meta property="og:site_name" content="CONFENGE"/><meta property="og:title" content="{esc(page['title'])}"/>
<meta property="og:description" content="{esc(page['description'])}"/><meta property="og:url" content="{SITE}{esc(route)}"/>
<meta property="og:image" content="{SITE}/assets/og-confenge.jpg"/>
<link rel="preload" as="font" type="font/woff2" href="/assets/archivo-var-latin-b19be0f7.woff2" crossorigin="anonymous"/>
<link rel="stylesheet" href="/styles.css"/><link rel="stylesheet" href="/assets/project-practices.css"/>
<script>document.documentElement.classList.replace('no-js','js');</script>
<script defer src="/script.js"></script>
<script type="application/ld+json">{_jsonld(page, crumbs)}</script>
</head>
<body data-content-cluster="engineering-projects" data-project-page="{esc(page['id'])}">
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
{SPRITE}
{_header(_active_header_route(page))}
<main id="conteudo">
{_breadcrumbs(crumbs)}
<section class="pp-hero" aria-labelledby="page-title">
<div class="pp-container pp-hero__grid"><div class="pp-hero__copy">
<p class="pp-eyebrow">{esc(page['eyebrow'])}</p><h1 id="page-title">{esc(page['h1'])}</h1>
<p class="pp-lead">{esc(page['lead'])}</p>
<div class="pp-actions"><a class="pp-button" href="#contato-projetos" data-value-first-cta="true" data-event-name="project_cta_click" data-journey="projetos" data-cta-id="{esc(page['id'])}-hero" data-cta-position="hero">Solicitar proposta {_icon('arrow')}</a><a class="pp-text-link" href="#{first_anchor}">Ver {first_label.lower()}</a></div>
<p class="pp-summary">{esc(page['summary'])}</p>
<p class="pp-note">{esc(page['hero_note'])}</p></div>
<figure class="pp-hero__visual"><img src="{esc(visual['src'])}" width="760" height="520" alt="{esc(visual['alt'])}"/><figcaption><span>Diagrama técnico ilustrativo</span>{esc(visual['caption'])}</figcaption></figure>
</div></section>
{_page_index(page)}
{sections}
</main>
{_footer(page['modified_at'], page['published_at'])}
</body>
</html>
"""


def render_pages() -> dict[str, str]:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    shared = payload["shared"]
    pages = []
    for source in payload["pages"]:
        page = dict(source)
        page["published_at"] = source.get("published_at", payload["published_at"])
        page["modified_at"] = source.get("modified_at", payload["modified_at"])
        page["method"] = source.get("method", shared["method"])
        page["requirements"] = [
            *shared["requirements"], *source.get("requirements", [])
        ]
        page["section_order"] = source.get(
            "section_order", shared["default_section_order"]
        )
        pages.append(page)
    by_route = {page["route"]: page for page in pages}
    return {page["route"]: _render(page, by_route) for page in pages}


def run(*, write: bool) -> int:
    drift: list[str] = []
    pages = render_pages()
    for route, rendered in pages.items():
        path = ROOT / route.strip("/") / "index.html"
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == rendered:
            continue
        drift.append(route)
        if write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(rendered, encoding="utf-8", newline="\n")
    if write:
        print(json.dumps({"rendered": sorted(pages), "updated": sorted(drift)}, ensure_ascii=False))
        return 0
    if drift:
        print("FAIL project pages differ from data/projects/project-pages.v1.json:")
        print("\n".join(f"  {route}" for route in sorted(drift)))
        print("Run: python scripts/site/render_project_pages.py --write")
        return 1
    print(f"PASS {len(pages)} project pages match project-pages.v1.json")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    return run(write=args.write)


if __name__ == "__main__":
    sys.exit(main())
