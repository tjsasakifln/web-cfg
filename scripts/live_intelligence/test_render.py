"""write_pages() must prune pages for opportunities that are no longer
renderable, not just write the current ones. Without this, a stale/REJECTed
or dropped opportunity leaves its page on disk forever."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from scripts.live_intelligence import render as R


def _tmp_root():
    return Path(tempfile.mkdtemp())


def test_write_pages_removes_orphaned_directories():
    tmp = _tmp_root()
    try:
        base = tmp / R.FAMILY_SLUG
        base.mkdir(parents=True)
        orphan = base / "orphan-old-opp"
        orphan.mkdir()
        (orphan / "index.html").write_text("stale", encoding="utf-8")

        projection = R.load_projection()
        live_ids = {r["opportunity_id"] for r in R.renderable(projection)}
        assert live_ids, "fixture projection must have at least one READY record"

        written = R.write_pages(projection, root=tmp)
        assert len(written) == len(live_ids)
        assert not orphan.exists(), "orphaned opportunity directory must be pruned"
        for opportunity_id in live_ids:
            assert (base / opportunity_id / "index.html").exists()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_write_pages_keeps_pncp_ids_with_slash_and_prunes_others():
    """Producer PNCP ids contain `/` and must survive as nested page dirs."""
    tmp = _tmp_root()
    try:
        base = tmp / R.FAMILY_SLUG
        projection = {
            "index_eligible": False,
            "opportunities": [
                {
                    "opportunity_id": "12345678000190-1/2026",
                    "objeto": "Pavimentação",
                    "orgao": {"nome": "Município"},
                    "local": {"municipio": "Chapecó", "uf": "SC"},
                    "prazo": {"status": "ABERTA", "data_encerramento": "2026-09-24"},
                    "valor": {"estimado_brl": "2500000", "faixa": "1M_10M", "epistemic_class": "FACT"},
                    "fonte": [{"nome": "PNCP", "url": "https://pncp.gov.br/app/editais/1"}],
                    "freshness": {
                        "source_as_of": "2026-09-01T03:00:00+00:00",
                        "generated_at": "2026-09-01T09:00:00+00:00",
                        "max_age_hours": 48,
                    },
                    "publication_state": "PUBLISHABLE_NOINDEX",
                    "index_eligible": False,
                    "source_kind": "test_only_fixture",
                    "content_hash": "abc",
                }
            ],
        }
        orphan = base / "orphan-old-opp"
        orphan.mkdir(parents=True)
        (orphan / "index.html").write_text("stale", encoding="utf-8")
        written = R.write_pages(projection, root=tmp)
        assert len(written) == 1
        page = base / "12345678000190-1" / "2026" / "index.html"
        assert page.exists()
        html = page.read_text(encoding="utf-8")
        assert "R$ 2.500.000,00" in html
        assert "1M_10M" in html
        assert "company_ref" not in html
        assert not orphan.exists()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_official_index_page_emits_canonical_robots_and_sitemap():
    tmp = _tmp_root()
    try:
        record = {
            "opportunity_id": "12345678000190-1/2026",
            "objeto": "Pavimentação asfáltica de via urbana",
            "orgao": {"nome": "Município de Chapecó"},
            "local": {"municipio": "Chapecó", "uf": "SC"},
            "prazo": {"status": "ABERTA", "data_encerramento": "2026-09-24"},
            "valor": {"estimado_brl": "2500000", "faixa": "1M_10M", "epistemic_class": "FACT"},
            "fonte": [{"nome": "PNCP", "url": "https://pncp.gov.br/app/editais/1"}],
            "freshness": {
                "source_as_of": "2026-09-01T03:00:00+00:00",
                "generated_at": "2026-09-01T09:00:00+00:00",
                "max_age_hours": 48,
            },
            "publication_state": "PUBLISHABLE_INDEX",
            "index_eligible": True,
            "source_kind": "official_live",
            "content_hash": "abc",
        }
        projection = {
            "source_kind": "official_live",
            "index_eligible": True,
            "opportunities": [record],
        }
        written = R.write_pages(projection, root=tmp)
        html = written[0].read_text(encoding="utf-8")
        assert 'content="index,follow" name="robots"' in html
        assert 'rel="canonical"' in html
        assert "https://confenge.com.br/oportunidades/12345678000190-1/2026/" in html
        assert "company_ref" not in html
        sitemap = (tmp / R.SITEMAP_NAME).read_text(encoding="utf-8")
        assert "https://confenge.com.br/oportunidades/12345678000190-1/2026/" in sitemap
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_write_pages_reruns_are_idempotent_and_still_prune():
    tmp = _tmp_root()
    try:
        projection = R.load_projection()
        live_ids = {r["opportunity_id"] for r in R.renderable(projection)}
        R.write_pages(projection, root=tmp)
        # Second run with one record dropped from the export must remove that
        # opportunity's page, not just leave it stale on disk.
        dropped_id = next(iter(live_ids))
        trimmed = dict(projection)
        trimmed["opportunities"] = [
            r for r in projection["opportunities"] if r["opportunity_id"] != dropped_id
        ]
        R.write_pages(trimmed, root=tmp)
        base = tmp / R.FAMILY_SLUG
        assert not (base / dropped_id).exists(), "dropped opportunity page must be pruned on rerun"
        for opportunity_id in live_ids - {dropped_id}:
            assert (base / opportunity_id / "index.html").exists()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
