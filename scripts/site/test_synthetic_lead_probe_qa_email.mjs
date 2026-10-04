import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

const probePath = fileURLToPath(new URL("./synthetic_lead_probe.mjs", import.meta.url));
const receiptId = "synthetic:qa:receipt:0001";
const providerId = "re_qa_fixture_001";
const sha = "a".repeat(40);
const probeSecret = "probe-fixture-secret-at-least-32-characters";
const opsToken = "ops-fixture-token-at-least-16";
let postCount = 0;
let requestCount = 0;
let liveSha = sha;
const idempotencyKeys = [];
const leadsByIdempotencyKey = new Map();
let createdLeadCount = 0;
let qaDeliveryCount = 0;

const zeroCounts = {
  visitor: 0, cta_triggered: 0, form_started: 0, lead_persisted: 0, contacted: 0,
  qualified: 0, meeting: 0, proposal: 0, won: 0, lost: 0,
};

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  requestCount += 1;
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/.well-known/build-info.json") {
    send(res, 200, { commit: liveSha });
    return;
  }
  if (url.pathname === "/.netlify/functions/ops") {
    const action = url.searchParams.get("action");
    if (action === "funnel") {
      send(res, 200, { ok: true, commercial_only: true, funnel: { counts: zeroCounts, pipeline_value: 0, revenue: 0 } });
      return;
    }
    if (action === "system_health") {
      send(res, 200, { ok: true, counts_by_kind: { synthetic: 1 + createdLeadCount } });
      return;
    }
    if (action === "weekly_report") {
      send(res, 200, {
        ok: true,
        commercial_only: true,
        leads_total: 0,
        leads_new_7d: 0,
        leads_excluded_non_real: 1 + createdLeadCount,
        system_health: { pipeline_real: 0, revenue_real: 0 },
      });
      return;
    }
    if (action === "inbound_handoff") {
      const requested = url.searchParams.get("lead_id");
      const stored = [...leadsByIdempotencyKey.values()].find((lead) => lead.id === requested);
      send(res, 200, {
        ok: true,
        configuration: { contract: "READY", destination_fingerprint: "WARMBLY_PRODUCTION_V1" },
        safety_gate: { ok: true, contract: "READY", auto_send_off: true, dispatch_attempted: false },
        receipt: stored ? {
          lead_id: stored.id,
          record_kind: "synthetic",
          authenticated_probe: true,
          source: "CONFENGE_WEB",
          next_action: "exclude_from_commercial",
          handoff: {
            status: "DELIVERED",
            attempts: 1,
            downstream: { http: 201, duplicate: false, downstream_receipt: stored.id },
          },
          delivery: { notify_status: "skipped", email_status: "skipped", qa_email_status: "ok", qa_email_provider_id: providerId },
        } : null,
      });
      return;
    }
  }
  if (url.pathname === "/.netlify/functions/lead" && req.method === "POST") {
    postCount += 1;
    const key = String(req.headers["idempotency-key"] || "");
    idempotencyKeys.push(key);
    assert.equal(req.headers["x-confenge-qa-email"], "1");
    assert.equal(req.headers["x-confenge-ops-token"], opsToken);
    assert.equal(req.headers["x-confenge-expected-sha"], liveSha);
    req.resume();
    req.on("end", () => {
      const existing = leadsByIdempotencyKey.get(key);
      if (!existing) {
        const lead = { id: `${receiptId}:${String(createdLeadCount + 1).padStart(4, "0")}` };
        leadsByIdempotencyKey.set(key, lead);
        createdLeadCount += 1;
        qaDeliveryCount += 1;
        send(res, 201, { ok: true, lead_id: lead.id, status: "persisted", notify_status: "skipped", email_status: "skipped" });
      } else {
        send(res, 200, { ok: true, lead_id: existing.id, idempotent: true, notify_status: "skipped", email_status: "skipped" });
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
const base = `http://127.0.0.1:${server.address().port}`;
const auth = {
  LEAD_PROBE_SECRET: probeSecret,
  OPS_TOKEN: opsToken,
  PROBE_VERIFY_EMAIL: "1",
};

try {
  const beforeMissingSha = requestCount;
  const missingSha = await runProbe(base, { ...auth, EXPECTED_SHA: "" });
  assert.equal(missingSha.code, 1);
  assert.equal(JSON.parse(missingSha.stdout).reason, "qa_expected_release_sha_required");
  assert.equal(requestCount, beforeMissingSha);

  const beforeOverride = requestCount;
  const override = await runProbe(base, {
    ...auth,
    EXPECTED_SHA: sha,
    PROBE_QA_RECIPIENT: "attacker@example.com",
  });
  assert.equal(override.code, 1);
  assert.equal(JSON.parse(override.stdout).reason, "qa_recipient_override_forbidden");
  assert.equal(requestCount, beforeOverride);

  const mismatch = await runProbe(base, { ...auth, EXPECTED_SHA: "b".repeat(40) });
  assert.equal(mismatch.code, 1);
  assert.equal(JSON.parse(mismatch.stdout).reason, "live_build_identity_mismatch");
  assert.equal(postCount, 0);

  const result = await runProbe(base, { ...auth, EXPECTED_SHA: sha });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.equal(postCount, 2);
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.ok, true);
  assert.equal(proof.checks.qa_email_delivered, true);
  assert.equal(proof.checks.qa_provider_id_sanitized, true);
  assert.deepEqual(proof.qa_email, {
    status: "ok",
    provider_id: providerId,
    subject: `[TESTE CONTROLADO] CONFENGE ${receiptId}:0001`,
  });
  assert.equal(result.stdout.includes(probeSecret), false);
  assert.equal(result.stdout.includes(opsToken), false);
  assert.equal(idempotencyKeys.length, 2);
  assert.equal(idempotencyKeys[0], idempotencyKeys[1], "one run must retry its same key");
  assert.equal(createdLeadCount, 1);
  assert.equal(qaDeliveryCount, 1);

  // A second process for the same SHA and secret must reuse the HMAC key. The
  // fixture replays it idempotently, so the probe fails closed because a fresh
  // 201 was not observed and no second QA delivery is simulated.
  const rerun = await runProbe(base, { ...auth, EXPECTED_SHA: sha });
  assert.equal(rerun.code, 1, rerun.stdout || rerun.stderr);
  assert.equal(postCount, 4);
  assert.deepEqual(idempotencyKeys.slice(2, 4), [idempotencyKeys[0], idempotencyKeys[0]]);
  assert.equal(createdLeadCount, 1, "rerun must not create a second synthetic lead");
  assert.equal(qaDeliveryCount, 1, "rerun must not create a second QA delivery");

  // Changing either HMAC input creates a distinct opaque key. The fixture is
  // keyed faithfully, so each distinct key creates exactly one lead/delivery.
  const changedSecret = await runProbe(base, { ...auth, EXPECTED_SHA: sha, LEAD_PROBE_SECRET: "different-probe-secret-at-least-32-characters" });
  assert.equal(changedSecret.code, 0, changedSecret.stderr || changedSecret.stdout);
  assert.equal(createdLeadCount, 2);
  assert.equal(qaDeliveryCount, 2);
  liveSha = "b".repeat(40);
  const changedSha = await runProbe(base, { ...auth, EXPECTED_SHA: liveSha });
  assert.equal(changedSha.code, 0, changedSha.stderr || changedSha.stdout);
  assert.notEqual(idempotencyKeys[4], idempotencyKeys[0]);
  assert.notEqual(idempotencyKeys[6], idempotencyKeys[0]);
  assert.equal(createdLeadCount, 3);
  assert.equal(qaDeliveryCount, 3);
  console.log("PASS synthetic_probe_qa_email_opt_in_and_readback");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
