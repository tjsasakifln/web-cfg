#!/usr/bin/env node
/**
 * Reusable CORE_QA_SUITE runner for INB-20260911 campaign 15.
 * Invoke directly (package.json is owned by campaign 16):
 *   node tests/campaigns/inb_20260911/15/run.mjs --root . --report /tmp/report.json --mutations --strict-release
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  CORE_IDS,
  EXPANSION_CAMPAIGNS,
  PURCHASE_PATHS,
} from "./matrix.mjs";
import { createReport, finish, overlayHash, subjectSha, writeJson } from "./lib/harness.mjs";
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
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root") out.root = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--mutations") out.mutations = true;
    else if (a === "--examined-kind") out.examinedKind = argv[++i];
    else if (a === "--strict-release") out.strictRelease = true;
    else if (a === "--included") out.included = String(argv[++i] || "").split(",").filter(Boolean);
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

function chromeAvailable(root) {
  const probe = spawnSync("node", ["-e", "try{require('puppeteer-core');process.exit(0)}catch{process.exit(1)}"], {
    cwd: root,
    encoding: "utf8",
  });
  return probe.status === 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.env.CONFENGE_CANDIDATE_ROOT || defaultRoot());
  const overlays = args.overlays || (overlayHash(root) ? [overlayHash(root)] : null);
  const report = createReport({
    root,
    examinedKind: args.examinedKind,
    overlays,
  });
  report.environment.chrome = chromeAvailable(root);
  report.matrix.journeys = PURCHASE_PATHS.map((p) => ({ id: p.id, core: p.core, routes: p.routes }));
  report.matrix.expansion = EXPANSION_CAMPAIGNS.map((c) => ({ id: c.id, title: c.title }));

  const manifest = args.included;
  // CORE 01–10 always run. An omitted CORE id on a supplied manifest is a finding.
  await runAllChecks(report, root, { includedCampaigns: manifest });

  if (args.mutations) {
    report.mutations = await runMutations(root);
    report.mutation_detection_ok = report.mutations.every((m) => m.detected && m.control === "pass");
  }

  finish(report, { strictRelease: args.strictRelease });
  report.test_suite_path = "tests/campaigns/inb_20260911/15/run.mjs";
  report.candidate_sha = subjectSha(root);
  if (args.report) writeJson(path.resolve(args.report), report);
  else console.log(JSON.stringify({ summary: report.summary, findings: report.findings.length }, null, 2));

  if (
    report.summary.exit_code !== 0 ||
    (args.mutations && report.mutation_detection_ok === false)
  ) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FAIL runner", err);
  process.exitCode = 1;
});
