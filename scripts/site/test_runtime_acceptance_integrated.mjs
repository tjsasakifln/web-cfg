/**
 * Integrated rehearsal of the runtime acceptance wrapper.
 *
 * Every other test in this chain exercises the wrapper's exported *pieces*
 * (`validateRuntimeIdentity`, `validateWithdrawnOverlay`, `publicFamilyArgs`,
 * `assertPublicFamilySummary`). The glue that binds them — which documents are
 * fetched, which branch is taken, which probes are run, which digest is
 * compared against which bytes, and whether a failing run still leaves a
 * report behind — only ever ran for the first time against real visitors,
 * after promotion.
 *
 * This file closes that gap: it stands up a real `node:http` origin on
 * 127.0.0.1 serving a coherent controlled candidate, and drives the REAL
 * `runAcceptance` against it for both overlay branches. Lighthouse itself is
 * the only thing replaced — by a stub runner injected through the ordinary
 * optional `measurement` parameter, so no browser is needed and the production
 * defaults stay untouched.
 *
 * The rehearsal must also be provably a rehearsal: every request the wrapper
 * and its subprocess make is recorded, and nothing may leave 127.0.0.1.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAcceptance, validateWithdrawnOverlay } from "./runtime_lighthouse_acceptance.mjs";

const WORK = mkdtempSync(join(tmpdir(), "confenge-acceptance-integrated-"));
const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const SCHEMA = "confenge.live-intelligence-overlay/v1";
const WITHDRAWAL_PROBE = "/oportunidades/pe-2026-000188-reforma-ubs-londrina-pr/";
const ACTIVE_ROUTE = "/oportunidades/pe-2026-000401-ponte-itajai-sc/2026/";

let ok = 0;
let caseId = 0;
const pass = (name) => {
  ok += 1;
  console.log("OK", name);
};

// ---------------------------------------------------------------------------
// Controlled candidate
// ---------------------------------------------------------------------------

/** The exact bytes the hub answers with; the overlay digest is taken from these. */
const HUB_HTML = [
  "<!doctype html><html lang=\"pt-BR\"><head><title>Oportunidades</title></head><body>",
  "<h1>Oportunidades</h1>",
  "<p>Nenhuma oportunidade publicada no momento.</p>",
  "<a href=\"/triagem-tecnica/\">Triagem tecnica</a>",
  "<a href=\"mailto:engenharia@confenge.com.br\">engenharia@confenge.com.br</a>",
  "<a href=\"tel:+5548999990000\">+55 48 99999-0000</a>",
  "</body></html>",
].join("");
const HUB_BODY = Buffer.from(HUB_HTML, "utf8");
const HUB_SHA256 = createHash("sha256").update(HUB_BODY).digest("hex");

const withdrawnOverlay = () => ({
  schema: SCHEMA,
  release_sha: SHA,
  official_live: false,
  source_kind: null,
  source_run_id: null,
  as_of: null,
  manifest_hash: null,
  consumer_observed_manifest_hash: null,
  accepted_projection_sha256: null,
  routes: [],
  static_html_paths: ["_site/oportunidades/index.html"],
  static_html_sha256: { "_site/oportunidades/index.html": HUB_SHA256 },
  removed_html_paths: [`_site${WITHDRAWAL_PROBE}index.html`],
});

const activeOverlay = (routes = [{ route: ACTIVE_ROUTE }]) => ({
  schema: SCHEMA,
  release_sha: SHA,
  official_live: true,
  source_kind: "official_projection",
  source_run_id: "run-1",
  as_of: "2026-09-10T00:00:00.000Z",
  manifest_hash: "d".repeat(64),
  consumer_observed_manifest_hash: "d".repeat(64),
  accepted_projection_sha256: "e".repeat(64),
  routes,
  static_html_paths: [],
  static_html_sha256: {},
  removed_html_paths: [],
});

const candidate = (over = {}) => ({
  buildInfo: { commit: SHA },
  runtimeInfo: { release_sha: SHA },
  overlay: withdrawnOverlay(),
  detailStatus: 410,
  sitemapStatus: 404,
  sitemapBody: "",
  hubStatus: 200,
  hubBody: HUB_BODY,
  ...over,
});

/**
 * A real HTTP origin. Every request is recorded — path and Host header — so
 * the rehearsal can prove afterwards that nothing reached production.
 */
