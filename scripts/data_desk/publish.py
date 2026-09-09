"""Copy public-safe kit files into the exclusive noindex assets namespace.

The public artifact assembler forbids .md and basename package.json. Those
files stay in data/data-desk/packages/**. Public copies use .txt/.json/.csv/.svg/.html.
"""

from __future__ import annotations

import csv
import json
import re
from decimal import Decimal
from html import escape
from pathlib import Path
from typing import Any

from scripts.data_desk.bind import CANONICAL_SOURCE
from scripts.site.authority import CORRECTION_CHANNEL_HREF

PUBLIC_REL = Path("assets/data-desk/valor-tipico-contratos-pavimentacao-sc/v1")
PUBLIC_BASENAMES = (
    "citation.txt",
    "citation-short.txt",
    "chart.svg",
    "table.csv",
    "method.json",
    "method.txt",
    "coverage.json",
    "limitations.txt",
    "PRESS-BRIEF.txt",
    "kit-manifest.json",
    "dataset.json",
    "index.html",
    "README.txt",
)

PUBLIC_FILE_LABELS = {
    "citation.txt": "Citação completa",
    "citation-short.txt": "Citação curta",
    "chart.svg": "Gráfico acessível dos quartis",
    "table.csv": "Tabela agregada em CSV",
    "method.json": "Método em JSON",
    "method.txt": "Método em texto",
    "coverage.json": "Cobertura em JSON",
    "limitations.txt": "Limitações em texto",
    "PRESS-BRIEF.txt": "Resumo para imprensa e citação",
    "kit-manifest.json": "Manifesto dos arquivos",
    "dataset.json": "Metadados do conjunto de dados",
    "README.txt": "Leia-me",
}

_PUBLIC_COPY_FORBIDDEN = re.compile(
    r"Market Answer|Missingness|NEEDS_REVIEW|usage guidance|/correcoes/"
    r"|Corrections:|Human review only|What these data"
    r"|## (?:Citation|Coverage|Limitations|Correction|Contact|License)",
    re.I,
)


def _format_brl(value: Any) -> str:
    decimal = Decimal(str(value))
    places = max(2, -decimal.as_tuple().exponent)
    number = f"{decimal:,.{places}f}"
    return "R$ " + number.replace(",", "X").replace(".", ",").replace("X", ".")


def _string_values(value: Any):
    if isinstance(value, dict):
        for child in value.values():
            yield from _string_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from _string_values(child)
    elif isinstance(value, str):
        yield value


def assert_public_human_copy(dest: Path) -> None:
    """Fail closed on publication internals in visitor-readable kit fields."""
    failures: list[str] = []
    for path in sorted(dest.iterdir()):
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        if suffix == ".json":
            values = "\n".join(_string_values(json.loads(path.read_text(encoding="utf-8"))))
            if _PUBLIC_COPY_FORBIDDEN.search(values):
                failures.append(path.name)
        elif suffix in {".html", ".svg", ".txt", ".csv"}:
            text = path.read_text(encoding="utf-8", errors="replace")
            if suffix == ".html":
                body = re.search(r"<body\b[^>]*>(.*?)</body>", text, re.I | re.S)
                text = body.group(1) if body else text
            elif suffix == ".csv":
                rows = list(csv.DictReader(text.splitlines()))
                text = "\n".join(str(row.get("note") or "") for row in rows)
            if _PUBLIC_COPY_FORBIDDEN.search(text):
                failures.append(path.name)
    if failures:
        raise ValueError("public_data_desk_copy_internal:" + ",".join(failures))


