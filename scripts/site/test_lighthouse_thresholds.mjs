import assert from "node:assert/strict";
import { evaluateLighthouseResults, percentile75 } from "./lighthouse_thresholds.mjs";

const home = (run, performance, tbt_ms, longest_own_task_ms) => ({
  path: "/",
  run,
  performance,
  accessibility: 100,
  best_practices: 100,
  seo: 100,
  tbt_ms,
  longest_own_task_ms,
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
  },
});

for (const [name, rows] of [
  ["missing repetition", passing.slice(0, 2)],
  ["performance regression", [home(1, 97, 55, 138), home(2, 94, 80, 150), home(3, 97, 42, 136)]],
  ["TBT regression", [home(1, 97, 30, 120), home(2, 97, 200, 150), home(3, 97, 220, 180)]],
  ["long-task regression", [home(1, 97, 30, 120), home(2, 97, 40, 201), home(3, 97, 35, 140)]],
]) {
  assert.equal(
    evaluateLighthouseResults(rows, { homeRuns: 3 }).ok,
    false,
    `${name} must fail closed`,
  );
}

console.log("LIGHTHOUSE_THRESHOLDS_OK");
