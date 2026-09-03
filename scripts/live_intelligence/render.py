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

# --- reader-facing vocabulary ------------------------------------------------
#
# The pipeline's internal tokens (``UNKNOWN``, ``FACT``, ``PUBLISHABLE_NOINDEX``,
# ``test_only_fixture``, ``as_of``, ``content_hash``) are contract vocabulary,
# not reader vocabulary. They stay exactly as they are on the input side — every
# dict KEY below and every comparison in ``renderable()`` is still the raw enum —
# and are translated only at the moment they become visible copy.
#
# The translation never adds certainty the record does not carry: an absent
# field says it was not published, it never says zero and never says "n/a".
NAO_INFORMADO = "não informado pela fonte"

# One sentence, reused verbatim across every live-intelligence surface (see the
# identical copy in analise-cnpj/index.html, analise-cnpj/r/index.html and
# netlify/functions/live-intelligence-analyze.cjs). Stating the same caveat in
# two different wordings on one page is what finding 13 of
# docs/seo/LIVE-INTELLIGENCE-ARCHETYPE-FINDINGS.md flagged.
NAO_INFORMADO_NOTA = (
    "Quando um campo aparece como não informado pela fonte, o dado não foi "
    "publicado, não significa zero."
)

PRAZO_LABEL = {
    "ABERTA": "Aberta",
    "SUSPENSA": "Suspensa",
    "ENCERRADA": "Encerrada",
    "UNKNOWN": NAO_INFORMADO,
}

# The masthead reads as a sentence fragment ("... · sessão aberta"), so it needs
# its own agreement rather than the table-cell label.
PRAZO_MASTHEAD = {
    "ABERTA": "sessão aberta",
    "SUSPENSA": "sessão suspensa",
    "ENCERRADA": "sessão encerrada",
    "UNKNOWN": "sessão sem status informado pela fonte",
}

# How the source declared the amount. Replaces the raw `epistemic_class` token.
EPISTEMIC_LABEL = {
    "FACT": "declarado como valor no documento público",
    "CALCULATION": "calculado a partir do documento público",
    "INFERENCE": "inferido a partir do documento público",
    "UNKNOWN": NAO_INFORMADO,
}

# `source_kind`. A fixture-backed record must say so in plain words: the page is
# otherwise readable as a real opportunity.
SOURCE_KIND_LABEL = {
    "official_live": "fonte pública oficial",
    "test_only_fixture": "dado de teste, não corresponde a uma licitação real",
}

# `publication_state`. Only PUBLISHABLE_NOINDEX can actually reach a page (see
# ``renderable()``); the rest are mapped so a future state cannot leak a token.
PUBLICATION_STATE_LABEL = {
    "PUBLISHABLE_INDEX": "publicada e elegível a indexação",
    "PUBLISHABLE_NOINDEX": "publicada sem indexação em buscadores",
    "HOLD_FOR_DATA": "retida à espera de dados da fonte",
    "REJECT": "não publicável",
}


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def _pt(value: Any, missing: str = NAO_INFORMADO) -> str:
    """Free-text field as reader copy.

    ``UNKNOWN`` is a *declared value* in this contract (see ``PRAZO_STATUS`` and
    ``EPISTEMIC_CLASSES`` in ``__init__``), not only an absent key — so
    ``record.get(k) or default`` is not enough: the projection really does ship
    the literal string, and it must never reach the page.
    """
    text = str(value if value is not None else "").strip()
    return missing if not text or text.upper() == "UNKNOWN" else text


def _mapped(value: Any, table: dict[str, str], unmapped: str) -> str:
    """Enum as reader copy. Never falls back to the raw token.

    An enum member nobody mapped yet is a gap in this table, and saying so is
    honest; echoing the constant would silently reopen the leak.
    """
    key = str(value if value is not None else "").strip()
    if not key:
        return NAO_INFORMADO
    return table.get(key.upper(), table.get(key, unmapped))


def _local_label(local: dict[str, Any]) -> str:
    """`municipio/uf`, stating which half the source left out rather than
    printing a token in its place."""
    municipio = _pt(local.get("municipio"), "")
    uf = _pt(local.get("uf"), "")
    if municipio and uf:
        return f"{municipio}/{uf}"
    if municipio:
        return f"{municipio} (UF não informada pela fonte)"
    if uf:
        return f"{uf} (município não informado pela fonte)"
    return NAO_INFORMADO


def archetype_attr(section_id: str) -> str:
    return f' data-section-archetype="{ARCHETYPE_BY_SECTION_ID[section_id]}"'


def e(value: Any) -> str:
    return escape(str(value if value is not None else ""), quote=True)


def _brl(amount: Any) -> str:
    """Format a declared amount. Absence is stated in words; it is never zero.

    The ``"UNKNOWN"`` literal below is the *input* the contract ships, not
    output: it is matched, then translated. Producer `estimado_brl` is a
    decimal string; fixture `amount_brl` may be a number.
    """
    if amount in (None, "", "UNKNOWN"):
        return NAO_INFORMADO
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return NAO_INFORMADO
    inteiro, _, centavos = f"{value:,.2f}".partition(".")
    return f"R$ {inteiro.replace(',', '.')},{centavos}"


