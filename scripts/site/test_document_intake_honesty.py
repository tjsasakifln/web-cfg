#!/usr/bin/env python3
"""Visitor copy and capture forms must describe option B: no file upload."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.document_intake import (  # noqa: E402
    CHANNEL_SLA,
    HASH_BOUND_LIE_PATHS,
    HONEST_CTA,
    capture_forms_with_file_input,
    dishonest_hits,
    is_frozen,
    visitor_html_files,
)


def test_honest_cta_on_former_document_surfaces() -> None:
    for rel in (
        "index.html",
        "bid-room-licitacoes-obras/index.html",
        "defesa-margem-contratos-publicos/index.html",
        "obrigado-contrato.html",
        "obrigado-edital.html",
    ):
        html = (ROOT / rel).read_text(encoding="utf-8")
        assert HONEST_CTA in html, f"{rel} missing {HONEST_CTA}"
        assert 'type="file"' not in html.lower()
        assert "type='file'" not in html.lower()


def test_confirmation_persists_protocol_and_b_sla() -> None:
    for name in ("obrigado-contrato.html", "obrigado-edital.html", "obrigado.html"):
        html = (ROOT / name).read_text(encoding="utf-8")
        assert 'id="receipt-id"' in html, name
        assert "Protocolo" in html, name
        assert CHANNEL_SLA in html, name
        assert 'data-lead-success' in html, name


def test_home_form_is_text_only_and_labeled() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'id="formulario-contato"' in html
    assert 'name="document_intent" type="hidden" value="secure_channel_request"' in html
    assert 'id="canal_seguro"' in html
    assert 'for="canal_seguro"' in html
    assert 'id="nome"' in html and 'for="nome"' in html
    assert 'type="submit"' in html
    assert not capture_forms_with_file_input(html)


def test_mutable_visitor_html_does_not_claim_file_upload() -> None:
    failures: list[str] = []
    scanned = 0
    for path in visitor_html_files(ROOT):
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        html = path.read_text(encoding="utf-8")
        scanned += 1
        if capture_forms_with_file_input(html):
            failures.append(f"{rel}: capture form has type=file")
        hits = dishonest_hits(html)
        if hits and is_frozen(rel):
            continue
        if hits:
            failures.append(f"{rel}: {hits}")
    assert scanned > 50, f"scope collapsed to {scanned}"
    for rel in sorted(HASH_BOUND_LIE_PATHS):
        assert (ROOT / rel).is_file(), f"hash-bound exception missing file: {rel}"
    assert not failures, "dishonest file-receive copy on mutable visitor HTML:\n" + "\n".join(failures)


def test_privacy_describes_request_not_a_file_store() -> None:
    html = (ROOT / "privacidade" / "index.html").read_text(encoding="utf-8")
    assert "não recebe arquivo" in html.lower() or "nao recebe arquivo" in html.lower()
    assert "730" in html
    assert "protocolo" in html.lower()
    assert CHANNEL_SLA in html
    assert "tiago.sasaki@confenge.com.br" in html


if __name__ == "__main__":
    failed = 0
    for t in (
        test_honest_cta_on_former_document_surfaces,
        test_confirmation_persists_protocol_and_b_sla,
        test_home_form_is_text_only_and_labeled,
        test_mutable_visitor_html_does_not_claim_file_upload,
        test_privacy_describes_request_not_a_file_store,
    ):
        try:
            t()
            print("OK", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, exc)
    sys.exit(1 if failed else 0)
