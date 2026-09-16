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
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
OFFER_FIT_MATRIX = ROOT / "data/commercial/offer-fit-matrix.v1.json"
DELIVERABLES_REGISTRY = ROOT / "data/commercial/deliverables-registry.v1.json"
WHATSAPP_MESSAGES = ROOT / "data/site/whatsapp-messages.json"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.html_shell import (  # noqa: E402
    FOOTER,
    HEADER,
    SVG_SPRITE,
    breadcrumb_jsonld,
    breadcrumbs_html,
    wa_link,
)
from scripts.site.public_ia import breadcrumb_trail, load_ia_map  # noqa: E402
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


def _proof_html(meta: dict[str, Any]) -> str:
    """Escaped proof sentence with its one verifiable destination linked.

    The first-fold contract (#327) asks for a reason to believe that a skeptical
    visitor can check without registering. A sentence claiming public tools or
    published examples is a claim; the link is the check. The anchor text stays
    inside `proof`, so the visible sentence and the data stay identical.
    """
    proof = e(meta["proof"])
    link = meta.get("proof_link")
    if not link:
        return proof
    anchor = e(link["text"])
    if anchor not in proof:
        raise SystemExit(
            f"proof_link.text is absent from proof: {link['text']!r}"
        )
    return proof.replace(anchor, f'<a href="{e(link["href"])}">{anchor}</a>', 1)


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


def _price_terms(deliverable_id: str) -> str:
    """Published price and deadline of one registry item, as the hub card prints them.

    The situations block repeats a price only when the same page already publishes it
    inside the generated contract-products block; reading the registry keeps both
    surfaces equal by construction instead of by a hand-typed literal.
    """
    payload = json.loads(DELIVERABLES_REGISTRY.read_text(encoding="utf-8"))
    row = next(
        (r for r in payload.get("deliverables") or [] if r.get("deliverable_id") == deliverable_id),
        None,
    )
    if row is None:
        raise ValueError(f"deliverable missing in registry: {deliverable_id}")
    cents = int(row["price"]["amount_cents"])
    reais = f"{cents // 100:,}".replace(",", ".")
    sla = row.get("sla") or {}
    lo, hi = sla.get("business_days_min"), sla.get("business_days_max")
    if lo is None:
        raise ValueError(f"deliverable without business days: {deliverable_id}")
    days = f"{lo} dias úteis" if lo == hi else f"{lo} a {hi} dias úteis"
    return f"R$ {reais}, {days}"


def _whatsapp(key: str) -> str:
    payload = json.loads(WHATSAPP_MESSAGES.read_text(encoding="utf-8"))
    message = (payload.get("messages") or {}).get(key)
    if not message:
        raise ValueError(f"whatsapp message missing: {key}")
    return wa_link(message)


def _need_rows(rows: list[dict[str, str]]) -> str:
    """One need per row: the need in the visitor's words, then the work and its use."""
    return "".join(
        '<li class="problem-theme"><a class="problem-theme-link" href="{url}">'
        '<span class="problem-theme-title">{title}</span>'
        '<span class="problem-theme-blurb">{blurb}</span></a></li>'.format(
            url=e(row["url"]), title=e(row["title"]), blurb=e(row["blurb"])
        )
        for row in rows
    )


def _situation_block(situation: dict[str, Any]) -> str:
    return (
        f'<section class="problem-stage" aria-labelledby="{e(situation["id"])}">'
        f'<header class="problem-stage-head"><h3 id="{e(situation["id"])}">'
        f'{e(situation["title"])}</h3><p>{e(situation["work"])}</p></header>'
        f'<ul class="problem-theme-list">{_need_rows(situation["rows"])}</ul></section>'
    )


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
<link rel="preload" as="font" type="font/woff2" href="/assets/archivo-var-latin-bf6e041e.woff2" crossorigin="anonymous"/>
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


def _preserve_staged_shell(rendered: str, current: str | None, url: str) -> str:
    """Keep generated hub bodies checked while MV-04 chrome awaits integration."""
    if current is None:
        return rendered
    rollout = load_ia_map().get("rollout") or {}
    if rollout.get("shell_scope") != "campaign_routes_only":
        return rendered
    if url in set(rollout.get("campaign_routes") or []):
        return rendered
    next_document = rendered
    for tag in ("header", "footer"):
        pattern = re.compile(rf"<{tag}\b[\s\S]*?</{tag}>", re.IGNORECASE)
        existing = pattern.search(current)
        if existing and pattern.search(next_document):
            next_document = pattern.sub(existing.group(0), next_document, count=1)
    return next_document


