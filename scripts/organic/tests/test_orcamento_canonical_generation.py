"""Regenerating an article must not reintroduce attribution URL variants."""

from html.parser import HTMLParser
from pathlib import Path
import re
import sys

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.apply_orcamento_cluster_rewrite import HANDLERS
from scripts.organic.canonical_hrefs import parameterized_internal_hrefs


CASES = [
    (
        "administracao-local-orcamento-obra-publica",
        "edital",
        "Administração local no orçamento: direto, BDI ou planilha?",
    ),
    (
        "bdi-diferenciado-obra-publica",
        "edital",
        "BDI diferenciado em materiais e equipamentos",
    ),
    (
        "comprovacao-exequibilidade-proposta-obra",
        "edital",
        "Exequibilidade da proposta: o que comprovar",
    ),
    (
        "data-base-orcamento-reajuste-obra-publica",
        "edital",
        "Data-base e reajuste: meses sem cobertura",
    ),
    (
        "matriz-de-riscos-reequilibrio-economico-financeiro",
        "contrato",
        "Matriz de riscos pode impedir o reequilíbrio econômico-financeiro?",
    ),
    (
        "mobilizacao-desmobilizacao-orcamento-obra",
        "edital",
        "Mobilização e desmobilização na planilha",
    ),
    (
        "sinapi-ou-sicro-obra-publica",
        "edital",
        "SINAPI ou SICRO: a referência de cada serviço",
    ),
]


class Anchors(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.items.append(dict(attrs))


def contact_link(document):
    section = re.search(
        r'<section\b(?=[^>]*\bid="diagnostico-confenge")[^>]*>.*?</section>',
        document,
        re.S,
    )
    assert section, "missing article contact section"
    parser = Anchors()
    parser.feed(section.group())
    links = [a for a in parser.items if a.get("data-cta-position") == "form"]
    assert len(links) == 1, "article needs one unambiguous contact-form destination"
    return links[0]


@pytest.mark.parametrize("slug,journey,topic", CASES, ids=[row[0] for row in CASES])
def test_regenerated_contact_keeps_canonical_url_and_public_context(slug, journey, topic):
    source = (ROOT / "conteudos" / slug / "index.html").read_text(encoding="utf-8")
    generated = HANDLERS[slug](source)

    # Run the real page generator, not a parallel implementation of its helper.
    # The old helper regressed every case from zero variants to one query URL.
    assert parameterized_internal_hrefs(generated) == []
    link = contact_link(generated)
    assert link["href"] == "/#contato"
    assert link["data-journey"] == journey
    assert link["data-tema"] == topic
    assert link["data-origem"] == f"/conteudos/{slug}/"

    # A subsequent regeneration must preserve the same destination and context.
    repeated = HANDLERS[slug](generated)
    assert parameterized_internal_hrefs(repeated) == []
    assert contact_link(repeated) == link
