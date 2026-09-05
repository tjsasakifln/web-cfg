import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const adaptive = require("../../netlify/functions/lib/adaptive-intake.cjs");
const fixture = require("../../tests/fixtures/adaptive-intake/contracts.draft.20260904.json");
const { handler } = require("../../netlify/functions/adaptive-intake-config.cjs");
const registry = JSON.parse(readFileSync(
  new URL("../../data/organic/public-family-registry.json", import.meta.url),
  "utf8",
));
const authority = require("../../netlify/functions/data/adaptive-intake-authority.json");

const family = registry.families.find((entry) => entry.id === "triagem-tecnica");
assert.deepEqual(family.capture_availability, {
  mode: "external_authority_fail_closed",
  withheld_fallback: ["whatsapp", "email", "telephone"],
  runtime_profile: "adaptive_intake_standalone_v1",
  config_endpoint: "/.netlify/functions/adaptive-intake-config",
  client_script: "/assets/js/adaptive-intake.js",
  authority_manifest: "netlify/functions/data/adaptive-intake-authority.json",
});
assert.equal(authority.status, "WITHHELD");
assert.equal(authority.pin, null);
assert.equal(authority.contract_hashes, null);

const injected = { ADAPTIVE_INTAKE_PIN_JSON: JSON.stringify(fixture) };
assert.equal(adaptive.loadPin({}).ok, false);
assert.equal(adaptive.loadPin({ ...injected, NODE_ENV: "test" }).ok, true);
for (const deploy of [
  { NODE_ENV: "production" },
  { NODE_ENV: "test", CONTEXT: "production" },
  { NODE_ENV: "test", CONTEXT: "deploy-preview" },
  { NODE_ENV: "test", CONFENGE_RUNTIME_PROFILE: "netcup-production" },
]) {
  assert.equal(adaptive.loadPin({ ...injected, ...deploy }).ok, false,
    "a deploy must not accept a test coordination pin, even when explicitly injected");
}
const config = await handler({ httpMethod: "GET" });
assert.equal(config.statusCode, 503);
assert.deepEqual(JSON.parse(config.body), { ok: false, error: "intake_unavailable" });
assert.equal(config.headers["Cache-Control"], "no-store");
assert.equal((await handler({ httpMethod: "POST" })).statusCode, 405);
assert.deepEqual(adaptive.redactedAnalyticsProps({ nucleus_id: "occupational_safety", urgency: "ate_48h" }),
  { source: "CONFENGE_WEB" }, "no intake answers belong in analytics");
console.log("PASS adaptive authority: deployed draft/missing authority rejected; config fail closed; analytics has no answers");
