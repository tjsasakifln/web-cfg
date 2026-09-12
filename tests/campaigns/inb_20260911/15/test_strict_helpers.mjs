#!/usr/bin/env node
/**
 * Direct tests of shipped strict-release helpers. These spawn the real
 * INB-15 runner for reject paths; they do not reimplement classify/parse.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  INB_SET,
  POS_SET,
  classifyDependencyLevel,
  evaluateIncludedTokens,
  HARD_AT_RELEASE,
  OPTIONAL_ENRICHMENT,
  EXTERNAL_EVIDENCE,
  overlayContentHash,
  parseManifestText,
  probeChrome,
  readManifestFile,
  resolveRoot,
  summarize,
  tokenLooksLikeRange,
} from "./lib/strict.mjs";
import { finish } from "./lib/harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../..");
const runner = path.join(here, "run.mjs");
const scratch = process.env.POS09_SCRATCH || path.join(os.tmpdir(), "pos09-strict-helpers");
fs.mkdirSync(scratch, { recursive: true });

function spawnRunner(args, extra = {}) {
  return spawnSync("node", [runner, ...args], {
    cwd: repo,
    encoding: "utf8",
    timeout: 20000,
    ...extra,
  });
}

test("01-15 is a range token, not an expansion", () => {
  assert.equal(tokenLooksLikeRange("01-15"), true);
  const parsed = evaluateIncludedTokens(["01-15"], { expectedSet: INB_SET });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "range_token_not_expanded");
});

test("comma list is accepted; POS set is not equivalent", () => {
  const ok = evaluateIncludedTokens(["01", "02", "03"], { expectedSet: INB_SET });
  assert.equal(ok.ok, true);
  const pos = parseManifestText(
    JSON.stringify({ campaign_set: POS_SET, campaigns: ["01", "02"] }),
    INB_SET,
  );
  assert.equal(pos.ok, false);
  assert.equal(pos.error, "wrong_campaign_set");
});

test("missing or unreadable manifesto fails", () => {
  const missing = parseManifestText("", INB_SET);
  assert.equal(missing.ok, false);
  const unreadable = parseManifestText("{", INB_SET);
  assert.equal(unreadable.ok, false);
  const noSet = parseManifestText(JSON.stringify({ campaigns: ["01"] }), INB_SET);
  assert.equal(noSet.ok, false);
  const absentFile = readManifestFile(path.join(scratch, "no-such-manifest.json"), INB_SET);
  assert.equal(absentFile.ok, false);
  assert.equal(absentFile.error, "missing_manifest");
});

test("candidate/release requires explicit real root; dirname is not enough", () => {
  const inferred = resolveRoot({
    rootArg: null,
    envRoot: null,
    inferred: repo,
    mode: "candidate",
    strictRelease: true,
  });
  assert.equal(inferred.ok, false);
  assert.equal(inferred.error, "missing_explicit_root");
  const wrong = resolveRoot({
    rootArg: scratch,
    envRoot: null,
    inferred: repo,
    mode: "release",
    strictRelease: true,
  });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.error, "root_not_repo");
  const ok = resolveRoot({
    rootArg: repo,
    envRoot: null,
    inferred: path.join(here, "../../../.."),
    mode: "candidate",
    strictRelease: true,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.inferred, false);
  const baseline = resolveRoot({
    rootArg: null,
    envRoot: null,
    inferred: repo,
    mode: "baseline",
    strictRelease: false,
  });
  assert.equal(baseline.ok, true);
  assert.equal(baseline.inferred, true);
});

test(".dedicated_route is not blanket optional; published stays HARD", () => {
  const dedicated = classifyDependencyLevel({
    id: "journey.arquiteto-complementares.dedicated_route",
    campaign: "12",
    path: "projetos-complementares-engenharia/index.html",
    url: "/projetos-complementares-engenharia/",
  }, { root: repo });
  assert.equal(dedicated, HARD_AT_RELEASE);
  const unknownLevel = classifyDependencyLevel({
    id: "anything",
    campaign: "99",
    dependency_level: "made_up",
  });
  assert.equal(unknownLevel, HARD_AT_RELEASE);
  const gsc = classifyDependencyLevel({ id: "gsc.live.external" });
  assert.equal(gsc, EXTERNAL_EVIDENCE);
  const unpublished = classifyDependencyLevel({
    id: "expansion.future",
    campaign: "13",
    optional_unpublished_expansion: true,
  });
  assert.equal(unpublished, OPTIONAL_ENRICHMENT);
});

test("overlay hash uses file contents, not git diff --stat", () => {
  const dir = fs.mkdtempSync(path.join(scratch, "overlay-"));
  spawnSync("git", ["init"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "a.txt"), "one\n");
  spawnSync("git", ["add", "a.txt"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=qa@example.com", "-c", "user.name=qa", "commit", "-m", "a"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "a.txt"), "alpha-content-aaaaaaaa\n");
  const hashA = overlayContentHash(dir);
  fs.writeFileSync(path.join(dir, "a.txt"), "beta-content-bbbbbbbb\n");
  const hashB = overlayContentHash(dir);
  assert.ok(hashA);
  assert.ok(hashB);
  assert.notEqual(hashA, hashB);
});

test("empty suite fails candidate; GSC NOT_VERIFIED is not PASS", () => {
  const empty = finish({ results: [], examined_kind: "candidate", environment: {} }, { strictRelease: true, mode: "candidate" });
  assert.equal(empty.summary.empty_suite, true);
  assert.equal(empty.summary.exit_code, 1);
  const gsc = finish(
    {
      results: [{ id: "gsc.live.external", status: "NOT_VERIFIED", dependency_level: EXTERNAL_EVIDENCE }],
      examined_kind: "candidate",
      environment: {},
    },
    { strictRelease: true, mode: "candidate" },
  );
  assert.equal(gsc.summary.pass, 0);
  assert.equal(gsc.summary.fail, 0);
  assert.equal(gsc.summary.NOT_VERIFIED, 1);
  assert.equal(gsc.summary.exit_code, 0);
});

test("chrome probe does not treat puppeteer import as availability", () => {
  const chrome = probeChrome();
  assert.equal(chrome.puppeteer_import, false);
  assert.equal(typeof chrome.available, "boolean");
});

test("legacy runner rejects POS manifesto, range token, and missing manifesto", () => {
  const posManifest = path.join(scratch, "pos-manifest.json");
  fs.writeFileSync(
    posManifest,
    JSON.stringify({ campaign_set: POS_SET, campaigns: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"] }),
  );
  const pos = spawnRunner([
    "--root",
    repo,
    "--strict-release",
    "--examined-kind",
    "candidate",
    "--manifest",
    posManifest,
  ]);
  assert.notEqual(pos.status, 0, pos.stderr || pos.stdout);

  const range = spawnRunner([
    "--root",
    repo,
    "--strict-release",
    "--examined-kind",
    "candidate",
    "--included",
    "01-15",
  ]);
  assert.notEqual(range.status, 0, range.stderr || range.stdout);
  assert.match(`${range.stdout}\n${range.stderr}`, /range|01-15|manifest|runner\.included/i);

  const missing = spawnRunner(["--root", repo, "--strict-release", "--examined-kind", "candidate"]);
  assert.notEqual(missing.status, 0);
  assert.match(`${missing.stdout}\n${missing.stderr}`, /manifest/i);

  const noRoot = spawnRunner(["--strict-release", "--examined-kind", "release", "--manifest", path.join(here, "fixtures/legacy-manifest.json")]);
  assert.notEqual(noRoot.status, 0);
});

test("summarize keeps process-equivalent exit_code", () => {
  const report = {
    results: [{ id: "x", status: "fail", campaign: "03" }],
    examined_kind: "candidate",
    environment: {},
  };
  const summary = summarize(report, { strictRelease: true, mode: "candidate" });
  assert.equal(summary.exit_code, 1);
  assert.equal(summary.fail, 1);
});
