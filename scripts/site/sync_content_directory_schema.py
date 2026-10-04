"""Project the visible library directory into its CollectionPage ItemList."""
from __future__ import annotations

import json
import re
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[2]


class DirectoryParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_card = False
        self.in_title = False
        self.current_url = None
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "article" and "data-content-item" in attrs:
            self.in_card = True
            self.current_url = None
        if self.in_card and tag == "h3":
            self.in_title = True
        if self.in_card and self.in_title and tag == "a":
            self.current_url = attrs.get("href")

    def handle_endtag(self, tag):
        if tag == "h3":
            self.in_title = False
        if tag == "article" and self.in_card:
            if not self.current_url or not self.current_url.startswith("/conteudos/"):
                raise ValueError("directory_card_without_local_title_link")
            self.urls.append("https://confenge.com.br" + self.current_url)
            self.in_card = False


def sync_directory_schema(text: str) -> str:
    parser = DirectoryParser()
    parser.feed(text)
    urls = parser.urls
    if not urls or len(set(urls)) != len(urls):
        raise ValueError("directory_empty_or_duplicate_urls")
    found = False

    def rewrite(match: re.Match[str]) -> str:
        nonlocal found
        data = json.loads(match.group(2))
        nodes = data.get("@graph", [data])
        for node in nodes:
            if node.get("@type") != "CollectionPage" or node.get("url") != "https://confenge.com.br/conteudos/":
                continue
            found = True
            node["mainEntity"] = {
                "@type": "ItemList", "numberOfItems": len(urls),
                "itemListElement": [
                    {"@type": "ListItem", "position": i, "url": url}
                    for i, url in enumerate(urls, 1)
                ],
            }
        return match.group(1) + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + match.group(3)

    result = re.sub(r'(<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>)(.*?)(</script>)', rewrite, text, flags=re.S | re.I)
    if not found:
        raise ValueError("directory_collection_schema_missing")
    return result


def sync(root: Path = ROOT) -> bool:
    path = root / "conteudos/index.html"
    before = path.read_text(encoding="utf-8")
    after = sync_directory_schema(before)
    if after == before:
        return False
    path.write_text(after, encoding="utf-8", newline="\n")
    return True


if __name__ == "__main__":
    print("Directory schema synchronized:", sync())
