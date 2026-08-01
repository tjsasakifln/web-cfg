"""Internal link graph audit: depth, orphans, broken links, hub coverage."""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict, deque
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SITE = "https://confenge.com.br"

HUB_PATHS = {
    "/inteligencia/",
    "/inteligencia/mercados/",
    "/inteligencia/concorrencia/",
    "/inteligencia/orgaos/",
    "/inteligencia/precos/",
    "/inteligencia/cenarios/",
    "/radar/",
}


class _HrefParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        for k, v in attrs:
            if k == "href" and v:
                self.hrefs.append(v)


def normalize_url(href: str) -> str | None:
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return None
    if href.startswith(SITE):
        href = href[len(SITE) :]
    if href.startswith("http"):
        return None  # external
    if not href.startswith("/"):
        return None
    # strip query/fragment
    href = href.split("?", 1)[0].split("#", 1)[0]
    if not href.endswith("/") and "." not in Path(href).name:
        href = href + "/"
    return href


def collect_pages(site_root: Path) -> dict[str, Path]:
    pages: dict[str, Path] = {}
    for index in site_root.rglob("index.html"):
        try:
            rel = "/" + str(index.parent.relative_to(site_root)).replace("\\", "/") + "/"
        except ValueError:
            continue
        if rel.startswith("/assets/") or rel.startswith("/_site/"):
            continue
        pages[rel if rel != "/./" else "/"] = index
    # root
    if (site_root / "index.html").exists():
        pages["/"] = site_root / "index.html"
    return pages


def extract_links(html_path: Path) -> list[str]:
    text = html_path.read_text(encoding="utf-8", errors="replace")
    p = _HrefParser()
    p.feed(text)
    out: list[str] = []
    for h in p.hrefs:
        n = normalize_url(h)
        if n:
            out.append(n)
    return out


def _load_indexable_urls(site_root: Path) -> set[str] | None:
    """Prefer registry publish URLs; fall back to sitemap-inteligencia if present."""
    reg_path = site_root / "data" / "pseo" / "registry.json"
    if reg_path.exists():
        try:
            reg = json.loads(reg_path.read_text(encoding="utf-8"))
            urls = {
                str(p.get("url"))
                for p in (reg.get("pages") or [])
                if p.get("status") == "publish" and p.get("url")
            }
            return urls
        except (OSError, json.JSONDecodeError):
            pass
    sm = site_root / "sitemap-inteligencia.xml"
    if sm.exists():
        text = sm.read_text(encoding="utf-8", errors="replace")
        found = set(re.findall(r"<loc>https?://[^/]+(/[^<]+)</loc>", text))
        return found
    return None


def build_graph(site_root: Path) -> dict[str, Any]:
    pages = collect_pages(site_root)
    indexable = _load_indexable_urls(site_root)
    # Audit focus: indexable pSEO URLs + hubs (reject HTML on disk is not a crawl target)
    audit_urls = set(HUB_PATHS) | (indexable or set())
    if indexable is None:
        # No registry: audit all inteligencia/radar pages on disk
        audit_urls |= {u for u in pages if u.startswith(("/inteligencia/", "/radar/"))}

    edges: dict[str, list[str]] = {}
    broken: list[dict[str, str]] = []
    for url in sorted(audit_urls | set(pages.keys())):
        path = pages.get(url)
        if not path:
            continue
        hrefs = extract_links(path)
        edges[url] = []
        for h in hrefs:
            if h in pages:
                edges[url].append(h)
            elif h.startswith(("/inteligencia/", "/radar/")) and (
                indexable is None or h in (indexable or set())
            ):
                broken.append({"from": url, "to": h})

    # BFS depth from hubs
    depth: dict[str, int] = {}
    q: deque[str] = deque()
    for h in HUB_PATHS:
        if h in pages:
            depth[h] = 0
            q.append(h)
    if "/" in pages and "/" not in depth:
        depth["/"] = 0
        q.append("/")
    while q:
        u = q.popleft()
        for v in edges.get(u, []):
            if v not in depth:
                depth[v] = depth[u] + 1
                q.append(v)

    focus = {u for u in audit_urls if u.startswith(("/inteligencia/", "/radar/"))}
    orphans = sorted(u for u in focus if u not in depth and u not in HUB_PATHS)
    deep = sorted(u for u, d in depth.items() if d > 3 and u in focus)
    in_degree: dict[str, int] = defaultdict(int)
    for src, dests in edges.items():
        for d in dests:
            in_degree[d] += 1
    zero_in = sorted(
        u
        for u in focus
        if in_degree[u] == 0 and u not in HUB_PATHS and u not in {"/inteligencia/", "/radar/"}
    )

    return {
        "n_pages": len(pages),
        "n_audit_urls": len(focus),
        "n_internal_edges": sum(len(v) for v in edges.values()),
        "hubs_present": sorted(h for h in HUB_PATHS if h in pages),
        "orphans_unreachable_from_hub": orphans,
        "depth_gt_3": deep,
        "zero_indegree": zero_in,
        "broken_internal": broken[:200],
        "n_broken": len(broken),
        "ok": len(orphans) == 0 and len(deep) == 0 and len(broken) == 0,
        "note": (
            "Depth measured from editorial hubs for indexable (publish) URLs only; "
            "reject HTML left on disk is not treated as an orphan crawl target"
        ),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--out", type=Path, default=ROOT / "seo" / "pseo-link-graph-audit.json")
    args = parser.parse_args(argv)
    report = build_graph(args.root)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "out": str(args.out), "orphans": len(report["orphans_unreachable_from_hub"]), "broken": report["n_broken"]}, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
