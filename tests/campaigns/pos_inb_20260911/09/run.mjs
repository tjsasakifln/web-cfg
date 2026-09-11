#!/usr/bin/env node
/**
 * POS-INB-20260911 campaign 09 independent acceptance runner.
 * Distinct from INB-20260911. Same numeric IDs are not the same mission.
 *
 * Baseline:
 *   node tests/campaigns/pos_inb_20260911/09/run.mjs --examined-kind baseline --root <repo>
 *
 * Candidate/release (gate):
 *   node tests/campaigns/pos_inb_20260911/09/run.mjs --strict-release --examined-kind candidate --manifest <pos.json> --root <repo> --report <outside>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createReport,
  finish,
  overlayHash,
  record,
  subjectSha,
  writeJson,
  FAIL,
  SEVERITY,
} from "../../inb_20260911/15/lib/harness.mjs";
import {
  INB_SET,
  POS_SET,
  POS_REQUIREMENTS,
  evaluateIncludedTokens,
  isCandidateMode,
  probeChrome,
  readManifestFile,
  resolveRoot,
  splitIncluded,
} from "../../inb_20260911/15/lib/strict.mjs";
import { CAMPAIGN_ID, CAMPAIGN_SET, REQUIREMENTS } from "./matrix.mjs";
import { runAllChecks } from "./checks.mjs";
import { runMutations } from "./mutations.mjs";

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
    campaignSet: POS_SET,
    httpPort: Number(process.env.POS09_HTTP_PORT || 18091),
    visual: null,
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
    else if (a === "--http-port") out.httpPort = Number(argv[++i]);
    else if (a === "--visual-report") out.visual = argv[++i];
  }
  return out;
}

function defaultRoot() {
  return path.resolve(here, "../../../..");
}

function emit(report, args) {
  finish(report, { strictRelease: args.strictRelease, mode: args.examinedKind });
  report.test_suite_path = "tests/campaigns/pos_inb_20260911/09/run.mjs";
  report.campaign_set = CAMPAIGN_SET;
  report.campaign_id = CAMPAIGN_ID;
  report.candidate_sha = report.candidate_sha || subjectSha(report.environment.cwd);
  if (args.report) writeJson(path.resolve(args.report), report);
  else console.log(JSON.stringify({ summary: report.summary, findings: report.findings.map((f) => f.name) }, null, 2));
  process.exitCode = report.summary.exit_code;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.strictRelease && args.examinedKind === "baseline") args.examinedKind = "candidate";
  const candidateLike = isCandidateMode(args.examinedKind, args.strictRelease);

  if ((args.examinedKind === "candidate" || args.examinedKind === "release") && !args.strictRelease) {
    const report = createReport({ root: path.resolve(args.root || defaultRoot()), examinedKind: args.examinedKind, overlays: null });
    record(report, {
      id: "runner.strict_release_required",
      campaign: "09",
      owner: "09",
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: "candidate/release requires --strict-release",
      observed: "refusing silent baseline",
    });
    emit(report, { ...args, strictRelease: true });
    return;
  }

  if (args.campaignSet && args.campaignSet !== POS_SET) {
    const report = createReport({ root: path.resolve(args.root || defaultRoot()), examinedKind: args.examinedKind, overlays: null });
    record(report, {
      id: "runner.campaign_set",
      campaign: "09",
      owner: "09",
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: POS_SET,
      observed: args.campaignSet,
      impact: "INB-20260911 is not this cycle",
    });
    emit(report, args);
    return;
  }

  const includedCheck = evaluateIncludedTokens(args.included, { expectedSet: POS_SET });
  if (!includedCheck.ok) {
    const report = createReport({ root: path.resolve(args.root || defaultRoot()), examinedKind: args.examinedKind, overlays: null });
    record(report, {
      id: "runner.included",
      campaign: "09",
      owner: "09",
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: "comma-separated POS ids; 01-10 is not a range expansion",
      observed: includedCheck,
    });
    emit(report, args);
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
    const report = createReport({
      root: path.resolve(args.root || defaultRoot()),
      examinedKind: args.examinedKind,
      overlays: null,
    });
    record(report, {
      id: "runner.root",
      campaign: "09",
      owner: "09",
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: "explicit real repository root",
      observed: rootResolution,
    });
    emit(report, args);
    return;
  }
  const root = rootResolution.root;

  if (candidateLike) {
    if (!args.manifest) {
      const report = createReport({ root, examinedKind: args.examinedKind, overlays: null });
      record(report, {
        id: "runner.manifest",
        campaign: "09",
        owner: "09",
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: `explicit ${POS_SET} manifesto`,
        observed: "missing --manifest",
      });
      emit(report, args);
      return;
    }
    const manifest = readManifestFile(path.resolve(args.manifest), POS_SET);
    if (!manifest.ok) {
      const report = createReport({ root, examinedKind: args.examinedKind, overlays: null });
      record(report, {
        id: "runner.manifest",
        campaign: "09",
        owner: "09",
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: `readable ${POS_SET} manifesto covering ${POS_REQUIREMENTS.join(",")}`,
        observed: manifest,
      });
      emit(report, args);
      return;
    }
    if (manifest.campaign_set === INB_SET) {
      const report = createReport({ root, examinedKind: args.examinedKind, overlays: null });
      record(report, {
        id: "runner.manifest.wrong_set",
        campaign: "09",
        owner: "09",
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: POS_SET,
        observed: INB_SET,
      });
      emit(report, args);
      return;
    }
    const reqs = manifest.requirements.length ? manifest.requirements : REQUIREMENTS;
    if (!REQUIREMENTS.every((q) => reqs.includes(q))) {
      const report = createReport({ root, examinedKind: args.examinedKind, overlays: null });
      record(report, {
        id: "runner.manifest.requirements",
        campaign: "09",
        owner: "09",
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: REQUIREMENTS,
        observed: reqs,
      });
      emit(report, args);
      return;
    }
  }

  const overlays = overlayHash(root) ? [overlayHash(root)] : null;
  const report = createReport({ root, examinedKind: args.examinedKind, overlays });
  report.schema = "confenge.pos-inb-20260911-09/1.0";
  report.campaign_set = CAMPAIGN_SET;
  report.campaign_id = CAMPAIGN_ID;
  report.environment.chrome = probeChrome();

  let visual = null;
  if (args.visual && fs.existsSync(args.visual)) {
    visual = JSON.parse(fs.readFileSync(args.visual, "utf8"));
  }

  await runAllChecks(report, root, { httpPort: args.httpPort, visual, mode: args.examinedKind });

  if (args.mutations) {
    report.mutations = await runMutations(root, { gateArgs: args });
    report.mutation_detection_ok = report.mutations.every((m) => m.detected);
  }

  emit(report, args);
}

main().catch((err) => {
  console.error("FAIL pos-09 runner", err);
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || defaultRoot());
  const report = createReport({ root, examinedKind: args.examinedKind || "candidate", overlays: null });
  report.fatal = true;
  record(report, {
    id: "runner.crash",
    campaign: "09",
    owner: "09",
    status: FAIL,
    severity: SEVERITY.JOURNEY,
    expected: "runner completes",
    observed: String(err && err.stack ? err.stack : err),
  });
  emit(report, { ...args, strictRelease: true });
});
