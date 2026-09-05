"use strict";

/**
 * Expand retained B2G authorities into catalog records without renaming or repricing.
 * Existing registries remain the source of names, IDs and frozen cents.
 */

const {
  CHECKOUT_OFFER_IDS,
} = require("./constants.cjs");

const B2G_DEFAULTS = Object.freeze({
  nucleus_id: "public_works_b2g",
  wave_class: "RETAIN_B2G",
  paid_triage_rule:
    "Triagem técnica paga não substitui o entregável B2G já nomeado. Enquadramento comercial usa o ID canônico existente.",
  urgency_rule:
    "Urgência segue a proposta da oferta retida; prazo público só existe quando já autorizado no registry B2G.",
  conflict_gate:
    "Não atender simultaneamente ente licitante e Administração no mesmo certame. Conflito é checado antes da proposta.",
  confidentiality_retention:
    "Insumos e entregas seguem o contrato da oferta retida e a política de retenção CONFENGE; sem PII em analytics.",
  invoice_nf: {
    issued: true,
    when: "serviço técnico contratado da oferta B2G retida",
  },
  technical_responsibility: {
    art_rule:
      "ART somente quando o escopo contratado for serviço técnico de atribuição; não é selo genérico de todo item do rol.",
    responsible: "profissional habilitado no recorte da oferta retida",
    not_promised_for: ["ato administrativo", "parecer jurídico", "decisão da Administração"],
  },
});

function readinessFromPublicState(publicState) {
  if (publicState === "PUBLISHED") return "PUBLISHABLE";
  if (publicState === "BLOCKED") return "WITHHELD";
  return "MODELED";
}

function slaFromDeliverable(entry) {
  const sla = entry.sla || {};
  const authorized = Number.isFinite(sla.business_days_min) || Number.isFinite(sla.business_days_max);
  if (!authorized) {
    return { state: "UNKNOWN", public_days: null, reason: "sla_not_authorized_on_retained_entry" };
  }
  return {
    state: "RETAINED",
    public_days: {
      min: sla.business_days_min,
      max: sla.business_days_max,
    },
    starts_after: sla.starts_after || null,
    reason: "copied_from_deliverables_registry_without_change",
  };
}

function retainedAmountCents(price) {
  if (!price || typeof price !== "object") return null;
  if (typeof price.amount_cents === "number") return price.amount_cents;
  return null;
}

function expandDeliverable(entry, catalogDefaults) {
  const publishedFirm = entry.price_state === "PUBLISHED_FIRM";
  return {
    offer_id: entry.deliverable_id,
    public_name: entry.public_name_pt_br || entry.public_name,
    nucleus_id: "public_works_b2g",
    buyer_job: entry.decision_question,
    icp: ["construtora de obras públicas", "empresa de engenharia em licitações", "diretoria de contratos públicos"],
    trigger_why_now: entry.trigger,
    supported_decision: entry.decision_question,
    unit_of_work: (entry.scope && entry.scope.unit) || "unidade definida no registry B2G",
    deliverables: entry.included_outputs || [],
    exclusions: entry.exclusions || [],
    minimum_documents: entry.required_inputs || [],
    inspection_field_rule: {
      included_by_default: false,
      when_required: "somente se o registry/proposta da oferta retida exigir campo",
      output: "registro de campo da oferta retida, quando houver",
    },
    method_standard: {
      applicable: true,
      refs: ["autoridade B2G vigente no deliverables-registry"],
      note: "Método e norma permanecem no registry #329/#343; esta expansão não os reescreve.",
    },
    technical_responsibility: B2G_DEFAULTS.technical_responsibility,
    invoice_nf: B2G_DEFAULTS.invoice_nf,
    sla_window: slaFromDeliverable(entry),
    urgency_rule: B2G_DEFAULTS.urgency_rule,
    revisions: {
      included_rounds: catalogDefaults.revisions_included_rounds,
      client_window_business_days: catalogDefaults.client_review_window_business_days,
      scope_change: "change_order",
    },
    multidisciplinary_dependencies: ["jurídico do cliente quando o objeto for disputa", "dados extra-cli quando a evidência for pública"],
    price_model: {
      publication: publishedFirm ? "RETAINED_PUBLISHED" : "RETAINED_AUTHORITY",
      public_amount_cents: retainedAmountCents(entry.price),
      retained_price: entry.price || null,
      public_range: null,
      currency: (entry.price && entry.price.currency) || "BRL",
      basis: "retained_b2g_registry",
      policy: "#341",
      ticket_class: "retained_published",
      primary_unit: "fixed_scope_unit_not_hourly",
    },
    paid_triage_rule: B2G_DEFAULTS.paid_triage_rule,
    acceptance_criteria: entry.included_outputs || [],
    proof_classes: ["retained_b2g_registry"],
    conflict_gate: B2G_DEFAULTS.conflict_gate,
    confidentiality_retention: B2G_DEFAULTS.confidentiality_retention,
    legitimate_cross_sell: [],
    disqualification: ["demanda que exige novo ID paralelo", "renomear a oferta por estética"],
    readiness: readinessFromPublicState(entry.public_state),
    wave_class: "RETAIN_B2G",
    retained: {
      kind: "deliverable",
      authority_path: "data/commercial/deliverables-registry.v1.json",
      catalog_number: entry.catalog_number,
      public_state: entry.public_state,
      price_state: entry.price_state,
    },
  };
}

