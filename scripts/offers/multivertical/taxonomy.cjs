"use strict";

/**
 * Consume campaign 02 taxonomy when present; otherwise a replaceable fixture.
 * Divergent version/hash fails closed. This module is not a second taxonomy authority.
 */

const fs = require("fs");
const path = require("path");
const {
  TAXONOMY_CONTRACT,
  NUCLEUS_IDS,
  TAXONOMY_CONSUME_PATHS,
  RELATIVE_PATHS,
} = require("./constants.cjs");
const { hashRecord } = require("./hash.cjs");

function defaultRoot() {
  return path.resolve(__dirname, "../../..");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function contractFromDocument(taxonomy) {
  if (taxonomy && taxonomy.contract) return String(taxonomy.contract);
  const id = taxonomy && taxonomy.contract_id;
  const version = taxonomy && taxonomy.contract_version;
  if (id && version) return `${id}/${version}`;
  return "";
}

function nucleusId(item) {
  if (!item || typeof item !== "object") return "";
  return String(item.nucleus_id || item.id || "");
}

function normalizeTaxonomy(raw) {
  const contract = contractFromDocument(raw);
  const nuclei = (raw.nuclei || []).map((item) => ({
    ...item,
    nucleus_id: nucleusId(item),
  }));
  let content_hash = raw.content_hash || null;
  if (!content_hash && raw.content_sha256) {
    content_hash = `sha256:${raw.content_sha256}`;
  }
  return { ...raw, contract, nuclei, content_hash };
}

function assertTaxonomyShape(taxonomy, sourcePath) {
  const errors = [];
  if (!taxonomy || typeof taxonomy !== "object") errors.push("taxonomy_not_object");
  const normalized = normalizeTaxonomy(taxonomy);
  if (normalized.contract !== TAXONOMY_CONTRACT) {
    errors.push(`taxonomy_contract_mismatch:${normalized.contract || "missing"}`);
  }
  const nuclei = normalized.nuclei || [];
  const ids = nuclei.map((item) => item && item.nucleus_id);
  if (ids.length !== NUCLEUS_IDS.length) errors.push("taxonomy_nucleus_count");
  for (const expected of NUCLEUS_IDS) {
    if (!ids.includes(expected)) errors.push(`taxonomy_missing_nucleus:${expected}`);
  }
  const unique = new Set(ids);
  if (unique.size !== ids.length) errors.push("taxonomy_duplicate_nucleus");
  if (normalized.content_sha256 && !/^[a-f0-9]{64}$/.test(normalized.content_sha256)) {
    errors.push("taxonomy_content_sha256_invalid");
  }
  const computed = normalized.content_sha256
    ? `sha256:${normalized.content_sha256}`
    : hashRecord({ contract: normalized.contract, nuclei: normalized.nuclei });
  if (normalized.content_hash && normalized.content_hash !== computed) {
    errors.push("taxonomy_hash_mismatch");
  }
  if (errors.length) {
    const error = new Error(`taxonomy_fail_closed:${errors.join(",")}`);
    error.errors = errors;
    error.sourcePath = sourcePath;
    throw error;
  }
  return { ...normalized, content_hash: computed, source_path: sourcePath };
}

function findCampaign02Taxonomy(root) {
  for (const relative of TAXONOMY_CONSUME_PATHS) {
    const candidate = path.join(root, relative);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadTaxonomy(options = {}) {
  const root = options.root || defaultRoot();
  const pin = options.pin || null;
  const campaign02 = findCampaign02Taxonomy(root);
  const sourcePath = campaign02 || path.join(root, RELATIVE_PATHS.taxonomyFixture);
  if (!fs.existsSync(sourcePath)) {
    throw new Error("taxonomy_missing");
  }
  const loaded = assertTaxonomyShape(readJson(sourcePath), path.relative(root, sourcePath));
  loaded.replaceable_fixture = !campaign02;
  if (pin) {
    if (pin.contract && pin.contract !== loaded.contract) {
      throw new Error(`taxonomy_pin_contract:${pin.contract}`);
    }
    if (pin.hash && pin.hash !== loaded.content_hash) {
      throw new Error(`taxonomy_pin_hash:${pin.hash}`);
    }
  }
  return loaded;
}

module.exports = {
  loadTaxonomy,
  findCampaign02Taxonomy,
  assertTaxonomyShape,
};
