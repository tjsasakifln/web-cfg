/**
 * Drives the shipped selector (affected_graph.mjs + test_affected.mjs).
 * Does not reimplement selection, does not start past the selector.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  CORPUS_SHAS,
  ROOT,
  SUITE_GRAPH,
  inventorySuites,
  loadPackageScripts,
  necessarySuites,
  omittedAgainstNecessary,
  promoteHitsForPath,
  selectAffected,
} from "./affected_graph.mjs";
import { pathsForCommit, replayCorpus } from "./test_affected.mjs";

const scripts = loadPackageScripts();
const inventory = inventorySuites(scripts);

function expectFull(result, because) {
  assert.equal(result.fallback, "full", because);
  assert.deepEqual(result.selected_ids, inventory, because);
  assert.equal(result.skipped.length, 0, because);
  assert.equal(result.risk.level, "full", because);
}

function expectSubset(result, mustInclude, because) {
  assert.equal(result.fallback, "none", because);
  assert.ok(result.selected_ids.length < inventory.length, `${because}: must be proper subset`);
  assert.ok(result.selected_ids.length > 0, `${because}: must not skip everything`);
  for (const id of mustInclude) {
    assert.ok(result.selected_ids.includes(id), `${because}: missing ${id}`);
  }
  for (const s of result.selected) {
    assert.ok(s.why && s.why.length, `${because}: ${s.id} missing why`);
  }
}

// --- inventory / graph integrity ---
{
  assert.ok(inventory.length >= 30, "npm test inventory unexpectedly small");
  assert.ok(inventory.includes("test:affected-selector"), "selector tests must be in npm test");
  assert.ok(!inventory.includes("test:affected"), "runner itself is not a merge suite");
  const missing = inventory.filter((id) => !SUITE_GRAPH[id]);
  assert.deepEqual(missing, [], `SUITE_GRAPH missing ${missing.join(", ")}`);
  assert.ok(SUITE_GRAPH["organic:test"], "organic:test must be in the map");
  assert.ok(SUITE_GRAPH["distribution:test"], "distribution:test must be in the map");
  assert.ok(!inventory.includes("organic:test"), "organic:test stays outside merge npm test");
  assert.ok(!inventory.includes("distribution:test"), "distribution:test stays outside merge npm test");
}

// --- (a) narrow path → proper subset ---
{
  const paths = ["scripts/site/indexnow_submit.mjs"];
  const result = selectAffected(paths, scripts);
  expectSubset(result, ["test:indexnow", "test:secrets-scan"], "narrow indexnow producer");
  assert.ok(!result.selected_ids.includes("pseo:test"), "narrow indexnow must not pull pseo:test");
  assert.ok(!result.selected_ids.includes("test:workflow-gates"), "narrow indexnow must not pull workflow-gates");
  const idx = result.selected.find((s) => s.id === "test:indexnow");
  assert.match(idx.why, /producer scripts\/site\/indexnow_submit\.mjs → consumer test:indexnow/);
  const again = selectAffected(paths, scripts);
  assert.deepEqual(again.selected_ids, result.selected_ids);
  assert.deepEqual(
    again.selected.map((s) => s.why),
    result.selected.map((s) => s.why),
  );
}

{
  const paths = ["scripts/research/pack.py"];
  const result = selectAffected(paths, scripts);
  expectSubset(result, ["test:research-pack"], "narrow research producer");
  assert.ok(result.selected_ids.length <= 3, `research should stay small, got ${result.selected_ids.join(",")}`);
}

{
  for (const input of [
    "scripts/demand_radar/engine.py",
    "data/demand_radar/ledger.v1.json",
    "docs/demand-radar/REPORT.md",
  ]) {
    const result = selectAffected([input], scripts);
    expectSubset(result, ["test:demand-radar"], `internal demand radar input ${input}`);
    assert.ok(!result.selected_ids.includes("test:inbound-gates"));
  }
}

// #545's internal buyer-decision authority selects on both source inputs and
// emitted reports. Its GSC projection remains separate from public mutation.
{
  for (const input of [
    "data/bofu-dominance/core/buyer-decision-map.v1.json",
    "docs/seo/bofu-dominance/core/BUYER-DECISION-MAP.md",
  ]) {
    const result = selectAffected([input], scripts);
    expectSubset(result, ["test:bofu-ownership"], `BOFU ownership input ${input}`);
  }
}

// #554's release-bound ledger selects on its persisted source of truth and
// rendered report, while retaining the normal fail-closed unknown fallback.
{
  for (const input of [
    "data/organic/experiments/integrated-commercial-release-2026-08-31/ledger.json",
    "docs/measurement/INTEGRATED-COMMERCIAL-RELEASE-2026-08-31.md",
  ]) {
    const result = selectAffected([input], scripts);
    expectSubset(result, ["test:commercial-release-ledger"], `commercial ledger input ${input}`);
    assert.ok(!result.selected_ids.includes("test:inbound-gates"));
  }
}

{
  const paths = ["docs/research/icp-trust-session-v1/PROTOCOL-TREE-TEST.md"];
  const result = selectAffected(paths, scripts);
  expectSubset(
    result,
    ["test:research-pack", "test:trust-session-protocol"],
    "human research protocol",
  );
}

{
  const paths = [".github/workflows/site-ci.yml"];
  const result = selectAffected(paths, scripts);
  expectSubset(result, ["test:workflow-gates", "test:site-excellence"], "workflow yaml");
}

{
  const paths = ["data/quality/site-excellence.v1.json"];
  const result = selectAffected(paths, scripts);
  expectSubset(result, ["test:site-excellence"], "site excellence contract");
}

{
  const paths = ["docs/ops/WARMBLY-INBOUND.md"];
  const result = selectAffected(paths, scripts);
  expectSubset(result, ["test:ops-docs"], "ops doc");
}

{
  const paths = ["data/revops/inbound-backlog-decision.v1.json"];
  const result = selectAffected(paths, scripts);
  expectSubset(result, ["test:schedules"], "inbound backlog decision");
}

{
  const paths = ["data/revops/inbound-proof-runs/inbound-issue-267-run-99999999999.json"];
  const result = selectAffected(paths, scripts);
  expectSubset(result, ["test:schedules"], "future inbound proof artifact");
}

// Foundation capture/audit tooling must select its own browser and contract gates.
{
  const capturePaths = [
    "scripts/site/capture_states.mjs",
    "scripts/site/capture_screenshots.mjs",
    "scripts/site/index_design_direction_capture.py",
    "scripts/site/test_design_direction.mjs",
    "docs/evidence/issue-540-fullpage-capture/report.json",
  ];
  for (const input of capturePaths) {
    const result = selectAffected([input], scripts);
    expectSubset(result, ["test:capture-states", "test:design-direction"], `capture producer ${input}`);
  }
  for (const input of [
    "scripts/site/audit_deliverables_live.mjs",
    "scripts/site/deliverables_live_audit_contract.mjs",
    "scripts/site/fixtures/deliverables-live/content-visibility-current-defects.html",
  ]) {
    const result = selectAffected([input], scripts);
    expectSubset(result, ["test:deliverables-live-audit"], `deliverables audit producer ${input}`);
  }
}

// script.js is read by the shipped pSEO attribution test — must not omit that suite
{
  const src = readFileSync(path.join(ROOT, "seo/scripts/test_pseo_attribution.mjs"), "utf8");
  assert.match(src, /readFileSync\(path\.join\(root,\s*"script\.js"\)/, "shipped pseo-attribution must still read script.js");
  const result = selectAffected(["script.js"], scripts);
  expectSubset(result, ["test:pseo-attribution", "test:analytics", "test:form-funnel", "test:script-modules"], "script.js consumers");
  assert.ok(result.selected_ids.includes("test:secrets-scan"), "script.js is a secrets-scan target");
}

// secrets-scan walks SCAN_DIRS; mapped paths in those trees must not skip it
{
  const src = readFileSync(path.join(ROOT, "scripts/site/test_secrets_scan.mjs"), "utf8");
  const block = src.match(/const SCAN_DIRS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(block, "shipped SCAN_DIRS missing");
  const scanDirs = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scanDirs.includes("scripts") && scanDirs.includes("netlify") && scanDirs.includes("script.js"));
  const producers = SUITE_GRAPH["test:secrets-scan"].producers;
  for (const d of scanDirs) {
    const asPrefix = d.includes(".") ? d : `${d.replace(/\/$/, "")}/`;
    assert.ok(
      producers.some((p) => p === d || p === asPrefix || p === `${d}/`),
      `test:secrets-scan producers must include SCAN_DIRS entry ${d}`,
    );
  }
  for (const sample of ["scripts/site/indexnow_submit.mjs", "netlify/functions/collect.cjs", "script.js", "index.html"]) {
    const result = selectAffected([sample], scripts);
    assert.ok(
      result.selected_ids.includes("test:secrets-scan"),
      `${sample} is inside SCAN_DIRS and must select test:secrets-scan`,
    );
    assert.ok(result.fallback !== "skip");
  }
}

// Every external input read by the local-entity campaign must select its gate.
{
  const inputs = [
    "index.html",
    "especialista/tiago-jun-sasaki/index.html",
    "data/site/brand.json",
    "data/site/proof.json",
    "data/organic/search-baseline-2026-08-14.json",
    "scripts/site/brand.py",
    "scripts/site/authority.py",
  ];
  for (const input of inputs) {
    const result = selectAffected([input], scripts);
    expectSubset(result, ["test:local-entity"], `local-entity input ${input}`);
    assert.ok(result.selected_ids.includes("test:local-entity"));
  }
  assert.ok(SUITE_GRAPH["test:local-entity"].surfaces.includes("/"));
}

// Every external SVG tree scanned by the path-data audit must select its gate.
{
  const svgInputs = [
    "assets/data-desk/valor-tipico-contratos-pavimentacao-sc/v1/chart.svg",
    "data/data-desk/fixture/chart.svg",
    "data/data-desk/packages/fixture-only/chart.svg",
    "data/data-desk/packages/valor-tipico-contratos-pavimentacao-sc/chart.svg",
  ];
  for (const input of svgInputs) {
    const result = selectAffected([input], scripts);
    expectSubset(result, ["test:cta-whatsapp"], `SVG path-data input ${input}`);
  }
}

// organic / distribution are mapped extra suites (not unknown → full)
{
  const result = selectAffected(["scripts/organic/demand_engine.py"], scripts);
  expectSubset(result, ["organic:test", "test:secrets-scan"], "organic producer");
  assert.deepEqual(result.unknown_paths, []);
  assert.ok(result.extra_graph_keys.includes("organic:test"));
}

{
  const result = selectAffected(["scripts/distribution/prepare.py"], scripts);
  expectSubset(result, ["distribution:test", "test:secrets-scan"], "distribution producer");
  assert.deepEqual(result.unknown_paths, []);
  assert.ok(result.extra_graph_keys.includes("distribution:test"));
}

// --- (b) shared-contract → full ---
{
  const paths = ["docs/contracts/public-read-margin-defense-v1.json"];
  const result = selectAffected(paths, scripts);
  expectFull(result, "shared-contract");
  assert.ok(result.promote.some((h) => h.id === "shared-contracts"));
  assert.match(result.selected[0].why, /promote-full: shared-contracts/);
  assert.deepEqual(promoteHitsForPath(paths[0]).map((h) => h.id), ["shared-contracts"]);
}

// --- (c) robots → full ---
{
  const paths = ["robots.txt"];
  const result = selectAffected(paths, scripts);
  expectFull(result, "robots.txt");
  assert.ok(result.promote.some((h) => h.id === "robots"));
  assert.match(result.fallback_reason, /robots/);
}

{
  const paths = ["scripts/pseo/build.py"];
  const result = selectAffected(paths, scripts);
  expectFull(result, "robots assembly input");
  assert.ok(result.promote.some((h) => h.id === "robots"));
}

// --- (d) lead-lib → full ---
{
  const paths = ["netlify/functions/lead.cjs"];
  const result = selectAffected(paths, scripts);
  expectFull(result, "lead.cjs");
  assert.ok(result.promote.some((h) => h.id === "lead-libs"));
}

{
  const paths = ["netlify/functions/lib/lead-core.cjs"];
  const result = selectAffected(paths, scripts);
  expectFull(result, "lead-core.cjs");
  assert.ok(result.promote.some((h) => h.id === "lead-libs"));
}

{
  const paths = ["netlify/functions/lib/inbound-handoff.cjs"];
  const result = selectAffected(paths, scripts);
  expectFull(result, "inbound-handoff.cjs lead module");
  assert.ok(result.promote.some((h) => h.id === "lead-libs"));
}

// --- (e) unknown → full, not skip ---
{
  const paths = ["totally/unmapped/new-capability.xyz"];
  const result = selectAffected(paths, scripts);
  expectFull(result, "unknown path");
  assert.deepEqual(result.unknown_paths, paths);
  assert.match(result.fallback_reason, /unknown path/);
  assert.equal(result.skipped.length, 0);
}

// mixed known + unknown → full (unknown wins; never skip)
{
  const paths = ["scripts/site/indexnow_submit.mjs", "brand-new/orphan.py"];
  const result = selectAffected(paths, scripts);
  expectFull(result, "mixed unknown");
  assert.ok(result.unknown_paths.includes("brand-new/orphan.py"));
}

// --- necessary ⊆ selected (oracle identity + extras allowed) ---
{
  const cases = [
    ["scripts/site/indexnow_submit.mjs"],
    ["docs/contracts/MONEY-ASSET-EVENTS.md"],
    ["robots.txt"],
    ["netlify/functions/lib/lead-store.cjs"],
    ["no/such/path.rs"],
    ["docs/ops/WARMBLY-INBOUND.md", "scripts/research/pack.py"],
  ];
  for (const paths of cases) {
    const selected = selectAffected(paths, scripts);
    const necessary = necessarySuites(paths, scripts);
    const omitted = omittedAgainstNecessary(selected.selected_ids, necessary.selected_ids);
    assert.deepEqual(omitted, [], `omitted necessary for ${paths.join(",")}`);
  }
}

// --- CLI entry: same input twice, same suites + why ---
{
  const args = [
    "scripts/site/test_affected.mjs",
    "--select-only",
    "--json",
    "--paths",
    "scripts/site/indexnow_submit.mjs",
  ];
  const run = () =>
    spawnSync(process.execPath, args, {
      cwd: ROOT,
      encoding: "utf8",
    });
  const a = run();
  const b = run();
  assert.equal(a.status, 0, a.stderr || a.stdout);
  assert.equal(b.status, 0, b.stderr || b.stdout);
  const ja = JSON.parse(a.stdout);
  const jb = JSON.parse(b.stdout);
  assert.deepEqual(ja.selected_ids, jb.selected_ids);
  assert.deepEqual(
    ja.selected.map((s) => s.why),
    jb.selected.map((s) => s.why),
  );
  assert.ok(ja.selected.length > 0);
  assert.ok(ja.selected.length < ja.inventory_count);
  assert.ok(ja.selected.every((s) => s.why));
  assert.equal(ja.mode, "select-only");
  assert.ok(ja.merge_gate.npm_test_required);
}

// --- corpus: real git path lists, omitted == [] ---
{
  const payload = replayCorpus(CORPUS_SHAS);
  assert.equal(payload.omitted_total, 0, `corpus false negatives: ${JSON.stringify(payload.rows.filter((r) => r.omitted.length))}`);
  assert.ok(payload.rows.length === CORPUS_SHAS.length);
  const subsetRows = payload.rows.filter((r) => r.risk === "subset");
  assert.ok(
    subsetRows.length >= 1,
    "corpus must contain at least one proper-subset commit (kill gate)",
  );
  for (const row of payload.rows) {
    const fromGit = pathsForCommit(row.sha);
    assert.deepEqual(fromGit, row.paths, `corpus paths must come from git for ${row.sha}`);
    assert.deepEqual(row.omitted, []);
    assert.ok(row.selected.length > 0, `empty selection for ${row.sha}`);
  }
}

console.log("AFFECTED_SELECTOR_OK");
console.log(`inventory=${inventory.length} corpus=${CORPUS_SHAS.length}`);
