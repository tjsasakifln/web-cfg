"""Graph nodes never mint public URLs; only existing assets are linked."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.graph import (
    detect_cannibalization,
    graph_nodes,
    public_path_exists,
    public_urls_from_graph,
    related_assets,
)
from scripts.contract_analysis.tests.helpers import complete_live_record


def test_graph_only_node_has_no_public_url():
    rec = complete_live_record()
    nodes = graph_nodes(rec)
    assert nodes
    company = next(n for n in nodes if n["kind"] == "company")
    assert company["public_url"] is None
    assert company["internal_only"] is True
    assert "Construtora Live Alfa" not in public_urls_from_graph(rec)


def test_related_assets_only_existing_paths():
    rec = complete_live_record(intent="bdi", angle="preco_bdi")
    assets = related_assets(rec, root=ROOT)
    assert assets
    for item in assets:
        assert public_path_exists(item["href"], root=ROOT)
        assert not item["href"].startswith("/empresa/")
        assert not item["href"].startswith("/orgao/")
        assert "/live-sul" not in item["href"]


def test_invented_entity_page_is_not_emitted():
    rec = complete_live_record()
    urls = public_urls_from_graph(rec, root=ROOT)
    for url in urls:
        assert "Construtora" not in url
        assert "Live Sul" not in url
        assert public_path_exists(url, root=ROOT)


def test_cannibalization_same_slug():
    rec = complete_live_record()
    other = complete_live_record(id="other", slug=rec["slug"], title="Título distinto o bastante")
    hits = detect_cannibalization(rec, [rec, other])
    assert any(code.startswith("cannibalization_slug") for code in hits)
