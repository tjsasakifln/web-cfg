"""Refuse llms.txt strategy, cloaking, bot-specific copy, and fake citations."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

OWNED_RELATIVE = (
    "scripts/discovery",
    "scripts/data_desk",
    "tests/discovery",
    "tests/data_desk",
    "data/discovery",
    "data/data-desk",
    "docs/discovery",
    "docs/data-desk",
)

FORBIDDEN_PATTERNS = (
    (r"(?i)llms\.txt", "llms_txt_strategy"),
    (r"(?i)geo[- ]hack", "geo_hack"),
    (r"(?i)cloak(ing)?", "cloaking"),
    (r"(?i)bot[- ]specific[- ]copy", "bot_specific_copy"),
    (r"(?i)fake[- ]citation", "fake_citation"),
    (r"(?i)pay[- ]to[- ]cite", "pay_to_cite"),
    (r"(?i)pay[- ]to[- ]link", "pay_to_link"),
    (r"(?i)auto_send\s*[:=]\s*true", "auto_send_true"),
)


def scan_text(text: str) -> list[str]:
    hits: list[str] = []
    for pattern, code in FORBIDDEN_PATTERNS:
        if re.search(pattern, text):
            # Mentions that only forbid the tactic (docs) still trip the raw
            # pattern. Callers that need "present as strategy" pass owned code.
            hits.append(code)
    return hits


def scan_owned_code(root: Path) -> list[dict[str, Any]]:
    """Scan implementation files (not docs) for GEO-hack strategy."""
    violations: list[dict[str, Any]] = []
    code_roots = (
        root / "scripts" / "discovery",
        root / "scripts" / "data_desk",
        root / "tests" / "discovery",
        root / "tests" / "data_desk",
    )
    skip_names = {"geo_guard.py", "test_invariants.py", "test_observatory.py"}
    for base in code_roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in {".py", ".json", ".mjs", ".js"}:
                continue
            if path.name in skip_names:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            # Allow listing forbidden tokens only inside comments that reject them
            # is still too loose. Require assignment/implementation shapes.
            if re.search(r"(?im)^(llms_txt|LLMS_TXT)\s*=", text):
                violations.append({"path": str(path.relative_to(root)), "code": "llms_txt_strategy"})
            if re.search(r"(?i)auto_send\s*[:=]\s*true", text):
                violations.append({"path": str(path.relative_to(root)), "code": "auto_send_true"})
            if "api.indexnow.org" in text and "http" in text and "POST" in text:
                # Implementation of a live send path in this goal's trees is forbidden
                # unless gated. The IndexNow module must not contain a raw fetch.
                if "urllib.request" in text or "http.client" in text or "requests." in text:
                    violations.append({"path": str(path.relative_to(root)), "code": "live_indexnow_send"})
    return violations


def assert_no_geo_strategy(root: Path) -> None:
    violations = scan_owned_code(root)
    if violations:
        raise ValueError("geo_strategy_forbidden:" + ",".join(v["code"] for v in violations))
