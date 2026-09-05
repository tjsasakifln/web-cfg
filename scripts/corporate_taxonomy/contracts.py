"""Cross-contract validation for the MV-01 commercial constitution."""

from __future__ import annotations

import ast
import hashlib
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

PATHS = {
    "constitution": ROOT / "data/corporate/commercial-constitution.v1.json",
    "taxonomy": ROOT / "data/corporate/taxonomy.v1.json",
    "matrix": ROOT / "data/corporate/intent-family-matrix.v1.json",
    "pricing": ROOT / "data/corporate/pricing-authority.v1.json",
    "page": ROOT / "data/corporate/public-service-page-contract.v1.json",
    "catalog": ROOT / "data/offers/multivertical/catalog.v2.json",
    "b2g": ROOT / "data/commercial/deliverables-registry.v1.json",
    "checkout": ROOT / "data/offers/catalog.snapshot.json",
    "pin": ROOT / "docs/integration/campaign-20260905/01/consumer-pin.json",
}

EXPECTED_SEQUENCE = [
    "situation",
    "consequence_or_decision",
    "deliverable",
    "method",
    "proof",
    "material_boundary",
    "next_useful_state",
]

INTENT_REQUIRED = {
    "intent_family",
    "public_wording",
    "canonical_service_family",
    "offer_ids",
    "audience_examples",
    "terminal_action",
    "adjacent_intents",
    "disambiguation",
}

FORBIDDEN_NETWORK_IMPORTS = {
    "http",
    "http.client",
    "https",
    "net",
    "nodemailer",
    "requests",
    "resend",
    "smtplib",
    "socket",
    "tls",
    "urllib.request",
}


class CommercialContractError(ValueError):
    """A commercial-constitution contract failed closed."""


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise CommercialContractError(f"not_object:{path.relative_to(ROOT)}")
    return payload


def load_contracts() -> dict[str, dict[str, Any]]:
    return {name: load_json(path) for name, path in PATHS.items()}


def _unique(values: list[str], code: str) -> None:
    if len(values) != len(set(values)):
        raise CommercialContractError(code)


def _content_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(canonical).hexdigest()


def _known_offer_ids(contracts: dict[str, dict[str, Any]]) -> set[str]:
    return {
        *(row["offer_id"] for row in contracts["catalog"].get("offers", [])),
        *(row["deliverable_id"] for row in contracts["b2g"].get("deliverables", [])),
        *(row["offer_id"] for row in contracts["checkout"].get("offers", [])),
    }


