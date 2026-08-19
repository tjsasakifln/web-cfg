"""Citation/download provenance kit for the flagship research asset (#65)."""

from __future__ import annotations

from typing import Any

from scripts.research.claims import coverage_allows_national, scan_claim_language
from scripts.research.pack import build_pack
from scripts.research.snapshot import load_snapshot

REQUIRED = ("source", "as_of", "method", "limitation", "canonical")


def citation_kit_from_pack(pack: dict[str, Any]) -> dict[str, Any]:
    coverage = pack.get("coverage") or {}
    citation = pack.get("citation") or {}
    methodology = pack.get("methodology") or {}
    if not isinstance(citation, dict):
        citation = {"text": citation}
    if not isinstance(methodology, dict):
        methodology = {"title": methodology}
    limitation = (
        pack.get("limitation")
        or coverage.get("limitation")
        or coverage.get("manifest_limitation")
        or (pack.get("caveats") or ["UNKNOWN"])[0]
    )
    kit = {
        "source": (
            pack.get("source")
            or methodology.get("source_repository")
            or methodology.get("producer")
            or citation.get("text")
        ),
        "as_of": pack.get("as_of") or pack.get("data_as_of") or citation.get("data_as_of"),
        "method": pack.get("method") or methodology.get("title") or methodology,
        "limitation": limitation,
        "canonical": (
            pack.get("canonical")
            or citation.get("permalink")
            or citation.get("permalink_path")
            or "https://confenge.com.br/"
        ),
        "national_index_authorized": coverage_allows_national(pack),
        "claim_violations": scan_claim_language(pack),
    }
    return kit


def evaluate_citation_kit(pack: dict[str, Any] | None = None) -> dict[str, Any]:
    if pack is None:
        pack = build_pack(load_snapshot())
    kit = citation_kit_from_pack(pack)
    fails: list[str] = []
    for field in REQUIRED:
        if not kit.get(field):
            fails.append(f"missing_{field}")
    if kit["national_index_authorized"] is True:
        fails.append("national_index_authorized_without_27uf")
    if kit["claim_violations"]:
        fails.append("claim_language")
    if kit.get("canonical") and "smartlic" in str(kit["canonical"]).lower():
        fails.append("citation_points_at_smartlic")
    return {
        "schema_version": "research-citation-kit-v1",
        "ok": not fails,
        "fails": fails,
        "kit": kit,
    }
