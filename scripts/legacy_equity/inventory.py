"""Shipped SmartLic → CONFENGE URL inventory loader and validator.

Decision data lives in data/migrations/smartlic-url-map/inventory.v2.json
(identical bytes also written to data/migration/smartlic-confenge/manifesto.v1.json
so SmartLic#2115 vendors one hash-pinned execute set).

Tests and the #2115 handoff MUST import this module — do not reimplement.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[2]
INVENTORY_PATH = ROOT / "data/migrations/smartlic-url-map/inventory.v2.json"
MANIFESTO_PATH = ROOT / "data/migration/smartlic-confenge/manifesto.v1.json"
HANDOFF_PATH = ROOT / "docs/migrations/smartlic/HANDOFF-2115.md"
LEGACY_HANDOFF_PATH = ROOT / "docs/migration/smartlic-confenge/HANDOFF-SMARTLIC-2115.md"

ACTIONS = frozenset(
    {
        "MIGRATE",
        "REDIRECT_301",
        "RETIRE_410",
        "HOLD_TARGET_NOT_READY",
        "IGNORE_NONCANONICAL",
        "LEGAL_SECURITY_HOLD",
    }
)
# v1 aliases accepted only while reading a dirty working copy; the committed
# inventory uses the six verbs above.
ACTION_ALIASES = {
    "REDIRECT": "REDIRECT_301",
    "RETIRE": "RETIRE_410",
}
READY_REDIRECT_ACTIONS = frozenset({"MIGRATE", "REDIRECT_301"})
FAIL_CLOSED_ACTIONS = frozenset(
    {
        "RETIRE_410",
        "HOLD_TARGET_NOT_READY",
        "IGNORE_NONCANONICAL",
        "LEGAL_SECURITY_HOLD",
    }
)
READY_STATUSES = frozenset({"ready"})
HOLD_STATUSES = frozenset({"hold"})

REQUIRED_FIELDS = (
    "legacy_url",
    "historical_status",
    "historical_canonical",
    "family",
    "query",
    "impressions",
    "clicks",
    "backlinks",
    "referrers",
    "unique_utility",
    "action",
    "target",
    "reason",
    "owner",
    "priority",
    "rollback_impact",
    "observation_status",
    # keep the execute-set fields the bridge already consumes
    "decision",
    "target_url",
    "status",
    "expected_http",
    "expected_canonical",
    "query_string_rule",
    "semantic_equivalence",
    "target_absence_justification",
    "bridge_owner",
    "rollback",
    "removal_trigger",
)

REQUIRED_REDIRECT_301_FIELDS = (
    "legacy_exact_or_pattern",
    "destination_canonical",
    "equivalence_rationale",
    "http_status",
    "no_chain",
    "no_loop",
    "query_string_policy",
    "fragment_behavior",
    "trailing_slash_policy",
    "case_normalization",
    "test_cases",
    "expiry_retention",
)

FORBIDDEN_GENERIC_TARGETS = {
    "https://confenge.com.br/",
    "https://confenge.com.br",
    "https://confenge.com.br/consultoria-b2g",
    "https://confenge.com.br/consultoria-b2g/",
}

PARENT_HUB_SUFFIXES = (
    "/conteudos/",
    "/lei-14133-obras/",
    "/ferramentas/",
    "/radar/",
    "/inteligencia/",
    "/guias-contratos-obras/",
)

ALLOWLIST_QUERY_KEYS = (
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "jornada",
    "origem",
    "route_family",
    "cta_id",
    "asset_id",
    "correlation_id",
    "tema",
)
PII_QUERY_KEYS = frozenset(
    {"email", "phone", "telefone", "name", "nome", "cnpj", "cpf"}
)
DEFAULT_QUERY_STRING_POLICY = {
    "mode": "allowlist",
    "persist": list(ALLOWLIST_QUERY_KEYS),
    "drop": "all_other_query_parameters",
    "pii": "never persist email/phone/name/cnpj/cpf or free-text identity in URL, analytics or logs",
}


def canonicalize_action(value: str | None) -> str | None:
    if value is None:
        return None
    return ACTION_ALIASES.get(value, value)


def load_inventory(path: Path | None = None) -> dict:
    p = Path(path) if path else INVENTORY_PATH
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "entries" not in data:
        raise ValueError(f"invalid inventory shape: {p}")
    return data


def load_manifesto(path: Path | None = None) -> dict:
    """Alias — manifesto.v1.json is a byte-identical projection of the inventory."""
    return load_inventory(path or MANIFESTO_PATH)


def inventory_sha256(path: Path | None = None) -> str:
    p = Path(path) if path else INVENTORY_PATH
    return hashlib.sha256(p.read_bytes()).hexdigest()


def manifesto_sha256(path: Path | None = None) -> str:
    return inventory_sha256(path or MANIFESTO_PATH)


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


def _unknown_or_number(value) -> bool:
    if value == "UNKNOWN":
        return True
    if value is None:
        return False
    return isinstance(value, (int, float))


def validate_entry(entry: dict, *, index: int) -> list[str]:
    errors: list[str] = []
    prefix = f"entries[{index}] {entry.get('legacy_url', '?')}"
    for field in REQUIRED_FIELDS:
        if field not in entry:
            errors.append(f"{prefix}: missing field {field}")

    action = canonicalize_action(entry.get("action") or entry.get("decision"))
    decision = canonicalize_action(entry.get("decision"))
    if action not in ACTIONS:
        errors.append(f"{prefix}: invalid action {action!r}")
    if decision not in ACTIONS:
        errors.append(f"{prefix}: invalid decision {decision!r}")
    if action and decision and action != decision:
        errors.append(f"{prefix}: action {action!r} != decision {decision!r}")

    target = entry.get("target")
    target_url = entry.get("target_url")
    if target != target_url:
        errors.append(f"{prefix}: target {target!r} != target_url {target_url!r}")

    status = entry.get("status")
    http = entry.get("expected_http")
    if action in READY_REDIRECT_ACTIONS and status in READY_STATUSES:
        if not target:
            errors.append(f"{prefix}: ready {action} requires target")
        elif is_generic_or_parent_target(target):
            just = (entry.get("semantic_equivalence") or "").strip()
            utility = (entry.get("unique_utility") or entry.get("equivalence_utility") or "").strip()
            if not just or not utility:
                errors.append(
                    f"{prefix}: ready target {target} is home/parent without "
                    "semantic_equivalence + unique_utility"
                )
        canon = entry.get("expected_canonical") or entry.get("destination_canonical")
        if canon and target and normalize_target(canon) != normalize_target(target):
            errors.append(f"{prefix}: expected_canonical {canon} != target {target}")
        if http not in (301, 308):
            errors.append(f"{prefix}: ready {action} expected_http must be 301/308, got {http}")
        if entry.get("http_status") not in (301, 308, None):
            if entry.get("http_status") != http:
                errors.append(f"{prefix}: http_status {entry.get('http_status')} != expected_http {http}")
        for field in REQUIRED_REDIRECT_301_FIELDS:
            if field not in entry:
                errors.append(f"{prefix}: missing REDIRECT_301 field {field}")
        if entry.get("no_chain") is not True:
            errors.append(f"{prefix}: no_chain must be true")
        if entry.get("no_loop") is not True:
            errors.append(f"{prefix}: no_loop must be true")
        host = (urlsplit(str(target or "")).hostname or "").lower()
        if target and host != "confenge.com.br":
            errors.append(f"{prefix}: target host must be confenge.com.br, got {host!r}")

    if action == "HOLD_TARGET_NOT_READY":
        if target not in (None, ""):
            errors.append(f"{prefix}: HOLD must have empty/null target (got {target})")
        if http != 410:
            errors.append(f"{prefix}: HOLD fail-closed expected_http must be 410, got {http}")
        if status not in HOLD_STATUSES:
            errors.append(f"{prefix}: HOLD status must be hold, got {status!r}")
        if not (entry.get("skip_reason") or "").strip():
            errors.append(f"{prefix}: HOLD requires skip_reason")
        if not (entry.get("intended_future_surface") or "").strip():
            errors.append(f"{prefix}: HOLD requires intended_future_surface")
        if entry.get("intended_future_surface", "").startswith("https://"):
            errors.append(f"{prefix}: HOLD must not pin a live URL as intended_future_surface")

    if action == "RETIRE_410":
        if target not in (None, ""):
            errors.append(f"{prefix}: RETIRE_410 must not have target (got {target})")
        if not (entry.get("target_absence_justification") or entry.get("reason") or "").strip():
            errors.append(f"{prefix}: RETIRE_410 requires reason")
        if http not in (410, 404):
            errors.append(f"{prefix}: RETIRE_410 expected_http must be 410 or 404, got {http}")

    if action in {"IGNORE_NONCANONICAL", "LEGAL_SECURITY_HOLD"}:
        if target not in (None, ""):
            errors.append(f"{prefix}: {action} must not have target (got {target})")
        if http != 410:
            errors.append(f"{prefix}: {action} expected_http must be 410, got {http}")

    if not _unknown_or_number(entry.get("impressions")):
        errors.append(f"{prefix}: impressions must be number or UNKNOWN")
    if not _unknown_or_number(entry.get("clicks")):
        errors.append(f"{prefix}: clicks must be number or UNKNOWN")
    for honest in ("query", "backlinks", "referrers", "historical_status", "historical_canonical"):
        if entry.get(honest) in (None, ""):
            errors.append(f"{prefix}: {honest} must be evidenced or UNKNOWN")
    return errors


def validate_inventory(data: dict | None = None) -> dict:
    inventory = data if data is not None else load_inventory()
    entries = inventory.get("entries") or []
    errors: list[str] = []
    seen: set[str] = set()
    ready = []
    counts = {action: 0 for action in ACTIONS}
    for i, entry in enumerate(entries):
        errors.extend(validate_entry(entry, index=i))
        url = entry.get("legacy_url")
        if url in seen:
            errors.append(f"duplicate legacy_url {url}")
        seen.add(url)
        action = canonicalize_action(entry.get("action") or entry.get("decision"))
        if action in counts:
            counts[action] += 1
        if action in READY_REDIRECT_ACTIONS and entry.get("status") in READY_STATUSES:
            ready.append(entry)
    meta = inventory.get("meta") or {}
    if not meta.get("version"):
        errors.append("meta.version missing")
    if not entries:
        errors.append("entries empty")
    return {
        "ok": not errors,
        "errors": errors,
        "entry_count": len(entries),
        "ready_count": len(ready),
        "counts": counts,
        "retire_count": counts["RETIRE_410"],
        "redirect_count": counts["REDIRECT_301"],
        "hold_count": counts["HOLD_TARGET_NOT_READY"],
        "migrate_count": counts["MIGRATE"],
        "ignore_count": counts["IGNORE_NONCANONICAL"],
        "legal_count": counts["LEGAL_SECURITY_HOLD"],
        "ready_redirects": [
            {
                "legacy_url": e["legacy_url"],
                "target_url": e.get("target") or e.get("target_url"),
                "expected_http": e["expected_http"],
            }
            for e in ready
        ],
    }


def validate_manifesto(data: dict | None = None) -> dict:
    return validate_inventory(data)


def ready_redirects(data: dict | None = None) -> list[dict]:
    inventory = data if data is not None else load_inventory()
    return [
        e
        for e in inventory["entries"]
        if canonicalize_action(e.get("action") or e.get("decision")) in READY_REDIRECT_ACTIONS
        and e.get("status") in READY_STATUSES
    ]


def hold_entries(data: dict | None = None) -> list[dict]:
    inventory = data if data is not None else load_inventory()
    return [
        e
        for e in inventory["entries"]
        if canonicalize_action(e.get("action") or e.get("decision")) == "HOLD_TARGET_NOT_READY"
    ]


def priority_entries(data: dict | None = None) -> list[dict]:
    inventory = data if data is not None else load_inventory()
    out = []
    for e in inventory["entries"]:
        pri = e.get("priority")
        clicks = e.get("clicks")
        has_clicks = isinstance(clicks, (int, float)) and clicks > 0
        if pri in {"P0", "P1"} or has_clicks or e.get("status") in READY_STATUSES:
            out.append(e)
    return out


def apply_query_string_policy(
    target: str,
    query: str,
    persist: list[str] | None = None,
) -> str:
    """Build Location from target + incoming query using the shipped allowlist.

    PII keys (email/phone/name/cnpj/cpf and aliases) are never forwarded.
    Fragments are never forwarded. Only `persist` keys survive.
    """
    persist_set = set(persist or ALLOWLIST_QUERY_KEYS)
    parts = urlsplit(target)
    incoming = parse_qsl(query.lstrip("?"), keep_blank_values=True)
    kept: list[tuple[str, str]] = []
    for key, value in incoming:
        lowered = key.lower()
        if lowered in PII_QUERY_KEYS:
            continue
        if key in persist_set:
            kept.append((key, value))
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(kept), "")
    )
