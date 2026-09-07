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

from scripts.site.authority import (
    extract_credential_claim_texts,  # noqa: E402
    FOOTER_AUTHORITY_NAV,
    REQUIRED_SLOT_KEYS,
    SURFACE_TYPES,
    archived_policy_pages,
    audit_public_families,
    check_analysis_not_case,
    check_case_permission_class,
    check_consent_slot,
    check_credentials_against_proof,
    check_matrix_slot_coverage,
    CORRECTION_CHANNEL_HREF,
    _norm,
    _strip_tags,
    check_policy_links,
    check_policy_version_consistency,
    check_policy_visible_disclosure,
    check_published_cases_permission,
    check_required_slots,
    check_research_method_as_of,
    check_schema_mirrors_visible,
    check_signals_baseline,
    chrome_pages,
    classify_surface,
    combined_policy_html,
    content_sha256_for_version,
    current_policy_version,
    data_analysis_policy_pages,
    extract_jsonld_blocks,
    extract_visible_authority,
    extract_visible_crumbs,
    flatten_jsonld_nodes,
    footer_authority_nav,
    _types_of,
    has_material_legal_claim,
    load_editorial_policy,
    load_governance,
    load_matrix,
    load_signals_baseline,
    policy_pages,
    representative_pages,
)
from scripts.site.brand import approved_cases, load_cases, load_proof  # noqa: E402
from scripts.site.credential_registry import is_projectable, load_registry  # noqa: E402


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
    assert analise["ai_disclosure"] == "required"
    assert analise["consent"] == "not_applicable"
    assert analise["mutually_exclusive_with"] == "caso_proof"
    assert caso["consent"] == "required"
    assert caso["mutually_exclusive_with"] == "analise_tecnica_contrato"
    assert caso["ai_disclosure"] == "recommended"
    assert check_matrix_slot_coverage(matrix) == []
    for spec in matrix["surfaces"].values():
        for key in REQUIRED_SLOT_KEYS:
            assert key in spec, key


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


def test_specialist_page_shows_sameas_and_as_of():
    """#74 VALIDATE: specialist HTML keeps a verifiable public identity signal."""
    path = ROOT / "especialista" / "tiago-jun-sasaki" / "index.html"
    html = path.read_text(encoding="utf-8")
    assert path.is_file()
    assert "sameAs" in html
    assert "https://github.com/tjsasakifln" in html
    assert 'data-credential-as-of="2026-09-04"' in html
    assert 'datetime="2026-09-05"' in html
    assert "EESC-USP" in html or "Universidade de São Paulo" in html
    crea_claims = [
        claim
        for claim in load_registry()["claims"]
        if "crea" in str(claim.get("id", "")).lower()
    ]
    if any(is_projectable(claim) for claim in crea_claims):
        assert "CREA" in html
        assert check_credentials_against_proof(html) == []
    else:
        assert "CREA" not in html
    assert "smartlic" not in html.lower()
    errors = check_schema_mirrors_visible(html)
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
    crea_claims = [
        claim
        for claim in load_registry()["claims"]
        if "crea" in str(claim.get("id", "")).lower()
    ]
    if any(is_projectable(claim) for claim in crea_claims):
        assert "CREA" in html
    else:
        assert "CREA" not in html
    assert "5 estrelas" not in html.lower()
    assert "selo iso" not in html.lower()
    assert "certificação internacional" not in html.lower()


