#!/usr/bin/env python3
"""Tests for the evidence-based indexation verdicts.

These pin the properties that make INSTANCE_INDEX_READY and
ARCHETYPE_EDITORIAL_READY non-circular: the verdict must not read the page's
robots meta or its governance record, a subgate must be able to fail on real
shipped HTML, and REJECT_WITHDRAW must stay distinct from NOT_PUBLIC_SAFE and
from NOINDEX_JUSTIFIED.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.naturalness import jaccard_similarity  # noqa: E402
from scripts.site import inbound_gates as G  # noqa: E402
from scripts.site.universe_sweep import BUCKET_ORDER, sweep  # noqa: E402

_CTX = None


def ctx():
    global _CTX
    if _CTX is None:
        _CTX = G.build_indexation_context()
    return _CTX


def _sample_route(predicate) -> tuple[str, str]:
    for route in sorted(ctx().html_by_route):
        if predicate(route):
            return route, ctx().html_by_route[route]
    raise AssertionError("no shipped route matches the predicate")


def test_family_shingles_match_the_similarity_gate():
    """The precomputed shingling must be the metric gate_similarity_indexable uses."""
    a = "medicao glosa obra publica rejeitada pelo fiscal do contrato em abril"
    b = "medicao glosa obra publica aceita pelo fiscal do contrato em abril"
    mine = G._jaccard(G._shingle_set(a, G.SHINGLE_N), G._shingle_set(b, G.SHINGLE_N))
    theirs = jaccard_similarity(a, b, n=G.SHINGLE_N)
    assert abs(mine - theirs) < 1e-9, (mine, theirs)


def test_instance_verdict_ignores_the_robots_meta_it_is_auditing():
    """Flipping robots must not change the verdict. That is the whole point."""
    route, html = _sample_route(lambda r: r.startswith("/conteudos/") and r != "/conteudos/")
    family = ctx().route_family.get(route)
    indexable = html.replace("noindex,follow", "index,follow").replace(
        "noindex, follow", "index, follow"
    )
    noindexed = html.replace("index,follow", "noindex,follow")
    first, first_detail = G.instance_index_ready_for_route(route, indexable, family, ctx())
    second, second_detail = G.instance_index_ready_for_route(route, noindexed, family, ctx())
    assert first == second
    assert first_detail["blocking"] == second_detail["blocking"]


def test_instance_verdict_reads_the_html_it_was_handed_not_the_disk():
    """Every subgate must judge the passed HTML, or a caller checking an edited
    or not-yet-published page gets a verdict about the version on disk."""
    route, html = _sample_route(lambda r: r.startswith("/conteudos/") and r != "/conteudos/")
    family = ctx().route_family.get(route)
    _, before = G.instance_index_ready_for_route(route, html, family, ctx())
    gutted = "<html><head></head><body><main><p>vazio</p></main></body></html>"
    _, after = G.instance_index_ready_for_route(route, gutted, family, ctx())
    assert after["blocking"] != before["blocking"]
    # A route the context has never seen must not pass distinct-grain trivially.
    # politica-editorial is small enough that MAX_SIBLING_COMPARISONS cannot
    # sample the twin away, so the clone is guaranteed to be compared.
    twin = ctx().family_routes["politica-editorial"][0]
    unseen = "/politica-editorial/rota-que-nao-existe-no-disco/"
    grain = G._sub_distinct_grain(
        unseen, ctx().html_by_route[twin], ctx(), "politica-editorial"
    )
    assert grain.applicable and not grain.passed, grain.detail
    assert not G._sub_distinct_grain(unseen, "", ctx(), "politica-editorial").passed


def test_instance_verdict_ignores_the_governance_registry():
    """A governance reason_code must not be able to manufacture readiness."""
    route, html = _sample_route(lambda r: r.startswith("/oportunidades/"))
    family = ctx().route_family.get(route)
    ready, detail = G.instance_index_ready_for_route(route, html, family, ctx())
    # live-intelligence-opportunity carries reason_code fixture_synthetic, which
    # under the old gate made every one of its routes "justified".
    assert not ready
    assert "official_live" in detail["blocking"], detail["blocking"]


def test_every_subgate_reports_severity_and_applicability():
    route, html = _sample_route(lambda r: r == "/")
    _, detail = G.instance_index_ready_for_route(route, html, ctx().route_family.get(route), ctx())
    assert detail["subgates"], detail
    for name, result in detail["subgates"].items():
        assert set(result) == {"passed", "applicable", "severity", "detail"}, name
        assert result["severity"] in {G.SUBGATE_MATERIAL, G.SUBGATE_REMEDIABLE}, name
        assert result["detail"], name


def test_a_stale_or_undated_page_fails_freshness():
    stale = '<html><head><meta property="article:modified_time" content="2019-01-01"></head><body><main><p>x</p></main></body></html>'
    assert not G._sub_freshness(stale, ctx()).passed
    undated = "<html><body><main><p>sem data nenhuma aqui</p></main></body></html>"
    assert not G._sub_freshness(undated, ctx()).passed
    fresh = f'<html><head><meta property="article:modified_time" content="{ctx().today.isoformat()}"></head><body></body></html>'
    assert G._sub_freshness(fresh, ctx()).passed


def test_structured_dates_win_over_a_quoted_statute_date():
    """A statute quoted in prose is not this page's own freshness claim."""
    html = (
        '<html><head><meta property="article:modified_time" content="2026-08-01">'
        "</head><body><main><p>Lei 14.133, de 1º de abril de 2021.</p></main></body></html>"
    )
    assert G.page_dates(html) == [date(2026, 8, 1)]


