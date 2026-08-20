"""Drive shipped offer HTML + registry/flags. Fail with AUTHORITY_MISMATCH on drift."""

from __future__ import annotations

import json
import re

from .shipped import (
    CANONICAL,
    FROZEN,
    PAGES,
    ROOT,
    attr_pairs,
    canonical,
    first_fold,
    jsonld_blocks,
    load_flags,
    load_registry,
    mismatch,
    origin_main_file,
    page_price_cents,
    read_html,
    visible_text,
)

SECTION_TOKENS = (
    ("outputs", ("entregáveis", "o que está incluído")),
    ("workflow", ("fluxo de trabalho",)),
    ("inputs", ("insumos",)),
    ("wip", ("wip",)),
    ("exclusions", ("não entra", "o que não entra", "exclusões")),
    ("proof", ("método", "fonte", "atualizado")),
)

JOB_TOKENS = {
    "bid-room": (
        "execução recorrente",
        "pipeline de propostas",
        "construtoras",
        "editais sobrepostos",
    ),
    "diretoria": (
        "coordenação recorrente",
        "bid room",
        "contract defense",
        "equipe ilimitada",
    ),
    "expansao": (
        "one-off",
        "cfg-diag-exp-v1",
        "expansão",
        "não é o diagnóstico b2g 360",
    ),
}

EXTRA_LEAKS = (
    "extra-cli",
    "cfg-dirb2g-extra",
    "r$ 10.000",
    "r$10.000",
    "r$ 10.000/mês",
    "r$ 10 mil",
)


def test_registry_consumer_and_diag_still_approved():
    reg = load_registry()
    flags = load_flags()
    assert reg["AUTHORITY"]["authority_source"].startswith("web-cfg#88")
    diag = reg["offers"]["CFG-DIAG-EXP-v1"]
    assert diag["status"] in ("APPROVED", "ACTIVE")
    assert flags["CONFENGE_OFFER_CATALOG_PUBLIC"] is False
    assert flags["production_checkout_enabled"] is False


def test_first_fold_jobs_are_distinct():
    folds = {key: first_fold(read_html(key)).lower() for key in JOB_TOKENS}
    frozen_360 = first_fold((FROZEN["diagnostico-b2g-360"]).read_text(encoding="utf-8")).lower()
    for key, tokens in JOB_TOKENS.items():
        fold = folds[key]
        for token in tokens:
            assert token in fold, f"{key} first fold missing {token!r}"
        primary = tokens[0]
        for other in JOB_TOKENS:
            if other == key:
                continue
            assert primary not in folds[other], f"{primary!r} leaked into {other} first fold"
        assert primary not in frozen_360, f"{key} job leaked into frozen 360 first fold"


def test_bid_room_denies_vitoria_habilitacao_protocolo():
    html = read_html("bid-room")
    text = visible_text(html).lower()
    assert "não promete vitória" in text or "sem promessa de vitória" in text
    assert "não habilita a empresa" in text
    assert "não protocola" in text
    assert "revisão crítica independente" in text
    assert "para o edital que exige coordenação da proposta, não improviso." in html.lower()


def test_diretoria_scope_wip_not_unlimited():
    html = read_html("diretoria")
    text = visible_text(html).lower()
    fold = first_fold(html).lower()
    assert "bid room" in fold and "contract defense" in fold
    assert "quatro oportunidades" in text
    assert "um contrato" in text or "um contrato ou obra" in text
    assert "não é equipe ilimitada" in text
    assert "não é cota mensal" in text
    assert "diretoria b2g fracionada" in html.lower()
    assert "uma rotina semanal de decisão sem o custo de montar uma diretoria interna." in html.lower()


def test_expansao_one_off_authority_deliverables_not_360():
    html = read_html("expansao")
    text = visible_text(html).lower()
    assert "cfg-diag-exp-v1" in text
    assert "one-off" in text or "pontual" in text
    for item in (
        "mapa de compradores",
        "até 15 concorrentes",
        "painel de preços públicos",
        "contratos com indício de expiração",
        "recomendações",
        "pdf executivo",
        "planilhas",
        "kickoff",
        "apresentação final",
    ):
        assert item in text, item
    assert 'data-offer-id="diagnostico-b2g-360"' not in html
    assert "<h1>Diagnóstico B2G 360°" not in html
    assert "não é o diagnóstico b2g 360" in text


def test_required_sections_cta_faq_canonical_jsonld():
    flags = load_flags()
    for key in PAGES:
        html = read_html(key)
        text = visible_text(html).lower()
        for _name, options in SECTION_TOKENS:
            assert any(opt in text for opt in options), f"{key} missing {_name} ({options})"
        assert "<details" in html.lower() and "<summary" in html.lower(), f"{key} missing contracting FAQ"
        if flags["production_checkout_enabled"] is False or flags["CONFENGE_OFFER_CATALOG_PUBLIC"] is False:
            assert "desligado" in text or "não está ativo" in text or "nao esta ativo" in text, (
                f"{key} missing capacity-aware checkout honesty"
            )
        can = canonical(html)
        assert can == CANONICAL[key], f"{key} canonical {can}"
        blocks = jsonld_blocks(html)
        assert blocks, f"{key} missing JSON-LD"
        blob = json.dumps(blocks, ensure_ascii=False)
        assert CANONICAL[key] in blob
        vis = visible_text(html)
        if '"price"' in blob:
            for m in re.findall(r'"price"\s*:\s*"?([\d.]+)"?', blob):
                major = int(float(m))
                shown = f"{major:,}".replace(",", ".")
                assert shown in vis or str(major) in html, f"{key} JSON-LD price {m} not visible"


