"use strict";

/**
 * Consume the MV-01 canonical taxonomy; an explicit fixture path is test-only.
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
const { digestCanonical, hashRecord } = require("./hash.cjs");

function defaultRoot() {
  return path.resolve(__dirname, "../../..");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertTaxonomyShape(taxonomy, sourcePath) {
  const errors = [];
  if (!taxonomy || typeof taxonomy !== "object") errors.push("taxonomy_not_object");
  const contract = taxonomy.contract || (
    taxonomy.contract_id && taxonomy.contract_version
      ? `${taxonomy.contract_id}/${taxonomy.contract_version}`
      : null
  );
  if (contract !== TAXONOMY_CONTRACT) {
    errors.push(`taxonomy_contract_mismatch:${contract || "missing"}`);
  }
  const nuclei = taxonomy.nuclei || [];
  const ids = nuclei.map((item) => item && (item.nucleus_id || item.id));
  if (ids.length !== NUCLEUS_IDS.length) errors.push("taxonomy_nucleus_count");
  for (const expected of NUCLEUS_IDS) {
    if (!ids.includes(expected)) errors.push(`taxonomy_missing_nucleus:${expected}`);
  }
  const unique = new Set(ids);
  if (unique.size !== ids.length) errors.push("taxonomy_duplicate_nucleus");
  let computed;
  if (taxonomy.content_sha256) {
    const unsigned = { ...taxonomy };
    delete unsigned.content_sha256;
    computed = digestCanonical(unsigned);
    if (taxonomy.content_sha256 !== computed.replace(/^sha256:/, "")) {
      errors.push("taxonomy_hash_mismatch");
    }
  } else {
    computed = hashRecord(taxonomy);
    if (taxonomy.content_hash && taxonomy.content_hash !== computed) {
      errors.push("taxonomy_hash_mismatch");
    }
  }
  if (errors.length) {
    const error = new Error(`taxonomy_fail_closed:${errors.join(",")}`);
    error.errors = errors;
    error.sourcePath = sourcePath;
    throw error;
  }
  return {
    ...taxonomy,
    contract,
    nuclei: nuclei.map((item) => ({ ...item, nucleus_id: item.nucleus_id || item.id })),
    content_hash: computed,
    source_path: sourcePath,
  };
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
