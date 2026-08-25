from pathlib import Path

import pytest

from scripts.pseo.build_site import configure_turnstile_site_key


FORM = '<div id="turnstile-slot" hidden data-turnstile-sitekey=""></div>\n'


def write_form(root: Path, body: str = FORM) -> Path:
    target = root / "index.html"
    target.write_text(body, encoding="utf-8")
    return target


def test_local_build_keeps_empty_marker_without_site_key(tmp_path: Path) -> None:
    target = write_form(tmp_path)
    result = configure_turnstile_site_key(tmp_path, {"CONTEXT": "deploy-preview"})
    assert result["configured"] is False
    assert target.read_text(encoding="utf-8") == FORM


def test_production_build_fails_closed_without_site_key(tmp_path: Path) -> None:
    write_form(tmp_path)
    with pytest.raises(RuntimeError, match="required for the production"):
        configure_turnstile_site_key(tmp_path, {"CONTEXT": "production"})


def test_site_key_is_injected_only_into_publish_artifact(tmp_path: Path) -> None:
    target = write_form(tmp_path)
    result = configure_turnstile_site_key(
        tmp_path,
        {"CONTEXT": "production", "TURNSTILE_SITE_KEY": "0x-public-site-key-fixture"},
    )
    rendered = target.read_text(encoding="utf-8")
    assert result["configured"] is True
    assert 'data-turnstile-sitekey="0x-public-site-key-fixture"' in rendered
    assert 'data-turnstile-sitekey=""' not in rendered


def test_malformed_or_ambiguous_marker_fails_closed(tmp_path: Path) -> None:
    write_form(tmp_path, FORM + FORM)
    with pytest.raises(RuntimeError, match="exactly once"):
        configure_turnstile_site_key(
            tmp_path,
            {"CONTEXT": "production", "TURNSTILE_SITE_KEY": "0x-public-site-key-fixture"},
        )
