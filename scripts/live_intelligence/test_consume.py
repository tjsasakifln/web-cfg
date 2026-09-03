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
    COMPANY_FAMILY,
    CONTRACT_VERSION,
    DEFAULT_FIXTURE_DIR,
    DEFAULT_OFFICIAL_DIR,
    FIXTURE_SCHEMA,
    IDENTITY_PROJECTION_SCHEMA,
    INTENT_KINDS,
    LIVE_SCHEMA,
    OPPORTUNITIES_OUT,
    OPPORTUNITY_FAMILY,
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


def test_live_intelligence_families_are_declared_and_still_governed_noindex():
    """W1 is fixture-backed, so its families must be declared *and* proven noindex.

    Before the CONFENGE-PSEO-EDITORIAL-INDEXATION-CUTOVER gate work (see
    scripts/site/inbound_gates.py's instance_index_ready_for_route /
    archetype_editorial_ready_for_family), an undeclared family was the only
    way this suite could prove W1 wasn't claiming a public indexable surface --
    absence from data/organic/public-family-registry.json stood in for
    "correctly not indexable". That proxy is gone now: the families ARE
    declared (data/organic/public-family-registry.json and
    data/organic/noindex-governance-registry.json), because declaring and
    governing them is what lets the evidence gate check them at all. The
    real invariant this test now proves is the same one as before -- W1
    still doesn't claim an indexable public surface -- just checked
    directly against the gate that actually decides that, instead of via
    registry absence.
    """
    registry = json.loads(
        (ROOT / "data/organic/public-family-registry.json").read_text(encoding="utf-8")
    )
    family_ids = {f["id"] for f in registry.get("families", [])}
    assert {
        "live-intelligence-opportunity",
        "live-intelligence-cnpj-tool",
        "live-intelligence-cnpj-result",
    } <= family_ids

    governance = json.loads(
        (ROOT / "data/organic/noindex-governance-registry.json").read_text(encoding="utf-8")
    )
    governance_by_family = {g["family_id"]: g for g in governance.get("families", [])}
    # live-intelligence-cnpj-tool intentionally carries no PERMANENT reason --
    # it's meant to earn INDEX once real data lands -- but every W1 family
    # still fixture-backed today must carry a real, non-null reason_code.
    for fid in ("live-intelligence-opportunity", "live-intelligence-cnpj-result"):
        entry = governance_by_family.get(fid)
        assert entry and entry.get("reason_code"), (
            f"{fid} must carry a governed noindex reason while fixture-backed"
        )

    from scripts.site.inbound_gates import (
        build_indexation_context,
        instance_index_ready_for_route,
        is_noindex,
    )

    ctx = build_indexation_context(ROOT)
    for route in ("/oportunidades/pe-2026-000188-reforma-ubs-londrina-pr/", "/analise-cnpj/"):
        html = ctx.html_by_route.get(route, "")
        assert html, f"{route} not found on disk -- fixture set changed?"
        assert is_noindex(html), f"{route} must still be noindex while fixture-backed"
        family = ctx.route_family.get(route)
        ready, _ = instance_index_ready_for_route(route, html, family, ctx)
        assert not ready, f"{route} must not independently earn an index slot yet"


# --- Intent kinds mirror the server allowlist -------------------------------


def test_intent_kinds_match_the_lead_core_allowlist():
    """A renderer cannot invent a fifth intent the lead endpoint would drop."""
    source = (ROOT / "netlify/functions/lib/lead-core.cjs").read_text(encoding="utf-8")
    block = source.split("INTENT_KIND_ALLOWED = new Set([", 1)[1].split("]);", 1)[0]
    declared = tuple(part.strip().strip('",') for part in block.split(",") if part.strip())
    assert declared == INTENT_KINDS


# --- extra-cli #539 native export shape (CONTRACT CANDIDATE, never live) -----

