/**
 * #616 — The home capture must reach every canonical nucleus, not only B2G.
 *
 * The recorded CTA/form inventory (tests/commercial/test_cta_form_next_state.mjs)
 * only checks that the page and the contract agree. It would happily freeze a
 * capture that silently forces a private demand into edital/contrato/operação.
 * This is the semantic guard: the option set must cover the five nuclei declared
 * in netlify/functions/lib/adaptive-intake.cjs, and the pre-form value must not
 * present the B2G triad as the whole of what CONFENGE receives.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf-8");

const selectMatch = html.match(/<select id="estagio"[\s\S]*?<\/select>/);
assert.ok(selectMatch, "home capture has no #estagio select");
const select = selectMatch[0];

// Canonical nuclei, mirrored from netlify/functions/lib/adaptive-intake.cjs NUCLEI.
const NUCLEI = [
  "public_works_b2g",
  "building_engineering_documentation",
  "expert_evidence_assistance",
  "property_valuation",
  "occupational_safety",
];

const declared = new Set(
  [...select.matchAll(/data-nucleus="([^"]+)"/g)].map((m) => m[1]),
);
for (const nucleus of NUCLEI) {
  assert.ok(
    declared.has(nucleus),
    `the home capture offers no option for the canonical nucleus ${nucleus}; a visitor with that need must either misfile it as B2G or leave`,
  );
}
// The undefined-need escape hatch must exist, so nobody is forced to misfile.
// It is other_technical_need, a real NUCLEI key -- not OTHER_NEEDS_CONTEXT,
// which is the admission decision state (adaptive-intake.cjs OTHER). Publishing
// the decision state here produced an option whose stage derived no nucleus at
// all, recreating the null the rest of #616 removes.
assert.ok(
  declared.has("other_technical_need"),
  "the home capture has no option for a need the visitor cannot yet classify",
);
assert.equal(
  declared.has("OTHER_NEEDS_CONTEXT"),
  false,
  "the admission decision state is published as if it were a nucleus",
);

// Every option carries a journey, so nothing reaches the lead function unlabelled.
const options = [...select.matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>/g)];
assert.ok(options.length >= NUCLEI.length + 1, "option set is too small to cover the nuclei");
for (const [tag, value] of options) {
  assert.match(tag, /data-journey="(?:edital|contrato|operacao|outro)"/,
    `option ${value} carries no data-journey, so its lead would arrive unlabelled`);
  assert.match(tag, /data-nucleus="/,
    `option ${value} carries no data-nucleus, so it is outside the canonical taxonomy`);
}

// Negative case: the pre-form value may not present the B2G triad as the whole
// of what is received. This is the exact regression that shipped before #616.
const hintMatch = html.match(/<p class="form-hint" data-form-value>([\s\S]*?)<\/p>/);
assert.ok(hintMatch, "home capture has no data-form-value hint");
const hint = hintMatch[1];
assert.equal(
  /separar edital, contrato e opera[çc][ãa]o/i.test(hint),
  false,
  "the pre-form value still frames the capture as edital/contrato/operação only, which misroutes every private demand",
);

// The same text lives in the contract; page and contract must not diverge.
const contract = JSON.parse(
  fs.readFileSync(path.join(root, "data/commercial/cta-form-next-state.v1.json"), "utf-8"),
);
assert.equal(
  contract.profiles.general_triage.pre_form_value,
  hint,
  "the rendered pre-form value and the next-state contract disagree",
);

// Exactly one option may be a journey's default, and it must be the neutral one:
// five options share data-journey="outro", so without this the first of them
// wins any journey-driven pre-selection.
const defaults = [...select.matchAll(/<option\b[^>]*data-journey-default[^>]*>/g)].map((m) => m[0]);
assert.equal(defaults.length, 1, `expected one journey-default option, found ${defaults.length}`);
assert.match(defaults[0], /data-nucleus="other_technical_need"/,
  "the journey-default option is not the undefined-need option");

console.log("HOME_CAPTURE_NUCLEI_OK", { nuclei: declared.size, options: options.length });
