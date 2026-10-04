import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

const probePath = fileURLToPath(new URL("./synthetic_lead_probe.mjs", import.meta.url));
const receiptId = "synthetic:fixture:receipt:0001";
let created = false;
let postCount = 0;
let requestCount = 0;
let metricsMode = "valid";
let counterMode = "valid";

const zeroCounts = {
  visitor: 0,
  cta_triggered: 0,
  form_started: 0,
  lead_persisted: 0,
  contacted: 0,
  qualified: 0,
  meeting: 0,
  proposal: 0,
  won: 0,
  lost: 0,
};

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  requestCount += 1;
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/.well-known/build-info.json") {
    send(res, 200, { commit: "a".repeat(40) });
    return;
  }
  if (url.pathname === "/.netlify/functions/ops") {
    const action = url.searchParams.get("action");
    if (action === "funnel") {
      const badMetrics = metricsMode === "before-invalid" || (metricsMode === "after-invalid" && created);
      const status = metricsMode === "after-funnel-http" && created ? 503 : 200;
      send(res, status, {
        ok: !(metricsMode === "before-funnel-ok-false" || (metricsMode === "after-funnel-ok-false" && created)),
        commercial_only: true,
        funnel: { counts: badMetrics ? { ...zeroCounts, visitor: null } : zeroCounts, pipeline_value: 0, revenue: 0 },
      });
      return;
    }
    if (action === "system_health") {
      const bad = counterMode === "before-missing" || (counterMode === "after-null" && created) || (counterMode === "before-string" && !created);
      const counts = bad && counterMode === "before-missing" ? {} : { synthetic: bad ? (counterMode === "before-string" ? "5" : null) : (created ? 6 : 5) };
      send(res, 200, { ok: true, counts_by_kind: counts });
      return;
    }
    if (action === "weekly_report") {
      const excluded = counterMode === "before-weekly-null" && !created ? null : (created ? 6 : 5);
      send(res, 200, {
        ok: !(metricsMode === "before-weekly-ok-false" || (metricsMode === "after-weekly-ok-false" && created)),
        commercial_only: true,
        leads_total: metricsMode === "before-weekly-fractional" && !created ? 0.5 : 0,
        leads_new_7d: 0,
        leads_excluded_non_real: excluded,
        system_health: { pipeline_real: 0, revenue_real: 0 },
      });
      return;
    }
    if (action === "inbound_handoff") {
      const requested = url.searchParams.get("lead_id");
      send(res, 200, {
        ok: true,
        configuration: {
          contract: "READY",
          destination_fingerprint: "WARMBLY_PRODUCTION_V1",
        },
        safety_gate: {
          ok: true,
          contract: "READY",
          auto_send_off: true,
          dispatch_attempted: false,
        },
        receipt: created && requested === receiptId ? {
          lead_id: receiptId,
          record_kind: "synthetic",
          authenticated_probe: true,
          source: "CONFENGE_WEB",
          next_action: "exclude_from_commercial",
          handoff: {
            status: "DELIVERED",
            attempts: 1,
            downstream: {
              http: 201,
              duplicate: false,
              downstream_receipt: receiptId,
            },
          },
        } : null,
      });
      return;
    }
  }
  if (url.pathname === "/.netlify/functions/lead" && req.method === "POST") {
    postCount += 1;
    req.resume();
    req.on("end", () => {
      if (!created) {
        created = true;
        send(res, 201, {
          ok: true,
          lead_id: receiptId,
          status: "persisted",
          notify_status: "skipped",
          email_status: "skipped",
        });
      } else {
        send(res, 200, {
          ok: true,
          lead_id: receiptId,
          idempotent: true,
          notify_status: "skipped",
          email_status: "skipped",
        });
      }
    });
    return;
  }
  send(res, 404, { ok: false });
});

