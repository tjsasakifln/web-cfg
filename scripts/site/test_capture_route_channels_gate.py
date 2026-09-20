#!/usr/bin/env python3
"""WS-G (BOFU-FECHAMENTO-20260919): every route with an active capture form
publishes wa.me in <main>, mailto on the page and the no-JS note.

Counter-proofs for CONTEXTO-CAPTURA-01/-05/-06 in ``gate_conversion``:
``_capture_route_findings`` grades synthetic documents (no channel, channel
only inside <noscript>, note missing, dated exception, exception already
satisfied, exception expired) and the shipped tree must be fully covered with
the five route-exact exceptions reported. Before this rule the production tree
(fedb4768b) passed the gate with /analise-cnpj/ publishing no channel at all,
/entregas/ without WhatsApp and 13 generated forms without the note.

Uso: python3 scripts/site/test_capture_route_channels_gate.py
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.inbound_gates import (  # noqa: E402
    CAPTURE_NOJS_NOTE_EXCEPTIONS,
    CAPTURE_WHATSAPP_EXCEPTIONS,
    _capture_route_findings,
    gate_conversion,
)

TODAY = date(2026, 9, 19)
FORM = (
    '<form method="post" action="/.netlify/functions/lead" data-cta-id="x">'
    "{note}<input name=\"nome\"></form>"
)
NOTE = (
    '<noscript><p class="form-hint form-nojs-note">Sem JavaScript, este formulário não envia. '
    'Use o <a href="https://wa.me/5548999999999">WhatsApp</a> ou o '
    '<a href="mailto:contato@example.test">e-mail</a> ao lado.</p></noscript>'
)
WA = '<a href="https://wa.me/5548999999999?text=Contexto">Conversar</a>'
MAIL = '<a href="mailto:contato@example.test">E-mail</a>'


def page(main: str, footer: str = "") -> tuple[str, str]:
    html = f"<!doctype html><html><body><main>{main}</main><footer>{footer}</footer></body></html>"
    return html, main


def grade(route: str, main: str, footer: str = "", today: date = TODAY):
    html, main_html = page(main, footer)
    findings, exemptions, is_capture = _capture_route_findings("x/index.html", route, html, main_html, today)
    return {f.reason: f.severity for f in findings}, exemptions, is_capture


def test_page_without_form_is_not_a_capture_route() -> None:
    reasons, exemptions, is_capture = grade("/qualquer/", f"<p>Texto</p>{WA}{MAIL}")
    assert is_capture is False and reasons == {} and exemptions == []


def test_form_without_any_channel_or_note_fails_closed() -> None:
    reasons, _, is_capture = grade("/qualquer/", FORM.format(note=""))
    assert is_capture is True
    assert reasons == {
        "capture_route_missing_whatsapp": "error",
        "capture_route_missing_email": "error",
        "capture_route_missing_nojs_note": "error",
    }, reasons


def test_channels_only_inside_noscript_do_not_count() -> None:
    """The note's own links are the no-JS fallback, not the published channel."""
    reasons, _, _ = grade("/qualquer/", FORM.format(note=NOTE))
    assert reasons == {
        "capture_route_missing_whatsapp": "error",
        "capture_route_missing_email": "error",
    }, reasons


def test_email_in_the_footer_counts_whatsapp_must_be_in_main() -> None:
    reasons, _, _ = grade("/qualquer/", FORM.format(note=NOTE) + WA, footer=MAIL)
    assert reasons == {}, reasons
    reasons, _, _ = grade("/qualquer/", FORM.format(note=NOTE) + MAIL, footer=WA)
    assert reasons == {"capture_route_missing_whatsapp": "error"}, reasons


def test_note_must_name_a_channel() -> None:
    bare = '<noscript><p class="form-hint form-nojs-note">Sem JavaScript, este formulário não envia.</p></noscript>'
    reasons, _, _ = grade("/qualquer/", FORM.format(note=bare) + WA + MAIL)
    assert reasons == {"capture_route_missing_nojs_note": "error"}, reasons


