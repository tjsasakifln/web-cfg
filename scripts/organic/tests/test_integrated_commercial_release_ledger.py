"""Guards for the release-bound #548 + #549 + #547 measurement ledger."""

from __future__ import annotations

import copy

import pytest

from scripts.organic import release_measurement_ledger as ledger


def _record() -> dict:
    return ledger.load_ledger()


def test_ledger_is_valid_and_report_is_current():
    record = _record()
    ledger.validate_ledger(record)
    assert ledger.DEFAULT_REPORT.read_text(encoding="utf-8") == ledger.render_report(record)


def test_manual_page_rows_preserve_measured_values_and_missing_unknowns():
    rows = {row["route"]: row["gsc_baseline"] for row in _record()["routes"]}
    measured = {
        route: row["metrics"]
        for route, row in rows.items()
        if row["row_status"] == "MEASURED_ROW"
    }
    assert measured == {
        "/diagnostico-b2g-expansao/": {
            "clicks": 0,
            "impressions": 1,
            "ctr_percent": 0,
            "position": 1.0,
        },
        "/bid-room-licitacoes-obras/": {
            "clicks": 0,
            "impressions": 4,
            "ctr_percent": 0,
            "position": 5.5,
        },
        "/defesa-margem-contratos-publicos/": {
            "clicks": 0,
            "impressions": 6,
            "ctr_percent": 0,
            "position": 7.83,
        },
        "/atrasos-prorrogacao-obras-publicas/": {
            "clicks": 1,
            "impressions": 22,
            "ctr_percent": 4.55,
            "position": 5.41,
        },
        "/defesa-tecnica-contratos-publicos/": {
            "clicks": 0,
            "impressions": 6,
            "ctr_percent": 0,
            "position": 5.33,
        },
        "/acompanhamento-contratos-obras/": {
            "clicks": 0,
            "impressions": 3,
            "ctr_percent": 0,
            "position": 5.0,
        },
        "/diretoria-b2g/": {
            "clicks": 0,
            "impressions": 2,
            "ctr_percent": 0,
            "position": 6.0,
        },
    }
    missing = [row for row in rows.values() if row["row_status"] == "NO_ROW_IN_EXPORT"]
    assert len(missing) == 10
    assert all(set(row["metrics"].values()) == {"UNKNOWN"} for row in missing)


def test_each_route_binds_identity_semantics_protection_and_funnel_availability():
    record = _record()
    live_sha = record["release_binding"]["baseline"]["public_live_sha"]
    for row in record["routes"]:
        assert row["baseline_identity"]["live_sha"] == live_sha
        assert len(row["baseline_identity"]["file_sha256"]) == 64
        assert row["protection"] == {
            "status": "NOT_PROTECTED",
            "profile": "cohort-not-protected-v1",
        }
        assert row["current_cta_form_semantics"]["primary_cta"]["label"]
        assert row["current_cta_form_semantics"]["primary_cta"]["destination"]
        assert row["current_cta_form_semantics"]["form"]["submit_label"]
        assert row["current_cta_form_semantics"]["form"]["runtime_persistence_required"] is True
        assert row["analytics_funnel_availability"]["profile"] == "web-form-funnel-v1"


def test_missing_semantics_are_owned_without_changing_event_payloads_here():
    record = _record()
    missing_ctas = {
        row["route"]
        for row in record["routes"]
        if row["analytics_funnel_availability"]["primary_cta_status"]
        == "MISSING_DECLARED_EVENT"
    }
    assert missing_ctas == ledger.MISSING_PRIMARY_CTA_ROUTES
    assert all(
        row["analytics_funnel_availability"].get("owner_issue") == 550
        for row in record["routes"]
        if row["route"] in missing_ctas
    )
    validation = record["profiles"]["analytics"]["web-form-funnel-v1"][
        "form_validation_category"
    ]
    assert validation["status"] == "PARTIAL_RAW_NOT_AGGREGATED"
    assert validation["owner_issue"] == 550
    assert record["scope_guard"]["analytics_payload_change"] is False


def test_550_instrument_declares_next_treatment_without_rewriting_history():
    instrument = ledger.validate_instrumentation_550()
    assert instrument["baseline_reset"] is False
    assert instrument["pii_analytics_allowlist"] == []
    assert instrument["authorization"]["html_mutation_authorized_for_529_value_first"] is False
    assert {row["route"] for row in instrument["primary_hash_ctas"]} == ledger.MISSING_PRIMARY_CTA_ROUTES
    assert instrument["validation_category"]["allowlist"] == [
        "required",
        "contact_format",
        "rate_limited",
    ]
    assert instrument["validation_category"]["legacy_missing_state"] == "UNKNOWN_CATEGORY"