def kit_landing_html(package: dict[str, Any], *, files: list[str]) -> str:
    source = package.get("canonical") or package.get("public_canonical") or CANONICAL_SOURCE
    title = package.get("title") or "CONFENGE Data Desk"
    permalink = package.get("permalink") or ""
    stats = package.get("stats") or {}
    missing = package.get("missingness") or {}
    links = "\n".join(
        f'  <li><a href="{escape(name)}">{escape(PUBLIC_FILE_LABELS.get(name, name))}</a> '
        f'<small>({escape(name)})</small></li>'
        for name in files
        if name != "index.html"
    )
    correction = package.get("correction_link") or f"{CORRECTION_CHANNEL_HREF}"
    terms = package.get("license_url") or "https://confenge.com.br/termos-de-uso/"
    return (
        "<!DOCTYPE html>\n"
        '<html lang="pt-BR">\n'
        "<head>\n"
        '<meta charset="utf-8"/>\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1"/>\n'
        f"<title>{escape(str(title))}</title>\n"
        '<meta name="robots" content="noindex,follow"/>\n'
        '<meta name="description" content="Dados agregados, método, gráfico e citações sobre valores nominais de contratos públicos de pavimentação em Santa Catarina."/>\n'
        f'<link rel="canonical" href="{escape(str(source))}"/>\n'
        "<style>body{margin:0;background:#f5f7fa;color:#10233d;font:17px/1.6 system-ui,sans-serif}"
        "main{max-width:58rem;margin:auto;padding:clamp(1.25rem,4vw,3rem)}h1{line-height:1.15}"
        "h2{margin-top:2rem}a{color:#075a9c;text-underline-offset:.18em}a:focus-visible{outline:3px solid #f4b400;outline-offset:3px}"
        "li{margin:.45rem 0}small{color:#52647a}</style>\n"
        "</head>\n"
        "<body>\n"
        "<main>\n"
        "<h1>Kit de citação: valor contratual de pavimentação em Santa Catarina</h1>\n"
        "<p>Arquivos para quem precisa citar ou conferir a faixa de valor integral nominal "
        "dos contratos públicos de pavimentação no recorte de Santa Catarina.</p>\n"
        f"<p>A análise reúne <strong>{escape(str(stats.get('n')))} registros utilizáveis</strong> "
        f"de {escape(str(missing.get('total_keyword_rows')))} encontrados. "
        f"A mediana é <strong>{escape(_format_brl(stats.get('median')))}</strong>; "
        f"o primeiro e o terceiro quartis são {escape(_format_brl(stats.get('p25')))} e "
        f"{escape(_format_brl(stats.get('p75')))}. "
        f"{escape(str(missing.get('unknown_or_nonpositive')))} registros ficaram fora da amostra "
        "por valor ausente ou não positivo.</p>\n"
        "<p>Use o recorte para compreender a escala nominal dos instrumentos e citar os "
        "quartis com método e limitações. Ele não informa custo por km, preço unitário, "
        "ranking ou estatística nacional.</p>\n"
        f"<p>Dados consultados em {escape(str(package.get('as_of')))}. "
        f"<a href=\"{escape(str(source))}\">Leia a análise técnica e a fonte canônica</a>.</p>\n"
        "<h2>O que está disponível</h2>\n"
        f"<ul>\n{links}\n</ul>\n"
        f"<p>Link permanente deste kit: {escape(str(permalink))}</p>\n"
        "<h2>Condições de uso e correções</h2>\n"
        f"<p>{escape(str(package.get('license_notice') or 'Consulte os Termos de Uso da CONFENGE.'))} "
        f'<a href="{escape(str(terms))}">Consulte os Termos de Uso</a>.</p>\n'
        f'<p><a href="{escape(str(correction))}">Solicitar correção ou falar com a CONFENGE</a>.</p>\n'
        "</main>\n"
        "</body>\n"
        "</html>\n"
    )


def kit_manifest(package: dict[str, Any], *, files: list[str]) -> dict[str, Any]:
    return {
        "schema": "data_desk_public_kit_v1",
        "id": package.get("id"),
        "title": package.get("title"),
        "canonical_source": package.get("canonical") or CANONICAL_SOURCE,
        "permalink": package.get("permalink"),
        "package_hash": package.get("package_hash"),
        "package_version": package.get("package_version"),
        "payload_content_hash": package.get("payload_content_hash"),
        "rendered_content_hash": package.get("rendered_content_hash"),
        "as_of": package.get("as_of"),
        "data_version": package.get("data_version"),
        "license_notice": package.get("license_notice"),
        "license_url": package.get("license_url"),
        "usage_guidance": package.get("usage_guidance"),
        "stats": package.get("stats"),
        "missingness": package.get("missingness"),
        "png_included": bool(package.get("png_included")),
        "files": files,
    }


def publish_public_namespace(
    package: dict[str, Any],
    *,
    package_dir: Path,
    dest: Path,
) -> Path:
    if dest.exists():
        for child in dest.iterdir():
            if child.is_file():
                child.unlink()
    dest.mkdir(parents=True, exist_ok=True)

    mapping = {
        "citation.txt": "citation.txt",
        "citation-short.txt": "citation-short.txt",
        "chart.svg": "chart.svg",
        "table.csv": "table.csv",
        "method.json": "method.json",
        "method.md": "method.txt",
        "coverage.json": "coverage.json",
        "limitations.md": "limitations.txt",
        "PRESS-BRIEF.md": "PRESS-BRIEF.txt",
        "dataset.jsonld": "dataset.json",
    }
    written: list[str] = []
    for src_name, dest_name in mapping.items():
        src = package_dir / src_name
        if src.is_file():
            (dest / dest_name).write_bytes(src.read_bytes())
            written.append(dest_name)

    files_for_index = sorted(set(written + ["kit-manifest.json", "README.txt", "index.html"]))
    manifest = kit_manifest(package, files=files_for_index)
    (dest / "kit-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (dest / "index.html").write_text(
        kit_landing_html(package, files=files_for_index),
        encoding="utf-8",
    )
    (dest / "README.txt").write_text(
        "\n".join(
            [
                "CONFENGE — kit de citação sobre contratos de pavimentação em Santa Catarina",
                f"Fonte canônica: {package.get('canonical') or CANONICAL_SOURCE}",
                f"Permalink do kit: {package.get('permalink')}",
                f"package_hash: {package.get('package_hash')}",
                f"Dados consultados em: {package.get('as_of')}",
                f"Amostra utilizável: {(package.get('stats') or {}).get('n')} de "
                f"{(package.get('missingness') or {}).get('total_keyword_rows')}; "
                f"{(package.get('missingness') or {}).get('unknown_or_nonpositive')} registros "
                "ficaram fora por valor ausente ou não positivo.",
                "Cite a análise técnica e preserve a fonte, o método, a data, o tamanho da amostra e as limitações.",
                str(package.get("license_notice") or "Consulte os Termos de Uso da CONFENGE."),
                f"Termos de Uso: {package.get('license_url') or 'https://confenge.com.br/termos-de-uso/'}",
                f"Correções: {package.get('correction_link') or CORRECTION_CHANNEL_HREF}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    assert_public_human_copy(dest)
    return dest
