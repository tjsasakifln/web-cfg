"""Hash-bound frozen patches. Never ``git apply``. Default mutate=False."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Any

from scripts.bofu_dominance.frozen_specs.constants import (
    CORRESPONDING_ISSUE,
    EARLIEST_SAFE_ACTION_AT,
    PATCH_FORMAT,
    html_path,
    patch_path,
    pillar_by_slug,
)
from scripts.bofu_dominance.frozen_specs.gate import evaluate_gate
from scripts.bofu_dominance.frozen_specs.hashing import content_sha256, sha256_bytes

HEADER_END = "---DIFF---"
REPL_SEP = "---REPLACEMENT---"
BEFORE_MARK = "<<<BEFORE\n"
AFTER_MARK = "===AFTER\n"


def parse_patch(text: str) -> dict[str, Any]:
    if HEADER_END not in text:
        raise ValueError("patch missing ---DIFF--- separator")
    header, rest = text.split(HEADER_END, 1)
    meta: dict[str, str] = {}
    for line in header.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip()
    replacements: list[dict[str, str]] = []
    chunks = rest.split(REPL_SEP)
    for chunk in chunks:
        chunk = chunk.strip("\n")
        if not chunk.strip():
            continue
        if BEFORE_MARK not in chunk or AFTER_MARK not in chunk:
            continue
        before_part, after_part = chunk.split(AFTER_MARK, 1)
        before = before_part.split(BEFORE_MARK, 1)[1]
        if before.endswith("\n"):
            before = before[:-1]
        if after_part.endswith("\n"):
            after_part = after_part[:-1]
        replacements.append({"before": before, "after": after_part})
    return {
        "format": meta.get("format", ""),
        "path": meta.get("path", ""),
        "slug": meta.get("slug", ""),
        "content_sha256": meta.get("content_sha256", ""),
        "earliest_safe_action_at": meta.get("earliest_safe_action_at", ""),
        "corresponding_issue": int(meta.get("corresponding_issue") or CORRESPONDING_ISSUE),
        "html_mutation_authorized": meta.get("html_mutation_authorized", "false").lower()
        == "true",
        "replacements": replacements,
        "raw_header": header,
    }


def render_patch(
    *,
    slug: str,
    content_hash: str,
    replacements: list[dict[str, str]],
    earliest: str | None = None,
    html_mutation_authorized: bool = False,
) -> str:
    pillar = pillar_by_slug(slug)
    lines = [
        f"format: {PATCH_FORMAT}",
        f"slug: {slug}",
        f"path: {pillar['html_rel']}",
        f"content_sha256: {content_hash}",
        f"earliest_safe_action_at: {earliest or EARLIEST_SAFE_ACTION_AT.isoformat()}",
        f"corresponding_issue: {CORRESPONDING_ISSUE}",
        f"html_mutation_authorized: {str(html_mutation_authorized).lower()}",
        "do_not_git_apply: true",
        HEADER_END,
    ]
    body = "\n".join(lines) + "\n"
    for item in replacements:
        body += (
            f"{REPL_SEP}\n"
            f"{BEFORE_MARK}{item['before']}\n"
            f"{AFTER_MARK}{item['after']}\n"
        )
    return body


def apply_replacements_in_memory(html: str, replacements: list[dict[str, str]]) -> str:
    out = html
    for item in replacements:
        before = item["before"]
        after = item["after"]
        if before not in out:
            raise ValueError(f"replacement before-string not found: {before[:80]!r}")
        out = out.replace(before, after)
    return out


def apply_frozen_patch(
    slug: str,
    *,
    root: Path | None = None,
    mutate: bool = False,
    now: date | datetime | str | None = None,
    evidential_close: bool | None = None,
    patch_text: str | None = None,
    unlock_plan: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Apply only through the active gate and an authorized patch header."""
    path = html_path(slug, root)
    live_hash = content_sha256(path)
    text = patch_text if patch_text is not None else patch_path(slug).read_text(encoding="utf-8")
    parsed = parse_patch(text)
    gate = evaluate_gate(
        now=now,
        evidential_close=evidential_close,
        earliest_safe_action_at=parsed.get("earliest_safe_action_at") or None,
        unlock_plan=unlock_plan,
    )
    hash_match = parsed["content_sha256"] == live_hash
    original = path.read_text(encoding="utf-8")
    would_html = original
    replacement_ok = True
    error = ""
    try:
        would_html = apply_replacements_in_memory(original, parsed["replacements"])
    except ValueError as exc:
        replacement_ok = False
        error = str(exc)
    would_mutate = would_html != original
    refused = True
    reason = gate["reason"]
    html_mutation = False
    if not hash_match:
        reason = "hash_mismatch"
    elif not replacement_ok:
        reason = "replacement_not_found"
    elif not gate["gate_open"]:
        reason = "before_gate"
    elif not parsed["html_mutation_authorized"]:
        reason = "patch_not_authorized"
    elif not mutate:
        reason = "mutate_false_prepare_only"
    else:
        refused = False
        reason = "applied"
        path.write_text(would_html, encoding="utf-8")
        html_mutation = content_sha256(path) != live_hash

    return {
        "slug": slug,
        "refused": refused,
        "reason": reason,
        "html_mutation": html_mutation,
        "apply_refused_before_gate": (not gate["gate_open"]),
        "gate_open": gate["gate_open"],
        "hash_match": hash_match,
        "live_sha256": live_hash,
        "patch_sha256": parsed["content_sha256"],
        "would_mutate": would_mutate if replacement_ok else False,
        "mutate": mutate,
        "error": error,
        "earliest_safe_action_at": gate["earliest_safe_action_at"],
        "evidential_close": gate["evidential_close"],
        "html_mutation_authorized": parsed["html_mutation_authorized"],
        "would_sha256": sha256_bytes(would_html.encode("utf-8")) if replacement_ok else "",
    }


def write_patch_file(slug: str, replacements: list[dict[str, str]], root: Path | None = None) -> Path:
    path = html_path(slug, root)
    digest = content_sha256(path)
    dest = patch_path(slug)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        render_patch(slug=slug, content_hash=digest, replacements=replacements),
        encoding="utf-8",
    )
    return dest
