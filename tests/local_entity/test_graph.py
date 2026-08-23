"""Drive extract_entity_graph / classify_graph on the real specialist page and fixtures."""

from __future__ import annotations

import json
from pathlib import Path

from scripts.local_entity.classify import classify_graph, remap_proof_status
from scripts.local_entity.constants import CLAIM_STATUSES, GRAPH_FIELDS, ORG_ID, PERSON_ID
from scripts.local_entity.graph import extract_entity_graph
from scripts.local_entity.validate import validate_home_identity_contract
from scripts.site.brand import load_brand, load_proof

ROOT = Path(__file__).resolve().parents[2]
SPECIALIST = ROOT / "especialista" / "tiago-jun-sasaki" / "index.html"
HOME = ROOT / "index.html"
MACHINE_GRAPH = ROOT / "data" / "local-entity" / "entity-graph.json"
ENTITY_GRAPH_DOC = ROOT / "docs" / "seo" / "local-entity" / "ENTITY-GRAPH.md"


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
    assert classified["third_party_verified_count"] == 0
    crea = next(c for c in classified["claims"] if c["id"] == "person-credential-crea")
    assert crea["status"] == "NOT_PUBLIC"
    same_as = {c["id"]: c for c in classified["claims"] if c["field"] == "sameAs"}
    assert same_as["org-sameAs"]["status"] == "UNKNOWN"
    assert same_as["person-sameAs"]["status"] == "SELF_DECLARED"
    assert same_as["person-sameAs"]["third_party_verified"] is False
    street = next(c for c in classified["claims"] if c["id"] == "org-streetAddress")
    assert street["status"] == "NOT_PUBLIC"
    assert street["value"] in (None, "")


def test_home_identity_signals_match_machine_record_and_human_contract() -> None:
    """A public JSON-LD change must not leave the committed claim registry stale."""
    home_html = HOME.read_text(encoding="utf-8")
    home_graph = extract_entity_graph(home_html)
    assert validate_home_identity_contract(home_graph, home_html) == []

    machine = json.loads(MACHINE_GRAPH.read_text(encoding="utf-8"))
    assert machine["organization"]["address"] == home_graph["organization"]["address"]
    assert machine["person"]["sameAs"] == home_graph["person"]["sameAs"]
    claims = {claim["id"]: claim for claim in machine["claims"]}
    assert claims["org-addressCountry"]["value"] == home_graph["organization"]["address"]
    assert claims["org-addressCountry"]["status"] == "SELF_DECLARED"
    assert claims["org-addressCountry"]["third_party_verified"] is False
    assert claims["person-sameAs"]["value"] == home_graph["person"]["sameAs"]
    assert claims["person-sameAs"]["status"] == "SELF_DECLARED"
    assert claims["person-sameAs"]["third_party_verified"] is False
    assert claims["org-streetAddress"]["status"] == "NOT_PUBLIC"
    assert claims["org-streetAddress"]["value"] in (None, "")
    assert claims["person-credential-crea"]["status"] == "NOT_PUBLIC"
    assert claims["person-credential-crea"]["value"] is None
    assert claims["person-hasCredential"]["status"] == "NOT_PUBLIC"
    assert claims["person-hasCredential"]["value"] is None

    contract = ENTITY_GRAPH_DOC.read_text(encoding="utf-8")
    assert "| Person `sameAs` | SELF_DECLARED |" in contract
    assert "| Organization `addressCountry` | SELF_DECLARED |" in contract


def test_proof_json_verified_self_attested_is_not_campaign_verified() -> None:
    proof = load_proof()
    for raw in proof["claims"]:
        mapped = remap_proof_status(raw)
        assert mapped in CLAIM_STATUSES
        if raw.get("source") == "perfil-publico-especialista":
            assert mapped == "SELF_DECLARED"
        if raw.get("verification_class") in {
            "self_attested_public",
            "operational_declared",
            "content_published",
        }:
            assert mapped != "VERIFIED"
        if raw.get("status") == "PRIVATE_ONLY":
            assert mapped == "NOT_PUBLIC"
        if raw.get("status") == "PENDING_EVIDENCE":
            assert mapped == "UNKNOWN"


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
