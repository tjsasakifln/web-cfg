#!/usr/bin/env python3
"""Tests for inbound-first gates — drive shipped public HTML and gate functions."""

from __future__ import annotations

import hashlib
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


def _sha256(path: Path) -> str:
    # Keep the evidence stable across Windows and Linux checkouts.
    normalized = path.read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha256(normalized).hexdigest()


def test_measurement_delay_canary_389_is_single_url_and_fail_closed():
    evidence = ROOT / "docs" / "evidence" / "389-measurement-glosa-canary"
    contract = json.loads((evidence / "canary-contract.json").read_text(encoding="utf-8"))
    review = json.loads((evidence / "review.json").read_text(encoding="utf-8"))
    serp = json.loads((evidence / "serp-contract.json").read_text(encoding="utf-8"))
    registry = json.loads(
        (ROOT / "data" / "organic" / "public-family-registry.json").read_text(
            encoding="utf-8"
        )
    )
    copy_exceptions = json.loads(
        (ROOT / "data" / "site" / "copy-exceptions.json").read_text(
            encoding="utf-8"
        )
    )
    interface_policy = json.loads(
        (ROOT / "data" / "quality" / "interface-coverage-policy.json").read_text(
            encoding="utf-8"
        )
    )

    assert contract["issue"] == 389
    assert contract["public_url_mutations"] == [
        "/conteudos/atraso-na-medicao-obra-publica/"
    ]
    canary = contract["canary"]
    assert canary["path"] == "/conteudos/atraso-na-medicao-obra-publica/"
    assert canary["commercial_destination"] == "/medicoes-glosas-obras-publicas/"
    page = ROOT / canary["source"]
    html = page.read_text(encoding="utf-8")
    visible_html = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
    assert _sha256(page) == canary["after_sha256"]
    assert not re.search(r"\bowner\b", visible_html, re.I)
    assert len(re.findall(r"\bUNKNOWN\b", visible_html)) == 1

    assert (
        '<meta content="index,follow,max-image-preview:large,max-snippet:-1,'
        'max-video-preview:-1" name="robots"/>'
    ) in html
    assert (
        '<link href="https://confenge.com.br/conteudos/'
        'atraso-na-medicao-obra-publica/" rel="canonical"/>'
    ) in html
    assert f"<title>{contract['content_contract']['title']}</title>" in html
    assert f"<h1>{contract['content_contract']['h1']}</h1>" in html
    assert contract["content_contract"]["direct_answer_fragment"] in html
    assert contract["content_contract"]["demonstrative_example_label"] in html
    for label in contract["content_contract"]["required_epistemic_labels"]:
        assert label in html

    title_h1 = " ".join(re.findall(r"<(?:title|h1)>(.*?)</(?:title|h1)>", html, re.S)).lower()
    for prohibited in contract["content_contract"]["prohibited_target_intents_in_title_h1"]:
        assert prohibited.lower() not in title_h1

    article = re.search(r'<article class="article-main".*?</article>', html, re.S)
    assert article
    article_html = article.group(0)
    assert not re.search(r"\bowner\b", article_html, re.I)
    route = re.escape("/medicoes-glosas-obras-publicas/")
    assert len(re.findall(rf'href="{route}[^\"]*"', article_html)) == 1
    assert "wa.me" not in article_html
    assert "#formulario-contato" not in article_html

    cta = re.search(
        r'<a\b(?P<before>[^>]*)href="/medicoes-glosas-obras-publicas/"(?P<after>[^>]*)>',
        article_html,
    )
    assert cta
    cta_attrs = dict(
        re.findall(r'([\w-]+)="([^\"]*)"', f'{cta.group("before")} {cta.group("after")}')
    )
    assert {
        key: cta_attrs.get(key)
        for key in (
            "data-cta-id",
            "data-cta-position",
            "data-asset-id",
            "data-asset-family",
            "data-route-family",
            "data-journey",
        )
    } == {
        "data-cta-id": "canary-medicao-dossie",
        "data-cta-position": "inline",
        "data-asset-id": "atraso-na-medicao-obra-publica",
        "data-asset-family": "editorial",
        "data-route-family": "medicoes-glosas",
        "data-journey": "contrato",
    }

    terminal = contract["terminal_action_contract"]
    assert terminal["match"] == [canary["path"]]
    assert terminal["destination"] == "/medicoes-glosas-obras-publicas/"
    family = next(f for f in registry["families"] if f["id"] == terminal["family"])
    assert family["match"] == {"routes": terminal["match"]}
    assert family["terminal_action"] == "service_transition"
    assert family["owner_issue"] == 389
    assert family["debt"] == []
    assert terminal["no_prefix_fallback"] is True
    assert terminal["destination"] == canary["commercial_destination"]

    plain = contract["plain_language_contract"]
    scoped = [
        row
        for row in copy_exceptions["exceptions"]
        if row.get("rule") == "plain_language" and row.get("path") == plain["path"]
    ]
    assert {row["match"] for row in scoped} == set(plain["required_editorial_tokens"])
    assert len(scoped) == 4
    assert all("route-exact" in row["reason"] for row in scoped)
    assert plain["scope"] == "ROUTE_EXACT"
    assert plain["other_english_internal_labels_allowed"] is False
    classification_terms = [
        re.sub(r"<[^>]+>", "", value)
        for value in re.findall(r"<dt\b[^>]*>(.*?)</dt>", article_html, re.I | re.S)
    ]
    for row in scoped:
        token = re.compile(row["match"], re.I)
        assert len(token.findall(visible_html)) == 1, row["match"]
        assert sum(bool(token.search(term)) for term in classification_terms) == 1, row[
            "match"
        ]

    interface = contract["interface_quality_coverage"]
    representative = next(
        row
        for row in interface_policy["lighthouse"]["canonical_representatives"]
        if row["family_id"] == interface["lighthouse_family"]
    )
    assert representative["route"] == interface["lighthouse_representative"]
    assert representative["route"] == canary["path"]
    assert "seo_exempt_reason" not in representative
    assert interface["seo_exemption"] is False
    assert interface["axe_exemption"] is False

    for sibling in contract["frozen_siblings"]:
        assert _sha256(ROOT / sibling["path"]) == sibling["sha256"], sibling["path"]

    assert contract["indexability"]["robots_flip"] is False
    assert contract["indexability"]["issue_128_pillar_mutated"] is False
    sitemap = contract["sitemap"]
    assert sitemap["membership_before"] is sitemap["membership_after"] is True
    assert sitemap["membership_changed"] is False
    assert sitemap["new_sitemap_created"] is False
    sitemap_xml = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    sitemap_entry = re.search(
        rf"<loc>https://confenge.com.br{re.escape(canary['path'])}</loc>\s*"
        rf"<lastmod>{sitemap['lastmod_after']}</lastmod>",
        sitemap_xml,
    )
    assert sitemap_entry
    assert sitemap_xml.count(f"https://confenge.com.br{canary['path']}") == 1
    assert contract["second_wave"]["status"] == "BLOCKED"
    assert contract["selection_evidence"]["country"]["value"] == "UNKNOWN"
    assert contract["selection_evidence"]["device_for_candidate"]["value"] == "UNKNOWN"
    assert (
        contract["selection_evidence"]["latest_live_export"]["interpretation"]
        == "UNKNOWN_NOT_ZERO"
    )

    assert serp["before"]["robots"] == serp["after"]["robots"]
    assert serp["before"]["canonical"] == serp["after"]["canonical"]
    assert serp["after"]["title"] == contract["content_contract"]["title"]
    assert serp["after"]["h1"] == contract["content_contract"]["h1"]
    for shot in (serp["before"]["screenshot"], serp["after"]["screenshot"]):
        assert (evidence / shot).stat().st_size > 10_000

    assert review["candidate_approval"]["status"] == "HUMAN_REQUIRED"
    assert review["human_factual_review"]["status"] == "HUMAN_REQUIRED"
    assert review["human_editorial_review"]["status"] == "HUMAN_REQUIRED"
    assert review["merge_gate"] == "HUMAN_REVIEW_REQUIRED_BEFORE_MERGE"


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
    """The census comes from rendered prices; the contract binds direct models."""
    from scripts.site.inbound_gates import priced_action_registry, priced_offer_routes

    actions, offers = priced_action_registry()
    assert actions and offers, "the intent-action contract must price the ladder"

    priced = priced_offer_routes(ROOT)
    assert priced, "a site that publishes prices cannot have an empty priced census"
    model_routes = {route for route in priced if route.startswith("/casos/modelo-")}
    assert len(model_routes) == len(actions) == len(offers) == 8, sorted(priced)
    assert "/entregas/" in priced, sorted(priced)
    for route, signal in priced.items():
        html = (ROOT / route.strip("/") / "index.html").read_text(encoding="utf-8")
        assert signal == "displayed_price", route
        # Persisted capture, not only an attributed link out of the page.
        assert 'action="/.netlify/functions/lead"' in html, route
        assert 'name="consentimento"' in html, route
        assert re.search(r'<input[^>]+name="offer_id"[^>]+value=""', html), route


