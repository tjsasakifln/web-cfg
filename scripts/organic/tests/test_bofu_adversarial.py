"""Drive the shipped BOFU adversarial audit against live HTML and the intent matrix."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.bofu_adversarial import (
    FINDING_CODES,
    audit_service_sla_claims,
    load_intent_matrix,
    run_audit,
)
from scripts.organic.bofu_exposure import evaluate_aditivos_snippet, evaluate_indexable_bridges
from scripts.organic.service_map import map_content_to_service


def test_finding_codes_cover_criterion_3():
    required = {
        "SERVICE_INSUFFICIENT_INTERNAL_LINKS",
        "INTENT_CANNIBALIZATION",
        "COMMERCIAL_PAGE_NOINDEX",
        "CTA_UNKNOWN_OFFER",
        "SCHEMA_INVISIBLE_CLAIM",
        "BRIDGE_WRONG_SERVICE",
        "CANONICAL_SITEMAP_ROBOTS_DIVERGE",
        "SMARTLIC_CANONICAL",
        "ROUTE_MISSING_OWNER_UPDATE_POLICY",
        "CTA_DROPS_ATTRIBUTION",
        "PILLAR_MISSING_ONPAGE_CAPTURE",
        "SLA_NOT_IN_CATALOG",
    }
    assert required.issubset(set(FINDING_CODES))


def test_intent_matrix_rows_have_exactly_one_preferred_route():
    matrix = load_intent_matrix()
    assert matrix["schema_version"] == "bofu-intent-matrix-v1"
    assert matrix["gsc_live_state"] == "LIVE_JOB_OK"
    assert matrix["core_ready_for_product_decisions"] is False
    seen = []
    for row in matrix["rows"]:
        route = row["canonical_service_route"]
        assert route.startswith("/") and route.endswith("/")
        assert (ROOT / route.strip("/") / "index.html").is_file(), route
        seen.append(route)
        assert isinstance(row["supporting_indexable_routes"], list)
        assert "cta" in row and row["destination_service_id"]
        assert "index_state" in row and "gsc_baseline" in row
        gsc = row["gsc_baseline"]
        if gsc.get("clicks") is None:
            assert "UNKNOWN" in (gsc.get("source") or "")
        else:
            assert gsc["clicks"] >= 0
    assert len(seen) == len(set(seen)), seen


def test_indexable_supporting_content_has_exactly_one_preferred_destination():
    matrix = load_intent_matrix()
    by_support: dict[str, list[str]] = {}
    for row in matrix["rows"]:
        preferred = row["canonical_service_route"]
        for support in row["supporting_indexable_routes"]:
            by_support.setdefault(support, []).append(preferred)
            fit = map_content_to_service(support)
            assert fit["matched"] is True, support
            assert fit["service_path"].rstrip("/") == preferred.rstrip("/"), (
                support,
                fit["service_path"],
                preferred,
            )
    for support, dests in by_support.items():
        uniq = list(dict.fromkeys(dests))
        assert len(uniq) == 1, (support, uniq)


def test_aditivos_hypothesis_landed_and_documented():
    matrix = load_intent_matrix()
    hypo = matrix["aditivos_snippet_hypothesis"]
    assert hypo["status"] == "LANDED_IN_REPO"
    assert "Biblioteca CONFENGE" in hypo["before_meta"]
    report = evaluate_aditivos_snippet()
    assert report["ok"], report["fails"]
    assert report["title"] == hypo["after_title"]
    assert hypo["after_title"] in (ROOT / "aditivos-obras-publicas" / "index.html").read_text(
        encoding="utf-8"
    )


def test_adversarial_audit_fail_closed_on_shipped_html():
    report = run_audit(ROOT)
    assert report["ok"], json.dumps(report["findings"], ensure_ascii=False, indent=2)
    assert report["finding_count"] == 0


def test_audit_fails_on_noindex_commercial_page(tmp_path: Path):
    matrix = {
        "schema_version": "bofu-intent-matrix-v1",
        "rows": [
            {
                "intent_cluster": "fixture",
                "canonical_service_route": "/fixture-svc/",
                "supporting_indexable_routes": [],
                "cta": "x",
                "destination_service_id": "fixture-svc",
                "primary_queries": ["fixture query"],
                "parent_route": None,
                "exceptions": [],
            }
        ],
    }
    page = tmp_path / "fixture-svc" / "index.html"
    page.parent.mkdir()
    page.write_text(
        '<html><head><title>x</title>'
        '<meta name="robots" content="noindex,follow">'
        '<link rel="canonical" href="https://confenge.com.br/fixture-svc/">'
        "</head><body><h1>x</h1></body></html>",
        encoding="utf-8",
    )
    (tmp_path / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")
    (tmp_path / "sitemap.xml").write_text(
        "<urlset><loc>https://confenge.com.br/fixture-svc/</loc></urlset>",
        encoding="utf-8",
    )
    report = run_audit(tmp_path, matrix)
    codes = {f["code"] for f in report["findings"]}
    assert "COMMERCIAL_PAGE_NOINDEX" in codes
    assert report["ok"] is False


def test_audit_fails_when_nonfrozen_pillar_has_no_onpage_capture(tmp_path: Path):
    matrix = {
        "schema_version": "bofu-intent-matrix-v1",
        "rows": [
            {
                "intent_cluster": "fixture",
                "canonical_service_route": "/defesa-margem-contratos-publicos/",
                "supporting_indexable_routes": [],
                "cta": "x",
                "destination_service_id": "defesa-margem-contratos-publicos",
                "primary_queries": ["fixture query"],
                "parent_route": None,
                "exceptions": [],
            }
        ],
    }
    page = tmp_path / "defesa-margem-contratos-publicos" / "index.html"
    page.parent.mkdir()
    page.write_text(
        '<html><head><title>x</title><meta name="robots" content="index,follow">'
        '<link rel="canonical" href="https://confenge.com.br/defesa-margem-contratos-publicos/">'
        '</head><body><h1>x</h1><a href="https://wa.me/5548988344559">WhatsApp</a></body></html>',
        encoding="utf-8",
    )
    (tmp_path / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")
    (tmp_path / "sitemap.xml").write_text(
        "<urlset><loc>https://confenge.com.br/defesa-margem-contratos-publicos/</loc></urlset>",
        encoding="utf-8",
    )
    report = run_audit(tmp_path, matrix)
    assert "PILLAR_MISSING_ONPAGE_CAPTURE" in {f["code"] for f in report["findings"]}


def _sla_fixture(claim: str, *, catalog_sla: str | None = "10-15"):
    offer = {"offer_id": "CFG-FIXTURE-v1"}
    if catalog_sla is not None:
        offer["sla_business_days"] = catalog_sla
    return audit_service_sla_claims(
        "/fixture-svc/",
        f"<main><p>Prazo contratual de entrega: {claim}.</p></main>",
        {"offer_id": "CFG-FIXTURE-v1"},
        {"CFG-FIXTURE-v1": offer},
    )


def test_sla_guard_accepts_semantically_exact_catalog_intervals():
    assert _sla_fixture("10–15 dias úteis") == []
    assert _sla_fixture("10 a 15 dias úteis") == []
    assert _sla_fixture("entre 10 e 15 dias úteis") == []


def test_sla_guard_rejects_reduced_expanded_or_singleton_claims():
    for claim in (
        "até 15 dias úteis",
        "15 dias úteis",
        "10 dias úteis",
        "5–15 dias úteis",
        "10–20 dias úteis",
        "até 10 dias úteis",
    ):
        findings = _sla_fixture(claim)
        assert [finding["code"] for finding in findings] == ["SLA_NOT_IN_CATALOG"], claim


def test_sla_guard_rejects_claim_when_catalog_has_no_sla():
    findings = _sla_fixture("10 a 15 dias úteis", catalog_sla=None)
    assert [finding["code"] for finding in findings] == ["SLA_NOT_IN_CATALOG"]


def test_sla_guard_requires_catalog_sla_to_be_rendered():
    findings = audit_service_sla_claims(
        "/fixture-svc/",
        "<main><p>Entrega técnica sem prazo publicado.</p></main>",
        {"offer_id": "CFG-FIXTURE-v1"},
        {"CFG-FIXTURE-v1": {"offer_id": "CFG-FIXTURE-v1", "sla_business_days": "10-15"}},
    )
    assert [finding["code"] for finding in findings] == ["SLA_NOT_IN_CATALOG"]


def test_indexable_bridges_still_full():
    report = evaluate_indexable_bridges(ROOT)
    assert report["ok"], report["fails"]
    assert report["coverage"]["indexable_commercial_bridge_coverage"] == 1.0
