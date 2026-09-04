"use strict";

const constants = require("./constants.cjs");
const { assembleCatalog, getOffer } = require("./catalog.cjs");
const { loadTaxonomy } = require("./taxonomy.cjs");
const { validateCatalog } = require("./validate.cjs");
const { mapDemand, mapDemands } = require("./mapper.cjs");
const { hashRecord } = require("./hash.cjs");

function loadPinnedCatalog(options = {}) {
  const assembled = assembleCatalog(options);
  const validation = validateCatalog(assembled);
  if (!validation.ok) {
    const error = new Error(`catalog_invalid:${validation.errors.join(",")}`);
    error.errors = validation.errors;
    throw error;
  }
  return assembled;
}

function consumerPin(assembled) {
  return {
    catalog_contract: assembled.contract,
    catalog_hash: assembled.content_hash,
    taxonomy_contract: assembled.taxonomy_contract,
    taxonomy_hash: assembled.taxonomy_hash,
    canary_offer_id: constants.CANARY_OFFER_ID,
    private_asset_id: constants.PRIVATE_ASSET_ID,
    source: constants.SOURCE_LANE,
    outbound_eligible: constants.OUTBOUND_ELIGIBLE,
    auto_send: constants.AUTO_SEND,
  };
}

module.exports = {
  ...constants,
  assembleCatalog,
  loadPinnedCatalog,
  loadTaxonomy,
  validateCatalog,
  mapDemand,
  mapDemands,
  getOffer,
  hashRecord,
  consumerPin,
};