function startCandidate(config) {
  const requests = [];
  const json = (res, value) => {
    const body = Buffer.from(JSON.stringify(value), "utf8");
    res.writeHead(200, { "content-type": "application/json", "content-length": body.length });
    res.end(body);
  };
  const server = createServer((req, res) => {
    requests.push({ path: req.url, host: req.headers.host });
    if (req.url === "/.well-known/build-info.json") return json(res, config.buildInfo);
    if (req.url === "/.well-known/runtime-info.json") return json(res, config.runtimeInfo);
    if (req.url === "/.well-known/live-intelligence-overlay.json") return json(res, config.overlay);
    if (req.url === WITHDRAWAL_PROBE) {
      res.writeHead(config.detailStatus, { "content-type": "text/html" });
      return res.end(config.detailStatus === 200 ? "<html>ainda exposta</html>" : "");
    }
    if (req.url === "/sitemap-oportunidades.xml") {
      const body = Buffer.from(config.sitemapBody || "", "utf8");
      res.writeHead(config.sitemapStatus, { "content-type": "application/xml", "content-length": body.length });
      return res.end(body);
    }
    if (req.url === "/oportunidades/") {
      const body = Buffer.isBuffer(config.hubBody) ? config.hubBody : Buffer.from(String(config.hubBody), "utf8");
      res.writeHead(config.hubStatus, { "content-type": "text/html", "content-length": body.length });
      return res.end(config.hubStatus === 200 ? body : "");
    }
    // Explicit, so an unexpected path fails fast instead of hanging the fetch.
    res.writeHead(404, { "content-type": "text/plain", "content-length": 0 });
    res.end();
  });
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => {
      done({
        origin: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((closed) => {
          server.closeAllConnections();
          server.close(closed);
        }),
      });
    });
  });
}

/**
 * A stub Lighthouse runner. It writes the summary the wrapper expects into an
 * injected directory, plus a sidecar with the argv it received — the only
 * other leg that could reach the network, so its origin is asserted too.
 */
function writeStub(dir, patch = {}, mode = "ok", shaOverride = null) {
  const summaryDir = join(dir, "summaries");
  const sidecar = join(dir, "runner-argv.json");
  const stubPath = join(dir, "stub_runner.mjs");
  mkdirSync(summaryDir, { recursive: true });
  writeFileSync(
    stubPath,
    `import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const SUMMARY_DIR = ${JSON.stringify(summaryDir)};
const SIDECAR = ${JSON.stringify(sidecar)};
const PATCH = ${JSON.stringify(patch)};
const MODE = ${JSON.stringify(mode)};
const SHA_OVERRIDE = ${JSON.stringify(shaOverride)};
const argv = process.argv.slice(2);
if (MODE === "hang") {
  // Never produces a measurement and never exits: the wrapper's supervision
  // must terminate it rather than let it consume the job budget.
  setInterval(() => {}, 1000);
} else if (MODE === "die") {
  process.exit(1);
}
writeFileSync(SIDECAR, JSON.stringify(argv, null, 2));
const opt = (n) => argv.find((a) => a.startsWith("--" + n + "=")) ?.slice(n.length + 3) || "";
const sha = opt("expected-sha");
const route = opt("runtime-route");
const results = [
  { path: "/", run: 1 },
  { path: "/", run: 2 },
  { path: "/", run: 3 },
];
const coverage = { public_edge: true };
if (route) {
  results.push({ path: route, run: 1 });
  coverage.runtime_evidence = { routes: [{ route, html_sha256: "c".repeat(64) }] };
}
const summary = {
  terminal_state: "MEASURED_PASS",
  evaluation: { ok: true },
  coverage,
  results,
  ...PATCH,
};
if (MODE === "stateless") delete summary.terminal_state;
mkdirSync(SUMMARY_DIR, { recursive: true });
if (MODE !== "hang") {
  writeFileSync(
    join(SUMMARY_DIR, "summary-" + (SHA_OVERRIDE || sha) + ".json"),
    JSON.stringify(summary, null, 2) + "\\n",
  );
}
`,
  );
  return { runnerPath: stubPath, summaryDir, sidecar };
}

/**
 * One rehearsal: real server, real `runAcceptance`, stub Lighthouse.
 * Returns everything an assertion could need, including the persisted report.
 */
