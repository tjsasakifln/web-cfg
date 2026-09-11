#!/usr/bin/env python3
"""POS-INB-07: shipped hub HTML and owned offer pages, no reimplemented href list."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.hub_link_composition import (  # noqa: E402
    Overlay,
    audit_hubs,
    compose_links,
    extract_hrefs,
    hub_html,
    journey_table,
    load_matrix,
)

EIGHT = (
    "orcamento",
    "revisao",
    "compat",
    "elaboracao",
    "inspecao",
    "pericia",
    "avaliacao",
    "sst",
)

OFFERS = {
    "orcamento": "/quantitativos-orcamento-obras/",
    "revisao": "/revisao-tecnica-projetos-engenharia/",
    "compat": "/compatibilizacao-projetos-engenharia/",
    "elaboracao": "/projetos-complementares-engenharia/",
    "inspecao": "/inspecao-diagnostico-edificacoes/",
    "pericia": "/assistencia-tecnica-pericial-engenharia/",
    "avaliacao": "/servicos/#servico-avaliacao",
    "sst": "/seguranca-trabalho-apoio-tecnico/",
}

OWNED_PAGES = (
    "projetos-complementares-engenharia/index.html",
    "conteudos/como-contratar-projetos-complementares/index.html",
    "inspecao-diagnostico-edificacoes/index.html",
    "assistencia-tecnica-pericial-engenharia/index.html",
    "seguranca-trabalho-apoio-tecnico/index.html",
)

FIVE = (
    "situacao-atendida",
    "entrega",
    "amostra-disponivel",
    "limites-materiais",
    "pedido-proposta",
)

INTERNAL = (
    "núcleo interno",
    "nucleos internos",
    "execute_now",
    "hard_at_release",
    "aprovado pelo fundador",
    "aprovação pelo fundador",
    "resolved_in_r01",
    "quando esta página estiver publicada",
    "FOUNDER_AUTHORIZED",
    "SELECT do demonstrativo",
)

FORBIDDEN_CONTACT = (
    "preço mínimo",
    "preco minimo",
    "agendamento obrigatório",
    "upload completo",
    "cotação automática",
    "cotacao automatica",
)


def _fail(message: str) -> None:
    raise AssertionError(message)


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def _main(html: str) -> str:
    match = re.search(r"<main\b[^>]*>([\s\S]*?)</main>", html, flags=re.I)
    return match.group(1) if match else html


def _visible(html: str) -> str:
    text = re.sub(r"<script\b[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style\b[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text)


def test_audit_shipped_hubs() -> None:
    failures = audit_hubs(ROOT)
    if failures:
        _fail("shipped hubs:\n" + "\n".join(failures))


def test_eight_offers_from_servicos_and_conteudos() -> None:
    servicos = hub_html("/servicos/", ROOT)
    conteudos = hub_html("/conteudos/", ROOT)
    for name, href in OFFERS.items():
        assert any(href.rstrip("/") in found or found == href for found in extract_hrefs(servicos)), (
            f"servicos missing {name} {href}"
        )
        assert any(href.rstrip("/") in found or found == href for found in extract_hrefs(conteudos)), (
            f"conteudos missing {name} {href}"
        )
    lower = servicos.lower()
    for term in ("orçamento", "revis", "compatibiliz", "elabor", "inspecion", "perícia", "avalia", "segurança do trabalho"):
        assert term in lower, term
    assert "núcleos" not in lower
    assert "verticais" not in lower
    assert re.search(r'\bid=["\']servico-avaliacao["\']', servicos)
    assert re.search(r'\bid=["\']servico-sst["\']', servicos)


def test_journeys_at_most_two_useful_hops() -> None:
    rows = {row["id"]: row for row in journey_table(ROOT)}
    required = {
        "servico-revisao",
        "servico-compat",
        "servico-elaboracao",
        "servico-inspecao",
        "servico-pericia",
        "servico-sst",
        "servico-avaliacao",
        "private-orcamento",
        "conteudo-revisao",
        "conteudo-compat",
        "conteudo-elaboracao",
        "conteudo-inspecao",
        "conteudo-pericia",
        "conteudo-sst",
        "conteudo-avaliacao",
        "conteudo-orcamento",
        "casos-demonstrativo-privado",
    }
    missing = required - set(rows)
    if missing:
        _fail(f"missing journeys {sorted(missing)}")
    bad = [row for row in rows.values() if row["id"] in required and not row["ok"]]
    if bad:
        _fail("reachability:\n" + str(bad))
    for key in required:
        hops = rows[key]["hops"]
        assert hops is not None and hops <= 2, (key, hops)


def test_casos_uses_current_demonstrative_not_retired_url() -> None:
    html = hub_html("/casos/", ROOT)
    composed = compose_links(ROOT)
    privada = next(link for link in composed if link.spec["id"] == "casos-prova-privada")
    assert privada.present and privada.included
    assert privada.href == "/casos/demonstrativo-projeto-privado/"
    assert "/casos/demonstrativo-projeto-privado/" in html
    assert "/casos/prova-tecnica-obra-privada/" not in html
    assert "em breve" not in html.lower()
    assert not re.search(r"categoria vazia", html, flags=re.I)


def test_owned_pages_five_answers_and_distinctions() -> None:
    for rel in OWNED_PAGES:
        html = _read(rel)
        main = _main(html)
        for answer_id in FIVE:
            assert re.search(rf'\bid=["\']{answer_id}["\']', main), f"{rel} missing {answer_id}"
        lower = html.lower()
        for term in INTERNAL:
            assert term.lower() not in lower, f"{rel} leaked {term}"
        assert "wa.me/5548988344559" in html or "whatsapp" in lower
        assert "mailto:tiago.sasaki@confenge.com.br" in html
        for phrase in FORBIDDEN_CONTACT:
            assert phrase not in lower, f"{rel} {phrase}"
        assert not re.search(r'type=["\']file["\']', html, flags=re.I)
        assert not re.search(r"cnpj[^.]{0,40}obrigat", lower)
        assert "—" not in html and "–" not in html

    assist = _visible(_main(_read("assistencia-tecnica-pericial-engenharia/index.html"))).lower()
    assert "assistência da parte" in assist
    assert "perícia do juízo" in assist
    assert "inspeção" in assist
    assert "não é perícia do juízo" in assist or "não vende essa nomeação" in assist or "não oferece essa nomeação" in assist

    insp = _visible(_main(_read("inspecao-diagnostico-edificacoes/index.html"))).lower()
    assert "inspeção" in insp
    assert "perícia" in insp
    assert "não é perícia" in insp or "não misturamos inspeção privada com laudo judicial" in insp

    sst = _visible(_main(_read("seguranca-trabalho-apoio-tecnico/index.html"))).lower()
    assert "ato médico" in sst
    assert "não inclui ato médico" in sst or "não oferece exame médico ocupacional" in sst
    assert "pgr" in sst and "ltcat" in sst
    assert "pacote automático" in sst or "não saem como pacote" in sst

    elab = _visible(_main(_read("projetos-complementares-engenharia/index.html"))).lower()
    assert "elaboração" in elab
    assert "revisão" in elab
    assert "/casos/demonstrativo-projeto-privado/" in _read("projetos-complementares-engenharia/index.html")


def test_js_off_required_hrefs_remain_in_static_html() -> None:
    matrix = load_matrix()
    for spec in matrix["links"]:
        if spec.get("kind") != "REQUIRED_LINK":
            continue
        html = hub_html(spec["hub"], ROOT)
        href = spec["href"]
        pattern = rf'<a\b[^>]*href=["\']{re.escape(href)}'
        alt = rf'<a\b[^>]*href=["\']{re.escape(href.rstrip("/"))}'
        assert re.search(pattern, html) or re.search(alt, html), spec["id"]
        assert f'data-hub-link="{spec["marker"]}"' in html, spec["id"]


def test_avaliacao_stays_on_hub_path() -> None:
    servicos = hub_html("/servicos/", ROOT)
    assert 'id="servico-avaliacao"' in servicos
    assert "Avaliação de imóvel" in servicos
    assert "Pessoa física não precisa informar CNPJ" in servicos
    assert not (ROOT / "avaliacao-imoveis/index.html").is_file()
    assert not (ROOT / "avaliacao-imobiliaria/index.html").is_file()


def test_heading_order_and_skip_link() -> None:
    for rel in (
        "servicos/index.html",
        "conteudos/index.html",
        "casos/index.html",
        "ferramentas/index.html",
        *OWNED_PAGES,
    ):
        html = _read(rel)
        assert 'class="skip-link"' in html or "skip-link" in html, rel
        assert re.search(r"<h1\b", html), rel
        first_h = re.search(r"<h([1-6])\b", _main(html) or html)
        assert first_h and first_h.group(1) == "1", rel


def test_overlay_delete_does_not_affect_unrelated_composition_import() -> None:
    # Guard: composition Overlay is the real mutation seam used by counterexamples.
    overlay = Overlay().without_file("revisao-tecnica-projetos-engenharia/index.html")
    failures = audit_hubs(ROOT, overlay=overlay)
    joined = "\n".join(failures)
    assert failures
    assert "revisao" in joined.lower() or "/revisao-tecnica-projetos-engenharia/" in joined


def main() -> int:
    tests = [
        test_audit_shipped_hubs,
        test_eight_offers_from_servicos_and_conteudos,
        test_journeys_at_most_two_useful_hops,
        test_casos_uses_current_demonstrative_not_retired_url,
        test_owned_pages_five_answers_and_distinctions,
        test_js_off_required_hrefs_remain_in_static_html,
        test_avaliacao_stays_on_hub_path,
        test_heading_order_and_skip_link,
        test_overlay_delete_does_not_affect_unrelated_composition_import,
    ]
    failed = 0
    for fn in tests:
        try:
            fn()
            print("PASS", fn.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", fn.__name__, exc)
    if failed:
        print(f"{failed} failed")
        return 1
    print(f"{len(tests)} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
