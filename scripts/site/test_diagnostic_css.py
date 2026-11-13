#!/usr/bin/env python3
"""Regression and negative controls for the conservative diagnostic CSS cut."""
from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.site.build_diagnostic_css import (  # noqa: E402
    HEADER, MANIFEST, REVIEWED_RUNTIME_SOURCES, TARGET, expected_css, project_css,
)


class ProjectionTests(unittest.TestCase):
    def project(self, source):
        return project_css(source, frozenset({"absent", "other-absent"}))

    def test_only_whole_absent_components_are_removed(self):
        self.assertEqual(self.project(".absent{color:red}.present{color:green}"), ".present{color:green}")
        self.assertEqual(self.project(".absent,.present{color:red}"), ".absent,.present{color:red}")
        self.assertEqual(self.project(".absent,.other-absent{color:red}"), "")

    def test_all_retained_bytes_and_cascade_order_are_preserved(self):
        source = "/* base */\nbody { color: red }\n.present:hover { color: green!important }\n.present { color: blue }\n"
        self.assertEqual(self.project(source), source)

    def test_functional_and_attribute_commas_are_not_selector_separators(self):
        self.assertEqual(self.project('.absent:is(.present,.x)[data-x="a,b"]{color:red}'), "")
        source = '.present:is(.absent,.x),[data-x="a,b"]{color:red}'
        self.assertEqual(self.project(source), source)

    def test_absence_inside_not_or_has_does_not_exclude_a_rule(self):
        for source in [':not(.absent){color:red}', ':has(.absent){color:red}', 'body .absent{color:red}', '.present:not(.absent){color:red}']:
            self.assertEqual(self.project(source), source)

    def test_escaped_ambiguous_and_similarly_named_classes_are_retained(self):
        for source in [r'.absent\:active{color:red}', r'.absent\31{color:red}', '.absent-child{color:red}', '.absent_child{color:red}', '.absenté{color:red}', '.absent\u0301{color:red}', '[class~="absent"]{color:red}']:
            self.assertEqual(self.project(source), source)

    def test_comments_and_quoted_braces_are_opaque(self):
        source = '.present::before{content:"} ; , \\\" {";background:url("data:image/svg+xml,<svg>{}</svg>")}/* { } */'
        self.assertEqual(self.project(source), source)
        self.assertEqual(self.project('/* { */.absent/* } */{content:"}"}.present{color:red}'), '.present{color:red}')
        quoted_comments = '.absent[data-note="/*"], .present[data-note="*/"]{color:red}'
        self.assertEqual(self.project(quoted_comments), quoted_comments)
        separated_tokens = '.ab/*comment*/sent{color:red}'
        self.assertEqual(self.project(separated_tokens), separated_tokens)

    def test_import_font_keyframes_and_unknown_at_rules_are_verbatim(self):
        source = '@import url("/styles-tokens.css");\n@font-face{font-family:"x";src:url("x.woff2")}@keyframes spin{from{opacity:0}to{opacity:1}}@unknown{.absent{color:red}}'
        self.assertEqual(self.project(source), source)

    def test_known_conditional_groups_recurse_without_reordering(self):
        self.assertEqual(self.project('@media(width<700px){.absent{color:red}.present{color:blue}}'), '@media(width<700px){.present{color:blue}}')
        self.assertEqual(self.project('@supports(display:grid){@media(width<700px){.absent{color:red}}}'), '')
        layers = '@layer alpha{.absent{color:red}}@layer beta{.present{color:blue}}@layer alpha{.present{color:green}}'
        self.assertEqual(self.project(layers), layers)

    def test_malformed_css_fails_closed(self):
        for source in ['.present{', '.present{color:"x}', '.present{/* open}', '}', '.present:is(.x{color:red}', '.absent,,.present{color:red}']:
            with self.subTest(source=source), self.assertRaises(ValueError):
                self.project(source)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for rel in REVIEWED_RUNTIME_SOURCES:
            path = self.root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("reviewed runtime\n")
        (self.root / "styles.css").write_text(".absent{color:red}.present{color:green}")
        self.manifest = {
            "schema": "confenge.diagnostic-css-projection/1.0",
            "route": "/ferramentas/diagnostico-defesa-margem/",
            "source": "styles.css", "target": TARGET,
            "runtime_sources": {rel: hashlib.sha256((self.root / rel).read_bytes()).hexdigest() for rel in sorted(REVIEWED_RUNTIME_SOURCES)},
            "excluded_component_classes": ["absent"],
        }
        (self.root / MANIFEST).parent.mkdir(parents=True)
        self.write_manifest()

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self):
        (self.root / MANIFEST).write_text(json.dumps(self.manifest))

    def test_complete_reviewed_projection(self):
        self.assertEqual(expected_css(self.root), HEADER + ".present{color:green}")

    def test_new_script_or_import_requires_review(self):
        (self.root / "script.js").write_text('import("/new-component.mjs");')
        with self.assertRaisesRegex(ValueError, "runtime changed"):
            expected_css(self.root)

    def test_omitted_runtime_source_fails(self):
        self.manifest["runtime_sources"].pop("script.js")
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "complete declared source set"):
            expected_css(self.root)

    def test_missing_runtime_file_fails(self):
        (self.root / "script.js").unlink()
        with self.assertRaises(FileNotFoundError):
            expected_css(self.root)

    def test_component_reintroduced_even_with_updated_hash_fails(self):
        path = self.root / "script.js"
        path.write_text('element.className = "absent";')
        self.manifest["runtime_sources"]["script.js"] = hashlib.sha256(path.read_bytes()).hexdigest()
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "excluded component occurs"):
            expected_css(self.root)

    def test_wrong_route_or_source_is_not_a_projection(self):
        for key, value in [("route", "/"), ("source", "other.css"), ("target", "other.css")]:
            previous = self.manifest[key]
            self.manifest[key] = value
            self.write_manifest()
            with self.assertRaises(ValueError):
                expected_css(self.root)
            self.manifest[key] = previous

    def test_duplicate_exclusions_fail(self):
        self.manifest["excluded_component_classes"] = ["absent", "absent"]
        self.write_manifest()
        with self.assertRaises(ValueError):
            expected_css(self.root)

    def test_repository_projection_is_current(self):
        self.assertEqual((ROOT / TARGET).read_text(), expected_css(ROOT))


if __name__ == "__main__":
    unittest.main(verbosity=2)
