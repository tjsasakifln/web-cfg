import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertWithdrawnDetailStatus,
  hasFunctionalOpportunityAlternative,
  validateRuntimeIdentity,
  validateWithdrawnOverlay,
} from "./runtime_lighthouse_acceptance.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const sha = "a".repeat(40);
validateRuntimeIdentity({ commit: sha }, { release_sha: sha }, sha);
assert.throws(
  () => validateRuntimeIdentity({ commit: "b".repeat(40) }, { release_sha: sha }, sha),
  /runtime identity mismatch/,
);

const withdrawn = {
  schema: "confenge.live-intelligence-overlay/v1",
  release_sha: sha,
  official_live: false,
  source_kind: null,
  source_run_id: null,
  as_of: null,
  manifest_hash: null,
  consumer_observed_manifest_hash: null,
  accepted_projection_sha256: null,
  routes: [],
  static_html_paths: ["_site/oportunidades/index.html"],
  static_html_sha256: { "_site/oportunidades/index.html": "b".repeat(64) },
  removed_html_paths: [],
};
assert.equal(validateWithdrawnOverlay(withdrawn, sha), true);
assert.throws(
  () => validateWithdrawnOverlay({ ...withdrawn, official_live: true }, sha),
  /falsely claims accepted official input/,
);
assert.throws(
  () => validateWithdrawnOverlay({ ...withdrawn, routes: [{ route: "/oportunidades/ghost/" }] }, sha),
  /retains accepted opportunity routes/,
);
assert.throws(
  () => validateWithdrawnOverlay({ ...withdrawn, static_html_paths: ["_site/oportunidades/ghost/index.html"] }, sha),
  /no exact static commercial hub/,
);

assert.equal(
  hasFunctionalOpportunityAlternative(
    '<a href="/triagem-tecnica/">Contato</a><a href="mailto:engenharia@example.com">Email</a><a href="tel:+5548999999999">Telefone</a>',
  ),
  true,
);
assert.equal(
  hasFunctionalOpportunityAlternative('<a href="/triagem-tecnica/">Contato</a>'),
  false,
  "a dead or single-channel alternative cannot pass the withdrawal behavior",
);
const renderedEmptyHub = execFileSync(
  "python3",
  ["-c", "from scripts.live_intelligence.render import render_opportunities_index_html; print(render_opportunities_index_html([]))"],
  { cwd: ROOT, encoding: "utf8" },
);
assert.equal(
  hasFunctionalOpportunityAlternative(renderedEmptyHub),
  true,
  "the real empty-family renderer must provide triage, email and phone rather than a dead opportunity action",
);

// The release contract retires the packaged fixture detail with 410
// (_site/_redirects), and that rule survives withdrawal; the branch used to
// demand 404 and would have rolled back a healthy release the first time the
// withdrawal path ran against the canonical host.
assert.equal(assertWithdrawnDetailStatus(410), 410);
assert.equal(assertWithdrawnDetailStatus(404), 404);
assert.throws(() => assertWithdrawnDetailStatus(200), /remains exposed/);
assert.throws(() => assertWithdrawnDetailStatus(301), /remains exposed/);

console.log("RUNTIME_LIGHTHOUSE_ACCEPTANCE_CONTRACT_OK");
