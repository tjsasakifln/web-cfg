/**
 * Drives the shipped runtime-authority compare gate and its repository-derived
 * production-instruction scanner.
 *
 * Matching fixture must pass; divergent host/DNS/header fixtures must fail. The
 * scanner tests pin the defect this gate exists for: before #450 the scan read a
 * hand-maintained list of 23 files, so every executable Netlify production step
 * living anywhere else was invisible. These tests assert the inventory is
 * derived from the repository and that the exception register cannot be used to
 * hide a live runbook.
 *
 * Does not talk to production, mutate DNS, deploy, or roll back.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AUTHORITY_PATH,
  ROOT,
  SCAN_POLICY_PATH,
  compareRuntimeAuthority,
  enumerateScannedFiles,
  findForbiddenProductionInstructions,
  loadAuthorityFromRepo,
  loadFixture,
  loadScanPolicy,
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
  assert.equal(record.public_canonical.expected_server_header, "cloudflare");
  assert.equal(record.public_canonical.host_architecture_version, "confenge-nginx-node/v2");
  assert.equal(record.public_canonical.expected_environment, "production");
  assert.equal(record.public_canonical.dns.proxy, "cloudflare");
  assert.deepEqual(record.public_canonical.dns.origin_apex_a, ["159.195.18.88"]);
  assert.equal(record.public_canonical.dns.apex_a, undefined);
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

for (const [name, code] of [
  ["divergent-host", "server_header_mismatch"],
  ["divergent-dns", "dns_apex_mismatch"],
  ["divergent-www-dns", "dns_www_mismatch"],
  ["divergent-header", "architecture_header_mismatch"],
]) {
  test(`${name} fixture fails closed with ${code}`, () => {
    const result = compareRuntimeAuthority(loadFixture(name));
    assert.equal(result.ok, false);
    assert.ok(
      result.failures.some((item) => item.code === code),
      JSON.stringify(result.failures),
    );
  });
}

test("CLI matching fixture exits 0", () => {
  const ran = runCli(["--fixture", "matching"]);
  assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
  const payload = JSON.parse(ran.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "fixture");
});

test("CLI divergent host/dns/header fixtures exit 1", () => {
  for (const name of ["divergent-host", "divergent-dns", "divergent-www-dns", "divergent-header"]) {
    const ran = runCli(["--fixture", name]);
    assert.equal(ran.status, 1, `${name}: ${ran.stdout}\n${ran.stderr}`);
    const payload = JSON.parse(ran.stdout);
    assert.equal(payload.ok, false, name);
    assert.ok(payload.failures.length > 0, name);
  }
});

test("Cloudflare anycast A changes are accepted without weakening origin protection", () => {
  const loaded = loadFixture("matching");
  loaded.observed.dns.apex_a = ["104.18.20.10", "172.64.155.246"];
  loaded.observed.dns.www_a = ["104.18.21.10"];
  const result = compareRuntimeAuthority(loaded);
  assert.equal(result.ok, true, JSON.stringify(result.failures));
});

test("Cloudflare proxy fails closed when either public name exposes the origin", () => {
  const authority = loadAuthorityFromRepo();
  for (const field of ["apex_a", "www_a"]) {
    const observed = observationFromAuthority(authority);
    observed.dns[field] = [...authority.public_canonical.dns.origin_apex_a];
    const result = compareRuntimeAuthority({
      authority,
      observed,
      expected: { sha: observed.http.commit, environment: "production" },
    });
    assert.equal(result.ok, false, field);
    assert.ok(
      result.failures.some((item) => item.code === (field === "apex_a" ? "dns_apex_mismatch" : "dns_www_mismatch")),
      JSON.stringify(result.failures),
    );
  }
});

test("nameserver authority remains an exact set under the proxy", () => {
  const loaded = loadFixture("matching");
  loaded.observed.dns.nameservers = ["ns1.example.invalid"];
  const result = compareRuntimeAuthority(loaded);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((item) => item.code === "dns_nameserver_mismatch"));
});

test("origin header, build, and runtime identity checks remain fail closed", () => {
  for (const [path, value, code] of [
    ["architecture_header", "unexpected-origin/v1", "architecture_header_mismatch"],
    ["commit", "b".repeat(40), "build_sha_mismatch"],
    ["profile", "unexpected-profile", "profile_mismatch"],
  ]) {
    const loaded = loadFixture("matching");
    loaded.observed.http[path] = value;
    const result = compareRuntimeAuthority(loaded);
    assert.equal(result.ok, false, path);
    assert.ok(result.failures.some((item) => item.code === code), JSON.stringify(result.failures));
  }
});

test("non-proxied authority records retain exact A and CNAME comparison", () => {
  const authority = structuredClone(loadAuthorityFromRepo());
  const dns = authority.public_canonical.dns;
  delete dns.proxy;
  dns.apex_a = [...dns.origin_apex_a];
  delete dns.origin_apex_a;
  const observed = observationFromAuthority(authority);
  const matching = compareRuntimeAuthority({
    authority,
    observed,
    expected: { sha: observed.http.commit, environment: "production" },
  });
  assert.equal(matching.ok, true, JSON.stringify(matching.failures));

  observed.dns.apex_a = ["203.0.113.9"];
  const divergent = compareRuntimeAuthority({
    authority,
    observed,
    expected: { sha: observed.http.commit, environment: "production" },
  });
  assert.ok(divergent.failures.some((item) => item.code === "dns_apex_mismatch"));
});

test("runCompare matching path is the same function the CLI uses", async () => {
  const result = await runCompare(["--fixture", "matching"]);
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.equal(result.fixture, "matching");
});

test("compare refuses a Netlify production host_kind on the record itself", () => {
  const authority = structuredClone(loadAuthorityFromRepo());
  authority.public_canonical.host_kind = "netlify";
  authority.public_canonical.host = "Netlify";
  const result = compareRuntimeAuthority({
    authority,
    observed: observationFromAuthority(loadAuthorityFromRepo()),
    expected: { sha: "a".repeat(40), environment: "production" },
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((item) => item.code === "host_kind_mismatch"));
});

test("the whole repository is green: no unexcused production instruction survives", () => {
  const scan = scanOperatorDocs();
  assert.equal(scan.ok, true, JSON.stringify(scan.hits, null, 2));
  assert.equal(scan.violations.length, 0);
  assert.equal(scan.register_failures.length, 0);
});

test("the scan inventory is derived from the repository, not from a curated list", () => {
  const files = enumerateScannedFiles().map((file) => file.path);
  const candidates = enumerateScannedFiles({ prefilter: false }).map((file) => file.path);
  // The pre-#450 gate looked at 23 hand-listed files. Anything materially
  // smaller than that means the derivation collapsed back into an allowlist.
  assert.ok(files.length > 100, `only ${files.length} files reached the scanner`);
  assert.ok(candidates.length > files.length, "the prefilter must narrow a wider candidate set");
  // Surfaces that carried real Netlify production steps and were never on the
  // old list. Each one must now be inside the derived inventory.
  for (const rel of [
    "seo/PLAYBOOK.md",
    "seo/REDIRECTS.md",
    "supabase/docs/SCHEMA.md",
    "docs/pseo/DATA-CONTRACT.md",
    "docs/architecture/system-architecture.md",
    "docs/stories/story-public-report-model-599.md",
    "scripts/editorial/release_approved.py",
    "scripts/legacy_equity/build_inventory.py",
    "data/migrations/smartlic-url-map/inventory.v2.json",
  ]) {
    assert.ok(candidates.includes(rel), `derived inventory is missing ${rel}`);
  }
});

test("the instructions that used to hide outside the allowlist are now rejected", () => {
  const cases = [
    "1. Publicar pasta na Netlify (ou conectar repo `web-cfg`).",
    "3. Deploy functions via Netlify",
    "5. Deploy Netlify só do estático — zero DSN.",
    "  - production publish (Netlify on main)",
    '    "Restore previous CONFENGE Netlify publish SHA and this manifesto version. "',
    "| Netlify Blobs | R/W | Leads, analytics, nurture | Production path |",
    "- O deploy canônico ocorre de `main` para Netlify por `npm run build:site`.",
    "1. Netlify → Deploys → previous green production deploy → Publish deploy.",
    "WHERE_TO_SET:\nNetlify production environment for confenge.com.br",
    "host: Netlify",
    "PROD_TRAFFIC_UNCHANGED",
  ];
  for (const text of cases) {
    const hits = findForbiddenProductionInstructions(text, "<case>");
    assert.ok(hits.length > 0, `not detected: ${text}`);
  }
});

test("a prohibition that names Netlify is not itself an instruction", () => {
  const allowed = [
    "Não publicar este diretório na Netlify como produção.",
    "Do not instruct Netlify UI publish, Netlify env, or Netlify rollback as the production path.",
    "Não republicar deploy Netlify.",
    "nem republicar um\ndeploy Netlify para restaurar `confenge.com.br`.",
    'assert "PROD_TRAFFIC_UNCHANGED" not in text',
    "The form posts to /.netlify/functions/lead, served by the portable runtime.",
    "legacy plane: Netlify leftover preview hostname confenge.netlify.app",
  ];
  for (const text of allowed) {
    const hits = findForbiddenProductionInstructions(text, "<case>");
    assert.equal(hits.length, 0, `false positive on ${JSON.stringify(text)}: ${JSON.stringify(hits)}`);
  }
});

test("a negation elsewhere on the line cannot excuse a real instruction", () => {
  const text =
    "Do not reactivate SmartLic as a product; set CONFENGE_INBOUND_WEBHOOK_URL on Netlify production.";
  const hits = findForbiddenProductionInstructions(text, "<case>");
  assert.ok(hits.length > 0, JSON.stringify(hits));
});

test("every exception is justified, typed and — when historical — content pinned", () => {
  const policy = loadScanPolicy();
  assert.ok(policy.exceptions.length > 0);
  const kinds = new Set(Object.keys(policy.exception_kinds));
  const seen = new Set();
  for (const item of policy.exceptions) {
    assert.ok(item.path, "exception without a path");
    assert.ok(!seen.has(item.path), `duplicated exception for ${item.path}`);
    seen.add(item.path);
    assert.ok(kinds.has(item.kind), `${item.path}: undeclared kind ${item.kind}`);
    assert.ok(item.owner, `${item.path}: exception without an owner`);
    assert.ok(String(item.reason || "").length > 30, `${item.path}: exception without a real reason`);
    if (item.kind === "historical_record") {
      assert.match(String(item.sha256), /^[0-9a-f]{64}$/, `${item.path}: historical exception is unpinned`);
      const actual = createHash("sha256").update(readFileSync(join(ROOT, item.path))).digest("hex");
      assert.equal(actual, item.sha256, `${item.path}: pinned hash does not match the file`);
    }
  }
  // Self-references are the only unpinned kind and must stay a closed set.
  const selfRefs = policy.exceptions.filter((item) => item.kind === "detector_self_reference");
  assert.deepEqual(
    selfRefs.map((item) => item.path).sort(),
    [
      "data/ops/runtime-authority-scan.json",
      "scripts/site/runtime_authority.mjs",
      "scripts/site/test_runtime_authority.mjs",
    ],
    "only the gate's own three files may be excused without a content pin",
  );
});

test("editing a pinned historical record re-arms the gate on that file", () => {
  const policy = structuredClone(loadScanPolicy());
  const target = policy.exceptions.find((item) => item.kind === "historical_record");
  assert.ok(target, "expected at least one historical_record exception");
  target.sha256 = "0".repeat(64);
  const scan = scanOperatorDocs({ policy });
  assert.equal(scan.ok, false);
  assert.ok(
    scan.register_failures.some(
      (item) => item.file === target.path && item.rule === "historical_exception_content_changed",
    ),
    JSON.stringify(scan.register_failures),
  );
});

test("an exception that no longer earns its keep fails the register audit", () => {
  const policy = structuredClone(loadScanPolicy());
  policy.exceptions.push({
    path: "docs/architecture/RUNTIME-AUTHORITY.md",
    kind: "historical_record",
    reason: "a plausible sounding reason that is long enough to pass the shape check",
    owner: "tjsasakifln",
    sha256: createHash("sha256").update(readFileSync(AUTHORITY_PATH)).digest("hex"),
  });
  const scan = scanOperatorDocs({ policy });
  assert.equal(scan.ok, false);
  assert.ok(
    scan.register_failures.some((item) => item.rule === "exception_no_longer_needed"),
    JSON.stringify(scan.register_failures),
  );
});

test("an unpinned or unjustified exception fails the register audit", () => {
  const unpinned = structuredClone(loadScanPolicy());
  unpinned.exceptions.push({
    path: "seo/PLAYBOOK.md",
    kind: "historical_record",
    reason: "long enough reason text to satisfy the shape requirement of the register",
    owner: "tjsasakifln",
  });
  const scanA = scanOperatorDocs({ policy: unpinned });
  assert.ok(scanA.register_failures.some((item) => item.rule === "historical_exception_unpinned"));

  const unowned = structuredClone(loadScanPolicy());
  unowned.exceptions.push({ path: "seo/PLAYBOOK.md", kind: "historical_record", reason: "x" });
  const scanB = scanOperatorDocs({ policy: unowned });
  assert.ok(scanB.register_failures.some((item) => item.rule === "exception_missing_justification"));

  const stale = structuredClone(loadScanPolicy());
  stale.exceptions.push({
    path: "docs/ops/THIS-FILE-DOES-NOT-EXIST.md",
    kind: "historical_record",
    reason: "long enough reason text to satisfy the shape requirement of the register",
    owner: "tjsasakifln",
    sha256: "0".repeat(64),
  });
  const scanC = scanOperatorDocs({ policy: stale });
  assert.ok(scanC.register_failures.some((item) => item.rule === "exception_path_absent"));
});

test("the CLI reports the docs scan alongside the fixture comparison", () => {
  const ran = runCli(["--fixture", "matching"]);
  const payload = JSON.parse(ran.stdout);
  assert.equal(payload.docs.ok, true, JSON.stringify(payload.docs.hits));
  assert.ok(payload.docs.scanned > 100);
});

test("module path stays inside this repository", () => {
  assert.equal(resolve(dirname(fileURLToPath(import.meta.url)), "../.."), ROOT);
  assert.ok(AUTHORITY_PATH.startsWith(ROOT));
  assert.ok(SCAN_POLICY_PATH.startsWith(ROOT));
});

test("the prefilter is a superset of every rule trigger", () => {
  const policy = loadScanPolicy();
  const prefilter = new RegExp(policy.inventory.prefilter, "i");
  // Every case the gate must reject has to survive the cheap prefilter, or the
  // file carrying it would never be opened. PROD_TRAFFIC_UNCHANGED is the one
  // trigger that does not contain the word "netlify".
  for (const probe of [
    "host: Netlify",
    "Set both on Netlify production",
    "PROD_TRAFFIC_UNCHANGED",
  ]) {
    assert.ok(prefilter.test(probe), `prefilter would skip a file containing ${probe}`);
    assert.ok(findForbiddenProductionInstructions(probe, "<probe>").length > 0, probe);
  }
});

test("the register cannot be emptied or the rules removed without failing", () => {
  const noRules = structuredClone(loadScanPolicy());
  noRules.rules = [];
  assert.throws(() => scanOperatorDocs({ policy: noRules }), /rules/i);
});
