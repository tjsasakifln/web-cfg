"""Canonical sitemap graph: URL universe → children → index → robots → reports.

Loc-set assembly, exact-one, lastmod derivation and drift compare are pure
functions over strings/fixtures. File I/O is isolated so pytest can drive the
shipped functions on tmp trees without reimplementation.

Membership or cardinality drift among child urlsets, sitemap-index, robots
Sitemap line, sitemap.txt, hygiene JSON and inbound index_surface counts is a
build-gate failure, not a warning.
"""

from __future__ import annotations

import difflib
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator
from urllib.parse import urlparse
from xml.sax.saxutils import escape as xml_escape

SITE = "https://confenge.com.br"
SM_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
INDEX_NAME = "sitemap-index.xml"
TXT_NAME = "sitemap.txt"
ROBOTS_SITEMAP = f"{SITE}/sitemap-index.xml"

DEFAULT_MEMBERS = (
    "sitemap.xml",
    "sitemap-editorial.xml",
    "sitemap-jurisprudencia.xml",
    "sitemap-inteligencia.xml",
)

PUBLIC_HTML_SKIP_DIRS = frozenset(
    {
        ".git",
        ".claude",
        ".worktrees",
        ".netlify",
        ".cache",
        "_site",
        "data",
        "docs",
        "netlify",
        "node_modules",
        "scripts",
        "seo",
        "tests",
    }
)

FAMILY_FOR_MEMBER = {
    "sitemap.xml": "core",
    "sitemap-editorial.xml": "editorial",
    "sitemap-jurisprudencia.xml": "jurisprudencia",
    "sitemap-inteligencia.xml": "inteligencia",
    "sitemap-analises-contratos.xml": "contract_analysis",
}

_DATE_HEAD = re.compile(r"^(\d{4}-\d{2}-\d{2})")
_LOC_TAG = f"{{{SM_NS}}}loc"
_LASTMOD_TAG = f"{{{SM_NS}}}lastmod"
_URL_TAG = f"{{{SM_NS}}}url"
_SITEMAP_TAG = f"{{{SM_NS}}}sitemap"


@dataclass(frozen=True)
class UrlEntry:
    loc: str
    lastmod: str | None
    member: str


@dataclass(frozen=True)
class IndexMember:
    loc: str
    lastmod: str | None
    filename: str


@dataclass(frozen=True)
class GraphIssue:
    severity: str
    code: str
    url: str | None = None
    detail: Any = None

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"severity": self.severity, "code": self.code}
        if self.url is not None:
            out["url"] = self.url
        if self.detail is not None:
            out["detail"] = self.detail
        return out


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def loc_path(url: str) -> str:
    if url.startswith("http"):
        path = urlparse(url).path or "/"
    else:
        path = url
    if not path.startswith("/"):
        path = "/" + path
    return path


def loc_key(url: str) -> str:
    path = loc_path(url)
    if path != "/":
        path = path.rstrip("/")
    return path


def member_filename(index_loc: str) -> str:
    path = loc_path(index_loc)
    name = path.rsplit("/", 1)[-1]
    return name or INDEX_NAME


def family_for_member(filename: str) -> str:
    return FAMILY_FOR_MEMBER.get(filename, Path(filename).stem)


def parse_w3c_date(raw: str | None) -> date | None:
    text = str(raw or "").strip()
    if not text:
        return None
    match = _DATE_HEAD.match(text)
    if not match:
        return None
    try:
        return date.fromisoformat(match.group(1))
    except ValueError:
        return None


def normalize_lastmod(raw: str | None, *, as_of: date) -> str | None:
    """Return YYYY-MM-DD or None. Never future, never unparseable."""
    parsed = parse_w3c_date(raw)
    if parsed is None or parsed > as_of:
        return None
    return parsed.isoformat()


def substantial_lastmod_from_html(html: str, *, as_of: date) -> str | None:
    """Verifiable substantial-change date. Omit when no trustworthy source exists.

    Never uses the build clock. datePublished is not a change date.
    """
    if not html:
        return None
    found: list[str] = []
    for match in re.finditer(r'"dateModified"\s*:\s*"([^"]+)"', html):
        found.append(match.group(1))
    for prop in ("article:modified_time", "og:updated_time"):
        tagged = re.search(
            rf'(?:property|name)=["\']{re.escape(prop)}["\'][^>]*content=["\']([^"\']+)',
            html,
            re.I,
        ) or re.search(
            rf'content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']{re.escape(prop)}["\']',
            html,
            re.I,
        )
        if tagged:
            found.append(tagged.group(1))
    valid = [normalize_lastmod(item, as_of=as_of) for item in found]
    kept = [item for item in valid if item]
    return max(kept) if kept else None


