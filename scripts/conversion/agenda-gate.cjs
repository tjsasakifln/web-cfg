/**
 * Fail-closed #248 agenda activation gate.
 *
 * A measured baseline describes observed history; it never becomes a public
 * response-time promise. Agenda SLA remains UNKNOWN in this contract version.
 */

const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const WARMBLY_55 = "https://github.com/tjsasakifln/warmbly/issues/55";
const WEB_CFG_248 = "https://github.com/tjsasakifln/web-cfg/issues/248";
const DECISION_DOC = "docs/ops/AGENDA-LATENCY-DEFER-248.md";
const MATRIX_PATH = "docs/contracts/intent-action/intent-action-matrix.v1.json";
const OPERATIONAL_OWNER = "tiago-jun-sasaki";
const SLA_POLICY = "Commercial response SLA is UNKNOWN until Warmbly #55 measures a representative baseline. Issue #331 authorizes a distinct Radar delivery clock: 3 business days from a valid persisted parameter submission, never from payment confirmation.";
const SNAPSHOT_SCHEMA = "warmbly.commercial-latency-baseline/1.1";
const SAMPLING_METHOD = "all_eligible_commercial_cycles";
const MINIMUM_CLOSED_CYCLES = 20;
const MINIMUM_WINDOW_DAYS = 28;
const MAXIMUM_BASELINE_AGE_DAYS = 30;
const REOPEN_RULE = "agenda.exists may change to true only in the same PR as the authorized operational owner, a canonical CONFENGE route with local implementation and CONFENGE_WEB attribution, and a local SHA-256-bound snapshot of an immutable Warmbly #55 baseline. The baseline must census every eligible cycle over at least 28 days, contain at least 20 closed cycles, and be no more than 30 days old at activation. activation_base_sha preserves and CI verifies the atomic PR boundary. SLA remains UNKNOWN; baseline is not a promised prazo.";
const REPO_ROOT = path.resolve(__dirname, "../..");

