from html.parser import HTMLParser
from itertools import product
import json
from pathlib import Path
import re

from scripts.site.catalogo_ferramentas import TOOLS, publish_catalog

ROOT = Path(__file__).resolve().parents[3]

class MainLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_main = False
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "main":
            self.in_main = True
        if self.in_main and tag == "a":
            self.links.append(dict(attrs).get("href"))

    def handle_endtag(self, tag):
        if tag == "main":
            self.in_main = False


def test_release_local_tools_no_dead_or_duplicate_links(tmp_path):
    hub = tmp_path / "ferramentas/index.html"
    hub.parent.mkdir()
    source = (ROOT / "ferramentas/index.html").read_text()
    # Formats already used by the five independent tool PRs.
    extra = [
        '<p>Para conferir uma planta, use o <a href="/ferramentas/conversor-utm-sirgas-2000/">conversor UTM</a>.</p>',
        '<section class="tool-situation" aria-labelledby="sit-beiral"><p>Beiral</p><a href="/ferramentas/calculadora-de-beiral/">Calcular</a></section>',
        '<aside class="tool-method"><h2>Ar</h2><a href="/ferramentas/calculadora-psicrometrica/">Ponto de orvalho</a></aside>',
        '<aside class="tool-method"><h2>Orçamento</h2><a href="/ferramentas/calculadora-bdi/">BDI</a></aside>',
        '<section class="tool-situation" aria-labelledby="sit-cpm"><p>Prazo</p><a href="/ferramentas/caminho-critico-obra/">CPM</a></section>',
        '<aside><h2>Chamada estrutural de origem</h2><p>Abra a <a href="/ferramentas/analise-de-viga-continua/">viga</a>.</p></aside>',
        '<aside class="tool-method"><h2>Planilha</h2><a href="/ferramentas/orcamento-de-obras/">Orçar serviços</a></aside>',
        '<aside class="tool-method"><h2>Rede de água</h2><a href="/ferramentas/rede-de-agua/">Simular</a></aside>',
        '<aside class="tool-method"><h2>Unifilar</h2><a href="/ferramentas/diagrama-unifilar/">Desenhar</a></aside>',
    ]
    source = source.replace("</main>", "\n".join(extra) + "</main>")
    slugs = list(TOOLS)
    for slug in slugs:
        (tmp_path / slug).mkdir(parents=True, exist_ok=True)
    for flags in product([False, True], repeat=len(slugs) - 2):
        active = ["cad", "bim"] + [slug for slug, yes in zip(slugs[2:], flags) if yes]
        for slug in slugs:
            file = tmp_path / slug / "index.html"
            if slug in active:
                file.write_text("<h1>Ferramenta</h1>")
            else:
                file.unlink(missing_ok=True)
        hub.write_text(source)
        publish_catalog(tmp_path)
        rendered = hub.read_text()
        assert "Chamada estrutural de origem" not in rendered
        parser = MainLinks()
        parser.feed(rendered)
        listed = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', rendered, re.S)[1])["mainEntity"]["itemListElement"]
        for slug in slugs:
            url = f"/{slug}/"
            assert parser.links.count(url) == int(slug in active)
            assert sum(x["url"] == "https://confenge.com.br" + url for x in listed) == int(slug in active)
        assert [x["position"] for x in listed] == list(range(1, len(listed) + 1))
        assert '/ferramentas/matriz-atraso-obra/' in parser.links
        publish_catalog(tmp_path)
        assert hub.read_text() == rendered