def _declared_amount(valor: dict[str, Any]) -> Any:
    if valor.get("estimado_brl") not in (None, ""):
        return valor.get("estimado_brl")
    return valor.get("amount_brl")


def _page_dir(base: Path, opportunity_id: str) -> Path:
    """Page directory for one opportunity, including PNCP ids that contain `/`."""
    target = (base / opportunity_id).resolve()
    try:
        target.relative_to(base.resolve())
    except ValueError as exc:
        raise ValueError(f"unsafe opportunity_id: {opportunity_id!r}") from exc
    return target


def _kv_rows(rows: list[tuple[str, str]]) -> str:
    cells = "".join(
        f"<tr><th scope=\"row\">{e(label)}</th><td>{e(value)}</td></tr>" for label, value in rows
    )
    return f"<table class=\"data-table\"><tbody>{cells}</tbody></table>"


def _sources_html(sources: list[dict[str, Any]]) -> str:
    if not sources:
        return "<p>A fonte não foi declarada.</p>"
    items = []
    for source in sources:
        nome = e(_pt(source.get("nome"), "Fonte pública"))
        url = str(source.get("url") or "").strip()
        status = e(_pt(source.get("url_status")))
        retrieved = e(_pt(source.get("retrieved_at")))
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
        return "<p>A fonte não declarou limitações.</p>"
    items = "".join(f"<li>{e(item)}</li>" for item in limitations)
    return f"<ul>{items}</ul>"


def render_opportunity_html(record: dict[str, Any]) -> str:
    """Render one opportunity page. Always noindex."""
    opportunity_id = record["opportunity_id"]
    objeto = _pt(record.get("objeto"))
    orgao = record.get("orgao") or {}
    local = record.get("local") or {}
    prazo = record.get("prazo") or {}
    valor = record.get("valor") or {}
    freshness = record.get("freshness") or {}
    orgao_nome = _pt(orgao.get("nome"))
    # <title> survives the gate's visible-text extraction (only <script>/<style>
    # content is dropped), so it is reader copy and is normalised like the body.
    title = f"{objeto}, {orgao_nome} | CONFENGE"
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
<p>{e(orgao_nome)} · {e(_local_label(local))} · {e(_mapped(status, PRAZO_MASTHEAD, "sessão sem status informado pela fonte"))}</p>
</section>

<section class="section" id="ficha"{archetype_attr("ficha")}>
<h2>Ficha da oportunidade</h2>
{_kv_rows([
    ("Objeto", objeto),
    ("Valor estimado declarado na fonte", _brl(_declared_amount(valor))),
    ("Faixa de valor declarada", _pt(valor.get("faixa"))),
    ("Base do valor", _pt(valor.get("basis"))),
    ("Como o valor foi declarado", _mapped(valor.get("epistemic_class"), EPISTEMIC_LABEL, "classificação não declarada pela fonte")),
    ("Órgão", orgao_nome),
    ("Esfera", _pt(orgao.get("esfera"))),
    ("Local", _local_label(local)),
    ("Status da sessão", _mapped(status, PRAZO_LABEL, NAO_INFORMADO)),
    ("Data da sessão", _pt(prazo.get("data_sessao") or prazo.get("data_encerramento"))),
])}
<p class="form-hint">O valor acima é a estimativa declarada no documento público citado. Não é valor contratado e não é valor de serviço CONFENGE. {NAO_INFORMADO_NOTA}</p>
</section>

<section class="section" id="fontes"{archetype_attr("fontes")}>
<h2>Fonte e procedência</h2>
{_sources_html(record.get("fonte") or [])}
</section>

<section class="section" id="atualizacao"{archetype_attr("atualizacao")}>
<h2>Atualização dos dados</h2>
{_kv_rows([
    ("Data de referência da fonte", _pt(freshness.get("source_as_of"))),
    ("Data da exportação declarada", _pt(freshness.get("generated_at"))),
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
    ("Hash de integridade da fonte", _pt(record.get("content_hash"))),
    ("Origem dos dados", _mapped(record.get("source_kind"), SOURCE_KIND_LABEL, "origem não classificada")),
    ("Estado editorial", _mapped(record.get("publication_state"), PUBLICATION_STATE_LABEL, "estado não classificado")),
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
    live_dirs: set[Path] = set()
    for record in renderable(projection):
        opportunity_id = record["opportunity_id"]
        page_dir = _page_dir(base, opportunity_id)
        live_dirs.add(page_dir)
        target = page_dir / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(render_opportunity_html(record), encoding="utf-8")
        written.append(target)
    if base.is_dir():
        for html in sorted(base.rglob("index.html")):
            if html.parent.resolve() not in live_dirs:
                shutil.rmtree(html.parent)
        for dirpath in sorted((p for p in base.rglob("*") if p.is_dir()), reverse=True):
            try:
                next(dirpath.iterdir())
            except StopIteration:
                dirpath.rmdir()
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
