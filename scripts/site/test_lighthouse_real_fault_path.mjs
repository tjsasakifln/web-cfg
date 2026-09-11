/**
 * The originating failure, reproduced on the REAL path.
 *
 * Why this file exists. The first counterproof suite for this incident wrote
 * `phase: "launch"` into an outcome file by hand and asserted the supervisor
 * retried it. That test passed while the shipped code could not recover from
 * the actual failure at all: the child sets `phase = "navigate"` BEFORE calling
 * lighthouse(), the Target.getTargetInfo rejection arrives during that call, and
 * a classifier keyed only on the phase refused to re-attempt it. The runner no
 * longer died — and the release still failed and rolled back.
 *
 * So every case here spawns the REAL scripts/site/lighthouse_measure_child.mjs
 * and drives it through the REAL supervisor. Only the `lighthouse` and
 * `chrome-launcher` dependencies are substituted (see
 * test_fixtures/lighthouse_fault_injection.mjs), because the failure originates
 * inside Lighthouse and this runner has no browser. Nothing in these tests
 * writes the verdict it is asserting: the phase transitions, the progress
 * record, the unhandledRejection handler, the classifier and the supervisor's
 * attempt loop all execute for real.
 */
import assert from "assert";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import {
  INFRASTRUCTURE_ATTEMPTS,
  OUTCOME,
  isRetryableOutcome,
  runMeasurement,
} from "./lighthouse_infra.mjs";

const CHILD = fileURLToPath(new URL("./lighthouse_measure_child.mjs", import.meta.url));
const INJECT = fileURLToPath(new URL("./test_fixtures/lighthouse_fault_injection.mjs", import.meta.url));
const WORK = mkdtempSync(join(tmpdir(), "confenge-real-fault-"));
let ok = 0;
const pass = (name) => {
  ok += 1;
  console.log("OK", name);
};

