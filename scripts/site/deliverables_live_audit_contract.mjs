/**
 * Reusable safety and evidence contract for the exact-live deliverables audit.
 *
 * This module is intentionally free of public-copy expectations. The live
 * probe owns those checks; this seam owns capture integrity, exact-artifact
 * continuity and safe atomic publication of evidence.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FULLPAGE_CAPTURE_PREPARATION,
  captureRecord,
  prepareFullPageCapture,
  resolveCaptureState,
  verifyFullPageCapture,
} from "./capture_states.mjs";

export const DELIVERABLES_LIVE_AUDIT_SCHEMA = "confenge.deliverables-live-audit/2.0";
export const LIVE_FULL_PAGE_CAPTURE_STATUS = "CAPTURED_STABLE_VIA_540";
export const LIVE_FULL_PAGE_STATE = resolveCaptureState({ CAPTURE_FULLPAGE: "1" });
export const LIVE_FULL_PAGE_MAX_ATTEMPTS = 3;

function isStrictChild(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Evidence may replace only a dedicated child under docs/evidence or a temp
 * root. This makes `--out=.` and other broad rename/delete targets impossible.
 */
export function assertSafeEvidenceOutputDir({ repoRoot, target, temporaryRoots = null }) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedTarget = path.resolve(target);
  const durableRoot = path.join(resolvedRoot, "docs", "evidence");
  const ephemeralRoots = temporaryRoots || [tmpdir(), "/tmp", "/var/tmp", "/dev/shm"];
  const allowedRoots = [durableRoot, ...ephemeralRoots].map((entry) => path.resolve(entry));
  const insideRepository = resolvedTarget === resolvedRoot || isStrictChild(resolvedRoot, resolvedTarget);
  const insideDedicatedEvidence = isStrictChild(durableRoot, resolvedTarget);
  if (
    (insideRepository && !insideDedicatedEvidence)
    || !allowedRoots.some((allowedRoot) => isStrictChild(allowedRoot, resolvedTarget))
  ) {
    throw new Error(
      `DELIVERABLES_EVIDENCE_OUTPUT_UNSAFE target=${resolvedTarget}; `
        + `use a dedicated child of ${durableRoot} or a temporary root`,
    );
  }
  return resolvedTarget;
}

/** Refuse to mix a historical v1 bundle or an operator README into v2 output. */
export function assertReplaceableEvidenceOutput(finalOutputDir) {
  if (!existsSync(finalOutputDir)) return;
  if (!statSync(finalOutputDir).isDirectory()) {
    throw new Error(`DELIVERABLES_EVIDENCE_TARGET_NOT_DIRECTORY target=${finalOutputDir}`);
  }
  const entries = readdirSync(finalOutputDir).sort();
  const unexpected = entries.filter((entry) => entry !== "report.json" && entry !== "screenshots");
  const reportFile = path.join(finalOutputDir, "report.json");
  if (unexpected.length || !existsSync(reportFile)) {
    throw new Error(
      `DELIVERABLES_EVIDENCE_TARGET_NOT_TOOL_OWNED target=${finalOutputDir} `
        + `unexpected=${unexpected.join(",") || "none"}`,
    );
  }
  let prior;
  try {
    prior = JSON.parse(readFileSync(reportFile, "utf8"));
  } catch {
    throw new Error(`DELIVERABLES_EVIDENCE_PRIOR_REPORT_INVALID target=${reportFile}`);
  }
  if (prior.schema !== DELIVERABLES_LIVE_AUDIT_SCHEMA) {
    throw new Error(
      `DELIVERABLES_EVIDENCE_SCHEMA_MIGRATION_REFUSED prior=${prior.schema || "missing"} `
        + `current=${DELIVERABLES_LIVE_AUDIT_SCHEMA}`,
    );
  }
}

/** Fail closed if the edge served a different artifact during one audit. */
export function assertArtifactHashContinuity(initialBuild, finalBuild) {
  const before = initialBuild?.artifact_hash;
  const after = finalBuild?.artifact_hash;
  if (typeof before !== "string" || !before || typeof after !== "string" || !after) {
    throw new Error("DELIVERABLES_LIVE_ARTIFACT_HASH_MISSING");
  }
  if (before !== after) {
    throw new Error(`DELIVERABLES_LIVE_ARTIFACT_CHANGED before=${before} after=${after}`);
  }
  return before;
}

