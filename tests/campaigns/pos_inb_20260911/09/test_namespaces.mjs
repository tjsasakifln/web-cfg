#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../..");
const posRunner = path.join(here, "run.mjs");
const inbRunner = path.join(repo, "tests/campaigns/inb_20260911/15/run.mjs");
const posManifest = path.join(here, "fixtures/pos-manifest.json");
const inbManifest = path.join(repo, "tests/campaigns/inb_20260911/15/fixtures/legacy-manifest.json");
const scratch = process.env.POS09_SCRATCH || path.join(os.tmpdir(), "pos09-ns");
fs.mkdirSync(scratch, { recursive: true });

function spawnNode(script, args, extra = {}) {
  return spawnSync("node", [script, ...args], {
    cwd: repo,
    encoding: "utf8",
    timeout: 20000,
    ...extra,
  });
}

test("legacy runner rejects POS manifesto and 01-15 range", () => {
  const pos = spawnNode(inbRunner, [
    "--root",
    repo,
    "--strict-release",
    "--examined-kind",
    "candidate",
    "--manifest",
    posManifest,
  ]);
  assert.notEqual(pos.status, 0);
  const range = spawnNode(inbRunner, [
    "--root",
    repo,
    "--strict-release",
    "--examined-kind",
    "candidate",
    "--included",
    "01-15",
  ]);
  assert.notEqual(range.status, 0);
});

test("POS runner rejects INB manifesto and missing manifesto in candidate", () => {
  const inb = spawnNode(posRunner, [
    "--root",
    repo,
    "--strict-release",
    "--examined-kind",
    "candidate",
    "--manifest",
    inbManifest,
  ]);
  assert.notEqual(inb.status, 0);
  const missing = spawnNode(posRunner, ["--root", repo, "--strict-release", "--examined-kind", "candidate"]);
  assert.notEqual(missing.status, 0);
  assert.match(`${missing.stdout}\n${missing.stderr}`, /manifest/i);
});

test("POS candidate without --root fails closed", () => {
  const r = spawnNode(posRunner, [
    "--strict-release",
    "--examined-kind",
    "release",
    "--manifest",
    posManifest,
  ]);
  assert.notEqual(r.status, 0);
});
