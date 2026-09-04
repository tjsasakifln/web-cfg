"""Fail-closed tests for the shipped credential registry projection.

Drives scripts.site.credential_registry (load, project, revoke, expire,
apply_to_html) and the live owned pages. A passing test must fail when the
shipped function would publish a withheld, expired, revoked, unknown or
forbidden claim.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.authority import check_credentials_against_proof  # noqa: E402
from scripts.site.credential_registry import (  # noqa: E402
    OWNED_SURFACES,
    apply_to_html,
    client_proof_approved_count,
    expire_claim,
    extract_jsonld_nodes,
    is_projectable,
    jsonld_blob,
    load_registry,
    project,
    projection_defects,
    revoke_claim,
    set_claim_status,
    validate_registry,
    visible_text_of,
)
from scripts.site.structured_identity import audit_html, sanitize_html  # noqa: E402


CONFIANCA = ROOT / "confianca" / "index.html"
ESPECIALISTA = ROOT / "especialista" / "tiago-jun-sasaki" / "index.html"


def _surface_html() -> dict[str, str]:
    return {
        "/confianca/": CONFIANCA.read_text(encoding="utf-8"),
        "/especialista/tiago-jun-sasaki/": ESPECIALISTA.read_text(encoding="utf-8"),
    }


def test_registry_is_valid_and_every_claim_has_source_status():
    registry = load_registry()
    errors = validate_registry(registry)
    assert errors == [], errors
    for claim in registry["claims"]:
        assert claim["status"] in {
            "VERIFIED",
            "SELF_ATTESTED",
            "WITHHELD",
            "EXPIRED",
            "UNKNOWN",
        }
        assert claim.get("source_class")
        assert claim.get("source_reference")
        assert claim.get("as_of")
        assert claim.get("owner")
        assert "rollback" in claim


def test_verified_cnpj_projects_to_visible_and_schema_together():
    registry = load_registry()
    for surface in OWNED_SURFACES:
        proj = project(registry, surface)
        assert "org-cnpj" in proj.claim_ids
        assert "52.407.089/0001-09" in proj.visible_text
        assert proj.schema_org.get("taxID") == "52.407.089/0001-09"
        assert proj.schema_org.get("legalName") == "Confenge Serviços de Desenhos Técnicos Ltda"
        assert projection_defects(proj) == []


def test_withheld_unknown_expired_revoked_do_not_project():
    registry = load_registry()
    withheld_ids = [
        "org-crea-pj",
        "person-crea-sc",
        "person-rnp",
        "person-titles-civil-sst",
        "person-sst-engineer",
        "person-cptec-registration",
        "person-cptec-work-count",
        "person-postgrad-valuations",
        "person-active-tjsc-matters",
    ]
    for surface in OWNED_SURFACES:
        proj = project(registry, surface)
        for cid in withheld_ids:
            assert cid not in proj.claim_ids
        blob = proj.visible_text + json.dumps(proj.schema_nodes, ensure_ascii=False)
        assert "CREA" not in blob
        assert "166954-1" not in blob
        assert "205402-8" not in blob
        assert "2613212632" not in blob
        assert "CPTEC" not in blob
        assert "6 trabalhos" not in blob
        assert "perito do TJSC" not in blob.lower()

    unknown = set_claim_status(copy.deepcopy(registry), "org-cnpj", "UNKNOWN")
    expired = expire_claim(copy.deepcopy(registry), "org-cnpj", as_of="2020-01-01")
    revoked = revoke_claim(copy.deepcopy(registry), "org-cnpj")
    for mutated, label in ((unknown, "UNKNOWN"), (expired, "EXPIRED"), (revoked, "revoked")):
        for surface in OWNED_SURFACES:
            proj = project(mutated, surface)
            assert "org-cnpj" not in proj.claim_ids, label
            assert "52.407.089/0001-09" not in proj.visible_text, label
            assert proj.schema_org.get("taxID") != "52.407.089/0001-09", label


def test_revocation_removes_claim_from_every_owned_html_and_jsonld():
    registry = load_registry()
    pages = _surface_html()
    revoked = revoke_claim(registry, "org-legal-name")
    for surface, html in pages.items():
        before = apply_to_html(html, project(registry, surface))
        after = apply_to_html(html, project(revoked, surface))
        assert "Confenge Serviços de Desenhos Técnicos Ltda" in visible_text_of(before)
        before_org = next(
            n
            for n in extract_jsonld_nodes(before)
            if "Organization" in (n.get("@type") if isinstance(n.get("@type"), list) else [n.get("@type")])
        )
        assert before_org.get("legalName") == "Confenge Serviços de Desenhos Técnicos Ltda"
        assert "Confenge Serviços de Desenhos Técnicos Ltda" not in visible_text_of(after)
        org = next(
            n
            for n in extract_jsonld_nodes(after)
            if "Organization" in (n.get("@type") if isinstance(n.get("@type"), list) else [n.get("@type")])
        )
        assert "legalName" not in org


def test_expired_claim_fails_closed_even_if_wording_remains_in_record():
    registry = load_registry()
    expired = expire_claim(copy.deepcopy(registry), "org-cadastral-address", as_of="2020-01-01")
    claim = next(c for c in expired["claims"] if c["id"] == "org-cadastral-address")
    assert claim["allowed_wording"]
    assert not is_projectable(claim, now="2026-09-04")
    for surface in OWNED_SURFACES:
        proj = project(expired, surface)
        assert "org-cadastral-address" not in proj.claim_ids
        assert "address" not in proj.schema_org
        assert "88015-100" not in proj.visible_text


def test_registry_backed_crea_has_visible_schema_parity_and_unbacked_crea_fails():
    registry = load_registry()
    live = CONFIANCA.read_text(encoding="utf-8")
    assert "CREA" not in live or not is_projectable(
        next(c for c in registry["claims"] if c["id"] == "org-crea-pj")
    )
    errors = check_credentials_against_proof(
        '<ul class="profile-list"><li>CREA nº 999999-D</li></ul>'
    )
    assert any("CREA" in e or "credential" in e for e in errors)

    verified = set_claim_status(
        copy.deepcopy(registry),
        "org-crea-pj",
        "VERIFIED",
        revoked=False,
        withheld_reason=None,
    )
    proj = project(verified, "/confianca/")
    assert "org-crea-pj" in proj.claim_ids
    assert "CREA-SC PJ 205402-8" in proj.visible_text
    cred = proj.schema_org.get("hasCredential") or {}
    if isinstance(cred, list):
        cred = cred[0]
    assert cred.get("identifier") == "205402-8" or cred.get("name") == "CREA-SC PJ 205402-8"
    rendered = apply_to_html(live, proj)
    assert "CREA-SC PJ 205402-8" in visible_text_of(rendered)
    assert "205402-8" in jsonld_blob(rendered)


def test_cptec_registration_is_not_court_appointment():
    registry = load_registry()
    verified = set_claim_status(
        copy.deepcopy(registry),
        "person-cptec-registration",
        "VERIFIED",
        revoked=False,
        withheld_reason=None,
        never_project=False,
    )
    proj = project(verified, "/especialista/tiago-jun-sasaki/")
    assert "person-cptec-registration" in proj.claim_ids
    text = proj.visible_text.lower()
    assert "cadastrado no cptec/tjsc" in text
    assert "perito do tjsc" not in text
    assert "perito oficial" not in text
    assert "nomeado pelo tribunal" not in text
    poisoned = copy.deepcopy(verified)
    for claim in poisoned["claims"]:
        if claim["id"] == "person-cptec-registration":
            claim["allowed_wording"] = ["perito do TJSC"]
    try:
        project(poisoned, "/especialista/tiago-jun-sasaki/")
    except ValueError as exc:
        assert "forbidden_copy" in str(exc)
    else:
        raise AssertionError("appointment wording must fail closed")


def test_cadastral_address_is_not_storefront():
    registry = load_registry()
    proj = project(registry, "/confianca/")
    text = proj.visible_text.lower()
    assert "endereço cadastral e fiscal" in text
    assert "atendimento online ou no local do cliente" in text
    assert "escritório aberto ao público" not in text
    address = proj.schema_org.get("address") or {}
    assert address.get("streetAddress") == "Avenida Prefeito Osmar Cunha, 416, sala 1108"
    assert "openingHours" not in address
    poisoned = copy.deepcopy(registry)
    for claim in poisoned["claims"]:
        if claim["id"] == "org-cadastral-address":
            claim["allowed_wording"] = ["escritório aberto ao público na Avenida Prefeito Osmar Cunha"]
    try:
        project(poisoned, "/confianca/")
    except ValueError as exc:
        assert "forbidden_copy" in str(exc) or "storefront" in str(exc)
    else:
        raise AssertionError("storefront wording must fail closed")


def test_active_cases_never_render():
    registry = load_registry()
    claim = next(c for c in registry["claims"] if c["id"] == "person-active-tjsc-matters")
    assert claim.get("never_project") is True
    forced = set_claim_status(
        copy.deepcopy(registry),
        "person-active-tjsc-matters",
        "VERIFIED",
        revoked=False,
        never_project=True,
        allowed_wording=["processo nº 0000000-00.2026.8.24.0000"],
        projection_surfaces=["/confianca/", "/especialista/tiago-jun-sasaki/"],
    )
    for surface in OWNED_SURFACES:
        proj = project(forced, surface)
        assert "person-active-tjsc-matters" not in proj.claim_ids
        blob = proj.visible_text + json.dumps(proj.schema_nodes, ensure_ascii=False)
        assert "0000000-00.2026.8.24.0000" not in blob
        assert "processo nº" not in blob.lower()


def test_client_proof_remains_zero():
    assert client_proof_approved_count() == 0
    registry = json.loads(
        (ROOT / "data" / "site" / "permissioned-proof-registry.json").read_text(encoding="utf-8")
    )
    assert registry["approved_public_proof_count"] == 0
    assert registry["records"] == []
    for html in _surface_html().values():
        low = html.lower()
        assert "caso de sucesso" not in low
        assert "depoimento de cliente" not in low
        assert '"review"' not in low
        assert '"aggregaterating"' not in low


def test_forbidden_copy_rejected_on_projection():
    registry = load_registry()
    for phrase in (
        "perito oficial",
        "homologado pelo Tribunal",
        "selo de ART",
        "visite nosso escritório",
    ):
        poisoned = copy.deepcopy(registry)
        for claim in poisoned["claims"]:
            if claim["id"] == "service-art-nf":
                claim["allowed_wording"] = [phrase]
        try:
            project(poisoned, "/confianca/")
        except ValueError as exc:
            assert "forbidden_copy" in str(exc) or "storefront" in str(exc)
        else:
            raise AssertionError(f"forbidden phrase leaked: {phrase}")


def test_owned_pages_match_projection_and_sanitizer_keeps_registry_fields():
    registry = load_registry()
    mapping = {
        "/confianca/": CONFIANCA,
        "/especialista/tiago-jun-sasaki/": ESPECIALISTA,
    }
    for surface, path in mapping.items():
        html = path.read_text(encoding="utf-8")
        proj = project(registry, surface)
        assert "credential-registry:start" in html
        assert proj.visible_html in html
        nodes = extract_jsonld_nodes(html)
        org = next(n for n in nodes if "Organization" in (n.get("@type") if isinstance(n.get("@type"), list) else [n.get("@type")]))
        assert org.get("legalName") == "Confenge Serviços de Desenhos Técnicos Ltda"
        assert org.get("taxID") == "52.407.089/0001-09"
        person = next(n for n in nodes if "Person" in (n.get("@type") if isinstance(n.get("@type"), list) else [n.get("@type")]))
        assert person.get("jobTitle") == "Engenheiro Civil"
        assert "https://github.com/tjsasakifln" in json.dumps(person.get("sameAs") or [])
        service = next(
            n
            for n in nodes
            if "ProfessionalService" in (n.get("@type") if isinstance(n.get("@type"), list) else [n.get("@type")])
        )
        assert "ART e NF" in (service.get("description") or "")
        sanitized, _removed = sanitize_html(html, relative_path=path.relative_to(ROOT).as_posix())
        assert audit_html(sanitized, relative_path=path.relative_to(ROOT).as_posix()) == []
        assert '"legalName":"Confenge Serviços de Desenhos Técnicos Ltda"' in sanitized
        assert '"taxID":"52.407.089/0001-09"' in sanitized
        assert "CREA" not in sanitized
        assert check_credentials_against_proof(html) == []


def test_unbacked_identity_fields_still_stripped_off_owned_surfaces():
    html = (
        '<link rel="canonical" href="https://confenge.com.br/bid-room-licitacoes-obras/"/>'
        '<script type="application/ld+json">'
        '{"@type":"Organization","name":"CONFENGE","legalName":"unsupported","taxID":"00.000.000/0000-00"}'
        "</script>"
    )
    sanitized, removed = sanitize_html(html)
    assert removed >= 2
    assert "legalName" not in sanitized
    assert "taxID" not in sanitized


if __name__ == "__main__":
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print("OK", test.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", test.__name__, exc)
    raise SystemExit(1 if failed else 0)
