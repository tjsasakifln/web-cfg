#!/usr/bin/env python3
"""Single source of truth for the scope of every CONFENGE copy gate.

Why this module exists (issue #298): the copy gates used to carry hand-written
lists of 2, 4, 7, 8 or 34 fixed files. A hand-written allowlist of covered
routes ages: every public family published after the list was written fell
outside the gate by default, so a new family shipped with almost no copy
enforcement while CI stayed green.

The scope is therefore *derived* from the repository — every shipped visitor
HTML file — and narrowed only by a named, justified skip-list of trees that are
not visitor surfaces at all. A new public family is in scope the moment its
first `index.html` lands, with no list to edit.

Legitimate individual occurrences are handled by
`data/site/copy-exceptions.json`: one entry per (rule, match, exact path) with a
written reason. Exceptions never widen to a directory or a glob, so a new page
in an excepted family still fails closed.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
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
    "_site",  # build output; the sources are gated instead
    ".git",  # VCS internals
    ".worktrees",  # sibling checkouts
    ".claude",  # agent worktrees and local config
    ".github",  # workflow definitions
    ".pytest_cache",  # test cache
    "supabase",  # database project files
    "ops",  # authenticated internal operations console, not a visitor surface
}

# Non-HTML public text surfaces that ship visitor-readable copy.
EXTRA_TEXT_SURFACES = ("llms.txt",)

# Routes the publish step ships but that carry no visitor copy. One reason each.
MANIFEST_ROUTE_EXEMPT = {
    # Authenticated RevOps console: noindex,nofollow,noarchive, token-gated, and
    # its labels are operator chrome by design (see ops/index.html).
    "/ops/",
}


class _VisibleText(HTMLParser):
    """Text nodes only: script/style/template content is not visitor copy."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._hidden = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001
        if tag in {"script", "style", "template"}:
            self._hidden += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "template"} and self._hidden:
            self._hidden -= 1

    def handle_data(self, data: str) -> None:
        if not self._hidden:
            self.parts.append(data)


def visible_text(html: str) -> str:
    """Visitor-visible text of an HTML document, whitespace-collapsed."""
    parser = _VisibleText()
    parser.feed(html)
    return " ".join(" ".join(parser.parts).split())


def visible_markup(html: str) -> str:
    """Markup with script/style/comments removed (keeps tags and attributes)."""
    work = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    work = re.sub(r"<style[\s\S]*?</style>", " ", work, flags=re.I)
    return re.sub(r"<!--[\s\S]*?-->", " ", work)


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
