/**
 * Drives the shipped runtime-authority compare gate.
 * Matching fixture must pass; divergent host/DNS/header fixtures must fail.
 * Does not talk to production, mutate DNS, deploy, or roll back.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AUTHORITY_PATH,
  CURRENT_OPERATOR_DOCS,
  ROOT,
  compareRuntimeAuthority,
  findForbiddenProductionInstructions,
  loadAuthorityFromRepo,
  loadFixture,
  observationFromAuthority,
  parseAuthorityMarkdown,
  parseSimpleYaml,
  runCompare,
  scanOperatorDocs,
} from "./runtime_authority.mjs";

const CLI = join(ROOT, "scripts/site/runtime_authority.mjs");

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env },
  });
}

test("parses the shipped authority yaml from RUNTIME-AUTHORITY.md", () => {
  const markdown = readFileSync(AUTHORITY_PATH, "utf8");
  const record = parseAuthorityMarkdown(markdown);
  assert.equal(record.authority_version, 2);
  assert.equal(record.public_canonical.plane, "production");
  assert.equal(record.public_canonical.host_kind, "nginx-netcup");
  assert.equal(record.public_canonical.expected_server_header, "nginx");
  assert.equal(record.public_canonical.host_architecture_version, "confenge-nginx-node/v2");
  assert.equal(record.public_canonical.expected_environment, "production");
  assert.deepEqual(record.public_canonical.dns.apex_a, ["159.195.18.88"]);
  assert.equal(record.public_canonical.dns.www_cname, "confenge.com.br");
  assert.equal(record.public_canonical.rollback, "/opt/confenge-web/bin/rollback FULL_SHA");
  assert.equal(record.public_canonical.storage.backend, "filesystem");
  assert.equal(record.public_canonical.storage.survives_release_rollback, true);
  assert.equal(record.stage.plane, "stage");
  assert.equal(record.legacy.plane, "legacy");
  assert.equal(record.legacy.public_canonical, false);
  assert.notEqual(record.public_canonical.host_kind, "netlify");
  assert.doesNotMatch(String(record.public_canonical.host), /^Netlify$/i);
});

test("yaml subset parser keeps nested maps and lists", () => {
  const doc = parseSimpleYaml(`
root:
  list:
    - one
    - two
  empty: []
  flag: true
  missing: null
`);
  assert.deepEqual(doc.root.list, ["one", "two"]);
  assert.deepEqual(doc.root.empty, []);
  assert.equal(doc.root.flag, true);
  assert.equal(doc.root.missing, null);
});

test("matching fixture passes through the shipped compare function", () => {
  const loaded = loadFixture("matching");
  const result = compareRuntimeAuthority(loaded);
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.equal(result.failures.length, 0);
});

test("divergent host fixture fails closed", () => {
  const loaded = loadFixture("divergent-host");
  const result = compareRuntimeAuthority(loaded);
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((item) => item.code === "server_header_mismatch"),
    JSON.stringify(result.failures),
  );
});

test("divergent dns fixture fails closed", () => {
  const loaded = loadFixture("divergent-dns");
  const result = compareRuntimeAuthority(loaded);
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((item) => item.code === "dns_apex_mismatch"),
    JSON.stringify(result.failures),
  );
});

test("divergent architecture header fixture fails closed", () => {
  const loaded = loadFixture("divergent-header");
  const result = compareRuntimeAuthority(loaded);
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((item) => item.code === "architecture_header_mismatch"),
    JSON.stringify(result.failures),
  );
});

test("CLI matching fixture exits 0", () => {
  const ran = runCli(["--fixture", "matching"]);
  assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
  const payload = JSON.parse(ran.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "fixture");
});

test("CLI divergent host/dns/header fixtures exit 1", () => {
  for (const name of ["divergent-host", "divergent-dns", "divergent-header"]) {
    const ran = runCli(["--fixture", name]);
    assert.equal(ran.status, 1, `${name}: ${ran.stdout}\n${ran.stderr}`);
    const payload = JSON.parse(ran.stdout);
    assert.equal(payload.ok, false, name);
    assert.ok(payload.failures.length > 0, name);
  }
});

test("runCompare matching path is the same function the CLI uses", async () => {
  const result = await runCompare(["--fixture", "matching"]);
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.equal(result.fixture, "matching");
});

test("operator docs no longer instruct Netlify as production", () => {
  const scan = scanOperatorDocs();
  assert.equal(scan.ok, true, JSON.stringify(scan.hits, null, 2));
  for (const rel of [
    "docs/ops/WARMBLY-INBOUND.md",
    "docs/ops/LEAD-STORE-FAIL-CLOSED-CHECKLIST.md",
    "docs/ops/GSC-INSIGHTS-SINGLE-SOURCE.md",
    "scripts/site/money_asset_prod_proof.mjs",
  ]) {
    assert.ok(CURRENT_OPERATOR_DOCS.includes(rel), `scan allowlist missing ${rel}`);
  }
  const authority = loadAuthorityFromRepo();
  const observed = observationFromAuthority(authority);
  assert.equal(observed.http.server, "nginx");
  assert.notEqual(observed.http.server.toLowerCase(), "netlify");
});

test("scan fails closed on Unset-in-Netlify and Netlify-production env steps", () => {
  const unsetHits = findForbiddenProductionInstructions(
    "1. Unset CONFENGE_INBOUND_WEBHOOK_URL and/or CONFENGE_INBOUND_WEBHOOK_SECRET in Netlify.",
  );
  assert.ok(
    unsetHits.some((hit) => hit.rule === "unset_in_netlify" || hit.detail.includes("in Netlify.")),
    JSON.stringify(unsetHits),
  );
  const setHits = findForbiddenProductionInstructions(
    "Set both on Netlify production (HTTPS inbound + shared HMAC).",
  );
  assert.ok(
    setHits.some((hit) => hit.rule === "set_on_netlify_production" || hit.detail.includes("on Netlify production")),
    JSON.stringify(setHits),
  );
  const blobsHits = findForbiddenProductionInstructions(
    "The only durable operational authority is Netlify Blobs record system/gsc-insights-latest-v1.",
  );
  assert.ok(
    blobsHits.some((hit) => String(hit.detail).includes("Netlify Blobs")),
    JSON.stringify(blobsHits),
  );
});

test("compare refuses a Netlify production host_kind on the record itself", () => {
  const authority = structuredClone(loadAuthorityFromRepo());
  authority.public_canonical.host_kind = "netlify";
  authority.public_canonical.host = "Netlify";
  const result = compareRuntimeAuthority({
    authority,
    observed: observationFromAuthority(loadAuthorityFromRepo()),
    expected: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", environment: "production" },
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((item) => item.code === "host_kind_mismatch"));
});

test("module path stays inside this repository", () => {
  assert.equal(resolve(dirname(fileURLToPath(import.meta.url)), "../.."), ROOT);
  assert.ok(AUTHORITY_PATH.startsWith(ROOT));
});
