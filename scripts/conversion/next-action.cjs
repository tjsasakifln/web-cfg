/**
 * Next-action eligibility from X-Ray state + matrix. Pure.
 */
const { getRoute, optInAuthorized, operationalChannel } = require("./matrix.cjs");

const ACTION_IDS = [
  "explorar_contratos",
  "pedir_segunda_leitura",
  "falar_especialista",
  "nenhuma",
];

function specialistRouteExists() {
  const wa = operationalChannel("whatsapp");
  return Boolean(wa && wa.exists);
}

function selectNextActions({ xrayState, intent } = {}) {
  const state = String(xrayState || "ERROR").toUpperCase();
  const actions = [];

  if (state === "READY" || state === "STALE") {
    actions.push({
      id: "explorar_contratos",
      label: "Explorar contratos observados",
      intent: "aprender_mercado",
      requires: [],
      sla: "UNKNOWN",
    });
  }

  if (state === "STALE") {
    actions.push({
      id: "dados_defasados",
      label: "Os dados observados podem estar defasados",
      intent: "aprender_mercado",
      requires: [],
      sla: "UNKNOWN",
      honesty: "STALE",
    });
  }

  if (state === "READY") {
    actions.push({
      id: "pedir_segunda_leitura",
      label: "Peca uma segunda leitura de contrato",
      intent: "revisar_contrato",
      requires: ["nome", "contato", "consentimento"],
      sla: "UNKNOWN",
    });
  }

  if (specialistRouteExists() && (state === "READY" || intent === "urgencia_real")) {
    const wa = operationalChannel("whatsapp");
    actions.push({
      id: "falar_especialista",
      label: "Falar com especialista",
      intent: "urgencia_real",
      channel: "whatsapp",
      owner: wa.owner,
      sla: "UNKNOWN",
      requires: [],
      href_catalog: "data/site/whatsapp-messages.json",
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "nenhuma",
      label: "Nenhuma acao agora",
      intent: "ainda_nao_pronto",
      sla: "UNKNOWN",
      requires: [],
    });
  }

  if (optInAuthorized()) {
    actions.push({
      id: "opt_in_brief",
      label: "Receber atualizacao",
      intent: "ainda_nao_pronto",
      sla: "UNKNOWN",
    });
  }

  return actions;
}

function fieldsForAction(actionId) {
  if (actionId === "pedir_segunda_leitura" || actionId === "revisar_contrato") {
    return ["nome", "contato", "consentimento", "public_contract_id_or_document_context"];
  }
  if (actionId === "ver_propria_empresa" || actionId === "xray") {
    return ["cnpj"];
  }
  return [];
}

function routeForAction(actionId) {
  const map = {
    explorar_contratos: "aprender_mercado",
    pedir_segunda_leitura: "revisar_contrato",
    falar_especialista: "urgencia_real",
    nenhuma: "ainda_nao_pronto",
  };
  return getRoute(map[actionId] || actionId);
}

module.exports = {
  ACTION_IDS,
  specialistRouteExists,
  selectNextActions,
  fieldsForAction,
  routeForAction,
};
