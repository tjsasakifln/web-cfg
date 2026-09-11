/**
 * Fault injection for the measurement child — TEST FIXTURE, never loaded by the
 * release flow.
 *
 * The child is spawned with `--import` pointing at this file, so the REAL
 * scripts/site/lighthouse_measure_child.mjs executes: its real phase
 * transitions, its real progress record, its real unhandledRejection handler
 * and the real classifier all run. Only two dependencies are substituted —
 * `lighthouse` and `chrome-launcher` — because the failure being reproduced
 * originates inside Lighthouse and the CI runner for these tests has no
 * browser.
 *
 * That is the difference between this and a test that writes the verdict it
 * wants into a JSON file: here nothing decides the outcome except the code
 * under test.
 *
 * The injected fault is the exact shape Lighthouse produced in netcup-release
 * run 34532136335, built the same way lh-error.js builds it
 * (`fromProtocolMessage` assigns `protocolMethod` and `protocolError`), and
 * raised as an unhandled rejection from a timer — outside the awaited chain,
 * exactly as TargetManager._onSessionAttached does.
 *
 * LH_FAULT selects the fault:
 *   session_lost_async  async rejection, session gone, during the measurement
 *   session_lost_thrown the same failure, thrown from the awaited call
 *   no_fcp              the page never painted (evidence about the artifact)
 *   page_hung           the page hung (evidence about the artifact)
 *   late_async          a VALID result, then an async rejection afterwards
 *   ok                  a valid, complete measurement
 * LH_FAULT_ONCE=1 makes the fault apply only to the first process that runs,
 * using LH_FAULT_MARKER as the shared marker file, so transient recovery can be
 * exercised across separate attempts.
 */
import { registerHooks } from "node:module";
import { existsSync, writeFileSync } from "node:fs";

const FAULT = process.env.LH_FAULT || "ok";
const MARKER = process.env.LH_FAULT_MARKER || "";
const ONCE = process.env.LH_FAULT_ONCE === "1";

function faultApplies() {
  if (!ONCE) return true;
  if (!MARKER) return true;
  if (existsSync(MARKER)) return false;
  writeFileSync(MARKER, "used");
  return true;
}

/** Built exactly as lh-error.js does for a protocol failure. */
function protocolError(method, message) {
  const error = new Error(`Protocol error (${method}): ${message}`);
  return Object.assign(error, { protocolMethod: method, protocolError: message });
}

/** Built exactly as lh-error.js does for a page-level failure. */
function lighthouseError(code, message) {
  const error = new Error(message);
  return Object.assign(error, { code, friendlyMessage: message });
}

function validLhr(url) {
  return {
    requestedUrl: url,
    finalDisplayedUrl: url,
    environment: { benchmarkIndex: 1500 },
    categories: {
      performance: { score: 1 },
      accessibility: { score: 1 },
      "best-practices": { score: 1 },
      seo: { score: 1 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: 1500 },
      "cumulative-layout-shift": { numericValue: 0 },
      "total-blocking-time": { numericValue: 0 },
      "first-contentful-paint": { numericValue: 900 },
      "speed-index": { numericValue: 900 },
      "image-aspect-ratio": { score: 1 },
      "image-size-responsive": { score: 1 },
      "dom-size-insight": { numericValue: 400 },
      "total-byte-weight": { numericValue: 100000 },
      "long-tasks": { details: { items: [] } },
      "network-requests": { details: { items: [] } },
      "render-blocking-insight": { metricSavings: { LCP: 0 } },
      "image-delivery-insight": { details: { debugData: { wastedBytes: 0 } } },
      "font-display-insight": { score: 1 },
    },
  };
}

const FAKE_LIGHTHOUSE = `
const FAULT = ${JSON.stringify(FAULT)};
const APPLIES = ${JSON.stringify(faultApplies())};
${protocolError.toString()}
${lighthouseError.toString()}
${validLhr.toString()}
export default async function lighthouse(url) {
  if (!APPLIES || FAULT === "ok") return { lhr: validLhr(url) };
  if (FAULT === "session_lost_async") {
    // Raised from a timer with no handler on the awaited path: the shape of
    // TargetManager._onSessionAttached in run 34532136335. The measurement call
    // never settles, so the process is carried by the rejection alone.
    setTimeout(() => {
      Promise.reject(protocolError("Target.getTargetInfo", "Session with given id not found."));
    }, 30);
    return await new Promise(() => {});
  }
  if (FAULT === "session_lost_thrown") {
    throw protocolError("Target.getTargetInfo", "Session with given id not found.");
  }
  if (FAULT === "no_fcp") {
    throw lighthouseError("NO_FCP", "The page did not paint any content.");
  }
  if (FAULT === "page_hung") {
    throw lighthouseError("PAGE_HUNG", "The page hung.");
  }
  if (FAULT === "late_async") {
    // A complete, valid measurement is produced FIRST; the failure arrives
    // after it exists and must never cause another navigation.
    setTimeout(() => {
      Promise.reject(protocolError("Target.getTargetInfo", "Session with given id not found."));
    }, 120);
    return { lhr: validLhr(url) };
  }
  if (FAULT === "hang") {
    // The interval keeps the event loop alive. Without it Node detects an
    // unsettled top-level await and exits on its own (code 13), which would
    // test the unexplained-death path instead of the supervisor's deadline.
    setInterval(() => {}, 1000);
    return await new Promise(() => {});
  }
  if (FAULT === "silent_death") {
    // Dies during the measurement leaving no outcome and no cause. The
    // supervisor must not invent a pre-initialisation phase to justify a retry.
    process.exit(9);
  }
  throw new Error("unknown injected fault " + FAULT);
}
`;

/**
 * A stand-in browser that is REAL enough to prove the teardown: a detached
 * process in its own group, with a child of its own, exactly like Chrome and
 * its renderers. Verifying that the measurement child's pid is gone proves
 * nothing about a browser launched detached — only killing the group does, and
 * only a real group can show it.
 *
 * LH_BROWSER_PIDFILE, when set, receives the browser pid so a test can check
 * the whole tree afterwards.
 */
const FAKE_CHROME_LAUNCHER = `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
export async function launch() {
  const browser = spawn(
    process.execPath,
    ["-e", "const { spawn } = require('node:child_process'); const kid = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); if (process.env.LH_RENDERER_PIDFILE) require('node:fs').writeFileSync(process.env.LH_RENDERER_PIDFILE, String(kid.pid)); setInterval(() => {}, 1000);"],
    { detached: true, stdio: "ignore" },
  );
  browser.unref();
  if (process.env.LH_BROWSER_PIDFILE) {
    writeFileSync(process.env.LH_BROWSER_PIDFILE, String(browser.pid));
  }
  return {
    port: 9222,
    pid: browser.pid,
    process: browser,
    async kill() {
      try { process.kill(-browser.pid, "SIGKILL"); } catch { /* already gone */ }
    },
  };
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "lighthouse") return { url: "fault:lighthouse", shortCircuit: true };
    if (specifier === "chrome-launcher") return { url: "fault:chrome-launcher", shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "fault:lighthouse") {
      return { format: "module", source: FAKE_LIGHTHOUSE, shortCircuit: true };
    }
    if (url === "fault:chrome-launcher") {
      return { format: "module", source: FAKE_CHROME_LAUNCHER, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

// The child probes the CDP endpoint before measuring; there is no browser here.
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
