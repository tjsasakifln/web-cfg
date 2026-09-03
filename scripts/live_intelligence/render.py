"""Render live-opportunity pages (Surface A) from the validated projection.

Fail-closed by construction:

* Only records the adapter marked READY are rendered. Stale, rejected or
  fixture-as-live data produces no page.
* Every page ships ``noindex``. W1 declares no family in
  ``data/organic/public-family-registry.json``, and an indexable page without a
  declared family fails the conversion gate — so noindex is the honest state,
  not a workaround.
* There is deliberately **no** hub, sitemap, feed or robots/_headers sync here.
  A noindex route that something points at is a finding in `gate_index_surface`
  (``noindex_in_sitemap`` / ``noindex_in_hub_*`` / ``noindex_in_feed``), and W1
  puts internal-linking expansion out of scope.
* ``valor`` is rendered as plain declared data. No schema.org price markup and
  no commitment wording near the amount: this is a public estimate carried by
  the source document, never something CONFENGE sells.
"""

from __future__ import annotations

import argparse
import json
import shutil
from html import escape
from pathlib import Path
from typing import Any

from scripts.live_intelligence import (
    ADHERENCE_DISCLAIMER_PT,
    ASSET_FAMILY,
    COMPANY_ROUTE_PREFIX,
    DEFAULT_LIVE_DIR,
    FAMILY_SLUG,
    OPPORTUNITIES_OUT,
    ROUTE_FAMILY,
)

# One archetype per narrative block. Names are reused from
# data/site/design-system.json → section_archetypes; a section that repeats a
# neighbour's editorial job changes composition, never its label.
ARCHETYPE_BY_SECTION_ID = {
    "masthead": "analysis_masthead",
    "ficha": "evidence_record",
    "fontes": "source_ledger",
    "atualizacao": "method_disclosure",
    "limitacoes": "limitation_notice",
    "nao-concluir": "epistemic_boundary",
    "proximo-passo": "contextual_next_action",
    "hashes": "provenance_hashes",
}

PRAZO_LABEL = {
    "ABERTA": "Aberta",
    "SUSPENSA": "Suspensa",
    "ENCERRADA": "Encerrada",
    "UNKNOWN": "UNKNOWN",
}


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def archetype_attr(section_id: str) -> str:
    return f' data-section-archetype="{ARCHETYPE_BY_SECTION_ID[section_id]}"'


def e(value: Any) -> str:
    return escape(str(value if value is not None else ""), quote=True)


def _brl(amount: Any) -> str:
    """Format a declared amount. Absence stays UNKNOWN; it is never zero."""
    if amount in (None, "", "UNKNOWN"):
        return "UNKNOWN"
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return "UNKNOWN"
    inteiro, _, centavos = f"{value:,.2f}".partition(".")
    return f"R$ {inteiro.replace(',', '.')},{centavos}"


def _kv_rows(rows: list[tuple[str, str]]) -> str:
    cells = "".join(
        f"<tr><th scope=\"row\">{e(label)}</th><td>{e(value)}</td></tr>" for label, value in rows
    )
    return f"<table class=\"data-table\"><tbody>{cells}</tbody></table>"


def _sources_html(sources: list[dict[str, Any]]) -> str:
    if not sources:
        return "<p>UNKNOWN — a fonte não foi declarada.</p>"
    items = []
    for source in sources:
        nome = e(source.get("nome") or "Fonte pública")
        url = str(source.get("url") or "").strip()
        status = e(source.get("url_status") or "UNKNOWN")
        retrieved = e(source.get("retrieved_at") or "UNKNOWN")
        link = (
            f'<a href="{e(url)}" rel="nofollow noopener" target="_blank">{nome}</a>'
            if url.startswith("https://")
            else nome
        )
        items.append(
            f"<li>{link} · acesso declarado: {status} · coletado em: {retrieved}</li>"
        )
    return f"<ul class=\"source-ledger\">{''.join(items)}</ul>"


def _limitations_html(limitations: list[str]) -> str:
    if not limitations:
        return "<p>UNKNOWN — a fonte não declarou limitações.</p>"
    items = "".join(f"<li>{e(item)}</li>" for item in limitations)
    return f"<ul>{items}</ul>"