def test_no_extra_leak_and_bid_room_has_no_price():
    for key in PAGES:
        html = read_html(key).lower()
        for leak in EXTRA_LEAKS:
            assert leak not in html, f"{key} Extra leak {leak!r}"
    bid = read_html("bid-room")
    if "R$" in bid or "r$" in bid.lower():
        mismatch("Bid Room published a price; registry has no Bid Room SKU")


def test_visible_prices_match_registry_or_mismatch():
    reg = load_registry()
    allowed = {
        "bid-room": set(),
        "diretoria": {
            reg["offers"]["CFG-DIRB2G-FLEX-v1"]["amount_cents"],
            reg["offers"]["CFG-DIRB2G-180-v1"]["amount_cents"],
            reg["offers"]["CFG-DIRB2G-180-v1"]["total_commitment_cents"],
            reg["offers"]["CFG-DIRB2G-365-v1"]["amount_cents"],
            reg["offers"]["CFG-DIRB2G-365-v1"]["total_commitment_cents"],
        },
        "expansao": {
            reg["offers"]["CFG-DIAG-EXP-v1"]["amount_cents"],
            reg["offers"]["CFG-DIAG-EXP-v1"]["credit_on_upgrade_cents"],
        },
    }
    for key in PAGES:
        html = read_html(key)
        found = page_price_cents(html)
        permit = allowed[key]
        for cents in found:
            if cents not in permit:
                mismatch(f"{key} visible/schema price {cents} cents not in registry {sorted(permit)}")
        if key == "diretoria":
            for cents in permit:
                if cents not in found:
                    mismatch(f"{key} missing registry amount {cents} on page")
        if key == "expansao":
            diag = reg["offers"]["CFG-DIAG-EXP-v1"]
            if diag["amount_cents"] not in found:
                mismatch("expansao missing CFG-DIAG-EXP-v1 amount")


def test_terms_id_on_pages_if_present_matches_registry():
    reg = load_registry()
    registry_terms = reg["AUTHORITY"]["terms_version"]
    founder = "CFG-LEGAL-TERMS-DIAG-EXP-FOUNDER-v1"
    for key in PAGES:
        html = read_html(key)
        if founder in html and founder != registry_terms:
            mismatch(f"{key} prints founder terms id {founder} != registry {registry_terms}")
        if "CFG-TERMS-B2B-" in html and registry_terms not in html:
            mismatch(f"{key} prints a terms id that is not registry {registry_terms}")


def test_hash153_attributes_preserved_from_origin_main():
    mapping = {
        "bid-room-licitacoes-obras/index.html": "bid-room",
        "diretoria-b2g/index.html": "diretoria",
    }
    for rel, key in mapping.items():
        origin = origin_main_file(rel).decode("utf-8")
        current = read_html(key)
        origin_pairs = attr_pairs(origin)
        current_pairs = attr_pairs(current)
        missing = [p for p in origin_pairs if p not in current_pairs]
        assert not missing, f"{key} lost #153 attrs {missing}"


def test_frozen_pages_remain_indexable_self_canonical():
    """CONFENGE-WEB-BOFU-CHECKOUT-CONVERGENCE-01 authorized criterion-1 HTML.
    Freeze recapture is hash-bound; origin/main byte equality is no longer the gate.
    """
    rels = (
        "diagnostico-b2g-360/index.html",
        "diagnostico-pre-licitacao/index.html",
        "auditoria-orcamento-licitacao/index.html",
    )
    for rel in rels:
        html = (ROOT / rel).read_text(encoding="utf-8")
        path = "/" + rel.replace("/index.html", "/")
        assert "index,follow" in html, rel
        assert f"https://confenge.com.br{path}" in html, rel
        assert 'id="quando-nao-contratar"' in html or "data-when-not-hire" in html, rel
        assert "smartlic.tech" not in html.lower(), rel


def test_expansao_handraise_not_checkout_when_flags_false():
    html = read_html("expansao")
    flags = load_flags()
    assert flags["production_checkout_enabled"] is False
    assert "/.netlify/functions/lead" in html
    assert "CFG-DIAG-EXP-v1" in html
    assert "CFG-TERMS-B2B-2026-08-17-v1" in html
    assert "/.netlify/functions/offer-checkout" not in html
    assert "otp-input" not in html
    assert "btn-confirmar" not in html
    assert "created.link" not in html
    vis = visible_text(html).lower()
    assert "desligado" in vis
    assert "pagar" not in vis or "não" in vis
