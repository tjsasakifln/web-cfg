"""Render the market panorama page and hub from the de-identified payload."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.market_panorama import (
    ASSET_FAMILY,
    DISCLAIMER_PT,
    FAMILY_LABEL_PT,
    FAMILY_PATH,
    FAMILY_SLUG,
    ROUTE_FAMILY,
    STATE_INDEX,
    STATE_NOINDEX,
)
from scripts.market_panorama.gate import PublicationDecision
from scripts.pseo.html_shell import (
    ORG_JSONLD,
    PERSON_JSONLD,
    SITE,
    author_box,
    breadcrumb_jsonld,
    breadcrumbs_html,
    e,
    page_shell,
)

PUBLIC_DIR = Path(FAMILY_SLUG)
SITEMAP_NAME = "sitemap-panorama-mercado.xml"
UNKNOWN = "UNKNOWN"

POSITION_LABEL = {
    "BELOW_P25": "abaixo do primeiro quartil do painel",
    "P25_P50": "entre o primeiro quartil e a mediana",
    "P50_P75": "entre a mediana e o terceiro quartil",
    "ABOVE_P75": "acima do terceiro quartil do painel",
    "OUT_OF_PANEL_RANGE": "fora da faixa do painel, sem posição percentílica",
    UNKNOWN: UNKNOWN,
}

HUB_DESCRIPTION = (
    "Panorama de mercado de obras públicas a partir de contratos publicados: "
    "faixas de valor por categoria, estrutura de concorrência e editais abertos."
)


def _brl(value: Any) -> str:
    if value in (None, "", UNKNOWN):
        return UNKNOWN
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    inteiro, _, centavos = f"{number:,.2f}".partition(".")
    return "R$ " + inteiro.replace(",", ".") + "," + centavos


def _payload_section(payload: dict[str, Any], section_id: str) -> dict[str, Any]:
    section = (payload.get("sections") or {}).get(section_id) or {}
    return section.get("payload") or {}


def _section_state(payload: dict[str, Any], section_id: str) -> str:
    return ((payload.get("sections") or {}).get(section_id) or {}).get("state") or UNKNOWN


def description_for(payload: dict[str, Any]) -> str:
    """Per-page meta description. Must not repeat the hub's, or SEO dedup fails."""
    profile = payload.get("subject_profile") or {}
    uf = str(profile.get("uf") or "").upper()
    where = f"em {uf}" if uf and uf != UNKNOWN else "no recorte observado"
    buyers = profile.get("buyer_count", UNKNOWN)
    contracts = profile.get("contract_count", UNKNOWN)
    as_of = payload.get("as_of", UNKNOWN)
    text = (
        f"Faixas de valor por categoria, estrutura de concorrência e editais abertos "
        f"{where}, a partir de {contracts} contratos publicados por {buyers} órgãos, "
        f"observados em {as_of}."
    )
    return text if len(text) <= 160 else text[:157].rstrip() + "…"


def title_for(payload: dict[str, Any]) -> str:
    profile = payload.get("subject_profile") or {}
    uf = str(profile.get("uf") or "").upper()
    where = f" em {uf}" if uf and uf != UNKNOWN else ""
    return f"Panorama de contratação de obras públicas{where}"


