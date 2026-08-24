"""Regression tests for the permissioned-proof publication contract (#249)."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.permissioned_proof import (  # noqa: E402
    POLICY_PATH,
    REGISTRY_PATH,
    audit,
    consent_scope_hash,
    load_policy,
    load_registry,
    material_hash,
    transition_allowed,
    validate_cases_alignment,
    validate_policy,
    validate_record,
    validate_registry,
)
from scripts.site.visible_parity import compare_visible_parity  # noqa: E402


FIXTURES = ROOT / "scripts" / "site" / "fixtures" / "permissioned_proof"


def _synthetic_publishable() -> tuple[dict, str]:
    html = """<!doctype html><html lang="pt-BR"><head><title>Prova sintética de gate</title></head>
    <body data-surface-type="caso_proof" data-proof-id="synthetic-proof-gate">
    <main><h1>Prova sintética de gate</h1>
    <p data-permission-class="consented">CASO CONFENGE consentido.</p>
    <p>Registro de consentimento documentado e escopado em recibo privado.</p>
    <p>Material sintético usado somente para provar o gate; não é caso real.</p>
    </main></body></html>"""
    scope = {
        "public_fields": ["problem", "intervention", "outcome"],
        "public_channels": ["confenge.com.br"],
        "withdrawal_channel": "PRIVATE_OWNER_CHANNEL",
    }
    scope_hash = consent_scope_hash(scope)
    digest = material_hash(html)
    record = {
        "proof_id": "synthetic-proof-gate",
        "policy_version": "1.0.0",
        "state": "PUBLISHED",
        "permission_class": "consented",
        "consent": {
            "status": "ACTIVE",
            "captured_at": "2026-08-24T00:00:00Z",
            "scope": scope,
            "scope_hash": scope_hash,
            "receipt_ref": "private://permissioned-proof/synthetic-proof-gate",
        },
        "retention": {
            "policy_days": 730,
            "delete_after": "2028-08-23T00:00:00Z",
            "private_material_location": "PRIVATE_ONLY",
        },
        "revocation": {
            "allowed": True,
            "channel": "PRIVATE_OWNER_CHANNEL",
            "status": "NOT_REQUESTED",
            "requested_at": None,
            "effective_at": None,
            "reason_code": None,
        },
        "approval": {
            "status": "APPROVED",
            "decision": "APPROVE_PUBLICATION",
            "approver": {
                "id": "tiago-jun-sasaki",
                "name": "Engº Tiago Sasaki",
                "human": True,
            },
            "approved_at": "2026-08-24T00:30:00Z",
            "consent_scope_hash": scope_hash,
            "material_hash": digest,
        },
        "publication": {
            "status": "PUBLISHED",
            "public_url": "https://confenge.com.br/casos/synthetic-proof-gate/",
            "published_at": "2026-08-24T01:00:00Z",
            "material_hash": digest,
        },
    }
    return record, html


def test_versioned_policy_and_empty_registry_are_valid():
    assert POLICY_PATH.is_file()
    assert REGISTRY_PATH.is_file()
    policy = load_policy()
    registry = load_registry()
    assert validate_policy(policy) == []
    assert validate_registry(registry, policy=policy) == []
    assert validate_cases_alignment(registry) == []
    result = audit()
    assert result["ok"] is True
    assert result["approved_public_proof_count"] == 0
    assert result["next_test"] == "WAIT_FIRST_REAL_DELIVERY"
    assert registry["records"] == []
    assert registry["state"] == "NO_APPROVED_CLIENT_PROOF"


def test_first_real_delivery_is_named_next_test_not_fabricated_proof():
    registry = load_registry()
    next_test = registry["next_test"]
    assert next_test["owner"] == {
        "id": "tiago-jun-sasaki",
        "name": "Engº Tiago Sasaki",
    }
    assert next_test["status"] == "WAIT_FIRST_REAL_DELIVERY"
    assert "fabricated_delivery" in next_test["forbidden_shortcuts"]
    assert "approval_by_agent_ci_or_bot" in next_test["forbidden_shortcuts"]
    assert "raw_consent_or_client_pii_committed" in next_test["forbidden_shortcuts"]


def test_synthetic_complete_record_proves_gate_is_satisfiable():
    record, html = _synthetic_publishable()
    assert validate_record(record, html=html) == []


def test_consented_without_named_human_approver_fails_closed():
    record = json.loads(
        (FIXTURES / "consented-without-human-approver.json").read_text(encoding="utf-8")
    )
    html = (FIXTURES / "consented-without-human-approver.html").read_text(encoding="utf-8")
    errors = validate_record(record, html=html)
    assert "human_approval_absent" in errors
    assert "human_approver_absent" in errors
    assert "fixture_publication_forbidden" in errors
    assert "publication_material_hash_drift" not in errors
    assert "approval_material_hash_drift" not in errors
    assert "Review" not in html
    assert "AggregateRating" not in html


def test_consent_scope_or_material_drift_voids_publication():
    record, html = _synthetic_publishable()
    scope_drift = copy.deepcopy(record)
    scope_drift["consent"]["scope"]["public_fields"].append("new_claim")
    errors = validate_record(scope_drift, html=html)
    assert "consent_scope_hash_mismatch" in errors

    material_drift = html.replace("sintético", "alterado", 1)
    errors = validate_record(record, html=material_drift)
    assert "publication_material_hash_drift" in errors
    assert "approval_material_hash_drift" in errors


def test_revocation_is_allowed_and_requires_unpublish_and_void_approval():
    policy = load_policy()
    assert transition_allowed("PUBLISHED", "REVOKED", policy)
    record, _html = _synthetic_publishable()
    revoked = copy.deepcopy(record)
    revoked["state"] = "REVOKED"
    revoked["consent"]["status"] = "REVOKED"
    revoked["revocation"].update(
        {
            "status": "EFFECTIVE",
            "requested_at": "2026-08-25T00:00:00Z",
            "effective_at": "2026-08-25T00:05:00Z",
            "reason_code": "SUBJECT_WITHDRAWAL",
        }
    )
    revoked["approval"]["status"] = "VOID"
    revoked["publication"] = {
        "status": "UNPUBLISHED",
        "unpublished_at": "2026-08-25T00:05:00Z",
        "public_url": record["publication"]["public_url"],
        "material_hash": record["publication"]["material_hash"],
    }
    assert validate_record(revoked, policy=policy) == []

    broken = copy.deepcopy(revoked)
    broken["publication"]["status"] = "PUBLISHED"
    broken["approval"]["status"] = "APPROVED"
    errors = validate_record(broken, policy=policy)
    assert "publication_state_mismatch" in errors
    assert "revoked_proof_not_unpublished" in errors
    assert "revoked_approval_not_void" in errors


def test_committed_registry_rejects_client_pii():
    record, _html = _synthetic_publishable()
    record["client_name"] = "Empresa que não pode entrar no git"
    errors = validate_record(record)
    assert "client_pii_forbidden:record.client_name" in errors


def test_existing_cases_registry_cannot_bypass_permissioned_proof():
    fake_cases = {
        "cases": [
            {
                "case_id": "case-without-proof",
                "public_status": "APPROVED",
                "permission_class": "consented",
                "client_authorized": True,
            }
        ],
        "published_surfaces": [
            {
                "path": "/casos/case-without-proof/",
                "public_status": "APPROVED",
                "permission_class": "consented",
            }
        ],
    }
    errors = validate_cases_alignment(load_registry(), fake_cases)
    assert "approved_case_without_permissioned_proof:case-without-proof" in errors
    assert "approved_surface_without_permissioned_proof:/casos/case-without-proof/" in errors


def test_existing_false_case_study_still_fails_closed():
    fixture = ROOT / "scripts" / "site" / "fixtures" / "visible_parity" / "false-case-study.html"
    html = fixture.read_text(encoding="utf-8")
    parity = compare_visible_parity(html)
    assert parity["ok"] is False
    assert any(defect["code"] == "schema_false_case_study" for defect in parity["defects"])


if __name__ == "__main__":
    tests = [value for key, value in list(globals().items()) if key.startswith("test_") and callable(value)]
    failed = 0
    for test in tests:
        try:
            test()
            print("OK", test.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", test.__name__, exc)
    raise SystemExit(1 if failed else 0)
