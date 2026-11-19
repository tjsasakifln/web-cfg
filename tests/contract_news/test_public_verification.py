"""Verify fetched pages against the same DOM and feeds produced in production."""
from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("contract_news_public_verification", ROOT / "deploy/contract-news/verify_public.py")
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)
NOW = datetime(2026, 11, 18, 18, tzinfo=timezone.utc)
BASE = "https://confenge.com.br"
PREFIX = VERIFY.PREFIX
SLUG = "construcao-de-escola-abcdef1234567890"
URL = BASE + PREFIX + SLUG + "/"


def fixture():
    article = {
        "id": "11222333000181-2-000123/2026", "slug": SLUG,
        "title": "Construção de escola tem contrato de R$ 3.250.000,12 registrado no PNCP",
        "description": "Contrato de construção de escola registrado no PNCP, com fornecedor e vigência identificados.",
        "lead": "O PNCP registra contrato do Município de Teste para construção de escola, com valor global de R$ 3.250.000,12.",
        "paragraphs": ["A fornecedora informada no registro é a Construtora de Teste Ltda.", "O objeto abrange construção de escola e instalações prediais."],
        "category": "obras", "published_at": "2026-11-18T16:00:00Z", "modified_at": "2026-11-18T16:00:00Z",
        "facts": {
            "id": "11222333000181-2-000123/2026", "buyer": "Município de Teste", "supplier": "Construtora de Teste Ltda.",
            "supplier_type": "PJ", "object": "Construção de escola e instalações prediais para a rede municipal de ensino.",
            "value": {"amount": "3250000.1234", "kind": "valorGlobal", "currency": "BRL"},
            "source_url": "https://pncp.gov.br/app/contratos/11222333000181/2026/123",
            "source_published_at": "2026-11-18T12:00:00Z", "source_checked_at": "2026-11-18T15:00:00Z",
            "source_updated_at": None, "source_sha256": "a" * 64,
            "signed_at": "2026-11-17", "starts_at": "2026-12-01", "ends_at": "2027-12-01",
            "administrative_location": {"city": "Teste", "state": "SC"},
        },
    }
    return {"schema": "confenge.contract-news-publication/v1", "generated_at": "2026-11-18T16:00:00Z", "articles": [article]}


def rendered(snapshot):
    code = """
import { readFileSync } from 'node:fs';
import { renderArticle, renderIndex, renderSitemap, renderFeed } from './runtime/contract-news/render.mjs';
const snapshot = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify({
 index: renderIndex(snapshot).html,
 article: snapshot.articles.length ? renderArticle(snapshot.articles[0]).html : null,
 archive: renderSitemap(snapshot),
 news: renderSitemap(snapshot, {news:true, now:new Date('2026-11-18T18:00:00Z')}),
 feed: renderFeed(snapshot)
}));
"""
    result = subprocess.run(["node", "--input-type=module", "-e", code], input=json.dumps(snapshot),
                            cwd=ROOT, capture_output=True, text=True, check=True, timeout=20)
    pages = json.loads(result.stdout)
    return {
        BASE + "/robots.txt": ("User-agent: *\nSitemap: " + BASE + PREFIX + "sitemap.xml\n", "text/plain", ""),
        BASE + PREFIX: (pages["index"], "text/html", ""),
        BASE + PREFIX + "sitemap.xml": (pages["archive"], "application/xml", ""),
        BASE + PREFIX + "news-sitemap.xml": (pages["news"], "application/xml", ""),
        BASE + PREFIX + "feed.xml": (pages["feed"], "application/rss+xml", ""),
        URL: (pages["article"], "text/html", ""),
    }


class PublicVerificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.published = rendered(fixture())
        snapshot = fixture()
        snapshot["articles"] = []
        cls.empty = rendered(snapshot)

    def setUp(self):
        self.pages = copy.deepcopy(self.published)

    def verify(self):
        with patch.object(VERIFY, "fetch", side_effect=lambda url: self.pages[url]):
            return VERIFY.verify(BASE, now=NOW)

    def change(self, url, old, new):
        html, kind, robots = self.pages[url]
        self.assertIn(old, html)
        self.pages[url] = (html.replace(old, new), kind, robots)

    def test_accepts_actual_renderer_and_checks_source_dom_dates_feeds(self):
        result = self.verify()
        self.assertEqual(result["status"], "verified")
        self.assertEqual(result["article_urls"], 1)
        self.assertEqual(result["recent_news_urls"], 1)
        self.assertEqual(result["verified_article"]["url"], URL)
        self.assertEqual(result["verified_article"]["published_at"], "2026-11-18T16:00:00Z")

    def test_does_not_accept_jsonld_headline_absent_from_real_heading(self):
        headline = fixture()["articles"][0]["title"]
        self.change(URL, "<h1>" + headline + "</h1>", "<h1>Outro contrato diferente</h1>")
        with self.assertRaisesRegex(VERIFY.VerificationError, "article_headline_not_visible"):
            self.verify()

    def test_does_not_accept_schema_only_article_body(self):
        paragraph = fixture()["articles"][0]["paragraphs"][0]
        self.change(URL, "<p>" + paragraph + "</p>", "")
        with self.assertRaisesRegex(VERIFY.VerificationError, "article_body_not_visible"):
            self.verify()

    def test_visible_publication_time_must_match_structured_timestamp(self):
        self.change(URL, "18 de novembro de 2026 às 13:00", "18 de novembro de 2026 às 10:00")
        with self.assertRaisesRegex(VERIFY.VerificationError, "article_dates_not_visible"):
            self.verify()

    def test_citation_must_be_exact_official_host_and_clickable(self):
        self.change(URL, "https://pncp.gov.br/app/", "https://pncpXgovYbr/app/")
        with self.assertRaisesRegex(VERIFY.VerificationError, "article_provenance_invalid"):
            self.verify()
        self.pages = copy.deepcopy(self.published)
        source = fixture()["articles"][0]["facts"]["source_url"]
        self.change(URL, 'href="' + source + '"', 'href="/"')
        with self.assertRaisesRegex(VERIFY.VerificationError, "article_source_link_not_visible"):
            self.verify()

    def test_http_noindex_cannot_be_hidden_by_indexable_html(self):
        html, kind, _ = self.pages[URL]
        self.pages[URL] = (html, kind, "googlebot: noindex")
        with self.assertRaisesRegex(VERIFY.VerificationError, "article_indexability_invalid"):
            self.verify()

    def test_archive_links_and_canonical_are_real(self):
        self.change(BASE + PREFIX, 'href="' + PREFIX + SLUG + '/"', 'href="/conteudos/"')
        with self.assertRaisesRegex(VERIFY.VerificationError, "archive_indexability_or_link_invalid"):
            self.verify()
        self.pages = copy.deepcopy(self.published)
        self.change(BASE + PREFIX, 'rel="canonical" href="' + BASE + PREFIX + '"', 'rel="canonical" href="' + BASE + '/"')
        with self.assertRaisesRegex(VERIFY.VerificationError, "page_identity_invalid"):
            self.verify()

    def test_old_entries_are_not_allowed_in_news_sitemap(self):
        self.change(BASE + PREFIX + "news-sitemap.xml", "2026-11-18T16:00:00Z", "2026-11-10T16:00:00Z")
        with self.assertRaisesRegex(VERIFY.VerificationError, "recent_news_metadata_invalid"):
            self.verify()

    def test_news_date_and_title_match_first_real_article(self):
        self.change(BASE + PREFIX + "news-sitemap.xml", "2026-11-18T16:00:00Z", "2026-11-18T15:00:00Z")
        with self.assertRaisesRegex(VERIFY.VerificationError, "recent_news_article_mismatch"):
            self.verify()

    def test_archive_lastmod_matches_real_modified_timestamp(self):
        self.change(BASE + PREFIX + "sitemap.xml", "2026-11-18T16:00:00Z", "2026-11-18T15:00:00Z")
        with self.assertRaisesRegex(VERIFY.VerificationError, "archive_lastmod_mismatch"):
            self.verify()

    def test_archive_rejects_traversal_and_other_namespaces(self):
        self.change(BASE + PREFIX + "sitemap.xml", PREFIX + SLUG + "/", PREFIX + "../outra/")
        with self.assertRaisesRegex(VERIFY.VerificationError, "archive_urls_invalid"):
            self.verify()
        self.pages = copy.deepcopy(self.published)
        self.change(BASE + PREFIX + "news-sitemap.xml", 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"', 'xmlns="https://example.test/"')
        with self.assertRaisesRegex(VERIFY.VerificationError, "recent_news_sitemap_invalid"):
            self.verify()

    def test_rss_timestamp_must_match_actual_publication(self):
        self.change(BASE + PREFIX + "feed.xml", "Wed, 18 Nov 2026 16:00:00 GMT", "Wed, 18 Nov 2026 15:00:00 GMT")
        with self.assertRaisesRegex(VERIFY.VerificationError, "feed_article_mismatch"):
            self.verify()

    def test_empty_archive_is_verified_as_empty_with_noindex(self):
        self.pages = copy.deepcopy(self.empty)
        result = self.verify()
        self.assertEqual(result["article_urls"], 0)
        self.assertIsNone(result["verified_article"])
        self.change(BASE + PREFIX, 'content="noindex,follow"', 'content="index,follow"')
        with self.assertRaisesRegex(VERIFY.VerificationError, "empty_archive_must_be_noindex"):
            self.verify()

    def test_comment_in_robots_is_not_sitemap_discovery(self):
        self.change(BASE + "/robots.txt", "Sitemap:", "# Sitemap:")
        with self.assertRaisesRegex(VERIFY.VerificationError, "archive_not_discovered"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
