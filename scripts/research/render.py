"""Render human-readable docs, distribution pack and noindex preview."""

from __future__ import annotations

import json
from html import escape
from pathlib import Path
from typing import Any

from scripts.research.citation import (
    DOWNLOAD_FILENAME,
    citation_download_payload,
    dataset_jsonld,
)
from scripts.research.metrics import WEDGE

DOCS_DIR = Path("docs/research/edicao-zero-4uf")
PREVIEW_DIR = Path("radar/pesquisa/edicao-zero-4uf")
DISTRIBUTION_PATH = Path("data/distribution/edicao-zero-research-pack.json")


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def _md_table(headers: list[str], rows: list[list[Any]]) -> str:
    line = "| " + " | ".join(headers) + " |"
    sep = "| " + " | ".join("---" for _ in headers) + " |"
    body = "\n".join(
        "| " + " | ".join("" if cell is None else str(cell) for cell in row) + " |"
        for row in rows
    )
    return f"{line}\n{sep}\n{body}"


def _brl(value: Any) -> str:
    if value is None:
        return "n/d"
    number = float(value)
    formatted = f"{number:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {formatted}"


def render_docs(pack: dict[str, Any]) -> dict[str, Path]:
    root = _root()
    directory = root / DOCS_DIR
    directory.mkdir(parents=True, exist_ok=True)
    q_by = {item["id"]: item for item in pack["questions"]}
    written: dict[str, Path] = {}

    tese = f"""# Tese — EDIÇÃO ZERO

**Wedge:** {pack['wedge']['label']}

**Por que este wedge:** {pack['wedge']['why']}

**O que a tese não é:** um observatório nacional, um censo de 27 UFs, um
ranking de construtoras ou uma faixa nacional de preço praticado.

**Pergunta-mãe:** o que o snapshot extra-cli já publicado (`dataset_hash`
`{pack['dataset_hash']}`, `data_as_of={pack['data_as_of']}`) consegue afirmar,
com proveniência, sobre pavimentação e edificações públicas em SC, PI, MG e RS?

**Veredito desta edição:** `{pack['verdict']}`

{pack['verdict_reason']}

**Próxima ação:** {pack['next_action']}
"""
    written["tese"] = directory / "tese.md"
    written["tese"].write_text(tese, encoding="utf-8")

    meth_rows = []
    for question in pack["questions"]:
        meth_rows.append(
            [
                question["id"],
                question["theme"],
                question["status"],
                question.get("source"),
                question.get("denominator"),
            ]
        )
    metodologia = f"""# Metodologia

## Fonte

- Snapshot versionado `data/pseo/` (não o datalake).
- `dataset_hash`: `{pack['dataset_hash']}`
- `data_as_of`: `{pack['data_as_of']}`
- `generated_at`: `{pack['generated_at_snapshot']}`
- Produtor: `{pack['methodology'].get('producer')}` `{pack['methodology'].get('producer_version')}`
- extra-cli commit: `{pack['methodology'].get('source_commit_sha')}`
- run: `{pack['methodology'].get('source_run_id')}`
- Tabelas de origem do export: {", ".join(pack['methodology'].get('tables') or [])}

Contrato consumidor extra-cli #400: `docs/research/edicao-zero-4uf/consumer-contract-extra-cli-400.md`.
`extra_cli_public_read_export_consumed`: `{pack['reproducibility'].get('extra_cli_public_read_export_consumed')}`.
Nota: {pack['reproducibility'].get('extra_cli_public_read_note')}

A pasta `data/pseo/snapshots/pre-national-2026-07-31/` tem
`dataset_hash` distinto (`{pack['reproducibility'].get('dated_folder_dataset_hash')}`).
Esta edição usa o snapshot vivo cujo hash está no `manifest.json` atual.

## Passos

{chr(10).join(f"- {step}" for step in pack['methodology']['steps'])}

## Semântica de valor

{pack['methodology']['value_semantics']}

## Deduplicação

{pack['methodology']['dedup_logic']}

## Proveniência por pergunta

{_md_table(['ID', 'Tema', 'Status', 'Source', 'Denominator'], meth_rows)}

### Campos obrigatórios de cada métrica respondida

`source`, `snapshot_hash`, `as_of`, `cutoff`, `denominator`, `filters`,
`dedup_logic`, `value_semantics`, `exclusions`, `limitation`.

## Limitações do snapshot

{chr(10).join(f"- {item}" for item in pack['methodology'].get('limitations') or [])}

## Cobertura

- UFs publicadas: {", ".join(pack['coverage']['ufs'])} ({pack['coverage']['uf_count']})
- Mercados publicados: {pack['coverage']['published_markets']}
- `national_universe_complete`: `{pack['coverage']['national_universe_complete']}`
- `national_denominator`: `{pack['coverage']['national_denominator']}`
- aec_confirmed no snapshot: {pack['coverage']['snapshot_aec_confirmed_contracts']}
- contratos carregados: {pack['coverage']['snapshot_raw_contracts']}
- Nota do manifest: {pack['coverage']['manifest_limitation']}

Inventário-candidato (mesmo `dataset_hash`, **não** usado como fato publicado):
{json.dumps(pack['coverage']['inventory_not_used_as_published_fact'], ensure_ascii=False, indent=2)}
"""
    written["metodologia"] = directory / "metodologia.md"
    written["metodologia"].write_text(metodologia, encoding="utf-8")

    finding_lines = []
    for item in pack["findings"]:
        if str(item["id"]).startswith("ADV-"):
            continue
        evidence = item.get("evidence") or {}
        evidence_ref = evidence.get("anchor") or (
            f"#{item.get('question_id')}" if item.get("question_id") else ""
        )
        finding_lines.append(
            f"### {item['id']} ({item['status']})\n\n"
            f"{item['claim']}\n\n"
            f"Evidência: [{item.get('question_id') or 'n/d'}]({evidence_ref})\n"
        )
    findings_md = f"""# Findings

Nenhum finding abaixo afirma cobertura de 27 UFs. Frases sem número só
aparecem quando o status é `unsupported`.

{chr(10).join(finding_lines)}

## Perguntas

"""
    for question in pack["questions"]:
        findings_md += (
            f"### {question['id']} — {question['theme']}\n\n"
            f"**Pergunta:** {question['question']}\n\n"
            f"**Status:** `{question['status']}`\n\n"
            f"**Limitação:** {question.get('limitation')}\n\n"
        )
    written["findings"] = directory / "findings.md"
    written["findings"].write_text(findings_md, encoding="utf-8")

    adv_lines = []
    for lens in pack["adversarial"]["lenses"]:
        adv_lines.append(
            f"### {lens['id']} — {lens['status']}\n\n{lens['finding']}\n"
        )
    data_quality = f"""# Data quality (revisão adversarial)

Lentes obrigatórias: duplicidade, consórcios, aditivos, zeros/nulos, aliases,
coverage gaps, outliers, viés temporal.

{chr(10).join(adv_lines)}
"""
    written["data-quality"] = directory / "data-quality.md"
    written["data-quality"].write_text(data_quality, encoding="utf-8")

    chart_lines = []
    for chart in pack["charts"]:
        chart_lines.append(
            f"### {chart['id']}\n\n"
            f"- **Pergunta:** {chart['pergunta']}\n"
            f"- **Unidade:** {chart['unidade']}\n"
            f"- **Fonte:** {chart.get('source')}\n"
            f"- **Método:** {chart.get('method')}\n"
            f"- **Caveat:** {chart['caveat']}\n"
            f"- **Takeaway:** {chart['takeaway']}\n"
            f"- **Dados:**\n\n```json\n"
            f"{json.dumps(chart['dados'], ensure_ascii=False, indent=2)}\n```\n"
        )
    visual = f"""# Visual spec (no máximo 5 gráficos)

Não é um dashboard. Cada série existe para sustentar uma pergunta executiva.

{chr(10).join(chart_lines)}

## Regras de desenho

- Eixo em BRL nominal, nunca "preço de mercado".
- Título afirma o recorte (UF × arquétipo), nunca "Brasil".
- Nota de rodapé obrigatória: `dataset_hash` + `data_as_of` + denominator.
- Sem mapa coroplético nacional nesta edição (4 UFs).
"""
    written["visual-spec"] = directory / "visual-spec.md"
    written["visual-spec"].write_text(visual, encoding="utf-8")

    q1 = q_by["Q1"]["value"]
    distribution_md = f"""# Distribution pack

Auto-envio: **não**. Indexação: **não**. Esta edição é material interno /
preview `noindex` até quality gate humano.

## Flagship page (futura)

- URL candidata (ainda sem index): `/radar/pesquisa/edicao-zero-4uf/`
- Não substitui `/radar/nacional-obras-publicas/` (página GSC-demand).
- Hero: recorte SC/PI/MG/RS, hash e `as_of` visíveis acima da dobra.
- Bloco 1: funil de cobertura (C4).
- Bloco 2: valor por mercado (C1) + tickets (C3).
- Bloco 3: metodologia e limitações.
- CTA discreto: Bid Room / auditoria / aditivos / defesa de margem, depois dos fatos.

## Relatório futuro

Título de trabalho: "Pavimentação e edificações públicas — recorte extra-cli
pré-nacional (SC, PI, MG, RS), data_as_of {pack['data_as_of']}".
20 páginas no máximo. Sem capítulo "O mercado brasileiro".

## LinkedIn

1. "{q1['published_market_contract_count']} contratos e {_brl(q1['published_market_total_value_brl'])} no recorte publicado SC/PI/MG/RS. Não é o Brasil. Método e hash: [link noindex ou, após gate, flagship]."
2. "Mediana de pavimentação neste snapshot é contrato integral com piso de 5000 BRL, não preço de m². Quem cita mediana como unitário está lendo o recorte errado."
3. "A única concentração mensurável desta edição é um órgão, um dia, um fornecedor dominante — e parte das linhas é reajuste. Concentração nacional: não sustentado."

## Press pitch

Assunto: CONFENGE publica EDIÇÃO ZERO de pesquisa sobre contratos de
pavimentação e edificações em 4 UFs, com método aberto e sem censo inventado.

Lead: o snapshot extra-cli usado pela CONFENGE (`{pack['dataset_hash'][:12]}…`,
as_of {pack['data_as_of']}) sustenta volume, ticket e contagens de
compradores/fornecedores em quatro células publicadas. Não sustenta ranking
nacional nem evolução anual.

## Emails

- Editorial (SINDUSCON / CBIC / imprensa técnica): oferecer o pack
  machine-readable + metodologia. Pedido: crítica do denominator, não republicação
  do número como "Brasil".
- ABM (diretor de contrato / orçamentista): recorte do ticket P25–P75 da UF
  em que a empresa opera + oferta Bid Room / auditoria, sem score comercial.

## Vídeos curtos (45s)

1. Funil: carregados → aec_confirmed → 4 mercados. Encerrar com "isso não é o Brasil".
2. Ticket: mostrar P25/mediana/P75 e riscar "preço do m²".
3. Caxias: 1 órgão, 1 dia, reajustes no meio. "Concentração exige microdados."

## Link-earning thesis

Jornalistas e associações citam recortes honestos com método, hash e
limitação visíveis. O ativo que gera backlink aqui não é o maior número —
é o recorte que recusa o número nacional que o PNCP "parece" entregar.
Peça citável: `pack.json` + `metodologia.md` + `data-quality.md`.

## Ofertas CONFENGE (discretas)

{chr(10).join(f"- /{slug}/" for slug in WEDGE['commercial_fit'])}

{pack['offers']['note']}
"""
    written["distribution"] = directory / "distribution.md"
    written["distribution"].write_text(distribution_md, encoding="utf-8")

    readme = f"""# EDIÇÃO ZERO — research pack

| Campo | Valor |
| --- | --- |
| Verdict | `{pack['verdict']}` |
| Wedge | {pack['wedge']['label']} |
| dataset_hash | `{pack['dataset_hash']}` |
| data_as_of | `{pack['data_as_of']}` |
| Perguntas | {len(pack['questions'])} |
| Gráficos | {len(pack['charts'])} |
| Indexável | `{pack['indexation']['indexable']}` |

- [tese.md](tese.md)
- [metodologia.md](metodologia.md)
- [findings.md](findings.md)
- [data-quality.md](data-quality.md)
- [visual-spec.md](visual-spec.md)
- [distribution.md](distribution.md)
- [consumer-contract-extra-cli-400.md](consumer-contract-extra-cli-400.md)
- Machine-readable: `data/research/edicao-zero-2026-07-31/pack.json`
- Citação pública: `radar/pesquisa/edicao-zero-4uf/edicao-zero-citation.json`

Próxima ação: {pack['next_action']}
"""
    written["README"] = directory / "README.md"
    written["README"].write_text(readme, encoding="utf-8")
    return written