def test_priced_offer_gate_rejects_a_priced_page_without_persisted_capture():
    with tempfile.TemporaryDirectory(prefix="confenge-priced-gate-") as tmp:
        tmp_path = Path(tmp)
        _capture_gate_tree(tmp_path)
        assert gate_conversion(tmp_path).ok

        # 1) An existing priced page keeps its attributed commercial CTAs and
        #    loses only the form. `has_attributed_cta` must stop being enough.
        priced_pages = sorted(tmp_path.glob("casos/modelo-*/index.html"))
        assert priced_pages
        victim = priced_pages[-1]
        stripped = re.sub(
            r"<form\b[^>]*>.*?</form>", "", victim.read_text(encoding="utf-8"), flags=re.I | re.S
        )
        assert 'data-cta-id="' in stripped
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
        assert priced_offer_routes(tmp_path)[route] == "displayed_price"
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


def test_priced_offer_gate_refuses_unjoinable_form_attribution():
    """The persisted lead must repeat the CTA dimensions instead of guessing."""
    with tempfile.TemporaryDirectory(prefix="confenge-priced-attribution-") as tmp:
        tmp_path = Path(tmp)
        _capture_gate_tree(tmp_path)
        victim = sorted(tmp_path.glob("casos/modelo-*/index.html"))[0]
        html = victim.read_text(encoding="utf-8").replace(
            'name="cta_id" type="hidden" value="apresentacao-890-capture"',
            'name="cta_id" type="hidden" value="cta-nao-joinavel"',
            1,
        )
        assert "cta-nao-joinavel" in html
        victim.write_text(html, encoding="utf-8")
        report = gate_conversion(tmp_path)
        assert report.ok is False
        assert any(
            f.reason == "priced_offer_capture_attribution_mismatch"
            and "cta_id=cta-nao-joinavel" in f.excerpt
            for f in report.findings
        )


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


