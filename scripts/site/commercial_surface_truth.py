#!/usr/bin/env python3
"""Cross-check commercial counts, prices and status across public surfaces.

Title, meta, OG, JSON-LD, H1, catalog copy and the offer/deliverables registry
must not tell two different numbers for the same set. The 8↔54 contradiction
is the canonical fail: calling the catalog of 54 "entregas" (the noun of the
eight published examples) or calling the eight "entregáveis".
"""
from __future__ import annotations

import json
import re
import sys
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import (  # noqa: E402
    indexable_visitor_html_files,
    visible_text,
)

REGISTRY_REL = "data/commercial/deliverables-registry.v1.json"
HUB_REL = "entregas/index.html"
CANONICAL_CATALOG_COUNT = 54
CANONICAL_PUBLISHED_COUNT = 8

WORD_NUMBERS = {
    "um": 1,
    "uma": 1,
    "dois": 2,
    "duas": 2,
    "três": 3,
    "tres": 3,
    "quatro": 4,
    "cinco": 5,
    "seis": 6,
    "sete": 7,
    "oito": 8,
    "nove": 9,
    "dez": 10,
}

CLAIM_RE = re.compile(
    r"\b((?:\d{1,3})|"
    + "|".join(WORD_NUMBERS)
    + r")\s+(entreg[aá]veis|entregas)(\s+publicadas)?\b",
    re.I,
)
CONTAINER_CLAIM_RE = re.compile(
    r"\b((?:\d{1,3})|"
    + "|".join(WORD_NUMBERS)
    + r")\s+cont[eê]ineres(?:\s+comerciais)?\b",
    re.I,
)
PRICE_RE = re.compile(
    r"R\$\s*([\d.]+)\s*a\s*R\$\s*([\d.]+)",
    re.I,
)
TITLE_RE = re.compile(r"<title>([^<]+)</title>", re.I)
H1_RE = re.compile(r"<h1\b[^>]*>(.*?)</h1>", re.I | re.S)
META_DESC_RE = re.compile(
    r'<meta\b[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']|'
    r'<meta\b[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']description["\']',
    re.I,
)
OG_TITLE_RE = re.compile(
    r'<meta\b[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']|'
    r'<meta\b[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:title["\']',
    re.I,
)
OG_DESC_RE = re.compile(
    r'<meta\b[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']|'
    r'<meta\b[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:description["\']',
    re.I,
)
LD_JSON_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
CATALOG_ITEM_RE = re.compile(r"<article\b([^>]*)>(.*?)</article>", re.I | re.S)
ATTR_RE = re.compile(r'''\b([\w:-]+)\s*=\s*(["'])(.*?)\2''', re.S)
STATUS_LABELS = {
    "PUBLISHED": "Publicada",
    "VALIDATE": "Em validação",
    "BLOCKED": "Indisponível",
}


def load_registry(root: Path | None = None) -> dict:
    path = (root or ROOT) / REGISTRY_REL
    return json.loads(path.read_text(encoding="utf-8"))


def registry_counts(registry: dict) -> dict[str, int]:
    items = list(registry.get("deliverables") or [])
    published = [row for row in items if row.get("public_state") == "PUBLISHED"]
    return {
        "catalog": int(registry.get("catalog_count") or len(items)),
        "published": len(published),
        "containers": int(registry.get("container_count") or len(registry.get("containers") or [])),
    }


def registry_price_bands(registry: dict) -> dict[str, tuple[int, int]]:
    def band(rows: list[dict]) -> tuple[int, int] | None:
        cents = [
            int(row["price"]["amount_cents"])
            for row in rows
            if isinstance(row.get("price"), dict) and row["price"].get("amount_cents") is not None
        ]
        if not cents:
            return None
        return (min(cents), max(cents))

    items = list(registry.get("deliverables") or [])
    published = [row for row in items if row.get("public_state") == "PUBLISHED"]
    return {
        "catalog": band(items),
        "published": band(published),
    }


