"""Consented Market Signals Brief gate (#90). Prepare-only. No send."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
BRIEF_PATH = ROOT / "data" / "nurture" / "market-signals-brief.v1.json"


def load_brief(path: Path | None = None) -> dict[str, Any]:
    return json.loads((path or BRIEF_PATH).read_text(encoding="utf-8"))


def evaluate_brief(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_brief()
    fails: list[str] = []
    if data.get("auto_send") is not False:
        fails.append("auto_send")
    consent = data.get("consent") or {}
    if consent.get("explicit_opt_in") is not True:
        fails.append("missing_explicit_opt_in")
    unsub = consent.get("unsubscribe_url") or ""
    if "/nurture/sair" not in unsub:
        fails.append("missing_unsubscribe")
    if data.get("audience_is_not_lead") is not True:
        fails.append("audience_collapsed_into_leads")
    edition = data.get("edition") or {}
    if edition.get("sent") is True:
        fails.append("unsent_brief_marked_sent")
    if edition.get("status") != "PREPARE_ONLY":
        fails.append("status_not_prepare_only")
    for field in ("method", "source", "freshness"):
        if not edition.get(field):
            fails.append(f"missing_{field}")
    if "smartlic" in json.dumps(data).lower() and "donor" not in json.dumps(data).lower():
        # product must not revive SmartLic digest runtime
        if "smartlic.tech" in json.dumps(data).lower():
            fails.append("smartlic_public_surface")
    return {
        "schema_version": "market-signals-brief-gate-v1",
        "ok": not fails,
        "fails": fails,
        "sent": edition.get("sent"),
        "auto_send": data.get("auto_send"),
    }