def _price_table(payload: dict[str, Any]) -> str:
    panel = _payload_section(payload, "price_panel")
    categories = panel.get("categories") or []
    if not categories:
        return (
            "<p>Nenhuma categoria com referência de preço observada nesta data. "
            "Ausência de observação não é ausência de contrato.</p>"
        )
    rows = "".join(
        "<tr>"
        f"<td>{e(c.get('categoria', UNKNOWN))}</td>"
        f"<td>{e(c.get('reference_contract_count', UNKNOWN))}</td>"
        f"<td>{e(_brl(c.get('reference_p25')))}</td>"
        f"<td>{e(_brl(c.get('reference_p50')))}</td>"
        f"<td>{e(_brl(c.get('reference_p75')))}</td>"
        f"<td>{e(POSITION_LABEL.get(c.get('focal_position'), c.get('focal_position', UNKNOWN)))}</td>"
        "</tr>"
        for c in categories
    )
    note = ""
    if panel.get("out_of_range_category_count"):
        note = (
            "<p>"
            f"{e(panel['out_of_range_category_count'])} categoria(s) ficaram fora da faixa do painel "
            f"por fator maior que {e(panel.get('out_of_range_factor', UNKNOWN))}x. Para essas, nenhuma "
            "posição percentílica é declarada: a categoria agrega objetos de porte incomparável."
            "</p>"
        )
    return (
        '<div class="table-wrap"><table class="data-table">'
        "<thead><tr><th>Categoria</th><th>Contratos na referência</th><th>p25</th><th>Mediana</th>"
        "<th>p75</th><th>Posição observada</th></tr></thead>"
        f"<tbody>{rows}</tbody></table></div>"
        f"<p>Escopo da referência: {e(panel.get('reference_scope', UNKNOWN))}.</p>"
        f"{note}"
    )


def _competition_block(payload: dict[str, Any]) -> str:
    section = _payload_section(payload, "competitors")
    competitors = section.get("competitors") or []
    if not competitors:
        return "<p>Nenhuma estrutura de concorrência observada nesta data.</p>"
    counts = [int(c.get("contract_count") or 0) for c in competitors]
    shared = [int(c.get("shared_buyer_count") or 0) for c in competitors]
    return (
        f"<p>Regra de seleção: {e(section.get('selection_rule', UNKNOWN))}. "
        f"Categoria principal: <strong>{e(section.get('primary_category', UNKNOWN))}</strong>.</p>"
        '<div class="table-wrap"><table class="data-table">'
        "<thead><tr><th>Indicador</th><th>Valor observado</th></tr></thead><tbody>"
        f"<tr><th scope='row'>Fornecedores no recorte</th><td>{e(len(competitors))}</td></tr>"
        f"<tr><th scope='row'>Contratos por fornecedor (mín.–máx.)</th>"
        f"<td>{e(min(counts))}–{e(max(counts))}</td></tr>"
        f"<tr><th scope='row'>Compradores em comum (mín.–máx.)</th>"
        f"<td>{e(min(shared))}–{e(max(shared))}</td></tr>"
        "</tbody></table></div>"
        "<p>Os fornecedores do recorte não são nomeados nesta página. A identificação "
        "individual não é objeto de um panorama público de mercado.</p>"
    )


def _opportunities_block(payload: dict[str, Any]) -> str:
    section = _payload_section(payload, "open_opportunities")
    opportunities = section.get("opportunities") or []
    if not opportunities:
        return (
            "<p>Nenhum edital aberto foi observado para os compradores deste recorte na data de "
            "referência. Ausência de observação não é ausência de edital.</p>"
        )
    rows = "".join(
        "<tr>"
        f"<td>{e(o.get('orgao_nome', UNKNOWN))}</td>"
        f"<td>{e(o.get('modalidade', UNKNOWN))}</td>"
        f"<td>{e(o.get('data_encerramento', UNKNOWN))}</td>"
        f"<td>{e(_brl(o.get('valor_estimado')))}</td>"
        "</tr>"
        for o in opportunities
    )
    return (
        '<div class="table-wrap"><table class="data-table">'
        "<thead><tr><th>Órgão</th><th>Modalidade</th><th>Encerramento</th><th>Valor estimado</th></tr></thead>"
        f"<tbody>{rows}</tbody></table></div>"
    )


def _limitations_block(payload: dict[str, Any]) -> str:
    limitations = payload.get("limitations") or []
    items = "".join(f"<li>{e(text)}</li>" for text in limitations)
    reasons = payload.get("reason_codes") or []
    reason_html = ""
    if reasons:
        reason_html = f"<p>Códigos de razão do produtor: <code>{e(', '.join(map(str, reasons)))}</code>.</p>"
    return f"<ul>{items}</ul>{reason_html}"


