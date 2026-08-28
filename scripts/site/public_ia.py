"""Public information architecture: map, chrome, breadcrumbs, route census.

The JSON contract at data/site/public-ia-map.json is the source. This module
does not parse or rewrite HTML; generators and tests import the pure map and
the materialized route table independently.
"""

from __future__ import annotations

import json
import re
from collections import deque
from html import escape
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
IA_MAP_PATH = ROOT / "data" / "site" / "public-ia-map.json"
FAMILY_REGISTRY_PATH = ROOT / "data" / "organic" / "public-family-registry.json"
BOFU_MATRIX_PATH = ROOT / "data" / "organic" / "bofu-intent-matrix.json"

HUB_ROLES = frozenset(
    {
        "solucao_comercial",
        "problema",
        "educacao",
        "ferramenta",
        "evidencia",
        "institucional",
    }
)
MAX_HEADER_DESTINATIONS = 5
SKIP_DIR_PARTS = frozenset(
    {
        ".git",
        ".claude",
        ".worktrees",
        "_site",
        "node_modules",
        "docs",
        "scripts",
        "seo",
        "supabase",
        "netlify",
        "tests",
        "data",
        "ops",
        "assets",
        "runtime",
        "build",
        "deploy",
        "dist",
    }
)
JOURNEY_PHRASES = (
    "edital e proposta",
    "contrato sob pressão",
    "operação recorrente",
)
CONTACT = {
    "email_href": "mailto:tiago.sasaki@confenge.com.br",
    "email_label": "tiago.sasaki@confenge.com.br",
    "tel_href": "tel:+5548988344559",
    "tel_label": "(48) 98834-4559",
}

_ROBOTS_RE = re.compile(
    r'name=["\']robots["\'][^>]*content=["\']([^"\']+)', re.I
)
_ROBOTS_RE_ALT = re.compile(
    r'content=["\']([^"\']+)["\'][^>]*name=["\']robots["\']', re.I
)


def load_ia_map(path: Path | None = None) -> dict[str, Any]:
    target = path or IA_MAP_PATH
    return json.loads(target.read_text(encoding="utf-8"))


def header_items(ia: dict[str, Any] | None = None) -> list[dict[str, str]]:
    data = ia or load_ia_map()
    items = ((data.get("header") or {}).get("destinations") or [])
    return [{"label": str(i["label"]), "href": str(i["href"])} for i in items]


def header_cta(ia: dict[str, Any] | None = None) -> dict[str, str]:
    data = ia or load_ia_map()
    cta = (data.get("header") or {}).get("cta") or {}
    return {
        "label": str(cta.get("label") or "Analisar meu caso"),
        "href": str(cta.get("href") or "/#formulario-contato"),
    }


def journey_items(ia: dict[str, Any] | None = None) -> list[dict[str, str]]:
    data = ia or load_ia_map()
    return list(data.get("journeys") or [])


