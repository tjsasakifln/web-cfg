#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { CANONICAL_HOST, stableJson } from "./lib/contract.mjs";
import { createOriginClient } from "./lib/origin-client.mjs";
import { runParityHarness } from "./lib/parity.mjs";

const ROOT = resolve(new URL("../../..", import.meta.url).pathname);

function usage() {
  console.error(`Usage:
  node scripts/migration/netcup/parity.mjs --candidate URL [options]

Options:
  --baseline URL             Baseline origin (default https://confenge.com.br)
  --candidate URL            Candidate origin/base URL (required)
  --candidate-host HOST      Send Host header (HTTP pre-DNS mode)
  --candidate-resolve IP     curl --resolve for HTTPS; certificate validation remains enabled
  --dynamic PATH             Additional runtime/API path; repeatable
  --report FILE              JSON report (default build/netcup-parity-report.json)
  --allow-unclassified       Do not fail on headers outside the explicit material/exclusion lists
`);
}
function parseArgs(argv) {
  const parsed = {
    baseline: "https://confenge.com.br",
    candidate: null,
    candidateHost: null,
    candidateResolve: null,
    dynamic: [],
    report: resolve(ROOT, "build/netcup-parity-report.json"),
    strictHeaderInventory: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--baseline") parsed.baseline = argv[++index];
    else if (arg === "--candidate") parsed.candidate = argv[++index];
    else if (arg === "--candidate-host") parsed.candidateHost = argv[++index];
    else if (arg === "--candidate-resolve") parsed.candidateResolve = argv[++index];
    else if (arg === "--dynamic") parsed.dynamic.push(argv[++index]);
    else if (arg === "--report") parsed.report = resolve(argv[++index]);
    else if (arg === "--allow-unclassified") parsed.strictHeaderInventory = false;
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!parsed.candidate) throw new Error("--candidate is required");
  if (parsed.candidateResolve && parsed.candidateHost && parsed.candidateHost !== CANONICAL_HOST) {
    throw new Error(`HTTPS --resolve must retain canonical host ${CANONICAL_HOST}`);
  }
  return parsed;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const baseline = createOriginClient({ label: "baseline", baseUrl: options.baseline });
  const candidate = createOriginClient({
    label: "candidate",
    baseUrl: options.candidate,
    hostHeader: options.candidateHost,
    resolveIp: options.candidateResolve,
  });
  const report = await runParityHarness({
    root: ROOT,
    baselineClient: baseline,
    candidateClient: candidate,
    dynamicPaths: options.dynamic,
    strictHeaderInventory: options.strictHeaderInventory,
    onProgress: ({ index, total, id, ok }) => console.log(`${ok ? "PASS" : "FAIL"} ${index}/${total} ${id}`),
  });
  mkdirSync(dirname(options.report), { recursive: true });
  writeFileSync(options.report, stableJson(report), "utf8");
  console.log(JSON.stringify({ ok: report.ok, report: options.report, ...report.summary }, null, 2));
  if (!report.ok) process.exit(1);
} catch (error) {
  console.error(`PARITY_HARNESS_FAILED: ${error.message}`);
  process.exit(2);
}
