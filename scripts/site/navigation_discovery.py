"""Render the shared discovery menu from the public information architecture.

Native disclosures keep every destination usable without JavaScript. The
desktop, mobile, project and generated shells consume the same contract.
"""

from __future__ import annotations

import re
from html import escape
from typing import Any

from scripts.site.public_ia import active_header_href, load_ia_map


def navigation_groups(ia: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return list(((ia or load_ia_map()).get("header") or {}).get("destinations") or [])


def _analytics(position: str, identifier: str) -> str:
    return (
        f'data-cta-position="{escape(position, quote=True)}" '
        f'data-cta-id="nav-{escape(position, quote=True)}-{escape(identifier, quote=True)}" '
        'data-event-name="cta_click" data-navigation-link="true"'
    )


def render_navigation(
    *, kind: str, current: str | None = None, active: str | None = None,
    ia: dict[str, Any] | None = None,
) -> str:
    data = ia or load_ia_map()
    if kind not in {"desktop", "mobile", "pp-desktop", "pp-mobile"}:
        raise ValueError(f"Unsupported navigation kind: {kind}")
    mobile = "mobile" in kind
    position = "mobile_nav" if mobile else "header_nav"
    active = active if active is not None else active_header_href(current or "/", data)
    parts = []
    for group in navigation_groups(data):
        group_id = str(group["id"])
        panel_id = f"nav-{kind}-{group_id}"
        selected = group["href"] == active
        group_class = "nav-group is-active" if selected else "nav-group"
        aria = ' aria-current="page"' if selected else ""
        links = []
        for item in group["children"]:
            links.append(
                f'<a class="nav-destination" href="{escape(item["href"], quote=True)}" '
                f'data-nav-destination="{escape(item["id"], quote=True)}" '
                f'{_analytics(position, group_id + "-" + item["id"])}>'
                f'{escape(item["label"])}'
                f'<span class="nav-destination__description">{escape(item["description"])}</span></a>'
            )
        parts.append(
            f'<details class="{group_class}" name="nav-{kind}" '
            f'data-nav-group="{escape(group_id, quote=True)}">'
            f'<summary class="nav-group__toggle" aria-controls="{panel_id}">'
            f'{escape(group["label"])}</summary>'
            f'<div class="nav-panel" id="{panel_id}">{"".join(links)}'
            f'<a class="nav-overview" data-nav-primary="true" '
            f'data-nav-label="{escape(group["label"], quote=True)}"{aria} '
            f'href="{escape(group["href"], quote=True)}" {_analytics(position, group_id + "-overview")}>'
            f'{escape(group["overview_label"])}</a></div></details>'
        )
    if mobile:
        utility = "".join(
            f'<a href="{escape(item["href"], quote=True)}" '
            f'{_analytics(position, item["id"])}>{escape(item["label"])}</a>'
            for item in data["header"].get("utility_links", [])
        )
        parts.append(f'<div class="mobile-nav__utility">{utility}</div>')
    return "\n".join(parts)


def render_discovery_bar(
    ia: dict[str, Any] | None = None, *, include_portals: bool = False,
) -> str:
    data = ia or load_ia_map()
    header = data["header"]
    shortcuts = "".join(
        f'<a href="{escape(item["href"], quote=True)}" '
        f'{_analytics("header_shortcut", item["id"])}>{escape(item["label"])}</a>'
        for item in header.get("quick_links", [])
    )
    utilities = "".join(
        f'<a class="nav-discovery__company" href="{escape(item["href"], quote=True)}" '
        f'{_analytics("header_utility", item["id"])}>{escape(item["label"])}</a>'
        for item in header.get("utility_links", [])
    )
    reserved_links = utilities
    if include_portals:
        links = "".join(
            f'<a class="nav-discovery__portal" href="{escape(item["href"], quote=True)}" '
            f'{_analytics("header_portal", item["id"])}>{escape(item["label"])}</a>'
            for item in header.get("portal_links", [])
        )
        if links:
            reserved_links = f'<div class="nav-discovery__portals">{links}{utilities}</div>'
    return (
        '<!-- BEGIN NAV DISCOVERY -->'
        '<nav class="nav-discovery-region" aria-label="Acesso direto">'
        '<div class="nav-discovery" data-nav-discovery="true">'
        '<div class="container nav-discovery__inner">'
        '<div class="nav-discovery__shortcuts">'
        '<span class="nav-discovery__label">Acesso direto</span>'
        f'{shortcuts}</div>{reserved_links}</div></div></nav>'
        '<!-- END NAV DISCOVERY -->'
    )


_BAR_RE = re.compile(r"<!-- BEGIN NAV DISCOVERY -->.*?<!-- END NAV DISCOVERY -->", re.S)
_PORTAL_SCRIPT = '<script defer src="/assets/portal/public-nav.js"></script>'
_PORTAL_STYLE = '<link rel="stylesheet" href="/assets/portal/public-nav.css">'
_HEADER_RE = re.compile(
    r'(<header\b(?=[^>]*\bclass=["\'][^"\']*\b(?:site-header|pp-header)\b)[^>]*>)(.*?)(</header>)'
    r'(?:\s*<!-- BEGIN NAV DISCOVERY -->.*?<!-- END NAV DISCOVERY -->)?',
    re.S | re.I,
)


def sync_discovery_bar(html: str, *, include_portals: bool = False) -> str:
    """Keep one shortcut region after the sticky header, preserving page content."""
    has_portal_assets = _PORTAL_SCRIPT in html
    include_portals = include_portals or has_portal_assets

    def replace(match: re.Match[str]) -> str:
        inner = _BAR_RE.sub("", match.group(2)).rstrip()
        bar = render_discovery_bar(include_portals=include_portals)
        return f"{match.group(1)}{inner}\n{match.group(3)}\n{bar}"
    html, count = _HEADER_RE.subn(replace, html, count=1)
    if count and include_portals and not has_portal_assets:
        # Tool pages require their existing theme to stay last in the cascade.
        html = re.sub(r"<head\b[^>]*>", lambda match: match.group() + _PORTAL_STYLE,
                      html, count=1, flags=re.I)
        html = re.sub(r"</head>", f"{_PORTAL_SCRIPT}</head>", html, count=1, flags=re.I)
    return html
