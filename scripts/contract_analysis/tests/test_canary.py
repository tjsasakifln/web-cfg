"""Drive the real canary entry point: python3 -m scripts.contract_analysis."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import MAX_CANARY, PUBLICATION_STATES
from scripts.contract_analysis.consume import load_canary, load_editorial_fixture
from scripts.contract_analysis.gate import evaluate_cohort
import pytest

from scripts.contract_analysis.render import analysis_urls_in_sitemaps


def test_canary_bundle_is_fixture_and_capped():
    bundle = load_canary()
    assert bundle["source_kind"] == "test_only_fixture"
    assert bundle["test_only"] is True
    assert bundle["catalog_mode"] == "fixture"
    assert bundle["evaluated"] <= MAX_CANARY
    assert all(rec.get("is_fixture") for rec in bundle["records"])


def test_canary_states_never_index_fixtures():
    bundle = load_canary()
    decisions = evaluate_cohort(bundle["records"])
    assert len(decisions) <= MAX_CANARY
    states = {d.state for d in decisions}
    assert "PUBLISHABLE_INDEX" not in states
    assert all(d.is_fixture for d in decisions)
    assert all("noindex" in d.robots for d in decisions)
    assert states.issubset(set(PUBLICATION_STATES))


def test_editorial_fixture_still_exercises_non_index_states():
    bundle = load_editorial_fixture()
    decisions = evaluate_cohort(bundle["records"])
    states = {d.state for d in decisions}
    assert "PUBLISHABLE_INDEX" not in states
    assert "REJECT" in states
    assert "HOLD_FOR_DATA" in states
    assert "EDITORIAL_REVIEW" in states
    assert "PUBLISHABLE_NOINDEX" in states


def test_cli_build_and_validate_from_clean_entry():
    build = subprocess.run(
        [sys.executable, "-m", "scripts.contract_analysis", "build"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert build.returncode == 0, build.stderr + build.stdout
    payload = json.loads(build.stdout)
    assert payload["ok"] is True
    assert payload["evaluated"] <= MAX_CANARY
    assert payload["source_kind"] == "test_only_fixture"
    assert payload["index_count"] == 0
    assert payload["recommendation"] in {"ADJUST", "STOP"}
    assert payload["recommendation"] != "EXPAND"

    validate = subprocess.run(
        [sys.executable, "-m", "scripts.contract_analysis", "validate"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert validate.returncode == 0, validate.stderr + validate.stdout
    v = json.loads(validate.stdout)
    assert v["ok"] is True
    assert v["index_count"] == 0
    assert v["fixture_indexed"] == []


def test_status_report_exists_and_names_the_gate():
    md = ROOT / "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.md"
    js = ROOT / "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.json"
    assert md.is_file(), "run the shipped build entry to emit the report"
    assert js.is_file()
    data = json.loads(js.read_text(encoding="utf-8"))
    assert data["report"] == "CONTRACT_ANALYSIS_CANARY_STATUS"
    assert data["evaluated"] <= MAX_CANARY
    assert data["index_count"] == 0
    assert data["test_only"] is True
    assert data["source_kind"] == "test_only_fixture"
    assert data["recommendation"] in {"EXPAND", "ADJUST", "STOP"}
    assert data["recommendation"] != "EXPAND"
    for item in data["items"]:
        assert item["state"] in {
            "REJECT",
            "HOLD_FOR_DATA",
            "EDITORIAL_REVIEW",
            "PUBLISHABLE_NOINDEX",
            "PUBLISHABLE_INDEX",
        }
        assert "reason_codes" in item
        assert item["fixture"] is True
        assert item["state"] != "PUBLISHABLE_INDEX"
    text = md.read_text(encoding="utf-8")
    assert "CONTRACT_ANALYSIS_CANARY_STATUS" in text
    assert "index_count" in text


def test_family_is_in_public_artifact_allowlist():
    from scripts.pseo.public_artifact import PUBLIC_TOP_DIRS

    assert "analises-contratos-publicos" in PUBLIC_TOP_DIRS


def test_family_is_preserved_from_pseo_wipe():
    from scripts.pseo.build import is_preserved_static_surface

    assert is_preserved_static_surface("analises-contratos-publicos/index.html") is True
    assert is_preserved_static_surface(
        "analises-contratos-publicos/bdi-composicao-vs-referencia-sc/index.html"
    ) is True


OFFICIAL_LIVE_SLUG = "reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026"


def test_rendered_preview_is_noindex_and_absent_from_sitemaps():
    hub = ROOT / "analises-contratos-publicos" / "index.html"
    assert hub.is_file()
    html = hub.read_text(encoding="utf-8")
    # Hub stays noindex until the family has a broader published set.
    assert 'content="noindex' in html
    assert "/correcoes/" in html
    pages = list((ROOT / "analises-contratos-publicos").rglob("index.html"))
    assert pages
    for page in pages:
        body = page.read_text(encoding="utf-8")
        assert "CaseStudy" not in body
        assert '"@type":"Review"' not in body and '"@type": "Review"' not in body
        if page.parent.name == OFFICIAL_LIVE_SLUG:
            continue
        if page.parent.name == "analises-contratos-publicos":
            continue
        assert 'content="noindex' in body
    from scripts.contract_analysis.approval import load_approvals

    approvals = load_approvals()
    indexed = [
        row
        for row in (approvals.get("approvals") or [])
        if isinstance(row, dict) and row.get("state") == "PUBLISHABLE_INDEX" and not row.get("withdrawn")
    ]
    names = analysis_urls_in_sitemaps(ROOT)
    if not indexed:
        assert names == []
    else:
        allowed = {"sitemap-analises-contratos.xml", "sitemap-index.xml"}
        assert set(names) <= allowed


def test_index_slug_x_robots_follows_family_noindex(tmp_path):
    """Netlify last-match wins: family noindex must precede the INDEX slug allow."""
    from scripts.contract_analysis.gate import PublicationDecision
    from scripts.contract_analysis.render import sync_family_crawler_rules

    (tmp_path / "_headers").write_text("# start\n", encoding="utf-8")
    (tmp_path / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")
    rec = {"slug": OFFICIAL_LIVE_SLUG}
    decision = PublicationDecision(
        analysis_id="13ec615146b3d348190a9b0b9148831e",
        slug=OFFICIAL_LIVE_SLUG,
        state="PUBLISHABLE_INDEX",
        reason_codes=(),
        conditions={},
        source_kind="official_live",
        is_fixture=False,
        indexable=True,
        robots="index,follow",
        sitemap=True,
    )
    sync_family_crawler_rules([(rec, decision)], root=tmp_path)
    headers = (tmp_path / "_headers").read_text(encoding="utf-8")
    slug = f"/analises-contratos-publicos/{OFFICIAL_LIVE_SLUG}/*"
    family = "/analises-contratos-publicos/*"
    i_slug = headers.find(slug)
    i_family = headers.find(family)
    assert i_slug != -1
    assert i_family != -1
    assert i_family < i_slug
    after_slug = headers[i_slug : i_slug + 220]
    assert "X-Robots-Tag: index, follow" in after_slug


def test_robots_and_headers_block_fixture_family():
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    headers = (ROOT / "_headers").read_text(encoding="utf-8")
    assert "Disallow: /analises-contratos-publicos/" in robots
    assert "/analises-contratos-publicos/" in headers
    assert "X-Robots-Tag: noindex" in headers
    fixture_slugs = (
        "aditivo-saldo-art125-item-novo",
        "atraso-eventos-sem-comunicacao-contemporanea",
        "bdi-composicao-vs-referencia-sc",
        "comparaveis-rejeitados-regime-distinto",
        "reajuste-aniversario-serie-indice",
    )
    sitemap_files = [
        ROOT / "sitemap.xml",
        ROOT / "sitemap-index.xml",
        ROOT / "sitemap-editorial.xml",
        ROOT / "sitemap-inteligencia.xml",
        ROOT / "sitemap.txt",
        ROOT / "sitemap-analises-contratos.xml",
    ]
    for path in sitemap_files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for slug in fixture_slugs:
            assert slug not in text
        if path.name in {"sitemap.xml", "sitemap-editorial.xml", "sitemap-inteligencia.xml", "sitemap.txt"}:
            assert "analises-contratos-publicos" not in text
