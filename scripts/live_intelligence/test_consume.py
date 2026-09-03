"""Fail-closed contract tests for the live-intelligence adapter.

Every integrity reason code has a test that proves the adapter refuses the
payload. A green suite here means: a broken, stale, unsourced, unhashed or
mislabeled producer export produces no public page and no analysis result.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from scripts.live_intelligence import (
    COMPANIES_OUT,
    CONTRACT_VERSION,
    DEFAULT_FIXTURE_DIR,
    FIXTURE_SCHEMA,
    INTENT_KINDS,
    LIVE_SCHEMA,
    OPPORTUNITIES_OUT,
    SOURCE_FIXTURE,
    SOURCE_OFFICIAL_LIVE,
)
from scripts.live_intelligence import consume as C

ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = ROOT / DEFAULT_FIXTURE_DIR


@pytest.fixture(scope="module")
def bundle() -> dict:
    return C.load_export_dir(FIXTURE_DIR)


@pytest.fixture(scope="module")
def projection(bundle) -> dict:
    return C.build_projection(bundle)


def _rehash(record: dict) -> dict:
    """Re-seal a mutated record so a test isolates one reason code at a time."""
    record = {k: v for k, v in record.items() if not str(k).startswith("_")}
    record["content_hash"] = C.content_hash_of(record)
    return record


def _opportunity(bundle) -> dict:
    return copy.deepcopy(bundle["opportunities"][0])


def _company(bundle) -> dict:
    return copy.deepcopy(bundle["companies"][0])


# --- Schema negotiation -----------------------------------------------------


def test_schema_absent_is_rejected():
    negotiated = C.negotiate_schema(None)
    assert negotiated.accepted is False
    assert negotiated.kind is None
    assert negotiated.reasons == ["schema_absent"]


def test_schema_unsupported_is_rejected():
    negotiated = C.negotiate_schema("public-read-contract-analysis/1.0", CONTRACT_VERSION)
    assert negotiated.accepted is False
    assert negotiated.kind is None
    assert negotiated.reasons == ["schema_unsupported"]


def test_live_schema_is_accepted():
    negotiated = C.negotiate_schema(LIVE_SCHEMA, CONTRACT_VERSION)
    assert negotiated.accepted is True
    assert negotiated.kind == "live"
    assert "schema_unsupported" not in negotiated.reasons


def test_additive_1x_schema_is_accepted_and_labeled():
    negotiated = C.negotiate_schema("CONFENGE_LIVE_INTELLIGENCE/1.4", CONTRACT_VERSION)
    assert negotiated.accepted is True
    assert negotiated.kind == "live"
    assert negotiated.reasons == ["schema_additive_1x"]


def test_schema_2x_is_rejected():
    negotiated = C.negotiate_schema("CONFENGE_LIVE_INTELLIGENCE/2.0")
    assert negotiated.accepted is False
    assert negotiated.kind is None
    assert negotiated.reasons == ["schema_unsupported"]


def test_contract_version_unsupported_is_rejected():
    negotiated = C.negotiate_schema(LIVE_SCHEMA, "v2.0.0")
    assert negotiated.accepted is False
    assert negotiated.kind is None
    assert negotiated.reasons == ["contract_version_unsupported"]


# --- The fixture schema is barred from INDEX by construction ----------------


def test_fixture_schema_is_not_a_live_schema():
    """Both barriers, from the one gate: live negotiation refuses it outright..."""
    negotiated = C.negotiate_schema(FIXTURE_SCHEMA, CONTRACT_VERSION)
    assert negotiated.accepted is False


def test_fixture_schema_is_classified_as_fixture():
    """...and the same call still classifies it, so it can render noindex."""
    negotiated = C.negotiate_schema(FIXTURE_SCHEMA, CONTRACT_VERSION)
    assert negotiated.kind == "fixture"
    assert negotiated.reasons == []


def test_negotiate_schema_is_the_only_schema_classifier():
    """No second public classifier may exist to drift from `negotiate_schema`.

    The previous `schema_kind()` was a parallel public entry point that
    `decide()` reached through while the docs claimed negotiation was the gate.
    Collapsing it into `negotiate_schema` is the fix; this test keeps it
    collapsed.
    """
    assert not hasattr(C, "schema_kind")
    source = (ROOT / "scripts/live_intelligence/consume.py").read_text(encoding="utf-8")
    # `_classify_schema` is the private helper. Exactly one caller: the gate.
    assert source.count("_classify_schema(") == 2  # the def plus one call site


def test_decide_never_publishes_fixture_schema_data(bundle):
    """`decide()` — the one canonical path — can never bless fixture-schema data."""
    record = _company(bundle)
    record["schema"] = FIXTURE_SCHEMA
    record["contract_version"] = CONTRACT_VERSION
    decision = C.decide(_rehash(record), manifest=bundle["manifest"])
    assert decision["index_eligible"] is False
    assert decision["state"] != "PUBLISHABLE_INDEX"
    assert "fixture_schema" in decision["index_bars"]
    assert decision["source_kind"] == SOURCE_FIXTURE


def test_decide_never_publishes_live_schema_without_official_live_producer(bundle):
    """Well-formed *live*-schema data still cannot be indexed without provenance.

    Same single path: the payload negotiates as live and passes every integrity
    check, and the verdict is still barred because the producer never declared
    official_live.
    """
    record = _company(bundle)
    record["schema"] = LIVE_SCHEMA
    record["contract_version"] = CONTRACT_VERSION
    record["catalog_mode"] = "live"
    record["claimed_live"] = True
    record["official_live"] = False
    record["producer_status"] = "staging"
    # Strip every fixture label so this is a genuinely well-formed live payload:
    # the point of the test is that provenance alone bars it, with nothing else
    # wrong with the record.
    record.pop("test_only", None)
    record.pop("never_index", None)
    sealed = _rehash(record)
    decision = C.decide(sealed)
    negotiated = C.negotiate_schema(sealed["schema"], sealed["contract_version"])
    assert negotiated.accepted is True and negotiated.kind == "live"
    assert decision["reason_codes"] == []  # integrity is clean; only provenance bars it
    assert decision["index_eligible"] is False
    assert decision["state"] != "PUBLISHABLE_INDEX"
    assert "producer_status_not_official_live" in decision["index_bars"]
    assert decision["source_kind"] == SOURCE_FIXTURE


def test_fixture_catalog_is_never_official_live(bundle):
    manifest = bundle["manifest"]
    assert C.is_fixture_catalog(manifest) is True
    assert C.official_live_declared(manifest) is False
    assert C.source_kind_of(manifest) == SOURCE_FIXTURE


def test_fixture_records_carry_index_bars(projection):
    assert projection["index_eligible"] is False
    assert projection["source_kind"] == SOURCE_FIXTURE
    for record in projection["opportunities"]:
        assert record["publication_state"] == "PUBLISHABLE_NOINDEX"
        assert record["index_eligible"] is False
        assert "fixture_schema" in record["index_bars"]
        assert "catalog_mode_fixture" in record["index_bars"]


def test_decide_never_returns_publishable_index(bundle):
    """No input reaches INDEX in W1, not even a well-formed official-live one."""
    record = _opportunity(bundle)
    record.update(
        schema=LIVE_SCHEMA,
        catalog_mode=SOURCE_OFFICIAL_LIVE,
        producer_status=SOURCE_OFFICIAL_LIVE,
        official_live=True,
        claimed_live=True,
        test_only=False,
    )
    record.pop("never_index", None)
    decision = C.decide(_rehash(record))
    assert decision["ready"] is True
    assert decision["state"] == "PUBLISHABLE_NOINDEX"
    assert decision["index_eligible"] is False
    assert decision["source_kind"] == SOURCE_OFFICIAL_LIVE


def test_fixture_claiming_live_is_rejected(bundle):
    record = _opportunity(bundle)
    record["claimed_live"] = True
    decision = C.decide(_rehash(record))
    assert decision["ready"] is False
    assert decision["state"] == "REJECT"
    assert "fixture_as_live" in decision["reason_codes"]


# --- Content hash -----------------------------------------------------------


def test_content_hash_mismatch_is_rejected(bundle):
    record = _opportunity(bundle)
    record["objeto"] = f"{record['objeto']} (adulterado)"
    # Deliberately keep the stale content_hash.
    record.pop("_content_hash_ok", None)
    decision = C.decide(record)
    assert decision["ready"] is False
    assert decision["state"] == "REJECT"
    assert "content_hash_mismatch" in decision["reason_codes"]


def test_content_hash_absent_is_rejected(bundle):
    record = _opportunity(bundle)
    record.pop("content_hash", None)
    record.pop("_content_hash_ok", None)
    decision = C.decide(record)
    assert decision["ready"] is False
    assert "content_hash_absent" in decision["reason_codes"]


def test_manifest_hash_mismatch_is_rejected(bundle):
    manifest = copy.deepcopy(bundle["manifest"])
    manifest["coverage"] = {"opportunities": 999}
    decision = C.decide(_opportunity(bundle), manifest=manifest)
    assert decision["ready"] is False
    assert "manifest_hash_mismatch" in decision["reason_codes"]


def test_intact_manifest_hash_passes(bundle):
    decision = C.decide(_opportunity(bundle), manifest=bundle["manifest"])
    assert "manifest_hash_mismatch" not in decision["reason_codes"]
    assert decision["ready"] is True


# --- Freshness / as_of ------------------------------------------------------


def test_freshness_absent_is_rejected(bundle):
    record = _opportunity(bundle)
    record.pop("freshness", None)
    record.pop("as_of", None)
    decision = C.decide(_rehash(record))
    assert decision["ready"] is False
    assert decision["state"] == "REJECT"
    assert "freshness_absent" in decision["reason_codes"]
    assert "as_of_absent" in decision["reason_codes"]


def test_stale_as_of_holds_for_data(bundle):
    """Beyond the declared SLO the payload is held, not silently published."""
    record = _opportunity(bundle)
    record["freshness"] = {
        **record["freshness"],
        "source_as_of": "2026-08-01T03:00:00+00:00",
    }
    record["as_of"] = "2026-08-01T03:00:00+00:00"
    decision = C.decide(_rehash(record))
    assert decision["ready"] is False
    assert decision["state"] == "HOLD_FOR_DATA"
    assert decision["reason_codes"] == ["freshness_stale"]


def test_as_of_unparseable_is_rejected(bundle):
    record = _opportunity(bundle)
    record["freshness"] = {**record["freshness"], "source_as_of": "ontem"}
    record["as_of"] = "ontem"
    decision = C.decide(_rehash(record))
    assert decision["ready"] is False
    assert "as_of_unparseable" in decision["reason_codes"]


def test_freshness_never_uses_wall_clock(bundle):
    """A record whose declared clocks are in the past stays READY.

    Freshness is `generated_at - source_as_of`, both declared by the producer.
    Reading the wall clock would make the fixture rot and the suite flaky.
    """
    record = _opportunity(bundle)
    assert C.freshness_reasons(record) == []


# --- Coverage and provenance ------------------------------------------------


def test_coverage_absent_is_rejected(bundle):
    record = _opportunity(bundle)
    record["coverage"] = {}
    decision = C.decide(_rehash(record))
    assert decision["ready"] is False
    assert "coverage_absent" in decision["reason_codes"]


def test_empty_coverage_values_count_as_absent(bundle):
    record = _opportunity(bundle)
    record["coverage"] = {"campos_declarados": None, "documentos": ""}
    decision = C.decide(_rehash(record))
    assert "coverage_absent" in decision["reason_codes"]


def test_source_absent_is_rejected(bundle):
    record = _opportunity(bundle)
    record["fonte"] = []
    decision = C.decide(_rehash(record))
    assert decision["ready"] is False
    assert "source_absent" in decision["reason_codes"]


# --- Producer data_state ----------------------------------------------------


def test_data_hold_is_held(bundle):
    record = _opportunity(bundle)
    record["data_state"] = "DATA_HOLD"
    decision = C.decide(_rehash(record))
    assert decision["ready"] is False
    assert decision["state"] == "HOLD_FOR_DATA"


def test_data_reject_is_rejected(bundle):
    record = _opportunity(bundle)
    record["data_state"] = "DATA_REJECT"
    decision = C.decide(_rehash(record))
    assert decision["ready"] is False
    assert decision["state"] == "REJECT"


def test_rejected_records_never_enter_the_projection(bundle):
    poisoned = copy.deepcopy(bundle)
    poisoned["opportunities"][0]["data_state"] = "DATA_REJECT"
    poisoned["opportunities"][0] = _rehash(poisoned["opportunities"][0])
    result = C.build_projection(poisoned)
    ids = {item["opportunity_id"] for item in result["opportunities"]}
    assert bundle["opportunities"][0]["opportunity_id"] not in ids
    assert any(row["state"] == "REJECT" for row in result["rejected"])


# --- Projection semantics ---------------------------------------------------


def test_fixture_projects_ready_records(projection):
    assert len(projection["opportunities"]) == 4
    assert len(projection["companies"]) == 3
    assert projection["rejected"] == []


def test_unknown_is_never_rendered_as_zero(projection):
    absent = next(
        item
        for item in projection["opportunities"]
        if item["opportunity_id"] == "cc-2026-000047-ponte-rio-do-sul-sc"
    )
    assert absent["valor"]["amount_brl"] is None
    assert absent["valor"]["basis"] == "UNKNOWN"
    assert absent["valor"]["epistemic_class"] == "UNKNOWN"
    assert absent["prazo"]["data_sessao"] == "UNKNOWN"


def test_unknown_prazo_status_is_not_invented(bundle):
    record = _opportunity(bundle)
    record["prazo"] = {"status": "TALVEZ", "data_sessao": ""}
    projected = C.project_opportunity(_rehash(record))
    assert projected["prazo"]["status"] == "UNKNOWN"


def test_opportunity_route_is_derived_from_the_stable_id(projection):
    for item in projection["opportunities"]:
        assert item["route"] == f"/oportunidades/{item['opportunity_id']}/"


def test_unsafe_opportunity_id_is_refused(bundle):
    record = _opportunity(bundle)
    record["opportunity_id"] = "../../etc/passwd"
    with pytest.raises(C.ConsumeError):
        C.project_opportunity(_rehash(record))


def test_company_key_must_be_a_digest(bundle):
    record = _company(bundle)
    record["company_digest"] = "not-a-digest"
    with pytest.raises(C.ConsumeError):
        C.project_company(_rehash(record))


def test_raw_cnpj_in_a_company_record_is_refused(bundle):
    record = _company(bundle)
    record["perfil"] = {**record["perfil"], "inscricao": "11222333000181"}
    with pytest.raises(C.ConsumeError):
        C.project_company(_rehash(record))


def test_masked_cnpj_in_a_company_record_is_refused(bundle):
    record = _company(bundle)
    record["compradores"] = [*record["compradores"], "11.222.333/0001-81"]
    with pytest.raises(C.ConsumeError):
        C.project_company(_rehash(record))


def test_no_company_projection_carries_a_cnpj(projection):
    blob = json.dumps(projection["companies"], ensure_ascii=False)
    assert C._CNPJ_SHAPED.search(blob) is None
    assert C._CNPJ_KEY.search(blob) is None


def test_adherence_rows_point_only_at_ready_opportunities(projection):
    ready = {item["opportunity_id"] for item in projection["opportunities"]}
    for profile in projection["companies"].values():
        for row in profile["oportunidades_aderentes"]:
            assert row["opportunity_id"] in ready


def test_adherence_row_for_a_dropped_opportunity_is_pruned(bundle):
    poisoned = copy.deepcopy(bundle)
    poisoned["opportunities"] = [
        record
        for record in poisoned["opportunities"]
        if record["opportunity_id"] != "pe-2026-000412-pav-urbana-chapeco-sc"
    ]
    result = C.build_projection(poisoned)
    rows = [
        row["opportunity_id"]
        for profile in result["companies"].values()
        for row in profile["oportunidades_aderentes"]
    ]
    assert "pe-2026-000412-pav-urbana-chapeco-sc" not in rows


# --- Written artifact -------------------------------------------------------


def test_write_projection_round_trips(projection, tmp_path):
    written = C.write_projection(projection, tmp_path)
    assert {p.name for p in written} == {OPPORTUNITIES_OUT, COMPANIES_OUT}
    opportunities = json.loads((tmp_path / OPPORTUNITIES_OUT).read_text(encoding="utf-8"))
    companies = json.loads((tmp_path / COMPANIES_OUT).read_text(encoding="utf-8"))
    assert opportunities["index_eligible"] is False
    assert companies["index_eligible"] is False
    assert opportunities["source_kind"] == SOURCE_FIXTURE
    assert set(companies["companies"]) == set(projection["companies"])


def test_checked_in_projection_matches_the_fixture(projection):
    """The committed artifact is reproducible from the committed fixture."""
    live = ROOT / "data/live_intelligence/live"
    on_disk = json.loads((live / OPPORTUNITIES_OUT).read_text(encoding="utf-8"))
    assert on_disk["opportunities"] == projection["opportunities"]
    assert on_disk["index_eligible"] is False
    companies = json.loads((live / COMPANIES_OUT).read_text(encoding="utf-8"))
    assert companies["companies"] == projection["companies"]


def test_missing_export_dir_fails_closed(tmp_path):
    with pytest.raises(C.ConsumeError):
        C.load_export_dir(tmp_path / "absent")


def test_missing_record_file_fails_closed(tmp_path):
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "schema": FIXTURE_SCHEMA,
                "contract_version": CONTRACT_VERSION,
                "catalog_mode": "fixture",
                "opportunities": [{"opportunity_id": "ghost", "path": "opportunities/ghost.json"}],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(C.ConsumeError):
        C.load_export_dir(tmp_path)


# --- Surface A rendering ----------------------------------------------------


def test_rendered_pages_are_noindex():
    for path in sorted((ROOT / "oportunidades").glob("*/index.html")):
        html = path.read_text(encoding="utf-8")
        assert '<meta content="noindex,nofollow" name="robots"/>' in html, path


def test_rendered_pages_carry_no_price_markup():
    """A displayed price would make an indexable route a priced offer.

    The pages are noindex, so the conversion gate skips them — this test is the
    defense in depth, not the primary bar.
    """
    from scripts.site.inbound_gates import _displays_price, _main_html

    for path in sorted((ROOT / "oportunidades").glob("*/index.html")):
        html = path.read_text(encoding="utf-8")
        assert 'itemprop="price"' not in html, path
        assert '"priceCurrency"' not in html, path
        assert not _displays_price(_main_html(html)), path


def test_render_writes_no_hub_sitemap_or_feed():
    """A pointer at a noindex route is a gate finding. W1 creates no pointer."""
    from scripts.live_intelligence import render as R

    source = (ROOT / "scripts/live_intelligence/render.py").read_text(encoding="utf-8")
    for forbidden in ("write_sitemap", "render_hub_html", "sync_family_crawler_rules", "robots.txt"):
        assert forbidden not in source.replace(
            "A noindex route that something points at", ""
        ), forbidden
    assert not (ROOT / "oportunidades" / "index.html").exists()
    assert not list((ROOT).glob("sitemap-oportunidades*.xml"))
    assert R.FAMILY_SLUG == "oportunidades"


def test_renderable_refuses_an_index_eligible_projection():
    from scripts.live_intelligence import render as R

    with pytest.raises(ValueError):
        R.renderable({"index_eligible": True, "opportunities": []})


def test_renderable_skips_non_ready_records():
    from scripts.live_intelligence import render as R

    records = R.renderable(
        {
            "index_eligible": False,
            "opportunities": [
                {"opportunity_id": "a", "publication_state": "REJECT", "index_eligible": False},
                {"opportunity_id": "b", "publication_state": "PUBLISHABLE_NOINDEX", "index_eligible": True},
                {"opportunity_id": "c", "publication_state": "PUBLISHABLE_NOINDEX", "index_eligible": False},
            ],
        }
    )
    assert [item["opportunity_id"] for item in records] == ["c"]


def test_family_registry_declares_no_live_intelligence_family():
    """W1 is noindex-only, so it must not claim an indexable public family."""
    registry = json.loads(
        (ROOT / "data/organic/public-family-registry.json").read_text(encoding="utf-8")
    )
    blob = json.dumps(registry, ensure_ascii=False)
    assert "/oportunidades/" not in blob
    assert "/analise-cnpj/" not in blob


# --- Intent kinds mirror the server allowlist -------------------------------


def test_intent_kinds_match_the_lead_core_allowlist():
    """A renderer cannot invent a fifth intent the lead endpoint would drop."""
    source = (ROOT / "netlify/functions/lib/lead-core.cjs").read_text(encoding="utf-8")
    block = source.split("INTENT_KIND_ALLOWED = new Set([", 1)[1].split("]);", 1)[0]
    declared = tuple(part.strip().strip('",') for part in block.split(",") if part.strip())
    assert declared == INTENT_KINDS
