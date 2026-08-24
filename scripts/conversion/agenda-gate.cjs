/**
 * Fail-closed #248 agenda activation gate.
 *
 * A measured baseline describes observed history; it never becomes a public
 * response-time promise. Agenda SLA remains UNKNOWN in this contract version.
 */

const WARMBLY_55 = "https://github.com/tjsasakifln/warmbly/issues/55";
const WEB_CFG_248 = "https://github.com/tjsasakifln/web-cfg/issues/248";
const DECISION_DOC = "docs/ops/AGENDA-LATENCY-DEFER-248.md";
const SLA_POLICY = "UNKNOWN until Warmbly #55 measures a representative baseline. No invented prazo.";

const REQUIRED_FIELDS = Object.freeze([
  "operational_channels.agenda.owner",
  "operational_channels.agenda.activated_at",
  "operational_channels.agenda.baseline.status=MEASURED",
  "operational_channels.agenda.baseline.evidence_ref",
  "operational_channels.agenda.baseline.measured_at",
  "operational_channels.agenda.baseline.period_start",
  "operational_channels.agenda.baseline.period_end",
  "operational_channels.agenda.baseline.sample_count",
  "operational_channels.agenda.baseline.representative=true",
  "operational_channels.agenda.baseline.stage_interval",
  "operational_channels.agenda.baseline.route_scope",
  "operational_channels.agenda.baseline.source_clock",
  "operational_channels.agenda.baseline.timezone",
  "operational_channels.agenda.baseline.metrics.count",
  "operational_channels.agenda.baseline.metrics.median_minutes",
  "operational_channels.agenda.baseline.metrics.p75_minutes",
  "operational_channels.agenda.baseline.metrics.p90_minutes",
  "operational_channels.agenda.baseline.metrics.censored_open_cycles",
]);

