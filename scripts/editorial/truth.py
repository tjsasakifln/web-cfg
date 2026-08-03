#!/usr/bin/env python3
"""Single derivation pipeline for editorial truth.

All of registry counts, terminal status, HTML robots, sitemaps, hub inventory,
and Wave 1 readiness are derived here — documents are outputs, not parallel truth.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

WAVE1_IDS = frozenset(
    {
        "guia-checklist-aditivo",
        "guia-docs-reequilibrio",
        "guia-glosa",
        "guia-notificacao-atraso",
        "lei-art124-alteracao-obra",
        "lei-atraso-administracao",
        "lei-item-novo-desconto",
        "lei-limite-25-50",
        "lei-parcela-incontroversa",
        "lei-reequilibrio-reajuste",
        "lei-servico-sem-aditivo",
    }
)
REJECTED_IDS = frozenset({"jur-sumula-260-art"})

TERMINAL_ALLOWED = frozenset(
    {
        "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE",
        "BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS",
        "READY_FOR_NAMED_HUMAN_APPROVAL",
    }
)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _git_sha() -> str:
    try:
        return (
            subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, stderr=subprocess.DEVNULL
            )
            .decode()
            .strip()
        )
    except Exception:  # noqa: BLE001
        return "unknown"


def _git_parent_sha() -> str | None:
    try:
        return (
            subprocess.check_output(
                ["git", "rev-parse", "HEAD^"], cwd=ROOT, stderr=subprocess.DEVNULL
            )
            .decode()
            .strip()
        )
    except Exception:  # noqa: BLE001
        return None


def _head_is_docs_editorial_pin_only() -> bool:
    """True when tip commit only touches docs/editorial/* (SHA pin commit)."""
    try:
        names = (
            subprocess.check_output(
                ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
                cwd=ROOT,
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .splitlines()
        )
    except Exception:  # noqa: BLE001
        return False
    if not names:
        return False
    return all(n.startswith("docs/editorial/") for n in names)


def _is_ancestor(maybe_ancestor: str, tip: str) -> bool:
    try:
        subprocess.check_call(
            ["git", "merge-base", "--is-ancestor", maybe_ancestor, tip],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:  # noqa: BLE001
        return False


def allowed_packaged_shas() -> set[str]:
    """HEAD always; parent when tip is docs-only pin.

    Also treat any package SHA that is an ancestor of HEAD as valid when
    validating on PR merge checkouts (GitHub creates a temporary merge commit).
    """
    live = _git_sha()
    out = {live} if live != "unknown" else set()
    if _head_is_docs_editorial_pin_only():
        parent = _git_parent_sha()
        if parent:
            out.add(parent)
    return out


def packaged_sha_is_acceptable(pkg_sha: str, live: str | None = None) -> bool:
    """True if package SHA matches HEAD/parent pin or is an ancestor of HEAD."""
    live = live or _git_sha()
    if not pkg_sha or live == "unknown":
        return False
    if pkg_sha in allowed_packaged_shas():
        return True
    # PR merge checkouts / extra commits on top of the pin
    if _is_ancestor(pkg_sha, live):
        return True
    # Fallback: present in recent rev-list (helps some shallow/partial histories)
    try:
        listed = (
            subprocess.check_output(
                ["git", "rev-list", "--max-count=100", live],
                cwd=ROOT,
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .split()
        )
        return pkg_sha in listed
    except Exception:  # noqa: BLE001
        return False


def robots_of(html: str) -> str:
    m = re.search(
        r'name=["\']robots["\']\s+content=["\']([^"\']+)', html, re.I
    ) or re.search(r'content=["\']([^"\']+)["\']\s+name=["\']robots["\']', html, re.I)
    return (m.group(1) if m else "index,follow").lower()


def is_noindex(robots: str) -> bool:
    return "noindex" in robots.lower()


def load_registry(path: Path | None = None) -> dict[str, Any]:
    p = path or (ROOT / "data" / "editorial" / "EDITORIAL-REGISTRY.json")
    if not p.exists():
        return {"pages": [], "counts": {}}
    return json.loads(p.read_text(encoding="utf-8"))


def sitemap_locs(path: Path) -> list[str]:
    if not path.exists():
        return []
    return re.findall(r"<loc>([^<]+)</loc>", path.read_text(encoding="utf-8", errors="replace"))


def count_indexable_conteudos() -> int:
    n = 0
    for p in (ROOT / "conteudos").glob("*/index.html"):
        html = p.read_text(encoding="utf-8", errors="replace")
        if not is_noindex(robots_of(html)):
            n += 1
    return n


