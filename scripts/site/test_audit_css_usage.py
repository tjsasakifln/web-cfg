#!/usr/bin/env python3
"""Gates for the CSS usage audit itself (#511).

The audit is only worth running in CI if it cannot under-report. The fixture
under ``fixtures/css-usage`` pins the exact regression that hid dead CSS for a
year: ``hero`` matched inside ``content-hero`` because ``-`` is a word
boundary, so ``\\b`` reported a dead class as used.
"""
from __future__ import annotations

import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.build_site import PROTOTYPE_SOURCE_DIR  # noqa: E402
from scripts.site.audit_css_usage import (  # noqa: E402
    SKIP_DIRS,
    audit,
    class_selectors,
    decoration_counts,
    is_test_path,
    public_css_files,
    unused_classes,
    used_classes,
)

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "css-usage"


def _fixture_root() -> Path:
    """Copy the fixture into a throwaway repo root the audit can walk."""
    tmp = Path(tempfile.mkdtemp(prefix="css-usage-"))
    for name in ("bundle.css", "page.html", "behaviour.js"):
        shutil.copy(FIXTURE / name, tmp / name)
    return tmp


def test_word_boundary_does_not_swallow_a_prefixed_class() -> None:
    """`hero` must not be reported as used just because `content-hero` exists."""
    root = _fixture_root()
    try:
        css = (root / "bundle.css").read_text(encoding="utf-8")
        used = used_classes(root)
        dead = unused_classes(css, used)
        assert "content-hero" not in dead, dead
        assert "hero" in dead, (
            "regression: `hero` is only a substring of `content-hero` in the "
            f"fixture, so it is dead CSS. Reported unused: {dead}"
        )
        # the old implementation: \b treats `-` as a boundary, so it passed
        blob = (root / "page.html").read_text(encoding="utf-8")
        assert re.search(r"\bhero\b", blob), "fixture no longer reproduces the old false positive"
    finally:
        shutil.rmtree(root)


def test_behaviour_and_inline_scripts_keep_a_class_alive() -> None:
    root = _fixture_root()
    try:
        css = (root / "bundle.css").read_text(encoding="utf-8")
        dead = unused_classes(css, used_classes(root))
        # `.reveal` only appears in a querySelectorAll literal
        assert "reveal" not in dead, dead
        # `.is-open` only appears in an inline <script> classList call
        assert "is-open" not in dead, dead
    finally:
        shutil.rmtree(root)


def test_quoted_strings_are_not_class_selectors() -> None:
    selectors = class_selectors('@import url("/styles-tokens.css");\na[href$=".css"]{color:red}')
    assert "css" not in selectors, selectors


def test_test_files_do_not_keep_a_class_alive() -> None:
    assert is_test_path("scripts/site/test_truthful_gates.py")
    assert is_test_path("tests/commercial/test_task_doors.mjs")
    assert is_test_path("scripts/pseo/tests/test_build.py")
    assert not is_test_path("scripts/organic/bridges.py")
    assert not is_test_path("js/modules/nav.js")


def test_decoration_counts_are_measured_not_guessed() -> None:
    counts = decoration_counts(
        ".a{border-radius:4px}.b{border-top-left-radius:2px}"
        ".c{box-shadow:0 1px 2px #000}.d{background:linear-gradient(#fff,#000)}"
        "/* border-radius:99px; box-shadow:none */"
    )
    assert counts == {"border_radius": 2, "box_shadow": 1, "gradient": 1}, counts


def test_shipped_audit_reports_every_bundle_and_no_orphan_stylesheet() -> None:
    result = audit(ROOT)
    assert set(result["bundles"]) == {"styles.css", "entregas/styles.css"}
    assert result["unreferenced_css_files"] == [], result["unreferenced_css_files"]
    assert result["public_css_files"], "no public stylesheet found"


def test_design_prototypes_are_outside_the_public_css_scope() -> None:
    """A prototype stylesheet may not spend the public decoration ceiling.

    The path is contractually non-public: `build_site.py` strips it from
    `_site` and fails the build if it appears there. Counting its radius and
    shadow against the visitor's budget would charge for bytes the visitor
    never receives, and would make the ceiling unusable for the very
    comparison work the path exists to hold (#494). Pinned to the build's own
    constant so the exclusion cannot drift away from the isolation contract.
    """
    assert PROTOTYPE_SOURCE_DIR in SKIP_DIRS, SKIP_DIRS
    prototypes = [rel for rel in public_css_files(ROOT) if rel.startswith(PROTOTYPE_SOURCE_DIR + "/")]
    assert prototypes == [], prototypes
    # And the exclusion must be real on disk, not vacuously true.
    on_disk = sorted((ROOT / PROTOTYPE_SOURCE_DIR).rglob("*.css"))
    assert on_disk, "no prototype stylesheet to exclude; the assertion would prove nothing"


def test_prototype_markup_does_not_keep_a_public_class_alive() -> None:
    """Same rule as the gate fixtures: a prototype must not resurrect dead CSS."""
    used = used_classes(ROOT)
    for name, sources in used.items():
        for rel in sources:
            assert not rel.startswith(PROTOTYPE_SOURCE_DIR + "/"), f"{name} kept alive by {rel}"


def test_integration_campaign_css_is_outside_the_public_css_scope() -> None:
    """Campaign sources under docs/integration/ must not spend the public ceiling.

    A canary staged there for a future PR is unpublished by its own README
    until that PR wires it into the real public surface. If this path started
    counting as public CSS, a staged campaign's radii would fail
    `decoration_regression` against a visitor budget it never ships into.
    """
    campaign_dir = "docs/integration"
    assert campaign_dir in SKIP_DIRS, SKIP_DIRS
    leaked = [rel for rel in public_css_files(ROOT) if rel.startswith(campaign_dir + "/")]
    assert leaked == [], leaked
    on_disk = sorted((ROOT / campaign_dir).rglob("*.css"))
    assert on_disk, "no campaign stylesheet to exclude; the assertion would prove nothing"


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("OK", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, exc)
    print("AUDIT_CSS_USAGE_TESTS_OK" if not failed else f"AUDIT_CSS_USAGE_TESTS_FAILED {failed}")
    raise SystemExit(1 if failed else 0)


def test_neutralising_declarations_do_not_spend_the_decoration_ceiling():
    """`border-radius:0` and `box-shadow:none` REMOVE ornament.

    Counting them made the ratchet punish the work it exists to encourage: a
    page that deleted ten rounded corners scored worse than one that added
    none. The guard also has to survive backtracking — an unanchored `\\s*`
    after the colon could step past the lookahead and match " none".
    """
    from scripts.site.audit_css_usage import decoration_counts

    removals = (
        "a{border-radius:0}"
        "b{border-radius: 0 0 0 0 ;}"
        "c{border-radius:0px}"
        "d{border-radius: 0 !important ;}"
        "e{box-shadow:none}"
        "f{box-shadow: none }"
        "g{box-shadow: none !important ;}"
    )
    assert decoration_counts(removals) == {
        "border_radius": 0,
        "box_shadow": 0,
        "gradient": 0,
    }

    ornament = (
        "a{border-radius:8px}"
        "b{border-radius:0 0 8px 8px}"
        "c{border-top-left-radius:4px}"
        "d{border-radius:var(--radius)}"
        "e{box-shadow:0 2px 4px #000}"
        "f{box-shadow:inset 1px 0 0 red}"
        "g{box-shadow:var(--focus-ring)}"
    )
    counts = decoration_counts(ornament)
    assert counts["border_radius"] == 4, counts
    assert counts["box_shadow"] == 3, counts
