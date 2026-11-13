#!/usr/bin/env python3
"""Gates for the CSS usage audit itself (#511).

The audit is only worth running in CI if it cannot under-report. The fixture
under ``fixtures/css-usage`` pins the exact regression that hid dead CSS for a
year: ``hero`` matched inside ``content-hero`` because ``-`` is a word
boundary, so ``\\b`` reported a dead class as used.
"""
from __future__ import annotations

import copy
import hashlib
import json
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
    BASELINE,
    AUDITED_BUNDLES,
    SKIP_DIRS,
    audit,
    class_selectors,
    compare,
    decoration_counts,
    derived_route_bundles,
    is_test_path,
    public_css_files,
    stylesheet_references,
    unused_classes,
    used_classes,
)
from scripts.site.build_css import ROUTE_BUNDLES, route_bundle  # noqa: E402
from scripts.site.build_diagnostic_css import (  # noqa: E402
    MANIFEST as DIAGNOSTIC_MANIFEST,
    TARGET as DIAGNOSTIC_TARGET,
    expected_css as expected_diagnostic_css,
)

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "css-usage"


def _fixture_root() -> Path:
    """Copy the fixture into a throwaway repo root the audit can walk."""
    tmp = Path(tempfile.mkdtemp(prefix="css-usage-"))
    for name in ("bundle.css", "page.html", "behaviour.js"):
        shutil.copy(FIXTURE / name, tmp / name)
    return tmp


def _derived_bundle_fixture() -> tuple[Path, str, tuple[str, ...]]:
    """A minimal public tree with every CSS file referenced by HTML."""
    root = Path(tempfile.mkdtemp(prefix="css-derived-bundle-"))
    rel, sources = next(iter(ROUTE_BUNDLES.items()))
    for audited in AUDITED_BUNDLES:
        path = root / audited
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("", encoding="utf-8")
    for index, source in enumerate(sources):
        path = root / source
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            f".source-{index}{{border-radius:{index + 1}px;box-shadow:0 1px #000}}\n",
            encoding="utf-8",
        )
    target = root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(route_bundle(root, sources), encoding="utf-8", newline="\n")
    hrefs = sorted(set((*AUDITED_BUNDLES, *sources, rel)))
    (root / "index.html").write_text(
        "".join(f'<link rel="stylesheet" href="/{href}"/>\n' for href in hrefs),
        encoding="utf-8",
    )
    return root, rel, sources


def _diagnostic_projection_fixture() -> tuple[Path, dict]:
    root, _, _ = _derived_bundle_fixture()
    manifest = json.loads((ROOT / DIAGNOSTIC_MANIFEST).read_text(encoding="utf-8"))
    manifest["excluded_component_classes"] = ["unused-component"]
    for rel in manifest["runtime_sources"]:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if rel.endswith(".html"):
            text = f'<link rel="stylesheet" href="/{DIAGNOSTIC_TARGET}"><main class="kept"></main>\n'
        else:
            text = "// reviewed fixture runtime\n"
        path.write_text(text, encoding="utf-8", newline="\n")
        manifest["runtime_sources"][rel] = hashlib.sha256(path.read_bytes()).hexdigest()
    (root / "styles.css").write_text(
        ".kept{border-radius:4px;box-shadow:0 1px #000}\n"
        ".unused-component{border-radius:8px}\n",
        encoding="utf-8",
    )
    manifest_path = root / DIAGNOSTIC_MANIFEST
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    (root / DIAGNOSTIC_TARGET).write_text(expected_diagnostic_css(root), encoding="utf-8")
    return root, manifest


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


def test_route_bundle_is_discounted_only_when_its_generated_bytes_match() -> None:
    root, rel, _ = _derived_bundle_fixture()
    try:
        result = audit(root)
        assert compare(result, result) == []
        valid, invalid = derived_route_bundles(root)
        assert valid == {rel}, (valid, invalid)
        assert invalid == {}, invalid
        assert result["derived_css_bundles"] == [rel]
        assert result["decoration"][rel] == {
            "border_radius": 0,
            "box_shadow": 0,
            "gradient": 0,
        }
    finally:
        shutil.rmtree(root)


