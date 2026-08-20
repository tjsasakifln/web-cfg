"""Adversarial P0 matrix on the shipped gate / render / approval / sitemap path."""

from __future__ import annotations

import copy
from datetime import date
from pathlib import Path

import pytest

from scripts.market_answers.approval import APPROVAL_TOKEN, rendered_content_hash
from scripts.market_answers.consume import adapt_payload, load_payload
from scripts.market_answers.copy import visitor_copy
from scripts.market_answers.gate import evaluate
from scripts.market_answers.render import render_html
from scripts.market_answers.sitemap import (
    parse_locs,
    robots_for_url,
    sitemap_contains_only_eligible_canonical,
)
from scripts.market_answers.urls import combinatorial_paths
from tests.market_answers.helpers import (
    drifted_approval,
    load_shipped_candidate,
    load_shipped_fixture,
    matching_approval,
    official_like_payload,
    raw_fixture,
)

TODAY = date(2026, 8, 17)
ROOT = Path(__file__).resolve().parents[2]
OFFICIAL = ROOT / "data/extra-cli/public-read-market-answer-pavimentacao/1.0/export.json"


def _national_surfaces(payload):
    copy = visitor_copy(load_shipped_candidate(), payload)
    national = "Qual é o valor típico dos contratos públicos de pavimentação no Brasil?"
    copy["title"] = national + " | CONFENGE"
    copy["h1"] = national
    copy["question"] = national
    copy["og_title"] = national
    copy["json_ld_name"] = national
    return copy


def test_sc_page_plus_sc_payload_passes():
    record = load_shipped_candidate()
    payload = official_like_payload()
    decision = evaluate(record, payload, matching_approval(payload), today=TODAY)
    assert all(decision.conditions.values()), decision.conditions
    assert decision.indexable is True
    assert decision.robots == "index,follow"
    assert decision.sitemap is True
    html = render_html(record, payload, decision)
    assert "Santa Catarina" in html
    assert "content=\"index,follow\"" in html
    assert "Brasil" not in html
    assert "nacional" not in html.lower()
    assert "mercado brasileiro" not in html.lower()
    assert "média nacional" not in html.lower()
    assert 'id="cobertura"' in html
    assert 'id="missingness"' in html
    assert 'id="limitacoes"' in html
    assert "source_as_of" in html


def test_official_live_sc_payload_indexes_when_approved():
    record = load_shipped_candidate()
    payload = load_payload()
    assert payload["official_live"] is True
    assert payload["is_fixture"] is False
    decision = evaluate(record, payload, matching_approval(payload), today=TODAY)
    assert decision.indexable is True, (decision.reason_codes, decision.conditions)
    assert decision.claim_scope == "uf"
    html = render_html(record, payload, decision)
    assert "Santa Catarina" in html
    assert "P25" in html or "p25" in html.lower() or "interquartil" in html.lower()


def test_national_title_plus_sc_payload_fails():
    record = load_shipped_candidate()
    payload = official_like_payload()
    surfaces = _national_surfaces(payload)
    decision = evaluate(
        record, payload, matching_approval(payload), today=TODAY, surfaces=surfaces
    )
    assert decision.indexable is False
    assert decision.conditions["copy_scope_coherent"] is False
    assert "noindex" in decision.robots


def test_national_jsonld_plus_sc_copy_fails():
    record = load_shipped_candidate()
    payload = official_like_payload()
    surfaces = visitor_copy(record, payload)
    surfaces["json_ld_name"] = "Valor típico nacional de pavimentação"
    surfaces["json_ld_description"] = "Média nacional do mercado brasileiro"
    decision = evaluate(
        record, payload, matching_approval(payload), today=TODAY, surfaces=surfaces
    )
    assert decision.indexable is False
    assert decision.conditions["copy_scope_coherent"] is False
    assert decision.conditions["national_gate_302"] is False


def test_fixture_payload_fails():
    record = load_shipped_candidate()
    payload = load_shipped_fixture()
    decision = evaluate(record, payload, matching_approval(payload), today=TODAY)
    assert decision.indexable is False
    assert decision.is_fixture is True
    assert "fixture_never_index" in decision.reason_codes


def test_geography_missing_rs_brasil_fail():
    record = load_shipped_candidate()
    missing = official_like_payload()
    missing["geography"] = {}
    dec_missing = evaluate(record, missing, matching_approval(missing), today=TODAY)
    assert dec_missing.indexable is False
    assert dec_missing.conditions["geography_scope_ok"] is False

    rs = official_like_payload()
    rs["geography"] = {
        "kind": "uf",
        "scope": "uf",
        "code": "RS",
        "ufs": ["RS"],
        "label": "Rio Grande do Sul",
    }
    dec_rs = evaluate(record, rs, matching_approval(rs), today=TODAY)
    assert dec_rs.indexable is False
    assert "geography_rs_not_authorized" in dec_rs.reason_codes

    brasil = official_like_payload()
    brasil["geography"] = {
        "kind": "national",
        "scope": "national",
        "code": "BR",
        "ufs": [],
        "label": "Brasil",
        "national_claim_allowed": False,
    }
    dec_br = evaluate(record, brasil, matching_approval(brasil), today=TODAY)
    assert dec_br.indexable is False
    assert dec_br.conditions["geography_scope_ok"] is False
    # #302 remains required for a national claim and is not deleted.
    assert dec_br.conditions["national_gate_302"] is False
    assert "national_claim_requires_302" in dec_br.reason_codes


