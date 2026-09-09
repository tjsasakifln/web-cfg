#!/usr/bin/env python3
"""Single source of truth for the scope of every CONFENGE copy gate.

Why this module exists (issue #298): the copy gates used to carry hand-written
lists of 2, 4, 7, 8 or 34 fixed files. A hand-written allowlist of covered
routes ages: every public family published after the list was written fell
outside the gate by default, so a new family shipped with almost no copy
enforcement while CI stayed green.

The source scope is derived from the repository and the release scope is
derived independently from the assembled ``_site`` tree.  Comparing those two
views with the publish manifest is deliberate: a manifest produced by the same
source walk cannot prove that a later build transformation did not add, retain
or drop a route.

Legitimate individual occurrences are handled by
`data/site/copy-exceptions.json`: one entry per (rule, match, exact path) with a
written reason. Exceptions never widen to a directory or a glob, so a new page
in an excepted family still fails closed.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from html import escape
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

EXCEPTIONS_REL = "data/site/copy-exceptions.json"

# Trees that are not visitor surfaces. Each entry is a reason, not a convenience:
# no marketing/editorial page may ever live under one of these.
SKIP_PARTS = {
    "docs",  # internal documentation and evidence packets
    "scripts",  # build/test tooling, including HTML fixtures
    "tests",  # test fixtures
    "data",  # source data contracts, not shipped HTML
    "seo",  # generated audit reports and manifests
    "netlify",  # runtime function sources
    "node_modules",  # third-party packages
    # Internal/generated source trees deliberately excluded from the public
    # artifact. Artifact and served-body scans do not use this skip set, so a
    # packaging regression still fails closed.
    "piloto",
    "panorama-mercado-obras-publicas",
    "oportunidades",
    "_site",  # build output when walking source; use artifact_html_files() for it
    ".git",  # VCS internals
    ".worktrees",  # sibling checkouts
    ".claude",  # agent worktrees and local config
    ".github",  # workflow definitions
    ".pytest_cache",  # test cache
    ".benchmarks",  # pytest-benchmark cache
    ".netlify",  # local Netlify CLI state
    ".cache",  # tool caches
    ".playwright-mcp",  # local browser traces
    "supabase",  # database project files
    "ops",  # operator UI is non-commercial; artifact census applies exact controls
}

# Non-HTML public text surfaces that ship visitor-readable copy.
EXTRA_TEXT_SURFACES = ("llms.txt",)

# Exact public HTML routes whose copy is operational rather than commercial.
# Their shells remain in the artifact census and receive their own applicable
# checks.  The HTML is publicly retrievable; only the data APIs require a token.
# This is intentionally not a prefix exemption: a new /ops/ HTML route enters
# the normal scanner until it receives an exact, reasoned classification.
MANIFEST_ROUTE_EXEMPT = {
    # Public RevOps shell; data calls use the bearer token entered by an operator.
    "/ops/",
}


_NON_COPY_TAGS = {"script", "style", "template"}
_VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}
_DISPLAY_NONE = re.compile(
    r"(?:^|;)\s*display\s*:\s*none(?:\s*!important)?\s*(?:;|$)",
    re.I,
)
_PUBLIC_COPY_ATTRIBUTES = {"alt", "aria-label", "placeholder"}


class _PublicCopy(HTMLParser):
    """Collect copy only from HTML nodes that a visitor can perceive."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._hidden = 0
        self._stack: list[tuple[str, bool]] = []
        self.text_parts: list[str] = []
        self.markup_parts: list[str] = []

    @staticmethod
    def _starts_hidden(tag: str, attrs) -> bool:  # noqa: ANN001
        values = {str(name).lower(): value for name, value in attrs}
        style = str(values.get("style") or "")
        return (
            tag in _NON_COPY_TAGS
            or "hidden" in values
            or bool(_DISPLAY_NONE.search(style))
        )

    @staticmethod
    def _public_starttag(tag: str, attrs, *, closed: bool = False) -> str:  # noqa: ANN001
        """Serialize structure plus only attributes a visitor can read."""
        normalized = [(str(name).lower(), value) for name, value in attrs]
        if tag == "meta":
            values = dict(normalized)
            kind = str(values.get("name") or values.get("property") or "").lower()
            if kind != "description" and not kind.startswith("og:"):
                return ""
            allowed = {"name", "property", "content"}
        else:
            allowed = _PUBLIC_COPY_ATTRIBUTES
        rendered = "".join(
            f' {name}="{escape(str(value or ""), quote=True)}"'
            for name, value in normalized
            if name in allowed
        )
        suffix = " /" if closed else ""
        return f"<{tag}{rendered}{suffix}>"

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001
        tag = tag.lower()
        starts_hidden = self._starts_hidden(tag, attrs)
        if tag not in _VOID_TAGS:
            if starts_hidden:
                self._hidden += 1
            self._stack.append((tag, starts_hidden))
        if not self._hidden and not starts_hidden:
            self.markup_parts.append(self._public_starttag(tag, attrs))

    def handle_startendtag(self, tag: str, attrs) -> None:  # noqa: ANN001
        tag = tag.lower()
        if not self._hidden and not self._starts_hidden(tag, attrs):
            self.markup_parts.append(self._public_starttag(tag, attrs, closed=True))

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if not self._hidden:
            self.markup_parts.append(f"</{tag}>")
        if not self._stack:
            return
        _open_tag, started_hidden = self._stack.pop()
        if started_hidden:
            self._hidden -= 1

    def handle_data(self, data: str) -> None:
        if not self._hidden:
            self.text_parts.append(data)
            self.markup_parts.append(data)