def test_self_canonical_requires_exactly_one_self_referential_tag():
    route = "/conteudos/exemplo/"
    none_at_all = "<html><head></head><body></body></html>"
    assert not G._sub_self_canonical(route, none_at_all).passed
    two = (
        '<html><head><link rel="canonical" href="https://confenge.com.br/conteudos/exemplo/">'
        '<link rel="canonical" href="https://confenge.com.br/outro/"></head></html>'
    )
    assert not G._sub_self_canonical(route, two).passed
    elsewhere = '<html><head><link rel="canonical" href="https://confenge.com.br/outro/"></head></html>'
    assert not G._sub_self_canonical(route, elsewhere).passed
    good = '<html><head><link rel="canonical" href="https://confenge.com.br/conteudos/exemplo/"></head></html>'
    assert G._sub_self_canonical(route, good).passed


def test_canonical_hrefs_is_the_one_extractor_index_surface_also_uses():
    html = '<html><head><link rel="canonical" href="/a/"></head></html>'
    assert G.canonical_hrefs(html) == ["/a/"]
    assert G.canonical_hrefs("<html><head></head></html>") == []


def test_a_disclaimer_is_not_an_accusation_and_a_real_claim_still_fails():
    family = {"id": "analises-contratos-publicos"}
    disclaimed = (
        "<html><body><main><p>Limitação: não é parecer jurídico, não julga "
        "irregularidade e não transforma “atípico” em “irregular”.</p></main></body></html>"
    )
    assert G._sub_reputational_safety(disclaimed, family).passed
    accusing = (
        "<html><body><main><p>A construtora cometeu irregularidade grave na "
        "execução do contrato.</p></main></body></html>"
    )
    assert not G._sub_reputational_safety(accusing, family).passed


def test_reputational_safety_does_not_police_the_educational_library():
    """The library discusses irregularidade as a subject, not as an accusation."""
    family = {"id": "editorial-library", "profile": "commercial_content"}
    html = "<html><body><main><p>Quando a glosa é irregular e como contestá-la.</p></main></body></html>"
    result = G._sub_reputational_safety(html, family)
    assert not result.applicable


def test_a_legacy_entity_named_in_order_to_be_disowned_is_public_safe():
    disowning = "<html><body><main><p>Não somos: avaliações imobiliárias, AVCB/CLCB ou automação genérica.</p></main></body></html>"
    assert G._sub_public_safe("/imprensa/", disowning).passed
    promoting = "<html><body><main><p>Emitimos AVCB para o seu empreendimento.</p></main></body></html>"
    assert not G._sub_public_safe("/servicos/", promoting).passed


def test_archetype_verdict_is_composite_not_only_the_jargon_scan():
    family = next(f for f in ctx().families if f["id"] == "live-intelligence-opportunity")
    _, detail = G.archetype_editorial_ready_for_family(family, context=ctx())
    names = set(detail["subgates"])
    assert {
        "public_safe",
        "jargon_free",
        "answer_first",
        "substantive",
        "specific_value",
        "caveats_preserved",
        "cta_subordinate",
        "named_gate_verdict",
        "not_doorway",
        "regression_fixtures",
    } <= names, sorted(names)


