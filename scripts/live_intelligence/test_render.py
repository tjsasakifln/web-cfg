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
