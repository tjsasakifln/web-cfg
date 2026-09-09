from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from scripts.site.version_commercial_media import (
    EXPECTED_VERSIONING,
    PUBLIC_MANIFEST,
    validate_commercial_media_versioning,
    version_commercial_media_references,
)


TARGETS = (
    "assets/og-confenge.jpg",
    "assets/og-tiago-sasaki-v11.jpg",
    "assets/conteudos/consultoria-b2g-engenharia-construtora.jpg",
    "assets/conteudos/gestao-contrato-obra-publica-indicadores.jpg",
)


def _fixture(tmp_path: Path) -> tuple[Path, Path, dict[str, str]]:
    source = tmp_path / "source"
    site = tmp_path / "site"
    assets = []
    digests: dict[str, str] = {}
    for index, target in enumerate(TARGETS):
        master = f"data/site/commercial-media/master-{index}.png"
        master_path = source / master
        target_path = source / target
        published_path = site / target
        master_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        published_path.parent.mkdir(parents=True, exist_ok=True)
        master_path.write_bytes(f"master-{index}".encode())
        content = f"jpeg-{index}-corrected".encode()
        target_path.write_bytes(content)
        published_path.write_bytes(content)
        digests[target] = hashlib.sha256(content).hexdigest()
        assets.append({"source": master, "target": target, "prompt": "fixture"})
    manifest = {
        "decision": "EXECUTE_NOW fixture",
        "tool": "fixture",
        "scope": "fixture",
        "public_reference_versioning": EXPECTED_VERSIONING,
        "assets": assets,
    }
    manifest_path = source / "data/site/commercial-media/source.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    (site / "index.html").write_text(
        '<meta property="og:image" content="https://confenge.com.br/assets/og-confenge.jpg">'
        '<script type="application/ld+json">'
        '{"image":"/assets/og-tiago-sasaki-v11.jpg?v=stale"}'
        "</script>\n",
        encoding="utf-8",
    )
    nested = site / "conteudos" / "page"
    nested.mkdir(parents=True)
    (nested / "index.html").write_text(
        '<img src="../../assets/conteudos/consultoria-b2g-engenharia-construtora.jpg">\n',
        encoding="utf-8",
    )
    (site / "script.js").write_text(
        'const sharingImage = "/assets/conteudos/gestao-contrato-obra-publica-indicadores.jpg";\n',
        encoding="utf-8",
    )
    return source, site, digests


def _tree_bytes(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def test_public_artifact_references_are_content_bound_and_reproducible(tmp_path: Path) -> None:
    source, site, digests = _fixture(tmp_path)
    source_page = source / "index.html"
    source_page.write_text(
        '<meta property="og:image" content="https://confenge.com.br/assets/og-confenge.jpg">\n',
        encoding="utf-8",
    )
    source_html_before = source_page.read_bytes()
    legacy_asset_bytes = {target: (site / target).read_bytes() for target in TARGETS}

    first = version_commercial_media_references(site, source_root=source)
    first_tree = _tree_bytes(site)
    second = version_commercial_media_references(site, source_root=source)
    second_tree = _tree_bytes(site)

    assert first_tree == second_tree
    assert second["replacement_count"] == len(TARGETS)
    assert validate_commercial_media_versioning(site, source_root=source) == json.loads(
        (site / PUBLIC_MANIFEST).read_text(encoding="utf-8")
    )
    assert source_page.read_bytes() == source_html_before
    assert {target: (site / target).read_bytes() for target in TARGETS} == legacy_asset_bytes
    for target, digest in digests.items():
        references = "\n".join(
            path.read_text(encoding="utf-8")
            for path in site.rglob("*")
            if path.is_file()
            and path.suffix in {".html", ".js"}
        )
        assert f"{target}?v={digest}" in references
        assert f"{target}?v=stale" not in references
    assert first["assets"] == second["assets"]


def test_validation_rejects_unversioned_reference_and_tampered_bytes(tmp_path: Path) -> None:
    source, site, _digests = _fixture(tmp_path)
    version_commercial_media_references(site, source_root=source)

    (site / "late.json").write_text(
        '{"image":"https://confenge.com.br/assets/og-confenge.jpg"}',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="unversioned or stale"):
        validate_commercial_media_versioning(site, source_root=source)
    (site / "late.json").unlink()

    (site / TARGETS[0]).write_bytes(b"tampered")
    with pytest.raises(ValueError, match="bytes differ"):
        validate_commercial_media_versioning(site, source_root=source)


def test_missing_reference_or_published_asset_fails_closed(tmp_path: Path) -> None:
    source, site, _digests = _fixture(tmp_path)
    (site / "script.js").write_text("const noImage = true;\n", encoding="utf-8")
    with pytest.raises(ValueError, match="not discoverable"):
        version_commercial_media_references(site, source_root=source)

    _source, site, _digests = _fixture(tmp_path / "missing")
    (site / TARGETS[0]).unlink()
    with pytest.raises(FileNotFoundError, match="published target"):
        version_commercial_media_references(site, source_root=_source)
