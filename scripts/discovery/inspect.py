"""Offline inspection of local HTML, robots.txt and sitemaps. No network."""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scripts.discovery.schema import CANONICAL_ORIGIN, UNKNOWN

SITEMAP_FILES = (
    "sitemap.xml",
    "sitemap-editorial.xml",
    "sitemap-inteligencia.xml",
    "sitemap-jurisprudencia.xml",
)


class _HeadParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._capture: str | None = None
        self.title = ""
        self.metas: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []
        self.jsonld: list[Any] = []
        self._jsonld_buf: list[str] = []
        self.h1 = ""
        self._in_h1 = False
        self._h1_buf: list[str] = []
        self.has_main = False
        self.has_body = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k.lower(): (v or "") for k, v in attrs}
        if tag == "body":
            self.has_body = True
        if tag == "main":
            self.has_main = True
        if tag == "title":
            self._capture = "title"
        elif tag == "h1" and not self.h1:
            self._in_h1 = True
        elif tag == "meta":
            self.metas.append(ad)
        elif tag == "link":
            self.links.append(ad)
        elif tag == "script" and ad.get("type", "").lower() == "application/ld+json":
            self._capture = "jsonld"
            self._jsonld_buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self._capture == "title":
            self._capture = None
        if tag == "h1" and self._in_h1:
            self.h1 = "".join(self._h1_buf).strip()
            self._in_h1 = False
        if tag == "script" and self._capture == "jsonld":
            raw = "".join(self._jsonld_buf).strip()
            if raw:
                try:
                    self.jsonld.append(json.loads(raw))
                except json.JSONDecodeError:
                    self.jsonld.append({"_parse_error": True, "_raw": raw[:200]})
            self._capture = None

    def handle_data(self, data: str) -> None:
        if self._capture == "title":
            self.title += data
        elif self._capture == "jsonld":
            self._jsonld_buf.append(data)
        elif self._in_h1:
            self._h1_buf.append(data)


def parse_html(text: str) -> dict[str, Any]:
    parser = _HeadParser()
    parser.feed(text)
    parser.close()
    title = parser.title.strip()
    description = ""
    robots = ""
    canonical = ""
    for meta in parser.metas:
        name = (meta.get("name") or meta.get("property") or "").lower()
        if name == "description" and not description:
            description = meta.get("content") or ""
        if name == "robots" and not robots:
            robots = meta.get("content") or ""
    for link in parser.links:
        if (link.get("rel") or "").lower() == "canonical":
            canonical = link.get("href") or ""
            break
    return {
        "title": title,
        "h1": parser.h1,
        "description": description,
        "robots": robots,
        "canonical": canonical,
        "jsonld": parser.jsonld,
        "renderable": bool(parser.has_body and (parser.has_main or parser.h1 or title)),
    }


def local_path_for_canonical(canonical: str) -> str:
    parsed = urlparse(canonical)
    path = parsed.path or "/"
    if path.endswith("/"):
        return path.lstrip("/") + "index.html"
    if path.endswith(".html"):
        return path.lstrip("/")
    return path.lstrip("/") + "/index.html"


def extract_sitemap_locs(xml_text: str) -> list[str]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    locs: list[str] = []
    for loc in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
        if loc.text:
            locs.append(loc.text.strip())
    if not locs:
        for loc in root.findall(".//loc"):
            if loc.text:
                locs.append(loc.text.strip())
    return locs


def load_sitemap_urls(root: Path) -> set[str]:
    from scripts.organic.sitemap_graph import load_graph_locs

    return set(load_graph_locs(root))


RobotsRule = tuple[str, str]
RobotsGroup = tuple[tuple[str, ...], tuple[RobotsRule, ...]]
_ROBOTS_UNRESERVED = frozenset(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"
)
_ROBOTS_RESERVED = frozenset(":/?#[]@!$&'()*+,;=")


def _normalize_robots_agent(value: str) -> str:
    token = value.strip().lower()
    if token == "*":
        return token
    # Google ignores version suffixes and wildcard suffixes on product tokens.
    match = re.match(r"[a-z_-]+", token)
    return match.group(0) if match else ""


