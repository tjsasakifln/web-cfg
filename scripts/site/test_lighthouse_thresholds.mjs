import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  CLS_CAP,
  CONTENT_BYTES_CAP,
  LCP_MS_CAP,
  CRITICAL_MONEY_PATHS,
  DECLARED_CLS_MAX,
  evaluateLighthouseResults,
  percentile75,
  readDeclaredBudget,
  validateDeclaredBudget,
} from "./lighthouse_thresholds.mjs";
import { ROOT, deriveCoverage, loadPolicy } from "./interface_coverage.mjs";

const home = (run, performance, tbt_ms, longest_own_task_ms, extra = {}) => ({
  path: "/",
  run,
  performance,
  accessibility: extra.accessibility ?? 100,
  best_practices: extra.best_practices ?? 100,
  seo: extra.seo ?? 100,
  tbt_ms,
  longest_own_task_ms,
  lcp_ms: extra.lcp_ms ?? 1500,
  cls: extra.cls ?? 0,
  dom_elements: extra.dom_elements ?? 500,
  total_byte_weight: extra.total_byte_weight ?? 80 * 1024,
  content_byte_weight: extra.content_byte_weight ?? extra.total_byte_weight ?? 80 * 1024,
  lcp_network_allowance_ms: extra.lcp_network_allowance_ms ?? 0,
  font_display_score: extra.font_display_score ?? 1,
  image_aspect_ratio: 1,
  image_size_responsive: 1,
});

assert.equal(percentile75([55, 135, 42]), 135);

const passing = [home(1, 97, 55, 138), home(2, 95, 135, 185), home(3, 97, 42, 136)];
assert.deepEqual(evaluateLighthouseResults(passing, { homeRuns: 3 }), {
  ok: true,
  errors: [],
  home: {
    expected_runs: 3,
    observed_runs: 3,
    minimum_performance: 95,
    p75_tbt_ms: 135,
    maximum_own_long_task_ms: 185,
    minimum_lcp_ms: 1500,
    maximum_lcp_ms: 1500,
    maximum_lcp_net_ms: 1500,
    maximum_lcp_network_allowance_ms: 0,
    maximum_cls: 0,
  },
});

