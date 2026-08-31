"""Classify entity-graph claims with campaign statuses.

proof.json VERIFIED + self-attested source is remapped to SELF_DECLARED.
Campaign VERIFIED is reserved for independent third-party evidence in-repo.
"""

from __future__ import annotations

from typing import Any

from scripts.local_entity.constants import (
    ALLOWED_PUBLIC_CNPJ,
    ALLOWED_PUBLIC_EMAILS,
    ALLOWED_PUBLIC_PHONES,
    CAMPAIGN_AS_OF,
    CLAIM_STATUSES,
    GRAPH_FIELDS,
    ORG_ID,
    PERSON_ID,
    PROOF_LIMITATION,
    SELF_ATTESTED_PROOF_CLASSES,
    SELF_ATTESTED_PROOF_SOURCES,
    SITE,
    SPECIALIST_PATH,
)
from scripts.local_entity.graph import extract_entity_graph, graph_field_snapshot


def remap_proof_status(claim: dict[str, Any]) -> str:
    """Map a proof.json record onto campaign statuses without upgrading self-attestation."""
    status = str(claim.get("status") or "")
    source = str(claim.get("source") or "")
    klass = str(claim.get("verification_class") or "")
    if status == "PRIVATE_ONLY" or claim.get("public_allowed") is False:
        if status == "PENDING_EVIDENCE":
            return "UNKNOWN"
        return "NOT_PUBLIC"
    if status == "PENDING_EVIDENCE":
        return "UNKNOWN"
    if claim.get("third_party_verified") is True or klass == "third_party":
        return "VERIFIED"
    if klass in SELF_ATTESTED_PROOF_CLASSES or source in SELF_ATTESTED_PROOF_SOURCES:
        return "SELF_DECLARED"
    if status == "VERIFIED":
        return "SELF_DECLARED"
    return "UNKNOWN"


def _claim(
    *,
    cid: str,
    entity: str,
    field: str,
    value: Any,
    status: str,
    basis: str,
    notes: str,
) -> dict[str, Any]:
    if status not in CLAIM_STATUSES:
        raise ValueError(f"invalid_claim_status:{status}")
    return {
        "id": cid,
        "entity": entity,
        "field": field,
        "value": value,
        "status": status,
        "basis": basis,
        "third_party_verified": status == "VERIFIED",
        "notes": notes,
        "as_of": CAMPAIGN_AS_OF,
    }