def _robots_groups(robots_text: str) -> list[RobotsGroup]:
    """Parse REP groups while ignoring extensions such as Sitemap/Content-Signal."""
    groups: list[RobotsGroup] = []
    agents: list[str] = []
    rules: list[RobotsRule] = []
    has_rule_line = False

    def finish_group() -> None:
        nonlocal agents, rules, has_rule_line
        if agents:
            groups.append((tuple(agents), tuple(rules)))
        agents = []
        rules = []
        has_rule_line = False

    for raw_line in robots_text.splitlines():
        stripped = raw_line.split("#", 1)[0].strip()
        if not stripped or ":" not in stripped:
            continue
        field, raw_value = stripped.split(":", 1)
        field = field.strip().lower()
        value = raw_value.strip()
        if field == "user-agent":
            if agents and has_rule_line:
                finish_group()
            agent = _normalize_robots_agent(value)
            if agent:
                agents.append(agent)
            continue
        if field not in {"allow", "disallow"} or not agents:
            continue
        has_rule_line = True
        # RFC 9309 empty patterns match nothing, so they carry no policy.
        if value:
            rules.append((field, value))
    finish_group()
    return groups


def _applicable_robots_rules(robots_text: str, user_agent: str) -> list[RobotsRule]:
    """Select and combine the most-specific matching REP user-agent groups."""
    normalized_ua = (user_agent or "*").lower()
    matched: list[tuple[int, tuple[RobotsRule, ...]]] = []
    wildcard: list[tuple[RobotsRule, ...]] = []
    for agents, rules in _robots_groups(robots_text):
        if "*" in agents:
            wildcard.append(rules)
        specificities = [
            len(agent)
            for agent in agents
            if agent != "*" and agent in normalized_ua
        ]
        if specificities:
            matched.append((max(specificities), rules))

    selected: list[tuple[RobotsRule, ...]]
    if matched:
        most_specific = max(specificity for specificity, _ in matched)
        selected = [rules for specificity, rules in matched if specificity == most_specific]
    else:
        selected = wildcard

    combined: list[RobotsRule] = []
    seen: set[RobotsRule] = set()
    for rules in selected:
        for rule in rules:
            if rule not in seen:
                seen.add(rule)
                combined.append(rule)
    return combined


def robots_disallows(robots_text: str, *, user_agent: str = "*") -> list[str]:
    """Return effective non-empty Disallow patterns for one crawler user agent."""
    return [
        pattern
        for directive, pattern in _applicable_robots_rules(robots_text, user_agent)
        if directive == "disallow"
    ]


def _robots_pattern_matches(path: str, pattern: str) -> bool:
    anchored_at_end = pattern.endswith("$")
    body = pattern[:-1] if anchored_at_end else pattern
    expression = "^" + re.escape(body).replace(r"\*", ".*")
    if anchored_at_end:
        expression += "$"
    return re.match(expression, path) is not None


def _robots_pattern_specificity(pattern: str) -> int:
    # Google's mainstream resolver uses the full rule-path length, including
    # wildcard and end-anchor syntax, before applying Allow on an exact tie.
    return len(pattern.encode("utf-8"))


def _normalize_robots_octets(value: str, *, pattern: bool) -> str:
    """Normalize REP comparison octets without turning encoded * or $ into syntax."""
    normalized: list[str] = []
    index = 0
    in_query = False
    while index < len(value):
        char = value[index]
        if char == "%" and index + 2 < len(value):
            pair = value[index + 1 : index + 3]
            if re.fullmatch(r"[0-9a-fA-F]{2}", pair):
                byte = int(pair, 16)
                decoded = chr(byte)
                if decoded in _ROBOTS_UNRESERVED:
                    normalized.append(decoded)
                else:
                    normalized.append(f"%{byte:02X}")
                index += 3
                continue
        if char == "?" and not in_query:
            normalized.append(char)
            in_query = True
        elif char == "/" and not in_query:
            normalized.append(char)
        elif in_query and char in {"&", "="}:
            normalized.append(char)
        elif pattern and char in {"*", "$"}:
            normalized.append(char)
        elif ord(char) > 0x7F:
            normalized.extend(f"%{byte:02X}" for byte in char.encode("utf-8"))
        elif char in _ROBOTS_RESERVED:
            normalized.append(f"%{ord(char):02X}")
        else:
            normalized.append(char)
        index += 1
    return "".join(normalized)


