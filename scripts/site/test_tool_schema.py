"""Adversarial coverage for the rendered tool schema release gate."""
from __future__ import annotations

from html import escape
import json
from pathlib import Path

import pytest

from scripts.site.test_tool_showcase_dates import catalogue_artifact  # noqa: F401
from scripts.site.verify_tool_showcase import Markup, jsonld_nodes, verify, verify_application_categories

ROUTE = "/ferramentas/exemplo/"


def script(payload) -> str:
    return '<script type="application/ld+json">' + json.dumps(payload) + "</script>"


@pytest.mark.parametrize("category", ["DesignApplication", "BusinessApplication", "UtilitiesApplication"])
@pytest.mark.parametrize("kind", ["SoftwareApplication", "WebApplication", ["SoftwareApplication", "WebApplication"]])
def test_supported_tool_category_without_invented_reviews_or_price(category, kind):
    payload = {"@type": kind, "name": "Ferramenta", "applicationCategory": category}
    dom = Markup(script(payload))
    verify_application_categories(dom, ROUTE)
    assert jsonld_nodes(dom, ROUTE) == [payload]
    assert not {"offers", "review", "aggregateRating"} & payload.keys()


@pytest.mark.parametrize("wrap", [
    lambda node: node,
    lambda node: [node],
    lambda node: {"@context": "https://schema.org", "@graph": [node]},
    lambda node: [{"@graph": [{"@type": "CollectionPage", "mainEntity": node}]}],
])
def test_invalid_category_cannot_hide_in_graph_lists_or_multitype(wrap):
    node = {"@type": ["Thing", "WebApplication"], "applicationCategory": "EngineeringApplication"}
    with pytest.raises(AssertionError, match="unsupported_application_category:.*EngineeringApplication"):
        verify_application_categories(Markup(script(wrap(node))), ROUTE)


@pytest.mark.parametrize("category", [None, "", 12, {}, [], ["UtilitiesApplication", "EngineeringApplication"]])
def test_explicit_invalid_category_is_rejected(category):
    with pytest.raises(AssertionError, match="unsupported_application_category"):
        verify_application_categories(Markup(script({"@type": "WebApplication", "applicationCategory": category})), ROUTE)


def test_category_is_optional_and_collections_are_not_software():
    payload = {"@graph": [
        {"@type": "SoftwareApplication", "name": "Ferramenta", "offers": {"price": "0", "priceCurrency": "BRL"}},
        {"@type": "CollectionPage", "name": "Catálogo"},
        {"@type": "Service", "name": "Serviço"},
    ]}
    dom = Markup(script(payload))
    verify_application_categories(dom, ROUTE)
    assert json.loads(dom.jsonld[0]) == payload


def test_multiple_supported_categories_are_valid():
    verify_application_categories(Markup(script({
        "@type": "WebApplication", "applicationCategory": ["BusinessApplication", "UtilitiesApplication"],
    })), ROUTE)


def test_only_actual_active_jsonld_script_elements_are_checked():
    invalid = script({"@type": "WebApplication", "applicationCategory": "EngineeringApplication"})
    # A literal closing script tag terminates HTML even inside a JS string, so
    # use the same escaped closing form that a legitimate inline example uses.
    js_example = invalid.replace("</script>", "<\\/script>")
    html = (
        f"<!-- {invalid} -->"
        + "<pre><code>" + escape(invalid) + "</code></pre>"
        + "<script>const example = " + json.dumps(js_example) + ";</script>"
        + "<template>" + invalid + "</template>"
        + "<textarea>" + invalid + "</textarea>"
        + script({"@type": "WebApplication", "applicationCategory": "UtilitiesApplication"})
    )
    dom = Markup(html)
    assert len(dom.jsonld) == 1
    verify_application_categories(dom, ROUTE)


def test_jsonld_attribute_order_and_case_do_not_bypass_gate():
    html = '<SCRIPT id="application" TYPE=" Application/LD+JSON ">{"@type":"WebApplication","applicationCategory":"EngineeringApplication"}</SCRIPT>'
    with pytest.raises(AssertionError, match="unsupported_application_category"):
        verify_application_categories(Markup(html), ROUTE)


@pytest.mark.parametrize("raw", ['{"@type":', '"not a JSON-LD object"'])
def test_malformed_document_jsonld_fails_clearly(raw):
    with pytest.raises(AssertionError, match="invalid_jsonld"):
        verify_application_categories(Markup('<script type="application/ld+json">' + raw + "</script>"), ROUTE)


def test_release_gate_rejects_bad_category_after_artifact_transforms(catalogue_artifact: Path):
    page = catalogue_artifact / "ferramentas/calculadora-de-beiral/index.html"
    html = page.read_text(encoding="utf-8")
    assert '"applicationCategory":"DesignApplication"' in html
    page.write_text(html.replace('"applicationCategory":"DesignApplication"',
                                 '"applicationCategory":"EngineeringApplication"', 1), encoding="utf-8")
    with pytest.raises(AssertionError, match="/ferramentas/calculadora-de-beiral/.*unsupported_application_category"):
        verify(catalogue_artifact)