# Real PNCP opportunity_id: `<cnpj>-<seq>/<ano>`. The producer writes nested
# files; the consumer must accept this id, not invent a second slug.
_PNCP_OPPORTUNITY_ID = "12345678000190-1/2026"
_COMPANY_DIGEST = "aaaaaaaaaaaaaaaa"
_BUYER_DIGEST = "bbbbbbbbbbbbbbbb"
_COMPANY_REF = "cref1:0123456789abcdef0123456789abcdef"
_SNAPSHOT_ID = "snap-539-candidate-001"


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def _539_opportunity(**overrides) -> dict:
    record = {
        "schema": OPPORTUNITY_FAMILY,
        "opportunity_id": _PNCP_OPPORTUNITY_ID,
        "objeto": "Pavimentação asfáltica de vias urbanas",
        "valor": {
            "faixa": "1M_10M",
            "estimado_brl": "2500000",
            "estado": "OBSERVED",
        },
        "orgao": {
            "nome": "Município de Chapecó",
            "cnpj": "12345678000190",
            "estado": "OBSERVED",
        },
        "local": {
            "uf": "SC",
            "municipio": "Chapecó",
            "codigo_ibge": "4204202",
            "estado": "OBSERVED",
        },
        "prazo": {
            "status": "ABERTA",
            "data_encerramento": "2026-09-24",
            "data_publicacao": "2026-09-01",
        },
        "fonte": {
            "sistema": "PNCP",
            "source_id": _PNCP_OPPORTUNITY_ID,
            "link_edital": "https://pncp.gov.br/app/editais/12345678000190/2026/1",
        },
        "as_of": "2026-09-01",
        "freshness": {
            "max_age_hours": 48,
            "generated_at": "2026-09-01T09:00:00+00:00",
            "source_as_of": "2026-09-01T03:00:00+00:00",
            "state": "FRESH",
        },
        "coverage": {
            "row_completeness_state": "COMPLETE",
            "dimensoes_desconhecidas": [],
        },
        "limitations": ["O valor é a estimativa pública declarada no documento de origem."],
        "epistemic_classes": {
            "objeto": "FACT",
            "valor.faixa": "CALCULATION",
            "valor.estimado_brl": "FACT",
            "orgao": "FACT",
            "local": "FACT",
            "prazo.status": "CALCULATION",
        },
        "data_state": "DATA_READY",
        "reason_codes": [],
    }
    record.update(overrides)
    record["content_hash"] = C.content_hash_of(record)
    return record


def _539_company(**overrides) -> dict:
    record = {
        "schema": COMPANY_FAMILY,
        "company_digest": _COMPANY_DIGEST,
        "perfil": {
            "razao_social": "Construtora Exemplo Ltda",
            "contratos_observados": 4,
            "contratacao_mais_recente": "2025-11-02",
        },
        "categorias": ["pavimentacao"],
        "faixas": ["1M_10M"],
        "geografias": ["SC"],
        "compradores": [{"buyer_digest": _BUYER_DIGEST}],
        "oportunidades_aderentes": [
            {
                "opportunity_id": _PNCP_OPPORTUNITY_ID,
                "matched_dimensions": ["dim_object", "dim_geography"],
                "unknown_dimensions": [],
                "reason_codes": [],
            }
        ],
        "gaps": [
            {
                "opportunity_id": _PNCP_OPPORTUNITY_ID,
                "dimensoes_sem_correspondencia": ["dim_comparable_buyer"],
            }
        ],
        "unknowns": ["dim_recency"],
        "as_of": "2026-09-01",
        "freshness": {
            "max_age_hours": 48,
            "generated_at": "2026-09-01T09:00:00+00:00",
            "source_as_of": "2026-09-01T03:00:00+00:00",
            "state": "FRESH",
        },
        "coverage": {
            "row_completeness_state": "COMPLETE",
            "dimensoes_desconhecidas": ["dim_recency"],
        },
        "limitations": ["Aderência histórica não é habilitação, capacidade nem recomendação."],
        "epistemic_classes": {
            "perfil": "FACT",
            "oportunidades_aderentes": "CALCULATION",
        },
        "data_state": "DATA_READY",
        "reason_codes": [],
    }
    record.update(overrides)
    record["content_hash"] = C.content_hash_of(record)
    return record


