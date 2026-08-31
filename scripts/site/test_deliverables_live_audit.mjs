import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import {
  DELIVERABLES_LIVE_AUDIT_SCHEMA,
  LIVE_FULL_PAGE_CAPTURE_STATUS,
  assertArtifactHashContinuity,
  assertFullPageCoverage,
  assertReplaceableEvidenceOutput,
  assertSafeEvidenceOutputDir,
  buildCommercialDefects,
  captureStableFullPage,
  classifyRouteResult,
  inspectCommercialLadder,
  publishEvidenceAtomically,
  validateCommercialLadder,
} from "./deliverables_live_audit_contract.mjs";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixture = readFileSync(
  path.join(ROOT, "scripts/site/fixtures/deliverables-live/content-visibility-current-defects.html"),
  "utf8",
);

test("schema and tooling no longer expose the deferred #540 state", () => {
  assert.equal(DELIVERABLES_LIVE_AUDIT_SCHEMA, "confenge.deliverables-live-audit/2.0");
  for (const file of [
    "scripts/site/audit_deliverables_live.mjs",
    "scripts/site/deliverables_live_audit_contract.mjs",
    "scripts/site/fixtures/deliverables-live/content-visibility-current-defects.html",
  ]) {
    assert.ok(!readFileSync(path.join(ROOT, file), "utf8").includes("DEFERRED_BY_540"), file);
  }
});

test("evidence output accepts only dedicated evidence or temporary children", () => {
  const durable = path.join(ROOT, "docs/evidence/foundation-fixture");
  assert.equal(assertSafeEvidenceOutputDir({ repoRoot: ROOT, target: durable }), durable);
  assert.equal(
    assertSafeEvidenceOutputDir({ repoRoot: ROOT, target: "/tmp/confenge-deliverables-fixture" }),
    "/tmp/confenge-deliverables-fixture",
  );
  for (const unsafe of [ROOT, path.dirname(ROOT), path.join(ROOT, "docs/evidence"), "/", "/tmp"]) {
    assert.throws(
      () => assertSafeEvidenceOutputDir({ repoRoot: ROOT, target: unsafe }),
      /DELIVERABLES_EVIDENCE_OUTPUT_UNSAFE/,
    );
  }
});

test("exact-live artifact identity is stable or fails closed", () => {
  assert.equal(
    assertArtifactHashContinuity({ artifact_hash: "same" }, { artifact_hash: "same" }),
    "same",
  );
  assert.throws(
    () => assertArtifactHashContinuity({ artifact_hash: "before" }, { artifact_hash: "after" }),
    /DELIVERABLES_LIVE_ARTIFACT_CHANGED/,
  );
  assert.throws(
    () => assertArtifactHashContinuity({}, { artifact_hash: "after" }),
    /DELIVERABLES_LIVE_ARTIFACT_HASH_MISSING/,
  );
});