async function rehearse({
  config = candidate(),
  summaryPatch = {},
  expectedSha = SHA,
  stubMode = "ok",
  stubShaOverride = null,
  acceptance = runAcceptance,
} = {}) {
  caseId += 1;
  const dir = join(WORK, `case-${caseId}`);
  mkdirSync(dir, { recursive: true });
  const stub = writeStub(dir, summaryPatch, stubMode, stubShaOverride);
  const server = await startCandidate(config);
  const reportPath = join(dir, "report.json");
  let error = null;
  let returned = null;
  try {
    returned = await acceptance(
      [server.origin, `--expected-sha=${expectedSha}`, `--report=${reportPath}`],
      { runnerPath: stub.runnerPath, summaryDir: stub.summaryDir },
    );
  } catch (thrown) {
    error = thrown;
  } finally {
    await server.close();
  }
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
  const runnerArgv = existsSync(stub.sidecar) ? JSON.parse(readFileSync(stub.sidecar, "utf8")) : null;
  return { origin: server.origin, requests: server.requests, report, reportPath, runnerArgv, error, returned };
}

/** Nothing in a rehearsal may touch the real public origin. */
function assertNeverProduction(run) {
  const local = new URL(run.origin).host;
  for (const request of run.requests) {
    assert.equal(request.host, local, `rehearsal request carried a foreign Host: ${request.host}`);
  }
  assert.equal(run.report.base, run.origin, "the report must record the local candidate as the measured base");
  assert.ok(
    !JSON.stringify(run.report).includes("confenge.com.br"),
    "no rehearsal report may name the production origin",
  );
  if (run.runnerArgv) {
    assert.equal(run.runnerArgv[0], run.origin, `the Lighthouse subprocess was pointed at ${run.runnerArgv[0]}`);
    assert.ok(
      !run.runnerArgv.some((arg) => arg.includes("confenge.com.br")),
      "the Lighthouse subprocess must never be handed the production origin",
    );
  }
}

const failure = (run, pattern) => {
  assert.ok(run.error, "the rehearsal was expected to fail and did not");
  assert.match(run.error.message, pattern, `unexpected failure message: ${run.error.message}`);
  assert.ok(run.report, "a failing run must still persist a report");
  assert.equal(run.report.result, "FAILED");
  assert.notEqual(run.report.result, "PASS");
  assert.ok(run.report.errors.length > 0, "a failing report must carry the reason");
};

// ===========================================================================
// 1. HAPPY PATH — withdrawn overlay, end to end.
// ===========================================================================
{
  const run = await rehearse();
  assert.equal(run.error, null, `withdrawn rehearsal failed: ${run.error?.message}`);
  assert.equal(run.report.result, "PASS");
  assert.equal(run.report.mode, "verified_withdrawal_with_contact_alternative");
  assert.equal(run.report.evidence.public_home_runs, 3);
  assert.equal(run.report.evidence.withdrawn_detail.status, 410);
  assert.equal(run.report.evidence.contact_hub.sha256, HUB_SHA256);
  assert.deepEqual(run.report.evidence.contact_hub.channels, ["triagem", "email", "telefone"]);
  assert.equal(run.returned.result, "PASS");

  // Requirement: the wrapper fetched exactly the withdrawal evidence set.
  assert.deepEqual(
    [...run.requests.map((r) => r.path)].sort(),
    [
      "/.well-known/build-info.json",
      "/.well-known/live-intelligence-overlay.json",
      "/.well-known/runtime-info.json",
      "/oportunidades/",
      "/sitemap-oportunidades.xml",
      WITHDRAWAL_PROBE,
    ].sort(),
  );
  // The home is measured with the mandatory count and stated public semantics.
  assert.ok(run.runnerArgv.includes("--only=/"));
  assert.ok(run.runnerArgv.includes("--runs=3"));
  assert.ok(run.runnerArgv.includes("--public-edge"));
  assert.ok(!run.runnerArgv.some((arg) => arg.startsWith("--runtime-route=")));
  assertNeverProduction(run);
  pass("withdrawn_overlay_passes_end_to_end_against_a_controlled_local_candidate");
}