def test_home_style_page_level_note_is_accepted() -> None:
    own = '<p class="form-nojs-note">Sem JavaScript, este formulário não envia. Use o WhatsApp ao lado.</p>'
    reasons, _, _ = grade("/", own + FORM.format(note="") + WA + MAIL)
    assert reasons == {}, reasons


def test_dated_exception_is_a_reported_warning_until_it_expires() -> None:
    route = "/ferramentas/checklist-reequilibrio/"
    assert CAPTURE_WHATSAPP_EXCEPTIONS[route]["expires_at"] == "2026-10-19"
    reasons, exemptions, _ = grade(route, FORM.format(note=NOTE) + MAIL)
    assert reasons == {"capture_whatsapp_debt": "warn"}, reasons
    assert [e["route"] for e in exemptions] == [route]
    assert exemptions[0]["owner_issue"] == 705 and exemptions[0]["expired"] is False
    reasons, exemptions, _ = grade(route, FORM.format(note=NOTE) + MAIL, today=date(2026, 10, 20))
    assert reasons == {"capture_whatsapp_debt_expired": "error"}, reasons
    assert exemptions[0]["expired"] is True


def test_exception_already_satisfied_is_reported_for_removal() -> None:
    route = "/casos/modelo-relatorio-inteligencia-licitacoes/"
    reasons, exemptions, _ = grade(route, FORM.format(note=NOTE) + WA + MAIL)
    assert reasons == {"capture_exception_satisfied_remove_it": "warn"}, reasons
    assert exemptions == []


def test_frozen_pillar_note_debt_is_dated_and_route_exact() -> None:
    route = "/diagnostico-pre-licitacao/"
    entry = CAPTURE_NOJS_NOTE_EXCEPTIONS[route]
    assert entry["owner_issue"] == 705 and entry["dated"] == "2026-09-19" and entry["expires_at"]
    reasons, _, _ = grade(route, FORM.format(note="") + WA + MAIL)
    assert reasons == {"capture_nojs_note_debt": "warn"}, reasons
    # Any other route without the note is an error, never a debt.
    reasons, _, _ = grade("/outro-pilar/", FORM.format(note="") + WA + MAIL)
    assert reasons == {"capture_route_missing_nojs_note": "error"}, reasons


def test_every_exception_is_route_exact_dated_and_owned() -> None:
    for table in (CAPTURE_WHATSAPP_EXCEPTIONS, CAPTURE_NOJS_NOTE_EXCEPTIONS):
        for route, entry in table.items():
            assert route.startswith("/") and route.endswith("/"), route
            assert (ROOT / route.strip("/") / "index.html").is_file(), route
            assert entry["owner_issue"] and entry["dated"] and entry["reason"].strip(), route
            assert entry["kind"].startswith("capture_"), route


def test_shipped_tree_is_fully_covered_with_the_exceptions_reported() -> None:
    report = gate_conversion(now=TODAY)
    stats = report.stats["capture_route_channels"]
    assert stats["total"] >= 30, stats
    assert stats["covered"] == stats["total"], [
        (f.path, f.reason) for f in report.findings if f.reason.startswith("capture_") and f.severity == "error"
    ]
    reported = {e["route"] for e in stats["exemptions"]}
    assert reported == set(CAPTURE_WHATSAPP_EXCEPTIONS) | set(CAPTURE_NOJS_NOTE_EXCEPTIONS), reported
    assert not any(f.reason == "capture_exception_satisfied_remove_it" for f in report.findings), (
        "an exception whose route already publishes the channel must be removed"
    )
    # The family/terminal-action exemptions keep their own vocabulary.
    assert not any(str(e["kind"]).startswith("capture_") for e in report.stats["exemptions"])


def main() -> int:
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
        print(f"OK {test.__name__}")
    print("CAPTURE_ROUTE_CHANNELS_GATE_TESTS_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
