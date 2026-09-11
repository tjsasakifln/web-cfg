#!/usr/bin/env node
/**
 * Reusable CORE_QA_SUITE runner for INB-20260911 campaign 15.
 * This runner belongs to the legacy set. POS-INB-20260911 is a different set;
 * a POS manifesto or a 01-15 range token is rejected, not expanded.
 *
 * Baseline (default without --strict-release):
 *   node tests/campaigns/inb_20260911/15/run.mjs --root . --examined-kind baseline --mutations
 *
 * Candidate/release (fail-closed):
 *   node tests/campaigns/inb_20260911/15/run.mjs --root <repo> --examined-kind candidate --strict-release --manifest <legacy.json> --report <outside>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_IDS, EXPANSION_CAMPAIGNS, PURCHASE_PATHS } from "./matrix.mjs";
import { createReport, finish, overlayHash, record, subjectSha, writeJson, FAIL, SEVERITY } from "./lib/harness.mjs";
import { runAllChecks } from "./checks.mjs";
import { runMutations } from "./mutations.mjs";
import {
  INB_SET,
  POS_SET,
  evaluateIncludedTokens,
  isCandidateMode,
  probeChrome,
  readManifestFile,
  resolveRoot,
  splitIncluded,
} from "./lib/strict.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    root: null,
    report: null,
    mutations: false,
    examinedKind: "baseline",
    included: [],
    overlays: null,
    strictRelease: false,
    manifest: null,
    campaignSet: INB_SET,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root") out.root = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--mutations") out.mutations = true;
    else if (a === "--examined-kind") out.examinedKind = argv[++i];
    else if (a === "--strict-release") out.strictRelease = true;
    else if (a === "--manifest") out.manifest = argv[++i];
    else if (a === "--campaign-set") out.campaignSet = argv[++i];
    else if (a === "--included") out.included = splitIncluded(argv[++i]);
    else if (a === "--overlay-hash") {
      out.overlays = out.overlays || [];
      out.overlays.push(argv[++i]);
    }
  }
  return out;
}

function defaultRoot() {
  return path.resolve(here, "../../../..");
}

function emit(report, args) {
  finish(report, { strictRelease: args.strictRelease, mode: args.examinedKind });
  report.test_suite_path = "tests/campaigns/inb_20260911/15/run.mjs";
  report.candidate_sha = report.candidate_sha || subjectSha(report.environment.cwd);
  report.campaign_set = INB_SET;
  if (args.report) writeJson(path.resolve(args.report), report);
  else console.log(JSON.stringify({ summary: report.summary, findings: report.findings.length }, null, 2));
  process.exitCode = report.summary.exit_code;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.strictRelease && args.examinedKind === "baseline") {
    args.examinedKind = "candidate";
  }
  const candidateLike = isCandidateMode(args.examinedKind, args.strictRelease);
  if ((args.examinedKind === "candidate" || args.examinedKind === "release") && !args.strictRelease) {
    const rootGuess = path.resolve(args.root || defaultRoot());
    const report = createReport({ root: rootGuess, examinedKind: args.examinedKind, overlays: null });
    record(report, {
      id: "runner.strict_release_required",
      campaign: "15",
      owner: "09",
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: "candidate/release requires --strict-release",
      observed: "examined-kind set without --strict-release; refusing silent baseline",
    });
    emit(report, { ...args, strictRelease: true });
    return;
  }

  const rootResolution = resolveRoot({
    rootArg: args.root,
    envRoot: process.env.CONFENGE_CANDIDATE_ROOT || null,
    inferred: defaultRoot(),
    mode: args.examinedKind,
    strictRelease: args.strictRelease,
  });
  if (!rootResolution.ok) {
    const fallback = path.resolve(args.root || defaultRoot());
    const report = createReport({ root: fallback, examinedKind: args.examinedKind, overlays: null });
    record(report, {
      id: "runner.root",
      campaign: "15",
      owner: "09",
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: "explicit real repository root for candidate/release",
      observed: rootResolution,
    });
    emit(report, args);
    return;
  }
  const root = rootResolution.root;

  if (args.campaignSet && args.campaignSet !== INB_SET) {
    const report = createReport({ root, examinedKind: args.examinedKind, overlays: null });
    record(report, {
      id: "runner.campaign_set",
      campaign: "15",
      owner: "09",
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: INB_SET,
      observed: args.campaignSet,
      impact: "POS list is not equivalent to the legacy INB runner",
    });
    emit(report, args);
    return;
  }

  const includedCheck = evaluateIncludedTokens(args.included, { expectedSet: INB_SET });
  if (!includedCheck.ok) {
    const report = createReport({ root, examinedKind: args.examinedKind, overlays: null });
    record(report, {
      id: "runner.included",
      campaign: "15",
      owner: "09",
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: "comma-separated campaign ids; 01-15 is not a range",
      observed: includedCheck,
      detail: includedCheck,
    });
    emit(report, args);
    return;
  }

  let manifestCampaigns = includedCheck.tokens;
  if (candidateLike) {
    if (!args.manifest) {
      const report = createReport({ root, examinedKind: args.examinedKind, overlays: overlayHash(root) ? [overlayHash(root)] : null });
      record(report, {
        id: "runner.manifest",
        campaign: "15",
        owner: "09",
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: `explicit ${INB_SET} manifesto for candidate/release`,
        observed: "missing --manifest; silence is not success",
      });
      emit(report, args);
      return;
    }
    const manifest = readManifestFile(path.resolve(args.manifest), INB_SET);
    if (!manifest.ok) {
      const report = createReport({ root, examinedKind: args.examinedKind, overlays: null });
      record(report, {
        id: "runner.manifest",
        campaign: "15",
        owner: "09",
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: `readable ${INB_SET} manifesto`,
        observed: manifest,
      });
      emit(report, args);
      return;
    }
    if (manifest.campaign_set === POS_SET) {
      const report = createReport({ root, examinedKind: args.examinedKind, overlays: null });
      record(report, {
        id: "runner.manifest.wrong_set",
        campaign: "15",
        owner: "09",
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: INB_SET,
        observed: POS_SET,
      });
      emit(report, args);
      return;
    }
    manifestCampaigns = manifest.campaigns.length ? manifest.campaigns : CORE_IDS;
  } else if (args.manifest) {
    const manifest = readManifestFile(path.resolve(args.manifest), INB_SET);
    if (manifest.ok) manifestCampaigns = manifest.campaigns.length ? manifest.campaigns : manifestCampaigns;
  }

  const overlays = args.overlays || (overlayHash(root) ? [overlayHash(root)] : null);
  const report = createReport({
    root,
    examinedKind: args.examinedKind,
    overlays,
  });
  report.environment.chrome = probeChrome();
  report.matrix.journeys = PURCHASE_PATHS.map((p) => ({ id: p.id, core: p.core, routes: p.routes }));
  report.matrix.expansion = EXPANSION_CAMPAIGNS.map((c) => ({ id: c.id, title: c.title }));
  report.campaign_set = INB_SET;

  await runAllChecks(report, root, { includedCampaigns: manifestCampaigns, mode: args.examinedKind });

  if (args.mutations) {
    report.mutations = await runMutations(root);
    report.mutation_detection_ok = report.mutations.every((m) => m.detected && m.control === "pass");
  }

  emit(report, args);
}

main().catch((err) => {
  console.error("FAIL runner", err);
  process.exitCode = 1;
});
