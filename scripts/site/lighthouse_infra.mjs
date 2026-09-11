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

/** Phases that precede any contact with the artifact: our own browser coming
 * up. A failure here is always the instrument. */
const RETRYABLE_PHASES = new Set(["launch", "cdp"]);

/**
 * Lighthouse error codes that are EVIDENCE ABOUT THE ARTIFACT. A page that
 * never painted, hung, was not HTML, crashed its renderer, or could not be
 * fetched is telling us something about the release under test. None of these
 * is ever an innocent instrument failure, no matter which CDP command surfaced
 * it, and none is ever re-attempted for a better sample.
 * (Codes taken from node_modules/lighthouse/core/lib/lh-error.js.)
 */
const ARTIFACT_EVIDENCE_CODES = new Set([
  "NO_FCP", "NO_LCP", "NO_LCP_ALL_FRAMES", "NO_DCL", "NO_FMP", "NO_NAVSTART",
  "NO_DOCUMENT_REQUEST", "FAILED_DOCUMENT_REQUEST", "ERRORED_DOCUMENT_REQUEST",
  "INSECURE_DOCUMENT_REQUEST", "CHROME_INTERSTITIAL_ERROR", "PAGE_HUNG",
  "NOT_HTML", "DNS_FAILURE", "INVALID_URL", "TARGET_CRASHED",
  "NO_SPEEDLINE_FRAMES", "SPEEDINDEX_OF_ZERO", "NO_SCREENSHOTS",
  "INVALID_SPEEDLINE", "NO_RESOURCE_REQUEST", "NO_TRACING_STARTED",
  "NO_TTI_CPU_IDLE_PERIOD", "NO_TTI_NETWORK_IDLE_PERIOD", "PROTOCOL_TIMEOUT",
]);

/**
 * The debugging SESSION itself is gone. This is the failure that ended
 * netcup-release run 34532136335: Lighthouse's TargetManager issued
 * Target.getTargetInfo against a session Chrome had already discarded. It says
 * nothing about the page — the browser we own stopped being usable.
 *
 * Deliberately narrow. It is matched only together with a CDP protocol method
 * and only when no measurement exists, so it cannot become a general licence to
 * repeat the navigation phase.
 */
const SESSION_LOST = /Session with given id not found|Target closed|Session closed|Connection closed|WebSocket is not open|Browser closed/i;

/**
 * Classifies a measurement failure by ORIGIN, from metadata the instrument
 * actually provides — not by matching words in a message.
 *
 * Returns the fields the outcome carries, so the decision can be audited after
 * the fact and so `isRetryableOutcome` never has to re-derive it.
 */
export function classifyFailure({ error, lhrWritten = false, phase = "launch" } = {}) {
  const code = error?.code || null;
  const protocolMethod = error?.protocolMethod || null;
  const protocolError = error?.protocolError || null;
  const text = String(error?.message || protocolError || error || "");

  // Once a measurement exists nothing may re-navigate, whatever failed after.
  if (lhrWritten) {
    return {
      outcome: OUTCOME.INVALID_OR_INCOMPLETE,
      instrument_origin: false,
      protocol_method: protocolMethod,
      lighthouse_code: code,
    };
  }

  // Evidence about the artifact wins over every other signal.
  if (code && ARTIFACT_EVIDENCE_CODES.has(code)) {
    return {
      outcome: OUTCOME.INVALID_OR_INCOMPLETE,
      instrument_origin: false,
      protocol_method: protocolMethod,
      lighthouse_code: code,
    };
  }

  // Bringing our own browser up: always the instrument.
  if (RETRYABLE_PHASES.has(String(phase))) {
    return {
      outcome: OUTCOME.INFRA_ERROR,
      instrument_origin: true,
      protocol_method: protocolMethod,
      lighthouse_code: code,
    };
  }

  // During collection, only a proven loss of the local debugging session is the
  // instrument. It must be a CDP command failure AND say the session is gone.
  if (protocolMethod && SESSION_LOST.test(text)) {
    return {
      outcome: OUTCOME.INFRA_ERROR,
      instrument_origin: true,
      protocol_method: protocolMethod,
      lighthouse_code: code,
    };
  }

  // Anything else during collection is inconclusive evidence, never innocent.
  return {
    outcome: OUTCOME.INVALID_OR_INCOMPLETE,
    instrument_origin: false,
    protocol_method: protocolMethod,
    lighthouse_code: code,
  };
}

/**
 * True when an outcome may be attempted again. Requires an explicit
 * INFRA_ERROR, the absence of a measurement, and a failure the classifier
 * attributed to our own instrument. A missing or malformed outcome, and any
 * outcome with no recorded origin outside the bring-up phases, is never
 * eligible — an unexplained death is not evidence that a retry is safe.
 */
export function isRetryableOutcome(outcome) {
  if (!outcome || outcome.outcome !== OUTCOME.INFRA_ERROR) return false;
  if (outcome.lhr_written) return false;
  if (outcome.instrument_origin === true) return true;
  if (outcome.instrument_origin === false) return false;
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
/**
 * Measurement children currently running under this supervisor.
 *
 * An external SIGKILL — the wrapper's own supervision, or a job timeout —
 * cannot be trapped, so the supervisor gets no chance to clean up. Keeping the
 * registry lets every signal we CAN trap take the children down, and the child
 * itself watches for being orphaned to cover the signal we cannot.
 */
const activeChildren = new Set();

/** Terminates every measurement child this supervisor owns. */
export function terminateActiveMeasurements(signal = "SIGKILL") {
  for (const child of activeChildren) {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
  activeChildren.clear();
}

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
    rmSync(`${outcomePath}.progress`, { force: true });
    const child = spawnFn(nodeExecutable, [childPath, specPath, outcomePath], {
      stdio: ["ignore", "inherit", "inherit"],
      env,
    });

    activeChildren.add(child);
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
      activeChildren.delete(child);
      clearTimeout(deadline);
      if (killTimer) clearTimeout(killTimer);
      resolve(readOutcome({ outcomePath, lhrPath, fallback }));
    };
    const reachedPhase = () => {
      try {
        return readFileSync(`${outcomePath}.progress`, "utf8").trim() || null;
      } catch {
        return null;
      }
    };

    child.on("error", (error) => {
      finish({
        outcome: OUTCOME.INFRA_ERROR,
        phase: "launch",
        instrument_origin: true,
        error: `could not start the measurement subprocess: ${String(error?.message || error)}`,
        origin: "supervisor",
      });
    });

    child.on("close", (code, signal) => {
      // A child that recorded no outcome left no diagnosis. How far it got is
      // read from its own progress record — never assumed. Inventing a
      // pre-initialisation phase here would manufacture a retry for a death we
      // cannot explain, which is precisely what must not happen.
      const progress = reachedPhase();
      const beforeBrowser = progress === null || progress === "launch";
      finish({
        outcome: timedOut
          ? OUTCOME.INVALID_OR_INCOMPLETE
          : beforeBrowser
            ? OUTCOME.INFRA_ERROR
            : OUTCOME.INVALID_OR_INCOMPLETE,
        phase: progress || "launch",
        // Only a death before the browser was usable is attributed to the
        // instrument; a death during collection is inconclusive.
        instrument_origin: !timedOut && beforeBrowser,
        error: timedOut
          ? `measurement exceeded ${timeoutMs}ms and was terminated (reached ${progress || "launch"})`
          : `measurement subprocess exited without recording an outcome (code=${code}, signal=${signal}, reached ${progress || "launch"})`,
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