const REQUIRED_FIELDS = Object.freeze([
  "operational_channels.agenda.owner",
  "operational_channels.agenda.route_url",
  "operational_channels.agenda.implementation_ref",
  "operational_channels.agenda.activated_at",
  "operational_channels.agenda.activation_base_sha",
  "operational_channels.agenda.baseline.status=MEASURED",
  "operational_channels.agenda.baseline.evidence_ref",
  "operational_channels.agenda.baseline.snapshot_path",
  "operational_channels.agenda.baseline.snapshot_sha256",
  "operational_channels.agenda.baseline.measured_at",
  "operational_channels.agenda.baseline.period_start",
  "operational_channels.agenda.baseline.period_end",
  "operational_channels.agenda.baseline.sample_count",
  "operational_channels.agenda.baseline.eligible_cycle_count",
  "operational_channels.agenda.baseline.representative=true",
  `operational_channels.agenda.baseline.sampling_method=${SAMPLING_METHOD}`,
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
  "route_url",
  "implementation_ref",
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
  "activation_base_sha",
]);
const REOPEN_KEYS = new Set([
  "same_pr_required",
  "activation_decision_state",
  "sla_after_activation",
  "minimum_closed_cycles",
  "minimum_window_days",
  "maximum_baseline_age_days",
  "required_fields",
  "rule",
]);
const BASELINE_KEYS = new Set([
  "status",
  "owner",
  "source_issue",
  "evidence_ref",
  "snapshot_path",
  "snapshot_sha256",
  "measured_at",
  "period_start",
  "period_end",
  "sample_count",
  "eligible_cycle_count",
  "representative",
  "sampling_method",
  "stage_interval",
  "route_scope",
  "source_clock",
  "timezone",
  "metrics",
]);
const SNAPSHOT_KEYS = new Set([
  "schema",
  "status",
  "owner",
  "source_issue",
  "evidence_ref",
  "measured_at",
  "period_start",
  "period_end",
  "sample_count",
  "eligible_cycle_count",
  "representative",
  "sampling_method",
  "stage_interval",
  "route_scope",
  "source_clock",
  "timezone",
  "metrics",
  "privacy",
]);
const SNAPSHOT_BOUND_FIELDS = Object.freeze([
  "status",
  "owner",
  "source_issue",
  "evidence_ref",
  "measured_at",
  "period_start",
  "period_end",
  "sample_count",
  "eligible_cycle_count",
  "representative",
  "sampling_method",
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
const PRIVACY_KEYS = new Set(["aggregate_only", "pii_included"]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT_SHA_RE = /^[0-9a-f]{40}$/;
const IMMUTABLE_EVIDENCE_RE = /^https:\/\/github\.com\/tjsasakifln\/warmbly\/(?:commit\/[0-9a-f]{40}|blob\/[0-9a-f]{40}\/[A-Za-z0-9._~!$&'()*+,;=:\/-]+(?:#L\d+(?:-L\d+)?)?)$/;
const SNAPSHOT_PATH_RE = /^docs\/evidence\/commercial-latency\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const IMPLEMENTATION_PATH_RE = /^(?!_site\/)[A-Za-z0-9][A-Za-z0-9._\/-]*\/index\.html$/;
const IDENTIFIER_RE = /^[a-z0-9][a-z0-9._\/-]*$/;
const PLACEHOLDER_RE = /^(?:unknown|tbd|tba|todo|placeholder|pending|unassigned|unset|not[-_ ]?set|n\/?a|none|null|\?|-)$/i;
const PLACEHOLDER_TOKEN_RE = /(?:^|[._\/-])(?:unknown|tbd|tba|todo|placeholder|pending|unassigned|unset|none|null)(?:$|[._\/-])/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const FORBIDDEN_PII_KEYS = new Set([
  "name",
  "nome",
  "email",
  "e_mail",
  "phone",
  "telefone",
  "contact",
  "contato",
  "cpf",
  "cnpj",
  "message",
  "mensagem",
  "lead_id",
  "person_id",
  "participant_id",
]);

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

function hasExactReference(references, expected) {
  return Array.isArray(references)
    && references.some((reference) => typeof reference === "string" && reference === expected);
}

function meaningfulString(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0 && !isPlaceholder(value);
}

function isPlaceholder(value) {
  return PLACEHOLDER_RE.test(value) || PLACEHOLDER_TOKEN_RE.test(value);
}

function validateNamedField(errors, value, name, pattern = null) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`active_${name}_missing`);
  } else if (value.trim() !== value || isPlaceholder(value)) {
    errors.push(`active_${name}_placeholder`);
  } else if (pattern && !pattern.test(value)) {
    errors.push(`active_${name}_invalid`);
  }
}

function resolveLocalFile(root, relativePath, pattern) {
  if (!meaningfulString(relativePath) || !pattern.test(relativePath)) return null;
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (!absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) return null;
  try {
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return absolutePath;
  } catch {
    return null;
  }
}

function isTracked(root, relativePath) {
  const result = childProcess.spawnSync(
    "git",
    ["ls-files", "--error-unmatch", "--", relativePath],
    { cwd: root, encoding: "utf8", stdio: "ignore" },
  );
  return result.status === 0;
}

function gitResult(root, args) {
  return childProcess.spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function pullRequestContext(root) {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_EVENT_NAME !== "pull_request") return null;
  const base = gitResult(root, ["rev-parse", "HEAD^1"]);
  const head = gitResult(root, ["rev-parse", "HEAD^2"]);
  const baseSha = base.status === 0 ? base.stdout.trim() : "";
  const headSha = head.status === 0 ? head.stdout.trim() : "";
  return COMMIT_SHA_RE.test(baseSha) && COMMIT_SHA_RE.test(headSha) ? { baseSha, headSha } : null;
}

function activationDiff(errors, agenda, baseline, root, options) {
  const baseSha = String(agenda.activation_base_sha || "");
  if (!COMMIT_SHA_RE.test(baseSha)) {
    errors.push("active_activation_base_sha_invalid");
    return;
  }

  let changedPaths;
  if (options.activationDiff) {
    if (options.activationDiff.baseSha !== baseSha) {
      errors.push("active_activation_base_sha_mismatch");
      return;
    }
    changedPaths = new Set(options.activationDiff.changedPaths || []);
  } else {
    const prContext = pullRequestContext(root);
    if (process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_EVENT_NAME === "pull_request" && !prContext) {
      errors.push("active_pull_request_context_missing");
      return;
    }
    if (prContext && prContext.baseSha !== baseSha) {
      errors.push("active_activation_base_sha_not_pr_base");
      return;
    }
    const headRef = prContext?.headSha || "HEAD";
    if (gitResult(root, ["cat-file", "-e", `${baseSha}^{commit}`]).status !== 0) {
      errors.push("active_activation_base_sha_missing");
      return;
    }
    if (gitResult(root, ["merge-base", "--is-ancestor", baseSha, headRef]).status !== 0) {
      errors.push("active_activation_base_sha_not_ancestor");
      return;
    }
    const diff = gitResult(root, [
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "-z",
      `${baseSha}...${headRef}`,
    ]);
    if (diff.status !== 0) {
      errors.push("active_activation_diff_unavailable");
      return;
    }
    changedPaths = new Set(diff.stdout.split("\0").filter(Boolean));
  }

  for (const requiredPath of [MATRIX_PATH, agenda.implementation_ref, baseline.snapshot_path]) {
    if (!changedPaths.has(requiredPath)) {
      errors.push(`active_same_pr_path_missing:${requiredPath}`);
    }
  }
}

function expectedImplementationRef(routeUrl) {
  try {
    const parsed = new URL(routeUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "confenge.com.br" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.search ||
      parsed.hash ||
      parsed.href !== routeUrl
    ) return null;
    if (parsed.pathname === "/" || !parsed.pathname.endsWith("/") || parsed.pathname.includes("//")) return null;
    if (!/^\/[a-z0-9][a-z0-9\/-]*\/$/.test(parsed.pathname)) return null;
    return `${parsed.pathname.slice(1)}index.html`;
  } catch {
    return null;
  }
}

function validateImplementation(errors, absolutePath, routeUrl) {
  let html;
  try {
    html = fs.readFileSync(absolutePath, "utf8");
  } catch {
    errors.push("active_agenda_implementation_unreadable");
    return;
  }
  const canonicals = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"\s*>/g)]
    .map((match) => match[1]);
  if (canonicals.length !== 1 || canonicals[0] !== routeUrl) {
    errors.push("active_agenda_canonical_missing");
  }
  if (!html.includes("CONFENGE_WEB")) errors.push("active_agenda_attribution_missing");
  if (/smartlic|warmbly/i.test(html)) errors.push("active_agenda_public_brand_forbidden");
}

function containsPiiKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPiiKey);
  return Object.entries(value).some(([key, child]) => FORBIDDEN_PII_KEYS.has(key.toLowerCase()) || containsPiiKey(child));
}