/** Capture one deterministic full-page record through the shared #540 path. */
export async function captureStableFullPage({
  page,
  filePath,
  outputDir,
  route,
  slug,
  width,
  height,
  browserVersion,
}) {
  if (!browserVersion) throw new Error("DELIVERABLES_LIVE_BROWSER_VERSION_MISSING");
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
  });
  let layout = null;
  let attempts = 0;
  let materializedElements = 0;
  const discardedUnstableAttempts = [];
  while (attempts < LIVE_FULL_PAGE_MAX_ATTEMPTS) {
    attempts += 1;
    layout = await prepareFullPageCapture(page, LIVE_FULL_PAGE_STATE);
    materializedElements = Math.max(materializedElements, layout.materialized_elements);
    await page.screenshot({ path: filePath, fullPage: true });
    try {
      layout = await verifyFullPageCapture(page, LIVE_FULL_PAGE_STATE, layout);
      break;
    } catch (error) {
      if (!String(error?.message || error).startsWith("CAPTURE_LAYOUT_CHANGED_DURING_SCREENSHOT")) throw error;
      discardedUnstableAttempts.push({
        attempt: attempts,
        layout,
        error: String(error.message),
      });
      layout = null;
      if (attempts >= LIVE_FULL_PAGE_MAX_ATTEMPTS) throw error;
    }
  }
  layout = { ...layout, materialized_elements: materializedElements };
  const capture = captureRecord({
    file: path.relative(outputDir, filePath),
    path: filePath,
    route,
    slug,
    width,
    height,
    state: LIVE_FULL_PAGE_STATE,
    layout,
  });
  return {
    status: LIVE_FULL_PAGE_CAPTURE_STATUS,
    browser_version: browserVersion,
    preparation: { ...FULLPAGE_CAPTURE_PREPARATION },
    attempts,
    discarded_unstable_attempts: discardedUnstableAttempts,
    capture,
  };
}

export function classifyRouteResult(errors) {
  return errors.length ? "DEFECT" : "PASS";
}

/** Browser-evaluable extraction shared by live code and the hermetic fixture. */
export function inspectCommercialLadder(routeExpected) {
  const normalize = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const ladders = [...document.querySelectorAll("main [data-offer-ladder]")];
  const ladderText = normalize(ladders.map((node) => node.textContent).join(" "));
  const linksForStep = (step) => ladders.flatMap((node) => [
    ...node.querySelectorAll(`[data-ladder-step="${step}"] a[href]`),
  ]).map((link) => ({ href: link.getAttribute("href"), text: normalize(link.textContent) }));
  const diagnosisLinks = linksForStep("diagnosis");
  const recurringLinks = linksForStep("recurring");
  return {
    explicit_components: ladders.length,
    has_units_sum: ladderText.includes(routeExpected.package.units_sum_display),
    has_package_price: ladderText.includes(routeExpected.package.package_price_display),
    has_credit_window: ladderText.includes(`${routeExpected.package.credit_window_days} dias`),
    promises_credit: /(?:volta como crédito|valor (?:pago )?é abatido|abate o valor)/i.test(ladderText),
    says_unit_01_has_no_credit: /(?:únic[oa] sem o crédito|não gera crédito|fora do diagnóstico)/i.test(ladderText),
    diagnosis_link: diagnosisLinks.some(({ href }) => href === "/diagnostico-b2g-expansao/"),
    recurring_direction_context: recurringLinks.some(
      ({ href, text }) => href === "/diretoria-b2g/" && /recorr|direção|diretoria/i.test(text),
    ),
  };
}

/** Commercial ladder checks remain independent from capture success. */
export function validateCommercialLadder(ladder, expected) {
  const errors = [];
  const require = (condition, code) => {
    if (!condition) errors.push(code);
  };
  require(ladder.explicit_components === 1, "explicit_value_ladder_missing");
  if (expected.kind === "hub") {
    require(
      ladder.has_units_sum && ladder.has_package_price && ladder.has_credit_window,
      "value_ladder_arithmetic",
    );
    require(ladder.says_unit_01_has_no_credit, "unit_01_no_credit_boundary_missing");
    require(ladder.diagnosis_link, "diagnosis_step_missing");
    require(ladder.recurring_direction_context, "recurring_direction_step_missing");
  } else {
    require(ladder.has_credit_window, "credit_window_missing");
    require(ladder.diagnosis_link, "diagnosis_step_missing");
    require(ladder.recurring_direction_context, "recurring_direction_step_missing");
    if (expected.id === "CFG-D01") {
      require(!ladder.promises_credit, "unit_01_false_credit_promise");
      require(ladder.says_unit_01_has_no_credit, "unit_01_no_credit_boundary_missing");
    } else {
      require(ladder.has_package_price && ladder.promises_credit, "package_credit_terms_missing");
    }
  }
  return errors;
}