# --- Fail-closed public family contract (issue #300) ---

CAPTURE_PILLAR_FIXTURE = (
    "defesa-margem-contratos-publicos",
    "atrasos-prorrogacao-obras-publicas",
    "defesa-tecnica-contratos-publicos",
    "acompanhamento-contratos-obras",
    "bid-room-licitacoes-obras",
)


def _green_fixture_root(tmp_path: Path) -> None:
    """Minimal root that the conversion gate already accepts."""
    for slug in CAPTURE_PILLAR_FIXTURE:
        target = tmp_path / slug / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            (ROOT / slug / "index.html").read_text(encoding="utf-8"), encoding="utf-8"
        )


def _publish(tmp_path: Path, route: str, body: str) -> Path:
    target = tmp_path / route.strip("/") / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "<!doctype html><html lang=\"pt-BR\"><head><title>Nova superfície</title></head>"
        f"<body><main>{body}</main></body></html>",
        encoding="utf-8",
    )
    return target


ATTRIBUTED_CTA_ONLY = (
    '<h1>Nova família</h1><p>Conteúdo comercial.</p>'
    '<a data-cta-id="nova-familia-cta" href="/diagnostico-b2g-360/">Falar no WhatsApp</a>'
)


def test_new_public_family_without_declaration_fails_the_gate():
    """The regression that #300 exists to stop: a new commercial family lands and passes."""
    with tempfile.TemporaryDirectory(prefix="confenge-family-gate-") as tmp:
        tmp_path = Path(tmp)
        _green_fixture_root(tmp_path)
        assert gate_conversion(tmp_path).ok

        _publish(tmp_path, "/solucoes-inteligencia-obras/", ATTRIBUTED_CTA_ONLY)
        report = gate_conversion(tmp_path)
        errors = [f for f in report.findings if f.severity == "error"]
        assert report.ok is False
        assert any(f.reason == "public_family_not_declared" for f in errors), errors[:5]


