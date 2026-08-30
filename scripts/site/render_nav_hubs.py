#!/usr/bin/env python3
"""Render the two task-first navigation hubs from data/site/brand.json.

Issue #183: the header labels "Serviços" and "Problemas que resolvemos" used to
point at home anchors (/#ofertas, /#jornadas), which drops a visitor who arrived
on an internal page back onto the home page. These two hubs are the destinations
that match the labels, and they are generated — never hand-edited — so the menu,
the mobile menu and the footer stay on one taxonomy.

Usage:
    python3 scripts/site/render_nav_hubs.py --check
    python3 scripts/site/render_nav_hubs.py --write
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
OFFER_FIT_MATRIX = ROOT / "data/commercial/offer-fit-matrix.v1.json"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.html_shell import (  # noqa: E402
    FOOTER,
    HEADER,
    SVG_SPRITE,
    breadcrumb_jsonld,
    breadcrumbs_html,
)
from scripts.site.public_ia import breadcrumb_trail  # noqa: E402
from scripts.site.shell_nav import (  # noqa: E402
    hub,
    load_brand,
    problem_clusters,
    problem_stages,
    sync_text,
)

SITE = "https://confenge.com.br"
SCRIPT_SRC = "/script.js"
MANAGED_EXTENSIONS = [
    (
        "<!-- GENERATED:CONTRACT-DEFENSE-HUB:START -->",
        "<!-- GENERATED:CONTRACT-DEFENSE-HUB:END -->",
        '<link href="/styles-offers.css" rel="stylesheet"/>',
    ),
]


def e(value: Any) -> str:
    return html_lib.escape("" if value is None else str(value), quote=True)


def _offer_fit_copy(route_key: str) -> dict[str, str]:
    payload = json.loads(OFFER_FIT_MATRIX.read_text(encoding="utf-8"))
    copy = (payload.get("route_copy") or {}).get(route_key) or {}
    headline = copy.get("headline")
    body = copy.get("body")
    if not headline or not body:
        raise ValueError(f"offer-fit route_copy missing for {route_key}")
    return {"headline": str(headline), "body": str(body)}


def _breadcrumbs(url: str, current: str) -> str:
    return breadcrumbs_html(breadcrumb_trail(url, current_label=current))


def _jsonld(
    url: str, title: str, description: str, crumb: str, items: list[dict[str, str]]
) -> str:
    graph = [
        {
            "@type": "WebPage",
            "@id": f"{SITE}{url}#webpage",
            "url": f"{SITE}{url}",
            "name": title,
            "description": description,
            "isPartOf": {"@id": f"{SITE}/#website"},
            "publisher": {"@id": f"{SITE}/#organization"},
        },
        {
            **breadcrumb_jsonld(breadcrumb_trail(url, current_label=crumb)),
            "@id": f"{SITE}{url}#breadcrumb",
        },
        {
            "@type": "ItemList",
            "@id": f"{SITE}{url}#itemlist",
            "numberOfItems": len(items),
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": i + 1,
                    "name": it["name"],
                    "url": f"{SITE}{it['url']}",
                }
                for i, it in enumerate(items)
            ],
        },
    ]
    payload = {"@context": "https://schema.org", "@graph": graph}
    return (
        '<script type="application/ld+json">'
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + "</script>"
    )


def _document(
    *,
    url: str,
    title: str,
    description: str,
    body: str,
    crumb: str,
    items: list[dict[str, str]],
    cluster: str,
) -> str:
    document = f"""<!DOCTYPE html>