def child_lastmod(member_lastmods: Iterable[str | None], *, as_of: date) -> str | None:
    """Max valid member lastmod, or omit when none are trustworthy."""
    valid = [normalize_lastmod(item, as_of=as_of) for item in member_lastmods]
    kept = [item for item in valid if item]
    return max(kept) if kept else None


def _iter_locs(element: ET.Element) -> Iterator[ET.Element]:
    for loc in element.findall(f".//{_LOC_TAG}"):
        yield loc
    if not any(True for _ in element.findall(f".//{_LOC_TAG}")):
        for loc in element.findall(".//loc"):
            yield loc


def _child_text(parent: ET.Element, namespaced: str, local: str) -> str | None:
    el = parent.find(namespaced)
    if el is None:
        el = parent.find(local)
    if el is None or not el.text:
        return None
    text = el.text.strip()
    return text or None


def parse_urlset_entries(xml_text: str) -> list[tuple[str, str | None]]:
    """Return (loc, lastmod-or-None) in document order. Pure over XML text."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    entries: list[tuple[str, str | None]] = []
    urls = list(root.findall(_URL_TAG)) or list(root.findall("url"))
    if not urls:
        urls = list(root.findall(f".//{_URL_TAG}")) or list(root.findall(".//url"))
    if urls:
        for url in urls:
            loc = _child_text(url, _LOC_TAG, "loc")
            if not loc:
                continue
            lastmod = _child_text(url, _LASTMOD_TAG, "lastmod")
            entries.append((loc, lastmod))
        return entries
    # loc-only documents (tests / index reused)
    for loc_el in _iter_locs(root):
        if loc_el.text and loc_el.text.strip():
            entries.append((loc_el.text.strip(), None))
    return entries


def parse_urlset_locs(xml_text: str) -> list[str]:
    return [loc for loc, _ in parse_urlset_entries(xml_text)]


def parse_sitemap_index(xml_text: str) -> list[IndexMember]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    members: list[IndexMember] = []
    nodes = list(root.findall(_SITEMAP_TAG)) or list(root.findall("sitemap"))
    if not nodes:
        nodes = list(root.findall(f".//{_SITEMAP_TAG}")) or list(root.findall(".//sitemap"))
    if not nodes:
        # loc-only index (fixture)
        for loc_el in _iter_locs(root):
            if loc_el.text and loc_el.text.strip():
                loc = loc_el.text.strip()
                members.append(
                    IndexMember(loc=loc, lastmod=None, filename=member_filename(loc))
                )
        return members
    for node in nodes:
        loc = _child_text(node, _LOC_TAG, "loc")
        if not loc:
            continue
        lastmod = _child_text(node, _LASTMOD_TAG, "lastmod")
        members.append(IndexMember(loc=loc, lastmod=lastmod, filename=member_filename(loc)))
    return members


def parse_sitemap_txt(text: str) -> list[str]:
    locs: list[str] = []
    for line in text.splitlines():
        item = line.strip()
        if not item or item.startswith("#"):
            continue
        locs.append(item)
    return locs


def robots_sitemap_hrefs(robots_text: str) -> list[str]:
    found: list[str] = []
    for line in robots_text.splitlines():
        match = re.match(r"(?im)^\s*Sitemap:\s*(\S+)", line)
        if match:
            found.append(match.group(1).strip())
    return found


def robots_disallow_prefixes(robots_text: str) -> list[str]:
    rules: list[str] = []
    for line in robots_text.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("disallow:"):
            value = stripped.split(":", 1)[1].strip()
            if value:
                rules.append(value)
    return rules


def path_robots_disallowed(path: str, prefixes: Iterable[str]) -> bool:
    if not path.startswith("/"):
        path = "/" + path
    for rule in prefixes:
        if rule == "/":
            return True
        if path.startswith(rule):
            return True
    return False


def path_blocked_by_robots(path: str, robots_text: str) -> bool:
    """True when the longest matching robots Allow/Disallow rule is Disallow.

    Google longest-match: a more specific Allow beats a shorter family Disallow.
    Equal-length Allow and Disallow resolve to Allow (less restrictive).
    """
    if not path.startswith("/"):
        path = "/" + path
    matches: list[tuple[int, bool]] = []
    for line in (robots_text or "").splitlines():
        stripped = line.strip()
        lower = stripped.lower()
        if lower.startswith("allow:") or lower.startswith("disallow:"):
            value = stripped.split(":", 1)[1].strip()
            if not value:
                continue
            if value == "/" or path.startswith(value):
                matches.append((len(value), lower.startswith("disallow:")))
    if not matches:
        return False
    longest = max(item[0] for item in matches)
    return all(is_disallow for length, is_disallow in matches if length == longest)


def x_robots_noindex(headers_text: str, path: str) -> bool:
    """True when Netlify `_headers` last-match X-Robots-Tag for this path is noindex.

    Overlapping path rules are resolved last-match, matching Netlify header merge.
    A later `index, follow` override for one URL must not inherit an earlier
    family `noindex`.
    """
    if not headers_text:
        return False
    if not path.startswith("/"):
        path = "/" + path
    current_pattern: str | None = None
    applies = False
    last_noindex: bool | None = None
    for raw in headers_text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith((" ", "\t")) and line.startswith("/"):
            current_pattern = line.strip()
            applies = _headers_path_matches(current_pattern, path)
            continue
        if applies and "x-robots-tag" in line.lower():
            last_noindex = "noindex" in line.lower()
    return bool(last_noindex)


def _headers_path_matches(pattern: str, path: str) -> bool:
    if pattern == "/*":
        return True
    if pattern.endswith("/*"):
        prefix = pattern[:-1]  # keep trailing slash semantics of "/foo/*" → "/foo/"
        return path.startswith(prefix.rstrip("*"))
    if pattern.endswith("*"):
        return path.startswith(pattern[:-1])
    return path == pattern or path.rstrip("/") == pattern.rstrip("/")


def meta_robots_noindex(html: str) -> bool:
    for match in re.finditer(r"<meta\b[^>]*>", html or "", re.I):
        tag = match.group(0)
        if not re.search(r'name=["\']robots["\']', tag, re.I):
            continue
        content = re.search(r'content=["\']([^"\']+)["\']', tag, re.I)
        if content and "noindex" in content.group(1).lower():
            return True
    return False


def extract_canonical(html: str) -> str | None:
    match = re.search(
        r'rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', html or "", re.I
    ) or re.search(
        r'href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']', html or "", re.I
    )
    if not match:
        return None
    return match.group(1).strip()


def redirect_source_paths(redirects_text: str) -> set[str]:
    """Netlify `_redirects` sources that would catch a sitemap loc."""
    from scripts.organic.sitemap_hygiene import parse_redirects

    sources: set[str] = set()
    for rule in parse_redirects(redirects_text or ""):
        fr = rule["from"]
        if fr.startswith("http"):
            fr = urlparse(fr).path or fr
        sources.add(fr.rstrip("/") or "/")
        sources.add(fr if fr.endswith("/") else fr + "/")
    return sources


def walk_index_children(
    index_xml: str,
    children: dict[str, str | None],
) -> tuple[list[UrlEntry], list[IndexMember], list[GraphIssue]]:
    """Walk sitemap-index and 100% of its members. Missing member is a gate fail.

    `children` maps filename → urlset XML (None if the file is inaccessible).
    """
    issues: list[GraphIssue] = []
    members = parse_sitemap_index(index_xml)
    if not members:
        issues.append(GraphIssue(severity="high", code="missing_sitemap_index_members"))
        return [], members, issues
    entries: list[UrlEntry] = []
    for member in members:
        xml_text = children.get(member.filename)
        if xml_text is None:
            issues.append(
                GraphIssue(
                    severity="high",
                    code="sitemap_member_inaccessible",
                    url=member.loc,
                    detail=member.filename,
                )
            )
            continue
        for loc, lastmod in parse_urlset_entries(xml_text):
            entries.append(UrlEntry(loc=loc, lastmod=lastmod, member=member.filename))
    issues.extend(exact_one_issues(entries))
    return entries, members, issues


def exact_one_issues(entries: Iterable[UrlEntry]) -> list[GraphIssue]:
    """Each graph loc occurs exactly once across children."""
    issues: list[GraphIssue] = []
    seen: dict[str, UrlEntry] = {}
    for entry in entries:
        key = loc_key(entry.loc)
        prior = seen.get(key)
        if prior is None:
            seen[key] = entry
            continue
        code = (
            "duplicate_across_members"
            if prior.member != entry.member
            else "duplicate_url"
        )
        issues.append(
            GraphIssue(
                severity="high",
                code=code,
                url=entry.loc,
                detail={"first_member": prior.member, "second_member": entry.member},
            )
        )
    return issues


def loc_set_drift(named: dict[str, Iterable[str]]) -> list[GraphIssue]:
    """Every named loc set must equal the canonical (key `canonical`)."""
    canonical = {loc_key(item) for item in named.get("canonical", [])}
    issues: list[GraphIssue] = []
    for name, items in named.items():
        if name == "canonical":
            continue
        other = {loc_key(item) for item in items}
        if other != canonical:
            issues.append(
                GraphIssue(
                    severity="high",
                    code="loc_set_drift",
                    detail={
                        "name": name,
                        "only_in_canonical": sorted(canonical - other),
                        "only_in_named": sorted(other - canonical),
                    },
                )
            )
    return issues


def validate_loc(
    loc: str,
    *,
    html: str | None,
    robots_text: str,
    redirect_from: set[str],
    headers_text: str = "",
    as_of: date | None = None,
) -> list[GraphIssue]:
    """Every graph loc: 2xx-equivalent, self-canonical, indexable, not a redirect."""
    del as_of  # lastmod is validated on the urlset, not the HTML fetch
    issues: list[GraphIssue] = []
    if not loc.startswith(SITE):
        issues.append(GraphIssue(severity="high", code="non_canonical_host", url=loc))
    path = loc_path(loc)
    if path_blocked_by_robots(path, robots_text):
        issues.append(
            GraphIssue(severity="high", code="sitemap_url_robots_disallowed", url=loc)
        )
    if x_robots_noindex(headers_text, path):
        issues.append(
            GraphIssue(severity="high", code="sitemap_url_x_robots_noindex", url=loc)
        )
    stripped = path.rstrip("/") or "/"
    if stripped in {p.rstrip("/") or "/" for p in redirect_from} or path in redirect_from:
        issues.append(
            GraphIssue(severity="high", code="sitemap_url_is_redirect_source", url=loc)
        )
    if html is None:
        issues.append(GraphIssue(severity="high", code="sitemap_url_missing_file", url=loc))
        return issues
    if meta_robots_noindex(html):
        issues.append(GraphIssue(severity="high", code="sitemap_url_noindex", url=loc))
    canonical = extract_canonical(html)
    if not canonical:
        issues.append(GraphIssue(severity="high", code="canonical_missing", url=loc))
    else:
        if not canonical.startswith(SITE):
            issues.append(
                GraphIssue(
                    severity="high",
                    code="canonical_external",
                    url=loc,
                    detail=canonical,
                )
            )
        elif loc_key(canonical) != loc_key(loc):
            issues.append(
                GraphIssue(
                    severity="high",
                    code="canonical_mismatch",
                    url=loc,
                    detail=canonical,
                )
            )
    return issues


def lastmod_issues(entries: Iterable[UrlEntry], *, as_of: date) -> list[GraphIssue]:
    issues: list[GraphIssue] = []
    for entry in entries:
        if not entry.lastmod:
            continue
        parsed = parse_w3c_date(entry.lastmod)
        if parsed is None:
            issues.append(
                GraphIssue(
                    severity="high",
                    code="lastmod_unparseable",
                    url=entry.loc,
                    detail=entry.lastmod,
                )
            )
        elif parsed > as_of:
            issues.append(
                GraphIssue(
                    severity="high",
                    code="lastmod_in_future",
                    url=entry.loc,
                    detail=entry.lastmod,
                )
            )
    return issues


def stale_market_answer_issues(
    entries: Iterable[UrlEntry],
    *,
    indexable: bool | None,
    canonical: str | None = None,
) -> list[GraphIssue]:
    """#151: expired/unapproved Market Answer URLs stay off the graph."""
    if indexable is None:
        return []
    needle = loc_key(canonical or market_answer_canonical())
    present = [entry for entry in entries if loc_key(entry.loc) == needle]
    if indexable:
        return []
    if present:
        return [
            GraphIssue(
                severity="high",
                code="stale_market_answer_in_graph",
                url=present[0].loc,
            )
        ]
    return []


