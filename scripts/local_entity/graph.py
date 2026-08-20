"""Extract Organization/Person graph from specialist (or fixture) HTML JSON-LD."""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from typing import Any

from scripts.local_entity.constants import (
    FORBIDDEN_LOCAL_TYPES,
    FORBIDDEN_REVIEW_TYPES,
    INVENTED_NAP_KEYS,
    ORG_ID,
    PERSON_ID,
)


class _JSONLDCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._in_ld = False
        self._buf: list[str] = []
        self.blocks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "script":
            return
        ad = {k.lower(): (v or "") for k, v in attrs}
        if ad.get("type", "").lower() == "application/ld+json":
            self._in_ld = True
            self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._in_ld:
            self.blocks.append("".join(self._buf))
            self._in_ld = False
            self._buf = []

    def handle_data(self, data: str) -> None:
        if self._in_ld:
            self._buf.append(data)


def extract_jsonld_blocks(html: str) -> list[Any]:
    parser = _JSONLDCollector()
    try:
        parser.feed(html or "")
    except Exception:  # noqa: BLE001 — tolerate broken markup
        return []
    out: list[Any] = []
    for raw in parser.blocks:
        raw = raw.strip()
        if not raw:
            continue
        try:
            out.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return out


def flatten_jsonld_nodes(blocks: list[Any]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    def walk(obj: Any) -> None:
        if isinstance(obj, list):
            for item in obj:
                walk(item)
            return
        if not isinstance(obj, dict):
            return
        graph = obj.get("@graph")
        if isinstance(graph, list):
            for item in graph:
                walk(item)
        if obj.get("@type") or obj.get("streetAddress") or obj.get("aggregateRating") or obj.get("review"):
            nodes.append(obj)
        for key in ("address", "contactPoint", "geo", "review", "aggregateRating", "hasCredential"):
            nested = obj.get(key)
            if nested:
                walk(nested)

    for block in blocks:
        walk(block)
    return nodes


def types_of(node: dict[str, Any]) -> set[str]:
    t = node.get("@type")
    if isinstance(t, list):
        return {str(x) for x in t}
    if t:
        return {str(t)}
    return set()


def extract_entity_graph(html: str) -> dict[str, Any]:
    """Pull Organization and Person nodes plus raw types from JSON-LD."""
    blocks = extract_jsonld_blocks(html)
    nodes = flatten_jsonld_nodes(blocks)
    org: dict[str, Any] | None = None
    person: dict[str, Any] | None = None
    for node in nodes:
        kinds = types_of(node)
        if "Organization" in kinds and org is None:
            org = node
        if "Person" in kinds and person is None:
            person = node
    org = org or {}
    person = person or {}
    all_types: set[str] = set()
    for node in nodes:
        all_types |= types_of(node)
    return {
        "organization": org,
        "person": person,
        "nodes": nodes,
        "raw_types": sorted(all_types),
        "org_id": org.get("@id"),
        "person_id": person.get("@id"),
        "has_organization": bool(org.get("@type")),
        "has_person": bool(person.get("@type")),
    }


def graph_field_snapshot(graph: dict[str, Any]) -> dict[str, Any]:
    """Named fields the campaign must classify, including honest absences."""
    org = graph.get("organization") or {}
    person = graph.get("person") or {}
    contact_point = org.get("contactPoint") if isinstance(org.get("contactPoint"), dict) else {}
    return {
        "organization_id": org.get("@id"),
        "person_id": person.get("@id"),
        "worksFor": person.get("worksFor"),
        "knowsAbout": person.get("knowsAbout"),
        "alumniOf": person.get("alumniOf"),
        "jobTitle": person.get("jobTitle"),
        "sameAs_org": org.get("sameAs"),
        "sameAs_person": person.get("sameAs"),
        "email": org.get("email") or person.get("email"),
        "telephone": org.get("telephone") or person.get("telephone"),
        "taxID": org.get("taxID"),
        "contactPoint": contact_point or None,
        "areaServed": org.get("areaServed") or contact_point.get("areaServed"),
        "streetAddress": _street_value(graph),
        "hasCredential": person.get("hasCredential") or org.get("hasCredential"),
        "review": _first_present(graph, "review"),
        "aggregateRating": _first_present(graph, "aggregateRating"),
    }


def _street_value(graph: dict[str, Any]) -> Any:
    for node in graph.get("nodes") or []:
        if node.get("streetAddress"):
            return node.get("streetAddress")
        addr = node.get("address")
        if isinstance(addr, dict) and addr.get("streetAddress"):
            return addr.get("streetAddress")
        if isinstance(addr, str) and addr.strip():
            return addr
    return None


def _first_present(graph: dict[str, Any], key: str) -> Any:
    for node in graph.get("nodes") or []:
        if node.get(key):
            return node.get(key)
    return None


def expected_canonical_ids() -> dict[str, str]:
    return {"organization": ORG_ID, "person": PERSON_ID}


_SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script>", re.I | re.S)


def visible_text(html: str) -> str:
    text = _SCRIPT_RE.sub(" ", html or "")
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def invented_type_hits(graph: dict[str, Any]) -> set[str]:
    hits: set[str] = set()
    banned = FORBIDDEN_LOCAL_TYPES | FORBIDDEN_REVIEW_TYPES
    for node in graph.get("nodes") or []:
        hits |= types_of(node) & banned
        for key in INVENTED_NAP_KEYS:
            if node.get(key) not in (None, "", [], {}):
                hits.add(key)
        addr = node.get("address")
        if isinstance(addr, dict):
            if addr.get("@type") == "PostalAddress" or addr.get("streetAddress"):
                hits.add("PostalAddress")
            for key in INVENTED_NAP_KEYS:
                if addr.get(key) not in (None, "", [], {}):
                    hits.add(key)
    return hits