test("historical evidence cannot be silently mixed with the v2 capture schema", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "confenge-deliverables-historical-"));
  try {
    writeFileSync(
      path.join(parent, "report.json"),
      `${JSON.stringify({ schema: "confenge.deliverables-live-audit/1.0" })}\n`,
      "utf8",
    );
    writeFileSync(path.join(parent, "README.md"), "historical capture state\n", "utf8");
    assert.throws(
      () => assertReplaceableEvidenceOutput(parent),
      /DELIVERABLES_EVIDENCE_TARGET_NOT_TOOL_OWNED|DELIVERABLES_EVIDENCE_SCHEMA_MIGRATION_REFUSED/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("failed atomic publication restores the prior evidence", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "confenge-deliverables-publish-"));
  try {
    const finalOutputDir = path.join(parent, "evidence");
    const workingDir = path.join(parent, ".evidence.tmp-fixture");
    mkdirSync(finalOutputDir);
    mkdirSync(workingDir);
    writeFileSync(
      path.join(finalOutputDir, "report.json"),
      `${JSON.stringify({ schema: DELIVERABLES_LIVE_AUDIT_SCHEMA, marker: "prior" })}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(workingDir, "report.json"),
      `${JSON.stringify({ schema: DELIVERABLES_LIVE_AUDIT_SCHEMA, marker: "candidate" })}\n`,
      "utf8",
    );
    const injectedRename = (from, to) => {
      if (from === workingDir && to === finalOutputDir) throw new Error("injected publish failure");
      renameSync(from, to);
    };
    assert.throws(
      () => publishEvidenceAtomically({ repoRoot: ROOT, workingDir, finalOutputDir, rename: injectedRename }),
      /injected publish failure/,
    );
    assert.equal(JSON.parse(readFileSync(path.join(finalOutputDir, "report.json"), "utf8")).marker, "prior");
    assert.ok(existsSync(workingDir));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

const browserRequired = process.env.CAPTURE_BROWSER_REQUIRED === "1" || Boolean(process.env.CI);
let chromePath = null;
let chromeError = "";
try {
  chromePath = resolveChromePath();
  const probe = spawnSync(chromePath, ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    chromeError = String(probe.stderr || probe.stdout || `exit ${probe.status}`).trim().slice(0, 200);
    chromePath = null;
  }
} catch (error) {
  chromeError = String(error?.message || error).slice(0, 200);
}
test("Chrome is available when the deliverables capture fixture requires it", { skip: !browserRequired }, () => {
  assert.ok(chromePath, `DELIVERABLES_LIVE_BROWSER_UNAVAILABLE ${chromeError}`);
});
const skipBrowser = chromePath ? false : `DELIVERABLES_LIVE_BROWSER_UNAVAILABLE ${chromeError}`;

test("full-page evidence and honest #547 defects coexist", { skip: skipBrowser }, async () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), "confenge-deliverables-capture-"));
  const filePath = path.join(outputDir, "fixture-full-page.png");
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    const postRequests = [];
    page.on("request", (request) => {
      if (request.method() === "POST") postRequests.push(request.url());
    });
    await page.setViewport({ width: 400, height: 300, deviceScaleFactor: 1 });
    await page.setContent(fixture, { waitUntil: "networkidle0" });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const screenshot = page.screenshot.bind(page);
    let screenshotCalls = 0;
    page.screenshot = async (options) => {
      const result = await screenshot(options);
      screenshotCalls += 1;
      if (screenshotCalls === 1) {
        await page.evaluate(() => {
          const lateLayout = document.createElement("div");
          lateLayout.style.height = "149px";
          lateLayout.textContent = "late deterministic layout";
          document.body.append(lateLayout);
        });
      }
      return result;
    };
    const expected = {
      id: "CFG-D01",
      kind: "model",
      package: {
        units_sum_display: "R$ 10.500",
        package_price_display: "R$ 8.000",
        credit_window_days: 60,
      },
    };
    const ladder = await page.evaluate(inspectCommercialLadder, expected);
    const expectedErrors = validateCommercialLadder(ladder, expected);
    const fullPage = await captureStableFullPage({
      page,
      filePath,
      outputDir,
      route: "/fixture/",
      slug: "fixture",
      width: 400,
      height: 300,
      browserVersion: await browser.version(),
    });
    const route = {
      route: "/fixture/",
      result: classifyRouteResult(expectedErrors),
      full_page: fullPage,
    };
    assert.equal(route.result, "DEFECT");
    assert.ok(expectedErrors.includes("unit_01_false_credit_promise"));
    assert.ok(expectedErrors.includes("recurring_direction_step_missing"));
    const defects = buildCommercialDefects(
      [{ ...route, deliverable_id: "CFG-D01", errors: expectedErrors }],
    );
    assert.deepEqual(defects.map(({ owner_issue }) => owner_issue), [547, 547]);
    assert.deepEqual(
      defects.map(({ id }) => id),
      ["CFG530-D01-CREDIT-CONTRADICTION", "CFG530-RECURRING-DIRECTION-LADDER-MISSING"],
    );
    assert.deepEqual(postRequests, [], "read-only fixture must never submit a form");
    assert.equal(route.full_page.status, LIVE_FULL_PAGE_CAPTURE_STATUS);
    assert.equal(route.full_page.attempts, 2);
    assert.equal(route.full_page.discarded_unstable_attempts.length, 1);
    assert.match(
      route.full_page.discarded_unstable_attempts[0].error,
      /CAPTURE_LAYOUT_CHANGED_DURING_SCREENSHOT/,
    );
    assert.equal(route.full_page.capture.layout.materialized_elements, 4);
    assert.ok(route.full_page.capture.layout.scroll_height > 300);
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    assertFullPageCoverage([route]);
    assert.equal(classifyRouteResult([]), "PASS");
    await page.close();
  } finally {
    await browser.close();
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("missing full-page evidence fails closed independently of route verdict", () => {
  assert.throws(
    () => assertFullPageCoverage([{ route: "/fixture/", result: "DEFECT", full_page: null }]),
    /DELIVERABLES_FULL_PAGE_EVIDENCE_MISSING/,
  );
});
