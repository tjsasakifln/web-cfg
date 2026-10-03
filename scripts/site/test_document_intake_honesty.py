#!/usr/bin/env python3
"""Truthful channels and durable receipts after the 2026-10-03 campaign.

The founder authorizes non-confidential references through email/WhatsApp.
The text-only form must never claim upload; persisted-success guards stay enforced.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.site.document_intake import capture_forms_with_file_input, dishonest_hits, visitor_html_files


def test_seo_confirmation_gate_rejects_unconditional_success_and_missing_guard():
    from seo.scripts.validate_seo import confirmation_state_problems
    html = (ROOT / "obrigado.html").read_text(encoding="utf-8")
    assert confirmation_state_problems(html) == []
    assert "unconditional_lead_success" in confirmation_state_problems(html.replace("<body", '<body data-lead-success="1"', 1))
    assert "guarded_receipt_confirmation_missing" in confirmation_state_problems(html.replace('r !== stored', 'false'))


def test_proposal_channels_are_available_without_file_upload():
    for rel in ("index.html", "triagem-tecnica/index.html", "bid-room-licitacoes-obras/index.html", "defesa-margem-contratos-publicos/index.html"):
        html = (ROOT / rel).read_text(encoding="utf-8")
        assert re.search(r'href="(?:https://wa\.me/|mailto:)', html), rel
        assert not capture_forms_with_file_input(html), rel
    contact = (ROOT / "triagem-tecnica/index.html").read_text(encoding="utf-8").lower()
    assert "referências técnicas não sigilosas" in contact
    assert "documentos confidenciais" in contact


def test_direct_confirmation_url_cannot_claim_a_persisted_request():
    for name in ("obrigado.html", "obrigado-contrato.html", "obrigado-edital.html", "obrigado-operacao.html"):
        html = (ROOT / name).read_text(encoding="utf-8")
        body_tag = re.search(r"<body\b[^>]*>", html, re.I)
        assert body_tag and "data-lead-success" not in body_tag.group(0), name
        h1 = re.search(r"<h1\b[^>]*>(.*?)</h1>", html, re.I | re.S)
        assert h1 and not re.search(r"\brecebemos\b|\bregistrad[ao]\b", h1.group(1), re.I), name
        assert 'id="receipt-id"' in html and "Protocolo" in html, name
        assert 'q.get("receipt")' in html and 'sessionStorage.getItem("confenge_last_receipt")' in html, name
        assert 'sessionStorage.getItem("confenge_last_receipt_destination")' in html, name
        assert "r !== stored" in html, name
        assert 'document.body.setAttribute("data-lead-success", "1")' in html, name
        assert len(re.findall(r"data-confirmed-only hidden", html)) >= 2, name
        for false_prefill in ("%20Acabei%20", "%0AEnviei%20", "%0APedi%20"):
            assert false_prefill not in html, name


def test_upload_detection_distinguishes_real_channels_from_false_capabilities():
    assert not dishonest_hits("Envie trechos do edital por e-mail ou WhatsApp.")
    assert dishonest_hits("O formulário recebe arquivos")
    assert capture_forms_with_file_input('<form action="/.netlify/functions/lead"><input type="file"></form>')
    assert not capture_forms_with_file_input('<form action="/.netlify/functions/lead"><textarea name="mensagem"></textarea></form>')


def test_home_form_keeps_labels_consent_and_return_channel():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'id="formulario-contato"' in html
    for field in ("nome", "email", "telefone", "consentimento"):
        assert f'id="{field}"' in html and f'for="{field}"' in html, field
    assert 'type="submit"' in html
    assert not capture_forms_with_file_input(html)


def test_all_visitor_forms_remain_truthful_about_upload():
    failures = []
    files = visitor_html_files(ROOT)
    assert len(files) > 50
    for path in files:
        html = path.read_text(encoding="utf-8")
        if capture_forms_with_file_input(html) or dishonest_hits(html):
            failures.append(str(path.relative_to(ROOT)))
    assert not failures, failures


def test_privacy_retention_and_contact_remain_accessible():
    html = (ROOT / "privacidade/index.html").read_text(encoding="utf-8").lower()
    assert "730" in html and "protocolo" in html
    assert "tiago.sasaki@confenge.com.br" in html
    assert "não recebe arquivo" in html or "nao recebe arquivo" in html


if __name__ == "__main__":
    failed = 0
    for name, test in list(globals().items()):
        if name.startswith("test_") and callable(test):
            try:
                test()
                print("OK", name)
            except Exception as exc:
                failed += 1
                print("FAIL", name, exc)
    sys.exit(1 if failed else 0)
