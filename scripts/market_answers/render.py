"""Render the one answer-first paving-ticket canary.

First fold: direct answer, faixa/distribuição, n, período, geografia,
ticket-not-km, accessible graph/table, short method, limitations, as_of,
sources/method link. Later: how to read, what explains differences,
evidence, #83 analyses when present, what data cannot conclude, CTA.
"""

from __future__ import annotations

import json
from html import escape
from pathlib import Path
from typing import Any

from scripts.market_answers import (
    ASSET_FAMILY,
    ASSET_ID,
    CANONICAL,
    FAMILY_PATH,
    PAGE_DIR,
    PRODUCER_STATUS_FIXTURE,
    QUESTION_TEXT,
    ROUTE_FAMILY,
    SITE,
)
from scripts.market_answers.events import catalog
from scripts.market_answers.gate import GateDecision
from scripts.market_answers.urls import drilldown_model


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def _brl(value: Any) -> str:
    if value is None:
        return "n/d"
    number = float(value)
    formatted = f"{number:,.0f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {formatted}"


def _text(value: Any) -> str:
    return str(value or "").strip()


def period_label(payload: dict[str, Any]) -> str:
    period = payload.get("period") if isinstance(payload.get("period"), dict) else {}
    return _text(period.get("label")) or (
        f"{period.get('start') or ''}–{period.get('end') or ''}".strip("–")
    )


def geography_label(payload: dict[str, Any]) -> str:
    geo = payload.get("geography") if isinstance(payload.get("geography"), dict) else {}
    return _text(geo.get("label")) or ", ".join(geo.get("ufs") or []) or "recorte publicado"


def format_n(payload: dict[str, Any]) -> str:
    stats = payload.get("statistics") or {}
    n = stats.get("n")
    try:
        return str(int(n))
    except (TypeError, ValueError):
        return "n/d"


def _distribution_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    dist = payload.get("distribution") if isinstance(payload.get("distribution"), dict) else {}
    rows = []
    for item in dist.get("buckets") or []:
        if isinstance(item, dict):
            rows.append(item)
    return rows


def _svg_chart(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    width = 640
    height = 220
    pad_l, pad_r, pad_t, pad_b = 12, 12, 12, 48
    inner_w = width - pad_l - pad_r
    inner_h = height - pad_t - pad_b
    max_count = max(int(row.get("count") or 0) for row in rows) or 1
    gap = 12
    bar_w = max(16, (inner_w - gap * (len(rows) - 1)) / len(rows))
    bars = []
    labels = []
    for idx, row in enumerate(rows):
        count = int(row.get("count") or 0)
        bar_h = (count / max_count) * inner_h
        x = pad_l + idx * (bar_w + gap)
        y = pad_t + (inner_h - bar_h)
        label = escape(_text(row.get("label") or f"faixa {idx + 1}"))
        bars.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{bar_h:.1f}" '
            f'fill="#1f4e79" role="presentation">'
            f"<title>{label}: {count} contratos</title></rect>"
        )
        labels.append(
            f'<text x="{x + bar_w / 2:.1f}" y="{height - 16}" text-anchor="middle" '
            f'font-size="11" fill="#334155">{label}</text>'
        )
        labels.append(
            f'<text x="{x + bar_w / 2:.1f}" y="{y - 4:.1f}" text-anchor="middle" '
            f'font-size="11" fill="#0f172a">{count}</text>'
        )
    return (
        f'<svg class="ma-chart" viewBox="0 0 {width} {height}" width="100%" '
        f'role="img" aria-labelledby="ma-chart-title ma-chart-desc">'
        f'<title id="ma-chart-title">Distribuição dos tickets contratuais no recorte</title>'
        f'<desc id="ma-chart-desc">Gráfico de barras com a contagem de contratos '
        f"em cada faixa de valor integral nominal. A tabela seguinte repete os mesmos números.</desc>"
        f"{''.join(bars)}{''.join(labels)}</svg>"
    )