def _registry_findings(registry: dict) -> list[str]:
    rows = [row for row in registry.get("deliverables") or [] if isinstance(row, dict)]
    declared_catalog = int(registry.get("catalog_count") or 0)
    published_count = sum(row.get("public_state") == "PUBLISHED" for row in rows)
    findings: list[str] = []
    if declared_catalog != CANONICAL_CATALOG_COUNT:
        findings.append(
            f"registry: catalog_count {declared_catalog} != canonical {CANONICAL_CATALOG_COUNT}"
        )
    if len(rows) != CANONICAL_CATALOG_COUNT:
        findings.append(
            f"registry: deliverable rows {len(rows)} != canonical {CANONICAL_CATALOG_COUNT}"
        )
    if declared_catalog != len(rows):
        findings.append(
            f"registry: catalog_count {declared_catalog} != deliverable rows {len(rows)}"
        )
    if published_count != CANONICAL_PUBLISHED_COUNT:
        findings.append(
            f"registry: published count {published_count} != canonical {CANONICAL_PUBLISHED_COUNT}"
        )

    containers = [row for row in registry.get("containers") or [] if isinstance(row, dict)]
    declared_containers = int(registry.get("container_count") or 0)
    if declared_containers != len(containers):
        findings.append(
            f"registry: container_count {declared_containers} != container rows {len(containers)}"
        )
    containers_by_id = {
        str(row.get("container_id")): row
        for row in containers
        if row.get("container_id")
    }
    deliverables_by_id = {
        str(row.get("deliverable_id")): row
        for row in rows
        if row.get("deliverable_id")
    }
    composed_by: dict[str, list[str]] = {}
    for container_id, container in containers_by_id.items():
        for deliverable_id in container.get("composes_deliverables") or []:
            deliverable_id = str(deliverable_id)
            composed_by.setdefault(deliverable_id, []).append(container_id)
            item = deliverables_by_id.get(deliverable_id)
            if item is None:
                findings.append(
                    f"registry: {container_id} composes unknown deliverable {deliverable_id}"
                )
                continue
            actual_container = str(item.get("offer_container") or "none")
            if actual_container != container_id:
                findings.append(
                    f"registry: {deliverable_id}: offer_container {actual_container} "
                    f"!= composed by {container_id}"
                )
    for deliverable_id, row in deliverables_by_id.items():
        container_id = str(row.get("offer_container") or "none")
        if container_id == "none":
            continue
        if container_id not in containers_by_id:
            findings.append(
                f"registry: {deliverable_id}: unknown offer_container {container_id}"
            )
        elif container_id not in composed_by.get(deliverable_id, []):
            findings.append(
                f"registry: {deliverable_id}: offer_container {container_id} "
                "does not compose deliverable"
            )
    return findings


def _parse_number(token: str) -> int | None:
    raw = token.strip().lower()
    if raw.isdigit():
        return int(raw)
    return WORD_NUMBERS.get(raw)


def _strip_tags(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html)


def extract_claims(text: str) -> list[dict]:
    claims: list[dict] = []
    for match in CLAIM_RE.finditer(text):
        number = _parse_number(match.group(1))
        if number is None:
            continue
        noun = match.group(2).casefold()
        published_label = bool(match.group(3))
        if "entregáveis" in noun or "entregaveis" in noun:
            kind = "catalog"
        elif published_label:
            kind = "published"
        else:
            kind = "published"
        claims.append(
            {
                "number": number,
                "noun": noun,
                "kind": kind,
                "span": match.group(0),
                "start": match.start(),
                "end": match.end(),
            }
        )
    return claims


def _first_group(match: re.Match[str] | None) -> str:
    if not match:
        return ""
    for group in match.groups():
        if group:
            return group
    return ""


def extract_surfaces(html: str) -> dict[str, str]:
    title = _first_group(TITLE_RE.search(html))
    h1 = re.sub(r"\s+", " ", _strip_tags(_first_group(H1_RE.search(html)))).strip()
    meta = _first_group(META_DESC_RE.search(html))
    og_title = _first_group(OG_TITLE_RE.search(html))
    og_desc = _first_group(OG_DESC_RE.search(html))
    schema_bits: list[str] = []
    number_of_items: list[int] = []
    for block in LD_JSON_RE.findall(html):
        schema_bits.append(block)
        try:
            payload = json.loads(block)
        except json.JSONDecodeError:
            continue
        nodes = payload.get("@graph") if isinstance(payload, dict) else payload
        if isinstance(payload, dict) and "@graph" not in payload:
            nodes = [payload]
        if not isinstance(nodes, list):
            nodes = [nodes]
        for node in nodes:
            if not isinstance(node, dict):
                continue
            for key in ("name", "description"):
                value = node.get(key)
                if isinstance(value, str):
                    schema_bits.append(value)
            count = node.get("numberOfItems")
            node_context = " ".join(
                str(node.get(key) or "") for key in ("name", "description", "@id")
            )
            if isinstance(count, int) and re.search(r"\bentreg[aá]", node_context, re.I):
                number_of_items.append(count)
    return {
        "title": title,
        "meta": meta,
        "og:title": og_title,
        "og:description": og_desc,
        "h1": h1,
        "schema": " ".join(schema_bits),
        # Body-level claims must be perceptible to a visitor. Test fixtures,
        # templates, scripts and hidden subtrees cannot make a public route
        # commercially contradictory (or make the gate fail spuriously).
        "visible": visible_text(html),
        "numberOfItems": number_of_items,
    }


