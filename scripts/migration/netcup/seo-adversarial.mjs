#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { stableJson } from "./lib/contract.mjs";
import { createOriginClient } from "./lib/origin-client.mjs";
import { runSeoAdversarial } from "./lib/seo-adversarial.mjs";

const ROOT = resolve(new URL("../../..", import.meta.url).pathname);

function usage() {
  console.error(`Usage:
  node scripts/migration/netcup/seo-adversarial.mjs --candidate URL [options]

Options:
  --baseline URL             Baseline origin (default https://confenge.com.br)
  --candidate URL            Candidate URL (required)
  --candidate-host HOST      HTTP pre-DNS Host header
  --candidate-resolve IP     HTTPS curl --resolve, never --insecure
  --artifact-root DIR        Expected _site artifact
  --legacy URL               Probe legacy Netlify host canonicalization
  --www URL                  Probe edge-owned www canonicalization
  --report FILE              JSON report path
`);
}
function parseArgs(argv) {
  const parsed = {
    baseline: "https://confenge.com.br",
    candidate: null,
    candidateHost: null,
    candidateResolve: null,
    artifactRoot: resolve(ROOT, "_site"),
    legacy: null,
    www: null,
    report: resolve(ROOT, "build/netcup-seo-adversarial-report.json"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--baseline") parsed.baseline = argv[++index];
    else if (arg === "--candidate") parsed.candidate = argv[++index];
    else if (arg === "--candidate-host") parsed.candidateHost = argv[++index];
    else if (arg === "--candidate-resolve") parsed.candidateResolve = argv[++index];
    else if (arg === "--artifact-root") parsed.artifactRoot = resolve(argv[++index]);
    else if (arg === "--legacy") parsed.legacy = argv[++index];
    else if (arg === "--www") parsed.www = argv[++index];
    else if (arg === "--report") parsed.report = resolve(argv[++index]);
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!parsed.candidate) throw new Error("--candidate is required");
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
  const legacy = options.legacy ? createOriginClient({ label: "legacy", baseUrl: options.legacy }) : null;
  const www = options.www ? createOriginClient({ label: "www-edge", baseUrl: options.www }) : null;
  const report = await runSeoAdversarial({
    root: ROOT,
    baselineClient: baseline,
    candidateClient: candidate,
    legacyClient: legacy,
    wwwClient: www,
    artifactRoot: options.artifactRoot,
  });
  for (const item of report.checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.id}`);
  mkdirSync(dirname(options.report), { recursive: true });
  writeFileSync(options.report, stableJson(report), "utf8");
  console.log(JSON.stringify({ ok: report.ok, report: options.report, ...report.summary }, null, 2));
  if (!report.ok) process.exit(1);
} catch (error) {
  console.error(`SEO_ADVERSARIAL_FAILED: ${error.message}`);
  process.exit(2);
}
