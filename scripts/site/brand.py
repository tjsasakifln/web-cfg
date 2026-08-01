"""CONFENGE brand contract — single source of truth for commercial identity.

Loads data/site/brand.json, proof.json, cases.json and exposes helpers used by
html_shell, tests, and optional sync tooling.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
SITE_DATA = ROOT / "data" / "site"


def _load(name: str) -> dict[str, Any]:
    path = SITE_DATA / name
    if not path.exists():
        raise FileNotFoundError(f"Missing brand data: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_brand() -> dict[str, Any]:
    return _load("brand.json")


def load_proof() -> dict[str, Any]:
    return _load("proof.json")


def load_cases() -> dict[str, Any]:
    return _load("cases.json")


def public_proof_claims(proof: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    data = proof or load_proof()
    out = []
    for c in data.get("claims") or []:
        if c.get("status") == "VERIFIED" and c.get("public_allowed") is True:
            out.append(c)
    return out


def approved_cases(cases: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    data = cases or load_cases()
    return [c for c in (data.get("cases") or []) if c.get("public_status") == "APPROVED"]


def wa_url(message: str, brand: dict[str, Any] | None = None) -> str:
    b = brand or load_brand()
    base = (b.get("contact") or {}).get("whatsapp_base") or "https://wa.me/5548988344559"
    return f"{base}?text={quote(message)}"


def org_description(brand: dict[str, Any] | None = None) -> str:
    b = brand or load_brand()
    return (b.get("positioning") or {}).get("org_description") or ""


def footer_blurb(brand: dict[str, Any] | None = None) -> str:
    b = brand or load_brand()
    return (b.get("positioning") or {}).get("footer_blurb") or org_description(b)


def forbidden_phrases(brand: dict[str, Any] | None = None) -> list[str]:
    b = brand or load_brand()
    return list(b.get("forbidden_phrases") or [])


def offer_by_id(offer_id: str, brand: dict[str, Any] | None = None) -> dict[str, Any] | None:
    b = brand or load_brand()
    for o in b.get("offers") or []:
        if o.get("id") == offer_id:
            return o
    return None


def validate_brand_contract() -> dict[str, Any]:
    """Return {ok, errors, warnings} for brand/proof/cases integrity."""
    errors: list[str] = []
    warnings: list[str] = []
    try:
        brand = load_brand()
        proof = load_proof()
        cases = load_cases()
    except FileNotFoundError as exc:
        return {"ok": False, "errors": [str(exc)], "warnings": []}

    pos = brand.get("positioning") or {}
    for key in ("short", "long", "tagline", "label", "org_description", "footer_blurb"):
        if not pos.get(key):
            errors.append(f"positioning.{key} missing")

    hero = brand.get("hero") or {}
    for key in ("eyebrow", "h1", "subheadline", "cta_primary", "meta_title", "meta_description"):
        if not hero.get(key):
            errors.append(f"hero.{key} missing")

    contact = brand.get("contact") or {}
    for key in ("email", "phone_e164", "whatsapp_number", "cnpj", "site"):
        if not contact.get(key):
            errors.append(f"contact.{key} missing")

    offers = brand.get("offers") or []
    if len(offers) != 4:
        errors.append(f"expected 4 offers, got {len(offers)}")
    for o in offers:
        for key in ("id", "name", "url", "headline", "cta", "wa_message"):
            if not o.get(key):
                errors.append(f"offer missing {key}: {o.get('id')}")
        url = o.get("url") or ""
        if url and not url.startswith("/"):
            errors.append(f"offer url must be path: {url}")

    faq = brand.get("faq") or []
    if len(faq) < 4:
        errors.append(f"faq too short: {len(faq)}")

    for c in proof.get("claims") or []:
        if c.get("public_allowed") and c.get("status") != "VERIFIED":
            errors.append(
                f"public claim not VERIFIED: {c.get('id')} status={c.get('status')}"
            )
        if c.get("status") == "VERIFIED" and c.get("public_allowed") is True:
            if not c.get("claim"):
                errors.append(f"verified claim empty text: {c.get('id')}")

    for c in cases.get("cases") or []:
        if c.get("public_status") == "APPROVED":
            if not c.get("client_authorized"):
                errors.append(f"approved case without client_authorized: {c.get('case_id')}")
            for key in ("problem", "decision", "intervention", "outcome"):
                if not c.get(key):
                    errors.append(f"approved case missing {key}: {c.get('case_id')}")

    # Hard ban: extra-cli name in public brand copy
    blob = json.dumps(brand, ensure_ascii=False).lower()
    if "extra-cli" in blob or "extra_cli" in blob:
        errors.append("brand.json must not expose extra-cli by name")

    return {"ok": len(errors) == 0, "errors": errors, "warnings": warnings, "brand": brand}


def find_forbidden_in_text(text: str, phrases: list[str] | None = None) -> list[str]:
    """Flag forbidden phrases used affirmatively.

    Negations within a short window (não/sem/nunca/jamais + phrase) are allowed —
    the brand *must* be able to deny guarantees of victory, etc.
    """
    import re

    lower = (text or "").lower()
    hits = []
    for p in phrases or forbidden_phrases():
        pl = p.lower()
        start = 0
        while True:
            idx = lower.find(pl, start)
            if idx < 0:
                break
            window = lower[max(0, idx - 48) : idx]
            if re.search(r"\b(n[aã]o|sem|nunca|jamais|evitar|proibid|bloquead)\b", window):
                start = idx + len(pl)
                continue
            hits.append(p)
            break
    return hits


def commercial_pages() -> list[str]:
    brand = load_brand()
    pages = ["index.html"]
    for o in brand.get("offers") or []:
        url = (o.get("url") or "").strip("/")
        if url:
            pages.append(f"{url}/index.html")
    pages.extend(
        [
            "inteligencia/index.html",
            "radar/index.html",
            "obrigado.html",
            "llms.txt",
        ]
    )
    return pages