const criticalPage = (path, performance, cls, extra = {}) => ({
  path,
  run: 1,
  performance,
  accessibility: 100,
  best_practices: 100,
  seo: 100,
  tbt_ms: 40,
  longest_own_task_ms: 40,
  cls,
  lcp_ms: extra.lcp_ms ?? 1600,
  dom_elements: extra.dom_elements ?? 500,
  total_byte_weight: extra.total_byte_weight ?? 80 * 1024,
  content_byte_weight: extra.content_byte_weight ?? extra.total_byte_weight ?? 80 * 1024,
  font_display_score: extra.font_display_score ?? 1,
  ...extra,
  image_aspect_ratio: 1,
  image_size_responsive: 1,
});
assert.equal(
  evaluateLighthouseResults([...passing, criticalPage("/entregas/", 99, 0.06)], { homeRuns: 3 }).ok,
  false,
  "CLS above 0.05 must fail closed",
);
assert.equal(
  evaluateLighthouseResults([...passing, criticalPage("/entregas/", 94, 0)], { homeRuns: 3 }).ok,
  false,
  "critical route performance below 95 must fail closed",
);
assert.equal(
  evaluateLighthouseResults(
    [...passing, criticalPage("/entregas/", 95, 0, { lcp_ms: 2001 })],
    { homeRuns: 3 },
  ).ok,
  false,
  "critical route LCP above 2 seconds must fail closed",
);
assert.equal(
  evaluateLighthouseResults(
    [...passing, criticalPage("/entregas/", 95, 0, { tbt_ms: 201 })],
    { homeRuns: 3 },
  ).ok,
  false,
  "critical route TBT above 200ms must fail closed",
);
assert.equal(
  evaluateLighthouseResults(
    // /entregas/ carries its own catalogue budget, so prove the shared 800
    // default still fails closed on a money route that uses it.
    [...passing, criticalPage("/casos/", 95, 0, { dom_elements: 801 })],
    { homeRuns: 3 },
  ).ok,
  false,
  "critical route DOM above 800 elements must fail closed",
);
assert.equal(
  evaluateLighthouseResults(
    [...passing, criticalPage("/entregas/", 95, 0, { total_byte_weight: 150 * 1024 + 1 })],
    { homeRuns: 3 },
  ).ok,
  false,
  "critical route payload above 150 KiB must fail closed",
);
assert.equal(
  evaluateLighthouseResults(
    [
      ...passing,
      criticalPage("/entregas/", 99, 0, { run: 1 }),
      criticalPage("/entregas/", 99, 0, { run: 2 }),
    ],
    { homeRuns: 3, criticalRuns: 3 },
  ).ok,
  false,
  "missing critical-route repetition must fail closed",
);
const entregas = (performance) => ({
  path: "/entregas/",
  run: 1,
  performance,
  accessibility: 100,
  best_practices: 100,
  seo: 100,
  tbt_ms: 40,
  longest_own_task_ms: 80,
  lcp_ms: 1600,
  dom_elements: 500,
  total_byte_weight: 80 * 1024,
  content_byte_weight: 80 * 1024,
  font_display_score: 1,
  cls: 0,
  image_aspect_ratio: 1,
  image_size_responsive: 1,
});
assert.equal(
  evaluateLighthouseResults([...passing, entregas(95)], { homeRuns: 3, criticalRuns: 1 }).ok,
  true,
);
assert.equal(
  evaluateLighthouseResults([...passing, entregas(94)], { homeRuns: 3, criticalRuns: 1 }).ok,
  false,
  "/entregas/ performance 94 must fail the critical-route 95 floor",
);
assert.equal(
  evaluateLighthouseResults(
    [
      ...passing,
      {
        path: "/termos-de-uso/",
        run: 1,
        performance: 90,
        accessibility: 100,
        best_practices: 100,
        seo: 100,
        tbt_ms: 10,
        longest_own_task_ms: 20,
        lcp_ms: 1200,
        cls: 0,
        image_aspect_ratio: 1,
        image_size_responsive: 1,
      },
    ],
    { homeRuns: 3 },
  ).ok,
  true,
  "non-critical family performance floor stays 90",
);
assert.equal(
  evaluateLighthouseResults(
    [...passing, criticalPage("/ops/", 100, 0, { accessibility: 89, best_practices: 90, seo: 58 })],
    { homeRuns: 3, seoExemptPages: new Set(["/ops/"]) },
  ).ok,
  true,
  "seo-exempt noindex utilities are not scored on accessibility/SEO",
);
assert.equal(
  evaluateLighthouseResults(
    [...passing, criticalPage("/ops/", 100, 0, { accessibility: 89 })],
    { homeRuns: 3 },
  ).ok,
  false,
  "non-exempt pages still fail closed on accessibility",
);

for (const [name, rows] of [
  ["missing repetition", passing.slice(0, 2)],
  ["performance regression", [home(1, 97, 55, 138), home(2, 94, 80, 150), home(3, 97, 42, 136)]],
  ["accessibility regression", [home(1, 97, 55, 138), home(2, 97, 80, 150, { accessibility: 96 }), home(3, 97, 42, 136)]],
  ["best-practices regression", [home(1, 97, 55, 138), home(2, 97, 80, 150, { best_practices: 99 }), home(3, 97, 42, 136)]],
  ["SEO regression", [home(1, 97, 55, 138), home(2, 97, 80, 150, { seo: 99 }), home(3, 97, 42, 136)]],
  ["TBT regression", [home(1, 97, 30, 120), home(2, 97, 200, 150), home(3, 97, 220, 180)]],
  ["long-task regression", [home(1, 97, 30, 120), home(2, 97, 40, 201), home(3, 97, 35, 140)]],
  ["LCP regression", [home(1, 97, 55, 138, { lcp_ms: 2001 }), home(2, 95, 135, 185, { lcp_ms: 2100 }), home(3, 97, 42, 136, { lcp_ms: 2200 })]],
  ["LCP mixed max-of-3", [home(1, 97, 55, 138, { lcp_ms: 1500 }), home(2, 95, 135, 185, { lcp_ms: 2000 }), home(3, 97, 42, 136, { lcp_ms: 2300 })]],
  ["CLS regression", [home(1, 97, 55, 138, { cls: 0.06 }), home(2, 95, 135, 185), home(3, 97, 42, 136)]],
]) {
  assert.equal(
    evaluateLighthouseResults(rows, { homeRuns: 3 }).ok,
    false,
    `${name} must fail closed`,
  );
}