def _write_539_candidate(
    tmp_path: Path,
    *,
    catalog_mode: str = "fixture",
    official_live: bool | None = None,
    mutate_opportunity=None,
    mutate_company=None,
    mutate_manifest=None,
    identity: bool = True,
) -> Path:
    """Write a #539-shaped export. Hashes come from the shipped hasher, never literals."""
    export_dir = tmp_path / "export"
    opportunity = _539_opportunity()
    company = _539_company()
    if mutate_opportunity:
        opportunity = mutate_opportunity(opportunity)
        if "content_hash" in opportunity:
            opportunity["content_hash"] = C.content_hash_of(opportunity)
    if mutate_company:
        company = mutate_company(company)
        if "content_hash" in company:
            company["content_hash"] = C.content_hash_of(company)

    if official_live is None:
        official_live = catalog_mode == SOURCE_OFFICIAL_LIVE
    producer_status = SOURCE_OFFICIAL_LIVE if official_live else "fixture"

    opp_rel = f"opportunities/{opportunity['opportunity_id']}.json"
    co_rel = f"companies/{company['company_digest']}.json"
    _write_json(export_dir / opp_rel, opportunity)
    _write_json(export_dir / co_rel, company)

    manifest = {
        "schema": LIVE_SCHEMA,
        "contract_version": "1.0",
        "catalog_mode": catalog_mode,
        "official_live": official_live,
        "producer_status": producer_status,
        "as_of": "2026-09-01",
        "generated_at": "2026-09-01T09:00:00+00:00",
        "source_as_of": "2026-09-01T03:00:00+00:00",
        "freshness": {
            "max_age_hours": 48,
            "generated_at": "2026-09-01T09:00:00+00:00",
            "source_as_of": "2026-09-01T03:00:00+00:00",
            "state": "FRESH",
        },
        "data_state": "DATA_READY",
        "coverage": {
            "opportunities_observed": 1,
            "opportunities_excluded": 0,
            "companies_observed": 1,
            "companies_excluded": 0,
            "establishment_digests": 1,
            "buyers_unhashable": 0,
        },
        "limitations": ["O escopo dos dados é o histórico público declarado na fonte PNCP."],
        "epistemic_classes": {
            "coverage": "FACT",
            "data_state": "CALCULATION",
            "freshness": "CALCULATION",
        },
        "reason_codes": [],
        "sources": [{"nome": "PNCP", "as_of": "2026-09-01T03:00:00+00:00"}],
        "index": {
            "opportunities": [
                {
                    "opportunity_id": opportunity["opportunity_id"],
                    "file": opp_rel,
                    "schema": OPPORTUNITY_FAMILY,
                    "content_hash": opportunity["content_hash"],
                }
            ],
            "companies": [
                {
                    "company_digest": company["company_digest"],
                    "file": co_rel,
                    "schema": COMPANY_FAMILY,
                    "content_hash": company["content_hash"],
                }
            ],
        },
    }
    if mutate_manifest:
        mutate_manifest(manifest)
    manifest["manifest_hash"] = C.manifest_hash_of(manifest)
    _write_json(export_dir / "manifest.json", manifest)

    if identity:
        projection = {
            "schema": IDENTITY_PROJECTION_SCHEMA,
            "snapshot_id": _SNAPSHOT_ID,
            "sealed_to_manifest_hash": manifest["manifest_hash"],
            "entries": [
                {
                    "establishment_digest": _COMPANY_DIGEST,
                    "company_ref": _COMPANY_REF,
                }
            ],
        }
        projection["sealed_hash"] = C.sealed_hash_of(projection)
        _write_json(C.identity_projection_path_for(export_dir), projection)

    return export_dir


def test_official_bundle_is_not_in_the_tree():
    """P6_OFFICIAL_BUNDLE_AVAILABLE=NO — no official snapshot is checked in."""
    assert not (ROOT / DEFAULT_OFFICIAL_DIR).exists()