function loadBoundSnapshot(errors, baseline, root) {
  let snapshot = null;
  if (!SNAPSHOT_PATH_RE.test(String(baseline.snapshot_path || ""))) {
    errors.push("active_baseline_snapshot_path_invalid");
    return null;
  }
  if (!SHA256_RE.test(String(baseline.snapshot_sha256 || ""))) {
    errors.push("active_baseline_snapshot_sha256_invalid");
    return null;
  }
  const absolutePath = resolveLocalFile(root, baseline.snapshot_path, SNAPSHOT_PATH_RE);
  if (!absolutePath) {
    errors.push("active_baseline_snapshot_missing");
    return null;
  }
  if (!isTracked(root, baseline.snapshot_path)) {
    errors.push("active_baseline_snapshot_not_versioned");
  }
  const bytes = fs.readFileSync(absolutePath);
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== baseline.snapshot_sha256) {
    errors.push("active_baseline_snapshot_hash_mismatch");
    return null;
  }
  try {
    snapshot = JSON.parse(bytes.toString("utf8"));
  } catch {
    errors.push("active_baseline_snapshot_json_invalid");
    return null;
  }
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    errors.push("active_baseline_snapshot_shape_invalid");
    return null;
  }
  for (const key of unknownKeys(snapshot, SNAPSHOT_KEYS)) errors.push(`baseline_snapshot_field_forbidden:${key}`);
  if (snapshot.schema !== SNAPSHOT_SCHEMA) errors.push("active_baseline_snapshot_schema_invalid");
  if (containsPiiKey(snapshot)) errors.push("active_baseline_snapshot_pii_forbidden");
  if (!snapshot.privacy || typeof snapshot.privacy !== "object" || Array.isArray(snapshot.privacy)) {
    errors.push("active_baseline_snapshot_privacy_missing");
  } else {
    for (const key of unknownKeys(snapshot.privacy, PRIVACY_KEYS)) errors.push(`baseline_snapshot_privacy_field_forbidden:${key}`);
    if (snapshot.privacy.aggregate_only !== true || snapshot.privacy.pii_included !== false) {
      errors.push("active_baseline_snapshot_not_aggregate_only");
    }
  }
  for (const field of SNAPSHOT_BOUND_FIELDS) {
    if (JSON.stringify(snapshot[field]) !== JSON.stringify(baseline[field])) {
      errors.push(`active_baseline_snapshot_drift:${field}`);
    }
  }
  return snapshot;
}

