"""Public conflict-gate contract, fail-closed screening, and public projection.

Owner: campaign 05 / issue #585. This module is the shipped screening engine.
It does not persist parties, cases, or a protected register.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "data/site/conflict-gate-contract.json"

STATUSES = (
    "CLEAR",
    "CLEAR_WITH_DISCLOSURE",
    "REVIEW_REQUIRED",
    "DECLINE",
    "UNKNOWN",
)
CLEARANCE_STATUSES = frozenset({"CLEAR", "CLEAR_WITH_DISCLOSURE"})
PIN_FIELDS = {
    "taxonomy_version": "taxonomy",
    "catalog_version": "catalog",
    "intake_version": "intake",
}
PII_SCAN = re.compile(
    r"(?i)\b("
    r"cpf|rg\b|cnpj|e-?mail|telefone|whatsapp|endere[cç]o|"
    r"processo\s*n|n[uú]mero\s*do\s*processo|autos\s*n|"
    r"advogad[oa]|perito\s+nomeado|empregad[oa]|prontu[aá]rio|"
    r"condi[cç][aã]o\s+m[eé]dica"
    r")\b"
    r"|@[a-z0-9.-]+\.[a-z]{2,}"
    r"|\+\d{10,15}"
)
PARTY_LEAK_KEYS = (
    "party_name",
    "party",
    "parties",
    "process",
    "process_id",
    "docket",
    "contract_id_public",
    "orgao",
    "órgão",
    "employee",
    "employee_name",
    "medical",
    "lawyer",
    "lawyer_name",
    "expert_name",
    "perito",
    "advogado",
    "matter_name",
)

_CONTRACT_CACHE: dict[str, Any] | None = None


def _esc(value: str) -> str:
    return html.escape(value or "", quote=True)


def load_contract(*, reload: bool = False) -> dict[str, Any]:
    global _CONTRACT_CACHE
    if _CONTRACT_CACHE is not None and not reload:
        return _CONTRACT_CACHE
    rec = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    _CONTRACT_CACHE = rec
    return rec


def canonical_contract_payload(rec: dict[str, Any] | None = None) -> str:
    body = json.loads(json.dumps(rec if rec is not None else load_contract()))
    body.pop("content_sha256", None)
    return json.dumps(body, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def contract_hash(rec: dict[str, Any] | None = None) -> str:
    return hashlib.sha256(canonical_contract_payload(rec).encode("utf-8")).hexdigest()


def seal_contract(path: Path | None = None) -> dict[str, Any]:
    dest = path or CONTRACT_PATH
    rec = json.loads(dest.read_text(encoding="utf-8"))
    rec["content_sha256"] = contract_hash(rec)
    dest.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    global _CONTRACT_CACHE
    _CONTRACT_CACHE = rec
    return rec


def check_contract_seal(rec: dict[str, Any] | None = None) -> list[str]:
    body = rec if rec is not None else load_contract()
    errors: list[str] = []
    expected = contract_hash(body)
    actual = str(body.get("content_sha256") or "")
    if actual in {"", "PENDING"}:
        errors.append("conflict_gate_hash_absent")
    elif actual != expected:
        errors.append("conflict_gate_hash_mismatch")
    if str(body.get("contract_id") or "") != "CONFENGE_PUBLIC_CONFLICT_GATE":
        errors.append("conflict_gate_id_mismatch")
    if str(body.get("contract_version") or "") != "1.0.0":
        errors.append("conflict_gate_version_unexpected")
    statuses = list(body.get("statuses") or [])
    if statuses != list(STATUSES):
        errors.append("conflict_gate_statuses_drift")
    if body.get("invariants", {}).get("unknown_never_clear") is not True:
        errors.append("conflict_gate_unknown_never_clear_missing")
    return errors


def _tri_bool(value: Any) -> bool | None:
    if value is True or value == "yes" or value == "true":
        return True
    if value is False or value == "no" or value == "false":
        return False
    return None


def sanitize_facts(raw: dict[str, Any] | None, contract: dict[str, Any] | None = None) -> dict[str, Any]:
    rec = contract if contract is not None else load_contract()
    allow = set(rec.get("fact_allowlist") or [])
    src = raw or {}
    out: dict[str, Any] = {}
    for key in allow:
        if key in src:
            out[key] = src[key]
    return out


def _reason_ids(contract: dict[str, Any]) -> set[str]:
    return {str(item.get("id") or "") for item in (contract.get("reason_classes") or []) if item.get("id")}


def _nucleus_ids(contract: dict[str, Any]) -> set[str]:
    return {str(item.get("id") or "") for item in (contract.get("nuclei") or []) if item.get("id")}


def _role_ids(contract: dict[str, Any]) -> set[str]:
    return {str(item.get("id") or "") for item in (contract.get("intended_roles") or []) if item.get("id")}


def _canonical_facts(facts: dict[str, Any]) -> str:
    return json.dumps(facts, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def screening_receipt(facts: dict[str, Any]) -> str:
    digest = hashlib.sha256(_canonical_facts(facts).encode("utf-8")).hexdigest()
    return f"cg-{digest[:20]}"


def _next_step(status: str, contract: dict[str, Any]) -> str:
    steps = contract.get("next_steps") or {}
    return str(steps.get(status) or steps["UNKNOWN"])


def _decision(
    status: str,
    reason_class: str,
    facts: dict[str, Any],
    contract: dict[str, Any],
    *,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if status not in STATUSES:
        status = "UNKNOWN"
        reason_class = "insufficient_information"
    if reason_class not in _reason_ids(contract):
        status = "UNKNOWN"
        reason_class = "insufficient_information"
    payload = {
        "status": status,
        "reason_class": reason_class,
        "policy_version": str(contract.get("contract_version") or ""),
        "policy_hash": str(contract.get("content_sha256") or contract_hash(contract)),
        "receipt": screening_receipt(facts),
        "prior_clearance_invalidated": False,
        "corpus_suspended": status not in CLEARANCE_STATUSES,
    }
    if extra:
        payload.update(extra)
    return payload


def _pin_error(facts: dict[str, Any], contract: dict[str, Any]) -> str | None:
    expected_id = str(contract.get("contract_id") or "")
    expected_version = str(contract.get("contract_version") or "")
    expected_hash = str(contract.get("content_sha256") or "")
    given_id = facts.get("contract_id")
    given_version = facts.get("contract_version")
    given_hash = facts.get("contract_hash")
    if given_id not in (None, "", expected_id):
        return "contract_pin_mismatch"
    if given_version not in (None, "", expected_version):
        return "contract_pin_mismatch"
    if given_hash not in (None, "", expected_hash):
        return "contract_pin_mismatch"
    if expected_hash in {"", "PENDING"}:
        return "contract_pin_mismatch"
    pins = contract.get("consumer_pins") or {}
    for fact_key, pin_key in PIN_FIELDS.items():
        given = facts.get(fact_key)
        if given in (None, ""):
            continue
        expected = pins.get(pin_key)
        if expected is None or str(given) != str(expected):
            return "contract_pin_mismatch"
    return None


def _material_unknown(facts: dict[str, Any], contract: dict[str, Any]) -> bool:
    if facts.get("nucleus_id") not in _nucleus_ids(contract):
        return True
    if facts.get("intended_role") not in _role_ids(contract):
        return True
    if _tri_bool(facts.get("information_sufficient")) is not True:
        return True
    flags = [item["field"] for item in (contract.get("decline_true_flags") or [])]
    flags.extend(
        [
            "relevant_personal_or_financial_relation",
            "distinct_matter_no_signal",
        ]
    )
    for field in flags:
        if _tri_bool(facts.get(field)) is None:
            return True
    return False


def _all_risk_false(facts: dict[str, Any], contract: dict[str, Any]) -> bool:
    for item in contract.get("decline_true_flags") or []:
        if _tri_bool(facts.get(item["field"])) is not False:
            return False
    if _tri_bool(facts.get("relevant_personal_or_financial_relation")) is not False:
        return False
    return True


def screen_conflict(raw_facts: dict[str, Any] | None, contract: dict[str, Any] | None = None) -> dict[str, Any]:
    """Pure screening. Does not apply the unavailable-path adapter."""
    rec = contract if contract is not None else load_contract()
    facts = sanitize_facts(raw_facts, rec)
    pin = _pin_error(facts, rec)
    if pin:
        return _decision("UNKNOWN", pin, facts, rec, extra={"corpus_suspended": True})
    if _tri_bool(facts.get("rollback")) is True:
        return _decision("REVIEW_REQUIRED", "rollback_fail_closed", facts, rec)

    for item in rec.get("decline_true_flags") or []:
        if _tri_bool(facts.get(item["field"])) is True:
            return _decision("DECLINE", str(item["reason_class"]), facts, rec)

    relation = _tri_bool(facts.get("relevant_personal_or_financial_relation"))
    if relation is True and _tri_bool(facts.get("relation_cannot_be_mitigated")) is True:
        return _decision("DECLINE", "unmitigable_personal_or_financial_relation", facts, rec)

    prior = facts.get("prior_status")
    if prior in CLEARANCE_STATUSES:
        prior_fp = facts.get("prior_role_fingerprint")
        current_fp = facts.get("current_role_fingerprint")
        if not prior_fp or not current_fp or str(prior_fp) != str(current_fp):
            return _decision(
                "REVIEW_REQUIRED",
                "role_change_recheck",
                facts,
                rec,
                extra={"prior_clearance_invalidated": True},
            )

    if _material_unknown(facts, rec):
        return _decision("UNKNOWN", "insufficient_information", facts, rec)

    if relation is True:
        unmitigated = _tri_bool(facts.get("relation_cannot_be_mitigated"))
        disclosure = _tri_bool(facts.get("mitigation_requires_disclosure"))
        if disclosure is True and unmitigated is False:
            return _decision("CLEAR_WITH_DISCLOSURE", "disclosure_mitigation", facts, rec)
        return _decision("REVIEW_REQUIRED", "personal_or_financial_relation_review", facts, rec)

    if _tri_bool(facts.get("distinct_matter_no_signal")) is True and _all_risk_false(facts, rec):
        return _decision("CLEAR", "no_signal_distinct_matter", facts, rec)

    return _decision("UNKNOWN", "insufficient_information", facts, rec)


def apply_protected_path_adapter(
    decision: dict[str, Any],
    raw_facts: dict[str, Any] | None,
    contract: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rec = contract if contract is not None else load_contract()
    facts = sanitize_facts(raw_facts, rec)
    out = dict(decision)
    path_ok = _tri_bool(facts.get("protected_path_available")) is True
    if _tri_bool(facts.get("rollback")) is True:
        out["status"] = "REVIEW_REQUIRED"
        out["reason_class"] = "rollback_fail_closed"
        out["corpus_suspended"] = True
        return out
    if path_ok:
        out["corpus_suspended"] = out.get("status") not in CLEARANCE_STATUSES
        return out
    if out.get("status") in CLEARANCE_STATUSES:
        out["status"] = "REVIEW_REQUIRED"
        out["reason_class"] = "protected_path_unavailable"
    if out.get("status") == "CLEAR":
        out["status"] = "REVIEW_REQUIRED"
        out["reason_class"] = "protected_path_unavailable"
    out["corpus_suspended"] = True
    return out


def public_projection(decision: dict[str, Any], contract: dict[str, Any] | None = None) -> dict[str, Any]:
    rec = contract if contract is not None else load_contract()
    status = str(decision.get("status") or "UNKNOWN")
    if status not in STATUSES:
        status = "UNKNOWN"
    keys = list(rec.get("public_projection_keys") or [])
    payload = {
        "status": status,
        "next_step": _next_step(status, rec),
        "policy_version": str(decision.get("policy_version") or rec.get("contract_version") or ""),
        "corpus_suspended": bool(decision.get("corpus_suspended", status not in CLEARANCE_STATUSES)),
        "public_readback": f"{status}: {_next_step(status, rec)}",
    }
    return {key: payload[key] for key in keys if key in payload}


def protected_decision_payload(
    decision: dict[str, Any],
    raw_facts: dict[str, Any] | None = None,
    *,
    owner: str | None = None,
    timestamp: str | None = None,
    matter_ref_protected: str | None = None,
    contract: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rec = contract if contract is not None else load_contract()
    facts = sanitize_facts(raw_facts, rec)
    stamp = timestamp or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    role = str(facts.get("intended_role") or "")
    disclosure = None
    if decision.get("status") == "CLEAR_WITH_DISCLOSURE":
        disclosure = "disclosure_required_on_protected_path"
    payload = {
        "owner": owner or str((rec.get("owner") or {}).get("email") or ""),
        "timestamp": stamp,
        "reason_class": str(decision.get("reason_class") or "insufficient_information"),
        "matter_ref_protected": matter_ref_protected or decision.get("receipt"),
        "identity_role": role,
        "valid_until": None,
        "recheck_on": ["role_change", "policy_version_change", "office_duty_change"],
        "disclosure": disclosure,
        "receipt": str(decision.get("receipt") or screening_receipt(facts)),
        "policy_version": str(decision.get("policy_version") or rec.get("contract_version") or ""),
        "policy_hash": str(decision.get("policy_hash") or rec.get("content_sha256") or ""),
        "prior_clearance_invalidated": bool(decision.get("prior_clearance_invalidated")),
    }
    allowed = list(rec.get("protected_decision_keys") or payload.keys())
    return {key: payload.get(key) for key in allowed}


def evaluate_conflict(raw_facts: dict[str, Any] | None, contract: dict[str, Any] | None = None) -> dict[str, Any]:
    rec = contract if contract is not None else load_contract()
    facts = sanitize_facts(raw_facts, rec)
    inner = screen_conflict(facts, rec)
    adapted = apply_protected_path_adapter(inner, facts, rec)
    public = public_projection(adapted, rec)
    protected = protected_decision_payload(adapted, facts, contract=rec)
    return {
        "decision": adapted,
        "public": public,
        "protected": protected,
        "inner": inner,
    }


def scan_public_leaks(public: dict[str, Any], raw_facts: dict[str, Any] | None = None) -> list[str]:
    blob = json.dumps(public, ensure_ascii=False)
    errors: list[str] = []
    if PII_SCAN.search(blob):
        errors.append("public_projection_pii")
    src = raw_facts or {}
    for key in PARTY_LEAK_KEYS:
        value = src.get(key)
        if value not in (None, "") and str(value) in blob:
            errors.append(f"public_projection_leaked:{key}")
    if "reason_class" in public:
        errors.append("public_projection_exposes_reason_class")
    extra = set(public) - set(load_contract().get("public_projection_keys") or [])
    if extra:
        errors.append("public_projection_extra_keys:" + ",".join(sorted(extra)))
    return errors


def public_policy_body(contract: dict[str, Any] | None = None) -> str:
    rec = contract if contract is not None else load_contract()
    nuclei = rec.get("nuclei") or []
    nucleus_items = "".join(
        f"<li>{_esc(str(item.get('public_label') or item.get('id')))}</li>" for item in nuclei
    )
    version = _esc(str(rec.get("contract_version") or ""))
    return f"""
