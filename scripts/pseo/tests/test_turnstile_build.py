from pathlib import Path

import pytest

from scripts.pseo.build_site import (
    _capture_form_bounds,
    configure_turnstile_site_key,
    is_lead_capture_html,
)
from scripts.site.public_copy_scope import visitor_facing_relpaths

ROOT = Path(__file__).resolve().parents[3]

SLOT = '<div id="turnstile-slot" hidden data-turnstile-sitekey=""><div class="cf-turnstile"></div></div>\n'
FORM = '<form id="formulario-contato" action="/obrigado">' + SLOT + "</form>\n"
CAPTURE_FORM = (
    '<form method="post" action="/.netlify/functions/lead">'
    "<input name=\"nome\"/><button type=\"submit\">Enviar</button></form>\n"
)
HOME_FORM = (
    '<form id="formulario-contato" method="POST" action="/obrigado">'
    "<button type=\"submit\">Enviar</button></form>\n"
)
XRAY_FORM = (
    '<form id="xray-form" action="/.netlify/functions/conversion-intake">'
    '<input type="hidden" name="action" value="xray" />'
    '<button type="submit">Veja sua empresa</button></form>\n'
)
HANDRAISE_FORM = (
    '<form id="handraise-form" action="/.netlify/functions/conversion-intake" '
    'data-turnstile-required="true" hidden>'
    '<input type="hidden" name="action" value="handraise" />'
    '<input name="nome"/><button type="submit">Pedir segunda leitura</button></form>\n'
)
SITEKEY = "0x4AAAAAAACanonicalPublicKeyTestValue"
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


def test_production_build_rejects_placeholder_site_key(tmp_path: Path) -> None:
    write_form(tmp_path)
    with pytest.raises(RuntimeError, match="malformed"):
        configure_turnstile_site_key(
            tmp_path,
            {"CONTEXT": "production", "TURNSTILE_SITE_KEY": "replace-with-site-key"},
        )


def test_site_key_is_injected_only_into_publish_artifact(tmp_path: Path) -> None:
    target = write_form(tmp_path)
    result = configure_turnstile_site_key(
        tmp_path,
        {"CONTEXT": "production", "TURNSTILE_SITE_KEY": SITEKEY},
    )
    rendered = target.read_text(encoding="utf-8")
    assert result["configured"] is True
    assert f'data-turnstile-sitekey="{SITEKEY}"' in rendered
    assert 'data-turnstile-sitekey=""' not in rendered


def test_malformed_or_ambiguous_marker_fails_closed(tmp_path: Path) -> None:
    write_form(
        tmp_path,
        '<form action="/.netlify/functions/lead">' + SLOT + SLOT + "</form>",
    )
    with pytest.raises(RuntimeError, match="expected exactly one"):
        configure_turnstile_site_key(
            tmp_path,
            {"CONTEXT": "production", "TURNSTILE_SITE_KEY": SITEKEY},
        )


def _assert_widget_ready(html: str) -> None:
    assert 'id="turnstile-slot"' in html
    assert "cf-turnstile" in html
    assert 'data-size="compact"' in html
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


def test_existing_turnstile_outside_capture_form_fails_closed(tmp_path: Path) -> None:
    write_form(tmp_path, SLOT + CAPTURE_FORM)
    with pytest.raises(RuntimeError, match="turnstile_slot_outside_capture_form"):
        configure_turnstile_site_key(tmp_path, PROD)


def test_single_quoted_turnstile_slot_inside_capture_form_is_not_duplicated(
    tmp_path: Path,
) -> None:
    write_form(
        tmp_path,
        '<form action="/.netlify/functions/lead">'
        "<div id='turnstile-slot' data-turnstile-sitekey=''>"
        "<div class='cf-turnstile'></div></div></form>",
    )

    configure_turnstile_site_key(tmp_path, PROD)

    html = (tmp_path / "index.html").read_text(encoding="utf-8")
    assert html.count("turnstile-slot") == 1
    assert html.count("cf-turnstile") == 1
    assert f"data-turnstile-sitekey='{SITEKEY}'" in html


def test_explicitly_protected_conversion_intake_form_is_capture() -> None:
    assert is_lead_capture_html(HANDRAISE_FORM) is True
    assert is_lead_capture_html(XRAY_FORM) is False


