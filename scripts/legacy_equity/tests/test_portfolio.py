"""Drive the shipped #63 capability classification against the committed file."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from legacy_equity.portfolio import (  # noqa: E402
    evaluate_portfolio,
    load_classification,
)


def test_committed_classification_has_no_smartlic_runtime():
    data = load_classification()
    report = evaluate_portfolio(data)
    assert report["ok"], report["fails"]
    assert data["canonical_public_host"] == "confenge.com.br"
    for cap in data["capabilities"]:
        assert cap["smartlic_runtime"] is False
        assert cap["class"] != "KEEP_AS_RUNTIME"


def test_tender_hub_is_deferred_not_rebuilt():
    data = load_classification()
    tender = next(c for c in data["capabilities"] if c["id"] == "tender-hub")
    assert tender["class"] == "DEFER"


def test_smartlic_runtime_flag_fails_closed():
    data = copy.deepcopy(load_classification())
    data["capabilities"][0]["smartlic_runtime"] = True
    report = evaluate_portfolio(data)
    assert report["ok"] is False
    assert any("smartlic_runtime" in f for f in report["fails"])