def _first_party(fid: str, waived: list[str]) -> dict:
    return {
        "id": fid,
        "index_evidence": {
            "substrate": G.SUBSTRATE_FIRST_PARTY,
            "not_applicable": waived,
            "reason": "motivo escrito",
            "authority": ["/politica-editorial/"],
            "declared_at": "2026-09-03",
            "owner_issue": 300,
        },
    }


def test_an_honest_synthetic_caveat_is_not_a_fixture_confession():
    """The library discloses that its worked numbers are illustrative. That
    sentence is what ``_caveats_preserved`` rewards; reading it as a fixture
    admission made the gate system punish and reward the same string."""
    disclaimers = (
        "Os números acima são premissas sintéticas, não tabela oficial do mês.",
        "Os valores desta página são premissas sintéticas; os livros CAIXA "
        "explicam o método.",
        "Exemplo inteiramente sintético, sem dado de obra real.",
        "Nesta página: Três camadas, Exemplo sintético, Checagem de campo.",
        "O exemplo sintético de carteira de contratos abre sem cadastro.",
    )
    for sentence in disclaimers:
        html = f"<html><body><main><p>{sentence}</p></main></body></html>"
        result = G._sub_official_live("/conteudos/x/", html, {"id": "editorial-library"}, ctx())
        assert result.applicable and result.passed, (sentence, result.detail)
    # The word still condemns the page when it qualifies the RECORD itself.
    for sentence in (
        "Exemplar público com dados integralmente sintéticos.",
        "Órgãos, contratos, valores, datas e séries anuais são sintéticos.",
        "Esta página usa uma base de dados sintética.",
        "Perfil contratual (fixture — aguardando dados de produção).",
    ):
        html = f"<html><body><main><p>{sentence}</p></main></body></html>"
        result = G._sub_official_live("/conteudos/x/", html, {"id": "editorial-library"}, ctx())
        assert result.applicable and not result.passed, (sentence, result.detail)


def test_the_editorial_library_still_has_to_prove_external_evidence():
    """The nine /conteudos/ pages were cleared by fixing the detector, NOT by a
    waiver: the library keeps official_live and citable_source applicable, so a
    genuinely fixture-backed post there still fails."""
    family = next(f for f in ctx().families if f["id"] == "editorial-library")
    assert G.INDEX_EVIDENCE_KEY not in family
    route, html = _sample_route(
        lambda r: r.startswith("/conteudos/") and r != "/conteudos/"
    )
    _, detail = G.instance_index_ready_for_route(route, html, family, ctx())
    assert detail["subgates"]["official_live"]["applicable"] is True, route
    assert detail["subgates"]["citable_source"]["applicable"] is True, route


def test_a_first_party_declaration_scopes_only_the_external_record_questions():
    """The waiver is a scope statement, not a readiness certificate: everything
    that actually tests a first-party page stays applicable and blocking."""
    family = _first_party("service-pillars", ["official_live", "citable_source"])
    thin = '<html><head></head><body><main><p>curto</p></main></body></html>'
    _, detail = G.instance_index_ready_for_route("/x/", thin, family, ctx())
    for name in ("official_live", "citable_source"):
        assert detail["subgates"][name]["applicable"] is False, name
        # The reason travels with the verdict, so the report explains itself.
        assert "motivo escrito" in detail["subgates"][name]["detail"], name
    for name in ("freshness", "archetype_completeness", "self_canonical"):
        assert detail["subgates"][name]["applicable"] is True, name
        assert name in detail["blocking"], name


def test_a_declaration_may_not_waive_anything_but_the_two_external_subgates():
    for waived in (["freshness"], ["archetype_completeness"], ["public_safe"], []):
        try:
            G.validate_index_evidence_declarations([_first_party("casos", waived)])
        except SystemExit as exc:
            assert "INDEX_EVIDENCE_DECLARATION_INVALID" in str(exc), waived
        else:
            raise AssertionError(f"waiving {waived} must not be accepted")
    G.validate_index_evidence_declarations([_first_party("casos", ["citable_source"])])


