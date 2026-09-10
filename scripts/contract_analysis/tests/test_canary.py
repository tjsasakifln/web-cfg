"""Drive the real canary entry point: python3 -m scripts.contract_analysis."""

from __future__ import annotations

import json
import hashlib
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import MAX_CANARY, PUBLICATION_STATES
from scripts.contract_analysis.consume import load_canary, load_editorial_fixture
from scripts.contract_analysis.gate import evaluate_cohort
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


def test_withdrawn_public_routes_are_exact_and_preserve_the_internal_fixture():
    decisions_path = (
        ROOT / "data/editorial/contract-analysis/public-route-decisions.json"
    )
    decisions = json.loads(decisions_path.read_text(encoding="utf-8"))
    fixture_path = ROOT / decisions["source_fixture"]["path"]
    fixture_bytes = fixture_path.read_bytes()
    assert hashlib.sha256(fixture_bytes).hexdigest() == decisions["source_fixture"]["sha256"]

    fixture = json.loads(fixture_bytes)
    fixture_by_id = {item["id"]: item for item in fixture["analyses"]}
    approval_ids = {
        item["analysis_id"]
        for item in json.loads(
            (ROOT / "data/editorial/contract-analysis/approvals.json").read_text(
                encoding="utf-8"
            )
        )["approvals"]
        if not item.get("withdrawn")
    }
    assert len(decisions["records"]) == 5
    for item in decisions["records"]:
        source = fixture_by_id[item["analysis_id"]]
        canonical = json.dumps(
            source, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        assert hashlib.sha256(canonical).hexdigest() == item["source_record_sha256"]
        assert source["is_fixture"] is True
        assert item["approval_record"] == "ABSENT"
        assert item["analysis_id"] not in approval_ids
        assert item["decision"] == "WITHDRAW_PUBLIC_PRESERVE_INTERNAL"
        assert item["canonical_path"].endswith(f"/{item['slug']}/")
        assert item["index_alias"] == f"{item['canonical_path']}index.html"
        assert not (ROOT / item["public_source"]).exists()


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
    report_paths = [
        ROOT / "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.json",
        ROOT / "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.md",
        ROOT / "docs/editorial/CONTRACT_ANALYSIS_EDITORIAL_STATUS.json",
        ROOT / "docs/editorial/CONTRACT_ANALYSIS_EDITORIAL_STATUS.md",
    ]
    before = {path: path.read_bytes() for path in report_paths}
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
    isolated_root = Path(os.environ["CONFENGE_CONTRACT_ANALYSIS_ROOT"])
    isolated_status = json.loads(
        (isolated_root / "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.json").read_text(
            encoding="utf-8"
        )
    )
    assert isolated_status["source_kind"] == "test_only_fixture"

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
    assert {path: path.read_bytes() for path in report_paths} == before


def test_status_report_exists_and_names_the_gate():
    md = ROOT / "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.md"
    js = ROOT / "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.json"
    assert md.is_file(), "run the shipped build entry to emit the report"
    assert js.is_file()
    data = json.loads(js.read_text(encoding="utf-8"))
    assert data["report"] == "CONTRACT_ANALYSIS_CANARY_STATUS"
    assert data["evaluated"] <= MAX_CANARY
    # The versioned official snapshot now has one current, hash-bound human
    # approval. The five editorial fixtures remain internal and therefore do
    # not contribute to the public count.
    assert data["index_count"] == 1
    indexed = [item for item in data["items"] if item.get("indexable")]
    assert [item["id"] for item in indexed] == ["13ec615146b3d348190a9b0b9148831e"]
    assert data["test_only"] is False
    assert data["source_kind"] == "official_live"
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
        assert item["fixture"] is False
        if item["state"] == "PUBLISHABLE_INDEX":
            assert item["id"] == "13ec615146b3d348190a9b0b9148831e"
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
        "analises-contratos-publicos/reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/index.html"
    ) is True


