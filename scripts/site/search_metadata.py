"""Keep approved search and sharing metadata aligned with the page's own source.

Titles and descriptions remain in their original HTML/data owner. This projection
never changes bodies, canonical URLs, robots, dates, offers, prices or authorship.
Only the route-exact contract is in scope. A generated page uses the same helper
as a maintained HTML page; the release checks the assembled artifact again.
"""
from __future__ import annotations

import argparse
import hashlib
from html import escape, unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import parse_qsl, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
SITE = "https://confenge.com.br"
POLICY = ROOT / "data/site/search-metadata.v1.json"
META = re.compile(r"<meta\b[^>]*>", re.I)
LD = re.compile(r"(<script\b[^>]*type=[\"']application/ld\+json[\"'][^>]*>)(.*?)(</script>)", re.I | re.S)


class SearchHead(HTMLParser):
    """Read effective head tags, excluding examples, comments and script strings.

    This is a read-only gate for every indexable route. The route-exact
    normalization policy below still owns which social previews may be written.
    """

    # Search rendering has scripting enabled. In a head, noscript and noframes
    # are raw text just like script/style, not alternate containers of metadata.
    CDATA_CONTENT_ELEMENTS = ("script", "style", "noscript", "noframes")

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.head_starts = 0
        self.head_ends = 0
        self.in_head = False
        self.in_body = False
        self.template_depth = 0
        self.in_title = False
        self.raw_tag: str | None = None
        self.titles: list[str] = []
        self.canonicals: list[str] = []
        self.metas: dict[str, list[str]] = {}
        self.problems: list[str] = []

    def handle_starttag(self, tag, attrs):
        if self.head_starts == 0 and tag not in {"html", "head"}:
            # A late explicit head cannot reopen metadata after earlier
            # content has made the browser create an implicit head/body.
            self.in_body = True
        if self.in_title:
            # HTML title is RCDATA: apparent tags inside it cannot supply
            # metadata or exempt a document from indexing checks.
            self.titles[-1] += self.get_starttag_text()
            return
        if tag == "template":
            self.template_depth += 1
            return
        if self.template_depth:
            return
        if tag == "body":
            self.in_body = True
            self.in_head = False
        if tag == "head":
            self.head_starts += 1
            self.in_head = not self.in_body
        if not self.in_head:
            return
        if tag not in {"html", "head", "base", "basefont", "bgsound", "link", "meta", "title",
                       "style", "script", "noscript", "noframes"}:
            # A body element implicitly ends head in the HTML tree builder.
            # Later source tags cannot supply effective head metadata.
            self.in_head = False
            self.in_body = True
            return
        if tag in self.CDATA_CONTENT_ELEMENTS:
            self.raw_tag = tag
            return
        if tag == "title":
            self.titles.append("")
            self.in_title = True
            return
        if tag not in {"meta", "link"}:
            return
        names = [key for key, _ in attrs]
        a = dict(attrs)
        if tag == "link" and "canonical" in (a.get("rel") or "").lower().split():
            for key in ("rel", "href"):
                if names.count(key) > 1:
                    self.problems.append(f"duplicate_canonical_attribute:{key}")
            self.canonicals.append(a.get("href") or "")
        if tag == "meta":
            key = (a.get("name") or a.get("property") or "").lower()
            if a.get("name") and a.get("property"):
                self.problems.append("ambiguous_metadata_selector")
            for attr in ("name", "property", "content"):
                if names.count(attr) > 1:
                    self.problems.append(f"duplicate_metadata_attribute:{key}:{attr}")
            self.metas.setdefault(key, []).append(a.get("content") or "")

    def handle_endtag(self, tag):
        if tag == self.raw_tag:
            self.raw_tag = None
            return
        if self.in_title:
            if tag == "title":
                self.in_title = False
            else:
                self.titles[-1] += f"</{tag}>"
            return
        if tag == "template" and self.template_depth:
            self.template_depth -= 1
            return
        if self.template_depth:
            return
        if tag == "head":
            self.head_ends += 1
            self.in_head = False
        if tag in {"body", "html", "br"} and self.in_head:
            self.in_head = False
            self.in_body = True

    def handle_data(self, data):
        if not self.head_starts and data.strip(" \t\r\n\f"):
            self.in_body = True
        elif self.in_head and self.in_title and not self.template_depth:
            self.titles[-1] += data
        elif self.in_head and not self.template_depth and not self.raw_tag and data.strip(" \t\r\n\f"):
            self.in_head = False
            self.in_body = True

    @property
    def noindex(self) -> bool:
        if (self.head_starts, self.head_ends) != (1, 1) or any(
            issue.startswith(("duplicate_metadata_attribute:robots:", "duplicate_metadata_attribute:googlebot:"))
            or issue == "ambiguous_metadata_selector"
            for issue in self.problems
        ):
            return False
        directives = self.metas.get("robots", []) + self.metas.get("googlebot", [])
        return any({"noindex", "none"} & set(re.split(r"[\s,]+", value.lower())) for value in directives)


