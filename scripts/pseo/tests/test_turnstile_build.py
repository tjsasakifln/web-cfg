import subprocess
from pathlib import Path

import pytest

from scripts.pseo.build_site import configure_turnstile_site_key

ROOT = Path(__file__).resolve().parents[3]

FORM = '<div id="turnstile-slot" hidden data-turnstile-sitekey=""></div>\n'
CAPTURE_FORM = (
    '<form method="post" action="/.netlify/functions/lead">'
    "<input name=\"nome\"/><button type=\"submit\">Enviar</button></form>\n"
)
HOME_FORM = (
    '<form id="formulario-contato" method="POST" action="/obrigado">'
    "<button type=\"submit\">Enviar</button></form>\n"
)
SITEKEY = "0x-public-site-key-fixture"
PROD = {"CONTEXT": "production", "TURNSTILE_SITE_KEY": SITEKEY}


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


def _assert_widget_ready(html: str) -> None:
    assert 'id="turnstile-slot"' in html
    assert "cf-turnstile" in html
    assert f'data-turnstile-sitekey="{SITEKEY}"' in html
    assert 'data-turnstile-sitekey=""' not in html


def test_production_injects_site_key_into_every_capture_page(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text(HOME_FORM, encoding="utf-8")
    nested = tmp_path / "casos" / "modelo-mapa-compradores-publicos"
    nested.mkdir(parents=True)
    (nested / "index.html").write_text(CAPTURE_FORM, encoding="utf-8")
    (tmp_path / "conteudos").mkdir()
    (tmp_path / "conteudos" / "index.html").write_text("<p>sem captura</p>", encoding="utf-8")

    result = configure_turnstile_site_key(tmp_path, PROD)

    assert result["configured"] is True
    assert result["capture_files"] == 2
    _assert_widget_ready((tmp_path / "index.html").read_text(encoding="utf-8"))
    _assert_widget_ready((nested / "index.html").read_text(encoding="utf-8"))
    assert "turnstile" not in (tmp_path / "conteudos" / "index.html").read_text(encoding="utf-8")


def test_local_build_inserts_empty_slot_without_leaking_site_key(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text(CAPTURE_FORM, encoding="utf-8")
    result = configure_turnstile_site_key(tmp_path, {"CONTEXT": "deploy-preview"})
    html = (tmp_path / "index.html").read_text(encoding="utf-8")
    assert result["configured"] is False
    assert 'id="turnstile-slot"' in html
    assert 'data-turnstile-sitekey=""' in html
    assert SITEKEY not in html


def test_capture_form_without_close_tag_fails_closed(tmp_path: Path) -> None:
    write_form(tmp_path, '<form action="/.netlify/functions/lead"><input name="nome">')
    with pytest.raises(RuntimeError, match="turnstile_slot_insert_failed"):
        configure_turnstile_site_key(tmp_path, PROD)


def _tracked_capture_html() -> list[tuple[str, str]]:
    listed = subprocess.check_output(
        ["git", "-C", str(ROOT), "ls-files", "*.html"],
        text=True,
    ).splitlines()
    rows = []
    capture = (
        "action=\"/.netlify/functions/lead\"",
        "action='/.netlify/functions/lead'",
        'id="formulario-contato"',
        "id='formulario-contato'",
    )
    for rel in listed:
        if rel.startswith(".claude/") or rel.startswith(".worktrees/"):
            continue
        text = (ROOT / rel).read_text(encoding="utf-8")
        if any(token in text for token in capture):
            rows.append((rel, text))
    return rows


def test_issue_440_every_tracked_capture_route_receives_turnstile(tmp_path: Path) -> None:
    """Issue #440: every lead-capture HTML, not just home, ships widget + sitekey."""
    rows = _tracked_capture_html()
    assert len(rows) >= 22, f"capture surface shrank below the #440 census: {len(rows)}"
    for rel, text in rows:
        dest = tmp_path / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")

    result = configure_turnstile_site_key(tmp_path, PROD)
    assert result["configured"] is True
    assert result["capture_files"] == len(rows)
    ready = 0
    missing = []
    for rel, _ in rows:
        html = (tmp_path / rel).read_text(encoding="utf-8")
        keyed = f'data-turnstile-sitekey="{SITEKEY}"' in html
        widget = "cf-turnstile" in html
        if keyed and widget:
            ready += 1
        else:
            missing.append(rel)
    assert missing == []
    assert ready == len(rows)
