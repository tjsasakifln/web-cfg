"""Event payloads have no PII; page view is not a lead."""

from __future__ import annotations

from pathlib import Path

from scripts.market_answers.events import (
    EVENT_LAYER,
    EVENT_NAMES,
    assert_no_pii,
    build_event,
    catalog,
)

JS = Path(__file__).resolve().parents[2] / "assets/js/market-answer.js"


def test_catalog_separates_layers_and_declares_required_events():
    cat = catalog(asset_version="1.0", content_hash="abc")
    names = {item["name"] for item in cat["events"]}
    for required in EVENT_NAMES:
        assert required in names
    assert cat["source"] == "CONFENGE_WEB"
    assert cat["notes"]["page_view_is_not_lead"] is True
    assert EVENT_LAYER["answer_view"] == "impression"
    assert EVENT_LAYER["lead_receipt_correlated"] == "lead"
    assert EVENT_LAYER["cta_click"] == "engagement"


def test_build_event_strips_pii_keys_and_values():
    payload = build_event(
        "cta_click",
        {
            "cta_id": "veja-sua-empresa",
            "email": "alice@example.com",
            "nome": "Alice",
            "cnpj": "52407089000109",
            "telefone": "+5548988344559",
            "query": "quanto custa 1 km",
        },
    )
    assert_no_pii(payload)
    assert payload["event"] == "cta_click"
    assert payload["cta_id"] == "veja-sua-empresa"
    assert payload["source"] == "CONFENGE_WEB"
    for key in ("email", "nome", "cnpj", "telefone", "query"):
        assert key not in payload
    assert payload["event_layer"] != "lead"
    assert payload["event"] != "page_view"


def test_shipped_js_does_not_send_pii_fields():
    source = JS.read_text(encoding="utf-8")
    for name in EVENT_NAMES:
        assert name in source
    assert "CONFENGE_WEB" in source
    # The denylist exists; emit() deletes those keys.
    assert "delete props[key]" in source
    assert "PII" in source
    # Must not read form PII into analytics.
    assert "querySelector('#email')" not in source
    assert "querySelector('#nome')" not in source
    assert "querySelector('#cnpj')" not in source
