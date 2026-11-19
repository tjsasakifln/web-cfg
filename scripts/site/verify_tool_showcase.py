"""Release gate for the tool catalogue as served, after artifact transforms."""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.hub_link_composition import destination_present  # noqa: E402
from scripts.site.render_tool_showcase import HOST, HUB, load_registry  # noqa: E402


class Markup(HTMLParser):
    def __init__(self, text: str):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.feed(text)
        self.close()

    def match(self, tag: str, **attrs: str) -> list[dict]:
        return [a for t, a in self.tags if t == tag and all(a.get(k) == v for k, v in attrs.items())]

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


def jpeg_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as file:
        assert file.read(2) == b"\xff\xd8", path
        while marker := file.read(2):
            assert marker[0] == 255, path
            length = struct.unpack(">H", file.read(2))[0]
            if marker[1] in (0xc0, 0xc1, 0xc2):
                _, height, width = struct.unpack(">BHH", file.read(5))
                return width, height
            file.seek(length - 2, 1)
    raise AssertionError(f"No JPEG dimensions: {path}")


def verify(artifact: Path) -> None:
    data = load_registry(ROOT)
    page_entries = [e for e in data["entries"] if "page" in e]
    indexed = {HOST + e["href"] for e in page_entries if e["page"].get("index", True)}
    routes = [(HUB, "catalogo", True, data["updated"])] + [
        (entry["href"], entry["id"], entry["page"].get("index", True),
         entry["page"].get("updated", data["updated"])) for entry in page_entries
    ]
    meta_urls = indexed | {HOST + HUB}
    sitemap = ET.parse(artifact / "sitemap.xml")
    sitemap_urls = {}
    for url in sitemap.findall("{*}url"):
        loc = url.findtext("{*}loc")
        assert loc not in sitemap_urls, loc
        sitemap_urls[loc] = url.findtext("{*}lastmod")
    assert {loc for loc in sitemap_urls if loc.startswith(HOST + HUB)} <= meta_urls, "Tool sitemap entry missing from catalogue"
    titles, descriptions, images = set(), set(), set()
    for route, key, indexable, expected_updated in routes:
        html = (artifact / route.lstrip("/") / "index.html").read_text(encoding="utf-8")
        dom = Markup(html)
        title = re.findall(r"<title>(.*?)</title>", html, re.S)
        assert len(title) == 1 and title[0] not in titles, route
        titles.add(title[0])
        desc = dom.match("meta", name="description")
        assert len(desc) == 1 and desc[0]["content"] not in descriptions, route
        descriptions.add(desc[0]["content"])
        robots = dom.match("meta", name="robots")
        assert len(robots) == 1, route
        assert ("noindex" not in robots[0]["content"]) == indexable, route
        if indexable:
            assert "max-image-preview:large" in robots[0]["content"], route
            canonical, = dom.match("link", rel="canonical")
            assert canonical["href"] == HOST + route, route
            assert sitemap_urls[HOST + route] == expected_updated, route
            assert len(dom.match("meta", property="og:updated_time", content=expected_updated)) == 1, route
            assert set(re.findall(r'"dateModified"\s*:\s*"([^"]+)"', html)) <= {expected_updated}, route
        else:
            assert HOST + route not in sitemap_urls, route
        og_url = dom.match("meta", property="og:url")
        assert len(og_url) == 1 and og_url[0]["content"] == HOST + route, route
        og = dom.match("meta", property="og:image")
        assert len(og) == 1 and og[0]["content"] not in images, route
        images.add(og[0]["content"])
        image = artifact / f"assets/tool-showcase/{key}.jpg"
        assert og[0]["content"] == HOST + "/" + image.relative_to(artifact).as_posix(), route
        assert image.stat().st_size < 160_000 and jpeg_size(image) == (1200, 630), image
        assert len(dom.match("meta", name="twitter:image", content=og[0]["content"])) == 1, route
        for script in ("assets/tool-showcase/showcase.mjs", "assets/js/tool-referral.mjs"):
            assert (artifact / script).is_file(), script

    html = (artifact / "ferramentas/index.html").read_text(encoding="utf-8")
    dom = Markup(html)
    expected = {item["href"] for item in data["entries"]}
    catalog_links = {tag["href"] for tag in dom.match("a", **{"class": "ts-card-action"})}
    assert expected == catalog_links
    assert len(dom.match("a", **{"class": "ts-card-action"})) == len(expected)
    for entry in data["entries"]:
        for href in [entry["href"], *(href for _, href in entry.get("links", []))]:
            assert destination_present(href, artifact), href
        share = dom.match("button", **{"data-cta-id": f"tool-share-card-{entry['id']}"})
        assert len(share) == 1, entry["id"]
        parsed = urlsplit(share[0]["data-share-url"])
        assert parsed.scheme == "https" and parsed.netloc == "confenge.com.br"
        assert set(parse_qs(parsed.query)) == {"utm_source", "utm_medium", "utm_campaign"}
        target = parsed.path + (f"#{parsed.fragment}" if parsed.fragment else "")
        assert destination_present(target, artifact), target

    schema = [
        json.loads(block) for block in re.findall(r'<script type="application/ld\+json">\s*(.*?)</script>', html, re.S)
    ]
    collection, = (node for node in schema if node.get("@type") == "CollectionPage")
    entries = collection["mainEntity"]["itemListElement"]
    assert {entry["url"] for entry in entries} == indexed
    assert [entry["position"] for entry in entries] == list(range(1, len(indexed) + 1))
    assert [entry["url"] for entry in entries] == [
        HOST + e["href"] for e in page_entries if e["page"].get("index", True)
    ]
    print(f"Tool catalogue: {len(expected)} direct entries, {len(meta_urls)} indexable pages, {len(images)} social cards")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    verify(parser.parse_args().root)