def _provenance_block(payload: dict[str, Any], decision: PublicationDecision) -> str:
    rows = [
        ("Schema do produtor", payload.get("schema", UNKNOWN)),
        ("Versão do contrato", payload.get("contract_version", UNKNOWN)),
        ("Modo de catálogo", payload.get("catalog_mode", UNKNOWN)),
        ("Estado dos dados", payload.get("data_state", UNKNOWN)),
        ("Data de referência", payload.get("as_of", UNKNOWN)),
        ("Hash do payload", payload.get("content_hash", UNKNOWN)),
        ("Hash do dossiê de origem", payload.get("source_dossier_hash", UNKNOWN)),
    ]
    body = "".join(f"<tr><th scope='row'>{e(label)}</th><td><code>{e(value)}</code></td></tr>" for label, value in rows)
    tail = (
        "INDEX desta URL é decisão editorial deste repositório, aprovada individualmente e "
        "vinculada ao hash do payload."
        if decision.indexable
        else "Esta página não autoriza INDEX."
    )
    return (
        '<div class="table-wrap"><table class="data-table">'
        f"<tbody>{body}</tbody></table></div>"
        "<p>O produtor mantém <code>publication_authorization</code> e "
        f"<code>index_authorization</code> em <code>false</code>. {e(tail)}</p>"
    )


def build_schema(payload: dict[str, Any], decision: PublicationDecision) -> list[dict[str, Any]]:
    title = title_for(payload)
    url = f"{SITE}{FAMILY_PATH}{decision.slug}/"
    return [
        ORG_JSONLD,
        PERSON_JSONLD,
        breadcrumb_jsonld(
            [
                ("Início", f"{SITE}/"),
                (FAMILY_LABEL_PT, f"{SITE}{FAMILY_PATH}"),
                (title, url),
            ]
        ),
        {
            "@type": "Dataset",
            "@id": f"{url}#dataset",
            "name": title,
            "description": DISCLAIMER_PT,
            "inLanguage": "pt-BR",
            "url": url,
            "isAccessibleForFree": True,
            "creator": {"@id": f"{SITE}/#organization"},
            "temporalCoverage": str(payload.get("as_of") or ""),
            "license": "https://creativecommons.org/licenses/by/4.0/",
        },
    ]