def _brl_to_cents(raw: str) -> int:
    digits = re.sub(r"[^\d]", "", raw)
    return int(digits) * 100 if digits else 0


def _attributes(raw: str) -> dict[str, str]:
    return {
        match.group(1).lower(): unescape(match.group(3))
        for match in ATTR_RE.finditer(raw)
    }


def _registry_item_prices(row: dict) -> tuple[int, ...]:
    price = row.get("price") if isinstance(row.get("price"), dict) else {}
    if price.get("amount_cents") is not None:
        return (int(price["amount_cents"]),)
    tiers = price.get("tiers") if isinstance(price.get("tiers"), list) else []
    amounts = sorted(
        {
            int(tier["amount_cents"])
            for tier in tiers
            if isinstance(tier, dict) and tier.get("amount_cents") is not None
        }
    )
    if len(amounts) > 1:
        return (amounts[0], amounts[-1])
    return tuple(amounts)


def _format_brl(cents: int) -> str:
    return f"R$ {cents // 100:,}".replace(",", ".")


def _catalog_item_findings(html: str, registry: dict) -> list[str]:
    by_id = {
        str(row.get("deliverable_id")): row
        for row in registry.get("deliverables") or []
        if isinstance(row, dict) and row.get("deliverable_id")
    }
    findings: list[str] = []
    seen_ids: list[str] = []
    for attrs_raw, body in CATALOG_ITEM_RE.findall(html):
        attrs = _attributes(attrs_raw)
        classes = set(attrs.get("class", "").split())
        if "catalog-item" not in classes:
            continue
        deliverable_id = attrs.get("data-deliverable-id", "").strip()
        if not deliverable_id:
            findings.append("catalog item missing data-deliverable-id")
            continue
        seen_ids.append(deliverable_id)
        row = by_id.get(deliverable_id)
        if row is None:
            findings.append(f"{deliverable_id}: unknown deliverable id")
            continue

        actual_state = attrs.get("data-public-state", "").strip()
        expected_state = str(row.get("public_state") or "")
        if actual_state != expected_state:
            findings.append(
                f"{deliverable_id}: public_state {actual_state or '<missing>'} "
                f"!= registry {expected_state or '<missing>'}"
            )

        status_match = re.search(
            r'<[^>]*class=["\'][^"\']*\bcatalog-item__state\b[^"\']*["\'][^>]*>(.*?)</[^>]+>',
            body,
            re.I | re.S,
        )
        actual_status = (
            re.sub(
                r"\s+", " ", unescape(_strip_tags(status_match.group(1)))
            ).strip()
            if status_match
            else ""
        )
        expected_status = STATUS_LABELS.get(expected_state, "")
        if actual_status != expected_status:
            findings.append(
                f"{deliverable_id}: status {actual_status or '<missing>'!r} "
                f"!= registry {expected_status or '<missing>'!r}"
            )

        price_match = re.search(
            r"<dt\b[^>]*>\s*Preço\s*</dt>\s*<dd\b[^>]*>(.*?)</dd>",
            body,
            re.I | re.S,
        )
        actual_prices = tuple(
            _brl_to_cents(raw)
            for raw in re.findall(
                r"R\$\s*([\d.]+)",
                price_match.group(1) if price_match else "",
                re.I,
            )
        )
        expected_prices = _registry_item_prices(row)
        if actual_prices != expected_prices:
            actual_label = (
                " a ".join(_format_brl(value) for value in actual_prices)
                or "<missing>"
            )
            expected_label = (
                " a ".join(_format_brl(value) for value in expected_prices)
                or "<missing>"
            )
            findings.append(
                f"{deliverable_id}: price {actual_label} != registry {expected_label}"
            )

    is_integral_catalog = bool(
        re.search(
            r'<section\b[^>]*class=["\'][^"\']*\bdeliverables-catalog\b',
            html,
            re.I,
        )
    )
    if is_integral_catalog:
        for deliverable_id in sorted(by_id):
            count = seen_ids.count(deliverable_id)
            if count == 0:
                findings.append(f"{deliverable_id}: missing from integral catalog")
            elif count > 1:
                findings.append(
                    f"{deliverable_id}: duplicated in integral catalog ({count} items)"
                )
    return findings


