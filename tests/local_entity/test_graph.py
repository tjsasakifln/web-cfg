"""Drive extract_entity_graph / classify_graph on the real specialist page and fixtures."""

from __future__ import annotations

import copy
from pathlib import Path

from scripts.local_entity.classify import (
    FINAL_OFFICIAL_CREDENTIAL_SOURCES,
    classify_graph,
    remap_proof_status,
)
from scripts.local_entity.constants import CLAIM_STATUSES, GRAPH_FIELDS, ORG_ID, PERSON_ID
from scripts.local_entity.graph import extract_entity_graph
from scripts.site.brand import load_brand, load_proof
from scripts.site.credential_registry import load_registry

ROOT = Path(__file__).resolve().parents[2]
SPECIALIST = ROOT / "especialista" / "tiago-jun-sasaki" / "index.html"


def test_real_specialist_graph_has_required_fields() -> None:
    html = SPECIALIST.read_text(encoding="utf-8")
    graph = extract_entity_graph(html)
    assert graph["has_organization"] is True
    assert graph["has_person"] is True
    assert graph["org_id"] == ORG_ID
    assert graph["person_id"] == PERSON_ID
    org = graph["organization"]
    person = graph["person"]
    assert org.get("email")
    assert org.get("telephone")
    assert org.get("taxID")
    assert org.get("areaServed")
    assert person.get("worksFor")
    assert person.get("knowsAbout")
    assert "LocalBusiness" not in graph["raw_types"]
    assert "PostalAddress" not in graph["raw_types"]
    assert "Review" not in graph["raw_types"]
    classified = classify_graph(graph, proof=load_proof(), brand=load_brand())
    fields = {c["field"] for c in classified["claims"]}
    for required in GRAPH_FIELDS:
        assert required in fields
    statuses = {c["status"] for c in classified["claims"]}
    assert statuses <= CLAIM_STATUSES
    assert classified["self_attested_not_upgraded"] is True
    assert classified["third_party_verified_count"] == 3
    assert classified["credential_registry_verified_count"] == 9
    assert classified["legacy_third_party_verified_count"] == 0
    assert classified["as_of"] == "2026-09-26"
    alumni = next(c for c in classified["claims"] if c["id"] == "person-credentials-alumni")
    assert alumni["status"] == "VERIFIED"
    assert alumni["as_of"] == "2026-09-26"
    title = next(c for c in classified["claims"] if c["id"] == "person-jobTitle")
    assert title["status"] == "VERIFIED"
    assert title["value"] == "Engenheiro Civil e Engenheiro de Segurança do Trabalho"
    assert title["as_of"] == "2026-09-26"
    crea = next(c for c in classified["claims"] if c["id"] == "person-credential-crea")
    assert crea["status"] == "VERIFIED"
    assert crea["value"] == "Registro profissional ativo no CREA"
    assert crea["as_of"] == "2026-09-26"
    has_credential = next(
        c for c in classified["claims"] if c["id"] == "person-hasCredential"
    )
    assert has_credential["status"] == "NOT_PUBLIC"
    same_as = [c for c in classified["claims"] if c["field"] == "sameAs"]
    assert same_as
    assert all(c["status"] == "UNKNOWN" for c in same_as)
    street = next(c for c in classified["claims"] if c["id"] == "org-streetAddress")
    assert street["status"] == "NOT_PUBLIC"
    assert street["value"] in (None, "")


def test_legacy_proof_self_attested_is_not_campaign_verified() -> None:
    proof = load_proof()
    assert proof["scope"] == "legacy_noncredential_claims"
    assert proof["canonical_credential_registry"] == "data/site/credential-registry.json"
    assert all(raw.get("id") != "proof-usp-civil" for raw in proof["claims"])
    for raw in proof["claims"]:
        mapped = remap_proof_status(raw)
        assert mapped in CLAIM_STATUSES
        if raw.get("source") == "perfil-publico-especialista":
            assert mapped == "SELF_DECLARED"
        if raw.get("verification_class") in {
            "self_attested_public",
            "operational_declared",
            "content_published",
            "data_backed_internal",
            "owner_declared",
        }:
            assert mapped != "VERIFIED"
        if raw.get("status") == "PRIVATE_ONLY":
            assert mapped == "NOT_PUBLIC"
        if raw.get("status") == "PENDING_EVIDENCE":
            assert mapped == "UNKNOWN"