def hubs(ia: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    data = ia or load_ia_map()
    return list(data.get("hubs") or [])


def hub_by_route(route: str, ia: dict[str, Any] | None = None) -> dict[str, Any] | None:
    for hub in hubs(ia):
        if hub.get("route") == route:
            return hub
    return None


def _normalize_route(value: str | None) -> str:
    if not value:
        return ""
    path = value.split("#", 1)[0].split("?", 1)[0]
    if not path.startswith("/"):
        return ""
    if path.endswith(".html") or "." in Path(path).name:
        return path
    return path.rstrip("/") or "/"


def _path_with_slash(route: str) -> str:
    if route == "/":
        return "/"
    if route.endswith(".html") or "." in Path(route).name:
        return route
    return route if route.endswith("/") else route + "/"


def parent_of(route: str, ia: dict[str, Any] | None = None) -> str | None:
    data = ia or load_ia_map()
    current = _path_with_slash(_normalize_route(route))
    if current == "/":
        return None
    rules = list(data.get("parents") or [])
    exact: dict[str, str | None] = {}
    prefixes: list[tuple[str, str | None]] = []
    for rule in rules:
        prefix = _path_with_slash(_normalize_route(str(rule.get("prefix") or "")))
        if not prefix:
            continue
        parent = rule.get("parent")
        parent_n = None if parent in (None, "", "/") and parent != "/" else (
            None if parent is None else _path_with_slash(_normalize_route(str(parent)))
        )
        if parent == "/":
            parent_n = "/"
        if rule.get("exact"):
            exact[prefix] = parent_n
        else:
            prefixes.append((prefix, parent_n))
    if current in exact:
        return exact[current]
    prefixes.sort(key=lambda item: len(item[0]), reverse=True)
    for prefix, parent in prefixes:
        if current == prefix or current.startswith(prefix):
            return parent
    return "/"


def breadcrumb_trail(
    route: str,
    *,
    current_label: str | None = None,
    ia: dict[str, Any] | None = None,
) -> list[tuple[str, str | None]]:
    data = ia or load_ia_map()
    current = _path_with_slash(_normalize_route(route))
    labels = _label_index(data)
    chain: list[str] = []
    seen: set[str] = set()
    cursor: str | None = current
    while cursor and cursor not in seen:
        seen.add(cursor)
        chain.append(cursor)
        cursor = parent_of(cursor, data)
    chain.reverse()
    crumbs: list[tuple[str, str | None]] = []
    for item in chain:
        if item == "/":
            crumbs.append(("Início", "/"))
            continue
        label = labels.get(item) or current_label or item.strip("/").split("/")[-1]
        href = item if item != current else None
        crumbs.append((label, href))
    if crumbs and crumbs[-1][1] is not None:
        last_label = current_label or crumbs[-1][0]
        crumbs[-1] = (last_label, None)
    elif crumbs and current_label:
        crumbs[-1] = (current_label, None)
    return crumbs


def _label_index(ia: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {"/": "Início"}
    for item in header_items(ia):
        out[_path_with_slash(item["href"])] = item["label"]
    for hub in hubs(ia):
        route = _path_with_slash(str(hub.get("route") or ""))
        if route:
            out.setdefault(route, str(hub.get("label") or route))
    for journey in journey_items(ia):
        href = _path_with_slash(str(journey.get("href") or ""))
        if href:
            out.setdefault(href, str(journey.get("label") or href))
    return out


def active_header_href(route: str, ia: dict[str, Any] | None = None) -> str | None:
    data = ia or load_ia_map()
    current = _path_with_slash(_normalize_route(route))
    rules = list(data.get("active_header") or [])
    rules.sort(key=lambda rule: len(str(rule.get("prefix") or "")), reverse=True)
    for rule in rules:
        prefix = _path_with_slash(_normalize_route(str(rule.get("prefix") or "")))
        href = str(rule.get("href") or "")
        if prefix and href and (current == prefix or current.startswith(prefix)):
            return href
    header = {item["href"] for item in header_items(data)}
    if current in header or _path_with_slash(current) in header:
        return current if current in header else _path_with_slash(current)
    return None


def robots_of(html: str) -> str:
    match = _ROBOTS_RE.search(html) or _ROBOTS_RE_ALT.search(html)
    return (match.group(1) if match else "MISSING").lower()


def is_indexable_html(html: str) -> bool:
    robots = robots_of(html)
    if robots == "missing":
        return True
    return "noindex" not in robots


def index_state_of(html: str) -> str:
    return "index" if is_indexable_html(html) else "noindex"


def html_route(path: Path, root: Path | None = None) -> str:
    base = root or ROOT
    rel = path.relative_to(base).as_posix()
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    if rel.endswith(".html"):
        return "/" + rel[: -len(".html")]
    return "/" + rel


def public_html_files(root: Path | None = None) -> list[Path]:
    base = root or ROOT
    out: list[Path] = []
    for path in sorted(base.rglob("*.html")):
        rel = path.relative_to(base)
        if any(part in SKIP_DIR_PARTS for part in rel.parts):
            continue
        out.append(path)
    return out


def _load_families() -> list[dict[str, Any]]:
    if not FAMILY_REGISTRY_PATH.exists():
        return []
    data = json.loads(FAMILY_REGISTRY_PATH.read_text(encoding="utf-8"))
    return list(data.get("families") or [])


def _service_routes() -> set[str]:
    if not BOFU_MATRIX_PATH.exists():
        return set()
    data = json.loads(BOFU_MATRIX_PATH.read_text(encoding="utf-8"))
    return {
        str(row.get("canonical_service_route"))
        for row in (data.get("rows") or [])
        if row.get("canonical_service_route")
    }


def _family_for(route: str, families: list[dict[str, Any]], service_routes: set[str]) -> dict[str, Any] | None:
    exact: list[tuple[int, dict[str, Any]]] = []
    prefixed: list[tuple[int, dict[str, Any]]] = []
    for family in families:
        match = family.get("match") or {}
        routes = list(match.get("routes") or [])
        source = match.get("source") or ""
        if "bofu-intent-matrix" in str(source):
            routes = list(service_routes)
        prefix = match.get("prefix")
        if route in routes:
            exact.append((len(route), family))
        elif prefix and route.startswith(str(prefix)):
            prefixed.append((len(str(prefix)), family))
    if exact:
        exact.sort(key=lambda item: item[0], reverse=True)
        return exact[0][1]
    if prefixed:
        prefixed.sort(key=lambda item: item[0], reverse=True)
        return prefixed[0][1]
    return None


def _next_action_for(route: str, family: dict[str, Any] | None, ia: dict[str, Any]) -> str | None:
    hub = hub_by_route(_path_with_slash(route), ia)
    if hub and hub.get("next_action"):
        return str(hub["next_action"])
    if not family:
        return "/#formulario-contato"
    action = family.get("terminal_action")
    if action == "none":
        return None
    if action == "service_transition":
        return "/servicos-obras-publicas/"
    return "/#formulario-contato"


def materialize_route_map(
    root: Path | None = None,
    ia: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    """route → job, parent, next_action, index_state, optional hub role."""
    data = ia or load_ia_map()
    base = root or ROOT
    families = _load_families()
    service_routes = _service_routes()
    role_by_route = {
        _path_with_slash(str(hub.get("route") or "")): str(hub.get("role") or "")
        for hub in hubs(data)
        if hub.get("route")
    }
    out: dict[str, dict[str, Any]] = {}
    for path in public_html_files(base):
        route = html_route(path, base)
        if not route.startswith("/"):
            continue
        html = path.read_text(encoding="utf-8", errors="replace")
        family = _family_for(route, families, service_routes)
        job = ""
        if family:
            job = str(family.get("visitor_job") or "")
        hub = hub_by_route(_path_with_slash(route), data)
        if not job and hub:
            job = str(hub.get("label") or "")
        if not job:
            parent = parent_of(route, data)
            parent_hub = hub_by_route(parent or "", data) if parent else None
            if parent_hub:
                job = str(parent_hub.get("label") or "")
        if not job:
            job = "Encontrar a próxima ação em licitação ou contrato de obra pública."
        record = {
            "route": route,
            "job": job,
            "parent": parent_of(route, data),
            "next_action": _next_action_for(route, family, data),
            "index_state": index_state_of(html),
            "file": path.relative_to(base).as_posix(),
        }
        role = role_by_route.get(_path_with_slash(route))
        if role:
            record["role"] = role
        out[route] = record
    return out


def footer_columns_html(ia: dict[str, Any] | None = None) -> str:
    data = ia or load_ia_map()
    columns = ((data.get("footer") or {}).get("columns") or [])
    parts: list[str] = []
    for column in columns:
        heading = escape(str(column.get("heading") or ""))
        links = []
        for item in column.get("links") or []:
            href = escape(str(item.get("href") or ""), quote=True)
            label = escape(str(item.get("label") or ""))
            links.append(f'<a href="{href}">{label}</a>')
        if column.get("contact"):
            links.append(
                f'<a href="{escape(CONTACT["email_href"], quote=True)}">'
                f'{escape(CONTACT["email_label"])}</a>'
            )
            links.append(
                f'<a href="{escape(CONTACT["tel_href"], quote=True)}">'
                f'{escape(CONTACT["tel_label"])}</a>'
            )
            links.append("<span>Atendimento nacional</span>")
        parts.append(
            f'<div class="footer-links"><strong>{heading}</strong>{"".join(links)}</div>'
        )
    return "".join(parts)


def chrome_hrefs(ia: dict[str, Any] | None = None) -> list[str]:
    data = ia or load_ia_map()
    hrefs: list[str] = []
    for item in header_items(data):
        hrefs.append(item["href"])
    hrefs.append(header_cta(data)["href"])
    for column in (data.get("footer") or {}).get("columns") or []:
        for item in column.get("links") or []:
            hrefs.append(str(item.get("href") or ""))
    return hrefs


def validate_contract(ia: dict[str, Any] | None = None) -> list[str]:
    data = ia or load_ia_map()
    errors: list[str] = []
    destinations = header_items(data)
    if len(destinations) > MAX_HEADER_DESTINATIONS:
        errors.append(
            f"header has {len(destinations)} destinations; max is {MAX_HEADER_DESTINATIONS}"
        )
    if len(destinations) < 3:
        errors.append("header must name the three purchase situations")
    hrefs = [item["href"] for item in destinations]
    if len(set(hrefs)) != len(hrefs):
        errors.append("header has duplicate hrefs")
    labels = " ".join(item["label"].lower() for item in destinations)
    found_journeys = [phrase for phrase in JOURNEY_PHRASES if phrase in labels]
    if len(found_journeys) < 1:
        errors.append("header does not name a purchase situation in visitor language")
    if "b2g" in labels:
        errors.append("header requires the term B2G")
    cta = header_cta(data)
    if not cta.get("label") or not cta.get("href"):
        errors.append("header CTA missing")
    seen_hubs: set[str] = set()
    for hub in hubs(data):
        route = str(hub.get("route") or "")
        role = str(hub.get("role") or "")
        if route in seen_hubs:
            errors.append(f"duplicate hub route {route}")
        seen_hubs.add(route)
        if role not in HUB_ROLES:
            errors.append(f"hub {route} has invalid role {role!r}")
    journeys = journey_items(data)
    if {j.get("id") for j in journeys} != {"edital", "contrato", "operacao"}:
        errors.append("journeys must be edital, contrato, operacao")
    footer_count = 0
    for column in (data.get("footer") or {}).get("columns") or []:
        footer_count += len(column.get("links") or [])
    if footer_count > 16:
        errors.append(f"footer dumps taxonomy ({footer_count} links)")
    return errors


def audit_primary_nav_hygiene(
    root: Path | None = None,
    ia: dict[str, Any] | None = None,
) -> list[str]:
    data = ia or load_ia_map()
    base = root or ROOT
    errors: list[str] = []
    for href in chrome_hrefs(data):
        path = href.split("#", 1)[0]
        if not path or path == "/":
            target = base / "index.html"
        else:
            rel = path.strip("/")
            target = base / rel / "index.html"
            if not target.is_file():
                target = base / f"{rel}.html"
        if not target.is_file():
            errors.append(f"chrome href missing: {href}")
            continue
        html = target.read_text(encoding="utf-8", errors="replace")
        if not is_indexable_html(html):
            errors.append(f"chrome href is noindex: {href}")
    hidden = {
        _path_with_slash(str(hub.get("route") or ""))
        for hub in hubs(data)
        if hub.get("chrome") == "hidden"
    }
    for href in chrome_hrefs(data):
        if _path_with_slash(_normalize_route(href)) in hidden:
            errors.append(f"hidden hub leaked into chrome: {href}")
    return errors


def audit_orphans(
    root: Path | None = None,
    ia: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Indexable public routes must be reachable from home through shipped links."""
    from scripts.pseo.link_graph import collect_pages, extract_links

    base = root or ROOT
    data = ia or load_ia_map()
    routes = materialize_route_map(base, data)
    pages = {
        url: path
        for url, path in collect_pages(base).items()
        if not any(part in SKIP_DIR_PARTS for part in path.relative_to(base).parts)
    }
    edges: dict[str, list[str]] = {}
    for url, path in pages.items():
        edges[url] = [href for href in extract_links(path) if href in pages]

    depth: dict[str, int] = {}
    queue: deque[str] = deque()
    if "/" in pages:
        depth["/"] = 0
        queue.append("/")
    while queue:
        node = queue.popleft()
        for dest in edges.get(node, []):
            if dest not in depth:
                depth[dest] = depth[node] + 1
                queue.append(dest)

    exempt_prefixes = ("/nurture/", "/piloto/", "/obrigado")
    indexable = [route for route, rec in routes.items() if rec["index_state"] == "index"]
    orphans = sorted(
        route
        for route in indexable
        if route not in depth
        and route != "/obrigado"
        and not route.startswith(exempt_prefixes)
        and not route.startswith("/obrigado-")
    )
    reachable_depths = [depth[route] for route in indexable if route in depth]
    avg = (
        sum(reachable_depths) / len(reachable_depths) if reachable_depths else None
    )
    return {
        "n_public_routes": len(routes),
        "n_indexable": len(indexable),
        "n_internal_edges": sum(len(v) for v in edges.values()),
        "orphan_count": len(orphans),
        "orphans": orphans,
        "avg_click_depth": avg,
        "max_depth": max(reachable_depths) if reachable_depths else None,
        "header": header_items(data),
        "cta": header_cta(data),
    }


def footer_problem_cluster_dump(html: str, clusters: list[str]) -> bool:
    """True when the footer enumerates the full problem-cluster taxonomy."""
    match = re.search(r'<footer class="site-footer">(.*?)</footer>', html, re.S | re.I)
    if not match:
        return False
    footer = match.group(1)
    hits = sum(1 for href in clusters if f'href="{href}"' in footer)
    return hits >= max(6, len(clusters) - 1)


def first_viewport_names_journey(html: str, ia: dict[str, Any] | None = None) -> bool:
    data = ia or load_ia_map()
    header = re.search(
        r'<header class="site-header".*?</header>', html, re.S | re.I
    )
    blob = (header.group(0) if header else html[:4000]).lower()
    if "b2g" in blob and not any(p in blob for p in JOURNEY_PHRASES):
        return False
    return any(phrase in blob for phrase in JOURNEY_PHRASES)
