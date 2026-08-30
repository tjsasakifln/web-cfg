"""CONFENGE-ORGANIC-BREAKOUT-01 — drive shipped gate/render/prepare/observatory."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.distribution.prepare import prepare_asset
from scripts.market_answers.gate import evaluate as evaluate_market_answer
from scripts.organic.breakout import (
    CAMPAIGN,
    FORBIDDEN_PATH_PREFIXES,
    MAX_ASSETS,
    align_sinapi_base,
    art125_saldo,
    bdi_incidence_map,
    content_hash,
    duplicate_intents,
    evaluate_index_gate,
    inject_chassis,
    inspect_html,
    is_doorway,
    load_candidates,
    prepare_distribution_pack,
    select_assets,
    sitemap_locs,
)
from scripts.discovery.campaign_overlay import appearance_from_gsc, gsc_page_evidence
from scripts.revops.search_demand_observatory import (
    dedupe_gsc_rows,
    detect_all,
    git_safe_live_payload,
    gsc_performance_status,
    is_live_gsc_payload,
    label_historical_export,
    pull_api,
)
from tests.market_answers.helpers import load_shipped_candidate, load_shipped_fixture, matching_approval


def _catalog():
    return load_candidates(ROOT)


def test_asset_cap_and_distinct_intents():
    selected = select_assets(_catalog(), frontier=None, gsc_live=False)
    assert len(selected) <= MAX_ASSETS
    assert len(selected) == 3
    assert duplicate_intents(selected) == []
    assert {row["intent"] for row in selected} == {
        "sinapi_desonerado_vs_nao",
        "bdi_diferenciado_materiais_equipamentos",
        "limite_aditivo_25_50",
    }


def test_live_demand_required_asset_is_dropped_when_gsc_absent():
    catalog = _catalog()
    extra = dict(catalog["candidates"][0])
    extra["asset_id"] = "needs-live-demand"
    extra["intent"] = "other_intent"
    extra["publication_requires_live_demand"] = True
    bloated = {"candidates": catalog["candidates"] + [extra]}
    selected = select_assets(bloated, gsc_live=False)
    assert all(row["asset_id"] != "needs-live-demand" for row in selected)


def test_fourth_asset_is_not_selected():
    catalog = _catalog()
    extra = dict(catalog["candidates"][0])
    extra["asset_id"] = "fourth"
    extra["intent"] = "fourth_intent"
    bloated = {"candidates": catalog["candidates"] + [extra]}
    selected = select_assets(bloated, gsc_live=False)
    assert len(selected) == MAX_ASSETS


def test_duplicate_intent_rejected():
    catalog = _catalog()
    clone = dict(catalog["candidates"][0])
    clone["asset_id"] = "clone"
    bloated = {"candidates": [catalog["candidates"][0], clone]}
    selected = select_assets(bloated, gsc_live=False)
    assert len(selected) == 1


def test_anti_doorway():
    thin = {
        "url": "/q?foo=1",
        "visual_id": "",
        "method": {},
        "limitations": [],
        "visitor_job": "x",
        "question": "y",
        "answer": "z",
    }
    assert is_doorway(thin) is True
    selected = select_assets(_catalog(), gsc_live=False)
    for row in selected:
        assert is_doorway(row) is False


def test_fixture_and_hold_never_index():
    selected = select_assets(_catalog(), gsc_live=False)
    record = dict(selected[0])
    html = inject_chassis(
        '<div class="answer-box" id="resposta"><p>x</p></div>'
        f'<link rel="canonical" href="{record["canonical"]}"/>'
        '<meta name="robots" content="index,follow"/>'
        f"<h1>{record['question']}</h1><p>{record['answer']}</p>"
        '<script type="application/ld+json">{"@type":"HowTo"}</script>',
        record,
    )
    fixture = dict(record)
    fixture["fixture"] = True
    hold = dict(record)
    hold["hold_for_data"] = True
    locs = {record["canonical"]}
    assert evaluate_index_gate(fixture, html, root=ROOT, sitemap=locs).indexable is False
    assert evaluate_index_gate(hold, html, root=ROOT, sitemap=locs).indexable is False
    assert "fixture_never_index" in evaluate_index_gate(fixture, html, root=ROOT, sitemap=locs).reason_codes
    assert "hold_for_data_never_index" in evaluate_index_gate(hold, html, root=ROOT, sitemap=locs).reason_codes


def test_market_answer_fixture_still_not_index():
    record = load_shipped_candidate()
    payload = load_shipped_fixture()
    decision = evaluate_market_answer(record, payload, matching_approval(payload, index_authorized=True))
    assert decision.indexable is False
    assert decision.state != "PUBLISHABLE_INDEX"
    assert "noindex" in decision.robots


def test_render_has_required_visible_fields_and_parity():
    selected = select_assets(_catalog(), gsc_live=False)
    locs = sitemap_locs(ROOT)
    for record in selected:
        source = (ROOT / record["html_path"]).read_text(encoding="utf-8")
        html = inject_chassis(source, record)
        fields = inspect_html(html)
        assert fields["question"]
        assert fields["method"]
        assert fields["limitations"]
        assert fields["visual"]
        assert fields["visitor_job"]
        assert fields["refresh_owner"]
        assert fields["correction"]
        assert 'href="/correcoes/"' in html
        assert f'data-asset-id="{record["asset_id"]}"' in html
        assert fields["cta_attribution"]
        assert fields["content_hash"]
        assert fields["jsonld"]
        assert fields["smartlic"] is False
        assert fields["pii"] is False
        assert fields["canonical"].rstrip("/") == record["canonical"].rstrip("/")
        assert "noindex" not in fields["robots"]
        method_id = record["method"]["id"]
        assert method_id in html
        assert any(str(item)[:20] in html for item in record["limitations"])
        assert '"@type": "HowTo"' in html or '"@type":"HowTo"' in html
        decision = evaluate_index_gate(record, html, root=ROOT, sitemap=locs)
        assert decision.indexable is True
        assert decision.robots.startswith("index")
        assert decision.sitemap is True
        assert decision.content_hash == content_hash(record)


def test_two_injects_are_deterministic():
    record = select_assets(_catalog(), gsc_live=False)[0]
    source = (ROOT / record["html_path"]).read_text(encoding="utf-8")
    first = inject_chassis(source, record)
    second = inject_chassis(first, record)
    assert first == second
    assert content_hash(record) in first


def test_canonical_self_and_single_sitemap():
    locs = sitemap_locs(ROOT)
    for record in select_assets(_catalog(), gsc_live=False):
        html = (ROOT / record["html_path"]).read_text(encoding="utf-8")
        if "organic-breakout-chassis" not in html:
            html = inject_chassis(html, record)
        fields = inspect_html(html)
        assert fields["canonical"].rstrip("/") + "/" == record["canonical"].rstrip("/") + "/"
        matches = [loc for loc in locs if loc.rstrip("/") == record["canonical"].rstrip("/")]
        assert len(matches) == 1


def test_filters_stay_noindex_in_gate():
    record = select_assets(_catalog(), gsc_live=False)[0]
    html = inject_chassis(
        '<div class="answer-box" id="resposta"><p>x</p></div>'
        f'<link rel="canonical" href="{record["canonical"]}"/>'
        '<meta name="robots" content="index,follow"/>'
        f"<h1>{record['question']}</h1><p>{record['answer']}</p>"
        '<a href="?stratum=sc-municipal">filtro</a>'
        '<script type="application/ld+json">{"@type":"HowTo"}</script>',
        record,
    )
    decision = evaluate_index_gate(record, html, root=ROOT, sitemap={record["canonical"]})
    assert decision.conditions["filters_not_indexed"] is False
    assert decision.indexable is False




def test_overlap_keeps_live_missing_and_organic_classes():
    """Combined #122 + #123: live missing is UNKNOWN; organic classes stay."""
    first = "https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/"
    missing = "https://confenge.com.br/reequilibrio-obras-publicas/"
    evidence = gsc_page_evidence(
        {
            "queries": [
                {"date": "2026-08-10", "page": first, "impressions": 4, "clicks": 0},
            ]
        }
    )
    present = appearance_from_gsc(
        page_gsc=evidence[first],
        gsc_ready=True,
        inspect_row={"verdict": "PASS"},
        credential_present=True,
    )
    absent = appearance_from_gsc(
        page_gsc=evidence.get(missing),
        gsc_ready=True,
        inspect_row={"verdict": "PASS"},
        credential_present=True,
    )
    assert present["status"] == "TRUE"
    assert absent["status"] == "UNKNOWN"
    assert "missing_top_row_is_not_zero" in absent["note"]

    stamped = label_historical_export({"source": "csv", "queries": [{"query": "sinapi desonerado"}]})
    assert stamped["historical_neq_live"] is True
    assert stamped["performance_status"] == "UNKNOWN"
    assert is_live_gsc_payload(stamped) is False
    assert is_live_gsc_payload(
        {"source": "fixture", "synthetic": True, "ready_for_product_decisions": True}
    ) is False

    safe = git_safe_live_payload(
        {
            "source": "search_analytics_api",
            "ready_for_product_decisions": True,
            "synthetic": False,
            "queries": [{"query": "consulta privada", "page": first, "impressions": 2}],
        }
    )
    assert "consulta privada" not in json.dumps(safe)
    assert safe["raw_query_rows_in_git"] is False

    detected = detect_all(
        [
            {
                "date": "2026-07-28",
                "query": "sinapi desonerado",
                "page": "https://confenge.com.br/",
                "impressions": 8,
                "position": 7.5,
                "clicks": 0,
            }
        ],
        indexable_urls=["https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/"],
    )
    assert detected["zero_inferred_from_absence"] is False
    assert detected["wrong_landing"]["class"] == "wrong_landing"
    assert any(item.get("impressions") is None and item.get("status") == "ABSENT" for item in detected["indexable_without_impressions"]["items"])


