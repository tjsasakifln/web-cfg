/**
 * Counterproofs for the public acceptance wrapper.
 *
 * Two defects motivated these. The Lighthouse call lived INSIDE the
 * active-overlay branch, so with the opportunity family withdrawn the home —
 * the most important page the release serves — was promoted with no public
 * measurement at all. And the network semantics that decide whether observed
 * server latency is granted as an LCP allowance were inferred from whether a
 * runtime route existed, so the same public page would have been judged by lab
 * rules and charged for latency it does not control.
 *
 * Neither is visible from a summary; both are visible from the arguments the
 * wrapper builds and the summaries it accepts. Both are asserted here.
 */
import assert from "assert";
import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import {
  assertPublicFamilySummary,
  publicFamilyArgs,
} from "./runtime_lighthouse_acceptance.mjs";

const WORK = mkdtempSync(join(tmpdir(), "confenge-public-family-"));
const SHA = "a".repeat(40);
let ok = 0;
const pass = (name) => {
  ok += 1;
  console.log("OK", name);
};

const goodSummary = (extra = {}) => ({
  terminal_state: "MEASURED_PASS",
  evaluation: { ok: true },
  coverage: { public_edge: true },
  results: [
    { path: "/", run: 1 },
    { path: "/", run: 2 },
    { path: "/", run: 3 },
  ],
  ...extra,
});

// ---------------------------------------------------------------------------
// 1. THE HOME IS MEASURED IN BOTH BRANCHES, with the same mandatory count.
// ---------------------------------------------------------------------------
{
  const withdrawn = publicFamilyArgs({
    origin: "https://confenge.com.br",
    expectedSha: SHA,
    route: null,
    runnerPath: "/runner.mjs",
  });
  assert.ok(withdrawn.includes("--only=/"), `withdrawn branch must measure the home: ${withdrawn.join(" ")}`);
  assert.ok(withdrawn.includes("--runs=3"), "the mandatory count applies with the family withdrawn");
  assert.ok(
    !withdrawn.some((a) => a.startsWith("--runtime-route=")),
    "a withdrawn family has no runtime route to measure",
  );

  const active = publicFamilyArgs({
    origin: "https://confenge.com.br",
    expectedSha: SHA,
    route: "/oportunidades/x/2026/",
    runnerPath: "/runner.mjs",
  });
  assert.ok(
    active.includes("--only=/,/oportunidades/x/2026/"),
    `active branch must measure the home AND the route: ${active.join(" ")}`,
  );
  assert.ok(active.includes("--runs=3"));
  assert.ok(active.includes("--runtime-route=/oportunidades/x/2026/"));
  pass("the_home_is_measured_with_the_mandatory_count_in_both_overlay_branches");
}

// ---------------------------------------------------------------------------
// 2. Network semantics are STATED, not inferred from whether an opportunity
//    happens to be published.
// ---------------------------------------------------------------------------
{
  for (const route of [null, "/oportunidades/x/2026/"]) {
    const args = publicFamilyArgs({
      origin: "https://confenge.com.br",
      expectedSha: SHA,
      route,
      runnerPath: "/runner.mjs",
    });
    assert.ok(
      args.includes("--public-edge"),
      `public edge semantics must be explicit whether or not a route exists (route=${route})`,
    );
    assert.ok(args.includes(`--expected-sha=${SHA}`), "evidence stays bound to the release");
    assert.ok(args.includes(`--label=${SHA}`), "post-stage evidence cannot overwrite package evidence");
  }
  pass("public_edge_semantics_do_not_depend_on_an_opportunity_existing");
}