<h2 id="triagem-operacional">Triagem operacional conservadora</h2>
<p>Esta página descreve uma política operacional de triagem de conflitos, conservadora e reabrível. Não é um parecer jurídico geral de que toda atividade privada é compatível com cargo público. Mudança de função, de deveres, de regra interna ou de interpretação reabre a avaliação.</p>
<p>A triagem existe para proteger o cliente e a independência técnica: evita que a CONFENGE aceite demanda na qual o responsável técnico não pode atuar com independência, e evita que o cliente receba trabalho contaminado por conflito.</p>
<p>Contrato público de triagem: <strong>CONFENGE_PUBLIC_CONFLICT_GATE</strong> versão <span data-conflict-gate-version="{version}">{version}</span>.</p>
<h2 id="nucleos">Onde a triagem vale</h2>
<p>A mesma triagem cobre cargo público e fiscalização, perícia e assistência técnica, avaliação de imóveis, SST, cliente privado e obras públicas (B2G):</p>
<ul>
<li>Cargo público e dever de fiscalização</li>
{nucleus_items}
</ul>
<h2 id="estados">Estados da triagem</h2>
<p>Os únicos estados possíveis são: sem sinal neste recorte; segue com divulgação no canal protegido; revisão humana; recusa; informação insuficiente. Informação insuficiente nunca libera o envio de documentos. Se o canal protegido estiver indisponível, o visitante vê revisão humana ou pausa e o envio de corpus fica suspenso. Rollback também volta para revisão humana, nunca para liberação.</p>
<h2 id="dados-minimos">Primeira etapa: dados mínimos</h2>
<p>Nesta página pedimos só recortes não sensíveis: núcleo, papel pretendido e respostas sim/não/não sei. Não pedimos nomes de partes, processo, contrato, órgão, empregado, condição médica, advogado, perito ou motivo detalhado. Esses dados, quando cabíveis, ficam no canal protegido fora da analítica pública.</p>
<p>Não há envio de arquivo nem de corpus substantivo nesta etapa. Recusa é neutra: o site não revela o motivo protegido.</p>
<h2 id="canal-protegido">O que não entra no plano público</h2>
<p>Decisão protegida (responsável, data, classe de motivo, referência da matéria, papel, validade, divulgação, recibo e versão da política) não é publicada, não vai para query string, evento ou log público, e não é armazenada neste site. Este repositório não implementa cadastro de partes nem de casos.</p>
"""


def first_step_form_html(contract: dict[str, Any] | None = None) -> str:
    rec = contract if contract is not None else load_contract()
    version = _esc(str(rec.get("contract_version") or ""))
    digest = _esc(str(rec.get("content_sha256") or ""))
    nucleus_opts = "".join(
        f'<option value="{_esc(str(item.get("id")))}">{_esc(str(item.get("public_label")))}</option>'
        for item in (rec.get("nuclei") or [])
    )
    role_opts = "".join(
        f'<option value="{_esc(str(item.get("id")))}">{_esc(str(item.get("public_label")))}</option>'
        for item in (rec.get("intended_roles") or [])
    )

    def tri_field(fid: str, label: str) -> str:
        return (
            f'<div class="field"><label for="{_esc(fid)}">{_esc(label)}</label>'
            f'<select id="{_esc(fid)}" name="{_esc(fid)}" required="">'
            '<option value="">Selecione</option>'
            '<option value="yes">Sim</option>'
            '<option value="no">Não</option>'
            '<option value="unsure">Não sei</option>'
            "</select></div>"
        )

    return f"""
