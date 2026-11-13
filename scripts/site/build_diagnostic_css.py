#!/usr/bin/env python3
"""Project the shared CSS onto the public contract diagnostic conservatively.

Only complete rules whose selectors all start with an explicitly reviewed,
absent component class may be omitted. Declarations, selector order, imports,
fonts and ambiguous rules remain verbatim. This is not viewport coverage or an
automatic purge: adding an excluded component to the page/runtime fails closed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = "data/site/diagnostic-css-projection.json"
TARGET = "assets/tool-bundles/diagnostico-base.css"
HEADER = "/* Derived from styles.css by scripts/site/build_diagnostic_css.py. Edit canonical CSS and the reviewed projection manifest. */\n"
CLASS_START = re.compile(r"^\.([a-zA-Z_][a-zA-Z0-9_-]*)(?![\w\\-]|[^\x00-\x7f])")
RECURSIVE_GROUPS = frozenset({"media", "supports", "container"})
REVIEWED_RUNTIME_SOURCES = frozenset({
    "ferramentas/diagnostico-defesa-margem/index.html", "script.js",
    "js/modules/analytics.js", "js/modules/nav.js", "js/modules/offer-fit.js",
    "js/modules/form.js", "assets/js/tool-persist.js", "assets/js/tools-common.js",
    "assets/js/diagnose-margin.js", "assets/js/tool-referral.mjs",
    "assets/js/tool-credits.mjs", "assets/tool-showcase/showcase.mjs",
    "scripts/tools-commerce/firebase-auth-entry.mjs",
    "scripts/tools-commerce/bundle-firebase-auth.mjs",
})


def _tokens(text: str, comment_ranges: list[tuple[int, int]] | None = None):
    """Yield structural characters outside comments, strings and escapes."""
    cursor = 0
    while cursor < len(text):
        char = text[cursor]
        if text.startswith("/*", cursor):
            end = text.find("*/", cursor + 2)
            if end < 0:
                raise ValueError("unterminated CSS comment")
            if comment_ranges is not None:
                comment_ranges.append((cursor, end + 2))
            cursor = end + 2
            continue
        if char in "\"'":
            quote = char
            cursor += 1
            while cursor < len(text):
                if text[cursor] == "\\":
                    cursor += 2
                elif text[cursor] == quote:
                    cursor += 1
                    break
                else:
                    cursor += 1
            else:
                raise ValueError("unterminated CSS string")
            continue
        if char == "\\":
            cursor += 2
            continue
        yield cursor, char
        cursor += 1


def _without_comments(text: str) -> str:
    ranges: list[tuple[int, int]] = []
    for _ in _tokens(text, ranges):
        pass
    output, start = [], 0
    for begin, end in ranges:
        output.extend((text[start:begin], " "))
        start = end
    return "".join(output) + text[start:]


def _selectors(prelude: str) -> list[str]:
    """Split selector lists without splitting :is(), :not() or attributes."""
    result, start, nesting = [], 0, []
    for offset, char in _tokens(prelude):
        if char in "([":
            nesting.append(char)
        elif char in ")]":
            if not nesting or nesting.pop() != {")": "(", "]": "["}[char]:
                raise ValueError("unbalanced selector")
        elif char == "," and not nesting:
            result.append(prelude[start:offset].strip())
            start = offset + 1
    if nesting:
        raise ValueError("unbalanced selector")
    result.append(prelude[start:].strip())
    if not all(result):
        raise ValueError("empty selector")
    return result


def project_css(css: str, excluded: frozenset[str]) -> str:
    """Remove only proven-absent anchored rules; retain every other byte."""
    output, start, opening, depth, nesting = [], 0, None, 0, []
    for offset, char in _tokens(css):
        if char in "([":
            nesting.append(char)
        elif char in ")]":
            if not nesting or nesting.pop() != {")": "(", "]": "["}[char]:
                raise ValueError("unbalanced CSS grouping")
        elif nesting:
            continue
        elif char == "{" :
            if depth == 0:
                opening = offset
            depth += 1
        elif char == "}":
            depth -= 1
            if depth < 0 or opening is None:
                raise ValueError("unbalanced CSS block")
            if depth:
                continue
            raw_prelude = css[start:opening]
            prelude = _without_comments(raw_prelude).strip()
            body = css[opening + 1:offset]
            group = re.match(r"@([a-zA-Z-]+)\b", prelude)
            if group and group[1].lower() in RECURSIVE_GROUPS:
                projected = project_css(body, excluded)
                if _without_comments(projected).strip():
                    output.append(raw_prelude + "{" + projected + "}")
            elif group:
                output.append(css[start:offset + 1])
            else:
                selectors = _selectors(prelude)
                anchors = [CLASS_START.match(value) for value in selectors]
                if not all(match and match[1] in excluded for match in anchors):
                    output.append(css[start:offset + 1])
            start, opening = offset + 1, None
        elif char == ";" and depth == 0:
            output.append(css[start:offset + 1])
            start = offset + 1
    if depth or nesting:
        raise ValueError("unbalanced CSS")
    output.append(css[start:])
    return "".join(output)


def expected_css(root: Path = ROOT) -> str:
    manifest = json.loads((root / MANIFEST).read_text(encoding="utf-8"))
    if manifest.get("schema") != "confenge.diagnostic-css-projection/1.0":
        raise ValueError("unknown diagnostic CSS projection schema")
    if manifest.get("source") != "styles.css" or manifest.get("target") != TARGET:
        raise ValueError("unexpected diagnostic CSS source/target")
    if manifest.get("route") != "/ferramentas/diagnostico-defesa-margem/":
        raise ValueError("unexpected diagnostic CSS owner route")
    if set(manifest["runtime_sources"]) != REVIEWED_RUNTIME_SOURCES:
        raise ValueError("diagnostic runtime review must cover the complete declared source set")
    classes = manifest["excluded_component_classes"]
    if not classes or classes != sorted(set(classes)):
        raise ValueError("excluded component classes must be unique and sorted")
    if any(not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_-]*", name) for name in classes):
        raise ValueError("invalid component class")
    for rel, reviewed_sha256 in manifest["runtime_sources"].items():
        if Path(rel).is_absolute() or ".." in Path(rel).parts:
            raise ValueError("invalid runtime source path")
        source_bytes = (root / rel).read_bytes()
        if hashlib.sha256(source_bytes).hexdigest() != reviewed_sha256:
            raise ValueError(f"runtime changed since component review: {rel}")
        source = source_bytes.decode("utf-8")
        conflicts = [name for name in classes if re.search(
            r"(?<![a-zA-Z0-9_-])" + re.escape(name) + r"(?![a-zA-Z0-9_-])", source)]
        if conflicts:
            raise ValueError(f"excluded component occurs in {rel}: {', '.join(conflicts)}")
    css = (root / manifest["source"]).read_text(encoding="utf-8")
    return HEADER + project_css(css, frozenset(classes)).lstrip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = expected_css()
    target = ROOT / TARGET
    if args.check:
        if not target.is_file() or target.read_text(encoding="utf-8") != expected:
            raise SystemExit(f"FAIL {TARGET} is stale; run python3 scripts/site/build_diagnostic_css.py")
        print(f"PASS {TARGET}: reviewed projection matches canonical CSS and runtime")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(expected, encoding="utf-8", newline="\n")
        print(f"wrote {TARGET} ({len(expected.encode())} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
