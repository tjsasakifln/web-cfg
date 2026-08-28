"""Fail-closed match of public legalName, taxID and sameAs to the committed identity registry.

Nothing in that registry is independently verified: every row is self-declared by
CONFENGE and carries third_party_verified false. This module only stops the site
from publishing an identity value that is not in the registry at all.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from scripts.local_entity.graph import extract_entity_graph, extract_jsonld_blocks, flatten_jsonld_nodes

ROOT = Path(__file__).resolve().parents[2]
VERIFIED_SOURCES_PATH = ROOT / "data" / "local-entity" / "verified-sources.json"
GITHUB_SAME_AS = "https://github.com/tjsasakifln"


def load_verified_sources(path: Path | None = None) -> dict[str, Any]:
    payload = json.loads((path or VERIFIED_SOURCES_PATH).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("verified_sources_not_object")
    return payload


def allowed_legal_names(sources: dict[str, Any] | None = None) -> set[str]:
    data = sources or load_verified_sources()
    value = ((data.get("organization") or {}).get("legalName") or {}).get("value")
    return {str(value)} if value else set()


def allowed_tax_ids(sources: dict[str, Any] | None = None) -> set[str]:
    data = sources or load_verified_sources()
    value = ((data.get("organization") or {}).get("taxID") or {}).get("value")
    return {str(value)} if value else set()


def allowed_same_as(sources: dict[str, Any] | None = None) -> set[str]:
    data = sources or load_verified_sources()
    out: set[str] = set()
    for row in (data.get("organization") or {}).get("sameAs") or []:
        if isinstance(row, dict) and row.get("value"):
            out.add(str(row["value"]))
    for row in (data.get("person") or {}).get("sameAs") or []:
        if isinstance(row, dict) and row.get("value"):
            out.add(str(row["value"]))
    return out


def _as_list(value: Any) -> list[str]:
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def public_identity_errors(html: str, sources: dict[str, Any] | None = None) -> list[str]:
    """Reject legalName/taxID/sameAs that are not in the committed verified-source registry."""
    data = sources or load_verified_sources()
    names = allowed_legal_names(data)
    taxes = allowed_tax_ids(data)
    same = allowed_same_as(data)
    errors: list[str] = []
    graph = extract_entity_graph(html)
    org = graph.get("organization") or {}
    person = graph.get("person") or {}
    legal = org.get("legalName")
    if legal and str(legal) not in names:
        errors.append(f"legalName_not_verified:{legal}")
    tax = org.get("taxID")
    if tax and str(tax) not in taxes:
        errors.append(f"taxID_not_verified:{tax}")
    for url in _as_list(org.get("sameAs")) + _as_list(person.get("sameAs")):
        if url not in same:
            errors.append(f"sameAs_not_verified:{url}")
    visible = re.sub(r"<script\b[^>]*>.*?</script>", " ", html or "", flags=re.I | re.S)
    if re.search(r"\bCREA\b", visible, flags=re.I):
        errors.append("crea_published_without_verification")
    if re.search(r"streetAddress|PostalAddress|LocalBusiness", html or ""):
        nodes = flatten_jsonld_nodes(extract_jsonld_blocks(html))
        for node in nodes:
            types = node.get("@type")
            type_set = {types} if isinstance(types, str) else set(types or [])
            if "PostalAddress" in type_set or "LocalBusiness" in type_set or node.get("streetAddress"):
                errors.append("street_or_local_business_published")
                break
    return list(dict.fromkeys(errors))


def _identity_rows(data: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    rows: list[tuple[str, dict[str, Any]]] = []
    org = data.get("organization") or {}
    for key in ("legalName", "taxID"):
        row = org.get(key)
        if isinstance(row, dict):
            rows.append((f"organization.{key}", row))
    for scope in ("organization", "person"):
        for index, row in enumerate((data.get(scope) or {}).get("sameAs") or []):
            if isinstance(row, dict):
                rows.append((f"{scope}.sameAs[{index}]", row))
    return rows


def identity_registry_errors(sources: dict[str, Any] | None = None) -> list[str]:
    """Reject any identity row that presents a CONFENGE-owned value as verified.

    The registry is a publication allowlist, not evidence. Every row must stay
    SELF_DECLARED with third_party_verified false until an actual independent
    source exists, and the registry must say so at the top level.
    """
    data = sources or load_verified_sources()
    errors: list[str] = []
    if data.get("independent_verification") != "NONE":
        errors.append("independent_verification_not_declared_none")
    rows = _identity_rows(data)
    if not rows:
        errors.append("identity_registry_empty")
    for at, row in rows:
        if row.get("status") != "SELF_DECLARED":
            errors.append(f"status_not_self_declared:{at}")
        if row.get("third_party_verified") is not False:
            errors.append(f"third_party_verified_not_false:{at}")
    return list(dict.fromkeys(errors))