<h2 id="primeira-etapa">Primeira etapa da triagem</h2>
<p>Responda só o mínimo. O resultado público mostra o estado neutro e o próximo passo. Se o JavaScript falhar ou o canal protegido estiver indisponível, o estado visível é revisão humana ou pausa e o corpus permanece suspenso.</p>
<noscript>
<p class="form-note" data-conflict-gate-fallback="REVIEW_REQUIRED">JavaScript indisponível. Estado: revisão humana. Não envie o corpus.</p>
</noscript>
<form class="contact-form" id="conflict-gate-form" method="post" action="#primeira-etapa" data-conflict-gate-version="{version}" data-conflict-gate-hash="{digest}" novalidate="">
<input name="conflict_gate_version" type="hidden" value="{version}"/>
<input name="conflict_gate_hash" type="hidden" value="{digest}"/>
<input name="protected_path_available" type="hidden" value="false"/>
<p class="honeypot"><label for="conflict-gate-company">Não preencha este campo</label>
<input autocomplete="off" id="conflict-gate-company" name="company" tabindex="-1"/></p>
<div class="field"><label for="nucleus_id">Núcleo da demanda</label>
<select id="nucleus_id" name="nucleus_id" required="">
<option value="">Selecione</option>
{nucleus_opts}
</select></div>
<div class="field"><label for="intended_role">Papel pretendido para a CONFENGE</label>
<select id="intended_role" name="intended_role" required="">
<option value="">Selecione</option>
{role_opts}
</select></div>
{tri_field("information_sufficient", "Você tem informação suficiente para estas respostas, sem enviar nomes ou documentos?")}
{tri_field("same_public_duty_matter", "A demanda envolve o mesmo contrato, processo, fiscalização ou objeto em que o responsável técnico atua em cargo público?")}
{tri_field("nonpublic_office_information_risk", "Há risco de uso de informação não pública obtida no cargo?")}
{tri_field("incompatible_expert_roles", "No mesmo caso ou caso relacionado, já há perito do juízo e pedido de assistência técnica, ou o inverso?")}
{tri_field("relevant_personal_or_financial_relation", "Existe relação pessoal ou financeira relevante com alguma parte? Não informe quem.")}
{tri_field("relation_cannot_be_mitigated", "Se houver relação relevante, ela não pode ser mitigada de forma crível?")}
{tri_field("mitigation_requires_disclosure", "Há mitigação real que exige divulgação registrada?")}
{tri_field("client_requests_public_influence", "Há pedido para usar cargo, acesso ou influência pública?")}
{tri_field("distinct_matter_no_signal", "A matéria é distinta e, neste recorte, não há sinal de conflito?")}
<button class="button button-primary" type="submit">Ver próximo passo da triagem</button>
<p class="form-note">Não anexe arquivo. Não escreva nomes de partes, processo, órgão ou motivo detalhado. Recusa é neutra.</p>
<div id="conflict-gate-result" role="status" aria-live="polite" data-conflict-gate-result="idle">A triagem ainda não rodou. Nenhum envio de documentos é presumido.</div>
</form>
"""


def interpreter_source(contract: dict[str, Any] | None = None) -> str:
    rec = contract if contract is not None else load_contract()
    runtime = {
        "contract_id": rec.get("contract_id"),
        "contract_version": rec.get("contract_version"),
        "content_sha256": rec.get("content_sha256"),
        "statuses": rec.get("statuses"),
        "nuclei": [item.get("id") for item in (rec.get("nuclei") or [])],
        "intended_roles": [item.get("id") for item in (rec.get("intended_roles") or [])],
        "fact_allowlist": rec.get("fact_allowlist"),
        "decline_true_flags": rec.get("decline_true_flags"),
        "reason_classes": [item.get("id") for item in (rec.get("reason_classes") or [])],
        "public_projection_keys": rec.get("public_projection_keys"),
        "next_steps": rec.get("next_steps"),
        "consumer_pins": rec.get("consumer_pins"),
    }
    blob = json.dumps(runtime, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return f"""
