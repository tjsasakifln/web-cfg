#!/usr/bin/env node
/**
 * Gate command for POS-INB-20260911 campaign 09.
 * Campaign 10 should wire this from package.json / site-ci.yml and keep
 * --report outside the examined tree (RUNNER_TEMP).
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoFromHere = path.resolve(here, "../../../..");
const runner = path.join(repoFromHere, "tests/campaigns/pos_inb_20260911/09/run.mjs");

const args = process.argv.slice(2);
if (!args.includes("--strict-release") && (args.includes("candidate") || args.includes("release"))) {
  args.unshift("--strict-release");
}

const child = spawn(process.execPath, [runner, ...args], { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
