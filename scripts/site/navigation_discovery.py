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
                f'<span class="nav-destination__title">{escape(item["label"])}</span>'
                f'<span class="nav-destination__description">{escape(item["description"])}</span></a>'
            )
        parts.append(
            f'<details class="{group_class}" name="nav-{kind}" '
            f'data-nav-group="{escape(group_id, quote=True)}">'
            f'<summary class="nav-group__toggle" aria-controls="{panel_id}">'
            f'<span>{escape(group["label"])}</span>'
            '<span class="nav-group__chevron" aria-hidden="true"></span></summary>'
            f'<div class="nav-panel" id="{panel_id}">'
            '<div class="nav-panel__intro">'
            f'<p class="nav-panel__eyebrow">{escape(group["eyebrow"])}</p>'
            f'<p class="nav-panel__description">{escape(group["description"])}</p>'
            f'<a class="nav-overview" data-nav-primary="true" '
            f'data-nav-label="{escape(group["label"], quote=True)}"{aria} '
            f'href="{escape(group["href"], quote=True)}" {_analytics(position, group_id + "-overview")}>'
            f'{escape(group["overview_label"])}<span aria-hidden="true"> →</span></a></div>'
            f'<div class="nav-panel__links">{"".join(links)}</div></div></details>'
        )
    if mobile:
        utility = "".join(
            f'<a href="{escape(item["href"], quote=True)}" '
            f'{_analytics(position, item["id"])}>{escape(item["label"])}</a>'
            for item in data["header"].get("utility_links", [])
        )
        parts.append(f'<div class="mobile-nav__utility">{utility}</div>')
    return "\n".join(parts)


def render_discovery_bar(ia: dict[str, Any] | None = None) -> str:
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
    return (
        '<!-- BEGIN NAV DISCOVERY -->'
        '<div class="nav-discovery" data-nav-discovery="true">'
        '<div class="container nav-discovery__inner">'
        '<div class="nav-discovery__shortcuts">'
        '<span class="nav-discovery__label">Acesso direto</span>'
        f'{shortcuts}</div>{utilities}</div></div>'
        '<!-- END NAV DISCOVERY -->'
    )


_BAR_RE = re.compile(r"<!-- BEGIN NAV DISCOVERY -->.*?<!-- END NAV DISCOVERY -->", re.S)
_HEADER_RE = re.compile(
    r'(<header\b(?=[^>]*\bclass=["\'][^"\']*\b(?:site-header|pp-header)\b)[^>]*>)(.*?)(</header>)',
    re.S | re.I,
)


def sync_discovery_bar(html: str) -> str:
    """Add or update one shortcut row without touching the page's body."""
    def replace(match: re.Match[str]) -> str:
        inner = _BAR_RE.sub("", match.group(2)).rstrip()
        return f"{match.group(1)}{inner}\n{render_discovery_bar()}\n{match.group(3)}"
    return _HEADER_RE.sub(replace, html, count=1)