var CONFENGE_CONFLICT_GATE = {blob};
function confengeConflictTriBool(v) {{
  if (v === true || v === "yes" || v === "true") return true;
  if (v === false || v === "no" || v === "false") return false;
  return null;
}}
function confengeSanitizeConflictFacts(raw) {{
  var allow = CONFENGE_CONFLICT_GATE.fact_allowlist || [];
  var out = {{}};
  raw = raw || {{}};
  for (var i = 0; i < allow.length; i++) {{
    var key = allow[i];
    if (Object.prototype.hasOwnProperty.call(raw, key)) out[key] = raw[key];
  }}
  return out;
}}
function confengeConflictReceipt(facts) {{
  var keys = Object.keys(facts).sort();
  var canonical = JSON.stringify(facts, keys);
  var h = 0;
  for (var i = 0; i < canonical.length; i++) h = ((h << 5) - h + canonical.charCodeAt(i)) | 0;
  return "cg-js-" + Math.abs(h).toString(16);
}}
function confengeConflictPinError(facts) {{
  var c = CONFENGE_CONFLICT_GATE;
  if (!c.content_sha256 || c.content_sha256 === "PENDING") return "contract_pin_mismatch";
  if (facts.contract_id && facts.contract_id !== c.contract_id) return "contract_pin_mismatch";
  if (facts.contract_version && facts.contract_version !== c.contract_version) return "contract_pin_mismatch";
  if (facts.contract_hash && facts.contract_hash !== c.content_sha256) return "contract_pin_mismatch";
  var pins = c.consumer_pins || {{}};
  var map = {{taxonomy_version: "taxonomy", catalog_version: "catalog", intake_version: "intake"}};
  var k;
  for (k in map) {{
    if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
    if (facts[k] && facts[k] !== pins[map[k]]) return "contract_pin_mismatch";
  }}
  return null;
}}
function confengeConflictMaterialUnknown(facts) {{
  if ((CONFENGE_CONFLICT_GATE.nuclei || []).indexOf(facts.nucleus_id) < 0) return true;
  if ((CONFENGE_CONFLICT_GATE.intended_roles || []).indexOf(facts.intended_role) < 0) return true;
  if (confengeConflictTriBool(facts.information_sufficient) !== true) return true;
  var flags = (CONFENGE_CONFLICT_GATE.decline_true_flags || []).map(function (item) {{ return item.field; }});
  flags.push("relevant_personal_or_financial_relation", "distinct_matter_no_signal");
  for (var i = 0; i < flags.length; i++) {{
    if (confengeConflictTriBool(facts[flags[i]]) === null) return true;
  }}
  return false;
}}
function confengeConflictAllRiskFalse(facts) {{
  var flags = CONFENGE_CONFLICT_GATE.decline_true_flags || [];
  for (var i = 0; i < flags.length; i++) {{
    if (confengeConflictTriBool(facts[flags[i].field]) !== false) return false;
  }}
  return confengeConflictTriBool(facts.relevant_personal_or_financial_relation) === false;
}}
function confengeScreenConflict(raw) {{
  var c = CONFENGE_CONFLICT_GATE;
  var facts = confengeSanitizeConflictFacts(raw);
  function decision(status, reason, extra) {{
    var out = {{
      status: status,
      reason_class: reason,
      policy_version: c.contract_version,
      policy_hash: c.content_sha256,
      receipt: confengeConflictReceipt(facts),
      prior_clearance_invalidated: false,
      corpus_suspended: status !== "CLEAR" && status !== "CLEAR_WITH_DISCLOSURE"
    }};
    if (extra) {{
      var ek;
      for (ek in extra) if (Object.prototype.hasOwnProperty.call(extra, ek)) out[ek] = extra[ek];
    }}
    return out;
  }}
  var pin = confengeConflictPinError(facts);
  if (pin) return decision("UNKNOWN", pin, {{corpus_suspended: true}});
  if (confengeConflictTriBool(facts.rollback) === true) return decision("REVIEW_REQUIRED", "rollback_fail_closed");
  var i, item;
  for (i = 0; i < (c.decline_true_flags || []).length; i++) {{
    item = c.decline_true_flags[i];
    if (confengeConflictTriBool(facts[item.field]) === true) return decision("DECLINE", item.reason_class);
  }}
  if (confengeConflictTriBool(facts.relevant_personal_or_financial_relation) === true && confengeConflictTriBool(facts.relation_cannot_be_mitigated) === true) {{
    return decision("DECLINE", "unmitigable_personal_or_financial_relation");
  }}
  if (facts.prior_status === "CLEAR" || facts.prior_status === "CLEAR_WITH_DISCLOSURE") {{
    if (!facts.prior_role_fingerprint || !facts.current_role_fingerprint || String(facts.prior_role_fingerprint) !== String(facts.current_role_fingerprint)) {{
      return decision("REVIEW_REQUIRED", "role_change_recheck", {{prior_clearance_invalidated: true}});
    }}
  }}
  if (confengeConflictMaterialUnknown(facts)) return decision("UNKNOWN", "insufficient_information");
  if (confengeConflictTriBool(facts.relevant_personal_or_financial_relation) === true) {{
    var unmit = confengeConflictTriBool(facts.relation_cannot_be_mitigated);
    var disc = confengeConflictTriBool(facts.mitigation_requires_disclosure);
    if (disc === true && unmit === false) return decision("CLEAR_WITH_DISCLOSURE", "disclosure_mitigation");
    return decision("REVIEW_REQUIRED", "personal_or_financial_relation_review");
  }}
  if (confengeConflictTriBool(facts.distinct_matter_no_signal) === true && confengeConflictAllRiskFalse(facts)) {{
    return decision("CLEAR", "no_signal_distinct_matter");
  }}
  return decision("UNKNOWN", "insufficient_information");
}}
function confengeAdaptProtectedPath(decision, raw) {{
  var facts = confengeSanitizeConflictFacts(raw);
  var out = {{}};
  var k;
  for (k in decision) if (Object.prototype.hasOwnProperty.call(decision, k)) out[k] = decision[k];
  var pathOk = confengeConflictTriBool(facts.protected_path_available) === true;
  if (confengeConflictTriBool(facts.rollback) === true) {{
    out.status = "REVIEW_REQUIRED";
    out.reason_class = "rollback_fail_closed";
    out.corpus_suspended = true;
    return out;
  }}
  if (pathOk) {{
    out.corpus_suspended = out.status !== "CLEAR" && out.status !== "CLEAR_WITH_DISCLOSURE";
    return out;
  }}
  if (out.status === "CLEAR" || out.status === "CLEAR_WITH_DISCLOSURE") {{
    out.status = "REVIEW_REQUIRED";
    out.reason_class = "protected_path_unavailable";
  }}
  out.corpus_suspended = true;
  return out;
}}
function confengePublicProjection(decision) {{
  var c = CONFENGE_CONFLICT_GATE;
  var status = decision && decision.status;
  if ((c.statuses || []).indexOf(status) < 0) status = "UNKNOWN";
  var next = (c.next_steps || {{}})[status] || (c.next_steps || {{}}).UNKNOWN;
  var payload = {{
    status: status,
    next_step: next,
    policy_version: (decision && decision.policy_version) || c.contract_version,
    corpus_suspended: !!(decision && decision.corpus_suspended) || (status !== "CLEAR" && status !== "CLEAR_WITH_DISCLOSURE"),
    public_readback: status + ": " + next
  }};
  var keys = c.public_projection_keys || [];
  var out = {{}};
  for (var i = 0; i < keys.length; i++) if (payload[keys[i]] !== undefined) out[keys[i]] = payload[keys[i]];
  return out;
}}
function confengeEvaluateConflict(raw) {{
  var inner = confengeScreenConflict(raw);
  var adapted = confengeAdaptProtectedPath(inner, raw);
  return {{ decision: adapted, public: confengePublicProjection(adapted), inner: inner }};
}}
"""


def client_runtime_js(contract: dict[str, Any] | None = None) -> str:
    src = interpreter_source(contract)
    return src + """