def inspect_search_head(text: str, route: str) -> dict:
    """Validate cardinality and canonical identity without arbitrary word limits.

    Callers decide which public status/route is indexable. Noindex is reported
    from parsed head directives so a quoted tag cannot exempt a page from gates.
    """
    head = SearchHead()
    head.feed(text)
    head.close()
    problems = list(head.problems)
    if (head.head_starts, head.head_ends) != (1, 1):
        problems.append("head_missing_or_duplicate")
    values = {"title": head.titles, "description": head.metas.get("description", []), "canonical": head.canonicals}
    normalized = {}
    for key, entries in values.items():
        normalized[key] = " ".join(entries[0].split()) if len(entries) == 1 else ""
        if len(entries) != 1:
            problems.append(f"{key}_count:{len(entries)}")
        elif not normalized[key]:
            problems.append(f"{key}_empty")
    if len(head.canonicals) == 1 and head.canonicals[0] != SITE + route:
        problems.append("canonical_mismatch")
    for key, entries in head.metas.items():
        if (key in {"robots", "googlebot"} or key.startswith(("og:", "twitter:"))) and len(entries) > 1:
            problems.append(f"duplicate_metadata:{key}")
    return {**normalized, "noindex": head.noindex, "problems": problems}


def audit_indexable_metadata(root: Path, *, artifact: bool = False) -> dict:
    """Audit source pages or every emitted HTML, without changing their content.

    Source ignores internal fixtures through the existing public walker. An
    artifact is already the publication boundary, so its independent census
    includes every HTML file. Real noindex directives and the existing HTTP
    header contract keep utility/error documents outside indexable metadata.
    """
    from scripts.organic.sitemap_graph import x_robots_noindex
    from scripts.organic.sitemap_hygiene import parse_redirects
    from scripts.site.public_copy_scope import artifact_html_files, route_for, visitor_facing_html_files

    root = root.resolve()
    pages = artifact_html_files(root) if artifact else visitor_facing_html_files(root)
    headers_file = root / "_headers"
    headers = headers_file.read_text(encoding="utf-8") if headers_file.is_file() else ""
    redirect_file = root / "_redirects"
    rules = parse_redirects(redirect_file.read_text(encoding="utf-8")) if redirect_file.is_file() else []
    response_rules = []
    for rule in rules:
        if not rule["from"].startswith("/") or rule["from"].startswith("//"):
            continue
        pattern = re.escape(rule["from"].rstrip("/")).replace(r"\*", ".*")
        pattern = re.sub(r":[A-Za-z_][A-Za-z0-9_]*", "[^/]+", pattern)
        response_rules.append((re.compile(pattern + "/?"), rule["status"].rstrip("!")))
    titles: dict[str, list[str]] = {}
    descriptions: dict[str, list[str]] = {}
    routes, problems = [], []
    for page in pages:
        route = route_for(page.relative_to(root).as_posix())
        metadata = inspect_search_head(page.read_text(encoding="utf-8"), route)
        # Honor the first matching path rule; a later 410 cannot hide a live
        # rewrite. Other redirects remain subject to sitemap/inventory checks.
        status = next((code for pattern, code in response_rules if pattern.fullmatch(route)), "200")
        if (metadata["noindex"] or x_robots_noindex(headers, route)
                or route in {"/404.html", "/obrigado.html"}
                or status in {"404", "410"}):
            continue
        routes.append(route)
        problems.extend(f"search_head:{route}:{problem}" for problem in metadata["problems"])
        for key, index in (("title", titles), ("description", descriptions)):
            if metadata[key]:
                index.setdefault(metadata[key].casefold(), []).append(route)
    for kind, index in (("title", titles), ("description", descriptions)):
        for shared in index.values():
            if len(shared) > 1:
                problems.append(f"duplicate_{kind}:" + ",".join(shared))
    return {"ok": not problems, "checked": len(routes), "routes": routes, "errors": problems}


