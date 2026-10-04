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
let created = false;
let postCount = 0;
let requestCount = 0;

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
    send(res, 200, { commit: sha });
    return;
  }
  if (url.pathname === "/.netlify/functions/ops") {
    const action = url.searchParams.get("action");
    if (action === "funnel") {
      send(res, 200, { ok: true, commercial_only: true, funnel: { counts: zeroCounts, pipeline_value: 0, revenue: 0 } });
      return;
    }
    if (action === "system_health") {
      send(res, 200, { ok: true, counts_by_kind: { synthetic: created ? 2 : 1 } });
      return;
    }
    if (action === "weekly_report") {
      send(res, 200, {
        ok: true,
        commercial_only: true,
        leads_total: 0,
        leads_new_7d: 0,
        leads_excluded_non_real: created ? 2 : 1,
        system_health: { pipeline_real: 0, revenue_real: 0 },
      });
      return;
    }
    if (action === "inbound_handoff") {
      const requested = url.searchParams.get("lead_id");
      send(res, 200, {
        ok: true,
        configuration: { contract: "READY", destination_fingerprint: "WARMBLY_PRODUCTION_V1" },
        safety_gate: { ok: true, contract: "READY", auto_send_off: true, dispatch_attempted: false },
        receipt: created && requested === receiptId ? {
          lead_id: receiptId,
          record_kind: "synthetic",
          authenticated_probe: true,
          source: "CONFENGE_WEB",
          next_action: "exclude_from_commercial",
          handoff: {
            status: "DELIVERED",
            attempts: 1,
            downstream: { http: 201, duplicate: false, downstream_receipt: receiptId },
          },
          delivery: { notify_status: "skipped", email_status: "skipped", qa_email_status: "ok", qa_email_provider_id: providerId },
        } : null,
      });
      return;
    }
  }
  if (url.pathname === "/.netlify/functions/lead" && req.method === "POST") {
    postCount += 1;
    assert.equal(req.headers["x-confenge-qa-email"], "1");
    assert.equal(req.headers["x-confenge-ops-token"], opsToken);
    assert.equal(req.headers["x-confenge-expected-sha"], sha);
    req.resume();
    req.on("end", () => {
      if (!created) {
        created = true;
        send(res, 201, { ok: true, lead_id: receiptId, status: "persisted", notify_status: "skipped", email_status: "skipped" });
      } else {
        send(res, 200, { ok: true, lead_id: receiptId, idempotent: true, notify_status: "skipped", email_status: "skipped" });
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
    subject: `[TESTE CONTROLADO] CONFENGE ${receiptId}`,
  });
  assert.equal(result.stdout.includes(probeSecret), false);
  assert.equal(result.stdout.includes(opsToken), false);
  console.log("PASS synthetic_probe_qa_email_opt_in_and_readback");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