def render_distribution_json(pack: dict[str, Any]) -> Path:
    root = _root()
    path = root / DISTRIBUTION_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    q1 = next(item for item in pack["questions"] if item["id"] == "Q1")["value"]
    payload = {
        "schema": "research-distribution-pack-v1",
        "edition": pack["edition"],
        "as_of": pack["data_as_of"],
        "dataset_hash": pack["dataset_hash"],
        "auto_send": False,
        "indexable": False,
        "preview_url": "/radar/pesquisa/edicao-zero-4uf/",
        "does_not_replace": "/radar/nacional-obras-publicas/",
        "verdict": pack["verdict"],
        "tese": pack["wedge"]["label"],
        "findings": [
            item for item in pack["findings"] if not str(item["id"]).startswith("ADV-")
        ],
        "linkedin": [
            (
                f"{q1['published_market_contract_count']} contratos e "
                f"{q1['published_market_total_value_brl']} BRL no recorte "
                f"publicado SC/PI/MG/RS. Não é o Brasil. "
                f"hash {pack['dataset_hash'][:12]} as_of {pack['data_as_of']}."
            ),
            (
                "Mediana neste snapshot é contrato integral com piso de 5000 BRL, "
                "não preço de m² e não faixa nacional de preço praticado."
            ),
            (
                "Concentração nacional: não sustentado. A fatia mensurável é "
                "um órgão, um dia, com reajuste misturado a ordem de serviço."
            ),
        ],
        "press_pitch": (
            "EDIÇÃO ZERO CONFENGE: volume e ticket de pavimentação e "
            "edificações em 4 UFs, com método aberto. Sem censo inventado."
        ),
        "emails": {
            "editorial": "Pack + metodologia para crítica do denominator.",
            "abm": "Ticket P25–P75 da UF da empresa + Bid Room / auditoria.",
        },
        "videos": [
            "Funil de cobertura; encerrar com o recorte de 4 UFs.",
            "Ticket P25/mediana/P75; riscar preço de m².",
            "Caxias: 1 órgão, 1 dia, reajustes.",
        ],
        "link_earning_thesis": (
            "Citação vem da recusa honesta do número nacional, não do maior total."
        ),
        "internal_link_destinations": [f"/{slug}/" for slug in WEDGE["commercial_fit"]],
        "next_action": pack["next_action"],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def _chart_table(chart: dict[str, Any]) -> str:
    dados = chart.get("dados") or []
    if not dados:
        return "<p>Sem série.</p>"
    keys = list(dados[0].keys())
    head = "".join(f"<th>{escape(str(key))}</th>" for key in keys)
    body = []
    for row in dados:
        tds = "".join(f"<td>{escape(str(row.get(key)))}</td>" for key in keys)
        body.append(f"<tr>{tds}</tr>")
    return (
        f"<table class=\"radar-table\"><thead><tr>{head}</tr></thead>"
        f"<tbody>{''.join(body)}</tbody></table>"
    )


def render_preview(pack: dict[str, Any]) -> Path:
    root = _root()
    directory = root / PREVIEW_DIR
    directory.mkdir(parents=True, exist_ok=True)
    download_payload = citation_download_payload(pack)
    download_path = directory / DOWNLOAD_FILENAME
    download_path.write_text(
        json.dumps(download_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    jsonld = dataset_jsonld(pack, download_present=True)
    jsonld_tag = (
        f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>'
        if jsonld
        else ""
    )
    citation = pack.get("citation") or {}
    q1 = next(item for item in pack["questions"] if item["id"] == "Q1")["value"]
    findings_html = "".join(
        (
            f"<li id=\"finding-{escape(str(item['id']))}\">"
            f"<strong>{escape(str(item['id']))}</strong> "
            f"({escape(str(item['status']))}): {escape(item['claim'])} "
            f"<a href=\"{(item.get('evidence') or {}).get('anchor') or '#' + str(item.get('question_id') or '')}\">"
            f"evidência {escape(str(item.get('question_id') or ''))}</a></li>"
        )
        for item in pack["findings"]
        if not str(item["id"]).startswith("ADV-")
    )
    questions_html = "".join(
        (
            f"<section id=\"{escape(question['id'])}\">"
            f"<h3>{escape(question['id'])} — {escape(question['theme'])}</h3>"
            f"<p><strong>Pergunta.</strong> {escape(question['question'])}</p>"
            f"<p><strong>Status.</strong> {escape(question['status'])}</p>"
            f"<p><strong>Fonte.</strong> {escape(str(question.get('source') or ''))}</p>"
            f"<p><strong>Denominator.</strong> {escape(str(question.get('denominator') or ''))}</p>"
            f"<p><strong>Limitação.</strong> {escape(str(question.get('limitation') or ''))}</p>"
            "</section>"
        )
        for question in pack["questions"]
    )
    charts_html = "".join(
        f"<section id=\"{escape(chart['id'])}\">"
        f"<h3>{escape(chart['id'])}</h3>"
        f"<p><strong>Pergunta.</strong> {escape(chart['pergunta'])}</p>"
        f"{_chart_table(chart)}"
        f"<p><strong>Unidade.</strong> {escape(chart['unidade'])}</p>"
        f"<p><strong>Fonte.</strong> {escape(str(chart.get('source') or ''))}</p>"
        f"<p><strong>Método.</strong> {escape(str(chart.get('method') or ''))}</p>"
        f"<p><strong>Caveat.</strong> {escape(chart['caveat'])}</p>"
        f"<p><strong>Takeaway.</strong> {escape(chart['takeaway'])}</p>"
        "</section>"
        for chart in pack["charts"]
    )
    robots = pack["indexation"]["robots"]
    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>EDIÇÃO ZERO (preview noindex) | CONFENGE</title>
<meta name="description" content="Preview interno do research pack pré-nacional SC/PI/MG/RS. Sem indexação."/>
<meta name="robots" content="{escape(robots)}"/>
<link rel="canonical" href="https://confenge.com.br/radar/pesquisa/edicao-zero-4uf/"/>
<link rel="stylesheet" href="/styles.css"/>
<link href="/assets/favicon-32.png" rel="icon" sizes="32x32" type="image/png"/>
{jsonld_tag}
<style>
.radar-table {{ width:100%; border-collapse:collapse; font-size:.92rem; margin:1rem 0; }}
.radar-table th,.radar-table td {{ border:1px solid rgba(15,23,42,.1); padding:.5rem .6rem; text-align:left; }}
.radar-table th {{ background:#f1f5f9; }}
.note-box {{ background:#fffbeb; border:1px solid #fcd34d; padding:1rem; border-radius:10px; margin:1rem 0; }}
.method-box {{ background:#f8fafc; border:1px solid #e2e8f0; padding:1rem 1.15rem; border-radius:10px; margin:1rem 0; }}
.cite-box {{ background:#eef2ff; border:1px solid #c7d2fe; padding:1rem 1.15rem; border-radius:10px; margin:1rem 0; }}
</style>
</head>
<body>
<a class="skip-link" href="#conteudo">Ir ao conteúdo</a>
<main id="conteudo" class="container" style="max-width:900px;padding:2rem 1rem 4rem">
<p class="eyebrow">Preview interno · {escape(robots)} · EDIÇÃO ZERO</p>
<h1>Pavimentação e edificações no recorte pré-nacional (SC, PI, MG, RS)</h1>
<p class="content-lead">
Research pack factual. {q1['published_market_contract_count']} contratos e
{_brl(q1['published_market_total_value_brl'])} nos 4 mercados publicados.
Não descreve o Brasil.
</p>
<div class="note-box">
<p><strong>Veredito:</strong> {escape(pack['verdict'])}</p>
<p>{escape(pack['verdict_reason'])}</p>
<p><strong>Indexação:</strong> {escape(robots)}. Fora do sitemap enquanto o gate nacional não passar.</p>
<p><strong>Bloqueio:</strong> {escape(str(pack.get('next_action') or ''))}</p>
</div>
<div class="cite-box" id="citacao">
<p><strong>Permalink:</strong> <a href="{escape(citation.get('permalink') or 'https://confenge.com.br/radar/pesquisa/edicao-zero-4uf/')}">{escape(citation.get('permalink_path') or '/radar/pesquisa/edicao-zero-4uf/')}</a></p>
<p><strong>Como citar:</strong> {escape(citation.get('text') or '')}</p>
<p><strong>Versão:</strong> {escape(str(citation.get('version_label') or pack.get('data_as_of')))}</p>
<p><strong>Download:</strong> <a href="{escape(DOWNLOAD_FILENAME)}">{escape(DOWNLOAD_FILENAME)}</a> (pack de citação versionado; não é dump de microdados)</p>
</div>
<div class="method-box" id="metodologia">
<p><strong>dataset_hash:</strong> <code>{escape(pack['dataset_hash'])}</code></p>
<p><strong>data_as_of:</strong> {escape(str(pack['data_as_of']))}</p>
<p><strong>Semântica:</strong> {escape(str((pack.get('methodology') or {}).get('value_semantics') or ''))}</p>
<p><strong>Reprodução:</strong> <code>python3 -m scripts.research build</code></p>
</div>
<h2>Findings</h2>
<ul>{findings_html}</ul>
<h2>Perguntas e evidência</h2>
{questions_html}
<h2>Gráficos essenciais</h2>
{charts_html}
<h2>Ofertas (depois dos fatos)</h2>
<ul>
{''.join(f'<li><a href="/{slug}/">{escape(slug)}</a></li>' for slug in WEDGE['commercial_fit'])}
</ul>
<p><a href="/radar/nacional-obras-publicas/">Radar GSC (página distinta, não substituída)</a></p>
</main>
</body>
</html>
"""
    path = directory / "index.html"
    path.write_text(html, encoding="utf-8")
    return path


def render_all(pack: dict[str, Any]) -> dict[str, Path]:
    docs = render_docs(pack)
    return {
        **docs,
        "distribution_json": render_distribution_json(pack),
        "preview": render_preview(pack),
    }
