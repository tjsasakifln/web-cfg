"""Compose hub links from the 09 matrix: only destinations present in the candidate.

Pure file-tree logic. Tests overlay files without network I/O. Shipped hub HTML
is audited against the same functions; this module is not a second public generator.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
MATRIX_PATH = ROOT / "scripts" / "site" / "hub_link_matrix.json"
PURCHASE_MAP_PATH = ROOT / "data" / "bofu-dominance" / "core" / "purchase-route-map.v1.json"
HOME_HREFS = frozenset({"/", "", "https://confenge.com.br/", "https://confenge.com.br"})
KIND_REQUIRED = "REQUIRED_LINK"
KIND_OPTIONAL = "OPTIONAL_LINK"
KIND_ANCHOR = "PRESERVE_ANCHOR"
RELEASE_CORE = "CORE"
_ASSET_RE = re.compile(
    r"\.(css|js|mjs|png|jpe?g|webp|svg|gif|ico|woff2?|xml|webmanifest|txt|pdf|avif|map)(?:$|\?)",
    re.I,
)


@dataclass
class Overlay:
    """Virtual file tree layered over a real root. None deletes a path."""

    extra: dict[str, str] = field(default_factory=dict)
    deleted: set[str] = field(default_factory=set)

    def with_file(self, relpath: str, content: str) -> "Overlay":
        extra = dict(self.extra)
        extra[relpath] = content
        deleted = set(self.deleted)
        deleted.discard(_norm_rel(relpath))
        return Overlay(extra=extra, deleted=deleted)

    def without_file(self, relpath: str) -> "Overlay":
        extra = dict(self.extra)
        extra.pop(_norm_rel(relpath), None)
        deleted = set(self.deleted)
        deleted.add(_norm_rel(relpath))
        return Overlay(extra=extra, deleted=deleted)


@dataclass
class ComposedLink:
    spec: dict[str, Any]
    href: str
    present: bool
    included: bool
    file_rel: str | None


def _norm_rel(relpath: str) -> str:
    return str(relpath).replace("\\", "/").lstrip("./")


def load_matrix(path: Path | None = None) -> dict[str, Any]:
    target = path or MATRIX_PATH
    return json.loads(target.read_text(encoding="utf-8"))


def load_purchase_map(root: Path | None = None) -> dict[str, Any] | None:
    target = (root or ROOT) / PURCHASE_MAP_PATH.relative_to(ROOT)
    if not target.is_file():
        return None
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def normalize_href(value: str) -> str:
    raw = str(value or "").strip()
    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urlparse(raw)
        raw = parsed.path or "/"
        if parsed.fragment:
            raw = f"{raw}#{parsed.fragment}"
    return raw


def split_href(href: str) -> tuple[str, str]:
    path, _, fragment = normalize_href(href).partition("#")
    path = path.split("?", 1)[0]
    if path and not path.endswith("/") and "." not in path.rsplit("/", 1)[-1]:
        path = f"{path}/"
    if not path:
        path = "/"
    return path, fragment


def href_to_relpath(href: str) -> str:
    path, _ = split_href(href)
    if path in ("/", ""):
        return "index.html"
    return f"{path.strip('/')}/index.html"


def _overlay_has(overlay: Overlay | None, relpath: str) -> bool | None:
    if overlay is None:
        return None
    rel = _norm_rel(relpath)
    if rel in overlay.deleted:
        return False
    if rel in overlay.extra:
        return True
    return None


def file_exists(root: Path, relpath: str, overlay: Overlay | None = None) -> bool:
    flagged = _overlay_has(overlay, relpath)
    if flagged is not None:
        return flagged
    return (root / relpath).is_file()


def read_text(root: Path, relpath: str, overlay: Overlay | None = None) -> str | None:
    flagged = _overlay_has(overlay, relpath)
    if flagged is False:
        return None
    if overlay and _norm_rel(relpath) in overlay.extra:
        return overlay.extra[_norm_rel(relpath)]
    path = root / relpath
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def anchor_exists(html: str, fragment: str) -> bool:
    if not fragment:
        return True
    return bool(re.search(rf'\bid=["\']{re.escape(fragment)}["\']', html, flags=re.I))


def destination_present(
    href: str,
    root: Path,
    overlay: Overlay | None = None,
    html_overrides: dict[str, str] | None = None,
) -> bool:
    path, fragment = split_href(href)
    rel = href_to_relpath(href)
    if html_overrides and path in html_overrides:
        html = html_overrides[path]
        return anchor_exists(html, fragment)
    html = read_text(root, rel, overlay)
    if html is None:
        return False
    return anchor_exists(html, fragment)


def _purchase_hrefs(document: dict[str, Any] | None) -> dict[str, str]:
    if not document:
        return {}
    out: dict[str, str] = {}
    for item in document.get("purchases") or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("purchase_id") or "").strip()
        href = item.get("proposed_primary_url") or item.get("primary_url")
        if key and href:
            out[key] = normalize_href(str(href))
    return out


def resolve_link_href(spec: dict[str, Any], purchase_map: dict[str, Any] | None) -> str:
    overrides = _purchase_hrefs(purchase_map)
    purchase_id = str(spec.get("purchase_id") or "").strip()
    if purchase_id and purchase_id in overrides:
        return overrides[purchase_id]
    return normalize_href(str(spec.get("href") or ""))


def release_unit_of(spec: dict[str, Any]) -> str:
    return str(spec.get("release_unit") or "").strip().upper()


def treats_as_required(spec: dict[str, Any]) -> bool:
    """OPTIONAL may omit only expansion routes. A CORE route cannot drop silently."""
    kind = spec.get("kind")
    if kind == KIND_REQUIRED:
        return True
    return kind == KIND_OPTIONAL and release_unit_of(spec) == RELEASE_CORE


def compose_links(
    root: Path | None = None,
    matrix: dict[str, Any] | None = None,
    overlay: Overlay | None = None,
    purchase_map: dict[str, Any] | None = None,
    html_overrides: dict[str, str] | None = None,
) -> list[ComposedLink]:
    base = root or ROOT
    data = matrix or load_matrix()
    resolved_map = purchase_map if purchase_map is not None else load_purchase_map(base)
    composed: list[ComposedLink] = []
    for spec in data.get("links") or []:
        href = resolve_link_href(spec, resolved_map)
        present = destination_present(href, base, overlay, html_overrides)
        kind = spec.get("kind")
        if treats_as_required(spec):
            included = present
        elif kind == KIND_OPTIONAL:
            included = present
        else:
            included = present
        composed.append(
            ComposedLink(
                spec=spec,
                href=href,
                present=present,
                included=included,
                file_rel=href_to_relpath(href),
            )
        )
    return composed


def optional_card_html(link: ComposedLink) -> str:
    """Markup for an optional hub card. Empty when the route is absent. Never links home."""
    if not link.included or not link.present:
        return ""
    if link.href in HOME_HREFS:
        return ""
    spec = link.spec
    marker = escape(str(spec.get("marker") or spec.get("id") or ""))
    label = escape(str(spec.get("label") or link.href))
    href = escape(link.href)
    return (
        f'<article class="hub-optional-card" data-hub-link="{marker}" '
        f'data-requires-route="{href}">'
        f'<a href="{href}">{label}</a>'
        f"</article>"
    )


def compose_optional_markup(
    root: Path | None = None,
    matrix: dict[str, Any] | None = None,
    overlay: Overlay | None = None,
    purchase_map: dict[str, Any] | None = None,
) -> str:
    parts: list[str] = []
    for link in compose_links(root, matrix, overlay, purchase_map):
        if link.spec.get("kind") != KIND_OPTIONAL:
            continue
        parts.append(optional_card_html(link))
    return "".join(parts)


_HREF_RE = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.I)
_MARKER_RE = re.compile(r"""data-hub-link\s*=\s*["']([^"']+)["']""", re.I)


def extract_hrefs(html: str) -> list[str]:
    return [m.group(1).strip() for m in _HREF_RE.finditer(html or "")]


def is_internal_page_href(href: str) -> bool:
    raw = str(href or "").strip()
    if not raw or raw.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return False
    if "wa.me/" in raw.lower():
        return False
    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urlparse(raw)
        host = (parsed.netloc or "").lower()
        if host and "confenge.com.br" not in host:
            return False
        raw = parsed.path or "/"
    path = raw.split("#", 1)[0].split("?", 1)[0]
    if _ASSET_RE.search(path):
        return False
    return path.startswith("/")


def extract_markers(html: str) -> set[str]:
    return {m.group(1) for m in _MARKER_RE.finditer(html or "")}


def hub_html(
    hub_path: str,
    root: Path,
    overlay: Overlay | None = None,
    html_overrides: dict[str, str] | None = None,
) -> str:
    if html_overrides and hub_path in html_overrides:
        return html_overrides[hub_path]
    rel = href_to_relpath(hub_path)
    text = read_text(root, rel, overlay)
    if text is None:
        raise FileNotFoundError(f"hub missing: {hub_path} ({rel})")
    return text


def href_in_html(html: str, href: str) -> bool:
    target = normalize_href(href)
    path, fragment = split_href(target)
    for found in extract_hrefs(html):
        found_path, found_frag = split_href(found)
        if found_path == path and (not fragment or found_frag == fragment):
            return True
        if found == target:
            return True
    return False


def audit_hubs(
    root: Path | None = None,
    matrix: dict[str, Any] | None = None,
    overlay: Overlay | None = None,
    html_overrides: dict[str, str] | None = None,
    purchase_map: dict[str, Any] | None = None,
) -> list[str]:
    """Audit shipped (or overlaid) hub HTML against the composed matrix."""
    base = root or ROOT
    data = matrix or load_matrix()
    composed = compose_links(base, data, overlay, purchase_map, html_overrides)
    failures: list[str] = []
    hub_sources = {h["path"]: hub_html(h["path"], base, overlay, html_overrides) for h in data.get("hubs") or []}

    by_hub: dict[str, list[ComposedLink]] = {}
    for link in composed:
        by_hub.setdefault(str(link.spec.get("hub")), []).append(link)

    for hub_path, html in hub_sources.items():
        lower = html.lower()
        for term in data.get("internal_terms") or []:
            if term.lower() in lower:
                failures.append(f"{hub_path}: internal term {term!r}")
        if re.search(r"\bem breve\b", html, flags=re.I):
            failures.append(f"{hub_path}: placeholder copy 'em breve'")
        if "catalogo exclusivo" in lower or "somente obras públicas" in lower:
            failures.append(f"{hub_path}: exclusive B2G catalogue copy")

        for found in extract_hrefs(html):
            if found.startswith("#"):
                if not anchor_exists(html, found[1:]):
                    failures.append(f"{hub_path}: in-page href {found} missing anchor")
                continue
            if not is_internal_page_href(found):
                continue
            path, fragment = split_href(found)
            if path in HOME_HREFS:
                continue
            if not destination_present(found, base, overlay, html_overrides):
                failures.append(f"{hub_path}: href to missing destination {found}")

        for link in by_hub.get(hub_path, []):
            kind = link.spec.get("kind")
            marker = str(link.spec.get("marker") or "")
            if treats_as_required(link.spec):
                if not link.present:
                    failures.append(f"{KIND_REQUIRED} {link.spec.get('id')} destination missing: {link.href}")
                elif not href_in_html(html, link.href):
                    failures.append(f"{KIND_REQUIRED} {link.spec.get('id')} missing <a href> {link.href} in {hub_path}")
            elif kind == KIND_OPTIONAL:
                if not link.present:
                    if href_in_html(html, link.href):
                        failures.append(
                            f"{KIND_OPTIONAL} {link.spec.get('id')} should be omitted; href {link.href} still in {hub_path}"
                        )
                    if marker and marker in extract_markers(html):
                        failures.append(
                            f"{KIND_OPTIONAL} {link.spec.get('id')} card marker {marker} present without route"
                        )
                    # Optional omission must not be replaced by a home link on the marker.
                    if marker:
                        card = _marker_block(html, marker)
                        if card and any(normalize_href(h) in HOME_HREFS for h in extract_hrefs(card)):
                            failures.append(
                                f"{KIND_OPTIONAL} {link.spec.get('id')} omitted route fell back to home"
                            )
                else:
                    if not href_in_html(html, link.href):
                        failures.append(
                            f"{KIND_OPTIONAL} {link.spec.get('id')} present in candidate but missing from {hub_path}"
                        )

    for spec in data.get("anchors") or []:
        hub_path = str(spec.get("hub"))
        html = hub_sources.get(hub_path)
        if html is None:
            failures.append(f"{KIND_ANCHOR} hub missing {hub_path}")
            continue
        _path, fragment = split_href(str(spec.get("href") or ""))
        if not fragment or not anchor_exists(html, fragment):
            failures.append(f"{KIND_ANCHOR} {spec.get('id')} missing in {hub_path}")

    return failures


def _marker_block(html: str, marker: str) -> str:
    pattern = re.compile(
        rf'(<(?:article|section|li|div)[^>]*data-hub-link=["\']{re.escape(marker)}["\'][\s\S]*?</(?:article|section|li|div)>)',
        re.I,
    )
    match = pattern.search(html)
    return match.group(1) if match else ""


def bfs_hops(
    start: str,
    goal: str,
    root: Path,
    overlay: Overlay | None = None,
    html_overrides: dict[str, str] | None = None,
    limit: int = 8,
) -> int | None:
    """Click depth using static hrefs only. 0 if start==goal, 1 for a direct link."""
    start_path, _ = split_href(start)
    goal_path, goal_frag = split_href(goal)
    if start_path == goal_path:
        if not goal_frag or start == goal:
            return 0
        try:
            start_html = hub_html(
                start_path if start_path.endswith("/") else f"{start_path}/",
                root,
                overlay,
                html_overrides,
            )
        except FileNotFoundError:
            start_html = read_text(root, href_to_relpath(start_path), overlay) or ""
        if start_html and anchor_exists(start_html, goal_frag):
            return 0
    seen: set[str] = {start_path}
    queue: list[tuple[str, int]] = [(start_path, 0)]
    while queue:
        current, depth = queue.pop(0)
        if depth >= limit:
            continue
        try:
            html = hub_html(current if current.endswith("/") else f"{current}/", root, overlay, html_overrides)
        except FileNotFoundError:
            rel = href_to_relpath(current)
            html = read_text(root, rel, overlay)
            if html is None:
                continue
        for found in extract_hrefs(html):
            if found.startswith("#"):
                continue
            if not is_internal_page_href(found):
                continue
            path, fragment = split_href(found)
            if path == goal_path and (not goal_frag or fragment == goal_frag or not fragment):
                return depth + 1
            if path in seen or path in HOME_HREFS:
                continue
            if path.startswith("http"):
                continue
            seen.add(path)
            queue.append((path, depth + 1))
    return None


def journey_table(
    root: Path | None = None,
    matrix: dict[str, Any] | None = None,
    overlay: Overlay | None = None,
    html_overrides: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    base = root or ROOT
    data = matrix or load_matrix()
    rows: list[dict[str, Any]] = []
    for journey in data.get("journeys") or []:
        hops = bfs_hops(
            str(journey["start"]),
            str(journey["goal"]),
            base,
            overlay,
            html_overrides,
        )
        raw_max = journey.get("max_hops")
        max_hops = 2 if raw_max is None else int(raw_max)
        rows.append(
            {
                "id": journey.get("id"),
                "start": journey.get("start"),
                "goal": journey.get("goal"),
                "hops": hops,
                "max_hops": max_hops,
                "ok": hops is not None and hops <= max_hops,
            }
        )
    return rows
