"""Prototype isolation gates (#507, pre-condition P4 of #494).

Two halves, both required:
  1. hermetic behaviour of the isolation functions on a synthetic artifact;
  2. an assertion over the `_site` that `npm run build:site` actually produced.

The second half is skipped when no artifact exists, unless
PUBLIC_ARTIFACT_REQUIRED=1 declares that the build already ran (CI sets it for
the gate that runs right after `npm run build:site`).
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from scripts.pseo.build_site import (
    PROTOTYPE_SOURCE_DIR,
    ROOT,
    enforce_prototype_isolation,
    is_prototype_public_path,
    iter_prototype_leaks,
    prototype_source_root,
)
from scripts.pseo.public_artifact import PUBLIC_DIR_NAME


def test_prototype_path_is_declared_and_documented() -> None:
    assert PROTOTYPE_SOURCE_DIR == "docs/design-audit/prototypes"
    source = prototype_source_root()
    assert source == ROOT / "docs" / "design-audit" / "prototypes"
    # The path is a contract, so it must exist and say what it is.
    assert source.is_dir()
    assert (source / "README.md").is_file()


@pytest.mark.parametrize(
    "relative",
    [
        "docs/design-audit/prototypes/index.html",
        "docs/design-audit/prototypes/a/b/style.css",
        "design-audit/prototypes/index.html",
        "nested/docs/design-audit/prototypes/index.html",
    ],
)
def test_prototype_public_paths_are_recognised(relative: str) -> None:
    assert is_prototype_public_path(relative) is True


@pytest.mark.parametrize(
    "relative",
    [
        "index.html",
        "docs/design-audit/DESIGN_AUDIT.md",
        "prototypes-de-verdade/index.html",
        "design-audit/index.html",
        "conteudos/prototypes.html",
    ],
)
def test_neighbouring_paths_are_not_treated_as_prototypes(relative: str) -> None:
    assert is_prototype_public_path(relative) is False


def test_clean_artifact_reports_no_leak(tmp_path: Path) -> None:
    public = tmp_path / "_site"
    (public / "conteudos").mkdir(parents=True)
    (public / "index.html").write_text("<!doctype html>", encoding="utf-8")
    (public / "conteudos" / "index.html").write_text("<!doctype html>", encoding="utf-8")

    assert iter_prototype_leaks(public) == []
    report = enforce_prototype_isolation(public)
    assert report["leaked"] is False
    assert report["removed"] == []
    assert report["source"] == PROTOTYPE_SOURCE_DIR
    assert (public / "index.html").is_file()


def test_leaked_prototype_is_removed_from_the_artifact(tmp_path: Path) -> None:
    public = tmp_path / "_site"
    leaked = public / "docs" / "design-audit" / "prototypes" / "direcao-a"
    leaked.mkdir(parents=True)
    (leaked / "index.html").write_text("<!doctype html><p>prototipo</p>", encoding="utf-8")
    (leaked / "prototype.css").write_text("body{}", encoding="utf-8")
    (public / "index.html").write_text("<!doctype html>", encoding="utf-8")

    assert iter_prototype_leaks(public)

    report = enforce_prototype_isolation(public)

    assert report["leaked"] is True
    assert "docs/design-audit/prototypes" in report["removed"]
    assert iter_prototype_leaks(public) == []
    assert not (public / "docs" / "design-audit" / "prototypes").exists()
    # Isolation removes the prototype, never the public surface around it.
    assert (public / "index.html").is_file()


def test_prototype_promoted_one_level_up_is_also_removed(tmp_path: Path) -> None:
    public = tmp_path / "_site"
    leaked = public / "design-audit" / "prototypes"
    leaked.mkdir(parents=True)
    (leaked / "index.html").write_text("<!doctype html>", encoding="utf-8")

    report = enforce_prototype_isolation(public)

    assert report["leaked"] is True
    assert iter_prototype_leaks(public) == []


def test_isolation_is_idempotent(tmp_path: Path) -> None:
    public = tmp_path / "_site"
    public.mkdir(parents=True)
    (public / "index.html").write_text("<!doctype html>", encoding="utf-8")

    first = enforce_prototype_isolation(public)
    second = enforce_prototype_isolation(public)

    assert first == second
    assert second["leaked"] is False


def test_built_site_contains_no_prototype_path() -> None:
    """The built `_site` must not contain a single path under the prototype dir."""
    public = ROOT / PUBLIC_DIR_NAME
    required = os.environ.get("PUBLIC_ARTIFACT_REQUIRED") == "1"
    if not public.is_dir():
        if required:
            pytest.fail(
                f"PUBLIC_ARTIFACT_MISSING: {public} not built; run `npm run build:site` first"
            )
        pytest.skip(f"{PUBLIC_DIR_NAME} not built; run `npm run build:site` first")

    leaks = iter_prototype_leaks(public)
    assert leaks == [], f"prototype paths leaked into {PUBLIC_DIR_NAME}: {leaks[:10]}"

    # Belt and braces: no built path may even mention the prototype directory.
    dir_name = Path(PROTOTYPE_SOURCE_DIR).name
    mentions = [
        path.relative_to(public).as_posix()
        for path in public.rglob("*")
        if path.name == dir_name
    ]
    assert mentions == [], f"unexpected `{dir_name}` path in {PUBLIC_DIR_NAME}: {mentions[:10]}"
