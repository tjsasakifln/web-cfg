/**
 * Behavioural counterproofs for the measurement supervisor.
 *
 * These tests drive the real `runMeasurement` against real child processes that
 * fail in the exact ways the release incident produced. Inspecting the source
 * for a string, or emitting an event on a simulated EventEmitter, would not
 * have caught the defect that rolled production back five times: the failure
 * arrived asynchronously, from inside a dependency, outside the awaited chain.
 * So every case below spawns a process that genuinely misbehaves.
 *
 * Each case also states what a defective implementation would do, so the test
 * demonstrably detects the bug rather than restating the code.
 */
import assert from "assert";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import {
  INFRASTRUCTURE_ATTEMPTS,
  KILL_GRACE_MS,
  MEASUREMENT_TIMEOUT_MS,
  OUTCOME,
  deriveTerminalState,
  isRetryableOutcome,
  readOutcome,
  runMeasurement,
} from "./lighthouse_infra.mjs";

const WORK = mkdtempSync(join(tmpdir(), "confenge-infra-test-"));
const CHILD = fileURLToPath(new URL("./lighthouse_measure_child.mjs", import.meta.url));
let ok = 0;

function fakeChild(name, body) {
  const path = join(WORK, `${name}.mjs`);
  writeFileSync(path, body);
  return path;
}

async function measure(childPath, { spec = {}, lhrPath = null, timeoutMs = 15000 } = {}) {
  const id = Math.random().toString(36).slice(2);
  const specPath = join(WORK, `spec-${id}.json`);
  const outcomePath = join(WORK, `outcome-${id}.json`);
  writeFileSync(specPath, JSON.stringify(spec));
  const outcome = await runMeasurement({ childPath, specPath, outcomePath, lhrPath, timeoutMs });
  return { outcome, outcomePath };
}

function pass(name) {
  ok += 1;
  console.log("OK", name);
}

// ---------------------------------------------------------------------------
// 1. The observed failure: an asynchronous rejection from the target manager,
//    raised before any measurement existed.
//
//    Defective implementation: the rejection escapes the awaited chain, the
//    process dies, and the whole run — including measurements already taken —
//    is lost with no verdict. Here it must be contained and classified.
// ---------------------------------------------------------------------------
{
  const child = fakeChild(
    "target-info-async",
    `import { writeFileSync } from "fs";
     const outcomePath = process.argv[3];
     process.on("unhandledRejection", (reason) => {
       writeFileSync(outcomePath, JSON.stringify({
         outcome: "INFRA_ERROR", phase: "launch",
         error: String(reason && reason.message || reason), origin: "async_rejection", lhr_written: false,
       }));
       process.exit(1);
     });
     // Exactly the shape Lighthouse's TargetManager produced in run 34532136335:
     // a rejection with no handler on the awaited path.
     Promise.reject(new Error("Protocol error (Target.getTargetInfo): Session with given id not found."));
     setTimeout(() => {}, 1000);`,
  );
  const { outcome } = await measure(child);
  assert.equal(outcome.outcome, OUTCOME.INFRA_ERROR);
  assert.match(outcome.error, /Target\.getTargetInfo/);
  assert.equal(isRetryableOutcome(outcome), true, "no measurement existed, so another attempt is allowed");
  pass("async_target_info_before_any_measurement_is_contained_and_retryable");
}

// ---------------------------------------------------------------------------
// 2. Transient recovery: the same failure, then a good measurement.
//    The supervisor must survive the first child entirely.
// ---------------------------------------------------------------------------
{
  const marker = join(WORK, "transient-marker");
  const child = fakeChild(
    "transient",
    `import { writeFileSync, existsSync } from "fs";
     const outcomePath = process.argv[3];
     const marker = ${JSON.stringify(marker)};
     if (!existsSync(marker)) {
       writeFileSync(marker, "1");
       writeFileSync(outcomePath, JSON.stringify({
         outcome: "INFRA_ERROR", phase: "cdp", error: "Chrome CDP not ready on port 1", lhr_written: false,
       }));
       process.exit(1);
     }
     writeFileSync(outcomePath, JSON.stringify({
       outcome: "MEASURED", phase: "complete", lhr_written: true,
       row: { path: "/", run: 1, performance: 100, cls: 0 },
     }));`,
  );
  const first = await measure(child);
  assert.equal(first.outcome.outcome, OUTCOME.INFRA_ERROR);
  assert.equal(isRetryableOutcome(first.outcome), true);
  const second = await measure(child);
  assert.equal(second.outcome.outcome, OUTCOME.MEASURED);
  assert.equal(second.outcome.row.performance, 100);
  pass("transient_instrument_failure_recovers_on_a_fresh_attempt");
}

