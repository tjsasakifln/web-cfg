#!/usr/bin/env python3
"""Tests for inbound-first gates — drive shipped public HTML and gate functions."""

from __future__ import annotations

import json
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.inbound_gates import (  # noqa: E402
    gate_brand_shell,
    gate_conversion,
    gate_index_surface,
    gate_legacy_entity_matrix,
    gate_naturalness,
    is_indexable_html,
    is_noindex,
    run_all_gates,
)
from scripts.site.test_organic_striking_distance_cro_01 import (  # noqa: E402,F401
    test_article_first_fold_has_required_distinctions,
    test_article_listed_once_in_main_sitemap_not_elsewhere,
    test_contextual_cta_preserves_attrs_and_has_no_pii,
    test_experiment_record_post_metrics_are_unknown,
    test_home_points_to_reequilibrio_with_descriptive_anchor,
    test_hub_and_article_titles_differ,
    test_internal_links_resolve,
    test_itemlist_has_no_empty_or_fake_url,
    test_jsonld_parseable_and_faq_matches_visible,
    test_no_combinatorial_or_new_slug,
    test_no_contract_analysis_in_this_experiment_surface,
    test_no_redirect_of_promoted_article,
    test_one_self_canonical_and_expected_robots,
)


def test_naturalness_indexable_clean():
    r = gate_naturalness(only_indexable=True)
    errors = [f for f in r.findings if f.severity == "error"]
    assert not errors, errors[:5]


def test_index_surface_hub_and_sitemaps():
    r = gate_index_surface()
    assert r.ok, r.findings[:10]
    hub = (ROOT / "conteudos" / "index.html").read_text(encoding="utf-8")
    # must not claim 120 when only ~22 indexable
    assert "120 guias" not in hub
    # no noindex child in directory
    for m in re.finditer(
        r'<article class="content-directory-item"[^>]*>.*?</article>', hub, re.S
    ):
        hrefs = re.findall(r'href="(/conteudos/[^"]+/)"', m.group(0))
        for href in hrefs:
            local = ROOT / href.strip("/") / "index.html"
            assert local.exists(), href
            assert is_indexable_html(local.read_text(encoding="utf-8")), href


def test_pillars_exclude_noindex_library():
    """Commercial pillar hubs must not promote noindex /conteudos/*."""
    from scripts.site.inbound_gates import strip_html

    pillars = [
        "medicoes-glosas-obras-publicas",
        "aditivos-obras-publicas",
        "reequilibrio-obras-publicas",
        "atrasos-prorrogacao-obras-publicas",
        "defesa-tecnica-contratos-publicos",
        "acompanhamento-contratos-obras",
        "diagnostico-pre-licitacao",
        "auditoria-orcamento-licitacao",
    ]
    for pillar in pillars:
        html = (ROOT / pillar / "index.html").read_text(encoding="utf-8")
        kept = len(re.findall(r'class="library-item"', html))
        for m in re.finditer(
            r'<article class="library-item"[^>]*>.*?</article>', html, re.S
        ):
            for href in re.findall(r'href="(/conteudos/[^"]+/)"', m.group(0)):
                local = ROOT / href.strip("/") / "index.html"
                assert local.exists(), (pillar, href)
                assert is_indexable_html(local.read_text(encoding="utf-8")), (
                    pillar,
                    href,
                )
        assert "/#atuacao" not in html, pillar
        # Published guide counts (including HTML-wrapped <strong>N</strong>guias)
        # must not exceed library size.
        plain = strip_html(html)
        for m in re.finditer(r"\b(\d{1,3})\s+guias?\b", plain, re.I):
            n = int(m.group(1))
            assert n <= kept, (pillar, m.group(0), f"kept={kept}")
        for m in re.finditer(
            r'class="pillar-stat"[^>]*>\s*<strong>(\d+)</strong>\s*<span>([^<]*guia[^<]*)</span>',
            html,
            re.I,
        ):
            assert int(m.group(1)) == kept, (
                pillar,
                m.group(1),
                m.group(2),
                f"kept={kept}",
            )


