#!/usr/bin/env python3
"""Hub link matrix: REQUIRED/OPTIONAL/PRESERVE on shipped HTML, plus overlay mutations.

Drives scripts.site.hub_link_composition against the four hub files. A passing
run means the shipped markup matches the composed candidate, not a reimplemented
href list.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.hub_link_composition import (  # noqa: E402
    KIND_OPTIONAL,
    KIND_REQUIRED,
    Overlay,
    audit_hubs,
    compose_links,
    compose_optional_markup,
    extract_hrefs,
    hub_html,
    journey_table,
    load_matrix,
    optional_card_html,
    treats_as_required,
)


def _fail(message: str) -> None:
    raise AssertionError(message)


def test_shipped_hubs_match_composed_candidate() -> None:
    failures = audit_hubs(ROOT)
    if failures:
        _fail("shipped hubs:\n" + "\n".join(failures))


def test_required_hrefs_are_real_anchors() -> None:
    matrix = load_matrix()
    html_by_hub = {
        hub["path"]: hub_html(hub["path"], ROOT) for hub in matrix["hubs"]
    }
    for spec in matrix["links"]:
        if spec.get("kind") != KIND_REQUIRED:
            continue
        html = html_by_hub[spec["hub"]]
        href = spec["href"]
        assert any(href.rstrip("/") in found or found == href for found in extract_hrefs(html)), (
            f"REQUIRED {spec['id']} href {href} not in {spec['hub']}"
        )
        assert f'data-hub-link="{spec["marker"]}"' in html, (
            f"REQUIRED {spec['id']} missing marker {spec['marker']}"
        )


def test_preserve_anchors_stay_on_servicos() -> None:
    html = hub_html("/servicos/", ROOT)
    for spec in load_matrix()["anchors"]:
        fragment = spec["href"].split("#", 1)[1]
        assert re.search(rf'\bid=["\']{re.escape(fragment)}["\']', html), spec["id"]


def test_jsonld_and_meta_are_mixed_not_b2g_only() -> None:
    conteudos = hub_html("/conteudos/", ROOT)
    servicos = hub_html("/servicos/", ROOT)
    ferramentas = hub_html("/ferramentas/", ROOT)
    for html, name in ((conteudos, "conteudos"), (servicos, "servicos"), (ferramentas, "ferramentas")):
        lower = html.lower()
        assert "obra privada" in lower or "obras privadas" in lower or "privad" in lower, name
        exclusive = (
            "somente obras públicas" in lower
            or "exclusivamente obras públicas" in lower
            or "catálogo antigo b2g" in lower
        )
        assert not exclusive, name
    assert "projeto" in conteudos.lower()
    assert "orçamento" in conteudos.lower()
    # Directory of public guides remains populated.
    assert 'data-content-item' in conteudos
    assert len(re.findall(r"data-content-item", conteudos)) >= 8


def test_conteudos_has_no_empty_need_section() -> None:
    html = hub_html("/conteudos/", ROOT)
    section = re.search(
        r'<section[^>]*id="por-necessidade"[\s\S]*?</section>', html, flags=re.I
    )
    assert section, "need navigation missing"
    block = section.group(0)
    assert re.search(r"<a\s+[^>]*href=", block)
    assert not re.search(r"\b0\s+itens\b", block, flags=re.I)
    assert "em breve" not in block.lower()


def test_casos_separates_demonstrative_and_omits_missing_real_work() -> None:
    html = hub_html("/casos/", ROOT)
    assert 'data-proof-kind="demonstrative"' in html, "demonstrative section marker"
    assert "demonstrativo" in html.lower(), "demonstrative label"
    composed = compose_links(ROOT)
    privada = next(link for link in composed if link.spec["id"] == "casos-prova-privada")
    assert privada.present, "current private demonstrative must be present"
    assert privada.included
    assert "/casos/demonstrativo-projeto-privado/" in privada.href
    assert "/casos/demonstrativo-projeto-privado/" in html
    assert "/casos/prova-tecnica-obra-privada/" not in html
    assert 'data-hub-link="casos-prova-privada"' in html
    assert not re.search(r"<section[^>]*data-proof-kind=[\"']authorized-real[\"']", html, flags=re.I), (
        "omit real-work block when artifact is absent"
    )
    assert "não representam contrato, contratante, contratada ou resultado de cliente" in html.lower() or (
        "números hipotéticos" in html.lower() and "demonstrativo" in html.lower()
    ), "must not present demonstratives as client results"


def test_old_private_proof_url_fails_audit() -> None:
    original = hub_html("/casos/", ROOT)
    broken = original.replace(
        "/casos/demonstrativo-projeto-privado/",
        "/casos/prova-tecnica-obra-privada/",
    )
    assert broken != original
    failures = audit_hubs(ROOT, html_overrides={"/casos/": broken})
    joined = "\n".join(failures)
    assert failures, "expected audit to fail after reintroducing the retired private-proof URL"
    assert (
        "casos-prova-privada" in joined
        or "/casos/demonstrativo-projeto-privado/" in joined
        or "missing" in joined.lower()
        or "/casos/prova-tecnica-obra-privada/" in joined
    )


def test_ferramentas_prontidao_is_optional_not_mandatory() -> None:
    html = hub_html("/ferramentas/", ROOT)
    assert 'data-hub-link="ferramentas-prontidao"' in html
    assert "/ferramentas/prontidao-tecnica-obra-privada/" in html
    lower = html.lower()
    assert "opcional" in lower
    assert "não é etapa obrigatória" in lower or "nao e etapa obrigatoria" in lower
    assert "obrigat" in lower


def test_servicos_explains_deliveries_and_welcomes_other_needs() -> None:
    html = hub_html("/servicos/", ROOT)
    lower = html.lower()
    for term in ("elabor", "revis", "compatibiliz", "orçamento", "inspecion"):
        assert term in lower, term
    assert "outras necessidades" in lower or "necessidade não está listada" in lower
    assert "id=\"servico-projeto\"" in html
    assert "id=\"servico-revisao\"" in html
    assert "id=\"servico-compatibilizacao\"" in html
    assert "id=\"servico-orcamento\"" in html


def test_required_link_removed_from_html_fails() -> None:
    original = hub_html("/servicos/", ROOT)
    broken = original.replace('href="/quantitativos-orcamento-obras/"', 'href="/destino-ausente-inb09/"')
    failures = audit_hubs(ROOT, html_overrides={"/servicos/": broken})
    joined = "\n".join(failures)
    assert failures, "expected REQUIRED_LINK audit to fail after href removal"
    assert "servicos-orcamento" in joined or "/quantitativos-orcamento-obras/" in joined or "missing" in joined.lower()


def test_core_optional_cannot_silently_drop_present_route() -> None:
    matrix = load_matrix()
    for spec in matrix["links"]:
        if spec.get("release_unit") == "CORE":
            assert treats_as_required(spec), spec["id"]
    core_optional = {
        "id": "synthetic-core-optional",
        "kind": KIND_OPTIONAL,
        "hub": "/servicos/",
        "href": "/revisao-tecnica-projetos-engenharia/",
        "marker": "synthetic-core-optional",
        "release_unit": "CORE",
        "label": "Revisão",
    }
    assert treats_as_required(core_optional)
    overlay = Overlay().without_file("revisao-tecnica-projetos-engenharia/index.html")
    mutated = dict(matrix)
    mutated["links"] = [core_optional]
    failures = audit_hubs(ROOT, matrix=mutated, overlay=overlay)
    joined = "\n".join(failures)
    assert failures, "CORE OPTIONAL must fail audit when the published route is missing"
    assert "synthetic-core-optional" in joined or "destination missing" in joined


def test_optional_missing_route_omits_card_without_home_fallback() -> None:
    matrix = load_matrix()
    composed = compose_links(ROOT, matrix)
    optional = [link for link in composed if link.spec.get("kind") == KIND_OPTIONAL]
    assert optional, "matrix must declare at least one OPTIONAL_LINK"
    present = [link for link in optional if link.present]
    missing = [link for link in optional if not link.present]
    for link in missing:
        card = optional_card_html(link)
        assert card == ""
        assert 'href="/"' not in card
    # Omission: overlay-delete a present optional and the card must vanish, never home.
    target = present[0] if present else optional[0]
    deleted = Overlay().without_file(target.file_rel or "revisao-tecnica-projetos-engenharia/index.html")
    deleted_links = compose_links(ROOT, matrix, deleted)
    gone = next(link for link in deleted_links if link.spec["id"] == target.spec["id"])
    assert gone.present is False
    card = optional_card_html(gone)
    assert card == ""
    assert 'href="/"' not in card
    # Presence uses the resolved href, never home or "em breve".
    if present:
        live = present[0]
        card = optional_card_html(live)
        assert card
        assert live.href in card
        assert 'href="/"' not in card
        assert "em breve" not in card.lower()


def test_optional_card_in_html_without_route_fails_audit() -> None:
    original = hub_html("/servicos/", ROOT)
    injected = original.replace(
        "</main>",
        (
            '<article class="hub-optional-card" data-hub-link="servicos-revisao-landing" '
            'data-requires-route="/revisao-projetos/">'
            '<a href="/">Revisão em breve</a></article></main>'
        ),
        1,
    )
    failures = audit_hubs(ROOT, html_overrides={"/servicos/": injected})
    joined = "\n".join(failures)
    assert failures
    assert "servicos-revisao-landing" in joined or "home" in joined.lower() or "em breve" in joined.lower()


def test_journeys_within_two_hops() -> None:
    rows = journey_table(ROOT)
    bad = [row for row in rows if not row["ok"]]
    if bad:
        _fail("reachability:\n" + json.dumps(bad, ensure_ascii=False, indent=2))


def test_no_js_only_discovery() -> None:
    for hub in load_matrix()["hubs"]:
        html = hub_html(hub["path"], ROOT)
        for spec in load_matrix()["links"]:
            if spec.get("hub") != hub["path"] or spec.get("kind") != KIND_REQUIRED:
                continue
            # Required destinations must be real <a href>, not JS click handlers.
            pattern = rf'<a\b[^>]*href=["\']{re.escape(spec["href"])}'
            alt = rf'<a\b[^>]*href=["\']{re.escape(spec["href"].rstrip("/"))}'
            assert re.search(pattern, html) or re.search(alt, html), spec["id"]


def main() -> int:
    tests = [
        test_shipped_hubs_match_composed_candidate,
        test_required_hrefs_are_real_anchors,
        test_preserve_anchors_stay_on_servicos,
        test_jsonld_and_meta_are_mixed_not_b2g_only,
        test_conteudos_has_no_empty_need_section,
        test_casos_separates_demonstrative_and_omits_missing_real_work,
        test_old_private_proof_url_fails_audit,
        test_ferramentas_prontidao_is_optional_not_mandatory,
        test_servicos_explains_deliveries_and_welcomes_other_needs,
        test_core_optional_cannot_silently_drop_present_route,
        test_required_link_removed_from_html_fails,
        test_optional_missing_route_omits_card_without_home_fallback,
        test_optional_card_in_html_without_route_fails_audit,
        test_journeys_within_two_hops,
        test_no_js_only_discovery,
    ]
    failed = 0
    for fn in tests:
        try:
            fn()
            print("PASS", fn.__name__)
        except Exception as exc:  # noqa: BLE001 — report each test, then fail
            failed += 1
            print("FAIL", fn.__name__, exc)
    if failed:
        print(f"{failed} failed")
        return 1
    print(f"{len(tests)} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
