from __future__ import annotations

import json
import re
import shutil
from html.parser import HTMLParser
from pathlib import Path

import pytest

from scripts.pseo.public_artifact import (
    PUBLIC_EXCLUDED_RELPATHS,
    PUBLIC_ROOT_FILES,
    PUBLIC_TOP_DIRS,
)
from scripts.site.share_preview import (
    OG_REQUIRED,
    TWITTER_REQUIRED,
    SharePreviewError,
    apply_share_preview_contract,
    validate_share_preview_contract,
)


ROOT = Path(__file__).resolve().parents[3]


class _Meta(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.og: list[str] = []
        self.twitter: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "meta":
            return
        values = {str(key).lower(): str(value or "") for key, value in attrs}
        prop = values.get("property", "").lower()
        name = values.get("name", "").lower()
        if prop.startswith("og:"):
            self.og.append(prop)
        if name.startswith("twitter:"):
            self.twitter.append(name)


def _page(
    canonical: str = "https://confenge.com.br/servico/",
    *,
    robots: str = "index,follow",
    description: bool = True,
    extra_head: str = "",
) -> str:
    description_tag = '<meta name="description" content="Descrição factual da página.">' if description else ""
    return (
        '<!doctype html><html lang="pt-BR"><head><title>Serviço técnico | CONFENGE</title>'
        f'{description_tag}<meta name="robots" content="{robots}">'
        f'<link rel="canonical" href="{canonical}">{extra_head}</head>'
        '<body><main><h1>Serviço técnico</h1><p>Corpo invariável.</p></main></body></html>'
    )


def _write_page(root: Path, relative: str, html: str) -> Path:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")
    return path


def _write_sitemap(root: Path, *routes: str) -> None:
    rows = "".join(f"<url><loc>https://confenge.com.br{route}</loc></url>" for route in routes)
    (root / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{rows}</urlset>',
        encoding="utf-8",
    )


def _compile(root: Path, *, coverage: bool = False) -> dict:
    return apply_share_preview_contract(
        root,
        source_root=ROOT,
        require_contract_coverage=coverage,
    )


def test_indexable_page_gets_complete_preview_once_and_preserves_body(tmp_path: Path) -> None:
    existing_title = "Título social específico já aprovado"
    page = _write_page(
        tmp_path,
        "servico/index.html",
        _page(extra_head=f'<meta property="og:title" content="{existing_title}">'),
    )
    _write_sitemap(tmp_path, "/servico/")
    before = page.read_text(encoding="utf-8")
    before_body = re.split(r"(?is)(?=<body\b)", before, maxsplit=1)[1]

    report = _compile(tmp_path)
    rendered = page.read_text(encoding="utf-8")
    parsed = _Meta()
    parsed.feed(rendered)

    assert report["complete_pages"] == 1
    assert report["updated_files"] == 1
    assert report["body_changes"] == 0
    assert re.split(r"(?is)(?=<body\b)", rendered, maxsplit=1)[1] == before_body
    assert set(parsed.og) >= set(OG_REQUIRED)
    assert set(parsed.twitter) >= set(TWITTER_REQUIRED)
    assert all(parsed.og.count(key) == 1 for key in OG_REQUIRED)
    assert all(parsed.twitter.count(key) == 1 for key in TWITTER_REQUIRED)
    assert f'content="{existing_title}"' in rendered
    assert "https://confenge.com.br/assets/og-confenge.jpg" in rendered

    second = _compile(tmp_path)
    assert second["updated_files"] == 0
    assert page.read_text(encoding="utf-8") == rendered


def test_explicit_noindex_nonshareable_page_stays_without_preview(tmp_path: Path) -> None:
    source = (ROOT / "404.html").read_text(encoding="utf-8")
    page = _write_page(tmp_path, "404.html", source)

    report = _compile(tmp_path)

    assert report["nonshareable_pages"] == 1
    assert report["updated_files"] == 0
    assert page.read_text(encoding="utf-8") == source


def test_missing_source_description_fails_closed(tmp_path: Path) -> None:
    _write_page(tmp_path, "servico/index.html", _page(description=False))
    with pytest.raises(SharePreviewError, match="share_preview_indexable_source_identity_missing"):
        _compile(tmp_path)


def test_wrong_domain_fails_closed(tmp_path: Path) -> None:
    _write_page(tmp_path, "servico/index.html", _page(canonical="https://example.com/servico/"))
    with pytest.raises(SharePreviewError, match="share_preview_canonical_wrong_origin"):
        _compile(tmp_path)


def test_duplicate_preview_property_fails_closed(tmp_path: Path) -> None:
    duplicate = '<meta property="og:title" content="A"><meta property="og:title" content="B">'
    _write_page(tmp_path, "servico/index.html", _page(extra_head=duplicate))
    with pytest.raises(SharePreviewError, match="share_preview_og_duplicate"):
        _compile(tmp_path)


def test_noindex_sitemap_member_is_rejected_as_unexpected(tmp_path: Path) -> None:
    _write_page(tmp_path, "servico/index.html", _page(robots="noindex,follow"))
    _write_sitemap(tmp_path, "/servico/")
    with pytest.raises(SharePreviewError, match="share_preview_unexpected_noindex_in_sitemap"):
        _compile(tmp_path)


def test_final_artifact_audit_detects_missing_compiled_tag_without_repair(tmp_path: Path) -> None:
    page = _write_page(tmp_path, "servico/index.html", _page())
    _compile(tmp_path)
    rendered = page.read_text(encoding="utf-8")
    mutated = re.sub(r'<meta property="og:image"[^>]*>\s*', "", rendered, count=1)
    page.write_text(mutated, encoding="utf-8")

    with pytest.raises(SharePreviewError, match="share_preview_compiled_metadata_missing"):
        validate_share_preview_contract(
            tmp_path,
            source_root=ROOT,
            require_contract_coverage=False,
        )
    assert page.read_text(encoding="utf-8") == mutated


def test_checked_in_public_html_contract_and_body_invariance(tmp_path: Path) -> None:
    originals: dict[str, str] = {}
    for name in sorted(PUBLIC_TOP_DIRS):
        source_dir = ROOT / name
        if not source_dir.is_dir():
            continue
        for source in sorted(source_dir.rglob("*.html")):
            relative = source.relative_to(ROOT).as_posix()
            if relative in PUBLIC_EXCLUDED_RELPATHS:
                continue
            originals[relative] = source.read_text(encoding="utf-8")
    for name in sorted(PUBLIC_ROOT_FILES):
        source = ROOT / name
        if source.is_file() and source.suffix.lower() == ".html":
            originals[name] = source.read_text(encoding="utf-8")

    for relative, html in originals.items():
        _write_page(tmp_path, relative, html)
    for sitemap in ROOT.glob("sitemap*.xml"):
        shutil.copy2(sitemap, tmp_path / sitemap.name)
    image = tmp_path / "assets/og-confenge.jpg"
    image.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "assets/og-confenge.jpg", image)

    report = _compile(tmp_path, coverage=True)

    contract = json.loads((ROOT / "data/site/share-preview-contract.v1.json").read_text(encoding="utf-8"))
    assert report["html_files"] == len(originals)
    assert report["complete_pages"] == len(originals) - len(contract["noindex_nonshareable"])
    assert report["nonshareable_pages"] == len(contract["noindex_nonshareable"])
    assert report["body_changes"] == 0
    for relative, before in originals.items():
        after = (tmp_path / relative).read_text(encoding="utf-8")
        before_parts = re.split(r"(?is)(?=<body\b)", before, maxsplit=1)
        after_parts = re.split(r"(?is)(?=<body\b)", after, maxsplit=1)
        assert len(before_parts) == len(after_parts) == 2, relative
        assert after_parts[1] == before_parts[1], relative


def test_runtime_overlay_namespace_is_not_part_of_static_artifact_compilation() -> None:
    assert "oportunidades" not in PUBLIC_TOP_DIRS