// ===========================================================================
// 2. HAPPY PATH — active overlay, end to end.
// ===========================================================================
{
  const run = await rehearse({ config: candidate({ overlay: activeOverlay() }) });
  assert.equal(run.error, null, `active rehearsal failed: ${run.error?.message}`);
  assert.equal(run.report.result, "PASS");
  assert.equal(run.report.mode, "official_live_lighthouse");
  assert.equal(run.report.evidence.runtime_route, ACTIVE_ROUTE);
  assert.equal(run.report.evidence.public_home_runs, 3);
  assert.deepEqual(
    [...run.requests.map((r) => r.path)].sort(),
    [
      "/.well-known/build-info.json",
      "/.well-known/live-intelligence-overlay.json",
      "/.well-known/runtime-info.json",
    ].sort(),
    "the active branch must not probe the withdrawal evidence",
  );
  assert.ok(run.runnerArgv.includes(`--runtime-route=${ACTIVE_ROUTE}`));
  assert.ok(run.runnerArgv.includes(`--only=/,${ACTIVE_ROUTE}`));
  assert.ok(run.runnerArgv.includes("--runs=3"));
  assert.ok(run.runnerArgv.includes("--public-edge"));
  assertNeverProduction(run);
  pass("active_overlay_passes_end_to_end_and_measures_the_home_plus_the_exact_route");
}

// The lowest-sorted route is the one measured, never an arbitrary one.
{
  const run = await rehearse({
    config: candidate({
      overlay: activeOverlay([{ route: "/oportunidades/zz-ultima/2026/" }, { route: ACTIVE_ROUTE }]),
    }),
  });
  assert.equal(run.error, null, `deterministic route rehearsal failed: ${run.error?.message}`);
  assert.equal(run.report.evidence.runtime_route, ACTIVE_ROUTE);
  pass("the_measured_runtime_route_is_deterministic_lowest_sorted");
}

// ===========================================================================
// 3. NEGATIVE CASES — each must block, and each must still leave a report.
// ===========================================================================

// 3.1 build-info commit is not the promoted release.
{
  const run = await rehearse({ config: candidate({ buildInfo: { commit: OTHER_SHA } }) });
  failure(run, /runtime identity mismatch/);
  assertNeverProduction(run);
  pass("build_info_identity_mismatch_blocks_acceptance");
}

// 3.2 runtime-info release_sha is not the promoted release.
{
  const run = await rehearse({ config: candidate({ runtimeInfo: { release_sha: OTHER_SHA } }) });
  failure(run, /runtime identity mismatch/);
  pass("runtime_info_release_sha_mismatch_blocks_acceptance");
}

// 3.3 overlay schema mismatch.
{
  const run = await rehearse({
    config: candidate({ overlay: { ...withdrawnOverlay(), schema: "confenge.live-intelligence-overlay/v0" } }),
  });
  failure(run, /runtime overlay manifest identity or shape mismatch/);
  pass("overlay_schema_mismatch_blocks_acceptance");
}

// 3.4 overlay release_sha mismatch.
{
  const run = await rehearse({
    config: candidate({ overlay: { ...withdrawnOverlay(), release_sha: OTHER_SHA } }),
  });
  failure(run, /runtime overlay manifest identity or shape mismatch/);
  pass("overlay_release_sha_mismatch_blocks_acceptance");
}

// 3.5 an overlay that claims an accepted official input while serving no route
//     is a withdrawal that lies about its provenance.
{
  const run = await rehearse({
    config: candidate({ overlay: { ...withdrawnOverlay(), official_live: true } }),
  });
  failure(run, /falsely claims accepted official input/);
  pass("withdrawn_overlay_claiming_official_live_blocks_acceptance");
}

// 3.6 a withdrawn overlay that still lists routes. The wrapper reaches the
//     withdrawal contract only through `validateWithdrawnOverlay`, so the
//     integrated counterproof has two halves: the contract rejects the
//     document, and an overlay whose declared route is not what the
//     measurement actually proves is rejected by the wrapper itself.
{
  assert.throws(
    () => validateWithdrawnOverlay({ ...withdrawnOverlay(), routes: [{ route: "/oportunidades/ghost/2026/" }] }, SHA),
    /retains accepted opportunity routes/,
  );
  const run = await rehearse({
    config: candidate({ overlay: activeOverlay([{ route: "/servicos/ghost/" }]) }),
  });
  failure(run, /selected an invalid opportunity route/);
  pass("a_withdrawn_overlay_that_still_lists_routes_cannot_be_accepted");
}