class _SelectOptions(HTMLParser):
    """Collect `(value, label)` for every `<option>` in a document.

    Option labels reach the copy gates as ordinary text, but the *pairing*
    between the wire value and the label does not, and that pairing is where a
    control token hides best: `<option value="UNKNOWN">UNKNOWN</option>` reads
    as a legitimate epistemic label to any gate scanning words, and a single
    path-level copy exception granted for a different, legitimate occurrence of
    the same word silences it everywhere on the page.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.options: list[tuple[str, str]] = []
        self._value: str | None = None
        self._label: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001
        if tag.lower() != "option":
            return
        self._flush()
        self._value = str(dict((str(k).lower(), v) for k, v in attrs).get("value") or "")
        self._label = []

    def handle_data(self, data: str) -> None:
        if self._value is not None:
            self._label.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "option":
            self._flush()

    def _flush(self) -> None:
        if self._value is None:
            return
        self.options.append((self._value, " ".join("".join(self._label).split())))
        self._value = None
        self._label = []

    def close(self) -> None:  # noqa: D102
        super().close()
        self._flush()


def select_options(html: str) -> list[tuple[str, str]]:
    """Every `(value, label)` pair a `<select>` offers the visitor."""
    parser = _SelectOptions()
    parser.feed(html)
    parser.close()
    return parser.options


def visible_text(html: str) -> str:
    """Visitor-visible text of an HTML document, whitespace-collapsed."""
    parser = _PublicCopy()
    parser.feed(html)
    return " ".join(" ".join(parser.text_parts).split())


def visible_markup(html: str) -> str:
    """Markup and public-copy attributes from perceptible HTML nodes only."""
    parser = _PublicCopy()
    parser.feed(html)
    return "".join(parser.markup_parts)


def visitor_facing_html_files(root: Path | None = None) -> list[Path]:
    """Every shipped visitor HTML file. A new public family is in scope by default."""
    base = root or ROOT
    out: list[Path] = []
    for path in base.rglob("*.html"):
        rel_parts = path.relative_to(base).parts
        if any(part in SKIP_PARTS for part in rel_parts):
            continue
        out.append(path)
    return sorted(out)


def artifact_html_files(artifact_root: Path) -> list[Path]:
    """Every HTML file physically present in an assembled public artifact.

    This walk intentionally does not share ``SKIP_PARTS`` with the source
    detector.  ``_site`` is already the release allowlist boundary; silently
    skipping a newly introduced directory inside it would let the detector
    certify its own incomplete universe.  An exact route can be excluded from
    a particular copy gate later, with a reason, but it remains in this census.
    """
    base = Path(artifact_root)
    if not base.is_dir():
        return []
    return sorted(path for path in base.rglob("*.html") if path.is_file())


def artifact_html_routes(artifact_root: Path) -> list[str]:
    """Routes for every HTML response file in the assembled artifact."""
    base = Path(artifact_root)
    return [route_for(relpath(path, base)) for path in artifact_html_files(base)]


def artifact_index_routes(artifact_root: Path) -> list[str]:
    """Directory-style routes independently discovered from artifact files."""
    base = Path(artifact_root)
    return [
        route_for(relpath(path, base))
        for path in artifact_html_files(base)
        if path.name == "index.html"
    ]


def visitor_facing_relpaths(root: Path | None = None) -> list[str]:
    base = root or ROOT
    return [str(p.relative_to(base)) for p in visitor_facing_html_files(base)]


def relpath(path: Path, root: Path | None = None) -> str:
    return str(Path(path).relative_to(root or ROOT))


def route_for(rel: str) -> str:
    """Public route for a repository-relative HTML path."""
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def is_indexable_html(html: str) -> bool:
    """Crawlers treat a missing robots meta as indexable; noindex is fail-closed."""
    match = re.search(
        r'<meta\b[^>]*\bname=["\']robots["\'][^>]*>',
        html,
        re.I,
    )
    if not match:
        return True
    tag = match.group(0)
    content = re.search(r'\bcontent=["\']([^"\']*)["\']', tag, re.I)
    value = (content.group(1) if content else "").lower()
    return "noindex" not in value


def visitor_facing_routes(root: Path | None = None) -> list[str]:
    """Published visitor routes derived from shipped HTML, never a handwritten list."""
    base = root or ROOT
    return [route_for(relpath(p, base)) for p in visitor_facing_html_files(base)]


def indexable_visitor_html_files(root: Path | None = None) -> list[Path]:
    out: list[Path] = []
    for path in visitor_facing_html_files(root):
        html = path.read_text(encoding="utf-8", errors="replace")
        if is_indexable_html(html):
            out.append(path)
    return out


def published_gate_census(root: Path | None = None) -> dict[str, set[str]]:
    """One census for copy, SEO, accessibility and conversion.

    A new indexable family enters every applicable gate the moment its HTML
    lands. Coverage is derived from this set; family-registry `gate_coverage`
    is verified against it and cannot stay at `none` while the gate scans.
    """
    routes = set(visitor_facing_routes(root))
    return {
        "copy": set(routes),
        "seo": set(routes),
        "accessibility": set(routes),
        "conversion": set(routes),
    }


@lru_cache(maxsize=1)
def _exceptions_payload() -> dict:
    path = ROOT / EXCEPTIONS_REL
    if not path.is_file():
        return {"exceptions": []}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {"exceptions": []}
    payload.setdefault("exceptions", [])
    return payload


def load_exceptions() -> list[dict]:
    """Registered per-occurrence copy exceptions, each with a written reason."""
    rows = []
    for row in _exceptions_payload().get("exceptions") or []:
        if not isinstance(row, dict):
            continue
        if not row.get("rule") or not row.get("match") or not row.get("path"):
            continue
        if not str(row.get("reason") or "").strip():
            # An exception without a written reason is not an exception.
            continue
        rows.append(row)
    return rows


@lru_cache(maxsize=1)
def _exception_index() -> frozenset[tuple[str, str, str]]:
    return frozenset(
        (str(r["rule"]), str(r["match"]).casefold(), str(r["path"]))
        for r in load_exceptions()
    )


def is_excepted(rule: str, match: str, rel: str) -> bool:
    """True when this exact (rule, match, path) triple is registered with a reason."""
    return (rule, str(match).casefold(), rel) in _exception_index()


def manifest_html_routes(root: Path | None = None) -> list[str]:
    """Routes the publish step actually ships, from the public artifact manifest."""
    base = root or ROOT
    path = base / "seo" / "PUBLIC-ARTIFACT-MANIFEST.json"
    if not path.is_file():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [str(r) for r in (payload.get("html_routes") or [])]


def main() -> int:
    files = visitor_facing_html_files()
    print(f"visitor_facing_html={len(files)}")
    print(f"copy_exceptions={len(load_exceptions())}")
    routes = {route_for(relpath(p)) for p in files}
    missing = [
        r
        for r in manifest_html_routes()
        if r not in routes and r not in MANIFEST_ROUTE_EXEMPT
    ]
    print(f"manifest_routes_uncovered={len(missing)}")
    for r in missing[:20]:
        print("  ", r)
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
