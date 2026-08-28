import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateLighthouseResults, percentile75 } from "./lighthouse_thresholds.mjs";
import { ROOT, deriveCoverage, loadPolicy } from "./interface_coverage.mjs";

const home = (run, performance, tbt_ms, longest_own_task_ms, extra = {}) => ({
  path: "/",
  run,
  performance,
  accessibility: 100,
  best_practices: 100,
  seo: 100,
  tbt_ms,
  longest_own_task_ms,
  lcp_ms: extra.lcp_ms ?? 1500,
  cls: extra.cls ?? 0,
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
    maximum_lcp_ms: 1500,
    maximum_cls: 0,
  },
});

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
  cls: 0,
  image_aspect_ratio: 1,
  image_size_responsive: 1,
});
assert.equal(evaluateLighthouseResults([...passing, entregas(95)], { homeRuns: 3 }).ok, true);
assert.equal(
  evaluateLighthouseResults([...passing, entregas(94)], { homeRuns: 3 }).ok,
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
  ["TBT regression", [home(1, 97, 30, 120), home(2, 97, 200, 150), home(3, 97, 220, 180)]],
  ["long-task regression", [home(1, 97, 30, 120), home(2, 97, 40, 201), home(3, 97, 35, 140)]],
  ["LCP regression", [home(1, 97, 55, 138, { lcp_ms: 2001 }), home(2, 95, 135, 185), home(3, 97, 42, 136)]],
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
const interfaceCoverage = deriveCoverage({ policy: loadPolicy(), siteRoot: ROOT });
const expectedRows = interfaceCoverage.lighthouse.pages.flatMap((path) =>
  path === "/" ? ["/#1", "/#2", "/#3"] : [`${path}#1`],
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
  const filename = row.path === "/" ? `${slug}-run-${row.run}.json` : `${slug}.json`;
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
