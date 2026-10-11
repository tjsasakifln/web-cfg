from html.parser import HTMLParser
import copy
import html
import importlib.util
import json
import re
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[2]
ROUTES = (
    "projetos-complementares-engenharia",
    "revisao-tecnica-projetos-engenharia",
    "compatibilizacao-projetos-engenharia",
    "quantitativos-orcamento-obras",
    "inspecao-diagnostico-edificacoes",
    "assistencia-tecnica-pericial-engenharia",
)


def cta_href(document: str, cta_id: str) -> str:
    tag = re.search(
        rf'<a\b(?=[^>]*\bdata-cta-id="{re.escape(cta_id)}")[^>]*>',
        document,
    )
    if not tag:
        raise AssertionError(f"CTA not found: {cta_id}")
    href = re.search(r'\bhref="([^"]+)"', tag.group(0))
    if not href:
        raise AssertionError(f"CTA without href: {cta_id}")
    return html.unescape(href.group(1))


def cta_attributes(document: str, cta_id: str) -> dict[str, str]:
    tag = re.search(
        rf'<a\b(?=[^>]*\bdata-cta-id="{re.escape(cta_id)}")[^>]*>',
        document,
    )
    if not tag:
        raise AssertionError(f"CTA not found: {cta_id}")
    return {
        name: html.unescape(value)
        for name, value in re.findall(r'([\w-]+)="([^"]*)"', tag.group(0))
    }


class PageFacts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.h1_count = 0
        self.figures = 0
        self.proposal_links = 0

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "h1":
            self.h1_count += 1
        elif tag == "figure":
            self.figures += 1
        elif tag == "a" and (
            str(attributes.get("href", "")).startswith("#contato-")
            or attributes.get("data-value-first-cta") == "true"
        ):
            self.proposal_links += 1