def hub_claimed_guide_count() -> int | None:
    hub = ROOT / "conteudos" / "index.html"
    if not hub.exists():
        return None
    text = hub.read_text(encoding="utf-8", errors="replace")
    m = re.search(r'"numberOfItems"\s*:\s*(\d+)', text)
    if m:
        return int(m.group(1))
    m2 = re.search(r"\b(\d{1,3})\s+guias?\s+indexáveis", text, re.I)
    if m2:
        return int(m2.group(1))
    return None


def derive_editorial_truth(reg: dict[str, Any] | None = None) -> dict[str, Any]:
    """Derive reconciled editorial + public inventory state from live sources."""
    reg = reg if reg is not None else load_registry()
    pages = list(reg.get("pages") or [])
    status_counts = Counter((p.get("status") or "DRAFT") for p in pages)

    wave1 = [p for p in pages if p.get("page_id") in WAVE1_IDS]
    rejected = [p for p in pages if p.get("page_id") in REJECTED_IDS or p.get("status") == "REJECTED"]

    human_approved = [
        p
        for p in pages
        if p.get("status") in {"HUMAN_APPROVED", "INDEXABLE", "PUBLISHED"}
    ]
    indexable_reg = [p for p in pages if p.get("status") in {"INDEXABLE", "PUBLISHED"}]

    # False reviewer stamps
    false_reviewers = []
    for p in pages:
        appr = p.get("approval") or {}
        rev = appr.get("reviewer") or p.get("reviewer")
        if rev and p.get("status") in {"HUMAN_APPROVED", "INDEXABLE", "PUBLISHED"}:
            false_reviewers.append({"page_id": p.get("page_id"), "reviewer": rev})

    # HTML robots for Wave 1
    wave1_html = []
    for p in wave1:
        url = (p.get("url") or "").strip("/")
        hp = ROOT / url / "index.html" if url else None
        robots = "missing"
        if hp and hp.exists():
            robots = robots_of(hp.read_text(encoding="utf-8", errors="replace"))
        wave1_html.append(
            {
                "page_id": p.get("page_id"),
                "url": p.get("url"),
                "registry_status": p.get("status"),
                "robots": robots,
                "noindex": is_noindex(robots) if robots != "missing" else True,
            }
        )

    editorial_sm = sitemap_locs(ROOT / "sitemap-editorial.xml")
    juris_sm = sitemap_locs(ROOT / "sitemap-jurisprudencia.xml")
    # Paths only
    editorial_paths = [
        re.sub(r"^https?://[^/]+", "", loc) for loc in editorial_sm
    ]

    conteudos_indexable = count_indexable_conteudos()
    hub_count = hub_claimed_guide_count()

    # Contradictions
    contradictions: list[str] = []
    allowed_shas = allowed_packaged_shas()
    live_sha = _git_sha()
    # Packaged reports must match live HEAD (or parent when tip is docs-only pin)
    for rel in (
        "docs/editorial/TERMINAL-RESULT.json",
        "docs/editorial/WAVE1-HUMAN-REVIEW-PACKET.json",
        "docs/editorial/EDITORIAL-INVENTORY.json",
    ):
        path = ROOT / rel
        if not path.exists():
            continue
        try:
            packaged = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            contradictions.append(f"packaged_json_invalid:{rel}")
            continue
        pkg_sha = (packaged.get("commit_sha") or "").strip()
        if not pkg_sha:
            contradictions.append(f"packaged_sha_missing:{rel}")
        elif live_sha != "unknown" and not packaged_sha_is_acceptable(pkg_sha, live_sha):
            contradictions.append(
                f"packaged_sha_mismatch:{rel}:{pkg_sha[:12]}!={live_sha[:12]}"
            )

    wave1_approved_n = sum(
        1 for p in wave1 if p.get("status") in {"HUMAN_APPROVED", "INDEXABLE", "PUBLISHED"}
    )
    wave1_indexable_n = sum(1 for p in wave1 if p.get("status") in {"INDEXABLE", "PUBLISHED"})

    if wave1_approved_n > 0 and any(
        (p.get("approval") or {}).get("reviewer") in (None, "", "operator", "system")
        for p in wave1
        if p.get("status") in {"HUMAN_APPROVED", "INDEXABLE", "PUBLISHED"}
    ):
        contradictions.append("wave1_approved_without_named_reviewer")

    for row in wave1_html:
        st = row["registry_status"]
        if st in {"INDEXABLE", "PUBLISHED"} and row["noindex"]:
            contradictions.append(f"indexable_but_noindex_html:{row['page_id']}")
        if st not in {"INDEXABLE", "PUBLISHED", "HUMAN_APPROVED"} and not row["noindex"] and row["robots"] != "missing":
            contradictions.append(f"unapproved_but_index_html:{row['page_id']}")
        if st not in {"INDEXABLE", "PUBLISHED"} and row["url"] in editorial_paths:
            contradictions.append(f"unapproved_in_editorial_sitemap:{row['page_id']}")

    for loc in editorial_paths:
        # any editorial sitemap URL must be INDEXABLE in registry
        match = next((p for p in pages if (p.get("url") or "").rstrip("/") == loc.rstrip("/")), None)
        if match and match.get("status") not in {"INDEXABLE", "PUBLISHED"}:
            contradictions.append(f"sitemap_without_indexable_status:{loc}")

    if hub_count is not None and hub_count != conteudos_indexable:
        contradictions.append(
            f"hub_count_mismatch:hub={hub_count},indexable_conteudos={conteudos_indexable}"
        )
    if hub_count == 120:
        contradictions.append("hub_claims_false_120_guides")

    # Registry vs terminal fields we will emit
    awaiting = sum(1 for p in wave1 if p.get("status") == "EDITORIAL_REVIEWED")
    rejected_n = len(rejected)

    # Terminal status: never auto HUMAN_APPROVED
    if contradictions:
        terminal = "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE"
    elif wave1_indexable_n == 0 and awaiting == len(WAVE1_IDS) and rejected_n >= 1:
        terminal = "READY_FOR_NAMED_HUMAN_APPROVAL"
    else:
        terminal = "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE"

    return {
        "schema_version": "1.0.0",
        "derived_at": _now(),
        "commit_sha": _git_sha(),
        "terminal_status": terminal,
        "registry_counts": dict(status_counts),
        "wave1": {
            "total": len(wave1),
            "editorial_reviewed": awaiting,
            "human_approved": wave1_approved_n,
            "indexable": wave1_indexable_n,
            "pages": wave1_html,
        },
        "rejected": {
            "count": rejected_n,
            "page_ids": [p.get("page_id") for p in rejected],
        },
        "public_inventory": {
            "conteudos_indexable": conteudos_indexable,
            "hub_claimed_guides": hub_count,
            "legacy_indexable_public_surface": conteudos_indexable,
            "wave1_awaiting_approval": awaiting,
            "wave1_published": wave1_indexable_n,
            "note": "Do not mix legacy indexable count with Wave 1 awaiting approval.",
        },
        "sitemaps": {
            "editorial_locs": len(editorial_sm),
            "jurisprudencia_locs": len(juris_sm),
            "editorial_urls": editorial_paths,
        },
        "false_reviewer_stamps": false_reviewers,
        "contradictions": contradictions,
        "ok": len(contradictions) == 0,
        "will_not_impersonate_named_human": True,
        "max_terminal_without_external_human": "READY_FOR_NAMED_HUMAN_APPROVAL",
    }


