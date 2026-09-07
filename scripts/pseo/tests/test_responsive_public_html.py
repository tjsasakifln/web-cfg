from pathlib import Path

from scripts.pseo.build_site import (
    atomize_visible_currency,
    ensure_progressive_enhancement_marker,
    mark_visible_opaque_tokens,
    normalize_responsive_public_html,
)


def test_currency_is_atomic_only_in_visible_text() -> None:
    html = """<!doctype html><html><head></head><body>
<p>De R$ 599 a R$\n 3.750.</p>
<a title="R$ 690">Preço</a>
<script type="application/ld+json">{"price":"R$ 890"}</script>
<style>.fixture::after{content:"R$ 1.200"}</style>
</body></html>"""

    rendered = atomize_visible_currency(html)

    assert "De R$&nbsp;599 a R$&nbsp;3.750." in rendered
    assert 'title="R$ 690"' in rendered
    assert '{"price":"R$ 890"}' in rendered
    assert 'content:"R$ 1.200"' in rendered


def test_progressive_marker_is_idempotent() -> None:
    html = (
        "<!doctype html><html lang=\"pt-BR\"><head><title>x</title>"
        '<script defer src="/script.js"></script></head><body></body></html>'
    )

    once = ensure_progressive_enhancement_marker(html)
    twice = ensure_progressive_enhancement_marker(once)

    assert '<html lang="pt-BR" class="no-js">' in once
    assert "document.documentElement.classList.replace('no-js','js')" in once
    assert twice == once


def test_marker_is_withheld_when_the_page_ships_no_behaviour_script() -> None:
    """A page with no /script.js must keep class="no-js".

    Counter-case for a live defect: the swap used to run unconditionally, so
    /privacidade/, /termos-de-uso/ and 404.html -- which ship no <script src> at
    all -- still ended up class="js". `.no-js .menu-toggle{display:none}` then
    never applied, so the hamburger rendered at 44x44, was tappable, had nothing
    bound to it, and the static `.no-js` navigation that exists for exactly this
    case stayed hidden. Claiming "js" without the behaviour script is a lie the
    stylesheet believes.
    """
    html = "<!doctype html><html lang=\"pt-BR\"><head><title>x</title></head><body></body></html>"

    once = ensure_progressive_enhancement_marker(html)

    assert '<html lang="pt-BR" class="no-js">' in once
    assert "classList.replace('no-js','js')" not in once
    assert ensure_progressive_enhancement_marker(once) == once


def test_marker_follows_the_script_even_with_a_cache_busting_query() -> None:
    """The shipped tag is `/script.js?v=...`; matching must not be exact-path only."""
    html = (
        "<!doctype html><html lang=\"pt-BR\"><head><title>x</title>"
        '<script defer="" src="/script.js?v=fortune04"></script></head><body></body></html>'
    )

    assert "classList.replace('no-js','js')" in ensure_progressive_enhancement_marker(html)


def test_opaque_tokens_are_marked_only_in_visible_text() -> None:
    html = """<!doctype html><html><body>
<p>Superintendencia: https://pncp.gov.br/api/contratos/69 publication_authorization=false</p>
<a title="https://example.test/raw">Fonte</a>
<script>{"url":"https://example.test/raw"}</script>
</body></html>"""

    rendered = mark_visible_opaque_tokens(html)

    assert '<span data-opaque-token>Superintendencia</span>' not in rendered
    assert '<span data-opaque-token>https://pncp.gov.br/api/contratos/69</span>' in rendered
    assert '<span data-opaque-token>publication_authorization=false</span>' in rendered
    assert 'title="https://example.test/raw"' in rendered
    assert '{"url":"https://example.test/raw"}' in rendered
    assert mark_visible_opaque_tokens(rendered) == rendered


def test_public_normalization_preserves_non_visible_contracts(tmp_path: Path) -> None:
    page = tmp_path / "index.html"
    page.write_text(
        "<!doctype html><html><head></head><body><p>R$ 2.900</p>"
        '<script>{"price":"R$ 2.900"}</script></body></html>',
        encoding="utf-8",
    )

    report = normalize_responsive_public_html(tmp_path)
    rendered = page.read_text(encoding="utf-8")

    assert report == {
        "files": 1,
        "currency_files": 1,
        "opaque_token_files": 0,
        "marker_files": 1,
    }
    assert "<p>R$&nbsp;2.900</p>" in rendered
    assert '{"price":"R$ 2.900"}' in rendered
