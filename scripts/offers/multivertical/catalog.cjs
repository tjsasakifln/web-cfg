"use strict";

const fs = require("fs");
const path = require("path");
const {
  CATALOG_CONTRACT,
  RELATIVE_PATHS,
  CHECKOUT_OFFER_IDS,
} = require("./constants.cjs");
const { hashRecord } = require("./hash.cjs");
const { loadTaxonomy } = require("./taxonomy.cjs");
const { expandRetainedB2G } = require("./b2g.cjs");

function defaultRoot() {
  return path.resolve(__dirname, "../../..");
}

function readJson(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

function loadAuthorities(root) {
  return {
    catalog: readJson(root, RELATIVE_PATHS.catalog),
    deliverables: readJson(root, RELATIVE_PATHS.deliverables),
    naming: readJson(root, RELATIVE_PATHS.naming),
    checkout: readJson(root, RELATIVE_PATHS.checkout),
    flags: readJson(root, RELATIVE_PATHS.flags),
    boundaries: readJson(root, RELATIVE_PATHS.boundaries),
    gaps: readJson(root, RELATIVE_PATHS.gaps),
  };
}

function catalogContentHash(assembled) {
  return hashRecord({
    contract: assembled.contract,
    taxonomy_contract: assembled.taxonomy_contract,
    taxonomy_hash: assembled.taxonomy_hash,
    issue: assembled.issue,
    parent_issue: assembled.parent_issue,
    publication: assembled.publication,
    retained_b2g: assembled.retained_b2g,
    offers: assembled.offers,
    gaps: assembled.gaps,
    boundaries: assembled.boundaries,
  });
}

function assembleCatalog(options = {}) {
  const root = options.root || defaultRoot();
  const pin = options.pin || null;
  const authorities = loadAuthorities(root);
  const raw = authorities.catalog;
  if (raw.contract !== CATALOG_CONTRACT) {
    throw new Error(`catalog_contract_mismatch:${raw.contract || "missing"}`);
  }
  const taxonomy = loadTaxonomy({ root, pin: options.taxonomyPin || null });
  if (raw.taxonomy_contract !== taxonomy.contract) {
    throw new Error("catalog_taxonomy_contract_mismatch");
  }
  const retained = expandRetainedB2G({
    catalog: raw,
    deliverables: authorities.deliverables,
    checkout: authorities.checkout,
  });
  const offers = [
    ...raw.offers,
    ...retained.deliverable_offers,
    ...retained.checkout_offers,
  ];
  const assembled = {
    contract: raw.contract,
    taxonomy_contract: taxonomy.contract,
    taxonomy_hash: taxonomy.content_hash,
    taxonomy_source: taxonomy.source_path,
    taxonomy_replaceable_fixture: taxonomy.replaceable_fixture,
    issue: raw.issue,
    parent_issue: raw.parent_issue,
    publication: raw.publication,
    retained_b2g: raw.retained_b2g,
    offers,
    modeled_offers: raw.offers,
    gaps: authorities.gaps,
    boundaries: authorities.boundaries,
  };
  const content_hash = catalogContentHash(assembled);
  assembled.content_hash = content_hash;
  if (raw.content_hash && raw.content_hash !== content_hash) {
    throw new Error("catalog_declared_hash_mismatch");
  }
  if (pin) {
    if (pin.contract && pin.contract !== assembled.contract) {
      throw new Error(`catalog_pin_contract:${pin.contract}`);
    }
    if (pin.hash && pin.hash !== assembled.content_hash) {
      throw new Error(`catalog_pin_hash:${pin.hash}`);
    }
  }
  assembled.authorities = {
    deliverable_count: authorities.deliverables.deliverables.length,
    naming_count: (authorities.naming.names || []).length,
    checkout_ids: CHECKOUT_OFFER_IDS.slice(),
    flags: authorities.flags,
  };
  assembled._authorities = authorities;
  assembled._taxonomy = taxonomy;
  assembled._root = root;
  return assembled;
}

function getOffer(assembled, offerId) {
  return assembled.offers.find((offer) => offer.offer_id === offerId) || null;
}

function modeledOfferIds(assembled) {
  return assembled.modeled_offers.map((offer) => offer.offer_id);
}

module.exports = {
  assembleCatalog,
  catalogContentHash,
  loadAuthorities,
  getOffer,
  modeledOfferIds,
};