def test_available_primary_ctas_have_raw_exact_predicates_not_route_aggregates():
    record = _record()
    for row in record["routes"]:
        availability = row["analytics_funnel_availability"]
        if row["route"] in ledger.MISSING_PRIMARY_CTA_ROUTES:
            assert availability["primary_cta_predicate"] == "UNKNOWN_PENDING_550"
            continue
        assert availability["primary_cta_status"] == "AVAILABLE_RAW_EXACT_PREDICATE"
        assert availability["primary_cta_source"] == "RAW_EVENTS_ONLY"
        assert availability["primary_cta_predicate"]["props"]


def test_post_release_chain_stays_unknown_owner_separated_and_non_causal():
    record = _record()
    observation = record["post_release_observation"]
    assert set(observation["post_release_values"].values()) == {"UNKNOWN"}
    metrics = {row["name"]: row for row in observation["metrics"]}
    assert metrics["serp_exposure"]["role"] == "context_only"
    assert metrics["serp_exposure"]["combine_with_conversion"] is False
    assert metrics["receipt"]["event"] == "lead_persisted"
    for stage in ("downstream_qco", "proposal", "contract", "margin"):
        assert metrics[stage]["owner"] == "Warmbly"
        assert metrics[stage]["role"] == "observed_only"
    assert record["terminal_decision"]["allowed"] == ledger.TERMINAL_DECISIONS
    assert record["scope_guard"]["causal_claim_allowed"] is False


def test_windows_and_sufficiency_thresholds_are_frozen_before_promotion():
    record = _record()
    observation = record["post_release_observation"]
    assert observation["first_technical_smoke"]["window"] == "promotion through +24 hours"
    assert observation["first_non_causal_read"]["window"] == (
        "after 7 complete days on one stable exact-SHA treatment"
    )
    minimum = observation["minimum_honest_observation_window"]
    assert minimum["complete_days"] == 28
    assert minimum["stable_treatment_required"] is True
    assert minimum["fixed_sufficiency_gate_per_cohort"] == {
        "minimum_route_visits": 100,
        "minimum_observable_primary_cta_raw_events": 20,
        "primary_cta_semantic_coverage": "ALL_ROUTES_OR_INSUFFICIENT_EVIDENCE",
        "form_validation_category_coverage": "COMPLETE_OR_REPORTED_PARTIAL",
        "purpose": "evidence sufficiency only; these are not success, effect-size or statistical-significance thresholds",
    }


def test_generated_report_switches_from_unknown_to_exact_promoted_treatment():
    record = copy.deepcopy(_record())
    treatment_sha = record["release_binding"]["baseline"]["origin_main_sha"]
    treatment = record["release_binding"]["treatment_anchor"]
    treatment["status"] = "PROMOTED_EXACT_SHA"
    treatment["exact_promoted_sha"] = treatment_sha
    treatment["promoted_at"] = "2026-10-01T12:30:00Z"
    ledger.validate_ledger(record)
    report = ledger.render_report(record)
    assert f"exact public SHA `{treatment_sha}`" in report
    assert "promoted at `2026-10-01T12:30:00Z`" in report
    assert "treatment SHA and promotion timestamp are **UNKNOWN**" not in report


def test_governance_owners_remain_outside_this_ledger():
    protected = _record()["protected_work"]
    assert protected == {
        "do_not_reset_or_mutate": [126, 127, 128, 327, 387, 529],
        "gsc_freshness_authority": 413,
        "bofu_ownership_projection": 545,
        "instrumentation_gap": 550,
        "rule": "Search exposure does not release a protected variable. Date alone does not release a protected route.",
    }


