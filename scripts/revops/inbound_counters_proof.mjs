/**
 * Read-only production proof for #230.
 *
 * It verifies authenticated ops health and snapshots aggregate inbound/funnel
 * counters. It does not submit a lead, drain a queue, or prove a consented
 * commercial handoff.
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createOpsJsonClient, sanitizeTransportError } from "./ops_fetch.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");
const TOKEN = process.env.OPS_TOKEN || "";
const out = {
  schema: "confenge-inbound-counters-proof/1.0",
  issue: 230,
  decision_state: "EXECUTE_NOW",
  executive_front: "REVENUE NOW",
  leverage: "revenue",
  evidence_scope: "read_only_authenticated_ops_configuration_and_aggregate_counters",
  base: BASE,
  ts: new Date().toISOString(),
  git_sha: process.env.GITHUB_SHA || null,
  checks: [],
  ops_requests: [],
  consented_real_contact: "MISSING",
  real_loop_status: "BLOCKED",
  non_claims: [
    "does_not_prove_netlify_inbound_secrets_are_configured",
    "does_not_prove_a_consented_real_contact_exists",
    "does_not_prove_end_to_end_commercial_handoff",
  ],
};

function check(name, ok, detail = "") {
  out.checks.push({ name, ok, detail, critical: true });
  console.log(ok ? "PASS" : "FAIL", name, detail);
}

const request = createOpsJsonClient({
  base: BASE,
  token: TOKEN,
  onResult: (summary) => out.ops_requests.push(summary),
});

async function run() {
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
  check(
    "inbound_handoff_counters",
    inbound.status === 200 && inbound.body.ok === true && counters && typeof counters === "object",
    `http=${inbound.status} counters_present=${Boolean(counters && typeof counters === "object")}`
  );
  out.inbound_handoff_counters = counters && typeof counters === "object" ? counters : null;
  const configuration = inbound.body?.configuration;
  check(
    "inbound_handoff_configuration_observable",
    inbound.status === 200 && configuration && typeof configuration === "object",
    `http=${inbound.status} configuration_present=${Boolean(configuration && typeof configuration === "object")}`
  );
  out.inbound_handoff_configuration = configuration && typeof configuration === "object" ? configuration : null;

  const audit = await request("/.netlify/functions/ops?action=audit_inbound_requeue");
  const skippedAudit = audit.body?.audit;
  check(
    "skipped_requeue_audit_aggregate_only",
    audit.status === 200 && audit.body.ok === true && skippedAudit && typeof skippedAudit === "object",
    `http=${audit.status} aggregate_present=${Boolean(skippedAudit && typeof skippedAudit === "object")}`
  );
  out.skipped_requeue_audit = skippedAudit && typeof skippedAudit === "object" ? skippedAudit : null;

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
  const dryRunAggregatePresent =
    Number.isInteger(dryRunSummary.eligible_count) &&
    Number.isInteger(dryRunSummary.never_requeue_count) &&
    Number.isInteger(dryRunSummary.manual_review_count) &&
    dryRunSummary.reason_counts &&
    typeof dryRunSummary.reason_counts === "object";
  check(
    "skipped_requeue_dry_run_aggregate_only",
    requeueDryRun.status === 200 &&
      requeueDryRun.body.ok === true &&
      requeueDryRun.body.dry_run === true &&
      dryRunAggregatePresent,
    `http=${requeueDryRun.status} dry_run=${requeueDryRun.body.dry_run === true} aggregate_present=${Boolean(dryRunAggregatePresent)}`
  );
  out.skipped_requeue_dry_run = dryRunAggregatePresent ? dryRunSummary : null;

  const funnel = await request("/.netlify/functions/ops?action=funnel");
  const funnelCounts = funnel.body?.funnel?.counts;
  check(
    "commercial_funnel_counters",
    funnel.status === 200 && funnel.body.ok === true && funnelCounts && typeof funnelCounts === "object",
    `http=${funnel.status} commercial_only=${funnel.body.commercial_only === true}`
  );
  out.funnel = {
    commercial_only: funnel.body.commercial_only === true,
    counts: funnelCounts && typeof funnelCounts === "object" ? funnelCounts : null,
  };
}

function persist() {
  const runDir = process.env.INBOUND_PROOF_RUN_DIR
    ? resolve(process.env.INBOUND_PROOF_RUN_DIR)
    : resolve(ROOT, "data/revops/inbound-proof-runs");
  mkdirSync(runDir, { recursive: true });
  const proofPath = resolve(
    runDir,
    `inbound-${out.ts.slice(0, 10)}-${Date.now().toString(36)}.json`
  );
  out.ok = out.checks.length > 0 && out.checks.every((item) => item.ok);
  writeFileSync(proofPath, JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ ok: out.ok, proof: proofPath }, null, 2));
  return out.ok;
}

try {
  await run();
} catch (error) {
  const detail = sanitizeTransportError(error);
  out.fatal_error = detail;
  check("proof_unhandled", false, detail);
} finally {
  if (!persist()) process.exitCode = 1;
}