def test_home_credentials_are_subset_of_public_verified_proof():
    """A home tambem afirma credencial, e ate agora ninguem conferia.

    extract_credential_claim_texts ancorava em `<ul class="`, e a home escreve
    `<ul aria-label="..." class="hero-proof">`: a lista voltava vazia e o gate
    passava por ausencia de entrada, nao por lastro. Com o padrao corrigido a
    home entra no mesmo contrato do perfil do especialista, e as quatro
    afirmacoes da primeira dobra precisam existir em data/site/proof.json.
    """
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    claims = extract_credential_claim_texts(html)
    assert claims, "home credential claims must be extractable, not silently empty"
    errors = check_credentials_against_proof(html)
    assert not errors, errors


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
    assert "corrections" not in pages, "a página autônoma de correções foi descontinuada"
    assert pages["ai_use"].exists()
    assert pages["conflicts"].exists()
    editorial = pages["editorial"].read_text(encoding="utf-8")
    ai = pages["ai_use"].read_text(encoding="utf-8")
    conflicts = pages["conflicts"].read_text(encoding="utf-8")
    assert "Engº Tiago Sasaki" in editorial
    # O dono da correção continua nomeado, agora no canal real.
    channel_page = ROOT / CORRECTION_CHANNEL_HREF.partition("#")[0].strip("/") / "index.html"
    assert gov["correction"]["owner_email"] in channel_page.read_text(encoding="utf-8")
    # O registro interno continua sem prazo inventado.
    assert gov["correction"]["prazo"] == "UNKNOWN"
    assert gov["correction"]["acknowledge_sla"] == "UNKNOWN"
    assert gov["correction"]["publish_sla"] == "UNKNOWN"
    assert "2 dias úteis" not in editorial
    assert "10 dias úteis" not in editorial
    # A página pública NÃO precisa mais estampar o rótulo interno.
    assert "UNKNOWN" not in editorial
    assert "inteligência artificial" in ai.lower() or "uso de ia" in ai.lower()
    assert "conflito" in conflicts.lower()
    nav = footer_authority_nav()
    assert nav == FOOTER_AUTHORITY_NAV
    for href in gov["footer_authority_paths"]:
        assert href in nav
    from scripts.pseo import html_shell

    assert "/politica-editorial/" in html_shell.FOOTER
    assert "/correcoes/" not in html_shell.FOOTER
    assert "/uso-de-ia/" in html_shell.FOOTER
    assert "/conflitos/" in html_shell.FOOTER
    for path in chrome_pages():
        html = path.read_text(encoding="utf-8")
        assert "/politica-editorial/" in html, path
        assert "/correcoes/" not in html, path
        assert CORRECTION_CHANNEL_HREF in html, path


def test_policy_version_consistency_and_visible_disclosure():
    policy = load_editorial_policy()
    version = current_policy_version(policy)
    assert version
    assert policy["prazo"] == "UNKNOWN"
    assert "epistemic_classes" not in policy, "as etiquetas inglesas saíram do contrato público"
    assert policy["claim_kinds"] == [
        "dado observado",
        "cálculo",
        "leitura técnica",
        "o que ainda não sabemos",
    ]
    errors = check_policy_version_consistency(policy, policy_pages())
    assert not errors, errors
    combined = combined_policy_html()
    disclosure = check_policy_visible_disclosure(combined, policy)
    assert not disclosure, disclosure
    assert "2 dias úteis" not in combined
    assert "10 dias úteis" not in combined
    assert "IA que vence" not in combined
    # O histórico continua legível e continua dizendo o que dizia.
    archives = archived_policy_pages()
    assert archives["historico"].exists()
    assert archives["v1.0.0"].exists()
    historic = archives["v1.0.0"].read_text(encoding="utf-8")
    assert "1.0.0" in historic
    assert "2 dias úteis" in historic
    assert "10 dias úteis" in historic
    fake = json.loads(json.dumps(policy))
    fake["current_version"] = "9.9.9"
    bumped = check_policy_version_consistency(fake, policy_pages())
    assert "current_version_missing_from_changelog" in bumped
    overwritten = json.loads(json.dumps(policy))
    overwritten["changelog"][0]["summary"] = "história reescrita em silêncio"
    rewritten = check_policy_version_consistency(overwritten, policy_pages())
    assert any(e.startswith("changelog_entry_rewritten") for e in rewritten), rewritten


def test_data_analysis_surfaces_link_policy_version():
    policy = load_editorial_policy()
    version = current_policy_version(policy)
    surfaces = data_analysis_policy_pages()
    assert surfaces
    for name, path in surfaces.items():
        assert path.exists(), path
        html = path.read_text(encoding="utf-8")
        link_errors = check_policy_links(html, policy)
        assert not link_errors, f"{name}: {link_errors}"
        assert version in html
        assert f'data-policy-version="{version}"' in html
        assert "/politica-editorial/" in html
        assert "/correcoes/" in html


