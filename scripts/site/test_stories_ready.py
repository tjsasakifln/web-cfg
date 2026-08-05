#!/usr/bin/env python3
"""Assert EPIC-TD-001 full stories under docs/stories/ are Ready or Done.

Shipped path under test: docs/stories/story-1.*.md (full story files).
Pack index story-1.9-1.12-pack-p2.md is not an implementable unit.

After implementation, Status may be Done with QA PASS — still a valid terminal
state for this gate (Ready wave or closed epic).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STORIES = ROOT / "docs" / "stories"
EPIC = STORIES / "epic-technical-debt.md"

ALLOWED_STATUS = frozenset({"Ready", "Done"})

# Full implementable story ids for EPIC-TD-001
EXPECTED_IDS = (
    "1.1",
    "1.2",
    "1.3",
    "1.4",
    "1.5",
    "1.6",
    "1.7",
    "1.8",
    "1.9",
    "1.10",
    "1.11",
    "1.12",
)

REVERSA_SPOT = {
    "1.1": ("005-persist-first", "BR-LEAD-02", "fail-closed"),
    "1.2": ("permissions", "OPS_TOKEN"),
    "1.5": ("004-record-kind", "record_kind", "schema_version"),
    "1.6": ("007-gsc-cohort", "ADR-007"),
    "1.7": ("domain", "jornada"),
    "1.8": ("lead-intake", "persist-first"),
}


def full_story_files() -> list[Path]:
    files = []
    for p in sorted(STORIES.glob("story-1.*.md")):
        if p.name == "story-1.9-1.12-pack-p2.md":
            continue
        files.append(p)
    return files


def story_id_from_name(name: str) -> str | None:
    m = re.match(r"story-(\d+\.\d+)-", name)
    return m.group(1) if m else None


def test_expected_full_files_exist():
    found_ids = set()
    for p in full_story_files():
        sid = story_id_from_name(p.name)
        assert sid, f"unexpected story filename: {p.name}"
        found_ids.add(sid)
    missing = [i for i in EXPECTED_IDS if i not in found_ids]
    assert not missing, f"missing full story files for ids: {missing}"
    print(f"OK test_expected_full_files_exist count={len(found_ids)}")


def test_each_full_story_is_ready_with_validation_record():
    for p in full_story_files():
        text = p.read_text(encoding="utf-8")
        status = re.search(r"^\*\*Status:\*\*\s*(\S+)", text, re.M)
        assert status, f"{p.name}: missing **Status:**"
        assert status.group(1) in ALLOWED_STATUS, (
            f"{p.name}: Status={status.group(1)!r} want Ready|Done"
        )
        assert "## Acceptance criteria" in text, f"{p.name}: missing Acceptance criteria"
        assert "### OUT" in text or "## Out of scope" in text, f"{p.name}: missing OUT/scope"
        assert "## Change Log" in text, f"{p.name}: missing Change Log"
        assert "Validated GO" in text or "validate-story-draft" in text, (
            f"{p.name}: missing validation GO record"
        )
        assert "Reversa" in text or "_reversa_sdd" in text, f"{p.name}: missing Reversa alignment"
        if status.group(1) == "Done":
            assert "PASS" in text or "QA Results" in text, f"{p.name}: Done without QA PASS"
    print(f"OK test_each_full_story_is_ready_with_validation_record n={len(full_story_files())}")


def test_reversa_spot_checks_for_lead_and_ops_stories():
    by_id: dict[str, Path] = {}
    for p in full_story_files():
        sid = story_id_from_name(p.name)
        if sid:
            by_id[sid] = p
    for sid, needles in REVERSA_SPOT.items():
        text = by_id[sid].read_text(encoding="utf-8")
        for n in needles:
            assert n in text, f"story {sid}: missing Reversa needle {n!r}"
    print("OK test_reversa_spot_checks_for_lead_and_ops_stories")


def test_story_1_6_depends_on_1_5():
    p = next(p for p in full_story_files() if p.name.startswith("story-1.6-"))
    text = p.read_text(encoding="utf-8")
    assert "1.5" in text and ("Depends on" in text or "depends" in text.lower())
    print("OK test_story_1_6_depends_on_1_5")


def test_epic_ready_wave_summary():
    text = EPIC.read_text(encoding="utf-8")
    assert "Ready" in text or "Done" in text
    for sid in EXPECTED_IDS:
        assert sid in text, f"epic missing story id {sid}"
    # status table should mark Ready or Done for implementable set
    ready_rows = len(re.findall(r"\|\s*\*\*Ready\*\*\s*\|", text))
    done_rows = len(re.findall(r"\|\s*\*\*Done\*\*\s*\|", text))
    assert ready_rows + done_rows >= 12, (
        f"epic Ready+Done rows={ready_rows}+{done_rows} want >=12"
    )
    print(f"OK test_epic_ready_wave_summary ready_rows={ready_rows} done_rows={done_rows}")


def main() -> int:
    failed = 0
    for t in (
        test_expected_full_files_exist,
        test_each_full_story_is_ready_with_validation_record,
        test_reversa_spot_checks_for_lead_and_ops_stories,
        test_story_1_6_depends_on_1_5,
        test_epic_ready_wave_summary,
    ):
        try:
            t()
        except AssertionError as e:
            failed += 1
            print(f"FAIL {t.__name__}: {e}")
    if failed:
        print(f"STORIES_READY_FAIL count={failed}")
        return 1
    print("STORIES_READY_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
