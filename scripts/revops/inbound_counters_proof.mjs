/**
 * Read-only production proof for #267.
 *
 * It verifies authenticated ops health and snapshots aggregate inbound/funnel
 * counters. It does not submit a lead, drain a queue, or prove a consented
 * commercial handoff.
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createOpsJsonClient } from "./ops_fetch.mjs";
import {
  commercialFunnelSummary,
  inboundAuditSummary,
  inboundConfigurationSummary,
  inboundCountersSummary,
  inboundDryRunSummary,
  inboundTransportProofReady,
} from "./inbound_proof_contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CANONICAL_BASE = "https://confenge.com.br";
const rawBase = String(process.env.BASE_URL || CANONICAL_BASE).trim();
const baseIsCanonical = rawBase === CANONICAL_BASE || rawBase === `${CANONICAL_BASE}/`;
const BASE = CANONICAL_BASE;
const TOKEN = process.env.OPS_TOKEN || "";
const out = {
  schema: "confenge-inbound-counters-proof/1.2",
  issue: 267,
  decision_state: "EXECUTE_NOW",
  executive_front: "REVENUE NOW",
  leverage: "revenue",
  evidence_scope: "read_only_authenticated_ops_configuration_and_aggregate_counters",
  base: baseIsCanonical ? CANONICAL_BASE : "UNEXPECTED",
  ts: new Date().toISOString(),
  git_sha: /^[0-9a-f]{40}$/.test(String(process.env.GITHUB_SHA || ""))
    ? process.env.GITHUB_SHA
    : null,
  checks: [],
  ops_requests: [],
  consented_real_contact: "MISSING",
  real_loop_status: "BLOCKED",
  non_claims: [
    "does_not_prove_warmbly_auto_send_is_off",
    "does_not_prove_a_consented_real_contact_exists",
    "does_not_prove_end_to_end_commercial_handoff",
    "does_not_requeue_or_drain_any_record",
  ],
};
const OPS_PATHS = new Set([
  "/.netlify/functions/ops?action=audit_inbound_requeue",
  "/.netlify/functions/ops?action=funnel",
  "/.netlify/functions/ops?action=health",
  "/.netlify/functions/ops?action=inbound_handoff",
  "/.netlify/functions/ops?action=requeue_inbound",
]);
let unsafeOpsRequestSummary = false;

function safeOpsRequestSummary(summary) {
  const safe = summary &&
    OPS_PATHS.has(summary.path) &&
    ["GET", "POST"].includes(summary.method) &&
    Number.isInteger(summary.status) && summary.status >= 0 && summary.status <= 599 &&
    Number.isInteger(summary.attempts) && summary.attempts >= 1 && summary.attempts <= 5;
  if (!safe) {
    unsafeOpsRequestSummary = true;
    return {
      path: "UNEXPECTED",
      method: "UNEXPECTED",
      status: 0,
      attempts: 0,
      error: "TRANSPORT_ERROR",
    };
  }
  return {
    path: summary.path,
    method: summary.method,
    status: summary.status,
    attempts: summary.attempts,
    error: summary.error ? "TRANSPORT_ERROR" : null,
  };
}

function check(name, ok, detail = "") {
  out.checks.push({ name, ok, detail, critical: true });
  console.log(ok ? "PASS" : "FAIL", name, detail);
}

const request = createOpsJsonClient({
  base: BASE,
  token: TOKEN,
  onResult: (summary) => out.ops_requests.push(safeOpsRequestSummary(summary)),
});

async function run() {
  check("production_base_canonical", baseIsCanonical, `base=${out.base}`);
  if (!baseIsCanonical) return;
  if (!TOKEN) {
    check("ops_token_configured", false, "OPS_TOKEN missing from workflow environment");
    return;
  }
  check("ops_token_configured", true, "configured=true");

  const health = await request("/.netlify/functions/ops?action=health");
  check(
    "ops_health_authenticated",
    health.status === 200 && health.body.ok === true && health.body.auth_configured === true,
    `http=${health.status} auth_configured=${health.body.auth_configured === true}`
  );

  const inbound = await request("/.netlify/functions/ops?action=inbound_handoff");
  const counters = inbound.body?.counters;
  const countersSummary = inboundCountersSummary(counters);
  check(
    "inbound_handoff_counters",
    inbound.status === 200 && inbound.body.ok === true && countersSummary !== null,
    `http=${inbound.status} aggregate_contract_valid=${countersSummary !== null}`
  );
  out.inbound_handoff_counters = countersSummary;
  const configuration = inbound.body?.configuration;
  check(
    "inbound_handoff_configuration_observable",
    inbound.status === 200 && configuration && typeof configuration === "object",
    `http=${inbound.status} configuration_present=${Boolean(configuration && typeof configuration === "object")}`
  );
  out.inbound_handoff_configuration = inboundConfigurationSummary(configuration);
  const transportReady = inboundTransportProofReady(inbound);
  check(
    "inbound_transport_configuration_ready",
    transportReady,
    `http=${inbound.status} configuration=${JSON.stringify(inboundConfigurationSummary(configuration))}`
  );
  out.transport_status = transportReady ? "READY" : "BLOCKED";

  const audit = await request("/.netlify/functions/ops?action=audit_inbound_requeue");
  const skippedAudit = audit.body?.audit;
  const skippedAuditSummary = inboundAuditSummary(skippedAudit);
  check(
    "skipped_requeue_audit_aggregate_only",
    audit.status === 200 && audit.body.ok === true && skippedAuditSummary !== null,
    `http=${audit.status} aggregate_contract_valid=${skippedAuditSummary !== null}`
  );
  out.skipped_requeue_audit = skippedAuditSummary;

  const requeueDryRun = await request("/.netlify/functions/ops?action=requeue_inbound", {
    method: "POST",
    body: JSON.stringify({ mode: "eligible_only", dry_run: true }),
  });
  const dryRunSummary = {
    eligible_count: requeueDryRun.body?.eligible_count,
    never_requeue_count: requeueDryRun.body?.never_requeue_count,
    manual_review_count: requeueDryRun.body?.manual_review_count,
    reason_counts: requeueDryRun.body?.reason_counts,
  };
  const safeDryRunSummary = inboundDryRunSummary(dryRunSummary);
  check(
    "skipped_requeue_dry_run_aggregate_only",
    requeueDryRun.status === 200 &&
      requeueDryRun.body.ok === true &&
      requeueDryRun.body.dry_run === true &&
      safeDryRunSummary !== null,
    `http=${requeueDryRun.status} dry_run=${requeueDryRun.body.dry_run === true} aggregate_contract_valid=${safeDryRunSummary !== null}`
  );
  out.skipped_requeue_dry_run = safeDryRunSummary;

  const funnel = await request("/.netlify/functions/ops?action=funnel");
  const funnelCounts = funnel.body?.funnel?.counts;
  const funnelSummary = commercialFunnelSummary(funnelCounts);
  check(
    "commercial_funnel_counters",
    funnel.status === 200 &&
      funnel.body.ok === true &&
      funnel.body.commercial_only === true &&
      funnelSummary !== null,
    `http=${funnel.status} commercial_only=${funnel.body.commercial_only === true}`
  );
  out.funnel = {
    commercial_only: funnel.body.commercial_only === true,
    counts: funnelSummary,
  };
  check("ops_request_summaries_safe", !unsafeOpsRequestSummary, `safe=${!unsafeOpsRequestSummary}`);
}

function persist() {
  const runDir = process.env.INBOUND_PROOF_RUN_DIR
    ? resolve(process.env.INBOUND_PROOF_RUN_DIR)
    : resolve(ROOT, "data/revops/inbound-proof-runs");
  mkdirSync(runDir, { recursive: true });
  const rawRunIdentity = String(process.env.GITHUB_RUN_ID || "");
  const runIdentity = /^\d{1,20}$/.test(rawRunIdentity) ? rawRunIdentity : "";
  const filename = runIdentity
    ? `inbound-issue-267-run-${runIdentity}.json`
    : `inbound-${out.ts.slice(0, 10)}-${Date.now().toString(36)}.json`;
  const proofPath = resolve(runDir, filename);
  out.ok = out.checks.length > 0 && out.checks.every((item) => item.ok);
  writeFileSync(proofPath, JSON.stringify(out, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ok: out.ok, proof: proofPath }, null, 2));
  return out.ok;
}

try {
  await run();
} catch {
  out.fatal_error = "TRANSPORT_ERROR";
  check("proof_unhandled", false, "TRANSPORT_ERROR");
} finally {
  if (!persist()) process.exitCode = 1;
}
