"""Deterministic named artifacts for an approved Data Desk asset."""

from __future__ import annotations

import csv
import io
import json
from typing import Any

from scripts.data_desk.bind import CANONICAL_SOURCE


def json_number(value: Any) -> str:
    return json.dumps(value)


def build_citation_text(asset: dict[str, Any]) -> str:
    stats = asset["stats"]
    missing = asset["missingness"]
    period = asset["period"]
    source = asset.get("canonical_source") or CANONICAL_SOURCE
    return (
        "CONFENGE. Valor típico dos contratos públicos de pavimentação em Santa Catarina. "
        f"Mediana {json_number(stats['median'])} BRL (valor integral nominal do instrumento); "
        f"P25 {json_number(stats['p25'])}; P75 {json_number(stats['p75'])}; "
        f"n útil {stats['n']} de {missing['total_keyword_rows']} "
        f"(missingness {missing['unknown_or_nonpositive']}). "
        f"Período {period['start']}–{period['end']}. UF=SC. "
        f"Método {asset.get('method_version')}. "
        f"Fonte canônica: {source}. "
        "Não é custo por km, m² ou unidade física. Não é estatística nacional."
    )


def build_citation_short(asset: dict[str, Any]) -> str:
    source = asset.get("canonical_source") or CANONICAL_SOURCE
    year = str(asset.get("as_of") or "2026")[:4]
    return (
        f"CONFENGE ({year}). Valor típico dos contratos públicos de pavimentação "
        f"em Santa Catarina. {source}"
    )


def build_aggregate_csv(asset: dict[str, Any]) -> str:
    stats = asset["stats"]
    missing = asset["missingness"]
    period = asset["period"]
    source = asset.get("canonical_source") or CANONICAL_SOURCE
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(
        [
            "metric",
            "value",
            "unit",
            "geography_code",
            "period_start",
            "period_end",
            "source",
            "note",
        ]
    )
    rows = [
        (
            "p25",
            json_number(stats["p25"]),
            "BRL_integral_nominal_instrument",
            "SC",
            period["start"],
            period["end"],
            source,
            "quartile from approved payload; not custo/km",
        ),
        (
            "median",
            json_number(stats["median"]),
            "BRL_integral_nominal_instrument",
            "SC",
            period["start"],
            period["end"],
            source,
            "integral nominal ticket; not custo/km",
        ),
        (
            "p75",
            json_number(stats["p75"]),
            "BRL_integral_nominal_instrument",
            "SC",
            period["start"],
            period["end"],
            source,
            "quartile from approved payload; not custo/km",
        ),
        (
            "n_usable",
            str(stats["n"]),
            "count",
            "SC",
            period["start"],
            period["end"],
            source,
            "usable sample; missingness not coerced to zero",
        ),
        (
            "n_total_keyword_rows",
            str(missing["total_keyword_rows"]),
            "count",
            "SC",
            period["start"],
            period["end"],
            source,
            "denominator of the SC recorte",
        ),
        (
            "missingness_unknown_or_nonpositive",
            str(missing["unknown_or_nonpositive"]),
            "count",
            "SC",
            period["start"],
            period["end"],
            source,
            "excluded non-positive totals; not a real ticket of zero",
        ),
    ]
    writer.writerows(rows)
    return buf.getvalue()


