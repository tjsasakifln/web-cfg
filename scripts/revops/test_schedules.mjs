/**
 * Structural + unit proof that scheduled operations are versioned and runnable.
 * Does not require production secrets for core assertions.
 */
import { readFileSync, existsSync, mkdtempSync, readdirSync } from "fs";
import { execFileSync, execSync } from "child_process";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { createHash } from "crypto";
import { createOpsJsonClient } from "./ops_fetch.mjs";
import {
  commercialFunnelSummary,
  inboundAuditSummary,
  inboundConfigurationSummary,
  inboundCountersSummary,
  inboundDryRunSummary,
  inboundTransportConfigured,
  inboundTransportProofReady,
  inboundTransportReady,
} from "./inbound_proof_contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let failed = 0;
function pass(n, d = "") {
  console.log("PASS", n, d);
}

// 2c) An unhandled transport failure still emits a machine-readable partial report.
{
  const proofDir = mkdtempSync(join(tmpdir(), "confenge-daily-partial-"));
  let failedAsExpected = false;
  try {
    execFileSync(process.execPath, [resolve(ROOT, "scripts/revops/scheduled_daily.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
      env: {
        ...process.env,
        BASE_URL: "http://127.0.0.1:9",
        EXPECTED_SHA: "test-sha",
        OPS_TOKEN: "unit-test-token",
        OPS_FETCH_MAX_ATTEMPTS: "2",
        OPS_FETCH_BACKOFF_MS: "0",
        REVOPS_RUN_DIR: proofDir,
      },
    });
  } catch {
    failedAsExpected = true;
  }
  const reports = readdirSync(proofDir).filter((name) => name.endsWith(".json"));
  const partial = reports.length === 1
    ? JSON.parse(readFileSync(resolve(proofDir, reports[0]), "utf8"))
    : null;
  if (!failedAsExpected || !partial || partial.ok !== false || partial.completed !== false) {
    fail("daily_partial_report_on_failure", partial || reports);
  } else pass("daily_partial_report_on_failure", reports[0]);
  if (JSON.stringify(partial || {}).includes("unit-test-token")) fail("daily_partial_report_secret_safe");
  else pass("daily_partial_report_secret_safe");
}
function fail(n, d) {
  console.error("FAIL", n, d);
  failed += 1;
}

// #267: merely returning a configuration object is not production readiness.
{
  const ready = {
    webhook_url: "SET",
    webhook_secret: "SET",
    contract: "READY",
    reason: null,
    destination_fingerprint: "WARMBLY_PRODUCTION_V1",
  };
  if (!inboundTransportReady(ready)) fail("inbound_proof_ready_contract", ready);
  else pass("inbound_proof_ready_contract");
  for (const drift of [
    { ...ready, webhook_url: "UNSET" },
    { ...ready, webhook_secret: "UNSET" },
    { ...ready, contract: "BLOCKED", reason: "destination_unhealthy" },
    { ...ready, destination_fingerprint: "UNEXPECTED" },
    null,
  ]) {
    if (inboundTransportReady(drift)) fail("inbound_proof_rejects_configuration_drift", drift);
  }
  pass("inbound_proof_rejects_configuration_drift");
  const summary = inboundConfigurationSummary(null);
  if (summary.webhook_url !== "MISSING" || summary.webhook_secret !== "MISSING") {
    fail("inbound_proof_missing_configuration_summary", summary);
  } else pass("inbound_proof_missing_configuration_summary");
  if (inboundTransportProofReady({ status: 503, body: { ok: true, configuration: ready } })) {
    fail("inbound_proof_http_failure_cannot_report_ready");
  } else pass("inbound_proof_http_failure_cannot_report_ready");
  if (inboundTransportProofReady({ status: 200, body: { ok: false, configuration: ready } })) {
    fail("inbound_proof_body_failure_cannot_report_ready");
  } else pass("inbound_proof_body_failure_cannot_report_ready");
  if (!inboundTransportProofReady({ status: 200, body: { ok: true, configuration: ready } })) {
    fail("inbound_proof_full_response_ready");
  } else pass("inbound_proof_full_response_ready");
  if (inboundTransportReady({ ...ready, raw_url: "https://must-not-persist.invalid" })) {
    fail("inbound_proof_configuration_schema_closed");
  } else pass("inbound_proof_configuration_schema_closed");
  const hostileSummary = inboundConfigurationSummary({
    webhook_url: "https://person@example.com/?token=secret",
    webhook_secret: "actual-secret",
    contract: "READY",
    reason: "person@example.com",
    destination_fingerprint: "WARMBLY_PRODUCTION_V1",
  });
  const expectedHostileSummary = {
    webhook_url: "UNEXPECTED",
    webhook_secret: "UNEXPECTED",
    contract: "READY",
    reason: "UNEXPECTED",
    destination_fingerprint: "WARMBLY_PRODUCTION_V1",
  };
  if (JSON.stringify(hostileSummary) !== JSON.stringify(expectedHostileSummary)) {
    fail("inbound_proof_configuration_summary_allowlist", hostileSummary);
  } else pass("inbound_proof_configuration_summary_allowlist");

  const counters = {
    persisted_leads: 1,
    pending: 0,
    delivered: 0,
    retryable: 0,
    retries: 0,
    permanent_failures: 0,
    skipped: 1,
    blocked: 0,
    dead: 0,
    latency: { count: 0, last_ms: null, p50_ms: null, p95_ms: null },
  };
  if (!inboundCountersSummary(counters)) fail("inbound_proof_counter_contract", counters);
  else pass("inbound_proof_counter_contract");
  if (inboundCountersSummary({ ...counters, client_name: "must-not-persist" })) {
    fail("inbound_proof_counter_schema_closed");
  } else pass("inbound_proof_counter_schema_closed");

  const audit = {
    total: 1,
    by_status: { SKIPPED: 1 },
    by_reason: { not_configured: 1 },
    by_record_kind: { real: 1 },
    by_consent_state: { EXPLICIT_TRUE: 1 },
    by_commercial_eligibility: { ELIGIBLE_REAL_NOT_CONFIGURED: 1 },
    by_created_at_window: { "2026-08": 1 },
    eligible_real_not_configured: 1,
    never_requeue: 0,
    manual_review: 0,
    suppressed: 0,
    already_delivered: 0,
    other: 0,
    reason_counts: { eligible_real_not_configured: 1 },
  };
  if (!inboundAuditSummary(audit)) fail("inbound_proof_audit_contract", audit);
  else pass("inbound_proof_audit_contract");
  const hostileAudit = { ...audit, by_reason: { "person@example.com": 1 } };
  if (inboundAuditSummary(hostileAudit)) fail("inbound_proof_audit_dynamic_pii_key", hostileAudit);
  else pass("inbound_proof_audit_dynamic_pii_key");

  const dryRun = {
    eligible_count: 1,
    never_requeue_count: 0,
    manual_review_count: 0,
    reason_counts: { eligible_real_not_configured: 1 },
  };
  if (!inboundDryRunSummary(dryRun)) fail("inbound_proof_dry_run_contract", dryRun);
  else pass("inbound_proof_dry_run_contract");
  const funnel = {
    visitor: 0,
    cta_triggered: 0,
    form_started: 0,
    lead_persisted: 1,
    contacted: 0,
    qualified: 0,
    meeting: 0,
    proposal: 0,
    won: 0,
    lost: 0,
  };
  if (!commercialFunnelSummary(funnel)) fail("inbound_proof_funnel_contract", funnel);
  else pass("inbound_proof_funnel_contract");
}

// #267: committed production evidence stays aggregate-only and immutable.
{
  const proofPath = resolve(
    ROOT,
    "data/revops/inbound-proof-runs/inbound-issue-267-run-32685188116.json"
  );
  const proofBytes = readFileSync(proofPath);
  const proof = JSON.parse(proofBytes.toString("utf8"));
  const digest = createHash("sha256").update(proofBytes).digest("hex");
  if (digest !== "98ab2bae579a350ee07624a1bac835162253f580014c6bfcd7f69b79428da1ac") {
    fail("inbound_proof_committed_digest", digest);
  } else pass("inbound_proof_committed_digest");
  if (
    proof.schema !== "confenge-inbound-counters-proof/1.1" ||
    proof.issue !== 267 ||
    proof.ok !== true ||
    proof.transport_status !== "READY" ||
    !inboundTransportConfigured(proof.inbound_handoff_configuration) ||
    Object.prototype.hasOwnProperty.call(
      proof.inbound_handoff_configuration,
      "destination_fingerprint"
    )
  ) {
    fail("inbound_proof_committed_contract", proof);
  } else pass("inbound_proof_committed_contract", "immutable pre-fingerprint run");
  if (
    !inboundCountersSummary(proof.inbound_handoff_counters) ||
    !inboundAuditSummary(proof.skipped_requeue_audit) ||
    !inboundDryRunSummary(proof.skipped_requeue_dry_run) ||
    !commercialFunnelSummary(proof.funnel?.counts)
  ) {
    fail("inbound_proof_committed_aggregate_contracts", proof);
  } else pass("inbound_proof_committed_aggregate_contracts");
  if (
    proof.inbound_handoff_counters?.delivered !== 0 ||
    proof.consented_real_contact !== "MISSING" ||
    proof.real_loop_status !== "BLOCKED" ||
    !proof.non_claims?.includes("does_not_requeue_or_drain_any_record")
  ) {
    fail("inbound_proof_committed_residual", proof);
  } else pass("inbound_proof_committed_residual");
}

// 2d) The focal proof fails closed without the Actions secret and still emits evidence.
{
  const proofDir = mkdtempSync(join(tmpdir(), "confenge-inbound-proof-"));
  const env = {
    ...process.env,
    INBOUND_PROOF_RUN_DIR: proofDir,
  };
  delete env.OPS_TOKEN;
  let failedAsExpected = false;
  try {
    execFileSync(process.execPath, [resolve(ROOT, "scripts/revops/inbound_counters_proof.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
      env,
    });
  } catch {
    failedAsExpected = true;
  }
  const reports = readdirSync(proofDir).filter((name) => name.endsWith(".json"));
  const proof = reports.length === 1
    ? JSON.parse(readFileSync(resolve(proofDir, reports[0]), "utf8"))
    : null;
  if (!failedAsExpected || !proof || proof.ok !== false) fail("inbound_proof_missing_token_fails_closed", proof);
  else pass("inbound_proof_missing_token_fails_closed");
  if (proof?.consented_real_contact !== "MISSING" || proof?.real_loop_status !== "BLOCKED") {
    fail("inbound_proof_preserves_real_loop_blocker", proof);
  } else pass("inbound_proof_preserves_real_loop_blocker");
}

// #267: never send OPS_TOKEN to a caller-controlled proof base.
{
  const proofDir = mkdtempSync(join(tmpdir(), "confenge-inbound-base-"));
  const hostileBase = "https://person@example.invalid/?token=must-not-persist";
  let failedAsExpected = false;
  try {
    execFileSync(process.execPath, [resolve(ROOT, "scripts/revops/inbound_counters_proof.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
      env: {
        ...process.env,
        BASE_URL: hostileBase,
        OPS_TOKEN: "must-not-leave-the-runner",
        INBOUND_PROOF_RUN_DIR: proofDir,
      },
    });
  } catch {
    failedAsExpected = true;
  }
  const reports = readdirSync(proofDir).filter((name) => name.endsWith(".json"));
  const proof = reports.length === 1
    ? JSON.parse(readFileSync(resolve(proofDir, reports[0]), "utf8"))
    : null;
  const blob = JSON.stringify(proof || {});
  if (!failedAsExpected || !proof || proof.ok !== false || proof.base !== "UNEXPECTED") {
    fail("inbound_proof_noncanonical_base_fails_before_request", proof || reports);
  } else pass("inbound_proof_noncanonical_base_fails_before_request");
  if (proof?.ops_requests?.length !== 0 || blob.includes("example.invalid") || blob.includes("must-not")) {
    fail("inbound_proof_noncanonical_base_secret_safe", proof);
  } else pass("inbound_proof_noncanonical_base_secret_safe");
}

// 1) Workflow exists and is the single primary scheduler
const wf = resolve(ROOT, ".github/workflows/revops-scheduled.yml");
if (!existsSync(wf)) fail("workflow_present");
else {
  pass("workflow_present");
  const y = readFileSync(wf, "utf8");
  if (!y.includes("cron:") || !y.includes("15 11 * * *")) fail("daily_cron", y.slice(0, 200));
  else pass("daily_cron");
  if (!y.includes("0 12 * * 1")) fail("weekly_cron");
  else pass("weekly_cron");
  if (!y.includes("scheduled_daily.mjs")) fail("daily_entry");
  else pass("daily_entry");
  if (!y.includes("inbound_counters_proof.mjs") || !y.includes("inbound-proof")) {
    fail("inbound_proof_dispatch");
  } else pass("inbound_proof_dispatch");
  if (!y.includes("inbound-counters-proof-${{ github.run_id }}")) fail("inbound_proof_artifact");
  else pass("inbound_proof_artifact");
  if (!y.includes("scheduled_nurture.mjs")) fail("nurture_entry");
  else pass("nurture_entry");
  if (!y.includes("scheduled_weekly.mjs")) fail("weekly_entry");
  else pass("weekly_entry");
  if (!y.includes("search_demand_observatory.py sync")) fail("gsc_sync_entry");
  else pass("gsc_sync_entry");
  if (!y.includes("--allow-missing-creds")) fail("gsc_allow_missing_creds");
  else pass("gsc_allow_missing_creds");
  // Secrets not hardcoded
  if (/OPS_TOKEN:\s*['\"][^$]/.test(y)) fail("secret_hardcoded");
  else pass("secrets_via_env");
  if (!y.includes("if-no-files-found: error")) fail("partial_report_required");
  else pass("partial_report_required");
}

{
  const daily = readFileSync(resolve(ROOT, "scripts/revops/scheduled_daily.mjs"), "utf8");
  if (!daily.includes("produce_search_observation") || !daily.includes("drain_search_observation")) {
    fail("daily_search_observation");
  } else pass("daily_search_observation");
  if (!daily.includes("finally") || !daily.includes("persistProof()")) fail("daily_always_persists");
  else pass("daily_always_persists");
  if (!daily.includes('check("real_leads_sla"') || daily.includes("uncontacted_reals_listed")) {
    fail("daily_real_lead_sla_is_critical");
  } else pass("daily_real_lead_sla_is_critical");
  if (!daily.includes("action=sla_alert") || !daily.includes("real_leads_sla_alert_delivery")) {
    fail("daily_real_lead_sla_routes_owner");
  } else pass("daily_real_lead_sla_routes_owner");
  if (daily.includes("lead_ids:")) fail("daily_real_lead_sla_artifact_contains_ids");
  else pass("daily_real_lead_sla_artifact_is_aggregate");
  const toml = readFileSync(resolve(ROOT, "netlify.toml"), "utf8");
  if (!toml.includes("search-observation-tick") || !toml.includes("schedule")) {
    fail("netlify_search_observation_tick");
  } else pass("netlify_search_observation_tick");
}

// 2) Entry scripts exist
for (const rel of [
  "scripts/revops/scheduled_daily.mjs",
  "scripts/revops/inbound_counters_proof.mjs",
  "scripts/revops/ops_fetch.mjs",
  "scripts/revops/scheduled_nurture.mjs",
  "scripts/revops/scheduled_weekly.mjs",
]) {
  if (!existsSync(resolve(ROOT, rel))) fail("script_" + rel);
  else pass("script_" + rel);
}

// 2b) Safe ops reads retry with bounded backoff; mutating calls do not retry by default.
{
  let getCalls = 0;
  const waits = [];
  const summaries = [];
  const read = createOpsJsonClient({
    base: "https://ops.invalid",
    token: "test-token-that-must-not-appear",
    maxAttempts: 3,
    backoffMs: 10,
    sleep: async (milliseconds) => waits.push(milliseconds),
    onResult: (summary) => summaries.push(summary),
    fetchImpl: async (_url, options) => {
      getCalls += 1;
      if (getCalls < 3) throw new Error("UND_ERR_SOCKET");
      if (options.headers.Authorization !== "Bearer test-token-that-must-not-appear") {
        throw new Error("missing_auth_header");
      }
      return { status: 200, json: async () => ({ ok: true }) };
    },
  });
  const result = await read("/.netlify/functions/ops?action=funnel");
  if (result.status !== 200 || result.attempts !== 3) fail("ops_get_bounded_retry", result);
  else pass("ops_get_bounded_retry", `attempts=${result.attempts}`);
  if (waits.join(",") !== "10,20") fail("ops_get_exponential_backoff", waits);
  else pass("ops_get_exponential_backoff", waits.join(","));
  if (JSON.stringify(summaries).includes("test-token")) fail("ops_summary_secret_leak");
  else pass("ops_summary_secret_safe");

  let postCalls = 0;
  const write = createOpsJsonClient({
    base: "https://ops.invalid",
    token: "test-token",
    maxAttempts: 5,
    backoffMs: 0,
    sleep: async () => {},
    fetchImpl: async () => {
      postCalls += 1;
      throw new Error("UND_ERR_SOCKET");
    },
  });
  const post = await write("/.netlify/functions/ops?action=drain_inbound", { method: "POST" });
  if (postCalls !== 1 || post.attempts !== 1 || post.status !== 0) fail("ops_post_no_implicit_retry", post);
  else pass("ops_post_no_implicit_retry");

  let boundedCalls = 0;
  const bounded = createOpsJsonClient({
    base: "https://ops.invalid",
    maxAttempts: 99,
    backoffMs: 0,
    sleep: async () => {},
    fetchImpl: async () => {
      boundedCalls += 1;
      throw new Error("still_down");
    },
  });
  const exhausted = await bounded("/.netlify/functions/ops?action=health");
  if (boundedCalls !== 5 || exhausted.attempts !== 5) fail("ops_retry_upper_bound", exhausted);
  else pass("ops_retry_upper_bound", `attempts=${exhausted.attempts}`);

  let timeoutCalls = 0;
  const timesOut = createOpsJsonClient({
    base: "https://ops.invalid",
    maxAttempts: 2,
    backoffMs: 0,
    timeoutMs: 100,
    sleep: async () => {},
    fetchImpl: async (_url, options) => {
      timeoutCalls += 1;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      });
    },
  });
  const timedOut = await timesOut("/.netlify/functions/ops?action=inbound_handoff");
  if (timeoutCalls !== 2 || timedOut.attempts !== 2 || !timedOut.error?.includes("ops_fetch_timeout")) {
    fail("ops_attempt_timeout_bounded", timedOut);
  } else pass("ops_attempt_timeout_bounded", timedOut.error);
}

function parseJsonBlob(text) {
  const t = String(text || "").trim();
  try {
    return JSON.parse(t);
  } catch {
    // pretty-printed multi-line JSON
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("no_json_in_output");
  }
}

// 3) GSC sync fixture path works (real shipped CLI)
{
  const out = execSync(
    "python3 scripts/revops/search_demand_observatory.py sync --fixture",
    { cwd: ROOT, encoding: "utf8" }
  );
  const j = parseJsonBlob(out);
  if (!j.ok || j.rows < 1) fail("gsc_fixture_sync", out.slice(0, 200));
  else pass("gsc_fixture_sync", `rows=${j.rows}`);
  const latestImport = resolve(ROOT, "data/revops/gsc/latest_import.json");
  if (existsSync(latestImport)) {
    const latest = JSON.parse(readFileSync(latestImport, "utf8"));
    if (latest.source === "fixture" || latest.synthetic === true) {
      fail("fixture_did_not_clobber_latest_import", latest.source);
    } else pass("fixture_did_not_clobber_latest_import", latest.source);
  }
  if (!existsSync(resolve(ROOT, "data/revops/gsc/last_sync.json"))) fail("last_sync_written");
  else {
    const ls = JSON.parse(readFileSync(resolve(ROOT, "data/revops/gsc/last_sync.json"), "utf8"));
    if (!ls.last_sync_at) fail("last_sync_at", ls);
    else pass("last_sync_at", ls.last_sync_at);
    if (ls.ready_for_product_decisions === true) fail("fixture_not_product", ls);
    else pass("fixture_not_product");
    if (ls.source === "search_analytics_api" || ls.source_kind === "search_analytics_api") {
      fail("fixture_not_live_source", ls);
    } else pass("fixture_not_live_source", ls.source_kind || ls.source);
  }
}

// 4) Missing credentials reported exactly, not invented series
{
  const env = { ...process.env };
  delete env.GSC_CREDENTIALS_JSON;
  delete env.GSC_CLIENT_SECRETS_JSON;
  delete env.GSC_TOKEN_JSON;
  const out = execSync(
    "python3 scripts/revops/search_demand_observatory.py sync --allow-missing-creds --days 7",
    { cwd: ROOT, encoding: "utf8", env }
  );
  const j = parseJsonBlob(out);
  if (j.error !== "missing_credentials") fail("missing_creds_error", j);
  else pass("missing_creds_exact_error");
  if (!Array.isArray(j.required_env) || !j.required_env.some((x) => /GSC_CREDENTIALS/.test(x))) {
    fail("required_env_named", j.required_env);
  } else pass("required_env_named");
}

// 5) Package scripts wired
{
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  for (const k of ["revops:scheduled-daily", "revops:inbound-proof", "revops:gsc:sync", "test:schedules"]) {
    if (!pkg.scripts[k]) fail("npm_script_" + k);
    else pass("npm_script_" + k);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nALL schedule structural checks passed");