def test_declared_family_still_has_to_prove_the_terminal_action():
    """Declaring a family is not enough: the action is checked against rendered HTML."""
    from scripts.site.inbound_gates import load_family_registry

    registry = load_family_registry()
    editorial = next(f for f in registry["families"] if f["id"] == "editorial-library")
    assert editorial["terminal_action"] == "capture_form_or_whatsapp"
    assert not editorial["debt"]

    with tempfile.TemporaryDirectory(prefix="confenge-family-gate-") as tmp:
        tmp_path = Path(tmp)
        _green_fixture_root(tmp_path)
        _publish(tmp_path, "/conteudos/pleito-sem-acao-terminal/", ATTRIBUTED_CTA_ONLY)
        report = gate_conversion(tmp_path)
        assert report.ok is False
        assert any(f.reason == "missing_terminal_action" for f in report.findings)


def test_linked_capture_route_is_terminal_only_with_the_full_contract():
    """A marked checkout step is valid; an arbitrary internal link stays invalid."""
    source_body = (
        '<h1>Novo radar</h1><p>Recorte aplicado à empresa.</p>'
        '<a data-cta-id="radar-order" data-terminal-action="capture-route" '
        'href="/comercial/radar-teste/">Configurar pedido</a>'
        '<span data-journey="edital"></span>'
    )
    capture = (
        '<!doctype html><html><head><meta name="robots" content="noindex,nofollow">'
        '</head><body><main><form method="post" action="/.netlify/functions/lead" '
        'data-cta-id="radar-order-form" data-asset-id="radar-order" '
        'data-route-family="radar" data-cta-position="order">'
        '<input name="nome"><input name="estagio"><input name="jornada">'
        '<input name="origem"><input name="asset_id"><input name="cta_id">'
        '<input name="route_family"><input type="checkbox" name="consentimento" required>'
        '</form></main></body></html>'
    )
    with tempfile.TemporaryDirectory(prefix="confenge-capture-route-") as tmp:
        tmp_path = Path(tmp)
        _green_fixture_root(tmp_path)
        _publish(tmp_path, "/radar/captura-dedicada/", source_body)
        target = tmp_path / "comercial" / "radar-teste" / "index.html"
        target.parent.mkdir(parents=True)
        target.write_text(capture, encoding="utf-8")

        assert gate_conversion(tmp_path).ok

        target.write_text(capture.replace("noindex,nofollow", "index,follow"), encoding="utf-8")
        report = gate_conversion(tmp_path)
        assert report.ok is False
        assert any(f.reason == "missing_terminal_action" for f in report.findings)

        target.write_text(capture.replace("/.netlify/functions/lead", "/contato"), encoding="utf-8")
        report = gate_conversion(tmp_path)
        assert report.ok is False
        assert any(f.reason == "missing_terminal_action" for f in report.findings)

        target.write_text(capture, encoding="utf-8")
        source = tmp_path / "radar" / "captura-dedicada" / "index.html"
        source.write_text(source.read_text(encoding="utf-8").replace(
            ' data-terminal-action="capture-route"', ""
        ), encoding="utf-8")
        report = gate_conversion(tmp_path)
        assert report.ok is False
        assert any(f.reason == "missing_terminal_action" for f in report.findings)


def test_service_transition_requires_one_canonical_fully_attributed_cta():
    from scripts.site.inbound_gates import _service_transition_destinations

    services = {"/diagnostico-b2g-360/", "/defesa-margem-contratos-publicos/"}
    valid = (
        '<a href="/diagnostico-b2g-360/" data-cta-id="hub-diagnostico" '
        'data-cta-position="hub_services" data-asset-id="servicos-obras-publicas" '
        'data-asset-family="hub" data-route-family="servicos-obras-publicas" '
        'data-journey="operacao">Começar</a>'
    )
    assert _service_transition_destinations(valid, services) == [
        "/diagnostico-b2g-360/"
    ]

    for attr in (
        "data-cta-id",
        "data-cta-position",
        "data-asset-id",
        "data-asset-family",
        "data-route-family",
        "data-journey",
    ):
        weakened = re.sub(rf' {attr}="[^"]+"', "", valid)
        assert _service_transition_destinations(weakened, services) == [], attr

    unknown = valid.replace("/diagnostico-b2g-360/", "/pagina-interna-qualquer/")
    assert _service_transition_destinations(unknown, services) == []
    assert len(_service_transition_destinations(valid + valid, services)) == 2


