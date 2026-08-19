"""SmartLic → CONFENGE capability classification for issue #63."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CLASS_PATH = (
    ROOT / "data" / "migration" / "smartlic-confenge" / "capability-classification.v1.json"
)
ALLOWED = frozenset(
    {
        "PORT_TO_WEB_CFG",
        "REIMPLEMENT_IN_WEB_CFG",
        "KEEP_TEMPORARILY_FOR_MIGRATION",
        "DEFER",
        "DROP",
    }
)
FORBIDDEN_RUNTIME_CLASSES = frozenset({"KEEP_AS_RUNTIME", "NEW_SMARTLIC_CAPABILITY"})


def load_classification(path: Path | None = None) -> dict[str, Any]:
    return json.loads((path or CLASS_PATH).read_text(encoding="utf-8"))


def evaluate_portfolio(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_classification()
    fails: list[str] = []
    if data.get("canonical_public_host") != "confenge.com.br":
        fails.append("canonical_host")
    if data.get("donor_host") != "smartlic.tech":
        fails.append("donor_host")
    caps = list(data.get("capabilities") or [])
    if len(caps) < 8:
        fails.append("too_few_capabilities")
    for cap in caps:
        klass = cap.get("class")
        if klass not in ALLOWED:
            fails.append(f"invalid_class:{cap.get('id')}:{klass}")
        if klass in FORBIDDEN_RUNTIME_CLASSES:
            fails.append(f"forbidden_runtime:{cap.get('id')}")
        if cap.get("smartlic_runtime") is True:
            fails.append(f"smartlic_runtime:{cap.get('id')}")
        public = (cap.get("public_runtime") or "").lower()
        if public and "smartlic" in public:
            fails.append(f"public_smartlic_runtime:{cap.get('id')}")
        if public and public not in {"", "confenge.com.br"}:
            fails.append(f"non_confenge_public:{cap.get('id')}")
    ids = [c.get("id") for c in caps]
    if "market-answer-engine" not in ids:
        fails.append("missing_market_answer_priority")
    if "tender-hub" not in ids:
        fails.append("missing_tender_hub_defer")
    else:
        tender = next(c for c in caps if c["id"] == "tender-hub")
        if tender["class"] != "DEFER":
            fails.append("tender_hub_not_deferred")
    return {
        "schema_version": "capability-classification-gate-v1",
        "ok": not fails,
        "fails": fails,
        "count": len(caps),
        "by_class": {
            k: sum(1 for c in caps if c.get("class") == k) for k in sorted(ALLOWED)
        },
    }
