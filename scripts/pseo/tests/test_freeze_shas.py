"""Unit tests for freeze_shas pure apply_freeze (no network)."""

from __future__ import annotations

import unittest

from scripts.pseo.freeze_shas import apply_freeze


class TestApplyFreeze(unittest.TestCase):
    def test_sets_both_shas_from_live(self):
        live = {"web_cfg_sha": "abc123", "published_page_count": 4}
        out = apply_freeze({}, live, head="abc123", now="2026-07-31T00:00:00Z")
        self.assertEqual(out["web_cfg_sha"], "abc123")
        self.assertEqual(out["netlify_deployed_sha"], "abc123")
        self.assertEqual(out["public_manifest"], live)
        self.assertTrue(out["sha_alignment"]["all_match"])
        self.assertFalse(out["sha_alignment"]["report_commit_may_lag"])

    def test_all_match_false_when_head_differs(self):
        live = {"web_cfg_sha": "live-sha"}
        out = apply_freeze(
            {"terminal_status": "PARTIAL_DEPLOYED_NOT_GSC_INSPECTED"},
            live,
            head="other-sha",
            now="t",
        )
        self.assertEqual(out["web_cfg_sha"], "live-sha")
        self.assertEqual(out["netlify_deployed_sha"], "live-sha")
        self.assertFalse(out["sha_alignment"]["all_match"])
        self.assertTrue(out["sha_alignment"]["report_commit_may_lag"])
        # never invent equality
        self.assertNotEqual(out["sha_alignment"]["git_head"], out["web_cfg_sha"])

    def test_preserves_other_result_fields(self):
        prev = {
            "terminal_status": "PARTIAL_DEPLOYED_NOT_GSC_INSPECTED",
            "seed_urls": ["/radar/x/"],
            "gsc_access": "NOT_INSPECTED_NO_CREDENTIALS",
        }
        out = apply_freeze(prev, {"web_cfg_sha": "s"}, head="s", now="t")
        self.assertEqual(out["terminal_status"], "PARTIAL_DEPLOYED_NOT_GSC_INSPECTED")
        self.assertEqual(out["seed_urls"], ["/radar/x/"])
        self.assertEqual(out["gsc_access"], "NOT_INSPECTED_NO_CREDENTIALS")


if __name__ == "__main__":
    unittest.main()
