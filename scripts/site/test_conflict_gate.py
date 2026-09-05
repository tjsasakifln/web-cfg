"""Fail-closed tests for the shipped multivertical conflict gate (#585).

Drives scripts.site.conflict_gate from real start state. No second oracle.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.conflict_gate import (  # noqa: E402
    apply_protected_path_adapter,
    check_contract_seal,
    contract_hash,
    evaluate_conflict,
    interpreter_source,
    load_contract,
    public_projection,
    sanitize_facts,
    scan_public_leaks,
    screen_conflict,
    screening_receipt,
)

FIXTURE_PATH = ROOT / "scripts/site/fixtures/conflict-gate/eight-cases.v1.json"
CONFLITOS = ROOT / "conflitos" / "index.html"


def _fixtures() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_contract_seal_and_finite_reason_classes():
    rec = load_contract()
    errors = check_contract_seal(rec)
    assert not errors, errors
    assert rec["content_sha256"] == contract_hash(rec)
    ids = [item["id"] for item in rec["reason_classes"]]
    assert len(ids) == len(set(ids))
    assert set(rec["statuses"]) == {
        "CLEAR",
        "CLEAR_WITH_DISCLOSURE",
        "REVIEW_REQUIRED",
        "DECLINE",
        "UNKNOWN",
    }
    nucleus_ids = {item["id"] for item in rec["nuclei"]}
    assert nucleus_ids == {
        "expert_evidence_assistance",
        "property_valuation",
        "building_engineering_documentation",
        "occupational_safety",
        "public_works_b2g",
    }


def test_eight_named_cases_drive_shipped_screen():
    rec = load_contract()
    for case in _fixtures()["cases"]:
        decision = screen_conflict(case["facts"], rec)
        assert decision["status"] == case["expect_status"], case["id"]
        assert decision["reason_class"] == case["expect_reason_class"], case["id"]
        if case.get("expect_prior_invalidated"):
            assert decision["prior_clearance_invalidated"] is True
        public = public_projection(decision, rec)
        assert public["status"] == case["expect_status"]
        leaks = scan_public_leaks(public, case["facts"])
        assert not leaks, (case["id"], leaks)
        assert "reason_class" not in public
        assert case["expect_status"] in public["next_step"] or public["status"] == case["expect_status"]


def test_unknown_never_clear_and_missing_nucleus():
    rec = load_contract()
    decision = screen_conflict(
        {
            "nucleus_id": "expert_evidence_assistance",
            "intended_role": "consultant",
            "information_sufficient": False,
            "protected_path_available": True,
        },
        rec,
    )
    assert decision["status"] == "UNKNOWN"
    assert decision["status"] != "CLEAR"
    empty = screen_conflict({}, rec)
    assert empty["status"] == "UNKNOWN"
    bogus = screen_conflict(
        {
            "nucleus_id": "invented_nucleus",
            "intended_role": "consultant",
            "information_sufficient": True,
            "same_public_duty_matter": False,
            "nonpublic_office_information_risk": False,
            "incompatible_expert_roles": False,
            "relevant_personal_or_financial_relation": False,
            "distinct_matter_no_signal": True,
            "protected_path_available": True,
        },
        rec,
    )
    assert bogus["status"] == "UNKNOWN"


def test_protected_path_down_and_rollback_never_clear():
    rec = load_contract()
    clear_facts = None
    for case in _fixtures()["cases"]:
        if case["id"] == "distinct_matter_no_signal":
            clear_facts = dict(case["facts"])
            break
    assert clear_facts is not None
    inner = screen_conflict(clear_facts, rec)
    assert inner["status"] == "CLEAR"
    down = dict(clear_facts)
    down["protected_path_available"] = False
    adapted = apply_protected_path_adapter(inner, down, rec)
    assert adapted["status"] == "REVIEW_REQUIRED"
    assert adapted["status"] != "CLEAR"
    assert adapted["corpus_suspended"] is True
    public = public_projection(adapted, rec)
    assert public["status"] == "REVIEW_REQUIRED"
    assert public["corpus_suspended"] is True
    pack = evaluate_conflict(down, rec)
    assert pack["public"]["status"] != "CLEAR"
    rolled = dict(clear_facts)
    rolled["rollback"] = True
    rolled["protected_path_available"] = True
    rolled_decision = evaluate_conflict(rolled, rec)
    assert rolled_decision["public"]["status"] == "REVIEW_REQUIRED"
    assert rolled_decision["decision"]["reason_class"] == "rollback_fail_closed"


def test_divergent_version_hash_fail_closed_never_fallback():
    rec = load_contract()
    facts = {
        "nucleus_id": "property_valuation",
        "intended_role": "valuer",
        "information_sufficient": True,
        "same_public_duty_matter": False,
        "nonpublic_office_information_risk": False,
        "incompatible_expert_roles": False,
        "relevant_personal_or_financial_relation": False,
        "client_requests_public_influence": False,
        "distinct_matter_no_signal": True,
        "protected_path_available": True,
        "contract_hash": "0" * 64,
    }
    decision = screen_conflict(facts, rec)
    assert decision["status"] == "UNKNOWN"
    assert decision["reason_class"] == "contract_pin_mismatch"
    tax = dict(facts)
    tax.pop("contract_hash")
    tax["taxonomy_version"] = "CONFENGE_CORPORATE_TAXONOMY/9.9.9"
    pinned = screen_conflict(tax, rec)
    assert pinned["status"] == "UNKNOWN"
    assert pinned["reason_class"] == "contract_pin_mismatch"
    matching = dict(facts)
    matching.pop("contract_hash")
    matching["taxonomy_version"] = rec["consumer_pins"]["taxonomy"]
    ok = screen_conflict(matching, rec)
    assert ok["status"] == "CLEAR"


def test_idempotent_replay_same_status_and_readback():
    rec = load_contract()
    facts = None
    for case in _fixtures()["cases"]:
        if case["id"] == "same_contract_public_fiscal":
            facts = case["facts"]
            break
    first = evaluate_conflict(facts, rec)
    second = evaluate_conflict(facts, rec)
    assert first["public"]["status"] == second["public"]["status"] == "DECLINE"
    assert first["public"]["next_step"] == second["public"]["next_step"]
    assert first["public"]["public_readback"] == second["public"]["public_readback"]
    assert first["decision"]["receipt"] == second["decision"]["receipt"]
    assert screening_receipt(sanitize_facts(facts, rec)) == first["decision"]["receipt"]


def test_unmitigable_relation_declines():
    rec = load_contract()
    decision = screen_conflict(
        {
            "nucleus_id": "occupational_safety",
            "intended_role": "consultant",
            "information_sufficient": True,
            "same_public_duty_matter": False,
            "nonpublic_office_information_risk": False,
            "incompatible_expert_roles": False,
            "relevant_personal_or_financial_relation": True,
            "relation_cannot_be_mitigated": True,
            "mitigation_requires_disclosure": False,
            "distinct_matter_no_signal": False,
            "protected_path_available": True,
        },
        rec,
    )
    assert decision["status"] == "DECLINE"
    assert decision["reason_class"] == "unmitigable_personal_or_financial_relation"


def test_one_hundred_screenings_reuse_reason_classes_without_party_leak():
    rec = load_contract()
    allowed = {item["id"] for item in rec["reason_classes"]}
    seen: set[str] = set()
    for i in range(100):
        facts = {
            "nucleus_id": rec["nuclei"][i % 5]["id"],
            "intended_role": rec["intended_roles"][i % 5]["id"],
            "information_sufficient": True,
            "same_public_duty_matter": i % 17 == 0,
            "nonpublic_office_information_risk": i % 19 == 0,
            "incompatible_expert_roles": i % 23 == 0,
            "relevant_personal_or_financial_relation": i % 11 == 0,
            "relation_cannot_be_mitigated": i % 29 == 0,
            "mitigation_requires_disclosure": i % 13 == 0,
            "client_requests_public_influence": False,
            "distinct_matter_no_signal": i % 7 == 0,
            "protected_path_available": i % 3 != 0,
            "party_name": f"Parte Sintetica {i}",
            "process_id": f"PROC-{i:05d}",
            "orgao": f"Orgao {i}",
            "employee_name": f"Empregado {i}",
            "lawyer_name": f"Advogado {i}",
            "expert_name": f"Perito {i}",
        }
        pack = evaluate_conflict(facts, rec)
        seen.add(pack["decision"]["reason_class"])
        assert pack["decision"]["reason_class"] in allowed
        assert pack["public"]["status"] in rec["statuses"]
        if not facts["protected_path_available"]:
            assert pack["public"]["status"] != "CLEAR"
            assert pack["public"]["status"] != "CLEAR_WITH_DISCLOSURE"
        leaks = scan_public_leaks(pack["public"], facts)
        assert not leaks, (i, leaks)
        blob = json.dumps(pack["public"], ensure_ascii=False)
        assert f"Parte Sintetica {i}" not in blob
        assert f"PROC-{i:05d}" not in blob
    assert seen <= allowed
    assert len(seen) >= 4
    assert "same_public_duty_matter" in seen


def test_js_interpreter_matches_python_status_on_eight_cases():
    rec = load_contract()
    cases = _fixtures()["cases"]
    script = (
        interpreter_source(rec)
        + "\nconst cases = "
        + json.dumps(cases, ensure_ascii=False)
        + """;
