/**
 * Read-only projection of public commercial truth keyed by offer_id.
 *
 * Amounts always come from catalog.snapshot.json or deliverables-registry.v1.json.
 * This module does not invent prices, capacity or checkout availability.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const TRUTH_PATH = path.join(root, "data/commercial/public-offer-truth.v1.json");
export const SNAPSHOT_PATH = path.join(root, "data/offers/catalog.snapshot.json");
export const REGISTRY_PATH = path.join(root, "data/commercial/deliverables-registry.v1.json");

export function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function brl(cents) {
  if (!Number.isInteger(cents)) {
    throw new Error(`public_offer_truth: amount is not an integer cent value: ${cents}`);
  }
  return `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(cents / 100)}`;
}

export function destinationTypeOfHref(href) {
  const value = String(href || "").trim();
  if (!value) return "unknown";
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(value) || /whatsapp/i.test(value)) return "whatsapp";
  if (/^mailto:/i.test(value)) return "mailto";
  if (/^#/.test(value) || /#captura|#pedido|#formulario|#contato/i.test(value)) return "form";
  if (/^\/#/.test(value) || /\/\?.*#contato/i.test(value)) return "form";
  if (/^https?:\/\//i.test(value)) return "external";
  if (/^\//.test(value)) return "internal";
  return "unknown";
}

function catalogOffer(snapshot, offerId) {
  return (snapshot.offers || []).find((item) => item.offer_id === offerId) || null;
}

function deliverable(registry, offerId) {
  return (registry.deliverables || []).find((item) => item.deliverable_id === offerId) || null;
}

function container(registry, containerId) {
  return (registry.containers || []).find((item) => item.container_id === containerId) || null;
}

function priceFromDeliverable(entry) {
  if (!entry?.price) return null;
  if (Array.isArray(entry.price.tiers) && entry.price.tiers.length) {
    const cents = entry.price.tiers.map((tier) => tier.amount_cents);
    return {
      kind: "band",
      min_cents: Math.min(...cents),
      max_cents: Math.max(...cents),
      currency: entry.price.currency || "BRL",
      billing: entry.price.billing,
      tiers: entry.price.tiers.map((tier) => ({
        tier: tier.tier,
        amount_cents: tier.amount_cents,
        framing: tier.framing,
      })),
      display: `${brl(Math.min(...cents))} a ${brl(Math.max(...cents))}`,
    };
  }
  return {
    kind: "point",
    amount_cents: entry.price.amount_cents,
    currency: entry.price.currency || "BRL",
    billing: entry.price.billing,
    display: brl(entry.price.amount_cents),
  };
}

function slaFromDeliverable(entry) {
  const sla = entry?.sla || {};
  if (sla.business_days_min == null && sla.business_days_max == null) {
    return {
      display: sla.starts_after === "triagem de enquadramento"
        ? "Definido na triagem de enquadramento"
        : `Definido na triagem; início após ${sla.starts_after || "insumos válidos"}`,
      starts_after: sla.starts_after || null,
      min: null,
      max: null,
    };
  }
  const min = sla.business_days_min;
  const max = sla.business_days_max;
  const days = min === max ? `${min} dias úteis` : `${min} a ${max} dias úteis`;
  return {
    display: `${days}, após ${sla.starts_after}`,
    starts_after: sla.starts_after,
    min,
    max,
  };
}

export function formatUrgencyStatement(registry) {
  const pct = registry.common_rules.urgency_surcharge_pct;
  const d17 = deliverable(registry, "CFG-D17");
  const base = d17.price.amount_cents;
  const extra = Math.round(base * (pct / 100));
  const total = base + extra;
  const sla = d17.sla.business_days_max;
  return {
    percent: pct,
    denominator: "preço-piloto ou preço publicado daquela entrega",
    condition: "prazo inferior ao SLA, capacidade confirmada e adicional pago antes de começar; a capacidade pode recusar",
    example_offer_id: "CFG-D17",
    example_base_cents: base,
    example_extra_cents: extra,
    example_total_cents: total,
    statement:
      `Urgência abaixo do SLA só entra com capacidade confirmada e adicional de ${pct} por cento sobre o preço-piloto ou preço publicado daquela entrega, pago antes de começar. ` +
      `Exemplo: ${d17.public_name_pt_br} a ${brl(base)} em ${sla} dias úteis; se a capacidade aceitar 2 dias úteis, o adicional é ${brl(extra)} e o total fica ${brl(total)}. ` +
      `A capacidade pode recusar a urgência.`,
  };
}

function resolveCatalogOffer(overlay, snapshot, registry) {
  const source = catalogOffer(snapshot, overlay.offer_id);
  if (!source) throw new Error(`missing catalog offer ${overlay.offer_id}`);
  const containerMatch = (registry.containers || []).find((item) =>
    (item.plans || []).some((plan) => plan.offer_id === overlay.offer_id),
  );
  return {
    ...overlay,
    public_name: containerMatch?.public_name_pt_br || source.public_name.replace(/^CONFENGE - /, ""),
    icp: "Construtoras e empresas de engenharia com atuação em obras públicas",
    price: {
      kind: "point",
      amount_cents: source.amount_cents,
      currency: source.currency,
      billing: source.billing_mode,
      display: brl(source.amount_cents),
    },
    prazo: {
      display: source.sla_business_days
        ? `${String(source.sla_business_days).replace("-", " a ")} dias úteis após aceite, confirmação financeira e insumos`
        : "Conforme plano publicado",
      sla_business_days: source.sla_business_days || null,
    },
    capacity_required: source.capacity_required,
    checkout_enabled: false,
    price_state: containerMatch?.price_state || "PUBLISHED_FIRM",
  };
}

function resolveContainer(overlay, snapshot, registry) {
  const box = container(registry, overlay.offer_id);
  if (!box) throw new Error(`missing container ${overlay.offer_id}`);
  const plans = overlay.plan_offer_ids.map((id) => {
    const frozen = catalogOffer(snapshot, id);
    if (!frozen) throw new Error(`missing plan ${id}`);
    const plan = (box.plans || []).find((item) => item.offer_id === id);
    if (!plan) throw new Error(`container plan missing ${id}`);
    if (plan.amount_cents !== frozen.amount_cents) {
      throw new Error(`container/catalog amount drift for ${id}`);
    }
    return {
      offer_id: id,
      public_name: plan.public_name,
      amount_cents: frozen.amount_cents,
      display: `${brl(frozen.amount_cents)} por mês`,
      billing: frozen.billing_mode,
      commitment_months: frozen.commitment_months,
      total_commitment_cents: frozen.total_commitment_cents,
      notice_days: frozen.notice_days,
    };
  });
  const cents = plans.map((plan) => plan.amount_cents);
  return {
    ...overlay,
    public_name: box.public_name_pt_br,
    icp: "Construtoras e empresas de engenharia com atuação pública ativa",
    price: {
      kind: "band",
      min_cents: Math.min(...cents),
      max_cents: Math.max(...cents),
      currency: "BRL",
      billing: "subscription_monthly",
      display: `${brl(Math.min(...cents))} a ${brl(Math.max(...cents))} por mês`,
      plans,
    },
    prazo: {
      display: "Rotina semanal; início após aceite, capacidade confirmada e insumos",
    },
    capacity_required: box.capacity_required,
    checkout_enabled: false,
    price_state: box.price_state,
  };
}

function resolveDeliverable(overlay, registry) {
  const entry = deliverable(registry, overlay.offer_id);
  if (!entry) throw new Error(`missing deliverable ${overlay.offer_id}`);
  return {
    ...overlay,
    public_name: entry.public_name_pt_br,
    icp: entry.trigger,
    input: entry.required_inputs,
    output: entry.included_outputs,
    limits: entry.exclusions,
    price: priceFromDeliverable(entry),
    prazo: slaFromDeliverable(entry),
    capacity_required: entry.capacity_required,
    checkout_enabled: entry.checkout_enabled === true,
    price_state: entry.price_state,
    registry_public_state: entry.public_state,
  };
}

export function loadPublicOfferTruth({ rootDir = root } = {}) {
  const overlay = loadJson(path.join(rootDir, "data/commercial/public-offer-truth.v1.json"));
  const snapshot = loadJson(path.join(rootDir, "data/offers/catalog.snapshot.json"));
  const registry = loadJson(path.join(rootDir, "data/commercial/deliverables-registry.v1.json"));
  if (overlay.offers.some((item) => "amount_cents" in item || "price" in item && item.price?.amount_cents)) {
    throw new Error("public-offer-truth overlay must not carry amounts");
  }
  const urgency = formatUrgencyStatement(registry);
  const offers = overlay.offers.map((item) => {
    if (item.source === "checkout_catalog") return resolveCatalogOffer(item, snapshot, registry);
    if (item.source === "deliverables.containers") return resolveContainer(item, snapshot, registry);
    if (item.source === "deliverables") return resolveDeliverable(item, registry);
    throw new Error(`unknown source ${item.source} for ${item.offer_id}`);
  });
  const byId = new Map(offers.map((item) => [item.offer_id, item]));
  const byRoute = new Map(offers.map((item) => [item.route, item]));
  for (const offer of offers) {
    for (const alias of offer.slug_aliases || []) {
      byRoute.set(`/${alias}/`, offer);
    }
  }
  return {
    overlay,
    snapshot,
    registry,
    urgency,
    offers,
    hub: overlay.hub,
    ctaLabels: overlay.cta_labels,
    byId,
    byRoute,
  };
}

export function expectedVisiblePrice(offer) {
  if (!offer.page_publishes_price) return null;
  if (offer.page_price_as === "screening_band") {
    return {
      display: offer.price.display,
      condition: offer.buyable_note,
    };
  }
  if (offer.page_price_as === "pilot") {
    return {
      display: `Preço-piloto ${offer.price.display}`,
      condition: offer.buyable_note,
    };
  }
  return {
    display: offer.price.display,
    condition: offer.buyable_note,
  };
}

export function jsonLdPrices(offer) {
  if (!offer.jsonld_offer_price) return [];
  if (offer.price.plans) {
    return offer.price.plans.map((plan) => String(plan.amount_cents / 100));
  }
  if (offer.price.kind === "point") return [String(offer.price.amount_cents / 100)];
  return [String(offer.price.min_cents / 100), String(offer.price.max_cents / 100)];
}
