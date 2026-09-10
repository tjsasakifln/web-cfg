/**
 * Measurement outcome contract and the supervisor that enforces it.
 *
 * Origin (netcup-release runs 34501989732, 34517284468, 34532136335): the
 * public acceptance ran inside a single process that both measured and judged.
 * On the second home run of 34532136335 Lighthouse raised
 * "Protocol error (Target.getTargetInfo): Session with given id not found"
 * asynchronously from its TargetManager, outside the awaited call chain. That
 * rejection killed the runner after the first run had passed every budget: no
 * summary was written, the acceptance reported a bare exit=1, and a healthy
 * release was rolled back.
 *
 * Two rules follow, and this module exists to make them structural rather than
 * advisory.
 *
 * 1. Isolation is per attempt and real. Every measurement runs in a disposable
 *    child process (lighthouse_measure_child.mjs) that is never reused. The
 *    supervisor survives a child that dies in any manner, owns a deadline it
 *    can actually enforce by killing that child, and always reaches its own
 *    terminal summary.
 *
 * 2. Nothing unknown is a pass. Every attempt resolves to exactly one outcome,
 *    and only MEASURED carries a row:
 *
 *      MEASURED               a valid, complete measurement exists. Whether it
 *                             meets the budgets is decided later, by the
 *                             thresholds, and is never re-sampled.
 *      INFRA_ERROR            our own browser or its debugging session failed
 *                             before any measurement existed. This is the only
 *                             outcome eligible for another attempt.
 *      INVALID_OR_INCOMPLETE  a navigation happened but the evidence is absent,
 *                             inconsistent or inconclusive. It fails the gate
 *                             and is never re-navigated.
 *
 * Classification is by cause, origin and phase — reported by the child, which
 * knows where it was — not by matching words in a message. A page that never
 * painted (NO_FCP/NO_LCP), a hung page, a navigation timeout, a TLS failure or
 * a refused connection against the ORIGIN UNDER TEST are all evidence about
 * the artifact. Only a failure raising our own browser is innocent, and only
 * before a measurement existed.
 */
import { spawn } from "child_process";
import { existsSync, readFileSync, rmSync } from "fs";

export const OUTCOME = {
  MEASURED: "MEASURED",
  INFRA_ERROR: "INFRA_ERROR",
  INVALID_OR_INCOMPLETE: "INVALID_OR_INCOMPLETE",
};

/** Total attempts per eligible measurement, wrapper included. Never multiplied
 * by a second retry layer anywhere else in the chain. */
export const INFRASTRUCTURE_ATTEMPTS = 3;

/** Deadline for one child. Lighthouse's own maxWaitForLoad is 45 s and the
 * complementary collection retries with backoff, so this bounds the whole
 * attempt including a browser that never returns. */
export const MEASUREMENT_TIMEOUT_MS = Number(process.env.LH_MEASUREMENT_TIMEOUT_MS || 240000);

/** Grace between SIGTERM and SIGKILL for a child that ignores the first. */
export const KILL_GRACE_MS = 5000;

/** Only these phases can be re-attempted: they are our own browser coming up,
 * before the artifact under test has been touched. */
const RETRYABLE_PHASES = new Set(["launch", "cdp"]);

/**
 * True when an outcome may be attempted again. Requires an explicit
 * INFRA_ERROR, a phase that precedes any contact with the artifact, and the
 * absence of a measurement. A missing or malformed outcome is never eligible.
 */
export function isRetryableOutcome(outcome) {
  if (!outcome || outcome.outcome !== OUTCOME.INFRA_ERROR) return false;
  if (outcome.lhr_written) return false;
  return RETRYABLE_PHASES.has(String(outcome.phase || ""));
}

/**
 * Runs one measurement in a disposable child process and returns its outcome.
 *
 * The outcome is read from the file the child writes, not inferred from its
 * exit code: a child that recorded INVALID_OR_INCOMPLETE and then died during
 * cleanup has still told us the truth, and a child killed at the deadline has
 * told us nothing. When no outcome file exists we decide from evidence on
 * disk — whether a measurement was already produced — never from the wording
 * of a message.
 */