def render_panorama_html(payload: dict[str, Any], decision: PublicationDecision) -> str:
    title = title_for(payload)
    profile = payload.get("subject_profile") or {}
    banner = ""
    if decision.is_fixture:
        banner = (
            '<p class="ca-fixture-banner" role="status">'
            "Prévia de teste (fixture). Não é um panorama de dados oficiais e não deve ser indexada."
            "</p>"
        )
    elif not decision.indexable:
        banner = (
            '<p class="ca-draft-banner" role="status">'
            "Rascunho editorial noindex. Revisão humana ainda não confirmada. Sem autorização de INDEX."
            "</p>"
        )

    sections = [
        '<header class="article-hero container">'
        f'<p class="eyebrow">{e(FAMILY_LABEL_PT)}</p>'
        f"<h1>{e(title)}</h1>"
        f'<p class="ca-disclaimer">{e(DISCLAIMER_PT)}</p>'
        f"{banner}"
        "</header>",
        breadcrumbs_html([("Início", "/"), (FAMILY_LABEL_PT, FAMILY_PATH), (title, None)]),
        '<section class="section" id="recorte"><h2>Recorte observado</h2>'
        '<div class="table-wrap"><table class="data-table"><tbody>'
        f"<tr><th scope='row'>UF</th><td>{e(profile.get('uf', UNKNOWN))}</td></tr>"
        f"<tr><th scope='row'>CNAE principal do recorte</th><td>{e(profile.get('cnae_principal', UNKNOWN))}</td></tr>"
        f"<tr><th scope='row'>Compradores no recorte</th><td>{e(profile.get('buyer_count', UNKNOWN))}</td></tr>"
        f"<tr><th scope='row'>Contratos no recorte</th><td>{e(profile.get('contract_count', UNKNOWN))}</td></tr>"
        "</tbody></table></div>"
        "<p>O recorte descreve uma carteira de contratos públicos. A empresa contratada "
        "não é identificada.</p></section>",
        '<section class="section" id="faixas-de-valor"><h2>Faixas de valor por categoria</h2>'
        f"<p>Estado da seção no produtor: <code>{e(_section_state(payload, 'price_panel'))}</code>.</p>"
        f"{_price_table(payload)}</section>",
        '<section class="section" id="concorrencia"><h2>Estrutura de concorrência</h2>'
        f"<p>Estado da seção no produtor: <code>{e(_section_state(payload, 'competitors'))}</code>.</p>"
        f"{_competition_block(payload)}</section>",
        '<section class="section" id="editais"><h2>Editais abertos no recorte</h2>'
        f"<p>Estado da seção no produtor: <code>{e(_section_state(payload, 'open_opportunities'))}</code>.</p>"
        f"{_opportunities_block(payload)}</section>",
        '<section class="section" id="limitacoes"><h2>Limitações declaradas</h2>'
        f"{_limitations_block(payload)}</section>",
        '<section class="section" id="proveniencia"><h2>Proveniência</h2>'
        f"{_provenance_block(payload, decision)}</section>",
        '<section class="section" id="correcao"><h2>Correção e contestação</h2>'
        "<p>Erro material ou contestação de fato público segue a "
        '<a href="/correcoes/">política pública de correções</a> e a '
        '<a href="/politica-editorial/">política editorial</a>.</p></section>',
        author_box(),
    ]

    robots = decision.robots
    if not decision.indexable and "noarchive" not in robots:
        robots = f"{robots},noarchive" if robots else "noindex,nofollow,noarchive"

    return page_shell(
        title=f"{title} | CONFENGE",
        description=description_for(payload),
        canonical_path=f"{FAMILY_PATH}{decision.slug}/",
        robots=robots,
        jsonld_graph=build_schema(payload, decision),
        body_main="".join(sections),
        wa_message=(
            "Olá. Li o panorama de mercado de obras públicas da CONFENGE e quero avaliar "
            "a carteira de contratos da minha empresa."
        ),
        data_attrs={
            "surface-type": "panorama_mercado",
            "content-class": "PANORAMA_MERCADO_OBRAS_PUBLICAS",
            "content-type": "panorama-mercado",
            "publication-state": decision.state,
            "source-kind": decision.source_kind,
            "route-family": ROUTE_FAMILY,
            "asset-id": decision.slug,
            "asset-family": ASSET_FAMILY,
            "panorama-id": decision.panorama_id,
            "payload-content-hash": decision.content_hash,
            "cta-id": "panorama-mercado-contextual",
        },
    )