def render_opportunity_html(record: dict[str, Any]) -> str:
    """Render one opportunity page. Always noindex."""
    opportunity_id = record["opportunity_id"]
    objeto = record.get("objeto") or "UNKNOWN"
    orgao = record.get("orgao") or {}
    local = record.get("local") or {}
    prazo = record.get("prazo") or {}
    valor = record.get("valor") or {}
    freshness = record.get("freshness") or {}
    title = f"{objeto} — {orgao.get('nome', 'UNKNOWN')} | CONFENGE"
    description = (
        f"Dados públicos declarados da oportunidade {opportunity_id}: objeto, valor estimado "
        f"declarado na fonte, órgão, local, prazo e status, com fonte e data de referência."
    )
    status = str(prazo.get("status") or "UNKNOWN")
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<meta content="noindex,nofollow" name="robots"/>
<meta content="#061a33" name="theme-color"/>
<title>{e(title)}</title>
<link href="/assets/favicon-32.png" rel="icon" sizes="32x32" type="image/png"/>
<link href="/styles.css" rel="stylesheet"/>
<script defer="" src="/script.js?v=fortune02"></script>
<script defer="" src="/assets/js/live-intelligence.js"></script>
<meta content="{e(description)}" name="description"/>
</head>
<body class="simple-page" data-asset-id="{e(opportunity_id)}" data-asset-family="{e(ASSET_FAMILY)}" data-route-family="{e(ROUTE_FAMILY)}" data-intel-surface="opportunity" data-opportunity-id="{e(opportunity_id)}" data-index-state="NOINDEX">
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
<header class="site-header" id="inicio">
<div class="container header-inner">
<a aria-label="CONFENGE, página inicial" class="brand" href="/"><img alt="CONFENGE Inteligência Técnica" height="58" src="/assets/logo-confenge-500-f8a83f6d.png" width="224"/></a>
<nav aria-label="Navegação principal" class="desktop-nav">
<a data-cta-position="header_nav" href="/bid-room-licitacoes-obras/" style="min-height:44px">Edital e proposta</a>
<a data-cta-position="header_nav" href="/problemas-que-resolvemos/" style="min-height:44px">Contrato sob pressão</a>
<a data-cta-position="header_nav" href="/diretoria-b2g/" style="min-height:44px">Operação recorrente</a>
<a data-cta-position="header_nav" href="/conteudos/" style="min-height:44px">Biblioteca</a>
</nav>
<a class="button button-primary header-cta" href="/#formulario-contato">Analisar meu caso</a>
<button aria-controls="mobile-menu" aria-expanded="false" aria-label="Abrir menu" class="menu-toggle" type="button">
<svg class="icon menu-open"><use href="#i-menu"></use></svg><svg class="icon menu-close"><use href="#i-close"></use></svg>
</button>
</div>
<nav aria-label="Navegação móvel" class="mobile-nav" id="mobile-menu">
<a data-cta-position="mobile_nav" href="/bid-room-licitacoes-obras/" style="min-height:44px">Edital e proposta</a>
<a data-cta-position="mobile_nav" href="/problemas-que-resolvemos/" style="min-height:44px">Contrato sob pressão</a>
<a data-cta-position="mobile_nav" href="/diretoria-b2g/" style="min-height:44px">Operação recorrente</a>
<a data-cta-position="mobile_nav" href="/conteudos/" style="min-height:44px">Biblioteca</a>
<a class="button button-primary" href="/#formulario-contato">Analisar meu caso</a>
</nav>
</header>
<main class="simple-main" id="conteudo">
<article class="simple-card">
<section class="section" id="masthead"{archetype_attr("masthead")}>
<p class="eyebrow">Oportunidade pública · dados declarados na fonte</p>
<h1>{e(objeto)}</h1>
<p>{e(orgao.get("nome") or "UNKNOWN")} · {e(local.get("municipio") or "UNKNOWN")}/{e(local.get("uf") or "UNKNOWN")} · sessão {e(PRAZO_LABEL.get(status, "UNKNOWN"))}</p>
</section>

<section class="section" id="ficha"{archetype_attr("ficha")}>
<h2>Ficha da oportunidade</h2>
{_kv_rows([
    ("Objeto", objeto),
    ("Valor estimado declarado na fonte", _brl(valor.get("amount_brl"))),
    ("Base do valor", valor.get("basis") or "UNKNOWN"),
    ("Classe epistêmica do valor", valor.get("epistemic_class") or "UNKNOWN"),
    ("Órgão", orgao.get("nome") or "UNKNOWN"),
    ("Esfera", orgao.get("esfera") or "UNKNOWN"),
    ("Local", f"{local.get('municipio') or 'UNKNOWN'}/{local.get('uf') or 'UNKNOWN'}"),
    ("Status da sessão", PRAZO_LABEL.get(status, "UNKNOWN")),
    ("Data da sessão", prazo.get("data_sessao") or "UNKNOWN"),
])}
<p class="form-hint">O valor acima é a estimativa declarada no documento público citado. Não é valor contratado e não é valor de serviço CONFENGE. Campo UNKNOWN significa que a fonte não publicou o dado — não significa zero.</p>
</section>

<section class="section" id="fontes"{archetype_attr("fontes")}>
<h2>Fonte e procedência</h2>
{_sources_html(record.get("fonte") or [])}
</section>