function expandCheckout(offer, catalogDefaults) {
  return {
    offer_id: offer.offer_id,
    public_name: offer.public_name,
    nucleus_id: "public_works_b2g",
    buyer_job: "Contratar o contêiner comercial B2G já congelado no checkout.",
    icp: ["empresa que já escolheu Diagnóstico de Expansão ou Diretoria Fracionada"],
    trigger_why_now: "A empresa quer o contêiner comercial já nomeado, sem criar SKU paralelo.",
    supported_decision: "Seguir o checkout congelado da oferta retida.",
    unit_of_work: offer.billing_mode === "subscription" ? "ciclo mensal da Diretoria Fracionada" : "pacote único do Diagnóstico de Expansão",
    deliverables: ["escopo da oferta congelada em catalog.snapshot.json"],
    exclusions: ["oferta extra histórica não serializável", "novo preço inventado", "publicação de catálogo multi-vertical"],
    minimum_documents: ["CNPJ", "representante", "aceite de termos da oferta retida"],
    inspection_field_rule: {
      included_by_default: false,
      when_required: "não incluso por padrão no checkout congelado",
      output: "não aplicável",
    },
    method_standard: {
      applicable: false,
      refs: [],
      note: "Contêiner comercial; método técnico permanece nos entregáveis compostos.",
    },
    technical_responsibility: B2G_DEFAULTS.technical_responsibility,
    invoice_nf: B2G_DEFAULTS.invoice_nf,
    sla_window: offer.sla_business_days
      ? { state: "RETAINED", public_days: offer.sla_business_days, reason: "copied_from_checkout_snapshot_without_change" }
      : { state: "UNKNOWN", public_days: null, reason: "sla_not_on_checkout_offer" },
    urgency_rule: B2G_DEFAULTS.urgency_rule,
    revisions: {
      included_rounds: catalogDefaults.revisions_included_rounds,
      client_window_business_days: catalogDefaults.client_review_window_business_days,
      scope_change: "change_order",
    },
    multidisciplinary_dependencies: [],
    price_model: {
      publication: "RETAINED_PUBLISHED",
      public_amount_cents: offer.amount_cents,
      public_range: null,
      currency: offer.currency || "BRL",
      basis: "retained_checkout_snapshot",
      policy: "#341",
      ticket_class: "retained_published",
      primary_unit: "fixed_scope_unit_not_hourly",
    },
    paid_triage_rule: B2G_DEFAULTS.paid_triage_rule,
    acceptance_criteria: ["elegibilidade e termos da oferta congelada"],
    proof_classes: ["retained_checkout_snapshot"],
    conflict_gate: B2G_DEFAULTS.conflict_gate,
    confidentiality_retention: B2G_DEFAULTS.confidentiality_retention,
    legitimate_cross_sell: [],
    disqualification: ["CFG-DIRB2G-EXTRA-HIST-v1 como oferta pública"],
    readiness: "PUBLISHABLE",
    wave_class: "RETAIN_B2G",
    retained: {
      kind: "checkout",
      authority_path: "data/offers/catalog.snapshot.json",
      billing_mode: offer.billing_mode,
      status: offer.status,
    },
  };
}

function expandRetainedB2G({ catalog, deliverables, checkout }) {
  const defaults = catalog.retained_b2g.defaults;
  const fromDeliverables = deliverables.deliverables.map((entry) => expandDeliverable(entry, defaults));
  const checkoutById = new Map((checkout.offers || []).map((offer) => [offer.offer_id, offer]));
  const fromCheckout = CHECKOUT_OFFER_IDS.map((id) => {
    const offer = checkoutById.get(id);
    if (!offer) throw new Error(`retained_checkout_missing:${id}`);
    return expandCheckout(offer, defaults);
  });
  return { deliverable_offers: fromDeliverables, checkout_offers: fromCheckout };
}

module.exports = {
  B2G_DEFAULTS,
  expandRetainedB2G,
  expandDeliverable,
  expandCheckout,
  readinessFromPublicState,
  retainedAmountCents,
};