// ---------------------------------------------------------------------------
// 3. Exhaustion: the failure never clears. It must stay a failure.
//    Defective implementation: a generic retry eventually reports success, or
//    the absence of a result is read as "nothing wrong".
// ---------------------------------------------------------------------------
{
  const child = fakeChild(
    "always-infra",
    `import { writeFileSync } from "fs";
     writeFileSync(process.argv[3], JSON.stringify({
       outcome: "INFRA_ERROR", phase: "launch", error: "chrome could not start", lhr_written: false,
     }));
     process.exit(1);`,
  );
  let last = null;
  for (let attempt = 1; attempt <= INFRASTRUCTURE_ATTEMPTS; attempt += 1) {
    last = (await measure(child)).outcome;
  }
  assert.equal(last.outcome, OUTCOME.INFRA_ERROR);
  assert.notEqual(last.outcome, OUTCOME.MEASURED, "exhausted attempts never become a pass");
  assert.equal(INFRASTRUCTURE_ATTEMPTS, 3, "attempts stay bounded at three in total");
  pass("exhausted_instrument_failure_never_becomes_a_pass");
}

// ---------------------------------------------------------------------------
// 4. PRESERVATION. A valid measurement exists, then the child dies.
//    Defective implementation (the one shipped before this change): the late
//    failure is classified by matching "ECONNRESET" in its message, the whole
//    navigation is repeated, and the good LHR on disk is overwritten.
//    Required: the outcome stays with the measurement, and it is NOT retryable.
// ---------------------------------------------------------------------------
{
  const lhrPath = join(WORK, "preserved-lhr.json");
  writeFileSync(lhrPath, JSON.stringify({ audits: {}, categories: {} }));
  const child = fakeChild(
    "late-death-after-lhr",
    `import { writeFileSync } from "fs";
     writeFileSync(process.argv[3], JSON.stringify({
       outcome: "INVALID_OR_INCOMPLETE", phase: "payload",
       error: "complementary payload collection did not complete: payload refetch x -> 0 (read ECONNRESET)",
       lhr_written: true, lhr_path: ${JSON.stringify(lhrPath)},
     }));
     process.exit(1);`,
  );
  const { outcome } = await measure(child, { lhrPath });
  assert.equal(outcome.outcome, OUTCOME.INVALID_OR_INCOMPLETE);
  assert.equal(
    isRetryableOutcome(outcome),
    false,
    "a failure after a measurement exists must never start another navigation",
  );
  assert.match(outcome.error, /ECONNRESET/, "the cause is preserved, not swallowed");
  assert.equal(existsSync(lhrPath), true, "the measured LHR survives the failure");
  assert.equal(
    JSON.parse(readFileSync(lhrPath, "utf8")).audits !== undefined,
    true,
    "the measured LHR was not overwritten by a re-navigation",
  );
  pass("measurement_survives_a_later_failure_and_is_never_resampled");
}

// ---------------------------------------------------------------------------
// 5. A message that merely *sounds* like infrastructure, after a measurement.
//    Defective implementation: /Protocol error/ matches, so it retries.
// ---------------------------------------------------------------------------
{
  const outcome = {
    outcome: OUTCOME.INVALID_OR_INCOMPLETE,
    phase: "navigate",
    error: "Protocol error (Page.navigate): Session with given id not found.",
    lhr_written: true,
  };
  assert.equal(isRetryableOutcome(outcome), false, "wording never overrides phase and evidence");
  pass("infrastructure_wording_after_a_measurement_is_not_retryable");
}

