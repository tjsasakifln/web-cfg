(function () {

var CONFENGE_CONFLICT_GATE = {"consumer_pins":{"admission_policy":"NET_NEW_INBOUND_HANDRAISER/1.0.0-draft.20260904","catalog":"CONFENGE_OFFER_CATALOG/2.0.0-draft.20260904","handraiser_state":"CONFENGE_HANDRAISER_STATE/1.0.0-draft.20260904","intake":"CONFENGE_WEB_INTAKE/2.0.0-draft.20260904","meetcfg_context":"MEETCFG_HANDRAISER_CONTEXT/1.0.0-draft.20260904","taxonomy":"CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904"},"content_sha256":"9db68822a3f74146a1ac42b24562964c455ceeba0f297d47c3577a6fc6945fe0","contract_id":"CONFENGE_PUBLIC_CONFLICT_GATE","contract_version":"1.1.0","decline_true_flags":[{"field":"same_public_duty_matter","reason_class":"same_public_duty_matter"},{"field":"nonpublic_office_information_risk","reason_class":"nonpublic_office_information_risk"},{"field":"incompatible_expert_roles","reason_class":"incompatible_expert_roles"},{"field":"client_requests_public_influence","reason_class":"public_influence_request"}],"fact_allowlist":["nucleus_id","intended_role","same_public_duty_matter","nonpublic_office_information_risk","incompatible_expert_roles","relevant_personal_or_financial_relation","relation_cannot_be_mitigated","mitigation_requires_disclosure","client_requests_public_influence","information_sufficient","distinct_matter_no_signal","prior_status","prior_role_fingerprint","current_role_fingerprint","protected_path_available","contract_id","contract_version","contract_hash","taxonomy_version","catalog_version","intake_version","rollback"],"intended_roles":["consultant","technical_responsible","valuer","technical_assistant","court_appointed_expert"],"next_steps":{"CLEAR":"Nenhum sinal de conflito apareceu neste recorte. Os documentos só podem seguir por canal protegido depois da confirmação final.","CLEAR_WITH_DISCLOSURE":"A demanda pode seguir apenas com a condição registrada no canal protegido. Não envie documentos por esta página.","DECLINE":"A CONFENGE não pode aceitar esta demanda. A resposta não expõe partes nem motivos protegidos.","REVIEW_REQUIRED":"A demanda precisa de análise humana antes do envio de documentos.","UNKNOWN":"Ainda faltam informações para concluir. Não envie documentos até a análise ser retomada."},"nuclei":["expert_evidence_assistance","property_valuation","building_engineering_documentation","occupational_safety","public_works_b2g"],"public_projection_keys":["status","next_step","policy_version","corpus_suspended","public_readback"],"reason_classes":["contract_pin_mismatch","insufficient_information","same_public_duty_matter","nonpublic_office_information_risk","incompatible_expert_roles","public_influence_request","unmitigable_personal_or_financial_relation","personal_or_financial_relation_review","disclosure_mitigation","role_change_recheck","no_signal_distinct_matter","protected_path_unavailable","rollback_fail_closed"],"statuses":["CLEAR","CLEAR_WITH_DISCLOSURE","REVIEW_REQUIRED","DECLINE","UNKNOWN"]};
function confengeConflictTriBool(v) {
  if (v === true || v === "yes" || v === "true") return true;
  if (v === false || v === "no" || v === "false") return false;
  return null;
}
function confengeSanitizeConflictFacts(raw) {
  var allow = CONFENGE_CONFLICT_GATE.fact_allowlist || [];
  var out = {};
  raw = raw || {};
  for (var i = 0; i < allow.length; i++) {
    var key = allow[i];
    if (Object.prototype.hasOwnProperty.call(raw, key)) out[key] = raw[key];
  }
  return out;
}
function confengeConflictReceipt(facts) {
  var keys = Object.keys(facts).sort();
  var canonical = JSON.stringify(facts, keys);
  var h = 0;
  for (var i = 0; i < canonical.length; i++) h = ((h << 5) - h + canonical.charCodeAt(i)) | 0;
  return "cg-js-" + Math.abs(h).toString(16);
}
function confengeConflictPinError(facts) {
  var c = CONFENGE_CONFLICT_GATE;
  if (!c.content_sha256 || c.content_sha256 === "PENDING") return "contract_pin_mismatch";
  if (facts.contract_id && facts.contract_id !== c.contract_id) return "contract_pin_mismatch";
  if (facts.contract_version && facts.contract_version !== c.contract_version) return "contract_pin_mismatch";
  if (facts.contract_hash && facts.contract_hash !== c.content_sha256) return "contract_pin_mismatch";
  var pins = c.consumer_pins || {};
  var map = {taxonomy_version: "taxonomy", catalog_version: "catalog", intake_version: "intake"};
  var k;
  for (k in map) {
    if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
    if (facts[k] && facts[k] !== pins[map[k]]) return "contract_pin_mismatch";
  }
  return null;
}
function confengeConflictMaterialUnknown(facts) {
  if ((CONFENGE_CONFLICT_GATE.nuclei || []).indexOf(facts.nucleus_id) < 0) return true;
  if ((CONFENGE_CONFLICT_GATE.intended_roles || []).indexOf(facts.intended_role) < 0) return true;
  if (confengeConflictTriBool(facts.information_sufficient) !== true) return true;
  var flags = (CONFENGE_CONFLICT_GATE.decline_true_flags || []).map(function (item) { return item.field; });
  flags.push("relevant_personal_or_financial_relation", "distinct_matter_no_signal");
  for (var i = 0; i < flags.length; i++) {
    if (confengeConflictTriBool(facts[flags[i]]) === null) return true;
  }
  return false;
}
function confengeConflictAllRiskFalse(facts) {
  var flags = CONFENGE_CONFLICT_GATE.decline_true_flags || [];
  for (var i = 0; i < flags.length; i++) {
    if (confengeConflictTriBool(facts[flags[i].field]) !== false) return false;
  }
  return confengeConflictTriBool(facts.relevant_personal_or_financial_relation) === false;
}
function confengeScreenConflict(raw) {
  var c = CONFENGE_CONFLICT_GATE;
  var facts = confengeSanitizeConflictFacts(raw);
  function decision(status, reason, extra) {
    var out = {
      status: status,
      reason_class: reason,
      policy_version: c.contract_version,
      policy_hash: c.content_sha256,
      receipt: confengeConflictReceipt(facts),
      prior_clearance_invalidated: false,
      corpus_suspended: status !== "CLEAR" && status !== "CLEAR_WITH_DISCLOSURE"
    };
    if (extra) {
      var ek;
      for (ek in extra) if (Object.prototype.hasOwnProperty.call(extra, ek)) out[ek] = extra[ek];
    }
    return out;
  }
  var pin = confengeConflictPinError(facts);
  if (pin) return decision("UNKNOWN", pin, {corpus_suspended: true});
  if (confengeConflictTriBool(facts.rollback) === true) return decision("REVIEW_REQUIRED", "rollback_fail_closed");
  var i, item;
  for (i = 0; i < (c.decline_true_flags || []).length; i++) {
    item = c.decline_true_flags[i];
    if (confengeConflictTriBool(facts[item.field]) === true) return decision("DECLINE", item.reason_class);
  }
  if (confengeConflictTriBool(facts.relevant_personal_or_financial_relation) === true && confengeConflictTriBool(facts.relation_cannot_be_mitigated) === true) {
    return decision("DECLINE", "unmitigable_personal_or_financial_relation");
  }
  if (facts.prior_status === "CLEAR" || facts.prior_status === "CLEAR_WITH_DISCLOSURE") {
    if (!facts.prior_role_fingerprint || !facts.current_role_fingerprint || String(facts.prior_role_fingerprint) !== String(facts.current_role_fingerprint)) {
      return decision("REVIEW_REQUIRED", "role_change_recheck", {prior_clearance_invalidated: true});
    }
  }
  if (confengeConflictMaterialUnknown(facts)) return decision("UNKNOWN", "insufficient_information");
  if (confengeConflictTriBool(facts.relevant_personal_or_financial_relation) === true) {
    var unmit = confengeConflictTriBool(facts.relation_cannot_be_mitigated);
    var disc = confengeConflictTriBool(facts.mitigation_requires_disclosure);
    if (disc === true && unmit === false) return decision("CLEAR_WITH_DISCLOSURE", "disclosure_mitigation");
    return decision("REVIEW_REQUIRED", "personal_or_financial_relation_review");
  }
  if (confengeConflictTriBool(facts.distinct_matter_no_signal) === true && confengeConflictAllRiskFalse(facts)) {
    return decision("CLEAR", "no_signal_distinct_matter");
  }
  return decision("UNKNOWN", "insufficient_information");
}
function confengeAdaptProtectedPath(decision, raw) {
  var facts = confengeSanitizeConflictFacts(raw);
  var out = {};
  var k;
  for (k in decision) if (Object.prototype.hasOwnProperty.call(decision, k)) out[k] = decision[k];
  var pathOk = confengeConflictTriBool(facts.protected_path_available) === true;
  if (confengeConflictTriBool(facts.rollback) === true) {
    out.status = "REVIEW_REQUIRED";
    out.reason_class = "rollback_fail_closed";
    out.corpus_suspended = true;
    return out;
  }
  if (pathOk) {
    out.corpus_suspended = out.status !== "CLEAR" && out.status !== "CLEAR_WITH_DISCLOSURE";
    return out;
  }
  if (out.status === "CLEAR" || out.status === "CLEAR_WITH_DISCLOSURE") {
    out.status = "REVIEW_REQUIRED";
    out.reason_class = "protected_path_unavailable";
  }
  out.corpus_suspended = true;
  return out;
}
function confengePublicProjection(decision) {
  var c = CONFENGE_CONFLICT_GATE;
  var status = decision && decision.status;
  if ((c.statuses || []).indexOf(status) < 0) status = "UNKNOWN";
  var next = (c.next_steps || {})[status] || (c.next_steps || {}).UNKNOWN;
  var payload = {
    status: status,
    next_step: next,
    policy_version: (decision && decision.policy_version) || c.contract_version,
    corpus_suspended: !!(decision && decision.corpus_suspended) || (status !== "CLEAR" && status !== "CLEAR_WITH_DISCLOSURE"),
    public_readback: status + ": " + next
  };
  var keys = c.public_projection_keys || [];
  var out = {};
  for (var i = 0; i < keys.length; i++) if (payload[keys[i]] !== undefined) out[keys[i]] = payload[keys[i]];
  return out;
}
function confengeEvaluateConflict(raw) {
  var inner = confengeScreenConflict(raw);
  var adapted = confengeAdaptProtectedPath(inner, raw);
  return confengePublicProjection(adapted);
}

  window.confengeEvaluateConflict = confengeEvaluateConflict;
  var form = document.getElementById("conflict-gate-form");
  var out = document.getElementById("conflict-gate-result");
  if (!form || !out) return;
  Array.prototype.forEach.call(form.querySelectorAll("[data-conflict-input]"), function (el) {
    el.disabled = false;
  });
  var submit = form.querySelector("[data-conflict-submit]");
  if (submit) submit.disabled = false;
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
    var pub = confengeEvaluateConflict(facts) || {};
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
      CLEAR_WITH_DISCLOSURE: "segue com condição registrada",
      REVIEW_REQUIRED: "análise humana necessária",
      DECLINE: "demanda não aceita",
      UNKNOWN: "faltam informações"
    };
    out.setAttribute("data-conflict-gate-result", status);
    out.textContent = "Estado: " + (labels[status] || labels.UNKNOWN) + ". " + (pub.next_step || "");
  });
})();