const committedSummary = JSON.parse(
  readFileSync(new URL("../../docs/lighthouse-runs/summary.json", import.meta.url), "utf8"),
);
const runnerSource = readFileSync(new URL("./run_lighthouse.mjs", import.meta.url), "utf8");
assert.match(
  runnerSource,
  /const FINAL_REPEATED_RUNS = 3;[\s\S]*configuredRuns \|\| FINAL_REPEATED_RUNS/,
  "the default Lighthouse command must collect the three runs required by final evidence",
);
assert.match(
  runnerSource,
  /diagnosticRunCount && !evidenceLabel[\s\S]*diagnostic-only and requires --label/,
  "a non-final run count must be explicitly labelled and cannot overwrite final evidence",
);
assert.match(
  runnerSource,
  /diagnostic completed; evidence is labelled and is not final/,
  "diagnostic evidence must not be reported as a passing final gate",
);
const unlabelledDiagnostic = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("./run_lighthouse.mjs", import.meta.url)), "--runs=1"],
  { encoding: "utf8", env: { ...process.env, LH_HOME_RUNS: "" } },
);
assert.notEqual(
  unlabelledDiagnostic.status,
  0,
  "an explicit one-run diagnostic must not masquerade as final evidence",
);
assert.match(
  `${unlabelledDiagnostic.stdout}\n${unlabelledDiagnostic.stderr}`,
  /diagnostic-only and requires --label/,
  "the rejected diagnostic must explain how to keep its evidence separate",
);
assert.doesNotMatch(
  runnerSource,
  /retry:\s*["']home_lcp|retriesLeft|LH_HOME_LCP_MAX_MS/,
  "Lighthouse evidence must not discard a failing home run and retry for a favorable sample",
);
assert.match(
  runnerSource,
  /await warmChromeHost\(\);[\s\S]*for \(const path of RUN_PAGES\)/,
  "a score-independent browser preflight must precede every measured matrix",
);
assert.match(
  runnerSource,
  /--user-data-dir=\$\{profileDir\}/,
  "Chromium profiles must stay in the isolated temporary directory",
);
const interfaceCoverage = deriveCoverage({ policy: loadPolicy(), siteRoot: ROOT });
assert.equal(interfaceCoverage.lighthouse.runtime_families.length, 1);
assert.deepEqual(
  committedSummary.coverage.runtime_families,
  interfaceCoverage.lighthouse.runtime_families,
  "package evidence must declare the post-stage runtime family without marking it measured",
);
assert.equal(
  committedSummary.coverage.runtime_evidence,
  null,
  "the package matrix cannot claim evidence for an overlay that is added only during stage",
);
for (const runtimeFamily of interfaceCoverage.lighthouse.runtime_families) {
  const routePattern = new RegExp(runtimeFamily.route_pattern);
  assert(
    !(committedSummary.coverage.pages || []).some((path) => routePattern.test(path)),
    `package Lighthouse pages contain a virtual runtime representative for ${runtimeFamily.id}`,
  );
  assert(
    !(committedSummary.results || []).some((row) => routePattern.test(row.path)),
    `package Lighthouse rows claim runtime evidence for ${runtimeFamily.id}`,
  );
}
const seoExempt = new Set(interfaceCoverage.lighthouse.seo_exempt_pages || []);
const measuredPages = interfaceCoverage.lighthouse.pages.filter((path) => !seoExempt.has(path));
const expectedRows = measuredPages.flatMap((path) =>
  CRITICAL_MONEY_PATHS.has(path)
    ? [`${path}#1`, `${path}#2`, `${path}#3`]
    : [`${path}#1`],
);
const committedMeasured = new Set(
  (committedSummary.results || [])
    .filter((row) => measuredPages.includes(row.path))
    .map((row) => `${row.path}#${row.run}`),
);
assert.deepEqual(
  [...committedMeasured].sort(),
  expectedRows.sort(),
  "committed Lighthouse evidence must cover the measured (non-seo-exempt) CI matrix",
);
for (const path of measuredPages) {
  assert(
    (committedSummary.coverage.pages || []).includes(path),
    `committed evidence missing measured page ${path}`,
  );
}
assert.deepEqual(
  committedSummary.coverage.thresholds,
  interfaceCoverage.lighthouse.thresholds,
  "committed evidence must preserve the declared thresholds",
);
const committedEvaluation = evaluateLighthouseResults(committedSummary.results, {
  homeRuns: 3,
  criticalRuns: 3,
  imageGatePages: new Set(committedSummary.coverage.image_gate_pages),
  seoExemptPages: new Set(committedSummary.coverage.seo_exempt_pages),
  thresholds: committedSummary.coverage.thresholds,
});
assert.deepEqual(
  committedSummary.evaluation,
  committedEvaluation,
  "committed Lighthouse summary must be recomputable from its rows",
);
const liveMeasuredEvaluation = evaluateLighthouseResults(
  (committedSummary.results || []).filter((row) => measuredPages.includes(row.path)),
  {
    homeRuns: 3,
    criticalRuns: 3,
    imageGatePages: new Set(interfaceCoverage.lighthouse.image_gate_pages),
    seoExemptPages: seoExempt,
    thresholds: interfaceCoverage.lighthouse.thresholds,
  },
);
assert.equal(
  liveMeasuredEvaluation.ok,
  true,
  `measured (non-seo-exempt) committed rows must pass current gates: ${liveMeasuredEvaluation.errors.join("; ")}`,
);

for (const row of process.env.LH_REQUIRE_RAW_EVIDENCE === "1" ? committedSummary.results : []) {
  assert.equal(row.status, undefined, `committed Lighthouse evidence contains an error for ${row.path}`);
  const slug = row.path === "/" ? "home" : row.path.replace(/\//g, "_").replace(/^_|_$/g, "");
  const filename = CRITICAL_MONEY_PATHS.has(row.path)
    ? `${slug}-run-${row.run}.json`
    : `${slug}.json`;
  const report = JSON.parse(
    readFileSync(new URL(`../../docs/lighthouse-runs/${filename}`, import.meta.url), "utf8"),
  );
  const categories = report.categories || {};
  const audits = report.audits || {};
  const ownLongTasks = (audits["long-tasks"]?.details?.items || [])
    .filter((item) => String(item.url || "").startsWith(committedSummary.base))
    .map((item) => Number(item.duration) || 0);
  const expected = {
    performance: Math.round((categories.performance?.score || 0) * 100),
    accessibility: Math.round((categories.accessibility?.score || 0) * 100),
    best_practices: Math.round((categories["best-practices"]?.score || 0) * 100),
    seo: Math.round((categories.seo?.score || 0) * 100),
    tbt_ms: audits["total-blocking-time"]?.numericValue,
    lcp_ms: audits["largest-contentful-paint"]?.numericValue,
    cls: audits["cumulative-layout-shift"]?.numericValue,
    longest_own_task_ms: Math.max(0, ...ownLongTasks),
    dom_elements: audits["dom-size-insight"]?.numericValue,
    total_byte_weight: audits["total-byte-weight"]?.numericValue,
    render_blocking_savings_ms: audits["render-blocking-insight"]?.metricSavings?.LCP || 0,
    image_delivery_savings_bytes:
      audits["image-delivery-insight"]?.details?.debugData?.wastedBytes || 0,
    font_display_score: audits["font-display-insight"]?.score,
    benchmark_index: report.environment?.benchmarkIndex,
  };
  for (const [field, value] of Object.entries(expected)) {
    assert.equal(
      row[field],
      value,
      `summary.json ${field} does not match ${filename}`,
    );
  }
}

// --- #508: the CLS budget is one declared number, enforced on live Chrome ---
//
// `performance_budget.cls_max` in data/site/design-system.json is read here and
// applied to the rows `npm run test:lighthouse` produces from headless Chrome
// against the built _site. scripts/site/audit_performance.py reads the same key
// and applies it to the committed rows in docs/lighthouse-runs/summary.json.
// Nothing below hardcodes 0.05 as the source of truth.
{
  const declared = JSON.parse(
    readFileSync(new URL("../../data/site/design-system.json", import.meta.url), "utf8"),
  ).performance_budget;
  assert.equal(
    DECLARED_CLS_MAX,
    declared.cls_max,
    "the CLS gate must read design-system.json, not a hardcoded literal",
  );
  assert.equal(readDeclaredBudget().clsMax, declared.cls_max);
  assert.ok(declared.cls_max <= CLS_CAP, "cls_max must not be loosened past the release gate");
  assert.ok(
    Number.isFinite(declared.font_total_gzip_kb_max) && Number.isFinite(declared.font_files_max),
    "the font budget keys must exist alongside cls_max",
  );

  // A declaration that loosens or removes the gate must not load at all.
  assert.throws(
    () => validateDeclaredBudget({ cls_max: CLS_CAP + 0.01 }),
    /exceeds cap/,
    "raising cls_max above the release gate must fail closed",
  );
  assert.throws(
    () => validateDeclaredBudget({}),
    /cls_max is missing/,
    "a performance_budget without cls_max must fail closed",
  );

  // And the declared number must actually bite on a measured row.
  const row = (cls) => ({
    path: "/entregas/",
    run: 1,
    performance: 100,
    accessibility: 100,
    best_practices: 100,
    seo: 100,
    tbt_ms: 10,
    longest_own_task_ms: 10,
    lcp_ms: 1000,
    dom_elements: 500,
    total_byte_weight: 1000,
    content_byte_weight: 1000,
    font_display_score: 1,
    image_aspect_ratio: 1,
    image_size_responsive: 1,
    cls,
  });
  const clsErrors = (cls, options = {}) =>
    evaluateLighthouseResults([row(cls)], { homeRuns: 0, criticalRuns: 1, ...options })
      .errors.filter((error) => error.startsWith("/entregas/: CLS"));
  assert.equal(clsErrors(DECLARED_CLS_MAX).length, 0, "a row exactly on the budget passes");
  assert.ok(clsErrors(DECLARED_CLS_MAX + 0.01).length > 0, "a row above the budget must fail");
  // Tightening the declaration tightens the gate, with no other edit.
  assert.ok(
    clsErrors(0.02, { clsMax: 0.01 }).length > 0,
    "a tighter declared cls_max must reject a row the looser one accepted",
  );
  assert.equal(clsErrors(0.02, { clsMax: 0.03 }).length, 0);
  console.log("OK declared_cls_budget_is_read_and_bites");
}

// --- 2026-09-10: payload is CONTENT bytes; LCP carries a measured network allowance ---
{
  const row = (extra) => criticalPage("/entregas/", 100, 0, extra);
  const payloadErrors = (extra) =>
    evaluateLighthouseResults([row(extra)], { homeRuns: 0, criticalRuns: 1 })
      .errors.filter((error) => error.includes("payload"));
  // Headers are not content: the same artifact must pass with any header overhead.
  assert.equal(payloadErrors({ total_byte_weight: 201033, content_byte_weight: 150000 }).length, 0,
    "header overhead in transferSize must not fail the content budget");
  assert.ok(payloadErrors({ total_byte_weight: 150000, content_byte_weight: 153601 }).length > 0,
    "content above the budget fails even when transfer is small");
  assert.ok(payloadErrors({ total_byte_weight: 150000, content_byte_weight: undefined }).length > 0,
    "a row without a content measurement fails closed");
  assert.equal(payloadErrors({ total_byte_weight: 150000, content_byte_weight: 153600 }).length, 0,
    "a row exactly on the content budget passes");
  const lcpErrors = (extra) =>
    evaluateLighthouseResults([row(extra)], { homeRuns: 0, criticalRuns: 1 })
      .errors.filter((error) => error.includes("critical LCP"));
  assert.ok(lcpErrors({ lcp_ms: 2400 }).length > 0, "lab mode: no allowance, 2400 fails");
  assert.equal(lcpErrors({ lcp_ms: 2400, lcp_network_allowance_ms: 500 }).length, 0,
    "runtime mode: the measured network allowance is subtracted");
  assert.ok(lcpErrors({ lcp_ms: 2600, lcp_network_allowance_ms: 500 }).length > 0,
    "the allowance never hides an artifact regression");
  assert.match(lcpErrors({ lcp_ms: 2600, lcp_network_allowance_ms: 500 })[0], /network allowance 500ms/);
  // The aggregated home gate applies the same allowance (runtime run 34517284468
  // failed only here: per-row LCP passed net of allowance, the home maximum did not).
  const homeRuns = [home(1, 98, 55, 100, { lcp_ms: 1835, lcp_network_allowance_ms: 606 }), home(2, 98, 62, 112, { lcp_ms: 2264, lcp_network_allowance_ms: 599 }), home(3, 98, 60, 100, { lcp_ms: 2258, lcp_network_allowance_ms: 598 })];
  const homeEval = evaluateLighthouseResults(homeRuns, { homeRuns: 3 });
  assert.equal(homeEval.errors.filter((e) => e.includes("LCP")).length, 0, JSON.stringify(homeEval.errors));
  assert.equal(homeEval.home.maximum_lcp_net_ms, 2264 - 599);
  const homeRegressed = evaluateLighthouseResults(homeRuns.map((r) => ({ ...r, lcp_ms: r.lcp_ms + 400 })), { homeRuns: 3 });
  assert.ok(homeRegressed.errors.some((e) => e.startsWith("home: LCP")), "the home gate still bites net of allowance");
  // The declared numbers are ceilings: loosening throws, tightening bites.
  const declared = JSON.parse(readFileSync(new URL("../../data/site/design-system.json", import.meta.url), "utf8")).performance_budget;
  assert.equal(declared.critical_content_bytes_max, CONTENT_BYTES_CAP);
  assert.equal(declared.critical_lcp_max_ms, LCP_MS_CAP);
  assert.throws(() => validateDeclaredBudget({ ...declared, critical_content_bytes_max: CONTENT_BYTES_CAP + 1 }), /exceeds cap/);
  assert.throws(() => validateDeclaredBudget({ ...declared, critical_lcp_max_ms: LCP_MS_CAP + 1 }), /exceeds cap/);
  assert.throws(() => validateDeclaredBudget({ ...declared, budget_notes: { ...declared.budget_notes, content_bytes: "" } }), /justification/);
  assert.ok(payloadErrors({ content_byte_weight: 140000 }).length === 0);
  assert.ok(evaluateLighthouseResults([row({ content_byte_weight: 140000 })], { homeRuns: 0, criticalRuns: 1, criticalByteWeightMax: 130000 })
    .errors.some((error) => error.includes("payload")), "a tighter declared content budget must bite");
  console.log("OK content_bytes_and_network_allowance");
}

console.log("LIGHTHOUSE_THRESHOLDS_OK");

// Per-route DOM budget: /entregas/ is the catalogue, so its element count
// scales with the published inventory rather than page weight. Every other
// money route must keep the shared 800 budget.
{
  const base = {
    performance: 100, lcp_ms: 1000, tbt_ms: 10, total_byte_weight: 1000, content_byte_weight: 1000,
    accessibility: 100, best_practices: 100, seo: 100,
  };
  const domErrors = (path, dom) => {
    const out = evaluateLighthouseResults(
      [{ ...base, path, dom_elements: dom }],
      { criticalRoutes: new Set([path]), homeRuns: 1, criticalRuns: 1 },
    );
    const errors = Array.isArray(out) ? out : out.errors || [];
    return errors.filter((e) => String(e).includes("DOM"));
  };
  // 1063 e a contagem real medida pelo Lighthouse na rota depois da remocao do
  // wrapper capability-item__copy e do <small> redundante (2026-08-30); 1101 e
  // um elemento acima do teto de 1100. As duas sondas cercam o orcamento, entao
  // ele continua mordendo e nao pode ser elevado sem que este teste seja movido
  // junto, de proposito e a vista.
  assert.equal(domErrors("/entregas/", 1063).length, 0, "entregas within its catalogue budget");
  assert.ok(domErrors("/entregas/", 1101).length > 0, "entregas budget still fails closed");
  assert.equal(domErrors("/casos/", 700).length, 0, "other money routes pass under 800");
  assert.ok(domErrors("/casos/", 850).length > 0, "other money routes keep the 800 budget");
  console.log("OK per_route_dom_budget");
}