def market_answer_canonical() -> str:
    try:
        from scripts.market_answers import CANONICAL

        return str(CANONICAL)
    except Exception:
        return f"{SITE}/inteligencia/valor-tipico-contratos-pavimentacao/"


def consumed_market_answer_indexable() -> bool | None:
    """Read the shipped Market Answer gate. None if the family cannot be loaded.

    Does not re-implement freshness. After #151 the gate grows a `now=` clock;
    this consumer passes it when present and otherwise uses the gate default.
    """
    try:
        import inspect

        from scripts.market_answers.consume import load_approvals, load_candidate, load_payload
        from scripts.market_answers.gate import evaluate

        kwargs: dict[str, Any] = {}
        if "now" in inspect.signature(evaluate).parameters:
            kwargs["now"] = datetime.now(timezone.utc)
        decision = evaluate(load_candidate(), load_payload(), load_approvals(), **kwargs)
        return bool(decision.indexable and decision.sitemap)
    except Exception:
        return None


def render_urlset(entries: Iterable[tuple[str, str | None]]) -> str:
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<urlset xmlns="{SM_NS}">',
    ]
    seen: set[str] = set()
    for loc, lastmod in entries:
        key = loc_key(loc)
        if key in seen:
            continue
        seen.add(key)
        parts.append(" <url>")
        parts.append(f" <loc>{xml_escape(loc)}</loc>")
        if lastmod:
            parts.append(f" <lastmod>{xml_escape(lastmod)}</lastmod>")
        parts.append(" </url>")
    parts.append("</urlset>")
    parts.append("")
    return "\n".join(parts)


