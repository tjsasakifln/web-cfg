import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const proof = fileURLToPath(new URL("../../../scripts/site/money_asset_prod_proof.mjs", import.meta.url));
const mock = fileURLToPath(new URL("./money_asset_prod_proof_fetch_mock.mjs", import.meta.url));
const canonical = "https://confenge.com.br";
const page = "/ferramentas/diagnostico-defesa-margem/";
function run({ base = canonical, credentials = false, scenario = "ready" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "money-proof-readonly-"));
  const output = path.join(dir, "proof.json");
  const trace = path.join(dir, "trace.json");
  // Existing output must also become private.
  fs.writeFileSync(output, "old", { mode: 0o666 });
  try {
    const secret = credentials ? "fixture-secret-not-for-production-32-characters" : "";
    const result = spawnSync(process.execPath, ["--import", mock, proof, base, output], {
      env: {
        ...process.env,
        OPS_TOKEN: secret, REVOPS_TOKEN: secret, LEAD_PROBE_SECRET: secret,
        CONFENGE_INBOUND_WEBHOOK_URL: credentials ? "https://private.invalid/inbound" : "",
        CONFENGE_INBOUND_WEBHOOK_SECRET: secret,
        CONFENGE_AUTO_SEND_EVIDENCE: credentials ? "OFF" : "",
        MONEY_PROOF_TRACE_PATH: trace, MONEY_PROOF_SCENARIO: scenario,
      },
      encoding: "utf8", timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout);
    const requests = JSON.parse(fs.readFileSync(trace, "utf8"));
    assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), report);
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    assert.equal(report.ok, false);
    assert.equal(report.steps.capture.status, "NOT_VERIFIED");
    assert.equal(report.steps.transport.status, "NOT_VERIFIED");
    assert.equal(report.steps.confirmacao_humana.status, "NOT_VERIFIED");
    assert.equal(requests.some(r => r.method !== "GET" || r.authorization || r.path.includes("functions")), false);
    assert.equal(result.stdout.includes("fixture-secret"), false);
    assert.equal(result.stdout.includes("private-upstream"), false);
    return { report, requests, stdout: result.stdout };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

for (const credentials of [false, true]) {
  const { report, requests } = run({ credentials });
  assert.deepEqual(requests.map(r => r.path), [page, "/sitemap.xml"]);
  assert.equal(report.steps.page_live.status, "PROVEN");
  assert.equal(report.steps.page_live.utility_before_cta, true);
  assert.equal(report.steps.indexability_hygiene.status, "PROVEN");
  assert.equal(report.proven_as, "published_asset_only");
}
for (const base of ["not a URL", "https://user:private-value@example.invalid/?token=private-value", "http://confenge.com.br"]) {
  const { requests, report, stdout } = run({ base });
  assert.equal(requests.length, 0);
  assert.equal(report.steps.page_live.status, "BLOCKED");
  assert.equal(stdout.includes("private-value"), false);
}
const unavailable = run({ scenario: "sitemap_error" });
assert.equal(unavailable.report.steps.indexability_hygiene.status, "UNKNOWN");
assert.equal(unavailable.report.proven_as, "not_proven");
for (const [scenario, reason] of [["network_error", "get_failed"], ["body_timeout", "get_timeout"]]) {
  const { report, requests } = run({ scenario });
  assert.equal(requests.length, 1, "failure must not retry");
  assert.equal(report.steps.page_live.reason, reason);
}
for (const [scenario, reason] of [["sitemap_throw", "sitemap_failed"], ["sitemap_timeout", "sitemap_timeout"]]) {
  const { report, requests } = run({ scenario });
  assert.equal(requests.length, 2);
  assert.equal(report.steps.page_live.status, "PROVEN");
  assert.equal(report.steps.indexability_hygiene.status, "UNKNOWN");
  assert.equal(report.steps.indexability_hygiene.reason, reason);
  assert.equal(report.proven_as, "not_proven");
}
console.log("PASS money asset inspection: no POST with or without credentials; CLI output, privacy, and bounded GET failures");
