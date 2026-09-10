/**
 * Counterproofs for the pre-promotion barrier.
 *
 * §5 of the campaign requires proof that removing the evidence, changing its
 * SHA, or provoking a FAIL really does prevent the promotion. `netcup-release`
 * cannot be rehearsed before the merge (its preflight refuses any ref that is
 * not refs/heads/main, and the merge itself starts the promotion), so the
 * refusal is proved here, against the code the promote step actually runs.
 *
 * Both halves are exercised: the pure decision function, and the CLI as the
 * workflow invokes it — because a barrier that decides correctly but exits 0
 * blocks nothing.
 */
import assert from "assert";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  buildQualification,
  candidateIdentity,
  loadRecord,
  verifierVersion,
  verifyQualification,
} from "./release_qualification.mjs";

const CLI = fileURLToPath(new URL("./release_qualification.mjs", import.meta.url));
const WORK = mkdtempSync(join(tmpdir(), "confenge-qualification-test-"));
let ok = 0;
const pass = (name) => {
  ok += 1;
  console.log("OK", name);
};

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const IDENTITY = {
  commit: SHA,
  artifact_hash: "c".repeat(64),
  manifest_hash: "d".repeat(64),
};

function candidateSite(identity = IDENTITY) {
  const site = mkdtempSync(join(WORK, "site-"));
  mkdirSync(join(site, ".well-known"), { recursive: true });
  writeFileSync(join(site, ".well-known", "build-info.json"), JSON.stringify(identity, null, 2));
  return site;
}

const VERIFIER = verifierVersion();
const EXPECTED = {
  releaseSha: SHA,
  artifactHash: IDENTITY.artifact_hash,
  manifestHash: IDENTITY.manifest_hash,
  verifierVersion: VERIFIER,
  runId: "1001",
  runAttempt: "1",
};

const goodRecord = () =>
  buildQualification({
    releaseSha: SHA,
    identity: IDENTITY,
    bundleDigest: "e".repeat(64),
    verifier: VERIFIER,
    runId: "1001",
    runAttempt: "1",
    terminalState: "MEASURED_PASS",
    acceptanceResult: "PASSED",
    base: "http://127.0.0.1:8099",
    evidence: ["build/reports/runtime-public-acceptance.json"],
    residualDifferences: ["real edge latency", "Cloudflare"],
  });

// ---------------------------------------------------------------------------
// The one case that must be allowed. If this ever fails the barrier is not
// fail-closed, it is simply closed, and it would block every release.
// ---------------------------------------------------------------------------
{
  const { ok: allowed, refusals } = verifyQualification({ record: goodRecord(), expected: EXPECTED });
  assert.equal(allowed, true, `a matching, passing qualification must authorise: ${refusals.join("; ")}`);
  pass("a_matching_passing_qualification_authorises_the_promotion");
}

// ---------------------------------------------------------------------------
// §5: removing the evidence must prevent the promotion.
// ---------------------------------------------------------------------------
{
  const { record, error } = loadRecord(join(WORK, "absent.json"));
  assert.equal(record, null);
  assert.match(error, /no qualification record/);
  const { ok: allowed } = verifyQualification({ record: null, expected: EXPECTED });
  assert.equal(allowed, false, "an absent qualification never authorises a promotion");
  pass("removing_the_evidence_blocks_the_promotion");
}

// ---------------------------------------------------------------------------
// §5: changing its SHA must prevent the promotion.
// ---------------------------------------------------------------------------
{
  const record = { ...goodRecord(), release_sha: OTHER_SHA };
  const { ok: allowed, refusals } = verifyQualification({ record, expected: EXPECTED });
  assert.equal(allowed, false);
  assert.ok(refusals.some((r) => /release SHA does not match/.test(r)), refusals.join("; "));
  pass("a_qualification_for_another_sha_blocks_the_promotion");
}

// ---------------------------------------------------------------------------
// A qualification for the right SHA but a different artifact or manifest is a
// different candidate. Identity is not one field.
// ---------------------------------------------------------------------------
for (const [field, label] of [
  ["artifact_hash", "artifact hash"],
  ["manifest_hash", "manifest hash"],
]) {
  const record = { ...goodRecord(), [field]: "9".repeat(64) };
  const { ok: allowed, refusals } = verifyQualification({ record, expected: EXPECTED });
  assert.equal(allowed, false, `${field} must be bound`);
  assert.ok(refusals.some((r) => r.includes(label)), refusals.join("; "));
}
pass("a_qualification_for_a_different_artifact_or_manifest_blocks_the_promotion");