def test_inteligencia_hub_rebuild_keeps_policy_version():
    """pSEO build rewrites inteligencia/index.html via render_hub.

    The stamp must come from that shipped renderer, not a hand-edit that
    the quality-gate rebuild can strip.
    """
    from scripts.pseo.render import render_hub

    policy = load_editorial_policy()
    version = current_policy_version(policy)
    html = render_hub(
        title="Inteligência aplicada à decisão B2G | CONFENGE",
        h1="O mercado público deixa rastros. Nós transformamos esses rastros em decisão.",
        description="Mercados, órgãos, preços e concorrência como evidência.",
        path="/inteligencia/",
        intro="Contratos, órgãos, preços, concorrência e oportunidades.",
        items=[],
        crumbs=[("Início", "/"), ("Inteligência", None)],
    )
    link_errors = check_policy_links(html, policy)
    assert not link_errors, f"inteligencia_hub rebuild: {link_errors}"
    assert version in html
    assert f'data-policy-version="{version}"' in html
    assert "policy-version-disclosure" in html
    child = render_hub(
        title="Mercados públicos de engenharia | CONFENGE",
        h1="Mercados por segmento e região",
        description="Contratos, órgãos e evolução.",
        path="/inteligencia/mercados/",
        intro="Lista de mercados com massa mínima.",
        items=[],
        crumbs=[("Início", "/"), ("Inteligência", "/inteligencia/"), ("Mercados", None)],
    )
    assert f'data-policy-version="{version}"' not in child


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
    assert classify_surface("/analises-contratos-publicos/") == "analise_tecnica_contrato"
    assert classify_surface("/analises-contratos-publicos/") != "caso_proof"
    assert classify_surface("/aditivos-obras-publicas/") == "servico"
    assert classify_surface("/politica-editorial/") is None


def test_fail_closed_missing_ai_disclosure_slot():
    html = _fixture(
        "<p>Autor: <a rel='author' href='/especialista/tiago-jun-sasaki/'>Engº Tiago Sasaki</a></p>"
        "<time datetime='2026-08-16'>16 de agosto de 2026</time>"
        "<h2>Método</h2><p>Fonte: PNCP. Limitação: não é censo.</p>"
        "<p>Como citar: CONFENGE.</p>"
        "<a href='/correcoes/'>Correções</a>"
    )
    errors = check_required_slots(html, "ferramenta")
    assert "ai_disclosure_absent" in errors
    ok = html.replace("</body>", '<a href="/uso-de-ia/">Uso de IA</a></body>')
    assert "ai_disclosure_absent" not in check_required_slots(ok, "ferramenta")


def test_fail_closed_analysis_requires_on_page_ai_disclosure():
    footer_only = _fixture(
        '<p data-surface-type="analise_tecnica_contrato">ANÁLISE TÉCNICA DE CONTRATO PÚBLICO</p>'
        "<p>Autor: <a rel='author' href='/especialista/tiago-jun-sasaki/'>Engº Tiago Sasaki</a></p>"
        "<p>Responsável técnico: Engº Tiago Sasaki. Sem revisão independente: não há segundo revisor nomeado.</p>"
        "<time datetime='2026-08-16'>16 de agosto de 2026</time>"
        "<h2>Método</h2><p>Fonte: instrumento público. Limitação: não é parecer jurídico.</p>"
        "<p>Não é Caso CONFENGE e não implica relação comercial com o órgão ou o contratado.</p>"
        "<p>Como citar: CONFENGE.</p>"
        "<a href='/correcoes/'>Correções</a>"
        '<footer><a href="/uso-de-ia/">Uso de IA</a></footer>'
    )
    errors = check_required_slots(footer_only, "analise_tecnica_contrato")
    assert "ai_disclosure_absent" in errors
    on_page = footer_only.replace(
        "<h2>Método</h2>",
        '<p id="ai-disclosure" data-ai-disclosure="assistive">Uso de IA: assistência de redação; responsável técnico humano. Política: <a href="/uso-de-ia/">Uso de IA</a>.</p><h2>Método</h2>',
    )
    assert "ai_disclosure_absent" not in check_required_slots(on_page, "analise_tecnica_contrato")


def test_fail_closed_caso_confenge_without_consent():
    html = _fixture("<h1>CASO CONFENGE</h1><p>Recuperamos margem do cliente sem autorização.</p>")
    errors = check_consent_slot(html, "caso_proof")
    assert "consent_absent" in errors
    assert "caso_confenge_without_consent" in errors
    demo = _fixture(
        '<p class="case-badge" data-permission-class="demonstrativo">'
        "CASO TÉCNICO DEMONSTRATIVO · NÃO É CASE DE CLIENTE</p>"
    )
    assert check_consent_slot(demo, "caso_proof") == []
    fake_client = _fixture(
        '<p data-permission-class="demonstrativo">CASO CONFENGE · customer success</p>'
    )
    fake_errors = check_consent_slot(fake_client, "caso_proof")
    assert "demonstrativo_labeled_caso_confenge" in fake_errors