def render_hub_html(pairs: list[tuple[dict[str, Any], PublicationDecision]], *, index_count: int) -> str:
    # The hub indexes only when it has something approved to point at. A hub
    # that claims index while every child is a draft is a contradiction the
    # crawler resolves against us.
    robots = "index,follow" if index_count >= 1 else "noindex,nofollow,noarchive"
    cards = []
    for payload, decision in pairs:
        if decision.state not in {STATE_INDEX, STATE_NOINDEX} or decision.is_fixture:
            continue
        label = "publicado" if decision.indexable else "rascunho noindex"
        cards.append(
            '<article class="n-card">'
            f'<p class="eyebrow">{e(FAMILY_LABEL_PT)} · {e(label)}</p>'
            f'<h2><a href="{e(FAMILY_PATH + decision.slug + "/")}">{e(title_for(payload))}</a></h2>'
            f"<p>Data de referência {e(payload.get('as_of', UNKNOWN))}.</p>"
            "</article>"
        )
    body = (
        '<header class="article-hero container">'
        f'<p class="eyebrow">{e(FAMILY_LABEL_PT)}</p>'
        f"<h1>{e(FAMILY_LABEL_PT)} de obras públicas</h1>"
        f'<p class="ca-disclaimer">{e(HUB_DESCRIPTION)}</p>'
        "</header>"
        f'<section class="section"><div class="n-grid">{"".join(cards) or "<p>Nenhum panorama publicado.</p>"}</div></section>'
    )
    return page_shell(
        title=f"{FAMILY_LABEL_PT} de obras públicas | CONFENGE",
        description=HUB_DESCRIPTION,
        canonical_path=FAMILY_PATH,
        robots=robots,
        jsonld_graph=[
            ORG_JSONLD,
            {
                "@type": "CollectionPage",
                "@id": f"{SITE}{FAMILY_PATH}#collection",
                "name": f"{FAMILY_LABEL_PT} de obras públicas",
                "description": HUB_DESCRIPTION,
                "url": f"{SITE}{FAMILY_PATH}",
                "inLanguage": "pt-BR",
            },
        ],
        body_main=body,
        wa_message="Olá. Quero um panorama da carteira de contratos públicos da minha empresa.",
        data_attrs={
            "surface-type": "panorama_mercado_hub",
            "content-class": "PANORAMA_MERCADO_HUB",
            "route-family": ROUTE_FAMILY,
            "asset-family": ASSET_FAMILY,
        },
    )


def write_pages(pairs: list[tuple[dict[str, Any], PublicationDecision]], *, root: Path | None = None) -> dict[str, str]:
    base = (root or Path(__file__).resolve().parents[2]) / PUBLIC_DIR
    written: dict[str, str] = {}
    index_count = sum(1 for _p, d in pairs if d.indexable)
    for payload, decision in pairs:
        if decision.state == "BLOCKED":
            continue
        target = base / decision.slug / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(render_panorama_html(payload, decision), encoding="utf-8")
        written[decision.panorama_id] = str(target)
    hub = base / "index.html"
    hub.parent.mkdir(parents=True, exist_ok=True)
    hub.write_text(render_hub_html(pairs, index_count=index_count), encoding="utf-8")
    written["hub"] = str(hub)
    return written


def write_status(status: dict[str, Any], *, root: Path | None = None) -> Path:
    base = root or Path(__file__).resolve().parents[2]
    target = base / "docs" / "editorial" / "MARKET_PANORAMA_STATUS.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(status, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


ROBOTS_FAMILY_BEGIN = "# Market-panorama family — generated by scripts.market_panorama"
ROBOTS_FAMILY_END = "# Market-panorama family — end"
HEADERS_FAMILY_BEGIN = ROBOTS_FAMILY_BEGIN
HEADERS_FAMILY_END = ROBOTS_FAMILY_END


def _replace_or_append_block(text: str, *, begin: str, end: str, new_block: str) -> str:
    """Swap every generated block for one copy, or append it the first time.

    The block is delimited by explicit begin and end markers rather than by
    guessing where it stops. Guessing deletes whatever a human appended after
    it, and leaves a stale duplicate that wins on Netlify's last-match rule.
    """
    lines = text.splitlines(keepends=True)
    kept: list[str] = []
    index = 0
    seen = False
    while index < len(lines):
        if lines[index].startswith(begin):
            close = next(
                (j for j in range(index + 1, len(lines)) if lines[j].startswith(end)),
                None,
            )
            if close is None:
                # A block written before the end marker existed: fall back to the
                # old terminator rule for this one removal only.
                close = len(lines) - 1
                for j in range(index + 1, len(lines)):
                    if lines[j].startswith("#") or (
                        lines[j].startswith("/") and not lines[j].startswith(FAMILY_PATH)
                    ):
                        close = j - 1
                        break
            if not seen:
                kept.append(new_block)
                seen = True
            index = close + 1
            while index < len(lines) and lines[index].strip() == "":
                index += 1
            continue
        kept.append(lines[index])
        index += 1

    if not seen:
        body = "".join(kept)
        if body and not body.endswith("\n"):
            body += "\n"
        return body + "\n" + new_block
    rebuilt = "".join(kept)
    return rebuilt if rebuilt.endswith("\n") else rebuilt + "\n"


