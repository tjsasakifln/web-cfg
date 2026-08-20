#!/usr/bin/env python3
"""Tests for inbound-first gates — drive shipped public HTML and gate functions."""

from __future__ import annotations

import json
import re
import sys
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
from scripts.site.test_bid_readiness_canary import (  # noqa: E402,F401
    test_bid_readiness_canary_prepare_only,
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