// ---------------------------------------------------------------------------
// 5b. Defence in depth: even an outcome that *claims* to be an instrument
//     failure must not be retried once a measurement exists. A child that
//     mislabels itself cannot talk the supervisor into a second navigation.
//     Defective implementation: the "a measurement already exists" guard is
//     dropped and the classification trusts the reported phase alone.
// ---------------------------------------------------------------------------
{
  for (const phase of ["launch", "cdp", "payload", "navigate"]) {
    assert.equal(
      isRetryableOutcome({ outcome: OUTCOME.INFRA_ERROR, phase, error: "chrome died", lhr_written: true }),
      false,
      `an existing measurement forbids another attempt, even in phase ${phase}`,
    );
  }
  assert.equal(
    isRetryableOutcome({ outcome: OUTCOME.INFRA_ERROR, phase: "launch", error: "chrome died", lhr_written: false }),
    true,
    "without a measurement the same instrument failure stays eligible",
  );
  pass("an_existing_measurement_forbids_another_attempt_whatever_the_reported_phase");
}

// ---------------------------------------------------------------------------
// 6. Genuine page/HTTP/TLS/availability failures are evidence about the
//    artifact, never innocent infrastructure — no matter how they are worded.
//    Defective implementation: NO_FCP / NO_LCP / PAGE_HUNG / ECONNRESET are on
//    an "infrastructure" pattern list and get retried until they pass or the
//    run is declared healthy.
// ---------------------------------------------------------------------------
for (const [label, error] of [
  ["no_fcp", "NO_FCP: The page did not paint any content."],
  ["no_lcp", "NO_LCP"],
  ["page_hung", "PAGE_HUNG"],
  ["nav_timeout", "Navigation timeout exceeded"],
  ["tls", "unable to verify the first certificate"],
  ["econnreset", "read ECONNRESET"],
  ["interstitial", "CHROME_INTERSTITIAL_ERROR"],
]) {
  const outcome = {
    outcome: OUTCOME.INVALID_OR_INCOMPLETE,
    phase: "navigate",
    error,
    lhr_written: false,
  };
  assert.equal(
    isRetryableOutcome(outcome),
    false,
    `${label} is evidence about the artifact and must not be retried as infrastructure`,
  );
  assert.notEqual(outcome.outcome, OUTCOME.MEASURED);
}
pass("page_http_tls_and_availability_failures_are_never_innocent_infrastructure");

// ---------------------------------------------------------------------------
// 7. A hung child must be killed at the deadline and reported as inconclusive
//    — not left to consume the job budget, and not read as a pass.
//    Defective implementation: no enforceable timeout, so the CI job times out
//    and no summary is ever written.
// ---------------------------------------------------------------------------
{
  const child = fakeChild(
    "hangs",
    `setInterval(() => {}, 1000); // never writes an outcome, never exits`,
  );
  const started = Date.now();
  const { outcome } = await measure(child, { timeoutMs: 2000 });
  const elapsed = Date.now() - started;
  assert.equal(outcome.outcome, OUTCOME.INVALID_OR_INCOMPLETE);
  assert.equal(outcome.timed_out, true);
  assert.equal(isRetryableOutcome(outcome), false);
  assert.ok(
    elapsed < 2000 + KILL_GRACE_MS + 8000,
    `the supervisor must enforce its own deadline, took ${elapsed}ms`,
  );
  pass("hung_measurement_is_killed_at_the_deadline_and_reported_inconclusive");
}

// ---------------------------------------------------------------------------
// 8. A child that ignores SIGTERM is still killed.
// ---------------------------------------------------------------------------
{
  const child = fakeChild(
    "ignores-sigterm",
    `process.on("SIGTERM", () => {}); setInterval(() => {}, 500);`,
  );
  const started = Date.now();
  const { outcome } = await measure(child, { timeoutMs: 1500 });
  assert.equal(outcome.outcome, OUTCOME.INVALID_OR_INCOMPLETE);
  assert.ok(Date.now() - started < 1500 + KILL_GRACE_MS + 8000, "SIGKILL must follow the grace period");
  pass("a_child_ignoring_sigterm_is_still_terminated");
}