// ---------------------------------------------------------------------------
// 3. The summary gate: only evidence about THIS promotion is accepted.
// ---------------------------------------------------------------------------
{
  assert.deepEqual(assertPublicFamilySummary(goodSummary()).length, 3);

  // The terminal state is REQUIRED. A summary that does not say how its run
  // ended — one produced before this contract existed, or left over from an
  // earlier release — is not evidence that the run concluded. Guarding the
  // check with `&&` let exactly those through.
  for (const [label, summary] of [
    ["inconclusive", goodSummary({ terminal_state: "INVALID_OR_INCOMPLETE" })],
    ["measured failure", goodSummary({ terminal_state: "MEASURED_FAIL" })],
    ["absent", (() => { const s = goodSummary(); delete s.terminal_state; return s; })()],
    ["null", goodSummary({ terminal_state: null })],
    ["undefined", goodSummary({ terminal_state: undefined })],
    ["empty", goodSummary({ terminal_state: "" })],
    ["unknown", goodSummary({ terminal_state: "PASS" })],
    ["lowercase", goodSummary({ terminal_state: "measured_pass" })],
  ]) {
    assert.throws(
      () => assertPublicFamilySummary(summary),
      /terminal state/,
      `a ${label} terminal state must not be accepted`,
    );
  }
  // Lab semantics must never be accepted as a public measurement.
  assert.throws(
    () => assertPublicFamilySummary(goodSummary({ coverage: { public_edge: false } })),
    /public edge semantics/,
  );
  assert.throws(
    () => assertPublicFamilySummary(goodSummary({ coverage: {} })),
    /public edge semantics/,
    "a summary predating the flag is not evidence of public semantics",
  );
  // An incomplete home count cannot pass.
  assert.throws(
    () =>
      assertPublicFamilySummary(
        goodSummary({ results: [{ path: "/", run: 1 }, { path: "/", run: 2 }] }),
      ),
    /measured three times/,
  );
  // Errored home runs do not count toward the required samples.
  assert.throws(
    () =>
      assertPublicFamilySummary(
        goodSummary({
          results: [{ path: "/", run: 1 }, { path: "/", run: 2 }, { path: "/", run: 3, error: "boom" }],
        }),
      ),
    /measured three times/,
  );
  // Budgets not met.
  assert.throws(
    () => assertPublicFamilySummary(goodSummary({ evaluation: { ok: false } })),
    /public budgets/,
  );
  // No summary at all now fails on the mandatory terminal state, which is the
  // first thing evidence must carry.
  assert.throws(() => assertPublicFamilySummary(undefined), /terminal state/);
  assert.throws(() => assertPublicFamilySummary(null), /terminal state/);
  pass("only_a_complete_passing_public_edge_summary_is_accepted");
}

// ---------------------------------------------------------------------------
// 4. The subprocess deadline is real: a hanging runner is killed, not left to
//    consume the job budget. Driven against a genuinely hanging process.
// ---------------------------------------------------------------------------
{
  const hang = join(WORK, "hang.mjs");
  writeFileSync(hang, "setInterval(() => {}, 1000);");
  const started = Date.now();
  const result = spawnSync(process.execPath, [hang], {
    encoding: "utf8",
    timeout: 2000,
    killSignal: "SIGKILL",
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 15000, `the deadline must actually fire, took ${elapsed}ms`);
  assert.ok(
    result.signal === "SIGKILL" || result.error,
    `a hanging runner must be terminated, got ${JSON.stringify({ signal: result.signal, status: result.status })}`,
  );
  assert.notEqual(result.status, 0, "a terminated runner never reports success");
  pass("a_hanging_measurement_subprocess_is_terminated_by_its_deadline");
}

// ---------------------------------------------------------------------------
// 5. The wrapper must actually pass that deadline, and give every outbound
//    request one. A deadline that exists only as a constant bounds nothing.
// ---------------------------------------------------------------------------
{
  const source = readFileSync(
    fileURLToPath(new URL("./runtime_lighthouse_acceptance.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(source, /timeout: LIGHTHOUSE_SUBPROCESS_TIMEOUT_MS/, "the subprocess must be supervised");
  assert.match(source, /killSignal: "SIGKILL"/, "a runner ignoring SIGTERM must still be terminated");
  assert.match(
    source,
    /signal: AbortSignal\.timeout\(IDENTITY_FETCH_TIMEOUT_MS\)/,
    "identity and probe requests must have an explicit deadline",
  );
  // Every fetch in the wrapper goes through the one helper that carries it.
  const fetchCalls = source.match(/await fetch\(/g) || [];
  assert.equal(fetchCalls.length, 1, "all outbound requests must share the deadline-carrying helper");
  pass("the_wrapper_applies_its_deadlines_rather_than_only_declaring_them");
}

// ---------------------------------------------------------------------------
// 6. A failure report is always persisted, even when nothing could be measured.
// ---------------------------------------------------------------------------
{
  const source = readFileSync(
    fileURLToPath(new URL("./runtime_lighthouse_acceptance.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(
    source,
    /finally \{[\s\S]*writeFileSync\(reportPath/,
    "the acceptance report must be written on every path, including one with no measurement",
  );
  pass("an_identifiable_failure_report_is_persisted_even_without_a_measurement");
}

rmSync(WORK, { recursive: true, force: true });
console.log(`PUBLIC_FAMILY_ACCEPTANCE_OK (${ok} counterproofs)`);