def test_gsc_absence_unknown_and_historical_neq_live():
    missing = pull_api(7)
    assert missing.get("ok") is False
    assert missing.get("error") == "missing_credentials"
    assert gsc_performance_status(missing) == "UNKNOWN"
    stamped = label_historical_export({"source": "csv"})
    assert stamped["historical_neq_live"] is True
    assert stamped["performance_status"] == "UNKNOWN"
    assert stamped["ready_for_product_decisions"] is False


def test_gsc_rows_dedupe_and_detections():
    rows = [
        {
            "date": "2026-07-28",
            "query": "limite aditivo 25",
            "page": "https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/",
            "country": "bra",
            "device": "DESKTOP",
            "impressions": 4,
            "position": 12,
            "clicks": 0,
        },
        {
            "date": "2026-07-28",
            "query": "limite aditivo 25",
            "page": "https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/",
            "country": "bra",
            "device": "DESKTOP",
            "impressions": 4,
            "position": 12,
            "clicks": 0,
        },
    ]
    assert len(dedupe_gsc_rows(rows)) == 1
    detected = detect_all(rows, indexable_urls=["https://confenge.com.br/missing/"])
    assert detected["zero_inferred_from_absence"] is False
    assert any(item["status"] == "ABSENT" and item["impressions"] is None for item in detected["indexable_without_impressions"]["items"])


