import assert from "node:assert/strict";
import test from "node:test";
import { buildFunctionInventory } from "../inventory.mjs";

const EXPECTED_FUNCTIONS = [
  "asaas-webhook",
  "asaas-webhook-sandbox",
  "collect",
  "conversion-intake",
  "correction",
  "lead",
  "market-answer-intake",
  "nurture",
  "offer-checkout",
  "offer-checkout-sandbox",
  "offer-eligibility",
  "offer-terms-accept",
  "ops",
  "search-observation-tick",
];
const INVENTORY = buildFunctionInventory();

test("inventory discovers every current file and every top-level handler automatically", () => {
  const inventory = INVENTORY;
  assert.equal(inventory.file_count, 34);
  assert.equal(inventory.function_count, 14);
  assert.equal(inventory.validation.ok, true);
  assert.equal(inventory.validation.loaded_handlers, 14);
  assert.deepEqual(
    inventory.functions.map((entry) => entry.name),
    EXPECTED_FUNCTIONS,
  );
  assert.equal(
    inventory.files.filter((entry) => entry.role === "support_library").length,
    19,
  );
  assert.equal(
    inventory.files.filter((entry) => entry.role === "bundled_data").length,
    1,
  );
});

test("inventory classifies frontend, schedules, probes and ops without assuming a short list", () => {
  const inventory = INVENTORY;
  const byName = new Map(inventory.functions.map((entry) => [entry.name, entry]));
  assert.ok(byName.get("lead").consumers.frontend.length > 0);
  assert.ok(byName.get("lead").consumers.workflows_schedules.length > 0);
  assert.ok(byName.get("lead").consumers.probes_tests.length > 0);
  assert.ok(byName.get("ops").consumers.ops.length > 0);
  assert.equal(byName.get("ops").usage_state, "operational_runtime");
  assert.equal(
    byName.get("ops").consumers.frontend?.some((entry) => entry.path.startsWith("ops/")) || false,
    false,
  );
  assert.equal(byName.get("offer-terms-accept").usage_state, "test_or_legacy_only");
  assert.equal(byName.get("asaas-webhook-sandbox").usage_state, "test_or_legacy_only");
  assert.equal(byName.get("search-observation-tick").usage_state, "scheduled");
  assert.deepEqual(byName.get("search-observation-tick").schedule, {
    cron: "30 11 * * *",
    timezone: "UTC",
    portable_command: "node runtime/schedule.mjs search-observation-tick",
    timezone_authority: "https://docs.netlify.com/build/functions/scheduled-functions/",
  });
  assert.deepEqual(byName.get("search-observation-tick").routes, []);
});

test("every HTTP function has both migration aliases and scheduled functions have no public route", () => {
  const inventory = INVENTORY;
  for (const entry of inventory.functions) {
    if (entry.schedule) {
      assert.deepEqual(entry.routes, []);
      continue;
    }
    assert.deepEqual(entry.routes, [
      "/.netlify/functions/" + entry.name,
      "/api/web/" + entry.name,
    ]);
  }
});
