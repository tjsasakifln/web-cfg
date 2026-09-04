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

function assertTaxonomyShape(taxonomy, sourcePath) {
  const errors = [];
  if (!taxonomy || typeof taxonomy !== "object") errors.push("taxonomy_not_object");
  if (taxonomy.contract !== TAXONOMY_CONTRACT) {
    errors.push(`taxonomy_contract_mismatch:${taxonomy.contract || "missing"}`);
  }
  const nuclei = taxonomy.nuclei || [];
  const ids = nuclei.map((item) => item && item.nucleus_id);
  if (ids.length !== NUCLEUS_IDS.length) errors.push("taxonomy_nucleus_count");
  for (const expected of NUCLEUS_IDS) {
    if (!ids.includes(expected)) errors.push(`taxonomy_missing_nucleus:${expected}`);
  }
  const unique = new Set(ids);
  if (unique.size !== ids.length) errors.push("taxonomy_duplicate_nucleus");
  const computed = hashRecord(taxonomy);
  if (taxonomy.content_hash && taxonomy.content_hash !== computed) {
    errors.push("taxonomy_hash_mismatch");
  }
  if (errors.length) {
    const error = new Error(`taxonomy_fail_closed:${errors.join(",")}`);
    error.errors = errors;
    error.sourcePath = sourcePath;
    throw error;
  }
  return { ...taxonomy, content_hash: computed, source_path: sourcePath };
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
