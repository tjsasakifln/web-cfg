"""Unit tests for production auditor pure gates (no live network required)."""

from __future__ import annotations

import unittest
from datetime import date, timedelta
from pathlib import Path

from scripts.pseo.production_audit import (
    CRITICAL_CODES,
    UrlAudit,
    audit_sitemap_lastmod,
    evaluate_row,
    local_html_hash,
)


ROOT = Path(__file__).resolve().parents[3]


class TestProductionAuditGates(unittest.TestCase):
    def test_critical_codes_include_core_defects(self):
        for code in (
            "http_3xx_on_canonical",
            "noindex_on_publish",
            "x_robots_noindex",
            "canonical_divergent",
            "orphan_page",
            "missing_from_sitemap",
            "future_lastmod",
            "prod_html_mismatch",
            "ua_skew",
        ):
            self.assertIn(code, CRITICAL_CODES)

    def test_future_lastmod_detected(self):
        future = (date.today() + timedelta(days=30)).isoformat()
        xml = f"<urlset><url><loc>https://confenge.com.br/x/</loc><lastmod>{future}</lastmod></url></urlset>"
        defects = audit_sitemap_lastmod(xml)
        self.assertIn("future_lastmod", defects)

    def test_past_lastmod_ok(self):
        xml = "<urlset><url><loc>https://x/</loc><lastmod>2026-07-01</lastmod></url></urlset>"
        defects = audit_sitemap_lastmod(xml, today=date(2026, 7, 31))
        self.assertEqual(defects, [])

    def test_noindex_on_publish_flagged(self):
        row = UrlAudit(path="/radar/x/", expected_role="publish")
        row.browser = {
            "status": 200,
            "meta_robots": "noindex,follow",
            "canonical": "https://confenge.com.br/radar/x/",
            "headers": {},
            "redirect_chain": [{"url": "https://confenge.com.br/radar/x/", "status": 200}],
            "body_size": 5000,
            "text_len": 2000,
            "title": "Radar X",
            "html_sha256": "abc",
        }
        row.googlebot = dict(row.browser)
        out = evaluate_row(
            row,
            sitemap_urls={"https://confenge.com.br/radar/x/"},
            hub_link_targets={"/radar/x/"},
        )
        self.assertIn("noindex_on_publish", out.defects)

    def test_canonical_netlify_flagged(self):
        row = UrlAudit(path="/radar/x/", expected_role="publish")
        row.browser = {
            "status": 200,
            "meta_robots": "index,follow",
            "canonical": "https://confenge.netlify.app/radar/x/",
            "headers": {},
            "redirect_chain": [],
            "body_size": 5000,
            "text_len": 2000,
            "title": "Radar X",
            "html_sha256": "abc",
        }
        row.googlebot = dict(row.browser)
        out = evaluate_row(
            row,
            sitemap_urls={"https://confenge.com.br/radar/x/"},
            hub_link_targets={"/radar/x/"},
        )
        self.assertIn("canonical_netlify_host", out.defects)

    def test_sitemap_non_indexable_flagged(self):
        row = UrlAudit(path="/radar/x/", expected_role="publish")
        row.browser = {
            "status": 200,
            "meta_robots": "noindex,follow",
            "canonical": "https://confenge.com.br/radar/x/",
            "headers": {},
            "redirect_chain": [],
            "body_size": 5000,
            "text_len": 2000,
            "title": "Radar X",
            "html_sha256": "abc",
        }
        row.googlebot = dict(row.browser)
        out = evaluate_row(
            row,
            sitemap_urls={"https://confenge.com.br/radar/x/"},
            hub_link_targets={"/radar/x/"},
        )
        self.assertIn("noindex_on_publish", out.defects)
        self.assertIn("sitemap_non_indexable", out.defects)

    def test_empty_hub_noindex_allowed(self):
        row = UrlAudit(path="/inteligencia/orgaos/", expected_role="hub")
        row.browser = {
            "status": 200,
            "meta_robots": "noindex,follow",
            "canonical": "https://confenge.com.br/inteligencia/orgaos/",
            "headers": {},
            "redirect_chain": [],
            "body_size": 5000,
            "text_len": 2000,
            "title": "Órgãos",
            "html_sha256": "abc",
        }
        row.googlebot = dict(row.browser)
        out = evaluate_row(
            row,
            sitemap_urls=set(),  # empty hub out of sitemap
            hub_link_targets=set(),
        )
        self.assertNotIn("noindex_on_publish", out.defects)

    def test_ua_skew_status(self):
        row = UrlAudit(path="/radar/x/", expected_role="publish")
        row.browser = {
            "status": 200,
            "meta_robots": "index,follow",
            "canonical": "https://confenge.com.br/radar/x/",
            "headers": {},
            "redirect_chain": [],
            "body_size": 5000,
            "text_len": 2000,
            "title": "Radar X",
            "html_sha256": "abc",
        }
        row.googlebot = {**row.browser, "status": 403}
        out = evaluate_row(
            row,
            sitemap_urls={"https://confenge.com.br/radar/x/"},
            hub_link_targets={"/radar/x/"},
        )
        self.assertIn("ua_skew", out.defects)

    def test_local_html_hash_none_missing(self):
        self.assertIsNone(local_html_hash(ROOT, "/path/that/does/not/exist/"))


if __name__ == "__main__":
    unittest.main()