// ---------------------------------------------------------------------------
// §5: provoking a FAIL must prevent the promotion. Neither a measured failure
// nor inconclusive evidence authorises anything.
// ---------------------------------------------------------------------------
for (const state of ["MEASURED_FAIL", "INVALID_OR_INCOMPLETE", "INFRA_ERROR", null, undefined, "PASS", ""]) {
  const record = { ...goodRecord(), terminal_state: state };
  const { ok: allowed, refusals } = verifyQualification({ record, expected: EXPECTED });
  assert.equal(allowed, false, `terminal_state ${JSON.stringify(state)} must not authorise`);
  assert.ok(refusals.some((r) => /only MEASURED_PASS/.test(r)), refusals.join("; "));
}
pass("only_a_passing_measurement_authorises_the_promotion");

// ---------------------------------------------------------------------------
// A record whose acceptance failed does not authorise, even if some other
// field claims a pass. The two must agree.
// ---------------------------------------------------------------------------
{
  const record = { ...goodRecord(), acceptance_result: "FAILED" };
  const { ok: allowed } = verifyQualification({ record, expected: EXPECTED });
  assert.equal(allowed, false);
  pass("a_failed_acceptance_blocks_the_promotion");
}

// ---------------------------------------------------------------------------
// A qualification produced by a different verifier proves nothing about this
// instrument. A moving label would have hidden this.
// ---------------------------------------------------------------------------
{
  const record = { ...goodRecord(), verifier_version: "0".repeat(64) };
  const { ok: allowed, refusals } = verifyQualification({ record, expected: EXPECTED });
  assert.equal(allowed, false);
  assert.ok(refusals.some((r) => /verifier version/.test(r)), refusals.join("; "));
  pass("a_qualification_from_another_verifier_blocks_the_promotion");
}

// ---------------------------------------------------------------------------
// A stale qualification from a previous run or attempt described a previous
// attempt at this release, not this one.
// ---------------------------------------------------------------------------
{
  for (const [field, value] of [["run_id", "999"], ["run_attempt", "0"]]) {
    const record = { ...goodRecord(), [field]: value };
    const { ok: allowed } = verifyQualification({ record, expected: EXPECTED });
    assert.equal(allowed, false, `${field} must be bound to this run`);
  }
  pass("a_stale_qualification_from_a_previous_run_blocks_the_promotion");
}

// ---------------------------------------------------------------------------
// A record citing no evidence is an assertion, not a qualification.
// ---------------------------------------------------------------------------
{
  for (const evidence of [[], undefined, "build/reports/x.json"]) {
    const record = { ...goodRecord(), evidence };
    const { ok: allowed } = verifyQualification({ record, expected: EXPECTED });
    assert.equal(allowed, false, "a qualification must cite evidence");
  }
  pass("a_qualification_citing_no_evidence_blocks_the_promotion");
}

// ---------------------------------------------------------------------------
// An unknown schema is not honoured.
// ---------------------------------------------------------------------------
{
  const record = { ...goodRecord(), schema: "SOMETHING_ELSE/9" };
  assert.equal(verifyQualification({ record, expected: EXPECTED }).ok, false);
  pass("an_unknown_qualification_schema_blocks_the_promotion");
}

// ---------------------------------------------------------------------------
// The CLI: the barrier must EXIT NON-ZERO, because that is what actually stops
// the workflow. A correct decision reported with exit 0 blocks nothing.
// ---------------------------------------------------------------------------
function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

