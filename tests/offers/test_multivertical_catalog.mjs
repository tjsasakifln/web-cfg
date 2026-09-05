/**
 * Drive the shipped multi-vertical catalog (#583).
 * Fresh require() of scripts/offers/multivertical — not a reimplementation.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const catalogApi = require(path.join(root, "scripts/offers/multivertical/index.cjs"));
const validateMod = require(path.join(root, "scripts/offers/multivertical/validate.cjs"));
const mapperMod = require(path.join(root, "scripts/offers/multivertical/mapper.cjs"));

const SUITE = "multivertical-catalog";
const results = [];

function assert(name, cond, detail) {
  if (cond) results.push({ name, ok: true });
  else {
    results.push({ name, ok: false, detail });
    console.error("FAIL", name, detail === undefined ? "" : detail);
  }
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

const assembled = catalogApi.loadPinnedCatalog({ root });
const pin = catalogApi.consumerPin(assembled);
const validation = catalogApi.validateCatalog(assembled);
const demandsDoc = readJson("data/offers/multivertical/synthetic-demands.v1.json");
const flags = readJson("data/offers/flags.json");
const deliverables = readJson("data/commercial/deliverables-registry.v1.json");
const naming = readJson("data/commercial/offer-naming.v1.json");
const checkout = readJson("data/offers/catalog.snapshot.json");

assert("catalog_contract", assembled.contract === catalogApi.CATALOG_CONTRACT, assembled.contract);
assert("taxonomy_contract", assembled.taxonomy_contract === catalogApi.TAXONOMY_CONTRACT, assembled.taxonomy_contract);
assert("taxonomy_not_replaceable_fixture", assembled.taxonomy_replaceable_fixture === false);
assert(
  "taxonomy_source_is_incorporated",
  assembled.taxonomy_source === "data/corporate/taxonomy.v1.json",
  assembled.taxonomy_source,
);
assert(
  "taxonomy_hash_is_sealed_content",
  /^sha256:[a-f0-9]{64}$/.test(assembled.taxonomy_hash),
  assembled.taxonomy_hash,
);
assert("validation_ok", validation.ok === true, validation.errors);
assert("unique_ids", new Set(assembled.offers.map((o) => o.offer_id)).size === assembled.offers.length);
assert("modeled_count", assembled.modeled_offers.length === catalogApi.MODELED_OFFER_IDS.length);

for (const nucleus of catalogApi.NUCLEUS_IDS) {
  assert(`nucleus_present_${nucleus}`, assembled.offers.some((o) => o.nucleus_id === nucleus));
}

for (const offer of assembled.offers) {
  const missing = catalogApi.REQUIRED_OFFER_FIELDS.filter((field) => !(field in offer));
  assert(`required_fields_${offer.offer_id}`, missing.length === 0, missing);
  const nuclei = assembled.offers.filter((item) => item.offer_id === offer.offer_id).map((item) => item.nucleus_id);
  assert(`one_nucleus_${offer.offer_id}`, new Set(nuclei).size === 1, nuclei);
}

const canaries = assembled.offers.filter((o) => o.wave_class === "FIRST_WAVE_CANARY");
assert("single_canary", canaries.length === 1 && canaries[0].offer_id === catalogApi.CANARY_OFFER_ID, canaries.map((o) => o.offer_id));
assert("canary_not_publishable", canaries[0].readiness !== "PUBLISHABLE", canaries[0].readiness);
assert("canary_asset", canaries[0].private_asset_id === catalogApi.PRIVATE_ASSET_ID);
assert("canary_unknown_sla", canaries[0].sla_window.state === "UNKNOWN");
assert("canary_no_price", canaries[0].price_model.public_amount_cents === null && canaries[0].price_model.public_range === null);

for (const offer of assembled.modeled_offers) {
  assert(`new_offer_unknown_sla_${offer.offer_id}`, offer.sla_window.state === "UNKNOWN", offer.sla_window);
  assert(`new_offer_no_public_price_${offer.offer_id}`, offer.price_model.public_amount_cents === null, offer.price_model);
  assert(`new_offer_no_range_${offer.offer_id}`, offer.price_model.public_range === null);
  assert(`new_offer_not_retained_wave_${offer.offer_id}`, offer.wave_class !== "RETAIN_B2G");
}

assert("issue_587_modeled", assembled.modeled_offers.some((o) => o.offer_id === catalogApi.B2G_NEW_OFFER_ID));
const issue587 = assembled.offers.find((o) => o.offer_id === catalogApi.B2G_NEW_OFFER_ID);
assert("issue_587_withheld", issue587 && issue587.readiness !== "PUBLISHABLE" && issue587.wave_class !== "FIRST_WAVE_CANARY");
assert("issue_588_out", assembled.publication.issue_588_in_scope === false);
assert("catalog_public_false", assembled.publication.catalog_public === false);
assert("flags_catalog_public_false", flags.CONFENGE_OFFER_CATALOG_PUBLIC === false);

assert("b2g_deliverable_count_54", deliverables.deliverables.length === 54, deliverables.deliverables.length);
assert("naming_count_54", naming.names.length === 54, naming.names.length);
assert("internal_catalog_count_54", deliverables.catalog_count === 54);

for (const entry of deliverables.deliverables) {
  const retained = assembled.offers.find((o) => o.offer_id === entry.deliverable_id);
  assert(`retained_id_${entry.deliverable_id}`, Boolean(retained));
  if (!retained) continue;
  assert(`retained_name_${entry.deliverable_id}`, retained.public_name === (entry.public_name_pt_br || entry.public_name));
  assert(
    `retained_price_${entry.deliverable_id}`,
    JSON.stringify(retained.price_model.retained_price) === JSON.stringify(entry.price),
  );
  if (typeof entry.price.amount_cents === "number") {
    assert(`retained_cents_${entry.deliverable_id}`, retained.price_model.public_amount_cents === entry.price.amount_cents);
  }
  assert(`retained_wave_${entry.deliverable_id}`, retained.wave_class === "RETAIN_B2G");
  assert(`retained_nucleus_${entry.deliverable_id}`, retained.nucleus_id === "public_works_b2g");
}

for (const id of catalogApi.CHECKOUT_OFFER_IDS) {
  const frozen = checkout.offers.find((o) => o.offer_id === id);
  const retained = assembled.offers.find((o) => o.offer_id === id);
  assert(`checkout_present_${id}`, Boolean(frozen) && Boolean(retained));
  if (frozen && retained) {
    assert(`checkout_name_${id}`, retained.public_name === frozen.public_name);
    assert(`checkout_cents_${id}`, retained.price_model.public_amount_cents === frozen.amount_cents);
  }
}
assert("private_extra_absent", !assembled.offers.some((o) => o.offer_id === "CFG-DIRB2G-EXTRA-HIST-v1"));

const modeledBlob = JSON.stringify(assembled.modeled_offers);
for (const pattern of catalogApi.FORBIDDEN_CLAIM_PATTERNS) {
  assert(`no_forbidden_${pattern.id}`, !pattern.re.test(modeledBlob));
}
assert("screening_denies_laudo", /não é laudo/i.test(JSON.stringify(assembled.offers.find((o) => o.offer_id === "pre_litigation_technical_screening"))));
assert(
  "preliminary_denies_formal",
  /não equivale a avaliação formal/i.test(JSON.stringify(assembled.offers.find((o) => o.offer_id === "preliminary_property_opinion"))),
);
for (const offer of assembled.modeled_offers.filter((o) => o.nucleus_id === "expert_evidence_assistance")) {
  const text = JSON.stringify(offer);
  assert(`denies_advocacy_${offer.offer_id}`, /não é advocacia/i.test(text));
  assert(`court_expert_boundary_${offer.offer_id}`, /perito do ju[íi]zo/i.test(text));
}

const laborSkus = assembled.modeled_offers.filter((o) => o.offer_id === "labor_sst_technical_assistance");
assert("single_labor_assistance_sku", laborSkus.length === 1);

assert("pin_source", pin.source === "CONFENGE_WEB");
assert("pin_outbound_false", pin.outbound_eligible === false);
assert("pin_auto_send_false", pin.auto_send === false);
assert("pin_canary", pin.canary_offer_id === catalogApi.CANARY_OFFER_ID);

assert("demands_count_100", demandsDoc.demands.length === 100, demandsDoc.demands.length);
const mapped = catalogApi.mapDemands(demandsDoc.demands, { root, assembled, pin });
assert("mapped_count_100", mapped.length === 100, mapped.length);

const knownIds = new Set(assembled.offers.map((o) => o.offer_id));
const gapIds = new Set((assembled.gaps.gaps || []).map((g) => g.gap_id));
const primaryHits = new Set();
for (const item of mapped) {
  assert(`one_primary_or_gap_${item.demand_id}`, Boolean(item.primary_offer_id) !== Boolean(item.gap), item);
  if (item.primary_offer_id) {
    assert(`known_primary_${item.demand_id}`, knownIds.has(item.primary_offer_id), item.primary_offer_id);
    primaryHits.add(item.primary_offer_id);
  }
  if (item.gap) {
    assert(`registered_gap_${item.demand_id}`, gapIds.has(item.gap.gap_id), item.gap);
  }
  assert(`alts_array_${item.demand_id}`, Array.isArray(item.alternatives));
  for (const alt of item.alternatives) {
    assert(`alt_justified_${item.demand_id}_${alt.offer_id}`, Boolean(alt.justification) && knownIds.has(alt.offer_id), alt);
    assert(`alt_not_primary_${item.demand_id}_${alt.offer_id}`, alt.offer_id !== item.primary_offer_id);
  }
}

for (const id of catalogApi.MODELED_OFFER_IDS) {
  assert(`corpus_hits_${id}`, primaryHits.has(id), [...primaryHits]);
}

const byId = new Map(mapped.map((item) => [item.demand_id, item]));
assert("D012_canary", byId.get("D012")?.primary_offer_id === catalogApi.CANARY_OFFER_ID);
assert("D017_587", byId.get("D017")?.primary_offer_id === catalogApi.B2G_NEW_OFFER_ID);
assert("D075_588_gap", byId.get("D075")?.gap?.gap_id === "GAP_ISSUE_588_PUBLICATION");
assert("D057_labor_not_second_sst_sku", byId.get("D057")?.primary_offer_id === "labor_sst_technical_assistance");
assert("D052_valuation_primary", byId.get("D052")?.primary_offer_id === "urban_property_valuation");
assert("D056_screening_when_corpus_unknown", byId.get("D056")?.primary_offer_id === "pre_litigation_technical_screening");
assert("D062_retained_d01", byId.get("D062")?.primary_offer_id === "CFG-D01");
assert("D067_diag", byId.get("D067")?.primary_offer_id === "CFG-DIAG-EXP-v1");
assert("D077_court_expert_gap", byId.get("D077")?.gap?.gap_id === "GAP_COURT_APPOINTED_EXPERT");
assert("D078_advocacy_gap", byId.get("D078")?.gap?.gap_id === "GAP_LEGAL_REPRESENTATION");

let pinContractFailed = false;
try {
  mapperMod.mapDemand(demandsDoc.demands[0], { assembled, pin: { ...pin, catalog_contract: "other" } });
} catch (error) {
  pinContractFailed = /catalog_pin_contract/.test(String(error.message));
}
assert("fail_closed_catalog_contract", pinContractFailed);

let pinHashFailed = false;
try {
  mapperMod.mapDemand(demandsDoc.demands[0], {
    assembled,
    pin: { ...pin, catalog_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000" },
  });
} catch (error) {
  pinHashFailed = /catalog_pin_hash_mismatch/.test(String(error.message));
}
assert("fail_closed_catalog_hash", pinHashFailed);

let taxHashFailed = false;
try {
  mapperMod.mapDemand(demandsDoc.demands[0], {
    assembled,
    pin: { ...pin, taxonomy_hash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" },
  });
} catch (error) {
  taxHashFailed = /taxonomy_pin_hash_mismatch/.test(String(error.message));
}
assert("fail_closed_taxonomy_hash", taxHashFailed);

let missingPinFailed = false;
try {
  mapperMod.mapDemand(demandsDoc.demands[0], { assembled, pin: null });
} catch (error) {
  missingPinFailed = /mapper_pin_required/.test(String(error.message));
}
assert("fail_closed_missing_pin", missingPinFailed);

let inventedFailed = false;
try {
  mapperMod.mapDemand(
    { demand_id: "X", decision: "retained_b2g", retained_offer_id: "invented_parallel_offer" },
    { assembled, pin },
  );
} catch (error) {
  inventedFailed = /invented_offer_id:invented_parallel_offer/.test(String(error.message));
}
assert("fail_closed_invented_offer_id", inventedFailed);

const scanned = validateMod.scanForbidden(modeledBlob);
assert("scan_forbidden_empty", scanned.length === 0, scanned);

const fragmentDir = path.join(root, "docs/integration/campaign-20260904/03");
for (const name of [
  "fragment-08-intake-offer-ids.json",
  "fragment-09-private-canary.json",
  "fragment-10-handoff-context.json",
  "fragment-01-97-test-script.json",
  "fragment-343-587-naming-55.json",
  "fragment-587-deliverables-55.json",
  "consumer-pin.json",
  "consumer-conformance-fixture.json",
]) {
  const fragmentPath = path.join(fragmentDir, name);
  assert(`fragment_exists_${name}`, fs.existsSync(fragmentPath), fragmentPath);
}
const consumerPinDoc = readJson("docs/integration/campaign-20260904/03/consumer-pin.json");
assert("consumer_pin_hash", consumerPinDoc.catalog_hash === assembled.content_hash, consumerPinDoc.catalog_hash);
assert("consumer_pin_taxonomy_hash", consumerPinDoc.taxonomy_hash === assembled.taxonomy_hash);
const conformance = readJson("docs/integration/campaign-20260904/03/consumer-conformance-fixture.json");
const conformanceMapped = catalogApi.mapDemand(conformance.valid_demand, { assembled, pin });
assert("conformance_canary", conformanceMapped.primary_offer_id === catalogApi.CANARY_OFFER_ID, conformanceMapped);
assert("conformance_pin_matches", conformance.pin.catalog_hash === assembled.content_hash);

const canaryFragment = readJson("docs/integration/campaign-20260904/03/fragment-09-private-canary.json");
assert("fragment_09_canary_id", canaryFragment.canary.offer_id === catalogApi.CANARY_OFFER_ID);
assert("fragment_09_asset", canaryFragment.canary.private_asset_id === catalogApi.PRIVATE_ASSET_ID);
assert("fragment_09_no_price", canaryFragment.canary.public_price === null);
assert("fragment_09_source", canaryFragment.invariants.source === "CONFENGE_WEB");
assert("fragment_09_no_outbound", canaryFragment.invariants.outbound_eligible === false);
assert("fragment_09_no_auto_send", canaryFragment.invariants.auto_send === false);

assert("no_second_catalog_file", !fs.existsSync(path.join(root, "data/offers/catalog.v2.public.json")));
assert(
  "checkout_snapshot_untouched_schema",
  checkout.schema === "confenge.offer-catalog-snapshot/1.0",
  checkout.schema,
);

const failed = results.filter((r) => !r.ok);
const passed = results.length - failed.length;
console.log(`${SUITE}: ${passed}/${results.length} checks passed`);
console.log(JSON.stringify({
  ok: failed.length === 0,
  passed,
  failed: failed.length,
  catalog_hash: assembled.content_hash,
  taxonomy_hash: assembled.taxonomy_hash,
  modeled: assembled.modeled_offers.length,
  total_offers: assembled.offers.length,
  mapped: mapped.length,
}, null, 2));
if (failed.length) {
  console.error(JSON.stringify(failed, null, 2));
  process.exit(1);
}