class Tags(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metas: dict[str, list[str]] = {}
        self.canonicals: list[str] = []
        self.attrs: dict[str, str] = {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.attrs = a
        if tag == "meta":
            key = a.get("name", a.get("property", ""))
            self.metas.setdefault(key, []).append(a.get("content", ""))
        if tag == "link" and a.get("rel") == "canonical":
            self.canonicals.append(a.get("href", ""))


def policy() -> dict:
    data = json.loads(POLICY.read_text(encoding="utf-8"))
    if data.get("schema") != "confenge-search-metadata/v1":
        raise ValueError("search_metadata_policy_version")
    return data


def _meta(head: str, key: str, value: str, *, prop: bool = False) -> str:
    matches = []
    for match in META.finditer(head):
        parser = Tags()
        parser.feed(match.group())
        if key in parser.metas:
            matches.append(match)
    if len(matches) > 1:
        raise ValueError(f"duplicate_search_metadata:{key}")
    tag = f'<meta {"property" if prop else "name"}="{key}" content="{escape(value, quote=True)}"/>'
    if matches:
        match = matches[0]
        return head[:match.start()] + tag + head[match.end():]
    return head + "\n" + tag


def _nodes(payload):
    if isinstance(payload, list):
        nodes = payload
    elif isinstance(payload, dict):
        nodes = payload.get("@graph", [payload])
    else:
        raise ValueError("search_metadata_invalid_jsonld_root")
    if not isinstance(nodes, list) or any(not isinstance(node, dict) for node in nodes):
        raise ValueError("search_metadata_invalid_jsonld_nodes")
    return nodes


def _has_type(node: dict, *names: str) -> bool:
    declared = node.get("@type", [])
    if isinstance(declared, str):
        declared = [declared]
    return isinstance(declared, list) and any(name in declared for name in names)


class Directory(HTMLParser):
    def __init__(self, prefix: str):
        super().__init__(convert_charrefs=True)
        self.prefix = prefix
        self.main = False
        self.h3 = False
        self.href = ""
        self.text = ""
        self.items: list[tuple[str, str]] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "main":
            self.main = True
        if self.main and tag == "h3":
            self.h3 = True
        if self.h3 and tag == "a" and a.get("href", "").startswith(self.prefix):
            self.href, self.text = a["href"], ""

    def handle_data(self, data):
        if self.href:
            self.text += data

    def handle_endtag(self, tag):
        if tag == "a" and self.href:
            self.items.append((self.href, " ".join(self.text.split())))
            self.href = ""
        if tag == "h3":
            self.h3 = False
        if tag == "main":
            self.main = False


def _schema(head: str, body: str, route: str, title: str, description: str, settings: dict) -> str:
    canonical = SITE + route
    parsed = [(match, json.loads(match.group(2))) for match in LD.finditer(head)]
    nodes = [node for _, payload in parsed for node in _nodes(payload)]
    page = next((n for n in nodes if n.get("url") == canonical and _has_type(n, "WebPage", "CollectionPage", "AboutPage")), None)
    if settings.get("page_type") == "CollectionPage" and route == "/casos/":
        page = next((n for n in nodes if n.get("url") == canonical and _has_type(n, "TechArticle")), page)
        if page is not None:
            page["@id"] = canonical + "#webpage"
            page.pop("headline", None)
            page.pop("mainEntityOfPage", None)
    if page is not None:
        page["name"] = title
        page["description"] = description
        if settings.get("page_type"):
            page["@type"] = settings["page_type"]
        page.setdefault("inLanguage", "pt-BR")
        if page.get("@type") == "AboutPage":
            page["about"] = {"@id": SITE + "/#organization"}
        itemlist = next((n for n in nodes if _has_type(n, "ItemList") and n.get("@id")), None)
        if _has_type(page, "CollectionPage") and itemlist and "mainEntity" not in page:
            page["mainEntity"] = {"@id": itemlist["@id"]}
        if settings.get("directory_prefix"):
            directory = Directory(settings["directory_prefix"])
            directory.feed(body)
            if not directory.items or len({u for u, _ in directory.items}) != len(directory.items):
                raise ValueError(f"search_directory_empty_or_duplicate:{route}")
            page["mainEntity"] = {
                "@type": "ItemList", "numberOfItems": len(directory.items),
                "itemListElement": [{"@type": "ListItem", "position": i, "name": name, "url": SITE + url}
                                    for i, (url, name) in enumerate(directory.items, 1)],
            }
    if settings.get("page_type") and page is None:
        raise ValueError(f"search_metadata_page_schema_missing:{route}")
    extra = None
    if settings.get("article") and not any(_has_type(n, "Article", "TechArticle", "BlogPosting") for n in nodes):
        h1 = re.search(r"<h1\b[^>]*>(.*?)</h1>", body, re.I | re.S)
        if not h1:
            raise ValueError(f"search_article_h1_missing:{route}")
        headline = unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip()
        extra = {"@context": "https://schema.org", "@type": "Article", "@id": canonical + "#article",
                 "headline": headline, "description": description, "url": canonical,
                 "mainEntityOfPage": canonical, "inLanguage": "pt-BR",
                 "publisher": {"@id": SITE + "/#organization", "name": "CONFENGE"}}
    # Enrich only explicit existing references, never infer a new author.
    def enrich(value):
        if isinstance(value, dict):
            if value.get("@id") == SITE + "/#tiago" and "@type" not in value:
                value.setdefault("@type", "Person")
                value.setdefault("name", "Tiago Jun Sasaki")
                value.setdefault("url", SITE + "/especialista/tiago-jun-sasaki/")
            for child in value.values():
                enrich(child)
        elif isinstance(value, list):
            for child in value:
                enrich(child)
    for _, payload in parsed:
        enrich(payload)
    for match, payload in reversed(parsed):
        serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
        head = head[:match.start()] + match.group(1) + serialized + match.group(3) + head[match.end():]
    if extra:
        head += '\n<script type="application/ld+json">' + json.dumps(extra, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c") + "</script>"
    return head


def normalize_metadata_html(text: str, route: str, config: dict | None = None) -> str:
    config = config or policy()
    if route not in config["routes"]:
        return text
    if len(re.findall(r"<head\b", text, re.I)) != 1 or len(re.findall(r"</head\s*>", text, re.I)) != 1:
        raise ValueError(f"search_metadata_head_missing_or_duplicate:{route}")
    match = re.search(r"(<head\b[^>]*>)(.*?)(</head>)", text, re.I | re.S)
    if not match:
        raise ValueError(f"search_metadata_head_missing:{route}")
    head = match.group(2)
    parser = Tags()
    parser.feed(head)
    if len(parser.metas.get("robots", [])) > 1:
        raise ValueError(f"duplicate_search_metadata:robots:{route}")
    if any("noindex" in v.lower() for v in parser.metas.get("robots", [])):
        return text
    titles = re.findall(r"<title\b[^>]*>(.*?)</title>", head, re.I | re.S)
    if len(titles) != 1 or len(parser.metas.get("description", [])) != 1:
        raise ValueError(f"search_metadata_title_description_missing_or_duplicate:{route}")
    if parser.canonicals != [SITE + route]:
        raise ValueError(f"search_metadata_canonical_mismatch:{route}")
    title = unescape(titles[0]).strip()
    description = parser.metas["description"][0].strip()
    if not title or not description:
        raise ValueError(f"search_metadata_empty:{route}")
    image = parser.metas.get("og:image", [config["default_image"]["url"]])[0]
    if not image.startswith(SITE + "/"):
        raise ValueError(f"search_metadata_external_image:{route}")
    image_url = urlsplit(image)
    default_image_url = urlsplit(config["default_image"]["url"])
    is_default_image = (image_url.scheme, image_url.netloc, image_url.path) == (
        default_image_url.scheme, default_image_url.netloc, default_image_url.path
    )
    values = {"og:title": title, "og:description": description, "og:url": SITE + route,
              "og:type": parser.metas.get("og:type", ["website"])[0], "og:site_name": "CONFENGE",
              "og:locale": "pt_BR", "og:image": image}
    alt = parser.metas.get("og:image:alt", [config["default_image"]["alt"] if is_default_image else title])[0]
    values["og:image:alt"] = alt
    for key, value in values.items():
        head = _meta(head, key, value, prop=True)
    if is_default_image:
        for key in ("width", "height", "type"):
            head = _meta(head, "og:image:" + key, str(config["default_image"][key]), prop=True)
    for key, value in {"twitter:card": "summary_large_image", "twitter:title": title,
                       "twitter:description": description, "twitter:image": image, "twitter:image:alt": alt}.items():
        head = _meta(head, key, value)
    head = _schema(head, text[match.end():], route, title, description, config["routes"][route])
    return text[:match.start(2)] + head + text[match.end(2):]


def _social_asset_problem(root: Path, image: str) -> str | None:
    """Verify local bytes, including the release's SHA-256 query version.

    The artifact's existing commercial-media step adds ``?v=<sha256>``.
    Validate that exact contract rather than treating every query as absent
    or accepting arbitrary query strings that can transform a remote asset.
    """
    parsed = urlsplit(image)
    if (parsed.scheme, parsed.netloc) != ("https", "confenge.com.br") or parsed.fragment:
        return "invalid_social_asset_url"
    asset = (root / unquote(parsed.path).lstrip("/")).resolve()
    if not asset.is_relative_to(root.resolve()):
        return "invalid_social_asset_path"
    if not asset.is_file() or asset.stat().st_size == 0:
        return "missing_social_asset"
    if parsed.query:
        try:
            query = parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True)
        except ValueError:
            return "invalid_social_asset_version"
        if len(query) != 1 or query[0][0] != "v" or not re.fullmatch(r"[0-9a-f]{64}", query[0][1]):
            return "invalid_social_asset_version"
        if hashlib.sha256(asset.read_bytes()).hexdigest() != query[0][1]:
            return "social_asset_digest_mismatch"
    return None


def synchronize(root: Path, *, write: bool = False, artifact: bool = False) -> dict:
    config = policy()
    changed, errors = [], []
    for route in config["routes"]:
        path = root / route.strip("/") / "index.html"
        if not path.is_file():
            errors.append(f"missing_page:{route}")
            continue
        before = path.read_text(encoding="utf-8")
        try:
            after = normalize_metadata_html(before, route, config)
            if after != before:
                changed.append(route)
                if write:
                    path.write_text(after, encoding="utf-8")
            parser = Tags()
            parser.feed(after.split("</head>", 1)[0])
            for image in parser.metas.get("og:image", []):
                parsed = urlsplit(image)
                problem = _social_asset_problem(root, image)
                if problem:
                    errors.append(f"{problem}:{route}:{parsed.path}")
        except (ValueError, json.JSONDecodeError) as exc:
            errors.append(f"{route}:{exc}")
    census = audit_indexable_metadata(root, artifact=artifact)
    errors.extend(census["errors"])
    return {"ok": not errors and (write or not changed), "checked": len(config["routes"]),
            "audited_indexable": census["checked"], "changed": changed, "errors": errors}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--artifact", action="store_true", help="inspect every HTML in an assembled public root")
    args = parser.parse_args()
    result = synchronize(args.root, write=args.write, artifact=args.artifact)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result["ok"] else 1)
