import { readFileSync } from "node:fs";

/**
 * CLS budget (issue #508).
 *
 * `performance_budget.cls_max` in data/site/design-system.json is the single
 * declared number. It is enforced in two places against two different
 * measurements, and neither of them is a guess:
 *
 *  - here, against the live headless-Chrome run CI performs on the built _site
 *    (`npm run test:lighthouse`, then `LH_REQUIRE_RAW_EVIDENCE=1 npm run
 *    test:lighthouse-gates`);
 *  - in scripts/site/audit_performance.py, against the committed rows in
 *    docs/lighthouse-runs/summary.json, per route.
 *
 * CLS_CAP mirrors the Python cap: the declaration may tighten the release gate
 * that already exists, never loosen it.
 */
export const CLS_CAP = 0.05;
const DESIGN_SYSTEM_URL = new URL("../../data/site/design-system.json", import.meta.url);

/** Read and validate the declared budget. Fail closed on a missing or raised key. */
export function readDeclaredBudget(url = DESIGN_SYSTEM_URL) {
  return validateDeclaredBudget(
    JSON.parse(readFileSync(url, "utf8")).performance_budget || {},
  );
}

/** Pure validation, so a negative test can drive it without touching disk. */
export function validateDeclaredBudget(budget) {
  const clsMax = Number(budget.cls_max);
  if (!Number.isFinite(clsMax)) {
    throw new Error("design-system.json performance_budget.cls_max is missing");
  }
  if (clsMax > CLS_CAP) {
    throw new Error(`declared cls_max ${clsMax} exceeds cap ${CLS_CAP}`);
  }
  return { clsMax };
}

export const DECLARED_CLS_MAX = readDeclaredBudget().clsMax;

export function percentile75(values) {
  const ordered = values
    .filter((value) => Number.isFinite(value))
    .slice()
    .sort((a, b) => a - b);
  if (!ordered.length) return null;
  return ordered[Math.ceil(ordered.length * 0.75) - 1];
}

export const CRITICAL_MONEY_PATHS = new Set([
  "/",
  "/entregas/",
  "/conteudos/documentos-reequilibrio-obra-publica/",
  "/diretoria-b2g/",
  "/ferramentas/diagnostico-defesa-margem/",
  "/diagnostico-b2g-expansao/",
  "/casos/",
  "/especialista/tiago-jun-sasaki/",
]);