def test_539_candidate_loads_and_projects_as_not_live(tmp_path):
    export_dir = _write_539_candidate(tmp_path)
    bundle = C.load_export_dir(export_dir)
    assert bundle["schema"] == LIVE_SCHEMA
    assert bundle["catalog_mode"] == "fixture"
    assert bundle["_source_kind"] == SOURCE_FIXTURE
    assert bundle["_identity_projection"]["schema"] == IDENTITY_PROJECTION_SCHEMA
    assert bundle["_identity_projection"]["entries"][0]["company_ref"] == _COMPANY_REF

    projection = C.build_projection(bundle)
    assert projection["index_eligible"] is False
    assert projection["source_kind"] != SOURCE_OFFICIAL_LIVE
    assert projection["source_kind"] == SOURCE_FIXTURE
    assert len(projection["opportunities"]) == 1
    opp = projection["opportunities"][0]
    assert opp["opportunity_id"] == _PNCP_OPPORTUNITY_ID
    assert "/" in opp["opportunity_id"]
    assert opp["valor"]["estimado_brl"] == "2500000"
    assert opp["valor"]["faixa"] == "1M_10M"
    assert opp["fonte"][0]["url"].startswith("https://pncp.gov.br/")
    assert opp["fonte"][0]["source_id"] == _PNCP_OPPORTUNITY_ID
    assert opp["index_eligible"] is False
    assert "catalog_mode_fixture" in opp["index_bars"]
    company = projection["companies"][_COMPANY_DIGEST]
    assert company["perfil"]["razao_social"] == "Construtora Exemplo Ltda"
    assert set(company["perfil"]) == {
        "razao_social",
        "contratos_observados",
        "contratacao_mais_recente",
    }
    assert "natureza" not in company["perfil"]
    assert "porte_declarado" not in company["perfil"]
    assert "primeiro_contrato_publico" not in company["perfil"]
    assert "UNKNOWN" not in json.dumps(company["perfil"], ensure_ascii=False)
    assert company["compradores"] == [_BUYER_DIGEST]
    assert company["oportunidades_aderentes"][0]["dimensoes"] == ["dim_object", "dim_geography"]
    blob = json.dumps(projection, ensure_ascii=False)
    assert "company_ref" not in blob
    assert _COMPANY_REF not in blob


def test_539_candidate_consume_entry_is_not_official_live(tmp_path):
    export_dir = _write_539_candidate(tmp_path)
    projection = C.consume(export_dir)
    assert projection["source_kind"] != SOURCE_OFFICIAL_LIVE
    assert projection["index_eligible"] is False
    assert C.main(["--source", str(export_dir)]) == 0


def test_539_broken_content_hash_is_rejected(tmp_path):
    def poison(record):
        record["objeto"] = "adulterado"
        return record  # helper re-seals; break the seal after write via load

    export_dir = _write_539_candidate(tmp_path, mutate_opportunity=poison)
    # Re-open and restore a stale hash so the file on disk disagrees.
    opp_path = export_dir / "opportunities" / "12345678000190-1" / "2026.json"
    payload = json.loads(opp_path.read_text(encoding="utf-8"))
    payload["content_hash"] = "0" * 64
    opp_path.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
    bundle = C.load_export_dir(export_dir)
    decision = C.decide(bundle["opportunities"][0], manifest=bundle["manifest"])
    assert decision["ready"] is False
    assert decision["state"] == "REJECT"
    assert "content_hash_mismatch" in decision["reason_codes"]
    projection = C.build_projection(bundle)
    assert projection["opportunities"] == []
    assert projection["source_kind"] != SOURCE_OFFICIAL_LIVE


def test_539_unsupported_schema_is_rejected(tmp_path):
    export_dir = _write_539_candidate(
        tmp_path,
        mutate_manifest=lambda manifest: manifest.update({"schema": "CONFENGE_LIVE_INTELLIGENCE/2.0"}),
    )
    bundle = C.load_export_dir(export_dir)
    decision = C.decide(bundle["opportunities"][0], manifest=bundle["manifest"])
    assert decision["state"] == "REJECT"
    assert decision["source_kind"] != SOURCE_OFFICIAL_LIVE


def test_539_stale_freshness_is_held_not_live(tmp_path):
    def stale(record):
        record["freshness"] = {
            **record["freshness"],
            "source_as_of": "2026-08-01T03:00:00+00:00",
        }
        return record

    export_dir = _write_539_candidate(tmp_path, mutate_opportunity=stale)
    bundle = C.load_export_dir(export_dir)
    decision = C.decide(bundle["opportunities"][0], manifest=bundle["manifest"])
    assert decision["ready"] is False
    assert decision["state"] == "HOLD_FOR_DATA"
    assert decision["reason_codes"] == ["freshness_stale"]
    assert decision["index_eligible"] is False
    assert decision["source_kind"] != SOURCE_OFFICIAL_LIVE


