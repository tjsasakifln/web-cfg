"""Copy public-safe kit files into the exclusive noindex assets namespace.

The public artifact assembler forbids .md and basename package.json. Those
files stay in data/data-desk/packages/**. Public copies use .txt/.json/.csv/.svg/.html.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.data_desk.bind import CANONICAL_SOURCE

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
    "request-contract.json",
    "syndication.json",
    "dataset.json",
    "index.html",
    "README.txt",
)


def kit_landing_html(package: dict[str, Any], *, files: list[str]) -> str:
    source = package.get("canonical") or package.get("public_canonical") or CANONICAL_SOURCE
    title = package.get("title") or "CONFENGE Data Desk"
    permalink = package.get("permalink") or ""
    links = "\n".join(f'  <li><a href="{name}">{name}</a></li>' for name in files if name != "index.html")
    return (
        "<!DOCTYPE html>\n"
        '<html lang="pt-BR">\n'
        "<head>\n"
        '<meta charset="utf-8"/>\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1"/>\n'
        f"<title>Kit de citação (noindex) — {title}</title>\n"
        '<meta name="robots" content="noindex,follow"/>\n'
        '<meta name="description" content="Pacote de citação e recorte agregado. Fonte canônica CONFENGE. Esta URL não é indexável."/>\n'
        f'<link rel="canonical" href="{source}"/>\n'
        "</head>\n"
        "<body>\n"
        "<p><strong>noindex,follow</strong> — esta URL não é uma página indexável.</p>\n"
        "<h1>Kit de citação — ticket contratual de pavimentação em Santa Catarina</h1>\n"
        f"<p>Fonte canônica: <a href=\"{source}\">{source}</a></p>\n"
        "<p>Este kit não reescreve a resposta. Cite o Market Answer. "
        "O recorte é UF=SC. Ticket nominal não é custo por km. "
        "Missingness permanece visível.</p>\n"
        "<h2>Arquivos</h2>\n"
        f"<ul>\n{links}\n</ul>\n"
        f"<p>Permalink do kit: {permalink}</p>\n"
        "<p>Licença: NEEDS_REVIEW. Ver usage guidance no manifesto. "
        "Correção: <a href=\"https://confenge.com.br/correcoes/\">https://confenge.com.br/correcoes/</a></p>\n"
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
        "indexable": False,
        "sitemap": False,
        "robots": "noindex,follow",
        "package_hash": package.get("package_hash"),
        "package_version": package.get("package_version"),
        "payload_content_hash": package.get("payload_content_hash"),
        "rendered_content_hash": package.get("rendered_content_hash"),
        "as_of": package.get("as_of"),
        "data_version": package.get("data_version"),
        "license": package.get("license"),
        "usage_guidance": package.get("usage_guidance"),
        "auto_send": False,
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
        "request-contract.json": "request-contract.json",
        "syndication.json": "syndication.json",
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
                "CONFENGE Data Desk — kit de citação (noindex,follow)",
                f"Fonte canônica: {package.get('canonical') or CANONICAL_SOURCE}",
                f"Permalink do kit: {package.get('permalink')}",
                f"package_hash: {package.get('package_hash')}",
                "Esta URL não entra em sitemap e não é indexável.",
                "Cite o Market Answer. Não converta ticket em custo/km.",
                "Licença: NEEDS_REVIEW. auto_send=false.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return dest