export function runMeasurement({
  childPath,
  specPath,
  outcomePath,
  lhrPath,
  timeoutMs = MEASUREMENT_TIMEOUT_MS,
  nodeExecutable = process.execPath,
  spawnFn = spawn,
  env = process.env,
}) {
  return new Promise((resolve) => {
    rmSync(outcomePath, { force: true });
    const child = spawnFn(nodeExecutable, [childPath, specPath, outcomePath], {
      stdio: ["ignore", "inherit", "inherit"],
      env,
    });

    let timedOut = false;
    let killTimer = null;
    const deadline = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
      killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, KILL_GRACE_MS);
    }, timeoutMs);

    const finish = (fallback) => {
      clearTimeout(deadline);
      if (killTimer) clearTimeout(killTimer);
      resolve(readOutcome({ outcomePath, lhrPath, fallback }));
    };

    child.on("error", (error) => {
      finish({
        outcome: OUTCOME.INFRA_ERROR,
        phase: "launch",
        error: `could not start the measurement subprocess: ${String(error?.message || error)}`,
        origin: "supervisor",
      });
    });

    child.on("close", (code, signal) => {
      finish({
        // A child killed at the deadline produced no verdict. Whether that is
        // an unusable instrument or an unusable page is not knowable from
        // here, so it is inconclusive evidence, never innocent infrastructure
        // and never a pass.
        outcome: timedOut ? OUTCOME.INVALID_OR_INCOMPLETE : OUTCOME.INFRA_ERROR,
        phase: timedOut ? "navigate" : "launch",
        error: timedOut
          ? `measurement exceeded ${timeoutMs}ms and was terminated`
          : `measurement subprocess exited without recording an outcome (code=${code}, signal=${signal})`,
        origin: "supervisor",
        timed_out: timedOut,
      });
    });
  });
}

/**
 * Reads the outcome the child recorded. When it is missing, the presence of a
 * measurement on disk decides: a produced LHR means a navigation happened, so
 * the attempt is incomplete evidence rather than a re-attemptable instrument
 * failure.
 */
export function readOutcome({ outcomePath, lhrPath, fallback }) {
  if (existsSync(outcomePath)) {
    try {
      const parsed = JSON.parse(readFileSync(outcomePath, "utf8"));
      if (parsed && typeof parsed === "object" && OUTCOME[parsed.outcome]) return parsed;
      return {
        outcome: OUTCOME.INVALID_OR_INCOMPLETE,
        phase: "postprocess",
        error: "the measurement subprocess recorded an unrecognised outcome",
        origin: "supervisor",
      };
    } catch (error) {
      return {
        outcome: OUTCOME.INVALID_OR_INCOMPLETE,
        phase: "postprocess",
        error: `the recorded outcome could not be read: ${String(error?.message || error)}`,
        origin: "supervisor",
      };
    }
  }
  if (lhrPath && existsSync(lhrPath)) {
    return {
      ...fallback,
      outcome: OUTCOME.INVALID_OR_INCOMPLETE,
      lhr_written: true,
      error: `${fallback.error} (a measurement was produced but never completed)`,
    };
  }
  return fallback;
}

/**
 * The run's terminal state.
 *
 * MEASURED_FAIL is a statement ABOUT THE ARTIFACT and may only be used when
 * every failing row has a measurement behind it. A row that never produced one
 * — the browser died, the attempt was terminated, the evidence was
 * inconclusive — makes the RUN inconclusive, not the site defective. Without
 * this the originating incident inverts: three failed browser launches on one
 * page would be reported as "the site is defective", the opposite of what
 * happened, and the operator would go looking for a regression that does not
 * exist.
 *
 * It can never loosen the barrier: promotion requires MEASURED_PASS, so
 * downgrading a failure to INVALID_OR_INCOMPLETE forbids strictly more.
 */
export function deriveTerminalState({ results = [], fatal = null, evaluationOk = false } = {}) {
  if (evaluationOk && !fatal) return "MEASURED_PASS";
  const unmeasured = results.filter(
    (row) => row?.error && row?.outcome && row.outcome !== OUTCOME.MEASURED,
  );
  if (fatal || unmeasured.length > 0) return "INVALID_OR_INCOMPLETE";
  return "MEASURED_FAIL";
}