def render_sitemap_index(members: Iterable[tuple[str, str | None]]) -> str:
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<sitemapindex xmlns="{SM_NS}">',
    ]
    for loc, lastmod in members:
        parts.append(" <sitemap>")
        parts.append(f" <loc>{xml_escape(loc)}</loc>")
        if lastmod:
            parts.append(f" <lastmod>{xml_escape(lastmod)}</lastmod>")
        parts.append(" </sitemap>")
    parts.append("</sitemapindex>")
    parts.append("")
    return "\n".join(parts)


def render_sitemap_txt(locs: Iterable[str]) -> str:
    unique = sorted({loc if loc.endswith("/") or loc_path(loc) == "/" else loc + "/" for loc in locs}, key=loc_key)
    return "\n".join(unique) + ("\n" if unique else "")


def robots_with_index_only(robots_text: str) -> str:
    lines_out: list[str] = []
    saw = False
    for line in (robots_text or "").splitlines():
        if line.strip().lower().startswith("sitemap:"):
            if not saw:
                lines_out.append(f"Sitemap: {ROBOTS_SITEMAP}")
                saw = True
            continue
        lines_out.append(line)
    if not saw:
        if lines_out and lines_out[-1].strip():
            lines_out.append("")
        lines_out.append(f"Sitemap: {ROBOTS_SITEMAP}")
    return "\n".join(lines_out).rstrip() + "\n"


