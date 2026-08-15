"""Citation, download payload and Dataset JSON-LD for one research edition.

Schema.org Dataset / DataDownload are emitted only when a real citation
artifact exists. DataCatalog is never emitted for a single preview pack.
"""

from __future__ import annotations

from typing import Any

CANONICAL_HOST = "https://confenge.com.br"
PERMALINK_PATH = "/radar/pesquisa/edicao-zero-4uf/"
DOWNLOAD_FILENAME = "edicao-zero-citation.json"
DOWNLOAD_PATH = f"{PERMALINK_PATH}{DOWNLOAD_FILENAME}"


def permalink() -> str:
    return f"{CANONICAL_HOST}{PERMALINK_PATH}"


def citation_text(pack: dict[str, Any]) -> str:
    return (
        f"CONFENGE. EDIÇÃO ZERO — {pack['wedge']['label']}. "
        f"dataset_hash {pack['dataset_hash']}; data_as_of {pack['data_as_of']}. "
        f"Veredito {pack['verdict']}. Não descreve o Brasil. "
        f"{permalink()}"
    )


def citation_block(pack: dict[str, Any], *, download_present: bool) -> dict[str, Any]:
    download = None
    if download_present:
        download = {
            "path": DOWNLOAD_PATH,
            "url": f"{CANONICAL_HOST}{DOWNLOAD_PATH}",
            "encoding_format": "application/json",
            "includes": [
                "citation",
                "methodology",
                "findings",
                "charts",
                "coverage",
                "dataset_hash",
                "data_as_of",
            ],
            "excludes": [
                "extra-cli datalake rows",
                "public_read_v1 entity internals",
                "national-candidate-inventory",
            ],
        }
    return {
        "permalink": permalink(),
        "permalink_path": PERMALINK_PATH,
        "text": citation_text(pack),
        "methodology_anchor": "#metodologia",
        "data_as_of": pack.get("data_as_of"),
        "dataset_hash": pack.get("dataset_hash"),
        "version_label": (
            f"{pack.get('data_as_of')} · {str(pack.get('dataset_hash') or '')[:12]}"
        ),
        "download": download,
    }


def citation_download_payload(pack: dict[str, Any]) -> dict[str, Any]:
    """Public, provenance-preserving subset. Not a dump of extra-cli."""
    charts = []
    for chart in pack.get("charts") or []:
        charts.append(
            {
                "id": chart.get("id"),
                "pergunta": chart.get("pergunta"),
                "dados": chart.get("dados"),
                "unidade": chart.get("unidade"),
                "source": chart.get("source"),
                "method": chart.get("method"),
                "caveat": chart.get("caveat"),
                "takeaway": chart.get("takeaway"),
            }
        )
    findings = []
    for item in pack.get("findings") or []:
        if str(item.get("id") or "").startswith("ADV-"):
            continue
        findings.append(
            {
                "id": item.get("id"),
                "status": item.get("status"),
                "claim": item.get("claim"),
                "question_id": item.get("question_id"),
                "evidence": item.get("evidence"),
            }
        )
    methodology = pack.get("methodology") or {}
    return {
        "schema": "confenge-research-citation-v1",
        "edition": pack.get("edition"),
        "permalink": permalink(),
        "citation": citation_text(pack),
        "dataset_hash": pack.get("dataset_hash"),
        "data_as_of": pack.get("data_as_of"),
        "verdict": pack.get("verdict"),
        "verdict_reason": pack.get("verdict_reason"),
        "wedge": pack.get("wedge"),
        "coverage": {
            "ufs": (pack.get("coverage") or {}).get("ufs"),
            "uf_count": (pack.get("coverage") or {}).get("uf_count"),
            "national_universe_complete": (pack.get("coverage") or {}).get(
                "national_universe_complete"
            ),
            "national_denominator": (pack.get("coverage") or {}).get(
                "national_denominator"
            ),
        },
        "methodology": {
            "title": methodology.get("title"),
            "producer": methodology.get("producer"),
            "producer_version": methodology.get("producer_version"),
            "source_repository": methodology.get("source_repository"),
            "source_commit_sha": methodology.get("source_commit_sha"),
            "source_run_id": methodology.get("source_run_id"),
            "value_semantics": methodology.get("value_semantics"),
            "dedup_logic": methodology.get("dedup_logic"),
            "steps": methodology.get("steps"),
            "limitations": methodology.get("limitations"),
        },
        "findings": findings,
        "charts": charts,
        "national_claim_gate": pack.get("national_claim_gate"),
        "indexation": pack.get("indexation"),
    }


def dataset_jsonld(pack: dict[str, Any], *, download_present: bool) -> dict[str, Any] | None:
    """Dataset + DataDownload only when the citation file is real. No DataCatalog."""
    if not download_present:
        return None
    citation = pack.get("citation") or citation_block(pack, download_present=True)
    download = citation.get("download") or {}
    return {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": pack.get("title") or "EDIÇÃO ZERO — recorte 4-UF (preview)",
        "description": (
            "Recorte versionado de pavimentação e edificações públicas em "
            "SC/PI/MG/RS. Não descreve o Brasil. "
            f"dataset_hash {pack.get('dataset_hash')}; "
            f"data_as_of {pack.get('data_as_of')}."
        ),
        "url": permalink(),
        "identifier": pack.get("dataset_hash"),
        "dateModified": pack.get("data_as_of"),
        "isAccessibleForFree": True,
        "creator": {
            "@type": "Organization",
            "name": "CONFENGE",
            "url": CANONICAL_HOST,
        },
        "distribution": {
            "@type": "DataDownload",
            "encodingFormat": "application/json",
            "contentUrl": download.get("url") or f"{CANONICAL_HOST}{DOWNLOAD_PATH}",
            "name": DOWNLOAD_FILENAME,
        },
    }
