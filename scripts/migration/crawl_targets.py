#!/usr/bin/env python3
"""Crawl ready manifesto targets against the built publish root (_site or source).

Does not probe live smartlic.tech 301s — those belong to SmartLic#2115.
"""

from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/migration"))
from manifesto_lib import load_manifesto, ready_redirects  # noqa: E402

PUBLISH_CANDIDATES = (ROOT / "_site", ROOT)


class _Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical = None
        self.robots = None
        self.title = ""
        self._in_title = False
        self.jsonld = []
        self._in_ld = False
        self._ld_buf = []
        self.brand_hits = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "link" and d.get("rel") == "canonical":
            self.canonical = d.get("href")
        if tag == "meta" and d.get("name") == "robots":
            self.robots = d.get("content")
        if tag == "title":
            self._in_title = True
        if tag == "script" and d.get("type") == "application/ld+json":
            self._in_ld = True
            self._ld_buf = []

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag == "script" and self._in_ld:
            self._in_ld = False
            raw = "".join(self._ld_buf)
            try:
                self.jsonld.append(json.loads(raw))
            except json.JSONDecodeError:
                self.jsonld.append({"_raw": raw[:200]})

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_ld:
            self._ld_buf.append(data)


def resolve_publish() -> Path:
    site = ROOT / "_site"
    if (site / "index.html").is_file():
        return site
    return ROOT


def target_to_file(publish: Path, target_url: str) -> Path:
    path = urlparse(target_url).path
    if path.endswith("/"):
        return publish / path.strip("/") / "index.html"
    return publish / path.lstrip("/")


def jsonld_names(blobs) -> list[str]:
    names = []

    def walk(obj):
        if isinstance(obj, dict):
            if "name" in obj:
                names.append(str(obj["name"]))
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for i in obj:
                walk(i)

    for b in blobs:
        walk(b)
    return names


def crawl() -> dict:
    publish = resolve_publish()
    manifesto = load_manifesto()
    rows = []
    failures = []
    sample_retire = [e for e in manifesto["entries"] if e["decision"] == "RETIRE"][:25]
    for entry in ready_redirects(manifesto) + sample_retire:
        rec = {
            "legacy_url": entry["legacy_url"],
            "decision": entry["decision"],
            "target_url": entry.get("target_url"),
            "status": None,
        }
        if entry["decision"] == "RETIRE":
            rec["status"] = "retire_no_fetch"
            rec["expected_http"] = entry["expected_http"]
            rows.append(rec)
            continue
        html_path = target_to_file(publish, entry["target_url"])
        if not html_path.is_file():
            rec["status"] = "missing_file"
            rec["path"] = str(html_path)
            failures.append(rec)
            rows.append(rec)
            continue
        text = html_path.read_text(encoding="utf-8", errors="replace")
        parser = _Head()
        parser.feed(text)
        rec["status"] = 200
        rec["file"] = str(html_path.relative_to(publish))
        rec["canonical"] = parser.canonical
        rec["robots"] = parser.robots
        rec["title"] = parser.title.strip()
        rec["jsonld_names"] = jsonld_names(parser.jsonld)
        rec["has_confenge_brand"] = "CONFENGE" in text
        rec["has_smartlic_brand"] = bool(re.search(r"SmartLic", text, re.I))
        rec["has_cta"] = bool(re.search(r"#contato|wa\.me|data-cta|Analisar", text))
        rec["soft_404"] = False
        rec["chain"] = False
        rec["loop"] = False
        if parser.canonical != entry.get("expected_canonical"):
            rec["canonical_mismatch"] = True
            failures.append({**rec, "error": "canonical_mismatch"})
        if parser.robots and "noindex" in parser.robots.lower():
            rec["accidental_noindex"] = True
            failures.append({**rec, "error": "noindex"})
        if rec["has_smartlic_brand"]:
            failures.append({**rec, "error": "smartlic_brand"})
        if not rec["has_confenge_brand"]:
            failures.append({**rec, "error": "missing_confenge"})
        if not rec["has_cta"]:
            failures.append({**rec, "error": "missing_cta"})
        rows.append(rec)
    return {
        "publish": str(publish),
        "ok": not failures,
        "failures": failures,
        "rows": rows,
    }


def main() -> int:
    report = crawl()
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if out:
        out.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
