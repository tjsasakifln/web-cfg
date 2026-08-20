"""Load shipped HTML, registry.cjs and flags.json. No copied price oracles."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

PAGES = {
    "bid-room": ROOT / "bid-room-licitacoes-obras" / "index.html",
    "diretoria": ROOT / "diretoria-b2g" / "index.html",
    "expansao": ROOT / "diagnostico-b2g-expansao" / "index.html",
}
FROZEN = {
    "diagnostico-b2g-360": ROOT / "diagnostico-b2g-360" / "index.html",
    "diagnostico-pre-licitacao": ROOT / "diagnostico-pre-licitacao" / "index.html",
    "auditoria-orcamento-licitacao": ROOT / "auditoria-orcamento-licitacao" / "index.html",
}
CANONICAL = {
    "bid-room": "https://confenge.com.br/bid-room-licitacoes-obras/",
    "diretoria": "https://confenge.com.br/diretoria-b2g/",
    "expansao": "https://confenge.com.br/diagnostico-b2g-expansao/",
}
ATTR_NAMES = (
    "data-content-cluster",
    "data-offer-id",
    "data-journey",
    "data-cta-position",
    "data-event-name",
    "data-offer-section",
)
ATTR_RE = re.compile(
    r'(data-(?:content-cluster|offer-id|journey|cta-position|event-name|offer-section))="([^"]*)"'
)
PRICE_RE = re.compile(r"R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?")
CANON_RE = re.compile(
    r'rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']|href=["\']([^"\']+)["\'][^>]*rel=["\']canonical["\']'
)


def read_html(key: str) -> str:
    path = PAGES[key]
    assert path.exists(), path
    return path.read_text(encoding="utf-8")


def load_registry() -> dict:
    """Fresh consumer of the shipped CommonJS registry (not a reimplementation)."""
    src = (
        "const r = require('./scripts/offers/registry.cjs');"
        "const ids = r.PUBLIC_OFFER_IDS;"
        "const offers = {};"
        "for (const id of ids) offers[id] = r.getOffer(id);"
        "process.stdout.write(JSON.stringify({"
        "AUTHORITY: r.AUTHORITY,"
        "PUBLIC_OFFER_IDS: ids,"
        "offers: offers"
        "}));"
    )
    proc = subprocess.run(
        ["node", "-e", src],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(f"registry.cjs consumer failed: {proc.stderr}")
    return json.loads(proc.stdout)


def load_flags() -> dict:
    path = ROOT / "data" / "offers" / "flags.json"
    return json.loads(path.read_text(encoding="utf-8"))


def first_fold(html: str) -> str:
    m = re.search(
        r'<header class="content-hero[\s\S]*?</header>',
        html,
        re.I,
    )
    if m:
        return m.group(0)
    m = re.search(r"<main[^>]*>([\s\S]*?)<section", html, re.I)
    assert m, "no first fold"
    return m.group(1)


def visible_text(html: str) -> str:
    chunk = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    chunk = re.sub(r"<style[\s\S]*?</style>", " ", chunk, flags=re.I)
    chunk = re.sub(r"<[^>]+>", " ", chunk)
    return re.sub(r"\s+", " ", chunk).strip()


def jsonld_blocks(html: str) -> list:
    blocks = []
    for raw in re.findall(
        r'<script type="application/ld\+json">(.*?)</script>',
        html,
        re.I | re.S,
    ):
        blocks.append(json.loads(raw))
    return blocks


def canonical(html: str) -> str | None:
    m = CANON_RE.search(html)
    if not m:
        return None
    return m.group(1) or m.group(2)


def attr_pairs(html: str) -> list[tuple[str, str]]:
    return ATTR_RE.findall(html)


def origin_main_file(rel: str) -> bytes:
    proc = subprocess.run(
        ["git", "show", f"origin/main:{rel}"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(f"git show origin/main:{rel} failed: {proc.stderr!r}")
    return proc.stdout


def brl_to_cents(match_text: str) -> int:
    raw = match_text.replace("R$", "").replace(" ", "").strip()
    if "," in raw:
        whole, frac = raw.rsplit(",", 1)
        whole = whole.replace(".", "")
        return int(whole) * 100 + int(frac)
    return int(raw.replace(".", "")) * 100


def page_price_cents(html: str) -> list[int]:
    cents = [brl_to_cents(m.group(0)) for m in PRICE_RE.finditer(html)]
    for block in jsonld_blocks(html):
        nodes = block.get("@graph", [block]) if isinstance(block, dict) else block
        if isinstance(nodes, dict):
            nodes = [nodes]
        for node in nodes:
            if not isinstance(node, dict):
                continue
            offer = node.get("offers")
            if isinstance(offer, dict) and offer.get("price") is not None:
                # schema.org Offer.price is major units
                cents.append(int(float(offer["price"])) * 100)
    return cents


def mismatch(msg: str) -> None:
    raise AssertionError(f"AUTHORITY_MISMATCH: {msg}")
