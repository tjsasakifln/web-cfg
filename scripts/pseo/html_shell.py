"""Shared HTML chrome matching the existing CONFENGE static site."""

from __future__ import annotations

import html
import json
from typing import Any
from urllib.parse import quote

SITE = "https://confenge.com.br"
WA_BASE = "https://wa.me/5548988344559"
ORG_JSONLD = {
    "@type": "Organization",
    "@id": f"{SITE}/#organization",
    "name": "CONFENGE",
    "legalName": "CONFENGE",
    "url": f"{SITE}/",
    "logo": f"{SITE}/assets/logo-confenge.png",
    "image": f"{SITE}/assets/og-confenge.jpg",
    "description": (
        "Consultoria B2G especializada em licitações, propostas, contratos e "
        "obras públicas para empresas de engenharia e construção."
    ),
    "email": "tiago.sasaki@confenge.com.br",
    "telephone": "+55-48-98834-4559",
    "taxID": "52.407.089/0001-09",
}
PERSON_JSONLD = {
    "@type": "Person",
    "@id": f"{SITE}/#tiago",
    "name": "Engº Tiago Sasaki",
    "image": f"{SITE}/assets/tiago-sasaki-foto-v11-sem-fundo.png",
    "url": f"{SITE}/especialista/tiago-jun-sasaki/",
    "jobTitle": "Engenheiro Civil e consultor B2G",
    "worksFor": {"@id": f"{SITE}/#organization"},
}

SVG_SPRITE = """<svg aria-hidden="true" class="svg-sprite" height="0" width="0">
<symbol id="i-arrow" viewbox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></symbol>
<symbol id="i-check" viewbox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></symbol>
<symbol id="i-chart" viewbox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"></path></symbol>
<symbol id="i-shield" viewbox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path></symbol>
<symbol id="i-building" viewbox="0 0 24 24"><path d="M3 21h18M5 21V9m14 12V9M3 9h18L12 3 3 9Z"></path></symbol>
<symbol id="i-file" viewbox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"></path></symbol>
<symbol id="i-menu" viewbox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"></path></symbol>
<symbol id="i-close" viewbox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></symbol>
<symbol id="i-whatsapp" viewbox="0 0 24 24"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.6Z"></path></symbol>
</svg>"""

HEADER = """<header class="site-header" id="inicio">
<div class="container header-inner">
<a aria-label="CONFENGE, página inicial" class="brand" href="/"><img alt="CONFENGE Inteligência Técnica" height="208" src="/assets/logo-confenge.png" width="800"/></a>
<nav aria-label="Navegação principal" class="desktop-nav">
<a href="/#atuacao">Atuação</a>
<a href="/conteudos/">Conteúdos</a>
<a href="/inteligencia/">Inteligência</a>
<a href="/#metodo">Método</a>
<a href="/#faq">Dúvidas</a>
</nav>
<a class="button button-primary header-cta" href="/#contato">Analisar meu cenário</a>
<button aria-controls="mobile-menu" aria-expanded="false" aria-label="Abrir menu" class="menu-toggle" type="button">
<svg class="icon menu-open"><use href="#i-menu"></use></svg><svg class="icon menu-close"><use href="#i-close"></use></svg>
</button>
</div>
<nav aria-label="Navegação móvel" class="mobile-nav" id="mobile-menu">
<a href="/#atuacao">Atuação</a><a href="/conteudos/">Conteúdos</a><a href="/inteligencia/">Inteligência</a><a href="/#metodo">Método</a><a href="/#faq">Dúvidas</a>
<a class="button button-primary" href="/#contato">Analisar meu cenário</a>
</nav>
</header>"""

FOOTER = """<footer class="site-footer">
<div class="container footer-top">
<div class="footer-brand"><img alt="CONFENGE" height="208" src="/assets/logo-confenge-white.png" width="800"/><p>Consultoria B2G especializada em engenharia, licitações, contratos e obras públicas.</p></div>
<div class="footer-links"><strong>Navegação</strong><a href="/">Início</a><a href="/conteudos/">Biblioteca técnica</a><a href="/inteligencia/">Inteligência de mercado</a><a href="/especialista/tiago-jun-sasaki/">Especialista</a><a href="/#contato">Contato</a></div>
<div class="footer-links footer-clusters"><strong>Inteligência</strong><a href="/inteligencia/mercados/">Mercados</a><a href="/inteligencia/orgaos/">Órgãos</a><a href="/inteligencia/precos/">Preços</a><a href="/inteligencia/concorrencia/">Concorrência</a><a href="/radar/">Radar</a></div>
<div class="footer-links"><strong>Contato</strong><a href="mailto:tiago.sasaki@confenge.com.br">tiago.sasaki@confenge.com.br</a><a href="tel:+5548988344559">(48) 98834-4559</a><span>Atendimento nacional</span></div>
</div>
<div class="container footer-bottom"><span>© <span id="year">2026</span> CONFENGE. CNPJ 52.407.089/0001-09.</span><a href="/privacidade/">Política de Privacidade</a></div>
</footer>"""