<html class="no-js" lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<title>{e(title)}</title>
<meta content="{e(description)}" name="description"/>
<meta content="index,follow" name="robots"/>
<meta content="#061a33" name="theme-color"/>
<link href="{SITE}{url}" rel="canonical"/>
<meta content="website" property="og:type"/>
<meta content="{e(title)}" property="og:title"/>
<meta content="{e(description)}" property="og:description"/>
<meta content="{SITE}{url}" property="og:url"/>
<script>document.documentElement.classList.replace('no-js','js');</script>
<link href="/styles.css" rel="stylesheet"/>
<link href="/styles-hubs.css" rel="stylesheet"/>
<script defer="" src="{SCRIPT_SRC}"></script>
<meta content="Engº Tiago Sasaki" name="author"/>
{_jsonld(url, title, description, crumb, items)}
</head>
<body data-content-cluster="{e(cluster)}">
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
{SVG_SPRITE}
{HEADER}
<main id="conteudo">
{_breadcrumbs(url, crumb)}
{body}
</main>
{FOOTER}
</body>
</html>
"""
    # One shell source: the same normalizer that keeps every shipped page aligned.
    return sync_text(document, load_brand(), url)


def _preserve_managed_extensions(rendered: str, current: str | None) -> str:
    """Keep independently rendered public blocks without hiding broken markers."""
    if current is None:
        return rendered
    next_document = rendered
    for start, end, stylesheet in MANAGED_EXTENSIONS:
        start_count = current.count(start)
        end_count = current.count(end)
        if start_count != end_count:
            raise ValueError(
                f"managed extension marker mismatch: {start}={start_count}, {end}={end_count}"
            )
        if start_count == 0:
            continue
        if start_count != 1:
            raise ValueError(f"managed extension must be unique: {start}={start_count}")
        block_start = current.index(start)
        block_end = current.index(end, block_start) + len(end)
        block = current[block_start:block_end]
        if "</main>" not in next_document:
            raise ValueError("managed extension insertion point missing: </main>")
        next_document = next_document.replace("</main>", f"{block}\n</main>", 1)
        if stylesheet and stylesheet not in next_document:
            if "</head>" not in next_document:
                raise ValueError("managed extension stylesheet insertion point missing: </head>")
            next_document = next_document.replace("</head>", f"{stylesheet}\n</head>", 1)
    return next_document


def _services_body(brand: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    meta = hub(brand, "services")
    offers = brand.get("offers") or []
    problems = hub(brand, "problems")
    cards = []
    items = []
    for offer in offers:
        cards.append(
            '<a class="related-card" href="{url}">'
            "<span>{label}</span><strong>{name}</strong><small>{headline}</small>"
            "</a>".format(
                url=e(offer["url"]),
                label=e(offer.get("label") or ""),
                name=e(offer["name"]),
                headline=e(offer.get("headline") or ""),
            )
        )
        items.append({"name": offer["name"], "url": offer["url"]})
    grid = "".join(cards)
    return (
        f"""<section aria-labelledby="hub-title" class="section section--tight">
<div class="container">
<header class="section-head">
<p class="eyebrow">Serviços</p>
<h1 id="hub-title">{e(meta["h1"])}</h1>
<p class="section-lead">{e(meta["lead"])}</p>
<p class="section-proof">{e(meta["proof"])}</p>
</header>
<section class="lead-inline" data-commercial-route="medicoes-glosas" aria-label="Rota para medição, glosa e pagamento">
<div class="lead-inline-copy"><span>Medição ou glosa sob pressão</span>
<strong>Dossiê de Medição, Glosa e Pagamento</strong>
<p>Uma medição ou glosa do mesmo período, organizada em fatos, cálculo, provas e lacunas. Prazo-piloto de 5 dias úteis após os documentos mínimos. Não é petição jurídica nem promessa de recebimento.</p></div>
<div class="lead-inline-actions">
<a class="button button-primary" data-asset-family="hub" data-asset-id="servicos-obras-publicas" data-cta-id="hub-servicos-medicoes-glosas" data-cta-position="hub_services" data-journey="contrato" data-route-family="medicoes-glosas" href="/medicoes-glosas-obras-publicas/">Avaliar o Dossiê de Medição, Glosa e Pagamento <svg class="icon"><use href="#i-arrow"></use></svg></a>
</div>
</section>
<div class="related-grid">{grid}</div>
</div>
</section>
<section aria-labelledby="hub-next" class="section section--default">
<div class="container">
<header class="section-head">
<h2 class="hub-section-title" id="hub-next">O problema é outro ou ainda não está delimitado?</h2>
<p class="section-lead">O Diagnóstico da Operação em Obras Públicas é uma porta de entrada: mapeia onde a frente pública perde tempo, margem e controle e indica o próximo trabalho aplicável.</p>
</header>
<p><a class="button button-secondary" href="/diagnostico-b2g-360/">Começar pelo Diagnóstico da Operação em Obras Públicas <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
<p><a class="text-link" href="{e(problems["url"])}">Conhecer os problemas que resolvemos <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
<p><a class="text-link" href="/ferramentas/">Usar uma ferramenta antes de falar com a gente <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
</div>
</section>""",
        items,
    )


def _problems_body(brand: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    meta = hub(brand, "problems")
    services = hub(brand, "services")
    clusters = problem_clusters(brand)
    stages = problem_stages(brand)
    fit = _offer_fit_copy("problemas-que-resolvemos")
    blocks = []
    items = []
    for stage in stages:
        rows = [c for c in clusters if c.get("stage") == stage["id"]]
        if not rows:
            continue
        entries = "".join(
            '<li class="problem-theme"><a class="problem-theme-link" href="{url}">'
            '<span class="problem-theme-title">{label}</span>'
            '<span class="problem-theme-blurb">{summary}</span></a></li>'.format(
                url=e(row["url"]), label=e(row["label"]), summary=e(row["summary"])
            )
            for row in rows
        )
        for row in rows:
            items.append({"name": row["label"], "url": row["url"]})
        blocks.append(
            f'<section class="problem-stage" aria-labelledby="stage-{e(stage["id"])}">'
            f'<header class="problem-stage-head"><h3 id="stage-{e(stage["id"])}">'
            f'{e(stage["label"])}</h3><p>{e(stage["hint"])}</p></header>'
            f'<ul class="problem-theme-list">{entries}</ul></section>'
        )
    stages_html = "".join(blocks)
    return (
        f"""<section aria-labelledby="hub-title" class="section section--tight">