def sync_family_crawler_rules(
    pairs: list[tuple[dict[str, Any], PublicationDecision]],
    *,
    root: Path | None = None,
) -> None:
    """Allow only approved INDEX slugs; keep the rest of the family blocked.

    When something is approved the hub is opened too, otherwise the approved
    page has no crawlable path to it: the hub is the only page linking to
    children, and a Disallowed hub means Googlebot never reads its meta tag.

    Netlify applies the last matching X-Robots-Tag rule, so the per-slug index
    override is written after the family-wide noindex block.
    """
    base = root or Path(__file__).resolve().parents[2]
    slugs = sorted({d.slug for _p, d in pairs if d.indexable and not d.is_fixture})

    robots_path = base / "robots.txt"
    if robots_path.is_file():
        allow_lines = "".join(f"Allow: {FAMILY_PATH}{slug}/\n" for slug in slugs)
        if slugs:
            allow_lines = f"Allow: {FAMILY_PATH}$\n" + allow_lines
        block = f"{ROBOTS_FAMILY_BEGIN}\n{allow_lines}Disallow: {FAMILY_PATH}\n{ROBOTS_FAMILY_END}\n"
        robots_path.write_text(
            _replace_or_append_block(
                robots_path.read_text(encoding="utf-8"),
                begin=ROBOTS_FAMILY_BEGIN,
                end=ROBOTS_FAMILY_END,
                new_block=block,
            ),
            encoding="utf-8",
        )

    headers_path = base / "_headers"
    if headers_path.is_file():
        allow_blocks = "".join(
            f"{FAMILY_PATH}{slug}/*\n  X-Robots-Tag: index, follow\n\n" for slug in slugs
        )
        if slugs:
            allow_blocks = f"{FAMILY_PATH}\n  X-Robots-Tag: index, follow\n\n" + allow_blocks
        block = (
            f"{HEADERS_FAMILY_BEGIN}\n"
            f"{FAMILY_PATH}*\n  X-Robots-Tag: noindex, nofollow, noarchive\n\n"
            f"{allow_blocks}"
            f"{HEADERS_FAMILY_END}\n"
        )
        headers_path.write_text(
            _replace_or_append_block(
                headers_path.read_text(encoding="utf-8"),
                begin=HEADERS_FAMILY_BEGIN,
                end=HEADERS_FAMILY_END,
                new_block=block,
            ),
            encoding="utf-8",
        )


def sitemap_locs(pairs: list[tuple[dict[str, Any], PublicationDecision]]) -> list[str]:
    """Canonical URLs an approved page needs so it is reachable at all."""
    slugs = sorted({d.slug for _p, d in pairs if d.indexable and not d.is_fixture})
    if not slugs:
        return []
    return [f"{SITE}{FAMILY_PATH}"] + [f"{SITE}{FAMILY_PATH}{slug}/" for slug in slugs]


def write_sitemap(pairs: list[tuple[dict[str, Any], PublicationDecision]], *, root: Path | None = None) -> Path | None:
    """Write the family sitemap, or remove it when nothing is approved."""
    base = root or Path(__file__).resolve().parents[2]
    target = base / SITEMAP_NAME
    locs = sitemap_locs(pairs)
    if not locs:
        if target.exists():
            target.unlink()
        return None
    body = "".join(f"  <url><loc>{e(loc)}</loc></url>\n" for loc in locs)
    target.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}</urlset>\n",
        encoding="utf-8",
    )
    return target