def build_quartile_svg(asset: dict[str, Any]) -> str:
    """Accessible quartile strip. Claims only P25/median/P75 from the payload."""
    stats = asset["stats"]
    source = asset.get("canonical_source") or CANONICAL_SOURCE
    p25, median, p75 = stats["p25"], stats["median"], stats["p75"]
    max_v = float(p75) * 1.08
    def x_of(value: float) -> float:
        return 80.0 + (float(value) / max_v) * 520.0

    x25, xmed, x75 = x_of(p25), x_of(median), x_of(p75)
    title = "Quartis do ticket contratual de pavimentação em Santa Catarina"
    desc = (
        f"P25 {json_number(p25)} BRL, mediana {json_number(median)} BRL, "
        f"P75 {json_number(p75)} BRL. Valor integral nominal do instrumento, "
        f"não custo por km. Recorte UF=SC. Fonte: {source}"
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" role="img" width="720" height="280" '
        'viewBox="0 0 720 280">\n'
        f"  <title>{title}</title>\n"
        f"  <desc>{desc}</desc>\n"
        '  <rect width="720" height="280" fill="#f8fafc"/>\n'
        '  <text x="24" y="32" font-family="system-ui,sans-serif" font-size="16" fill="#061a33">'
        "Ticket contratual típico de pavimentação — Santa Catarina</text>\n"
        '  <text x="24" y="54" font-family="system-ui,sans-serif" font-size="12" fill="#475569">'
        "Valor integral nominal do instrumento · não é custo por km · não é estatística nacional</text>\n"
        f'  <rect x="{x25:.2f}" y="110" width="{x75 - x25:.2f}" height="48" fill="#dbeafe" '
        'stroke="#0f4c81" stroke-width="2"/>\n'
        f'  <line x1="{xmed:.2f}" y1="102" x2="{xmed:.2f}" y2="166" stroke="#061a33" stroke-width="3"/>\n'
        f'  <text x="{x25:.2f}" y="96" font-family="system-ui,sans-serif" font-size="12" fill="#0f4c81">'
        f"P25 {json_number(p25)}</text>\n"
        f'  <text x="{xmed:.2f}" y="96" text-anchor="middle" font-family="system-ui,sans-serif" '
        f'font-size="12" fill="#061a33">mediana {json_number(median)}</text>\n'
        f'  <text x="{x75:.2f}" y="96" text-anchor="end" font-family="system-ui,sans-serif" '
        f'font-size="12" fill="#0f4c81">P75 {json_number(p75)}</text>\n'
        '  <text x="24" y="200" font-family="system-ui,sans-serif" font-size="12" fill="#334155">'
        f"n útil = {stats['n']} · missingness = {asset['missingness']['unknown_or_nonpositive']} "
        f"· período {asset['period']['start']}–{asset['period']['end']} · UF=SC</text>\n"
        '  <text x="24" y="228" font-family="system-ui,sans-serif" font-size="12" fill="#334155">'
        f"Fonte canônica: {source}</text>\n"
        '  <text x="24" y="252" font-family="system-ui,sans-serif" font-size="11" fill="#64748b">'
        "Unidade: BRL, grain integral_nominal_instrument. Correção: https://confenge.com.br/correcoes/</text>\n"
        "</svg>\n"
    )


def build_method_document(asset: dict[str, Any], package: dict[str, Any]) -> dict[str, Any]:
    stats = asset["stats"]
    return {
        "schema": "data_desk_method_v1",
        "method_version": package.get("method_version"),
        "schema_version": package.get("schema_version"),
        "source_schema_version": asset.get("source_schema_version"),
        "data_version": package.get("data_version"),
        "as_of": package.get("as_of"),
        "grain": asset.get("grain"),
        "grain_not": list(asset.get("grain_not") or []),
        "unit": stats.get("unit"),
        "currency": asset.get("currency") or "BRL",
        "geography": asset.get("geography"),
        "period": asset.get("period"),
        "n_usable": stats["n"],
        "n_total_keyword_rows": asset["missingness"]["total_keyword_rows"],
        "missingness": asset.get("missingness"),
        "coverage": asset.get("coverage"),
        "stats": {
            "p25": stats["p25"],
            "median": stats["median"],
            "p75": stats["p75"],
        },
        "description": (
            "Mediana e quartis (nearest-rank) do valor integral nominal do instrumento, "
            "tipologia documental de pavimentação, recorte exclusivo de Santa Catarina. "
            "Não estima custo por km, m² ou unidade física. Missingness de valores "
            "não positivos permanece visível e não é convertida em zero."
        ),
        "canonical_source": asset.get("canonical_source") or CANONICAL_SOURCE,
        "payload_content_hash": asset.get("payload_content_hash"),
        "rendered_content_hash": asset.get("rendered_content_hash"),
        "png": {
            "included": False,
            "reason": "no_reproducible_local_converter",
        },
        "refresh_owner": asset.get("refresh_owner") or "CONFENGE / market-answers",
        "invalidation": asset.get("invalidation"),
    }


