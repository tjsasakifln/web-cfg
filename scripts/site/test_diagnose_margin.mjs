/**
 * Drives the shipped diagnose-margin transform on a real
 * public-read-margin-defense/1.0 export. No reimplementation.
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
  normalizeMarginDefenseRecord,
  isMarginDefenseRecord,
  PRODUCER_FIELD_CATALOG,
  OFFICIAL,
  DERIVED,
  UNKNOWN,
  MARGIN_FAMILIES,
  MARGIN_DEFENSE_SCHEMA,
  FORBIDDEN_CONCLUSION_FIELDS,
} = require(resolve(root, "assets/js/diagnose-margin.cjs"));

const snapshot = JSON.parse(
  readFileSync(resolve(root, "data/extra-cli/public-read-margin-defense/1.0/margem-export.json"), "utf8"),
);
const publicSnap = JSON.parse(
  readFileSync(resolve(root, "ferramentas/diagnostico-defesa-margem/snapshot.json"), "utf8"),
);
assert.equal(snapshot.schema, MARGIN_DEFENSE_SCHEMA);
assert.equal(publicSnap.schema, MARGIN_DEFENSE_SCHEMA);
assert.deepEqual(
  publicSnap.records.map((r) => r.canonical_contract_id),
  snapshot.records.map((r) => r.canonical_contract_id),
);
assert.ok(
  !JSON.stringify(publicSnap).includes("pncp_supplier_contracts"),
  "public snapshot must not leak internal source family",
);
assert.ok(snapshot.records.length >= 2);

const real = snapshot.records[0];
assert.equal(real.schema, MARGIN_DEFENSE_SCHEMA);
assert.equal(isMarginDefenseRecord(real), true);
assert.ok(!FORBIDDEN_CONCLUSION_FIELDS.some((key) => key in real || key in (real.fields || {})));

const first = diagnoseMargin(real, snapshot);
const firstAgain = diagnoseMargin(real, snapshot);
assert.deepEqual(first, firstAgain, "diagnosis must be deterministic");
assert.equal(first.schema, MARGIN_DEFENSE_SCHEMA);
assert.equal(first.public_id.classification, OFFICIAL);
assert.equal(first.public_id.value, real.canonical_contract_id);
assert.equal(first.titulo.classification, OFFICIAL);
assert.equal(first.titulo.value, real.fields.object.value);
assert.equal(first.orgao.classification, OFFICIAL);
assert.equal(first.orgao.value, real.fields.organ.value.name);
assert.equal(first.fornecedor.classification, OFFICIAL);
assert.equal(first.valor_contratual.classification, OFFICIAL);
assert.equal(first.valor_contratual.value, real.fields.nominal_value.value.amount);
assert.equal(first.valor_estimado.classification, UNKNOWN);
assert.equal(first.valor_estimado.value, null);
assert.equal(first.vigencia_inicio.classification, OFFICIAL);
assert.equal(first.vigencia_fim.classification, OFFICIAL);
assert.equal(first.aniversario_contratual.classification, DERIVED);
assert.equal(first.as_of.classification, OFFICIAL);
assert.match(String(first.fontes.value), /^PNCP /);
assert.ok(!JSON.stringify(first).includes("pncp_supplier_contracts"));
assert.ok(first.provenance && first.provenance.dataset_hash === snapshot.content_hash);
assert.match(first.public_id_slug, /^md-[0-9a-f]{8}$/);
assert.ok(!/\d{11,}/.test(first.public_id_slug));
assert.equal(first.uf.classification, UNKNOWN);
assert.ok(first.eventos_defesa_margem.every((e) => e.classification === UNKNOWN));
assert.equal(first.eventos_defesa_margem.find((e) => e.family === "aditivo").reason, "no_amendment_signal");
assert.equal(first.eventos_defesa_margem.find((e) => e.family === "medicao").reason, "source_does_not_offer_measurements");
assert.equal(first.eventos_defesa_margem.length, MARGIN_FAMILIES.length);
const serialized = JSON.stringify(first).toLowerCase();
assert.ok(!serialized.includes("pode ter direito"));
assert.ok(!serialized.includes("tese jurídica"));
assert.ok(!serialized.includes("has_right"));
assert.ok(!serialized.includes("should_adjust"));
assert.ok(first.layers && first.layers.fato && first.layers.calculo && first.layers.inferencia && first.layers.unknown);
assert.match(first.layers.calculo, /não calcula valor a receber/i);
assert.equal(first.cta.branch, "segunda_leitura");
assert.ok(!FORBIDDEN_CONCLUSION_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(first, key)));

const second = snapshot.records.find((row) => row.canonical_contract_id === "83102277000152-2-000626/2026") || snapshot.records[1];
const secondDx = diagnoseMargin(second, snapshot);
assert.notEqual(secondDx.public_id.value, first.public_id.value);
assert.equal(secondDx.valor_contratual.classification, OFFICIAL);

const selected = selectContract(snapshot, second.canonical_contract_id);
assert.equal(selected.ok, true);
const byText = selectContract(snapshot, "itajai");
assert.equal(byText.ok, true, JSON.stringify(byText));
const missing = selectContract(snapshot, "contrato-inexistente-xyz");
assert.equal(missing.ok, false);
assert.equal(missing.reason, "not_in_snapshot");

const incomplete = diagnoseMargin({ public_id: null, title: null, as_of: null, provenance: null, source: null, margin_events: [] });
assert.equal(incomplete.public_id.classification, UNKNOWN);
assert.ok(incomplete.unknown_count > first.unknown_count);
const titleOnly = diagnoseMargin({ public_id: "unbacked-id", title: "Contrato sem proveniência", source: null, as_of: null, provenance: null });
assert.equal(titleOnly.titulo.classification, UNKNOWN);
assert.equal(titleOnly.titulo.value, null);

const mapped = normalizeMarginDefenseRecord(real, snapshot);
const derived = diagnoseMargin({
  ...mapped,
  margin_events: [{
    family: "aditivo", classification: "OFFICIAL", effective_at: "2025-01-10", value_delta: 10000,
    source: mapped.source, as_of: mapped.as_of, provenance: mapped.provenance,
  }],
});
assert.equal(derived.aniversario_contratual.classification, DERIVED);
assert.equal(derived.eventos_defesa_margem.filter((e) => e.family === "aditivo")[0].classification, OFFICIAL);
assert.equal(derived.eventos_defesa_margem.filter((e) => e.family === "reajuste")[0].classification, UNKNOWN);

const mixed = diagnoseMargin({ ...mapped, margin_events: [{ family: "aditivo", classification: "DERIVED", reason: "calendar_only" }] });
assert.equal(mixed.eventos_derivados[0].classification, DERIVED);

const gateInputs = evaluateIndexability(first, { sample_size: 1 });
assert.equal(gateInputs.min_score, 55);
assert.ok(gateInputs.data_confidence >= 0.45, String(gateInputs.data_confidence));
const block = diagnoseProducerBlock(snapshot, first, gateInputs);
assert.equal(block.gate_fail, null);
assert.equal(block.do_not_relax_gate, true);
assert.equal(block.blocking_official_fields.length, 0);
assert.ok(block.reserved_margin_event_fields.some((row) => row.field === "amendments"));
assert.ok(PRODUCER_FIELD_CATALOG.some((row) => row.field === "start_at" && row.producer_family === MARGIN_DEFENSE_SCHEMA));

const sparseProducer = {
  schema: MARGIN_DEFENSE_SCHEMA,
  canonical_contract_id: "sparse-1",
  fields: {
    canonical_contract_id: { name: "canonical_contract_id", status: "KNOWN", value: "sparse-1", reason_code: null, evidence_ref: "ref-sparse" },
    object: { name: "object", status: "UNKNOWN", value: null, reason_code: "missing_object", evidence_ref: null },
    nominal_value: { name: "nominal_value", status: "UNKNOWN", value: null, reason_code: "missing_nominal_value", evidence_ref: null },
    start_at: { name: "start_at", status: "UNKNOWN", value: null, reason_code: "missing_start_at", evidence_ref: null },
    end_at: { name: "end_at", status: "UNKNOWN", value: null, reason_code: "missing_end_at", evidence_ref: null },
    signed_at: { name: "signed_at", status: "UNKNOWN", value: null, reason_code: "missing_signed_at", evidence_ref: null },
  },
  source_id: "sparse-1",
  source_record_id: "sparse-1",
  as_of: snapshot.as_of,
  reason_codes: ["missing_object", "missing_nominal_value"],
};
const sparseDx = diagnoseMargin(sparseProducer, snapshot);
assert.equal(sparseDx.titulo.reason, "missing_object");
assert.equal(sparseDx.valor_contratual.reason, "missing_nominal_value");
const sparseInputs = evaluateIndexability(sparseDx, { sample_size: 1 });
assert.ok(sparseInputs.data_confidence < 0.45);
assert.equal(diagnoseProducerBlock(snapshot, sparseDx, sparseInputs).gate_fail, "low_data_confidence");

const browserSrc = readFileSync(resolve(root, "assets/js/diagnose-margin.js"), "utf8");
assert.ok(browserSrc.includes(MARGIN_DEFENSE_SCHEMA));
assert.ok(browserSrc.includes("function normalizeMarginDefenseRecord"));

console.log("DIAGNOSE_MARGIN_OK", {
  schema: snapshot.schema,
  content_hash: snapshot.content_hash,
  records: snapshot.records.length,
  official: first.official_count,
  unknown: first.unknown_count,
  data_confidence: gateInputs.data_confidence,
  first_id: first.public_id.value,
  second_id: secondDx.public_id.value,
});
