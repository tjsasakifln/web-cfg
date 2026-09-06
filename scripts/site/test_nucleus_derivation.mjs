/**
 * #616 — every persisted lead must carry its canonical nucleus.
 *
 * nucleus_id was assigned only on the adaptive branch, which is WITHHELD, so
 * leads arriving through the working shared form persisted with
 * nucleus_id=null and reached the handoff that way (inbound-handoff.cjs
 * clamps record.nucleus_id into both "nucleo" and "nucleus"). Downstream could
 * not tell a perícia request from a B2G operation diagnosis.
 *
 * The nucleus is now derived server-side from the submitted stage, so it does
 * not depend on client JS and cannot be set to an arbitrary value by the
 * client.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { validateAndNormalize } = require_("../../netlify/functions/lib/lead-core.cjs");
const { NUCLEI } = require_("../../netlify/functions/lib/adaptive-intake.cjs");

const base = { nome: "Fulano de Tal", email: "fulano@empresa.com.br", consentimento: "on" };
const leadFor = (estagio) => {
  const result = validateAndNormalize({ ...base, estagio });
  assert.ok(result.ok, `stage ${estagio} was rejected outright`);
  return result.lead;
};

// Every private nucleus publishes its canonical estagio slug as the option
// value, so each must resolve to itself.
for (const [nucleusId, spec] of Object.entries(NUCLEI)) {
  if (nucleusId === "public_works_b2g") continue;
  const lead = leadFor(spec.estagio);
  assert.equal(
    lead.nucleus_id,
    nucleusId,
    `stage ${spec.estagio} persisted with nucleus_id=${lead.nucleus_id}, so the handoff cannot tell what was asked`,
  );
}

// The five public-works stages keep their prose values and resolve to the B2G
// nucleus, so the existing lead corpus stays comparable.
for (const stage of [
  "problema urgente em contrato",
  "edital ou proposta em análise",
  "estruturando a operação no mercado público",
  "escolhendo oportunidades",
  "contrato em execução",
]) {
  assert.equal(leadFor(stage).nucleus_id, "public_works_b2g", `stage ${stage} lost its nucleus`);
}

// Negative case: an unrecognised stage must yield no nucleus rather than a
// guess. Silently defaulting to a nucleus would be worse than null.
for (const stage of ["outro", "qualquer coisa", "contrato"]) {
  const lead = leadFor(stage);
  assert.equal(
    lead.nucleus_id ?? null,
    null,
    `unrecognised stage ${stage} was guessed as ${lead.nucleus_id}`,
  );
}

console.log("NUCLEUS_DERIVATION_OK");
