"""Drive the shipped research-pack consumer against the real data/pseo snapshot."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.research.claims import (  # noqa: E402
    PROVENANCE_FIELDS,
    scan_claim_language,
    validate_claim_gate,
)
from scripts.research.metrics import answer_questions  # noqa: E402
from scripts.research.pack import (  # noqa: E402
    PackError,
    build_pack,
    observable_metric_values,
    validate_pack,
)
from scripts.research.snapshot import load_snapshot  # noqa: E402

SNAPSHOT_DIR = ROOT / "data/pseo"


@pytest.fixture(scope="module")
def snapshot():
    return load_snapshot(SNAPSHOT_DIR)


@pytest.fixture(scope="module")
def pack(snapshot):
    return build_pack(snapshot)


def test_snapshot_checksums_and_identity(snapshot):
    meta = snapshot["meta"]
    assert meta["dataset_hash"]
    assert meta["data_as_of"]
    manifest = snapshot["manifest"]
    assert meta["dataset_hash"] == manifest["dataset_hash"]
    assert meta["data_as_of"] == manifest["data_as_of"]
    assert snapshot["markets"], "published markets must exist in the live snapshot"
    for name, digest in meta["checksums_verified"].items():
        assert digest == manifest["checksums"][name]


def test_metrics_consume_real_markets_json(snapshot):
    questions = answer_questions(snapshot)
    q1 = next(item for item in questions if item["id"] == "Q1")
    expected_n = sum(int(item["contract_count"] or 0) for item in snapshot["markets"])
    expected_value = round(
        sum(float(item["total_value"] or 0) for item in snapshot["markets"]), 2
    )
    assert q1["status"] == "answered"
    assert q1["value"]["published_market_contract_count"] == expected_n
    assert q1["value"]["published_market_total_value_brl"] == expected_value
    assert q1["value"]["aec_confirmed_contracts_in_snapshot"] == (
        snapshot["manifest"]["denominators"]["aec_confirmed_contracts"]
    )


def test_every_answered_metric_has_provenance(pack):
    answered = [
        item for item in pack["questions"] if item["status"] in {"answered", "partial"}
    ]
    assert answered
    for metric in answered:
        for field in PROVENANCE_FIELDS:
            assert metric.get(field), f"{metric['id']} missing {field}"


def _price_n_ge_market_n_exists(snapshot) -> bool:
    markets = {item.get("slug"): item for item in snapshot["markets"]}
    for price in snapshot["prices"]:
        market = markets.get(price.get("slug"))
        if not market:
            continue
        price_n = price.get("n") or price.get("observation_count")
        market_n = market.get("contract_count")
        if price_n is None or market_n is None:
            continue
        if int(price_n) >= int(market_n):
            return True
    return False


def test_q7_does_not_claim_price_n_below_market_when_snapshot_says_otherwise(snapshot):
    """Q7/C3 must not invent 'price n < market n because of the 5000 floor'.

    Drives shipped answer_questions + build_pack on the live snapshot. If any
    overlapping slug has price n >= market n, the limitation/caveat cannot
    claim the price cell is smaller than the matching market.
    """
    questions = answer_questions(snapshot)
    q7 = next(item for item in questions if item["id"] == "Q7")
    pack = build_pack(snapshot)
    c3 = next(item for item in pack["charts"] if item["id"] == "C3")
    blob = " ".join(
        [
            q7.get("limitation") or "",
            c3.get("caveat") or "",
            c3.get("takeaway") or "",
        ]
    ).lower()

    vs = (q7.get("value") or {}).get("price_vs_market") or []
    assert vs, "Q7 must expose price_vs_market from the live snapshot"
    for row in vs:
        price_n = row["price_n"]
        market_n = row["market_n"]
        slug = row["slug"]
        live_price = next(
            item for item in snapshot["prices"] if item.get("slug") == slug
        )
        live_market = next(
            item for item in snapshot["markets"] if item.get("slug") == slug
        )
        live_price_n = live_price.get("n") or live_price.get("observation_count")
        assert price_n == live_price_n
        assert market_n == live_market.get("contract_count")

    if _price_n_ge_market_n_exists(snapshot):
        forbidden = (
            "menor que n do mercado",
            "n do mercado correspondente porque o piso",
            "remove tickets menores",
            "é menor que n do mercado",
        )
        for phrase in forbidden:
            assert phrase not in blob, phrase
        assert "populações de query distintas" in (q7.get("limitation") or "")


def test_unsupported_questions_are_marked(pack):
    unsupported = [item for item in pack["questions"] if item["status"] == "unsupported"]
    assert unsupported, "evolution must be unsupported on this snapshot"
    for item in unsupported:
        assert item.get("limitation")
        assert "não sustentado" in item["limitation"].lower() or item["value"] is not None


def test_question_count_and_chart_cap(pack):
    assert 5 <= len(pack["questions"]) <= 8
    assert 1 <= len(pack["charts"]) <= 5
    for chart in pack["charts"]:
        for field in (
            "pergunta",
            "dados",
            "unidade",
            "caveat",
            "takeaway",
            "source",
            "method",
        ):
            assert chart.get(field), field


def test_claim_gate_accepts_built_pack(pack):
    assert validate_claim_gate(pack) == []
    validate_pack(pack)


def test_claim_gate_rejects_national_overclaim(pack):
    dirty = copy.deepcopy(pack)
    dirty["findings"].append(
        {
            "id": "BAD",
            "status": "answered",
            "claim": "Este é o censo nacional do mercado brasileiro de obras.",
        }
    )
    errors = validate_claim_gate(dirty)
    assert any("national_overclaim" in item for item in errors)
    with pytest.raises(PackError):
        validate_pack(dirty)


def test_claim_gate_rejects_hype(pack):
    dirty = copy.deepcopy(pack)
    dirty["findings"].append(
        {
            "id": "HYPE",
            "status": "answered",
            "claim": "O mercado aquecido aparece nos 12 contratos do recorte.",
        }
    )
    errors = validate_claim_gate(dirty)
    assert any("hype" in item for item in errors)


def test_findings_have_numbers_or_unsupported(pack):
    for item in pack["findings"]:
        text = item["claim"]
        has_digit = any(ch.isdigit() for ch in text)
        unsupported = (
            "não sustentado" in text.lower() or item.get("status") == "unsupported"
        )
        assert has_digit or unsupported, item["id"]
    joined = " ".join(item["claim"] for item in pack["findings"]).lower()
    assert "mercado aquecido" not in joined


def test_adversarial_lenses_present(pack):
    lenses = {item["id"] for item in pack["adversarial"]["lenses"]}
    assert lenses == {
        "duplicidade",
        "consorcios",
        "aditivos",
        "zeros_nulos",
        "aliases",
        "coverage_gaps",
        "outliers",
        "vies_temporal",
    }


def test_verdict_is_allowed_and_not_publish_on_four_ufs(pack):
    assert pack["verdict"] in {"PUBLISH", "NEEDS_DATA", "KILL"}
    assert pack["coverage"]["national_universe_complete"] is False
    assert pack["coverage"]["uf_count"] < 27
    assert pack["verdict"] != "PUBLISH"
    assert pack["indexation"]["indexable"] is False
    assert "noindex" in pack["indexation"]["robots"]


def test_inventory_not_promoted_as_finding(pack):
    inventory = pack["coverage"]["inventory_not_used_as_published_fact"]
    if not inventory.get("present"):
        pytest.skip("inventory file absent")
    promoted = json.dumps(
        [item for item in pack["findings"] if not str(item["id"]).startswith("ADV-")],
        ensure_ascii=False,
    )
    available = inventory.get("national_records_available")
    if available:
        assert str(available) not in promoted


def test_two_in_process_builds_match(snapshot):
    first = observable_metric_values(build_pack(snapshot))
    second = observable_metric_values(build_pack(snapshot))
    assert first == second
    assert first["dataset_hash"]
    assert first["data_as_of"]


def test_cli_validate_and_build_exit_zero(tmp_path):
    build = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.research",
            "build",
            "--pack-only",
            "--out",
            str(tmp_path),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert build.returncode == 0, build.stderr
    payload = json.loads(build.stdout)
    assert payload["ok"] is True
    assert payload["dataset_hash"]
    assert (tmp_path / "pack.json").is_file()

    validate = subprocess.run(
        [sys.executable, "-m", "scripts.research", "validate", "--pack", str(tmp_path / "pack.json")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert validate.returncode == 0, validate.stderr


def test_preview_survives_pseo_wipe():
    """Drive the shipped pSEO wipe gate. Preview must not be unlinked on build:site."""
    from scripts.pseo.build import is_preserved_static_surface

    preview_rel = "radar/pesquisa/edicao-zero-4uf/index.html"
    assert is_preserved_static_surface(preview_rel) is True
    assert is_preserved_static_surface("radar/nacional-obras-publicas/index.html") is True
    assert is_preserved_static_surface("radar/edificacoes-publicas-pr/index.html") is False
    assert (ROOT / preview_rel).is_file()
    would_wipe = []
    for index in (ROOT / "radar").rglob("index.html"):
        rel = index.relative_to(ROOT).as_posix()
        if not is_preserved_static_surface(rel):
            would_wipe.append(rel)
    assert preview_rel not in would_wipe
    assert any(rel.startswith("radar/") and rel not in {preview_rel} for rel in would_wipe)


def test_preview_is_noindex_and_absent_from_sitemaps():
    preview = ROOT / "radar/pesquisa/edicao-zero-4uf/index.html"
    if not preview.is_file():
        pytest.skip("preview not generated yet")
    html = preview.read_text(encoding="utf-8")
    assert 'content="noindex,nofollow"' in html
    assert "Como citar:" in html
    assert "id=\"metodologia\"" in html or "id='metodologia'" in html
    assert "dataset_hash" in html
    assert "evidência Q1" in html
    assert "<strong>Fonte.</strong>" in html
    assert "<strong>Método.</strong>" in html
    assert "DataCatalog" not in html
    needle = "/radar/pesquisa/edicao-zero-4uf/"
    for name in (
        "sitemap.xml",
        "sitemap-index.xml",
        "sitemap-editorial.xml",
        "sitemap-inteligencia.xml",
        "sitemap.txt",
    ):
        path = ROOT / name
        if path.is_file():
            assert needle not in path.read_text(encoding="utf-8")


def test_findings_trace_to_questions(pack):
    question_ids = {item["id"] for item in pack["questions"]}
    for item in pack["findings"]:
        if str(item["id"]).startswith("ADV-"):
            continue
        assert item.get("question_id") in question_ids
        assert (item.get("evidence") or {}).get("question_id") == item["question_id"]
        assert (item.get("evidence") or {}).get("anchor") == f"#{item['question_id']}"


def test_citation_block_present(pack):
    citation = pack["citation"]
    assert citation["permalink"].endswith("/radar/pesquisa/edicao-zero-4uf/")
    assert citation["text"]
    assert pack["dataset_hash"] in citation["text"]
    assert pack["data_as_of"] in citation["text"]
    assert "Não descreve o Brasil" in citation["text"]
    assert citation["download"]["path"].endswith("edicao-zero-citation.json")


def test_live_pack_does_not_consume_missing_400(pack):
    assert pack["reproducibility"]["extra_cli_public_read_export_consumed"] is False
    assert pack["national_claim_gate"]["passed"] is False
    assert "RESEARCH_READ_MODEL_ABSENT" in pack["national_claim_gate"]["reason_codes"]
    snapshot_dir = pack["reproducibility"]["snapshot_dir"]
    assert snapshot_dir == "data/pseo"
    assert not snapshot_dir.startswith("/")
    assert "grok-goal" not in snapshot_dir
    assert pack["verdict"] == "NEEDS_DATA"


def test_scan_claim_language_helper_on_clean_pack(pack):
    assert scan_claim_language(pack) == []
