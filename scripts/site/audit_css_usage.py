#!/usr/bin/env python3
"""Audit shipped CSS against the classes the site actually uses.

Two things this file used to get wrong, both of which hid dead CSS (#511):

1. Usage was matched with ``\\b{class}\\b``. ``-`` is a word boundary, so
   ``hero`` matched inside ``content-hero`` and the audit under-reported. Class
   names are CSS identifiers: the boundary is ``[A-Za-z0-9_-]``, not ``\\w``.
2. Only the first 80 unused classes were printed and the target never ran in
   ``npm test``, so nothing could act on the result.

Usage is now read from the places a class can really come from: ``class``
attributes in shipped HTML, ``class`` attributes emitted by generators, and
``classList``/``querySelector`` literals in shipped JavaScript. Test files are
deliberately excluded -- a fixture that names a class must not keep that
class's CSS alive.

The audit is fail-closed against ``data/design/css-usage-baseline.json``:
new unused classes, new unreferenced stylesheets and rising decoration counts
all fail. Run with ``--write`` to record a new baseline after a cleanup.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "data" / "design" / "css-usage-baseline.json"

SKIP_DIRS = (
    "node_modules",
    "_site",
    "build",
    ".git",
    "docs/evidence",
    # gate fixtures must never keep a real class alive
    "scripts/site/fixtures",
    # Design prototypes (#494). This path is contractually non-public:
    # `scripts/pseo/build_site.py` names it `PROTOTYPE_SOURCE_DIR`, strips it
    # from `_site` and fails the build if anything under it reaches the
    # artifact, and `test:prototype-isolation` asserts that. CSS that can never
    # ship is not public CSS, so it must neither spend the decoration ceiling
    # nor keep a dead public class alive — the same reason fixtures are
    # excluded one line above. `test_audit_css_usage.py` pins this string to
    # `PROTOTYPE_SOURCE_DIR` so the two cannot drift.
    "docs/design-audit/prototypes",
)
# Bundles whose class inventory is tracked selector by selector.
AUDITED_BUNDLES = ("styles.css", "entregas/styles.css")

CLASS_ATTR_RE = re.compile(r"""class\s*=\s*(?:"([^"]*)"|'([^']*)')""")
CLASSLIST_RE = re.compile(r"""classList\.(?:add|remove|toggle|contains|replace)\(([^)]*)\)""")
SELECTOR_CALL_RE = re.compile(
    r"""(?:querySelector|querySelectorAll|closest|matches)\(\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)"""
)
STRING_CLASS_RE = re.compile(r"""['"`]([A-Za-z][A-Za-z0-9_-]*)['"`]""")
SELECTOR_CLASS_RE = re.compile(r"\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)")
COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
QUOTED_RE = re.compile(r"""(?:"[^"]*"|'[^']*')""")
# The ceiling measures DECORATION, so a declaration that removes decoration
# must not spend it. `border-radius:0` and `box-shadow:none` are the two ways
# this codebase neutralises inherited ornament; counting them made the ratchet
# punish exactly the work it exists to encourage, and a page that deletes ten
# rounded corners scored worse than one that adds none. Matching the value
# makes the number mean what its name says, and it only ever tightens: every
# neutralising declaration already in the tree stops counting too.
RADIUS_RE = re.compile(
    r"border(?:-[a-z]+)*-radius\s*:"
    r"(?!(?:\s*0(?:px|%|r?em)?)+\s*(?:!important)?\s*[;}])\s*[^;}]+", re.I
)
SHADOW_RE = re.compile(
    r"box-shadow\s*:(?!\s*none\s*(?:!important)?\s*[;}])\s*[^;}]+", re.I
)
GRADIENT_RE = re.compile(r"(?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\(", re.I)


def _skip(rel: str) -> bool:
    return any(rel == d or rel.startswith(d + "/") for d in SKIP_DIRS)


def is_test_path(rel: str) -> bool:
    """Fixtures and gates must not keep a class alive."""
    name = rel.rsplit("/", 1)[-1]
    return (
        "/tests/" in f"/{rel}"
        or rel.startswith("tests/")
        or name.startswith("test_")
        or name.startswith("test-")
        or ".test." in name
    )


def walk(root: Path, suffixes: tuple[str, ...]) -> list[Path]:
    out = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in suffixes:
            continue
        rel = path.relative_to(root).as_posix()
        if _skip(rel):
            continue
        out.append(path)
    return out


def class_selectors(css: str) -> list[str]:
    """Class names used as selectors, ignoring declarations, comments and strings."""
    css = COMMENT_RE.sub("", css)
    preludes = [chunk.split("}")[-1] for chunk in css.split("{")]
    found: set[str] = set()
    for prelude in preludes:
        # `@import url("/styles-tokens.css")` is not a `.css` class selector.
        prelude = QUOTED_RE.sub("", prelude)
        found.update(SELECTOR_CLASS_RE.findall(prelude))
    return sorted(found)


def _tokens_from_class_attrs(text: str) -> set[str]:
    out: set[str] = set()
    for match in CLASS_ATTR_RE.finditer(text):
        for token in (match.group(1) or match.group(2) or "").split():
            out.add(token)
    return out


