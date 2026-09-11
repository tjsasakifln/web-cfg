/**
 * One Lighthouse measurement, in a disposable child process.
 *
 * The supervisor (run_lighthouse.mjs) spawns this file once per measurement
 * attempt and never reuses it. That is what makes the isolation real: an
 * asynchronous rejection raised from inside Lighthouse's TargetManager — the
 * failure that killed the runner in netcup-release run 34532136335 — can at
 * worst kill THIS process, after the outcome has already been written to disk.
 * It can neither contaminate the next attempt nor take the supervisor (and
 * with it every measurement already collected) down with it.
 *
 * Contract with the supervisor
 * ----------------------------
 * argv[2] is the path of a JSON spec file; argv[3] is the path this process
 * must write its outcome to. The outcome is written exactly once, as early as
 * the facts allow, and is authoritative even when this process later dies:
 *
 *   MEASURED              a complete, valid row exists (navigation + payload)
 *   INFRA_ERROR           the local browser/CDP died BEFORE a valid LHR existed
 *   INVALID_OR_INCOMPLETE a navigation happened but the evidence is not complete
 *
 * `phase` records where the failure happened, so the supervisor classifies on
 * cause and origin rather than on the wording of a message. Only a failure in
 * the `launch`/`cdp` phases — our own browser, before any measurement — is
 * eligible to be re-attempted. A page that never painted (NO_FCP/NO_LCP), a
 * navigation timeout, a TLS or HTTP failure against the target origin and a
 * dead upstream are all evidence ABOUT the artifact, never innocent
 * infrastructure.
 */
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { launch as launchChrome } from "chrome-launcher";
import lighthouse from "lighthouse";
import { headerByteWeight, lcpNetworkAllowanceMs, measureContentByteWeight } from "./lighthouse_payload.mjs";
import { classifyFailure } from "./lighthouse_infra.mjs";

const specPath = process.argv[2];
const outcomePath = process.argv[3];
if (!specPath || !outcomePath) {
  console.error("usage: lighthouse_measure_child.mjs <spec.json> <outcome.json>");
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));

/** The browser this process owns. Declared before any exit path can reach it,
 * and assigned by BOTH the preflight and the measurement path, so every exit
 * route can take the browser down with it. */
let launched = null;

// The supervisor enforces its deadline with SIGTERM then SIGKILL. SIGTERM must
// not leave the browser running for the attempts that follow.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    killBrowserNow();
    process.exit(1);
  });
}

const progressPath = `${outcomePath}.progress`;
/**
 * Records how far this process got. When it dies without recording an outcome,
 * this is the only thing that distinguishes "never started the browser" from
 * "died in the middle of a measurement" — and the supervisor must not invent
 * the difference in order to justify another attempt.
 */
function markProgress(value) {
  try {
    writeFileSync(progressPath, value);
  } catch {
    /* progress is diagnostic; never fail the attempt over it */
  }
}
markProgress("launch");

/** The outcome file is written once. The first writer wins, so a late failure
 * can never downgrade an outcome that was already established. */
let settled = false;
function settle(outcome) {
  if (settled) return;
  settled = true;
  try {
    writeFileSync(outcomePath, JSON.stringify(outcome, null, 2));
  } catch (error) {
    console.error("could not persist the measurement outcome", String(error?.message || error));
  }
}

/**
 * Kills the browser synchronously. `process.exit()` skips `finally`, and
 * chrome-launcher spawns Chrome detached (its own process group) with no exit
 * handler of its own, so an exit path that does not do this leaves a live
 * headless Chrome behind. The leak is not the problem: an orphan competes for
 * CPU with every subsequent measurement on a 4-vCPU runner and inflates their
 * TBT and LCP, manufacturing failures that look like performance regressions.
 * That would contaminate exactly what this file claims to isolate.
 */