def test_fail_closed_analysis_labeled_as_caso_confenge():
    html = _fixture(
        '<p data-surface-type="analise_tecnica_contrato">ANÁLISE TÉCNICA DE CONTRATO PÚBLICO</p>'
        "<p>Este é um Caso CONFENGE de customer success.</p>"
        '<script type="application/ld+json">{"@type":"CaseStudy","name":"Vitória"}</script>'
    )
    errors = check_analysis_not_case(html)
    assert "analysis_labeled_caso_confenge" in errors
    assert "analysis_customer_success_copy" in errors
    assert "analysis_disclaimer_absent" in errors
    assert any(e.startswith("analysis_schema_case_or_review") for e in errors)


def test_official_analysis_disclaimer_is_not_a_caso_confenge_label():
    html = _fixture(
        '<p data-surface-type="analise_tecnica_contrato">Análise técnica de contrato público</p>'
        "<p>Esta é uma análise técnica editorial independente de fonte pública. "
        "Não implica relação comercial da CONFENGE com o órgão, o contratado "
        "ou qualquer parte, e não é um caso CONFENGE.</p>"
        "<p>Análises editoriais independentes de contratos públicos. Não são casos CONFENGE.</p>"
    )
    assert check_analysis_not_case(html) == []


def test_fail_closed_invented_reviewer_award_association_rating():
    html = _fixture(
        "<p>Autor visível: Engº Tiago Sasaki</p><p>CONFENGE</p>",
        {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "Article",
                    "author": {"@type": "Person", "name": "Engº Tiago Sasaki"},
                    "reviewedBy": {"@type": "Person", "name": "Revisor Inventado"},
                },
                {
                    "@type": "Person",
                    "name": "Engº Tiago Sasaki",
                    "award": "Prêmio Inventado",
                    "memberOf": {"@type": "Organization", "name": "Conselho Fantasma"},
                },
                {"@type": "Award", "name": "Selo Fantasma"},
                {
                    "@type": "Organization",
                    "name": "CONFENGE",
                    "aggregateRating": {"@type": "AggregateRating", "ratingValue": "5"},
                },
            ],
        },
    )
    errors = check_schema_mirrors_visible(html)
    assert any(e.startswith("schema_invented_reviewer") for e in errors)
    assert "schema_invented_award" in errors
    assert any(e.startswith("schema_invented_association") for e in errors)
    assert any("AggregateRating" in e or "review_or_rating" in e for e in errors)


def test_fail_closed_breadcrumb_and_dataset_must_match_visible():
    html = _fixture(
        '<nav class="breadcrumbs container" aria-label="Navegação estrutural">'
        "<ol><li><a href='/'>Início</a></li><li aria-current='page'>Radar</li></ol></nav>"
        "<h1>Radar Nacional</h1><p>Recorte metodológico sem dataset inventado.</p>",
        {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        {"@type": "ListItem", "position": 1, "name": "Início"},
                        {"@type": "ListItem", "position": 2, "name": "Página Fantasma"},
                    ],
                },
                {
                    "@type": "Dataset",
                    "name": "Série nacional secreta de contratos premiados",
                },
            ],
        },
    )
    crumbs = extract_visible_crumbs(html)
    assert "Início" in crumbs
    assert "Radar" in crumbs
    schema_errors = check_schema_mirrors_visible(html)
    assert any(e.startswith("schema_breadcrumb_not_visible") for e in schema_errors)
    assert any(e.startswith("schema_dataset_not_visible") or "dataset_without_visible" in e for e in schema_errors)
    honest = _fixture(
        '<nav class="breadcrumbs container"><ol><li><a href="/">Início</a></li>'
        "<li aria-current='page'>Radar Nacional de Obras Públicas e Margem Contratual</li></ol></nav>"
        "<h1>Radar Nacional de Obras Públicas e Margem Contratual</h1>"
        "<p>Metodologia reproduzível. Recorte aberto. as_of 2026-08-03.</p>",
        {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        {"@type": "ListItem", "position": 1, "name": "Início"},
                        {
                            "@type": "ListItem",
                            "position": 2,
                            "name": "Radar Nacional de Obras Públicas e Margem Contratual",
                        },
                    ],
                },
                {
                    "@type": "Dataset",
                    "name": "Radar Nacional de Obras Públicas e Margem Contratual",
                },
            ],
        },
    )
    assert check_schema_mirrors_visible(honest) == []