// 3.7 the withdrawn fixture detail is still served.
{
  const run = await rehearse({ config: candidate({ detailStatus: 200 }) });
  failure(run, /withdrawn fixture detail remains exposed/);
  assert.equal(run.report.result, "FAILED");
  pass("a_withdrawal_probe_answering_200_blocks_acceptance");
}

// 3.8 the opportunity sitemap is present AND still advertises a URL.
{
  const run = await rehearse({
    config: candidate({
      sitemapStatus: 200,
      sitemapBody:
        `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://example.invalid${WITHDRAWAL_PROBE}</loc></url></urlset>`,
    }),
  });
  failure(run, /sitemap is neither absent nor empty/);
  pass("a_sitemap_that_still_lists_a_withdrawn_url_blocks_acceptance");
}

// An empty 200 sitemap is legitimate and must not be treated as a failure.
{
  const run = await rehearse({
    config: (() => {
      const body = `<?xml version="1.0" encoding="UTF-8"?><urlset></urlset>`;
      const overlay = withdrawnOverlay();
      return candidate({ overlay, sitemapStatus: 200, sitemapBody: body });
    })(),
  });
  assert.equal(run.error, null, `empty sitemap rehearsal failed: ${run.error?.message}`);
  assert.equal(run.report.result, "PASS");
  pass("an_empty_200_sitemap_is_an_acceptable_withdrawal_state");
}