// ---------------------------------------------------------------------------
// 9. A child that dies without recording anything, having produced no
//    measurement, is an instrument failure. Having produced one, it is
//    incomplete evidence. Evidence on disk decides — never the exit code alone.
// ---------------------------------------------------------------------------
{
  const child = fakeChild("silent-death", `process.exit(7);`);
  const bare = await measure(child);
  assert.equal(bare.outcome.outcome, OUTCOME.INFRA_ERROR);
  assert.equal(isRetryableOutcome(bare.outcome), true);

  const lhrPath = join(WORK, "orphan-lhr.json");
  writeFileSync(lhrPath, "{}");
  const withMeasurement = await measure(child, { lhrPath });
  assert.equal(withMeasurement.outcome.outcome, OUTCOME.INVALID_OR_INCOMPLETE);
  assert.equal(
    isRetryableOutcome(withMeasurement.outcome),
    false,
    "a navigation that happened is never repeated because the process died afterwards",
  );
  pass("silent_child_death_is_classified_from_evidence_on_disk");
}

// ---------------------------------------------------------------------------
// 10. A malformed or unreadable outcome is inconclusive, never a pass.
//     Defective implementation: JSON.parse throws and takes the run with it, or
//     an unrecognised value falls through to a success path.
// ---------------------------------------------------------------------------
{
  const child = fakeChild(
    "garbage-outcome",
    `import { writeFileSync } from "fs"; writeFileSync(process.argv[3], "{ not json");`,
  );
  const { outcome } = await measure(child);
  assert.equal(outcome.outcome, OUTCOME.INVALID_OR_INCOMPLETE);
  pass("unreadable_outcome_is_inconclusive");

  const child2 = fakeChild(
    "unknown-outcome",
    `import { writeFileSync } from "fs"; writeFileSync(process.argv[3], JSON.stringify({ outcome: "PASS" }));`,
  );
  const second = await measure(child2);
  assert.equal(second.outcome.outcome, OUTCOME.INVALID_OR_INCOMPLETE, "an unknown verdict is never honoured");
  pass("unrecognised_outcome_is_never_honoured");
}

// ---------------------------------------------------------------------------
// 11. A stale outcome file from a previous attempt must never be read as this
//     attempt's result.
//     Defective implementation: the file is left in place and an attempt that
//     produced nothing inherits the previous verdict.
// ---------------------------------------------------------------------------
{
  const id = "stale";
  const specPath = join(WORK, `spec-${id}.json`);
  const outcomePath = join(WORK, `outcome-${id}.json`);
  writeFileSync(specPath, "{}");
  writeFileSync(
    outcomePath,
    JSON.stringify({ outcome: "MEASURED", phase: "complete", row: { path: "/", run: 1, performance: 100 } }),
  );
  const child = fakeChild("no-write", `process.exit(3);`);
  const outcome = await runMeasurement({ childPath: child, specPath, outcomePath, lhrPath: null, timeoutMs: 10000 });
  assert.notEqual(outcome.outcome, OUTCOME.MEASURED, "a previous attempt's verdict must not be inherited");
  assert.equal(outcome.outcome, OUTCOME.INFRA_ERROR);
  pass("a_stale_outcome_file_is_never_inherited");
}

// ---------------------------------------------------------------------------
// 12. A child that cannot be spawned at all is an instrument failure, reported
//     rather than thrown.
// ---------------------------------------------------------------------------
{
  // The child inherits stderr, so Node's MODULE_NOT_FOUND banner below is the
  // expected output of this case, not a failure of the suite.
  console.log("-- expected below: MODULE_NOT_FOUND from a deliberately unspawnable child --");
  const { outcome } = await measure(join(WORK, "does-not-exist.mjs"), { timeoutMs: 8000 });
  assert.notEqual(outcome.outcome, OUTCOME.MEASURED);
  pass("an_unspawnable_measurement_is_reported_not_thrown");
}

// ---------------------------------------------------------------------------
// 13. The REAL child, with a browser that cannot start. This exercises the
//     shipped classification path end to end, without needing Chrome.
// ---------------------------------------------------------------------------
{
  const lhrPath = join(WORK, "real-child-lhr.json");
  const { outcome } = await measure(CHILD, {
    spec: {
      url: "http://127.0.0.1:1/",
      path: "/",
      slug: "home",
      run: 1,
      attempt: 1,
      out_json: lhrPath,
      base: "http://127.0.0.1:1",
      form_factor: "mobile",
      viewport: { width: 390, height: 844, device_scale_factor: 3 },
      runtime_mode: false,
      seo_exempt: false,
      chrome_path: join(WORK, "no-such-chrome"),
    },
    lhrPath,
    timeoutMs: 60000,
  });
  assert.equal(outcome.outcome, OUTCOME.INFRA_ERROR, "a browser that cannot start is an instrument failure");
  assert.ok(["launch", "cdp"].includes(outcome.phase), `unexpected phase ${outcome.phase}`);
  assert.equal(isRetryableOutcome(outcome), true);
  assert.equal(existsSync(lhrPath), false, "no measurement was produced");
  pass("the_real_child_classifies_an_unstartable_browser_as_instrument_failure");
}

