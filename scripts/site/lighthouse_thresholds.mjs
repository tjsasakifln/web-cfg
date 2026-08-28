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
  const criticalRoutes = options.criticalRoutes || new Set(["/entregas/"]);
  const criticalPerformance = Number(options.criticalPerformance || 95);
  const homeLcpMaxMs = Number(options.homeLcpMaxMs || 2000);
  const homeClsMax = Number(options.homeClsMax || 0.05);
  const thresholds = {
    performance: 90,
    accessibility: 95,
    best_practices: 95,
    seo: 95,
    ...(options.thresholds || {}),
  };
  const errors = [];

  for (const row of results) {
    if (row.error) {
      errors.push(`${row.path} run ${row.run || 1}: ${row.error}`);
      continue;
    }
    if (row.accessibility < thresholds.accessibility) {
      errors.push(`${row.path}: accessibility ${row.accessibility} < ${thresholds.accessibility}`);
    }
    if (row.best_practices < thresholds.best_practices) {
      errors.push(`${row.path}: best-practices ${row.best_practices} < ${thresholds.best_practices}`);
    }
    if (!seoExemptPages.has(row.path) && row.seo < thresholds.seo) {
      errors.push(`${row.path}: seo ${row.seo} < ${thresholds.seo}`);
    }
    if (row.path !== "/") {
      const floor = criticalRoutes.has(row.path)
        ? Math.max(thresholds.performance, criticalPerformance)
        : thresholds.performance;
      if (row.performance < floor) {
        errors.push(`${row.path}: performance ${row.performance} < ${floor}`);
      }
    }
    if (Number.isFinite(row.cls) && row.cls > (options.clsMax ?? 0.05)) {
      errors.push(`${row.path}: CLS ${row.cls} > ${options.clsMax ?? 0.05}`);
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
    minimum_lcp_ms: home.length
      ? Math.min(...home.map((row) => Number(row.lcp_ms) || 0))
      : null,
    maximum_lcp_ms: home.length
      ? Math.max(...home.map((row) => Number(row.lcp_ms) || 0))
      : null,
    maximum_cls: home.length
      ? Math.max(...home.map((row) => Number(row.cls) || 0))
      : null,
  };
  if (home.length !== homeRuns) {
    errors.push(`home: expected ${homeRuns} Lighthouse runs, observed ${home.length}`);
  }
  const criticalPerfMin = options.criticalPerfMin ?? 95;
  const criticalPaths = options.criticalPaths || new Set([
    "/",
    "/entregas/",
    "/conteudos/documentos-reequilibrio-obra-publica/",
    "/diretoria-b2g/",
    "/ferramentas/diagnostico-defesa-margem/",
    "/casos/",
    "/especialista/tiago-jun-sasaki/",
  ]);
  for (const row of results) {
    if (row.error) continue;
    if (criticalPaths.has(row.path) && row.performance < criticalPerfMin) {
      errors.push(`${row.path}: critical performance ${row.performance} < ${criticalPerfMin}`);
    }
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
  if (homeGate.minimum_lcp_ms == null || homeGate.minimum_lcp_ms > homeLcpMaxMs) {
    errors.push(`home: LCP ${homeGate.minimum_lcp_ms}ms must be <= ${homeLcpMaxMs}ms`);
  }
  if (homeGate.maximum_cls == null || homeGate.maximum_cls > homeClsMax) {
    errors.push(`home: CLS ${homeGate.maximum_cls} must be <= ${homeClsMax}`);
  }

  return { ok: errors.length === 0, errors, home: homeGate };
}
