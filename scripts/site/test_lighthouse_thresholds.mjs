import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CRITICAL_MONEY_PATHS,
  evaluateLighthouseResults,
  percentile75,
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
const expectedRows = interfaceCoverage.lighthouse.pages.flatMap((path) =>
  CRITICAL_MONEY_PATHS.has(path)
    ? [`${path}#1`, `${path}#2`, `${path}#3`]
    : [`${path}#1`],
);
assert.deepEqual(
  (committedSummary.results || []).map((row) => `${row.path}#${row.run}`).sort(),
  expectedRows.sort(),
  "committed Lighthouse evidence must cover the complete CI matrix",
);
assert.deepEqual(
  committedSummary.coverage.pages,
  interfaceCoverage.lighthouse.pages,
  "committed evidence must name the derived family representatives",
);
assert.deepEqual(
  committedSummary.coverage.thresholds,
  interfaceCoverage.lighthouse.thresholds,
  "committed evidence must preserve the declared thresholds",
);
const committedEvaluation = evaluateLighthouseResults(committedSummary.results, {
  homeRuns: 3,
  criticalRuns: 3,
  imageGatePages: new Set(interfaceCoverage.lighthouse.image_gate_pages),
  seoExemptPages: new Set(interfaceCoverage.lighthouse.seo_exempt_pages),
  thresholds: interfaceCoverage.lighthouse.thresholds,
});
assert.deepEqual(
  committedSummary.evaluation,
  committedEvaluation,
  "committed Lighthouse summary must be recomputable from its rows",
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

console.log("LIGHTHOUSE_THRESHOLDS_OK");

// Per-route DOM budget: /entregas/ is the catalogue, so its element count
// scales with the published inventory rather than page weight. Every other
// money route must keep the shared 800 budget.
{
  const base = {
    performance: 100, lcp_ms: 1000, tbt_ms: 10, total_byte_weight: 1000,
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
  assert.equal(domErrors("/entregas/", 1024).length, 0, "entregas within its catalogue budget");
  assert.ok(domErrors("/entregas/", 1150).length > 0, "entregas budget still fails closed");
  assert.equal(domErrors("/casos/", 700).length, 0, "other money routes pass under 800");
  assert.ok(domErrors("/casos/", 850).length > 0, "other money routes keep the 800 budget");
  console.log("OK per_route_dom_budget");
}