def test_margin_defense_pillar_shows_source_as_of_limitation():
    """#60 VALIDATE canary: the public pillar keeps visible provenance tokens."""
    path = ROOT / "defesa-margem-contratos-publicos" / "index.html"
    html = path.read_text(encoding="utf-8")
    assert path.is_file()
    assert "authority-method" in html
    assert 'id="proveniencia-vertical"' in html
    lower = html.lower()
    assert "source" in lower
    assert "as_of" in lower
    assert "limitation" in lower
    assert "unknown" in lower
    assert "smartlic" not in lower


def test_family_audit_fails_closed_on_unclassified_and_covers_matrix():
    audit = audit_public_families()
    assert audit["matrix_errors"] == []
    assert set(audit["families"]) == set(SURFACE_TYPES)
    for name, rec in audit["families"].items():
        assert rec["required_slots"]
        for key in REQUIRED_SLOT_KEYS:
            assert key in rec["required_slots"], f"{name}.{key}"
        assert rec["status"] in {"pass", "fail", "fail_closed", "unseen"}
        if rec["status"] == "unseen":
            raise AssertionError(f"{name} left unseen")
    for row in audit["unclassified_public"]:
        assert row["status"] == "fail_closed"
        assert row["code"] == "unclassified_public_family"
        assert row["status"] != "pass"
    pages = representative_pages()
    for kind, path in pages.items():
        assert path.exists(), path
        rec = audit["families"][kind]
        match = [p for p in rec["pages"] if p["path"].rstrip("/") == "/" + str(path.parent.relative_to(ROOT)).replace("\\", "/")]
        assert match, f"representative {kind} missing from audit"
        assert match[0]["status"] == "pass", match[0]


def test_multivertical_conflict_gate_shipped():
    from scripts.site.test_conflict_gate import run_suite

    run_suite()


def test_real_schema_types_mirror_visible_copy():
    samples = {
        "Organization": ROOT / "diretoria-b2g" / "index.html",
        "Person": ROOT / "especialista" / "tiago-jun-sasaki" / "index.html",
        "Article": ROOT
        / "analises-contratos-publicos"
        / "bdi-composicao-vs-referencia-sc"
        / "index.html",
        "Dataset": ROOT / "radar" / "nacional-obras-publicas" / "index.html",
        "BreadcrumbList": ROOT / "especialista" / "tiago-jun-sasaki" / "index.html",
    }
    seen: set[str] = set()
    for expected, path in samples.items():
        html = path.read_text(encoding="utf-8")
        errors = check_schema_mirrors_visible(html)
        assert not errors, f"{path} {expected}: {errors}"
        types = set()
        for node in flatten_jsonld_nodes(extract_jsonld_blocks(html)):
            types |= _types_of(node)
        assert expected in types, f"{path} missing {expected} in {types}"
        seen.add(expected)
    assert seen == set(samples)


def test_jsonld_extractor_reads_shipped_markup():
    html = (ROOT / "diretoria-b2g" / "index.html").read_text(encoding="utf-8")
    blocks = extract_jsonld_blocks(html)
    assert blocks, "shipped offer page must keep JSON-LD"
    blob = json.dumps(blocks, ensure_ascii=False)
    assert "CONFENGE" in blob
    assert "Review" not in blob
    assert "AggregateRating" not in blob


# --- Retificação da experiência pública (2026-09-07) -------------------------
# Estes testes existem para provar que a exigência revogada foi SUBSTITUÍDA por
# uma propriedade, não desligada. Cada um semeia a regressão e exige a reprovação.


def test_public_pages_do_not_export_the_internal_vocabulary():
    """A superfície humana não repete o vocabulário de controle interno."""
    policy = load_editorial_policy()
    combined = combined_policy_html()

    # Estado atual: limpo.
    assert check_policy_visible_disclosure(combined, policy) == []

    # Contracaso: cada termo interno reintroduzido precisa reprovar.
    for token in ("FACT", "CALCULATION", "INFERENCE", "UNKNOWN", "PII", "handoff", "gates"):
        seeded = combined + f"<p>Classificação: {token}.</p>"
        errors = check_policy_visible_disclosure(seeded, policy)
        assert f"internal_vocabulary_visible:{token}" in errors, (token, errors)

    # E não pode reprovar palavra portuguesa que apenas contém o termo.
    innocent = combined + "<p>Um fato satisfatório sobre a fatura e o fatorial.</p>"
    assert check_policy_visible_disclosure(innocent, policy) == []