def classify_graph(
    graph: dict[str, Any],
    *,
    proof: dict[str, Any] | None = None,
    brand: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Classify @id, credentials, worksFor, knowsAbout, sameAs, contact, areaServed."""
    snap = graph_field_snapshot(graph)
    proof = proof or {}
    brand = brand or {}
    contact = (brand.get("contact") or {}) if isinstance(brand, dict) else {}
    claims: list[dict[str, Any]] = []

    org_id = snap.get("organization_id")
    claims.append(
        _claim(
            cid="org-id",
            entity="Organization",
            field="@id",
            value=org_id,
            status="SELF_DECLARED" if org_id == ORG_ID else "UNKNOWN",
            basis="committed_specialist_jsonld",
            notes="Canonical Organization @id published on owned HTML. Not a third-party registry ID.",
        )
    )
    person_id = snap.get("person_id")
    claims.append(
        _claim(
            cid="person-id",
            entity="Person",
            field="@id",
            value=person_id,
            status="SELF_DECLARED" if person_id == PERSON_ID else "UNKNOWN",
            basis="committed_specialist_jsonld",
            notes="Canonical Person @id published on owned HTML. Not a third-party Person ID.",
        )
    )

    alumni = snap.get("alumniOf")
    alumni_name = ""
    if isinstance(alumni, dict):
        alumni_name = str(alumni.get("name") or "")
    elif isinstance(alumni, str):
        alumni_name = alumni
    claims.append(
        _claim(
            cid="person-credentials-alumni",
            entity="Person",
            field="credentials",
            value=alumni_name or None,
            status="SELF_DECLARED" if alumni_name else "UNKNOWN",
            basis="proof.json self_attested_public + specialist JSON-LD alumniOf",
            notes=(
                "Engenharia Civil / EESC-USP is published owned copy. "
                "proof.json VERIFIED + perfil-publico-especialista is remapped to SELF_DECLARED. "
                "No diploma, CREA number, or third-party badge is in-repo."
            ),
        )
    )
    job = snap.get("jobTitle")
    claims.append(
        _claim(
            cid="person-jobTitle",
            entity="Person",
            field="credentials",
            value=job,
            status="SELF_DECLARED" if job else "UNKNOWN",
            basis="specialist JSON-LD jobTitle + brand.json person.jobTitle",
            notes="Job title is institutional copy, not a licensed credential record.",
        )
    )
    claims.append(
        _claim(
            cid="person-credential-crea",
            entity="Person",
            field="credentials",
            value=None,
            status="NOT_PUBLIC",
            basis="absent_from_public_proof",
            notes="CREA number, badge, rating and years-of-experience figures are not public proof records. Do not invent.",
        )
    )
    claims.append(
        _claim(
            cid="person-hasCredential",
            entity="Person",
            field="credentials",
            value=snap.get("hasCredential"),
            status="NOT_PUBLIC" if not snap.get("hasCredential") else "UNKNOWN",
            basis="absent_jsonld",
            notes="No schema.org hasCredential node is published. Inventing one is a defect.",
        )
    )

    works = snap.get("worksFor")
    works_id = None
    if isinstance(works, dict):
        works_id = works.get("@id")
    elif isinstance(works, str):
        works_id = works
    claims.append(
        _claim(
            cid="person-worksFor",
            entity="Person",
            field="worksFor",
            value=works_id,
            status="SELF_DECLARED" if works_id == ORG_ID else "UNKNOWN",
            basis="specialist JSON-LD worksFor",
            notes="Person worksFor the owned Organization @id. Founder relationship is self-declared on owned pages.",
        )
    )

    knows = snap.get("knowsAbout")
    if not isinstance(knows, list):
        knows = []
    claims.append(
        _claim(
            cid="person-knowsAbout",
            entity="Person",
            field="knowsAbout",
            value=knows,
            status="SELF_DECLARED" if knows else "UNKNOWN",
            basis="specialist JSON-LD knowsAbout",
            notes="Topic list repeats published technical library subjects. Not a third-party expertise certification.",
        )
    )

    claims.append(
        _claim(
            cid="org-sameAs",
            entity="Organization",
            field="sameAs",
            value=snap.get("sameAs_org"),
            status="UNKNOWN",
            basis="absent_jsonld",
            notes="No public sameAs profiles are classified in-repo. Do not invent LinkedIn, CREA directory, or social URLs.",
        )
    )
    claims.append(
        _claim(
            cid="person-sameAs",
            entity="Person",
            field="sameAs",
            value=snap.get("sameAs_person"),
            status="UNKNOWN",
            basis="absent_jsonld",
            notes="No public Person sameAs profiles are classified. Do not invent.",
        )
    )

    email = snap.get("email") or contact.get("email")
    phone = snap.get("telephone") or contact.get("phone_e164")
    tax = snap.get("taxID") or contact.get("cnpj")
    email_ok = str(email or "").lower() in ALLOWED_PUBLIC_EMAILS
    phone_ok = str(phone or "") in ALLOWED_PUBLIC_PHONES
    tax_ok = str(tax or "") in ALLOWED_PUBLIC_CNPJ
    claims.append(
        _claim(
            cid="org-contact-email",
            entity="Organization",
            field="contact",
            value=email if email_ok else email,
            status="SELF_DECLARED" if email_ok else "UNKNOWN",
            basis="specialist JSON-LD + data/site/brand.json contact",
            notes="Public commercial email already on the specialist page. Extra personal mailboxes are NOT_PUBLIC.",
        )
    )
    claims.append(
        _claim(
            cid="org-contact-telephone",
            entity="Organization",
            field="contact",
            value=phone if phone_ok else phone,
            status="SELF_DECLARED" if phone_ok else "UNKNOWN",
            basis="specialist JSON-LD + data/site/brand.json contact",
            notes="Public commercial phone (DDD 48) already on the specialist page. DDD is contact, not a storefront or city areaServed.",
        )
    )
    claims.append(
        _claim(
            cid="org-contact-taxID",
            entity="Organization",
            field="contact",
            value=tax if tax_ok else tax,
            status="SELF_DECLARED" if tax_ok else "UNKNOWN",
            basis="specialist JSON-LD + footer CNPJ + brand.json",
            notes="CNPJ is published owned copy. No Receita Federal lookup is committed in this campaign.",
        )
    )
    claims.append(
        _claim(
            cid="person-extra-email",
            entity="Person",
            field="contact",
            value=None,
            status="NOT_PUBLIC",
            basis="not_a_public_contact",
            notes="Personal mailboxes beyond tiago.sasaki@confenge.com.br must not appear in local-entity outputs.",
        )
    )

    area = snap.get("areaServed")
    national = False
    if isinstance(area, dict) and (
        str(area.get("name") or "").lower() in {"brasil", "brazil", "br"}
        or str(area.get("@type") or "") == "Country"
    ):
        national = True
    if isinstance(area, str) and area in {"BR", "Brasil", "Brazil"}:
        national = True
    claims.append(
        _claim(
            cid="org-areaServed",
            entity="Organization",
            field="areaServed",
            value=area,
            status="SELF_DECLARED" if national else "UNKNOWN",
            basis="specialist JSON-LD areaServed Country Brasil + visible atendimento nacional",
            notes="National service-area is self-declared. No city AdministrativeArea is published. Do not invent a city as areaServed.",
        )
    )
    claims.append(
        _claim(
            cid="org-areaServed-city",
            entity="Organization",
            field="areaServed",
            value=None,
            status="UNKNOWN",
            basis="absent_city_claim",
            notes="No city-level areaServed is published. DDD 48 is a phone prefix, not a verified local service area.",
        )
    )
    claims.append(
        _claim(
            cid="org-streetAddress",
            entity="Organization",
            field="contact",
            value=snap.get("streetAddress"),
            status="NOT_PUBLIC",
            basis="no_public_street_address",
            notes="No public street NAP is published. Inventing PostalAddress / LocalBusiness is a defect.",
        )
    )
    claims.append(
        _claim(
            cid="person-residential-nap",
            entity="Person",
            field="contact",
            value=None,
            status="NOT_PUBLIC",
            basis="pii",
            notes="Person residential NAP is NOT_PUBLIC and must not be serialized as a value.",
        )
    )

    for raw in proof.get("claims") or []:
        mapped = remap_proof_status(raw)
        claims.append(
            _claim(
                cid=f"proof:{raw.get('id')}",
                entity="ProofRecord",
                field="credentials" if raw.get("public_allowed") else "restricted",
                value=raw.get("claim"),
                status=mapped,
                basis=f"proof.json source={raw.get('source')} verification_class={raw.get('verification_class')}",
                notes=str(raw.get("notes") or "") + " " + PROOF_LIMITATION,
            )
        )

    statuses = sorted({c["status"] for c in claims})
    unknown_status = [c["id"] for c in claims if c["status"] not in CLAIM_STATUSES]
    if unknown_status:
        raise ValueError(f"claim_status_not_in_enum:{unknown_status}")

    covered = {c["field"] for c in claims if c["field"] in GRAPH_FIELDS or c["field"] == "restricted"}
    third_party_verified_count = sum(1 for c in claims if c["status"] == "VERIFIED")
    return {
        "as_of": CAMPAIGN_AS_OF,
        "proof_limitation": PROOF_LIMITATION,
        "canonical_ids": {"organization": org_id, "person": person_id},
        "specialist_url": f"{SITE}{SPECIALIST_PATH}",
        "claims": claims,
        "claim_statuses": statuses,
        "graph_fields_present": sorted(covered),
        "third_party_verified_count": third_party_verified_count,
        # Derivado, nao afirmado. Enquanto isto era o literal True, o relatorio
        # da campanha diria "nada foi promovido" mesmo que um registro tivesse
        # sido promovido: a frase mais importante do pacote de honestidade era
        # a unica que nao media nada.
        "self_attested_not_upgraded": third_party_verified_count == 0,
    }


def extract_and_classify(
    html: str,
    *,
    proof: dict[str, Any] | None = None,
    brand: dict[str, Any] | None = None,
) -> dict[str, Any]:
    graph = extract_entity_graph(html)
    classified = classify_graph(graph, proof=proof, brand=brand)
    return {"graph": graph, "classified": classified}