def test_all_personal_credentials_are_verified_without_upgrading_track_record() -> None:
    registry = load_registry()
    credentials = [
        claim
        for claim in registry["claims"]
        if claim.get("entity") == "person" and claim.get("claim_category") == "credential"
    ]
    assert len(credentials) == 9
    assert {claim["status"] for claim in credentials} == {"VERIFIED"}
    assert all(claim.get("source_class") in FINAL_OFFICIAL_CREDENTIAL_SOURCES for claim in credentials)
    volume = next(
        claim for claim in registry["claims"] if claim["id"] == "person-analyzed-volume"
    )
    assert volume["claim_category"] == "operational_history"
    assert volume["status"] == "SELF_ATTESTED"


def test_credential_classification_fails_closed_for_stale_pending_or_empty_registry() -> None:
    html = SPECIALIST.read_text(encoding="utf-8")
    graph = extract_entity_graph(html)
    proof = load_proof()
    brand = load_brand()
    registry = load_registry()

    stale = copy.deepcopy(registry)
    mapped_ids = {
        "person-civil-eesc-usp",
        "person-titles-civil-sst",
        "person-crea-active",
    }
    for claim in stale["claims"]:
        if claim.get("id") in mapped_ids:
            claim["recheck_after"] = "2000-01-01"
    classified = classify_graph(
        graph,
        proof=proof,
        brand=brand,
        credential_registry=stale,
    )
    mapped = {
        claim["id"]: claim["status"]
        for claim in classified["claims"]
        if claim["id"]
        in {"person-credentials-alumni", "person-jobTitle", "person-credential-crea"}
    }
    assert set(mapped.values()) == {"UNKNOWN"}
    assert classified["credential_registry_verified_count"] == 6

    pending = copy.deepcopy(registry)
    title = next(c for c in pending["claims"] if c["id"] == "person-titles-civil-sst")
    title["source_class"] = "official_primary_pending"
    classified = classify_graph(
        graph,
        proof=proof,
        brand=brand,
        credential_registry=pending,
    )
    title_claim = next(c for c in classified["claims"] if c["id"] == "person-jobTitle")
    assert title_claim["status"] == "UNKNOWN"
    assert classified["credential_registry_verified_count"] == 8

    for invalid_recheck in ("invalid", None):
        invalid = copy.deepcopy(registry)
        title = next(
            c for c in invalid["claims"] if c["id"] == "person-titles-civil-sst"
        )
        if invalid_recheck is None:
            title.pop("recheck_after", None)
        else:
            title["recheck_after"] = invalid_recheck
        classified = classify_graph(
            graph,
            proof=proof,
            brand=brand,
            credential_registry=invalid,
        )
        title_claim = next(
            c for c in classified["claims"] if c["id"] == "person-jobTitle"
        )
        assert title_claim["status"] == "UNKNOWN"
        assert classified["credential_registry_verified_count"] == 8

    classified = classify_graph(
        graph,
        proof=proof,
        brand=brand,
        credential_registry={},
    )
    assert classified["credential_registry_verified_count"] == 0
    assert all(
        claim["status"] == "UNKNOWN"
        for claim in classified["claims"]
        if claim["id"]
        in {"person-credentials-alumni", "person-jobTitle", "person-credential-crea"}
    )


def test_third_party_flag_is_the_only_verified_upgrade() -> None:
    mapped = remap_proof_status(
        {
            "status": "VERIFIED",
            "verification_class": "third_party",
            "third_party_verified": True,
            "public_allowed": True,
        }
    )
    assert mapped == "VERIFIED"
    circular = remap_proof_status(
        {
            "status": "VERIFIED",
            "source": "perfil-publico-especialista",
            "verification_class": "self_attested_public",
            "public_allowed": True,
        }
    )
    assert circular == "SELF_DECLARED"
