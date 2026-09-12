#!/usr/bin/env node
/**
 * POS-INB-10 required wrapper around the INB-15 suite.
 * Always passes --strict-release. Requires a real manifesto JSON with campaign_set.
 * A comma-split "01-15" token is not a manifesto and exits 1.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { finish } from "../../inb_20260911/15/lib/harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultSuite = path.resolve(here, "../../inb_20260911/15/run.mjs");

function parseArgs(argv) {
  const out = {
    root: null,
    report: null,
    manifest: null,
    examinedKind: "candidate",
    mutations: false,
    suite: defaultSuite,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root") out.root = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--manifest") out.manifest = argv[++i];
    else if (a === "--examined-kind") out.examinedKind = argv[++i];
    else if (a === "--mutations") out.mutations = true;
    else if (a === "--suite") out.suite = argv[++i];
  }
  return out;
}

function fail(code, detail) {
  console.error(JSON.stringify({ ok: false, error: code, detail }, null, 2));
  process.exit(1);
}

function loadManifest(filePath) {
  if (!filePath) fail("missing_manifest", "pass --manifest to a JSON file");
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) fail("missing_manifest", abs);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    fail("unreadable_manifest", String(err && err.message));
  }
  if (!data || typeof data !== "object") fail("unreadable_manifest", "not an object");
  const campaignSet = data.campaign_set;
  if (!campaignSet) fail("manifest_missing_campaign_set", abs);
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns.map(String) : [];
  if (!campaigns.length) fail("empty_manifest", abs);
  const range = campaigns.filter((id) => /^\d{2}-\d{2}$/.test(id));
  if (range.length) {
    fail("range_token_not_expanded", `${range.join(",")} is not a campaign list`);
  }
  return { campaignSet, campaigns, path: abs };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.root) fail("missing_explicit_root", "candidate mode requires --root");
  const root = path.resolve(args.root);
  if (!fs.existsSync(path.join(root, "AGENTS.md")) || !fs.existsSync(path.join(root, "package.json"))) {
    fail("root_not_repo", root);
  }
  const manifest = loadManifest(args.manifest);
  const suite = path.resolve(args.suite);
  const childArgs = [
    suite,
    "--root",
    root,
    "--examined-kind",
    args.examinedKind,
    "--included",
    manifest.campaigns.join(","),
    "--strict-release",
  ];
  if (args.mutations) childArgs.push("--mutations");
  if (args.report) childArgs.push("--report", path.resolve(args.report));

  const child = spawnSync(process.execPath, childArgs, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);

  if (child.status === 0) {
    const emptyGuard = finish({ results: [] }, { strictRelease: true });
    if (emptyGuard.summary.exit_code !== 1) {
      fail("empty_execution_not_rejected", "strict finish() must exit 1 on empty results");
    }
  }
  process.exit(child.status === null ? 1 : child.status);
}

main();