def local_html_for_loc(root: Path, loc: str) -> Path | None:
    path = loc_path(loc)
    rel = path.strip("/")
    if not rel:
        candidate = root / "index.html"
        return candidate if candidate.is_file() else None
    indexed = root / rel / "index.html"
    if indexed.is_file():
        return indexed
    alt = root / rel
    if alt.is_file():
        return alt
    return None


def read_local_html(root: Path, loc: str) -> str | None:
    path = local_html_for_loc(root, loc)
    if path is None:
        return None
    return path.read_text(encoding="utf-8", errors="replace")


def load_index_members(root: Path) -> list[IndexMember]:
    index_path = root / INDEX_NAME
    if not index_path.is_file():
        return []
    return parse_sitemap_index(index_path.read_text(encoding="utf-8"))


def load_graph_locs(root: Path) -> list[str]:
    """Page locs unioned from every sitemap-index child. Walks the index, not a 4-file list."""
    index_path = root / INDEX_NAME
    if not index_path.is_file():
        return []
    members = parse_sitemap_index(index_path.read_text(encoding="utf-8"))
    locs: list[str] = []
    for member in members:
        child = root / member.filename
        if not child.is_file():
            continue
        locs.extend(parse_urlset_locs(child.read_text(encoding="utf-8")))
    return locs


