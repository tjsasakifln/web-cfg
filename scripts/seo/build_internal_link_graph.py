"""Full-site internal link graph for docs/seo/INTERNAL-LINK-GRAPH.{json,html}."""

from __future__ import annotations

import json
import sys
from collections import defaultdict, deque
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.pseo.link_graph import collect_pages, extract_links  # noqa: E402

COMMERCIAL = {
    "/",
    "/diretoria-b2g/",
    "/bid-room-licitacoes-obras/",
    "/defesa-margem-contratos-publicos/",
    "/diagnostico-b2g-360/",
    "/diagnostico-pre-licitacao/",
    "/auditoria-orcamento-licitacao/",
    "/acompanhamento-contratos-obras/",
    "/aditivos-obras-publicas/",
    "/reequilibrio-obras-publicas/",
    "/medicoes-glosas-obras-publicas/",
    "/atrasos-prorrogacao-obras-publicas/",
    "/defesa-tecnica-contratos-publicos/",
}


def build(site_root: Path) -> dict:
    pages = collect_pages(site_root)
    edges: dict[str, list[str]] = {}
    for url, path in pages.items():
        hrefs = extract_links(path)
        edges[url] = [h for h in hrefs if h in pages]

    in_degree: dict[str, int] = defaultdict(int)
    out_degree: dict[str, int] = {}
    for src, dests in edges.items():
        out_degree[src] = len(dests)
        for d in dests:
            in_degree[d] += 1
    for u in pages:
        in_degree.setdefault(u, 0)
        out_degree.setdefault(u, 0)

    # BFS from homepage
    depth: dict[str, int] = {}
    if "/" in pages:
        depth["/"] = 0
        q = deque(["/"])
        while q:
            u = q.popleft()
            for v in edges.get(u, []):
                if v not in depth:
                    depth[v] = depth[u] + 1
                    q.append(v)

    orphans = sorted(u for u in pages if u not in depth and u != "/")
    # Connected components (undirected)
    undirected: dict[str, set[str]] = defaultdict(set)
    for s, ds in edges.items():
        for d in ds:
            undirected[s].add(d)
            undirected[d].add(s)
    seen: set[str] = set()
    components: list[list[str]] = []
    for u in pages:
        if u in seen:
            continue
        comp: list[str] = []
        stack = [u]
        seen.add(u)
        while stack:
            x = stack.pop()
            comp.append(x)
            for y in undirected.get(x, []):
                if y not in seen:
                    seen.add(y)
                    stack.append(y)
        components.append(sorted(comp))
    components.sort(key=len, reverse=True)
    disconnected = [c for c in components[1:] if c]  # all except largest

    commercial_support = []
    for c in sorted(COMMERCIAL):
        if c not in pages:
            continue
        commercial_support.append(
            {
                "url": c,
                "in_degree": in_degree.get(c, 0),
                "out_degree": out_degree.get(c, 0),
                "depth_from_home": depth.get(c),
                "under_supported": in_degree.get(c, 0) < 2 and c != "/",
            }
        )

    nodes = [
        {
            "url": u,
            "in_degree": in_degree[u],
            "out_degree": out_degree[u],
            "depth_from_homepage": depth.get(u),
            "orphan": u in orphans,
        }
        for u in sorted(pages)
    ]

    # Human review package (pSEO Wave1 + editorial Approval Center) — must not be orphaned
    wave1_path = site_root / "data" / "pseo" / "WAVE1-PACKAGE.json"
    wave1_urls: list[str] = []
    wave1_orphans: list[str] = []
    if wave1_path.exists():
        try:
            wpkg = json.loads(wave1_path.read_text(encoding="utf-8"))
            wave1_urls = [p.get("url") for p in (wpkg.get("pages") or []) if p.get("url")]
            wave1_orphans = [u for u in wave1_urls if u not in depth]
        except (OSError, json.JSONDecodeError):
            pass

    editorial_review_urls: list[str] = []
    editorial_orphans: list[str] = []
    ed_reg = site_root / "data" / "editorial" / "EDITORIAL-REGISTRY.json"
    if ed_reg.exists():
        try:
            ereg = json.loads(ed_reg.read_text(encoding="utf-8"))
            for p in ereg.get("pages") or []:
                st = p.get("status") or ""
                url = p.get("url")
                if not url:
                    continue
                if st in {
                    "EDITORIAL_REVIEWED",
                    "READY_FOR_HUMAN_APPROVAL",
                    "HUMAN_APPROVED",
                    "INDEXABLE",
                    "PUBLISHED",
                }:
                    editorial_review_urls.append(url)
            editorial_orphans = [u for u in editorial_review_urls if u not in depth]
        except (OSError, json.JSONDecodeError):
            pass

    review_package_urls = list(dict.fromkeys(wave1_urls + editorial_review_urls))
    review_package_orphans = [u for u in review_package_urls if u not in depth]

    # Intended: commercial + editorial/pSEO hubs + full human review package
    intended = set(COMMERCIAL) | {
        "/inteligencia/",
        "/inteligencia/mercados/",
        "/inteligencia/orgaos/",
        "/inteligencia/precos/",
        "/inteligencia/concorrencia/",
        "/inteligencia/cenarios/",
        "/radar/",
        "/conteudos/",
        "/metodologia-inteligencia/",
        "/guias-contratos-obras/",
        "/lei-14133-obras/",
        "/jurisprudencia-contratos-obras/",
    }
    intended |= set(wave1_urls)
    intended |= set(editorial_review_urls)
    intended_orphans = sorted(u for u in intended if u in pages and u not in depth)

    return {
        "schema_version": "1.0.0",
        "artifact": "INTERNAL-LINK-GRAPH",
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "n_pages": len(pages),
        "n_edges": sum(out_degree.values()),
        "orphans": orphans,
        "n_orphans": len(orphans),
        "orphans_note": (
            "Full-site orphans include noindex preview leaves not listed on hubs; "
            "gating metric is intended_orphans + wave1_review_orphans."
        ),
        "wave1_review_urls": len(wave1_urls),
        "wave1_review_orphans": wave1_orphans,
        "n_wave1_review_orphans": len(wave1_orphans),
        "editorial_review_urls": len(editorial_review_urls),
        "editorial_review_orphans": editorial_orphans,
        "n_editorial_review_orphans": len(editorial_orphans),
        "review_package_urls": len(review_package_urls),
        "review_package_orphans": review_package_orphans,
        "n_review_package_orphans": len(review_package_orphans),
        "intended_orphans": intended_orphans,
        "n_intended_orphans": len(intended_orphans),
        "depth_stats": {
            "max": max(depth.values()) if depth else None,
            "unreachable": len(orphans),
        },
        "disconnected_clusters": [
            {"size": len(c), "sample": c[:10]} for c in disconnected[:20]
        ],
        "n_disconnected_clusters": len(disconnected),
        "commercial_pages": commercial_support,
        "under_supported_commercial": [
            x for x in commercial_support if x.get("under_supported")
        ],
        "nodes": nodes,
        "ok": (
            len(wave1_orphans) == 0
            and len(editorial_orphans) == 0
            and len(intended_orphans) == 0
        ),
    }


