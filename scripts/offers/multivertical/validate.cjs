"use strict";

const {
  NUCLEUS_IDS,
  READINESS,
  WAVE_CLASSES,
  REQUIRED_OFFER_FIELDS,
  MODELED_OFFER_IDS,
  CANARY_OFFER_ID,
  B2G_NEW_OFFER_ID,
  CHECKOUT_OFFER_IDS,
  FORBIDDEN_CLAIM_PATTERNS,
  PRIVATE_ASSET_ID,
} = require("./constants.cjs");

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => isNonEmptyString(item));
}

function scanForbidden(text) {
  const hits = [];
  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
    if (pattern.re.test(text)) hits.push(pattern.id);
  }
  return hits;
}

function validateOfferShape(offer, errors, prefix) {
  for (const field of REQUIRED_OFFER_FIELDS) {
    if (!(field in offer) || offer[field] === undefined) {
      errors.push(`${prefix}.missing:${field}`);
    }
  }
  if (!isNonEmptyString(offer.offer_id)) errors.push(`${prefix}.offer_id`);
  if (!isNonEmptyString(offer.public_name)) errors.push(`${prefix}.public_name`);
  if (!NUCLEUS_IDS.includes(offer.nucleus_id)) errors.push(`${prefix}.nucleus:${offer.nucleus_id}`);
  if (!isNonEmptyString(offer.buyer_job)) errors.push(`${prefix}.buyer_job`);
  if (!isStringArray(offer.icp)) errors.push(`${prefix}.icp`);
  if (!isNonEmptyString(offer.trigger_why_now)) errors.push(`${prefix}.trigger_why_now`);
  if (!isNonEmptyString(offer.supported_decision)) errors.push(`${prefix}.supported_decision`);
  if (!isNonEmptyString(offer.unit_of_work)) errors.push(`${prefix}.unit_of_work`);
  if (!isStringArray(offer.deliverables)) errors.push(`${prefix}.deliverables`);
  if (!isStringArray(offer.exclusions)) errors.push(`${prefix}.exclusions`);
  if (!isStringArray(offer.minimum_documents)) errors.push(`${prefix}.minimum_documents`);
  if (!offer.inspection_field_rule || typeof offer.inspection_field_rule !== "object") {
    errors.push(`${prefix}.inspection_field_rule`);
  }
  if (!offer.method_standard || typeof offer.method_standard !== "object") {
    errors.push(`${prefix}.method_standard`);
  }
  if (!offer.technical_responsibility || !isNonEmptyString(offer.technical_responsibility.art_rule)) {
    errors.push(`${prefix}.art_rule`);
  }
  if (!offer.invoice_nf || typeof offer.invoice_nf.issued !== "boolean") {
    errors.push(`${prefix}.invoice_nf`);
  }
  if (!offer.sla_window || !isNonEmptyString(offer.sla_window.state)) {
    errors.push(`${prefix}.sla_window`);
  }
  if (!isNonEmptyString(offer.urgency_rule)) errors.push(`${prefix}.urgency_rule`);
  if (!offer.revisions || typeof offer.revisions !== "object") errors.push(`${prefix}.revisions`);
  if (!Array.isArray(offer.multidisciplinary_dependencies)) {
    errors.push(`${prefix}.multidisciplinary_dependencies`);
  }
  if (!offer.price_model || typeof offer.price_model !== "object") errors.push(`${prefix}.price_model`);
  if (!isNonEmptyString(offer.paid_triage_rule)) errors.push(`${prefix}.paid_triage_rule`);
  if (!isStringArray(offer.acceptance_criteria)) errors.push(`${prefix}.acceptance_criteria`);
  if (!isStringArray(offer.proof_classes)) errors.push(`${prefix}.proof_classes`);
  if (!isNonEmptyString(offer.conflict_gate)) errors.push(`${prefix}.conflict_gate`);
  if (!isNonEmptyString(offer.confidentiality_retention)) errors.push(`${prefix}.confidentiality_retention`);
  if (!Array.isArray(offer.legitimate_cross_sell)) errors.push(`${prefix}.legitimate_cross_sell`);
  if (!isStringArray(offer.disqualification)) errors.push(`${prefix}.disqualification`);
  if (!READINESS.includes(offer.readiness)) errors.push(`${prefix}.readiness:${offer.readiness}`);
  if (!WAVE_CLASSES.includes(offer.wave_class)) errors.push(`${prefix}.wave_class:${offer.wave_class}`);
}