def local_indexable_paths(root: Path, *, headers_text: str = "") -> set[str]:
    """Return live public HTML paths that search engines may index.

    Attribute order in ``<meta name=robots>`` is deliberately irrelevant.
    Repository/tooling trees and confirmation utilities are not public SEO
    targets. X-Robots-Tag family rules are applied with the same semantics as
    sitemap membership validation.
    """
    paths: set[str] = set()
    for page in root.rglob("*.html"):
        try:
            rel = page.relative_to(root)
        except ValueError:
            continue
        if any(part in PUBLIC_HTML_SKIP_DIRS for part in rel.parts):
            continue
        if page.name == "index.html":
            path = "/" if rel.parent == Path(".") else f"/{rel.parent.as_posix()}/"
        else:
            path = f"/{rel.as_posix()}"
        if path == "/404.html" or path.startswith("/obrigado"):
            continue
        html = page.read_text(encoding="utf-8", errors="replace")
        if meta_robots_noindex(html) or x_robots_noindex(headers_text, path):
            continue
        paths.add(path)
    return paths


def indexability_graph_issues(
    root: Path,
    entries: Iterable[UrlEntry],
    *,
    headers_text: str = "",
) -> list[GraphIssue]:
    """Enforce ``indexable => present_in_a_valid_sitemap`` fail-closed."""
    graph_paths = {loc_path(entry.loc) for entry in entries}
    indexable = local_indexable_paths(root, headers_text=headers_text)
    return [
        GraphIssue(severity="high", code="indexable_missing_from_sitemap", url=path)
        for path in sorted(indexable - graph_paths)
    ]


def audit_graph(
    root: Path,
    *,
    as_of: date | None = None,
    market_answer_indexable: bool | None = None,
) -> dict[str, Any]:
    """Shipped graph audit. Drift, inaccessible members and exact-one fail the gate."""
    as_of = as_of or utc_today()
    issues: list[GraphIssue] = []
    robots_path = root / "robots.txt"
    robots_text = robots_path.read_text(encoding="utf-8", errors="replace") if robots_path.is_file() else ""
    sm_dirs = robots_sitemap_hrefs(robots_text)
    if not sm_dirs:
        issues.append(GraphIssue(severity="high", code="robots_missing_sitemap"))
    elif not any(item.rstrip("/").endswith(INDEX_NAME) for item in sm_dirs):
        issues.append(
            GraphIssue(
                severity="medium",
                code="robots_not_pointing_sitemap_index",
                detail=sm_dirs,
            )
        )
    extra_sitemaps = [item for item in sm_dirs if not item.rstrip("/").endswith(INDEX_NAME)]
    if extra_sitemaps:
        issues.append(
            GraphIssue(
                severity="high",
                code="robots_lists_non_index_sitemap",
                detail=extra_sitemaps,
            )
        )

    index_path = root / INDEX_NAME
    if not index_path.is_file():
        issues.append(GraphIssue(severity="high", code="missing_sitemap_index"))
        return _report(issues, [], [], sm_dirs, market_answer_indexable=None, market_answer_in_graph=False)

    index_xml = index_path.read_text(encoding="utf-8")
    members = parse_sitemap_index(index_xml)
    children: dict[str, str | None] = {}
    for member in members:
        child = root / member.filename
        children[member.filename] = (
            child.read_text(encoding="utf-8") if child.is_file() else None
        )
    entries, members, walk_issues = walk_index_children(index_xml, children)
    issues.extend(walk_issues)
    member_counts: dict[str, int] = {member.filename: 0 for member in members}
    for entry in entries:
        member_counts[entry.member] = member_counts.get(entry.member, 0) + 1
    for filename, count in member_counts.items():
        if count == 0 and children.get(filename) is not None:
            issues.append(
                GraphIssue(severity="high", code="empty_sitemap_member", detail=filename)
            )
    issues.extend(lastmod_issues(entries, as_of=as_of))

    ma_flag = (
        market_answer_indexable
        if market_answer_indexable is not None
        else consumed_market_answer_indexable()
    )
    issues.extend(
        stale_market_answer_issues(
            entries, indexable=ma_flag, canonical=market_answer_canonical()
        )
    )

    redirects_path = root / "_redirects"
    redirect_from = redirect_source_paths(
        redirects_path.read_text(encoding="utf-8", errors="replace")
        if redirects_path.is_file()
        else ""
    )
    headers_path = root / "_headers"
    headers_text = (
        headers_path.read_text(encoding="utf-8", errors="replace") if headers_path.is_file() else ""
    )
    for entry in entries:
        html = read_local_html(root, entry.loc)
        issues.extend(
            validate_loc(
                entry.loc,
                html=html,
                robots_text=robots_text,
                redirect_from=redirect_from,
                headers_text=headers_text,
                as_of=as_of,
            )
        )
    issues.extend(indexability_graph_issues(root, entries, headers_text=headers_text))

    txt_path = root / TXT_NAME
    named: dict[str, Iterable[str]] = {
        "canonical": [entry.loc for entry in entries],
    }
    if txt_path.is_file():
        named["sitemap.txt"] = parse_sitemap_txt(txt_path.read_text(encoding="utf-8"))
    issues.extend(loc_set_drift(named))

    ma_key = loc_key(market_answer_canonical())
    ma_in_graph = any(loc_key(entry.loc) == ma_key for entry in entries)
    return _report(
        issues,
        entries,
        members,
        sm_dirs,
        market_answer_indexable=ma_flag,
        market_answer_in_graph=ma_in_graph,
    )