// ---------------------------------------------------------------------------
// 14. readOutcome's own contract, stated directly.
// ---------------------------------------------------------------------------
{
  const fallback = { outcome: OUTCOME.INFRA_ERROR, phase: "launch", error: "died", origin: "supervisor" };
  const missing = readOutcome({ outcomePath: join(WORK, "nope.json"), lhrPath: null, fallback });
  assert.equal(missing.outcome, OUTCOME.INFRA_ERROR);

  const lhrPath = join(WORK, "contract-lhr.json");
  writeFileSync(lhrPath, "{}");
  const orphaned = readOutcome({ outcomePath: join(WORK, "nope.json"), lhrPath, fallback });
  assert.equal(orphaned.outcome, OUTCOME.INVALID_OR_INCOMPLETE);
  assert.equal(orphaned.lhr_written, true);
  pass("read_outcome_contract_holds");
}

// ---------------------------------------------------------------------------
// 15. The terminal state must not blame the artifact for the instrument.
//     Defective implementation (shipped briefly during this campaign): the
//     state was derived from `evaluation.ok` alone, so three failed browser
//     launches on one page — the originating incident — produced MEASURED_FAIL
//     and told the operator the site was defective.
// ---------------------------------------------------------------------------
{
  const clean = [{ path: "/", run: 1, performance: 100 }];
  assert.equal(
    deriveTerminalState({ results: clean, fatal: null, evaluationOk: true }),
    "MEASURED_PASS",
  );

  // A real budget breach, measured: the artifact IS the problem.
  const measuredFailure = [{ path: "/", run: 1, error: "home: LCP 2264ms must be <= 2000ms" }];
  assert.equal(
    deriveTerminalState({ results: measuredFailure, fatal: null, evaluationOk: false }),
    "MEASURED_FAIL",
    "a budget exceeded by a real measurement is a verdict about the artifact",
  );

  // The instrument never measured: inconclusive, not defective.
  for (const outcome of [OUTCOME.INFRA_ERROR, OUTCOME.INVALID_OR_INCOMPLETE]) {
    const rows = [
      { path: "/", run: 1, performance: 100 },
      { path: "/casos/", run: 1, error: "browser died", status: "error", outcome, phase: "launch" },
    ];
    assert.equal(
      deriveTerminalState({ results: rows, fatal: null, evaluationOk: false }),
      "INVALID_OR_INCOMPLETE",
      `${outcome} must not be reported as a defective site`,
    );
  }

  // A mixture: one genuinely failing measurement AND one unmeasured row. The
  // run still cannot claim a verdict, because part of it was never measured.
  assert.equal(
    deriveTerminalState({
      results: [
        { path: "/", run: 1, error: "home: CLS 0.07 must be <= 0.05" },
        { path: "/casos/", run: 1, error: "browser died", outcome: OUTCOME.INFRA_ERROR },
      ],
      fatal: null,
      evaluationOk: false,
    }),
    "INVALID_OR_INCOMPLETE",
  );

  // A run that could not finish is never a verdict, even with clean rows.
  assert.equal(
    deriveTerminalState({ results: clean, fatal: "budget exhausted", evaluationOk: true }),
    "INVALID_OR_INCOMPLETE",
    "a run that could not complete never reports a pass",
  );
  assert.equal(deriveTerminalState({}), "MEASURED_FAIL");
  pass("terminal_state_never_blames_the_artifact_for_the_instrument");
}

assert.ok(MEASUREMENT_TIMEOUT_MS > 0, "a measurement deadline must exist");
rmSync(WORK, { recursive: true, force: true });
console.log(`LIGHTHOUSE_INFRA_OK (${ok} behavioural counterproofs)`);