def test_gate_detects_html_wrapped_false_guide_count():
    """Regression: <strong>15</strong><span>guias must fail when library is smaller."""
    from scripts.site.inbound_gates import pillar_guide_count_findings

    # Exact evasion pattern the skeptic found on shipped pillars
    fake = (
        '<div class="pillar-stat"><strong>15</strong>'
        "<span>guias para perguntas específicas</span></div>"
        '<div class="library-list">'
        '<article class="library-item">'
        '<a href="/conteudos/atraso-pagamento-contrato-publico-suspender/">x</a>'
        "</article></div>"
    )
    findings = pillar_guide_count_findings("medicoes-glosas-obras-publicas", fake)
    reasons = {f.reason for f in findings}
    assert "pillar_guide_count_exceeds_library" in reasons, findings
    assert "pillar_stat_count_mismatch_library" in reasons, findings
    assert any("15" in (f.excerpt or "") for f in findings)

    # Clean page with matching count must pass
    clean = (
        '<div class="pillar-stat"><strong>1</strong><span>guia indexável</span></div>'
        '<article class="library-item"><a href="/conteudos/x/">x</a></article>'
    )
    assert pillar_guide_count_findings("medicoes-glosas-obras-publicas", clean) == []


def test_footer_not_legacy_atuacao_on_indexable():
    samples = [
        ROOT / "index.html",
        ROOT / "conteudos" / "atraso-pagamento-contrato-publico-suspender" / "index.html",
        ROOT / "medicoes-glosas-obras-publicas" / "index.html",
        ROOT / "diretoria-b2g" / "index.html",
    ]
    for p in samples:
        html = p.read_text(encoding="utf-8")
        assert "/#atuacao" not in html, p
        # Visitor nav (redesign) or legacy service labels — never orphan /#atuacao
        assert (
            "Analisar meu caso" in html
            or "Serviços" in html
            or "Analisar licitação" in html
            or "Proteger contrato" in html
        ), p


def test_brand_shell_on_indexable_conteudos():
    r = gate_brand_shell()
    assert r.ok, r.findings[:10]


def test_conversion_indexable_has_cta():
    r = gate_conversion()
    assert r.ok, r.findings[:10]
    from scripts.organic.sitemap_graph import load_graph_locs

    assert r.stats["scanned"] == len(load_graph_locs(ROOT))
    assert r.stats["profiles"]["service_pillar"] == 13
    assert r.stats["main_cta"]["coverage"] == 1.0
    assert r.stats["main_cta"]["total"] + r.stats["main_cta"]["exempt"] == r.stats["scanned"]
    # The priced profile is a census of the live surface, never a literal list.
    from scripts.site.inbound_gates import priced_offer_routes

    priced = priced_offer_routes(ROOT)
    assert r.stats["profiles"]["priced_offer"] == len(priced)
    assert r.stats["priced_offer_capture"]["total"] == len(priced)
    assert r.stats["priced_offer_capture"]["coverage"] == 1.0


def test_conversion_fails_before_and_passes_after_onpage_capture():
    routes = (
        "defesa-margem-contratos-publicos",
        "atrasos-prorrogacao-obras-publicas",
        "defesa-tecnica-contratos-publicos",
        "acompanhamento-contratos-obras",
        "bid-room-licitacoes-obras",
    )
    with tempfile.TemporaryDirectory(prefix="confenge-capture-gate-") as tmp:
        tmp_path = Path(tmp)
        for slug in routes:
            target = tmp_path / slug / "index.html"
            target.parent.mkdir(parents=True)
            target.write_text((ROOT / slug / "index.html").read_text(encoding="utf-8"), encoding="utf-8")
        assert gate_conversion(tmp_path).ok

        for slug in routes:
            target = tmp_path / slug / "index.html"
            html = target.read_text(encoding="utf-8")
            html = re.sub(r'<form\b[^>]*>.*?</form>', "", html, flags=re.I | re.S)
            target.write_text(html, encoding="utf-8")
        report = gate_conversion(tmp_path)
        missing = [f for f in report.findings if f.reason == "pillar_missing_onpage_capture"]
        assert report.ok is False
        assert len(missing) == 5


def _capture_gate_tree(tmp_path: Path) -> None:
    """Smallest tree the conversion gate can grade: pillars + every priced route.

    The priced half is discovered, never listed, so a page added to the value
    ladder is graded here the moment it ships.
    """
    from scripts.site.inbound_gates import ONPAGE_CAPTURE_ROUTES, priced_offer_routes

    rels = [f"{slug}/index.html" for slug in ONPAGE_CAPTURE_ROUTES]
    rels += [f"{route.strip('/')}/index.html" for route in priced_offer_routes(ROOT)]
    for rel in rels:
        target = tmp_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text((ROOT / rel).read_text(encoding="utf-8"), encoding="utf-8")


