"""Fail-closed entity-authority gates.

Drives scripts.site.authority (shipped checkers) against fixtures and real
pages. A passing test must fail when the shipped function would accept a
forbidden state.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.authority import (  # noqa: E402
    FOOTER_AUTHORITY_NAV,
    SURFACE_TYPES,
    check_case_permission_class,
    check_credentials_against_proof,
    check_published_cases_permission,
    check_required_slots,
    check_research_method_as_of,
    check_schema_mirrors_visible,
    check_signals_baseline,
    chrome_pages,
    classify_surface,
    extract_jsonld_blocks,
    extract_visible_authority,
    footer_authority_nav,
    has_material_legal_claim,
    load_governance,
    load_matrix,
    load_signals_baseline,
    policy_pages,
    representative_pages,
)
from scripts.site.brand import approved_cases, load_cases, load_proof  # noqa: E402


def _fixture(body: str, jsonld: dict | None = None, extra_head: str = "") -> str:
    ld = ""
    if jsonld is not None:
        ld = (
            '<script type="application/ld+json">'
            + json.dumps(jsonld, ensure_ascii=False)
            + "</script>"
        )
    return (
        "<!DOCTYPE html><html lang='pt-BR'><head><title>t</title>"
        + extra_head
        + ld
        + "</head><body>"
        + body
        + "</body></html>"
    )


def test_matrix_names_five_surfaces_and_audit_chain():
    matrix = load_matrix()
    assert set(matrix["surfaces"]) == set(SURFACE_TYPES)
    labels = {s["label"] for s in matrix["surfaces"].values()}
    assert "página de serviço" in labels
    assert "conteúdo técnico" in labels
    assert "ferramenta" in labels
    assert "pesquisa/dataset" in labels
    assert "caso/proof" in labels
    assert "análise técnica de contrato público" in labels
    chain = matrix["audit_chain"]
    assert chain == [
        "quem_afirma",
        "competencia",
        "metodo_dado",
        "revisao",
        "atualizacao",
        "limitacoes",
        "como_corrigir",
    ]
    trigger = matrix["reviewer_trigger"]
    assert "material_legal_claim" in trigger["required_when"]
    assert trigger["solo_responsible_allowed"] is True
    servico = matrix["surfaces"]["servico"]
    assert servico["author"] == "required"
    assert servico["permission_class"] == "not_applicable"
    pesquisa = matrix["surfaces"]["pesquisa_dataset"]
    assert pesquisa["methodology"] == "required"
    assert pesquisa["as_of"] == "required"
    caso = matrix["surfaces"]["caso_proof"]
    assert caso["permission_class"] == "required"
    tecnico = matrix["surfaces"]["conteudo_tecnico"]
    assert tecnico["reviewer"] == "required_if_legal_claim"
    analise = matrix["surfaces"]["analise_tecnica_contrato"]
    assert analise["permission_class"] == "not_applicable"
    assert analise["methodology"] == "required"
    assert analise["as_of"] == "required"
    assert analise["mutually_exclusive_with"] == "caso_proof"


def test_fail_closed_author_absent():
    html = _fixture("<h1>Guia de aditivo</h1><p>Lei 14.133 sem autor.</p>")
    errors = check_required_slots(html, "conteudo_tecnico")
    assert "author_absent" in errors


def test_fail_closed_reviewer_absent_when_legal_claim():
    html = _fixture(
        "<p>Autor: <a rel='author' href='/especialista/tiago-jun-sasaki/'>Engº Tiago Sasaki</a></p>"
        "<time datetime='2026-08-15'>15 de agosto de 2026</time>"
        "<p>O art. 125 da Lei nº 14.133/2021 limita o aditivo.</p>"
        "<p>Limitação: não é parecer jurídico.</p>"
        "<a href='/correcoes/'>Correções</a>"
    )
    errors = check_required_slots(html, "conteudo_tecnico")
    assert "reviewer_absent" in errors
    # Solo disclosure satisfies the reviewer slot without inventing a second person.
    html_ok = html.replace(
        "Limitação: não é parecer jurídico.",
        "Responsável técnico: Engº Tiago Sasaki. Sem revisão independente: não há segundo revisor nomeado.",
    )
    assert "reviewer_absent" not in check_required_slots(html_ok, "conteudo_tecnico")


def test_fail_closed_reviewer_absent_when_lei_14133_without_numero_or_artigo():
    """Site copy often says 'Lei 14.133' with neither nº nor art. Still a legal claim."""
    html = _fixture(
        "<p>Autor: <a rel='author' href='/especialista/tiago-jun-sasaki/'>Engº Tiago Sasaki</a></p>"
        "<time datetime='2026-08-15'>15 de agosto de 2026</time>"
        "<h1>Limite de aditivo na Lei 14.133</h1>"
        "<p>O teto de 25% e 50% na Lei 14.133 limita o saldo.</p>"
        "<p>Limitação: não é parecer jurídico.</p>"
        "<a href='/correcoes/'>Correções</a>"
    )
    assert "art." not in html.lower()
    assert "nº" not in html and "n°" not in html
    assert has_material_legal_claim(html) is True
    errors = check_required_slots(html, "conteudo_tecnico")
    assert "reviewer_absent" in errors


def test_fail_closed_schema_diverges_from_visible():
    html = _fixture(
        "<p>Autor visível: Engº Tiago Sasaki</p><time datetime='2026-08-01'>1 de agosto de 2026</time>",
        {
            "@context": "https://schema.org",
            "@type": "Article",
            "author": {"@type": "Person", "name": "Autor Inventado"},
            "dateModified": "2026-08-01",
        },
    )
    errors = check_schema_mirrors_visible(html)
    assert any(e.startswith("schema_author_not_visible") for e in errors)


def test_fail_closed_invented_review_schema():
    html = _fixture(
        "<h1>Serviço</h1><p>CONFENGE</p>",
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "CONFENGE",
            "aggregateRating": {"@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": 12},
        },
    )
    errors = check_schema_mirrors_visible(html)
    assert errors, "invented AggregateRating must fail"


def test_fail_closed_research_missing_method_or_as_of():
    html = _fixture("<h1>Recorte</h1><p>Números sem método nem data.</p>")
    errors = check_research_method_as_of(html)
    assert "method_absent" in errors
    assert "as_of_absent" in errors
    ok = _fixture(
        "<h1>Recorte</h1><p>Método: agregação de registros públicos.</p>"
        "<p>as_of <time datetime='2026-08-15'>2026-08-15</time></p>"
    )
    assert check_research_method_as_of(ok) == []


def test_fail_closed_credential_not_backed():
    html = _fixture(
        '<ul class="profile-list"><li>CREA nº 999999-D</li>'
        "<li>Engenharia Civil pela USP (EESC-USP)</li></ul>"
    )
    errors = check_credentials_against_proof(html)
    assert any("CREA" in e or "credential" in e for e in errors)
    clean = _fixture(
        '<ul class="profile-list"><li>Engenharia Civil pela USP (EESC-USP)</li>'
        "<li>Atendimento nacional</li></ul>"
    )
    assert check_credentials_against_proof(clean) == []


def test_fail_closed_case_missing_permission_class():
    html = _fixture("<h1>Case de cliente</h1><p>Recuperamos margem sem dizer de quem.</p>")
    assert "permission_class_absent" in check_case_permission_class(html)
    demo = _fixture(
        '<p class="case-badge" data-permission-class="demonstrativo">'
        "DEMONSTRATIVO · NÃO É CASE DE CLIENTE</p>"
    )
    assert check_case_permission_class(demo) == []


def test_real_pages_pass_surface_gates_and_schema_mirror():
    matrix = load_matrix()
    pages = representative_pages()
    assert set(pages) == set(SURFACE_TYPES)
    for kind, path in pages.items():
        assert path.exists(), path
        html = path.read_text(encoding="utf-8")
        assert classify_surface("/" + str(path.relative_to(ROOT)).replace("index.html", ""), html) == kind
        errors = check_required_slots(html, kind, matrix=matrix)
        assert not errors, f"{path}: {errors}"
        schema_errors = check_schema_mirrors_visible(html)
        assert not schema_errors, f"{path} schema: {schema_errors}"
        assert "Review" not in html or "não é" in html.lower()
        assert "AggregateRating" not in html
        assert "ratingValue" not in html


def test_lei_14133_page_schema_mirrors_visible_published_date():
    path = ROOT / "lei-14133-obras" / "limite-25-50-aditivo-obra" / "index.html"
    html = path.read_text(encoding="utf-8")
    errors = check_schema_mirrors_visible(html)
    assert not errors, errors
    visible = extract_visible_authority(html)
    assert "2026-08-02" in visible["dates"]
    assert "2026-08-04" in visible["dates"]
    assert "publicado em" in visible["norm"]


def test_conteudos_lei_14133_guide_triggers_reviewer_slot():
    path = ROOT / "conteudos" / "limite-aditivo-25-50-obra-publica" / "index.html"
    html = path.read_text(encoding="utf-8")
    assert has_material_legal_claim(html) is True
    errors = check_required_slots(html, "conteudo_tecnico")
    assert "reviewer_absent" not in errors
    assert not errors, errors


def test_specialist_credentials_are_subset_of_public_verified_proof():
    path = ROOT / "especialista" / "tiago-jun-sasaki" / "index.html"
    html = path.read_text(encoding="utf-8")
    errors = check_credentials_against_proof(html)
    assert not errors, errors
    # Do not invent stronger verification than proof.json already allows.
    proof = load_proof()
    assert "self-attested" in proof.get("verification_limitation", "").lower() or (
        "self_attested" in json.dumps(proof)
    )
    assert "CREA" not in html
    assert "5 estrelas" not in html.lower()
    assert "selo iso" not in html.lower()
    assert "certificação internacional" not in html.lower()


def test_demonstrative_cases_and_zero_approved_clients():
    cases = load_cases()
    assert approved_cases(cases) == []
    assert check_published_cases_permission(cases) == []
    for surf in cases["published_surfaces"]:
        assert surf["permission_class"] == "demonstrativo"
        assert surf["client_authorized"] is False
        rel = surf["path"].strip("/") + "/index.html"
        page = ROOT / rel
        html = page.read_text(encoding="utf-8")
        assert check_case_permission_class(html) == []
        assert "demonstrativo" in html.lower()


def test_public_policies_state_owner_sla_and_are_linked_from_chrome():
    gov = load_governance()
    pages = policy_pages()
    assert pages["editorial"].exists()
    assert pages["corrections"].exists()
    assert pages["ai_use"].exists()
    assert pages["conflicts"].exists()
    editorial = pages["editorial"].read_text(encoding="utf-8")
    corrections = pages["corrections"].read_text(encoding="utf-8")
    ai = pages["ai_use"].read_text(encoding="utf-8")
    conflicts = pages["conflicts"].read_text(encoding="utf-8")
    assert "Engº Tiago Sasaki" in editorial
    assert gov["correction"]["owner_email"] in corrections
    assert "2 dias úteis" in corrections
    assert "10 dias úteis" in corrections
    assert "inteligência artificial" in ai.lower() or "uso de ia" in ai.lower()
    assert "conflito" in conflicts.lower()
    nav = footer_authority_nav()
    assert nav == FOOTER_AUTHORITY_NAV
    for href in gov["footer_authority_paths"]:
        assert href in nav
    from scripts.pseo import html_shell

    assert "/politica-editorial/" in html_shell.FOOTER
    assert "/correcoes/" in html_shell.FOOTER
    assert "/uso-de-ia/" in html_shell.FOOTER
    assert "/conflitos/" in html_shell.FOOTER
    for path in chrome_pages():
        html = path.read_text(encoding="utf-8")
        assert "/politica-editorial/" in html, path
        assert "/correcoes/" in html, path


def test_signals_baseline_unknown_without_invented_numbers():
    data = load_signals_baseline()
    assert check_signals_baseline(data) == []
    for key in (
        "branded_search",
        "direct_returning",
        "qualified_referring_domains",
        "citation_reuse",
    ):
        rec = data["signals"][key]
        assert rec["value"] == "UNKNOWN"
        assert rec["source"] in (None, "", "UNKNOWN")
    # Invented numbers must fail the shipped checker.
    fake = json.loads(json.dumps(data))
    fake["signals"]["branded_search"] = {"value": 1280, "source": None}
    assert "signal_value_without_source:branded_search" in check_signals_baseline(fake)


def test_classify_surface_from_real_paths():
    assert classify_surface("/diretoria-b2g/") == "servico"
    assert classify_surface("conteudos/limite-aditivo-25-50-obra-publica/index.html") == "conteudo_tecnico"
    assert classify_surface("/ferramentas/limite-acrescimos-supressoes/") == "ferramenta"
    assert classify_surface("/radar/nacional-obras-publicas/") == "pesquisa_dataset"
    assert classify_surface("/casos/aditivo-art125-demonstrativo/") == "caso_proof"
    assert classify_surface("/analises-contratos-publicos/bdi-composicao-vs-referencia-sc/") == "analise_tecnica_contrato"
    assert classify_surface("/analises-contratos-publicos/") != "caso_proof"
    assert classify_surface("/politica-editorial/") is None


def test_jsonld_extractor_reads_shipped_markup():
    html = (ROOT / "diretoria-b2g" / "index.html").read_text(encoding="utf-8")
    blocks = extract_jsonld_blocks(html)
    assert blocks, "shipped offer page must keep JSON-LD"
    blob = json.dumps(blocks, ensure_ascii=False)
    assert "CONFENGE" in blob
    assert "Review" not in blob
    assert "AggregateRating" not in blob


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
