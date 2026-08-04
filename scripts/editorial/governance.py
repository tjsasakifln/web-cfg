"""Fail-closed governance helpers for human approval.

Used by approve_cli, review CLI wrappers, and tests. Pure functions, no I/O
except env inspection for CI/automation markers.
"""

from __future__ import annotations

import os
import re
from typing import Iterable

# Reviewer strings that are automated / non-human
BLOCKED_REVIEWER_PATTERNS = (
    r"^editorial-wave1-operator$",
    r"^ci[-_]",
    r"^bot[-_]",
    r"^auto[-_]",
    r"operator$",
    r"^test-",
    r"^tester$",
    r"^system$",
    r"^pipeline$",
    r"^github-actions$",
    r"^dependabot$",
    r"^grok$",
    r"^agent$",
    r"^llm$",
    r"^automation$",
)

EDITORIAL_CHECKLIST_KEYS = (
    "sources_verified",
    "legal_devices_checked",
    "naturalness_ok",
    "cta_contextual",
    "no_fictitious_authorship",
    "cannibalization_resolved_or_blocked",
    "material_hash_confirmed",
    "no_indecent_promise",
)

PSEO_CHECKLIST_KEYS = (
    "sample_independence_verified",
    "no_internal_slugs",
    "sources_checked",
    "claims_have_direct_evidence",
    "no_duplicates_in_tables",
    "meta_description_complete",
    "cannibalization_checked",
    "cta_contextual",
)


def is_blocked_reviewer(reviewer: str | None) -> bool:
    r = (reviewer or "").strip().lower()
    if not r or len(r) < 3:
        return True
    return any(re.search(p, r, re.I) for p in BLOCKED_REVIEWER_PATTERNS)


def is_automation_environment(env: dict[str, str] | None = None) -> bool:
    """True when running under CI or agent automation, approval forbidden."""
    e = env if env is not None else os.environ
    markers = (
        "GITHUB_ACTIONS",
        "CI",
        "GITLAB_CI",
        "CIRCLECI",
        "BUILDKITE",
        "TF_BUILD",
        "PSEO_AUTOMATION",
        "EDITORIAL_AUTOMATION",
        "AGENT_APPROVAL_BLOCKED",
    )
    for m in markers:
        v = (e.get(m) or "").strip().lower()
        if v in {"1", "true", "yes"}:
            return True
    if (e.get("GITHUB_ACTIONS") or "").strip():
        return True
    return False


def human_approval_explicitly_allowed(env: dict[str, str] | None = None) -> bool:
    """True only when a named human set ALLOW_HUMAN_APPROVAL=1 outside CI."""
    e = env if env is not None else os.environ
    if is_automation_environment(e):
        return False
    return (e.get("ALLOW_HUMAN_APPROVAL") or "").strip() == "1"


def missing_checklist(
    provided: Iterable[str] | dict | None,
    required: Iterable[str] = EDITORIAL_CHECKLIST_KEYS,
) -> list[str]:
    if provided is None:
        have: set[str] = set()
    elif isinstance(provided, dict):
        have = {k for k, v in provided.items() if v}
    else:
        have = {str(x).strip() for x in provided if str(x).strip()}
    return sorted(set(required) - have)


def validate_approval_request(
    *,
    reviewer: str | None,
    notes: str | None,
    checklist: Iterable[str] | dict | None,
    page_ids: list[str],
    confirm: bool,
    material_hash_expected: str | None = None,
    material_hash_actual: str | None = None,
    page_status: str | None = None,
    required_checklist: Iterable[str] = EDITORIAL_CHECKLIST_KEYS,
    env: dict[str, str] | None = None,
    min_notes_len: int = 20,
    require_material_hash: bool = True,
    require_allow_human_approval: bool = True,
) -> list[str]:
    """Return error codes; empty list means request may proceed.

    Fail-closed: CI/automation blocked; ALLOW_HUMAN_APPROVAL=1 required;
    material hash required and must match when require_material_hash is True.
    """
    errors: list[str] = []
    e = env if env is not None else dict(os.environ)
    if is_automation_environment(e):
        errors.append("approval_blocked_in_ci_or_automation")
    if require_allow_human_approval and not human_approval_explicitly_allowed(e):
        errors.append("allow_human_approval_required")
    if is_blocked_reviewer(reviewer):
        errors.append(f"reviewer_not_human:{reviewer!r}")
    if not notes or len(notes.strip()) < min_notes_len:
        errors.append("approval_notes_too_short")
    miss = missing_checklist(checklist, required_checklist)
    if miss:
        errors.append(f"checklist_incomplete:{miss}")
    if len(page_ids) != 1:
        errors.append("bulk_approval_forbidden")
    if not confirm:
        errors.append("individual_confirm_required")
    if page_status == "REJECTED":
        errors.append("cannot_approve_rejected")
    if require_material_hash:
        exp = (material_hash_expected or "").strip()
        act = (material_hash_actual or "").strip()
        if not exp:
            errors.append("material_hash_flag_required")
        elif not act:
            errors.append("material_hash_required")
        elif exp != act:
            errors.append("approval_hash_mismatch")
    else:
        if material_hash_expected and material_hash_actual:
            if material_hash_expected != material_hash_actual:
                errors.append("approval_hash_mismatch")
        elif material_hash_expected and not material_hash_actual:
            errors.append("material_hash_required")
    return errors