def test_three_hubs_prove_exactly_one_service_transition_from_shipped_html():
    from scripts.site.inbound_gates import (
        _bofu_service_routes,
        _main_html,
        _service_transition_destinations,
        load_family_registry,
    )

    expected = {
        "/servicos-obras-publicas/": "/diagnostico-b2g-360/",
        "/problemas-que-resolvemos/": "/defesa-margem-contratos-publicos/",
        "/ferramentas/": "/diagnostico-b2g-expansao/",
    }
    registry = load_family_registry()
    services = _bofu_service_routes()
    for route, destination in expected.items():
        family = next(
            family
            for family in registry["families"]
            if route in (family.get("match") or {}).get("routes", [])
        )
        assert family["terminal_action"] == "service_transition", route
        html = (ROOT / route.strip("/") / "index.html").read_text(encoding="utf-8")
        assert _service_transition_destinations(_main_html(html), services) == [destination]


def test_registered_debt_is_route_exact_and_never_absorbs_a_sibling():
    """A new page inside a family that carries debt does not inherit the exemption."""
    with tempfile.TemporaryDirectory(prefix="confenge-family-gate-") as tmp:
        tmp_path = Path(tmp)
        _green_fixture_root(tmp_path)
        # This child tool still carries exact debt under #290.
        registered = ROOT / "ferramentas" / "checklist-reequilibrio" / "index.html"
        target = tmp_path / "ferramentas" / "checklist-reequilibrio" / "index.html"
        target.parent.mkdir(parents=True)
        target.write_text(registered.read_text(encoding="utf-8"), encoding="utf-8")
        report = gate_conversion(tmp_path)
        assert report.ok, [f for f in report.findings if f.severity == "error"][:5]
        assert any(f.reason == "terminal_action_debt" for f in report.findings)

        # Same family, same rendered action, route that nobody registered.
        sibling = tmp_path / "ferramentas" / "nao-registrada" / "index.html"
        sibling.parent.mkdir(parents=True)
        sibling.write_text(registered.read_text(encoding="utf-8"), encoding="utf-8")
        report = gate_conversion(tmp_path)
        assert report.ok is False
        assert any(f.reason == "missing_terminal_action" for f in report.findings)


def test_priced_route_requires_persisted_capture_not_only_an_attributed_cta():
    with tempfile.TemporaryDirectory(prefix="confenge-family-gate-") as tmp:
        tmp_path = Path(tmp)
        _green_fixture_root(tmp_path)
        _publish(
            tmp_path,
            "/conteudos/modelo-pago-sem-captura/",
            '<h1>Relatório</h1><p>Investimento: R$ 1.900 por unidade.</p>'
            '<a href="https://wa.me/5511999999999" data-cta-id="x">Falar no WhatsApp</a>',
        )
        report = gate_conversion(tmp_path)
        reasons = {f.reason for f in report.findings if f.severity == "error"}
        assert report.ok is False
        assert "undeclared_priced_offer" in reasons, reasons
        assert "missing_terminal_action" in reasons, reasons


def test_bare_currency_amounts_are_data_not_a_priced_offer():
    """Contract values in an editorial page must not escalate the profile."""
    from scripts.site.inbound_gates import _displays_price

    assert not _displays_price("<p>O contrato somava R$ 248,0 mil em serviços medidos.</p>")
    assert _displays_price("<p>Investimento: R$ 3.750 por relatório.</p>")
    assert _displays_price("<p>Investimento: R$ 3750 por relatório.</p>")
    assert not _displays_price("<p>Investimento público de R$ 1,2 milhão.</p>")
    assert _displays_price('<script type="application/ld+json">{"price": "599.00"}</script>')


