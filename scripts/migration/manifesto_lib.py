"""Shipped SmartLic → CONFENGE URL manifesto loader and validator.

Decision data lives in data/migration/smartlic-confenge/manifesto.v1.json.
Tests and the #2115 handoff MUST import this module — do not reimplement.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFESTO_PATH = ROOT / "data/migration/smartlic-confenge/manifesto.v1.json"
HANDOFF_PATH = ROOT / "docs/migration/smartlic-confenge/HANDOFF-SMARTLIC-2115.md"

REQUIRED_FIELDS = (
    "legacy_url",
    "family",
    "intent",
    "evidence",
    "decision",
    "target_url",
    "target_absence_justification",
    "semantic_equivalence",
    "priority",
    "owner",
    "preconditions",
    "status",
    "expected_http",
    "expected_canonical",
    "query_string_rule",
    "monitoring",
    "rollback",
    "removal_trigger",
)

DECISIONS = {"MIGRATE", "REDIRECT", "RETIRE"}
READY_STATUSES = {"ready"}
FORBIDDEN_GENERIC_TARGETS = {
    "https://confenge.com.br/",
    "https://confenge.com.br",
    "https://confenge.com.br/consultoria-b2g",
    "https://confenge.com.br/consultoria-b2g/",
}

# Parent hubs that are not 1:1 equivalents unless justification is explicit.
PARENT_HUB_SUFFIXES = (
    "/conteudos/",
    "/lei-14133-obras/",
    "/ferramentas/",
    "/radar/",
    "/inteligencia/",
)


def load_manifesto(path: Path | None = None) -> dict:
    p = Path(path) if path else MANIFESTO_PATH
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "entries" not in data:
        raise ValueError(f"invalid manifesto shape: {p}")
    return data


def manifesto_sha256(path: Path | None = None) -> str:
    p = Path(path) if path else MANIFESTO_PATH
    return hashlib.sha256(p.read_bytes()).hexdigest()


def normalize_target(url: str | None) -> str | None:
    if not url:
        return None
    return str(url).rstrip("/") or url


def is_generic_or_parent_target(target: str | None) -> bool:
    if not target:
        return False
    n = normalize_target(target)
    if n in {normalize_target(x) for x in FORBIDDEN_GENERIC_TARGETS}:
        return True
    return any(n == normalize_target("https://confenge.com.br" + s) for s in PARENT_HUB_SUFFIXES)


def validate_entry(entry: dict, *, index: int) -> list[str]:
    errors: list[str] = []
    prefix = f"entries[{index}] {entry.get('legacy_url', '?')}"
    for field in REQUIRED_FIELDS:
        if field not in entry:
            errors.append(f"{prefix}: missing field {field}")
    decision = entry.get("decision")
    if decision not in DECISIONS:
        errors.append(f"{prefix}: invalid decision {decision!r}")
    status = entry.get("status")
    target = entry.get("target_url")
    http = entry.get("expected_http")
    if decision in {"MIGRATE", "REDIRECT"} and status in READY_STATUSES:
        if not target:
            errors.append(f"{prefix}: ready {decision} requires target_url")
        elif is_generic_or_parent_target(target):
            just = (entry.get("semantic_equivalence") or "").strip()
            utility = (entry.get("equivalence_utility") or "").strip()
            if not just or not utility:
                errors.append(
                    f"{prefix}: ready target {target} is home/parent without "
                    "semantic_equivalence + equivalence_utility"
                )
        canon = entry.get("expected_canonical")
        if canon and target and normalize_target(canon) != normalize_target(target):
            errors.append(f"{prefix}: expected_canonical {canon} != target_url {target}")
        if http not in (301, 308):
            errors.append(f"{prefix}: ready {decision} expected_http must be 301/308, got {http}")
    if decision == "RETIRE":
        if target:
            errors.append(f"{prefix}: RETIRE must not have target_url (got {target})")
        if not (entry.get("target_absence_justification") or "").strip():
            errors.append(f"{prefix}: RETIRE requires target_absence_justification")
        if http not in (410, 404):
            errors.append(f"{prefix}: RETIRE expected_http must be 410 or 404, got {http}")
        if http == 301:
            errors.append(f"{prefix}: RETIRE must not 301")
    return errors


def validate_manifesto(data: dict | None = None) -> dict:
    manifesto = data if data is not None else load_manifesto()
    entries = manifesto.get("entries") or []
    errors: list[str] = []
    seen: set[str] = set()
    ready = []
    for i, entry in enumerate(entries):
        errors.extend(validate_entry(entry, index=i))
        url = entry.get("legacy_url")
        if url in seen:
            errors.append(f"duplicate legacy_url {url}")
        seen.add(url)
        if entry.get("decision") in {"MIGRATE", "REDIRECT"} and entry.get("status") in READY_STATUSES:
            ready.append(entry)
    meta = manifesto.get("meta") or {}
    if not meta.get("version"):
        errors.append("meta.version missing")
    if not entries:
        errors.append("entries empty")
    return {
        "ok": not errors,
        "errors": errors,
        "entry_count": len(entries),
        "ready_count": len(ready),
        "retire_count": sum(1 for e in entries if e.get("decision") == "RETIRE"),
        "redirect_count": sum(1 for e in entries if e.get("decision") == "REDIRECT"),
        "migrate_count": sum(1 for e in entries if e.get("decision") == "MIGRATE"),
        "ready_redirects": [
            {
                "legacy_url": e["legacy_url"],
                "target_url": e["target_url"],
                "expected_http": e["expected_http"],
            }
            for e in ready
        ],
    }


def ready_redirects(data: dict | None = None) -> list[dict]:
    manifesto = data if data is not None else load_manifesto()
    return [
        e
        for e in manifesto["entries"]
        if e.get("decision") in {"MIGRATE", "REDIRECT"} and e.get("status") in READY_STATUSES
    ]