def e(s: Any) -> str:
    return html.escape("" if s is None else str(s), quote=True)


def money(v: Any) -> str:
    if v is None:
        return "—"
    try:
        n = float(v)
    except (TypeError, ValueError):
        return "—"
    return f"R$ {n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def wa_link(message: str) -> str:
    return f"{WA_BASE}?text={quote(message)}"


def attribution_query(meta: dict[str, Any], cta_position: str) -> str:
    parts = []
    for k in (
        "pseo_page_id",
        "page_type",
        "archetype",
        "segment",
        "region",
        "agency_id",
        "intent",
        "source_run_id",
        "dataset_hash",
        "origem",
    ):
        v = meta.get(k)
        if v:
            parts.append(f"{k}={quote(str(v)[:120])}")
    parts.append(f"cta_position={quote(cta_position)}")
    return "&".join(parts)


def form_href(meta: dict[str, Any], tema: str, cta_position: str = "form") -> str:
    q = attribution_query(meta, cta_position)
    return f"/?tema={quote(tema)}&origem={quote(meta.get('origem') or meta.get('url') or '/')}&{q}#contato"


def breadcrumbs_html(crumbs: list[tuple[str, str | None]]) -> str:
    items = []
    for i, (name, href) in enumerate(crumbs):
        if href and i < len(crumbs) - 1:
            items.append(
                f'<li><a href="{e(href)}">{e(name)}</a><span aria-hidden="true">/</span></li>'
            )
        else:
            items.append(f'<li aria-current="page">{e(name)}</li>')
    return f'<nav aria-label="Navegação estrutural" class="breadcrumbs container"><ol>{"".join(items)}</ol></nav>'


def breadcrumb_jsonld(crumbs: list[tuple[str, str | None]]) -> dict:
    elements = []
    for i, (name, href) in enumerate(crumbs, start=1):
        item: dict[str, Any] = {"@type": "ListItem", "position": i, "name": name}
        if href:
            item["item"] = href if href.startswith("http") else f"{SITE}{href}"
        elements.append(item)
    return {"@type": "BreadcrumbList", "itemListElement": elements}


