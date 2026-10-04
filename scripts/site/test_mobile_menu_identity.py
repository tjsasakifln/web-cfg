from __future__ import annotations

import re
import shutil
from pathlib import Path

import pytest

from scripts.pseo.public_artifact import (
    PUBLIC_EXCLUDED_RELPATHS,
    PUBLIC_ROOT_FILES,
    PUBLIC_TOP_DIRS,
)
from scripts.site import public_navigation
from scripts.site.public_navigation import promote_public_navigation
from scripts.site.public_footer import (
    PublicFooterError,
    apply_public_footer_tree,
    render_public_footer,
    validate_public_footer_tree,
)


ROOT = Path(__file__).resolve().parents[2]
TOGGLE = (
    '<button type="button" class="menu-toggle" aria-controls="mobile-menu" '
    'aria-expanded="false" aria-label="Abrir menu">'
    '<svg class="icon menu-open"></svg><svg class="icon menu-close"></svg>'
    "</button>"
)


def _public_html() -> list[Path]:
    paths: list[Path] = []
    for name in sorted(PUBLIC_TOP_DIRS):
        directory = ROOT / name
        if not directory.is_dir():
            continue
        paths.extend(
            path
            for path in sorted(directory.rglob("*.html"))
            if path.relative_to(ROOT).as_posix() not in PUBLIC_EXCLUDED_RELPATHS
        )
    paths.extend(
        ROOT / name
        for name in sorted(PUBLIC_ROOT_FILES)
        if (ROOT / name).is_file() and (ROOT / name).suffix.lower() == ".html"
    )
    return paths


def test_legacy_toggle_gets_visible_label_without_losing_state_or_cta() -> None:
    cta = '<a class="header-cta" href="#contato">Solicitar proposta</a>'
    source = f"<header>{cta}{TOGGLE}</header>"

    rendered = promote_public_navigation(source, relative_path="fixture/index.html")

    assert rendered.count('class="menu-toggle__label"') == 1
    assert '>Menu</span>' in rendered
    assert 'aria-controls="mobile-menu"' in rendered
    assert 'aria-expanded="false"' in rendered
    assert rendered.count(cta) == 1
    assert promote_public_navigation(rendered, relative_path="fixture/index.html") == rendered


