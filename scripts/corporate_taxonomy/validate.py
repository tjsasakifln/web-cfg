"""Fail-closed validator for CONFENGE_CORPORATE_TAXONOMY.

The taxonomy is versioned JSON content. This module does not duplicate
nucleus names, visitor jobs or offers as Python constants. Contract identity
(id, version, the five required nucleus IDs, forbidden authority) is the
only invariant encoded here so a missing or divergent document fails closed.
"""

from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

CONTRACT_ID = "CONFENGE_CORPORATE_TAXONOMY"
CONTRACT_VERSION = "1.0.0-draft.20260904"
SCHEMA_ID = "confenge-corporate-taxonomy/v1"
PROTECTED_VERTICAL_ID = "public_works_b2g"
REQUIRED_NUCLEUS_IDS = (
    "expert_evidence_assistance",
    "property_valuation",
    "building_engineering_documentation",
    "occupational_safety",
    "public_works_b2g",
)
CORPORATE_CATEGORY_ID = "engineering_expert_evidence_technical_intelligence"
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
NUCLEUS_ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")
PUBLIC_BRAND = "CONFENGE"
PUBLIC_DOMAIN = "confenge.com.br"

NUCLEUS_REQUIRED = {
    "id",
    "public_name",
    "corporate_category_id",
    "visitor_job",
    "icps",
    "triggers",
    "typical_decisions_artifacts",
    "limits",
    "conflict_profile",
    "sensitivity_profile",
    "geo_field_rule",
    "proof_classes",
    "terminal_action",
    "owner_plane",
    "referenced_offers",
    "metrics",
    "publication_status",
}
NUCLEUS_OPTIONAL = {
    "protection",
    "deprecated",
    "notes",
}
PUBLICATION_STATUSES = frozenset({"published", "draft", "candidate"})
OWNER_PLANES = frozenset({"web-cfg", "extra-cli", "governance", "warmbly", "meetcfg"})
WEB_CFG_ALLOWED = frozenset(
    {
        "public_surface",
        "inbound_acquisition",
        "trust",
        "offer_publication",
        "capture",
        "public_analytics",
    }
)
WEB_CFG_FORBIDDEN = frozenset(
    {
        "crm",
        "dispatch",
        "cadence",
        "opportunity_state",
        "proposal",
        "billing",
        "outcome",
        "sales_ops",
        "control_center",
    }
)
FORBIDDEN_PAYLOAD_KEYS = frozenset(
    {
        "crm",
        "opportunity_state",
        "dispatch",
        "proposal",
        "billing",
        "outcome",
        "cadence",
        "deal",
        "pipeline",
        "invoice",
        "payment_status",
        "contact_state",
        "sales_ops",
        "auto_send",
        "outbound_eligible",
        "opportunity_id",
        "lead_id",
        "account_id",
    }
)
DOCUMENT_REQUIRED = {
    "contract_id",
    "contract_version",
    "schema_id",
    "as_of",
    "decision_date",
    "owner_issue",
    "parent_issue",
    "producer",
    "content_sha256",
    "corporate_category",
    "public_identity",
    "owner_planes",
    "north_star",
    "addition_rules",
    "nuclei",
    "route_bindings",
    "b2g_coexistence",
}
DOCUMENT_OPTIONAL = {
    "notes",
    "sibling_contracts",
}

ROOT = Path(__file__).resolve().parents[2]
COMMITTED_PATH = ROOT / "data" / "corporate" / "taxonomy.v1.json"


class TaxonomyError(ValueError):
    """Taxonomy document failed closed."""


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def unsigned_taxonomy(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key != "content_sha256"}


def seal_taxonomy(payload: dict[str, Any]) -> dict[str, Any]:
    sealed = deepcopy(payload)
    sealed.pop("content_sha256", None)
    sealed["content_sha256"] = sha256_json(sealed)
    return sealed