def to_html(g: dict) -> str:
    rows = "".join(
        f"<tr><td><code>{n['url']}</code></td><td>{n['in_degree']}</td>"
        f"<td>{n['out_degree']}</td><td>{n['depth_from_homepage']}</td>"
        f"<td>{'yes' if n['orphan'] else ''}</td></tr>"
        for n in g["nodes"][:500]
    )
    return f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><title>INTERNAL-LINK-GRAPH</title>
<style>body{{font-family:system-ui,sans-serif;margin:2rem;background:#0b1220;color:#e8eef7}}
table{{border-collapse:collapse;width:100%;font-size:12px}}
th,td{{border:1px solid #243049;padding:.3rem}} th{{background:#152038}}</style></head>
<body>
<h1>Internal Link Graph</h1>
<p>pages={g['n_pages']} edges={g['n_edges']} orphans={g['n_orphans']}
disconnected_clusters={g['n_disconnected_clusters']}</p>
<p>Under-supported commercial: {len(g.get('under_supported_commercial') or [])}</p>
<table><thead><tr><th>URL</th><th>in</th><th>out</th><th>depth</th><th>orphan</th></tr></thead>
<tbody>{rows}</tbody></table>
</body></html>
"""


def main() -> int:
    g = build(ROOT)
    out = ROOT / "docs" / "seo"
    out.mkdir(parents=True, exist_ok=True)
    (out / "INTERNAL-LINK-GRAPH.json").write_text(
        json.dumps(g, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (out / "INTERNAL-LINK-GRAPH.html").write_text(to_html(g), encoding="utf-8")
    # also keep seo/ audit path
    (ROOT / "seo" / "pseo-link-graph-audit.json").write_text(
        json.dumps(
            {
                "ok": g["ok"],
                "n_pages": g["n_pages"],
                "n_orphans": g["n_orphans"],
                "orphans_unreachable_from_hub": g["orphans"][:100],
                "under_supported_commercial": g["under_supported_commercial"],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "ok": g["ok"],
                "n_pages": g["n_pages"],
                "n_orphans": g["n_orphans"],
                "under_supported_commercial": len(g["under_supported_commercial"]),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