def test_conversion_intake_page_keys_only_explicitly_protected_form(tmp_path: Path) -> None:
    write_form(tmp_path, XRAY_FORM + HANDRAISE_FORM)

    result = configure_turnstile_site_key(tmp_path, PROD)

    html = (tmp_path / "index.html").read_text(encoding="utf-8")
    xray_start = html.index('id="xray-form"')
    xray_end = html.index("</form>", xray_start)
    handraise_start = html.index('id="handraise-form"')
    handraise_end = html.index("</form>", handraise_start)
    assert result["configured"] is True
    assert result["capture_files"] == 1
    assert html.count('id="turnstile-slot"') == 1
    assert "turnstile-slot" not in html[xray_start:xray_end]
    assert f'data-turnstile-sitekey="{SITEKEY}"' in html[handraise_start:handraise_end]


def test_turnstile_secret_is_never_written_to_public_artifact(tmp_path: Path) -> None:
    secret = "0x-private-turnstile-secret-must-never-ship"
    write_form(tmp_path, HANDRAISE_FORM)

    configure_turnstile_site_key(tmp_path, {**PROD, "TURNSTILE_SECRET_KEY": secret})

    html = (tmp_path / "index.html").read_text(encoding="utf-8")
    assert secret not in html
    assert SITEKEY in html


def _tracked_capture_html() -> list[tuple[str, str]]:
    rows = []
    # Reuse the shipped visitor census. Tooling fixtures may deliberately carry
    # realistic lead forms, but they are not public routes and must never alter
    # the exact 21-route production contract. The market-answer canary links to
    # a real capture surface; its former hidden metadata-only form was not a
    # usable lead path and must not inflate this census.
    for rel in visitor_facing_relpaths(ROOT):
        text = (ROOT / rel).read_text(encoding="utf-8")
        if is_lead_capture_html(text):
            rows.append((rel, text))
    return rows


ISSUE_440_CAPTURE_ROUTES = {
    "acompanhamento-contratos-obras/index.html",
    "atrasos-prorrogacao-obras-publicas/index.html",
    "bid-room-licitacoes-obras/index.html",
    "casos/index.html",
    "casos/modelo-apresentacao-executiva-resultados/index.html",
    "casos/modelo-base-quantitativa-canonica/index.html",
    "casos/modelo-contratos-vincendos-relicitacao/index.html",
    "casos/modelo-mapa-compradores-publicos/index.html",
    "casos/modelo-mapeamento-concorrentes-publicos/index.html",
    "casos/modelo-painel-precos-obras-publicas/index.html",
    "casos/modelo-relatorio-executivo-consolidado/index.html",
    "casos/modelo-relatorio-inteligencia-licitacoes/index.html",
    "comercial/radar-decisorio/index.html",
    "defesa-margem-contratos-publicos/index.html",
    "defesa-tecnica-contratos-publicos/index.html",
    "diagnostico-b2g-expansao/index.html",
    "diretoria-b2g/index.html",
    "entregas/index.html",
    "ferramentas/checklist-reequilibrio/index.html",
    "ferramentas/diagnostico-defesa-margem/index.html",
    "ferramentas/limite-acrescimos-supressoes/index.html",
    "index.html",
    "piloto/conversao-xray/index.html",
    "servicos-obras-publicas/index.html",
}


def test_issue_440_every_tracked_capture_route_receives_turnstile(tmp_path: Path) -> None:
    """Issue #440: every lead-capture HTML, not just home, ships widget + sitekey."""
    rows = _tracked_capture_html()
    assert {rel for rel, _ in rows} == ISSUE_440_CAPTURE_ROUTES
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
        form_start, form_end, _ = _capture_form_bounds(html)
        capture_form = html[form_start:form_end]
        keyed = f'data-turnstile-sitekey="{SITEKEY}"' in capture_form
        widget = "cf-turnstile" in capture_form
        script_loader = 'src="/script.js' in html or "src='/script.js" in html
        if keyed and widget and script_loader:
            ready += 1
        else:
            missing.append(rel)
    assert missing == []
    assert ready == len(rows)