def test_registered_debt_expires_and_stops_being_an_exemption():
    report = gate_conversion(now="2027-01-01")
    expired = [f for f in report.findings if f.reason == "terminal_action_debt_expired"]
    assert report.ok is False
    assert expired, "debt must expire instead of becoming a permanent allowlist"


def test_every_exemption_carries_a_written_reason_and_an_owner():
    from scripts.site.inbound_gates import MIN_WRITTEN_REASON, load_family_registry

    registry = load_family_registry()
    assert registry["fail_closed"] is True
    for family in registry["families"]:
        if family["terminal_action"] == "none":
            assert family["profile"] == "trust_or_legal", family["id"]
            assert len(family["exemption_reason"]) >= MIN_WRITTEN_REASON, family["id"]
        for entry in family.get("debt") or []:
            assert isinstance(entry["owner_issue"], int), entry
            assert len(entry["reason"].strip()) >= MIN_WRITTEN_REASON, entry
            assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", entry["expires_at"]), entry
        for entry in family.get("priced_reference_routes") or []:
            assert len(entry["reason"].strip()) >= MIN_WRITTEN_REASON, entry


def test_report_lists_every_exempt_route_with_its_reason():
    report = gate_conversion()
    exemptions = report.stats["exemptions"]
    assert exemptions, "the report must name the exempt routes, never truncate them"
    for entry in exemptions:
        assert entry["kind"] in {"trust_or_legal", "debt", "priced_reference"}
        assert entry["reason"] and entry["reason"].strip()
        assert entry["route"].startswith("/")
    debt_routes = {e["route"] for e in exemptions if e["kind"] == "debt"}
    # #290/#305 pays only the five hub routes. Child tools and demonstratives
    # remain exact, visible debt until their own rendered action changes.
    for route in (
        "/casos/",
        "/entregas/",
        "/servicos-obras-publicas/",
        "/problemas-que-resolvemos/",
        "/ferramentas/",
    ):
        assert route not in debt_routes, route
    for route in (
        "/ferramentas/checklist-reequilibrio/",
        "/ferramentas/limite-acrescimos-supressoes/",
        "/ferramentas/matriz-atraso-obra/",
        "/casos/aditivo-art125-demonstrativo/",
    ):
        assert route in debt_routes, route
    for route in (
        "/casos/modelo-apresentacao-executiva-resultados/",
        "/casos/modelo-base-quantitativa-canonica/",
        "/casos/modelo-contratos-vincendos-relicitacao/",
        "/casos/modelo-mapa-compradores-publicos/",
        "/casos/modelo-mapeamento-concorrentes-publicos/",
        "/casos/modelo-painel-precos-obras-publicas/",
        "/casos/modelo-relatorio-executivo-consolidado/",
        "/casos/modelo-relatorio-inteligencia-licitacoes/",
    ):
        assert route not in debt_routes, route
    assert report.stats["family_registry"]["undeclared_routes"] == 0
    assert report.stats["family_registry"]["fail_closed"] is True


def test_registry_declaration_cannot_be_an_empty_line():
    from scripts.site.inbound_gates import (
        _bofu_service_routes,
        _validate_family_registry,
        load_family_registry,
    )

    registry = load_family_registry()
    service_routes = _bofu_service_routes()
    assert not _validate_family_registry(registry, service_routes, set(), verify_coverage=False)

    hollow = json.loads(json.dumps(registry))
    hollow["as_of"] = "nao-e-data"
    hollow["owner_issue"] = False
    hollow["families"].append(
        {
            "id": "familia-vazia",
            "visitor_job": "",
            "profile": "commercial_content",
            "terminal_action": "none",
            "match": {"prefix": "/familia-vazia/"},
            "gate_coverage": {"conversion": "none", "copy": "none", "accessibility": "none"},
            "declared_at": "nao-e-data",
            "debt": [{"route": "/outra/", "reason": "", "expires_at": "x"}],
        }
    )
    reasons = {
        f.reason
        for f in _validate_family_registry(
            hollow, service_routes, set(), verify_coverage=False
        )
    }
    for reason in (
        "registry_as_of_invalid",
        "registry_owner_issue_invalid",
        "family_visitor_job_missing",
        "family_owner_issue_missing",
        "family_declared_at_invalid",
        "family_conversion_coverage_understated",
        "family_no_action_outside_trust",
        "debt_reason_missing",
        "debt_owner_issue_missing",
        "debt_expires_at_invalid",
        "debt_route_outside_family",
    ):
        assert reason in reasons, (reason, reasons)