def _report(
    issues: list[GraphIssue],
    entries: list[UrlEntry],
    members: list[IndexMember],
    robots_sitemaps: list[str],
    *,
    market_answer_indexable: bool | None = None,
    market_answer_in_graph: bool | None = None,
) -> dict[str, Any]:
    high = [item for item in issues if item.severity == "high"]
    unique = {loc_key(entry.loc) for entry in entries}
    families: dict[str, int] = {}
    for entry in entries:
        fam = family_for_member(entry.member)
        families[fam] = families.get(fam, 0) + 1
    return {
        "ok": len(high) == 0,
        "issues": [item.as_dict() for item in issues],
        "url_count": len(entries),
        "unique_paths": len(unique),
        "locs": [entry.loc for entry in entries],
        "families": families,
        "member_sitemaps": [member.loc for member in members],
        "walked_members": [member.filename for member in members],
        "robots_sitemaps": robots_sitemaps,
        "market_answer_indexable": market_answer_indexable,
        "market_answer_in_graph": market_answer_in_graph,
    }


def ensure_index_member(root: Path, filename: str) -> None:
    """Add a child urlset to sitemap-index when it is not already listed."""
    loc = f"{SITE}/{filename.lstrip('/')}"
    index_path = root / INDEX_NAME
    members = load_index_members(root)
    if any(item.filename == filename for item in members):
        return
    rows = [(item.loc, item.lastmod) for item in members]
    rows.append((loc, None))
    index_path.write_text(render_sitemap_index(rows), encoding="utf-8")


def drop_index_member(root: Path, filename: str) -> None:
    """Remove a child urlset from sitemap-index (empty / withdrawn family)."""
    index_path = root / INDEX_NAME
    members = load_index_members(root)
    rows = [(item.loc, item.lastmod) for item in members if item.filename != filename]
    if len(rows) != len(members):
        index_path.write_text(render_sitemap_index(rows), encoding="utf-8")


