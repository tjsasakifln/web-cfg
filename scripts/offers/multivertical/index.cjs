"use strict";

const fs = require("fs");
const path = require("path");
const constants = require("./constants.cjs");
const { assembleCatalog, catalogContentHash, getOffer } = require("./catalog.cjs");
const { loadTaxonomy } = require("./taxonomy.cjs");
const { validateCatalog } = require("./validate.cjs");
const { mapDemand, mapDemands } = require("./mapper.cjs");
const { hashRecord } = require("./hash.cjs");

function loadCommittedConsumerPin(options = {}) {
  const root = options.root || path.resolve(__dirname, "../../..");
  const pinPath = path.join(root, "docs/integration/campaign-20260905/01/consumer-pin.json");
  return JSON.parse(fs.readFileSync(pinPath, "utf8"));
}

function loadPinnedCatalog(options = {}) {
  const consumerPin = options.consumerPin || loadCommittedConsumerPin({ root: options.root });
  const assembled = assembleCatalog({
    ...options,
    pin: {
      contract: consumerPin.catalog_contract,
      hash: consumerPin.catalog_hash,
    },
    taxonomyPin: {
      contract: consumerPin.taxonomy_contract,
      hash: consumerPin.taxonomy_hash,
    },
  });
  const validation = validateCatalog(assembled);
  if (!validation.ok) {
    const error = new Error(`catalog_invalid:${validation.errors.join(",")}`);
    error.errors = validation.errors;
    throw error;
  }
  return assembled;
}

module.exports = {
  ...constants,
  assembleCatalog,
  catalogContentHash,
  loadCommittedConsumerPin,
  loadPinnedCatalog,
  loadTaxonomy,
  validateCatalog,
  mapDemand,
  mapDemands,
  getOffer,
  hashRecord,
};
