"""Checklist UI and CTA contrast structure from editorial render."""
from scripts.editorial.render import markdown_to_html, _is_checklist_page, _cta_block


def test_checklist_mode_renders_checkboxes():
    html = markdown_to_html("## Sec\n\n- Alpha\n- Beta\n", checklist=True)
    assert 'class="checklist"' in html
    assert html.count('type="checkbox"') == 2
    assert "<ul>" not in html.replace('class="checklist"', "")


def test_plain_list_without_checklist_mode():
    html = markdown_to_html("## Sec\n\n- Alpha\n", checklist=False)
    assert 'class="checklist"' not in html
    assert "<ul>" in html
    assert 'type="checkbox"' not in html


def test_explicit_checkbox_syntax():
    html = markdown_to_html("- [ ] Todo\n- [x] Done\n", checklist=False)
    assert html.count('type="checkbox"') == 2
    assert "checked" in html


def test_guia_page_is_checklist():
    assert _is_checklist_page({"page_id": "guia-docs-reequilibrio"})
    assert not _is_checklist_page({"page_id": "lei-limite-25-50", "title": "Limite 25"})


def test_cta_block_has_secondary_email_button():
    html = _cta_block(
        {
            "cta_whatsapp": "Oi",
            "cta_email_subject": "Assunto",
            "cta_email_body": "Corpo",
            "cta_offer": "Oferta",
        },
        "mid",
    )
    assert 'data-cta-channel="email"' in html
    assert "button-secondary" in html
    assert "lead-inline" in html