def test_unmeasured_deadline_stays_uninvented_without_forcing_the_token():
    """A verdade preservada é o prazo não inventado, não a palavra UNKNOWN."""
    policy = load_editorial_policy()

    # O registro interno continua sem prazo medido...
    assert policy["prazo"] == "UNKNOWN"
    gov = load_governance()
    for key in ("acknowledge_sla", "publish_sla", "prazo"):
        assert gov["correction"][key] == "UNKNOWN"

    # ...e a página pública NÃO é mais obrigada a estampar o rótulo.
    assert "unknown" not in _norm(_strip_tags(combined_policy_html()))
    assert check_policy_visible_disclosure(combined_policy_html(), policy) == []

    # Mas prometer prazo que ninguém mediu continua reprovando.
    for promise in ("2 dias úteis", "10 dias úteis"):
        seeded = combined_policy_html() + f"<p>Respondemos em {promise}.</p>"
        errors = check_policy_visible_disclosure(seeded, policy)
        assert any(e.startswith("invented_deadline_visible") or e.startswith("forbidden_promise")
                   for e in errors), (promise, errors)


def test_correction_channel_exists_and_the_retired_route_is_gone():
    """Conservar o canal é a obrigação; conservar /correcoes/ não era."""
    policy = load_editorial_policy()

    # A rota antiga não é mais servida...
    assert not (ROOT / "correcoes" / "index.html").exists()
    # ...e não é mais uma página de política nem de chrome.
    assert "corrections" not in policy_pages()
    assert all("correcoes" not in str(p) for p in chrome_pages())

    # O canal existe, tem destino real e o alvo da âncora existe de fato.
    path, _, anchor = CORRECTION_CHANNEL_HREF.partition("#")
    target = ROOT / path.strip("/") / "index.html"
    assert target.exists(), target
    html = target.read_text(encoding="utf-8")
    assert f'id="{anchor}"' in html, "a âncora do canal precisa existir na página de contato"
    assert "tiago.sasaki@confenge.com.br" in html, "o canal precisa ter destino real"

    # A redireção da URL antiga existe, é URL-exata e não aponta para a home.
    redirects = (ROOT / "_redirects").read_text(encoding="utf-8")
    rule = [l for l in redirects.splitlines() if l.strip().startswith("/correcoes")]
    assert len(rule) == 1, rule
    assert CORRECTION_CHANNEL_HREF in rule[0], rule
    assert not rule[0].split()[1].strip().startswith("/ "), "nunca redirecionar para a home"

    # O endpoint de protocolo continua existindo: recibo antigo ainda resolve.
    assert (ROOT / "netlify" / "functions" / "correction.cjs").exists()
    gov = load_governance()
    assert gov["correction"]["channel"] == "/.netlify/functions/correction"

    # Contracaso: uma página que volte a linkar a rota morta reprova.
    assert "retired_correction_route_linked" in check_policy_links(
        html + '<a href="/correcoes/">Correções</a>', policy)
    # Contracaso: uma página sem o canal reprova.
    assert "correction_channel_absent" in check_policy_links(
        '<a href="/politica-editorial/">política</a>', policy)


def test_history_is_preserved_in_the_record_not_by_a_public_portal():
    """Retirar a página é permitido; apagar ou reescrever o registro não."""
    policy = load_editorial_policy()
    assert check_policy_version_consistency(policy, policy_pages()) == []

    # A 1.1.0 continua íntegra no registro, com o texto original.
    v11 = policy["versions"]["1.1.0"]["pages"]
    assert "PII mínima" in v11["corrections"]["body"]
    assert "FACT no lugar de INFERENCE" in v11["corrections"]["body"]

    # Contracaso: esvaziar uma versão histórica reprova.
    emptied = json.loads(json.dumps(policy))
    emptied["versions"]["1.1.0"]["pages"]["corrections"]["body"] = ""
    errors = check_policy_version_consistency(emptied, policy_pages())
    assert any(e.startswith("history_page_emptied") or e.startswith("changelog_hash_mismatch")
               for e in errors), errors

    # Contracaso: reescrever o resumo histórico em silêncio reprova.
    rewritten = json.loads(json.dumps(policy))
    rewritten["changelog"][1]["summary"] = "história reescrita em silêncio"
    assert any(e.startswith("changelog_entry_rewritten")
               for e in check_policy_version_consistency(rewritten, policy_pages()))

    # Os hashes das versões anteriores não foram recalculados para disfarçar.
    for entry in policy["changelog"]:
        if entry["version"] == current_policy_version(policy):
            continue
        body = policy["versions"][entry["version"]]
        assert entry["content_sha256"] == content_sha256_for_version(body)


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