def _services_situations() -> list[dict[str, Any]]:
    """Buyer situations of the public-works vertical, each with the work assumed,
    the delivery and its use, the published price where this page already publishes
    it, and one main path (plus one support path only when the destination differs).

    Prices come from the registry, never from a literal, so the situation rows and the
    generated contract-products block cannot disagree. Pages that do not publish a
    price on their own route get no price here.
    """
    return [
        {
            "id": "situacao-edital",
            "title": "Edital publicado e a decisão de entrar",
            "work": (
                "Lemos o edital, a habilitação, o acervo e a planilha e escrevemos o que a "
                "proposta precisa cobrir para não perder margem depois da assinatura. Você "
                "decide participar ou recusar com a leitura pronta; o resultado do certame "
                "pertence à disputa."
            ),
            "rows": [
                {
                    "url": "/diagnostico-pre-licitacao/",
                    "title": "Decidir se disputa o edital",
                    "blurb": (
                        "Leitura crítica do edital, habilitação, acervo e riscos, para decidir "
                        "participar ou recusar antes de comprometer capital."
                    ),
                },
                {
                    "url": "/auditoria-orcamento-licitacao/",
                    "title": "Conferir planilha, BDI e exequibilidade",
                    "blurb": (
                        "Preço unitário, referência SINAPI e SICRO e composição de BDI conferidos "
                        "antes de assinar a proposta."
                    ),
                },
            ],
        },
        {
            "id": "situacao-medicao",
            "title": "Medição glosada ou pagamento retido",
            "work": (
                "Lemos o critério contratual de medição, o boletim contestado e a memória de "
                "quantitativos, apuramos em reais o que está glosado ou retido e escrevemos a "
                "posição técnica que a sua empresa apresenta ao fiscal."
            ),
            "rows": [
                {
                    "url": "/medicoes-glosas-obras-publicas/",
                    "title": f"Dossiê de Medição, Glosa e Pagamento: {_price_terms('CFG-D18')}",
                    "blurb": (
                        "Um período de medição por unidade. Cronologia com prova, diferença em "
                        "reais entre medido e glosado, itens controvertidos e parcela "
                        "incontroversa para protocolar a contestação. O órgão decide o ateste e "
                        "o pagamento."
                    ),
                },
            ],
        },
        {
            "id": "situacao-aditivo",
            "title": "Serviço extra, aditivo ou prazo estourando",
            "work": (
                "Separamos o que mudou de escopo, custo ou prazo, ligamos cada mudança ao "
                "registro contemporâneo da obra e calculamos o efeito em reais e em dias, "
                "para instruir o pedido antes de executar sem cobertura."
            ),
            "rows": [
                {
                    "url": "/aditivos-obras-publicas/",
                    "title": f"Dossiê de Aditivo e Serviço Extra: {_price_terms('CFG-D19')}",
                    "blurb": (
                        "Prova da mudança de escopo, custo e prazo, na forma que instrui o aditivo."
                    ),
                },
                {
                    "url": "/atrasos-prorrogacao-obras-publicas/",
                    "title": f"Dossiê de Atraso e Prorrogação: {_price_terms('CFG-D20')}",
                    "blurb": (
                        "Causa, responsabilidade e dias afetados no caminho crítico para instruir "
                        "o pedido de prorrogação."
                    ),
                },
            ],
        },
        {
            "id": "situacao-reequilibrio",
            "title": "Custo que saiu da curva e margem ameaçada",
            "work": (
                "Reconstruímos fato, nexo e cálculo do desequilíbrio, ou localizamos os eventos "
                "do contrato que ainda merecem ação, e entregamos o número e a prova que "
                "sustentam o pedido. O deferimento é decisão da Administração."
            ),
            "rows": [
                {
                    "url": "/reequilibrio-obras-publicas/",
                    "title": (
                        "Dossiê de Reequilíbrio Econômico-Financeiro: "
                        f"{_price_terms('CFG-D22')}"
                    ),
                    "blurb": (
                        "Fato, nexo, impacto e cálculo ligados aos documentos que a Administração "
                        "exige no pedido."
                    ),
                },
                {
                    "url": "/defesa-margem-contratos-publicos/",
                    "title": f"Diagnóstico de Riscos à Margem: {_price_terms('CFG-D17')}",
                    "blurb": (
                        "Eventos localizados e ordenados por prioridade antes de virarem perda; "
                        "o valor vira crédito em um dossiê contratado em 30 dias."
                    ),
                },
            ],
        },
        {
            "id": "situacao-rotina",
            "title": "Vários contratos e eventos o ano inteiro",
            "work": (
                "Assumimos a rotina de registro, comunicação formal e controle de prazos de "
                "cada contrato, ou a pauta semanal de decisão da frente pública, para que o "
                "conflito não encontre a empresa sem prova."
            ),
            "rows": [
                {
                    "url": "/acompanhamento-contratos-obras/",
                    "title": "Acompanhamento Preventivo do Contrato Público",
                    "blurb": (
                        "Cadência semanal de registro e uma reunião executiva por mês, por "
                        "contrato; a mensalidade é confirmada na primeira conversa."
                    ),
                },
                {
                    "url": "/diretoria-b2g/",
                    "title": "Diretoria Fracionada para o Mercado Público",
                    "blurb": (
                        "Prioridades, decisão de participar ou recusar, indicadores e memória das "
                        "decisões, sem montar diretoria interna; mensalidade publicada na página."
                    ),
                },
            ],
        },
        {
            "id": "situacao-orgao",
            "title": "Órgão público planejando a contratação de uma obra",
            "work": (
                "Do lado do órgão, estruturamos tecnicamente a contratação: escopo, orçamento e "
                "memória de referência, critérios de medição e matriz de risco, para planejar o "
                "certame. Não atuamos para contratante e contratada no mesmo contrato."
            ),
            "rows": [
                {
                    "url": _whatsapp("orgao_planejamento"),
                    "title": "Conversar sobre a contratação que o órgão planeja",
                    "blurb": (
                        "Sem formulário: descreva o objeto e a fase pelo WhatsApp. A resposta "
                        "nomeia o trabalho, o que o órgão recebe e o que falta reunir."
                    ),
                },
            ],
        },
    ]


