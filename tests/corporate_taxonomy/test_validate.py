"""Drive the shipped taxonomy validator. Mutations go through validate_taxonomy."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.corporate_taxonomy.validate import (  # noqa: E402
    COMMITTED_PATH,
    CONTRACT_ID,
    CONTRACT_VERSION,
    TaxonomyError,
    load_committed_taxonomy,
    seal_taxonomy,
    validate_taxonomy,
)

def committed() -> dict:
    return json.loads(COMMITTED_PATH.read_text(encoding="utf-8"))


def reseal(payload: dict) -> dict:
    sealed = seal_taxonomy(payload)
    payload.clear()
    payload.update(sealed)
    return payload


def test_committed_taxonomy_validates_and_names_five_nuclei() -> None:
    document = load_committed_taxonomy()
    assert document["contract_id"] == CONTRACT_ID
    assert document["contract_version"] == CONTRACT_VERSION
    assert [row["id"] for row in document["nuclei"]] == [
        "expert_evidence_assistance",
        "property_valuation",
        "building_engineering_documentation",
        "occupational_safety",
        "public_works_b2g",
    ]
    assert document["corporate_category"]["b2g_is_corporate_category"] is False
    b2g = next(row for row in document["nuclei"] if row["id"] == "public_works_b2g")
    assert b2g["protection"] == "protected_vertical"
    assert b2g["deprecated"] is False
    assert b2g["publication_status"] == "published"


def test_hash_mismatch_fails_closed() -> None:
    payload = committed()
    payload["nuclei"][0]["visitor_job"] += " mutated"
    with pytest.raises(TaxonomyError, match="content_sha256_mismatch"):
        validate_taxonomy(payload)


def test_exclusive_b2g_corporate_category_fails() -> None:
    payload = committed()
    payload["corporate_category"]["b2g_is_corporate_category"] = True
    reseal(payload)
    with pytest.raises(TaxonomyError, match="corporate_category_must_not_be_exclusive_b2g"):
        validate_taxonomy(payload)


def test_duplicate_nucleus_id_fails() -> None:
    payload = committed()
    payload["nuclei"][1]["id"] = payload["nuclei"][0]["id"]
    payload["nuclei"][1]["metrics"]["segment"] = payload["nuclei"][0]["id"]
    reseal(payload)
    with pytest.raises(TaxonomyError, match="duplicate_nucleus_id"):
        validate_taxonomy(payload)


@pytest.mark.parametrize(
    ("field", "pattern"),
    [
        ("visitor_job", "visitor_job"),
        ("proof_classes", "proof_class"),
        ("terminal_action", "terminal_action"),
        ("owner_plane", "owner"),
    ],
)
def test_nucleus_missing_required_field_fails(field: str, pattern: str) -> None:
    payload = committed()
    payload["nuclei"][0][field] = "" if field != "proof_classes" else []
    reseal(payload)
    with pytest.raises(TaxonomyError, match=pattern):
        validate_taxonomy(payload)


def test_route_binding_unknown_nucleus_fails() -> None:
    payload = committed()
    payload["route_bindings"][0]["nucleus_id"] = "not_a_nucleus"
    reseal(payload)
    with pytest.raises(TaxonomyError, match="route_or_offer_unknown_nucleus"):
        validate_taxonomy(payload)


def test_offer_reference_does_not_need_a_second_schema() -> None:
    payload = committed()
    extras = [
        {
            "offer_id": f"repeatable_offer_{index:03d}",
            "status": "candidate",
            "catalog_contract": "CONFENGE_OFFER_CATALOG/2.0.0",
        }
        for index in range(100)
    ]
    payload["nuclei"][2]["referenced_offers"] = extras
    reseal(payload)
    validated = validate_taxonomy(payload)
    assert len(validated["nuclei"][2]["referenced_offers"]) == 100


def test_missing_b2g_vertical_fails() -> None:
    payload = committed()
    replacement = copy.deepcopy(payload["nuclei"][-1])
    replacement["id"] = "public_works_other"
    replacement["metrics"]["segment"] = "public_works_other"
    replacement.pop("protection", None)
    replacement["publication_status"] = "draft"
    payload["nuclei"][-1] = replacement
    reseal(payload)
    with pytest.raises(TaxonomyError, match="b2g_protected_vertical_missing"):
        validate_taxonomy(payload)


def test_deprecated_b2g_vertical_fails() -> None:
    payload = committed()
    payload["nuclei"][-1]["deprecated"] = True
    reseal(payload)
    with pytest.raises(TaxonomyError, match="b2g_vertical_must_not_be_deprecated"):
        validate_taxonomy(payload)


def test_web_cfg_crm_authority_fails() -> None:
    payload = committed()
    payload["owner_planes"]["web-cfg"].append("crm")
    reseal(payload)
    with pytest.raises(TaxonomyError, match="web_cfg_crm_dispatch_forbidden"):
        validate_taxonomy(payload)


def test_crm_field_on_taxonomy_fails() -> None:
    payload = committed()
    payload["opportunity_state"] = "open"
    reseal(payload)
    with pytest.raises(
        TaxonomyError,
        match="taxonomy_fields_unknown:opportunity_state|crm_or_commercial_state_forbidden",
    ):
        validate_taxonomy(payload)


def test_extra_public_brand_fails() -> None:
    payload = committed()
    payload["public_identity"]["allowed_brands"] = ["CONFENGE", "SmartLic"]
    reseal(payload)
    with pytest.raises(TaxonomyError, match="extra_public_brand_forbidden"):
        validate_taxonomy(payload)


def test_extra_public_domain_fails() -> None:
    payload = committed()
    payload["public_identity"]["allowed_domains"] = ["confenge.com.br", "smartlic.tech"]
    reseal(payload)
    with pytest.raises(TaxonomyError, match="extra_public_domain_forbidden"):
        validate_taxonomy(payload)


def test_divergent_contract_version_fails() -> None:
    payload = committed()
    payload["contract_version"] = "UNKNOWN"
    reseal(payload)
    with pytest.raises(TaxonomyError, match="contract_version_mismatch"):
        validate_taxonomy(payload)
