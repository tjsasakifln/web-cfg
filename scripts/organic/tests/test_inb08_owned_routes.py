"""INB-20260911/08: drive shipped HTML of the three owned GSC-visible routes.

Reads the committed index.html. Does not reimplement extraction of title,
canonical or commercial-bridge: those come from the shipped organic helpers.
A mutation that drops the executado/medido/contratado/evidenciado distinction,
injects a recebimento/êxito promise, or removes the quantitativos CTA must fail.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.service_map import extract_bridge_service, html_has_commercial_bridge
from scripts.organic.sinapi_snippet import CANONICAL_TITLE, parse_title
from scripts.site.inbound_gates import is_indexable_html
from scripts.site.public_copy_scope import visible_text

SITE = "https://confenge.com.br"
MEDICOES = ROOT / "medicoes-glosas-obras-publicas" / "index.html"
ADITIVOS = ROOT / "aditivos-obras-publicas" / "index.html"
SINAPI = ROOT / "conteudos" / "sinapi-desonerado-nao-desonerado" / "index.html"
CLICK_ORIGIN = (
    ROOT / "conteudos" / "custos-indiretos-atraso-administracao-obra" / "index.html",
    ROOT / "conteudos" / "jogo-de-planilha-aditivo-obra-publica" / "index.html",
    ROOT / "conteudos" / "fiscal-nao-assina-medicao-obra-publica" / "index.html",
)
QUANTITATIVOS_HREF = "/quantitativos-orcamento-obras/"
AUDITORIA_HREF = "/auditoria-orcamento-licitacao/"

PROMISE_RE = re.compile(
    r"prometemos o recebimento|garantimos o pagamento|êxito administrativo garantido|"
    r"decisão judicial favorável|o órgão pagará|o aditivo será deferido|"
    r"promessa de recebimento da glosa",
    re.I,
)
FOUR_WAY = ("executado", "medido", "contratado", "evidenciado")


def _canonical(html: str) -> str:
    match = re.search(
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']|'
        r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
        html,
        flags=re.I,
    )
    return (match.group(1) or match.group(2) if match else "").strip()


def _hrefs(html: str) -> list[str]:
    return re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I)


def evaluate_owned_html(html_by_route: dict[str, str]) -> dict:
    """Fail-closed audit of the three owned routes. Keys are URL paths."""
    fails: list[str] = []
    medicoes = html_by_route["/medicoes-glosas-obras-publicas/"]
    aditivos = html_by_route["/aditivos-obras-publicas/"]
    sinapi = html_by_route["/conteudos/sinapi-desonerado-nao-desonerado/"]

    for path, html in html_by_route.items():
        if _canonical(html) != f"{SITE}{path}":
            fails.append(f"canonical_mismatch:{path}")
        if not is_indexable_html(html):
            fails.append(f"not_indexable:{path}")
        text = visible_text(html)
        if PROMISE_RE.search(text):
            fails.append(f"payment_or_outcome_promise:{path}")
        if "exemplo demonstrativo" not in text.lower() and "premissas sintéticas" not in text.lower():
            fails.append(f"missing_labeled_example:{path}")
        if "wa.me/" not in html and 'href="/#formulario-contato"' not in html and 'href="/#contato"' not in html:
            fails.append(f"missing_hire_cta:{path}")

    med_text = visible_text(medicoes).lower()
    for token in FOUR_WAY:
        if token not in med_text:
            fails.append(f"medicoes_missing_{token}")
    if "dossiê de medição, glosa e pagamento" not in med_text:
        fails.append("medicoes_missing_deliverable_name")
    if "petição jurídica" not in med_text:
        fails.append("medicoes_missing_legal_boundary")
    if "empresa contratada" not in med_text or "órgão público contratante" not in med_text:
        fails.append("medicoes_missing_party_distinction")
    if "sem o conjunto completo" not in med_text:
        fails.append("medicoes_missing_incomplete_start")
    if "/conteudos/fiscal-nao-assina-medicao-obra-publica/" not in medicoes:
        fails.append("medicoes_missing_fiscal_guide")

    ad_text = visible_text(aditivos).lower()
    for token in ("alteração", "quantificação", "não previsto", "contempor"):
        if token not in ad_text:
            fails.append(f"aditivos_missing_{token}")
    if "não é reajuste" not in ad_text:
        fails.append("aditivos_missing_reajuste_distinction")
    if "reequilíbrio" not in ad_text:
        fails.append("aditivos_missing_reequilibrio_distinction")
    if "direito automático" not in ad_text:
        fails.append("aditivos_missing_no_automatic_right")
    if "dossiê de aditivo e serviço extra" not in ad_text:
        fails.append("aditivos_missing_deliverable_name")
    if "/conteudos/jogo-de-planilha-aditivo-obra-publica/" not in aditivos:
        fails.append("aditivos_missing_jogo_planilha_link")
    if "25%" in ad_text and "esta página não inventa percentual" not in ad_text:
        fails.append("aditivos_invents_percent_without_deferral")

    if parse_title(sinapi) != CANONICAL_TITLE:
        fails.append("sinapi_title_regressed")
    if 'data-breakout-tool="sinapi-aligner"' not in sinapi:
        fails.append("sinapi_aligner_missing")
    if not html_has_commercial_bridge(sinapi):
        fails.append("sinapi_bridge_missing")
    if extract_bridge_service(sinapi) != AUDITORIA_HREF:
        fails.append(f"sinapi_bridge_not_auditoria:{extract_bridge_service(sinapi)}")
    if QUANTITATIVOS_HREF not in _hrefs(sinapi):
        fails.append("sinapi_missing_quantitativos_cta")
    sin_text = visible_text(sinapi).lower()
    if "elaboração ou revisão" not in sin_text:
        fails.append("sinapi_missing_elaboracao_revisao_label")
    if "não se aplicam automaticamente a qualquer obra privada" not in sin_text:
        fails.append("sinapi_applies_public_method_to_private")

    return {"ok": not fails, "fails": fails}


def _load() -> dict[str, str]:
    return {
        "/medicoes-glosas-obras-publicas/": MEDICOES.read_text(encoding="utf-8"),
        "/aditivos-obras-publicas/": ADITIVOS.read_text(encoding="utf-8"),
        "/conteudos/sinapi-desonerado-nao-desonerado/": SINAPI.read_text(encoding="utf-8"),
    }


def test_shipped_owned_routes_meet_inb08_contract():
    report = evaluate_owned_html(_load())
    assert report["ok"], "\n".join(report["fails"])


def test_mutation_dropping_four_way_distinction_fails():
    pages = _load()
    mutated = pages["/medicoes-glosas-obras-publicas/"]
    for token in FOUR_WAY:
        mutated = mutated.replace(token, "REMOVIDO").replace(token.capitalize(), "REMOVIDO")
    pages["/medicoes-glosas-obras-publicas/"] = mutated
    report = evaluate_owned_html(pages)
    assert report["ok"] is False
    assert any(item.startswith("medicoes_missing_") for item in report["fails"]), report["fails"]


def test_mutation_injecting_receipt_promise_fails():
    pages = _load()
    pages["/medicoes-glosas-obras-publicas/"] += (
        "<p>Prometemos o recebimento da glosa e êxito administrativo garantido.</p>"
    )
    report = evaluate_owned_html(pages)
    assert report["ok"] is False
    assert any("payment_or_outcome_promise" in item for item in report["fails"]), report["fails"]


def test_mutation_removing_quantitativos_cta_fails():
    pages = _load()
    pages["/conteudos/sinapi-desonerado-nao-desonerado/"] = pages[
        "/conteudos/sinapi-desonerado-nao-desonerado/"
    ].replace(QUANTITATIVOS_HREF, "/auditoria-orcamento-licitacao/")
    report = evaluate_owned_html(pages)
    assert report["ok"] is False
    assert "sinapi_missing_quantitativos_cta" in report["fails"], report["fails"]
    # The auditoria commercial bridge must still be the thing the mutation did not own.
    assert extract_bridge_service(pages["/conteudos/sinapi-desonerado-nao-desonerado/"]) == AUDITORIA_HREF


_REVISION_SURFACES = re.compile(
    rb'(content=")\d{4}-\d{2}-\d{2}(" property="article:modified_time")'
    rb'|("dateModified":")\d{4}-\d{2}-\d{2}(")'
    rb'|(Revisado em <time datetime=")\d{4}-\d{2}-\d{2}(">)[^<]*(</time>)'
)

# As três superfícies da ponte artigo→pilar. Cada uma colapsa num marcador
# constante, elemento inteiro (não só atributo): o link do pilar no bloco de
# oferta não existe em origin/main, e o conjunto de atributos do link do
# formulário muda, não só valores. No WhatsApp só o texto pré-preenchido
# (``?text=``) é mascarado: número e rótulo visível continuam pinados.
_FORM_LABEL = "Continuar pelo formulário".encode("utf-8")
_BRIDGE_FORM = re.compile(rb'<a class="button button-secondary"[^>]*>' + _FORM_LABEL + rb"</a>")
_BRIDGE_PILLAR = re.compile(rb'<a class="text-link" data-pillar-link="1"[^>]*>.*?</a>', re.S)
_BRIDGE_WA = re.compile(rb'(href="https://wa\.me/5548988344559)\?text=[^"]*(")')


def _mask_revision_date(html: bytes) -> bytes:
    """Blank the three revision-date surfaces only; every other byte counts."""
    return _REVISION_SURFACES.sub(lambda m: b"".join(g for g in m.groups() if g), html)


def _mask_bridge(html: bytes) -> bytes:
    """Colapsa a ponte de contato artigo→pilar; o corpo do guia fica pinado."""
    html = _BRIDGE_FORM.sub(b"@PONTE_FORMULARIO@", html)
    html = _BRIDGE_PILLAR.sub(b"", html)
    html = _BRIDGE_WA.sub(rb"\1?text=@PONTE_WA@\2", html)
    return html


def _mask(html: bytes) -> bytes:
    return _mask_bridge(_mask_revision_date(html))


def _base(path: Path) -> bytes:
    import subprocess

    rel = path.relative_to(ROOT).as_posix()
    return subprocess.check_output(["git", "-C", str(ROOT), "show", f"origin/main:{rel}"])


def test_click_origin_articles_match_origin_main():
    """Non-regression: the three click-origin articles keep the base content.

    2026-09-14: /conteudos/fiscal-nao-assina-medicao-obra-publica/ belongs to
    the medição cluster, whose revision date must move on every page when any
    body in the cluster changes (cluster_medicao_originality.revision_failures).
    That restamp is not a rewrite of the guide, so the comparison masks the
    revision-date surfaces and keeps every other byte pinned to base.

    2026-09-19 (INBOUND-RECEITA-20260919, decisão do fundador EXECUTE_NOW):
    a ponte de contato artigo→pilar também não é reescrita do guia. O link
    "Continuar pelo formulário" deixa a home e leva o contexto ao formulário do
    pilar (``data-tema``/``data-origem``), o bloco de oferta ganha o link do
    pilar e o WhatsApp passa a frase natural
    (``scripts/site/apply_article_pillar_form.py``). Essas três superfícies
    são mascaradas; título, corpo, fontes, canonical e o resto continuam
    byte a byte iguais a origin/main.
    """
    for path in CLICK_ORIGIN:
        rel = path.relative_to(ROOT).as_posix()
        base = _base(path)
        live = path.read_bytes()
        assert _mask(live) == _mask(base), rel
        # A máscara precisa ter encontrado a ponte, senão não é a ponte que evoluiu.
        assert _mask(live).count(b"@PONTE_FORMULARIO@") == 1, rel
        html = live.decode("utf-8")
        assert _canonical(html).startswith(SITE)
        assert _canonical(html).endswith("/" + rel.replace("index.html", ""))
        assert "href=\"/\"" in html or "href=\"https://confenge.com.br/\"" in html
        # Canonical of the article is itself, not the home page.
        assert _canonical(html) != f"{SITE}/"


def test_click_origin_guard_still_rejects_a_body_change():
    """Contra-prova: mascarar data e ponte não abre a porta para reescrever o corpo."""
    base = _base(CLICK_ORIGIN[2])
    mutated = base.replace(b"</h1>", b" (reescrito)</h1>", 1)
    assert mutated != base
    assert _mask(mutated) != _mask(base)
    restamped = base.replace(b'"dateModified":"2026-09-08"', b'"dateModified":"2099-01-01"', 1)
    assert _mask(restamped) == _mask(base)
    # Um parágrafo do guia reescrito reprova mesmo com a ponte idêntica.
    body = base.replace(b"<p>", b"<p>Texto novo. ", 1)
    assert body != base
    assert _mask(body) != _mask(base)


def test_click_origin_guard_lets_the_bridge_evolve_only():
    """Contra-prova: só as três superfícies da ponte podem mudar."""
    for path in CLICK_ORIGIN:
        base = _base(path)
        form = _BRIDGE_FORM.search(base)
        assert form, path
        # 1. link do formulário reescrito ao pilar com contexto: passa.
        bridged = base.replace(
            form.group(0),
            b'<a class="button button-secondary" data-cta-position="form" data-journey="contrato" '
            b'href="/medicoes-glosas-obras-publicas/#captura-pilar" data-tema="x" data-origem="/conteudos/x/">'
            + _FORM_LABEL
            + b"</a>",
            1,
        )
        assert bridged != base
        assert _mask(bridged) == _mask(base)
        # 2. link do pilar inserido no bloco de oferta: passa.
        with_pillar = base.replace(
            b"Conversar pelo WhatsApp</a></div>",
            b'Conversar pelo WhatsApp</a><a class="text-link" data-pillar-link="1" href="/x/">Ver <svg class="icon"><use href="#i-arrow"></use></svg></a></div>',
            1,
        )
        assert with_pillar != base, path
        assert _mask(with_pillar) == _mask(base)
        # 3. texto do WhatsApp em frase natural: passa; número trocado: reprova.
        wa = _BRIDGE_WA.search(base)
        assert wa, path
        natural = base.replace(wa.group(0), wa.group(1) + b"?text=Ol%C3%A1" + wa.group(2), 1)
        assert natural != base
        assert _mask(natural) == _mask(base)
        other_number = base.replace(b"wa.me/5548988344559", b"wa.me/5500000000000", 1)
        assert _mask(other_number) != _mask(base)
        # 4. rótulo do formulário trocado: o marcador não casa e reprova.
        relabeled = base.replace(form.group(0), form.group(0).replace(_FORM_LABEL, b"Outro texto"), 1)
        assert _mask(relabeled) != _mask(base)
        assert _mask(relabeled).count(b"@PONTE_FORMULARIO@") == 0
