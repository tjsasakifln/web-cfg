/**
 * Classifies a failed Lighthouse attempt as an INFRASTRUCTURE failure (the
 * browser or its debugging session died before or during collection, so no
 * measurement exists) versus anything else. Only infrastructure failures may
 * be attempted again with a fresh browser; a measured result is never
 * re-sampled (see test_lighthouse_thresholds.mjs, which forbids retrying for a
 * favourable home run).
 *
 * Origin (netcup-release run 34532136335): the second home run on the public
 * edge died with "Protocol error (Target.getTargetInfo): Session with given id
 * not found" raised asynchronously from Lighthouse's TargetManager — an
 * unhandled rejection that crashed the runner after the first run had passed
 * every budget. Nothing about the artifact was measured by that crash.
 */
export const INFRASTRUCTURE_ERROR_PATTERNS = [
  /Protocol error/i,
  /Session with given id not found/i,
  /Target closed/i,
  /Target crashed/i,
  /Chrome CDP not ready/i,
  /Unable to connect to Chrome/i,
  /WebSocket is not open/i,
  /ECONNREFUSED|ECONNRESET|EPIPE/i,
  /Navigation timeout|NO_FCP|NO_LCP|PAGE_HUNG|TARGET_CRASHED|CHROME_INTERSTITIAL_ERROR/i,
];

export const INFRASTRUCTURE_ATTEMPTS = 3;

export function isInfrastructureError(error) {
  const text = String(error?.message || error?.protocolError || error || "");
  return INFRASTRUCTURE_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Registers a process-level trap so an asynchronous browser failure raised
 * outside the awaited call chain is captured for the current attempt instead
 * of crashing the runner. Returns a function that drains the captured error.
 */
export function installAsyncFailureTrap(target = process) {
  let captured = null;
  const onRejection = (reason) => { if (!captured) captured = reason instanceof Error ? reason : new Error(String(reason)); };
  target.on("unhandledRejection", onRejection);
  return {
    drain() { const error = captured; captured = null; return error; },
    dispose() { target.off("unhandledRejection", onRejection); },
  };
}
