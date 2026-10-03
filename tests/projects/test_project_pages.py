from __future__ import annotations

import importlib.util
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/projects/project-pages.v1.json"
RENDERER = ROOT / "scripts/site/render_project_pages.py"


def load_renderer():
    spec = importlib.util.spec_from_file_location("render_project_pages", RENDERER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ProjectHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.links: list[dict[str, str | None]] = []
        self.images: list[dict[str, str | None]] = []
        self.h1 = 0
        self.main = 0
        self.jsonld: list[str] = []
        self._jsonld = False
        self._jsonld_buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.add(attributes["id"])
        if tag == "a":
            self.links.append(attributes)
        elif tag == "img":
            self.images.append(attributes)
        elif tag == "h1":
            self.h1 += 1
        elif tag == "main":
            self.main += 1
        elif tag == "script" and attributes.get("type") == "application/ld+json":
            self._jsonld = True
            self._jsonld_buffer = []

    def handle_data(self, data: str) -> None:
        if self._jsonld:
            self._jsonld_buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._jsonld:
            self.jsonld.append("".join(self._jsonld_buffer))
            self._jsonld = False


class TestProjectPages(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.payload = json.loads(DATA.read_text(encoding="utf-8"))
        cls.pages = cls.payload["pages"]
        cls.renderer = load_renderer()
        cls.rendered = cls.renderer.render_pages()

    def test_contract_has_expected_unique_routes(self) -> None:
        routes = [page["route"] for page in self.pages]
        self.assertEqual(13, len(routes))
        self.assertEqual(len(routes), len(set(routes)))
        self.assertIn("/projetos/", routes)
        self.assertIn("/projetos/estruturas/", routes)
        self.assertIn("/projetos/instalacoes/", routes)
        self.assertIn("/projetos/infraestrutura/", routes)
        self.assertIn("/projetos/coordenacao-multidisciplinar/", routes)

    def test_renderer_is_deterministic_and_sources_are_current(self) -> None:
        self.assertEqual(self.rendered, self.renderer.render_pages())
        for route, source in self.rendered.items():
            path = ROOT / route.strip("/") / "index.html"
            self.assertTrue(path.is_file(), route)
            self.assertEqual(source, path.read_text(encoding="utf-8"), route)

    def test_semantics_capture_and_schema(self) -> None:
        for page in self.pages:
            with self.subTest(route=page["route"]):
                source = self.rendered[page["route"]]
                parser = ProjectHTMLParser()
                parser.feed(source)
                self.assertEqual(1, parser.main)
                self.assertEqual(1, parser.h1)
                self.assertIn("contato-projetos", parser.ids)
                self.assertIn("conteudo", parser.ids)
                self.assertTrue(all(image.get("alt") for image in parser.images))
                contact_links = [
                    link for link in parser.links
                    if link.get("href") == "/triagem-tecnica/"
                ]
                self.assertTrue(contact_links, "missing triage CTA")
                project_ctas = [
                    link for link in parser.links
                    if link.get("data-event-name") == "project_cta_click"
                ]
                self.assertEqual(4, len(project_ctas))
                self.assertTrue(all(link.get("data-cta-id") for link in project_ctas))
                self.assertTrue(all(link.get("data-cta-position") for link in project_ctas))
                self.assertIn('<summary aria-label="Menu">', source)
                self.assertLess(
                    source.index('<div class="pp-actions">'),
                    source.index('<p class="pp-summary">'),
                    "primary project CTA must precede supporting summary copy",
                )
                active_header = [
                    link for link in parser.links
                    if link.get("aria-current") == "page"
                    and link.get("href") in {
                        "/projetos/", "/servicos/", "/servicos-obras-publicas/",
                        "/como-trabalhamos/", "/empresa/",
                    }
                ]
                self.assertGreaterEqual(len(active_header), 2)
                whatsapp = [
                    link for link in parser.links
                    if str(link.get("href", "")).startswith("https://wa.me/")
                ]
                self.assertEqual(1, len(whatsapp))
                self.assertEqual("whatsapp_click", whatsapp[0].get("data-event-name"))
                self.assertEqual("projetos", whatsapp[0].get("data-journey"))
                self.assertEqual(page["id"], whatsapp[0].get("data-route-family"))
                self.assertEqual(1, len(parser.jsonld))
                graph = json.loads(parser.jsonld[0])["@graph"]
                types = {item["@type"] for item in graph}
                self.assertIn("WebPage", types)
                self.assertIn("BreadcrumbList", types)
                webpage = next(item for item in graph if item["@type"] == "WebPage")
                self.assertEqual(
                    page.get("published_at", self.payload["published_at"]),
                    webpage["datePublished"],
                )
                self.assertEqual(
                    page.get("modified_at", self.payload["modified_at"]),
                    webpage["dateModified"],
                )
                self.assertIn(
                    f'datetime="{page.get("modified_at", self.payload["modified_at"])}"',
                    source,
                )
                self.assertIn('href="/servicos/"', source)
                self.assertIn('href="/servicos-obras-publicas/"', source)
                if page.get("service_type"):
                    self.assertIn("Service", types)

    def test_every_demonstration_is_labeled_and_bounded(self) -> None:
        for page in self.pages:
            demo = page["demonstration"]
            note = demo.get("note", demo.get("limit", ""))
            self.assertGreaterEqual(len(note), 45)
            source = self.rendered[page["route"]]
            self.assertIn("Representação demonstrativa", source)
            self.assertIn("Ilustração técnica", source)
            self.assertNotIn("Limite da demonstração", source)
            self.assertNotIn("não é obra de cliente", source)

    def test_page_composition_follows_purpose_instead_of_one_fixed_sequence(self) -> None:
        orders = {
            tuple(page.get("section_order", self.payload["shared"]["default_section_order"]))
            for page in self.pages
        }
        self.assertGreaterEqual(len(orders), 4)
        company = next(page for page in self.pages if page["id"] == "company")
        process = next(page for page in self.pages if page["id"] == "how-we-work")
        self.assertIn("leadership", company["section_order"])
        self.assertEqual("method", process["section_order"][0])
        self.assertNotIn("responsibility", company["section_order"])
        self.assertNotIn("inputs", process["section_order"])

    def test_proposal_cta_and_institutional_leadership_are_affirmative(self) -> None:
        for page in self.pages:
            with self.subTest(route=page["route"]):
                self.assertEqual("Solicitar proposta", page["cta"])
                source = self.rendered[page["route"]]
                self.assertGreaterEqual(source.count("Solicitar proposta"), 4)
                self.assertNotIn("Solicitar avaliação do escopo", source)
                self.assertNotIn("Método como prova", source)
                self.assertNotIn("Aceite técnico vem depois", source)
        company = self.rendered["/empresa/"]
        self.assertIn("Engenheiro Civil formado pela Escola de Engenharia de São Carlos", company)
        self.assertIn("cada disciplina é desenvolvida e assinada pelo profissional habilitado", company)

    def test_installations_copy_matches_the_diagram(self) -> None:
        page = next(page for page in self.pages if page["id"] == "installations")
        narrative = " ".join(
            [page["demonstration"]["body"], page["demonstration"]["caption"]]
        ).lower()
        self.assertNotIn("matriz", narrative)
        asset = (ROOT / page["demonstration"]["src"].lstrip("/")).read_text(
            encoding="utf-8"
        ).lower()
        for label in ("água", "ar", "energia", "dados", "reserva estrutural"):
            self.assertIn(label, asset)

    def test_assets_exist_and_are_local_svg(self) -> None:
        for page in self.pages:
            for asset in (page["visual"]["src"], page["demonstration"]["src"]):
                self.assertTrue(asset.startswith("/assets/project-practices/"), asset)
                self.assertTrue(asset.endswith(".svg"), asset)
                self.assertTrue((ROOT / asset.lstrip("/")).is_file(), asset)

    def test_editorial_depth_and_no_placeholder_language(self) -> None:
        forbidden = re.compile(
            r"\b(lorem ipsum|todo|placeholder|fazemos tudo|referência no mercado|"
            r"soluções sob medida|excelência|equipe fixa de)\b",
            re.IGNORECASE,
        )
        for page in self.pages:
            with self.subTest(route=page["route"]):
                plain = re.sub(r"<[^>]+>", " ", self.rendered[page["route"]])
                self.assertGreater(len(plain.split()), 650)
                self.assertIsNone(forbidden.search(plain))
                self.assertIn("Representação demonstrativa", plain)
                section_order = page.get(
                    "section_order", self.payload["shared"]["default_section_order"]
                )
                if "responsibility" in section_order:
                    self.assertIn("Responsabilidade técnica", plain)

    def test_css_has_mobile_focus_and_reduced_motion_contracts(self) -> None:
        css = (ROOT / "assets/project-practices.css").read_text(encoding="utf-8")
        self.assertIn("@media (max-width: 720px)", css)
        self.assertIn("@media (prefers-reduced-motion: reduce)", css)
        self.assertIn(":focus-visible", css)
        self.assertNotIn("overflow-x: hidden", css)
        self.assertIn("grid-template-columns: 1.3fr repeat(3,minmax(0,.85fr))", css)

    def test_whatsapp_context_is_visitor_language(self) -> None:
        for route in ("/como-trabalhamos/", "/empresa/"):
            source = self.rendered[route]
            self.assertNotIn("escopo%20de%20empresa", source)
            self.assertNotIn("escopo%20de%20como%20trabalhamos", source)
            self.assertIn("solicitar%20uma%20proposta", source)


if __name__ == "__main__":
    unittest.main()