def path_blocked_by_robots(path: str, robots_text: str, *, user_agent: str = "*") -> bool:
    """Evaluate Allow/Disallow for a UA using REP/Google longest-match behavior."""
    if not path.startswith("/"):
        path = "/" + path
    normalized_path = _normalize_robots_octets(path, pattern=False)
    matches = [
        (directive, _normalize_robots_octets(pattern, pattern=True))
        for directive, pattern in _applicable_robots_rules(robots_text, user_agent)
        if _robots_pattern_matches(
            normalized_path, _normalize_robots_octets(pattern, pattern=True)
        )
    ]
    if not matches:
        return False
    longest = max(_robots_pattern_specificity(pattern) for _, pattern in matches)
    winners = [
        directive
        for directive, pattern in matches
        if _robots_pattern_specificity(pattern) == longest
    ]
    # Equivalent Allow and Disallow rules resolve to Allow.
    return "allow" not in winners


def robots_target_from_url(url: str) -> str:
    """Return the path, params and query that REP matches for a URL."""
    parsed = urlparse(url)
    target = parsed.path or "/"
    if parsed.params:
        target += f";{parsed.params}"
    if parsed.query:
        target += f"?{parsed.query}"
    return target


def jsonld_types(blocks: list[Any]) -> list[str]:
    found: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            raw = node.get("@type")
            if isinstance(raw, str):
                found.append(raw)
            elif isinstance(raw, list):
                found.extend(str(x) for x in raw)
            graph = node.get("@graph")
            if isinstance(graph, list):
                for item in graph:
                    walk(item)
            for key, value in node.items():
                if key in {"@type", "@graph"}:
                    continue
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    for block in blocks:
        walk(block)
    # stable unique
    seen: set[str] = set()
    ordered: list[str] = []
    for item in found:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


PAGE_TYPES = frozenset(
    {
        "WebPage",
        "ProfilePage",
        "WebApplication",
        "Dataset",
        "Article",
        "CollectionPage",
        "TechArticle",
        "FAQPage",
        "AboutPage",
    }
)

_STOP = frozenset(
    {
        "para",
        "com",
        "esta",
        "este",
        "essa",
        "esse",
        "uma",
        "umas",
        "como",
        "pelo",
        "pela",
        "dos",
        "das",
        "que",
        "não",
        "sem",
        "por",
        "mais",
        "confenge",
        "https",
        "http",
    }
)


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-záàâãéêíóôõúç0-9]{4,}", text.lower())
    return {w for w in words if w not in _STOP}