def test_regenerated_route_bundle_still_counts_new_source_decoration() -> None:
    root, rel, sources = _derived_bundle_fixture()
    try:
        baseline = audit(root)
        source = root / sources[0]
        source.write_text(
            source.read_text(encoding="utf-8") + ".new-radius{border-radius:99px}\n",
            encoding="utf-8",
        )
        (root / rel).write_text(route_bundle(root, sources), encoding="utf-8", newline="\n")
        result = audit(root)
        assert result["derived_css_bundles"] == [rel]
        assert result["invalid_derived_css_bundles"] == {}
        assert any(failure.startswith("decoration_regression border_radius ") for failure in compare(result, baseline))
    finally:
        shutil.rmtree(root)


def test_route_bundle_extra_css_fails_closed() -> None:
    root, rel, _ = _derived_bundle_fixture()
    try:
        baseline = audit(root)
        target = root / rel
        target.write_text(
            target.read_text(encoding="utf-8") + ".extra-shadow{box-shadow:0 2px #000}\n",
            encoding="utf-8",
        )
        result = audit(root)
        assert result["derived_css_bundles"] == []
        assert rel in result["invalid_derived_css_bundles"]
        assert f"invalid_derived_stylesheet {rel}: does not match its declared source sheets" in compare(result, baseline)
    finally:
        shutil.rmtree(root)


def test_missing_route_bundle_fails_closed() -> None:
    root, rel, _ = _derived_bundle_fixture()
    try:
        baseline = audit(root)
        (root / rel).unlink()
        result = audit(root)
        assert result["derived_css_bundles"] == []
        assert result["invalid_derived_css_bundles"] == {rel: "missing generated bundle"}
        assert f"invalid_derived_stylesheet {rel}: missing generated bundle" in compare(result, baseline)
    finally:
        shutil.rmtree(root)


def test_diagnostic_projection_requires_exact_reviewed_bytes_for_discount() -> None:
    root, _ = _diagnostic_projection_fixture()
    try:
        source_before = (root / "styles.css").read_bytes()
        target_before = (root / DIAGNOSTIC_TARGET).read_bytes()
        result = audit(root)
        assert DIAGNOSTIC_TARGET in result["derived_css_bundles"]
        assert result["invalid_derived_css_bundles"] == {}
        assert result["decoration"][DIAGNOSTIC_TARGET] == {
            "border_radius": 0, "box_shadow": 0, "gradient": 0,
        }
        assert result["decoration"]["styles.css"]["border_radius"] == 2
        assert compare(result, result) == []
        assert (root / "styles.css").read_bytes() == source_before
        assert (root / DIAGNOSTIC_TARGET).read_bytes() == target_before
    finally:
        shutil.rmtree(root)


def test_minimal_tree_without_diagnostic_projection_is_allowed() -> None:
    root, _, _ = _derived_bundle_fixture()
    try:
        owner = root / "ferramentas/diagnostico-defesa-margem/index.html"
        owner.parent.mkdir(parents=True, exist_ok=True)
        owner.write_text('<link rel="stylesheet" href="/styles.css">', encoding="utf-8")
        valid, invalid = derived_route_bundles(root)
        assert DIAGNOSTIC_TARGET not in valid
        assert DIAGNOSTIC_TARGET not in invalid
    finally:
        shutil.rmtree(root)


