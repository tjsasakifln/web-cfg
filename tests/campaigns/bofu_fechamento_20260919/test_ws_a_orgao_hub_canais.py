"""WS-A (BOFU-FECHAMENTO-20260919): órgão contratante no hub, generadores e canais.

Contraprovas de HTML renderizado e contratos de dados:

- FAMILIAS-PUBLICAS-01 / HOME-HUB-05: a instrução do bloco do órgão não manda
  escolher "Outro evento contratual"; nomeia a opção própria, o <select> a tem e
  o CTA leva ``data-contract-event`` / ``data-estagio`` (pré-seleção do bundle).
- FAMILIAS-PUBLICAS-04: "Ainda não sei" é ``UNKNOWN`` (sem duplicata) e cada
  pilar D17/D20/D23 pré-seleciona o evento da própria página.
- HOME-HUB-06/07/08: frase do órgão no herói, "publicados uma vez" leva à seção
  com preço, saída para /servicos/ no <main>.
- HOME-HUB-12: /problemas-que-resolvemos/ nomeia o reajuste com destino real.
- RESSALVAS-09: nenhuma ressalva de resultado duplicada no contrato de contratos.
- CONTEXTO-CAPTURA-01/-06: toda rota com formulário de captura publica WhatsApp
  no <main> e um e-mail na página (o rodapé de toda rota publica o endereço; os
  pilares congelados não têm mailto no <main>); exceções route-exact e datadas
  para o modelo D01 (só e-mail, ao lado do formulário) e para as três
  ferramentas (pendência: só e-mail no <main>).

Uso: python3 -m pytest tests/campaigns/bofu_fechamento_20260919/test_ws_a_orgao_hub_canais.py -q
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HUB = ROOT / "servicos-obras-publicas/index.html"
PROBLEMS = ROOT / "problemas-que-resolvemos/index.html"
INVENTORY = ROOT / "docs/commercial/cta-form-next-state-inventory.json"
CONTRATOS = ROOT / "data/commercial/page-contract-contratos.v1.json"

# Exceção route-exact e datada (2026-09-19, WS-A, CONTEXTO-CAPTURA-06): as cinco
# ações comerciais do modelo D01 vão para /comercial/radar-decisorio/ e
# scripts/site/test_report_model_599.py veta wa.me na página; o canal direto
# possível ali é o e-mail ao lado do formulário.
WHATSAPP_EXEMPT_ROUTES = {
    "/casos/modelo-relatorio-inteligencia-licitacoes/": "2026-09-19, #705: test_report_model_599 veta wa.me; rota comercial única do Radar; e-mail ao lado do formulário",
    # Pendência datada (2026-09-19, fora do escopo de WS-A; família `ferramentas`,
    # capture_form_or_whatsapp): as três ferramentas só publicam os canais na nota
    # <noscript> e no rodapé (e-mail). Registrar no fechamento; retirar daqui ao
    # publicar o canal ao lado do formulário de segunda leitura.
    "/ferramentas/checklist-reequilibrio/": "2026-09-19, #705: pendência — canal só no rodapé e no noscript",
    "/ferramentas/diagnostico-defesa-margem/": "2026-09-19, #705: pendência — canal só no rodapé e no noscript",
    "/ferramentas/limite-acrescimos-supressoes/": "2026-09-19, #705: pendência — canal só no rodapé e no noscript",
}


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _main(html: str) -> str:
    match = re.search(r"<main\b[\s\S]*?</main>", html, re.I)
    assert match, "main ausente"
    return match.group(0)


def _no_noscript(html: str) -> str:
    return re.sub(r"<noscript\b[^>]*>[\s\S]*?</noscript>", " ", html, flags=re.I)


def test_orgao_instruction_names_the_own_option_and_cta_preselects() -> None:
    html = _read(HUB)
    assert 'escolha "Outro evento contratual"' not in html
    block = re.search(r'<li class="list-ruled__group" id="situacao-orgao">[\s\S]*?</article></li>', html)
    assert block, "bloco do órgão ausente"
    text = block.group(0)
    assert "escolha &quot;Órgão planejando a contratação de obra ou serviço&quot;" in text
    assert re.search(
        r'<a class="list-ruled__action" data-contract-event="planejamento_contratacao" data-estagio="planejamento-contratacao-publica" href="#captura-contrato">',
        text,
    )
    select = re.search(r'<select name="contract_event" required>[\s\S]*?</select>', html)
    assert select
    assert '<option value="planejamento_contratacao">Órgão planejando a contratação de obra ou serviço</option>' in select.group(0)
    # Os quatro campos preparatórios existem, são opcionais e visíveis sem JS (labels no grid, sem fieldset).
    form = re.search(r'<form\b[^>]*data-cta-id="contract-defense-products-handraise"[^>]*>[\s\S]*?</form>', html).group(0)
    for name in ("procurement_object", "procurement_stage", "procurement_regulation", "funding_source"):
        control = re.search(rf'<(?:input|select)\b[^>]*\bname="{name}"[^>]*>', form)
        assert control, name
        assert "required" not in control.group(0), name
    assert "<fieldset" not in form
    assert "Se for órgão contratante" in form
    assert '<textarea name="mensagem" id="mensagem"' in form


def test_contract_stage_unknown_and_pillars_preselect_their_event() -> None:
    html = _read(HUB)
    assert '<select name="contract_stage"><option value="UNKNOWN">Ainda não sei</option>' in html
    assert "Ainda não definido" not in html
    for slug, event in (
        ("defesa-margem-contratos-publicos", "risco_margem"),
        ("atrasos-prorrogacao-obras-publicas", "atraso_prorrogacao"),
        ("defesa-tecnica-contratos-publicos", "notificacao_sancao"),
    ):
        page = _read(ROOT / slug / "index.html")
        assert f'<option value="{event}" selected>' in page, slug
        assert page.count(" selected>") == 1, slug
        assert '<option value="UNKNOWN">Ainda não sei</option>' in page, slug
        assert "Ainda não definido" not in page, slug


def test_hub_hero_orgao_sentence_prices_link_and_services_exit() -> None:
    html = _read(HUB)
    hero = re.search(r'<section aria-labelledby="hub-title" class="svc-open">[\s\S]*?</section>', html).group(0)
    assert 'href="#situacao-orgao"' in hero
    # A frase fica depois da linha de prova: prova e ação primária não mudam de lugar na dobra.
    assert hero.index('class="section-proof svc-open__note"') < hero.index('href="#situacao-orgao"')
    sentence = re.search(r'<p>Cada situação diz o que assumimos[^<]*<a href="([^"]+)">[^<]*</a>', html)
    assert sentence and sentence.group(1) == "#contract-products-title"
    priced = re.search(r'<section class="contract-products-hub" aria-labelledby="contract-products-title">[\s\S]*?</section>', html)
    assert priced and "R$ 4.900" in priced.group(0)
    assert 'href="#captura-contrato">Registrar o evento</a>' in html
    main = _main(html)
    assert 'href="/servicos/"' in main
    assert "Na mesma proposta" in main or "na mesma proposta" in main


def test_problems_hub_names_reajuste_with_real_destination() -> None:
    html = _read(PROBLEMS)
    assert re.search(r'href="/servicos-obras-publicas/#entrega-21"[^>]*>[^<]*Reajuste', html) or (
        "Reajuste" in html and 'href="/servicos-obras-publicas/#entrega-21"' in html
    )


def test_contract_has_no_duplicated_outcome_disclaimer() -> None:
    doc = json.loads(_read(CONTRATOS))
    for item in doc["items"]:
        if item["legal_boundary"].get("no_outcome_promise"):
            for line in item["not_included_pt_br"]:
                assert not re.search(r"garante|promete", line, re.I), (item["deliverable_id"], line)
    page = _read(ROOT / "defesa-tecnica-contratos-publicos/index.html")
    assert "não garante afastamento de multa" not in page
    assert page.count("não promete resultado, recebimento nem afastamento de sanção") == 1


def test_every_capture_route_publishes_whatsapp_and_email_in_main() -> None:
    inventory = json.loads(_read(INVENTORY))
    missing: list[str] = []
    for surface in inventory["surfaces"]:
        html = _no_noscript(_read(ROOT / surface["file"]))
        main = _main(html)
        has_mail = "mailto:" in html
        has_wa = "https://wa.me/" in main
        if surface["route"] in WHATSAPP_EXEMPT_ROUTES:
            # A exceção só vale enquanto a rota de fato não publica WhatsApp visível.
            assert "https://wa.me/" not in main, f"{surface['route']}: exceção obsoleta, retire-a"
            if "mailto:" not in (main if surface["route"].startswith("/casos/") else html):
                missing.append(f"{surface['route']} (mailto)")
            continue
        if not (has_mail and has_wa):
            missing.append(f"{surface['route']} (wa={has_wa}, mail={has_mail})")
    assert not missing, missing


def test_analise_cnpj_has_a_channel_without_javascript() -> None:
    for rel in ("analise-cnpj/index.html", "analise-cnpj/r/index.html"):
        html = _read(ROOT / rel)
        # Fora da seção oculta (#pedido, revelada pelo runtime): um <noscript> visível com os dois canais.
        visible = re.sub(r'<section class="section" id="pedido"[\s\S]*?</section>', " ", html)
        notes = re.findall(r"<noscript>[\s\S]*?</noscript>", visible)
        assert any("https://wa.me/" in n and "mailto:" in n for n in notes), rel
        assert 'class="contact-alt"' in html, rel
