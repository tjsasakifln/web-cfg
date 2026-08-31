"""Drive extract_entity_graph / classify_graph on the real specialist page and fixtures."""

from __future__ import annotations

from pathlib import Path

from scripts.local_entity.classify import classify_graph, remap_proof_status
from scripts.local_entity.constants import CLAIM_STATUSES, GRAPH_FIELDS, ORG_ID, PERSON_ID
from scripts.local_entity.graph import extract_entity_graph
from scripts.site.brand import load_brand, load_proof

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
    assert classified["third_party_verified_count"] == 0
    crea = next(c for c in classified["claims"] if c["id"] == "person-credential-crea")
    assert crea["status"] == "NOT_PUBLIC"
    same_as = [c for c in classified["claims"] if c["field"] == "sameAs"]
    assert same_as
    assert all(c["status"] == "UNKNOWN" for c in same_as)
    street = next(c for c in classified["claims"] if c["id"] == "org-streetAddress")
    assert street["status"] == "NOT_PUBLIC"
    assert street["value"] in (None, "")


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
            "data_backed_internal",
            "owner_declared",
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
