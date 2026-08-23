"""Named-findings BOFU adversarial audit. No single SEO score.

Drives shipped HTML, the intent matrix, sitemap/robots, and the offer registry
IDs. Fail-closed: any finding makes ok=False.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from scripts.organic.service_map import (
    extract_bridge_service,
    html_has_commercial_bridge,
    load_service_map,
    map_content_to_service,
)

ROOT = Path(__file__).resolve().parents[2]
MATRIX_PATH = ROOT / "data" / "organic" / "bofu-intent-matrix.json"
SITE = "https://confenge.com.br"
MIN_INTERNAL_LINKS = 3
ONPAGE_CAPTURE_PATHS = {
    "/defesa-margem-contratos-publicos/",
    "/atrasos-prorrogacao-obras-publicas/",
    "/defesa-tecnica-contratos-publicos/",
    "/acompanhamento-contratos-obras/",
    "/bid-room-licitacoes-obras/",
}

FINDING_CODES = (
    "SERVICE_INSUFFICIENT_INTERNAL_LINKS",
    "INTENT_CANNIBALIZATION",
    "COMMERCIAL_PAGE_NOINDEX",
    "CTA_UNKNOWN_OFFER",
    "SCHEMA_INVISIBLE_CLAIM",
    "BRIDGE_WRONG_SERVICE",
    "CANONICAL_SITEMAP_ROBOTS_DIVERGE",
    "SMARTLIC_CANONICAL",
    "ROUTE_MISSING_OWNER_UPDATE_POLICY",
    "CTA_DROPS_ATTRIBUTION",
    "MISSING_COMMERCIAL_BLOCK",
    "MULTIPLE_PREFERRED_DESTINATIONS",
    "PILLAR_NOT_SELF_CANONICAL",
    "PILLAR_NOT_INDEX_FOLLOW",
    "PILLAR_NOT_IN_SITEMAP",
    "PILLAR_MISSING_ONPAGE_CAPTURE",
)

_TAG_RE = re.compile(r"<[^>]+>", re.I)
_WS_RE = re.compile(r"\s+")
_CATALOG_OFFER_RE = re.compile(r"\bCFG-[A-Z0-9]+(?:-[A-Z0-9]+)*-v\d+\b")

COMMERCIAL_BLOCKS = {
    "problema": (r"risco|problema|margem|preju[ií]zo|glosa|atraso|aditivo|or[cç]amento|perde tempo",),
    "quando_contratar": (
        r"quando (vale |faz sentido |pode )",
        r"entra / fit",
        r"o que entra",
        r"para quem [eé]",
        r'type-mono">Entra',
    ),
    "quando_nao_contratar": (r"quando n[aã]o", r"n[aã]o entra", r"n[aã]o fit", r"quando-nao-contratar"),
    "entregaveis": (
        r"entreg",
        r"o que a empresa recebe",
        r"inclu[ií]do",
        r"plano de 90",
        r"resultado:",
    ),
    "metodo": (r"m[eé]todo", r'id="metodo"', r"FACT", r"authority-byline", r"authority-method"),
    "escopo": (
        r"escopo",
        r"o que normalmente precisa",
        r"o que entra",
        r"entra / fit",
        r"o que [eé] investigado",
        r"o que precisa entrar",
        r"inputs do cliente",
        r"base documental",
        r"documentos necess",
        r"o que acelera",
    ),
    "exclusoes": (
        r"n[aã]o entra",
        r"n[aã]o fit",
        r"substitui o jur[ií]dico",
        r"n[aã]o [eé] (parecer|advocacia|advogado)",
        r"quando-nao-contratar",
        r"data-when-not-hire",
        r"n[aã]o contrat",
        r"exclus",
        r"fronteira",
    ),
    "prazos": (r"prazo", r"datetime=", r"dias [uú]teis", r"as of", r"30 a 45"),
    "prova": (r"tiago sasaki", r"especialista", r"eesc-usp", r"fonte:", r"credenciais verific"),
    "faq": (
        r"faq-list",
        r"<details",
        r"d[uú]vidas",
        r"perguntas respondidas",
        r"perguntas frequentes",
        r"perguntas reais",
    ),
    "cta": (r"button-primary", r"wa\.me/", r"#contato"),
}


def load_intent_matrix(path: Path | None = None) -> dict[str, Any]:
    p = Path(path) if path else MATRIX_PATH
    return json.loads(p.read_text(encoding="utf-8"))


def _strip(html: str) -> str:
    return _WS_RE.sub(" ", _TAG_RE.sub(" ", html)).strip()


def _meta(html: str, name: str) -> str:
    for m in re.finditer(r"<meta\b[^>]*>", html, re.I):
        tag = m.group(0)
        if re.search(rf"""name\s*=\s*["']{re.escape(name)}["']""", tag, re.I):
            attr = re.search(r"""content\s*=\s*["']([^"']*)["']""", tag, re.I)
            return attr.group(1) if attr else ""
    return ""


def _canonical(html: str) -> str:
    for m in re.finditer(r"<link\b[^>]*>", html, re.I):
        tag = m.group(0)
        if re.search(r"""rel\s*=\s*["']canonical["']""", tag, re.I):
            attr = re.search(r"""href\s*=\s*["']([^"']*)["']""", tag, re.I)
            return attr.group(1) if attr else ""
    return ""


def _title(html: str) -> str:
    m = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    return _strip(m.group(1)) if m else ""


def _h1(html: str) -> str:
    m = re.search(r"<h1\b[^>]*>(.*?)</h1>", html, re.I | re.S)
    return _strip(m.group(1)) if m else ""


def parse_sitemap_locs(root: Path) -> set[str]:
    locs: set[str] = set()
    for name in ("sitemap.xml", "sitemap-index.xml", "sitemap-editorial.xml"):
        path = root / name
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for loc in re.findall(r"<loc>\s*([^<]+)\s*</loc>", text, re.I):
            parsed = urlparse(loc.strip())
            path_only = parsed.path if parsed.path.endswith("/") or "." in parsed.path.rsplit("/", 1)[-1] else parsed.path + "/"
            locs.add(path_only)
    return locs


def robots_disallowed(root: Path, path: str) -> bool:
    robots = (root / "robots.txt").read_text(encoding="utf-8")
    rules: list[str] = []
    for line in robots.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("disallow:"):
            rules.append(stripped.split(":", 1)[1].strip())
    for rule in rules:
        if rule and path.startswith(rule):
            return True
    return False


def catalog_offer_ids(root: Path) -> set[str]:
    registry_path = root / "scripts" / "offers" / "registry.cjs"
    if not registry_path.is_file():
        registry_path = ROOT / "scripts" / "offers" / "registry.cjs"
    ids: set[str] = set()
    if registry_path.is_file():
        ids.update(_CATALOG_OFFER_RE.findall(registry_path.read_text(encoding="utf-8")))
    snapshot = root / "data" / "offers" / "catalog.snapshot.json"
    if not snapshot.is_file():
        snapshot = ROOT / "data" / "offers" / "catalog.snapshot.json"
    if snapshot.is_file():
        doc = json.loads(snapshot.read_text(encoding="utf-8"))
        for offer in doc.get("offers") or []:
            oid = offer.get("offer_id")
            if oid:
                ids.add(oid)
    return ids


def _schema_types_and_blob(html: str) -> tuple[list[str], str]:
    types: list[str] = []
    blobs: list[str] = []
    for block in re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        blobs.append(block)
        try:
            data = json.loads(block.strip())
        except json.JSONDecodeError:
            continue
        stack = [data]
        while stack:
            obj = stack.pop()
            if isinstance(obj, dict):
                raw = obj.get("@type")
                if isinstance(raw, str):
                    types.append(raw)
                elif isinstance(raw, list):
                    types.extend(str(x) for x in raw)
                stack.extend(obj.values())
            elif isinstance(obj, list):
                stack.extend(obj)
    return types, "\n".join(blobs)


def _visible_text(html: str) -> str:
    cut = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.I | re.S)
    cut = re.sub(r"<style\b[^>]*>.*?</style>", " ", cut, flags=re.I | re.S)
    return _strip(cut).lower()