def used_classes(root: Path) -> dict[str, set[str]]:
    """Map class name -> the files that prove it is used."""
    used: dict[str, set[str]] = {}

    def record(name: str, rel: str) -> None:
        used.setdefault(name, set()).add(rel)

    def record_script_tokens(text: str, rel: str) -> None:
        for match in CLASSLIST_RE.finditer(text):
            for token in STRING_CLASS_RE.findall(match.group(1)):
                record(token, rel)
        for match in SELECTOR_CALL_RE.finditer(text):
            selector = match.group(1) or match.group(2) or match.group(3) or ""
            for token in SELECTOR_CLASS_RE.findall(selector):
                record(token, rel)

    for path in walk(root, (".html",)):
        rel = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8", errors="ignore")
        for token in _tokens_from_class_attrs(text):
            record(token, rel)
        # inline <script> blocks toggle classes too (`no-js` -> `js`)
        record_script_tokens(text, rel)

    for path in walk(root, (".py", ".js", ".mjs", ".cjs")):
        rel = path.relative_to(root).as_posix()
        if is_test_path(rel):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        # generators writing markup
        for token in _tokens_from_class_attrs(text):
            record(token, rel)
        # shipped behaviour toggling or querying classes, including the inline
        # scripts Python generators embed in the HTML they write
        record_script_tokens(text, rel)
    return used


def unused_classes(css: str, used: dict[str, set[str]]) -> list[str]:
    return [name for name in class_selectors(css) if name not in used]


def public_css_files(root: Path) -> list[str]:
    out = []
    for path in walk(root, (".css",)):
        rel = path.relative_to(root).as_posix()
        if rel.startswith("scripts/"):
            continue
        out.append(rel)
    return out


def stylesheet_references(root: Path, rel: str) -> int:
    """How many places load this stylesheet (link, @import, manifest, shipped JS)."""
    name = rel.rsplit("/", 1)[-1]
    hits = 0
    manifest = root / "css" / "manifest.json"
    if manifest.is_file():
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if rel in data.get("modules", []) or rel == data.get("tokens"):
            hits += 1
    for path in walk(root, (".html",)):
        text = path.read_text(encoding="utf-8", errors="ignore")
        hits += len(re.findall(rf'href="[^"]*{re.escape(name)}"', text))
    for path in walk(root, (".css",)):
        if path.relative_to(root).as_posix() == rel:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        hits += len(re.findall(rf"@import[^;]*{re.escape(name)}", text))
    for path in walk(root, (".js", ".mjs", ".cjs")):
        sub = path.relative_to(root).as_posix()
        if is_test_path(sub) or sub.startswith("scripts/"):
            continue
        hits += path.read_text(encoding="utf-8", errors="ignore").count(rel)
    return hits


def decoration_counts(css: str) -> dict[str, int]:
    body = COMMENT_RE.sub("", css)
    return {
        "border_radius": len(RADIUS_RE.findall(body)),
        "box_shadow": len(SHADOW_RE.findall(body)),
        "gradient": len(GRADIENT_RE.findall(body)),
    }


def audit(root: Path = ROOT) -> dict:
    used = used_classes(root)
    bundles = {}
    for rel in AUDITED_BUNDLES:
        css = (root / rel).read_text(encoding="utf-8")
        selectors = class_selectors(css)
        dead = [name for name in selectors if name not in used]
        bundles[rel] = {
            "bytes": len(css.encode()),
            "class_selectors": len(selectors),
            "used": len(selectors) - len(dead),
            "unused": dead,
        }
    files = public_css_files(root)
    decoration = {}
    for rel in files:
        decoration[rel] = decoration_counts((root / rel).read_text(encoding="utf-8"))
    unreferenced = [rel for rel in files if stylesheet_references(root, rel) == 0]
    return {
        "schema_version": "1.0.0",
        "generated_by": "scripts/site/audit_css_usage.py",
        "public_css_files": files,
        "unreferenced_css_files": unreferenced,
        "bundles": bundles,
        "decoration": decoration,
        "decoration_totals": {
            key: sum(counts[key] for counts in decoration.values())
            for key in ("border_radius", "box_shadow", "gradient")
        },
    }


def compare(result: dict, baseline: dict) -> list[str]:
    failures: list[str] = []
    for rel in result["unreferenced_css_files"]:
        failures.append(f"unreferenced_stylesheet {rel}")
    for rel, data in result["bundles"].items():
        allowed = set(baseline.get("bundles", {}).get(rel, {}).get("unused", []))
        for name in data["unused"]:
            if name not in allowed:
                failures.append(f"new_unused_class {rel} .{name}")
    for key, total in result["decoration_totals"].items():
        ceiling = baseline.get("decoration_totals", {}).get(key)
        if ceiling is None:
            failures.append(f"missing_baseline_decoration {key}")
        elif total > ceiling:
            failures.append(f"decoration_regression {key} {total}>{ceiling}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="record the current audit as the baseline")
    parser.add_argument("--json", help="also write the full audit to this path")
    args = parser.parse_args()

    result = audit(ROOT)
    for rel, data in result["bundles"].items():
        print(f"{rel} bytes={data['bytes']} class_selectors={data['class_selectors']} "
              f"used={data['used']} unused={len(data['unused'])}")
        for name in data["unused"]:
            print(f"  UNUSED {rel} .{name}")
    totals = result["decoration_totals"]
    print(f"decoration border_radius={totals['border_radius']} "
          f"box_shadow={totals['box_shadow']} gradient={totals['gradient']}")
    print(f"public_css_files={len(result['public_css_files'])} "
          f"unreferenced={len(result['unreferenced_css_files'])}")

    if args.json:
        Path(args.json).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if args.write:
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        BASELINE.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {BASELINE.relative_to(ROOT)}")
        return 0

    if not BASELINE.is_file():
        print(f"FAIL missing baseline {BASELINE.relative_to(ROOT)}; run with --write")
        return 1
    failures = compare(result, json.loads(BASELINE.read_text(encoding="utf-8")))
    for failure in failures:
        print(f"FAIL {failure}")
    if failures:
        return 1
    print("CSS_USAGE_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