/** Stable issue ownership for the two known commercial defects from #546. */
export function buildCommercialDefects(routes, errorsForRoute = (entry) => entry.errors || []) {
  const defects = [];
  const d01 = routes.find(({ deliverable_id: id }) => id === "CFG-D01");
  if (d01 && errorsForRoute(d01).includes("unit_01_false_credit_promise")) {
    defects.push({
      id: "CFG530-D01-CREDIT-CONTRADICTION",
      severity: "HIGH",
      owner_issue: 547,
      affected_routes: [d01.route],
      symptoms: [
        "unit_01_false_credit_promise",
        "unit_01_no_credit_boundary_missing",
        "diagnosis_step_missing",
      ],
      reproduction: [
        "In /entregas/, inspect CFG-D01: it is the only unit declared outside the package and without 60-day credit.",
        "Open CFG-D01 and scroll to the written-request form: the page says the value returns as credit within 60 days.",
      ],
      probable_files: [
        "casos/modelo-relatorio-inteligencia-licitacoes/index.html",
        "tests/commercial/test_page_contract_eight.mjs",
      ],
      evidence: [
        "screenshots/entregas-1366x768-first-offer.png",
        "screenshots/casos_modelo-relatorio-inteligencia-licitacoes-1366x768-form.png",
      ],
    });
  }
  const recurringAffected = routes
    .filter((entry) => errorsForRoute(entry).includes("recurring_direction_step_missing"))
    .map(({ route }) => route);
  if (recurringAffected.length) {
    defects.push({
      id: "CFG530-RECURRING-DIRECTION-LADDER-MISSING",
      severity: "MEDIUM",
      owner_issue: 547,
      affected_routes: recurringAffected,
      symptoms: ["recurring_direction_step_missing"],
      reproduction: [
        "Inspect the value-ladder content inside <main> on each route.",
        "No route places /diretoria-b2g/ in the ladder with a recurring-direction trigger or scope; the URL appears only in global chrome/footer.",
      ],
      probable_files: [
        "data/commercial/page-contract-eight.v1.json",
        "scripts/commercial/render_public_catalog.mjs",
        "scripts/commercial/render_eight_offer_contracts.mjs",
      ],
      evidence: [
        "report.json",
        "screenshots/entregas-1366x768-decision-nav.png",
      ],
    });
  }
  return defects;
}

/** Full-page proof is required even when commercial checks correctly fail. */
export function assertFullPageCoverage(routes) {
  const missing = routes
    .filter((entry) => entry.full_page?.status !== LIVE_FULL_PAGE_CAPTURE_STATUS)
    .map((entry) => entry.route);
  if (missing.length) {
    throw new Error(`DELIVERABLES_FULL_PAGE_EVIDENCE_MISSING routes=${missing.join(",")}`);
  }
}

/**
 * Publish only after the complete report exists. If promotion fails after the
 * prior output was moved aside, restore it before surfacing the error.
 */
export function publishEvidenceAtomically({
  repoRoot,
  workingDir,
  finalOutputDir,
  rename = renameSync,
}) {
  const finalDir = assertSafeEvidenceOutputDir({ repoRoot, target: finalOutputDir });
  assertReplaceableEvidenceOutput(finalDir);
  const workDir = path.resolve(workingDir);
  const expectedPrefix = `.${path.basename(finalDir)}.tmp-`;
  if (path.dirname(workDir) !== path.dirname(finalDir) || !path.basename(workDir).startsWith(expectedPrefix)) {
    throw new Error(`DELIVERABLES_EVIDENCE_WORKDIR_UNSAFE target=${workDir}`);
  }
  const backup = `${finalDir}.previous-${process.pid}`;
  if (existsSync(backup)) throw new Error(`stale evidence backup exists: ${backup}`);
  const hadPrevious = existsSync(finalDir);
  if (hadPrevious) rename(finalDir, backup);
  try {
    rename(workDir, finalDir);
  } catch (error) {
    if (hadPrevious && existsSync(backup) && !existsSync(finalDir)) rename(backup, finalDir);
    throw error;
  }
  if (hadPrevious) rmSync(backup, { recursive: true, force: true });
}
