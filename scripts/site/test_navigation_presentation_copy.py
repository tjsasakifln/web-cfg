"""The presentation proof may admit only the two reviewed navigation spans."""
from __future__ import annotations

import unittest

from scripts.site.prepare_navigation_presentation_review import (
    PROJECT_DESCRIPTION_AFTER,
    PROJECT_DESCRIPTION_BEFORE,
    header_with_project_calculator_description,
)


def anchor(position: str) -> str:
    return (
        '<a class="nav-destination" href="/projetos-prontos/" '
        'data-nav-destination="projetos-prontos" '
        f'data-cta-position="{position}" '
        f'data-cta-id="nav-{position}-projetos-projetos-prontos" '
        'data-event-name="cta_click" data-navigation-link="true">'
        '<span class="nav-destination__title">Projetos prontos</span>'
        f'<span class="nav-destination__description">{PROJECT_DESCRIPTION_BEFORE}</span></a>'
    )


def source() -> str:
    return '<header class="site-header">' + anchor("header_nav") + anchor("mobile_nav") + '</header>'


class NavigationPresentationCopyTest(unittest.TestCase):
    def test_exact_two_descriptions_are_the_only_admitted_change(self):
        before = source()
        expected = before.replace(PROJECT_DESCRIPTION_BEFORE, PROJECT_DESCRIPTION_AFTER)
        # A third identical anchor outside the header must not enter the proof.
        self.assertEqual(header_with_project_calculator_description(
            before + '<main>' + anchor("header_nav") + '</main>'), expected)
        self.assertEqual(expected.count(PROJECT_DESCRIPTION_AFTER), 2)

    def test_changed_bindings_are_not_accepted(self):
        for old, new in [
            ('href="/projetos-prontos/"', 'href="/projetos/"'),
            ('data-nav-destination="projetos-prontos"', 'data-nav-destination="outro"'),
            ('data-cta-position="header_nav"', 'data-cta-position="footer"'),
            ('data-cta-id="nav-header_nav-projetos-projetos-prontos"', 'data-cta-id="outro"'),
            ('data-event-name="cta_click"', 'data-event-name="lead"'),
            ('>Projetos prontos</span>', '>Outro projeto</span>'),
            (PROJECT_DESCRIPTION_BEFORE, 'Uma descrição sem revisão.'),
        ]:
            with self.subTest(old=old):
                with self.assertRaisesRegex(AssertionError, "project_description_binding"):
                    header_with_project_calculator_description(source().replace(old, new, 1))

    def test_missing_mobile_destination_is_not_accepted(self):
        with self.assertRaisesRegex(AssertionError, "project_description_binding"):
            header_with_project_calculator_description(source().replace(anchor("mobile_nav"), ''))

    def test_duplicate_destination_is_not_accepted(self):
        with self.assertRaisesRegex(AssertionError, "project_description_binding"):
            header_with_project_calculator_description(source().replace('</header>', anchor("header_nav") + '</header>'))
