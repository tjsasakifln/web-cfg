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
