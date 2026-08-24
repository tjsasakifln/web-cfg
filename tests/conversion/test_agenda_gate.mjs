#!/usr/bin/env node

import assert from "node:assert/strict";
import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const matrixModule = require(path.join(root, "scripts/conversion/matrix.cjs"));
const gate = require(path.join(root, "scripts/conversion/agenda-gate.cjs"));
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agenda-gate-"));
const fixtureOptions = { root: fixtureRoot };
const snapshotPath = "docs/evidence/commercial-latency/warmbly-55.synthetic.json";
childProcess.execFileSync("git", ["init", "-q"], { cwd: fixtureRoot });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function snapshotFromBaseline(baseline) {
  return {
    schema: gate.SNAPSHOT_SCHEMA,
    status: baseline.status,
    owner: baseline.owner,
    source_issue: baseline.source_issue,
    evidence_ref: baseline.evidence_ref,
    measured_at: baseline.measured_at,
    period_start: baseline.period_start,
    period_end: baseline.period_end,
    sample_count: baseline.sample_count,
    representative: baseline.representative,
    stage_interval: baseline.stage_interval,
    route_scope: baseline.route_scope,
    source_clock: baseline.source_clock,
    timezone: baseline.timezone,
    metrics: clone(baseline.metrics),
    privacy: { aggregate_only: true, pii_included: false },
  };
}

function writeSnapshot(matrix, mutate = null) {
  const baseline = matrix.operational_channels.agenda.baseline;
  const snapshot = snapshotFromBaseline(baseline);
  if (mutate) mutate(snapshot);
  const bytes = `${JSON.stringify(snapshot, null, 2)}\n`;
  const absolutePath = path.join(fixtureRoot, snapshotPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, bytes);
  baseline.snapshot_path = snapshotPath;
  baseline.snapshot_sha256 = sha256(bytes);
}

function measuredActivation() {
  const matrix = clone(matrixModule.loadMatrix());
  const agenda = matrix.operational_channels.agenda;
  const evidence = `https://github.com/tjsasakifln/warmbly/blob/${"a".repeat(40)}/docs/evidence/commercial-latency.json`;
  matrix.as_of = "2026-09-15";
  agenda.exists = true;
  agenda.owner = "tiago-jun-sasaki";
  agenda.route_url = "https://confenge.com.br/agenda/";
  agenda.implementation_ref = "agenda/index.html";
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
  const implementation = path.join(fixtureRoot, agenda.implementation_ref);
  fs.mkdirSync(path.dirname(implementation), { recursive: true });
  fs.writeFileSync(implementation, "<!doctype html><title>Synthetic agenda fixture</title>\n");
  writeSnapshot(matrix);
  childProcess.execFileSync("git", ["add", "--", snapshotPath, agenda.implementation_ref], { cwd: fixtureRoot });
  return matrix;
}

function expectFailure(matrix, code) {
  const result = gate.validateAgendaGate(matrix, fixtureOptions);
  assert.equal(result.ok, false, `expected failure ${code}`);
  assert.ok(result.errors.includes(code), `${code} missing from ${JSON.stringify(result.errors)}`);
}