def _other_needs() -> list[dict[str, str]]:
    """Needs of contract that have their own page or line but no situation block above."""
    return [
        {
            "url": "/defesa-tecnica-contratos-publicos/",
            "title": "Notificação, multa ou sanção para responder",
            "blurb": (
                f"Subsídio Técnico para Notificação ou Sanção: {_price_terms('CFG-D23')}. "
                "Fatos e provas técnicas para a resposta, coordenada com o jurídico da empresa."
            ),
        },
        {
            "url": "#entrega-21",
            "title": "Reajuste pela cláusula e pela data-base do contrato",
            "blurb": (
                f"Cálculo de Reajuste Contratual: {_price_terms('CFG-D21')}. "
                "Pedido pelo formulário desta página."
            ),
        },
        {
            "url": "/bid-room-licitacoes-obras/",
            "title": "Proposta crítica que exige coordenação de várias frentes",
            "blurb": (
                "Operação de Proposta para Licitação Crítica: leitura, habilitação, acervo, "
                "orçamento, cronograma e revisão independente; o nível de trabalho é definido "
                "na conversa inicial."
            ),
        },
        {
            "url": "/diagnostico-b2g-360/",
            "title": "Não sabe onde a operação perde tempo e margem",
            "blurb": (
                "Diagnóstico da Operação em Obras Públicas: mapa de perdas e prioridades para "
                "90 dias, antes de escolher o próximo trabalho."
            ),
        },
        {
            "url": "/diagnostico-b2g-expansao/",
            "title": "Decidir onde crescer no mercado público",
            "blurb": (
                "Diagnóstico de Expansão no Mercado Público: mercado, órgãos, concorrentes e "
                "preços reunidos para a mesma decisão, com preço publicado na página."
            ),
        },
        {
            "url": "/entregas/#enquadrar",
            "title": "Uma análise avulsa de licitações ou mercado, com preço publicado",
            "blurb": (
                "Radar de licitações, mapa de órgãos, concorrentes e referências de preço, "
                "cada uma com exemplo demonstrativo para consultar antes de pedir."
            ),
        },
    ]