def test_partial_diagnostic_projection_always_fails_closed() -> None:
    for only in ("manifest", "target", "link"):
        root, _, _ = _derived_bundle_fixture()
        try:
            rel = {
                "manifest": DIAGNOSTIC_MANIFEST,
                "target": DIAGNOSTIC_TARGET,
                "link": "ferramentas/diagnostico-defesa-margem/index.html",
            }[only]
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            text = f'<link rel="stylesheet" href="/{DIAGNOSTIC_TARGET}?v=fixture">' if only == "link" else "{}"
            path.write_text(text, encoding="utf-8")
            valid, invalid = derived_route_bundles(root)
            assert DIAGNOSTIC_TARGET not in valid, only
            assert DIAGNOSTIC_TARGET in invalid, (only, invalid)
        finally:
            shutil.rmtree(root)


def test_tampered_diagnostic_projection_is_counted_and_rejected() -> None:
    root, _ = _diagnostic_projection_fixture()
    try:
        baseline = audit(root)
        target = root / DIAGNOSTIC_TARGET
        target.write_text(target.read_text(encoding="utf-8") + ".extra{box-shadow:0 2px #000}\n", encoding="utf-8")
        result = audit(root)
        assert DIAGNOSTIC_TARGET not in result["derived_css_bundles"]
        assert result["decoration"][DIAGNOSTIC_TARGET]["box_shadow"] == 2
        assert f"invalid_derived_stylesheet {DIAGNOSTIC_TARGET}: does not match its reviewed projection" in compare(result, baseline)
    finally:
        shutil.rmtree(root)


def test_stale_diagnostic_projection_is_rejected() -> None:
    root, _ = _diagnostic_projection_fixture()
    try:
        canonical = root / "styles.css"
        canonical.write_text(canonical.read_text(encoding="utf-8") + ".kept{color:green}\n", encoding="utf-8")
        valid, invalid = derived_route_bundles(root)
        assert DIAGNOSTIC_TARGET not in valid
        assert invalid[DIAGNOSTIC_TARGET] == "does not match its reviewed projection"
    finally:
        shutil.rmtree(root)


