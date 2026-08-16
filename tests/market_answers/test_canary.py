"""Family entry point: build + validate + sitemap hygiene + pSEO preserve."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from scripts.pseo.build import is_preserved_static_surface

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "inteligencia/valor-tipico-contratos-pavimentacao/index.html"
STATUS_JSON = ROOT / "docs/editorial/MARKET_ANSWER_CANARY_STATUS.json"
STATUS_MD = ROOT / "docs/editorial/MARKET_ANSWER_CANARY_STATUS.md"
NOTES = ROOT / "docs/contracts/market-answer/INTEGRATION_NOTES.md"
SITEMAPS = (
    "sitemap.xml",
    "sitemap-index.xml",
    "sitemap-editorial.xml",
    "sitemap-inteligencia.xml",
    "sitemap.txt",
)


def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def test_family_build_and_validate_fixture_stays_noindex():
    built = _run([sys.executable, "-m", "scripts.market_answers", "build"])
    assert built.returncode == 0, built.stderr + built.stdout
    payload = json.loads(built.stdout)
    assert payload["ok"] is True
    assert payload["official_live"] is False
    assert payload["producer_status"] == "CONTRACT_FIXTURE"
    assert payload["index_count"] == 0
    assert "noindex" in payload["robots"]
    assert payload["sitemap"] is False
    assert payload["recommendation"] in {"GO_NOINDEX", "NEEDS_DATA", "REJECT"}
    assert payload["recommendation"] != "READY_FOR_OFFICIAL_PAYLOAD"

    validated = _run([sys.executable, "-m", "scripts.market_answers", "validate"])
    assert validated.returncode == 0, validated.stderr + validated.stdout
    check = json.loads(validated.stdout)
    assert check["ok"] is True
    assert check["index_count"] == 0
    assert check["fixture_indexed"] is False


def test_status_report_has_required_fields():
    if not STATUS_JSON.is_file():
        _run([sys.executable, "-m", "scripts.market_answers", "build"])
    status = json.loads(STATUS_JSON.read_text(encoding="utf-8"))
    for key in (
        "candidate_decision",
        "data_state",
        "gate_results",
        "page_index_state",
        "engagement_events_available",
        "blockers",
        "next_integration_steps",
        "recommendation",
    ):
        assert key in status
    assert status["candidate_decision"]["demand"]["status"] == "UNKNOWN"
    assert status["data_state"]["official_live"] is False
    assert status["page_index_state"]["sitemap"] is False
    md = STATUS_MD.read_text(encoding="utf-8")
    assert "Recommendation" in md
    assert "UNKNOWN" in md
    notes = NOTES.read_text(encoding="utf-8")
    assert "Goal 03" in notes
    assert "Goal 05" in notes
    assert "Goal 07" in notes
    assert "#400" in notes and "#415" in notes and "#302" in notes
    assert "absent" in notes.lower() or "OPEN" in notes


def test_rendered_page_exists_and_is_off_sitemap():
    if not PAGE.is_file():
        _run([sys.executable, "-m", "scripts.market_answers", "build"])
    html = PAGE.read_text(encoding="utf-8")
    assert "Qual é o valor típico dos contratos públicos de pavimentação?" in html
    assert 'content="noindex,nofollow"' in html
    needle = "/inteligencia/valor-tipico-contratos-pavimentacao/"
    for name in SITEMAPS:
        path = ROOT / name
        if path.is_file():
            assert needle not in path.read_text(encoding="utf-8")


def test_canary_is_preserved_from_pseo_wipe():
    rel = "inteligencia/valor-tipico-contratos-pavimentacao/index.html"
    assert is_preserved_static_surface(rel) is True
    assert is_preserved_static_surface("inteligencia/mercados/pavimentacao-infraestrutura-viaria-sc/index.html") is False
