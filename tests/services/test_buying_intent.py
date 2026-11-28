import html
import json
from pathlib import Path
import re

from scripts.site.search_metadata import inspect_search_head


ROOT = Path(__file__).resolve().parents[2]


def body_for(route):
    raw = (ROOT / route / "index.html").read_text(encoding="utf-8")
    return raw, raw.split("<main", 1)[1].split("</main>", 1)[0]


def test_mediation_checklist_connects_to_the_existing_dossier_and_form():
    raw, body = body_for("medicoes-glosas-obras-publicas")
    answer = body.index("O que conferir no boletim de medição de uma obra pública?")
    assert answer < body.index('id="exemplo-demonstrativo"') < body.index('id="captura-pilar"')
    assert "o que o fiscal aceitou e o que foi contestado" in body[answer:]
    assert 'href="/casos/medicao-glosa-demonstrativo/"' in body
    assert 'href="#captura-pilar"' in body
    assert 'name="diagnostico-confenge"' in body
    assert 'name="origem" value="medicoes-glosas-obras-publicas"' in raw


def test_buyer_answers_match_visible_faq_and_contextual_contact():
    cases = {
        "quantitativos-orcamento-obras": (
            "#triagem-quantitativos",
            [
                "Qual é a diferença entre orçamento sintético e analítico?",
                "Uma estimativa por metro quadrado substitui o orçamento detalhado?",
            ],
        ),
        "assistencia-tecnica-pericial-engenharia": (
            "#contato-assistencia",
            [
                "Qual é a diferença entre perito do juízo e assistente técnico?",
                "O laudo já foi juntado. Ainda posso solicitar um parecer técnico?",
            ],
        ),
    }
    for route, (anchor, questions) in cases.items():
        raw, body = body_for(route)
        faq_section = body.split('id="duvidas-contratacao"', 1)[1].split("</section>", 1)[0]
        links = re.findall(r"<a\b[^>]*>", body)
        assert any(
            f'data-cta-id="{route}-hero-proposal"' in a and f'href="{anchor}"' in a
            for a in links
        )
        assert body.count(f'id="{anchor[1:]}"') == 1
        head = inspect_search_head(raw, f"/{route}/")
        assert head["canonical"] == f"https://confenge.com.br/{route}/"
        assert not head["noindex"]
        assert not head["problems"]
        structured = json.loads(
            re.search(r'<script type="application/ld\+json">(.+?)</script>', raw, re.S)[1]
        )
        faq = next(node for node in structured["@graph"] if node["@type"] == "FAQPage")
        visible = dict(
            (html.unescape(q), html.unescape(a))
            for q, a in re.findall(r"<summary>([^<]+)</summary><p>([^<]+)</p>", faq_section)
        )
        assert visible == {
            node["name"]: node["acceptedAnswer"]["text"] for node in faq["mainEntity"]
        }
        assert set(questions) <= visible.keys()
        assert faq_section in body[: body.index(f'id="{anchor[1:]}"')]


def test_budget_routes_price_reference_and_contract_regime_to_different_guides():
    _, body = body_for("quantitativos-orcamento-obras")
    section = body.split('id="guias-relacionados"', 1)[1].split("</section>", 1)[0]
    for guide in (
        "sinapi-desonerado-nao-desonerado",
        "empreitada-preco-global-preco-unitario",
    ):
        assert f'href="/conteudos/{guide}/"' in section
        assert (ROOT / "conteudos" / guide / "index.html").is_file()
