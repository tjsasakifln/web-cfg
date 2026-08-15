/**
 * Drives the shipped diagnose-margin transform and selectContract.
 * No reimplementation, no hardcoded legal conclusions.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const {
  diagnoseMargin,
  selectContract,
  evaluateIndexability,
  diagnoseProducerBlock,
  PRODUCER_FIELD_CATALOG,
  OFFICIAL,
  DERIVED,
  UNKNOWN,
  MARGIN_FAMILIES,
} = require(resolve(root, "assets/js/diagnose-margin.cjs"));

const snapshot = JSON.parse(
  readFileSync(resolve(root, "data/extra-cli/public-read-v1/contracts-margin-snapshot.json"), "utf8"),
);
const publicSnap = JSON.parse(
  readFileSync(resolve(root, "ferramentas/diagnostico-defesa-margem/snapshot.json"), "utf8"),
);
assert.deepEqual(
  publicSnap.records.map((r) => r.public_id),
  snapshot.records.map((r) => r.public_id),
);

const real = snapshot.records[0];
const first = diagnoseMargin(real);
const firstAgain = diagnoseMargin(real);
assert.deepEqual(first, firstAgain, "diagnosis must be deterministic");

assert.equal(first.public_id.classification, OFFICIAL);
assert.equal(first.public_id.value, real.public_id);
assert.equal(first.titulo.classification, OFFICIAL);
assert.equal(first.orgao.classification, OFFICIAL);
assert.equal(first.valor_contratual.classification, UNKNOWN);
assert.equal(first.valor_estimado.classification, OFFICIAL);
assert.equal(first.valor_estimado.qualifier, "estimated_not_signed");
assert.equal(first.vigencia_inicio.classification, UNKNOWN);
assert.equal(first.vigencia_fim.classification, UNKNOWN);
assert.equal(first.aniversario_contratual.classification, UNKNOWN);
assert.equal(first.as_of.classification, OFFICIAL);
assert.ok(first.provenance && first.provenance.dataset_hash);
assert.ok(first.eventos_defesa_margem.every((e) => e.classification === UNKNOWN));
assert.equal(first.eventos_derivados.length, 0);
assert.ok(first.unknown_count > 0);
assert.ok(!JSON.stringify(first).toLowerCase().includes("pode ter direito"));
assert.ok(!JSON.stringify(first).toLowerCase().includes("tese jurídica"));

const selected = selectContract(snapshot, "01619104000141-1-000123/2026");
assert.equal(selected.ok, true);
assert.equal(selected.record.public_id, real.public_id);
const byText = selectContract(snapshot, "quarto centenario");
assert.equal(byText.ok, true, JSON.stringify(byText));
const missing = selectContract(snapshot, "contrato-inexistente-xyz");
assert.equal(missing.ok, false);
assert.equal(missing.reason, "not_in_snapshot");

const incomplete = diagnoseMargin({
  public_id: null,
  title: null,
  as_of: null,
  provenance: null,
  source: null,
  margin_events: [],
});
assert.equal(incomplete.public_id.classification, UNKNOWN);
assert.equal(incomplete.titulo.classification, UNKNOWN);
assert.equal(incomplete.as_of.classification, UNKNOWN);
assert.ok(incomplete.unknown_count > first.unknown_count);

const titleOnly = diagnoseMargin({
  public_id: "unbacked-id",
  title: "Contrato sem proveniência",
  source: null,
  as_of: null,
  provenance: null,
});
assert.equal(titleOnly.titulo.classification, UNKNOWN);
assert.equal(titleOnly.public_id.classification, UNKNOWN);
assert.equal(titleOnly.titulo.value, null);

const derived = diagnoseMargin({
  ...real,
  data_assinatura: "2024-03-15",
  vigencia_start: "2024-03-01",
  vigencia_end: "2026-03-01",
  contract_value: 150000,
  margin_events: [
    {
      family: "aditivo",
      classification: "OFFICIAL",
      effective_at: "2025-01-10",
      value_delta: 10000,
      source: "pncp",
      source_uri: real.source_uri,
      as_of: "2026-07-31",
      provenance: real.provenance,
    },
  ],
});
assert.equal(derived.aniversario_contratual.classification, DERIVED);
assert.equal(derived.aniversario_contratual.value, "03-15");
assert.equal(derived.aniversario_contratual.derived_from[0], "data_assinatura");
assert.equal(derived.valor_contratual.classification, OFFICIAL);
assert.equal(derived.vigencia_inicio.classification, OFFICIAL);
assert.equal(derived.eventos_defesa_margem.filter((e) => e.family === "aditivo")[0].classification, OFFICIAL);
assert.ok(derived.alteracoes_prazo_valor.length === 1);
assert.equal(derived.eventos_defesa_margem.length, MARGIN_FAMILIES.length);
assert.deepEqual(
  derived.eventos_defesa_margem.map((e) => e.family).sort(),
  [...MARGIN_FAMILIES].sort(),
);
assert.equal(derived.eventos_defesa_margem.filter((e) => e.family === "reajuste")[0].classification, UNKNOWN);
assert.equal(derived.eventos_defesa_margem.filter((e) => e.family === "medicao")[0].classification, UNKNOWN);

const mixed = diagnoseMargin({
  ...real,
  margin_events: [{ family: "aditivo", classification: "DERIVED", reason: "calendar_only" }],
});
assert.equal(mixed.eventos_derivados[0].classification, DERIVED);
assert.ok(!mixed.alteracoes_prazo_valor.some((e) => e.classification === DERIVED));

const gateInputs = evaluateIndexability(first, { sample_size: 1 });
assert.equal(gateInputs.has_provenance, true);
assert.equal(gateInputs.legal_safe, true);
assert.ok(gateInputs.data_confidence < 0.45, "partial producer must not look complete");

const block = diagnoseProducerBlock(snapshot, first, gateInputs);
assert.equal(block.gate_fail, "low_data_confidence");
assert.equal(block.do_not_relax_gate, true);
assert.equal(block.consumer_ready, true);
assert.equal(block.producer, "extra-cli");
assert.ok(block.producer_contracts.includes("public_read_v1@v1.0.0"));
assert.equal(block.consumer_contract, snapshot.contract_version);
const blockingNames = block.blocking_official_fields.map((row) => row.field);
assert.ok(blockingNames.includes("vigencia_start"), JSON.stringify(blockingNames));
assert.ok(blockingNames.includes("vigencia_end"));
assert.ok(blockingNames.includes("data_assinatura"));
assert.ok(blockingNames.includes("contract_value"));
const reservedNames = block.reserved_margin_event_fields.map((row) => row.field);
assert.ok(reservedNames.includes("margin_events.aditivo"));
assert.ok(reservedNames.includes("margin_events.reajuste"));
assert.ok(reservedNames.includes("margin_events.medicao"));
assert.ok(reservedNames.includes("margin_events.pagamento"));
assert.ok(PRODUCER_FIELD_CATALOG.some((row) => row.field === "vigencia_start" && row.emitted_by_public_read_v1 === false));

const readyRecord = {
  ...real,
  vigencia_start: "2024-03-01",
  vigencia_end: "2026-03-01",
  data_assinatura: "2024-03-15",
  contract_value: 150000,
};
const readyDiagnosis = diagnoseMargin(readyRecord);
const readyInputs = evaluateIndexability(readyDiagnosis, { sample_size: 1 });
assert.ok(
  readyInputs.data_confidence >= 0.45,
  `consumer must flip the floor when official vigencia + signed value arrive: ${readyInputs.data_confidence}`,
);
const readyBlock = diagnoseProducerBlock({ ...snapshot, records: [readyRecord] }, readyDiagnosis, readyInputs);
assert.equal(readyBlock.gate_fail, null);
assert.equal(readyBlock.blocking_official_fields.length, 0);
assert.ok(readyBlock.reserved_margin_event_fields.length > 0, "event families stay UNKNOWN until producer emits them");
assert.equal(readyDiagnosis.vigencia_inicio.classification, OFFICIAL);
assert.equal(readyDiagnosis.aniversario_contratual.classification, DERIVED);

const browserSrc = readFileSync(resolve(root, "assets/js/diagnose-margin.js"), "utf8");
assert.ok(browserSrc.includes("function diagnoseProducerBlock"));
assert.ok(browserSrc.includes("PRODUCER_FIELD_CATALOG"));

console.log("DIAGNOSE_MARGIN_OK", {
  official: first.official_count,
  unknown: first.unknown_count,
  slug: first.public_id_slug,
  producer_block: blockingNames,
  ready_confidence: readyInputs.data_confidence,
});