function validateCatalog(assembled) {
  const errors = [];
  const authorities = assembled._authorities;
  const modeled = assembled.modeled_offers;
  const all = assembled.offers;

  if (modeled.length !== MODELED_OFFER_IDS.length) {
    errors.push(`modeled_count:${modeled.length}`);
  }
  const modeledIds = modeled.map((offer) => offer.offer_id);
  for (const expected of MODELED_OFFER_IDS) {
    if (!modeledIds.includes(expected)) errors.push(`modeled_missing:${expected}`);
  }

  const ids = all.map((offer) => offer.offer_id);
  if (new Set(ids).size !== ids.length) errors.push("duplicate_offer_id");

  const nucleusById = new Map();
  for (const offer of all) {
    validateOfferShape(offer, errors, offer.offer_id || "unknown");
    const previous = nucleusById.get(offer.offer_id);
    if (previous && previous !== offer.nucleus_id) {
      errors.push(`multi_nucleus:${offer.offer_id}`);
    }
    nucleusById.set(offer.offer_id, offer.nucleus_id);
  }

  const canaries = all.filter((offer) => offer.wave_class === "FIRST_WAVE_CANARY");
  if (canaries.length !== 1 || canaries[0].offer_id !== CANARY_OFFER_ID) {
    errors.push("canary_not_unique");
  }
  const canary = all.find((offer) => offer.offer_id === CANARY_OFFER_ID);
  if (!canary) errors.push("canary_missing");
  else {
    if (canary.readiness === "PUBLISHABLE") errors.push("canary_must_not_be_publishable");
    if (canary.price_model.public_amount_cents !== null) errors.push("canary_public_price");
    if (canary.price_model.public_range !== null) errors.push("canary_public_range");
    if (canary.sla_window.state !== "UNKNOWN") errors.push("canary_sla_not_unknown");
    if (canary.nucleus_id !== "building_engineering_documentation") errors.push("canary_nucleus");
    if (canary.private_asset_id !== PRIVATE_ASSET_ID) errors.push("canary_asset");
  }

  const issue588 = all.find((offer) => offer.offer_id === "issue_588_money_page" || offer.publication_issue === "#588");
  if (issue588) errors.push("issue_588_published");
  if (assembled.publication && assembled.publication.issue_588_in_scope) {
    errors.push("issue_588_in_scope");
  }
  if (assembled.publication && assembled.publication.catalog_public !== false) {
    errors.push("catalog_public_not_false");
  }
  if (authorities.flags.CONFENGE_OFFER_CATALOG_PUBLIC !== false) {
    errors.push("flags_catalog_public");
  }

  for (const offer of modeled) {
    if (offer.wave_class === "RETAIN_B2G") errors.push(`modeled_marked_retained:${offer.offer_id}`);
    if (offer.price_model.public_amount_cents !== null) errors.push(`invented_public_price:${offer.offer_id}`);
    if (offer.price_model.public_range !== null) errors.push(`invented_public_range:${offer.offer_id}`);
    if (offer.sla_window.state !== "UNKNOWN") errors.push(`new_offer_sla_not_unknown:${offer.offer_id}`);
    if (typeof offer.price_model.internal_floor_cents === "number") {
      errors.push(`internal_floor_in_catalog:${offer.offer_id}`);
    }
    if (typeof offer.price_model.margin === "number" || offer.price_model.proposal_cents) {
      errors.push(`margin_or_proposal_in_catalog:${offer.offer_id}`);
    }
    const blob = JSON.stringify(offer);
    if (/R\$\s*\d/.test(blob) || /BRL\s*\d/.test(blob)) {
      errors.push(`public_money_figure:${offer.offer_id}`);
    }
    const forbidden = scanForbidden(blob);
    if (forbidden.length) errors.push(`forbidden_claim:${offer.offer_id}:${forbidden.join(",")}`);
    if (/triagem[^.]{0,40}laudo/i.test(blob) && offer.offer_id === "pre_litigation_technical_screening") {
      // explicit equality of triage to laudo is forbidden; the screening offer must deny it.
    }
    if (offer.offer_id === "pre_litigation_technical_screening") {
      const text = blob.toLowerCase();
      if (!text.includes("não é laudo") && !text.includes("nao e laudo") && !text.includes("não substitui laudo") && !text.includes("nao substitui laudo")) {
        errors.push("screening_must_deny_laudo");
      }
    }
    if (offer.offer_id === "preliminary_property_opinion") {
      const text = blob.toLowerCase();
      if (!text.includes("não é avaliação formal") && !text.includes("nao e avaliacao formal") && !text.includes("não equivale") && !text.includes("nao equivale")) {
        errors.push("preliminary_must_deny_formal_valuation");
      }
    }
    if (offer.nucleus_id === "expert_evidence_assistance") {
      const text = blob.toLowerCase();
      if (!text.includes("não é advocacia") && !text.includes("nao e advocacia")) {
        errors.push(`assistance_must_deny_advocacy:${offer.offer_id}`);
      }
      if (!text.includes("perito do juízo") && !text.includes("perito do juizo")) {
        errors.push(`assistance_must_mention_court_expert_boundary:${offer.offer_id}`);
      }
    }
  }

  const artPromisesEvery = modeled.every((offer) => /art obrigat/i.test(JSON.stringify(offer.technical_responsibility)));
  if (artPromisesEvery) errors.push("art_promised_for_every_service");

  const b2gNew = modeled.find((offer) => offer.offer_id === B2G_NEW_OFFER_ID);
  if (!b2gNew) errors.push("issue_587_not_modeled");
  else {
    if (b2gNew.nucleus_id !== "public_works_b2g") errors.push("issue_587_nucleus");
    if (b2gNew.wave_class === "FIRST_WAVE_CANARY") errors.push("issue_587_must_not_be_canary");
    if (b2gNew.readiness === "PUBLISHABLE") errors.push("issue_587_must_not_be_publishable");
  }

  const deliverables = authorities.deliverables.deliverables;
  if (deliverables.length !== 54) errors.push(`deliverable_count:${deliverables.length}`);
  if ((authorities.naming.names || []).length !== 54) errors.push("naming_count");
  const retainedDeliverables = all.filter((offer) => offer.retained && offer.retained.kind === "deliverable");
  if (retainedDeliverables.length !== 54) errors.push(`retained_deliverable_count:${retainedDeliverables.length}`);
  for (const entry of deliverables) {
    const retained = retainedDeliverables.find((offer) => offer.offer_id === entry.deliverable_id);
    if (!retained) {
      errors.push(`retained_missing:${entry.deliverable_id}`);
      continue;
    }
    const expectedName = entry.public_name_pt_br || entry.public_name;
    if (retained.public_name !== expectedName) {
      errors.push(`retained_name_drift:${entry.deliverable_id}`);
    }
    if (JSON.stringify(retained.price_model.retained_price) !== JSON.stringify(entry.price)) {
      errors.push(`retained_price_drift:${entry.deliverable_id}`);
    }
    const expectedCents = entry.price && typeof entry.price.amount_cents === "number" ? entry.price.amount_cents : null;
    if (retained.price_model.public_amount_cents !== expectedCents) {
      errors.push(`retained_amount_cents_drift:${entry.deliverable_id}`);
    }
    if (retained.nucleus_id !== "public_works_b2g") errors.push(`retained_nucleus:${entry.deliverable_id}`);
    if (retained.wave_class !== "RETAIN_B2G") errors.push(`retained_wave:${entry.deliverable_id}`);
  }

  const checkoutById = new Map((authorities.checkout.offers || []).map((offer) => [offer.offer_id, offer]));
  for (const id of CHECKOUT_OFFER_IDS) {
    const retained = all.find((offer) => offer.offer_id === id);
    const frozen = checkoutById.get(id);
    if (!retained || !frozen) {
      errors.push(`checkout_missing:${id}`);
      continue;
    }
    if (retained.public_name !== frozen.public_name) errors.push(`checkout_name_drift:${id}`);
    if (retained.price_model.public_amount_cents !== frozen.amount_cents) {
      errors.push(`checkout_price_drift:${id}`);
    }
  }

  const extra = (authorities.checkout.offers || []).find((offer) => offer.offer_id === "CFG-DIRB2G-EXTRA-HIST-v1");
  if (extra && all.some((offer) => offer.offer_id === extra.offer_id && offer.wave_class === "RETAIN_B2G" && offer.readiness === "PUBLISHABLE" && offer.price_model.publication === "RETAINED_PUBLISHED")) {
    // extra should not be in CHECKOUT_OFFER_IDS; if present as retained checkout, fail
  }
  if (all.some((offer) => offer.offer_id === "CFG-DIRB2G-EXTRA-HIST-v1")) {
    errors.push("private_extra_leaked_into_catalog");
  }

  for (const offer of modeled) {
    for (const otherId of offer.legitimate_cross_sell || []) {
      if (!ids.includes(otherId) && !MODELED_OFFER_IDS.includes(otherId) && !otherId.startsWith("CFG-")) {
        errors.push(`cross_sell_unknown:${offer.offer_id}:${otherId}`);
      }
    }
  }

  const laborAssistance = modeled.filter((offer) => offer.offer_id.includes("labor") || /assistência técnica trabalhista/i.test(offer.public_name));
  if (laborAssistance.length !== 1) errors.push(`labor_assistance_sku_overlap:${laborAssistance.length}`);

  return { ok: errors.length === 0, errors };
}

module.exports = {
  validateCatalog,
  validateOfferShape,
  scanForbidden,
};