<section class="section" id="atualizacao"{archetype_attr("atualizacao")}>
<h2>Atualização dos dados</h2>
{_kv_rows([
    ("Data de referência da fonte (as_of)", freshness.get("source_as_of") or "UNKNOWN"),
    ("Exportação declarada (generated_at)", freshness.get("generated_at") or "UNKNOWN"),
    ("Janela de frescor declarada", f"{freshness.get('max_age_hours', 48)} horas"),
])}
<p class="form-hint">As datas acima são declaradas pela fonte e pela exportação. Nenhuma delas é o relógio de quem lê esta página.</p>
</section>

<section class="section" id="limitacoes"{archetype_attr("limitacoes")}>
<h2>Limitações declaradas</h2>
{_limitations_html(record.get("limitations") or [])}
</section>

<section class="section" id="nao-concluir"{archetype_attr("nao-concluir")}>
<h2>O que esta página não afirma</h2>
<p>{e(ADHERENCE_DISCLAIMER_PT)}</p>
<p>Esta página descreve um documento público. Não é parecer jurídico, não julga irregularidade, não afirma quem pode participar e não recomenda participar.</p>
</section>

<section class="section" id="proximo-passo"{archetype_attr("proximo-passo")}>
<h2>Próximo passo</h2>
<p>Duas ações possíveis a partir destes dados:</p>
<div class="journey-next">
<a class="button button-primary" data-intel-cta="analyze" data-cta-id="intel_analyze_company" data-cta-position="opportunity_next_action" href="{e(COMPANY_ROUTE_PREFIX)}">Analisar para minha empresa</a>
<a class="button button-secondary" data-intel-cta="monitor" data-intent-kind="MONITOR_OPPORTUNITY" data-analysis-id="{e(opportunity_id)}" data-cta-id="intel_monitor_opportunity" data-cta-position="opportunity_next_action" href="/#formulario-contato">Monitorar esta licitação</a>
</div>
</section>

<section class="section" id="hashes"{archetype_attr("hashes")}>
<h2>Procedência técnica</h2>
{_kv_rows([
    ("Identificador estável", opportunity_id),
    ("content_hash da fonte", record.get("content_hash") or "UNKNOWN"),
    ("Origem dos dados", record.get("source_kind") or "UNKNOWN"),
    ("Estado editorial", record.get("publication_state") or "UNKNOWN"),
    ("Elegível a indexação", "não"),
])}
</section>
</article>
</main>
<footer class="site-footer">
<div class="container footer-bottom"><span>© <span id="year">2026</span> CONFENGE. CNPJ 52.407.089/0001-09.</span><a href="/privacidade/">Política de Privacidade</a></div>
</footer>
</body>
</html>
"""


def load_projection(path: Path | None = None) -> dict[str, Any]:
    target = path or (_root() / DEFAULT_LIVE_DIR / OPPORTUNITIES_OUT)
    return json.loads(target.read_text(encoding="utf-8"))


def renderable(projection: dict[str, Any]) -> list[dict[str, Any]]:
    """Only READY, noindex-capped records reach a page."""
    if projection.get("index_eligible") is not False:
        raise ValueError("projection claims index eligibility; refusing to render")
    out = []
    for record in projection.get("opportunities") or []:
        if record.get("publication_state") != "PUBLISHABLE_NOINDEX":
            continue
        if record.get("index_eligible") is not False:
            continue
        out.append(record)
    return out


def write_pages(projection: dict[str, Any], root: Path | None = None) -> list[Path]:
    """Write pages for every currently-renderable opportunity, then prune any
    page this run did not (re)write.

    Without the prune, an opportunity that goes stale, is REJECTed, or drops
    out of the producer export leaves its old page on disk forever — nothing
    else in this repo re-runs this pipeline and removes orphans, so a visitor
    (or a crawler, noindex notwithstanding) could keep finding a page this run
    would no longer generate at all.
    """
    base = (root or _root()) / FAMILY_SLUG
    written: list[Path] = []
    live_ids: set[str] = set()
    for record in renderable(projection):
        opportunity_id = record["opportunity_id"]
        live_ids.add(opportunity_id)
        target = base / opportunity_id / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(render_opportunity_html(record), encoding="utf-8")
        written.append(target)
    if base.is_dir():
        for child in sorted(base.iterdir()):
            if child.is_dir() and child.name not in live_ids:
                shutil.rmtree(child)
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render live-opportunity pages (noindex).")
    parser.add_argument("--projection", default="", help="path to opportunities.json")
    parser.add_argument("--write", action="store_true", help="write the pages")
    args = parser.parse_args(argv)
    projection = load_projection(Path(args.projection) if args.projection else None)
    records = renderable(projection)
    if args.write:
        for path in write_pages(projection):
            print(f"wrote {path.relative_to(_root())}")
    print(
        json.dumps(
            {
                "renderable": len(records),
                "skipped": len(projection.get("opportunities") or []) - len(records),
                "index_eligible": projection.get("index_eligible"),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