def method_markdown(doc: dict[str, Any]) -> str:
    stats = doc["stats"]
    return "\n".join(
        [
            f"# Método — {doc.get('method_version')}",
            "",
            doc.get("description") or "",
            "",
            f"- Grain: `{doc.get('grain')}`",
            f"- Não é: {', '.join(doc.get('grain_not') or [])}",
            f"- Unidade: `{doc.get('unit')}` · moeda {doc.get('currency')}",
            f"- Geografia: UF=SC (Santa Catarina). Sem estatística nacional.",
            f"- Período: {doc['period']['start']}–{doc['period']['end']}",
            f"- n útil: {doc.get('n_usable')} · denominador: {doc.get('n_total_keyword_rows')}",
            f"- Missingness: {json.dumps(doc.get('missingness'), ensure_ascii=False)}",
            f"- P25: {json_number(stats['p25'])} · mediana: {json_number(stats['median'])} · P75: {json_number(stats['p75'])}",
            f"- as_of: {doc.get('as_of')}",
            f"- Fonte canônica: {doc.get('canonical_source')}",
            f"- payload_content_hash: `{doc.get('payload_content_hash')}`",
            f"- rendered_content_hash: `{doc.get('rendered_content_hash')}`",
            f"- PNG: omitido ({(doc.get('png') or {}).get('reason')})",
            f"- Owner de refresh: {doc.get('refresh_owner')}",
            "",
            "Atualização do payload invalida este pacote ou exige nova `data_version`. "
            "Não há backfill silencioso.",
            "",
        ]
    )


def coverage_manifest(asset: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "data_desk_coverage_v1",
        "canonical_source": asset.get("canonical_source") or CANONICAL_SOURCE,
        "payload_content_hash": asset.get("payload_content_hash"),
        "rendered_content_hash": asset.get("rendered_content_hash"),
        "geography": asset.get("geography"),
        "period": asset.get("period"),
        "coverage": asset.get("coverage"),
        "missingness": asset.get("missingness"),
        "grain": asset.get("grain"),
        "grain_not": list(asset.get("grain_not") or []),
        "n_usable": (asset.get("stats") or {}).get("n"),
        "n_total": (asset.get("missingness") or {}).get("total_keyword_rows"),
        "claim_scope": "uf",
        "national_statistic": False,
        "source": "extra-cli public-read SELECT-only + editorial approval hashes",
        "extra_cli_content_hash_not_binding": asset.get("extra_cli_content_hash"),
        "note": (
            "The binding hashes are payload_content_hash and rendered_content_hash "
            "from data/editorial/market-answers/approvals.json. extra-cli content_hash "
            "is provenance only and must not be treated as the approval hash."
        ),
    }


def limitations_markdown(asset: dict[str, Any]) -> str:
    source = asset.get("canonical_source") or CANONICAL_SOURCE
    lines = [
        "# Limitações",
        "",
        f"Fonte canônica: {source}",
        "",
    ]
    for item in asset.get("limitations_pt") or asset.get("limitations") or []:
        lines.append(f"- {item}")
    lines.extend(
        [
            "",
            "## Claims proibidos",
            "",
        ]
    )
    for item in asset.get("prohibited_claims") or []:
        lines.append(f"- {item}")
    lines.extend(
        [
            "",
            "Missingness não é zero. Ticket nominal não é custo/km. "
            "O recorte é Santa Catarina, não o Brasil.",
            "",
        ]
    )
    return "\n".join(lines)
