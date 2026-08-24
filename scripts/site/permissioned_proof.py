"""Fail-closed publication contract for permissioned CONFENGE proof.

The committed registry contains opaque references and hashes only. Consent
receipts and delivery material remain in owner-controlled private storage.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.authority import has_visible_consent_record, visible_permission_class  # noqa: E402


POLICY_PATH = ROOT / "docs" / "contracts" / "permissioned-proof" / "permissioned-proof-v1.json"
REGISTRY_PATH = ROOT / "data" / "site" / "permissioned-proof-registry.json"
CASES_PATH = ROOT / "data" / "site" / "cases.json"

POLICY_SCHEMA = "confenge.permissioned-proof-policy/1.0"
REGISTRY_SCHEMA = "confenge.permissioned-proof-registry/1.0"
STATES = (
    "DRAFT",
    "CONSENT_CAPTURED",
    "HUMAN_REVIEW_REQUIRED",
    "APPROVED",
    "PUBLISHED",
    "REJECTED",
    "REVOKED",
    "RETENTION_EXPIRED",
)
PERMISSION_CLASSES = ("demonstrativo", "consented", "confidential", "redacted")
CLIENT_PII_KEYS = frozenset(
    {
        "client_name",
        "client_legal_name",
        "client_cnpj",
        "company_name",
        "contact_name",
        "contact_email",
        "contact_phone",
        "cnpj",
        "email",
        "phone",
        "raw_consent",
        "raw_delivery",
    }
)
HEX64 = re.compile(r"^[0-9a-f]{64}$")
PROOF_ID = re.compile(r"^[a-z0-9][a-z0-9-]{5,80}$")


def _load(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected object: {path}")
    return payload


def load_policy(path: Path | None = None) -> dict[str, Any]:
    return _load(path or POLICY_PATH)


def load_registry(path: Path | None = None) -> dict[str, Any]:
    return _load(path or REGISTRY_PATH)


def material_hash(html: str) -> str:
    return hashlib.sha256((html or "").encode("utf-8")).hexdigest()


def consent_scope_hash(scope: dict[str, Any]) -> str:
    canonical = json.dumps(
        scope or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _dedupe(errors: list[str]) -> list[str]:
    return list(dict.fromkeys(errors))


def _client_pii_errors(value: Any, path: str = "record") -> list[str]:
    errors: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if key.lower() in CLIENT_PII_KEYS and child not in (None, "", [], {}):
                errors.append(f"client_pii_forbidden:{child_path}")
            errors.extend(_client_pii_errors(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            errors.extend(_client_pii_errors(child, f"{path}[{index}]"))
    elif isinstance(value, str) and re.search(
        r"(?<![\w.+-])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?![\w.-])", value
    ):
        errors.append(f"client_pii_email_forbidden:{path}")
    return errors


def validate_policy(policy: dict[str, Any] | None = None) -> list[str]:
    p = policy or load_policy()
    errors: list[str] = []
    if p.get("schema") != POLICY_SCHEMA:
        errors.append("policy_schema_invalid")
    if p.get("version") != "1.0.0":
        errors.append("policy_version_invalid")
    if p.get("status") != "ACTIVE_GUARD":
        errors.append("policy_not_active_guard")
    if p.get("owner_issue") != 249:
        errors.append("policy_owner_issue_invalid")

    authority = p.get("authority") or {}
    approver = authority.get("publication_approver") or {}
    if authority.get("public_contract_owner") != "web-cfg":
        errors.append("public_contract_owner_invalid")
    if authority.get("observed_outcome_owner") != "warmbly":
        errors.append("observed_outcome_owner_invalid")
    if authority.get("canonical_public_domain") != "confenge.com.br":
        errors.append("canonical_domain_invalid")
    if authority.get("public_client_pii") != "FORBIDDEN":
        errors.append("public_client_pii_not_forbidden")
    if not approver.get("id") or not approver.get("name") or approver.get("human_required") is not True:
        errors.append("named_human_approver_absent")

    states = p.get("states") or []
    state_ids = [row.get("id") for row in states if isinstance(row, dict)]
    if state_ids != list(STATES):
        errors.append("state_machine_incomplete_or_reordered")
    public_states = [row.get("id") for row in states if row.get("public_allowed") is True]
    if public_states != ["PUBLISHED"]:
        errors.append("public_state_not_fail_closed")
    transitions = p.get("transitions") or {}
    if list(transitions) != list(STATES):
        errors.append("transition_sources_incomplete_or_reordered")
    for source, targets in transitions.items():
        if source not in STATES:
            errors.append(f"transition_source_unknown:{source}")
        if not isinstance(targets, list):
            errors.append(f"transition_targets_invalid:{source}")
            continue
        for target in targets:
            if target not in STATES:
                errors.append(f"transition_target_unknown:{source}:{target}")
            if target == source:
                errors.append(f"transition_self_loop:{source}")

    classes = p.get("permission_classes") or []
    class_ids = [row.get("id") for row in classes if isinstance(row, dict)]
    if class_ids != list(PERMISSION_CLASSES):
        errors.append("permission_classes_incomplete_or_reordered")
    by_class = {row.get("id"): row for row in classes if isinstance(row, dict)}
    if (by_class.get("confidential") or {}).get("public_allowed") is not False:
        errors.append("confidential_must_not_be_public")
    for class_id in ("consented", "redacted", "confidential"):
        if (by_class.get(class_id) or {}).get("requires_consent") is not True:
            errors.append(f"permission_class_must_require_consent:{class_id}")
    if (by_class.get("demonstrativo") or {}).get("is_client_proof") is not False:
        errors.append("demonstrative_must_not_be_client_proof")

    consent = p.get("consent") or {}
    if consent.get("receipt_ref_prefix") != "private://permissioned-proof/":
        errors.append("private_receipt_prefix_invalid")
    if set(consent.get("scope_must_name") or []) != {
        "public_fields",
        "public_channels",
        "withdrawal_channel",
    }:
        errors.append("consent_scope_contract_incomplete")
    human = p.get("human_approval") or {}
    if set(human.get("required_for_states") or []) != {"APPROVED", "PUBLISHED"}:
        errors.append("human_approval_states_invalid")
    if human.get("automation_may_approve") is not False or human.get("bulk_approval") is not False:
        errors.append("automated_or_bulk_approval_not_forbidden")
    if set(human.get("binds") or []) != {"proof_id", "consent_scope_hash", "material_hash"}:
        errors.append("approval_binding_incomplete")

    retention = p.get("retention") or {}
    if retention.get("default_days") != 730 or retention.get("delete_after_required") is not True:
        errors.append("retention_policy_invalid")
    if retention.get("raw_material_location") != "PRIVATE_ONLY":
        errors.append("raw_material_not_private")
    if retention.get("revocation_effect") != "UNPUBLISH_IMMEDIATELY":
        errors.append("revocation_not_immediate")

    publication = p.get("publication") or {}
    if publication.get("allowed_state") != "PUBLISHED":
        errors.append("publication_state_invalid")
    if publication.get("allowed_path_prefix") != "/casos/":
        errors.append("publication_path_prefix_invalid")
    if set(publication.get("allowed_permission_classes") or []) != {"consented", "redacted"}:
        errors.append("public_permission_classes_invalid")
    if publication.get("fixture_publication") is not False:
        errors.append("fixture_publication_not_forbidden")
    if set(publication.get("forbidden_schema_types_until_separately_authorized") or []) != {
        "Review",
        "AggregateRating",
    }:
        errors.append("forbidden_schema_types_invalid")
    return _dedupe(errors)


def transition_allowed(source: str, target: str, policy: dict[str, Any] | None = None) -> bool:
    p = policy or load_policy()
    return target in ((p.get("transitions") or {}).get(source) or [])


def validate_record(
    record: dict[str, Any],
    *,
    policy: dict[str, Any] | None = None,
    html: str | None = None,
) -> list[str]:
    p = policy or load_policy()
    errors: list[str] = []
    required = p.get("required_record_fields") or []
    for field in required:
        if field not in record:
            errors.append(f"record_field_absent:{field}")

    proof_id = record.get("proof_id")
    state = record.get("state")
    permission_class = record.get("permission_class")
    if not isinstance(proof_id, str) or not PROOF_ID.fullmatch(proof_id):
        errors.append("proof_id_invalid")
    if record.get("policy_version") != p.get("version"):
        errors.append("record_policy_version_mismatch")
    if state not in STATES:
        errors.append("record_state_invalid")
    if permission_class not in PERMISSION_CLASSES:
        errors.append("record_permission_class_invalid")
    if permission_class == "demonstrativo":
        errors.append("demonstrative_is_not_permissioned_client_proof")

    errors.extend(_client_pii_errors(record))
    consent = record.get("consent") or {}
    retention = record.get("retention") or {}
    revocation = record.get("revocation") or {}
    approval = record.get("approval") or {}
    publication = record.get("publication") or {}

    consent_required_states = {
        "CONSENT_CAPTURED",
        "HUMAN_REVIEW_REQUIRED",
        "APPROVED",
        "PUBLISHED",
        "REVOKED",
    }
    if state in consent_required_states:
        expected_consent = "REVOKED" if state == "REVOKED" else "ACTIVE"
        if consent.get("status") != expected_consent:
            errors.append(f"consent_status_invalid_for_state:{state}")
        captured_at = _iso_datetime(consent.get("captured_at"))
        if captured_at is None:
            errors.append("consent_captured_at_invalid")
        scope = consent.get("scope")
        if not isinstance(scope, dict):
            errors.append("consent_scope_absent")
            scope = {}
        for field in (p.get("consent") or {}).get("scope_must_name") or []:
            value = scope.get(field)
            if value in (None, "", []):
                errors.append(f"consent_scope_field_absent:{field}")
        expected_scope_hash = consent_scope_hash(scope)
        if consent.get("scope_hash") != expected_scope_hash:
            errors.append("consent_scope_hash_mismatch")
        prefix = (p.get("consent") or {}).get("receipt_ref_prefix") or ""
        if not str(consent.get("receipt_ref") or "").startswith(prefix):
            errors.append("consent_receipt_ref_not_private")

        delete_after = _iso_datetime(retention.get("delete_after"))
        if retention.get("policy_days") != (p.get("retention") or {}).get("default_days"):
            errors.append("retention_days_mismatch")
        if delete_after is None:
            errors.append("retention_delete_after_invalid")
        if captured_at and delete_after and delete_after <= captured_at:
            errors.append("retention_delete_after_not_future")
        if retention.get("private_material_location") != "PRIVATE_ONLY":
            errors.append("retention_material_not_private")
        if revocation.get("allowed") is not True or not revocation.get("channel"):
            errors.append("revocation_route_absent")

    if state in {"APPROVED", "PUBLISHED"}:
        human = p.get("human_approval") or {}
        authority_approver = (p.get("authority") or {}).get("publication_approver") or {}
        if approval.get("status") != human.get("required_status"):
            errors.append("human_approval_absent")
        if approval.get("decision") != human.get("required_decision"):
            errors.append("human_approval_decision_invalid")
        approver = approval.get("approver") or {}
        if (
            approver.get("human") is not True
            or approver.get("id") != authority_approver.get("id")
            or approver.get("name") != authority_approver.get("name")
        ):
            errors.append("human_approver_absent")
        if _iso_datetime(approval.get("approved_at")) is None:
            errors.append("human_approval_timestamp_invalid")
        if approval.get("consent_scope_hash") != consent.get("scope_hash"):
            errors.append("approval_consent_scope_hash_mismatch")
        if not HEX64.fullmatch(str(approval.get("material_hash") or "")):
            errors.append("approval_material_hash_invalid")

    if state == "PUBLISHED":
        publication_contract = p.get("publication") or {}
        if permission_class not in publication_contract.get("allowed_permission_classes", []):
            errors.append("permission_class_not_public")
        if record.get("fixture_only") is True:
            errors.append("fixture_publication_forbidden")
        if publication.get("status") != publication_contract.get("required_status"):
            errors.append("publication_status_invalid")
        public_url = str(publication.get("public_url") or "")
        parsed = urlparse(public_url)
        canonical = (p.get("authority") or {}).get("canonical_public_domain")
        if parsed.scheme != "https" or parsed.hostname != canonical:
            errors.append("publication_url_not_canonical")
        allowed_prefix = publication_contract.get("allowed_path_prefix") or ""
        if not parsed.path.startswith(allowed_prefix) or not parsed.path.endswith("/"):
            errors.append("publication_url_outside_case_family")
        if _iso_datetime(publication.get("published_at")) is None:
            errors.append("publication_timestamp_invalid")
        pub_hash = str(publication.get("material_hash") or "")
        if not HEX64.fullmatch(pub_hash):
            errors.append("publication_material_hash_invalid")
        if pub_hash != approval.get("material_hash"):
            errors.append("publication_approval_material_hash_mismatch")

    if state != "PUBLISHED" and publication.get("status") == "PUBLISHED":
        errors.append("publication_state_mismatch")

    if state == "REVOKED":
        for field in (p.get("revocation") or {}).get("required_fields_when_revoked") or []:
            if revocation.get(field) in (None, ""):
                errors.append(f"revocation_field_absent:{field}")
        if publication.get("status") != "UNPUBLISHED" or not publication.get("unpublished_at"):
            errors.append("revoked_proof_not_unpublished")
        if approval.get("status") != "VOID":
            errors.append("revoked_approval_not_void")

    if html is not None:
        if state != "PUBLISHED":
            errors.append("html_publication_without_published_state")
        visible_id = re.search(r'data-proof-id=["\']([^"\']+)["\']', html, flags=re.I)
        if not visible_id or visible_id.group(1) != proof_id:
            errors.append("visible_proof_id_mismatch")
        if visible_permission_class(html) != permission_class:
            errors.append("visible_permission_class_mismatch")
        if not has_visible_consent_record(html):
            errors.append("visible_consent_record_absent")
        actual_hash = material_hash(html)
        if publication.get("material_hash") != actual_hash:
            errors.append("publication_material_hash_drift")
        if approval.get("material_hash") != actual_hash:
            errors.append("approval_material_hash_drift")
        if re.search(r'"@type"\s*:\s*"(?:Review|AggregateRating)"', html):
            errors.append("forbidden_proof_schema_type")

    return _dedupe(errors)


def validate_registry(
    registry: dict[str, Any] | None = None,
    *,
    policy: dict[str, Any] | None = None,
) -> list[str]:
    p = policy or load_policy()
    r = registry or load_registry()
    errors: list[str] = []
    if r.get("schema") != REGISTRY_SCHEMA:
        errors.append("registry_schema_invalid")
    if r.get("policy") != p.get("schema"):
        errors.append("registry_policy_mismatch")
    records = r.get("records")
    if not isinstance(records, list):
        errors.append("registry_records_invalid")
        records = []
    ids: set[str] = set()
    published = 0
    for record in records:
        if not isinstance(record, dict):
            errors.append("registry_record_not_object")
            continue
        proof_id = str(record.get("proof_id") or "")
        if proof_id in ids:
            errors.append(f"registry_duplicate_proof_id:{proof_id}")
        ids.add(proof_id)
        if record.get("fixture_only") is True:
            errors.append(f"registry_fixture_forbidden:{proof_id}")
        public_html: str | None = None
        if record.get("state") == "PUBLISHED":
            parsed = urlparse(str((record.get("publication") or {}).get("public_url") or ""))
            rel = parsed.path.strip("/")
            safe_path = (
                parsed.scheme == "https"
                and parsed.hostname == "confenge.com.br"
                and parsed.path.startswith("/casos/")
                and parsed.path.endswith("/")
                and ".." not in Path(rel).parts
            )
            page = ROOT / rel / "index.html"
            if not safe_path:
                errors.append(f"{proof_id}:published_material_path_invalid")
            elif not page.is_file():
                errors.append(f"{proof_id}:published_material_absent:{page.relative_to(ROOT)}")
            else:
                public_html = page.read_text(encoding="utf-8")
        for code in validate_record(record, policy=p, html=public_html):
            errors.append(f"{proof_id}:{code}")
        if record.get("state") == "PUBLISHED":
            published += 1
    if r.get("approved_public_proof_count") != published:
        errors.append("approved_public_proof_count_mismatch")
    expected_state = "HAS_APPROVED_CLIENT_PROOF" if published else "NO_APPROVED_CLIENT_PROOF"
    if r.get("state") != expected_state:
        errors.append("registry_state_mismatch")

    next_test = r.get("next_test") or {}
    approver = (p.get("authority") or {}).get("publication_approver") or {}
    if next_test.get("status") != "WAIT_FIRST_REAL_DELIVERY":
        errors.append("first_real_delivery_next_test_absent")
    owner = next_test.get("owner") or {}
    if owner.get("id") != approver.get("id") or owner.get("name") != approver.get("name"):
        errors.append("next_test_owner_not_named_human")
    if not next_test.get("trigger") or not next_test.get("required_result"):
        errors.append("next_test_contract_incomplete")
    errors.extend(validate_cases_alignment(r))
    errors.extend(_client_pii_errors(r, "registry"))
    return _dedupe(errors)


def validate_cases_alignment(
    registry: dict[str, Any] | None = None,
    cases: dict[str, Any] | None = None,
) -> list[str]:
    """The older cases registry cannot bypass permissioned-proof approval."""
    r = registry or load_registry()
    c = cases or _load(CASES_PATH)
    records = {
        row.get("proof_id"): row
        for row in (r.get("records") or [])
        if isinstance(row, dict) and row.get("proof_id")
    }
    approved_cases = {
        row.get("case_id"): row
        for row in (c.get("cases") or [])
        if isinstance(row, dict) and row.get("public_status") == "APPROVED"
    }
    errors: list[str] = []
    for case_id, case in approved_cases.items():
        record = records.get(case_id)
        if not record or record.get("state") != "PUBLISHED":
            errors.append(f"approved_case_without_permissioned_proof:{case_id}")
            continue
        if record.get("permission_class") != case.get("permission_class"):
            errors.append(f"approved_case_permission_class_mismatch:{case_id}")
    for proof_id, record in records.items():
        if record.get("state") == "PUBLISHED" and proof_id not in approved_cases:
            errors.append(f"published_proof_not_registered_case:{proof_id}")

    approved_paths = {
        row.get("path")
        for row in (c.get("published_surfaces") or [])
        if isinstance(row, dict) and row.get("public_status") == "APPROVED"
    }
    proof_paths = {
        urlparse(str((row.get("publication") or {}).get("public_url") or "")).path
        for row in records.values()
        if row.get("state") == "PUBLISHED"
    }
    for path in sorted((approved_paths - proof_paths) - {None}):
        errors.append(f"approved_surface_without_permissioned_proof:{path}")
    for path in sorted((proof_paths - approved_paths) - {""}):
        errors.append(f"published_proof_surface_not_approved:{path}")
    return _dedupe(errors)


def audit() -> dict[str, Any]:
    policy = load_policy()
    registry = load_registry()
    policy_errors = validate_policy(policy)
    registry_errors = validate_registry(registry, policy=policy)
    return {
        "schema": "confenge.permissioned-proof-audit/1.0",
        "ok": not policy_errors and not registry_errors,
        "policy_errors": policy_errors,
        "registry_errors": registry_errors,
        "approved_public_proof_count": registry.get("approved_public_proof_count"),
        "next_test": (registry.get("next_test") or {}).get("status"),
    }


if __name__ == "__main__":
    result = audit()
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    raise SystemExit(0 if result["ok"] else 1)
