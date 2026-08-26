/**
 * Intent → action matrix lookup. Pure: no I/O besides the versioned JSON.
 */
const path = require("path");
const { validateAgendaGate } = require("./agenda-gate.cjs");

const MATRIX_PATH = path.join(
  __dirname,
  "../../docs/contracts/intent-action/intent-action-matrix.v1.json",
);
const AUTHORIZED_ROUTE_SLA = Object.freeze({
  contratar_relatorio_inteligencia_599:
    "delivery_within_3_business_days_from_valid_persisted_form_submission",
});

let _cached = null;
function loadMatrix() {
  if (_cached) return _cached;
  _cached = require(MATRIX_PATH);
  return _cached;
}

function matrixVersion() {
  const m = loadMatrix();
  return { schema: m.schema, version: m.version, as_of: m.as_of };
}

function listRoutes() {
  return loadMatrix().routes.slice();
}

function getRoute(intentId) {
  return listRoutes().find((r) => r.id === intentId || r.intent === intentId) || null;
}

function firstCanary() {
  return loadMatrix().first_canary;
}

function firstCanaryCta() {
  return firstCanary().primary_cta;
}

function slaPolicy() {
  return loadMatrix().sla_policy;
}

function optInAuthorized() {
  return Boolean(loadMatrix().opt_in_issue_90 && loadMatrix().opt_in_issue_90.authorized);
}

function operationalChannel(name) {
  const ch = loadMatrix().operational_channels || {};
  return ch[name] || null;
}

function requiredRouteFields() {
  return [
    "intent",
    "eligibility",
    "promised_outcome",
    "minimum_fields",
    "owner",
    "channel",
    "sla",
    "privacy_consent",
    "fallback",
    "kill_gate",
    "offer_id",
  ];
}

function validateMatrixShape(matrix) {
  const src = matrix || loadMatrix();
  const missing = [];
  const routes = src.routes || [];
  const ids = new Set();
  for (const route of routes) {
    for (const field of requiredRouteFields()) {
      if (route[field] == null || route[field] === "") {
        missing.push(`${route.id || "?"}.${field}`);
      }
    }
    const expectedSla = AUTHORIZED_ROUTE_SLA[route.id] || "UNKNOWN";
    if (route.sla !== expectedSla) missing.push(`${route.id}.sla_not_authorized`);
    if (route.auto_send !== false) missing.push(`${route.id}.auto_send`);
    if (route.id) ids.add(route.id);
  }
  const expected = [
    "aprender_mercado",
    "entender_contrato",
    "ver_propria_empresa",
    "revisar_contrato",
    "urgencia_real",
    "ainda_nao_pronto",
  ];
  for (const id of expected) {
    if (!ids.has(id)) missing.push(`missing_route:${id}`);
  }
  const cta = src.first_canary && src.first_canary.primary_cta;
  if (cta !== "Veja sua empresa neste mercado") {
    missing.push("first_canary_cta");
  }
  const agendaGate = validateAgendaGate(src);
  for (const error of agendaGate.errors) missing.push(`agenda_gate:${error}`);
  return { ok: missing.length === 0, missing, route_count: routes.length };
}

module.exports = {
  MATRIX_PATH,
  loadMatrix,
  matrixVersion,
  listRoutes,
  getRoute,
  firstCanary,
  firstCanaryCta,
  slaPolicy,
  optInAuthorized,
  operationalChannel,
  requiredRouteFields,
  validateAgendaGate,
  validateMatrixShape,
};
