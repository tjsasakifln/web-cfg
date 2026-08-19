"""Package builder and validator on the shipped functions."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.paid_search.family import select_family
from scripts.paid_search.package import build_package, validate_package
from scripts.paid_search.schema import (
    ALLOWED_MATCH_TYPES,
    CONVERSION_HIERARCHY,
    HUMAN_REQUIRED_FIELDS,
    PRIMARY_METRIC,
    SOURCE,
    UNKNOWN,
)


def _package() -> dict:
    return build_package(select_family(ROOT))


def test_package_has_required_contract_fields():
    package = _package()
    assert package["decision"] == "SELECTED"
    assert package["channel"] == "SEARCH"
    assert package["family"]["paid_demand"] == UNKNOWN
    assert package["primary_metric"]["name"] == PRIMARY_METRIC
    assert "click" in package["primary_metric"]["not"]
    assert "ctr" in package["primary_metric"]["not"]
    assert package["conversion_hierarchy"] == list(CONVERSION_HIERARCHY)
    assert package["attribution"]["source"] == SOURCE
    assert package["executable"] is False
    assert package["campaign_created"] is False
    assert package["spend_authorized"] is False
    assert package["ads_mutate"] is False
    assert package["go_live"] is False

    terms = package["terms"]
    assert terms["exact"]
    assert terms["phrase"]
    for row in terms["exact"]:
        assert row["match_type"] in ALLOWED_MATCH_TYPES
        assert row["match_type"] != "BROAD"
    for row in terms["phrase"]:
        assert row["match_type"] == "PHRASE"
    assert package["negatives"]
    assert package["brand_non_brand"]["canary_split"] == "non_brand"
    landing = package["landing"]
    assert (ROOT / landing["html_path"]).is_file()
    assert landing["path"].startswith("/ferramentas/diagnostico-defesa-margem")
    for field in HUMAN_REQUIRED_FIELDS:
        slot = package["human_required"][field]
        assert slot["status"] == "HUMAN_REQUIRED"
        assert slot["approved"] is False
        assert slot["value"] is None
    params = package["attribution"]["final_url"]["params"]
    assert "email" not in params
    assert "cnpj" not in params
    assert params["utm_source"] == "google"
    assert params["utm_medium"] == "cpc"


def test_validate_flags_unapproved_human_required():
    package = _package()
    result = validate_package(package)
    assert result["ok"] is False
    assert any(r.startswith("HUMAN_REQUIRED_") for r in result["reasons"])
    assert result["go_live"] is False


def test_validate_rejects_primary_click():
    package = _package()
    package["primary_metric"] = {"name": "ctr"}
    result = validate_package(package)
    assert "PRIMARY_IS_CLICK_OR_CTR" in result["reasons"]


def test_package_json_roundtrip_is_stable():
    package = _package()
    dumped = json.dumps(package, ensure_ascii=False, sort_keys=True)
    again = json.dumps(json.loads(dumped), ensure_ascii=False, sort_keys=True)
    assert dumped == again