def validate_commercial_contracts(
    contracts: dict[str, dict[str, Any]] | None = None,
) -> dict[str, int]:
    docs = contracts or load_contracts()
    constitution = docs["constitution"]
    taxonomy = docs["taxonomy"]
    matrix = docs["matrix"]
    pricing = docs["pricing"]
    page = docs["page"]
    catalog = docs["catalog"]
    b2g = docs["b2g"]
    checkout_authority = docs["checkout"]
    pin = docs["pin"]

    if constitution.get("contract") != "CONFENGE_COMMERCIAL_CONSTITUTION/1.0.0":
        raise CommercialContractError("constitution_contract")
    if constitution.get("brand", {}).get("name") != "CONFENGE":
        raise CommercialContractError("single_brand")
    if constitution.get("brand", {}).get("domain") != "confenge.com.br":
        raise CommercialContractError("single_domain")
    if constitution.get("finite_system", {}).get("fallback") != "NEEDS_CONTEXT":
        raise CommercialContractError("fallback_must_need_context")
    if constitution.get("finite_system", {}).get("five_nuclei_role") != "internal_operational_grouping_only":
        raise CommercialContractError("nuclei_must_be_internal")

    nuclei = taxonomy.get("nuclei", [])
    nucleus_ids = [row.get("id") for row in nuclei]
    _unique(nucleus_ids, "duplicate_nucleus")
    if "public_works_b2g" not in nucleus_ids:
        raise CommercialContractError("b2g_missing")
    if taxonomy.get("expression_policy", {}).get("route_source_of_truth") != "intent_family_not_persona":
        raise CommercialContractError("persona_must_not_route")

    services = matrix.get("service_families", [])
    service_ids = [row.get("id") for row in services]
    _unique(service_ids, "duplicate_service_family")
    for service in services:
        if service.get("operational_domain") not in nucleus_ids:
            raise CommercialContractError(f"unknown_operational_domain:{service.get('id')}")

    intents = matrix.get("intent_families", [])
    intent_ids = [row.get("intent_family") for row in intents]
    _unique(intent_ids, "duplicate_intent_family")
    known_offers = _known_offer_ids(docs)
    terminal_actions = set(page.get("conversion", {}).get("terminal_actions", []))
    for intent in intents:
        if set(intent) != INTENT_REQUIRED:
            raise CommercialContractError(f"intent_shape:{intent.get('intent_family')}")
        family = intent.get("canonical_service_family")
        if family is not None and family not in service_ids:
            raise CommercialContractError(f"unknown_service_family:{family}")
        for offer_id in intent.get("offer_ids", []):
            if offer_id not in known_offers:
                raise CommercialContractError(f"unknown_offer:{offer_id}")
        if intent.get("terminal_action") not in terminal_actions:
            raise CommercialContractError(f"unknown_terminal_action:{intent.get('terminal_action')}")
        for adjacent in intent.get("adjacent_intents", []):
            if adjacent not in intent_ids:
                raise CommercialContractError(f"unknown_adjacent_intent:{adjacent}")

    b2g_semantics = matrix.get("offer_id_semantics", {}).get("retained_b2g", {})
    if b2g_semantics.get("mode") != "representative_entry_points_plus_complete_typed_authority":
        raise CommercialContractError("b2g_offer_semantics")
    if b2g_semantics.get("deliverables_schema") != b2g.get("schema"):
        raise CommercialContractError("b2g_deliverables_schema")
    if b2g_semantics.get("deliverables_registry_version") != b2g.get("registry_version"):
        raise CommercialContractError("b2g_deliverables_version")
    if b2g_semantics.get("required_deliverable_count") != len(b2g.get("deliverables", [])):
        raise CommercialContractError("b2g_deliverables_count")
    if b2g_semantics.get("checkout_schema") != checkout_authority.get("schema"):
        raise CommercialContractError("b2g_checkout_schema")
    if b2g_semantics.get("checkout_authority_version") != checkout_authority.get("authority_version"):
        raise CommercialContractError("b2g_checkout_version")
    checkout_ids = {row.get("offer_id") for row in checkout_authority.get("offers", [])}
    required_checkout_ids = b2g_semantics.get("required_checkout_offer_ids", [])
    _unique(required_checkout_ids, "duplicate_b2g_checkout_reference")
    if not set(required_checkout_ids) <= checkout_ids:
        raise CommercialContractError("b2g_checkout_reference")

    required_audience_tokens = [
        "construtor",
        "incorporador",
        "escritório",
        "engenharia",
        "arquitetura",
        "síndico",
        "advogad",
        "empresa",
        "órg",
    ]
    audience_blob = " ".join(
        item for intent in intents for item in intent.get("audience_examples", [])
    ).lower()
    for token in required_audience_tokens:
        if token not in audience_blob:
            raise CommercialContractError(f"audience_coverage:{token}")

    if page.get("required_sequence") != EXPECTED_SEQUENCE:
        raise CommercialContractError("page_sequence")
    claim_classes = {row.get("class") for row in page.get("claim_classes", [])}
    if not {"credential", "professional_scope", "method", "case_or_outcome", "price", "national_availability"} <= claim_classes:
        raise CommercialContractError("claim_classes")
    if page.get("other_technical_demand", {}).get("public_state") != "NEEDS_CONTEXT":
        raise CommercialContractError("other_demand_must_need_context")
    if page.get("conversion", {}).get("inbound_authorizes_outbound") is not False:
        raise CommercialContractError("inbound_must_not_authorize_outbound")

    states = pricing.get("states", [])
    state_ids = [row.get("state") for row in states]
    _unique(state_ids, "duplicate_price_state")
    state_by_id = {row.get("state"): row for row in states}
    experiment = state_by_id.get("FOUNDER_AUTHORIZED_EXPERIMENT", {})
    if experiment.get("allows_checkout") is not False or experiment.get("means_margin_validated") is not False:
        raise CommercialContractError("founder_experiment_must_not_validate_or_checkout")
    margin = state_by_id.get("MARGIN_VALIDATED", {})
    if margin.get("allows_checkout") is not False or margin.get("means_margin_validated") is not True:
        raise CommercialContractError("margin_state_semantics")
    checkout = state_by_id.get("CHECKOUT_AUTHORIZED", {})
    if checkout.get("allows_checkout") is not True:
        raise CommercialContractError("checkout_state_semantics")
    for authorization in pricing.get("founder_authorizations", []):
        if authorization.get("checkout_authorized") is not False:
            raise CommercialContractError("founder_authorization_checkout")
        if authorization.get("public_display_authorized") is not False:
            raise CommercialContractError("founder_authorization_public_display")
        if "field_floor_cents" in authorization:
            raise CommercialContractError("unauthorized_field_floor")

    national = constitution.get("national_service", {})
    wording = national.get("canonical_wording_pt_br", "").lower()
    for token in ("brasil", "escopo", "local", "atribuições", "registro ou visto", "art"):
        if token not in wording:
            raise CommercialContractError(f"national_wording:{token}")
    if national.get("commercial_availability_is_technical_authorization") is not False:
        raise CommercialContractError("national_availability_not_authorization")

    modeled = catalog.get("offers", [])
    modeled_ids = [row.get("offer_id") for row in modeled]
    _unique(modeled_ids, "duplicate_modeled_offer")
    if "complementary_engineering_project_review" not in modeled_ids:
        raise CommercialContractError("issue_602_offer_missing")
    for offer in modeled:
        if offer.get("readiness") == "PUBLISHABLE":
            raise CommercialContractError(f"unproved_offer_publishable:{offer.get('offer_id')}")
        price_model = offer.get("price_model", {})
        if price_model.get("public_amount_cents") is not None or price_model.get("public_range") is not None:
            raise CommercialContractError(f"invented_new_price:{offer.get('offer_id')}")
        if "credential_verified" in offer.get("proof_classes", []):
            raise CommercialContractError(f"invented_credential:{offer.get('offer_id')}")

    pinned_contracts = {
        "constitution": ("constitution_contract", "constitution_hash", "CONFENGE_COMMERCIAL_CONSTITUTION/1.0.0"),
        "matrix": ("intent_matrix_contract", "intent_matrix_hash", "CONFENGE_PUBLIC_INTENT_MATRIX/1.0.0"),
        "page": ("page_contract", "page_contract_hash", "CONFENGE_PUBLIC_SERVICE_PAGE/1.0.0"),
        "pricing": ("price_authority", "price_authority_hash", "CONFENGE_PRICE_AUTHORITY/1.0.0"),
    }
    for document_name, (contract_key, hash_key, expected_contract) in pinned_contracts.items():
        document = docs[document_name]
        if document.get("contract") != expected_contract or pin.get(contract_key) != expected_contract:
            raise CommercialContractError(f"consumer_pin_contract:{document_name}")
        if pin.get(hash_key) != _content_hash(document):
            raise CommercialContractError(f"consumer_pin_hash:{document_name}")

    return {
        "nuclei": len(nuclei),
        "service_families": len(services),
        "intent_families": len(intents),
        "modeled_offers": len(modeled),
    }


def scan_owned_implementation_for_network_clients() -> list[str]:
    """Prove the new authority/mapper layer cannot dispatch or send SMTP."""
    findings: list[str] = []
    roots = [ROOT / "scripts/corporate_taxonomy", ROOT / "scripts/offers/multivertical"]
    for base in roots:
        for path in sorted(base.rglob("*")):
            if path.suffix == ".py":
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
                for node in ast.walk(tree):
                    names: list[str] = []
                    if isinstance(node, ast.Import):
                        names = [alias.name for alias in node.names]
                    elif isinstance(node, ast.ImportFrom) and node.module:
                        names = [node.module]
                    for name in names:
                        if name in FORBIDDEN_NETWORK_IMPORTS:
                            findings.append(f"{path.relative_to(ROOT)}:{name}")
            elif path.suffix in {".js", ".cjs", ".mjs"}:
                text = path.read_text(encoding="utf-8")
                for match in re.finditer(r"(?:require\(|from\s+)[\"']([^\"']+)", text):
                    name = match.group(1).removeprefix("node:")
                    if name in FORBIDDEN_NETWORK_IMPORTS:
                        findings.append(f"{path.relative_to(ROOT)}:{name}")
    return findings
