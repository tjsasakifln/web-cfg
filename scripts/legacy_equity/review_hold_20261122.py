#!/usr/bin/env python3
"""One-time, reviewed 2026-11-22 SmartLic HOLD data regeneration.

Fail closed if current data drifted. Never approves redirects, modifies DNS
or tests a real payment. The workflow removes this helper when finished.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from legacy_equity import build_inventory  # noqa: E402
from legacy_equity.inventory import INVENTORY_PATH, MANIFESTO_PATH, validate_inventory  # noqa: E402

OLD_HASH = "acd21cdf7bd71f5bde06a7887e50f4054cd19aeaacce908cb84d679a796246e8"
DEADLINE = "2026-12-20"
OLD_DEADLINE = "2026-11-21"
REVIEW_DAY = "2026-11-22"


def replace_once(path: Path, old: str, new: str) -> None:
    content = path.read_text(encoding="utf-8")
    if content.count(old) != 1:
        raise ValueError(f"expected one occurrence in {path}: {old[:65]}")
    path.write_text(content.replace(old, new, 1), encoding="utf-8")


def run() -> None:
    current_bytes = INVENTORY_PATH.read_bytes()
    if hashlib.sha256(current_bytes).hexdigest() != OLD_HASH:
        raise ValueError("canonical inventory moved: stop without overwriting")
    if MANIFESTO_PATH.read_bytes() != current_bytes:
        raise ValueError("manifesto is not byte-identical")
    before = json.loads(current_bytes)
    prev_counts = {kind: sum(e["action"] == kind for e in before["entries"]) for kind in ("HOLD_TARGET_NOT_READY", "REDIRECT_301", "RETIRE_410")}
    if prev_counts != {"HOLD_TARGET_NOT_READY": 54, "REDIRECT_301": 11, "RETIRE_410": 1190}:
        raise ValueError(f"inventory drift: {prev_counts}")
    old_holds = [e for e in before["entries"] if e["action"] == "HOLD_TARGET_NOT_READY"]
    for e in old_holds:
        if e.get("review_date") != OLD_DEADLINE or e.get("target") is not None or e.get("target_url") is not None or e.get("expected_http") != 410 or not e.get("skip_reason") or not e.get("intended_future_surface"):
            raise ValueError(f"unreviewed or unsafe HOLD: {e['legacy_url']}")
    doc = ROOT / "docs/migrations/smartlic" / f"HOLD-REVIEW-{REVIEW_DAY}.md"
    review_content = doc.read_text(encoding="utf-8")
    if not all(e["legacy_url"] in review_content for e in old_holds) or len(set(e["legacy_url"] for e in old_holds)) != 54 or DEADLINE not in review_content:
        raise ValueError("incomplete nominal review")
    if build_inventory.HOLD_REVIEW_DATE != DEADLINE:
        raise ValueError("builder deadline mismatch")
    after = build_inventory.build(before)
    if after["meta"] != dict(before["meta"], hold_review_date=DEADLINE):
        raise ValueError("unexpected metadata changes during regeneration")
    for old, new in zip(before["entries"], after["entries"]):
        expected = dict(old)
        if old["action"] == "HOLD_TARGET_NOT_READY":
            expected["review_date"] = DEADLINE
        if expected != new:
            raise ValueError(f"unexpected decision change: {old['legacy_url']}")
    report = validate_inventory(after)
    if not report["ok"]:
        raise ValueError(f"validator rejects reassessment: {report['errors'][:6]}")
    digest = build_inventory.write_pair(after)
    if hashlib.sha256(INVENTORY_PATH.read_bytes()).hexdigest() != digest or MANIFESTO_PATH.read_bytes() != INVENTORY_PATH.read_bytes():
        raise ValueError("unverified pin or changed projection")
    execute_path = ROOT / "data/migrations/smartlic-url-map/execute-set.v2.json"
    execute = json.loads(execute_path.read_text(encoding="utf-8"))
    if execute["inventory_sha256"] != digest or execute["hold_review_date"] != DEADLINE or len(execute["redirects"]) != 11 or len(execute["holds"]) != 54:
        raise ValueError("execute set does not agree with inventory")
    if not all(x["review_date"] == DEADLINE and x["target_url"] is None and x["expected_http"] == 410 for x in execute["holds"]):
        raise ValueError("unsafe HOLD in execute set")
    replace_once(ROOT / "data/migration/smartlic-confenge/capability-classification.v1.json", '"hold_review_date": "' + OLD_DEADLINE + '"', '"hold_review_date": "' + DEADLINE + '"')
    for path in (ROOT / "docs/migrations/smartlic/HANDOFF-2115.md", ROOT / "docs/migration/smartlic-confenge/HANDOFF-SMARTLIC-2115.md"):
        replace_once(path, "**SHA-256:** `" + OLD_HASH + "`", "**SHA-256:** `" + digest + "`")
    canonical = ROOT / "docs/migrations/smartlic/HANDOFF-2115.md"
    replace_once(canonical, "Current pin metadata: the 2026-10-24 [technical HOLD reassessment](HOLD-REVIEW-2026-10-24.md) renewed the 54 HOLD reviews through 2026-11-21 without changing any of the 11 ready mappings. It is not a human acceptance, bridge execution, DNS/TLS change, or cutover.", "Current pin metadata: the 2026-11-22 [documented HOLD reassessment](HOLD-REVIEW-2026-11-22.md) kept the 54 HOLD fail-closed through 2026-12-20 without changing the 11 ready mappings. Prior pin " + OLD_HASH + " is retained in the dated review. No human acceptance, bridge execution, DNS/TLS change or cutover is claimed.")
    status = ROOT / "docs/migrations/smartlic/STATUS.md"
    replace_once(status, "| Date | 2026-10-24 |", "| Date | 2026-11-22 |")
    replace_once(status, "| Inventory SHA-256 | `" + OLD_HASH + "` |", "| Inventory SHA-256 | `" + digest + "` |")
    replace_once(status, "| HOLD review date | `" + OLD_DEADLINE + "` |", "| HOLD review date | `" + DEADLINE + "` |")
    replace_once(status, "The [2026-10-24 technical HOLD reassessment](HOLD-REVIEW-2026-10-24.md) preserved all 54 rows as 410/no-target and left every one of the 11 ready mappings unchanged. It records no human acceptance, bridge execution, cutover, or observation.", "The [2026-11-22 documented HOLD reassessment](HOLD-REVIEW-2026-11-22.md) retained all 54 rows as 410/no-target. The previous [2026-10-24 reassessment](HOLD-REVIEW-2026-10-24.md) and pin " + OLD_HASH + " remain historical evidence. No human acceptance, bridge execution, cutover or observation occurred.")
    readme = ROOT / "data/migrations/smartlic-url-map/README.md"
    replace_once(readme, "The current technical HOLD reassessment is [HOLD-REVIEW-2026-10-24](../../../docs/migrations/smartlic/HOLD-REVIEW-2026-10-24.md). It keeps HOLD rows at 410 and is not a bridge approval or cutover.", "The current technical HOLD reassessment is [HOLD-REVIEW-2026-11-22](../../../docs/migrations/smartlic/HOLD-REVIEW-2026-11-22.md), after [2026-10-24](../../../docs/migrations/smartlic/HOLD-REVIEW-2026-10-24.md). It keeps all HOLD at 410; next deadline 2026-12-20. No bridge approval or cutover.")
    replace_once(doc, "__NEW_INVENTORY_SHA256__", digest)
    print(f"REVIEW_GENERATED_OK digest={digest} count={len(before['entries'])} hold=54 redirects=11 retire=1190")


if __name__ == "__main__":
    run()