def test_national_302_still_required_when_claim_is_national():
    record = load_shipped_candidate()
    payload = official_like_payload()
    payload["geography"] = {
        "kind": "national",
        "scope": "BR",
        "code": "BR",
        "ufs": [],
        "label": "Brasil",
        "national_claim_allowed": True,
    }
    payload["claim"] = {
        "authorization_state": "AUTHORIZED",
        "national_claim_allowed": True,
        "current_publication_allowed": True,
        "claim_scope": "national",
    }
    decision = evaluate(record, payload, matching_approval(payload), today=TODAY)
    # Even with #302 green, this canary is a UF=SC page. National geography
    # cannot become the SC index flip.
    assert decision.indexable is False
    assert decision.conditions["geography_scope_ok"] is False


def test_coverage_from_other_recorte_fails():
    record = load_shipped_candidate()
    payload = official_like_payload()
    payload["coverage"] = {
        "status": "COMPLETE",
        "n": 48,
        "usable_n": 48,
        "geography": {"kind": "uf", "code": "RS"},
        "uf": "RS",
        "stale": False,
        "min_n": 30,
    }
    decision = evaluate(record, payload, matching_approval(payload), today=TODAY)
    assert decision.indexable is False
    assert decision.conditions["coverage_scope_matches"] is False
    assert "coverage_other_recorte" in decision.reason_codes


def test_stale_fails():
    record = load_shipped_candidate()
    payload = official_like_payload()
    payload["freshness"] = {
        "as_of": "2026-01-01",
        "generated_at": "2026-01-01T00:00:00Z",
        "source_as_of": "2026-01-01",
        "max_age_hours": 48,
        "status": "STALE",
    }
    payload["as_of"] = "2026-01-01"
    decision = evaluate(record, payload, matching_approval(payload), today=TODAY)
    assert decision.indexable is False
    assert "STALE_DATA" in decision.reason_codes
    assert decision.freshness_class == "STALE"
    assert decision.state != "PUBLISHABLE_INDEX"


def test_payload_or_render_hash_change_invalidates_approval():
    record = load_shipped_candidate()
    payload = official_like_payload()
    decision = evaluate(record, payload, drifted_approval(payload), today=TODAY)
    assert decision.indexable is False
    assert "approval_hash_drift" in decision.reason_codes or "STALE_APPROVAL" in decision.reason_codes

    approvals = matching_approval(payload)
    approvals["approvals"][0]["rendered_content_hash"] = "f" * 64
    dec_render = evaluate(record, payload, approvals, today=TODAY)
    assert dec_render.indexable is False
    assert "rendered_approval_hash_drift" in dec_render.reason_codes


def test_inferred_custo_km_fails():
    raw = raw_fixture()
    raw["official_live"] = True
    raw["producer_status"] = "OFFICIAL_LIVE"
    raw["catalog_mode"] = "official_live"
    raw["claimed_live"] = False
    raw["custo_por_km"] = 185000
    with pytest.raises(Exception, match="custo/km"):
        adapt_payload(raw)


def test_missing_n_missingness_limitations_fail():
    record = load_shipped_candidate()
    no_n = official_like_payload()
    no_n["statistics"]["n"] = 0
    dec_n = evaluate(record, no_n, matching_approval(no_n), today=TODAY)
    assert dec_n.indexable is False
    assert dec_n.conditions["n_positive"] is False

    no_miss = official_like_payload()
    no_miss["missingness"] = {}
    no_miss["coverage"] = {
        "status": "COMPLETE",
        "n": 48,
        "usable_n": 48,
        "geography": {"kind": "uf", "code": "SC"},
        "stale": False,
        "min_n": 30,
    }
    dec_miss = evaluate(record, no_miss, matching_approval(no_miss), today=TODAY)
    assert dec_miss.indexable is False
    assert dec_miss.conditions["missingness_present"] is False

    no_lim = official_like_payload()
    no_lim["limitations"] = []
    surfaces = visitor_copy(record, no_lim)
    surfaces["limitations"] = []
    dec_lim = evaluate(
        record, no_lim, matching_approval(no_lim), today=TODAY, surfaces=surfaces
    )
    # Visitor copy rebuilds limitations from payload facts; empty override
    # must fail the limitations condition.
    assert dec_lim.conditions["limitations_present"] is False or dec_lim.indexable is False


def test_query_filter_stays_noindex():
    assert robots_for_url(
        "/inteligencia/valor-tipico-contratos-pavimentacao/?stratum=sc-municipal",
        indexable_canonical=True,
    ) == "noindex,nofollow"
    assert robots_for_url(
        "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/",
        indexable_canonical=True,
    ) == "index,follow"
    html = render_html(
        load_shipped_candidate(),
        official_like_payload(),
        evaluate(
            load_shipped_candidate(),
            official_like_payload(),
            matching_approval(official_like_payload()),
            today=TODAY,
        ),
    )
    assert "location.search" in html
    assert "noindex,nofollow" in html


def test_sitemap_only_eligible_canonical_and_no_combinatorial():
    assert combinatorial_paths() == ["/inteligencia/valor-tipico-contratos-pavimentacao/"]
    # Shipped writer: include only the canonical.
    from scripts.market_answers.sitemap import merge_inteligencia_sitemap
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        merge_inteligencia_sitemap(root, include=True, lastmod="2026-08-17")
        xml = (root / "sitemap-inteligencia.xml").read_text(encoding="utf-8")
        locs = parse_locs(xml)
        assert locs == [
            "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"
        ]
        assert "?stratum=" not in xml
        assert "/sc/" not in xml
        merge_inteligencia_sitemap(root, include=False, lastmod="2026-08-17")
        assert parse_locs((root / "sitemap-inteligencia.xml").read_text(encoding="utf-8")) == []


def test_two_normalized_renders_have_identical_rendered_hash():
    record = load_shipped_candidate()
    payload = official_like_payload()
    first = rendered_content_hash(record, payload)
    second = rendered_content_hash(record, copy.deepcopy(payload))
    assert first == second
    assert len(first) == 64