def jsonld_nodes(blocks: list[Any]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            nodes.append(node)
            graph = node.get("@graph")
            if isinstance(graph, list):
                for item in graph:
                    walk(item)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    for block in blocks:
        walk(block)
    return nodes


def jsonld_visible_fields(blocks: list[Any]) -> dict[str, Any]:
    """Collect name/description/url from the page-level JSON-LD node."""
    names: list[str] = []
    descriptions: list[str] = []
    urls: list[str] = []
    for node in jsonld_nodes(blocks):
        types = node.get("@type")
        if isinstance(types, str):
            types = [types]
        if not isinstance(types, list):
            continue
        if not any(t in PAGE_TYPES for t in types):
            continue
        if isinstance(node.get("name"), str):
            names.append(node["name"])
        if isinstance(node.get("description"), str):
            descriptions.append(node["description"])
        if isinstance(node.get("url"), str):
            urls.append(node["url"])
    return {"names": names, "descriptions": descriptions, "urls": urls}


def structured_data_matches_visible(
    visible: dict[str, Any], jsonld_blocks: list[Any]
) -> list[str]:
    """Return defects when the page-level JSON-LD contradicts visible copy."""
    defects: list[str] = []
    if not jsonld_blocks:
        return defects
    fields = jsonld_visible_fields(jsonld_blocks)
    title = (visible.get("title") or "").strip()
    h1 = (visible.get("h1") or "").strip()
    description = (visible.get("description") or "").strip()
    canonical = (visible.get("canonical") or "").strip()
    names = fields["names"]
    if names and (title or h1):
        title_core = re.sub(r"\s*\|\s*CONFENGE\s*$", "", title, flags=re.I).strip()
        hay = f"{title} {h1} {title_core}".lower()
        if not any(name.lower() in hay or title_core.lower() in name.lower() or h1.lower() in name.lower() for name in names if name):
            # token overlap fallback for paraphrased names
            name_tokens = set()
            for name in names:
                name_tokens |= _tokens(name)
            if len(_tokens(hay) & name_tokens) < 2:
                defects.append("structured_data_name_mismatch")
    if description and fields["descriptions"]:
        desc_tokens = _tokens(description)
        if not any(len(desc_tokens & _tokens(desc)) >= 3 for desc in fields["descriptions"] if desc):
            defects.append("structured_data_description_mismatch")
    if canonical and fields["urls"]:
        page_urls = [u for u in fields["urls"] if u.rstrip("/") != CANONICAL_ORIGIN]
        if page_urls and not any(
            canonical.rstrip("/") in url or url.rstrip("/") in canonical for url in page_urls
        ):
            defects.append("structured_data_url_mismatch")
    return defects


def inspect_asset(asset: dict[str, Any], *, root: Path) -> dict[str, Any]:
    """Inspect one registry asset from local files. Never opens a socket."""
    canonical = asset.get("canonical")
    fixture = bool(asset.get("fixture"))
    result: dict[str, Any] = {
        "id": asset.get("id"),
        "category": asset.get("category"),
        "canonical": canonical,
        "index_intent": asset.get("index_intent"),
        "fixture": fixture,
        "http": {
            "status": UNKNOWN,
            "probed": False,
            "local_file": "absent",
            "note": "live HTTP is not probed on the default offline path",
        },
        "robots_meta": UNKNOWN,
        "robots_txt_blocked": False,
        "sitemap": False,
        "renderability": UNKNOWN,
        "structured_data_visible": [],
        "title": UNKNOWN,
        "description": UNKNOWN,
        "h1": UNKNOWN,
        "content_version": asset.get("content_version") or UNKNOWN,
        "method_version": asset.get("method_version") or UNKNOWN,
        "as_of": asset.get("as_of") or UNKNOWN,
        "freshness": asset.get("freshness") or UNKNOWN,
        "correction_owner": asset.get("correction_owner") or UNKNOWN,
        "local_path": None,
        "jsonld": [],
        "structured_data_defects": [],
    }
    if fixture or not canonical:
        result["http"]["note"] = "fixture or missing canonical — no public HTTP surface"
        result["renderability"] = "not_public"
        return result

    rel = asset.get("local_path") or local_path_for_canonical(str(canonical))
    result["local_path"] = rel
    page = root / rel
    robots_text = ""
    robots_path = root / "robots.txt"
    if robots_path.is_file():
        robots_text = robots_path.read_text(encoding="utf-8", errors="replace")
        target = robots_target_from_url(str(canonical))
        result["robots_txt_blocked"] = path_blocked_by_robots(target, robots_text)

    sitemap_urls = load_sitemap_urls(root)
    result["sitemap"] = str(canonical) in sitemap_urls

    if not page.is_file():
        result["http"]["local_file"] = "absent"
        return result

    html = page.read_text(encoding="utf-8", errors="replace")
    parsed_html = parse_html(html)
    result["http"]["local_file"] = "present"
    result["http"]["status"] = "LOCAL_PRESENT"
    result["title"] = parsed_html["title"] or UNKNOWN
    result["description"] = parsed_html["description"] or UNKNOWN
    result["h1"] = parsed_html["h1"] or UNKNOWN
    result["robots_meta"] = parsed_html["robots"] or UNKNOWN
    result["renderability"] = "static_html_present" if parsed_html["renderable"] else UNKNOWN
    result["jsonld"] = parsed_html["jsonld"]
    result["structured_data_visible"] = jsonld_types(parsed_html["jsonld"])
    visible = {
        "title": parsed_html["title"],
        "h1": parsed_html["h1"],
        "description": parsed_html["description"],
        "canonical": parsed_html["canonical"],
    }
    result["declared_canonical"] = parsed_html["canonical"]
    result["structured_data_defects"] = structured_data_matches_visible(visible, parsed_html["jsonld"])
    return result
