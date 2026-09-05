"use strict";

/**
 * Canonical identifiers for CONFENGE_OFFER_CATALOG/2.0.0-draft.20260904.
 * Campaign 03 owner. Not a second checkout catalog.
 */

const CATALOG_CONTRACT = "CONFENGE_OFFER_CATALOG/2.0.0-draft.20260904";
const TAXONOMY_CONTRACT = "CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904";
const INTAKE_CONTRACT = "CONFENGE_WEB_INTAKE/2.0.0-draft.20260904";
const ADMISSION_POLICY = "NET_NEW_INBOUND_HANDRAISER/1.0.0-draft.20260904";
const HANDRAISER_STATE = "CONFENGE_HANDRAISER_STATE/1.0.0-draft.20260904";
const MEETCFG_CONTEXT = "MEETCFG_HANDRAISER_CONTEXT/1.0.0-draft.20260904";

const SOURCE_LANE = "CONFENGE_WEB";
const OUTBOUND_ELIGIBLE = false;
const AUTO_SEND = false;

const PRIVATE_ASSET_ID = "private_project_technical_readiness_v1";
const CANARY_OFFER_ID = "private_project_technical_readiness_assessment";
const B2G_NEW_OFFER_ID = "public_works_technical_procurement_planning";

const NUCLEUS_IDS = Object.freeze([
  "expert_evidence_assistance",
  "property_valuation",
  "building_engineering_documentation",
  "occupational_safety",
  "public_works_b2g",
]);

const READINESS = Object.freeze([
  "MODELED",
  "PROOF_READY",
  "CAPACITY_UNKNOWN",
  "PUBLISHABLE",
  "WITHHELD",
]);

const WAVE_CLASSES = Object.freeze([
  "FIRST_WAVE_CANARY",
  "MODEL_ONLY",
  "WITHHELD_PROOF",
  "WITHHELD_CAPACITY",
  "RETAIN_B2G",
]);

const REQUIRED_OFFER_FIELDS = Object.freeze([
  "offer_id",
  "public_name",
  "nucleus_id",
  "buyer_job",
  "icp",
  "trigger_why_now",
  "supported_decision",
  "unit_of_work",
  "deliverables",
  "exclusions",
  "minimum_documents",
  "inspection_field_rule",
  "method_standard",
  "technical_responsibility",
  "invoice_nf",
  "sla_window",
  "urgency_rule",
  "revisions",
  "multidisciplinary_dependencies",
  "price_model",
  "paid_triage_rule",
  "acceptance_criteria",
  "proof_classes",
  "conflict_gate",
  "confidentiality_retention",
  "legitimate_cross_sell",
  "disqualification",
  "readiness",
  "wave_class",
]);

const MODELED_OFFER_IDS = Object.freeze([
  "pre_litigation_technical_screening",
  "civil_building_technical_assistance",
  "labor_sst_technical_assistance",
  "urban_property_valuation",
  "preliminary_property_opinion",
  "quantity_takeoff_budgeting",
  "budget_audit_feasibility",
  "bim_coordination_clash_register",
  "building_inspection_pathology",
  "renovation_plan_condo_review",
  "asbuilt_document_reconciliation",
  CANARY_OFFER_ID,
  "sst_risk_documentation_diagnosis",
  "sst_pgr_ltcat_aet_inputs",
  "sst_insalubrity_perilousness_analysis",
  "sst_preventive_audit",
  B2G_NEW_OFFER_ID,
]);

const CHECKOUT_OFFER_IDS = Object.freeze([
  "CFG-DIAG-EXP-v1",
  "CFG-DIRB2G-FLEX-v1",
  "CFG-DIRB2G-180-v1",
  "CFG-DIRB2G-365-v1",
]);

const FORBIDDEN_CLAIM_PATTERNS = Object.freeze([
  { id: "solucao_completa", re: /solu[cç][aã]o completa/i },
  { id: "laudo_incontestavel", re: /laudo incontest[aá]vel/i },
  { id: "garantia", re: /\bgarantia\b/i },
  { id: "escopo_aberto", re: /escopo aberto|demais documentos ilimitad/i },
]);

const TAXONOMY_CONSUME_PATHS = Object.freeze([
  "data/taxonomy/corporate-taxonomy.v1.json",
  "data/corporate/taxonomy.v1.json",
  "data/offers/taxonomy/corporate-taxonomy.v1.json",
  "docs/architecture/corporate-taxonomy.v1.json",
]);

const RELATIVE_PATHS = Object.freeze({
  catalog: "data/offers/multivertical/catalog.v2.json",
  taxonomyFixture: "data/offers/multivertical/taxonomy-fixture.v1.json",
  boundaries: "data/offers/multivertical/boundaries.v1.json",
  gaps: "data/offers/multivertical/gaps.v1.json",
  demands: "data/offers/multivertical/synthetic-demands.v1.json",
  deliverables: "data/commercial/deliverables-registry.v1.json",
  naming: "data/commercial/offer-naming.v1.json",
  checkout: "data/offers/catalog.snapshot.json",
  flags: "data/offers/flags.json",
});

module.exports = {
  CATALOG_CONTRACT,
  TAXONOMY_CONTRACT,
  INTAKE_CONTRACT,
  ADMISSION_POLICY,
  HANDRAISER_STATE,
  MEETCFG_CONTEXT,
  SOURCE_LANE,
  OUTBOUND_ELIGIBLE,
  AUTO_SEND,
  PRIVATE_ASSET_ID,
  CANARY_OFFER_ID,
  B2G_NEW_OFFER_ID,
  NUCLEUS_IDS,
  READINESS,
  WAVE_CLASSES,
  REQUIRED_OFFER_FIELDS,
  MODELED_OFFER_IDS,
  CHECKOUT_OFFER_IDS,
  FORBIDDEN_CLAIM_PATTERNS,
  TAXONOMY_CONSUME_PATHS,
  RELATIVE_PATHS,
};
