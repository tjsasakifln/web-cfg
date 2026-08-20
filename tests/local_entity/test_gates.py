"""Fail-closed: invented NAP/review/credential, PII, collapse, GSC-as-zero, trees, landing."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.local_entity.census import build_census, validate_census, validate_gsc_live
from scripts.local_entity.constants import SURFACE_DECISIONS
from scripts.local_entity.graph import extract_entity_graph
from scripts.local_entity.persist import persist_json
from scripts.local_entity.validate import (
    ExclusivePathError,
    PIILeakError,
    assert_exclusive_write_paths,
    audit_graph_honesty,
    audit_html_honesty,
    new_public_landing_paths,
    scan_artifact_payload,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_invented_nap_localbusiness_postaladdress_rejected() -> None:
    html = _load("invented-nap.html")
    graph = extract_entity_graph(html)
    errors = audit_graph_honesty(graph, html)
    joined = " ".join(errors)
    assert errors
    assert "invented_nap" in joined or "invented_local_business" in joined
    assert any("streetAddress" in e or "PostalAddress" in e or "LocalBusiness" in e for e in errors)


def test_invented_review_and_aggregate_rating_rejected() -> None:
    html = _load("invented-review.html")
    errors = audit_html_honesty(html)
    joined = " ".join(errors)
    assert errors
    assert "invented_review" in joined


def test_invented_crea_badge_credential_rejected() -> None:
    html = _load("invented-credential.html")
    errors = audit_html_honesty(html)
    joined = " ".join(errors)
    assert errors
    assert "invented_credential" in joined


def test_collapsed_map_pack_into_organic_rejected() -> None:
    doc = json.loads(_load("collapsed-census.json"))
    errors = validate_census(doc)
    assert errors
    assert any("collapsed" in e or "invalid_channel" in e for e in errors)
    with pytest.raises(Exception):
        build_census(rows=doc["rows"], gsc_live=doc.get("gsc_live"))


def test_gsc_blocked_as_zero_or_product_ready_rejected() -> None:
    payload = json.loads(_load("gsc-blocked-as-zero.json"))
    errors = validate_gsc_live(payload)
    assert "gsc_blocked_as_zero" in errors
    assert "gsc_blocked_product_ready" in errors
    missing = {"status": "UNKNOWN", "impressions": 0, "ready_for_product_decisions": True}
    missing_errors = validate_gsc_live(missing)
    assert missing_errors


def test_pii_credential_and_raw_gsc_query_rejected_on_persist(tmp_path: Path) -> None:
    bait = json.loads(_load("pii-bait.json"))
    errors = scan_artifact_payload(bait, "pii-bait.json")
    joined = " ".join(errors)
    assert "pii_cpf" in joined
    assert "pii_personal_email" in joined or "pii_extra_email" in joined
    assert "credential_json" in joined
    assert "raw_gsc_query_text" in joined
    assert "pii_private_home" in joined
    with pytest.raises(PIILeakError):
        persist_json(tmp_path / "leaked.json", bait)


def test_forbidden_tree_edits_rejected() -> None:
    with pytest.raises(ExclusivePathError) as exc:
        assert_exclusive_write_paths(
            [
                "scripts/local_entity/graph.py",
                "index.html",
                "scripts/pseo/html_shell.py",
                "styles.css",
                "sitemap.xml",
            ]
        )
    msg = str(exc.value)
    assert "index.html" in msg
    assert "html_shell.py" in msg
    assert_exclusive_write_paths(
        [
            "scripts/local_entity/graph.py",
            "data/local-entity/census.json",
            "docs/seo/local-entity/README.md",
            "tests/local_entity/test_gates.py",
            "especialista/tiago-jun-sasaki/index.html",
        ]
    )


def test_new_public_landing_detected() -> None:
    landings = new_public_landing_paths(
        [
            "scripts/local_entity/run.py",
            "florianopolis-consultoria/index.html",
            "especialista/tiago-jun-sasaki/index.html",
        ]
    )
    assert "florianopolis-consultoria/index.html" in landings
    assert "especialista/tiago-jun-sasaki/index.html" not in landings


def test_surface_decision_enum_is_closed() -> None:
    assert SURFACE_DECISIONS == {
        "USE_EXISTING_SERVICE",
        "REGIONAL_SECTION_ONLY",
        "REGIONAL_LANDING_CANDIDATE",
        "NO_LOCAL_SURFACE",
    }
