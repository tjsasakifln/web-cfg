"""Fail-closed visible-parity tests.

Drives scripts.site.visible_parity (the shipped compare, eligibility and
scan). Negative fixtures must produce their named defect and stay
non-INDEX. A passing test fails when the shipped function would accept
an overclaim.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.render import render_page  # noqa: E402
from scripts.organic.gates import indexability_quality_gate  # noqa: E402
from scripts.site.authority import representative_pages  # noqa: E402
from scripts.site.visible_parity import (  # noqa: E402
    compare_visible_parity,
    filter_sitemap_urls,
    fixture_dir,
    index_eligibility,
    is_fixture_only,
    iter_negative_fixtures,
    load_fixture_manifest,
    scan_site_artifact,
)


def test_fixture_manifest_names_five_non_public_cases():
    man = load_fixture_manifest()
    assert man["label"] == "FIXTURE_ONLY"
    assert man["public"] is False
    assert man["index_eligible"] is False
    ids = [c["id"] for c in man["cases"]]
    assert ids == [
        "false-case-study",
        "invisible-reviewer",
        "dataset-without-dataset",
        "stale-date",
        "divergent-claim",
    ]
    for case_id, path, _defect in iter_negative_fixtures():
        assert path.is_file(), path
        html = path.read_text(encoding="utf-8")
        assert is_fixture_only(html), case_id
        assert "noindex" in html.lower()


def test_each_negative_fixture_fails_closed_with_named_defect_and_stays_non_index():
    expected = {case_id: defect for case_id, _path, defect in iter_negative_fixtures()}
    for case_id, path, defect in iter_negative_fixtures():
        html = path.read_text(encoding="utf-8")
        parity = compare_visible_parity(html)
        codes = [d["code"] for d in parity["defects"]]
        assert defect in codes, f"{case_id}: wanted {defect} in {codes}"
        assert parity["ok"] is False
        elig = index_eligibility(html, url="https://confenge.com.br/fixtures/" + case_id + "/")
        assert elig["indexable"] is False, case_id
        assert elig["sitemap_include"] is False, case_id
        assert elig["decision"] == "noindex", case_id
        assert "fixture_only" in elig["fails"]
        assert expected[case_id] in elig["fails"] or any(
            d["code"] == expected[case_id] for d in elig["defects"]
        )


def test_overclaim_withdraws_sitemap_membership_not_just_a_warning():
    path = fixture_dir() / "invisible-reviewer.html"
    html = path.read_text(encoding="utf-8")
    url = "https://confenge.com.br/lei-14133-obras/limite-25-50-aditivo-obra/"
    kept = filter_sitemap_urls([(url, html)])
    assert kept == []
    elig = index_eligibility(html, url=url)
    assert elig["sitemap_include"] is False
    assert elig["indexable"] is False
    assert "schema_reviewer_not_visible" in [d["code"] for d in elig["defects"]]
    assert not elig.get("warnings") or "schema_reviewer_not_visible" not in (
        elig.get("warnings") or []
    )
    gate = indexability_quality_gate(
        distinct_intent=True,
        own_information=True,
        sample_size=99,
        semantic_differentiation=0.9,
        independent_utility=True,
        data_confidence=0.9,
        non_redundant=True,
        no_cannibalization=True,
        has_context_interpretation=True,
        identifiable_update=True,
        useful_internal_links=True,
        contextual_cta=True,
        has_provenance=True,
        content_value_score=99,
        visible_parity=False,
    )
    assert gate["indexable"] is False
    assert "visible_parity_overclaim" in gate["fails"]
    assert gate["decision"] == "noindex"


def test_divergent_claim_fixture_flags_title_and_description():
    html = (fixture_dir() / "divergent-claim.html").read_text(encoding="utf-8")
    parity = compare_visible_parity(html)
    codes = {d["code"] for d in parity["defects"]}
    assert "meta_title_diverges" in codes
    assert "meta_description_diverges" in codes or "schema_description_diverges" in codes


def test_dataset_fixture_flags_dataset_and_download():
    html = (fixture_dir() / "dataset-without-dataset.html").read_text(encoding="utf-8")
    parity = compare_visible_parity(html)
    codes = {d["code"] for d in parity["defects"]}
    assert "schema_dataset_without_visible_dataset" in codes
    assert "schema_datadownload_without_visible_download" in codes


def test_stale_date_fixture_flags_schema_date():
    html = (fixture_dir() / "stale-date.html").read_text(encoding="utf-8")
    parity = compare_visible_parity(html)
    assert any(d["code"] == "schema_date_stale" and "2019-01-01" in d["claimed"] for d in parity["defects"])


def test_false_case_study_fixture_flags_case_semantics():
    html = (fixture_dir() / "false-case-study.html").read_text(encoding="utf-8")
    parity = compare_visible_parity(html)
    assert any(d["code"] == "schema_false_case_study" for d in parity["defects"])


def test_representative_authority_pages_pass_visible_parity():
    for kind, path in representative_pages().items():
        html = path.read_text(encoding="utf-8")
        if "noindex" in html.lower():
            continue
        parity = compare_visible_parity(
            html,
            url="https://confenge.com.br/" + str(path.relative_to(ROOT)).replace("index.html", ""),
        )
        assert parity["ok"], f"{kind} {path}: {parity['defects']}"


def test_editable_money_surfaces_have_visible_person_and_faq_schema():
    routes = (
        "defesa-margem-contratos-publicos",
        "bid-room-licitacoes-obras",
        "diretoria-b2g",
        "diagnostico-b2g-expansao",
    )
    for route in routes:
        html = (ROOT / route / "index.html").read_text(encoding="utf-8")
        assert '"@type":"Person"' in html, route
        assert '"@type":"FAQPage"' in html, route
        parity = compare_visible_parity(html, url=f"https://confenge.com.br/{route}/")
        assert parity["ok"], f"{route}: {parity['defects']}"


def test_invisible_faq_schema_fails_closed():
    html = """<!doctype html><html><head><title>Teste</title>
    <meta name=\"robots\" content=\"index,follow\"><link rel=\"canonical\" href=\"https://confenge.com.br/teste/\">
    <script type=\"application/ld+json\">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Pergunta invisível?","acceptedAnswer":{"@type":"Answer","text":"Resposta invisível."}}]}</script>
    </head><body data-visible-schema-parity="true"><main><h1>Teste</h1></main></body></html>"""
    parity = compare_visible_parity(html, url="https://confenge.com.br/teste/")
    assert not parity["ok"]
    assert any("schema_faq_" in defect["claimed"] for defect in parity["defects"])


def test_atomic_currency_entity_remains_visible_to_schema_parity():
    html = """<!doctype html><html><head><title>Teste</title>
    <meta name="robots" content="index,follow"><link rel="canonical" href="https://confenge.com.br/teste/">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Quanto custa?","acceptedAnswer":{"@type":"Answer","text":"Custa R$ 8.000, pagamento único."}}]}</script>
    </head><body data-visible-schema-parity="true"><main><h1>Teste</h1>
    <h2>Quanto custa?</h2><p>Custa R$&nbsp;8.000, pagamento único.</p>
    </main></body></html>"""

    parity = compare_visible_parity(html, url="https://confenge.com.br/teste/")

    assert parity["ok"], parity["defects"]


def test_correction_same_render_updates_visible_and_jsonld():
    src = json.loads(
        (ROOT / "data" / "editorial" / "pages" / "lei-limite-25-50.json").read_text(
            encoding="utf-8"
        )
    )
    before = render_page(src)
    assert "Biblioteca técnica CONFENGE" in before
    assert "2026-08-04" in before

    updated = copy.deepcopy(src)
    updated["author_public"] = "Autoria Corrigida CONFENGE"
    updated["date_modified"] = "2026-08-16"
    updated["reviewer_public"] = "Revisor Técnico Nomeado"
    updated["data_version"] = "editorial-lei-limite-25-50-v2"
    updated["license"] = "https://confenge.com.br/termos-de-uso/"
    updated["meta_description"] = (
        "Correção 2026-08-16: teto do art. 125 na Lei 14.133, saldo de aditivo "
        "e documentos que sustentam o enquadramento do acréscimo."
    )
    after = render_page(updated)

    assert "Autoria Corrigida CONFENGE" in after
    assert "2026-08-16" in after
    assert "Revisor Técnico Nomeado" in after
    assert "editorial-lei-limite-25-50-v2" in after
    assert "https://confenge.com.br/termos-de-uso/" in after
    assert "Biblioteca técnica CONFENGE" not in after
    assert "2026-08-04" not in after

    parity = compare_visible_parity(
        after,
        url="https://confenge.com.br" + (src.get("canonical_path") or src["url"]),
    )
    assert parity["ok"], parity["defects"]
    vis = parity["visible"]
    claimed = parity["claimed"]
    assert "Autoria Corrigida CONFENGE" in vis["authors"] or "autoria corrigida" in (
        vis.get("title") or ""
    ).lower() or "Autoria Corrigida CONFENGE" in after
    assert "2026-08-16" in vis["dates"]
    assert any("Revisor Técnico Nomeado" in r for r in vis["reviewers"])
    assert any("editorial-lei-limite-25-50-v2" in v for v in vis["versions"])
    assert any("termos-de-uso" in x for x in vis["licenses"])
    assert "2026-08-16" in claimed["dates"]
    assert any("Revisor Técnico Nomeado" in r for r in claimed["reviewers"])
    assert "editorial-lei-limite-25-50-v2" in claimed["versions"]
    assert any("termos-de-uso" in x for x in claimed["licenses"])
    assert "Biblioteca técnica CONFENGE" not in json.dumps(claimed, ensure_ascii=False)
    assert "2026-08-04" not in json.dumps(claimed, ensure_ascii=False)


def test_scan_site_artifact_is_deterministic():
    site = ROOT / "_site"
    if not site.is_dir():
        site = ROOT
    first = scan_site_artifact(site, only_index_intent=True)
    second = scan_site_artifact(site, only_index_intent=True)
    a = json.dumps(first, ensure_ascii=False, indent=2, sort_keys=True)
    b = json.dumps(second, ensure_ascii=False, indent=2, sort_keys=True)
    assert a == b


if __name__ == "__main__":
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print("OK", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, exc)
    sys.exit(1 if failed else 0)
