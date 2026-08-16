"""IndexNow prepare-only notifier. Dry-run default. Never sends on this path."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scripts.discovery.eligibility import is_approved_canonical, is_fixture, robots_is_noindex
from scripts.discovery.inspect import inspect_asset
from scripts.discovery.registry import load_allowlist, load_cohort, repo_root
from scripts.discovery.schema import HOST, UNKNOWN, SchemaError, validate_change_state

RECEIPT_SCHEMA = "indexnow_receipt_v1"
MAX_URLS_PER_PREPARE = 10
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
DEFAULT_RECEIPTS_REL = Path("data/discovery/receipts")


class IndexNowPrepareError(SchemaError):
    """URL or batch failed the prepare-only IndexNow contract."""


def normalize_canonical(url: str) -> str:
    value = str(url).strip()
    if not is_approved_canonical(value):
        raise IndexNowPrepareError(f"not_approved_canonical:{value}")
    parsed = urlparse(value)
    path = parsed.path or "/"
    if path != "/" and not path.endswith("/"):
        # Keep as declared; allowlist is exact.
        pass
    return f"https://{HOST}{path}"


def idempotency_key(urls: list[str], state: str) -> str:
    payload = json.dumps({"urls": urls, "state": state}, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def receipt_meaning() -> dict[str, Any]:
    return {
        "indexation": False,
        "meaning": "notification_accepted_not_indexed",
        "note": (
            "IndexNow HTTP 200/202 means the endpoint received the notification. "
            "It is not proof of crawl, index, appearance, citation, or lead."
        ),
    }


def _asset_for_url(cohort: dict[str, Any], url: str) -> dict[str, Any] | None:
    path = urlparse(url).path.rstrip("/") or "/"
    for asset in cohort.get("assets") or []:
        if asset.get("canonical") == url:
            return asset
        permalink = asset.get("permalink")
        if permalink:
            perm_path = urlparse(str(permalink)).path.rstrip("/") or str(permalink).rstrip("/")
            if perm_path == path or str(permalink).rstrip("/") == url.rstrip("/"):
                return asset
        if asset.get("fixture") and path.startswith("/internal/data-desk"):
            return asset
    return None


def classify_url(
    url: str,
    *,
    allowlist: list[str],
    cohort: dict[str, Any],
    inspected: dict[str, Any] | None,
) -> dict[str, Any]:
    try:
        normalized = normalize_canonical(url)
    except IndexNowPrepareError as exc:
        return {"url": url, "accepted": False, "reason": str(exc).split(":", 1)[0], "state": None}
    asset = _asset_for_url(cohort, normalized)
    if asset is not None and is_fixture(asset):
        return {"url": normalized, "accepted": False, "reason": "fixture", "state": None}
    if asset is not None and (
        asset.get("index_intent") == "DO_NOT_INDEX" or asset.get("noindex") is True
    ):
        return {"url": normalized, "accepted": False, "reason": "noindex", "state": None}
    if inspected is not None and robots_is_noindex(inspected.get("robots_meta")):
        return {"url": normalized, "accepted": False, "reason": "noindex", "state": None}
    if normalized not in allowlist:
        return {"url": normalized, "accepted": False, "reason": "not_on_allowlist", "state": None}
    return {"url": normalized, "accepted": True, "reason": "ok", "state": None}


def load_receipts(store: Path) -> list[dict[str, Any]]:
    if not store.is_dir():
        return []
    rows: list[dict[str, Any]] = []
    for path in sorted(store.glob("*.json")):
        try:
            rows.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return rows


def receipt_path(store: Path, key: str) -> Path:
    return store / f"{key}.json"


def prepare(
    urls: list[str],
    *,
    state: str = "changed",
    root: Path | None = None,
    receipts_dir: Path | None = None,
    dry_run: bool = True,
    send: bool = False,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Prepare an IndexNow notification. Default is dry-run and never POSTs."""
    validate_change_state(state)
    root = root or repo_root()
    if send and not dry_run:
        raise IndexNowPrepareError("send_forbidden_without_human_gate")
    if send:
        raise IndexNowPrepareError("send_flag_not_implemented_on_this_path")
    if len(urls) > MAX_URLS_PER_PREPARE:
        raise IndexNowPrepareError(f"rate_limit_exceeded:{len(urls)}>{MAX_URLS_PER_PREPARE}")

    cohort = load_cohort(root=root)
    allowlist_doc = load_allowlist(root=root)
    allowlist = [str(u) for u in allowlist_doc.get("urls") or []]
    stamp = generated_at or cohort.get("generated_at") or "1970-01-01T00:00:00Z"

    rejected: list[dict[str, Any]] = []
    accepted: list[str] = []
    for raw in urls:
        inspected = None
        asset = None
        try:
            normalized_guess = str(raw).strip()
        except Exception:
            normalized_guess = str(raw)
        for item in cohort.get("assets") or []:
            if item.get("canonical") == normalized_guess:
                asset = item
                inspected = inspect_asset(item, root=root)
                break
        verdict = classify_url(
            raw, allowlist=allowlist, cohort=cohort, inspected=inspected
        )
        if verdict["accepted"]:
            accepted.append(verdict["url"])
        else:
            rejected.append(verdict)

    # stable unique accepted
    seen: set[str] = set()
    unique_accepted: list[str] = []
    for url in accepted:
        if url not in seen:
            seen.add(url)
            unique_accepted.append(url)

    key = idempotency_key(unique_accepted, state) if unique_accepted else idempotency_key([], state)
    store = receipts_dir or (root / DEFAULT_RECEIPTS_REL)
    store.mkdir(parents=True, exist_ok=True)
    path = receipt_path(store, key)
    existing = None
    if path.is_file():
        existing = json.loads(path.read_text(encoding="utf-8"))

    meaning = receipt_meaning()
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "idempotency_key": key,
        "dry_run": True,
        "sent": False,
        "http_post": False,
        "endpoint_called": False,
        "endpoint": INDEXNOW_ENDPOINT,
        "indexation": meaning["indexation"],
        "meaning": meaning["meaning"],
        "note": meaning["note"],
        "state": state if unique_accepted else UNKNOWN,
        "urls": unique_accepted,
        "rejected": rejected,
        "rate_limit": {
            "max_urls_per_prepare": MAX_URLS_PER_PREPARE,
            "submitted_url_count": len(unique_accepted),
        },
        "generated_at": stamp if existing is None else existing.get("generated_at", stamp),
        "idempotent_replay": existing is not None,
        "asset_used": asset.get("id") if asset else None,
    }
    if existing is None:
        path.write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        receipt["stored"] = True
        receipt["receipt_path"] = str(path)
    else:
        # Return the stored receipt plus this-call rejected list (may differ if
        # extra rejected URLs were supplied). Idempotent body for accepted set.
        replay = dict(existing)
        replay["idempotent_replay"] = True
        replay["rejected"] = rejected
        replay["stored"] = True
        replay["receipt_path"] = str(path)
        replay["dry_run"] = True
        replay["sent"] = False
        replay["http_post"] = False
        replay["endpoint_called"] = False
        replay["indexation"] = False
        return replay

    receipt["stored"] = True
    receipt["receipt_path"] = str(path)
    return receipt


def format_prepare(receipt: dict[str, Any]) -> str:
    lines = [
        "INDEXNOW PREPARE",
        f"dry_run: {str(receipt.get('dry_run')).lower()}",
        f"sent: {str(receipt.get('sent')).lower()}",
        f"http_post: {str(receipt.get('http_post')).lower()}",
        f"endpoint_called: {str(receipt.get('endpoint_called')).lower()}",
        f"indexation: {str(receipt.get('indexation')).lower()}",
        f"meaning: {receipt.get('meaning')}",
        f"state: {receipt.get('state')}",
        f"idempotency_key: {receipt.get('idempotency_key')}",
        f"idempotent_replay: {str(receipt.get('idempotent_replay')).lower()}",
        "",
        "ACCEPTED",
    ]
    if not receipt.get("urls"):
        lines.append("  (none)")
    for url in receipt.get("urls") or []:
        lines.append(f"  - {url}")
    lines.extend(["", "REJECTED"])
    if not receipt.get("rejected"):
        lines.append("  (none)")
    for row in receipt.get("rejected") or []:
        lines.append(f"  - {row.get('url')} reason={row.get('reason')}")
    lines.append("")
    return "\n".join(lines)
