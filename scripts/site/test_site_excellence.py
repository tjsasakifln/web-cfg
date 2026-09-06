#!/usr/bin/env python3
"""Contract tests for the executable CONFENGE site-excellence scorecard."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from scripts.site.site_excellence import (
    _turnstile_observation,
    build_report,
    collector_ids,
    evaluate_signal,
    measure_accessibility_report,
    measure_deliverables_report,
    measure_published_route_census,
    render_markdown,
    render_ci_annotations,
    score_dimensions,
)


ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "data" / "quality" / "site-excellence.v1.json"
MUTATIONS = ROOT / "scripts" / "site" / "fixtures" / "site-excellence" / "mutations.v1.json"


def test_contract_declares_every_required_dimension_without_subjective_weights() -> None:
    payload = json.loads(CONTRACT.read_text(encoding="utf-8"))
    expected = {
        "value-proposition-copy",
        "information-architecture",
        "responsive",
        "conversion",
        "offer-truth",
        "trust-proof",
        "seo",
        "editorial-originality",
        "performance",
        "accessibility",
        "security-privacy",
        "analytics-revops",
        "deploy-runtime",
        "freshness",
    }

    assert payload["schema"] == "confenge.site-excellence/1.0"
    assert payload["implementation_base_sha"] == "83bcce42cdd742a98583d14ce69c581b472137fa"
    assert set(payload["allowed_statuses"]) == {
        "MEASURED_PASS",
        "MEASURED_FAIL",
        "BLOCKED_EXTERNAL",
    }
    assert {row["id"] for row in payload["dimensions"]} == expected
    assert all(row["critical"] is True for row in payload["dimensions"])
    assert all(row["metrics"] for row in payload["dimensions"])
    assert "weights" not in json.dumps(payload).casefold()
    assert payload["scoring"]["blocked_external_excluded_from_addressable_denominator"] is True
    assert payload["scoring"]["ten_of_ten_requires_no_blocked_external"] is True
    # BLOCKED_EXTERNAL cannot be cleared by any code PR (issue #328), so it no
    # longer hard-fails the required site-ci check or the Netcup promotion
    # gate that reuses it -- only MEASURED_FAIL does.
    assert payload["scoring"]["blocked_external_blocks_ci_or_promotion"] is False
    assert payload["scoring"]["measured_fail_blocks_ci"] is True
    assert {
        "name",
        "nome",
        "email",
        "phone",
        "telefone",
        "cnpj",
        "cpf",
        "message",
        "mensagem",
        "query",
        "lead_text",
    }.issubset(set(payload["report"]["sensitive_fields_forbidden"]))


def test_every_critical_dimension_has_a_red_mutation_fixture() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    mutations = json.loads(MUTATIONS.read_text(encoding="utf-8"))
    red_by_dimension: dict[str, set[str]] = {}

    for fixture in mutations["fixtures"]:
        result = evaluate_signal(
            fixture["metric_id"],
            fixture["observation"],
            policy=fixture.get("policy") or {},
        )
        assert result["status"] == fixture["expected_status"], fixture["id"]
        assert fixture["expected_code"] in result["codes"], fixture["id"]
        assert result["status"] != "MEASURED_PASS", fixture["id"]
        red_by_dimension.setdefault(fixture["dimension"], set()).add(fixture["id"])

    critical = {row["id"] for row in contract["dimensions"] if row["critical"]}
    assert set(red_by_dimension) == critical


def test_named_campaign_regressions_are_present_verbatim() -> None:
    mutations = json.loads(MUTATIONS.read_text(encoding="utf-8"))
    ids = {row["id"] for row in mutations["fixtures"]}
    assert {
        "broken-price",
        "cta-missing-1000px",
        "word-squeezed",
        "eight-fifty-four-contradiction",
        "indexable-boilerplate",
        "fake-testimonial",
        "stale-gsc",
        "pii-in-analytics",
        "unsafe-csp",
        "orphan-url",
        "lcp-budget-exceeded",
        "form-without-turnstile",
        "deploy-identity-drift",
    }.issubset(ids)


def test_blocked_external_is_separate_from_the_addressable_score_and_withholds_ten() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    results = {
        metric["id"]: {"status": "MEASURED_PASS", "codes": [], "evidence": {}}
        for dimension in contract["dimensions"]
        for metric in dimension["metrics"]
    }
    results["permissioned-proof"] = {
        "status": "BLOCKED_EXTERNAL",
        "codes": ["proof_external_blocker"],
        "evidence": {"owner": "web-cfg #328"},
    }

    score = score_dimensions(contract, results)

    assert score["addressable_score"] == 10.0
    assert score["addressable_score_label"] == "10/10"
    assert score["blocked_external_dimensions"] == 1
    assert score["overall_status"] == "BLOCKED_EXTERNAL"
    assert score["global_excellence_claim"] == "WITHHELD"
    # BLOCKED_EXTERNAL is fully measured, scored and reported, and it still
    # withholds the 10/10 claim above -- but it cannot be cleared by any code
    # PR (see issue #328), so it must not fail the required site-ci check.
    assert score["ci_blocking"] is False
    assert "::warning" in "\n".join(render_ci_annotations(score))


def test_measured_failure_blocks_ci_and_missing_metric_fails_closed() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    results = {
        metric["id"]: {"status": "MEASURED_PASS", "codes": [], "evidence": {}}
        for dimension in contract["dimensions"]
        for metric in dimension["metrics"]
    }
    results["price-geometry"] = {
        "status": "MEASURED_FAIL",
        "codes": ["broken_price_geometry"],
        "evidence": {"route": "/entregas/", "viewport": "360x844"},
    }
    failed = score_dimensions(contract, results)
    missing = score_dimensions(contract, {})

    assert failed["overall_status"] == "MEASURED_FAIL"
    assert failed["addressable_score"] < 10
    # Unlike BLOCKED_EXTERNAL, a MEASURED_FAIL is addressable by a code PR, so
    # it must still fail the required site-ci check.
    assert failed["ci_blocking"] is True
    assert missing["overall_status"] == "MEASURED_FAIL"
    assert all(
        "metric_evidence_missing" in metric["codes"]
        for dimension in missing["dimensions"]
        for metric in dimension["metrics"]
    )


def test_route_census_fails_on_a_single_route_removed_from_artifact_and_manifest() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        source = base / "source"
        artifact = base / "artifact"
        (source / "nova-rota").mkdir(parents=True)
        artifact.mkdir()
        (source / "index.html").write_text("<html><body>Home</body></html>", encoding="utf-8")
        (source / "nova-rota" / "index.html").write_text(
            "<html><body>Nova</body></html>", encoding="utf-8"
        )
        (artifact / "index.html").write_text("<html><body>Home</body></html>", encoding="utf-8")
        manifest = base / "manifest.json"
        manifest.write_text(json.dumps({"html_routes": ["/"]}), encoding="utf-8")

        result = measure_published_route_census(source, artifact, manifest)

    assert result["status"] == "MEASURED_FAIL"
    assert result["codes"] == ["census_artifact_drift", "census_manifest_drift"]
    assert result["evidence"]["source_count"] == 2
    assert result["evidence"]["artifact_count"] == 1
    assert result["evidence"]["missing_in_artifact"] == ["/nova-rota/"]
    assert result["evidence"]["missing_in_manifest"] == ["/nova-rota/"]


def test_manifest_comparison_derives_its_index_route_class_without_standalone_allowlist() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        source = base / "source"
        artifact = base / "artifact"
        source.mkdir()
        artifact.mkdir()
        for root in (source, artifact):
            (root / "index.html").write_text("<html><body>Home</body></html>", encoding="utf-8")
            (root / "404.html").write_text(
                '<html><head><meta name="robots" content="noindex"></head></html>',
                encoding="utf-8",
            )
        manifest = base / "manifest.json"
        manifest.write_text(json.dumps({"html_routes": ["/"]}), encoding="utf-8")

        result = measure_published_route_census(source, artifact, manifest)

    assert result["status"] == "MEASURED_PASS"
    assert result["evidence"]["source_count"] == 2
    assert result["evidence"]["manifest_expected_count"] == 1


def test_report_keeps_route_viewport_and_owner_but_rejects_sensitive_evidence() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    results = {
        metric["id"]: {"status": "MEASURED_PASS", "codes": [], "evidence": {}}
        for dimension in contract["dimensions"]
        for metric in dimension["metrics"]
    }
    results["price-geometry"] = {
        "status": "MEASURED_FAIL",
        "codes": ["broken_price_geometry"],
        "evidence": {
            "route": "/entregas/",
            "viewport": "360x844",
            "owner": "web-cfg #343",
        },
    }
    score = score_dimensions(contract, results)
    report = build_report(contract, score, commit_sha="a" * 40, generated_at="2026-08-29T12:00:00Z")
    encoded = json.dumps(report, ensure_ascii=False)
    assert "/entregas/" in encoded
    assert "360x844" in encoded
    assert "web-cfg #343" in encoded

    score["dimensions"][0]["metrics"][0]["evidence"]["email"] = "alice@example.com"
    with pytest.raises(ValueError, match="sensitive evidence"):
        build_report(contract, score, commit_sha="a" * 40, generated_at="2026-08-29T12:00:00Z")


def test_every_declared_metric_has_an_executable_collector() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    declared = {
        metric["id"]
        for dimension in contract["dimensions"]
        for metric in dimension["metrics"]
    }
    assert collector_ids() == declared


def test_468_browser_report_feeds_price_word_and_1000px_cta_metrics() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        report_path = Path(tmp) / "deliverables.json"
        report_path.write_text(
            json.dumps(
                {
                    "ok": False,
                    "findings": [
                        {
                            "route": "/entregas/",
                            "width": 360,
                            "height": 844,
                            "errors": ["hub_name_starved=5", "price_wrapped=R$ 599/2L"],
                        },
                        {
                            "route": "/",
                            "check": "header_commercial_path",
                            "width": 1000,
                            "errors": ["header_cta_missing"],
                        },
                    ],
                    "hardAxe": [],
                }
            ),
            encoding="utf-8",
        )
        metrics = measure_deliverables_report(report_path)

    assert metrics["responsive-geometry"]["status"] == "MEASURED_FAIL"
    assert "word_squeezed" in metrics["responsive-geometry"]["codes"]
    assert metrics["price-geometry"]["status"] == "MEASURED_FAIL"
    assert "broken_price_geometry" in metrics["price-geometry"]["codes"]
    assert metrics["conversion-capture"]["status"] == "MEASURED_FAIL"
    assert "cta_missing_at_viewport" in metrics["conversion-capture"]["codes"]
    for metric_id in ("responsive-geometry", "price-geometry", "conversion-capture"):
        assert metrics[metric_id]["evidence"]["routes"]
        assert metrics[metric_id]["evidence"]["viewports"]


def test_turnstile_census_targets_only_forms_whose_runtime_requires_the_token() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        route = root / "piloto" / "forms"
        route.mkdir(parents=True)
        (route / "index.html").write_text(
            """
            <form action="/.netlify/functions/conversion-intake">
              <input type="hidden" name="action" value="xray">
            </form>
            <form action="/.netlify/functions/conversion-intake">
              <input type="hidden" name="action" value="handraise">
            </form>
            <form action="/.netlify/functions/offer-eligibility"></form>
            """,
            encoding="utf-8",
        )

        result = _turnstile_observation(root, expected_environment="local")

    assert result["missing_routes"] == ["/piloto/forms/"]
    assert result["protected_form_count"] == 1


def test_accessibility_evidence_fails_when_its_derived_census_collapses() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        manifest = base / "manifest.json"
        axe = base / "axe.json"
        manifest.write_text(
            json.dumps(
                {
                    "html_routes": ["/", "/captura/"],
                    "root_files": ["index.html", "404.html"],
                }
            ),
            encoding="utf-8",
        )
        valid = {
            "critical": 0,
            "serious": 0,
            "coverage": {
                "public_route_count": 3,
                "audited_route_count": 1,
                "audited_routes": [{"route": "/captura/"}],
                "viewports": [{"id": "mobile"}, {"id": "desktop"}],
                "page_loads": 2,
                "sampling": {"enabled": False, "dropped": []},
            },
            "pages": [
                {"path": "/captura/", "viewport": "mobile", "blocking": 0},
                {"path": "/captura/", "viewport": "desktop", "blocking": 0},
            ],
        }
        axe.write_text(json.dumps(valid), encoding="utf-8")
        passed = measure_accessibility_report(axe, manifest)
        valid["coverage"]["public_route_count"] = 2
        axe.write_text(json.dumps(valid), encoding="utf-8")
        collapsed = measure_accessibility_report(axe, manifest)

    assert passed["status"] == "MEASURED_PASS"
    assert collapsed["status"] == "MEASURED_FAIL"
    assert "accessibility_census_incomplete" in collapsed["codes"]


def test_ci_markdown_stays_legible_while_json_keeps_full_route_evidence() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    results = {
        metric["id"]: {"status": "MEASURED_PASS", "codes": [], "evidence": {}}
        for dimension in contract["dimensions"]
        for metric in dimension["metrics"]
    }
    routes = [f"/rota-{index}/" for index in range(12)]
    results["accessibility-audit"]["evidence"] = {
        "routes": routes,
        "viewports": ["mobile", "desktop"],
        "owner": "web-cfg public surface",
    }
    report = build_report(
        contract,
        score_dimensions(contract, results),
        commit_sha="a" * 40,
        generated_at="2026-08-29T12:00:00Z",
    )

    markdown = render_markdown(report)

    assert "... +7 in JSON artifact" in markdown
    accessibility = next(
        row for row in report["score"]["dimensions"] if row["id"] == "accessibility"
    )
    assert accessibility["metrics"][0]["evidence"]["routes"] == routes


def test_accessibility_never_passes_on_a_stale_committed_axe_report() -> None:
    """A skipped axe step must not become MEASURED_PASS.

    Before #619, site_excellence fell back to the committed
    docs/uiux-evidence/axe-report.json whenever build/reports/axe-report.json was
    absent. Because the browser steps are skipped as soon as an earlier CI step
    fails, that turned "we did not measure this tree" into "accessibility passes"
    -- using a report captured on an earlier commit that never loaded the changed
    pages. The other three browser-backed dimensions already fail closed with
    browser_evidence_missing; accessibility now behaves the same way.
    """
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        manifest = base / "manifest.json"
        axe = base / "axe.json"
        manifest.write_text(
            json.dumps({"html_routes": ["/", "/captura/"], "root_files": ["index.html", "404.html"]}),
            encoding="utf-8",
        )
        clean = {
            "critical": 0,
            "serious": 0,
            "coverage": {
                "public_route_count": 3,
                "audited_route_count": 1,
                "audited_routes": [{"route": "/captura/"}],
                "viewports": [{"id": "mobile"}, {"id": "desktop"}],
                "page_loads": 2,
                "sampling": {"enabled": False, "dropped": []},
            },
            "pages": [
                {"path": "/captura/", "viewport": "mobile", "blocking": 0},
                {"path": "/captura/", "viewport": "desktop", "blocking": 0},
            ],
        }
        axe.write_text(json.dumps(clean), encoding="utf-8")

        live = measure_accessibility_report(axe, manifest)
        stale = measure_accessibility_report(
            axe, manifest, live_evidence_missing=True, evidence_stale=True
        )

    # The very same clean, zero-violation report: the only difference is whether
    # it was measured on this tree. Provenance alone must decide the verdict.
    assert live["status"] == "MEASURED_PASS"
    assert live["evidence"]["live_evidence"] is True

    assert stale["status"] == "MEASURED_FAIL"
    assert "browser_evidence_missing" in stale["codes"]
    assert "axe_evidence_stale" in stale["codes"]
    assert stale["evidence"]["live_evidence"] is False


def test_accessibility_rejects_a_report_measured_on_another_tree() -> None:
    """A file in the reports folder is not proof of a measurement of THIS tree.

    Failing closed on an ABSENT report was not enough: `base` is a localhost URL
    and `site_root` a relative path, so an axe report captured on any other tree
    was byte-plausible here and, dropped into build/reports/, satisfied the
    accessibility dimension. audit_axe.mjs now records the artifact hash it
    measured and the scorecard rejects a report that names a different artifact,
    wherever the file happens to be filed.
    """
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        manifest = base / "manifest.json"
        axe = base / "axe.json"
        manifest.write_text(
            json.dumps({"html_routes": ["/", "/captura/"], "root_files": ["index.html", "404.html"]}),
            encoding="utf-8",
        )
        clean = {
            "critical": 0,
            "serious": 0,
            "coverage": {
                "public_route_count": 3,
                "audited_route_count": 1,
                "audited_routes": [{"route": "/captura/"}],
                "viewports": [{"id": "mobile"}, {"id": "desktop"}],
                "page_loads": 2,
                "sampling": {"enabled": False, "dropped": []},
            },
            "pages": [
                {"path": "/captura/", "viewport": "mobile", "blocking": 0},
                {"path": "/captura/", "viewport": "desktop", "blocking": 0},
            ],
        }
        axe.write_text(json.dumps(clean), encoding="utf-8")

        ours = measure_accessibility_report(
            axe, manifest, expected_artifact="abc123", reported_artifact="abc123"
        )
        foreign = measure_accessibility_report(
            axe,
            manifest,
            evidence_stale=True,
            artifact_mismatch=True,
            expected_artifact="abc123",
            reported_artifact="deadbeef",
        )

    # Identical zero-violation content both times. Only the artifact it names
    # differs, and that alone decides the verdict.
    assert ours["status"] == "MEASURED_PASS"
    assert ours["evidence"]["measured_artifact"] == "abc123"

    assert foreign["status"] == "MEASURED_FAIL"
    assert "axe_evidence_foreign_artifact" in foreign["codes"]
    assert foreign["evidence"]["measured_artifact"] == "deadbeef"
    assert foreign["evidence"]["expected_artifact"] == "abc123"