def test_a_family_of_external_records_may_never_declare_first_party():
    """The tripwire, not a convention: live-intelligence and the contract
    analyses represent records acquired outside this site."""
    for fid in ("live-intelligence-opportunity", "analises-contratos-publicos"):
        try:
            G.validate_index_evidence_declarations(
                [_first_party(fid, ["official_live"])]
            )
        except SystemExit as exc:
            assert "may never declare first_party_publication" in str(exc), fid
        else:
            raise AssertionError(f"{fid} must not be able to waive official_live")


def test_a_malformed_declaration_fails_closed():
    for broken in (
        {"id": "casos", "index_evidence": {"substrate": "legado"}},
        {"id": "casos", "index_evidence": "first_party"},
        {
            "id": "casos",
            "index_evidence": {
                "substrate": G.SUBSTRATE_FIRST_PARTY,
                "not_applicable": ["citable_source"],
                "authority": ["/politica-editorial/"],
                "declared_at": "2026-09-03",
                "owner_issue": 300,
            },
        },
    ):
        try:
            G.validate_index_evidence_declarations([broken])
        except SystemExit:
            continue
        raise AssertionError(f"malformed declaration accepted: {broken}")
    # Absent is the strict default: no declaration, no waiver.
    G.validate_index_evidence_declarations([{"id": "editorial-library"}])
    assert G.external_evidence_waiver({"id": "editorial-library"}, "official_live") is None


def test_every_shipped_declaration_is_valid_and_narrow():
    G.validate_index_evidence_declarations(ctx().families)
    for family in ctx().families:
        declared = family.get(G.INDEX_EVIDENCE_KEY)
        if not declared:
            continue
        waived = set(declared["not_applicable"])
        assert waived <= G.WAIVABLE_EXTERNAL_EVIDENCE_SUBGATES, family["id"]


def test_the_residue_names_the_remedy_it_needs():
    """Nothing may sit in INDEXABLE_WITHOUT_EVIDENCE unexplained."""
    from scripts.site.universe_sweep import REMEDY_BY_SUBGATE

    report = sweep()
    by_remedy = report["indexable_without_evidence_by_remedy"]
    assert "UNCLASSIFIED" not in by_remedy, by_remedy.get("UNCLASSIFIED")
    assert set(by_remedy) <= {name for name, _ in REMEDY_BY_SUBGATE}
    flat = [route for routes in by_remedy.values() for route in routes]
    assert sorted(flat) == sorted(report["indexable_without_evidence"])


def test_historic_families_are_not_forced_into_the_jargon_ban():
    """politica-editorial documents the epistemic vocabulary on purpose."""
    family = next(f for f in ctx().families if f["id"] == "politica-editorial")
    assert not family.get("editorial_jargon_strict")
    _, detail = G.archetype_editorial_ready_for_family(family, context=ctx())
    assert detail["subgates"]["jargon_free"]["applicable"] is False


def test_archetype_inherits_materiality_and_never_invents_it():
    """A copy defect stays remediable; only a named REJECT or a doorway is material."""
    verdicts = G.gate_archetype_editorial_ready().stats["verdicts"]
    for fid, verdict in verdicts.items():
        for name in verdict["material"]:
            assert name in {"named_gate_verdict", "not_doorway", "public_safe"}, (fid, name)
    assert verdicts["editorial-library"]["material"] == [], verdicts["editorial-library"]


def test_only_a_doorway_archetype_is_inherited_by_its_instances():
    """A named REJECT is per-instance; it must not withdraw the family around it."""
    from scripts.site.universe_sweep import ARCHETYPE_LEVEL_MATERIAL

    assert ARCHETYPE_LEVEL_MATERIAL == {"not_doorway"}
    report = sweep()
    for route, row in report["routes"].items():
        inherited = [m for m in row["material"] if m.startswith("archetype:")]
        assert all(m == "archetype:not_doorway" for m in inherited), (route, inherited)


def test_a_caveat_may_not_be_stripped_along_with_the_jargon():
    with_claim_no_caveat = "O reajuste apurado foi de 12,5% sobre o saldo contratual."
    assert not G._caveats_preserved("/x/", with_claim_no_caveat).passed
    with_claim_and_caveat = (
        "O reajuste apurado foi de 12,5% sobre o saldo contratual. "
        "É uma estimativa e não substitui a análise do contrato."
    )
    assert G._caveats_preserved("/x/", with_claim_and_caveat).passed
    no_claim = "Esta página descreve a política de conflitos de interesse."
    assert not G._caveats_preserved("/x/", no_claim).applicable


