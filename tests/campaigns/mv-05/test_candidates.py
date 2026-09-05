#!/usr/bin/env python3
"""Self-contained promotion checks for the MV-05 isolated candidates."""

from __future__ import annotations

import html
import json
import re
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[3]
CAMPAIGN = ROOT / "docs/integration/campaign-20260905/05"
CANDIDATES = CAMPAIGN / "public-candidates"
SLUGS = (
    "engenharia-projetos-obras",
    "compatibilizacao-revisao-projetos",
    "quantitativos-orcamento-obras",
    "inspecao-documentacao-edificacoes",
)
CTA_LABELS = {
    "engenharia-projetos-obras": "Enquadrar uma demanda de projeto ou obra",
    "compatibilizacao-revisao-projetos": "Solicitar escopo para compatibilização",
    "quantitativos-orcamento-obras": "Enquadrar quantitativos ou orçamento",
    "inspecao-documentacao-edificacoes": "Solicitar análise de inspeção ou documentação",
}
QUERY_ALLOWLIST = {
    "nucleus_id",
    "offer_candidate_id",
    "asset_id",
    "route_family",
    "cta_id",
    "desired_decision",
}
INTERNAL_JARGON = re.compile(
    r"\b(?:ICP|lead|CTA|handoff|pipeline|QCO|TOFU|MOFU|BOFU|SKU|fail-closed|rollback)\b",
    re.IGNORECASE,
)


class CandidateParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: list[tuple[str, dict[str, str]]] = []
        self.text: list[str] = []
        self._ignored_depth = 0
        self.json_ld: list[str] = []
        self._json_depth = 0
        self._json_buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key: value or "" for key, value in attrs}
        self.tags.append((tag, attr_map))
        if tag in {"style", "noscript"}:
            self._ignored_depth += 1
        if tag == "script":
            if attr_map.get("type") == "application/ld+json":
                self._json_depth += 1
            else:
                self._ignored_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._json_depth:
            self._json_depth -= 1
            self.json_ld.append("".join(self._json_buffer).strip())
            self._json_buffer = []
        elif tag in {"script", "style", "noscript"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._json_depth:
            self._json_buffer.append(data)
        elif not self._ignored_depth:
            value = " ".join(data.split())
            if value:
                self.text.append(value)


def parse_candidate(slug: str) -> tuple[str, CandidateParser, str]:
    source = (CANDIDATES / slug / "index.html").read_text(encoding="utf-8")
    parser = CandidateParser()
    parser.feed(source)
    visible = html.unescape(" ".join(parser.text))
    return source, parser, visible


class CandidateContractTest(unittest.TestCase):
    def test_exact_candidate_set(self) -> None:
        actual = sorted(path.parent.name for path in CANDIDATES.glob("*/index.html"))
        self.assertEqual(actual, sorted(SLUGS))

    def test_shared_assets_are_local(self) -> None:
        self.assertTrue((CANDIDATES / "assets/candidate.css").is_file())
        for slug in SLUGS:
            source, parser, _ = parse_candidate(slug)
            self.assertIn("../assets/candidate.css", source, slug)
            for tag, attrs in parser.tags:
                if tag in {"img", "script", "source"}:
                    value = attrs.get("src") or attrs.get("srcset") or ""
                    self.assertNotRegex(value, r"^https?://", f"external asset in {slug}")

    def test_intended_metadata_is_route_exact(self) -> None:
        for slug in SLUGS:
            _, parser, _ = parse_candidate(slug)
            canonicals = [
                attrs.get("href")
                for tag, attrs in parser.tags
                if tag == "link" and attrs.get("rel") == "canonical"
            ]
            self.assertEqual(canonicals, [f"https://confenge.com.br/{slug}/"], slug)
            robots = [
                attrs.get("content", "").lower()
                for tag, attrs in parser.tags
                if tag == "meta" and attrs.get("name") == "robots"
            ]
            self.assertEqual(robots, ["index,follow"], slug)
            self.assertEqual(sum(tag == "h1" for tag, _ in parser.tags), 1, slug)
            self.assertTrue(any("data-integration-only" in attrs for _, attrs in parser.tags), slug)
            self.assertTrue(parser.json_ld, slug)
            for block in parser.json_ld:
                json.loads(block)

    def test_public_language_and_proof_boundaries(self) -> None:
        for slug in SLUGS:
            _, _, visible = parse_candidate(slug)
            self.assertIsNone(INTERNAL_JARGON.search(visible), slug)
            self.assertNotIn("SmartLic", visible, slug)
            self.assertNotRegex(
                visible.lower(),
                r"(?:a confenge (?:é|atua como|se apresenta como)|somos) (?:um )?escritório de arquitetura",
                slug,
            )
            self.assertNotRegex(visible, r"R\$\s*\d", slug)
            self.assertNotRegex(visible, r"\bCREA(?:-SC)?\b|\bRNP\b", slug)
            self.assertRegex(visible.upper(), r"EXEMPLO SINT[EÉ]TICO", slug)
            self.assertIn("escopo", visible.lower(), slug)
            self.assertIn("proposta", visible.lower(), slug)
            self.assertNotIn("loteamento", visible.lower(), slug)

    def test_job_specific_triage_actions_use_closed_non_pii_context(self) -> None:
        pii_keys = {"nome", "email", "telefone", "cpf", "cnpj", "mensagem", "endereco"}
        for slug in SLUGS:
            _, parser, visible = parse_candidate(slug)
            self.assertIn(CTA_LABELS[slug], visible, slug)
            links = [
                attrs.get("href", "")
                for tag, attrs in parser.tags
                if tag == "a" and attrs.get("href", "").startswith("/triagem-tecnica/")
            ]
            self.assertTrue(links, slug)
            for href in links:
                parsed = urlparse(href)
                params = parse_qs(parsed.query, keep_blank_values=True)
                self.assertTrue(params, f"missing closed context in {slug}")
                self.assertFalse(set(params) - QUERY_ALLOWLIST, f"unexpected query field in {slug}")
                self.assertFalse(set(params) & pii_keys, f"PII query key in {slug}")
                self.assertEqual(params.get("nucleus_id"), ["building_engineering_documentation"])

    def test_remote_and_field_boundary_is_visible(self) -> None:
        for slug in SLUGS:
            _, _, visible = parse_candidate(slug)
            normalized = visible.lower()
            self.assertIn("atendimento comercial nacional", normalized, slug)
            self.assertRegex(normalized, r"remot|documental", slug)
            self.assertRegex(normalized, r"campo|vistoria|presencial", slug)
            self.assertRegex(normalized, r"atribuiç|responsabilidade técnica|formalidade", slug)


class PromotionFragmentTest(unittest.TestCase):
    def test_route_sets_match(self) -> None:
        family = json.loads((CAMPAIGN / "promotion/public-family-registry.fragment.json").read_text())
        capture = json.loads((CAMPAIGN / "promotion/capture.fragment.json").read_text())
        family_routes = {
            route
            for item in family["families"]
            for route in item["match"]["routes"]
        }
        capture_routes = {item["route"] for item in capture["route_contexts"]}
        expected = {f"/{slug}/" for slug in SLUGS}
        self.assertEqual(family_routes, expected)
        self.assertEqual(capture_routes, expected)
        self.assertTrue(all(item["terminal_action"] == "capture_form" for item in family["families"]))
        self.assertEqual(capture["source"], "CONFENGE_WEB")

    def test_sitemap_fragment_is_route_exact(self) -> None:
        tree = ElementTree.parse(CAMPAIGN / "promotion/sitemap.fragment.xml")
        namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locations = {node.text for node in tree.findall("s:url/s:loc", namespace)}
        expected = {f"https://confenge.com.br/{slug}/" for slug in SLUGS}
        self.assertEqual(locations, expected)

    def test_required_screenshots_have_exact_dimensions(self) -> None:
        screenshot_dir = CAMPAIGN / "screenshots"
        for slug in SLUGS:
            for width, height in ((390, 844), (1366, 768)):
                image_path = screenshot_dir / f"{slug}-{width}x{height}.png"
                data = image_path.read_bytes()
                self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n", image_path.name)
                actual_width, actual_height = struct.unpack(">II", data[16:24])
                self.assertEqual((actual_width, actual_height), (width, height), image_path.name)


if __name__ == "__main__":
    unittest.main()