def _internal_hrefs(html: str) -> list[str]:
    hrefs: list[str] = []
    for href in re.findall(r'href=["\']([^"\']+)["\']', html, re.I):
        if href.startswith("mailto:") or href.startswith("tel:") or href.startswith("https://wa.me"):
            continue
        if href.startswith("http") and "confenge.com.br" not in href:
            continue
        path = urlparse(href).path if href.startswith("http") else href.split("?")[0].split("#")[0]
        if path.startswith("/") and path not in ("/",):
            hrefs.append(path if path.endswith("/") or "." in path.rsplit("/", 1)[-1] else path + "/")
    return hrefs


def _finding(code: str, path: str, detail: str) -> dict[str, str]:
    return {"code": code, "path": path, "detail": detail}


def _page_path(rel_dir: str) -> str:
    return "/" + rel_dir.strip("/") + "/"


def audit_service_page(
    path: str,
    html: str,
    *,
    sitemap: set[str],
    catalog_ids: set[str],
    root: Path,
    row: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    if path in ONPAGE_CAPTURE_PATHS and not re.search(
        r'<form\b(?=[^>]*\bmethod=["\']post["\'])(?=[^>]*\baction=["\']/'
        r'\.netlify/functions/lead["\'])',
        html,
        re.I,
    ):
        findings.append(
            _finding(
                "PILLAR_MISSING_ONPAGE_CAPTURE",
                path,
                "non-frozen service pillar must capture on-page before WhatsApp fallback",
            )
        )
    robots = _meta(html, "robots").lower()
    canonical = _canonical(html)
    expected = SITE + path
    visible = _visible_text(html)
    types, schema_blob = _schema_types_and_blob(html)
    schema_l = schema_blob.lower()

    og_url_m = re.search(
        r'<meta[^>]*property=["\']og:url["\'][^>]*content=["\']([^"\']+)["\']',
        html,
        re.I,
    )
    og_url = og_url_m.group(1) if og_url_m else ""
    if "smartlic" in canonical.lower() or "smartlic" in og_url.lower():
        findings.append(_finding("SMARTLIC_CANONICAL", path, f"canonical={canonical}"))
    if canonical and canonical.rstrip("/") != expected.rstrip("/"):
        findings.append(_finding("PILLAR_NOT_SELF_CANONICAL", path, f"canonical={canonical} expected={expected}"))
    if "noindex" in robots:
        findings.append(_finding("COMMERCIAL_PAGE_NOINDEX", path, f"robots={robots}"))
    elif "index" not in robots or "follow" not in robots:
        findings.append(_finding("PILLAR_NOT_INDEX_FOLLOW", path, f"robots={robots}"))
    if path not in sitemap and path.rstrip("/") + "/" not in sitemap:
        findings.append(_finding("PILLAR_NOT_IN_SITEMAP", path, "path missing from committed sitemaps"))
    if robots_disallowed(root, path) and "noindex" not in robots:
        findings.append(
            _finding("CANONICAL_SITEMAP_ROBOTS_DIVERGE", path, "indexable HTML but robots Disallow")
        )
    if path in sitemap and "noindex" in robots:
        findings.append(
            _finding("CANONICAL_SITEMAP_ROBOTS_DIVERGE", path, "noindex page listed in sitemap")
        )

    if 'id="quando-nao-contratar"' not in html and "data-when-not-hire" not in html:
        findings.append(_finding("MISSING_COMMERCIAL_BLOCK", path, "quando_nao_contratar"))
    for block, patterns in COMMERCIAL_BLOCKS.items():
        if block == "quando_nao_contratar":
            continue
        if not any(re.search(p, html, re.I) or re.search(p, visible, re.I) for p in patterns):
            findings.append(_finding("MISSING_COMMERCIAL_BLOCK", path, block))

    owner = (
        'id="metodo"' in html
        or "authority-method" in html
        or "authority-byline" in html
    ) and ("/correcoes/" in html or "/politica-editorial/" in html)
    if not owner:
        findings.append(
            _finding(
                "ROUTE_MISSING_OWNER_UPDATE_POLICY",
                path,
                "missing authority-method/byline with correcoes or politica-editorial",
            )
        )

    hrefs = _internal_hrefs(html)
    unique = {h for h in hrefs if h != path}
    if len(unique) < MIN_INTERNAL_LINKS:
        findings.append(
            _finding(
                "SERVICE_INSUFFICIENT_INTERNAL_LINKS",
                path,
                f"unique_internal={len(unique)} min={MIN_INTERNAL_LINKS}",
            )
        )

    for oid in _CATALOG_OFFER_RE.findall(html):
        if oid not in catalog_ids:
            findings.append(_finding("CTA_UNKNOWN_OFFER", path, oid))

    if "aggregaterating" in schema_l or '"@type":"review"' in schema_l.replace(" ", "").lower():
        if not re.search(r"avalia[cç][aã]o|review|estrela", visible):
            findings.append(_finding("SCHEMA_INVISIBLE_CLAIM", path, "Review/AggregateRating not visible"))
    if re.search(r'"price"\s*:', schema_blob) or "offers" in types:
        if "r$" not in visible and "8000" not in visible.replace(".", "").replace(" ", ""):
            # Diretoria/diagnóstico publish registry cents in visible copy; fail only if schema
            # states a price with no visible currency/amount.
            if re.search(r'"price"\s*:\s*"?\d', schema_blob):
                findings.append(_finding("SCHEMA_INVISIBLE_CLAIM", path, "schema price not visible"))

    title = _title(html)
    h1 = _h1(html)
    if row and row.get("job") and not (title or h1):
        findings.append(_finding("MISSING_COMMERCIAL_BLOCK", path, "empty_title_or_h1"))

    return findings


def audit_preferred_destinations(matrix: dict[str, Any], root: Path) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    smap = load_service_map()
    for row in matrix.get("rows") or []:
        preferred = row.get("canonical_service_route")
        exceptions = {e.get("path") for e in (row.get("exceptions") or []) if e.get("path")}
        for support in row.get("supporting_indexable_routes") or []:
            if support in exceptions:
                continue
            page = root / support.strip("/") / "index.html"
            if not page.is_file():
                findings.append(
                    _finding("BRIDGE_WRONG_SERVICE", support, "supporting route missing on disk")
                )
                continue
            html = page.read_text(encoding="utf-8")
            if re.search(r'content=["\'][^"\']*noindex', html, re.I):
                findings.append(
                    _finding(
                        "BRIDGE_WRONG_SERVICE",
                        support,
                        "noindex supporting URL listed as indexable in intent matrix",
                    )
                )
                continue
            fit = map_content_to_service(support, smap)
            dests = set()
            if fit.get("service_path"):
                dests.add((fit["service_path"] or "").rstrip("/") + "/")
            if html_has_commercial_bridge(html):
                bridge = extract_bridge_service(html)
                if bridge:
                    dests.add(bridge.rstrip("/") + "/")
            preferred_n = (preferred or "").rstrip("/") + "/"
            if preferred_n not in dests and dests:
                findings.append(
                    _finding(
                        "BRIDGE_WRONG_SERVICE",
                        support,
                        f"destinations={sorted(dests)} preferred={preferred_n}",
                    )
                )
            if html_has_commercial_bridge(html):
                for href in re.findall(
                    r'data-cta-position=["\']organic_bridge["\'][^>]*href=["\']([^"\']+)["\']'
                    r'|href=["\']([^"\']+)["\'][^>]*data-cta-position=["\']organic_bridge["\']',
                    html,
                    re.I,
                ):
                    raw = href[0] or href[1]
                    qs = parse_qs(urlparse(raw).query)
                    if "origem" not in qs:
                        findings.append(
                            _finding("CTA_DROPS_ATTRIBUTION", support, raw)
                        )
        # exactly one preferred
        if not preferred:
            findings.append(
                _finding("MULTIPLE_PREFERRED_DESTINATIONS", row.get("intent_cluster") or "", "missing preferred")
            )
    return findings


def audit_intent_cannibalization(matrix: dict[str, Any]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    query_owners: dict[str, list[str]] = defaultdict(list)
    parents = {
        row["canonical_service_route"].rstrip("/") + "/": (row.get("parent_route") or "").rstrip("/") + "/"
        for row in matrix.get("rows") or []
        if row.get("canonical_service_route")
    }
    for row in matrix.get("rows") or []:
        route = (row.get("canonical_service_route") or "").rstrip("/") + "/"
        for q in row.get("primary_queries") or []:
            query_owners[q.strip().lower()].append(route)
    for query, owners in query_owners.items():
        uniq = list(dict.fromkeys(owners))
        if len(uniq) < 2:
            continue
        related = True
        for a in uniq:
            for b in uniq:
                if a == b:
                    continue
                if parents.get(a) != b and parents.get(b) != a:
                    related = False
        if not related:
            findings.append(
                _finding(
                    "INTENT_CANNIBALIZATION",
                    query,
                    f"routes={uniq} without parent/child",
                )
            )
    return findings


def run_audit(root: Path | None = None, matrix: dict[str, Any] | None = None) -> dict[str, Any]:
    root = root or ROOT
    matrix = matrix or load_intent_matrix()
    sitemap = parse_sitemap_locs(root)
    catalog_ids = catalog_offer_ids(root)
    findings: list[dict[str, str]] = []
    for row in matrix.get("rows") or []:
        path = row.get("canonical_service_route")
        if not path:
            continue
        page = root / path.strip("/") / "index.html"
        if not page.is_file():
            findings.append(_finding("PILLAR_NOT_SELF_CANONICAL", path, "HTML missing"))
            continue
        html = page.read_text(encoding="utf-8")
        findings.extend(
            audit_service_page(
                path if path.endswith("/") else path + "/",
                html,
                sitemap=sitemap,
                catalog_ids=catalog_ids,
                root=root,
                row=row,
            )
        )
    findings.extend(audit_preferred_destinations(matrix, root))
    findings.extend(audit_intent_cannibalization(matrix))
    # indexable mapped content → exactly one preferred destination
    smap = load_service_map()
    for override_path, cluster_id in (smap.get("path_overrides") or {}).items():
        page = root / override_path.strip("/") / "index.html"
        if not page.is_file():
            continue
        html = page.read_text(encoding="utf-8")
        if re.search(r'content=["\'][^"\']*noindex', html, re.I):
            continue
        rows = [r for r in matrix.get("rows") or [] if r.get("intent_cluster") == cluster_id]
        if len(rows) > 1:
            justified = all(r.get("parent_route") or r.get("exceptions") for r in rows)
            if not justified:
                findings.append(
                    _finding(
                        "MULTIPLE_PREFERRED_DESTINATIONS",
                        override_path,
                        f"cluster={cluster_id} rows={len(rows)}",
                    )
                )
    return {
        "schema_version": "bofu-adversarial-audit-v1",
        "ok": not findings,
        "finding_count": len(findings),
        "findings": findings,
        "codes": list(FINDING_CODES),
    }
