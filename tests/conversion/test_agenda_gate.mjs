#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const matrixModule = require(path.join(root, "scripts/conversion/matrix.cjs"));
const gate = require(path.join(root, "scripts/conversion/agenda-gate.cjs"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function measuredActivation() {
  const matrix = clone(matrixModule.loadMatrix());
  const agenda = matrix.operational_channels.agenda;
  const evidence = "https://github.com/tjsasakifln/warmbly/issues/55#issuecomment-123456";
  matrix.as_of = "2026-09-15";
  agenda.exists = true;
  agenda.owner = "tiago-jun-sasaki";
  agenda.reason = null;
  agenda.decision_state = "EXECUTE_NOW";
  agenda.activated_at = "2026-09-15";
  agenda.decision_evidence.push(evidence);
  Object.assign(agenda.baseline, {
    status: "MEASURED",
    evidence_ref: evidence,
    measured_at: "2026-09-14",
    period_start: "2026-08-15",
    period_end: "2026-09-13",
    sample_count: 20,
    representative: true,
    stage_interval: "first_commercial_action_to_conversation",
    route_scope: "representative_existing_owned_routes",
    source_clock: "warmbly.commercial_event.occurred_at",
    timezone: "America/Sao_Paulo",
    metrics: {
      count: 20,
      median_minutes: 60,
      p75_minutes: 120,
      p90_minutes: 180,
      censored_open_cycles: 3,
    },
  });
  return matrix;
}

function expectFailure(matrix, code) {
  const result = gate.validateAgendaGate(matrix);
  assert.equal(result.ok, false, `expected failure ${code}`);
  assert.ok(result.errors.includes(code), `${code} missing from ${JSON.stringify(result.errors)}`);
}

{
  const matrix = matrixModule.loadMatrix();
  const result = gate.validateAgendaGate(matrix);
  assert.deepEqual(result, { ok: true, errors: [], state: "DEFER", activated: false });
  assert.equal(matrix.operational_channels.agenda.exists, false);
  assert.equal(matrix.operational_channels.agenda.owner, null);
  assert.equal(matrix.operational_channels.agenda.sla, "UNKNOWN");
  assert.equal(matrix.operational_channels.agenda.baseline.status, "MISSING");
}

{
  const matrix = clone(matrixModule.loadMatrix());
  matrix.operational_channels.agenda.exists = true;
  expectFailure(matrix, "active_agenda_owner_missing");
  expectFailure(matrix, "active_baseline_not_measured");
}

{
  const matrix = measuredActivation();
  delete matrix.operational_channels.agenda.owner;
  expectFailure(matrix, "active_agenda_owner_missing");
}

{
  const matrix = measuredActivation();
  matrix.operational_channels.agenda.baseline.evidence_ref = gate.WARMBLY_55;
  expectFailure(matrix, "active_baseline_evidence_not_immutable");
}

{
  const matrix = measuredActivation();
  matrix.operational_channels.agenda.baseline.measured_at = null;
  expectFailure(matrix, "active_baseline_measured_date_invalid");
}

{
  const matrix = measuredActivation();
  matrix.operational_channels.agenda.sla = "retorno em 24 horas";
  expectFailure(matrix, "agenda_sla_must_remain_unknown");
}

{
  const matrix = measuredActivation();
  matrix.operational_channels.agenda.promised_response_hours = 24;
  expectFailure(matrix, "agenda_field_forbidden:promised_response_hours");
}

{
  const matrix = measuredActivation();
  matrix.operational_channels.agenda.baseline.metrics.p75_minutes = 40;
  expectFailure(matrix, "active_baseline_percentile_order_invalid");
}

{
  const matrix = measuredActivation();
  matrix.operational_channels.agenda.baseline.metrics.count = 19;
  expectFailure(matrix, "active_baseline_count_mismatch");
}

{
  const matrix = measuredActivation();
  const result = gate.validateAgendaGate(matrix);
  assert.deepEqual(result, { ok: true, errors: [], state: "EXECUTE_NOW", activated: true });
  assert.equal(matrix.operational_channels.agenda.sla, "UNKNOWN");
}

console.log("AGENDA_LATENCY_GATE_OK current=DEFER activation=ATOMIC_EVIDENCE_REQUIRED sla=UNKNOWN");
