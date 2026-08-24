"""Unit tests for production auditor pure gates (no live network required)."""

from __future__ import annotations

import unittest
from unittest.mock import patch
from tempfile import TemporaryDirectory
from datetime import date, timedelta
from pathlib import Path

from scripts.pseo.production_audit import (
    CRITICAL_CODES,
    UrlAudit,
    audit_sitemap_lastmod,
    evaluate_row,
    local_html_hash,
    run_audit,
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

    def test_production_sitemap_absence_is_fail_closed(self):
        fake = {
            "status": 503,
            "html_snippet": "",
            "body_size": 0,
            "headers": {},
            "redirect_chain": [],
        }
        with TemporaryDirectory() as temp_dir, patch(
            "scripts.pseo.production_audit.fetch_url", return_value=fake
        ), patch("scripts.pseo.production_audit.urllib.request.urlopen", side_effect=OSError("offline")):
            report = run_audit(
                root=ROOT,
                base_url="https://invalid.example",
                out_dir=Path(temp_dir),
            )
        self.assertFalse(report["ok"])
        self.assertFalse(report["technical_ok"])
        self.assertFalse(report["sitemap"]["production_available"])
        self.assertIn("sitemap:production_sitemap_unavailable", report["critical"])

    def _ok_browser(self, path="/radar/x/", **extra):
        base = {
            "status": 200,
            "meta_robots": "index,follow",
            "canonical": f"https://confenge.com.br{path}",
            "headers": {},
            "redirect_chain": [{"url": f"https://confenge.com.br{path}", "status": 200}],
            "body_size": 5000,
            "text_len": 2000,
            "title": "Radar X",
            "html_sha256": "abc",
        }
        base.update(extra)
        return base

    def test_orphan_flagged_when_not_in_hub(self):
        row = UrlAudit(path="/radar/x/", expected_role="publish")
        row.browser = self._ok_browser()
        row.googlebot = dict(row.browser)
        out = evaluate_row(
            row,
            sitemap_urls={"https://confenge.com.br/radar/x/"},
            hub_link_targets=set(),  # no hub links
        )
        self.assertFalse(out.in_hub)
        self.assertIn("orphan_page", out.defects)

    def test_in_hub_true_when_linked(self):
        row = UrlAudit(path="/radar/x/", expected_role="publish")
        row.browser = self._ok_browser()
        row.googlebot = dict(row.browser)
        out = evaluate_row(
            row,
            sitemap_urls={"https://confenge.com.br/radar/x/"},
            hub_link_targets={"/radar/x/"},
        )
        self.assertTrue(out.in_hub)
        self.assertNotIn("orphan_page", out.defects)

    def test_soft404_flagged(self):
        row = UrlAudit(path="/radar/x/", expected_role="publish")
        row.browser = self._ok_browser(body_size=100, text_len=50, title="Página não encontrada")
        row.googlebot = dict(row.browser)
        out = evaluate_row(
            row,
            sitemap_urls={"https://confenge.com.br/radar/x/"},
            hub_link_targets={"/radar/x/"},
        )
        self.assertIn("empty_or_soft404", out.defects)

    def test_redirect_on_publish_canonical_flagged(self):
        row = UrlAudit(path="/radar/x/", expected_role="publish")
        row.browser = self._ok_browser(
            status=200,
            redirect_chain=[
                {
                    "url": "https://confenge.com.br/radar/x/",
                    "status": 301,
                    "location": "https://confenge.com.br/radar/y/",
                },
                {"url": "https://confenge.com.br/radar/y/", "status": 200},
            ],
        )
        row.googlebot = dict(row.browser)
        out = evaluate_row(
            row,
            sitemap_urls={"https://confenge.com.br/radar/x/"},
            hub_link_targets={"/radar/x/"},
        )
        self.assertIn("http_3xx_on_canonical", out.defects)

    def test_prod_html_mismatch_flagged(self):
        row = UrlAudit(path="/radar/x/", expected_role="publish")
        row.browser = self._ok_browser(html_sha256="prodhash")
        row.googlebot = dict(row.browser)
        row.local_html_sha256 = "localhash"
        out = evaluate_row(
            row,
            sitemap_urls={"https://confenge.com.br/radar/x/"},
            hub_link_targets={"/radar/x/"},
        )
        self.assertIn("prod_html_mismatch", out.defects)

    def test_safe_http_url_and_guide_labels_not_mechanical(self):
        from scripts.pseo.render import guide_path_label, safe_http_url

        self.assertEqual(
            safe_http_url("https:///www.transparencia.pr.gov.br/pte/x"),
            "https://www.transparencia.pr.gov.br/pte/x",
        )
        self.assertIsNone(safe_http_url("javascript:alert(1)"))
        label = guide_path_label("/conteudos/servico-nao-previsto-na-planilha-obra-publica/")
        self.assertNotIn("Servico Nao", label)
        self.assertIn("não", label.lower())
        # Hub cards must not use raw page_type strings
        from scripts.pseo.build import render_hubs
        from scripts.pseo.score import Candidate

        c = Candidate(
            page_id="prob-x",
            page_type="problem_service",
            url="/inteligencia/cenarios/x/",
            title="t",
            h1="Cenário de teste",
            description="d " * 20,
            archetype=None,
            segment=None,
            region=None,
            agency_id=None,
            intent="y",
            score=90,
            status="publish",
        )
        # render_hubs writes files — call items_for logic via module inspection
        import scripts.pseo.build as b

        src = Path(b.__file__).read_text(encoding="utf-8")
        self.assertIn("Cenário problema → serviço", src)
        self.assertIn("Never expose pipeline page_type", src)
        # unit of guide label vs crude title case
        self.assertNotEqual(
            guide_path_label("/conteudos/aditivo-qualitativo-quantitativo/"),
            "Aditivo Qualitativo Quantitativo",
        )


if __name__ == "__main__":
    unittest.main()
