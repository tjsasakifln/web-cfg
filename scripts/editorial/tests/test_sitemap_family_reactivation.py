"""Approved editorial segments re-enter an index that withdrew empty families."""
from pathlib import Path

from scripts.editorial import build
from scripts.organic.sitemap_graph import load_graph_locs, render_sitemap_index

ROOT = Path(__file__).resolve().parents[3]


def test_approved_editorial_family_is_registered_before_graph_closure(tmp_path, monkeypatch):
    paths = (
        "/guias-contratos-obras/checklist-pedido-aditivo/",
        "/lei-14133-obras/preco-item-novo-desconto-proposta/",
        "/guias-contratos-obras/",
        "/lei-14133-obras/",
    )
    for url in paths:
        rel = url.strip("/") + "/index.html"
        dest = tmp_path / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text((ROOT / rel).read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / "sitemap-index.xml").write_text(render_sitemap_index([]), encoding="utf-8")
    monkeypatch.setattr(build, "ROOT", tmp_path)
    counts = build.write_segmented_sitemaps([
        {"url": paths[0], "archetype": "guia", "date_modified": "2026-08-04"},
        {"url": paths[1], "archetype": "lei_14133", "date_modified": "2026-08-04"},
    ])
    assert counts["editorial"] == 4
    assert set(load_graph_locs(tmp_path)) == {build.SITE + path for path in paths}
    assert "sitemap-editorial.xml" in (tmp_path / "sitemap-index.xml").read_text(encoding="utf-8")
    assert "sitemap-jurisprudencia.xml" not in (tmp_path / "sitemap-index.xml").read_text(encoding="utf-8")