def test_priced_offer_profile_is_derived_from_the_published_price():
    """The census comes from the action contract and the page, not a literal list."""
    from scripts.site.inbound_gates import priced_action_registry, priced_offer_routes

    actions, offers = priced_action_registry()
    assert actions and offers, "the intent-action contract must price the ladder"

    priced = priced_offer_routes(ROOT)
    assert priced, "a site that publishes prices cannot have an empty priced census"
    assert len(priced) == len(actions), sorted(priced)
    assert all(route.startswith("/casos/modelo-") for route in priced), sorted(priced)
    for route, signal in priced.items():
        html = (ROOT / route.strip("/") / "index.html").read_text(encoding="utf-8")
        assert signal in {"registered_priced_action", "visible_price_on_offer_cta"}, route
        # Persisted capture, not only an attributed link out of the page.
        assert 'action="/.netlify/functions/lead"' in html, route
        assert 'name="consentimento"' in html, route
        assert re.search(r'<input[^>]+name="offer_id"[^>]+value=""', html), route


def test_priced_offer_gate_rejects_a_priced_page_without_persisted_capture():
    with tempfile.TemporaryDirectory(prefix="confenge-priced-gate-") as tmp:
        tmp_path = Path(tmp)
        _capture_gate_tree(tmp_path)
        assert gate_conversion(tmp_path).ok

        # 1) An existing priced page keeps every attributed WhatsApp CTA and
        #    loses only the form. `has_attributed_cta` must stop being enough.
        priced_pages = sorted(tmp_path.glob("casos/modelo-*/index.html"))
        assert priced_pages
        victim = priced_pages[-1]
        stripped = re.sub(
            r"<form\b[^>]*>.*?</form>", "", victim.read_text(encoding="utf-8"), flags=re.I | re.S
        )
        assert 'data-cta-id="' in stripped and "wa.me" in stripped
        victim.write_text(stripped, encoding="utf-8")
        report = gate_conversion(tmp_path)
        assert report.ok is False
        assert [
            f.path
            for f in report.findings
            if f.reason == "priced_offer_missing_persisted_capture"
        ] == [str(victim.relative_to(tmp_path))]

        # 2) A ninth priced page shipped without capture fails on arrival.
        victim.write_text(
            (ROOT / victim.relative_to(tmp_path)).read_text(encoding="utf-8"), encoding="utf-8"
        )
        ninth = tmp_path / "casos/modelo-nono-entregavel-precificado/index.html"
        ninth.parent.mkdir(parents=True)
        ninth.write_text(stripped, encoding="utf-8")
        report = gate_conversion(tmp_path)
        assert report.ok is False
        assert [
            f.path
            for f in report.findings
            if f.reason == "priced_offer_missing_persisted_capture"
        ] == [str(ninth.relative_to(tmp_path))]


def test_priced_offer_gate_catches_a_price_that_was_never_registered():
    """A price the action contract never saw is still a price to the visitor."""
    from scripts.site.inbound_gates import priced_offer_routes

    with tempfile.TemporaryDirectory(prefix="confenge-rogue-price-") as tmp:
        tmp_path = Path(tmp)
        _capture_gate_tree(tmp_path)
        donor = sorted(tmp_path.glob("casos/modelo-*/index.html"))[-1]
        html = re.sub(
            r"<form\b[^>]*>.*?</form>", "", donor.read_text(encoding="utf-8"), flags=re.I | re.S
        )
        html = re.sub(r'data-next-action-id="[^"]*"', 'data-next-action-id="contratar_x"', html)
        html = re.sub(r'data-offer-id="[^"]*"', 'data-offer-id="handraise-nao-registrada-v1"', html)
        rogue = tmp_path / "casos/modelo-oferta-fora-do-contrato/index.html"
        rogue.parent.mkdir(parents=True)
        rogue.write_text(html, encoding="utf-8")

        route = "/casos/modelo-oferta-fora-do-contrato/"
        assert priced_offer_routes(tmp_path)[route] == "visible_price_on_offer_cta"
        report = gate_conversion(tmp_path)
        assert report.ok is False
        assert any(
            f.reason == "priced_offer_missing_persisted_capture"
            and f.path == str(rogue.relative_to(tmp_path))
            for f in report.findings
        ), report.findings[:5]


