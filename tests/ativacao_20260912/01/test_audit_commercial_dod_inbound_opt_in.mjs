import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const audit = fileURLToPath(new URL("../../../scripts/money_asset/audit_commercial_dod.mjs", import.meta.url));
const mock = fileURLToPath(new URL("./audit_commercial_dod_fetch_mock.mjs", import.meta.url));

function run({ args = [], scenario = "ready", timeoutMs = 8000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commercial-dod-audit-"));
  const output = path.join(dir, "report.json");
  const trace = path.join(dir, "trace.json");
  try {
    const result = spawnSync(process.execPath, ["--import", mock, audit, "--out", output, ...args], {
      env: {
        ...process.env,
        COMMERCIAL_DOD_TRACE_PATH: trace,
        COMMERCIAL_DOD_SCENARIO: scenario,
        COMMERCIAL_DOD_FETCH_TIMEOUT_MS: String(timeoutMs),
      },
      encoding: "utf8",
      timeout: 20000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.deepEqual(JSON.parse(result.stdout), report);
    const requests = JSON.parse(fs.readFileSync(trace, "utf8"));
    assert.equal(requests.every((r) => r.signal), true, "every request carries a deadline");
    assert.equal(result.stdout.includes("private-inbound-body"), false, "response body is never persisted");
    assert.equal(JSON.stringify(report).includes("inbound_unsigned_post_body"), false);
    return { report, requests };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Default: live GETs only. POST_COUNT must be zero without the explicit flag.
{
  const { report, requests } = run();
  const posts = requests.filter((r) => r.method !== "GET");
  assert.equal(posts.length, 0, `POST_COUNT=${posts.length}, expected 0 by default`);
  assert.ok(requests.length > 0, "the live audit still inspects the published surfaces");
  assert.equal(requests.every((r) => r.host === "confenge.com.br"), true);
  assert.equal(report.observed.live.inbound_unsigned_post_attempted, false);
  assert.equal(report.observed.live.inbound_unsigned_post_http, null);
  assert.equal(report.generated_from, "live+facts");
}

// --skip-live: no request at all.
{
  const { requests } = run({ args: ["--skip-live"] });
  assert.equal(requests.length, 0);
}

// --live-inbound: exactly one unsigned POST, status kept, body discarded.
{
  const { report, requests } = run({ args: ["--live-inbound"] });
  const posts = requests.filter((r) => r.method !== "GET");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].method, "POST");
  assert.equal(posts[0].host, "api.confenge.com.br");
  assert.equal(report.observed.live.inbound_unsigned_post_attempted, true);
  assert.equal(report.observed.live.inbound_unsigned_post_http, 401);
}

// --live-inbound with a hanging destination: the deadline aborts, the audit still reports.
{
  const { report, requests } = run({ args: ["--live-inbound"], scenario: "inbound_hang", timeoutMs: 50 });
  assert.equal(requests.filter((r) => r.method !== "GET").length, 1, "no retry after timeout");
  assert.equal(report.observed.live.inbound_unsigned_post_http, null);
  assert.equal(report.observed.live.inbound_error, "timeout");
}

console.log("PASS commercial DoD audit: POST_COUNT=0 by default, --live-inbound is explicit, bounded and body-free");