def test_539_missing_source_is_rejected(tmp_path):
    def unsourced(record):
        record["fonte"] = {}
        return record

    export_dir = _write_539_candidate(tmp_path, mutate_opportunity=unsourced)
    bundle = C.load_export_dir(export_dir)
    decision = C.decide(bundle["opportunities"][0], manifest=bundle["manifest"])
    assert decision["ready"] is False
    assert "source_absent" in decision["reason_codes"]


def test_539_manifest_hash_mismatch_is_rejected(tmp_path):
    export_dir = _write_539_candidate(tmp_path)
    manifest_path = export_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["coverage"] = {**manifest["coverage"], "opportunities_observed": 99}
    # Keep the stale manifest_hash.
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False) + "\n", encoding="utf-8")
    bundle = C.load_export_dir(export_dir)
    decision = C.decide(bundle["opportunities"][0], manifest=bundle["manifest"])
    assert decision["ready"] is False
    assert "manifest_hash_mismatch" in decision["reason_codes"]


def test_539_identity_lives_on_the_sibling_private_path(tmp_path):
    export_dir = _write_539_candidate(tmp_path)
    private_path = C.identity_projection_path_for(export_dir)
    assert private_path == export_dir.parent / f"{export_dir.name}.private" / "identity_projection.json"
    assert private_path.is_file()
    assert not (export_dir / ".private").exists()
    loaded = C.load_identity_projection(
        export_dir,
        manifest_hash=json.loads((export_dir / "manifest.json").read_text(encoding="utf-8"))["manifest_hash"],
    )
    assert loaded is not None
    assert loaded["entries"][0]["company_ref"] == _COMPANY_REF


def test_539_identity_seal_mismatch_fails_closed(tmp_path):
    export_dir = _write_539_candidate(tmp_path)
    private_path = C.identity_projection_path_for(export_dir)
    payload = json.loads(private_path.read_text(encoding="utf-8"))
    payload["sealed_to_manifest_hash"] = "0" * 64
    payload["sealed_hash"] = C.sealed_hash_of(payload)
    private_path.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
    with pytest.raises(C.ConsumeError, match="not sealed"):
        C.load_export_dir(export_dir)


def test_missing_official_source_fails_closed_with_no_fixture_fallback(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "DEFAULT_OFFICIAL_DIR", str(tmp_path / "absent-official"))
    with pytest.raises(C.ConsumeError):
        C.consume()
    out_dir = tmp_path / "out"
    rc = C.main(["--out", str(out_dir.relative_to(ROOT)) if False else str(out_dir), "--write"])
    # main() joins --out to repo root; pass an absolute path via consume write guard.
    assert rc == 1
    assert not list(out_dir.glob("*.json")) if out_dir.exists() else True


def test_main_missing_official_does_not_write_live_projection(capsys):
    """Default CLI entry (no --source) is official and FAIL CLOSED today."""
    assert not (ROOT / DEFAULT_OFFICIAL_DIR).exists()
    rc = C.main([])
    assert rc == 1
    captured = capsys.readouterr().out
    payload = json.loads(captured.strip().splitlines()[-1])
    assert payload["ok"] is False
    assert payload["index_eligible"] is False
    assert payload.get("official_live") is False


def test_main_explicit_fixture_still_runs(capsys):
    rc = C.main(["--source", DEFAULT_FIXTURE_DIR])
    assert rc == 0
    payload = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert payload["source_kind"] == SOURCE_FIXTURE
    assert payload["index_eligible"] is False
    assert payload["opportunities_ready"] == 4


def test_539_pncp_id_is_not_path_traversal():
    with pytest.raises(C.ConsumeError):
        C.assert_safe_opportunity_id("../../etc/passwd")
    with pytest.raises(C.ConsumeError):
        C.assert_safe_opportunity_id("foo/../../etc")
    assert C.assert_safe_opportunity_id(_PNCP_OPPORTUNITY_ID) == _PNCP_OPPORTUNITY_ID


def test_539_company_without_fonte_is_not_source_absent(tmp_path):
    export_dir = _write_539_candidate(tmp_path)
    bundle = C.load_export_dir(export_dir)
    company = bundle["companies"][0]
    assert "fonte" not in company or not company.get("fonte")
    decision = C.decide(company, manifest=bundle["manifest"])
    assert "source_absent" not in decision["reason_codes"]
    assert decision["ready"] is True
    assert decision["index_eligible"] is False
    assert decision["source_kind"] != SOURCE_OFFICIAL_LIVE
