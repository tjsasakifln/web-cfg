"""Fail-closed originality gate for the six Medição/Glosa/Pagamento URLs.

Drives the shipped HTML (conteudos/<slug>/index.html) through
scripts.organic.cluster_medicao_originality.evaluate_cluster. Does not
reimplement extraction, similarity or section checks.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.cluster_medicao_originality import (  # noqa: E402
    CLUSTER_SLUGS,
    EXCLUSIVE_ARTIFACTS,
    REQUIRED_SECTION_IDS,
    evaluate_cluster,
    extract_body_paragraphs,
    inspect_page,
    pairwise_shared_ratio,
)


def test_cluster_originality_drives_shipped_html():
    report = evaluate_cluster(ROOT)
    assert report["ok"], "\n".join(report["failures"])
    for slug in CLUSTER_SLUGS:
        path = ROOT / "conteudos" / slug / "index.html"
        assert path.is_file(), slug
        html = path.read_text(encoding="utf-8")
        page = inspect_page(ROOT, slug)
        assert page["paragraphs"] == extract_body_paragraphs(html)
        assert EXCLUSIVE_ARTIFACTS[slug] in html
        assert REQUIRED_SECTION_IDS[0] in page["section_ids"]


def test_pairwise_ratio_uses_smaller_text_as_denominator():
    small = ["alpha unique", "beta unique", "gamma shared"]
    large = ["gamma shared", "delta other", "epsilon other", "zeta other"]
    assert pairwise_shared_ratio(small, large) == 1 / 3


def test_evaluate_cluster_is_deterministic():
    first = evaluate_cluster(ROOT)
    second = evaluate_cluster(ROOT)
    assert first["failures"] == second["failures"]
    assert first["pairwise"] == second["pairwise"]
    dumped = json.dumps(first["pairwise"], sort_keys=True)
    assert dumped == json.dumps(second["pairwise"], sort_keys=True)
