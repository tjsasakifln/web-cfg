"""Reject any navigation recapture beyond the exact reviewed compaction."""
from __future__ import annotations

from html.parser import HTMLParser
import subprocess
import re
import unittest

from scripts.site.prepare_navigation_presentation_review import (
    BASE_SHA,
    ROOT,
    assert_compact_header,
    assert_navigation_css_only,
    header_with_compact_navigation,
    shared,
)
from scripts.site.navigation_discovery import render_navigation


CANARY = "analises-contratos-publicos/reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/index.html"


class Elements(HTMLParser):
    def __init__(self, html: str):
        super().__init__()
        self.count = 0
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.count += 1

    def handle_startendtag(self, tag, attrs):
        self.count += 1


class NavigationPresentationCompactionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.before = subprocess.check_output(
            ["git", "show", f"{BASE_SHA}:{CANARY}"], cwd=ROOT, text=True)
        # Use the actual candidate group renderer, while retaining every other
        # byte of the approved source shell. The artifact's CTA/visible Menu
        # canonicalization is independently compared by the source QA proof.
        groups = {}
        for kind in ("desktop", "mobile"):
            rendered = render_navigation(kind=kind, current="/" + CANARY.removesuffix("index.html"))
            for match in re.finditer(r'<details class="nav-group[^>]*>.*?</details>', rendered, re.S):
                group_id = re.search(r'data-nav-group="([^"]+)"', match.group()).group(1)
                groups[(kind, group_id)] = match.group()
        def replace_group(match):
            kind = re.search(r'name="nav-(desktop|mobile)"', match.group()).group(1)
            group_id = re.search(r'data-nav-group="([^"]+)"', match.group()).group(1)
            return groups[(kind, group_id)]
        cls.after, count = re.subn(r'<details class="nav-group[^>]*>.*?</details>', replace_group, cls.before, flags=re.S)
        assert count == 12

    def test_candidate_renderer_matches_the_independent_bounded_transform(self):
        self.assertTrue(assert_compact_header(self.before, self.after))
        before = shared(self.before, "header").group()
        after = shared(self.after, "header").group()
        self.assertEqual(Elements(before).count - Elements(after).count, 160)
        self.assertEqual(after.count('class="nav-destination"'), 76)
        self.assertEqual(after.count('class="nav-overview"'), 12)
        self.assertEqual(after.count('class="nav-destination__description"'), 76)
        self.assertEqual(after.count('data-nav-group="'), 12)

    def test_changed_link_copy_bindings_and_shared_controls_are_rejected(self):
        for old, new in [
            ('href="/projetos-prontos/"', 'href="/projetos/"'),
            ('data-nav-destination="projetos-prontos"', 'data-nav-destination="outro"'),
            ('data-cta-position="header_nav"', 'data-cta-position="footer"'),
            ('data-cta-id="nav-header_nav-projetos-projetos-prontos"', 'data-cta-id="outro"'),
            ('data-event-name="cta_click"', 'data-event-name="lead"'),
            ('>Projetos prontos<span', '>Outro projeto<span'),
            ('Calcule seu projeto por disciplina e prazo.', 'Compre e baixe imediatamente.'),
            ('Todos os projetos', 'Projetos com aprovação garantida'),
            ('aria-controls="nav-desktop-projetos"', 'aria-controls="outro"'),
            ('data-nav-group="projetos"', 'data-nav-group="outro"'),
            ('class="button button-primary header-cta"', 'class="button hidden"'),
        ]:
            with self.subTest(old=old):
                self.assertIn(old, self.after)
                with self.assertRaisesRegex(AssertionError, "compact_header_exact_transform"):
                    assert_compact_header(self.before, self.after.replace(old, new, 1))

    def test_hidden_additions_missing_destinations_and_reordering_are_rejected(self):
        anchor = re.search(r'<a class="nav-destination"[^>]*>.*?</a>', self.after).group()
        changes = [
            self.after.replace(anchor, '', 1),
            self.after.replace(anchor, anchor + anchor, 1),
            self.after.replace(anchor, '<div hidden>unreviewed</div>' + anchor, 1),
            self.after.replace(anchor, '', 1).replace('</header>', anchor + '</header>', 1),
        ]
        for after in changes:
            with self.assertRaisesRegex(AssertionError, "compact_header_exact_transform"):
                assert_compact_header(self.before, after)

    def test_unexpected_baseline_shape_fails_closed(self):
        before = self.before.replace('class="nav-destination__title"', 'class="unknown-title"', 1)
        with self.assertRaisesRegex(AssertionError, "compact_title_bindings"):
            header_with_compact_navigation(before)

    def test_content_outside_the_header_cannot_expand_the_transform(self):
        expected = header_with_compact_navigation(self.before)
        extra = '<main><span class="nav-destination__title">unchanged</span></main>'
        self.assertEqual(header_with_compact_navigation(self.before + extra), expected)

    def test_only_navigation_css_can_change_and_outside_bytes_are_literal(self):
        old, new = b'.nav-panel{color:red}', b'.nav-panel{color:green}'
        before = b'body{margin:0}\n' + old + b'\nfooter{display:block}\n'
        after = before.replace(old, new)
        compiler = b'unchanged source compositor'
        self.assertTrue(assert_navigation_css_only(before, after, old, new, compiler, compiler))
        for changed in [
            after.replace(b'margin:0', b'margin:1px'),
            after.replace(b'\n', b'\r\n'),
            after + new,
        ]:
            with self.assertRaises(AssertionError):
                assert_navigation_css_only(before, changed, old, new, compiler, compiler)
        with self.assertRaisesRegex(AssertionError, 'source_css_compositor_byte_identical'):
            assert_navigation_css_only(before, after, old, new, compiler, b'changed compositor')