function runProbe(base, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [probePath, base], {
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

try {
  const beforeMissing = requestCount;
  const missing = await runProbe(base, {
    LEAD_PROBE_SECRET: "",
    OPS_TOKEN: "ops-fixture-token-at-least-16",
  });
  assert.equal(missing.code, 1);
  assert.equal(requestCount, beforeMissing, "missing probe auth must fail before any request");
  assert.equal(JSON.parse(missing.stdout).reason, "lead_probe_secret_missing_or_short");

  const result = await runProbe(base, {
    LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters",
    OPS_TOKEN: "ops-fixture-token-at-least-16",
    EXPECTED_SHA: "a".repeat(40),
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.equal(postCount, 2, "proof must create once and retry once");
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.ok, true);
  assert.equal(proof.state, "TRANSPORT_READY");
  assert.equal(proof.deltas.persisted_synthetic, 1);
  assert.equal(proof.deltas.excluded_non_real, 1);
  assert.equal(proof.warmbly.auto_send, false);
  assert.equal(proof.warmbly.dispatch_attempted, false);
  assert.equal(typeof proof.receipt_sha256, "string");
  assert.equal(proof.receipt_sha256.length, 64);
  assert.equal(result.stdout.includes(receiptId), false, "raw receipt must not be emitted");
  assert.equal(Object.values(proof.checks).every(Boolean), true);

  created = false;
  const beforeInvalidPosts = postCount;
  metricsMode = "before-invalid";
  const beforeInvalid = await runProbe(base, {
    LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters", OPS_TOKEN: "ops-fixture-token-at-least-16", EXPECTED_SHA: "a".repeat(40),
  });
  assert.equal(beforeInvalid.code, 1, beforeInvalid.stdout || beforeInvalid.stderr);
  assert.equal(JSON.parse(beforeInvalid.stdout).reason, "commercial_baseline_metrics_invalid");
  assert.equal(postCount, beforeInvalidPosts, "invalid baseline metrics must block before POST");

  metricsMode = "after-invalid";
  const afterInvalid = await runProbe(base, {
    LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters", OPS_TOKEN: "ops-fixture-token-at-least-16", EXPECTED_SHA: "a".repeat(40),
  });
  assert.equal(afterInvalid.code, 1, afterInvalid.stdout || afterInvalid.stderr);
  const afterProof = JSON.parse(afterInvalid.stdout);
  assert.equal(afterProof.checks.commercial_snapshot_after_valid, false);
  assert.equal(afterProof.checks.commercial_metrics_unchanged, false);
  assert.equal(postCount, beforeInvalidPosts + 2, "after mutation remains observable, but fails proof");
  created = false;
  metricsMode = "after-funnel-http";
  const afterFunnelUnavailable = await runProbe(base, {
    LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters", OPS_TOKEN: "ops-fixture-token-at-least-16", EXPECTED_SHA: "a".repeat(40),
  });
  assert.equal(afterFunnelUnavailable.code, 1, afterFunnelUnavailable.stdout || afterFunnelUnavailable.stderr);
  assert.equal(JSON.parse(afterFunnelUnavailable.stdout).checks.commercial_snapshot_after_valid, false);
  for (const mode of ["before-funnel-ok-false", "before-weekly-ok-false", "before-weekly-fractional"]) {
    created = false; metricsMode = mode;
    const beforeContractPosts = postCount;
    const beforeContract = await runProbe(base, {
      LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters", OPS_TOKEN: "ops-fixture-token-at-least-16", EXPECTED_SHA: "a".repeat(40),
    });
    assert.equal(beforeContract.code, 1, beforeContract.stdout || beforeContract.stderr);
    assert.equal(postCount, beforeContractPosts, `${mode} must block before POST`);
  }
  for (const mode of ["after-funnel-ok-false", "after-weekly-ok-false"]) {
    created = false; metricsMode = mode;
    const afterContract = await runProbe(base, {
      LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters", OPS_TOKEN: "ops-fixture-token-at-least-16", EXPECTED_SHA: "a".repeat(40),
    });
    assert.equal(afterContract.code, 1, afterContract.stdout || afterContract.stderr);
    assert.equal(JSON.parse(afterContract.stdout).checks.commercial_snapshot_after_valid, false);
  }
  metricsMode = "valid";
  for (const mode of ["before-missing", "before-string", "before-weekly-null"]) {
    created = false; counterMode = mode;
    const beforeCounterPosts = postCount;
    const invalidCounter = await runProbe(base, { LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters", OPS_TOKEN: "ops-fixture-token-at-least-16", EXPECTED_SHA: "a".repeat(40) });
    assert.equal(invalidCounter.code, 1, invalidCounter.stdout || invalidCounter.stderr);
    assert.equal(JSON.parse(invalidCounter.stdout).reason, "commercial_baseline_metrics_invalid");
    assert.equal(postCount, beforeCounterPosts, `${mode} must block before POST`);
  }
  created = false; counterMode = "after-null";
  const afterCounter = await runProbe(base, { LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters", OPS_TOKEN: "ops-fixture-token-at-least-16", EXPECTED_SHA: "a".repeat(40) });
  assert.equal(afterCounter.code, 1, afterCounter.stdout || afterCounter.stderr);
  assert.equal(JSON.parse(afterCounter.stdout).checks.synthetic_counters_after_valid, false);
  counterMode = "valid";
  console.log("PASS synthetic_live_probe_fails_closed_and_redacts_receipt");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