def test_every_route_lands_in_exactly_one_declared_bucket():
    report = sweep()
    assert report["schema_version"] == "universe-sweep-v2"
    assert set(report["buckets"]) == set(BUCKET_ORDER)
    seen: set[str] = set()
    for routes in report["buckets"].values():
        assert not (seen & set(routes)), seen & set(routes)
        seen |= set(routes)
    assert len(seen) == report["total_routes"] == len(ctx().html_by_route)


def test_reject_withdraw_is_distinct_from_not_public_safe_and_noindex_justified():
    report = sweep()
    rejected = set(report["buckets"]["REJECT_WITHDRAW"])
    assert not rejected & set(report["buckets"]["NOT_PUBLIC_SAFE"])
    assert not rejected & set(report["buckets"]["NOINDEX_JUSTIFIED"])
    # Every rejected route names the material subgate that rejected it. The
    # bucket is deliberately not asserted non-empty: withdrawing the routes in
    # it is the correct remediation, and a test that went red on success would
    # only invite someone to loosen the gate.
    for route in rejected:
        assert report["routes"][route]["material"], route
    # A route rejected only for unsafe copy belongs in NOT_PUBLIC_SAFE instead.
    for route in report["buckets"]["NOT_PUBLIC_SAFE"]:
        assert "public_safe" in report["routes"][route]["blocking"], route


def test_index_ready_but_noindex_means_earned_and_suppressed():
    report = sweep()
    for route in report["buckets"]["INDEX_READY_BUT_NOINDEX"]:
        row = report["routes"][route]
        assert row["instance_index_ready"] is True, route
        assert row["noindex"] is True, route
        assert row["blocking"] == [], route


def test_noindex_justified_never_covers_a_route_that_earned_its_slot():
    report = sweep()
    for route in report["buckets"]["NOINDEX_JUSTIFIED"]:
        row = report["routes"][route]
        assert row["instance_index_ready"] is False, route
        assert row["governance_reason_code"], route


def test_one_hundred_near_duplicate_templates_fail_doorway():
    """A rewrite of the same economic fact 100 times is a doorway, not 100 URLs."""
    from scripts.site.inbound_gates import FAMILY_CLONE_JACCARD, _jaccard, _shingle_set

    pages = []
    for i in range(100):
        html = (
            f"<main><h1>Radar de obras {i}</h1>"
            "<p>Oportunidades abertas de pavimentação urbana com o mesmo objeto, "
            "mesmo órgão e mesmo valor estimado. Página gerada por template.</p>"
            "<p>Valor estimado declarado na fonte: R$ 2.500.000,00.</p></main>"
        )
        pages.append((f"/oportunidades/dup-{i}/", html))
    shingles = [(r, _shingle_set(G.visible_main_text(h))) for r, h in pages]
    worst = 0.0
    for i in range(len(shingles)):
        for j in range(i + 1, min(i + 5, len(shingles))):
            worst = max(worst, _jaccard(shingles[i][1], shingles[j][1]))
    assert worst >= FAMILY_CLONE_JACCARD


def test_fixture_backed_and_low_quality_index_counters_are_zero_or_named():
    report = sweep()
    assert report["counts"]["INDEX_READY_BUT_NOINDEX"] == 0
    fixture_indexed = [
        route
        for route, row in report["routes"].items()
        if row.get("noindex") is False
        and route.startswith(("/oportunidades/", "/analise-cnpj/"))
        and "fixture" in (row.get("governance_reason_code") or "")
    ]
    assert fixture_indexed == []
    low_quality = report["buckets"].get("INDEXABLE_WITHOUT_EVIDENCE") or []
    # Named counter: low-quality indexed must stay empty of live-intelligence
    # opportunity pages. Broader INDEXABLE_WITHOUT_EVIDENCE is tracked separately.
    li_low = [r for r in low_quality if r.startswith("/oportunidades/")]
    assert li_low == []


def test_the_sweep_does_not_mutate_public_html():
    before = {
        route: ctx().path_by_route[route].read_bytes()
        for route in list(sorted(ctx().html_by_route))[:20]
    }
    sweep()
    for route, payload in before.items():
        assert ctx().path_by_route[route].read_bytes() == payload, route


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("OK", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, f"{type(exc).__name__}: {exc}")
    raise SystemExit(1 if failed else 0)