def test_baseline_commit_hashes_and_literal_semantics_are_mandatory():
    missing_commit = copy.deepcopy(_record())
    fake_sha = "0" * 40
    missing_commit["release_binding"]["baseline"]["origin_main_sha"] = fake_sha
    missing_commit["release_binding"]["baseline"]["public_live_sha"] = fake_sha
    for row in missing_commit["routes"]:
        row["baseline_identity"]["live_sha"] = fake_sha
    with pytest.raises(ValueError, match="cannot read pinned git blob"):
        ledger.validate_ledger(missing_commit)

    false_hash = copy.deepcopy(_record())
    false_hash["routes"][0]["baseline_identity"]["file_sha256"] = "0" * 64
    with pytest.raises(ValueError, match="baseline blob hash mismatch"):
        ledger.validate_ledger(false_hash)

    false_cta = copy.deepcopy(_record())
    false_cta["routes"][0]["current_cta_form_semantics"]["primary_cta"][
        "label"
    ] = "Fabricated CTA"
    with pytest.raises(ValueError, match="pinned primary CTA semantics mismatch"):
        ledger.validate_ledger(false_cta)

    false_heading = copy.deepcopy(_record())
    false_heading["routes"][0]["current_cta_form_semantics"]["form"][
        "heading"
    ] = "Serviços para licitações e contratos de obras públicas"
    with pytest.raises(ValueError, match="pinned form heading mismatch"):
        ledger.validate_ledger(false_heading)

    false_predicate = copy.deepcopy(_record())
    false_predicate["routes"][8]["analytics_funnel_availability"][
        "primary_cta_predicate"
    ] = {"props": {"cta_id": "FABRICATED"}}
    with pytest.raises(ValueError, match="primary CTA property predicate mismatch"):
        ledger.validate_ledger(false_predicate)

    false_treatment = copy.deepcopy(_record())
    false_treatment["release_binding"]["treatment_anchor"].update(
        {
            "status": "PROMOTED_EXACT_SHA",
            "exact_promoted_sha": "z" * 40,
            "promoted_at": "2026-10-01T00:00:00Z",
        }
    )
    with pytest.raises(ValueError, match="lowercase hexadecimal"):
        ledger.validate_ledger(false_treatment)
    false_treatment["release_binding"]["treatment_anchor"]["exact_promoted_sha"] = (
        "d" * 40
    )
    with pytest.raises(ValueError, match="does not resolve to a commit"):
        ledger.validate_ledger(false_treatment)


def test_route_assignment_is_exact_and_historical_cohort_ignores_future_contract_drift():
    record = _record()
    assert record["cohorts"]["offer_ladder_547"]["routes"] == ledger.OFFER_LADDER_ROUTES
    assert ledger.current_offer_contract_comparison(record)["status"] == "MATCHES_FROZEN"
    swapped = copy.deepcopy(record)
    swapped["routes"][0]["cohort"] = "offer_ladder_547"
    swapped["routes"][8]["cohort"] = "money_pages_528"
    with pytest.raises(ValueError, match="wrong cohort assignment"):
        ledger.validate_ledger(swapped)