<div class="container">
<header class="section-head">
<p class="eyebrow">Problemas que resolvemos</p>
<h1 id="hub-title">{e(meta["h1"])}</h1>
<p class="section-lead">{e(meta["lead"])}</p>
<p class="section-proof">{e(meta["proof"])}</p>
</header>
<section class="lead-inline" data-commercial-route="defesa-margem" aria-label="Rota para contrato em execução">
<div class="lead-inline-copy"><span>O prazo já está correndo</span>
<strong>Defesa de margem em contrato público</strong>
<p>Enquanto a obra avança, é o registro contemporâneo que sustenta o pedido. A defesa de margem organiza evento, documento e cálculo antes que a posição enfraqueça.</p></div>
<div class="lead-inline-actions">
<a class="button button-primary" data-asset-family="hub" data-asset-id="problemas-que-resolvemos" data-cta-id="hub-problemas-defesa-margem" data-cta-position="hub_problems" data-journey="contrato" data-route-family="problemas-que-resolvemos" href="/defesa-margem-contratos-publicos/">Abrir a defesa de margem em contrato <svg class="icon"><use href="#i-arrow"></use></svg></a>
</div>
</section>
<h2 class="hub-section-title" id="hub-stages">Onde você está no ciclo do contrato?</h2>
<div class="problem-stages" aria-labelledby="hub-stages">{stages_html}</div>
</div>
</section>
<section class="section" id="fit-economico" data-offer-fit="1">
<div class="container narrow">
<p class="eyebrow">Fit econômico</p>
<h2>{e(fit["headline"])}</h2>
<p>{e(fit["body"])}</p>
</div>
</section>
<section aria-labelledby="hub-next" class="section section--default">
<div class="container">
<header class="section-head">
<h2 class="hub-section-title" id="hub-next">Ainda não sabe em qual frente o seu caso entra?</h2>
<p class="section-lead">A escolha muda conforme o contrato já esteja assinado, a obra em andamento ou o prazo de resposta correndo. Os serviços mostram como cada frente é conduzida.</p>
</header>
<p><a class="text-link" href="{e(services["url"])}">Conhecer os serviços <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
<p><a class="text-link" href="/ferramentas/">Calcular o seu caso nas ferramentas públicas <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
</div>
</section>""",
        items,
    )


def render_pages() -> dict[str, str]:
    brand = load_brand()
    out: dict[str, str] = {}

    services_meta = hub(brand, "services")
    body, items = _services_body(brand)
    out[services_meta["url"]] = _document(
        url=services_meta["url"],
        title=f"{services_meta['title']} | CONFENGE",
        description=services_meta["description"],
        body=body,
        crumb=services_meta["label"],
        items=items,
        cluster="servicos",
    )

    problems_meta = hub(brand, "problems")
    body, items = _problems_body(brand)
    out[problems_meta["url"]] = _document(
        url=problems_meta["url"],
        title=f"{problems_meta['title']} | CONFENGE",
        description=problems_meta["description"],
        body=body,
        crumb=problems_meta["label"],
        items=items,
        cluster="problemas",
    )
    return out


def run(write: bool) -> int:
    pages = render_pages()
    drift: list[str] = []
    for url, text in pages.items():
        path = ROOT / url.strip("/") / "index.html"
        current = path.read_text(encoding="utf-8") if path.exists() else None
        text = _preserve_managed_extensions(text, current)
        if current == text:
            continue
        drift.append(url)
        if write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
    if write:
        print(json.dumps({"rendered": sorted(pages), "updated": drift}, ensure_ascii=False))
        return 0
    if drift:
        print("FAIL nav hubs differ from data/site/brand.json:", drift)
        print("  run: python3 scripts/site/render_nav_hubs.py --write")
        return 1
    print("PASS nav hubs match data/site/brand.json")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--write", action="store_true")
    args = parser.parse_args(argv)
    return run(write=bool(args.write))


if __name__ == "__main__":
    sys.exit(main())
