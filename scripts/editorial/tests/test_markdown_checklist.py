from scripts.editorial.render import markdown_to_html, _is_checklist_page, _cta_block, resolve_interaction_type

def test_checklist_mode_renders_checkboxes():
    html = markdown_to_html("## 1. Sec\n\n- Alpha\n- Beta\n", checklist=True)
    assert 'class="checklist"' in html
    assert html.count('type="checkbox"') == 2

def test_plain_list_without_checklist_mode():
    html = markdown_to_html("## Sec\n\n- Alpha\n", checklist=False)
    assert "checklist-input" not in html

def test_explicit_checkbox_syntax():
    html = markdown_to_html("- [ ] Todo\n- [x] Done\n", checklist=False)
    assert html.count('type="checkbox"') == 2

def test_interaction_type_not_prefix_only():
    assert resolve_interaction_type({"page_id": "guia-docs-reequilibrio", "interaction_type": "operational_guide"}) == "operational_guide"
    assert not _is_checklist_page({"page_id": "guia-docs-reequilibrio", "interaction_type": "operational_guide"})
    assert _is_checklist_page({"page_id": "guia-checklist-aditivo", "interaction_type": "checklist"})

def test_cta_block_premium_structure():
    page = {"cta_whatsapp":"Oi","cta_email_subject":"Assunto","cta_email_body":"Corpo","cta_offer":"Oferta"}
    mid = _cta_block(page, "mid")
    footer = _cta_block(page, "footer")
    assert 'class="editorial-cta"' in mid
    assert 'aria-label="Próximo passo no conteúdo"' in mid
    assert 'aria-label="Próximo passo ao final"' in footer
    assert 'aria-label="Próximo passo"' not in mid + footer