// 3.9 the hub lost the phone channel.
{
  const body = Buffer.from(HUB_HTML.replace(/<a href="tel:[^"]+">[^<]*<\/a>/, ""), "utf8");
  const overlay = withdrawnOverlay();
  overlay.static_html_sha256["_site/oportunidades/index.html"] = createHash("sha256").update(body).digest("hex");
  const run = await rehearse({ config: candidate({ overlay, hubBody: body }) });
  failure(run, /no functional contact alternative/);
  pass("a_hub_without_the_phone_channel_blocks_acceptance");
}

// 3.10 the hub lost the e-mail channel.
{
  const body = Buffer.from(HUB_HTML.replace(/<a href="mailto:[^"]+">[^<]*<\/a>/, ""), "utf8");
  const overlay = withdrawnOverlay();
  overlay.static_html_sha256["_site/oportunidades/index.html"] = createHash("sha256").update(body).digest("hex");
  const run = await rehearse({ config: candidate({ overlay, hubBody: body }) });
  failure(run, /no functional contact alternative/);
  pass("a_hub_without_the_email_channel_blocks_acceptance");
}

// 3.11 the served hub is not the hub the stage manifest signed.
{
  const body = Buffer.from(HUB_HTML.replace("Nenhuma oportunidade publicada no momento.", "Conteudo trocado."), "utf8");
  const run = await rehearse({ config: candidate({ hubBody: body }) });
  failure(run, /contact hub digest differs from the stage manifest/);
  pass("a_hub_whose_bytes_differ_from_the_overlay_digest_blocks_acceptance");
}

// 3.11b evidence that does not say how its run ended. This is the shape of a
// report written before the terminal-state contract existed, or left behind by
// an earlier release: it carries results and a passing evaluation, and says
// nothing about whether the run concluded.
{
  // Genuinely absent: the key is not in the document at all.
  const absent = await rehearse({ stubMode: "stateless" });
  failure(absent, /terminal state is null/);
  // And explicitly null, which JSON can express.
  const nulled = await rehearse({ summaryPatch: { terminal_state: null } });
  failure(nulled, /terminal state is null/);
  pass("a_report_without_a_terminal_state_cannot_approve_a_promotion");
}

// 3.11c a report for ANOTHER release. The run produces a summary, but not the
// one this promotion needs, so the expected evidence is simply absent.
{
  const run = await rehearse({ stubShaOverride: "f".repeat(40) });
  failure(run, /runtime Lighthouse execution failed|terminal state/);
  pass("a_report_from_an_incompatible_context_cannot_approve_a_promotion");
}

// 3.11d a runner that produces nothing and exits non-zero — the downstream
// shape of a terminated measurement.
{
  const run = await rehearse({ stubMode: "die" });
  failure(run, /runtime Lighthouse execution failed/);
  pass("a_runner_that_produces_no_measurement_blocks_acceptance");
}

// 3.11e TERMINATION BY TIMEOUT, driven against a runner that genuinely hangs.
// A fresh module instance is imported so the shortened budget is actually read;
// the production defaults are untouched.
{
  process.env.RUNTIME_ACCEPTANCE_LH_BUDGET_MS = "1000";
  process.env.RUNTIME_ACCEPTANCE_LH_TIMEOUT_MS = "3000";
  const short = await import("./runtime_lighthouse_acceptance.mjs?short-timeout");
  delete process.env.RUNTIME_ACCEPTANCE_LH_BUDGET_MS;
  delete process.env.RUNTIME_ACCEPTANCE_LH_TIMEOUT_MS;
  const started = Date.now();
  const run = await rehearse({ stubMode: "hang", acceptance: short.runAcceptance });
  const elapsed = Date.now() - started;
  failure(run, /runtime Lighthouse execution failed/);
  assert.ok(elapsed < 60000, `the wrapper must enforce its deadline, took ${elapsed}ms`);
  pass("a_hanging_measurement_is_terminated_and_blocks_acceptance");
}

// 3.12 the measurement could not conclude.
{
  const run = await rehearse({ summaryPatch: { terminal_state: "INVALID_OR_INCOMPLETE" } });
  failure(run, /terminal state is "INVALID_OR_INCOMPLETE"/);
  pass("an_inconclusive_lighthouse_summary_blocks_acceptance");
}

// 3.13 the measurement was not taken with public edge semantics.
{
  const run = await rehearse({ summaryPatch: { coverage: { public_edge: false } } });
  failure(run, /not measured with public edge semantics/);
  pass("a_summary_without_public_edge_semantics_blocks_acceptance");
}

// 3.14 the home was measured fewer than the mandatory three times.
{
  const run = await rehearse({
    summaryPatch: { results: [{ path: "/", run: 1 }, { path: "/", run: 2 }] },
  });
  failure(run, /public home was not measured three times/);
  pass("fewer_than_three_home_runs_blocks_acceptance");
}

// 3.15 the measurement did not prove the exact accepted route.
{
  const run = await rehearse({
    config: candidate({ overlay: activeOverlay() }),
    summaryPatch: {
      coverage: { public_edge: true, runtime_evidence: { routes: [{ route: "/oportunidades/outra/2026/", html_sha256: "c".repeat(64) }] } },
      results: [
        { path: "/", run: 1 },
        { path: "/", run: 2 },
        { path: "/", run: 3 },
        { path: ACTIVE_ROUTE, run: 1 },
      ],
    },
  });
  failure(run, /does not prove the exact accepted route/);
  pass("a_summary_proving_a_different_route_blocks_acceptance");
}

// ===========================================================================
// 4. A FAILING RUN STILL PERSISTS ITS REPORT AT --report=.
// ===========================================================================
{
  const run = await rehearse({ config: candidate({ detailStatus: 200 }) });
  assert.ok(existsSync(run.reportPath), "the failure report was not written to --report=");
  const persisted = JSON.parse(readFileSync(run.reportPath, "utf8"));
  assert.equal(persisted.schema, "confenge.runtime-public-acceptance/v1");
  assert.equal(persisted.result, "FAILED");
  assert.equal(persisted.mode, null);
  assert.equal(persisted.expected_sha, SHA);
  assert.equal(persisted.base, run.origin);
  assert.match(persisted.errors.join("; "), /withdrawn fixture detail remains exposed/);
  assertNeverProduction(run);
  pass("a_failing_run_persists_its_evidence_at_the_requested_report_path");
}

// ===========================================================================
// 5. THE REHEARSAL CANNOT REACH PRODUCTION.
// ===========================================================================
{
  const run = await rehearse();
  assertNeverProduction(run);
  assert.ok(run.origin.startsWith("http://127.0.0.1:"), "the candidate must be a loopback origin");
  assert.ok(run.requests.length > 0, "the rehearsal must actually have exercised the local candidate");
  pass("no_request_in_the_rehearsal_leaves_127_0_0_1");
}

console.log(`\nruntime acceptance integrated rehearsal: ${ok} cases OK`);