def test_unique_tools_are_not_generic_prose():
    aligned = align_sinapi_base("desonerado", "desonerado", "desonerado")
    assert aligned["state"] == "ALIGNED"
    mixed = align_sinapi_base("desonerado", "mista", "desonerado")
    assert mixed["state"] == "CONTRADICTION"
    families = bdi_incidence_map()
    assert len(families) == 3
    assert all("percentual oficial" not in json.dumps(families, ensure_ascii=False).lower() for _ in [0])
    saldo = art125_saldo(1_000_000, 180_000, 40_000, reforma_edificio_ou_equipamento=False)
    assert saldo["compensa_automaticamente"] is False
    assert saldo["saldo_acrescimo"] == 70_000
    reforma = art125_saldo(1_000_000, 0, 0, reforma_edificio_ou_equipamento=True)
    assert reforma["teto_acrescimo"] == 0.5


def test_distribution_pack_prepare_only():
    record = select_assets(_catalog(), gsc_live=False)[0]
    pack = prepare_distribution_pack(record)
    assert pack["auto_send"] is False
    assert pack["sent"] is False
    assert pack["smtp_called"] is False
    assert pack["webhook_called"] is False
    assert pack["not_a_favor"] is True
    assert pack["outreach_title"]
    assert pack["factual_summary"]
    assert pack["citable_datum"]["historical_neq_live"] is True
    assert pack["method"]["id"]
    assert len(pack["targets"]) == 5
    assert len(pack["drafts"]) == 5
    assert all("favor" not in draft["body"].lower() or "não um favor" in draft["body"].lower() for draft in pack["drafts"])


def test_shipped_prepare_asset_auto_send_false():
    for asset_id in (
        "sinapi-desonerado-nao-desonerado",
        "bdi-diferenciado-obra-publica",
        "limite-aditivo-25-50-obra-publica",
    ):
        path = ROOT / "data" / "distribution" / "assets" / f"{asset_id}.v1.json"
        if not path.is_file():
            continue
        report = prepare_asset(asset_id, root=ROOT)
        assert report["auto_send"] is False
        assert report["smtp_called"] is False
        assert report["webhook_called"] is False


def test_no_smartlic_and_no_contract_analysis_in_campaign_files():
    pages = select_assets(_catalog(), gsc_live=False)
    blob = (ROOT / "data" / "organic" / "breakout" / "candidates.json").read_text(encoding="utf-8")
    for row in pages:
        blob += "\n" + (ROOT / row["html_path"]).read_text(encoding="utf-8")
    assert "SmartLic" not in blob
    for prefix in FORBIDDEN_PATH_PREFIXES:
        assert prefix not in [row["html_path"] for row in pages]


def test_no_production_billing_mutation_in_campaign_module():
    text = (ROOT / "scripts" / "organic" / "breakout.py").read_text(encoding="utf-8")
    assert "asaas" not in text.lower()
    assert "CONFENGE_REAL_MONEY" not in text
    assert "scripts/offers" not in text


def test_campaign_constant():
    assert CAMPAIGN == "CONFENGE-ORGANIC-BREAKOUT-01"
    assert MAX_ASSETS == 3


def test_cli_module_importable():
    proc = subprocess.run(
        [sys.executable, "-c", "from scripts.organic.breakout import main; print('ok')"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert "ok" in proc.stdout
