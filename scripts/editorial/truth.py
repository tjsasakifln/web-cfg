#!/usr/bin/env python3
"""Single derivation pipeline for editorial truth.

All of registry counts, terminal status, HTML robots, sitemaps, hub inventory,
and Wave 1 readiness are derived here, documents are outputs, not parallel truth.
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


def _git_parents(sha: str = "HEAD") -> list[str]:
    """Return parent SHAs of a commit (empty for root)."""
    try:
        raw = (
            subprocess.check_output(
                ["git", "rev-parse", f"{sha}^@"],
                cwd=ROOT,
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .strip()
        )
        return [p for p in raw.splitlines() if p]
    except Exception:  # noqa: BLE001
        return []


def _commit_is_docs_editorial_pin_only(sha: str) -> bool:
    """True when commit *sha* only touches docs/editorial/*."""
    try:
        names = (
            subprocess.check_output(
                ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", sha],
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


def allowed_packaged_shas() -> set[str]:
    """Exact HEAD; if tip is docs-only pin, first parent is also allowed.

    Unbounded ancestors (e.g. pre-recovery main) are NOT allowed.
    """
    live = _git_sha()
    out = {live} if live != "unknown" else set()
    if _head_is_docs_editorial_pin_only():
        parent = _git_parent_sha()
        if parent:
            out.add(parent)
    return out


def packaged_sha_is_acceptable(
    pkg_sha: str, live: str | None = None, *, _depth: int = 0
) -> bool:
    """Accept package SHA only when tightly bound to current tip.

    Allowed:
      1. exact HEAD
      2. first parent of HEAD when HEAD is a docs/editorial-only pin commit
      3. PR merge-commit special-case (exactly 2 parents): package may equal
         the *second* parent (PR tip per GitHub merge convention), or that
         tip's first parent when the PR tip is itself a docs-only pin
      4. On a 2-parent merge, package may also be acceptable relative to the
         *first* parent (base/main). This covers Dependabot and other
         non-editorial PRs whose package JSON is unchanged from main while
         live is the ephemeral merge SHA. Depth-limited to avoid walking
         arbitrary history.

    Explicitly rejected: arbitrary ancestors (e.g. pre-recovery main).
    """
    live = live or _git_sha()
    if not pkg_sha or live == "unknown":
        return False
    if pkg_sha == live:
        return True
    # (2) docs-only pin on a normal branch tip
    if _head_is_docs_editorial_pin_only() or _commit_is_docs_editorial_pin_only(live):
        parents = _git_parents(live)
        if parents and pkg_sha == parents[0]:
            return True
    # (3) GitHub PR merge ref: two parents, base (main) then PR head.
    # Never accept first parent alone as a bare string match (would greenlight
    # pinning main without checking whether that pin is itself valid).
    parents = _git_parents(live)
    if len(parents) == 2:
        pr_tip = parents[1]
        if pkg_sha == pr_tip:
            return True
        if _commit_is_docs_editorial_pin_only(pr_tip):
            pr_parents = _git_parents(pr_tip)
            if pr_parents and pkg_sha == pr_parents[0]:
                return True
        # (4) Inherit base pin validity (Dependabot / chore PRs).
        # Depth allows walking a short chain of main merge-commits
        # (checkout bump → chrome bump → …) without accepting unbounded history.
        if _depth < 8 and packaged_sha_is_acceptable(
            pkg_sha, parents[0], _depth=_depth + 1
        ):
            return True
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

    terminal = compute_terminal_status(
        contradictions=contradictions,
        wave1_editorial_reviewed=awaiting,
        wave1_indexable=wave1_indexable_n,
        rejected_count=rejected_n,
    )

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


def compute_terminal_status(
    *,
    contradictions: list[str],
    wave1_editorial_reviewed: int,
    wave1_indexable: int,
    rejected_count: int,
) -> str:
    """Single rule for READY vs BLOCKED, never auto HUMAN_APPROVED.

    Never returns BLOCKED with empty contradictions when Wave1 is in the
    standard pre-approval shape (11 EDITORIAL_REVIEWED, 0 indexable, ≥1 rejected).
    """
    if contradictions:
        return "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE"
    if (
        wave1_indexable == 0
        and wave1_editorial_reviewed == len(WAVE1_IDS)
        and rejected_count >= 1
    ):
        return "READY_FOR_NAMED_HUMAN_APPROVAL"
    return "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE"


def _is_package_self_contra(code: str) -> bool:
    """True for contradictions about the three files write_terminal_result rewrites."""
    s = str(code)
    for prefix in (
        "packaged_sha_mismatch:docs/editorial/TERMINAL-RESULT",
        "packaged_sha_mismatch:docs/editorial/EDITORIAL-INVENTORY",
        "packaged_sha_mismatch:docs/editorial/WAVE1-HUMAN-REVIEW-PACKET",
        "packaged_sha_missing:docs/editorial/TERMINAL-RESULT",
        "packaged_sha_missing:docs/editorial/EDITORIAL-INVENTORY",
        "packaged_sha_missing:docs/editorial/WAVE1-HUMAN-REVIEW-PACKET",
        "packaged_json_invalid:docs/editorial/TERMINAL-RESULT",
        "packaged_json_invalid:docs/editorial/EDITORIAL-INVENTORY",
        "packaged_json_invalid:docs/editorial/WAVE1-HUMAN-REVIEW-PACKET",
    ):
        if s.startswith(prefix):
            return True
    return False


def write_terminal_result(truth: dict[str, Any] | None = None) -> Path:
    """Write terminal + inventory + packet pinned to live HEAD.

    Recomputes terminal_status from the cleaned contradiction list (package-self
    SHA mismatches dropped because those files are being rewritten). Never writes
    BLOCKED with empty contradictions when Wave1 is READY-shaped.
    """
    truth = truth or derive_editorial_truth()
    live = _git_sha()
    cleaned = [c for c in (truth.get("contradictions") or []) if not _is_package_self_contra(c)]
    terminal = compute_terminal_status(
        contradictions=cleaned,
        wave1_editorial_reviewed=int(truth["wave1"]["editorial_reviewed"]),
        wave1_indexable=int(truth["wave1"]["indexable"]),
        rejected_count=int(truth["rejected"]["count"]),
    )
    # Invariant: never BLOCKED + empty contras + ok when READY-shaped
    ok = len(cleaned) == 0 and terminal in TERMINAL_ALLOWED
    if not cleaned and terminal == "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE":
        # Defensive: if Wave1 is READY-shaped, force READY
        terminal = compute_terminal_status(
            contradictions=[],
            wave1_editorial_reviewed=int(truth["wave1"]["editorial_reviewed"]),
            wave1_indexable=int(truth["wave1"]["indexable"]),
            rejected_count=int(truth["rejected"]["count"]),
        )
        ok = terminal in TERMINAL_ALLOWED

    out = {
        "terminal_status": terminal,
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
        "ok": ok,
    }
    path = ROOT / "docs" / "editorial" / "TERMINAL-RESULT.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    inv_body = dict(truth)
    inv_body["commit_sha"] = live
    inv_body["derived_at"] = out["derived_at"]
    inv_body["contradictions"] = cleaned
    inv_body["terminal_status"] = terminal
    inv_body["ok"] = ok
    inv = ROOT / "docs" / "editorial" / "EDITORIAL-INVENTORY.json"
    inv.write_text(json.dumps(inv_body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    packet_path = ROOT / "docs" / "editorial" / "WAVE1-HUMAN-REVIEW-PACKET.json"
    if packet_path.exists():
        try:
            packet = json.loads(packet_path.read_text(encoding="utf-8"))
            packet["commit_sha"] = live
            packet["derived_at"] = out["derived_at"]
            packet["terminal_status"] = terminal
            if "summary" in packet and isinstance(packet["summary"], dict):
                packet["summary"]["human_approved"] = truth["wave1"]["human_approved"]
                packet["summary"]["indexable"] = truth["wave1"]["indexable"]
                packet["summary"]["awaiting_human"] = truth["wave1"]["editorial_reviewed"]
                packet["summary"]["rejected"] = truth["rejected"]["count"]
            packet_path.write_text(
                json.dumps(packet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        except json.JSONDecodeError:
            pass
    return path


def verify_packaged_sha_matches_head() -> list[str]:
    """Fail list if packaged terminal/packet/inventory SHA is not an allowed pin."""
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


def verify_packaged_matches_live(truth: dict[str, Any] | None = None) -> list[str]:
    """Fail if packaged terminal/inventory/packet lag live derive on material fields.

    Checks terminal_status, ok, contradictions emptiness, Wave1 counts, hub count.
    SHA pin rules remain separate (verify_packaged_sha_matches_head).
    """
    truth = truth or derive_editorial_truth()
    failures: list[str] = []
    term_path = ROOT / "docs" / "editorial" / "TERMINAL-RESULT.json"
    if not term_path.exists():
        return ["missing:docs/editorial/TERMINAL-RESULT.json"]
    term = json.loads(term_path.read_text(encoding="utf-8"))
    live_status = truth["terminal_status"]
    pkg_status = term.get("terminal_status")
    if pkg_status != live_status:
        failures.append(f"terminal_status:{pkg_status}!={live_status}")
    # Never allow BLOCKED with empty contras and ok=true (write-path bug signature)
    pkg_contras = term.get("contradictions") or []
    if (
        pkg_status == "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE"
        and not pkg_contras
        and term.get("ok") is True
    ):
        failures.append("terminal_blocked_empty_contras_ok_true")
    if bool(term.get("ok")) != bool(truth.get("ok")) and not pkg_contras and not truth.get(
        "contradictions"
    ):
        # Only flag ok lag when both sides claim no contradictions
        failures.append(f"ok:{term.get('ok')}!={truth.get('ok')}")
    if term.get("indexable_count") != truth["wave1"]["indexable"]:
        failures.append(
            f"indexable_count:{term.get('indexable_count')}!={truth['wave1']['indexable']}"
        )
    if term.get("human_approved_count") != truth["wave1"]["human_approved"]:
        failures.append(
            f"human_approved_count:{term.get('human_approved_count')}!={truth['wave1']['human_approved']}"
        )
    if term.get("awaiting_human") != truth["wave1"]["editorial_reviewed"]:
        failures.append(
            f"awaiting_human:{term.get('awaiting_human')}!={truth['wave1']['editorial_reviewed']}"
        )
    if term.get("hub_claimed_guides") != truth["public_inventory"]["hub_claimed_guides"]:
        failures.append(
            f"hub_claimed_guides:{term.get('hub_claimed_guides')}!={truth['public_inventory']['hub_claimed_guides']}"
        )
    # inventory
    inv_path = ROOT / "docs" / "editorial" / "EDITORIAL-INVENTORY.json"
    if inv_path.exists():
        inv = json.loads(inv_path.read_text(encoding="utf-8"))
        if inv.get("terminal_status") != live_status:
            failures.append(f"inventory_terminal_status:{inv.get('terminal_status')}!={live_status}")
    # packet
    pkt_path = ROOT / "docs" / "editorial" / "WAVE1-HUMAN-REVIEW-PACKET.json"
    if pkt_path.exists():
        pkt = json.loads(pkt_path.read_text(encoding="utf-8"))
        if pkt.get("terminal_status") and pkt.get("terminal_status") != live_status:
            failures.append(f"packet_terminal_status:{pkt.get('terminal_status')}!={live_status}")
    return failures


def assert_truth_consistent(truth: dict[str, Any] | None = None) -> list[str]:
    """Return list of failures; empty means consistent."""
    truth = truth or derive_editorial_truth()
    fails = list(truth.get("contradictions") or [])
    fails.extend(verify_packaged_matches_live(truth))
    return fails


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Derive editorial truth / write terminal result")
    ap.add_argument("--write", action="store_true", help="Write TERMINAL-RESULT + inventory + packet SHA")
    ap.add_argument("--fail-on-contradiction", action="store_true")
    ap.add_argument(
        "--require-packaged-sha",
        action="store_true",
        help="Fail if packaged commit_sha is not an allowed pin for HEAD",
    )
    ap.add_argument(
        "--require-packaged-live",
        action="store_true",
        help="Fail if packaged terminal/inventory/packet lag live derive on material fields",
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
    if args.require_packaged_live:
        live_fails = verify_packaged_matches_live(truth)
        if live_fails:
            print({"packaged_live_failures": live_fails}, file=sys.stderr)
            rc = max(rc, 3)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