let seq = 0;
/** Runs one real measurement attempt with a fault injected into Lighthouse. */
async function attempt(fault, { once = false, marker = "", timeoutMs = 30000 } = {}) {
  seq += 1;
  const id = `${fault}-${seq}`;
  const specPath = join(WORK, `spec-${id}.json`);
  const outcomePath = join(WORK, `outcome-${id}.json`);
  const lhrPath = join(WORK, `lhr-${id}.json`);
  writeFileSync(
    specPath,
    JSON.stringify({
      url: "http://127.0.0.1:8766/",
      path: "/",
      slug: "home",
      run: 1,
      attempt: 1,
      out_json: lhrPath,
      base: "http://127.0.0.1:8766",
      form_factor: "mobile",
      viewport: { width: 390, height: 844, device_scale_factor: 3 },
      runtime_mode: false,
      seo_exempt: false,
    }),
  );
  const outcome = await runMeasurement({
    childPath: CHILD,
    specPath,
    outcomePath,
    lhrPath,
    timeoutMs,
    // `--import` loads the fault fixture before the real child module.
    nodeExecutable: process.execPath,
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import ${INJECT}`.trim(),
      LH_FAULT: fault,
      LH_FAULT_ONCE: once ? "1" : "0",
      LH_FAULT_MARKER: marker,
    },
  });
  return { outcome, lhrPath, outcomePath };
}

// ---------------------------------------------------------------------------
// 1. THE ORIGINATING FAILURE, ON THE REAL PATH.
//
//    Target.getTargetInfo rejects asynchronously from inside the measurement
//    call, before any LHR exists. The child is genuinely in phase `navigate`
//    when it happens — which is exactly why the phase-only classifier failed.
//
//    Required: contained (the supervisor survives), classified as an instrument
//    failure by ORIGIN, and eligible for another attempt.
// ---------------------------------------------------------------------------
{
  const { outcome, lhrPath } = await attempt("session_lost_async");
  assert.equal(outcome.outcome, OUTCOME.INFRA_ERROR, `got ${JSON.stringify(outcome)}`);
  assert.equal(
    outcome.phase,
    "navigate",
    "the failure really does happen during the measurement, not during bring-up",
  );
  assert.match(outcome.error, /Target\.getTargetInfo/);
  assert.equal(outcome.protocol_method, "Target.getTargetInfo", "the CDP method must be preserved");
  assert.equal(outcome.instrument_origin, true, "a lost debugging session is our instrument");
  assert.equal(outcome.lhr_written, false);
  assert.equal(existsSync(lhrPath), false, "no measurement was produced");
  assert.equal(
    isRetryableOutcome(outcome),
    true,
    "the originating failure MUST be recoverable; this is the assertion the previous suite could not make",
  );
  pass("originating_target_info_rejection_during_measurement_is_recoverable");
}

// ---------------------------------------------------------------------------
// 2. The same failure thrown from the awaited call, not asynchronously.
// ---------------------------------------------------------------------------
{
  const { outcome } = await attempt("session_lost_thrown");
  assert.equal(outcome.outcome, OUTCOME.INFRA_ERROR);
  assert.equal(outcome.instrument_origin, true);
  assert.equal(isRetryableOutcome(outcome), true);
  pass("the_same_session_loss_thrown_synchronously_is_also_recoverable");
}

// ---------------------------------------------------------------------------
// 3. TRANSIENT: the real failure once, then a real successful measurement.
//    This is the recovery the release needs and never had.
// ---------------------------------------------------------------------------
{
  const marker = join(WORK, "transient-marker");
  const first = await attempt("session_lost_async", { once: true, marker });
  assert.equal(first.outcome.outcome, OUTCOME.INFRA_ERROR);
  assert.equal(isRetryableOutcome(first.outcome), true);

  const second = await attempt("session_lost_async", { once: true, marker });
  assert.equal(second.outcome.outcome, OUTCOME.MEASURED, `got ${JSON.stringify(second.outcome)}`);
  assert.ok(second.outcome.row, "a real row must be produced");
  assert.equal(second.outcome.row.performance, 100);
  assert.equal(existsSync(second.lhrPath), true, "the measurement is persisted");
  pass("transient_session_loss_recovers_to_a_real_measurement_on_the_next_attempt");
}

// ---------------------------------------------------------------------------
// 4. PERSISTENT: the failure never clears. It must exhaust the bounded
//    attempts and end inconclusive — never a pass, never unbounded.
// ---------------------------------------------------------------------------
{
  let attempts = 0;
  let last = null;
  for (let i = 1; i <= INFRASTRUCTURE_ATTEMPTS; i += 1) {
    last = (await attempt("session_lost_async")).outcome;
    attempts += 1;
    if (!isRetryableOutcome(last)) break;
  }
  assert.equal(attempts, INFRASTRUCTURE_ATTEMPTS, "attempts stay bounded at three");
  assert.equal(last.outcome, OUTCOME.INFRA_ERROR);
  assert.notEqual(last.outcome, OUTCOME.MEASURED, "an exhausted instrument failure is never a pass");
  pass("persistent_session_loss_exhausts_bounded_attempts_and_is_never_a_pass");
}

// ---------------------------------------------------------------------------
// 5. A REAL PAGE FAILURE must NOT be laundered into a retry. The whole point of
//    classifying by origin is that `navigate` is not opened up wholesale.
// ---------------------------------------------------------------------------
for (const [fault, code] of [["no_fcp", "NO_FCP"], ["page_hung", "PAGE_HUNG"]]) {
  const { outcome } = await attempt(fault);
  assert.equal(
    outcome.outcome,
    OUTCOME.INVALID_OR_INCOMPLETE,
    `${fault} is evidence about the artifact, got ${JSON.stringify(outcome)}`,
  );
  assert.equal(outcome.instrument_origin, false, `${fault} is not our instrument`);
  assert.equal(outcome.lighthouse_code, code, "the Lighthouse code must be preserved");
  assert.equal(isRetryableOutcome(outcome), false, `${fault} must never be re-attempted`);
}
pass("real_page_failures_during_measurement_are_never_recovered_as_infrastructure");

// ---------------------------------------------------------------------------
// 6. PRESERVATION on the real path: a valid measurement is produced, THEN the
//    same session loss arrives. The measurement must survive and no second
//    navigation may start.
// ---------------------------------------------------------------------------
{
  const { outcome, lhrPath } = await attempt("late_async");
  assert.equal(existsSync(lhrPath), true, "the measured LHR survives the later failure");
  const persisted = JSON.parse(readFileSync(lhrPath, "utf8"));
  assert.equal(persisted.categories.performance.score, 1, "the persisted measurement is intact");
  assert.notEqual(
    outcome.outcome,
    OUTCOME.INFRA_ERROR,
    "a failure after a measurement exists is never an instrument failure",
  );
  assert.equal(
    isRetryableOutcome(outcome),
    false,
    "a measurement that exists is never re-sampled, whatever failed afterwards",
  );
  pass("a_measurement_followed_by_session_loss_is_preserved_and_never_resampled");
}

// ---------------------------------------------------------------------------
// 7. A hung measurement: the supervisor's deadline must actually fire, the
//    child must die, and the result must be inconclusive — not retryable,
//    because we cannot say whether the instrument or the page hung.
// ---------------------------------------------------------------------------
{
  const started = Date.now();
  const { outcome } = await attempt("hang", { timeoutMs: 4000 });
  const elapsed = Date.now() - started;
  assert.equal(outcome.outcome, OUTCOME.INVALID_OR_INCOMPLETE);
  assert.equal(outcome.timed_out, true);
  assert.equal(isRetryableOutcome(outcome), false);
  assert.ok(elapsed < 30000, `the deadline must be enforced, took ${elapsed}ms`);
  assert.match(outcome.error, /reached navigate/, "the progress actually reached must be reported");
  pass("a_hung_measurement_is_terminated_and_reported_inconclusive_with_its_progress");
}

// ---------------------------------------------------------------------------
// 7b. An unexplained death DURING the measurement. The supervisor knows only
//     how far the child got, from the child's own progress record. It must not
//     invent a pre-initialisation phase in order to justify another attempt:
//     a death we cannot explain is inconclusive evidence.
// ---------------------------------------------------------------------------
{
  const { outcome } = await attempt("silent_death");
  assert.equal(outcome.outcome, OUTCOME.INVALID_OR_INCOMPLETE, JSON.stringify(outcome));
  assert.equal(outcome.phase, "navigate", "the progress actually reached is reported, not assumed");
  assert.equal(outcome.instrument_origin, false);
  assert.equal(
    isRetryableOutcome(outcome),
    false,
    "an unexplained death mid-measurement must not be laundered into a retry",
  );
  pass("an_unexplained_death_during_measurement_is_not_fabricated_into_a_retry");
}

// ---------------------------------------------------------------------------
// 8. A clean run produces a real, complete row through the real child.
// ---------------------------------------------------------------------------
{
  const { outcome, lhrPath } = await attempt("ok");
  assert.equal(outcome.outcome, OUTCOME.MEASURED);
  assert.equal(outcome.row.path, "/");
  assert.equal(outcome.row.cls, 0);
  assert.equal(existsSync(lhrPath), true);
  pass("a_clean_measurement_produces_a_complete_row_through_the_real_child");
}

// ---------------------------------------------------------------------------
// 10. AN UNTRAPPABLE KILL OF THE SUPERVISOR MUST NOT LEAVE CHILDREN BEHIND.
//
//     The acceptance wrapper supervises the supervisor and SIGKILLs it on
//     overrun; a job timeout does the same. SIGKILL cannot be trapped, so the
//     supervisor gets no chance to clean up and its measurement child — holding
//     a headless Chrome — would be orphaned, competing for CPU with whatever
//     runs next and silently inflating its metrics.
//
//     The child watches for losing its parent. This drives the real thing: a
//     parent that spawns the real child and is then SIGKILLed.
// ---------------------------------------------------------------------------
{
  const { spawn } = await import("child_process");
  const pidFile = join(WORK, "orphan-child.pid");
  const specPath = join(WORK, "orphan-spec.json");
  const outcomePath = join(WORK, "orphan-outcome.json");
  writeFileSync(
    specPath,
    JSON.stringify({
      url: "http://127.0.0.1:8766/",
      path: "/",
      slug: "home",
      run: 1,
      attempt: 1,
      out_json: join(WORK, "orphan-lhr.json"),
      base: "http://127.0.0.1:8766",
      form_factor: "mobile",
      viewport: { width: 390, height: 844, device_scale_factor: 3 },
      runtime_mode: false,
      seo_exempt: false,
    }),
  );
  // A stand-in parent that spawns the REAL measurement child, exactly as the
  // supervisor does, and then is killed untrappably.
  const parentScript = join(WORK, "orphan-parent.mjs");
  writeFileSync(
    parentScript,
    `import { spawn } from "node:child_process";
     import { writeFileSync } from "node:fs";
     const child = spawn(process.execPath, [${JSON.stringify(CHILD)}, ${JSON.stringify(specPath)}, ${JSON.stringify(outcomePath)}], {
       stdio: "ignore",
       env: { ...process.env, NODE_OPTIONS: "--import ${INJECT}", LH_FAULT: "hang" },
     });
     writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
     setInterval(() => {}, 1000);`,
  );
  const parent = spawn(process.execPath, [parentScript], { stdio: "ignore" });
  let childPid = null;
  for (let i = 0; i < 40 && !childPid; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    if (existsSync(pidFile)) childPid = Number(readFileSync(pidFile, "utf8").trim());
  }
  assert.ok(childPid, "the real measurement child must have started");
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  assert.equal(alive(childPid), true, "the real child must be running before its supervisor is killed");

  parent.kill("SIGKILL");
  let gone = false;
  for (let i = 0; i < 60 && !gone; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    gone = !alive(childPid);
  }
  assert.equal(
    gone,
    true,
    "the REAL measurement child must terminate itself when its supervisor is killed untrappably",
  );
  pass("an_untrappable_kill_of_the_supervisor_leaves_no_measurement_child_behind");
}

// ---------------------------------------------------------------------------
// 11. The supervisor takes its children down on the signals it CAN trap.
// ---------------------------------------------------------------------------
{
  const infraSource = readFileSync(
    fileURLToPath(new URL("./lighthouse_infra.mjs", import.meta.url)),
    "utf8",
  );
  const runnerSource = readFileSync(
    fileURLToPath(new URL("./run_lighthouse.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(infraSource, /export function terminateActiveMeasurements/);
  assert.match(infraSource, /activeChildren\.add\(child\)/);
  assert.match(infraSource, /activeChildren\.delete\(child\)/);
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    assert.ok(
      runnerSource.includes(signal),
      `the supervisor must take its children down on ${signal}`,
    );
  }
  assert.match(runnerSource, /terminateActiveMeasurements\(\)/);
  const childSource = readFileSync(
    fileURLToPath(new URL("./lighthouse_measure_child.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(childSource, /process\.ppid !== bornTo/, "the child must detect being orphaned");
  pass("the_supervisor_and_child_cover_both_trappable_and_untrappable_terminations");
}

rmSync(WORK, { recursive: true, force: true });
console.log(`LIGHTHOUSE_REAL_FAULT_PATH_OK (${ok} counterproofs on the real path)`);