def test_frozen_navigation_still_receives_shared_toggle_label(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    frozen = "frozen/index.html"
    monkeypatch.setattr(public_navigation, "FROZEN_NAV_HTML_PATHS", frozenset({frozen}))
    nav = '<nav class="desktop-nav"><a href="/frozen/">Frozen</a></nav>'
    rendered = promote_public_navigation(f"{nav}{TOGGLE}", relative_path=frozen)
    assert nav in rendered
    assert rendered.count('class="menu-toggle__label"') == 1


@pytest.mark.parametrize(
    "mutation",
    [
        TOGGLE + TOGGLE,
        TOGGLE.replace("</button>", '<span class="menu-toggle__label">Abrir</span></button>'),
    ],
)
def test_ambiguous_legacy_toggle_fails_closed(mutation: str) -> None:
    with pytest.raises(ValueError, match="menu toggle|menu label"):
        promote_public_navigation(mutation, relative_path="fixture/index.html")


def test_all_public_shells_compile_to_one_visible_menu_label() -> None:
    paths = _public_html()
    assert len(paths) == 249
    legacy = 0
    project_practice = 0
    for path in paths:
        relative = path.relative_to(ROOT).as_posix()
        source = path.read_text(encoding="utf-8")
        rendered = promote_public_navigation(source, relative_path=relative)
        if re.search(r'<button\b[^>]*\bclass="[^"]*\bmenu-toggle\b', source, re.I):
            legacy += 1
            assert rendered.count('class="menu-toggle__label"') == 1, relative
            assert 'aria-controls="mobile-menu"' in rendered, relative
            assert 'aria-expanded="false"' in rendered, relative
        elif 'class="pp-mobile"' in source:
            project_practice += 1
            assert re.search(
                r'<summary\b[^>]*>.*?<span>Menu</span>.*?</summary>',
                rendered,
                flags=re.I | re.S,
            ), relative
        else:
            assert 'class="mobile-nav"' not in source, relative
    assert legacy == 230
    assert project_practice == 13


def test_shared_styles_use_the_same_touch_target_and_archivo_tokens() -> None:
    components = (ROOT / "css/components.css").read_text(encoding="utf-8")
    project = (ROOT / "assets/project-practices.css").read_text(encoding="utf-8")
    compiled = (ROOT / "styles.css").read_text(encoding="utf-8")
    for css in (components, project):
        assert "min-width:44px" in css.replace(" ", "")
        assert "var(--sans-wide)" in css
        assert "var(--wide)" in css
    compact_project = project.replace(" ", "")
    assert "height:44px" in compact_project
    assert "border:1pxsolidvar(--line)" in compact_project
    assert "background:#fff" in compact_project
    assert "color:var(--ink)" in compact_project
    assert ".menu-toggle{display:none;width:44px;height:44px" in compiled


def test_project_page_index_wraps_before_labels_can_leave_the_viewport() -> None:
    project = (ROOT / "assets/project-practices.css").read_text(encoding="utf-8")
    compact = re.sub(r"\s+", "", project)
    assert (
        ".pp-indexa{min-width:max-content;min-height:44px;display:inline-flex;"
        "align-items:center;" in compact
    )
    tablet_rules = compact.split("@media(max-width:1040px){", 1)[1]
    assert (
        ".pp-index{flex-wrap:wrap;align-items:stretch;overflow-x:visible;}"
        in tablet_rules
    )

    project_pages = sorted(
        path
        for path in ROOT.rglob("index.html")
        if "project-practices.css" in path.read_text(encoding="utf-8")
    )
    assert len(project_pages) == 13
    for path in project_pages:
        html = path.read_text(encoding="utf-8")
        match = re.search(
            r'<nav class="pp-index pp-container" aria-label="Nesta página">(.*?)</nav>',
            html,
            flags=re.S,
        )
        assert match, path.relative_to(ROOT)
        links = re.findall(r'<a href="#[^"]+">([^<]+)</a>', match.group(1))
        assert links and all(label.strip() for label in links), path.relative_to(ROOT)


def test_shared_footer_unions_navigation_authority_contact_and_page_dates() -> None:
    footer = render_public_footer(
        published_at="2026-10-02",
        modified_at="2026-10-03",
        modified_label="3 de outubro de 2026",
    )
    for href in (
        "/edificacoes/",
        "/como-trabalhamos/",
        "/politica-editorial/",
        "/triagem-tecnica/#corrigir-o-site",
        "/conflitos/",
        "/privacidade/",
        "/termos-de-uso/",
    ):
        assert f'href="{href}"' in footer
    assert footer.count('href="mailto:') == 1
    assert footer.count('href="tel:') == 1
    assert footer.count("<time ") == 2
    assert "3 de outubro de 2026" in footer


def test_footer_compiler_replaces_old_family_and_preserves_only_footer_scope(
    tmp_path: Path,
) -> None:
    page = tmp_path / "projetos/index.html"
    page.parent.mkdir(parents=True)
    source = (
        '<html><body><main id="conteudo">corpo</main>'
        '<footer class="site-footer"><div>família anterior</div>'
        '<span class="footer-page-dates">· publicada em '
        '<time datetime="2026-10-02">2026-10-02</time> · atualizada em '
        '<time datetime="2026-10-03">3 de outubro de 2026</time></span></footer>'
        "</body></html>"
    )
    page.write_text(source, encoding="utf-8")

    report = apply_public_footer_tree(tmp_path)
    rendered = page.read_text(encoding="utf-8")

    assert report == {
        "changed_files": 1,
        "inserted_files": 0,
        "footer_files": 1,
        "dated_footers": 1,
        "indexable_footer_files": 1,
    }
    assert '<main id="conteudo">corpo</main>' in rendered
    assert "família anterior" not in rendered
    assert "3 de outubro de 2026" in rendered
    assert apply_public_footer_tree(tmp_path)["changed_files"] == 0


def test_footer_validator_rejects_unapproved_contact_identity(tmp_path: Path) -> None:
    page = tmp_path / "index.html"
    footer = render_public_footer().replace(
        "</footer>", '<a href="mailto:outro@example.com">Outro</a></footer>'
    )
    page.write_text(f"<html><body>{footer}</body></html>", encoding="utf-8")
    with pytest.raises(PublicFooterError, match="contact_identity_drift"):
        validate_public_footer_tree(tmp_path)


def test_footer_compiler_adds_component_to_indexable_page_without_route_exception(
    tmp_path: Path,
) -> None:
    page = tmp_path / "comercial/condicao/index.html"
    page.parent.mkdir(parents=True)
    source = (
        '<html><head><meta name="robots" content="index,follow"></head>'
        '<body><main>condição pública</main></body></html>'
    )
    page.write_text(source, encoding="utf-8")

    report = apply_public_footer_tree(tmp_path)
    rendered = page.read_text(encoding="utf-8")

    assert report["inserted_files"] == 1
    assert report["indexable_footer_files"] == 1
    assert rendered.replace(render_public_footer(), "") == source


def test_footer_validator_rejects_missing_indexable_footer_and_logo_drift(
    tmp_path: Path,
) -> None:
    page = tmp_path / "index.html"
    page.write_text(
        '<html><head><meta name="robots" content="index,follow"></head><body></body></html>',
        encoding="utf-8",
    )
    with pytest.raises(PublicFooterError, match="missing_on_indexable"):
        validate_public_footer_tree(tmp_path)

    page.write_text(
        f'<html><body>{render_public_footer().replace("logo-confenge-white-500-1677038e.png", "logo-errado.png")}</body></html>',
        encoding="utf-8",
    )
    with pytest.raises(PublicFooterError, match="logo_drift"):
        validate_public_footer_tree(tmp_path)


def test_public_footer_compiles_all_existing_footer_families_without_other_body_drift(
    tmp_path: Path,
) -> None:
    before_without_footer: dict[str, str] = {}
    for source in _public_html():
        relative = source.relative_to(ROOT).as_posix()
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        text = source.read_text(encoding="utf-8")
        shutil.copy2(source, target)
        before_without_footer[relative] = re.sub(
            r'<footer\b.*?</footer>', "", text, flags=re.I | re.S
        )

    report = apply_public_footer_tree(tmp_path)

    assert report["footer_files"] >= 220
    assert report["dated_footers"] == 13
    for relative, before in before_without_footer.items():
        rendered = (tmp_path / relative).read_text(encoding="utf-8")
        assert re.sub(r'<footer\b.*?</footer>', "", rendered, flags=re.I | re.S) == before