const AGENDA_KEYS = new Set([
  "exists",
  "owner",
  "sla",
  "reason",
  "decision_state",
  "decision_owner",
  "decided_at",
  "next_review_at",
  "blocked_by",
  "decision_evidence",
  "baseline",
  "reopen_gate",
  "activated_at",
]);
const BASELINE_KEYS = new Set([
  "status",
  "owner",
  "source_issue",
  "evidence_ref",
  "measured_at",
  "period_start",
  "period_end",
  "sample_count",
  "representative",
  "stage_interval",
  "route_scope",
  "source_clock",
  "timezone",
  "metrics",
]);
const METRIC_KEYS = new Set([
  "count",
  "median_minutes",
  "p75_minutes",
  "p90_minutes",
  "censored_open_cycles",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IMMUTABLE_EVIDENCE_RE = /^https:\/\/github\.com\/tjsasakifln\/warmbly\/(?:issues\/55#issuecomment-\d+|commit\/[0-9a-f]{40}|blob\/[0-9a-f]{40}\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]+(?:#L\d+(?:-L\d+)?)?)$/;

function dateValue(value) {
  if (!DATE_RE.test(String(value || ""))) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function unknownKeys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function validateAgendaGate(matrix) {
  const errors = [];
  const channels = matrix && matrix.operational_channels;
  const agenda = channels && channels.agenda;

  if (!matrix || typeof matrix !== "object") return { ok: false, errors: ["matrix_missing"] };
  if (matrix.sla_policy !== SLA_POLICY) errors.push("sla_policy_drift");
  if (dateValue(matrix.as_of) == null) errors.push("matrix_as_of_invalid");
  if (!channels || typeof channels !== "object") return { ok: false, errors: [...errors, "operational_channels_missing"] };
  for (const channelName of ["whatsapp", "phone", "agenda"]) {
    const channel = channels[channelName];
    if (!channel || typeof channel !== "object") errors.push(`${channelName}_missing`);
    else if (channel.sla !== "UNKNOWN") errors.push(`${channelName}_sla_must_remain_unknown`);
  }
  if (!agenda || typeof agenda !== "object") return { ok: false, errors: [...errors, "agenda_missing"] };

  for (const key of unknownKeys(agenda, AGENDA_KEYS)) errors.push(`agenda_field_forbidden:${key}`);
  if (typeof agenda.exists !== "boolean") errors.push("agenda_exists_not_boolean");
  if (agenda.decision_owner !== "web-cfg/conversion") errors.push("agenda_decision_owner_missing");
  if (dateValue(agenda.decided_at) == null) errors.push("agenda_decided_at_invalid");
  if (dateValue(agenda.next_review_at) == null) errors.push("agenda_next_review_at_invalid");
  if (agenda.blocked_by !== WARMBLY_55) errors.push("agenda_blocker_drift");
  if (!Array.isArray(agenda.decision_evidence)) errors.push("agenda_decision_evidence_missing");
  else {
    if (!agenda.decision_evidence.includes(WEB_CFG_248)) errors.push("agenda_issue_evidence_missing");
    if (!agenda.decision_evidence.includes(DECISION_DOC)) errors.push("agenda_local_evidence_missing");
  }

  const reopen = agenda.reopen_gate;
  if (!reopen || typeof reopen !== "object") errors.push("agenda_reopen_gate_missing");
  else {
    if (reopen.same_pr_required !== true) errors.push("agenda_same_pr_gate_disabled");
    if (reopen.activation_decision_state !== "EXECUTE_NOW") errors.push("agenda_activation_state_drift");
    if (reopen.sla_after_activation !== "UNKNOWN") errors.push("agenda_activation_sla_drift");
    if (JSON.stringify(reopen.required_fields) !== JSON.stringify(REQUIRED_FIELDS)) {
      errors.push("agenda_required_fields_drift");
    }
    if (!String(reopen.rule || "").includes("same PR")) errors.push("agenda_atomic_rule_missing");
  }

  const baseline = agenda.baseline;
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    return { ok: false, errors: [...errors, "agenda_baseline_missing"] };
  }
  for (const key of unknownKeys(baseline, BASELINE_KEYS)) errors.push(`baseline_field_forbidden:${key}`);
  if (baseline.owner !== "warmbly/commercial-latency") errors.push("baseline_owner_drift");
  if (baseline.source_issue !== WARMBLY_55) errors.push("baseline_source_issue_drift");

  if (agenda.exists === false) {
    if (agenda.owner != null) errors.push("deferred_agenda_owner_must_be_null");
    if (agenda.activated_at != null) errors.push("deferred_agenda_activation_must_be_null");
    if (agenda.decision_state !== "DEFER") errors.push("deferred_agenda_state_must_be_defer");
    if (agenda.reason !== "no public booking route with owner and measured latency") {
      errors.push("deferred_agenda_reason_drift");
    }
    if (baseline.status !== "MISSING") errors.push("deferred_baseline_must_be_missing");
    for (const key of [
      "evidence_ref",
      "measured_at",
      "period_start",
      "period_end",
      "sample_count",
      "representative",
      "stage_interval",
      "route_scope",
      "source_clock",
      "timezone",
      "metrics",
    ]) {
      if (baseline[key] != null) errors.push(`deferred_baseline_${key}_must_be_null`);
    }
    return { ok: errors.length === 0, errors, state: "DEFER", activated: false };
  }

  if (agenda.decision_state !== "EXECUTE_NOW") errors.push("active_agenda_state_not_execute_now");
  if (typeof agenda.owner !== "string" || !agenda.owner.trim()) errors.push("active_agenda_owner_missing");
  if (agenda.reason != null) errors.push("active_agenda_reason_not_cleared");
  if (dateValue(agenda.activated_at) == null) errors.push("active_agenda_date_missing");
  if (baseline.status !== "MEASURED") errors.push("active_baseline_not_measured");
  if (!IMMUTABLE_EVIDENCE_RE.test(String(baseline.evidence_ref || ""))) {
    errors.push("active_baseline_evidence_not_immutable");
  }
  if (!Array.isArray(agenda.decision_evidence) || !agenda.decision_evidence.includes(baseline.evidence_ref)) {
    errors.push("active_baseline_not_in_decision_evidence");
  }
  if (baseline.representative !== true) errors.push("active_baseline_not_representative");
  if (!Number.isInteger(baseline.sample_count) || baseline.sample_count <= 0) errors.push("active_baseline_sample_invalid");
  if (baseline.stage_interval !== "first_commercial_action_to_conversation") {
    errors.push("active_baseline_stage_interval_invalid");
  }
  if (typeof baseline.route_scope !== "string" || !baseline.route_scope.trim()) errors.push("active_baseline_route_scope_missing");
  if (typeof baseline.source_clock !== "string" || !baseline.source_clock.trim()) errors.push("active_baseline_source_clock_missing");
  if (typeof baseline.timezone !== "string" || !baseline.timezone.trim()) errors.push("active_baseline_timezone_missing");

  const dates = {
    start: dateValue(baseline.period_start),
    end: dateValue(baseline.period_end),
    measured: dateValue(baseline.measured_at),
    activated: dateValue(agenda.activated_at),
    asOf: dateValue(matrix.as_of),
  };
  for (const [name, value] of Object.entries(dates)) {
    if (value == null) errors.push(`active_baseline_${name}_date_invalid`);
  }
  if (Object.values(dates).every((value) => value != null)) {
    if (!(dates.start <= dates.end && dates.end <= dates.measured && dates.measured <= dates.activated && dates.activated <= dates.asOf)) {
      errors.push("active_baseline_date_order_invalid");
    }
  }

  const metrics = baseline.metrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    errors.push("active_baseline_metrics_missing");
  } else {
    for (const key of unknownKeys(metrics, METRIC_KEYS)) errors.push(`baseline_metric_forbidden:${key}`);
    if (!Number.isInteger(metrics.count) || metrics.count <= 0) errors.push("active_baseline_count_invalid");
    if (metrics.count !== baseline.sample_count) errors.push("active_baseline_count_mismatch");
    if (!Number.isInteger(metrics.censored_open_cycles) || metrics.censored_open_cycles < 0) {
      errors.push("active_baseline_censored_invalid");
    }
    const percentiles = [metrics.median_minutes, metrics.p75_minutes, metrics.p90_minutes];
    if (!percentiles.every((value) => Number.isFinite(value) && value >= 0)) {
      errors.push("active_baseline_percentile_invalid");
    } else if (!(percentiles[0] <= percentiles[1] && percentiles[1] <= percentiles[2])) {
      errors.push("active_baseline_percentile_order_invalid");
    }
  }

  return { ok: errors.length === 0, errors, state: agenda.decision_state, activated: true };
}

module.exports = {
  DECISION_DOC,
  IMMUTABLE_EVIDENCE_RE,
  REQUIRED_FIELDS,
  SLA_POLICY,
  WARMBLY_55,
  WEB_CFG_248,
  validateAgendaGate,
};
