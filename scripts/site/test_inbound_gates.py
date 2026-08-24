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


def test_registered_debt_is_route_exact_and_never_absorbs_a_sibling():
    """A new page inside a family that carries debt does not inherit the exemption."""
    with tempfile.TemporaryDirectory(prefix="confenge-family-gate-") as tmp:
        tmp_path = Path(tmp)
        _green_fixture_root(tmp_path)
        # /casos/modelo-painel-precos-obras-publicas/ is registered debt (#289).
        registered = ROOT / "casos" / "modelo-painel-precos-obras-publicas" / "index.html"
        target = tmp_path / "casos" / "modelo-painel-precos-obras-publicas" / "index.html"
        target.parent.mkdir(parents=True)
        target.write_text(registered.read_text(encoding="utf-8"), encoding="utf-8")
        report = gate_conversion(tmp_path)
        assert report.ok, [f for f in report.findings if f.severity == "error"][:5]
        assert any(f.reason == "terminal_action_debt" for f in report.findings)

        # Same family, same price, route that nobody registered.
        sibling = tmp_path / "casos" / "modelo-nao-registrado" / "index.html"
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
    # The four commercial surfaces published on 2026-08-23 are now covered.
    for route in (
        "/entregas/",
        "/servicos-obras-publicas/",
        "/problemas-que-resolvemos/",
        "/casos/modelo-painel-precos-obras-publicas/",
    ):
        assert route in debt_routes, route
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