def test_raw_extractor_excludes_final_and_submit_side_ctas_from_primary_gate():
    pre_release = _record()
    with pytest.raises(ValueError, match="blocked until the ledger records"):
        ledger.extract_observation(
            pre_release,
            [],
            "2026-10-01",
            "2026-10-29",
            input_complete=True,
            treatment_sha="a" * 40,
            stable_treatment=True,
        )

    record = copy.deepcopy(pre_release)
    treatment_sha = record["release_binding"]["baseline"]["origin_main_sha"]
    treatment = record["release_binding"]["treatment_anchor"]
    treatment["status"] = "PROMOTED_EXACT_SHA"
    treatment["exact_promoted_sha"] = treatment_sha
    treatment["promoted_at"] = "2026-10-01T00:00:00Z"
    events = [
        {
            "event": "page_view",
            "ts": "2026-10-01T01:00:00Z",
            "path": "/casos/modelo-base-quantitativa-canonica/",
            "props": {"event_id": "view-1"},
        },
        {
            "event": "whatsapp_click",
            "ts": "2026-10-01T01:01:00Z",
            "path": "/casos/modelo-base-quantitativa-canonica/",
            "props": {
                "event_id": "hero-wa",
                "cta_id": "base-690-hero",
                "cta_position": "report_hero",
                "offer_id": "handraise-modelo-base-quantitativa-canonica-v1",
                "next_action_id": "contratar_base_quantitativa_canonica",
            },
        },
        {
            "event": "whatsapp_click",
            "ts": "2026-10-01T01:02:00Z",
            "path": "/casos/modelo-base-quantitativa-canonica/",
            "props": {
                "event_id": "final-wa",
                "cta_id": "base-690-final",
                "cta_position": "report_final",
            },
        },
        {
            "event": "whatsapp_click",
            "ts": "2026-10-01T01:03:00Z",
            "path": "/casos/modelo-base-quantitativa-canonica/",
            "props": {
                "event_id": "hero-wa",
                "cta_id": "base-690-hero",
                "cta_position": "report_hero",
                "offer_id": "handraise-modelo-base-quantitativa-canonica-v1",
                "next_action_id": "contratar_base_quantitativa_canonica",
            },
        },
        {
            "event": "cta_click",
            "ts": "2026-10-01T02:00:00Z",
            "path": "/bid-room-licitacoes-obras/",
            "props": {
                "event_id": "bid-hero",
                "cta_position": "offer_hero",
                "offer_id": "bid-room",
            },
        },
        {
            "event": "cta_click",
            "ts": "2026-10-01T02:01:00Z",
            "path": "/bid-room-licitacoes-obras/",
            "props": {"event_id": "bid-submit", "cta_id": "bid-room-licitacoes-obras-handraise"},
        },
        {
            "event": "lead_form_error",
            "ts": "2026-10-01T02:02:00Z",
            "path": "/bid-room-licitacoes-obras/",
            "props": {"event_id": "validation-1", "form_step": 1},
        },
    ]
    result = ledger.extract_observation(
        record,
        events,
        "2026-10-01",
        "2026-10-29",
        input_complete=True,
        treatment_sha=treatment_sha,
        stable_treatment=True,
    )
    assert result["routes"]["/casos/modelo-base-quantitativa-canonica/"][
        "primary_cta"
    ] == 1
    assert result["routes"]["/bid-room-licitacoes-obras/"]["primary_cta"] == 1
    assert result["routes"]["/bid-room-licitacoes-obras/"]["form_validation"] == {
        "total": 1,
        "by_category": {"UNKNOWN_CATEGORY": 1},
    }
    assert result["cohorts"]["offer_ladder_547"]["primary_cta"] == 1
    assert result["cohorts"]["money_pages_528"]["primary_cta"] == (
        "UNKNOWN_INCOMPLETE_COVERAGE"
    )
    assert result["window"]["complete_days"] == 28
    assert result["treatment"] == {
        "exact_promoted_sha": treatment_sha,
        "promoted_at": "2026-10-01T00:00:00Z",
        "stability": "OPERATOR_ASSERTED_SINGLE_TREATMENT",
    }
    assert result["causal_claim"] == "FORBIDDEN"

    with pytest.raises(ValueError, match="completeness must be explicitly asserted"):
        ledger.extract_observation(
            record,
            events,
            "2026-10-01",
            "2026-10-29",
            input_complete=False,
            treatment_sha=treatment_sha,
            stable_treatment=True,
        )
    with pytest.raises(ValueError, match="stable treatment segment"):
        ledger.extract_observation(
            record,
            events,
            "2026-10-01",
            "2026-10-29",
            input_complete=True,
            treatment_sha=treatment_sha,
            stable_treatment=False,
        )


def test_sufficiency_gate_cannot_pass_before_28_complete_days():
    record = copy.deepcopy(_record())
    treatment_sha = record["release_binding"]["baseline"]["origin_main_sha"]
    treatment = record["release_binding"]["treatment_anchor"]
    treatment["status"] = "PROMOTED_EXACT_SHA"
    treatment["exact_promoted_sha"] = treatment_sha
    treatment["promoted_at"] = "2026-10-01T00:00:00Z"
    route = "/casos/modelo-base-quantitativa-canonica/"
    events = [
        {
            "event": "page_view",
            "ts": "2026-10-01T01:00:00Z",
            "path": route,
            "props": {"event_id": f"view-{index}"},
        }
        for index in range(100)
    ]
    events.extend(
        {
            "event": "whatsapp_click",
            "ts": "2026-10-01T02:00:00Z",
            "path": route,
            "props": {
                "event_id": f"hero-{index}",
                "cta_id": "base-690-hero",
                "cta_position": "report_hero",
                "offer_id": "handraise-modelo-base-quantitativa-canonica-v1",
                "next_action_id": "contratar_base_quantitativa_canonica",
            },
        }
        for index in range(20)
    )
    result = ledger.extract_observation(
        record,
        events,
        "2026-10-01",
        "2026-10-02",
        input_complete=True,
        treatment_sha=treatment_sha,
        stable_treatment=True,
    )
    gate = result["cohorts"]["offer_ladder_547"]["fixed_sufficiency_gate"]
    assert gate == {
        "minimum_window": False,
        "route_visit": True,
        "primary_cta": True,
        "semantic_coverage": True,
        "passed": False,
    }