def _require_dict(value: Any, code: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TaxonomyError(code)
    return value


def _require_exact_keys(
    value: Any,
    *,
    required: set[str],
    optional: set[str] | None = None,
    code: str,
) -> dict[str, Any]:
    payload = _require_dict(value, f"{code}_invalid")
    optional = optional or set()
    missing = sorted(required - set(payload))
    unknown = sorted(set(payload) - required - optional)
    if missing:
        raise TaxonomyError(f"{code}_fields_missing:{','.join(missing)}")
    if unknown:
        raise TaxonomyError(f"{code}_fields_unknown:{','.join(unknown)}")
    return payload


def _require_text(value: Any, code: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise TaxonomyError(code)
    return value


def _require_nonempty_str_list(value: Any, code: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise TaxonomyError(code)
    out: list[str] = []
    for item in value:
        out.append(_require_text(item, code))
    return out


def _walk_forbidden_keys(value: Any, *, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = re.sub(r"(?<!^)(?=[A-Z])", "_", str(key)).strip().lower()
            if normalized in FORBIDDEN_PAYLOAD_KEYS:
                raise TaxonomyError(f"crm_or_commercial_state_forbidden:{path}.{key}")
            _walk_forbidden_keys(child, path=f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk_forbidden_keys(child, path=f"{path}[{index}]")


def _validate_producer(value: Any) -> dict[str, Any]:
    producer = _require_exact_keys(
        value,
        required={"authority", "repository", "path"},
        code="producer",
    )
    if producer["repository"] != "tjsasakifln/web-cfg":
        raise TaxonomyError("producer_repository_invalid")
    if producer["path"] != "data/corporate/taxonomy.v1.json":
        raise TaxonomyError("producer_path_invalid")
    _require_text(producer["authority"], "producer_authority_invalid")
    return producer


def _validate_corporate_category(value: Any) -> dict[str, Any]:
    category = _require_exact_keys(
        value,
        required={
            "id",
            "public_name",
            "public_name_en",
            "exclusive_to_nucleus",
            "b2g_is_corporate_category",
        },
        code="corporate_category",
    )
    if category["id"] != CORPORATE_CATEGORY_ID:
        raise TaxonomyError("corporate_category_id_invalid")
    _require_text(category["public_name"], "corporate_category_public_name_invalid")
    _require_text(category["public_name_en"], "corporate_category_public_name_en_invalid")
    if category["exclusive_to_nucleus"] is not None:
        raise TaxonomyError("corporate_category_exclusive_to_nucleus")
    if category["b2g_is_corporate_category"] is not False:
        raise TaxonomyError("corporate_category_must_not_be_exclusive_b2g")
    lowered = f"{category['public_name']} {category['public_name_en']}".lower()
    if "b2g" in lowered and "períc" not in category["public_name"].lower():
        raise TaxonomyError("corporate_category_must_not_be_exclusive_b2g")
    return category


def _validate_public_identity(value: Any) -> dict[str, Any]:
    identity = _require_exact_keys(
        value,
        required={
            "brand",
            "domain",
            "canonical_surface",
            "allowed_brands",
            "allowed_domains",
            "sub_brand_policy",
        },
        code="public_identity",
    )
    if identity["brand"] != PUBLIC_BRAND:
        raise TaxonomyError("public_brand_invalid")
    if identity["domain"] != PUBLIC_DOMAIN:
        raise TaxonomyError("public_domain_invalid")
    if identity["canonical_surface"] != f"https://{PUBLIC_DOMAIN}/":
        raise TaxonomyError("canonical_surface_invalid")
    brands = identity["allowed_brands"]
    domains = identity["allowed_domains"]
    if brands != [PUBLIC_BRAND]:
        raise TaxonomyError("extra_public_brand_forbidden")
    if domains != [PUBLIC_DOMAIN]:
        raise TaxonomyError("extra_public_domain_forbidden")
    if identity["sub_brand_policy"] != "forbidden":
        raise TaxonomyError("sub_brand_policy_must_be_forbidden")
    return identity


def _validate_owner_planes(value: Any) -> dict[str, Any]:
    planes = _require_dict(value, "owner_planes_invalid")
    expected = {"web-cfg", "extra-cli", "governance", "warmbly", "meetcfg"}
    if set(planes) != expected:
        raise TaxonomyError("owner_planes_keys_invalid")
    for plane, duties in planes.items():
        items = _require_nonempty_str_list(duties, f"owner_plane_{plane}_invalid")
        if plane != "web-cfg":
            continue
        forbidden = sorted(set(items) & WEB_CFG_FORBIDDEN)
        if forbidden:
            raise TaxonomyError(f"web_cfg_crm_dispatch_forbidden:{','.join(forbidden)}")
        unknown = sorted(set(items) - WEB_CFG_ALLOWED)
        if unknown:
            raise TaxonomyError(f"web_cfg_authority_unknown:{','.join(unknown)}")
    return planes


def _validate_north_star(value: Any) -> dict[str, Any]:
    star = _require_exact_keys(
        value,
        required={"metric", "segment_by", "downstream", "not_success_metrics"},
        code="north_star",
    )
    if star["metric"] != "qualified_commercial_opportunity":
        raise TaxonomyError("north_star_metric_invalid")
    if star["segment_by"] != "nucleus_id":
        raise TaxonomyError("north_star_must_segment_by_nucleus")
    _require_nonempty_str_list(star["downstream"], "north_star_downstream_invalid")
    if "proposal" not in star["downstream"] or "revenue" not in star["downstream"]:
        raise TaxonomyError("north_star_downstream_missing_proposal_or_revenue")
    _require_nonempty_str_list(
        star["not_success_metrics"], "north_star_not_success_metrics_invalid"
    )
    return star


def _validate_addition_rules(value: Any) -> dict[str, Any]:
    rules = _require_exact_keys(
        value,
        required={"nucleus", "offer", "route", "location", "proof"},
        code="addition_rules",
    )
    for key in ("nucleus", "offer", "route", "location", "proof"):
        _require_text(rules[key], f"addition_rules_{key}_invalid")
    return rules


def _validate_offer_ref(value: Any, *, nucleus_id: str, index: int) -> dict[str, Any]:
    ref = _require_exact_keys(
        value,
        required={"offer_id", "status"},
        optional={"catalog_contract", "notes"},
        code=f"nucleus_{nucleus_id}_offer[{index}]",
    )
    _require_text(ref["offer_id"], f"nucleus_{nucleus_id}_offer_id_invalid")
    if ref["status"] not in PUBLICATION_STATUSES:
        raise TaxonomyError(f"nucleus_{nucleus_id}_offer_status_invalid")
    catalog_keys = {"price", "amount_cents", "sla", "billing", "checkout"}
    if catalog_keys & set(ref):
        raise TaxonomyError(f"nucleus_{nucleus_id}_offer_duplicates_catalog")
    return ref


def _validate_metrics(value: Any, *, nucleus_id: str) -> dict[str, Any]:
    metrics = _require_exact_keys(
        value,
        required={"north_star", "segment", "downstream"},
        optional={"notes"},
        code=f"nucleus_{nucleus_id}_metrics",
    )
    if metrics["north_star"] != "qualified_commercial_opportunity":
        raise TaxonomyError(f"nucleus_{nucleus_id}_metrics_north_star_invalid")
    if metrics["segment"] != nucleus_id:
        raise TaxonomyError(f"nucleus_{nucleus_id}_metrics_segment_mismatch")
    _require_nonempty_str_list(
        metrics["downstream"], f"nucleus_{nucleus_id}_metrics_downstream_invalid"
    )
    return metrics


def _validate_nucleus(value: Any) -> dict[str, Any]:
    nucleus = _require_exact_keys(
        value,
        required=NUCLEUS_REQUIRED,
        optional=NUCLEUS_OPTIONAL,
        code="nucleus",
    )
    nucleus_id = _require_text(nucleus["id"], "nucleus_id_invalid")
    if not NUCLEUS_ID_RE.fullmatch(nucleus_id):
        raise TaxonomyError(f"nucleus_id_not_ascii_stable:{nucleus_id}")
    _require_text(nucleus["public_name"], f"nucleus_{nucleus_id}_public_name_invalid")
    if nucleus["corporate_category_id"] != CORPORATE_CATEGORY_ID:
        raise TaxonomyError(f"nucleus_{nucleus_id}_corporate_category_mismatch")
    _require_text(nucleus["visitor_job"], f"nucleus_{nucleus_id}_visitor_job_missing")
    _require_nonempty_str_list(nucleus["icps"], f"nucleus_{nucleus_id}_icps_missing")
    _require_nonempty_str_list(
        nucleus["triggers"], f"nucleus_{nucleus_id}_triggers_missing"
    )
    _require_nonempty_str_list(
        nucleus["typical_decisions_artifacts"],
        f"nucleus_{nucleus_id}_typical_decisions_artifacts_missing",
    )
    _require_nonempty_str_list(nucleus["limits"], f"nucleus_{nucleus_id}_limits_missing")
    _require_text(
        nucleus["conflict_profile"], f"nucleus_{nucleus_id}_conflict_profile_missing"
    )
    _require_text(
        nucleus["sensitivity_profile"],
        f"nucleus_{nucleus_id}_sensitivity_profile_missing",
    )
    _require_text(
        nucleus["geo_field_rule"], f"nucleus_{nucleus_id}_geo_field_rule_missing"
    )
    proof = _require_nonempty_str_list(
        nucleus["proof_classes"], f"nucleus_{nucleus_id}_proof_class_missing"
    )
    if not proof:
        raise TaxonomyError(f"nucleus_{nucleus_id}_proof_class_missing")
    _require_text(
        nucleus["terminal_action"], f"nucleus_{nucleus_id}_terminal_action_missing"
    )
    owner = _require_text(nucleus["owner_plane"], f"nucleus_{nucleus_id}_owner_missing")
    if owner not in OWNER_PLANES:
        raise TaxonomyError(f"nucleus_{nucleus_id}_owner_invalid")
    if not isinstance(nucleus["referenced_offers"], list):
        raise TaxonomyError(f"nucleus_{nucleus_id}_referenced_offers_invalid")
    for index, offer in enumerate(nucleus["referenced_offers"]):
        _validate_offer_ref(offer, nucleus_id=nucleus_id, index=index)
    _validate_metrics(nucleus["metrics"], nucleus_id=nucleus_id)
    if nucleus["publication_status"] not in PUBLICATION_STATUSES:
        raise TaxonomyError(f"nucleus_{nucleus_id}_publication_status_invalid")
    if nucleus_id == PROTECTED_VERTICAL_ID:
        if nucleus.get("protection") != "protected_vertical":
            raise TaxonomyError("b2g_protected_vertical_missing")
        if nucleus.get("deprecated") is True:
            raise TaxonomyError("b2g_vertical_must_not_be_deprecated")
        if nucleus["publication_status"] != "published":
            raise TaxonomyError("b2g_vertical_must_remain_published")
    elif nucleus.get("protection") == "protected_vertical":
        raise TaxonomyError(f"nucleus_{nucleus_id}_must_not_claim_b2g_protection")
    return nucleus


def _validate_route_bindings(
    value: Any, *, nucleus_ids: set[str]
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise TaxonomyError("route_bindings_invalid")
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for index, raw in enumerate(value):
        row = _require_exact_keys(
            raw,
            required={"route", "nucleus_id", "status"},
            optional={"notes"},
            code=f"route_binding[{index}]",
        )
        route = _require_text(row["route"], f"route_binding[{index}]_route_invalid")
        if not route.startswith("/"):
            raise TaxonomyError(f"route_binding[{index}]_route_invalid")
        if route in seen:
            raise TaxonomyError(f"route_binding_duplicate:{route}")
        seen.add(route)
        nucleus_id = _require_text(
            row["nucleus_id"], f"route_binding[{index}]_nucleus_id_invalid"
        )
        if nucleus_id not in nucleus_ids:
            raise TaxonomyError(f"route_or_offer_unknown_nucleus:{nucleus_id}")
        if row["status"] not in PUBLICATION_STATUSES:
            raise TaxonomyError(f"route_binding[{index}]_status_invalid")
        out.append(row)
    return out


def _validate_b2g_coexistence(value: Any) -> dict[str, Any]:
    row = _require_exact_keys(
        value,
        required={"status", "cannibalization", "url_policy", "equity_policy"},
        code="b2g_coexistence",
    )
    if row["status"] != "protected_vertical":
        raise TaxonomyError("b2g_protected_vertical_missing")
    _require_text(row["cannibalization"], "b2g_coexistence_cannibalization_invalid")
    _require_text(row["url_policy"], "b2g_coexistence_url_policy_invalid")
    _require_text(row["equity_policy"], "b2g_coexistence_equity_policy_invalid")
    return row


def validate_taxonomy(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate an in-memory taxonomy document. No I/O."""
    document = _require_exact_keys(
        payload,
        required=DOCUMENT_REQUIRED,
        optional=DOCUMENT_OPTIONAL,
        code="taxonomy",
    )
    _walk_forbidden_keys(unsigned_taxonomy(document))
    if document["contract_id"] != CONTRACT_ID:
        raise TaxonomyError("contract_id_invalid")
    if document["contract_version"] != CONTRACT_VERSION:
        raise TaxonomyError("contract_version_mismatch")
    if document["schema_id"] != SCHEMA_ID:
        raise TaxonomyError("schema_id_invalid")
    _require_text(document["as_of"], "as_of_invalid")
    _require_text(document["decision_date"], "decision_date_invalid")
    if document["owner_issue"] != 578:
        raise TaxonomyError("owner_issue_invalid")
    if document["parent_issue"] != 577:
        raise TaxonomyError("parent_issue_invalid")
    _validate_producer(document["producer"])
    digest = document["content_sha256"]
    if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
        raise TaxonomyError("content_sha256_invalid")
    expected = sha256_json(unsigned_taxonomy(document))
    if digest != expected:
        raise TaxonomyError("content_sha256_mismatch")
    _validate_corporate_category(document["corporate_category"])
    _validate_public_identity(document["public_identity"])
    _validate_owner_planes(document["owner_planes"])
    _validate_north_star(document["north_star"])
    _validate_addition_rules(document["addition_rules"])
    nuclei_raw = document["nuclei"]
    if not isinstance(nuclei_raw, list):
        raise TaxonomyError("nuclei_invalid")
    nuclei = [_validate_nucleus(item) for item in nuclei_raw]
    ids = [item["id"] for item in nuclei]
    if len(ids) != len(set(ids)):
        raise TaxonomyError("duplicate_nucleus_id")
    if set(ids) != set(REQUIRED_NUCLEUS_IDS):
        missing = sorted(set(REQUIRED_NUCLEUS_IDS) - set(ids))
        extra = sorted(set(ids) - set(REQUIRED_NUCLEUS_IDS))
        if PROTECTED_VERTICAL_ID not in ids:
            raise TaxonomyError("b2g_protected_vertical_missing")
        if missing or extra:
            raise TaxonomyError(
                "required_nuclei_mismatch:"
                + ",".join(missing)
                + ((";extra:" + ",".join(extra)) if extra else "")
            )
    offer_ids: list[str] = []
    for nucleus in nuclei:
        for offer in nucleus["referenced_offers"]:
            offer_id = offer["offer_id"]
            offer_ids.append(offer_id)
    if len(offer_ids) != len(set(offer_ids)):
        raise TaxonomyError("duplicate_referenced_offer_id")
    _validate_route_bindings(document["route_bindings"], nucleus_ids=set(ids))
    _validate_b2g_coexistence(document["b2g_coexistence"])
    return document


def load_committed_taxonomy(path: Path | None = None) -> dict[str, Any]:
    target = path or COMMITTED_PATH
    raw = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise TaxonomyError("taxonomy_invalid")
    return validate_taxonomy(raw)