def test_diagnostic_projection_requires_each_input_and_runtime_hash() -> None:
    for change in ("missing_manifest", "missing_runtime", "changed_runtime", "incomplete_review"):
        root, manifest = _diagnostic_projection_fixture()
        try:
            if change == "missing_manifest":
                (root / DIAGNOSTIC_MANIFEST).unlink()
            elif change == "missing_runtime":
                (root / "script.js").unlink()
            elif change == "changed_runtime":
                (root / "script.js").write_text("// runtime changed after review\n", encoding="utf-8")
            else:
                del manifest["runtime_sources"]["script.js"]
                (root / DIAGNOSTIC_MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
            result = audit(root)
            assert DIAGNOSTIC_TARGET not in result["derived_css_bundles"], change
            assert DIAGNOSTIC_TARGET in result["invalid_derived_css_bundles"], change
            assert result["decoration"][DIAGNOSTIC_TARGET]["border_radius"] == 1, change
            assert any(f"invalid_derived_stylesheet {DIAGNOSTIC_TARGET}:" in value for value in compare(result, result)), change
        finally:
            shutil.rmtree(root)


def test_diagnostic_projection_rejects_invalid_manifest() -> None:
    root, manifest = _diagnostic_projection_fixture()
    try:
        manifest["route"] = "/unreviewed/"
        (root / DIAGNOSTIC_MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
        valid, invalid = derived_route_bundles(root)
        assert DIAGNOSTIC_TARGET not in valid
        assert "unexpected diagnostic CSS owner route" in invalid[DIAGNOSTIC_TARGET]
    finally:
        shutil.rmtree(root)


def test_reviewed_runtime_with_an_excluded_component_is_rejected() -> None:
    root, manifest = _diagnostic_projection_fixture()
    try:
        runtime = root / "script.js"
        runtime.write_text("document.body.classList.add('unused-component');\n", encoding="utf-8")
        manifest["runtime_sources"]["script.js"] = hashlib.sha256(runtime.read_bytes()).hexdigest()
        (root / DIAGNOSTIC_MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
        valid, invalid = derived_route_bundles(root)
        assert DIAGNOSTIC_TARGET not in valid
        assert "excluded component occurs in script.js" in invalid[DIAGNOSTIC_TARGET]
    finally:
        shutil.rmtree(root)


def test_regenerated_projection_does_not_hide_new_source_decoration() -> None:
    root, _ = _diagnostic_projection_fixture()
    try:
        baseline = audit(root)
        canonical = root / "styles.css"
        canonical.write_text(canonical.read_text(encoding="utf-8") + ".kept{border-radius:99px}\n", encoding="utf-8")
        (root / DIAGNOSTIC_TARGET).write_text(expected_diagnostic_css(root), encoding="utf-8")
        result = audit(root)
        assert DIAGNOSTIC_TARGET in result["derived_css_bundles"]
        assert result["invalid_derived_css_bundles"] == {}
        assert any(value.startswith("decoration_regression border_radius ") for value in compare(result, baseline))
    finally:
        shutil.rmtree(root)


def test_static_classname_assignments_keep_literal_classes_alive() -> None:
    root = _fixture_root()
    try:
        (root / "class-name.js").write_text(
            "node.className = 'container footer-analytics-preference';\n",
            encoding="utf-8",
        )
        (root / "inline.html").write_text(
            "<script>item.className = \"inline-visible inline-card\";</script>",
            encoding="utf-8",
        )
        (root / "dynamic.js").write_text(
            "item.classNamePrefix = 'prefix-false';\n"
            "item.className = 'concat-false' + suffix;\n"
            "item.className = `template-false${suffix}`;\n",
            encoding="utf-8",
        )
        (root / "test_ignored.js").write_text(
            "item.className = 'fixture-must-not-keep-alive';\n",
            encoding="utf-8",
        )
        css = (root / "bundle.css").read_text(encoding="utf-8")
        css += (
            ".container{} .footer-analytics-preference{} .inline-visible{} "
            ".inline-card{} .prefix-false{} .concat-false{} .template-false{} .fixture-must-not-keep-alive{}"
        )
        used = used_classes(root)
        dead = unused_classes(css, used)
        assert {"container", "footer-analytics-preference", "inline-visible", "inline-card"}.isdisjoint(dead)
        assert {"prefix-false", "concat-false", "template-false", "fixture-must-not-keep-alive"}.issubset(dead)
    finally:
        shutil.rmtree(root)


def test_html_frame_stylesheet_and_classes_are_in_scope() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "frame.htm").write_text('<link href="frame.css" rel="stylesheet"><div class="frame"></div>')
        (root / "frame.css").write_text(".frame{display:block}")
        assert "frame" in used_classes(root)
        assert stylesheet_references(root, "frame.css") == 1


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


def test_shared_project_menu_owns_one_radius_and_the_ratchet_stays_closed() -> None:
    """The PP menu mirrors the canonical control without opening decoration headroom."""

    project_css = (ROOT / "assets/project-practices.css").read_text(encoding="utf-8")
    summary = re.search(r"\.pp-mobile summary\s*\{([^}]*)\}", project_css)
    assert summary, "project menu summary rule missing"
    declarations = summary.group(1).replace(" ", "")
    assert "border-radius:var(--radius-md)" in declarations, declarations
    assert decoration_counts(f".fixture{{{summary.group(1)}}}") == {
        "border_radius": 1,
        "box_shadow": 0,
        "gradient": 0,
    }

    result = audit(ROOT)
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    assert result["decoration"]["assets/project-practices.css"] == {
        "border_radius": 1,
        "box_shadow": 1,
        "gradient": 0,
    }
    assert compare(result, baseline) == []
    planted = copy.deepcopy(result)
    ceiling = baseline["decoration_totals"]["border_radius"]
    planted["decoration_totals"]["border_radius"] = ceiling + 1
    assert compare(planted, baseline) == [f"decoration_regression border_radius {ceiling + 1}>{ceiling}"]


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