def test_priced_offer_gate_refuses_an_invented_checkout_on_a_handraise_page():
    """#88 freezes the catalog: a ladder page may never submit a paid offer id."""
    with tempfile.TemporaryDirectory(prefix="confenge-priced-checkout-") as tmp:
        tmp_path = Path(tmp)
        _capture_gate_tree(tmp_path)
        victim = sorted(tmp_path.glob("casos/modelo-*/index.html"))[-1]
        html = victim.read_text(encoding="utf-8").replace(
            '<input name="offer_id" type="hidden" value=""/>',
            '<input name="offer_id" type="hidden" value="CFG-DIAG-EXP-v1"/>',
            1,
        )
        victim.write_text(html, encoding="utf-8")
        report = gate_conversion(tmp_path)
        assert report.ok is False
        assert any(f.reason == "priced_offer_checkout_invented" for f in report.findings)


def test_legacy_redirects_matrix():
    r = gate_legacy_entity_matrix()
    assert r.ok, r.findings


def test_machine_patterns_absent_on_sample_indexable():
    samples = [
        "atraso-pagamento-contrato-publico-suspender",
        "atraso-na-medicao-obra-publica",
        # limite-aditivo-25-50-obra-publica is self-canonical again; sampled by
        # test_organic_striking_distance_cro_01 instead of this machine-copy set.
        "glosa-por-qualidade-obra-publica",
        "comprovacao-exequibilidade-proposta-obra",
    ]
    for slug in samples:
        p = ROOT / "conteudos" / slug / "index.html"
        html = p.read_text(encoding="utf-8")
        assert is_indexable_html(html), slug
        assert "Converta a discussão" not in html, slug
        assert "Qual documento deve ser lido primeiro em um caso de" not in html, slug
        assert "primeiro risco prático em um caso de" not in html.lower() or "caso de" not in html.lower()
        # stronger:
        assert not re.search(
            r"Qual o primeiro risco pr[aá]tico em um caso de", html, re.I
        ), slug


def test_feed_excludes_noindex():
    feed = (ROOT / "feed.xml").read_text(encoding="utf-8")
    for m in re.finditer(r"<link>([^<]+)</link>", feed):
        loc = m.group(1)
        if "/conteudos/" not in loc or loc.rstrip("/").endswith("conteudos"):
            continue
        path = re.sub(r"^https?://[^/]+", "", loc)
        if not path.endswith("/"):
            path += "/"
        local = ROOT / path.strip("/") / "index.html"
        if local.exists():
            assert is_indexable_html(local.read_text(encoding="utf-8")), path


def test_disposition_matrix_exists_and_covers_classes():
    path = ROOT / "docs" / "seo" / "URL-DISPOSITION-MATRIX.json"
    assert path.exists(), "disposition matrix missing"
    rows = json.loads(path.read_text(encoding="utf-8"))
    assert len(rows) >= 50
    classes = {r["disposition"] for r in rows}
    # expected classes present in matrix
    for need in ("KEEP_AND_IMPROVE", "RETAIN_NOINDEX", "RETIRE_410", "REDIRECT_301"):
        assert need in classes, classes
    # no auto-approval invented: editorial REJECTED stays blocked
    rejected = [r for r in rows if r.get("editorial_status") == "REJECTED"]
    for r in rejected:
        assert r["disposition"] in ("BLOCKED_MISSING_EVIDENCE", "RETAIN_NOINDEX", "BLOCKED_HUMAN_REVIEW")


def test_run_all_gates_ok():
    report = run_all_gates()
    assert report["ok"], json.dumps(
        {k: v["findings"][:3] for k, v in report["gates"].items() if not v["ok"]},
        ensure_ascii=False,
        indent=2,
    )


def test_no_auto_approve_in_remediation_scripts():
    """Remediation must not stamp HUMAN_APPROVED / INDEXABLE."""
    for rel in (
        "scripts/site/inbound_first_remediate.py",
        "scripts/site/inbound_gates.py",
    ):
        text = (ROOT / rel).read_text(encoding="utf-8")
        assert "HUMAN_APPROVED" not in text or "do not" in text.lower() or "NOT" in text
        # must not assign INDEXABLE status
        assert not re.search(r'status\s*=\s*["\']INDEXABLE["\']', text)
        assert "advance(" not in text or "editorial" not in rel


if __name__ == "__main__":
    # simple runner
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("OK", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, exc)
    raise SystemExit(1 if failed else 0)