def plan_graph(
    root: Path,
    *,
    as_of: date | None = None,
    market_answer_indexable: bool | None = None,
) -> dict[str, str]:
    """Compute the public sitemap graph without touching a single file.

    Returns ``{relative path: expected file content}``. This is the single source
    of truth for what the graph should be; :func:`close_graph` only writes what
    this function decides, and :func:`graph_drift` only compares against it. A
    caller that wants to verify the committed graph must never have to run the
    writer first, and must never need to put files back afterwards.
    """
    as_of = as_of or utc_today()
    ma_flag = (
        market_answer_indexable
        if market_answer_indexable is not None
        else consumed_market_answer_indexable()
    )
    ma_key = loc_key(market_answer_canonical())
    headers_path = root / "_headers"
    headers_text = (
        headers_path.read_text(encoding="utf-8", errors="replace")
        if headers_path.is_file()
        else ""
    )
    index_path = root / INDEX_NAME
    if index_path.is_file():
        members = parse_sitemap_index(index_path.read_text(encoding="utf-8"))
    else:
        members = [
            IndexMember(loc=f"{SITE}/{name}", lastmod=None, filename=name)
            for name in DEFAULT_MEMBERS
            if (root / name).is_file()
        ]

    planned: dict[str, str] = {}
    rewritten: list[tuple[str, str | None]] = []
    all_locs: list[str] = []
    for member in members:
        child_path = root / member.filename
        if not child_path.is_file():
            rewritten.append((member.loc, None))
            continue
        kept: list[tuple[str, str | None]] = []
        for loc, _old in parse_urlset_entries(child_path.read_text(encoding="utf-8")):
            if ma_flag is False and loc_key(loc) == ma_key:
                continue
            html = read_local_html(root, loc)
            if html is None:
                continue
            if meta_robots_noindex(html):
                continue
            if x_robots_noindex(headers_text, loc_path(loc)):
                continue
            lastmod = substantial_lastmod_from_html(html, as_of=as_of)
            kept.append((loc, lastmod))
        kept.sort(key=lambda item: loc_key(item[0]))
        planned[member.filename] = render_urlset(kept)
        all_locs.extend(loc for loc, _ in kept)
        # Empty family sitemaps must not remain referenced by the public index.
        if kept:
            rewritten.append(
                (member.loc, child_lastmod((lm for _, lm in kept), as_of=as_of))
            )

    planned[INDEX_NAME] = render_sitemap_index(rewritten)
    planned[TXT_NAME] = render_sitemap_txt(all_locs)
    robots_path = root / "robots.txt"
    if robots_path.is_file():
        planned["robots.txt"] = robots_with_index_only(
            robots_path.read_text(encoding="utf-8")
        )
    return planned


def graph_drift(
    root: Path,
    *,
    as_of: date | None = None,
    market_answer_indexable: bool | None = None,
) -> dict[str, str]:
    """Readable unified diff per committed graph file that the build would change.

    Compare-only. Nothing on disk is written, reverted or restored: a gate that
    silently repaired the tree would make its own green meaningless.
    """
    planned = plan_graph(
        root, as_of=as_of, market_answer_indexable=market_answer_indexable
    )
    drift: dict[str, str] = {}
    for name, expected in sorted(planned.items()):
        path = root / name
        committed = path.read_text(encoding="utf-8") if path.is_file() else ""
        if committed == expected:
            continue
        drift[name] = "".join(
            difflib.unified_diff(
                committed.splitlines(keepends=True),
                expected.splitlines(keepends=True),
                fromfile=f"committed/{name}",
                tofile=f"generated/{name}",
                n=2,
            )
        )
    return drift


def close_graph(
    root: Path,
    *,
    as_of: date | None = None,
    market_answer_indexable: bool | None = None,
) -> dict[str, Any]:
    """Write the planned graph, then audit it.

    Does not create pages or flip indexability. Removes the Market Answer loc when
    the consumed #151 gate says it is not INDEX. Drops noindex / X-Robots noindex
    members rather than leaving them in any child or sitemap.txt.
    """
    as_of = as_of or utc_today()
    ma_flag = (
        market_answer_indexable
        if market_answer_indexable is not None
        else consumed_market_answer_indexable()
    )
    for name, content in plan_graph(
        root, as_of=as_of, market_answer_indexable=ma_flag
    ).items():
        (root / name).write_text(content, encoding="utf-8")
    report = audit_graph(root, as_of=as_of, market_answer_indexable=ma_flag)
    hygiene_path = root / "data" / "organic" / "sitemap-hygiene.json"
    if hygiene_path.parent.is_dir() or (root / "data").is_dir():
        hygiene_path.parent.mkdir(parents=True, exist_ok=True)
        from scripts.organic.sitemap_hygiene import audit_sitemaps

        hygiene = audit_sitemaps(root)
        hygiene_path.write_text(
            json.dumps(hygiene, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return report