(function () {
  var form = document.getElementById("conflict-gate-form");
  var out = document.getElementById("conflict-gate-result");
  if (!form || !out) return;
  function triFromSelect(name) {
    var el = form.elements.namedItem(name);
    if (!el) return null;
    var v = String(el.value || "");
    if (v === "yes") return true;
    if (v === "no") return false;
    return null;
  }
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    var facts = {
      nucleus_id: String(form.nucleus_id && form.nucleus_id.value || ""),
      intended_role: String(form.intended_role && form.intended_role.value || ""),
      information_sufficient: triFromSelect("information_sufficient"),
      same_public_duty_matter: triFromSelect("same_public_duty_matter"),
      nonpublic_office_information_risk: triFromSelect("nonpublic_office_information_risk"),
      incompatible_expert_roles: triFromSelect("incompatible_expert_roles"),
      relevant_personal_or_financial_relation: triFromSelect("relevant_personal_or_financial_relation"),
      relation_cannot_be_mitigated: triFromSelect("relation_cannot_be_mitigated"),
      mitigation_requires_disclosure: triFromSelect("mitigation_requires_disclosure"),
      client_requests_public_influence: triFromSelect("client_requests_public_influence"),
      distinct_matter_no_signal: triFromSelect("distinct_matter_no_signal"),
      protected_path_available: false,
      contract_id: CONFENGE_CONFLICT_GATE.contract_id,
      contract_version: CONFENGE_CONFLICT_GATE.contract_version,
      contract_hash: CONFENGE_CONFLICT_GATE.content_sha256
    };
    var result = confengeEvaluateConflict(facts);
    var pub = result.public || {};
    var status = pub.status || "UNKNOWN";
    if (status === "CLEAR" || status === "CLEAR_WITH_DISCLOSURE") {
      status = "REVIEW_REQUIRED";
      pub = confengePublicProjection({
        status: "REVIEW_REQUIRED",
        corpus_suspended: true,
        policy_version: CONFENGE_CONFLICT_GATE.contract_version
      });
    }
    var labels = {
      CLEAR: "sem sinal neste recorte",
      CLEAR_WITH_DISCLOSURE: "segue com divulgação no canal protegido",
      REVIEW_REQUIRED: "revisão humana",
      DECLINE: "recusa",
      UNKNOWN: "informação insuficiente"
    };
    out.setAttribute("data-conflict-gate-result", status);
    out.textContent = "Estado: " + (labels[status] || labels.UNKNOWN) + ". " + (pub.next_step || "");
  });
})();
"""


if __name__ == "__main__":
    sealed = seal_contract()
    print("sealed", sealed["contract_id"], sealed["contract_version"], sealed["content_sha256"])
