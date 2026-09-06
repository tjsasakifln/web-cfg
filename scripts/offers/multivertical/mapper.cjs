"use strict";

const { CATALOG_CONTRACT, TAXONOMY_CONTRACT } = require("./constants.cjs");
const { assembleCatalog, catalogContentHash } = require("./catalog.cjs");
const { validateCatalog } = require("./validate.cjs");

function demandValue(demand, key) {
  return demand[key];
}

function matchRule(demand, rule) {
  const match = rule.match || {};
  const keys = Object.keys(match);
  for (const key of keys) {
    const expected = match[key];
    const actual = demandValue(demand, key);
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (expected !== actual) {
      return false;
    }
  }
  return true;
}

function specificity(rule) {
  return Object.keys(rule.match || {}).length;
}

function assertPins(assembled, pin) {
  if (!pin) {
    throw new Error("mapper_pin_required");
  }
  if (pin.catalog_contract !== CATALOG_CONTRACT) {
    throw new Error(`catalog_pin_contract:${pin.catalog_contract || "missing"}`);
  }
  if (pin.taxonomy_contract !== TAXONOMY_CONTRACT) {
    throw new Error(`taxonomy_pin_contract:${pin.taxonomy_contract || "missing"}`);
  }
  if (!pin.catalog_hash) throw new Error("catalog_pin_hash_missing");
  if (!pin.taxonomy_hash) throw new Error("taxonomy_pin_hash_missing");
  const recomputedCatalogHash = catalogContentHash(assembled);
  if (assembled.content_hash !== recomputedCatalogHash) {
    throw new Error("catalog_assembled_hash_mismatch");
  }
  if (pin.catalog_hash !== recomputedCatalogHash) {
    throw new Error("catalog_pin_hash_mismatch");
  }
  if (pin.taxonomy_hash !== assembled.taxonomy_hash) {
    throw new Error("taxonomy_pin_hash_mismatch");
  }
}

function knownOfferIds(assembled) {
  return new Set(assembled.offers.map((offer) => offer.offer_id));
}

function mapDemand(demand, options = {}) {
  const assembled = options.assembled || assembleCatalog({
    root: options.root,
    pin: options.catalogPin,
    taxonomyPin: options.taxonomyPin,
  });
  assertPins(assembled, options.pin);
  const known = knownOfferIds(assembled);
  const rules = assembled.boundaries.rules || [];
  const hits = rules.filter((rule) => matchRule(demand, rule)).sort((a, b) => specificity(b) - specificity(a));
  const top = hits[0] || null;
  const result = {
    demand_id: demand.demand_id,
    catalog_contract: assembled.contract,
    catalog_hash: assembled.content_hash,
    taxonomy_contract: assembled.taxonomy_contract,
    taxonomy_hash: assembled.taxonomy_hash,
    primary_offer_id: null,
    alternatives: [],
    gap: null,
  };

  if (!top) {
    result.gap = {
      gap_id: "GAP_UNMAPPED",
      reason: "no_boundary_rule_matched",
    };
    return result;
  }

  if (top.gap_id) {
    const registered = (assembled.gaps.gaps || []).find((gap) => gap.gap_id === top.gap_id);
    if (!registered) {
      throw new Error(`gap_not_registered:${top.gap_id}`);
    }
    result.gap = {
      gap_id: top.gap_id,
      reason: top.reason || registered.reason,
    };
    return result;
  }

  let primary = top.primary_offer_id || null;
  if (top.primary_from_field) {
    primary = demand[top.primary_from_field] || null;
  }
  if (!primary) {
    throw new Error(`rule_missing_primary:${top.rule_id || "unknown"}`);
  }
  if (!known.has(primary)) {
    throw new Error(`invented_offer_id:${primary}`);
  }

  const sameSpecificity = hits.filter((rule) => specificity(rule) === specificity(top) && !rule.gap_id);
  const distinctPrimaries = [...new Set(sameSpecificity.map((rule) => {
    if (rule.primary_from_field) return demand[rule.primary_from_field];
    return rule.primary_offer_id;
  }))];
  if (distinctPrimaries.length > 1) {
    throw new Error(`ambiguous_primary:${demand.demand_id}:${distinctPrimaries.join(",")}`);
  }

  result.primary_offer_id = primary;
  const alternatives = [];
  for (const extra of top.alternatives || []) {
    if (!extra.offer_id || !extra.justification) {
      throw new Error(`alternative_missing_justification:${top.rule_id}`);
    }
    if (extra.offer_id === result.primary_offer_id) continue;
    if (!known.has(extra.offer_id)) {
      throw new Error(`invented_alternative_id:${extra.offer_id}`);
    }
    alternatives.push({
      offer_id: extra.offer_id,
      justification: extra.justification,
    });
  }
  result.alternatives = alternatives;
  return result;
}

function mapDemands(demands, options = {}) {
  const assembled = options.assembled || assembleCatalog({
    root: options.root,
    pin: options.catalogPin,
    taxonomyPin: options.taxonomyPin,
  });
  const validation = validateCatalog(assembled);
  if (!validation.ok) {
    const error = new Error(`catalog_invalid:${validation.errors.join(",")}`);
    error.errors = validation.errors;
    throw error;
  }
  return demands.map((demand) => mapDemand(demand, { ...options, assembled }));
}

module.exports = {
  mapDemand,
  mapDemands,
  matchRule,
  assertPins,
};
