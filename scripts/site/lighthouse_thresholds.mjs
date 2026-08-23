export function percentile75(values) {
  const ordered = values
    .filter((value) => Number.isFinite(value))
    .slice()
    .sort((a, b) => a - b);
  if (!ordered.length) return null;
  return ordered[Math.ceil(ordered.length * 0.75) - 1];
}

export function evaluateLighthouseResults(results, options = {}) {
  const homeRuns = Number(options.homeRuns || 1);
  const imageGatePages = options.imageGatePages || new Set();
  const seoExemptPages = options.seoExemptPages || new Set();
  const errors = [];

  for (const row of results) {
    if (row.error) {
      errors.push(`${row.path} run ${row.run || 1}: ${row.error}`);
      continue;
    }
    if (row.accessibility < 95) errors.push(`${row.path}: accessibility ${row.accessibility} < 95`);
    if (row.best_practices < 95) errors.push(`${row.path}: best-practices ${row.best_practices} < 95`);
    if (!seoExemptPages.has(row.path) && row.seo < 95) {
      errors.push(`${row.path}: seo ${row.seo} < 95`);
    }
    if (row.path !== "/" && row.performance < 90) {
      errors.push(`${row.path}: performance ${row.performance} < 90`);
    }
    if (
      imageGatePages.has(row.path)
      && (row.image_aspect_ratio !== 1 || row.image_size_responsive !== 1)
    ) {
      errors.push(`${row.path}: responsive image audit failed`);
    }
  }

  const home = results.filter((row) => row.path === "/" && !row.error);
  const homeGate = {
    expected_runs: homeRuns,
    observed_runs: home.length,
    minimum_performance: home.length ? Math.min(...home.map((row) => row.performance)) : null,
    p75_tbt_ms: percentile75(home.map((row) => row.tbt_ms)),
    maximum_own_long_task_ms: home.length
      ? Math.max(...home.map((row) => row.longest_own_task_ms || 0))
      : null,
  };
  if (home.length !== homeRuns) {
    errors.push(`home: expected ${homeRuns} Lighthouse runs, observed ${home.length}`);
  }
  if (homeGate.minimum_performance == null || homeGate.minimum_performance < 95) {
    errors.push(`home: minimum performance ${homeGate.minimum_performance} < 95`);
  }
  if (homeGate.p75_tbt_ms == null || homeGate.p75_tbt_ms >= 200) {
    errors.push(`home: p75 TBT ${homeGate.p75_tbt_ms}ms must be < 200ms`);
  }
  if (homeGate.maximum_own_long_task_ms == null || homeGate.maximum_own_long_task_ms > 200) {
    errors.push(
      `home: maximum own long task ${homeGate.maximum_own_long_task_ms}ms must be <= 200ms`,
    );
  }

  return { ok: errors.length === 0, errors, home: homeGate };
}
