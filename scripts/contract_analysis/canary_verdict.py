"""Canary expand/adjust/kill verdict. UNKNOWN until evidence (#83)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
APPROVALS = ROOT / "data" / "editorial" / "contract-analysis" / "approvals.json"
ALLOWED_VERDICTS = frozenset({"EXPAND", "ADJUST", "KILL", "UNKNOWN"})


def load_approvals() -> dict[str, Any]:
    if not APPROVALS.is_file():
        return {}
    return json.loads(APPROVALS.read_text(encoding="utf-8"))


def evaluate_verdict(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_approvals()
    fails: list[str] = []
    verdict = data.get("canary_verdict") or data.get("recommendation") or "UNKNOWN"
    evidence = data.get("canary_evidence") or data.get("evidence") or "UNKNOWN"
    if verdict not in ALLOWED_VERDICTS:
        fails.append(f"bad_verdict:{verdict}")
    if verdict in {"EXPAND"} and evidence in {None, "", "UNKNOWN"}:
        fails.append("expand_without_evidence")
    indexed = []
    for row in data.get("approvals") or data.get("items") or []:
        if isinstance(row, dict) and row.get("index_authorized") is True:
            indexed.append(row.get("id") or row.get("slug"))
    if len(indexed) > 10:
        fails.append("quota_over_canary")
    return {
        "schema_version": "contract-analysis-canary-verdict-v1",
        "ok": not fails,
        "fails": fails,
        "verdict": verdict if verdict in ALLOWED_VERDICTS else "UNKNOWN",
        "evidence": evidence,
        "indexed_count": len(indexed),
    }