function validateAgendaGate(matrix, options = {}) {
  const errors = [];
  const root = options.root ? path.resolve(options.root) : REPO_ROOT;
  const channels = matrix && matrix.operational_channels;
  const agenda = channels && channels.agenda;
  const asOf = dateValue(matrix?.as_of);

  if (!matrix || typeof matrix !== "object") return { ok: false, errors: ["matrix_missing"] };
  if (matrix.sla_policy !== SLA_POLICY) errors.push("sla_policy_drift");
  if (asOf == null) errors.push("matrix_as_of_invalid");
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
  const decidedAt = dateValue(agenda.decided_at);
  const nextReviewAt = dateValue(agenda.next_review_at);
  if (decidedAt == null) errors.push("agenda_decided_at_invalid");
  if (nextReviewAt == null) errors.push("agenda_next_review_at_invalid");
  if (decidedAt != null && asOf != null && nextReviewAt != null && !(decidedAt <= asOf && asOf <= nextReviewAt)) {
    errors.push("agenda_review_window_invalid");
  }
  if (!Array.isArray(agenda.decision_evidence)) errors.push("agenda_decision_evidence_missing");
  else {
    if (!hasExactReference(agenda.decision_evidence, WEB_CFG_248)) errors.push("agenda_issue_evidence_missing");
    if (!hasExactReference(agenda.decision_evidence, DECISION_DOC)) errors.push("agenda_local_evidence_missing");
  }

  const reopen = agenda.reopen_gate;
  if (!reopen || typeof reopen !== "object") errors.push("agenda_reopen_gate_missing");
  else {
    for (const key of unknownKeys(reopen, REOPEN_KEYS)) errors.push(`agenda_reopen_field_forbidden:${key}`);
    if (reopen.same_pr_required !== true) errors.push("agenda_same_pr_gate_disabled");
    if (reopen.activation_decision_state !== "EXECUTE_NOW") errors.push("agenda_activation_state_drift");
    if (reopen.sla_after_activation !== "UNKNOWN") errors.push("agenda_activation_sla_drift");
    if (reopen.minimum_closed_cycles !== MINIMUM_CLOSED_CYCLES) errors.push("agenda_minimum_sample_drift");
    if (reopen.minimum_window_days !== MINIMUM_WINDOW_DAYS) errors.push("agenda_minimum_window_drift");
    if (reopen.maximum_baseline_age_days !== MAXIMUM_BASELINE_AGE_DAYS) errors.push("agenda_maximum_age_drift");
    if (JSON.stringify(reopen.required_fields) !== JSON.stringify(REQUIRED_FIELDS)) {
      errors.push("agenda_required_fields_drift");
    }
    if (reopen.rule !== REOPEN_RULE) errors.push("agenda_atomic_rule_drift");
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
    if (agenda.route_url != null) errors.push("deferred_agenda_route_url_must_be_null");
    if (agenda.implementation_ref != null) errors.push("deferred_agenda_implementation_ref_must_be_null");
    if (agenda.activated_at != null) errors.push("deferred_agenda_activation_must_be_null");
    if (agenda.activation_base_sha != null) errors.push("deferred_activation_base_sha_must_be_null");
    if (agenda.decision_state !== "DEFER") errors.push("deferred_agenda_state_must_be_defer");
    if (agenda.blocked_by !== WARMBLY_55) errors.push("deferred_agenda_blocker_drift");
    if (agenda.reason !== "no public booking route with owner and measured latency") {
      errors.push("deferred_agenda_reason_drift");
    }
    if (JSON.stringify(agenda.decision_evidence) !== JSON.stringify([WEB_CFG_248, DECISION_DOC])) {
      errors.push("deferred_agenda_decision_evidence_not_closed");
    }
    if (baseline.status !== "MISSING") errors.push("deferred_baseline_must_be_missing");
    for (const key of [
      "evidence_ref",
      "snapshot_path",
      "snapshot_sha256",
      "measured_at",
      "period_start",
      "period_end",
      "sample_count",
      "eligible_cycle_count",
      "representative",
      "sampling_method",
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
  validateNamedField(errors, agenda.owner, "agenda_owner", IDENTIFIER_RE);
  if (meaningfulString(agenda.owner) && agenda.owner !== OPERATIONAL_OWNER) {
    errors.push("active_agenda_owner_not_authorized");
  }
  if (agenda.reason != null) errors.push("active_agenda_reason_not_cleared");
  if (agenda.blocked_by != null) errors.push("active_agenda_blocker_not_cleared");
  if (dateValue(agenda.activated_at) == null) errors.push("active_agenda_date_missing");
  if (agenda.decided_at !== agenda.activated_at) errors.push("active_agenda_decision_date_mismatch");

  const expectedImplementation = expectedImplementationRef(agenda.route_url);
  if (!expectedImplementation) errors.push("active_agenda_route_url_invalid");
  validateNamedField(errors, agenda.implementation_ref, "agenda_implementation_ref", IMPLEMENTATION_PATH_RE);
  if (expectedImplementation && agenda.implementation_ref !== expectedImplementation) {
    errors.push("active_agenda_route_implementation_mismatch");
  }
  if (meaningfulString(agenda.implementation_ref) && IMPLEMENTATION_PATH_RE.test(agenda.implementation_ref)) {
    const absoluteImplementation = resolveLocalFile(root, agenda.implementation_ref, IMPLEMENTATION_PATH_RE);
    if (!absoluteImplementation) {
      errors.push("active_agenda_implementation_missing");
    } else if (!isTracked(root, agenda.implementation_ref)) {
      errors.push("active_agenda_implementation_not_versioned");
    } else {
      validateImplementation(errors, absoluteImplementation, agenda.route_url);
    }
  }

  if (baseline.status !== "MEASURED") errors.push("active_baseline_not_measured");
  if (!IMMUTABLE_EVIDENCE_RE.test(String(baseline.evidence_ref || ""))) {
    errors.push("active_baseline_evidence_not_immutable");
  }
  if (!hasExactReference(agenda.decision_evidence, baseline.evidence_ref)) {
    errors.push("active_baseline_not_in_decision_evidence");
  }
  if (
    JSON.stringify(agenda.decision_evidence) !==
    JSON.stringify([WEB_CFG_248, DECISION_DOC, baseline.evidence_ref])
  ) errors.push("active_agenda_decision_evidence_not_closed");
  loadBoundSnapshot(errors, baseline, root);
  if (baseline.representative !== true) errors.push("active_baseline_not_representative");
  if (!Number.isSafeInteger(baseline.sample_count) || baseline.sample_count < MINIMUM_CLOSED_CYCLES) {
    errors.push("active_baseline_sample_invalid");
  }
  if (!Number.isSafeInteger(baseline.eligible_cycle_count) || baseline.eligible_cycle_count < baseline.sample_count) {
    errors.push("active_baseline_eligible_cycle_count_invalid");
  }
  if (baseline.sampling_method !== SAMPLING_METHOD) errors.push("active_baseline_sampling_method_invalid");
  if (baseline.stage_interval !== "first_commercial_action_to_conversation") {
    errors.push("active_baseline_stage_interval_invalid");
  }
  validateNamedField(errors, baseline.route_scope, "baseline_route_scope", IDENTIFIER_RE);
  validateNamedField(errors, baseline.source_clock, "baseline_source_clock", IDENTIFIER_RE);
  validateNamedField(errors, baseline.timezone, "baseline_timezone");
  if (baseline.route_scope !== "representative_existing_owned_routes") errors.push("active_baseline_route_scope_invalid");
  if (baseline.source_clock !== "warmbly.commercial_event.occurred_at") errors.push("active_baseline_source_clock_invalid");
  if (baseline.timezone !== "America/Sao_Paulo") errors.push("active_baseline_timezone_invalid");

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
    const windowDays = Math.floor((dates.end - dates.start) / 86_400_000) + 1;
    if (windowDays < MINIMUM_WINDOW_DAYS) errors.push("active_baseline_window_too_short");
    const baselineAgeDays = Math.floor((dates.activated - dates.measured) / 86_400_000);
    if (baselineAgeDays > MAXIMUM_BASELINE_AGE_DAYS) errors.push("active_baseline_stale");
  }

  const metrics = baseline.metrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    errors.push("active_baseline_metrics_missing");
  } else {
    for (const key of unknownKeys(metrics, METRIC_KEYS)) errors.push(`baseline_metric_forbidden:${key}`);
    if (!Number.isSafeInteger(metrics.count) || metrics.count <= 0) errors.push("active_baseline_count_invalid");
    if (metrics.count !== baseline.sample_count) errors.push("active_baseline_count_mismatch");
    if (!Number.isSafeInteger(metrics.censored_open_cycles) || metrics.censored_open_cycles < 0) {
      errors.push("active_baseline_censored_invalid");
    }
    if (
      Number.isSafeInteger(metrics.count) &&
      Number.isSafeInteger(metrics.censored_open_cycles) &&
      metrics.count + metrics.censored_open_cycles !== baseline.eligible_cycle_count
    ) errors.push("active_baseline_eligible_cycle_count_mismatch");
    const percentiles = [metrics.median_minutes, metrics.p75_minutes, metrics.p90_minutes];
    if (!percentiles.every((value) => Number.isFinite(value) && value >= 0)) {
      errors.push("active_baseline_percentile_invalid");
    } else if (!(percentiles[0] <= percentiles[1] && percentiles[1] <= percentiles[2])) {
      errors.push("active_baseline_percentile_order_invalid");
    }
  }

  activationDiff(errors, agenda, baseline, root, options);

  return { ok: errors.length === 0, errors, state: agenda.decision_state, activated: true };
}

module.exports = {
  DECISION_DOC,
  IMMUTABLE_EVIDENCE_RE,
  MATRIX_PATH,
  MAXIMUM_BASELINE_AGE_DAYS,
  MINIMUM_CLOSED_CYCLES,
  MINIMUM_WINDOW_DAYS,
  OPERATIONAL_OWNER,
  REOPEN_RULE,
  REQUIRED_FIELDS,
  SAMPLING_METHOD,
  SLA_POLICY,
  SNAPSHOT_SCHEMA,
  WARMBLY_55,
  WEB_CFG_248,
  validateAgendaGate,
};