const out = cases.map(function (c) {
  const inner = confengeScreenConflict(c.facts);
  const adapted = confengeAdaptProtectedPath(inner, c.facts);
  const pub = confengePublicProjection(adapted);
  return {id: c.id, inner: inner.status, inner_reason: inner.reason_class, adapted: adapted.status, public: pub.status, leaked_reason: Object.prototype.hasOwnProperty.call(pub, "reason_class")};
});
process.stdout.write(JSON.stringify(out));
"""
    )
    proc = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    rows = json.loads(proc.stdout)
    assert len(rows) == 8
    for row, case in zip(rows, cases):
        py = screen_conflict(case["facts"], rec)
        assert row["inner"] == py["status"] == case["expect_status"], row
        assert row["inner_reason"] == py["reason_class"]
        assert row["leaked_reason"] is False


def test_rendered_conflitos_covers_nuclei_min_data_and_fail_closed_copy():
    html = CONFLITOS.read_text(encoding="utf-8")
    lower = html.lower()
    assert "perícia" in lower or "pericias" in lower or "perícias" in lower
    assert "avaliação" in lower or "avaliacoes" in lower or "avaliações" in lower
    assert "sst" in lower or "segurança do trabalho" in lower
    assert "cliente privado" in lower
    assert "cargo público" in lower or "cargo publico" in lower
    assert "independência" in lower or "independencia" in lower
    assert "não é um parecer jurídico geral" in lower or "nao e um parecer juridico geral" in lower
    assert "revisão humana" in lower or "revisao humana" in lower
    assert "informação insuficiente" in lower or "informacao insuficiente" in lower
    assert 'data-conflict-gate-fallback="REVIEW_REQUIRED"' in html
    assert 'type="file"' not in lower
    assert "type='file'" not in lower
    assert 'id="conflict-gate-form"' in html
    assert 'data-conflict-gate-result="idle"' in html
    assert "Nenhum envio de documentos é presumido" in html
    assert 'src="/conflitos/conflict-gate.js"' in html
    assert (ROOT / "conflitos" / "conflict-gate.js").is_file()
    from scripts.site.public_copy_scope import visible_text

    vis = visible_text(html)
    assert re.search(r"\bunknown\b", vis, flags=re.I) is None
    assert re.search(r"\bowner\b", vis, flags=re.I) is None
    assert 'protected_path_available" type="hidden" value="false"' in html or 'name="protected_path_available"' in html
    assert "Não seguiremos com esta demanda neste canal" in html or "recusa" in lower
    assert "/.netlify/functions/lead" not in html
    for needle in ("processo nº", "advogado fulano", "cpf", "prontuário"):
        assert needle not in lower
    assert "application/ld+json" in html
    ld_start = html.find("<script type=\"application/ld+json\">")
    ld_end = html.find("</script>", ld_start)
    ld = html[ld_start:ld_end].lower()
    assert "processo nº" not in ld
    assert "parte autora" not in ld
    assert 'id="conflict-gate-result"' in html
    assert "corpus" in lower
    assert "CONFENGE_PUBLIC_CONFLICT_GATE" in html


def test_sanitize_drops_party_keys():
    rec = load_contract()
    facts = sanitize_facts(
        {
            "nucleus_id": "public_works_b2g",
            "party_name": "Alguem",
            "process_id": "123",
            "reason_detail": "motivo secreto",
        },
        rec,
    )
    assert "party_name" not in facts
    assert "process_id" not in facts
    assert "reason_detail" not in facts
    assert facts["nucleus_id"] == "public_works_b2g"


def run_suite() -> None:
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in tests:
        try:
            fn()
            print("OK", fn.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", fn.__name__, exc)
    if failed:
        raise AssertionError(f"{failed} conflict-gate tests failed")


if __name__ == "__main__":
    try:
        run_suite()
    except AssertionError:
        sys.exit(1)
    sys.exit(0)