def _services_body(brand: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    meta = hub(brand, "services")
    problems = hub(brand, "problems")
    situations = _services_situations()
    others = _other_needs()
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for situation in situations:
        for row in situation["rows"]:
            if row["url"].startswith("/") and "#" not in row["url"] and row["url"] not in seen:
                seen.add(row["url"])
                items.append({"name": row["title"].split(":")[0], "url": row["url"]})
    for row in others:
        if row["url"].startswith("/") and "#" not in row["url"] and row["url"] not in seen:
            seen.add(row["url"])
            # O título visível nomeia a situação do comprador; o item do
            # ItemList é o produto, nomeado no início do texto de apoio.
            product = row["blurb"].split(":")[0].strip() if ":" in row["blurb"] else row["title"]
            items.append({"name": product, "url": row["url"]})
    items.append(
        {
            "name": "Análises técnicas documentadas de contratos públicos",
            "url": "/analises-contratos-publicos/",
        }
    )
    situations_html = "".join(_situation_block(s) for s in situations)
    medicao = _price_terms("CFG-D18")
    return (
        f"""<section aria-labelledby="hub-title" class="section section--tight">
<div class="container">
<header class="section-head">
<p class="eyebrow">{e(meta["eyebrow"])}</p>
<h1 id="hub-title">{e(meta["h1"])}</h1>
<p class="section-lead">{e(meta["lead"])}</p>
<p class="section-proof">{_proof_html(meta)}</p>
</header>
<section class="lead-inline" data-commercial-route="medicoes-glosas" aria-label="Rota para medição, glosa e pagamento">
<div class="lead-inline-copy"><span>Medição glosada ou retida</span>
<strong>Dossiê de Medição, Glosa e Pagamento</strong>
<p>{e(medicao)} após os documentos mínimos, por medição ou glosa de um mesmo período. Apuramos em reais o que está retido, declaramos as lacunas e escrevemos a posição que você apresenta ao fiscal. Não é petição jurídica nem promessa de recebimento.</p></div>
<div class="lead-inline-actions">
<a class="button button-primary" data-asset-family="hub" data-asset-id="servicos-obras-publicas" data-cta-id="hub-servicos-medicoes-glosas" data-cta-position="hub_services" data-journey="contrato" data-route-family="medicoes-glosas" href="/medicoes-glosas-obras-publicas/">Avaliar o Dossiê de Medição, Glosa e Pagamento <svg class="icon"><use href="#i-arrow"></use></svg></a>
</div>
</section>
</div>
</section>
<section aria-labelledby="hub-situacoes" class="section section--default">
<div class="container">
<header class="section-head">
<h2 class="hub-section-title" id="hub-situacoes">Em que ponto do contrato você está?</h2>
<p class="section-lead">Cada situação diz o que assumimos, o que chega às suas mãos e para que serve. Preço e prazo aparecem onde já estão publicados; nos demais, a proposta nomeia o valor depois da leitura do caso.</p>
</header>
<div class="problem-stages">{situations_html}</div>
</div>
</section>
<section aria-labelledby="hub-outras" class="section section--default">
<div class="container">
<header class="section-head">
<h2 class="hub-section-title" id="hub-outras">Outras necessidades de contrato</h2>
<p class="section-lead">Necessidades que não cabem nas situações acima e já têm trabalho, entrega e caminho definidos.</p>
</header>
<ul class="problem-theme-list">{_need_rows(others)}</ul>
</div>
</section>
<section aria-labelledby="hub-next" class="section section--default">
<div class="container">
<header class="section-head">
<h2 class="hub-section-title" id="hub-next">Ainda não sabe nomear o evento?</h2>
<p class="section-lead">Descreva o contrato e o que aconteceu. É uma conversa técnica, sem contratação nem pagamento; sem formulário e sem documento sensível neste primeiro contato. A resposta nomeia o serviço, o que você recebe e o que falta reunir. Casos urgentes de contrato: resposta em até 1 dia útil; demais, em até 2 dias úteis.</p>
</header>
<p><a class="button button-secondary" data-cta-position="hub_services_next" data-event-name="whatsapp_click" href="{e(_whatsapp("contrato_pressao"))}" rel="noopener" target="_blank">Falar pelo WhatsApp <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
<p><a class="text-link" href="{e(problems["url"])}">Reconhecer o problema pelo ciclo do contrato <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
<p><a class="text-link" href="/ferramentas/">Calcular limite de aditivo, atraso, reequilíbrio ou margem nas ferramentas públicas <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
<p><a class="text-link" href="/analises-contratos-publicos/">Examinar análises técnicas documentadas <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
<p><small>As análises examinam fontes públicas, método, cálculos e limites. Não são casos de cliente e não afirmam relação comercial com as partes dos contratos.</small></p>
</div>
</section>""",
        items,
    )


def _problems_body(brand: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    meta = hub(brand, "problems")
    services = hub(brand, "services")
    corporate = hub(brand, "corporate_services")
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
<p class="eyebrow">{e(meta["eyebrow"])}</p>
<h1 id="hub-title">{e(meta["h1"])}</h1>
<p class="section-lead">{e(meta["lead"])}</p>
<p class="section-proof">{_proof_html(meta)}</p>
</header>
<section class="lead-inline" data-commercial-route="defesa-margem" aria-label="Rota para contrato em execução">
<div class="lead-inline-copy"><span>Mais de um evento aberto</span>
<strong>Diagnóstico de Riscos à Margem</strong>
<p>Localizamos os eventos do contrato que ainda podem virar perda e devolvemos a lista por prioridade, com o documento que sustenta cada um, enquanto o registro ainda existe.</p></div>
<div class="lead-inline-actions">
<a class="button button-primary" data-asset-family="hub" data-asset-id="problemas-que-resolvemos" data-cta-id="hub-problemas-defesa-margem" data-cta-position="hub_problems" data-journey="contrato" data-route-family="problemas-que-resolvemos" href="/defesa-margem-contratos-publicos/">Ver o Diagnóstico de Riscos à Margem <svg class="icon"><use href="#i-arrow"></use></svg></a>
</div>
</section>
<h2 class="hub-section-title" id="hub-stages">Onde você está no ciclo do contrato?</h2>
<div class="problem-stages" aria-labelledby="hub-stages">{stages_html}</div>
</div>
</section>
<section class="section" id="fit-economico" data-offer-fit="1">
<div class="container narrow">
<p class="eyebrow">Qual formato cabe no seu caso</p>
<h2>{e(fit["headline"])}</h2>
<p>Antes de escolher entre um dossiê do evento, um diagnóstico ou uma rotina mensal, vale saber o que muda de um para outro: o dossiê responde a um evento com número e prova; o diagnóstico ordena o que atacar primeiro; a rotina mantém o registro em dia o ano inteiro.</p>
<p>{e(fit["body"])}</p>
<p><a class="text-link" href="{e(services["url"])}#hub-situacoes">Ver preço e prazo publicados por situação em Obras públicas <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
</div>
</section>
<section aria-labelledby="hub-next" class="section section--default">
<div class="container">
<header class="section-head">
<h2 class="hub-section-title" id="hub-next">Ainda não sabe nomear o evento?</h2>
<p class="section-lead">Descreva o contrato e o que aconteceu. É uma conversa técnica, sem contratação nem pagamento; sem formulário e sem documento sensível neste primeiro contato. A resposta nomeia o serviço, o que você recebe e o que falta reunir. Casos urgentes de contrato: resposta em até 1 dia útil; demais, em até 2 dias úteis.</p>
</header>
<p><a class="button button-secondary" data-cta-position="hub_problems_next" data-event-name="whatsapp_click" href="{e(_whatsapp("contrato_pressao"))}" rel="noopener" target="_blank">Falar pelo WhatsApp <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
<p><a class="text-link" href="{e(services["url"])}">Serviços para obras públicas por situação <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
<p><a class="text-link" href="{e(corporate["url"])}">Outra situação: projeto, imóvel, perícia ou segurança do trabalho <svg class="icon"><use href="#i-arrow"></use></svg></a></p>
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
        text = _preserve_staged_shell(text, current, url)
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
