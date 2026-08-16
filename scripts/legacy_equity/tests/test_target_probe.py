"""Probe ready CONFENGE targets via the shipped crawler (built artifact).

HOLD rows are not fetched as redirects. Live GET is optional; the in-repo
publish root is the bar when the network is unavailable.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts/migration"))

from crawl_targets import crawl  # noqa: E402
from legacy_equity.inventory import hold_entries, ready_redirects  # noqa: E402


def test_ready_targets_are_live_confenge_pages_on_disk():
    report = crawl()
    assert report["ok"], report["failures"][:8]
    ready = [r for r in report["rows"] if r["decision"] == "REDIRECT_301"]
    assert len(ready) == 11
    for row in ready:
        assert row["status"] == 200, row
        assert row["canonical"].startswith("https://confenge.com.br/")
        assert row["has_confenge_brand"]
        assert not row["has_smartlic_brand"]
        robots = (row.get("robots") or "").lower()
        assert "noindex" not in robots
        assert row.get("soft_404") is False
        assert row.get("chain") is False
        assert row.get("loop") is False
        assert "/consultoria-b2g" not in (row.get("canonical") or "")
        host = (row.get("canonical") or "").split("/")[2] if "://" in (row.get("canonical") or "") else ""
        assert host == "confenge.com.br"
        path = "/" + "/".join((row.get("canonical") or "").split("/")[3:])
        assert path.rstrip("/") not in {"", "/"}


def test_hold_rows_are_not_fetched_as_redirects():
    holds = hold_entries()
    assert holds
    report = crawl()
    fetched_holds = [
        r
        for r in report["rows"]
        if r["decision"] == "HOLD_TARGET_NOT_READY" and r.get("status") == 200
    ]
    assert fetched_holds == []
    for entry in holds:
        assert entry["skip_reason"]
        assert "HOLD_TARGET_NOT_READY" in entry["skip_reason"]
        assert entry["intended_future_surface"]
        assert not str(entry["intended_future_surface"]).startswith("https://")
        assert entry["target"] in (None, "")


def test_ready_set_is_the_eleven_pinned_paths():
    paths = {e["legacy_url"] for e in ready_redirects()}
    assert paths == {
        "https://smartlic.tech/blog/aditivos-contratuais-o-que-sao-como-monitorar",
        "https://smartlic.tech/blog/orgaos-risco-atraso-pagamento-licitacao",
        "https://smartlic.tech/glossario/aditivo-contratual",
        "https://smartlic.tech/glossario/mapa-de-riscos",
        "https://smartlic.tech/glossario/matriz-de-riscos",
        "https://smartlic.tech/glossario/medicao",
        "https://smartlic.tech/glossario/reajuste",
        "https://smartlic.tech/glossario/reequilibrio-economico-financeiro",
        "https://smartlic.tech/perguntas/indice-reajuste-contrato-publico",
        "https://smartlic.tech/perguntas/prazo-pagamento-contrato-publico",
        "https://smartlic.tech/perguntas/reequilibrio-economico-financeiro",
    }
