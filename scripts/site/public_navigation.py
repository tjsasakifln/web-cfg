"""Deterministic public-artifact navigation canonicalization.

Source HTML for the six BOFU pillars remains frozen through 2026-09-16. The
public build canonicalizes every other top navigation from ``brand.json``
without a global runtime mutation, so protected routes keep their approved
HTML and JavaScript rendering.
"""

from __future__ import annotations

import json
import re
from html import escape, unescape
from pathlib import Path

from scripts.bofu_dominance.frozen_specs.constants import PILLARS


ROOT = Path(__file__).resolve().parents[2]
BRAND_PATH = ROOT / "data/site/brand.json"
FROZEN_NAV_HTML_PATHS = frozenset(item["html_rel"] for item in PILLARS)

_NAV_RE = re.compile(
    r'(<nav\b[^>]*\bclass="[^"]*\b(?:desktop-nav|mobile-nav)\b[^"]*"[^>]*>)'
    r'(.*?)'
    r'(</nav>)',
    flags=re.IGNORECASE | re.DOTALL,
)
_ANY_TOP_NAV_OPEN_RE = re.compile(
    r"<nav\b[^>]*\bclass\s*=\s*(['\"])[^'\"]*\b(?:desktop-nav|mobile-nav)\b"
    r"[^'\"]*\1[^>]*>",
    flags=re.IGNORECASE,
)
_ANCHOR_RE = re.compile(r"<a\b[^>]*>.*?</a>", flags=re.IGNORECASE | re.DOTALL)
_ATTRIBUTE_RE = re.compile(
    r"\b(?P<name>[a-z_:][-a-z0-9_:.]*)\s*=\s*(?P<quote>['\"])(?P<value>.*?)"
    r"(?P=quote)",
    flags=re.IGNORECASE | re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")


def _canonical_navigation_items() -> tuple[tuple[str, str], ...]:
    brand = json.loads(BRAND_PATH.read_text(encoding="utf-8"))
    raw_items = (brand.get("navigation") or {}).get("desktop") or []
    items = tuple(
        (str(item.get("label", "")), str(item.get("href", "")))
        for item in raw_items
    )
    if not items or any(
        not label or not href.startswith("/") for label, href in items
    ):
        raise ValueError(
            "data/site/brand.json has an invalid desktop navigation contract"
        )
    if len({href for _, href in items}) != len(items):
        raise ValueError(
            "data/site/brand.json has duplicate desktop navigation hrefs"
        )
    return items


CANONICAL_NAV_ITEMS = _canonical_navigation_items()


def _attribute(anchor: str, name: str) -> str:
    wanted = name.casefold()
    for match in _ATTRIBUTE_RE.finditer(anchor):
        if match.group("name").casefold() == wanted:
            return unescape(match.group("value"))
    return ""


def _anchor_text(anchor: str) -> str:
    return " ".join(unescape(_TAG_RE.sub(" ", anchor)).split())


def _is_button(anchor: str) -> bool:
    return "button" in _attribute(anchor, "class").split()


def _nav_kind(opening: str) -> str:
    classes = _attribute(opening, "class").casefold().split()
    if "desktop-nav" in classes:
        return "desktop"
    if "mobile-nav" in classes:
        return "mobile"
    raise ValueError("top navigation has no supported class")


def _current_hrefs(anchors: list[str], relative_path: str) -> set[str]:
    current = {
        _attribute(anchor, "href")
        for anchor in anchors
        if _attribute(anchor, "aria-current").casefold() == "page"
    }
    public_path = "/" if relative_path == "index.html" else f"/{relative_path}"
    if public_path.endswith("index.html"):
        public_path = public_path[: -len("index.html")]
    canonical_hrefs = {href for _, href in CANONICAL_NAV_ITEMS}
    if public_path in canonical_hrefs:
        current.add(public_path)
    return current & canonical_hrefs


def _canonical_anchor(
    label: str,
    href: str,
    *,
    current: bool,
    kind: str,
) -> str:
    aria = ' aria-current="page"' if current else ""
    position = "header_nav" if kind == "desktop" else "mobile_nav"
    return (
        f'<a data-cta-position="{position}"{aria} '
        f'href="{escape(href, quote=True)}">{escape(label)}</a>'
    )


def _canonicalize_nav_block(
    inner: str,
    *,
    opening: str,
    relative_path: str,
) -> str:
    anchors = [match.group(0) for match in _ANCHOR_RE.finditer(inner)]
    residual = _ANCHOR_RE.sub("", inner)
    if residual.strip():
        raise ValueError(
            f"{relative_path}: unsupported content inside top navigation"
        )
    if not anchors:
        raise ValueError(f"{relative_path}: top navigation has no anchors")

    kind = _nav_kind(opening)
    utility = [anchor for anchor in anchors if _is_button(anchor)]
    if utility and kind != "mobile":
        raise ValueError(
            f"{relative_path}: desktop navigation contains a button anchor"
        )
    if len(utility) > 1:
        raise ValueError(
            f"{relative_path}: mobile navigation has multiple utility buttons"
        )
    if utility:
        utility_href = _attribute(utility[0], "href")
        if (
            not (utility_href.startswith("#") or utility_href.startswith("/#"))
            or _attribute(utility[0], "aria-current")
        ):
            raise ValueError(
                f"{relative_path}: mobile utility must be a local, non-current CTA"
            )

    current = _current_hrefs(anchors, relative_path)
    rendered = [
        _canonical_anchor(label, href, current=href in current, kind=kind)
        for label, href in CANONICAL_NAV_ITEMS
    ]
    rendered.extend(utility)
    return "\n" + "\n".join(rendered) + "\n"


def _validate_canonical_block(inner: str, *, relative_path: str) -> None:
    anchors = [match.group(0) for match in _ANCHOR_RE.finditer(inner)]
    navigation = [anchor for anchor in anchors if not _is_button(anchor)]
    signature = tuple(
        (_anchor_text(anchor), _attribute(anchor, "href"))
        for anchor in navigation
    )
    if signature != CANONICAL_NAV_ITEMS:
        raise ValueError(
            f"{relative_path}: public navigation differs from brand contract; "
            f"expected={CANONICAL_NAV_ITEMS!r}, actual={signature!r}"
        )
    if sum(
        _attribute(anchor, "aria-current") == "page" for anchor in navigation
    ) > 1:
        raise ValueError(
            f"{relative_path}: multiple current pages in top navigation"
        )


def promote_public_navigation(html: str, *, relative_path: str) -> str:
    """Canonicalize each mutable top nav; leave frozen BOFU pages intact."""

    normalized_path = Path(relative_path).as_posix()
    while normalized_path.startswith("./"):
        normalized_path = normalized_path[2:]
    normalized_path = normalized_path.lstrip("/")
    if normalized_path in FROZEN_NAV_HTML_PATHS:
        return html

    blocks = list(_NAV_RE.finditer(html))
    nav_openings = list(_ANY_TOP_NAV_OPEN_RE.finditer(html))
    if len(nav_openings) != len(blocks):
        raise ValueError(
            f"{normalized_path}: unsupported top-navigation markup; "
            f"openings={len(nav_openings)}, parsed={len(blocks)}"
        )
    if not blocks:
        return html
    nav_kinds = [_nav_kind(block.group(1)) for block in blocks]
    if len(blocks) > 2 or len(set(nav_kinds)) != len(nav_kinds):
        raise ValueError(
            f"{normalized_path}: expected at most one desktop and one mobile "
            f"navigation; found {nav_kinds}"
        )

    pieces: list[str] = []
    cursor = 0
    for block in blocks:
        pieces.append(html[cursor : block.start()])
        pieces.append(block.group(1))
        pieces.append(
            _canonicalize_nav_block(
                block.group(2),
                opening=block.group(1),
                relative_path=normalized_path,
            )
        )
        pieces.append(block.group(3))
        cursor = block.end()
    pieces.append(html[cursor:])
    result = "".join(pieces)

    result_blocks = list(_NAV_RE.finditer(result))
    if len(result_blocks) != len(blocks):
        raise ValueError(f"{normalized_path}: navigation block count changed")
    for block in result_blocks:
        _validate_canonical_block(
            block.group(2), relative_path=normalized_path
        )
    return result


def promote_public_navigation_tree(site_root: Path) -> int:
    """Rewrite mutable public HTML in-place and return the number changed."""

    changed = 0
    for html_path in sorted(site_root.rglob("*.html")):
        relative_path = html_path.relative_to(site_root).as_posix()
        before = html_path.read_text(encoding="utf-8")
        after = promote_public_navigation(before, relative_path=relative_path)
        if after == before:
            continue
        html_path.write_text(after, encoding="utf-8")
        changed += 1
    return changed


def audit_public_navigation_tree(site_root: Path) -> dict[str, int]:
    """Fail if any mutable artifact top nav differs from ``brand.json``."""

    audited_files = 0
    audited_blocks = 0
    frozen_files = 0
    for html_path in sorted(site_root.rglob("*.html")):
        relative_path = html_path.relative_to(site_root).as_posix()
        html = html_path.read_text(encoding="utf-8")
        if relative_path in FROZEN_NAV_HTML_PATHS:
            frozen_files += 1
            continue
        blocks = list(_NAV_RE.finditer(html))
        if not blocks:
            continue
        if promote_public_navigation(html, relative_path=relative_path) != html:
            raise ValueError(
                f"{relative_path}: mutable artifact navigation is not canonical"
            )
        audited_files += 1
        audited_blocks += len(blocks)
    return {
        "audited_files": audited_files,
        "audited_blocks": audited_blocks,
        "frozen_files": frozen_files,
    }