try {
  {
    const matrix = matrixModule.loadMatrix();
    const result = gate.validateAgendaGate(matrix);
    assert.deepEqual(result, { ok: true, errors: [], state: "DEFER", activated: false });
    assert.equal(matrix.operational_channels.agenda.exists, false);
    assert.equal(matrix.operational_channels.agenda.owner, null);
    assert.equal(matrix.operational_channels.agenda.route_url, null);
    assert.equal(matrix.operational_channels.agenda.implementation_ref, null);
    assert.equal(matrix.operational_channels.agenda.sla, "UNKNOWN");
    assert.equal(matrix.operational_channels.agenda.baseline.status, "MISSING");
    assert.equal(matrix.operational_channels.agenda.baseline.snapshot_path, null);
    assert.equal(matrix.operational_channels.agenda.baseline.snapshot_sha256, null);
  }

  {
    const matrix = clone(matrixModule.loadMatrix());
    matrix.operational_channels.agenda.exists = true;
    expectFailure(matrix, "active_agenda_owner_missing");
    expectFailure(matrix, "active_agenda_route_url_invalid");
    expectFailure(matrix, "active_agenda_implementation_ref_missing");
    expectFailure(matrix, "active_baseline_not_measured");
    expectFailure(matrix, "active_baseline_snapshot_path_invalid");
  }

  {
    const matrix = clone(matrixModule.loadMatrix());
    matrix.operational_channels.agenda.decision_evidence = [
      `https://attacker.invalid/${gate.WEB_CFG_248}`,
      `prefix-${gate.DECISION_DOC}`,
    ];
    expectFailure(matrix, "agenda_issue_evidence_missing");
    expectFailure(matrix, "agenda_local_evidence_missing");
  }

  {
    const matrix = measuredActivation();
    matrix.operational_channels.agenda.owner = "UNKNOWN";
    expectFailure(matrix, "active_agenda_owner_placeholder");
  }

  {
    const matrix = measuredActivation();
    matrix.operational_channels.agenda.route_url = "https://warmbly.example/agenda/";
    expectFailure(matrix, "active_agenda_route_url_invalid");
  }

  {
    const matrix = measuredActivation();
    matrix.operational_channels.agenda.route_url = "https://confenge.com.br/outra-agenda/";
    expectFailure(matrix, "active_agenda_route_implementation_mismatch");
  }

  {
    const matrix = measuredActivation();
    fs.rmSync(path.join(fixtureRoot, matrix.operational_channels.agenda.implementation_ref));
    expectFailure(matrix, "active_agenda_implementation_missing");
  }

  {
    const matrix = measuredActivation();
    childProcess.execFileSync(
      "git",
      ["rm", "--cached", "-q", "--", snapshotPath, matrix.operational_channels.agenda.implementation_ref],
      { cwd: fixtureRoot },
    );
    const result = gate.validateAgendaGate(matrix, fixtureOptions);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("active_agenda_implementation_not_versioned"));
    assert.ok(result.errors.includes("active_baseline_snapshot_not_versioned"));
  }

  {
    const matrix = measuredActivation();
    const comment = "https://github.com/tjsasakifln/warmbly/issues/55#issuecomment-123456";
    matrix.operational_channels.agenda.baseline.evidence_ref = comment;
    matrix.operational_channels.agenda.decision_evidence.push(comment);
    expectFailure(matrix, "active_baseline_evidence_not_immutable");
  }

  {
    const matrix = measuredActivation();
    matrix.operational_channels.agenda.baseline.snapshot_sha256 = "0".repeat(64);
    expectFailure(matrix, "active_baseline_snapshot_hash_mismatch");
  }

  {
    const matrix = measuredActivation();
    writeSnapshot(matrix, (snapshot) => {
      snapshot.metrics.p90_minutes = 181;
    });
    expectFailure(matrix, "active_baseline_snapshot_drift:metrics");
  }

  {
    const matrix = measuredActivation();
    writeSnapshot(matrix, (snapshot) => {
      snapshot.email = "person@example.invalid";
    });
    expectFailure(matrix, "active_baseline_snapshot_pii_forbidden");
  }

  {
    const matrix = measuredActivation();
    matrix.operational_channels.agenda.baseline.route_scope = "UNKNOWN";
    expectFailure(matrix, "active_baseline_route_scope_placeholder");
  }

  {
    const matrix = measuredActivation();
    matrix.operational_channels.agenda.baseline.source_clock = "TBD";
    expectFailure(matrix, "active_baseline_source_clock_placeholder");
  }

  {
    const matrix = measuredActivation();
    matrix.operational_channels.agenda.baseline.timezone = "UNKNOWN";
    expectFailure(matrix, "active_baseline_timezone_placeholder");
  }

  {
    const matrix = measuredActivation();
    matrix.operational_channels.agenda.baseline.timezone = "Mars/Olympus_Mons";
    expectFailure(matrix, "active_baseline_timezone_invalid");
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
    const result = gate.validateAgendaGate(matrix, fixtureOptions);
    assert.deepEqual(result, { ok: true, errors: [], state: "EXECUTE_NOW", activated: true });
    assert.equal(matrix.operational_channels.agenda.sla, "UNKNOWN");
  }
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("AGENDA_LATENCY_GATE_OK current=DEFER activation=ROUTE_PLUS_HASH_BOUND_SNAPSHOT sla=UNKNOWN");