function killBrowserNow() {
  const pid = launched?.chrome?.pid ?? launched?.chrome?.process?.pid;
  if (!pid) return;
  try {
    // Negative pid: the detached process group, so renderers go too.
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function describe(error) {
  const message = String(error?.message || error || "unknown error");
  const code = error?.code || error?.protocolMethod || null;
  return code && !message.includes(String(code)) ? `${message} [${code}]` : message;
}

/**
 * A rejection that escapes the awaited chain still belongs to THIS attempt and
 * to whatever phase we had reached. We record it and let the process die: the
 * supervisor reads the file, not the exit code, to decide what happened.
 */
let phase = "launch";
let lhrWritten = false;
process.on("unhandledRejection", (reason) => {
  // The originating incident arrives here: a rejection raised from inside
  // Lighthouse's TargetManager, during the measurement call, outside the
  // awaited chain. Its class is decided by where the failure came from, not by
  // the phase we happened to be in.
  settle({
    ...classifyFailure({ error: reason, lhrWritten, phase }),
    phase,
    error: describe(reason),
    origin: "async_rejection",
    lhr_written: lhrWritten,
  });
  killBrowserNow();
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  settle({
    ...classifyFailure({ error, lhrWritten, phase }),
    phase,
    error: describe(error),
    origin: "uncaught_exception",
    lhr_written: lhrWritten,
  });
  killBrowserNow();
  process.exit(1);
});

async function waitForCdp(port, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      // Without a deadline a half-open socket blocks this iteration forever
      // and the "~10 s" bound below is not a bound at all.
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Chrome CDP not ready on port ${port}`);
}

async function launchIsolatedChrome() {
  // chrome-launcher mistakes this WSL host for Windows and otherwise hands the
  // Linux Chrome a relative C:\\Users\\... profile path inside the checkout.
  // The final duplicate flag wins, keeps all mutable browser state in /tmp and
  // lets us remove the exact profile after every run.
  const profileDir = mkdtempSync(join(tmpdir(), "confenge-lighthouse-profile-"));
  let chrome = null;
  try {
    chrome = await launchChrome({
      chromePath: spec.chrome_path || process.env.CHROME_PATH || "/usr/bin/google-chrome",
      userDataDir: profileDir,
      chromeFlags: [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        // Lantern models multiplexing only for h2; an h3/QUIC session is
        // simulated as HTTP/1.1 with a handshake per connection, which
        // inflated the edge LCP by ~300 ms (run 34517284468). Measure over
        // HTTP/2, the protocol the simulator models; h3 visitors do no worse.
        "--disable-quic",
        `--user-data-dir=${profileDir}`,
      ],
      connectionPollInterval: 250,
      maxConnectionRetries: 50,
    });
    await waitForCdp(chrome.port);
    return { chrome, profileDir };
  } catch (error) {
    // The browser may already be up while the debugging endpoint never became
    // usable. Leaving it running would slow every measurement that follows.
    if (chrome) {
      try {
        await chrome.kill();
      } catch {
        const pid = chrome.pid ?? chrome.process?.pid;
        if (pid) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            /* already gone */
          }
        }
      }
    }
    rmSync(profileDir, { recursive: true, force: true });
    throw error;
  }
}

/** Preflight only: warms the executable and page cache, produces no result. */
if (spec.preflight) {
  try {
    launched = await launchIsolatedChrome();
    console.log("Lighthouse browser preflight", "clean_port=", launched.chrome.port);
    settle({ outcome: "MEASURED", phase: "preflight", preflight: true });
  } catch (error) {
    settle({ outcome: "INFRA_ERROR", phase, error: describe(error), origin: "preflight" });
    process.exitCode = 1;
  } finally {
    try {
      if (launched?.chrome) await launched.chrome.kill();
    } catch {
      /* a cleanup failure must never rewrite the outcome above */
    }
    if (launched?.profileDir) rmSync(launched.profileDir, { recursive: true, force: true });
  }
  process.exit(process.exitCode || 0);
}

try {
  launched = await launchIsolatedChrome();
  console.log(
    "Lighthouse",
    spec.url,
    `run=${spec.run}`,
    "clean_port=",
    launched.chrome.port,
    spec.attempt > 1 ? `infrastructure_attempt=${spec.attempt}` : "",
  );

  phase = "navigate";
  markProgress("navigate");
  const runnerResult = await lighthouse(spec.url, {
    port: launched.chrome.port,
    hostname: "127.0.0.1",
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    formFactor: spec.form_factor,
    screenEmulation: {
      mobile: spec.form_factor === "mobile",
      width: spec.viewport.width,
      height: spec.viewport.height,
      deviceScaleFactor: spec.viewport.device_scale_factor,
      disabled: false,
    },
    maxWaitForLoad: 45000,
  });

  if (!runnerResult?.lhr) throw new Error("empty lighthouse result");

  // The measurement now exists. Persist it before anything else can fail:
  // from here on no error may cause a new navigation for this run.
  writeFileSync(spec.out_json, JSON.stringify(runnerResult.lhr, null, 2));
  lhrWritten = true;
  phase = "payload";
  markProgress("payload");

  const cats = runnerResult.lhr.categories || {};
  const audits = runnerResult.lhr.audits || {};
  const ownLongTasks = (audits["long-tasks"]?.details?.items || [])
    .filter((item) => String(item.url || "").startsWith(spec.base))
    .map((item) => Number(item.duration) || 0);

  // Complementary collection. It re-fetches bodies the page already loaded, so
  // it may be recovered on its own, but it must never replace the navigation
  // that was measured. When it cannot complete, the attempt is incomplete
  // evidence — never a fabricated or re-sampled result.
  const payload = await measureContentByteWeight(
    audits["network-requests"]?.details?.items || [],
    spec.base,
  );
  if (payload.error) {
    settle({
      outcome: "INVALID_OR_INCOMPLETE",
      phase: "payload",
      error: `complementary payload collection did not complete: ${payload.error}`,
      origin: "payload_collection",
      lhr_written: true,
      lhr_path: spec.out_json,
    });
    process.exit(1);
  }

  phase = "postprocess";
  markProgress("postprocess");
  const totalByteWeight = audits["total-byte-weight"]?.numericValue;
  const network = lcpNetworkAllowanceMs({ audits, runtimeMode: spec.runtime_mode });
  const row = {
    path: spec.path,
    run: spec.run,
    performance: Math.round((cats.performance?.score || 0) * 100),
    accessibility: Math.round((cats.accessibility?.score || 0) * 100),
    best_practices: Math.round((cats["best-practices"]?.score || 0) * 100),
    seo: Math.round((cats.seo?.score || 0) * 100),
    lcp_ms: audits["largest-contentful-paint"]?.numericValue,
    cls: audits["cumulative-layout-shift"]?.numericValue,
    tbt_ms: audits["total-blocking-time"]?.numericValue,
    longest_own_task_ms: Math.max(0, ...ownLongTasks),
    fcp_ms: audits["first-contentful-paint"]?.numericValue,
    si_ms: audits["speed-index"]?.numericValue,
    image_aspect_ratio: audits["image-aspect-ratio"]?.score,
    image_size_responsive: audits["image-size-responsive"]?.score,
    dom_elements: audits["dom-size-insight"]?.numericValue,
    total_byte_weight: totalByteWeight,
    content_byte_weight: payload.content_byte_weight,
    header_byte_weight: headerByteWeight(totalByteWeight, payload.content_byte_weight),
    payload_requests: payload.requests.length,
    payload_details: payload.requests,
    lcp_network_allowance_ms: network.allowance_ms,
    lcp_observed_server_latency_ms: network.observed_server_latency_ms,
    lcp_observed_rtt_ms: network.observed_rtt_ms,
    lcp_network_allowance_capped: network.capped,
    render_blocking_savings_ms: audits["render-blocking-insight"]?.metricSavings?.LCP || 0,
    image_delivery_savings_bytes:
      audits["image-delivery-insight"]?.details?.debugData?.wastedBytes || 0,
    font_display_score: audits["font-display-insight"]?.score,
    benchmark_index: runnerResult.lhr.environment?.benchmarkIndex,
    seo_exempt: Boolean(spec.seo_exempt),
  };
  settle({ outcome: "MEASURED", phase: "complete", row, lhr_written: true, lhr_path: spec.out_json });
  console.log(JSON.stringify(row));
} catch (error) {
  settle({
    ...classifyFailure({ error, lhrWritten, phase }),
    phase,
    error: describe(error),
    origin: "thrown",
    lhr_written: lhrWritten,
    ...(lhrWritten ? { lhr_path: spec.out_json } : {}),
  });
  process.exitCode = 1;
} finally {
  // Cleanup is bounded and idempotent and must never overwrite the outcome
  // already established above.
  try {
    if (launched?.chrome) await launched.chrome.kill();
  } catch (error) {
    console.error("chrome cleanup failed after the outcome was recorded", describe(error));
    killBrowserNow();
  }
  try {
    if (launched?.profileDir) rmSync(launched.profileDir, { recursive: true, force: true });
  } catch (error) {
    console.error("profile cleanup failed after the outcome was recorded", describe(error));
  }
}
process.exit(process.exitCode || 0);
