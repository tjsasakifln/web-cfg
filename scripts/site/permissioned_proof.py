"""Fail-closed publication contract for permissioned CONFENGE proof.

The committed registry contains opaque references and hashes only. Consent
receipts and delivery material remain in owner-controlled private storage.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.authority import has_visible_consent_record, visible_permission_class  # noqa: E402


POLICY_PATH = ROOT / "docs" / "contracts" / "permissioned-proof" / "permissioned-proof-v1.json"
REGISTRY_PATH = ROOT / "data" / "site" / "permissioned-proof-registry.json"
CASES_PATH = ROOT / "data" / "site" / "cases.json"

POLICY_SCHEMA = "confenge.permissioned-proof-policy/1.0"
REGISTRY_SCHEMA = "confenge.permissioned-proof-registry/1.0"
POLICY_CANONICAL_SHA256 = "f90fdbd26a1ef26edac116fe8fc233b398051c64a192e7da61a75ca828692b42"
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
CLIENT_PII_KEY_TOKENS = frozenset(
    {
        "clientname",
        "clientlegalname",
        "clientcnpj",
        "companyname",
        "contactname",
        "contactemail",
        "contactphone",
        "nomecliente",
        "empresa",
        "cnpj",
        "cpf",
        "email",
        "telefone",
        "celular",
        "whatsapp",
        "rawconsent",
        "rawdelivery",
    }
)
HEX64 = re.compile(r"^[0-9a-f]{64}$")
PROOF_ID = re.compile(r"^[a-z0-9][a-z0-9-]{5,80}$")
OPAQUE_TOKEN = re.compile(r"^[a-z0-9][a-z0-9-]{7,80}$")
UTC_SECONDS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
EMAIL_VALUE = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?![\w.-])")
PHONE_VALUE = re.compile(r"(?<!\d)(?:\+?55[\s().-]*)?(?:\(?\d{2}\)?[\s.-]*)9?\d{4}[\s.-]*\d{4}(?!\d)")
TAX_ID_VALUE = re.compile(r"\b(?:\d{3}[.-]){2}\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b")
EVIDENCE_KEYS = frozenset(
    {
        "fonte",
        "autorizacao",
        "escopo_permitido",
        "anonimizacao",
        "baseline",
        "intervencao",
        "resultado_observavel",
        "limitacoes",
        "revisor",
        "expiracao",
    }
)
EMPTY_EVIDENCE = {key: None for key in EVIDENCE_KEYS}
RECORD_KEYS = frozenset(
    {"proof_id", "policy_version", "state", "permission_class", "consent", "retention", "revocation", "approval", "publication", "lifecycle", "evidence"}
)
CONSENT_KEYS = frozenset({"status", "captured_at", "scope", "scope_hash", "receipt_ref"})
RETENTION_KEYS = frozenset({"policy_days", "delete_after", "private_material_location"})
REVOCATION_KEYS = frozenset({"allowed", "channel", "status", "requested_at", "effective_at", "reason_code"})
APPROVAL_KEYS = frozenset({"status", "decision", "approval_ref", "proof_id", "approver", "approved_at", "consent_scope_hash", "material_hash"})
APPROVER_KEYS = frozenset({"id", "name", "human"})
PUBLICATION_KEYS = frozenset({"status", "public_url", "published_at", "unpublished_at", "material_hash"})
LIFECYCLE_EVENT_KEYS = frozenset({"state", "at", "actor"})
REGISTRY_KEYS = frozenset(
    {"schema", "policy", "updated_at", "state", "approved_public_proof_count", "records", "next_test"}
)
NEXT_TEST_KEYS = frozenset(
    {"id", "status", "owner", "trigger", "required_result", "forbidden_shortcuts"}
)
NEXT_TEST_OWNER_KEYS = frozenset({"id", "name"})
FORBIDDEN_SHORTCUTS = frozenset(
    {
        "fabricated_delivery",
        "fabricated_client",
        "commercial_contact_consent_reused_as_publication_consent",
        "approval_by_agent_ci_or_bot",
        "raw_consent_or_client_pii_committed",
        "bulk_approval",
        "publication_without_material_hash",
    }
)


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


def _canonical_sha256(value: Any) -> str:
    canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _utc_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not UTC_SECONDS.fullmatch(value):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo == timezone.utc else None
    except ValueError:
        return None


def _normalized_key(value: Any) -> str:
    plain = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", plain.lower())


def _exact_keys(value: Any, expected: frozenset[str] | set[str], path: str) -> list[str]:
    if not isinstance(value, dict):
        return [f"object_required:{path}"]
    actual = set(value)
    return [f"schema_keys_mismatch:{path}"] if actual != set(expected) else []


def _string_set(value: Any) -> set[str] | None:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        return None
    return set(value)


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _dedupe(errors: list[str]) -> list[str]:
    return list(dict.fromkeys(errors))


def _client_pii_errors(value: Any, path: str = "record") -> list[str]:
    errors: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            normalized = _normalized_key(key)
            if (
                key.lower() in CLIENT_PII_KEYS or
                any(token in normalized for token in CLIENT_PII_KEY_TOKENS)
            ) and child not in (None, "", [], {}):
                errors.append(f"client_pii_forbidden:{child_path}")
            errors.extend(_client_pii_errors(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            errors.extend(_client_pii_errors(child, f"{path}[{index}]"))
    elif isinstance(value, str):
        leaf = path.rsplit(".", 1)[-1]
        digest_safe = leaf in {"scope_hash", "material_hash", "consent_scope_hash"} and bool(HEX64.fullmatch(value))
        if not digest_safe and EMAIL_VALUE.search(value):
            errors.append(f"client_pii_email_forbidden:{path}")
        if not digest_safe and PHONE_VALUE.search(value):
            errors.append(f"client_pii_phone_forbidden:{path}")
        if not digest_safe and TAX_ID_VALUE.search(value):
            errors.append(f"client_pii_tax_id_forbidden:{path}")
    return errors


def validate_policy(policy: dict[str, Any] | None = None) -> list[str]:
    p = policy if policy is not None else load_policy()
    errors: list[str] = []
    if p.get("schema") != POLICY_SCHEMA:
        errors.append("policy_schema_invalid")
    if p.get("version") != "1.0.0":
        errors.append("policy_version_invalid")
    if p.get("status") != "ACTIVE_GUARD":
        errors.append("policy_not_active_guard")
    if p.get("owner_issue") != 249:
        errors.append("policy_owner_issue_invalid")
    if _string_set(p.get("required_record_fields")) != set(RECORD_KEYS):
        errors.append("required_record_fields_invalid")

    authority = _object(p.get("authority"))
    approver = _object(authority.get("publication_approver"))
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

    states = p.get("states") if isinstance(p.get("states"), list) else []
    state_ids = [row.get("id") for row in states if isinstance(row, dict)]
    if state_ids != list(STATES):
        errors.append("state_machine_incomplete_or_reordered")
    public_states = [
        row.get("id")
        for row in states
        if isinstance(row, dict) and row.get("public_allowed") is True
    ]
    if public_states != ["PUBLISHED"]:
        errors.append("public_state_not_fail_closed")
    transitions = _object(p.get("transitions"))
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

    classes = p.get("permission_classes") if isinstance(p.get("permission_classes"), list) else []
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

    consent = _object(p.get("consent"))
    if consent.get("receipt_ref_prefix") != "private://permissioned-proof/":
        errors.append("private_receipt_prefix_invalid")
    if _string_set(consent.get("scope_must_name")) != {
        "public_fields",
        "public_channels",
        "withdrawal_channel",
    }:
        errors.append("consent_scope_contract_incomplete")
    if _string_set(consent.get("required_fields")) != set(CONSENT_KEYS):
        errors.append("consent_required_fields_invalid")
    if _string_set(consent.get("public_fields_allowlist")) != {
        "problem", "intervention", "outcome", "evidence", "limitations"
    }:
        errors.append("consent_public_fields_allowlist_invalid")
    if consent.get("public_channels_exact") != ["confenge.com.br"]:
        errors.append("consent_public_channels_invalid")
    if consent.get("withdrawal_channel_exact") != "PRIVATE_OWNER_CHANNEL":
        errors.append("consent_withdrawal_channel_invalid")
    if _string_set(consent.get("redactions_allowlist")) != {
        "client_identity", "contact_details", "contract_identifiers", "commercial_values"
    }:
        errors.append("consent_redactions_allowlist_invalid")
    human = _object(p.get("human_approval"))
    if _string_set(human.get("required_for_states")) != {"APPROVED", "PUBLISHED"}:
        errors.append("human_approval_states_invalid")
    if human.get("automation_may_approve") is not False or human.get("bulk_approval") is not False:
        errors.append("automated_or_bulk_approval_not_forbidden")
    if _string_set(human.get("binds")) != {"proof_id", "consent_scope_hash", "material_hash"}:
        errors.append("approval_binding_incomplete")
    if _string_set(human.get("required_fields")) != set(APPROVAL_KEYS):
        errors.append("approval_required_fields_invalid")
    if human.get("approval_ref_prefix") != "private://permissioned-proof-approval/":
        errors.append("approval_ref_prefix_invalid")
    if human.get("verification_mode") != "OWNER_ATTESTED_PRIVATE_RECEIPT_PLUS_CODE_REVIEW":
        errors.append("approval_verification_mode_invalid")
    if human.get("ci_limit") != "CI_VALIDATES_BINDINGS_NOT_PRIVATE_RECEIPT_AUTHENTICITY":
        errors.append("approval_ci_limit_invalid")

    retention = _object(p.get("retention"))
    if retention.get("default_days") != 730 or retention.get("delete_after_required") is not True:
        errors.append("retention_policy_invalid")
    if retention.get("raw_material_location") != "PRIVATE_ONLY":
        errors.append("raw_material_not_private")
    if retention.get("revocation_effect") != "UNPUBLISH_IMMEDIATELY":
        errors.append("revocation_not_immediate")

    publication = _object(p.get("publication"))
    if publication.get("allowed_state") != "PUBLISHED":
        errors.append("publication_state_invalid")
    if publication.get("allowed_path_prefix") != "/casos/":
        errors.append("publication_path_prefix_invalid")
    if _string_set(publication.get("allowed_permission_classes")) != {"consented", "redacted"}:
        errors.append("public_permission_classes_invalid")
    if publication.get("fixture_publication") is not False:
        errors.append("fixture_publication_not_forbidden")
    if _string_set(publication.get("forbidden_schema_types_until_separately_authorized")) != {
        "Review",
        "AggregateRating",
    }:
        errors.append("forbidden_schema_types_invalid")
    lifecycle = _object(p.get("lifecycle"))
    if lifecycle.get("required_first_state") != "DRAFT":
        errors.append("lifecycle_first_state_invalid")
    if _string_set(lifecycle.get("event_fields")) != set(LIFECYCLE_EVENT_KEYS):
        errors.append("lifecycle_event_fields_invalid")
    if lifecycle.get("allowed_actors") != ["OWNER_CONFENGE", "HUMAN_TIAGO_JUN_SASAKI"]:
        errors.append("lifecycle_actors_invalid")
    if lifecycle.get("human_actor_required_for_state") != "APPROVED":
        errors.append("lifecycle_human_actor_invalid")
    if lifecycle.get("current_state_must_be_last") is not True:
        errors.append("lifecycle_current_state_not_required")
    evidence_record = _object(p.get("evidence_record"))
    if _string_set(evidence_record.get("required_fields")) != set(EVIDENCE_KEYS):
        errors.append("evidence_record_fields_invalid")
    if evidence_record.get("expiracao_format") != "utc_seconds":
        errors.append("evidence_record_expiracao_format_invalid")
    if _string_set(evidence_record.get("fail_closed_codes")) != {
        "authorization_absent",
        "authorization_expired",
        "fonte_absent",
    }:
        errors.append("evidence_record_fail_closed_codes_invalid")
    if _canonical_sha256(p) != POLICY_CANONICAL_SHA256:
        errors.append("policy_contract_digest_mismatch")
    return _dedupe(errors)


def transition_allowed(source: str, target: str, policy: dict[str, Any] | None = None) -> bool:
    p = policy if policy is not None else load_policy()
    return target in (_object(p.get("transitions")).get(source) or [])


def _validate_lifecycle(record: dict[str, Any], policy: dict[str, Any]) -> tuple[list[str], dict[str, datetime]]:
    errors: list[str] = []
    lifecycle = record.get("lifecycle")
    if not isinstance(lifecycle, list) or not lifecycle:
        return ["lifecycle_absent"], {}
    event_times: dict[str, datetime] = {}
    previous_state: str | None = None
    previous_at: datetime | None = None
    allowed_actors = _string_set(_object(policy.get("lifecycle")).get("allowed_actors")) or set()
    for index, event in enumerate(lifecycle):
        for error in _exact_keys(event, LIFECYCLE_EVENT_KEYS, f"record.lifecycle[{index}]"):
            errors.append(error)
        if not isinstance(event, dict):
            continue
        event_state = event.get("state")
        event_at = _utc_datetime(event.get("at"))
        actor = event.get("actor")
        if event_state not in STATES:
            errors.append(f"lifecycle_state_invalid:{index}")
        if event_at is None:
            errors.append(f"lifecycle_timestamp_invalid:{index}")
        if actor not in allowed_actors:
            errors.append(f"lifecycle_actor_invalid:{index}")
        if index == 0 and event_state != "DRAFT":
            errors.append("lifecycle_must_start_draft")
        if previous_state and event_state in STATES and not transition_allowed(previous_state, event_state, policy):
            errors.append(f"lifecycle_transition_invalid:{previous_state}:{event_state}")
        if previous_at and event_at and event_at <= previous_at:
            errors.append(f"lifecycle_timestamp_not_increasing:{index}")
        if event_state == "APPROVED" and actor != "HUMAN_TIAGO_JUN_SASAKI":
            errors.append("lifecycle_approval_not_human")
        if event_state in event_times:
            errors.append(f"lifecycle_state_repeated:{event_state}")
        elif event_state in STATES and event_at:
            event_times[event_state] = event_at
        previous_state = event_state if event_state in STATES else previous_state
        previous_at = event_at or previous_at
    last_state = lifecycle[-1].get("state") if isinstance(lifecycle[-1], dict) else None
    if last_state != record.get("state"):
        errors.append("lifecycle_last_state_mismatch")
    return _dedupe(errors), event_times


def _publication_identity_errors(
    publication: dict[str, Any], proof_id: Any, policy: dict[str, Any]
) -> list[str]:
    errors: list[str] = []
    public_url = str(publication.get("public_url") or "")
    parsed = urlparse(public_url)
    canonical = _object(policy.get("authority")).get("canonical_public_domain")
    try:
        port = parsed.port
    except ValueError:
        port = -1
    expected_path = f"/casos/{proof_id}/"
    if (
        parsed.scheme != "https"
        or parsed.hostname != canonical
        or parsed.netloc != canonical
        or port is not None
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or unquote(parsed.path) != parsed.path
    ):
        errors.append("publication_url_not_canonical")
    allowed_prefix = _object(policy.get("publication")).get("allowed_path_prefix") or ""
    if parsed.path != expected_path or not parsed.path.startswith(allowed_prefix):
        errors.append("publication_url_outside_case_family")
    return errors


def validate_evidence_record(
    evidence: Any,
    *,
    required: bool,
    now: datetime | None = None,
) -> list[str]:
    """Fail closed on missing authorization, expired authorization, or missing fonte."""
    errors: list[str] = []
    clock = now or datetime.now(timezone.utc)
    if not required:
        if evidence != EMPTY_EVIDENCE and evidence is not None:
            if not isinstance(evidence, dict):
                return ["object_required:record.evidence"]
            if evidence != EMPTY_EVIDENCE:
                errors.append("evidence_present_without_lifecycle")
        elif evidence is None:
            errors.append("object_required:record.evidence")
        else:
            errors.extend(_exact_keys(evidence, EVIDENCE_KEYS, "record.evidence"))
        return _dedupe(errors)

    errors.extend(_exact_keys(evidence, EVIDENCE_KEYS, "record.evidence"))
    payload = evidence if isinstance(evidence, dict) else {}
    fonte = payload.get("fonte")
    autorizacao = payload.get("autorizacao")
    if not isinstance(fonte, str) or not fonte.strip():
        errors.append("fonte_absent")
    if not isinstance(autorizacao, str) or not autorizacao.strip():
        errors.append("authorization_absent")
    for field in EVIDENCE_KEYS:
        if field in {"fonte", "autorizacao", "expiracao"}:
            continue
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"evidence_field_empty:{field}")
    expires = _utc_datetime(payload.get("expiracao"))
    if expires is None:
        errors.append("evidence_expiracao_invalid")
        errors.append("authorization_expired")
    elif expires <= clock:
        errors.append("authorization_expired")
    return _dedupe(errors)


def validate_record(
    record: dict[str, Any],
    *,
    policy: dict[str, Any] | None = None,
    html: str | None = None,
) -> list[str]:
    p = policy if policy is not None else load_policy()
    errors: list[str] = []
    expected_record_keys = set(RECORD_KEYS)
    if "fixture_only" in record:
        expected_record_keys.add("fixture_only")
        if record.get("fixture_only") is not True:
            errors.append("fixture_only_marker_invalid")
    errors.extend(_exact_keys(record, expected_record_keys, "record"))
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
    raw_consent = record.get("consent")
    raw_retention = record.get("retention")
    raw_revocation = record.get("revocation")
    raw_approval = record.get("approval")
    raw_publication = record.get("publication")
    raw_evidence = record.get("evidence")
    consent = raw_consent if isinstance(raw_consent, dict) else {}
    retention = raw_retention if isinstance(raw_retention, dict) else {}
    revocation = raw_revocation if isinstance(raw_revocation, dict) else {}
    approval = raw_approval if isinstance(raw_approval, dict) else {}
    publication = raw_publication if isinstance(raw_publication, dict) else {}
    errors.extend(_exact_keys(raw_consent, CONSENT_KEYS, "record.consent"))
    errors.extend(_exact_keys(raw_retention, RETENTION_KEYS, "record.retention"))
    errors.extend(_exact_keys(raw_revocation, REVOCATION_KEYS, "record.revocation"))
    errors.extend(_exact_keys(raw_approval, APPROVAL_KEYS, "record.approval"))
    errors.extend(_exact_keys(raw_publication, PUBLICATION_KEYS, "record.publication"))
    if approval.get("approver") is not None:
        errors.extend(_exact_keys(approval.get("approver"), APPROVER_KEYS, "record.approval.approver"))
    lifecycle_errors, lifecycle_times = _validate_lifecycle(record, p)
    errors.extend(lifecycle_errors)

    consent_required_states = {
        "CONSENT_CAPTURED",
        "HUMAN_REVIEW_REQUIRED",
        "APPROVED",
        "PUBLISHED",
        "REVOKED",
    }
    consent_was_captured = "CONSENT_CAPTURED" in lifecycle_times
    evidence_required = (isinstance(state, str) and state in consent_required_states) or consent_was_captured
    errors.extend(validate_evidence_record(raw_evidence, required=evidence_required))

    captured_at: datetime | None = None
    approved_at: datetime | None = None
    published_at: datetime | None = None
    delete_after: datetime | None = None

    if (isinstance(state, str) and state in consent_required_states) or consent_was_captured:
        expected_consent = "REVOKED" if state == "REVOKED" else "EXPIRED" if state == "RETENTION_EXPIRED" else "ACTIVE"
        if consent.get("status") != expected_consent:
            errors.append(f"consent_status_invalid_for_state:{state}")
        captured_at = _utc_datetime(consent.get("captured_at"))
        if captured_at is None:
            errors.append("consent_captured_at_invalid")
        scope = consent.get("scope")
        if not isinstance(scope, dict):
            errors.append("consent_scope_absent")
            scope = {}
        consent_contract = _object(p.get("consent"))
        expected_scope_keys = _string_set(consent_contract.get("scope_must_name")) or set()
        if permission_class == "redacted":
            expected_scope_keys.add("redactions")
        errors.extend(_exact_keys(scope, expected_scope_keys, "record.consent.scope"))
        public_fields = scope.get("public_fields")
        allowed_fields = _string_set(consent_contract.get("public_fields_allowlist")) or set()
        public_fields_valid = (
            isinstance(public_fields, list)
            and bool(public_fields)
            and all(isinstance(field, str) for field in public_fields)
        )
        if (
            not public_fields_valid
            or len(public_fields) != len(set(public_fields))
            or not set(public_fields).issubset(allowed_fields)
        ):
            errors.append("consent_public_fields_invalid")
        if scope.get("public_channels") != consent_contract.get("public_channels_exact"):
            errors.append("consent_public_channels_invalid")
        if scope.get("withdrawal_channel") != consent_contract.get("withdrawal_channel_exact"):
            errors.append("consent_withdrawal_channel_invalid")
        if permission_class == "redacted":
            redactions = scope.get("redactions")
            allowed_redactions = _string_set(consent_contract.get("redactions_allowlist")) or set()
            redactions_valid = (
                isinstance(redactions, list)
                and bool(redactions)
                and all(isinstance(redaction, str) for redaction in redactions)
            )
            if (
                not redactions_valid
                or len(redactions) != len(set(redactions))
                or not set(redactions).issubset(allowed_redactions)
            ):
                errors.append("consent_redactions_invalid")
        expected_scope_hash = consent_scope_hash(scope)
        if consent.get("scope_hash") != expected_scope_hash:
            errors.append("consent_scope_hash_mismatch")
        prefix = _object(p.get("consent")).get("receipt_ref_prefix") or ""
        receipt_ref = str(consent.get("receipt_ref") or "")
        expected_receipt_prefix = f"{prefix}{proof_id}/"
        receipt_token = receipt_ref.removeprefix(expected_receipt_prefix)
        if not receipt_ref.startswith(expected_receipt_prefix) or not OPAQUE_TOKEN.fullmatch(receipt_token):
            errors.append("consent_receipt_ref_not_private")

        delete_after = _utc_datetime(retention.get("delete_after"))
        policy_days = retention.get("policy_days")
        if policy_days != _object(p.get("retention")).get("default_days"):
            errors.append("retention_days_mismatch")
        if delete_after is None:
            errors.append("retention_delete_after_invalid")
        if (
            captured_at
            and delete_after
            and isinstance(policy_days, int)
            and delete_after != captured_at + timedelta(days=policy_days)
        ):
            errors.append("retention_delete_after_not_exact")
        elif captured_at and delete_after and not isinstance(policy_days, int):
            errors.append("retention_delete_after_not_exact")
        if retention.get("private_material_location") != "PRIVATE_ONLY":
            errors.append("retention_material_not_private")
        if revocation.get("allowed") is not True or not revocation.get("channel"):
            errors.append("revocation_route_absent")
        if revocation.get("channel") != consent_contract.get("withdrawal_channel_exact"):
            errors.append("revocation_channel_mismatch")
        if captured_at and lifecycle_times.get("CONSENT_CAPTURED") != captured_at:
            errors.append("consent_lifecycle_timestamp_mismatch")
    elif consent != {"status": "NOT_CAPTURED", "captured_at": None, "scope": None, "scope_hash": None, "receipt_ref": None}:
        errors.append("consent_present_without_lifecycle")

    approval_was_granted = "APPROVED" in lifecycle_times
    if (isinstance(state, str) and state in {"APPROVED", "PUBLISHED"}) or approval_was_granted:
        human = _object(p.get("human_approval"))
        authority_approver = _object(_object(p.get("authority")).get("publication_approver"))
        expected_approval_status = human.get("required_status") if state in ("APPROVED", "PUBLISHED") else "VOID"
        if approval.get("status") != expected_approval_status:
            errors.append("human_approval_absent")
        if approval.get("decision") != human.get("required_decision"):
            errors.append("human_approval_decision_invalid")
        if approval.get("proof_id") != proof_id:
            errors.append("approval_proof_id_mismatch")
        approval_ref = str(approval.get("approval_ref") or "")
        expected_approval_prefix = f"{human.get('approval_ref_prefix') or ''}{proof_id}/"
        approval_token = approval_ref.removeprefix(expected_approval_prefix)
        if not approval_ref.startswith(expected_approval_prefix) or not OPAQUE_TOKEN.fullmatch(approval_token):
            errors.append("approval_ref_not_private")
        raw_approver = approval.get("approver")
        approver = raw_approver if isinstance(raw_approver, dict) else {}
        if (
            approver.get("human") is not True
            or approver.get("id") != authority_approver.get("id")
            or approver.get("name") != authority_approver.get("name")
        ):
            errors.append("human_approver_absent")
        approved_at = _utc_datetime(approval.get("approved_at"))
        if approved_at is None:
            errors.append("human_approval_timestamp_invalid")
        if captured_at and approved_at and approved_at <= captured_at:
            errors.append("human_approval_not_after_consent")
        if approved_at and lifecycle_times.get("APPROVED") != approved_at:
            errors.append("approval_lifecycle_timestamp_mismatch")
        if approval.get("consent_scope_hash") != consent.get("scope_hash"):
            errors.append("approval_consent_scope_hash_mismatch")
        if not HEX64.fullmatch(str(approval.get("material_hash") or "")):
            errors.append("approval_material_hash_invalid")
    else:
        expected_unapproved_status = (
            "VOID" if state in ("REJECTED", "REVOKED", "RETENTION_EXPIRED") else "PENDING"
        )
        if approval.get("status") != expected_unapproved_status or approval.get("decision") is not None:
            errors.append("approval_present_without_lifecycle")
        if approval.get("approval_ref") is not None or approval.get("approver") is not None or approval.get("approved_at") is not None:
            errors.append("approval_identity_present_without_lifecycle")
        if approval.get("proof_id") != proof_id:
            errors.append("approval_proof_id_mismatch")
        expected_pending_scope = consent.get("scope_hash") if consent_was_captured else None
        if approval.get("consent_scope_hash") != expected_pending_scope:
            errors.append("pending_approval_scope_hash_mismatch")
        pending_material = approval.get("material_hash")
        if state == "HUMAN_REVIEW_REQUIRED" or "HUMAN_REVIEW_REQUIRED" in lifecycle_times:
            if not HEX64.fullmatch(str(pending_material or "")):
                errors.append("pending_approval_material_hash_invalid")
        elif pending_material is not None:
            errors.append("pending_approval_material_without_review")

    publication_was_live = "PUBLISHED" in lifecycle_times
    if state == "PUBLISHED" or publication_was_live:
        publication_contract = _object(p.get("publication"))
        if permission_class not in publication_contract.get("allowed_permission_classes", []):
            errors.append("permission_class_not_public")
        if state == "PUBLISHED" and record.get("fixture_only") is True:
            errors.append("fixture_publication_forbidden")
        if state == "PUBLISHED" and publication.get("status") != publication_contract.get("required_status"):
            errors.append("publication_status_invalid")
        errors.extend(_publication_identity_errors(publication, proof_id, p))
        published_at = _utc_datetime(publication.get("published_at"))
        if published_at is None:
            errors.append("publication_timestamp_invalid")
        if approved_at and published_at and published_at <= approved_at:
            errors.append("publication_not_after_approval")
        if published_at and lifecycle_times.get("PUBLISHED") != published_at:
            errors.append("publication_lifecycle_timestamp_mismatch")
        if state == "PUBLISHED" and publication.get("unpublished_at") is not None:
            errors.append("published_record_has_unpublished_at")
        pub_hash = str(publication.get("material_hash") or "")
        if not HEX64.fullmatch(pub_hash):
            errors.append("publication_material_hash_invalid")
        if pub_hash != approval.get("material_hash"):
            errors.append("publication_approval_material_hash_mismatch")
        if delete_after and published_at and published_at >= delete_after:
            errors.append("publication_not_before_retention_boundary")
        if state == "PUBLISHED" and delete_after and datetime.now(timezone.utc) >= delete_after:
            errors.append("published_past_retention_boundary")

    if state != "PUBLISHED" and publication.get("status") == "PUBLISHED":
        errors.append("publication_state_mismatch")

    if state not in ("PUBLISHED", "REVOKED", "RETENTION_EXPIRED") and publication != {
        "status": "NOT_PUBLISHED",
        "public_url": None,
        "published_at": None,
        "unpublished_at": None,
        "material_hash": None,
    }:
        errors.append("publication_present_before_published_state")

    if state == "REVOKED":
        for field in _object(p.get("revocation")).get("required_fields_when_revoked") or []:
            if revocation.get(field) in (None, ""):
                errors.append(f"revocation_field_absent:{field}")
        requested_at = _utc_datetime(revocation.get("requested_at"))
        effective_at = _utc_datetime(revocation.get("effective_at"))
        unpublished_at = _utc_datetime(publication.get("unpublished_at"))
        if requested_at is None or effective_at is None or effective_at < requested_at:
            errors.append("revocation_timestamp_order_invalid")
        if captured_at and requested_at and requested_at < captured_at:
            errors.append("revocation_requested_before_consent")
        if effective_at and lifecycle_times.get("REVOKED") != effective_at:
            errors.append("revocation_lifecycle_timestamp_mismatch")
        if publication_was_live and (publication.get("status") != "UNPUBLISHED" or unpublished_at != effective_at):
            errors.append("revoked_proof_not_unpublished")
        if not publication_was_live and publication.get("status") != "NOT_PUBLISHED":
            errors.append("revoked_never_published_status_invalid")
        if approval.get("status") != "VOID":
            errors.append("revoked_approval_not_void")

    revocation_was_effective = "REVOKED" in lifecycle_times
    if not revocation_was_effective and revocation != {
        "allowed": True,
        "channel": _object(p.get("consent")).get("withdrawal_channel_exact"),
        "status": "NOT_REQUESTED",
        "requested_at": None,
        "effective_at": None,
        "reason_code": None,
    }:
        errors.append("revocation_claimed_without_lifecycle")
    if revocation_was_effective and (
        revocation.get("status") != "EFFECTIVE" or
        not re.fullmatch(r"[A-Z][A-Z0-9_]{2,60}", str(revocation.get("reason_code") or ""))
    ):
        errors.append("revocation_record_invalid")

    if state == "RETENTION_EXPIRED":
        retention_at = lifecycle_times.get("RETENTION_EXPIRED")
        if delete_after is None or retention_at is None or retention_at < delete_after:
            errors.append("retention_expired_before_delete_after")
        if datetime.now(timezone.utc) < (delete_after or datetime.max.replace(tzinfo=timezone.utc)):
            errors.append("retention_expired_before_current_time")
        if publication.get("status") == "PUBLISHED":
            errors.append("retention_expired_proof_still_published")
        if publication_was_live:
            unpublished_at = _utc_datetime(publication.get("unpublished_at"))
            if publication.get("status") != "UNPUBLISHED" or unpublished_at != retention_at:
                errors.append("retention_expired_proof_not_unpublished")
        elif publication != {
            "status": "NOT_PUBLISHED",
            "public_url": None,
            "published_at": None,
            "unpublished_at": None,
            "material_hash": None,
        }:
            errors.append("retention_expired_never_published_status_invalid")
        if approval_was_granted and approval.get("status") != "VOID":
            errors.append("retention_expired_approval_not_void")

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
        visible_fields = set(re.findall(r'data-proof-field=["\']([^"\']+)["\']', html, flags=re.I))
        raw_expected_fields = (consent.get("scope") or {}).get("public_fields")
        expected_fields = _string_set(raw_expected_fields) or set()
        if visible_fields != expected_fields:
            errors.append("visible_public_fields_scope_mismatch")
        canonical_hrefs: list[str] = []
        for tag in re.findall(r"<link\b[^>]*>", html, flags=re.I):
            rel = re.search(r'\brel=["\']([^"\']+)["\']', tag, flags=re.I)
            href = re.search(r'\bhref=["\']([^"\']+)["\']', tag, flags=re.I)
            if rel and "canonical" in rel.group(1).lower().split() and href:
                canonical_hrefs.append(href.group(1))
        if canonical_hrefs != [publication.get("public_url")]:
            errors.append("visible_canonical_url_mismatch")
        if re.search(r"data-fixture-only|confenge:fixture|FIXTURE_ONLY", html, flags=re.I):
            errors.append("fixture_marker_in_publication")
        actual_hash = material_hash(html)
        if publication.get("material_hash") != actual_hash:
            errors.append("publication_material_hash_drift")
        if approval.get("material_hash") != actual_hash:
            errors.append("approval_material_hash_drift")
        if re.search(r'["\'](?:Review|AggregateRating)["\']', html, flags=re.I):
            errors.append("forbidden_proof_schema_type")

    return _dedupe(errors)


def validate_registry(
    registry: dict[str, Any] | None = None,
    *,
    policy: dict[str, Any] | None = None,
) -> list[str]:
    p = policy if policy is not None else load_policy()
    r = registry if registry is not None else load_registry()
    errors: list[str] = []
    errors.extend(_exact_keys(r, REGISTRY_KEYS, "registry"))
    if r.get("schema") != REGISTRY_SCHEMA:
        errors.append("registry_schema_invalid")
    if r.get("policy") != p.get("schema"):
        errors.append("registry_policy_mismatch")
    updated_at = r.get("updated_at")
    try:
        parsed_updated_at = date.fromisoformat(str(updated_at))
    except ValueError:
        parsed_updated_at = None
    if parsed_updated_at is None or str(updated_at) != parsed_updated_at.isoformat():
        errors.append("registry_updated_at_invalid")
    elif parsed_updated_at > datetime.now(timezone.utc).date():
        errors.append("registry_updated_at_in_future")
    records = r.get("records")
    if not isinstance(records, list):
        errors.append("registry_records_invalid")
        records = []
    ids: set[str] = set()
    receipt_refs: set[str] = set()
    approval_refs: set[str] = set()
    public_urls: set[str] = set()
    published = 0
    for record in records:
        if not isinstance(record, dict):
            errors.append("registry_record_not_object")
            continue
        proof_id = str(record.get("proof_id") or "")
        if proof_id in ids:
            errors.append(f"registry_duplicate_proof_id:{proof_id}")
        ids.add(proof_id)
        for field_name, value, seen in (
            ("receipt_ref", (record.get("consent") or {}).get("receipt_ref"), receipt_refs),
            ("approval_ref", (record.get("approval") or {}).get("approval_ref"), approval_refs),
            ("public_url", (record.get("publication") or {}).get("public_url"), public_urls),
        ):
            if value is None:
                continue
            if not isinstance(value, str):
                errors.append(f"registry_{field_name}_invalid:{proof_id}")
                continue
            if value in seen:
                errors.append(f"registry_duplicate_{field_name}:{value}")
            seen.add(value)
        if record.get("fixture_only") is True:
            errors.append(f"registry_fixture_forbidden:{proof_id}")
        public_html: str | None = None
        if record.get("state") == "PUBLISHED":
            parsed = urlparse(str((record.get("publication") or {}).get("public_url") or ""))
            rel = PurePosixPath(parsed.path).as_posix().strip("/")
            safe_path = (
                parsed.scheme == "https"
                and parsed.hostname == "confenge.com.br"
                and parsed.netloc == "confenge.com.br"
                and not parsed.query
                and not parsed.fragment
                and unquote(parsed.path) == parsed.path
                and parsed.path.startswith("/casos/")
                and parsed.path.endswith("/")
                and ".." not in PurePosixPath(rel).parts
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

    raw_next_test = r.get("next_test")
    next_test = raw_next_test if isinstance(raw_next_test, dict) else {}
    errors.extend(_exact_keys(raw_next_test, NEXT_TEST_KEYS, "registry.next_test"))
    approver = _object(_object(p.get("authority")).get("publication_approver"))
    expected_next_status = "FIRST_REAL_DELIVERY_PROOF_COMPLETE" if published else "WAIT_FIRST_REAL_DELIVERY"
    if next_test.get("id") != "first-real-delivery-permissioned-proof":
        errors.append("first_real_delivery_next_test_id_invalid")
    if next_test.get("status") != expected_next_status:
        errors.append("first_real_delivery_next_test_absent")
    raw_owner = next_test.get("owner")
    owner = raw_owner if isinstance(raw_owner, dict) else {}
    errors.extend(_exact_keys(raw_owner, NEXT_TEST_OWNER_KEYS, "registry.next_test.owner"))
    if owner.get("id") != approver.get("id") or owner.get("name") != approver.get("name"):
        errors.append("next_test_owner_not_named_human")
    if not next_test.get("trigger") or not next_test.get("required_result"):
        errors.append("next_test_contract_incomplete")
    if _string_set(next_test.get("forbidden_shortcuts")) != set(FORBIDDEN_SHORTCUTS):
        errors.append("next_test_forbidden_shortcuts_invalid")
    errors.extend(validate_cases_alignment(r))
    errors.extend(_client_pii_errors(r, "registry"))
    return _dedupe(errors)


def validate_cases_alignment(
    registry: dict[str, Any] | None = None,
    cases: dict[str, Any] | None = None,
) -> list[str]:
    """The older cases registry cannot bypass permissioned-proof approval."""
    r = registry if registry is not None else load_registry()
    c = cases if cases is not None else _load(CASES_PATH)
    registry_rows = r.get("records") if isinstance(r.get("records"), list) else []
    case_rows = c.get("cases") if isinstance(c.get("cases"), list) else []
    surface_rows = c.get("published_surfaces") if isinstance(c.get("published_surfaces"), list) else []
    records = {
        row.get("proof_id"): row
        for row in registry_rows
        if isinstance(row, dict) and isinstance(row.get("proof_id"), str) and row.get("proof_id")
    }
    approved_cases = {
        row.get("case_id"): row
        for row in case_rows
        if (
            isinstance(row, dict)
            and isinstance(row.get("case_id"), str)
            and row.get("public_status") == "APPROVED"
        )
    }
    errors: list[str] = []
    for case_id, case in approved_cases.items():
        record = records.get(case_id)
        if not record or record.get("state") != "PUBLISHED":
            errors.append(f"approved_case_without_permissioned_proof:{case_id}")
            continue
        if record.get("permission_class") != case.get("permission_class"):
            errors.append(f"approved_case_permission_class_mismatch:{case_id}")
        if case.get("client_authorized") is not True:
            errors.append(f"approved_case_not_client_authorized:{case_id}")
    for proof_id, record in records.items():
        if record.get("state") == "PUBLISHED" and proof_id not in approved_cases:
            errors.append(f"published_proof_not_registered_case:{proof_id}")

    approved_paths = {
        row.get("path")
        for row in surface_rows
        if (
            isinstance(row, dict)
            and isinstance(row.get("path"), str)
            and row.get("public_status") == "APPROVED"
        )
    }
    approved_surface_rows = {
        row.get("path"): row
        for row in surface_rows
        if (
            isinstance(row, dict)
            and isinstance(row.get("path"), str)
            and row.get("public_status") == "APPROVED"
        )
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
    for proof_id, record in records.items():
        if record.get("state") != "PUBLISHED":
            continue
        path = urlparse(str((record.get("publication") or {}).get("public_url") or "")).path
        surface = approved_surface_rows.get(path) or {}
        if surface.get("permission_class") != record.get("permission_class"):
            errors.append(f"approved_surface_permission_class_mismatch:{path}")
        if surface.get("client_authorized") is not True:
            errors.append(f"approved_surface_not_client_authorized:{path}")
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
