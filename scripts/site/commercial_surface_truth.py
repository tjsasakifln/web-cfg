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
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_REL = "data/commercial/deliverables-registry.v1.json"
HUB_REL = "entregas/index.html"

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
PRICE_RE = re.compile(
    r"R\$\s*([\d.]+)\s*a\s*R\$\s*([\d.]+)",
    re.I,
)
STATUS_RE = re.compile(
    r"\b(publicada|publicadas|em valida[cç][aã]o|indispon[ií]vel|indispon[ií]veis)\b",
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
            if isinstance(count, int):
                number_of_items.append(count)
    catalog = ""
    catalog_match = re.search(
        r'<section\b[^>]*class="[^"]*deliverables-catalog[^"]*"[^>]*>(.*?)</section>',
        html,
        re.I | re.S,
    )
    if catalog_match:
        catalog = re.sub(r"\s+", " ", _strip_tags(catalog_match.group(1)))
    return {
        "title": title,
        "meta": meta,
        "og:title": og_title,
        "og:description": og_desc,
        "h1": h1,
        "schema": " ".join(schema_bits),
        "catalog": catalog,
        "visible": re.sub(r"\s+", " ", _strip_tags(re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I))),
        "numberOfItems": number_of_items,
    }


def _brl_to_cents(raw: str) -> int:
    digits = re.sub(r"[^\d]", "", raw)
    return int(digits) * 100 if digits else 0


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
        uses_catalog = any(c["kind"] == "catalog" for c in claims)
        uses_published = any(c["kind"] == "published" for c in claims)
        if uses_catalog and uses_published:
            continue
        target = catalog_band if uses_catalog else published_band if uses_published else None
        if not target:
            continue
        for match in PRICE_RE.finditer(text):
            low = _brl_to_cents(match.group(1))
            high = _brl_to_cents(match.group(2))
            if (low, high) != target:
                findings.append(
                    f"{name}: price band R$ {match.group(1)} a R$ {match.group(2)} "
                    f"!= registry {(target[0] // 100, target[1] // 100)}"
                )

    return findings


def evaluate_hub(root: Path | None = None) -> list[str]:
    base = root or ROOT
    html = (base / HUB_REL).read_text(encoding="utf-8")
    return evaluate_commercial_html(html, load_registry(base))


def main() -> int:
    findings = evaluate_hub()
    if findings:
        print("FAIL commercial surface truth")
        for row in findings:
            print(" -", row)
        return 1
    print("OK commercial surface truth")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
