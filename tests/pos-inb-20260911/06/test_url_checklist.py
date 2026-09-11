"""Drive shipped inspect/probe. Sitemap loc is not indexed. Transport fail is unobserved."""

from __future__ import annotations

import importlib.util
from pathlib import Path

from scripts.discovery.http_client import FakeTransport, ProbeResponse
from scripts.discovery.inspect import inspect_asset, inspect_url_layers
from scripts.discovery.schema import UNKNOWN
from scripts.discovery.url_inspection import inspect_urls

ROOT = Path(__file__).resolve().parents[3]
_SPEC = importlib.util.spec_from_file_location(
    "pos_inb_06_audit",
    ROOT / "scripts/campaigns/pos-inb-20260911/06/audit_discovery.py",
)
assert _SPEC and _SPEC.loader
_AUDIT = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_AUDIT)
audit_local_urls = _AUDIT.audit_local_urls
live_probe_safe = _AUDIT.live_probe_safe
load_priority = _AUDIT.load_priority


def test_priority_set_covers_required_roles() -> None:
    rows = load_priority(root=ROOT)
    roles = {item["role"] for item in rows}
    paths = {item["path"] for item in rows}
    assert "compra_principal" in roles
    assert "complementares" in roles
    assert "parcerias" in roles
    assert "demonstrativo" in roles
    assert "prontidao" in roles
    assert "conteudo_decisao" in roles
    assert "pilar_publico" in roles
    assert "/quantitativos-orcamento-obras/" in paths
    assert "/revisao-tecnica-projetos-engenharia/" in paths
    assert "/compatibilizacao-projetos-engenharia/" in paths
    assert "/projetos-complementares-engenharia/" in paths
    assert "/parcerias-engenharia/" in paths
    assert "/ferramentas/prontidao-tecnica-obra-privada/" in paths
    assert "/medicoes-glosas-obras-publicas/" in paths


def test_local_checklist_every_url_has_layers() -> None:
    checklist = audit_local_urls(root=ROOT)
    assert checklist["indexed_from_sitemap"] is False
    assert checklist["sitemap_loc_is_not_indexed"] is True
    assert checklist["count"] == len(load_priority(root=ROOT))
    for row in checklist["urls"]:
        assert row["canonical"].startswith("https://confenge.com.br/")
        assert "source" in row["layers"]
        assert "artifact" in row["layers"]
        assert row["indexed"] == UNKNOWN
        assert row["indexed_from_sitemap"] is False
        source = row["layers"]["source"]
        assert source.get("http", {}).get("local_file") == "present"
        assert source.get("indexed") == UNKNOWN
        assert source.get("indexed_from_sitemap") is False
        assert "robots_meta" in source or row.get("robots_meta") is not None
        assert "essential_content_without_js" in source or "essential_content_without_js" in row
        assert isinstance(row.get("internal_hrefs"), list)


def test_sitemap_membership_does_not_set_indexed() -> None:
    canonical = "https://confenge.com.br/quantitativos-orcamento-obras/"
    inspected = inspect_asset(
        {"id": "q", "canonical": canonical, "index_intent": "index"},
        root=ROOT,
    )
    assert inspected["sitemap"] is True
    assert inspected["indexed"] == UNKNOWN
    assert inspected["indexed_from_sitemap"] is False
    layers = inspect_url_layers(canonical, root=ROOT)
    assert layers["sitemap_membership"] is True
    assert layers["indexed"] == UNKNOWN
    assert layers["indexed_from_sitemap"] is False


def test_live_transport_failure_is_unobserved_not_404() -> None:
    canonical = "https://confenge.com.br/quantitativos-orcamento-obras/"
    fake = FakeTransport()
    fake.add(
        "GET",
        canonical,
        ProbeResponse("GET", canonical, None, error="unavailable"),
    )
    fake.add(
        "GET",
        "https://confenge.com.br/robots.txt",
        ProbeResponse("GET", "https://confenge.com.br/robots.txt", None, error="unavailable"),
    )
    result = live_probe_safe(canonical, transport=fake, retries=0, timeout=1.0)
    assert result["status"] == UNKNOWN
    assert result["observation"] == "unobserved"
    assert result["public_availability"] == "UNOBSERVED"
    assert result["http_status"] is None
    assert result["http_status"] != 404
    assert result["not_public_404"] is True
    assert result["indexed"] == UNKNOWN


def test_url_inspection_never_calls_indexing_api() -> None:
    result = inspect_urls(
        ["https://confenge.com.br/quantitativos-orcamento-obras/"],
        inspected_at="2026-09-11T12:00:00Z",
    )
    assert result["indexing_api_called"] is False
    assert "Indexing API" in (result.get("note") or "")
    for row in result["inspections"]:
        assert row["indexing_api_called"] is False
        assert row["index_state"] == UNKNOWN
    src = (ROOT / "scripts/discovery/url_inspection.py").read_text(encoding="utf-8")
    assert "urlInspection" in src
    assert ".index().inspect" in src
    assert "indexing.googleapis.com" not in src
    assert "urlNotifications.publish" not in src
    assert "INDEXING_API_CALLED = False" in src


def test_missing_artifact_is_unobserved_not_404() -> None:
    layers = inspect_url_layers(
        "https://confenge.com.br/quantitativos-orcamento-obras/",
        root=ROOT,
    )
    assert (ROOT / "_site").is_dir() is False
    assert layers["artifact_observation"] == "UNOBSERVED"
    assert layers["layers"]["artifact"]["http"]["status"] != 404
    assert layers["layers"]["artifact"]["http"]["local_file"] == "absent"
