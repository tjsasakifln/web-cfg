"""Regression tests for the permissioned-proof publication contract (#249)."""

from __future__ import annotations

import copy
import json
import re
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
    validate_evidence_record,
    validate_policy,
    validate_record,
    validate_registry,
)
from scripts.site.visible_parity import compare_visible_parity  # noqa: E402
from scripts.site.credential_registry import (  # noqa: E402
    is_projectable,
    load_registry as load_credential_registry,
)


FIXTURES = ROOT / "scripts" / "site" / "fixtures" / "permissioned_proof"


def _synthetic_publishable() -> tuple[dict, str]:
    html = """<!doctype html><html lang="pt-BR"><head><title>Prova sintética de gate</title>
    <link rel="canonical" href="https://confenge.com.br/casos/synthetic-proof-gate/"/></head>
    <body data-surface-type="caso_proof" data-proof-id="synthetic-proof-gate">
    <main><h1>Prova sintética de gate</h1>
    <p data-permission-class="consented" data-proof-field="problem">CASO CONFENGE consentido.</p>
    <p data-proof-field="intervention">Registro de consentimento documentado e escopado em recibo privado.</p>
    <p data-proof-field="outcome">Material sintético usado somente para provar o gate; não é caso real.</p>
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
            "receipt_ref": "private://permissioned-proof/synthetic-proof-gate/receipt-v1",
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
            "approval_ref": "private://permissioned-proof-approval/synthetic-proof-gate/approval-v1",
            "proof_id": "synthetic-proof-gate",
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
            "unpublished_at": None,
            "material_hash": digest,
        },
        "lifecycle": [
            {"state": "DRAFT", "at": "2026-08-23T23:50:00Z", "actor": "OWNER_CONFENGE"},
            {"state": "CONSENT_CAPTURED", "at": "2026-08-24T00:00:00Z", "actor": "OWNER_CONFENGE"},
            {"state": "HUMAN_REVIEW_REQUIRED", "at": "2026-08-24T00:20:00Z", "actor": "OWNER_CONFENGE"},
            {"state": "APPROVED", "at": "2026-08-24T00:30:00Z", "actor": "HUMAN_TIAGO_JUN_SASAKI"},
            {"state": "PUBLISHED", "at": "2026-08-24T01:00:00Z", "actor": "OWNER_CONFENGE"},
        ],
        "evidence": {
            "fonte": "recibo privado de entrega da fixture de gate",
            "autorizacao": "autorizacao sintetica ativa registrada em recibo privado",
            "escopo_permitido": "problem, intervention, outcome em confenge.com.br",
            "anonimizacao": "identidade do titular e valores comerciais omitidos",
            "baseline": "situacao anterior documentada no recibo privado",
            "intervencao": "leitura tecnica documentada no material publicado",
            "resultado_observavel": "material sintetico do gate, sem resultado comercial",
            "limitacoes": "fixture de teste; nao e cliente, contrato ou resultado real",
            "revisor": "tiago-jun-sasaki",
            "expiracao": "2028-08-24T00:00:00Z",
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
    assert result["next_test"] == "BLOCKED_EXTERNAL:FIRST_PERMISSIONED_CUSTOMER_PROOF"
    assert registry["records"] == []
    assert registry["state"] == "NO_APPROVED_CLIENT_PROOF"


def test_first_real_delivery_is_named_next_test_not_fabricated_proof():
    registry = load_registry()
    next_test = registry["next_test"]
    assert next_test["owner"] == {
        "id": "tiago-jun-sasaki",
        "name": "Engº Tiago Sasaki",
    }
    assert next_test["status"] == "BLOCKED_EXTERNAL:FIRST_PERMISSIONED_CUSTOMER_PROOF"
    assert next_test["blocker"] == "BLOCKED_EXTERNAL:FIRST_PERMISSIONED_CUSTOMER_PROOF"
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
        "published_at": record["publication"]["published_at"],
        "unpublished_at": "2026-08-25T00:05:00Z",
        "public_url": record["publication"]["public_url"],
        "material_hash": record["publication"]["material_hash"],
    }
    revoked["lifecycle"].append(
        {"state": "REVOKED", "at": "2026-08-25T00:05:00Z", "actor": "OWNER_CONFENGE"}
    )
    assert validate_record(revoked, policy=policy) == []

    broken = copy.deepcopy(revoked)
    broken["publication"]["status"] = "PUBLISHED"
    broken["approval"]["status"] = "APPROVED"
    errors = validate_record(broken, policy=policy)
    assert "publication_state_mismatch" in errors
    assert "revoked_proof_not_unpublished" in errors
    assert "revoked_approval_not_void" in errors

    before_approval = copy.deepcopy(record)
    before_approval["state"] = "REVOKED"
    before_approval["consent"]["status"] = "REVOKED"
    before_approval["approval"] = {
        "status": "VOID",
        "decision": None,
        "approval_ref": None,
        "proof_id": record["proof_id"],
        "approver": None,
        "approved_at": None,
        "consent_scope_hash": record["consent"]["scope_hash"],
        "material_hash": None,
    }
    before_approval["publication"] = {
        "status": "NOT_PUBLISHED",
        "public_url": None,
        "published_at": None,
        "unpublished_at": None,
        "material_hash": None,
    }
    before_approval["revocation"].update(
        {
            "status": "EFFECTIVE",
            "requested_at": "2026-08-24T00:05:00Z",
            "effective_at": "2026-08-24T00:10:00Z",
            "reason_code": "SUBJECT_WITHDRAWAL",
        }
    )
    before_approval["lifecycle"] = before_approval["lifecycle"][:2] + [
        {"state": "REVOKED", "at": "2026-08-24T00:10:00Z", "actor": "OWNER_CONFENGE"}
    ]
    assert validate_record(before_approval, policy=policy) == []


def test_committed_registry_rejects_client_pii():
    record, _html = _synthetic_publishable()
    record["client_name"] = "Empresa que não pode entrar no git"
    errors = validate_record(record)
    assert "client_pii_forbidden:record.client_name" in errors


def test_lifecycle_cannot_start_published_skip_review_or_fake_human_actor():
    record, _html = _synthetic_publishable()
    direct = copy.deepcopy(record)
    direct["lifecycle"] = [direct["lifecycle"][-1]]
    assert "lifecycle_must_start_draft" in validate_record(direct)

    skipped = copy.deepcopy(record)
    skipped["lifecycle"].pop(2)
    assert "lifecycle_transition_invalid:CONSENT_CAPTURED:APPROVED" in validate_record(skipped)

    automated = copy.deepcopy(record)
    automated["lifecycle"][3]["actor"] = "OWNER_CONFENGE"
    assert "lifecycle_approval_not_human" in validate_record(automated)


def test_receipt_and_approval_are_bound_to_exact_proof():
    record, _html = _synthetic_publishable()
    copied = copy.deepcopy(record)
    copied["consent"]["receipt_ref"] = "private://permissioned-proof/other-proof/receipt-v1"
    copied["approval"]["approval_ref"] = "private://permissioned-proof-approval/other-proof/approval-v1"
    copied["approval"]["proof_id"] = "other-proof"
    errors = validate_record(copied)
    assert "consent_receipt_ref_not_private" in errors
    assert "approval_ref_not_private" in errors
    assert "approval_proof_id_mismatch" in errors


def test_consent_scope_is_closed_to_safe_fields_channel_and_redactions():
    record, _html = _synthetic_publishable()
    unsafe = copy.deepcopy(record)
    unsafe["consent"]["scope"]["public_fields"].append("client_identity")
    unsafe["consent"]["scope"]["public_channels"] = ["example.com"]
    errors = validate_record(unsafe)
    assert "consent_public_fields_invalid" in errors
    assert "consent_public_channels_invalid" in errors

    redacted = copy.deepcopy(record)
    redacted["permission_class"] = "redacted"
    errors = validate_record(redacted)
    assert "schema_keys_mismatch:record.consent.scope" in errors
    assert "consent_redactions_invalid" in errors


def test_timestamps_are_strict_utc_ordered_and_retention_is_exact():
    record, _html = _synthetic_publishable()
    naive = copy.deepcopy(record)
    naive["approval"]["approved_at"] = "2026-08-24T00:30:00"
    assert "human_approval_timestamp_invalid" in validate_record(naive)

    reversed_order = copy.deepcopy(record)
    reversed_order["approval"]["approved_at"] = "2026-08-23T23:55:00Z"
    reversed_order["lifecycle"][3]["at"] = "2026-08-23T23:55:00Z"
    assert "human_approval_not_after_consent" in validate_record(reversed_order)

    loose_retention = copy.deepcopy(record)
    loose_retention["retention"]["delete_after"] = "2028-08-24T00:00:00Z"
    assert "retention_delete_after_not_exact" in validate_record(loose_retention)


def test_publication_url_is_exact_canonical_identity():
    record, _html = _synthetic_publishable()
    attacks = (
        "https://confenge.com.br:443/casos/synthetic-proof-gate/",
        "https://user@confenge.com.br/casos/synthetic-proof-gate/",
        "https://confenge.com.br/casos/synthetic-proof-gate/?preview=1",
        "https://confenge.com.br/casos/other-proof/",
        "https://confenge.com.br/casos/%2e%2e/synthetic-proof-gate/",
    )
    for url in attacks:
        mutated = copy.deepcopy(record)
        mutated["publication"]["public_url"] = url
        errors = validate_record(mutated)
        assert {"publication_url_not_canonical", "publication_url_outside_case_family"} & set(errors)


def test_visible_material_fields_must_equal_consent_scope():
    record, html = _synthetic_publishable()
    missing = html.replace(' data-proof-field="outcome"', "")
    assert "visible_public_fields_scope_mismatch" in validate_record(record, html=missing)

    extra = html.replace("</main>", '<p data-proof-field="evidence">extra</p></main>')
    assert "visible_public_fields_scope_mismatch" in validate_record(record, html=extra)

    wrong_canonical = html.replace(
        "https://confenge.com.br/casos/synthetic-proof-gate/",
        "https://confenge.com.br/casos/other-proof/",
    )
    assert "visible_canonical_url_mismatch" in validate_record(record, html=wrong_canonical)


def test_normalized_keys_phone_tax_id_and_email_are_rejected_as_pii():
    record, _html = _synthetic_publishable()
    record["metadata"] = {
        "Contato E-mail": "pessoa@example.com",
        "telefone_publico": "+55 (11) 99999-8888",
        "document": "123.456.789-00",
    }
    errors = validate_record(record)
    assert "client_pii_forbidden:record.metadata.Contato E-mail" in errors
    assert "client_pii_phone_forbidden:record.metadata.telefone_publico" in errors
    assert "client_pii_tax_id_forbidden:record.metadata.document" in errors


def test_policy_registry_and_record_schemas_fail_closed_on_drift():
    policy = load_policy()
    drifted = copy.deepcopy(policy)
    drifted["consent"]["rules"].append("silent semantic drift")
    assert "policy_contract_digest_mismatch" in validate_policy(drifted)
    assert "policy_schema_invalid" in validate_policy({})
    malformed_policy = copy.deepcopy(policy)
    malformed_policy["transitions"] = []
    assert "transition_sources_incomplete_or_reordered" in validate_policy(malformed_policy)

    registry = load_registry()
    registry["unexpected"] = True
    assert "schema_keys_mismatch:registry" in validate_registry(registry)
    assert "registry_schema_invalid" in validate_registry({})

    record, _html = _synthetic_publishable()
    record["approval"]["unexpected"] = True
    assert "schema_keys_mismatch:record.approval" in validate_record(record)
    malformed_record, _html = _synthetic_publishable()
    malformed_record["consent"] = []
    assert "object_required:record.consent" in validate_record(malformed_record)


def test_registry_rejects_copied_private_refs_and_public_urls():
    first, _html = _synthetic_publishable()
    second = copy.deepcopy(first)
    second["proof_id"] = "synthetic-second-proof"
    registry = load_registry()
    registry["records"] = [first, second]
    registry["approved_public_proof_count"] = 2
    registry["state"] = "HAS_APPROVED_CLIENT_PROOF"
    registry["next_test"]["status"] = "COMPLETE:FIRST_PERMISSIONED_CUSTOMER_PROOF"
    registry["next_test"]["blocker"] = None
    errors = validate_registry(registry)
    assert any(code.startswith("registry_duplicate_receipt_ref:") for code in errors)
    assert any(code.startswith("registry_duplicate_approval_ref:") for code in errors)
    assert any(code.startswith("registry_duplicate_public_url:") for code in errors)


def test_revocation_request_cannot_predate_consent():
    policy = load_policy()
    record, _html = _synthetic_publishable()
    record["state"] = "REVOKED"
    record["consent"]["status"] = "REVOKED"
    record["approval"]["status"] = "VOID"
    record["revocation"].update(
        {
            "status": "EFFECTIVE",
            "requested_at": "2026-08-23T23:00:00Z",
            "effective_at": "2026-08-25T00:05:00Z",
            "reason_code": "SUBJECT_WITHDRAWAL",
        }
    )
    record["publication"]["status"] = "UNPUBLISHED"
    record["publication"]["unpublished_at"] = "2026-08-25T00:05:00Z"
    record["lifecycle"].append(
        {"state": "REVOKED", "at": "2026-08-25T00:05:00Z", "actor": "OWNER_CONFENGE"}
    )
    assert "revocation_requested_before_consent" in validate_record(record, policy=policy)


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
    assert "legacy_cases_registry_real_proof_forbidden:case-without-proof" in errors
    assert "legacy_cases_registry_real_proof_surface_forbidden:/casos/case-without-proof/" in errors


def test_published_proof_has_one_record_entrypoint_not_three() -> None:
    record, _html = _synthetic_publishable()
    registry = load_registry()
    registry["records"] = [record]
    registry["approved_public_proof_count"] = 1
    registry["state"] = "HAS_APPROVED_CLIENT_PROOF"
    registry["next_test"]["status"] = "COMPLETE:FIRST_PERMISSIONED_CUSTOMER_PROOF"
    registry["next_test"]["blocker"] = None
    legacy = {"cases": [], "published_surfaces": []}
    assert validate_cases_alignment(registry, legacy) == []


def test_evidence_record_rejects_missing_authorization_expired_authorization_and_missing_fonte():
    complete = {
        "fonte": "recibo privado de entrega da fixture de gate",
        "autorizacao": "autorizacao sintetica ativa registrada em recibo privado",
        "escopo_permitido": "problem, intervention, outcome em confenge.com.br",
        "anonimizacao": "identidade do titular e valores comerciais omitidos",
        "baseline": "situacao anterior documentada no recibo privado",
        "intervencao": "leitura tecnica documentada no material publicado",
        "resultado_observavel": "material sintetico do gate, sem resultado comercial",
        "limitacoes": "fixture de teste; nao e cliente, contrato ou resultado real",
        "revisor": "tiago-jun-sasaki",
        "expiracao": "2028-08-24T00:00:00Z",
    }
    assert validate_evidence_record(complete, required=True) == []

    missing_auth = copy.deepcopy(complete)
    missing_auth["autorizacao"] = ""
    assert "authorization_absent" in validate_evidence_record(missing_auth, required=True)

    expired = copy.deepcopy(complete)
    expired["expiracao"] = "2020-01-01T00:00:00Z"
    assert "authorization_expired" in validate_evidence_record(expired, required=True)

    missing_fonte = copy.deepcopy(complete)
    missing_fonte["fonte"] = ""
    assert "fonte_absent" in validate_evidence_record(missing_fonte, required=True)

    record, html = _synthetic_publishable()
    record["evidence"]["autorizacao"] = ""
    assert "authorization_absent" in validate_record(record, html=html)
    record, html = _synthetic_publishable()
    record["evidence"]["expiracao"] = "2020-08-24T00:00:00Z"
    assert "authorization_expired" in validate_record(record, html=html)
    record, html = _synthetic_publishable()
    record["evidence"]["fonte"] = ""
    assert "fonte_absent" in validate_record(record, html=html)


def test_collection_kit_exists_as_operator_templates_not_public_cases():
    kit = ROOT / "docs" / "ops" / "proof-collection-kit"
    expected = [
        "README.md",
        "questionario.md",
        "autorizacao.md",
        "redaction-checklist.md",
        "case-template.md",
    ]
    for name in expected:
        path = kit / name
        assert path.is_file(), name
        assert path.stat().st_size > 200, name
    readme = (kit / "README.md").read_text(encoding="utf-8")
    assert "Pacote operacional" in readme
    assert "não é case de cliente" in readme or "Nenhum deles é case de cliente" in readme
    public_html = (ROOT / "docs" / "ops" / "proof-collection-kit" / "index.html")
    assert not public_html.exists()
    family = json.loads((ROOT / "data" / "organic" / "public-family-registry.json").read_text(encoding="utf-8"))
    kit_routes = []
    for fam in family["families"]:
        routes = (fam.get("match") or {}).get("routes") or []
        kit_routes.extend(r for r in routes if "proof-collection-kit" in r or r.startswith("/docs/"))
    assert kit_routes == []


def test_casos_pages_label_synthetic_or_demonstrative_in_title_h1_schema_and_cta():
    hub = (ROOT / "casos" / "index.html").read_text(encoding="utf-8")
    assert "Exemplos de entrega" in hub
    assert "Resultados de clientes" in hub
    assert "<h1>Exemplos de entrega (demonstrativos)</h1>" in hub
    assert "demonstrativo" in hub.lower()
    pages = list((ROOT / "casos").glob("*/index.html")) + [ROOT / "casos" / "index.html"]
    audit_config = json.loads(
        (ROOT / "data" / "commercial" / "real-proof-registry.v1.json").read_text(encoding="utf-8")
    )
    explicit_label = re.compile(
        audit_config["synthetic_surfaces"]["explicit_label_pattern"], flags=re.I
    )
    for page in pages:
        html = page.read_text(encoding="utf-8")
        title = re.search(r"<title>(.*?)</title>", html, flags=re.I | re.S)
        h1 = re.search(r"<h1>(.*?)</h1>", html, flags=re.I | re.S)
        assert title and explicit_label.search(title.group(1)), page
        assert h1 and explicit_label.search(re.sub(r"<[^>]+>", "", h1.group(1))), page
        assert explicit_label.search(html)
        ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, flags=re.I | re.S)
        assert ld and explicit_label.search(ld.group(1)), page
        main = re.search(r"<main\b[^>]*>(.*?)</main>", html, flags=re.I | re.S)
        assert main, page
        assert explicit_label.search(main.group(1)), page
        types = set()
        for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, flags=re.I | re.S):
            payload = json.loads(block)
            nodes = payload.get("@graph", payload if isinstance(payload, list) else [payload])
            for node in nodes:
                if isinstance(node, dict):
                    t = node.get("@type")
                    if isinstance(t, str):
                        types.add(t)
                    elif isinstance(t, list):
                        types.update(str(x) for x in t)
        assert "Review" not in types and "AggregateRating" not in types, (page, types)


def test_trust_surface_states_executor_correction_evidence_and_method_split():
    path = ROOT / "confianca" / "index.html"
    html = path.read_text(encoding="utf-8")
    assert path.is_file()
    for needle in (
        "Quem responde pela CONFENGE",
        "Como corrigir",
        "Prova que acompanha a afirmação",
        "Veja o trabalho antes de conversar",
        "exemplos de entrega",
        "Prova de cliente",
        "52.407.089/0001-09",
        "Tiago Jun Sasaki",
    ):
        assert needle in html, needle
    assert "https://github.com/tjsasakifln" not in html
    crea_claims = [
        claim
        for claim in load_credential_registry()["claims"]
        if "crea" in str(claim.get("id", "")).lower()
    ]
    if any(is_projectable(claim) for claim in crea_claims):
        assert "CREA" in html
    else:
        assert "CREA" not in html
    assert '"Review"' not in html
    assert '"AggregateRating"' not in html
    assert "R$" not in html
    family = json.loads((ROOT / "data" / "organic" / "public-family-registry.json").read_text(encoding="utf-8"))
    legal = next(fam for fam in family["families"] if fam["id"] == "legal-and-trust")
    assert "/confianca/" in legal["match"]["routes"]
    assert legal["profile"] == "trust_or_legal"


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
