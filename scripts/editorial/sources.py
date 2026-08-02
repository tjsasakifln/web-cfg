"""Structured official source bank for editorial pages."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
SOURCES_PATH = ROOT / "data" / "editorial" / "SOURCE-MANIFEST.json"

ALLOWED_HOSTS = {
    "www.planalto.gov.br",
    "planalto.gov.br",
    "portal.tcu.gov.br",
    "pesquisa.apps.tcu.gov.br",
    "licitacoesecontratos.tcu.gov.br",
    "www.gov.br",
    "gov.br",
    "www.stf.jus.br",
    "stf.jus.br",
    "www.stj.jus.br",
    "stj.jus.br",
    "www.caixa.gov.br",
    "www.dnit.gov.br",
    "www.gov.br",
}

SOURCE_TYPES = {
    "statute",
    "regulation",
    "tcu_decision",
    "tcu_guidance",
    "stj_decision",
    "stf_decision",
    "agu_opinion",
    "official_cost_reference",
    "pncp_data",
    "technical_guidance",
}


def load_manifest(path: Path | None = None) -> dict[str, Any]:
    p = path or SOURCES_PATH
    if not p.exists():
        return {"schema_version": "1.0.0", "sources": []}
    return json.loads(p.read_text(encoding="utf-8"))


def save_manifest(data: dict[str, Any], path: Path | None = None) -> None:
    p = path or SOURCES_PATH
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def is_official_url(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    if not host:
        return False
    if host in ALLOWED_HOSTS:
        return True
    # allow subdomains of gov.br and jus.br
    return host.endswith(".gov.br") or host.endswith(".jus.br") or host.endswith(".tcu.gov.br")


def validate_source(src: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if not src.get("source_id"):
        issues.append("missing_source_id")
    st = src.get("type")
    if st not in SOURCE_TYPES:
        issues.append(f"invalid_type:{st}")
    url = src.get("url") or ""
    if not url or not is_official_url(url):
        issues.append("non_official_or_missing_url")
    if not src.get("title"):
        issues.append("missing_title")
    if not src.get("accessed_at"):
        issues.append("missing_accessed_at")
    if st in {"tcu_decision", "stj_decision", "stf_decision"}:
        if not src.get("number"):
            issues.append("decision_missing_number")
        if not src.get("body") and not src.get("court"):
            issues.append("decision_missing_court")
    if st == "statute" and not src.get("device"):
        # device optional at bank level; required when page claims a specific article
        pass
    return issues


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def page_sources_ok(
    page_source_ids: list[str],
    manifest: dict[str, Any],
    *,
    require_primary: bool = True,
) -> list[str]:
    """Fail if page lacks resolvable official sources."""
    issues: list[str] = []
    by_id = {s["source_id"]: s for s in manifest.get("sources") or [] if s.get("source_id")}
    if not page_source_ids:
        return ["no_sources"]
    primary_ok = False
    for sid in page_source_ids:
        src = by_id.get(sid)
        if not src:
            issues.append(f"unknown_source:{sid}")
            continue
        issues.extend(f"{sid}:{i}" for i in validate_source(src))
        if src.get("type") in {
            "statute",
            "regulation",
            "tcu_decision",
            "tcu_guidance",
            "stj_decision",
            "stf_decision",
            "agu_opinion",
            "official_cost_reference",
            "pncp_data",
        }:
            primary_ok = True
    if require_primary and not primary_ok:
        issues.append("no_primary_source")
    return issues


def extract_legal_devices(text: str) -> list[str]:
    found = re.findall(r"art\.?\s*(\d+)", text, flags=re.I)
    return sorted({f"art.{n}" for n in found})