def test_registry_matching_is_unambiguous_and_cannot_absorb_the_site():
    """Fail-closed means ownership cannot depend on JSON order or a root wildcard."""
    from scripts.site.inbound_gates import (
        _bofu_service_routes,
        _validate_family_registry,
        load_family_registry,
    )

    registry = load_family_registry()
    service_routes = _bofu_service_routes()

    invalid_source = json.loads(json.dumps(registry))
    service = next(f for f in invalid_source["families"] if f["id"] == "service-pillars")
    service["match"]["source"] = "qualquer-arquivo.json"

    root_prefix = json.loads(json.dumps(registry))
    home = next(f for f in root_prefix["families"] if f["id"] == "home")
    home["match"] = {"prefix": "/"}

    overlap = json.loads(json.dumps(registry))
    duplicate = json.loads(json.dumps(next(f for f in overlap["families"] if f["id"] == "home")))
    duplicate["id"] = "home-duplicated"
    overlap["families"].append(duplicate)

    blank_legal_reason = json.loads(json.dumps(registry))
    legal = next(f for f in blank_legal_reason["families"] if f["id"] == "legal-and-trust")
    legal["exemption_reason"] = " " * 30
    legal["owner_issue"] = True

    invented_service_profile = json.loads(json.dumps(registry))
    home = next(f for f in invented_service_profile["families"] if f["id"] == "home")
    home["profile"] = "service_pillar"
    home["terminal_action"] = "capture_form"

    weakened_service_source = json.loads(json.dumps(registry))
    service = next(
        f for f in weakened_service_source["families"] if f["id"] == "service-pillars"
    )
    service["profile"] = "commercial_content"
    service["terminal_action"] = "capture_form_or_whatsapp"

    unbounded_service_transition = json.loads(json.dumps(registry))
    editorial = next(
        f for f in unbounded_service_transition["families"] if f["id"] == "editorial-library"
    )
    editorial["terminal_action"] = "service_transition"

    unbounded_debt = json.loads(json.dumps(registry))
    debt_family = next(f for f in unbounded_debt["families"] if f.get("debt"))
    debt_family["debt"][0]["expires_at"] = "2099-12-31"

    cases = (
        (invalid_source, "family_match_source_invalid"),
        (root_prefix, "family_match_prefix_invalid"),
        (overlap, "family_match_overlap"),
        (blank_legal_reason, "family_exemption_reason_missing"),
        (blank_legal_reason, "family_owner_issue_missing"),
        (invented_service_profile, "family_service_profile_match_invalid"),
        (weakened_service_source, "family_service_source_profile_invalid"),
        (unbounded_service_transition, "family_service_transition_match_invalid"),
        (unbounded_debt, "debt_expiry_window_invalid"),
    )
    for payload, expected in cases:
        reasons = {
            finding.reason
            for finding in _validate_family_registry(
                payload, service_routes, set(), verify_coverage=False
            )
        }
        assert expected in reasons, (expected, reasons)


def test_declared_gate_coverage_is_verified_against_the_real_censuses():
    from scripts.site.inbound_gates import (
        _bofu_service_routes,
        _validate_family_registry,
        load_family_registry,
    )
    from scripts.site.inbound_gates import _conversion_files, is_indexable_html

    routes = set()
    for page in _conversion_files(ROOT):
        html = page.read_text(encoding="utf-8", errors="replace")
        if not is_indexable_html(html):
            continue
        rel = page.relative_to(ROOT).as_posix()
        routes.add("/" if rel == "index.html" else "/" + rel.removesuffix("index.html"))

    registry = load_family_registry()
    service_routes = _bofu_service_routes()
    assert not _validate_family_registry(registry, service_routes, routes)

    overclaimed = json.loads(json.dumps(registry))
    family = next(f for f in overclaimed["families"] if f["id"] == "editorial-library")
    family["gate_coverage"]["accessibility"] = "full"
    reasons = {
        f.reason for f in _validate_family_registry(overclaimed, service_routes, routes)
    }
    assert "family_gate_coverage_mismatch" in reasons, reasons


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