export function evaluateLighthouseResults(results, options = {}) {
  const homeRuns = Number(options.homeRuns || 1);
  const imageGatePages = options.imageGatePages || new Set();
  const seoExemptPages = options.seoExemptPages || new Set();
  const criticalRoutes = options.criticalRoutes || new Set(["/entregas/"]);
  const criticalPerformance = Number(options.criticalPerformance || 95);
  const homeLcpMaxMs = Number(options.homeLcpMaxMs || 2000);
  const homeClsMax = Number(options.homeClsMax ?? DECLARED_CLS_MAX);
  const clsMax = Number(options.clsMax ?? DECLARED_CLS_MAX);
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
    if (!seoExemptPages.has(row.path) && row.accessibility < thresholds.accessibility) {
      errors.push(`${row.path}: accessibility ${row.accessibility} < ${thresholds.accessibility}`);
    }
    if (!seoExemptPages.has(row.path) && row.best_practices < thresholds.best_practices) {
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
    if (Number.isFinite(row.cls) && row.cls > clsMax) {
      errors.push(`${row.path}: CLS ${row.cls} > ${clsMax}`);
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
  const criticalPaths = options.criticalPaths || CRITICAL_MONEY_PATHS;
  const criticalRuns = Number(options.criticalRuns || 1);
  const criticalLcpMaxMs = options.criticalLcpMaxMs ?? 2000;
  const criticalTbtMaxMs = options.criticalTbtMaxMs ?? 200;
  const criticalDomMax = options.criticalDomMax ?? 800;
  // Per-route DOM budget. /entregas/ is the catalogue: its element count scales
  // with the published inventory (8 offers plus the 54-capability roll), not
  // with page weight, so the shared 800 budget cannot express it. Every other
  // money route keeps 800, and LCP, TBT and payload budgets are unchanged here.
  //
  // 1100 -> 1150 em 2026-08-30 (#530), depois revertido para 1100 no mesmo dia
  // (#531/#532). #530 tinha exposto decisao, trabalho comprimido, artefato e
  // razao do preco nas oito ofertas via .vitrine-item__facts, elevando a
  // contagem medida para 1125. Nesta mesma data, render_public_catalog.mjs
  // parou de emitir o wrapper <span class="capability-item__copy"> (54 nos) e
  // o <small> redundante nas 8 linhas PUBLISHED (8 nos): -62 tags de abertura
  // na fonte. O Lighthouse dom_elements medido em /entregas/ apos o corte caiu
  // para 1063 (medicao direta com run_lighthouse.mjs --only=/entregas/,
  // confirmada por document.body.getElementsByTagName('*').length+1 = 1062 via
  // Puppeteer headless contra _site/). Isso fica abaixo do teto de 1100
  // original, entao o afrouxamento de #530 deixou de ser necessario e o teto
  // volta a 1100, com 37 elementos de folga sobre o medido.
  const criticalDomMaxByPath = { "/entregas/": 1100, ...(options.criticalDomMaxByPath || {}) };
  const domMaxFor = (path) => criticalDomMaxByPath[path] ?? criticalDomMax;
  const criticalByteWeightMax = options.criticalByteWeightMax ?? 150 * 1024;
  for (const path of criticalPaths) {
    const observed = results.filter((row) => row.path === path && !row.error).length;
    const expected = path === "/" ? homeRuns : criticalRuns;
    if (observed > 0 && observed !== expected) {
      errors.push(`${path}: expected ${expected} critical runs, observed ${observed}`);
    }
  }
  for (const row of results) {
    if (row.error) continue;
    if (!criticalPaths.has(row.path)) continue;
    if (row.performance < criticalPerfMin) {
      errors.push(`${row.path}: critical performance ${row.performance} < ${criticalPerfMin}`);
    }
    if (!Number.isFinite(row.lcp_ms) || row.lcp_ms > criticalLcpMaxMs) {
      errors.push(`${row.path}: critical LCP ${row.lcp_ms}ms > ${criticalLcpMaxMs}ms`);
    }
    if (!Number.isFinite(row.tbt_ms) || row.tbt_ms > criticalTbtMaxMs) {
      errors.push(`${row.path}: critical TBT ${row.tbt_ms}ms > ${criticalTbtMaxMs}ms`);
    }
    const domMax = domMaxFor(row.path);
    if (!Number.isFinite(row.dom_elements) || row.dom_elements > domMax) {
      errors.push(`${row.path}: critical DOM ${row.dom_elements} > ${domMax} elements`);
    }
    if (!Number.isFinite(row.total_byte_weight) || row.total_byte_weight > criticalByteWeightMax) {
      errors.push(
        `${row.path}: critical payload ${row.total_byte_weight} > ${criticalByteWeightMax} bytes`,
      );
    }
    if (row.font_display_score !== 1) {
      errors.push(`${row.path}: font-display score ${row.font_display_score} must equal 1`);
    }
  }
  if (homeGate.minimum_performance == null || homeGate.minimum_performance < 95) {
    errors.push(`home: minimum performance ${homeGate.minimum_performance} < 95`);
  }
  const minimumHomeAccessibility = home.length
    ? Math.min(...home.map((row) => row.accessibility))
    : null;
  const minimumHomeBestPractices = home.length
    ? Math.min(...home.map((row) => row.best_practices))
    : null;
  const minimumHomeSeo = home.length ? Math.min(...home.map((row) => row.seo)) : null;
  if (minimumHomeAccessibility == null || minimumHomeAccessibility < 97) {
    errors.push(`home: minimum accessibility ${minimumHomeAccessibility} < 97`);
  }
  if (minimumHomeBestPractices == null || minimumHomeBestPractices < 100) {
    errors.push(`home: minimum best-practices ${minimumHomeBestPractices} < 100`);
  }
  if (minimumHomeSeo == null || minimumHomeSeo < 100) {
    errors.push(`home: minimum SEO ${minimumHomeSeo} < 100`);
  }
  if (homeGate.p75_tbt_ms == null || homeGate.p75_tbt_ms >= 200) {
    errors.push(`home: p75 TBT ${homeGate.p75_tbt_ms}ms must be < 200ms`);
  }
  if (homeGate.maximum_own_long_task_ms == null || homeGate.maximum_own_long_task_ms > 200) {
    errors.push(
      `home: maximum own long task ${homeGate.maximum_own_long_task_ms}ms must be <= 200ms`,
    );
  }
  if (homeGate.maximum_lcp_ms == null || homeGate.maximum_lcp_ms > homeLcpMaxMs) {
    errors.push(`home: LCP ${homeGate.maximum_lcp_ms}ms must be <= ${homeLcpMaxMs}ms`);
  }
  if (homeGate.maximum_cls == null || homeGate.maximum_cls > homeClsMax) {
    errors.push(`home: CLS ${homeGate.maximum_cls} must be <= ${homeClsMax}`);
  }

  return { ok: errors.length === 0, errors, home: homeGate };
}