def page_shell(
    *,
    title: str,
    description: str,
    canonical_path: str,
    robots: str,
    og_title: str | None = None,
    jsonld_graph: list[dict],
    body_main: str,
    wa_message: str,
    extra_head: str = "",
    data_attrs: dict[str, str] | None = None,
) -> str:
    canonical = f"{SITE}{canonical_path}"
    og_t = og_title or title
    attrs = data_attrs or {}
    body_attr = " ".join(f'data-{k}="{e(v)}"' for k, v in attrs.items())
    ld = json.dumps(
        {"@context": "https://schema.org", "@graph": jsonld_graph},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return f"""<!DOCTYPE html>
<html class="no-js" lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<title>{e(title)}</title>
<meta content="{e(description)}" name="description"/>
<meta content="{e(robots)}" name="robots"/>
<meta content="#061a33" name="theme-color"/>
<link href="{e(canonical)}" rel="canonical"/>
<link href="/assets/favicon-32.png" rel="icon" sizes="32x32" type="image/png"/>
<link href="/assets/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180"/>
<link href="/manifest.webmanifest" rel="manifest"/>
<script>document.documentElement.classList.replace('no-js','js');</script>
<link href="/styles.css" rel="stylesheet"/>
<script defer="" src="/script.js"></script>
<meta content="article" property="og:type"/>
<meta content="pt_BR" property="og:locale"/>
<meta content="CONFENGE" property="og:site_name"/>
<meta content="{e(og_t)}" property="og:title"/>
<meta content="{e(description)}" property="og:description"/>
<meta content="{e(canonical)}" property="og:url"/>
<meta content="{SITE}/assets/og-confenge.jpg" property="og:image"/>
<meta content="summary_large_image" name="twitter:card"/>
<meta content="Engº Tiago Sasaki" name="author"/>
<script type="application/ld+json">{ld}</script>
{extra_head}
</head>
<body {body_attr}>
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
{SVG_SPRITE}
{HEADER}
<main id="conteudo">
{body_main}
</main>
{FOOTER}
<a aria-label="Falar com a CONFENGE pelo WhatsApp" class="whatsapp-float" data-cta-position="float" data-content-cluster="pseo" href="{e(wa_link(wa_message))}" rel="noopener" target="_blank"><svg class="icon"><use href="#i-whatsapp"></use></svg></a>
</body>
</html>
"""


def indicators_html(items: list[tuple[str, str, str | None]]) -> str:
    """items: (label, value, hint)"""
    cards = []
    for label, value, hint in items:
        h = f"<small>{e(hint)}</small>" if hint else ""
        cards.append(
            f'<div class="criterion-card"><span>{e(label)}</span><div><h3>{e(value)}</h3>{h}</div></div>'
        )
    return f'<div class="criteria-grid">{"".join(cards)}</div>'


def table_html(headers: list[str], rows: list[list[Any]], caption: str | None = None) -> str:
    th = "".join(f"<th>{e(h)}</th>" for h in headers)
    trs = []
    for row in rows:
        trs.append("<tr>" + "".join(f"<td>{e(c)}</td>" for c in row) + "</tr>")
    cap = f"<caption>{e(caption)}</caption>" if caption else ""
    return (
        f'<div class="table-wrap" data-pseo-table="1"><table class="data-table">{cap}'
        f"<thead><tr>{th}</tr></thead><tbody>{''.join(trs)}</tbody></table></div>"
    )


def author_box() -> str:
    return """<section class="author-box"><div class="author-photo"><img src="/assets/tiago-sasaki-avatar-v11-sem-fundo.png" width="512" height="512" alt="Engº Tiago Sasaki" loading="lazy" decoding="async"/></div><div><span>Autor e responsável técnico pelo conteúdo</span><h2><a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a></h2><p>Engenheiro Civil formado pela EESC-USP, com experiência na iniciativa privada e na Administração Pública, atuando em fiscalização, gestão de contratos, orçamentação e decisões técnicas em obras públicas.</p><a class="text-link" href="/especialista/tiago-jun-sasaki/">Conhecer a experiência <svg class="icon"><use href="#i-arrow"></use></svg></a></div></section>"""


def cta_block(meta: dict[str, Any], label: str, wa_message: str, tema: str) -> str:
    wa = wa_link(wa_message)
    form = form_href(meta, tema, "inline_cta")
    attr = attribution_query(meta, "inline_cta")
    return f"""<section class="lead-inline" id="diagnostico-confenge" aria-label="Diagnóstico CONFENGE" data-pseo-cta="1" data-pseo-attr="{e(attr)}">
<div class="lead-inline-copy"><span>Próximo passo</span><strong>{e(label)}</strong>
<p>Contexto desta página de inteligência já vai na mensagem — sem cadastro em lista.</p></div>
<div class="lead-inline-actions">
<a class="button button-primary" data-cta-position="inline_cta" data-content-cluster="pseo" data-pseo-event="pseo_whatsapp_click" href="{e(wa)}" rel="noopener" target="_blank">WhatsApp</a>
<a class="button button-secondary" data-cta-position="form" data-content-cluster="pseo" data-pseo-event="pseo_cta_click" href="{e(form)}">Preferir formulário</a>
</div></section>"""


def methodology_block(
    period_start: str | None,
    period_end: str | None,
    sources: list[str],
    limitations: list[str],
    extra: str = "",
) -> str:
    src = "".join(f"<li>{e(s)}</li>" for s in sources) or "<li>Fontes públicas do datalake CONFENGE</li>"
    lim = "".join(f"<li>{e(s)}</li>" for s in limitations)
    return f"""<section class="sources-section" id="metodologia">
<p class="eyebrow">Metodologia e limitações</p>
<h2>Como estes dados foram produzidos</h2>
<p>Período dos dados: <strong>{e(period_start or '—')}</strong> a <strong>{e(period_end or '—')}</strong>.
Agregação read-only a partir de exportações sanitizadas do datalake (sem conexão do Netlify ao banco de produção).
Não é monitoramento em tempo real.</p>
{extra}
<p><strong>Fontes</strong></p><ul>{src}</ul>
<p><strong>Limitações</strong></p><ul>{lim}</ul>
<p class="technical-note">Conteúdo de inteligência decisória com base em evidência pública. Não constitui ranking comercial proprietário nem recomendação de participação em licitação específica.</p>
</section>"""


def confenge_help(service_paths: list[str], text: str) -> str:
    links = "".join(
        f'<li><a href="{e(p)}" data-pseo-event="pseo_related_page_click">{e(p.strip("/").replace("-", " "))}</a></li>'
        for p in service_paths[:4]
    )
    return f"""<section id="como-ajudamos">
<p class="eyebrow">Oferta coerente</p>
<h2>Como a CONFENGE pode ajudar neste cenário</h2>
<p>{e(text)}</p>
<ul>{links}</ul>
</section>"""