{
  const site = candidateSite();
  const recordPath = join(WORK, "cli-record.json");

  // Emit, then require: the happy path the workflow depends on.
  const emitted = runCli([
    "--emit",
    `--sha=${SHA}`,
    `--site=${site}`,
    `--out=${recordPath}`,
    "--terminal-state=MEASURED_PASS",
    "--acceptance-result=PASSED",
    "--run-id=1001",
    "--run-attempt=1",
    "--evidence=build/reports/acceptance.json",
    "--base=http://127.0.0.1:8099",
  ]);
  assert.equal(emitted.status, 0, `${emitted.stdout}${emitted.stderr}`);
  const required = runCli([
    "--require",
    `--sha=${SHA}`,
    `--site=${site}`,
    `--record=${recordPath}`,
    "--run-id=1001",
    "--run-attempt=1",
  ]);
  assert.equal(required.status, 0, `${required.stdout}${required.stderr}`);
  assert.match(required.stdout, /RELEASE_QUALIFICATION_OK/);
  pass("cli_emit_then_require_authorises_the_matching_candidate");

  // Remove the evidence.
  rmSync(recordPath);
  const missing = runCli(["--require", `--sha=${SHA}`, `--site=${site}`, `--record=${recordPath}`]);
  assert.notEqual(missing.status, 0, "a missing record must exit non-zero");
  assert.match(missing.stderr, /RELEASE_QUALIFICATION_BLOCKED/);
  pass("cli_refuses_and_exits_non_zero_when_the_evidence_is_removed");

  // Swap the SHA inside the record.
  runCli([
    "--emit", `--sha=${SHA}`, `--site=${site}`, `--out=${recordPath}`,
    "--terminal-state=MEASURED_PASS", "--acceptance-result=PASSED",
    "--run-id=1001", "--run-attempt=1", "--evidence=x.json",
  ]);
  const tampered = JSON.parse(readFileSync(recordPath, "utf8"));
  tampered.release_sha = OTHER_SHA;
  writeFileSync(recordPath, JSON.stringify(tampered, null, 2));
  const swapped = runCli([
    "--require", `--sha=${SHA}`, `--site=${site}`, `--record=${recordPath}`,
    "--run-id=1001", "--run-attempt=1",
  ]);
  assert.notEqual(swapped.status, 0, "a record whose SHA was swapped must exit non-zero");
  assert.match(swapped.stderr, /release SHA does not match/);
  pass("cli_refuses_and_exits_non_zero_when_the_sha_is_swapped");

  // Provoke a FAIL.
  runCli([
    "--emit", `--sha=${SHA}`, `--site=${site}`, `--out=${recordPath}`,
    "--terminal-state=MEASURED_FAIL", "--acceptance-result=FAILED",
    "--run-id=1001", "--run-attempt=1", "--evidence=x.json",
  ]);
  const failed = runCli([
    "--require", `--sha=${SHA}`, `--site=${site}`, `--record=${recordPath}`,
    "--run-id=1001", "--run-attempt=1",
  ]);
  assert.notEqual(failed.status, 0, "a recorded failure must exit non-zero");
  assert.match(failed.stderr, /only MEASURED_PASS/);
  pass("cli_refuses_and_exits_non_zero_when_the_acceptance_failed");

  // A candidate whose own identity disagrees with the SHA being promoted.
  const impostor = candidateSite({ ...IDENTITY, commit: OTHER_SHA });
  const mismatched = runCli([
    "--emit", `--sha=${SHA}`, `--site=${impostor}`, `--out=${join(WORK, "never.json")}`,
    "--terminal-state=MEASURED_PASS", "--evidence=x.json",
  ]);
  assert.notEqual(mismatched.status, 0, "a candidate carrying another commit cannot be qualified");
  pass("cli_refuses_to_qualify_a_candidate_carrying_another_commit");

  // A candidate with no identity at all.
  const headless = mkdtempSync(join(WORK, "headless-"));
  const noIdentity = runCli(["--require", `--sha=${SHA}`, `--site=${headless}`, `--record=${recordPath}`]);
  assert.notEqual(noIdentity.status, 0);
  pass("cli_refuses_a_candidate_with_no_identity");
}

// ---------------------------------------------------------------------------
// The verifier version must actually track the verifier.
// ---------------------------------------------------------------------------
{
  assert.match(VERIFIER, /^[0-9a-f]{64}$/);
  assert.equal(verifierVersion(), VERIFIER, "the verifier version is stable for unchanged sources");
  pass("verifier_version_is_a_digest_of_the_actual_instrument");
}

// ---------------------------------------------------------------------------
// candidateIdentity refuses an incomplete identity rather than inventing one.
// ---------------------------------------------------------------------------
{
  const broken = candidateSite({ commit: SHA });
  assert.throws(() => candidateIdentity(broken), /missing artifact_hash/);
  pass("an_incomplete_candidate_identity_is_refused");
}

rmSync(WORK, { recursive: true, force: true });
console.log(`RELEASE_QUALIFICATION_TESTS_OK (${ok} counterproofs)`);
