import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

const probePath = fileURLToPath(new URL("./synthetic_lead_probe.mjs", import.meta.url));
const receiptId = "synthetic:fixture:receipt:0001";
let created = false;
let postCount = 0;
let requestCount = 0;

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
      send(res, 200, {
        ok: true,
        commercial_only: true,
        funnel: { counts: zeroCounts, pipeline_value: 0, revenue: 0 },
      });
      return;
    }
    if (action === "system_health") {
      send(res, 200, { ok: true, counts_by_kind: { synthetic: created ? 6 : 5 } });
      return;
    }
    if (action === "weekly_report") {
      send(res, 200, {
        ok: true,
        commercial_only: true,
        leads_total: 0,
        leads_new_7d: 0,
        leads_excluded_non_real: created ? 6 : 5,
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
  console.log("PASS synthetic_live_probe_fails_closed_and_redacts_receipt");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