def test_rendered_preview_is_noindex_and_absent_from_sitemaps():
    from scripts.contract_analysis import AUTHORIZED_CANONICAL_PATH
    from scripts.contract_analysis.approval import approval_allows_index

    hub = ROOT / "analises-contratos-publicos" / "index.html"
    assert hub.is_file()
    html = hub.read_text(encoding="utf-8")
    assert "/correcoes/" not in html
    assert "/triagem-tecnica/#corrigir-o-site" in html
    canary_slug = AUTHORIZED_CANONICAL_PATH.strip("/").split("/")[-1]
    official = load_canary(
        live_path=ROOT / "scripts/contract_analysis/fixtures/official-live-01"
    )
    record = next(
        row
        for row in official["records"]
        if row.get("id") == "13ec615146b3d348190a9b0b9148831e"
    )
    approved, _reasons = approval_allows_index(record, root=ROOT)
    if approved:
        assert 'content="index,follow"' in html or 'content="index, follow"' in html
    else:
        assert 'content="noindex' in html
    pages = list((ROOT / "analises-contratos-publicos").rglob("index.html"))
    assert pages
    indexable_pages = []
    for page in pages:
        body = page.read_text(encoding="utf-8")
        assert "CaseStudy" not in body
        assert '"@type":"Review"' not in body and '"@type": "Review"' not in body
        is_canary = canary_slug in str(page)
        if approved and (is_canary or page == hub):
            assert 'content="index,follow"' in body or 'content="index, follow"' in body
            indexable_pages.append(page)
        else:
            assert 'content="noindex' in body
    if approved:
        assert len(indexable_pages) == 2
        members = analysis_urls_in_sitemaps(ROOT)
        assert members
    else:
        assert analysis_urls_in_sitemaps(ROOT) == []
    assert {page.parent.name for page in pages if page != hub} <= {
        canary_slug,
    }


def test_robots_and_headers_block_fixture_family():
    from scripts.contract_analysis import AUTHORIZED_CANONICAL_PATH
    from scripts.contract_analysis.approval import approval_allows_index

    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    headers = (ROOT / "_headers").read_text(encoding="utf-8")
    # A familia continua fechada, mas o robots.txt tem de DIZER a verdade sobre
    # como. Pela RFC 9309 2.2.2 um Allow e um Disallow de mesmo comprimento
    # empatam em favor do Allow, entao "Disallow: /analises-contratos-publicos/"
    # nao restringe nada enquanto o hub estiver liberado -- afirmar a restricao
    # ali faria o arquivo declarar uma politica que nao existe.
    # Regra substituida: o bloqueio efetivo da familia e provado pelo
    # X-Robots-Tag do _headers, que vale para todos os filhos; o Disallow so e
    # exigido no caso em que ele realmente restringe, ou seja, quando o hub NAO
    # esta liberado.
    from scripts.site.robots_policy import is_allowed, parse_robots

    hub_allowed = f"Allow: {AUTHORIZED_CANONICAL_PATH}" in robots
    if not hub_allowed:
        assert "Disallow: /analises-contratos-publicos/" in robots
        parsed = parse_robots(robots)
        # Contraprova: quando exigido, o Disallow tem de bloquear de fato.
        assert not is_allowed(parsed, "Googlebot", "/analises-contratos-publicos/")[0]
        assert not is_allowed(parsed, "Googlebot", "/analises-contratos-publicos/qualquer/")[0]
    else:
        assert "Disallow: /analises-contratos-publicos/" not in robots
    assert "/analises-contratos-publicos/*" in headers
    assert "X-Robots-Tag: noindex" in headers
    official = load_canary(
        live_path=ROOT / "scripts/contract_analysis/fixtures/official-live-01"
    )
    record = next(
        row
        for row in official["records"]
        if row.get("id") == "13ec615146b3d348190a9b0b9148831e"
    )
    approved, _reasons = approval_allows_index(record, root=ROOT)
    slug = AUTHORIZED_CANONICAL_PATH.strip("/")
    sitemap_files = [
        ROOT / "sitemap.xml",
        ROOT / "sitemap-index.xml",
        ROOT / "sitemap-editorial.xml",
        ROOT / "sitemap-inteligencia.xml",
        ROOT / "sitemap.txt",
        ROOT / "sitemap-analises-contratos.xml",
    ]
    other_slugs = (
        "aditivo-saldo-art125-item-novo",
        "atraso-eventos-sem-comunicacao-contemporanea",
        "bdi-composicao-vs-referencia-sc",
        "comparaveis-rejeitados-regime-distinto",
        "reajuste-aniversario-serie-indice",
    )
    for path in sitemap_files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for other in other_slugs:
            assert other not in text
        if not approved:
            assert "analises-contratos-publicos" not in text
        elif path.name in {"sitemap-analises-contratos.xml", "sitemap-index.xml", "sitemap.txt"}:
            assert slug.split("/")[-1] in text or "sitemap-analises-contratos.xml" in text