def _table(rows: list[dict[str, Any]]) -> str:
    body = []
    for row in rows:
        body.append(
            "<tr>"
            f"<td>{escape(_text(row.get('label')))}</td>"
            f"<td>{escape(str(row.get('count') if row.get('count') is not None else 'n/d'))}</td>"
            f"<td>{escape(str(row.get('share') if row.get('share') is not None else 'n/d'))}</td>"
            "</tr>"
        )
    return (
        '<table class="ma-table">'
        "<caption>Faixas de ticket contratual (valor integral nominal, não custo por km)</caption>"
        "<thead><tr><th scope=\"col\">Faixa</th><th scope=\"col\">Contratos (n)</th>"
        "<th scope=\"col\">Participação</th></tr></thead>"
        f"<tbody>{''.join(body)}</tbody></table>"
    )


def first_fold_copy(payload: dict[str, Any]) -> dict[str, str]:
    stats = payload.get("statistics") or {}
    return {
        "answer": (
            f"No recorte publicado, o ticket contratual típico de pavimentação "
            f"é {_brl(stats.get('median'))} (mediana do valor integral nominal do instrumento)."
        ),
        "range": (
            f"Faixa interquartil: {_brl(stats.get('p25'))} (P25) a {_brl(stats.get('p75'))} (P75)."
        ),
        "n": f"Amostra: {format_n(payload)} contratos.",
        "period": f"Período: {period_label(payload)}.",
        "geography": f"Geografia: {geography_label(payload)}.",
        "ticket_not_km": "Este número é ticket contratual, não custo por km.",
    }


def _schema(payload: dict[str, Any], decision: GateDecision) -> dict[str, Any]:
    stats = payload.get("statistics") or {}
    description = (
        f"Resposta answer-first à pergunta «{QUESTION_TEXT}». "
        f"Grain: valor integral nominal. Mediana {_brl(stats.get('median'))}, "
        f"n={format_n(payload)}, {period_label(payload)}, {geography_label(payload)}. "
        "Não é custo por km. Não é claim nacional."
    )
    if decision.is_fixture:
        description += " Preview CONTRACT_FIXTURE; official_live=false."
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "FAQPage",
                "@id": f"{CANONICAL}#faq",
                "url": CANONICAL,
                "name": QUESTION_TEXT,
                "isAccessibleForFree": True,
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": QUESTION_TEXT,
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": description,
                        },
                    }
                ],
            },
            {
                "@type": "Dataset",
                "@id": f"{CANONICAL}#dataset",
                "name": "Ticket contratual típico de pavimentação (recorte)",
                "description": description,
                "url": CANONICAL,
                "creator": {"@type": "Organization", "name": "CONFENGE", "url": f"{SITE}/"},
                "dateModified": _text(payload.get("as_of")),
                "isAccessibleForFree": True,
                "identifier": decision.content_hash,
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Início", "item": f"{SITE}/"},
                    {"@type": "ListItem", "position": 2, "name": "Inteligência", "item": f"{SITE}/inteligencia/"},
                    {"@type": "ListItem", "position": 3, "name": "Valor típico de contratos de pavimentação"},
                ],
            },
        ],
    }