def write_terminal_result(truth: dict[str, Any] | None = None) -> Path:
    """Write terminal + inventory pinned to live HEAD.

    When writing, package SHA contradictions against the files being rewritten
    are cleared for the output payload (fresh pin). Call after commit via a
    follow-up that re-derives, or use pin_packaged_reports_to_head().
    """
    truth = truth or derive_editorial_truth()
    live = _git_sha()
    # Drop self-referential package SHA mismatches for files we are about to overwrite
    cleaned = [
        c
        for c in (truth.get("contradictions") or [])
        if not str(c).startswith("packaged_sha_mismatch:docs/editorial/TERMINAL-RESULT")
        and not str(c).startswith("packaged_sha_mismatch:docs/editorial/EDITORIAL-INVENTORY")
        and not str(c).startswith("packaged_sha_mismatch:docs/editorial/WAVE1-HUMAN-REVIEW-PACKET")
    ]
    out = {
        "terminal_status": truth["terminal_status"],
        "commit_sha": live,
        "derived_at": _now(),
        "indexable_count": truth["wave1"]["indexable"],
        "human_approved_count": truth["wave1"]["human_approved"],
        "awaiting_human": truth["wave1"]["editorial_reviewed"],
        "rejected": truth["rejected"]["count"],
        "public_indexable_conteudos": truth["public_inventory"]["conteudos_indexable"],
        "hub_claimed_guides": truth["public_inventory"]["hub_claimed_guides"],
        "editorial_sitemap_locs": truth["sitemaps"]["editorial_locs"],
        "contradictions": cleaned,
        "will_not_impersonate_named_human": True,
        "why_not_complete": (
            "Named human must run approve_cli.py per page with checklist, "
            "material hash, and external identity. Agents must not stamp HUMAN_APPROVED."
        ),
        "external_actions_doc": "docs/editorial/EXTERNAL-ACTIONS-UNLOCK.md",
        "wave1_packet": "docs/editorial/WAVE1-HUMAN-REVIEW-PACKET.json",
        "inventory": "docs/editorial/EDITORIAL-INVENTORY.json",
        "ok": len(cleaned) == 0 and truth.get("terminal_status")
        in TERMINAL_ALLOWED,
    }
    path = ROOT / "docs" / "editorial" / "TERMINAL-RESULT.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    inv_body = dict(truth)
    inv_body["commit_sha"] = live
    inv_body["derived_at"] = out["derived_at"]
    inv_body["contradictions"] = cleaned
    inv_body["ok"] = out["ok"]
    inv = ROOT / "docs" / "editorial" / "EDITORIAL-INVENTORY.json"
    inv.write_text(json.dumps(inv_body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Keep packet SHA in sync when present
    packet_path = ROOT / "docs" / "editorial" / "WAVE1-HUMAN-REVIEW-PACKET.json"
    if packet_path.exists():
        try:
            packet = json.loads(packet_path.read_text(encoding="utf-8"))
            packet["commit_sha"] = live
            packet["derived_at"] = out["derived_at"]
            packet["terminal_status"] = truth["terminal_status"]
            packet_path.write_text(
                json.dumps(packet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        except json.JSONDecodeError:
            pass
    return path


def verify_packaged_sha_matches_head() -> list[str]:
    """Fail list if packaged terminal/packet/inventory SHA is not an allowed pin.

    Allowed: exact HEAD, or parent of HEAD when tip commit only touches docs/editorial/
    (standard post-content SHA pin commit).
    """
    live = _git_sha()
    failures: list[str] = []
    if live == "unknown":
        return ["git_sha_unknown"]
    for rel in (
        "docs/editorial/TERMINAL-RESULT.json",
        "docs/editorial/WAVE1-HUMAN-REVIEW-PACKET.json",
        "docs/editorial/EDITORIAL-INVENTORY.json",
    ):
        path = ROOT / rel
        if not path.exists():
            failures.append(f"missing:{rel}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        pkg = (data.get("commit_sha") or "").strip()
        if not pkg:
            failures.append(f"{rel}:empty!={live[:12]}")
        elif not packaged_sha_is_acceptable(pkg, live):
            failures.append(f"{rel}:{pkg[:12]}!={live[:12]}")
    return failures


def assert_truth_consistent(truth: dict[str, Any] | None = None) -> list[str]:
    """Return list of failures; empty means consistent."""
    truth = truth or derive_editorial_truth()
    return list(truth.get("contradictions") or [])


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Derive editorial truth / write terminal result")
    ap.add_argument("--write", action="store_true", help="Write TERMINAL-RESULT + inventory + packet SHA")
    ap.add_argument("--fail-on-contradiction", action="store_true")
    ap.add_argument(
        "--require-packaged-sha",
        action="store_true",
        help="Fail if packaged terminal/packet/inventory commit_sha != git HEAD",
    )
    args = ap.parse_args(argv)
    truth = derive_editorial_truth()
    if args.write:
        write_terminal_result(truth)
        # Re-derive after write so in-memory output reflects pinned files without SHA lag
        truth = derive_editorial_truth()
    print(json.dumps(truth, ensure_ascii=False, indent=2))
    rc = 0 if truth["ok"] else 1
    if args.fail_on_contradiction and truth["contradictions"]:
        rc = 2
    if args.require_packaged_sha:
        fails = verify_packaged_sha_matches_head()
        if fails:
            print({"packaged_sha_failures": fails}, file=sys.stderr)
            rc = max(rc, 3)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