def evaluate_commercial_html(html: str, registry: dict | None = None) -> list[str]:
    """Return findings for one HTML blob against the deliverables registry."""
    registry = registry or load_registry()
    counts = registry_counts(registry)
    bands = registry_price_bands(registry)
    surfaces = extract_surfaces(html)
    findings: list[str] = []
    headline_surfaces = ("title", "meta", "og:title", "og:description", "h1", "schema")

    for name in headline_surfaces:
        text = surfaces.get(name) or ""
        if not text:
            continue
        for claim in extract_claims(text):
            number = claim["number"]
            kind = claim["kind"]
            expected = counts[kind]
            if number == counts["catalog"] and kind == "published":
                findings.append(
                    f"{name}: 8↔54 contradiction {claim['span']!r} "
                    f"(catalog={counts['catalog']} labeled as published entregas)"
                )
            elif number == counts["published"] and kind == "catalog":
                findings.append(
                    f"{name}: 8↔54 contradiction {claim['span']!r} "
                    f"(published={counts['published']} labeled as entregáveis)"
                )
            elif number not in (counts["catalog"], counts["published"], counts["containers"]) and name in headline_surfaces:
                findings.append(
                    f"{name}: undeclared count {claim['span']!r} "
                    f"(registry published={counts['published']} catalog={counts['catalog']})"
                )
            elif number != expected and name in headline_surfaces:
                findings.append(
                    f"{name}: {kind} count {number} != registry {expected} in {claim['span']!r}"
                )

    # Body copy contains legitimate subgroup counts (for example, a task door
    # with 12 deliverables), so only globally impossible or canonically
    # inverted claims fail here. Headline surfaces remain strict above.
    for claim in extract_claims(surfaces.get("visible") or ""):
        number = claim["number"]
        kind = claim["kind"]
        if number > counts["catalog"]:
            findings.append(
                f"visible: {kind} count {number} exceeds registry catalog={counts['catalog']} "
                f"in {claim['span']!r}"
            )
        elif number == counts["catalog"] and kind == "published":
            findings.append(
                f"visible: 8↔54 contradiction {claim['span']!r} "
                f"(catalog={counts['catalog']} labeled as published entregas)"
            )
    for match in CONTAINER_CLAIM_RE.finditer(surfaces.get("visible") or ""):
        number = _parse_number(match.group(1))
        if number is not None and number != counts["containers"]:
            findings.append(
                f"visible: container count {number} != registry {counts['containers']} "
                f"in {match.group(0)!r}"
            )

    for count in surfaces.get("numberOfItems") or []:
        if count not in (counts["published"], counts["catalog"]):
            findings.append(
                f"schema: numberOfItems={count} matches neither published={counts['published']} "
                f"nor catalog={counts['catalog']}"
            )

    published_band = bands.get("published")
    catalog_band = bands.get("catalog")
    for name in headline_surfaces:
        text = surfaces.get(name) or ""
        claims = extract_claims(text)
        for match in PRICE_RE.finditer(text):
            prior_claims = [claim for claim in claims if claim["end"] <= match.start()]
            if prior_claims:
                target_kind = prior_claims[-1]["kind"]
            else:
                claim_kinds = {claim["kind"] for claim in claims}
                target_kind = next(iter(claim_kinds)) if len(claim_kinds) == 1 else None
            target = (
                catalog_band
                if target_kind == "catalog"
                else published_band
                if target_kind == "published"
                else None
            )
            if not target:
                continue
            low = _brl_to_cents(match.group(1))
            high = _brl_to_cents(match.group(2))
            if (low, high) != target:
                findings.append(
                    f"{name}: price band R$ {match.group(1)} a R$ {match.group(2)} "
                    f"!= registry {(target[0] // 100, target[1] // 100)}"
                )

    findings.extend(_catalog_item_findings(html, registry))

    return findings


def evaluate_hub(root: Path | None = None) -> list[str]:
    base = root or ROOT
    html = (base / HUB_REL).read_text(encoding="utf-8")
    registry = load_registry(base)
    return _registry_findings(registry) + evaluate_commercial_html(html, registry)


def evaluate_commercial_site(root: Path | None = None) -> list[str]:
    """Cross-check every indexable visitor page against commercial truth."""
    base = root or ROOT
    registry = load_registry(base)
    findings = _registry_findings(registry)
    for path in indexable_visitor_html_files(base):
        html = path.read_text(encoding="utf-8", errors="replace")
        rel = path.relative_to(base).as_posix()
        findings.extend(
            f"{rel}: {finding}"
            for finding in evaluate_commercial_html(html, registry)
        )
    return findings


def main() -> int:
    findings = evaluate_commercial_site()
    if findings:
        print("FAIL commercial surface truth")
        for row in findings:
            print(" -", row)
        return 1
    print("OK commercial surface truth")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