def render_html(
    record: dict[str, Any],
    payload: dict[str, Any],
    decision: GateDecision,
    *,
    site_root: Path | None = None,
) -> str:
    site_root = site_root or _root()
    fold = first_fold_copy(payload)
    stats = payload.get("statistics") or {}
    rows = _distribution_rows(payload)
    model = drilldown_model(payload, site_root=site_root)
    limitations = payload.get("limitations") or []
    method_short = _text(payload.get("method_short") or (payload.get("method") or {}).get("short"))
    if not method_short:
        method_short = (
            "Mediana e quartis do valor integral nominal do instrumento na tipologia "
            "de pavimentação do recorte. Não converte ticket em custo por km."
        )
    fixture = decision.is_fixture
    fixture_banner = ""
    if fixture:
        fixture_banner = (
            '<div class="ma-fixture" role="status">'
            "<strong>FIXTURE / PREVIEW: não é fato oficial.</strong> "
            f"<code>official_live=false</code> · <code>producer_status={escape(decision.producer_status or PRODUCER_STATUS_FIXTURE)}</code>. "
            "Esta página permanece noindex e fora do sitemap até existir payload official_live autorizado."
            "</div>"
        )
    strata_html = "".join(
        f'<li><a href="{escape(item["href"])}">{escape(item["label"])}</a>'
        f'{" <span class=\"ma-pill\">filtro noindex</span>" if item.get("noindex") else ""}</li>'
        for item in model["strata"]
    )
    evidence_html = []
    for item in model["contracts"]:
        analysis = ""
        if item.get("analysis_href"):
            analysis = (
                f' · <a data-ma-event="analysis_click" data-analysis-id="{escape(item["id"])}" '
                f'href="{escape(item["analysis_href"])}">análise técnica #83</a>'
            )
        else:
            analysis = " · análise técnica #83 ainda não publicada nesta superfície"
        evidence_html.append(
            f'<li id="evidencias-{escape(item["id"])}">'
            f'<a data-ma-event="evidence_drilldown" data-evidence-id="{escape(item["id"])}" '
            f'href="{escape(item["href"])}">{escape(item["label"] or item["id"])}</a>'
            f"{analysis}</li>"
        )
    if not evidence_html:
        evidence_html.append(
            "<li>Contratos de evidência ainda não autorizados no payload. "
            "O drill-down permanece no modelo, sem URL combinatória.</li>"
        )
    unknown_demand = record.get("demand") if isinstance(record.get("demand"), dict) else {}
    demand_note = _text(unknown_demand.get("note")) or (
        "Demanda observada em busca permanece UNKNOWN até existir evidência GSC da pergunta."
    )
    events = catalog(
        asset_version=str(record.get("version") or "1.0"),
        content_hash=decision.content_hash,
    )
    event_json = json.dumps(events, ensure_ascii=False)
    schema = json.dumps(_schema(payload, decision), ensure_ascii=False)
    limit_items = "".join(f"<li>{escape(_text(item))}</li>" for item in limitations)
    as_of = escape(_text(payload.get("as_of")))
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{escape(QUESTION_TEXT)} | CONFENGE</title>
<meta name="description" content="{escape(fold['answer'])} {escape(fold['ticket_not_km'])}"/>
<meta name="robots" content="{escape(decision.robots)}"/>
<link rel="canonical" href="{CANONICAL}"/>
<link rel="stylesheet" href="/styles.css"/>
<link rel="stylesheet" href="/styles-tools.css"/>
<link href="/assets/favicon-32.png" rel="icon" sizes="32x32" type="image/png"/>
<script type="application/ld+json">{schema}</script>
<style>
.ma-wrap {{ max-width: 46rem; margin: 0 auto; padding: 0 1rem 4rem; }}
.ma-fixture {{ background:#fff7ed; border:2px solid #c2410c; color:#7c2d12; padding:1rem 1.1rem; border-radius:8px; margin:1rem 0 1.5rem; }}
.ma-answer {{ background:#f8fafc; border:1px solid #dbe3ea; border-radius:10px; padding:1.25rem 1.35rem; margin:1rem 0 1.5rem; }}
.ma-kicker {{ letter-spacing:.04em; text-transform:uppercase; font-size:.78rem; color:#475569; margin:0 0 .4rem; }}
.ma-stat {{ font-size:clamp(1.8rem,4vw,2.6rem); line-height:1.15; margin:.2rem 0 0.6rem; }}
.ma-meta {{ display:grid; gap:.35rem; margin:0.75rem 0 0; }}
.ma-chart-wrap {{ margin:1.25rem 0; }}
.ma-table {{ width:100%; border-collapse:collapse; font-size:.92rem; margin:0.75rem 0 0; }}
.ma-table th,.ma-table td {{ border:1px solid #dbe3ea; padding:.45rem .55rem; text-align:left; }}
.ma-table th {{ background:#eef3f7; }}
.ma-method, .ma-limits {{ background:#fff; border:1px solid #dbe3ea; border-radius:8px; padding:1rem 1.1rem; margin:1rem 0; }}
.ma-pill {{ display:inline-block; font-size:.75rem; background:#e2e8f0; padding:.1rem .4rem; border-radius:999px; }}
.ma-cta {{ display:flex; flex-wrap:wrap; gap:.75rem; margin:1rem 0; }}
.ma-note {{ color:#475569; }}
</style>
</head>
<body data-asset-id="{ASSET_ID}" data-asset-family="{ASSET_FAMILY}" data-route-family="{ROUTE_FAMILY}" data-content-hash="{escape(decision.content_hash)}" data-producer-status="{escape(decision.producer_status)}" data-index-state="{escape(decision.state)}">
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
<header class="site-header" id="inicio">
<div class="container header-inner">
<a aria-label="CONFENGE, página inicial" class="brand" href="/"><img alt="CONFENGE Inteligência Técnica" height="208" src="/assets/logo-confenge.png" width="800"/></a>
<nav aria-label="Navegação principal" class="desktop-nav">
<a href="/#ofertas">Serviços</a>
<a href="/inteligencia/">Inteligência</a>
<a href="/conteudos/">Conteúdos e ferramentas</a>
<a href="/especialista/tiago-jun-sasaki/">Especialista</a>
</nav>
<a class="button button-primary header-cta" href="#cta">Ver próximo passo</a>
</div>
</header>
<main id="conteudo">
<nav aria-label="Navegação estrutural" class="breadcrumbs container"><ol>
<li><a href="/">Início</a><span aria-hidden="true">/</span></li>
<li><a href="/inteligencia/">Inteligência</a><span aria-hidden="true">/</span></li>
<li aria-current="page">Valor típico de contratos de pavimentação</li>
</ol></nav>
<div class="ma-wrap">
<p class="ma-kicker">Market Answer · recorte publicado · {escape(decision.robots)}</p>
<h1>{escape(QUESTION_TEXT)}</h1>
{fixture_banner}
<section id="resposta" class="ma-answer" aria-labelledby="resposta-titulo">
<p class="ma-kicker" id="resposta-titulo">Resposta direta</p>
<p class="ma-stat">{escape(fold["answer"])}</p>
<p>{escape(fold["range"])}</p>
<div class="ma-meta">
<p>{escape(fold["n"])}</p>
<p>{escape(fold["period"])}</p>
<p>{escape(fold["geography"])}</p>
<p><strong>{escape(fold["ticket_not_km"])}</strong></p>
</div>
<div class="ma-chart-wrap" id="distribuicao">
{_svg_chart(rows)}
{_table(rows)}
</div>
<div class="ma-method" id="metodologia">
<p class="ma-kicker">Método (curto)</p>
<p>{escape(method_short)}</p>
<p>Grain: valor integral nominal do instrumento. Unidade: {escape(_text(stats.get("unit") or "ticket_contratual_integral"))}. Moeda: {escape(_text(stats.get("currency") or "BRL"))}.</p>
<p><a href="#fontes">Fontes e metodologia completa</a> · <a href="/metodologia-inteligencia/">Como a CONFENGE lê evidências</a></p>
<p><strong>as_of:</strong> <time datetime="{as_of}">{as_of}</time></p>
</div>
<div class="ma-limits" id="limitacoes">
<p class="ma-kicker">Limitações</p>
<ul>{limit_items}</ul>
</div>
</section>

<section id="como-ler" aria-labelledby="como-ler-titulo">
<h2 id="como-ler-titulo">Como ler a distribuição</h2>
<p>A mediana é o contrato do meio quando os tickets são ordenados. P25 e P75 descrevem a faixa em que fica a metade central da amostra. Um contrato acima do P75 é grande neste recorte; isso não o torna irregular, superfaturado ou representativo do quilômetro construído.</p>
<p>Barras do gráfico repetem a tabela. Se o gráfico não carregar, os mesmos números permanecem na tabela acessível.</p>
</section>

<section id="diferencas" aria-labelledby="diferencas-titulo">
<h2 id="diferencas-titulo">O que explica diferenças</h2>
<p>Objeto (restauração, recapeamento, implantação), extensão não medida neste grain, regime, esfera, porte do município e ano de assinatura empurram o ticket. Sem quantidade física verificada, a diferença entre dois contratos não vira custo por km.</p>
</section>

<section id="evidencias" aria-labelledby="evidencias-titulo">
<h2 id="evidencias-titulo">Contratos e evidência</h2>
<p>Drill-down: mercado → estrato permitido → contratos/evidence → análise → X-Ray/CTA. Filtros dinâmicos nesta URL são noindex. Não há páginas combinatórias UF × município × objeto × métrica.</p>
<ul class="ma-strata">{strata_html}</ul>
<ul>{''.join(evidence_html)}</ul>
</section>

<section id="nao-conclui" aria-labelledby="nao-conclui-titulo">
<h2 id="nao-conclui-titulo">O que estes dados não permitem concluir</h2>
<ul>
<li>Não é o valor típico do Brasil. Não há claim nacional.</li>
<li>Não é custo, preço unitário ou custo por km de pavimentação.</li>
<li>Não é ranking de empresas, órgãos ou sobrepreço.</li>
<li>Não autoriza inferir irregularidade a partir de um outlier.</li>
<li>Demanda de busca da pergunta: <strong>UNKNOWN</strong>. {escape(demand_note)}</li>
</ul>
</section>

<section id="xray" aria-labelledby="xray-titulo">
<h2 id="xray-titulo">Veja sua empresa neste mercado</h2>
<p>O B2G X-Ray (carteira observada por CNPJ no mesmo factual plane) ainda não é um produto público. Este bloco só registra a intenção e o próximo passo. A resposta acima permanece visível sem cadastro.</p>
<p class="ma-cta">
<a class="button button-primary" data-ma-event="xray_start" data-cta-id="veja-sua-empresa" href="#cta">Veja sua empresa neste mercado</a>
</p>
</section>

<section id="cta" aria-labelledby="cta-titulo" data-ma-cta-block="1">
<h2 id="cta-titulo">Próximo passo</h2>
<p>A resposta e o método não ficam atrás de formulário. Se quiser aplicar o recorte à sua carteira ou pedir segunda leitura de um contrato, use um destes caminhos.</p>
<p class="ma-cta">
<a class="button button-primary" data-ma-event="cta_click" data-cta-id="veja-sua-empresa" href="#xray">Veja sua empresa neste mercado</a>
<a class="button" data-ma-event="cta_click" data-cta-id="analise-contrato" href="/ferramentas/diagnostico-defesa-margem/">Analise um contrato / peça segunda leitura</a>
</p>
<p class="ma-note">Atribuição: source <code>CONFENGE_WEB</code>, asset <code>{ASSET_ID}</code>, família <code>{ASSET_FAMILY}</code>. Correção: <a data-ma-event="correction_open" href="/correcoes/">pedir correção</a>.</p>
<form id="ma-next" class="tool-form" method="post" action="/.netlify/functions/lead" hidden>
<input type="hidden" name="asset_id" value="{ASSET_ID}"/>
<input type="hidden" name="asset_family" value="{ASSET_FAMILY}"/>
<input type="hidden" name="route_family" value="{ROUTE_FAMILY}"/>
<input type="hidden" name="cta_id" value="market-answer-next"/>
<input type="hidden" name="correlation_id" id="ma-correlation" value=""/>
</form>
</section>

<section id="fontes" aria-labelledby="fontes-titulo">
<h2 id="fontes-titulo">Fontes, versão e refresh</h2>
<ul>
<li>Schema: <code>{escape(_text(payload.get("schema")))}</code></li>
<li>content_hash: <code>{escape(decision.content_hash)}</code></li>
<li>producer_status: <code>{escape(decision.producer_status)}</code></li>
<li>producer_sha: <code>{escape(_text(payload.get("producer_sha")))}</code></li>
<li>Owner de refresh: {escape(_text(((record.get("refresh") or {{}}).get("owner")) if isinstance(record.get("refresh"), dict) else record.get("refresh_owner") or "CONFENGE / market-answers"))}</li>
<li>Estado do gate: <code>{escape(decision.state)}</code> · recomendação <code>{escape(decision.recommendation)}</code></li>
</ul>
<p>A leitura factual é SELECT-only, versionada e com proveniência. Notas internas de integração ficam fora desta página.</p>
</section>
</div>
</main>
<footer class="site-footer">
<div class="container footer-bottom"><span>© 2026 CONFENGE.</span><a href="/privacidade/">Política de Privacidade</a></div>
</footer>
<script id="ma-event-catalog" type="application/json">{event_json}</script>
<script defer src="/script.js"></script>
<script defer src="/assets/js/market-answer.js"></script>
</body>
</html>
"""


def write_page(
    record: dict[str, Any],
    payload: dict[str, Any],
    decision: GateDecision,
    *,
    site_root: Path | None = None,
) -> dict[str, Path]:
    root = site_root or _root()
    directory = root / PAGE_DIR
    directory.mkdir(parents=True, exist_ok=True)
    html = render_html(record, payload, decision, site_root=root)
    path = directory / "index.html"
    path.write_text(html, encoding="utf-8")
    return {"page": path}