class InstitutionalServicePagesTest(unittest.TestCase):
    def test_pages_replace_the_legacy_template_with_service_specific_content(self):
        forbidden = (
            "Em 30 segundos",
            'aria-label="Nesta página"',
            ">Prova antes do método<",
            ">Exemplo conferível<",
            ">Quem assina<",
            "Arquitetura pronta, faltam",
            "sem formulário",
            "sem anexo",
            "não recebe arquivo",
            "não recebe planta",
            "não envie o processo",
            "primeiro contato é em texto",
            "Identidade, método e limites",
            "Quem responde e como conferir",
            'id="metodo-',
            'id="limites-materiais"',
            'class="page-index"',
        )

        for route in ROUTES:
            with self.subTest(route=route):
                html = (ROOT / route / "index.html").read_text(encoding="utf-8")
                parser = PageFacts()
                parser.feed(html)

                self.assertEqual(parser.h1_count, 1)
                self.assertGreaterEqual(parser.figures, 1)
                self.assertGreaterEqual(parser.proposal_links, 1)
                self.assertIn("Solicit", html)
                self.assertIn('id="competencias"', html)
                self.assertTrue(
                    'id="entregas-servico"' in html or 'id="entregaveis"' in html
                )
                self.assertIn('id="proposta-tecnica"', html)
                self.assertIn("Referências não sigilosas", html)
                for phrase in forbidden:
                    self.assertNotIn(phrase, html)

    def test_each_route_names_its_real_competence_and_deliverable(self):
        expected = {
            "projetos-complementares-engenharia": (
                "Estruturas",
                "Instalações",
                "Desenhos técnicos",
                "Memórias e especificações",
            ),
            "revisao-tecnica-projetos-engenharia": (
                "Revisão documental",
                "Mapa de achados",
                "Implicação técnica",
                "Interlocução",
            ),
            "compatibilizacao-projetos-engenharia": (
                "Matriz de interfaces",
                "Registro de apontamentos",
                "Controle de versões",
                "Gestão de decisões",
            ),
            "quantitativos-orcamento-obras": (
                "Banco de quantitativos",
                "Memória de medição",
                "Planilha orçamentária",
                "Equalização",
            ),
            "inspecao-diagnostico-edificacoes": (
                "Registro de condição",
                "Análise técnica",
                "Plano de aprofundamento",
                "Encaminhamento",
            ),
            "assistencia-tecnica-pericial-engenharia": (
                "Triagem pré-litígio",
                "Matriz de evidências",
                "Quesitos e pontos controvertidos",
                "Manifestação ou parecer",
            ),
        }
        for route, phrases in expected.items():
            with self.subTest(route=route):
                html = (ROOT / route / "index.html").read_text(encoding="utf-8")
                for phrase in phrases:
                    self.assertIn(phrase, html)

    def test_service_pages_offer_a_direct_contextual_form_without_removing_channels(self):
        source = ROOT / "data" / "services" / "institutional-service-pages.v1.json"
        data = json.loads(source.read_text(encoding="utf-8"))
        route_families = {
            "projetos-complementares-engenharia": "complementary-engineering-elaboration",
            "revisao-tecnica-projetos-engenharia": "private-engineering-project-review",
            "compatibilizacao-projetos-engenharia": "engineering-projects-coordination-clash",
            "quantitativos-orcamento-obras": "private-engineering-quantities-budget",
            "inspecao-diagnostico-edificacoes": "inspecao-diagnostico-edificacoes",
            "assistencia-tecnica-pericial-engenharia": "assistencia-tecnica-pericial-engenharia",
        }
        for page in data["pages"]:
            route = page["route"]
            document = (ROOT / route / "index.html").read_text(encoding="utf-8")
            with self.subTest(route=route):
                for suffix in ("hero-calm", "contact-calm"):
                    cta_id = f"{route}-{suffix}"
                    attrs = cta_attributes(document, cta_id)
                    self.assertEqual(cta_href(document, cta_id), "/#contato")
                    self.assertNotIn("?", attrs["href"])
                    self.assertEqual(attrs["data-journey"], page["journey"])
                    self.assertEqual(attrs["data-tema"], page["hero"]["title"])
                    self.assertEqual(attrs["data-origem"], f"/{route}/")
                    self.assertEqual(attrs["data-origin-url"], f"/{route}/")
                    self.assertEqual(attrs["data-route-family"], route_families[route])
                    self.assertTrue(attrs["data-asset-id"])
                self.assertIn('href="https://wa.me/', document)
                self.assertIn('href="mailto:', document)
                self.assertIn('href="tel:', document)
                self.assertIn('href="/triagem-tecnica/">Solicitar proposta', document)

    def test_routes_use_different_information_orders(self):
        observed = set()
        for route in ROUTES:
            html = (ROOT / route / "index.html").read_text(encoding="utf-8")
            positions = {
                key: html.index(marker)
                for key, marker in {
                    "competence": 'id="competencias"',
                    "delivery": (
                        'id="entregaveis"'
                        if route == "projetos-complementares-engenharia"
                        else 'id="entregas-servico"'
                    ),
                    "proposal": 'id="proposta-tecnica"',
                }.items()
            }
            technical_markers = (
                'id="amostra-disponivel"',
                'id="extrato-demonstrativo"',
                'id="registro-interferencias"',
                'id="banco-disciplinas"',
            )
            positions["technical"] = min(
                html.index(marker) for marker in technical_markers if marker in html
            )
            observed.add(tuple(key for key, _ in sorted(positions.items(), key=lambda item: item[1])))
        self.assertGreaterEqual(len(observed), 4)

    def test_quantity_page_keeps_auditable_measurement_and_adds_discipline_bank(self):
        html = (ROOT / "quantitativos-orcamento-obras" / "index.html").read_text(
            encoding="utf-8"
        )

        required = (
            "/assets/quantitativos-orcamento-obras/banco-disciplinas.svg",
            "concreto em m³",
            "fôrma em m²",
            "armadura em kg",
            "Origem",
            "Revisão",
            "Critério",
            "Unidade",
            "data-sample-trail-state=\"canonical\"",
            "19,60",
        )
        for item in required:
            self.assertIn(item, html)

        asset = ROOT / "assets" / "quantitativos-orcamento-obras" / "banco-disciplinas.svg"
        self.assertTrue(asset.is_file())
        svg = asset.read_text(encoding="utf-8")
        for item in (
            "m³",
            "m²",
            "kg",
            "E-STR-R02",
            "b × h × H",
            "Σ faces medidas × H",
            "Σ(n × comp. × kg/m)",
            "smallinv",
        ):
            self.assertIn(item, svg)

    def test_renderer_and_source_are_stable(self):
        source = ROOT / "data" / "services" / "institutional-service-pages.v1.json"
        data = json.loads(source.read_text(encoding="utf-8"))
        self.assertEqual({page["route"] for page in data["pages"]}, set(ROUTES))
        result = subprocess.run(
            [sys.executable, "-X", "utf8", "scripts/site/render_institutional_service_pages.py"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_renderer_cannot_drop_the_canonical_quantity_examples(self):
        spec = importlib.util.spec_from_file_location(
            "institutional_service_renderer",
            ROOT / "scripts/site/render_institutional_service_pages.py",
        )
        renderer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(renderer)
        data = json.loads(renderer.SOURCE.read_text(encoding="utf-8"))
        page = next(item for item in data["pages"] if item["route"] == "quantitativos-orcamento-obras")
        document = (ROOT / page["route"] / "index.html").read_text(encoding="utf-8")
        self.assertEqual(renderer.render_page(page, document), document)
        changed = copy.deepcopy(page)
        changed["preserve_sections"].remove("exemplos-conferiveis")
        with self.assertRaisesRegex(ValueError, "canonical quantity examples must be preserved"):
            renderer.render_page(changed, document)
        missing_section = re.sub(
            r'<section\b(?=[^>]*\bid="exemplos-conferiveis")[^>]*>[\s\S]*?</section>',
            "",
            document,
        )
        self.assertNotEqual(missing_section, document)
        with self.assertRaisesRegex(ValueError, "section not found: exemplos-conferiveis"):
            renderer.render_page(page, missing_section)


if __name__ == "__main__":
    unittest.main()
