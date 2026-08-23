"""Drive the shipped campaign entry on real in-repo specialist/proof/census inputs."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from scripts.local_entity.constants import (
    CAMPAIGN,
    CLAIM_STATUSES,
    CENSUS_CHANNELS,
    SURFACE_DECISIONS,
)
from scripts.local_entity.pack import citation_target_defects, gbp_checklist_defects
from scripts.local_entity.run import format_observables, run_campaign
from scripts.local_entity.validate import scan_artifact_payload, validate_bundle

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "local-entity"
DOCS = ROOT / "docs" / "seo" / "local-entity"


def test_run_campaign_on_real_specialist(tmp_path: Path) -> None:
    first = run_campaign(root=ROOT, out_dir=tmp_path / "a", write=True)
    second = run_campaign(root=ROOT, out_dir=tmp_path / "b", write=True)
    assert first["observables"] == second["observables"]
    obs = first["observables"]
    assert obs["campaign"] == CAMPAIGN
    assert set(obs["claim_statuses"]) <= CLAIM_STATUSES
    assert set(obs["census_channels"]) == CENSUS_CHANNELS
    assert obs["gsc_live_status"] in {"BLOCKED", "UNKNOWN"}
    assert obs["ready_for_product_decisions"] is False
    assert obs["surface_decision"] in SURFACE_DECISIONS
    assert obs["new_public_landing_created"] is False
    assert obs["invented_nap"] is False
    assert obs["invented_review"] is False
    assert obs["self_attested_not_upgraded"] is True
    snapshot = first["artifacts"]["entity-graph.json"]
    assert snapshot["organization"]["address"] == {
        "@type": "PostalAddress",
        "addressCountry": "BR",
    }
    assert snapshot["person"]["sameAs"] == ["https://github.com/tjsasakifln"]
    claims = {claim["id"]: claim for claim in snapshot["claims"]}
    assert claims["org-addressCountry"]["status"] == "SELF_DECLARED"
    assert claims["person-sameAs"]["status"] == "SELF_DECLARED"
    assert claims["org-streetAddress"]["status"] == "NOT_PUBLIC"
    assert claims["person-credential-crea"]["status"] == "NOT_PUBLIC"
    text = format_observables(obs)
    assert "ready_for_product_decisions: false" in text
    assert "new_public_landing_created: false" in text
    errors = validate_bundle(
        {
            "graph": first["graph"],
            "html": (ROOT / "especialista" / "tiago-jun-sasaki" / "index.html").read_text(
                encoding="utf-8"
            ),
            "classified": first["classified"],
            "census": first["census"],
            "decision": first["decision"],
            "gbp": first["gbp"],
            "citations": first["citations"],
            "changed_paths": [
                "scripts/local_entity/run.py",
                "data/local-entity/entity-graph.json",
            ],
        }
    )
    assert errors == []


def test_cli_entry_matches_library() -> None:
    proc = subprocess.run(
        ["python3", "-m", "scripts.local_entity", "--no-write"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    result = run_campaign(root=ROOT, write=False)
    expected = format_observables(result["observables"])
    assert expected in proc.stdout


def test_committed_artifacts_pass_shipped_scanners() -> None:
    assert DATA.is_dir(), "run python3 -m scripts.local_entity to persist data/local-entity"
    for name in (
        "entity-graph.json",
        "census.json",
        "surface-decision.json",
        "gbp-checklist.json",
        "citation-targets.json",
        "campaign.json",
    ):
        path = DATA / name
        assert path.is_file(), name
        doc = json.loads(path.read_text(encoding="utf-8"))
        leaks = scan_artifact_payload(doc, name)
        assert leaks == [], (name, leaks)
    census = json.loads((DATA / "census.json").read_text(encoding="utf-8"))
    assert census["gsc_live"]["ready_for_product_decisions"] is False
    assert census["gsc_live"]["status"] in {"BLOCKED", "UNKNOWN"}
    assert census["gsc_live"]["impressions"] is None
    channels = {row["channel"] for row in census["rows"]}
    assert "MAP_PACK" in channels
    assert "ORGANIC" in channels
    assert "LOCAL_ORGANIC" in channels
    for row in census["rows"]:
        if row["source"].startswith("historical_gsc") or row["source"] in {
            "gsc_api",
            "gsc_export",
        }:
            assert str(row["query_or_context"]).startswith("sha256:")
    decision = json.loads((DATA / "surface-decision.json").read_text(encoding="utf-8"))
    assert decision["decision"] in SURFACE_DECISIONS
    assert decision["new_public_landing_created"] is False
    gbp = json.loads((DATA / "gbp-checklist.json").read_text(encoding="utf-8"))
    assert gbp["login_required"] is False
    assert gbp["mutation"] is False
    assert gbp["api_write"] is False
    blob = "\n".join(s["action"] for s in gbp["steps"])
    assert gbp_checklist_defects(blob) == []
    citations = json.loads((DATA / "citation-targets.json").read_text(encoding="utf-8"))
    assert citation_target_defects(citations) == []


def test_human_pack_docs_are_readonly() -> None:
    checklist = (DOCS / "GBP-CHECKLIST.md").read_text(encoding="utf-8")
    assert gbp_checklist_defects(checklist) == []
    assert "login" in checklist.lower() or "entrar" in checklist.lower()
    targets = (DOCS / "CITATION-TARGETS.md").read_text(encoding="utf-8")
    assert "auto_send" in targets
    assert "false" in targets.lower()
    decision = (DOCS / "SURFACE-DECISION.md").read_text(encoding="utf-8")
    assert any(token in decision for token in SURFACE_DECISIONS)
    assert "new public landing" in decision.lower() or "nova URL" in decision or "nova url" in decision.lower()


def test_owned_package_does_not_call_live_search_analytics() -> None:
    pkg = ROOT / "scripts" / "local_entity"
    for path in pkg.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert "googleapiclient" not in text
        assert "searchconsole" not in text
        assert "pull-api" not in text
        assert "build(\"searchconsole\"" not in text
