#!/usr/bin/env python3
"""Fail closed when internal previews re-enter the public package."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.public_artifact import PUBLIC_TOP_DIRS, assemble_public_artifact, omit_production_review_packet  # noqa: E402


def test_review_packet_stays_available_to_preview_but_not_production(tmp_path: Path) -> None:
    well_known = tmp_path / ".well-known"
    well_known.mkdir()
    packet = well_known / "editorial-review-packet.json"
    packet.write_text('{"review_target_sha":"fixture-not-an-approval"}', encoding="utf-8")
    identity = well_known / "build-info.json"
    identity.write_text('{"commit":"fixture"}', encoding="utf-8")
    assert omit_production_review_packet(tmp_path, "deploy-preview") == []
    assert packet.is_file()
    assert omit_production_review_packet(tmp_path, "production") == [".well-known/editorial-review-packet.json"]
    assert not packet.exists()
    assert identity.is_file()
    assert (ROOT / ".well-known/editorial-review-packet.json").is_file()


def test_preview_sources_are_preserved_but_not_packaged() -> None:
    decision = json.loads(
        (ROOT / "data/editorial/public-preview-route-decisions.json").read_text(encoding="utf-8")
    )
    groups = {row["id"]: row for row in decision["groups"]}
    assert len(groups["pilot-preview"]["routes"]) == 24
    assert len(groups["packaged-opportunity-fixtures"]["routes"]) == 5
    assert len(groups["unapproved-market-panorama"]["routes"]) == 2
    assert groups["unprotected-editorial-review-shell"]["routes"] == [
        "/ops/wave1-review.html",
        "/ops/README-data.txt",
    ]

    assert {"piloto", "oportunidades", "panorama-mercado-obras-publicas"}.isdisjoint(
        PUBLIC_TOP_DIRS
    )
    for group in groups.values():
        assert (ROOT / group["source_root"]).exists(), group["source_root"]

    dest_name = "_site_test_public_preview_retirement"
    try:
        assemble_public_artifact(root=ROOT, dest_name=dest_name)
        dest = ROOT / dest_name
        assert not (dest / "piloto").exists()
        assert not (dest / "oportunidades").exists()
        assert not (dest / "panorama-mercado-obras-publicas").exists()
        assert (dest / "ops/index.html").exists(), "public operator login shell was removed"
        assert not (dest / "ops/wave1-review.html").exists()
        assert not (dest / "ops/README-data.txt").exists()
    finally:
        shutil.rmtree(ROOT / dest_name, ignore_errors=True)


def test_withdrawn_routes_have_exact_410_rules() -> None:
    decision = json.loads(
        (ROOT / "data/editorial/public-preview-route-decisions.json").read_text(encoding="utf-8")
    )
    redirects = (ROOT / "_redirects").read_text(encoding="utf-8").splitlines()
    for group in decision["groups"]:
        for route in group["runtime_rules"]:
            assert f"{route} /404.html 410" in redirects

    assert "/oportunidades/* /404.html 410" not in redirects


if __name__ == "__main__":
    test_preview_sources_are_preserved_but_not_packaged()
    test_withdrawn_routes_have_exact_410_rules()
    print("PUBLIC_PREVIEW_RETIREMENT_OK")
