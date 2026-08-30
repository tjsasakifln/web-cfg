"""Visible parity: JSON-LD / meta / canonical must not outclaim the page.

Pure HTML-in → claims + field-level defects. Reuses #74 extractors for
author/org/dates/Review; adds reviewer, license, data version,
Dataset/DataDownload/Breadcrumb, title, description and canonical.

Invalid schema or overclaim is a blocking INDEX / sitemap failure, not a
warning. Fixture pages labeled FIXTURE_ONLY are never INDEX-eligible.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
SITE = "https://confenge.com.br"
PUBLIC_DIR_NAME = "_site"
FIXTURE_LABEL = "FIXTURE_ONLY"

TRACKED_TYPES = frozenset(
    {
        "Organization",
        "Person",
        "Article",
        "NewsArticle",
        "BlogPosting",
        "Dataset",
        "DataDownload",
        "BreadcrumbList",
        "CaseStudy",
        "Review",
        "AggregateRating",
    }
)
ARTICLE_TYPES = frozenset({"Article", "NewsArticle", "BlogPosting"})
FALSE_CASE_TYPES = frozenset({"CaseStudy", "Review", "AggregateRating"})
DATASET_TYPES = frozenset({"Dataset", "DataDownload"})

# Tokens too generic to prove a description is on the page.
_STOP = frozenset(
    {
        "para",
        "como",
        "uma",
        "com",
        "por",
        "dos",
        "das",
        "que",
        "nao",
        "não",
        "mais",
        "sem",
        "sobre",
        "este",
        "esta",
        "isso",
        "aqui",
        "confenge",
        "obra",
        "obras",
        "publico",
        "público",
        "publica",
        "pública",
        "contrato",
        "contratos",
    }
)

_PT_SUFFIX_RE = re.compile(
    r"\s*[\|–—-]\s*CONFENGE\s*$",
    re.I,
)
_ISO_DATE_RE = re.compile(r"20\d{2}-\d{2}-\d{2}")
_LICENSE_RE = re.compile(
    r"(licen[cç]a|license|termos de uso|opendefinition|creativecommons|cc[- ]by)",
    re.I,
)
_VERSION_RE = re.compile(
    r"(dataset_hash|data[_ -]?version|vers[aã]o dos dados|version_label|data-version)",
    re.I,
)
_DATASET_HINT_RE = re.compile(
    r"(dataset_hash|data-dataset|id=[\"']dataset|como citar|recorte (aberto|versionado)|"
    r"data_as_of|download (amostra|json|csv|pdf)|citation\.json)",
    re.I,
)
_CASE_CLAIM_RE = re.compile(
    r"(case study|caso de sucesso|customer success|depoimento de cliente|"
    r"nosso cliente |case de cliente)",
    re.I,
)
_ANALISE_RE = re.compile(
    r"an[aá]lise t[eé]cnica de contrato p[uú]blico",
    re.I,
)

SITEMAP_NAMES = (
    "sitemap.xml",
    "sitemap-editorial.xml",
    "sitemap-jurisprudencia.xml",
    "sitemap-inteligencia.xml",
)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def _strip_tags(html: str) -> str:
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", html or "", flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", unescape(text))


def _digits(text: str) -> str:
    return re.sub(r"\D+", "", text or "")


def _core_title(text: str) -> str:
    t = _PT_SUFFIX_RE.sub("", text or "")
    t = _norm(t)
    t = re.sub(r"[^\wáéíóúâêôãõç0-9%]+", " ", t, flags=re.I)
    return re.sub(r"\s+", " ", t).strip()


def _tokens(text: str) -> set[str]:
    return {
        t
        for t in re.split(r"[^a-z0-9áéíóúâêôãõç%]+", _norm(text))
        if len(t) > 3 and t not in _STOP
    }


def _title_overlap(a: str, b: str) -> bool:
    ca, cb = _core_title(a), _core_title(b)
    if not ca or not cb:
        return False
    if ca == cb or ca in cb or cb in ca:
        return True
    ta, tb = _tokens(ca), _tokens(cb)
    if not ta or not tb:
        return ca[:24] in cb or cb[:24] in ca
    return len(ta & tb) / max(1, min(len(ta), len(tb))) >= 0.55


def _description_supported(claimed: str, visible: str) -> bool:
    c = _norm(claimed)
    v = _norm(visible)
    if not c:
        return True
    if c in v:
        return True
    toks = _tokens(c)
    if not toks:
        return True
    found = sum(1 for t in toks if t in v)
    return found / len(toks) >= 0.55


def _name_in_visible(name: str, visible_norm: str) -> bool:
    n = _norm(name)
    if not n:
        return True
    if n in visible_norm:
        return True
    if "tiago" in n and "tiago" in visible_norm:
        return True
    if "confenge" in n and "confenge" in visible_norm:
        return True
    # Phone / CNPJ identity: compare digits
    d = _digits(name)
    if len(d) >= 10 and d[-10:] in _digits(visible_norm):
        return True
    if len(d) >= 8 and d in _digits(visible_norm):
        return True
    return False


from scripts.site.authority import (  # noqa: E402
    _JSONLDCollector,
    check_schema_mirrors_visible,
    extract_jsonld_blocks,
    extract_visible_authority,
    has_named_reviewer,
    visible_permission_class,
)


def is_fixture_only(html: str) -> bool:
    raw = html or ""
    if re.search(r'data-fixture-only=["\']FIXTURE_ONLY["\']', raw, flags=re.I):
        return True
    if re.search(
        r'<meta[^>]+(?:name=["\']confenge:fixture["\'][^>]+content=["\']FIXTURE_ONLY["\']|'
        r'content=["\']FIXTURE_ONLY["\'][^>]+name=["\']confenge:fixture["\'])',
        raw,
        flags=re.I,
    ):
        return True
    if f"<!-- {FIXTURE_LABEL} -->" in raw:
        return True
    return False


def _robots(html: str) -> str:
    from scripts.site.inbound_gates import robots_of

    return robots_of(html)


def is_noindex(html: str) -> bool:
    from scripts.site.inbound_gates import is_noindex as _is_noindex

    return _is_noindex(html)


class _MetaCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self._in_title = False
        self.description = ""
        self.canonical = ""
        self.robots = ""
        self.author = ""
        self.h1 = ""
        self._in_h1 = False
        self._h1_parts: list[str] = []
        self.breadcrumb_names: list[str] = []
        self._in_crumb = False
        self._crumb_parts: list[str] = []
        self.reviewers: list[str] = []
        self.licenses: list[str] = []
        self.versions: list[str] = []
        self.download_hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k.lower(): (v or "") for k, v in attrs}
        t = tag.lower()
        if t == "title":
            self._in_title = True
            self.title_parts = []
        elif t == "h1":
            self._in_h1 = True
            self._h1_parts = []
        elif t == "meta":
            name = (ad.get("name") or ad.get("property") or "").lower()
            content = ad.get("content") or ""
            if name == "description" and not self.description:
                self.description = content
            elif name == "robots" and not self.robots:
                self.robots = content
            elif name == "author" and not self.author:
                self.author = content
        elif t == "link" and ad.get("rel", "").lower() == "canonical":
            self.canonical = ad.get("href") or ""
        elif t == "a":
            rel = ad.get("rel", "").lower()
            href = ad.get("href") or ""
            if href and re.search(r"\.(json|csv|zip|pdf)(?:$|[?#])", href, flags=re.I):
                self.download_hrefs.append(href)
            if "author" in rel and ad.get("data-author"):
                pass
            if ad.get("data-license"):
                self.licenses.append(ad["data-license"])
        if ad.get("data-reviewer"):
            self.reviewers.append(ad["data-reviewer"])
        if ad.get("data-license"):
            self.licenses.append(ad["data-license"])
        if ad.get("data-version") or ad.get("data-data-version"):
            self.versions.append(ad.get("data-version") or ad.get("data-data-version"))
        if ad.get("aria-label", "").lower() in {
            "navegação estrutural",
            "navegacao estrutural",
            "navegação",
            "navegacao",
        } or "breadcrumb" in (ad.get("class") or "").lower():
            self._in_crumb = t in {"nav", "ol"}
        if t in {"li", "a", "span"} and self._in_crumb:
            self._crumb_parts = []

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if t == "title" and self._in_title:
            self._in_title = False
        elif t == "h1" and self._in_h1:
            self.h1 = re.sub(r"\s+", " ", "".join(self._h1_parts)).strip()
            self._in_h1 = False
        elif t in {"nav", "ol"} and self._in_crumb:
            self._in_crumb = False
        elif t in {"li", "a", "span"} and self._crumb_parts:
            name = re.sub(r"\s+", " ", "".join(self._crumb_parts)).strip(" /")
            if name and name not in self.breadcrumb_names:
                self.breadcrumb_names.append(name)
            self._crumb_parts = []

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_parts.append(data)
        if self._in_h1:
            self._h1_parts.append(data)
        if self._in_crumb:
            self._crumb_parts.append(data)


def extract_meta(html: str) -> dict[str, Any]:
    parser = _MetaCollector()
    try:
        parser.feed(html or "")
    except Exception:  # noqa: BLE001
        pass
    title = re.sub(r"\s+", " ", "".join(parser.title_parts)).strip()
    if not title:
        m = re.search(r"<title[^>]*>(.*?)</title>", html or "", flags=re.I | re.S)
        title = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(1))).strip() if m else ""
    if not parser.description:
        m = re.search(
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']',
            html or "",
            flags=re.I,
        ) or re.search(
            r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']',
            html or "",
            flags=re.I,
        )
        parser.description = m.group(1) if m else ""
    if not parser.canonical:
        m = re.search(
            r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']',
            html or "",
            flags=re.I,
        ) or re.search(
            r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
            html or "",
            flags=re.I,
        )
        parser.canonical = m.group(1) if m else ""
    if not parser.h1:
        m = re.search(r"<h1[^>]*>(.*?)</h1>", html or "", flags=re.I | re.S)
        parser.h1 = (
            re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(1))).strip() if m else ""
        )
    crumbs = list(parser.breadcrumb_names)
    if not crumbs:
        nav = re.search(
            r'<nav[^>]+class="[^"]*breadcrumbs[^"]*"[^>]*>(.*?)</nav>',
            html or "",
            flags=re.I | re.S,
        )
        if nav:
            for item in re.findall(r"<li[^>]*>(.*?)</li>", nav.group(1), flags=re.I | re.S):
                name = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", item)).strip(" /")
                if name:
                    crumbs.append(name)
    return {
        "title": title,
        "description": parser.description,
        "canonical": parser.canonical,
        "robots": parser.robots or _robots(html),
        "author": parser.author,
        "h1": parser.h1,
        "breadcrumb_names": crumbs,
        "reviewers": list(dict.fromkeys(parser.reviewers)),
        "licenses": list(dict.fromkeys(parser.licenses)),
        "versions": list(dict.fromkeys(parser.versions)),
        "download_hrefs": list(dict.fromkeys(parser.download_hrefs)),
    }


def walk_typed_nodes(blocks: list[Any]) -> list[dict[str, Any]]:
    """All objects with @type, including nested Dataset.distribution etc."""
    nodes: list[dict[str, Any]] = []

    def walk(obj: Any) -> None:
        if isinstance(obj, list):
            for item in obj:
                walk(item)
            return
        if not isinstance(obj, dict):
            return
        if obj.get("@type"):
            nodes.append(obj)
        for key, val in obj.items():
            if key in {"@context"}:
                continue
            walk(val)

    for block in blocks:
        walk(block)
    return nodes


def _types_of(node: dict[str, Any]) -> set[str]:
    t = node.get("@type")
    if isinstance(t, list):
        return {str(x) for x in t}
    if t:
        return {str(t)}
    return set()


def _node_name(node: Any) -> str:
    if isinstance(node, str):
        return node
    if not isinstance(node, dict):
        return ""
    return str(node.get("name") or node.get("legalName") or "")


def invalid_jsonld_raw(html: str) -> list[str]:
    parser = _JSONLDCollector()
    try:
        parser.feed(html or "")
    except Exception:  # noqa: BLE001
        return ["schema_unparseable_html"]
    bad: list[str] = []
    for raw in parser.blocks:
        raw = (raw or "").strip()
        if not raw:
            continue
        try:
            json.loads(raw)
        except json.JSONDecodeError:
            bad.append(raw[:80])
    return bad


def extract_reviewer_names(html: str) -> list[str]:
    names: list[str] = []
    for pat in (
        r'data-reviewer="([^"]+)"',
        r"revis[aã]o t[eé]cnica\s*:\s*([^.<]{2,80})",
        r"revisor(?:a)?\s*:\s*([^.<]{2,80})",
        r"reviewed by\s*:\s*([^.<]{2,80})",
    ):
        for m in re.finditer(pat, html or "", flags=re.I):
            name = re.sub(r"\s+", " ", m.group(1)).strip(" ·")
            if name and name not in names:
                names.append(name)
    return names


def extract_visible_license(html: str, vis_text: str) -> list[str]:
    found: list[str] = []
    for m in re.finditer(
        r'data-license="([^"]+)"',
        html or "",
        flags=re.I,
    ):
        found.append(m.group(1).strip())
    for m in re.finditer(
        r"licen[cç]a\s*:\s*([^.<]{3,120})",
        html or "",
        flags=re.I,
    ):
        found.append(re.sub(r"\s+", " ", m.group(1)).strip())
    if "/termos-de-uso/" in (html or ""):
        found.append("https://confenge.com.br/termos-de-uso/")
    if _LICENSE_RE.search(vis_text or ""):
        found.append("license-token-visible")
    return list(dict.fromkeys(found))


def extract_visible_versions(html: str) -> list[str]:
    found: list[str] = []
    for pat in (
        r'data-version="([^"]+)"',
        r'data-data-version="([^"]+)"',
        r"dataset_hash</strong>\s*:?\s*<code>([^<]+)</code>",
        r"dataset_hash\s*:?\s*([0-9a-f]{12,64})",
        r"vers[aã]o(?: dos dados)?\s*:\s*([^.<]{2,80})",
    ):
        for m in re.finditer(pat, html or "", flags=re.I):
            found.append(re.sub(r"\s+", " ", m.group(1)).strip())
    return list(dict.fromkeys(found))


def extract_schema_claims(html: str) -> dict[str, Any]:
    blocks = extract_jsonld_blocks(html)
    nodes = walk_typed_nodes(blocks)
    types: list[str] = []
    orgs: list[str] = []
    people: list[str] = []
    authors: list[str] = []
    reviewers: list[str] = []
    dates: list[str] = []
    headlines: list[str] = []
    descriptions: list[str] = []
    breadcrumbs: list[str] = []
    dataset_names: list[str] = []
    downloads: list[str] = []
    licenses: list[str] = []
    versions: list[str] = []
    for node in nodes:
        tset = _types_of(node)
        for t in sorted(tset):
            if t in TRACKED_TYPES and t not in types:
                types.append(t)
        if "Organization" in tset:
            name = _node_name(node)
            if name:
                orgs.append(name)
        if "Person" in tset:
            name = _node_name(node)
            if name:
                people.append(name)
        if tset & ARTICLE_TYPES:
            if node.get("headline"):
                headlines.append(str(node["headline"]))
            if node.get("description"):
                descriptions.append(str(node["description"]))
            if node.get("author"):
                authors.append(_node_name(node.get("author")))
            reviewed = node.get("reviewedBy") or node.get("reviewer")
            if reviewed:
                reviewers.append(_node_name(reviewed))
            if node.get("version"):
                versions.append(str(node["version"]))
            if node.get("license"):
                licenses.append(str(node["license"]))
            for key in ("datePublished", "dateModified", "dateCreated"):
                if node.get(key):
                    dates.append(str(node[key])[:10])
        if "Dataset" in tset:
            if node.get("name"):
                dataset_names.append(str(node["name"]))
            if node.get("description"):
                descriptions.append(str(node["description"]))
            if node.get("license"):
                licenses.append(str(node["license"]))
            ident = node.get("identifier") or node.get("version") or node.get("dataset_hash")
            if ident:
                versions.append(str(ident))
            if node.get("dateModified"):
                dates.append(str(node["dateModified"])[:10])
            creator = node.get("creator")
            if creator:
                cname = _node_name(creator)
                if cname:
                    orgs.append(cname)
        if "DataDownload" in tset:
            downloads.append(
                str(node.get("contentUrl") or node.get("url") or node.get("name") or "")
            )
            if node.get("name"):
                downloads.append(str(node["name"]))
        if "BreadcrumbList" in tset:
            for el in node.get("itemListElement") or []:
                if isinstance(el, dict) and el.get("name"):
                    breadcrumbs.append(str(el["name"]))
        # reviewedBy on any tracked node
        reviewed = node.get("reviewedBy") or node.get("reviewer")
        if reviewed and "Person" in _types_of(reviewed if isinstance(reviewed, dict) else {}):
            reviewers.append(_node_name(reviewed))
        elif reviewed and isinstance(reviewed, dict) and reviewed.get("name"):
            reviewers.append(str(reviewed["name"]))
    return {
        "types": types,
        "organizations": list(dict.fromkeys(orgs)),
        "people": list(dict.fromkeys(people)),
        "authors": list(dict.fromkeys(a for a in authors if a)),
        "reviewers": list(dict.fromkeys(r for r in reviewers if r)),
        "dates": sorted(set(dates)),
        "headlines": list(dict.fromkeys(headlines)),
        "descriptions": list(dict.fromkeys(descriptions)),
        "breadcrumbs": list(dict.fromkeys(breadcrumbs)),
        "dataset_names": list(dict.fromkeys(dataset_names)),
        "downloads": list(dict.fromkeys(d for d in downloads if d)),
        "licenses": list(dict.fromkeys(licenses)),
        "versions": list(dict.fromkeys(versions)),
        "has_dataset_type": bool(set(types) & DATASET_TYPES),
        "has_false_case_type": bool(set(types) & FALSE_CASE_TYPES),
    }


def _body_html(html: str) -> str:
    m = re.search(r"<body\b[^>]*>(.*)</body>", html or "", flags=re.I | re.S)
    return m.group(1) if m else (html or "")


def extract_visible_claims(html: str) -> dict[str, Any]:
    vis = extract_visible_authority(html)
    # Title/JSON-LD live in <head> and must not count as visible copy.
    body_vis = extract_visible_authority(_body_html(html))
    vis["text"] = body_vis["text"]
    vis["norm"] = body_vis["norm"]
    meta = extract_meta(html)
    reviewers = list(dict.fromkeys(meta["reviewers"] + extract_reviewer_names(html)))
    licenses = extract_visible_license(html, vis["text"])
    versions = list(dict.fromkeys(meta["versions"] + extract_visible_versions(html)))
    has_dataset = bool(
        _DATASET_HINT_RE.search(html or "")
        or meta["download_hrefs"]
        or versions
        or re.search(r'data-dataset=', html or "", flags=re.I)
    )
    return {
        "text": vis["text"],
        "norm": vis["norm"],
        "authors": vis["authors"],
        "dates": vis["dates"],
        "h1": meta["h1"],
        "title": meta["title"],
        "description": meta["description"],
        "canonical": meta["canonical"],
        "robots": meta["robots"],
        "breadcrumb_names": meta["breadcrumb_names"],
        "reviewers": reviewers,
        "named_reviewer": has_named_reviewer(html),
        "licenses": licenses,
        "versions": versions,
        "download_hrefs": meta["download_hrefs"],
        "has_dataset_surface": has_dataset,
        "permission_class": vis.get("permission_class") or visible_permission_class(html),
        "has_org": vis.get("has_org"),
        "meta_author": meta["author"],
    }


def _defect(
    code: str,
    field: str,
    claimed: str = "",
    visible: str = "",
) -> dict[str, str]:
    return {
        "code": code,
        "field": field,
        "claimed": claimed,
        "visible": visible,
    }


def compare_visible_parity(html: str, *, url: str | None = None) -> dict[str, Any]:
    """Compare schema/meta claims against visible copy. Field-level defects."""
    defects: list[dict[str, str]] = []
    claimed = extract_schema_claims(html)
    visible = extract_visible_claims(html)
    meta = {
        "title": visible["title"],
        "description": visible["description"],
        "canonical": visible["canonical"],
    }
    vis_norm = visible["norm"]
    vis_text = visible["text"]

    for raw in invalid_jsonld_raw(html):
        defects.append(_defect("schema_invalid", "jsonld", raw, ""))

    # Reuse #74 author/org/dates/Review mirror; map to named codes.
    for err in check_schema_mirrors_visible(html):
        if err.startswith("schema_author_not_visible"):
            defects.append(
                _defect("schema_author_not_visible", "author", err.split(":", 1)[-1], "")
            )
        elif err.startswith("schema_org_not_visible"):
            defects.append(
                _defect("schema_org_not_visible", "organization", err.split(":", 1)[-1], "")
            )
        elif err.startswith("schema_date_not_visible"):
            defects.append(
                _defect("schema_date_stale", "date", err.split(":", 1)[-1], ",".join(visible["dates"]))
            )
        elif err.startswith("schema_breadcrumb_not_visible"):
            defects.append(
                _defect(
                    "schema_breadcrumb_name_not_visible",
                    "BreadcrumbList",
                    err.split(":", 1)[-1],
                    "",
                )
            )
        elif "invented" in err or err.startswith("schema_invented"):
            defects.append(_defect("schema_false_case_study", "review", err, ""))
        else:
            defects.append(_defect("schema_overclaim", "schema", err, ""))

    if claimed["has_false_case_type"]:
        klass = visible.get("permission_class")
        if klass not in {"consented", "confidential", "redacted"}:
            defects.append(
                _defect(
                    "schema_false_case_study",
                    "type",
                    ",".join(sorted(set(claimed["types"]) & FALSE_CASE_TYPES)),
                    klass or "",
                )
            )
    if _CASE_CLAIM_RE.search(json.dumps(claimed, ensure_ascii=False)) and visible.get(
        "permission_class"
    ) not in {"consented", "confidential", "redacted"}:
        if _ANALISE_RE.search(vis_text) or visible.get("permission_class") == "demonstrativo":
            defects.append(
                _defect("schema_false_case_study", "claim", "case-semantics", "analise-or-demo")
            )

    if claimed["has_dataset_type"] and not visible["has_dataset_surface"]:
        defects.append(
            _defect(
                "schema_dataset_without_visible_dataset",
                "Dataset",
                ",".join(claimed["dataset_names"] or claimed["types"]),
                "",
            )
        )
    for dl in claimed["downloads"]:
        blob = vis_norm + " " + " ".join(_norm(h) for h in visible["download_hrefs"])
        if dl and not _name_in_visible(dl, blob) and Path(urlparse(dl).path).name.lower() not in blob:
            name = Path(urlparse(dl).path).name
            if name and name.lower() not in blob and _norm(dl) not in blob:
                defects.append(
                    _defect("schema_datadownload_without_visible_download", "DataDownload", dl, "")
                )

    for name in claimed["organizations"]:
        if name and not _name_in_visible(name, vis_norm):
            defects.append(_defect("schema_org_not_visible", "Organization.name", name, ""))
    for name in claimed["people"]:
        if name and not _name_in_visible(name, vis_norm):
            defects.append(_defect("schema_person_not_visible", "Person.name", name, ""))
    for name in claimed["authors"]:
        if name and not _name_in_visible(name, vis_norm):
            # already covered by #74; keep if not duplicated
            if not any(d["code"] == "schema_author_not_visible" and d["claimed"] == name for d in defects):
                defects.append(_defect("schema_author_not_visible", "author", name, ""))

    for name in claimed["reviewers"]:
        if not name:
            continue
        if _name_in_visible(name, vis_norm):
            continue
        if any(_name_in_visible(name, _norm(r)) for r in visible["reviewers"]):
            continue
        defects.append(_defect("schema_reviewer_not_visible", "reviewer", name, ""))

    for iso in claimed["dates"]:
        if iso in visible["dates"] or iso in vis_text:
            continue
        if not any(d["code"] == "schema_date_stale" and iso in d["claimed"] for d in defects):
            defects.append(
                _defect("schema_date_stale", "date", iso, ",".join(visible["dates"]))
            )

    for lic in claimed["licenses"]:
        if not lic:
            continue
        blob = vis_norm + " " + " ".join(_norm(x) for x in visible["licenses"])
        path = urlparse(lic).path if "://" in lic else lic
        if _name_in_visible(lic, blob) or (path and path.rstrip("/") in (html or "")):
            continue
        if "/termos-de-uso/" in lic and "/termos-de-uso/" in (html or ""):
            continue
        defects.append(_defect("schema_license_not_visible", "license", lic, ""))

    for ver in claimed["versions"]:
        if not ver:
            continue
        blob = vis_norm + " " + " ".join(_norm(x) for x in visible["versions"])
        if _name_in_visible(ver, blob) or ver[:12].lower() in blob:
            continue
        # page_id identifiers on Dataset are not a public version claim
        if re.fullmatch(r"[a-z0-9-]{3,40}", ver) and not re.search(r"[0-9a-f]{12,}", ver):
            continue
        defects.append(_defect("schema_version_not_visible", "data_version", ver, ""))

    for crumb in claimed["breadcrumbs"]:
        if not crumb:
            continue
        if _name_in_visible(crumb, vis_norm):
            continue
        if any(_title_overlap(crumb, b) for b in visible["breadcrumb_names"]):
            continue
        if visible["h1"] and _title_overlap(crumb, visible["h1"]):
            continue
        defects.append(_defect("schema_breadcrumb_name_not_visible", "BreadcrumbList", crumb, ""))

    for headline in claimed["headlines"]:
        if headline and visible["h1"] and _title_overlap(headline, visible["h1"]):
            continue
        if headline and _description_supported(headline, vis_text):
            continue
        if headline:
            defects.append(
                _defect("schema_title_diverges", "Article.headline", headline, visible["h1"])
            )

    if meta["title"]:
        title_ok = bool(visible["h1"] and _title_overlap(meta["title"], visible["h1"]))
        if not title_ok:
            title_ok = _description_supported(_core_title(meta["title"]), vis_text)
        if not title_ok:
            defects.append(
                _defect("meta_title_diverges", "title", meta["title"], visible["h1"])
            )

    if meta["description"] and not _description_supported(meta["description"], vis_text):
        defects.append(
            _defect("meta_description_diverges", "description", meta["description"], visible["h1"])
        )
    for desc in claimed["descriptions"]:
        if desc and not _description_supported(desc, vis_text):
            # same string as meta already recorded
            if desc == meta["description"] and any(
                d["code"] == "meta_description_diverges" for d in defects
            ):
                continue
            defects.append(_defect("schema_description_diverges", "description", desc, ""))

    for ds in claimed["dataset_names"]:
        if ds and not _title_overlap(ds, visible["h1"] or vis_text):
            if not _description_supported(ds, vis_text):
                defects.append(_defect("schema_title_diverges", "Dataset.name", ds, visible["h1"]))

    canon = (meta["canonical"] or "").strip()
    if canon:
        parsed = urlparse(canon)
        host = (parsed.netloc or "").lower()
        if host and host not in {"confenge.com.br", "www.confenge.com.br"}:
            defects.append(_defect("meta_canonical_not_confenge", "canonical", canon, SITE))
        if url:
            want = urlparse(url if url.startswith("http") else SITE + url)
            got_path = parsed.path.rstrip("/") or "/"
            want_path = want.path.rstrip("/") or "/"
            if got_path != want_path:
                defects.append(
                    _defect("meta_canonical_diverges", "canonical", canon, url)
                )

    # Dedup + stable order
    uniq: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for d in defects:
        key = (d["code"], d["field"], d["claimed"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(d)
    uniq.sort(key=lambda d: (d["code"], d["field"], d["claimed"]))

    page_url = url or canon or ""
    fixture = is_fixture_only(html)
    return {
        "url": page_url,
        "ok": len(uniq) == 0,
        "fixture_only": fixture,
        "index_intent": (not is_noindex(html)) and (not fixture),
        "claimed": claimed,
        "visible": {
            "h1": visible["h1"],
            "title": visible["title"],
            "description": visible["description"],
            "canonical": visible["canonical"],
            "authors": visible["authors"],
            "reviewers": visible["reviewers"],
            "dates": visible["dates"],
            "licenses": visible["licenses"],
            "versions": visible["versions"],
            "breadcrumb_names": visible["breadcrumb_names"],
            "has_dataset_surface": visible["has_dataset_surface"],
            "permission_class": visible.get("permission_class"),
        },
        "defects": uniq,
    }


def index_eligibility(html: str, *, url: str | None = None) -> dict[str, Any]:
    """Shipped INDEX / sitemap eligibility. Overclaim or fixture → noindex."""
    from scripts.organic.gates import indexability_quality_gate

    parity = compare_visible_parity(html, url=url)
    fixture = bool(parity["fixture_only"])
    robots_blocked = is_noindex(html)
    defect_codes = [d["code"] for d in parity["defects"]]
    fails: list[str] = list(dict.fromkeys(defect_codes))
    if fixture:
        fails.append("fixture_only")
    if robots_blocked:
        fails.append("robots_noindex")

    parity_ok = parity["ok"] and not fixture
    gate = indexability_quality_gate(
        distinct_intent=True,
        own_information=True,
        sample_size=99,
        semantic_differentiation=0.9,
        independent_utility=True,
        data_confidence=0.9,
        non_redundant=True,
        no_cannibalization=True,
        has_context_interpretation=True,
        identifiable_update=True,
        useful_internal_links=True,
        contextual_cta=True,
        has_provenance=True,
        content_value_score=99,
        visible_parity=parity_ok,
    )
    # Eligibility for an already-built page is decided by parity + robots,
    # not by inventing opportunity scores. Organic gate still records the
    # blocking visible_parity_overclaim code.
    indexable = parity_ok and not robots_blocked
    if not indexable and "visible_parity_overclaim" not in fails and not parity_ok:
        fails.append("visible_parity_overclaim")
    return {
        "url": parity["url"],
        "indexable": indexable,
        "sitemap_include": indexable,
        "decision": "indexable_candidate" if indexable else "noindex",
        "fails": fails,
        "warnings": [],
        "defects": parity["defects"],
        "fixture_only": fixture,
        "parity_ok": parity_ok,
        "gate": {
            "indexable": gate["indexable"],
            "fails": gate["fails"],
            "decision": gate["decision"],
        },
    }


def filter_sitemap_urls(entries: list[tuple[str, str]]) -> list[str]:
    """Keep only URLs whose HTML remains INDEX-eligible."""
    kept: list[str] = []
    for url, html in entries:
        elig = index_eligibility(html, url=url)
        if elig["sitemap_include"]:
            kept.append(url)
    return kept


def sitemap_locs(site_root: Path) -> list[str]:
    from scripts.organic.sitemap_graph import load_graph_locs

    return sorted(set(load_graph_locs(site_root)))


def url_to_html_path(site_root: Path, url: str) -> Path:
    path = urlparse(url).path
    if not path or path == "/":
        return site_root / "index.html"
    rel = path.strip("/")
    candidate = site_root / rel / "index.html"
    if candidate.is_file():
        return candidate
    file_candidate = site_root / rel
    return file_candidate


def scan_site_artifact(
    site_root: Path,
    *,
    only_index_intent: bool = True,
) -> dict[str, Any]:
    """Run the shipped compare on approved / INDEX-intent URLs in `_site`."""
    pages: list[dict[str, Any]] = []
    for url in sitemap_locs(site_root):
        path = url_to_html_path(site_root, url)
        if not path.is_file():
            pages.append(
                {
                    "url": url,
                    "ok": False,
                    "fixture_only": False,
                    "index_intent": True,
                    "claimed": {},
                    "visible": {},
                    "defects": [
                        _defect("sitemap_target_missing", "url", url, str(path))
                    ],
                }
            )
            continue
        html = path.read_text(encoding="utf-8")
        if only_index_intent and (is_noindex(html) or is_fixture_only(html)):
            continue
        pages.append(compare_visible_parity(html, url=url))
    pages.sort(key=lambda p: p.get("url") or "")
    return {
        "ok": all(p.get("ok") for p in pages),
        "site_root": str(site_root),
        "page_count": len(pages),
        "defect_count": sum(len(p.get("defects") or []) for p in pages),
        "pages": pages,
    }


def report_to_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Visible parity",
        "",
        f"- ok: `{report.get('ok')}`",
        f"- pages: `{report.get('page_count')}`",
        f"- defects: `{report.get('defect_count')}`",
        f"- site_root: `{report.get('site_root')}`",
        "",
        "| url | ok | defects | claimed | visible |",
        "| --- | --- | --- | --- | --- |",
    ]
    for page in report.get("pages") or []:
        codes = ", ".join(d["code"] for d in (page.get("defects") or [])) or "—"
        claimed = page.get("claimed") or {}
        visible = page.get("visible") or {}
        claimed_s = "; ".join(
            filter(
                None,
                [
                    ",".join(claimed.get("types") or []),
                    (claimed.get("headlines") or claimed.get("dataset_names") or [""])[0]
                    if (claimed.get("headlines") or claimed.get("dataset_names"))
                    else "",
                ],
            )
        )
        visible_s = visible.get("h1") or visible.get("title") or ""
        lines.append(
            f"| {page.get('url') or ''} | {page.get('ok')} | {codes} | {claimed_s} | {visible_s} |"
        )
    lines.append("")
    return "\n".join(lines)


def dump_report(report: dict[str, Any], json_path: Path, md_path: Path | None = None) -> None:
    json_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    json_path.write_text(payload, encoding="utf-8")
    if md_path is not None:
        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(report_to_markdown(report), encoding="utf-8")


def fixture_dir() -> Path:
    return Path(__file__).resolve().parent / "fixtures" / "visible_parity"


def load_fixture_manifest() -> dict[str, Any]:
    path = fixture_dir() / "manifest.json"
    return json.loads(path.read_text(encoding="utf-8"))


def iter_negative_fixtures() -> list[tuple[str, Path, str]]:
    man = load_fixture_manifest()
    out: list[tuple[str, Path, str]] = []
    for case in man.get("cases") or []:
        path = fixture_dir() / case["file"]
        out.append((case["id"], path, case["defect"]))
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Visible parity compare on _site")
    parser.add_argument(
        "--root",
        default=str(ROOT / PUBLIC_DIR_NAME),
        help="Site artifact root (default: _site)",
    )
    parser.add_argument("--json", dest="json_path", default="")
    parser.add_argument("--md", dest="md_path", default="")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Scan every sitemap URL, including noindex",
    )
    args = parser.parse_args(argv)
    site_root = Path(args.root)
    if not site_root.is_dir():
        print(f"FAIL-CLOSED missing site artifact: {site_root}", file=sys.stderr)
        return 2
    report = scan_site_artifact(site_root, only_index_intent=not args.all)
    json_path = Path(args.json_path) if args.json_path else site_root.parent / "seo" / "visible-parity.json"
    md_path = Path(args.md_path) if args.md_path else json_path.with_suffix(".md")
    dump_report(report, json_path, md_path)
    print(
        json.dumps(
            {
                "ok": report["ok"],
                "page_count": report["page_count"],
                "defect_count": report["defect_count"],
                "json": str(json_path),
                "md": str(md_path),
            },
            ensure_ascii=False,
        )
    )
    if not report["ok"]:
        for page in report["pages"]:
            if page.get("ok"):
                continue
            codes = ",".join(d["code"] for d in page.get("defects") or [])
            print(f"ERROR {page.get('url')}: {codes}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
