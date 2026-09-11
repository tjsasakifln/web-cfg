import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HANDOFF = path.join(root, "docs/campaigns/inb-20260911/04/handoff.json");
const SHARED = path.join(root, "docs/campaigns/inb-20260911/04/shared-changes.json");

test("handoff.json is schema 2.0 with mandated fields", () => {
  const handoff = JSON.parse(fs.readFileSync(HANDOFF, "utf8"));
  assert.equal(handoff.schema, "confenge.inbound-campaign-handoff/2.0");
  assert.equal(handoff.campaign_set, "INB-20260911");
  assert.equal(handoff.campaign_id, "04");
  assert.equal(handoff.prompt_version, "2.0.0");
  assert.equal(handoff.base_sha, "8f508544835490ec635d02517bce0207c6f8e426");
  assert.match(handoff.state, /^READY_FOR_INTEGRATION/);
  assert.equal(Object.hasOwn(handoff, "head_sha"), false, "head sha must not live in the receipt that identifies the commit");
  for (const key of [
    "owned_sources",
    "changed_sources",
    "routes",
    "dependencies",
    "shared_changes",
    "tests",
    "evidence_paths",
    "unresolved",
  ]) {
    assert.equal(key in handoff, true, `missing ${key}`);
  }
  assert.equal(handoff.routes.length, 3);
  for (const route of handoff.routes) {
    for (const field of [
      "path",
      "kind",
      "intent_family",
      "offer_id",
      "canonical",
      "requested_indexability",
      "release_unit",
      "contact_mode",
    ]) {
      assert.equal(typeof route[field], "string", `${route.path} missing ${field}`);
    }
    assert.equal(route.intent_family, "projetar_revisar_compatibilizar");
    assert.equal(route.release_unit, "CORE");
  }
  const providers = handoff.dependencies.map((row) => row.provider_campaign).sort();
  assert.deepEqual(providers, ["01", "02", "06"]);
  for (const dep of handoff.dependencies) {
    assert.equal(dep.level, "HARD_AT_RELEASE");
    assert.equal("fallback" in dep, true);
    assert.equal(typeof dep.artifact_path, "string");
  }
  const six = handoff.dependencies.find((row) => row.provider_campaign === "06");
  assert.equal(six.fallback, null);
  assert.ok(Array.isArray(handoff.tests));
  for (const row of handoff.tests) {
    assert.equal(typeof row.command, "string");
    assert.equal("exit_code" in row, true);
    assert.equal("subject_sha" in row, true);
    assert.ok(Array.isArray(row.overlay_hashes));
    assert.notEqual(row.exit_code, "PASS");
  }
});

test("shared-changes.json has keyed upserts for 16 and links for 09", () => {
  const shared = JSON.parse(fs.readFileSync(SHARED, "utf8"));
  assert.equal(shared.campaign_id, "04");
  assert.ok(Array.isArray(shared.changes) && shared.changes.length >= 8);
  const required = [
    "change_id",
    "owner_campaign",
    "path",
    "base_blob_sha",
    "operation",
    "key_or_anchor",
    "expected_old",
    "desired_new",
    "rationale",
    "acceptance_test",
  ];
  for (const change of shared.changes) {
    for (const field of required) {
      assert.equal(field in change, true, `${change.change_id} missing ${field}`);
    }
  }
  const owners = new Set(shared.changes.map((row) => row.owner_campaign));
  assert.equal(owners.has("16"), true);
  assert.equal(owners.has("09"), true);
  const registry = shared.changes.filter((row) => row.path === "data/organic/public-family-registry.json");
  assert.ok(registry.length >= 2);
  assert.ok(shared.changes.some((row) => row.path === "sitemap.xml"));
  assert.ok(shared.changes.some((row) => row.path === "scripts/pseo/public_artifact.py"));
  assert.ok(shared.changes.some((row) => row.path === "data/site/public-ia-map.json"));
  const hub = shared.changes.find((row) => row.change_id === "04-hub-conteudos-links");
  assert.equal(hub.owner_campaign, "09");
  assert.equal(hub.path, "conteudos/index.html");
});
