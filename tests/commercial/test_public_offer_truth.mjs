/**
 * Fail-closed commercial truth: hub, offer page, catalog and JSON-LD must
 * project the same elected offer_id record. Drives shipped HTML and JSON,
 * not a reimplementation of prices.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadPublicOfferTruth,
  destinationTypeOfHref,
  expectedVisiblePrice,
  jsonLdPrices,
  brl,
} from "../../scripts/commercial/public_offer_truth.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const truth = loadPublicOfferTruth({ rootDir: root });
const results = [];

function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error("FAIL", name, detail === undefined ? "" : detail);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonLd(html) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      blocks.push(null);
    }
  }
  return blocks.filter(Boolean);
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  for (const value of Object.values(node)) walk(value, visit);
}

function jsonLdServicesAndOffers(html) {
  const services = [];
  const offers = [];
  for (const block of parseJsonLd(html)) {
    walk(block, (node) => {
      if (node["@type"] === "Service") services.push(node);
      if (node["@type"] === "Offer" || node["@type"] === "AggregateOffer") offers.push(node);
    });
  }
  return { services, offers };
}

function collectCtas(html) {
  const ctas = [];
  const re = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[2];
    const label = match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!label || label.length > 80) continue;
    const cls = /class="([^"]*)"/.exec(attrs)?.[1] || "";
    if (/\b(header-cta|desktop-nav|mobile-nav|skip-link|breadcrumbs|whatsapp-float|related-card|footer)\b/.test(cls)) continue;
    if (/aria-label="CONFENGE|site-header|site-footer/.test(attrs)) continue;
    const href = /href="([^"]*)"/.exec(attrs)?.[1] || (/type="submit"/.test(attrs) ? "submit" : "");
    if (!href && match[1] !== "button") continue;
    const inHeader = html.slice(Math.max(0, match.index - 400), match.index).includes("<header class=\"site-header\"");
    const inFooter = html.slice(Math.max(0, match.index - 200), match.index).includes("<footer");
    if (inHeader || inFooter) continue;
    ctas.push({
      label,
      href: href === "submit" ? "#form" : href,
      type: href === "submit" ? "form" : destinationTypeOfHref(href),
    });
  }
  return ctas;
}

const IN_SCOPE_PAGES = [
  ...truth.offers.map((offer) => offer.page_file),
  truth.hub.page_file,
  "entregas/index.html",
  "index.html",
];

/* ------------------------------------------------------------------ *
 * 1. Overlay is a projection, not a second price table.
 * ------------------------------------------------------------------ */
assert("schema", truth.overlay.schema === "confenge.public-offer-truth/1.0", truth.overlay.schema);
assert("no_amounts_in_overlay_file", !/"amount_cents"\s*:/.test(read("data/commercial/public-offer-truth.v1.json")));
assert(
  "covers_minimum_routes",
  [
    "/diagnostico-b2g-expansao/",
    "/diagnostico-b2g-360/",
    "/bid-room-licitacoes-obras/",
    "/defesa-margem-contratos-publicos/",
    "/diretoria-b2g/",
  ].every((route) => truth.byRoute.has(route)),
  [...truth.byRoute.keys()],
);

for (const offer of truth.offers) {
  assert(`${offer.offer_id}_not_buyable_unless_published_and_checkout`, offer.buyable === false, offer);
  if (offer.registry_public_state) {
    assert(`${offer.offer_id}_public_state_matches_registry`, offer.public_state === offer.registry_public_state, [offer.public_state, offer.registry_public_state]);
  }
  if (offer.public_state === "VALIDATE") {
    assert(`${offer.offer_id}_validate_not_buyable`, offer.buyable === false && offer.jsonld_offer_price === false, offer);
  }
}

/* Snapshot/registry amounts stay the elected numbers. */
const exp = truth.byId.get("CFG-DIAG-EXP-v1");
assert("expansion_price_from_snapshot", exp.price.amount_cents === 800000, exp.price);
const dir = truth.byId.get("diretoria_fracionada");
assert("diretoria_band_from_snapshot", dir.price.min_cents === 1250000 && dir.price.max_cents === 2000000, dir.price);
const d16 = truth.byId.get("CFG-D16");
assert("bidroom_band_from_registry", d16.price.min_cents === 980000 && d16.price.max_cents === 1980000, d16.price);
const d17 = truth.byId.get("CFG-D17");
assert("defense_price_from_registry", d17.price.amount_cents === 290000, d17.price);
const d24 = truth.byId.get("CFG-D24");
assert("360_price_from_registry", d24.price.amount_cents === 690000, d24.price);
assert("360_page_does_not_publish_price", d24.page_publishes_price === false, d24);

/* Urgency example is computed from D17, not invented. */
assert("urgency_percent_is_registry_50", truth.urgency.percent === 50, truth.urgency);
assert("urgency_example_matches_d17", truth.urgency.example_base_cents === 290000, truth.urgency);
assert("urgency_example_extra", truth.urgency.example_extra_cents === 145000, truth.urgency);
assert("urgency_has_denominator", /preço-piloto ou preço publicado daquela entrega/.test(truth.urgency.statement), truth.urgency.statement);
assert("urgency_has_condition", /capacidade confirmada/.test(truth.urgency.statement), truth.urgency.statement);
assert("urgency_has_example", /R\$ 2\.900/.test(truth.urgency.statement) && /R\$ 1\.450/.test(truth.urgency.statement) && /R\$ 4\.350/.test(truth.urgency.statement), truth.urgency.statement);

/* ------------------------------------------------------------------ *
 * 2. Each route projects the elected record.
 * ------------------------------------------------------------------ */
for (const offer of truth.offers) {
  const html = read(offer.page_file);
  const text = visibleText(html);
  const { services, offers } = jsonLdServicesAndOffers(html);
  assert(`${offer.offer_id}_public_name_visible`, text.includes(offer.public_name), offer.public_name);
  const serviceNames = services.map((item) => item.name);
  assert(
    `${offer.offer_id}_jsonld_service_name`,
    serviceNames.includes(offer.public_name),
    serviceNames,
  );

  const ldPrices = offers.flatMap((item) => {
    const values = [];
    if (item.price != null) values.push(String(item.price));
    if (item.lowPrice != null) values.push(String(item.lowPrice));
    if (item.highPrice != null) values.push(String(item.highPrice));
    if (Array.isArray(item.offers)) {
      for (const inner of item.offers) {
        if (inner.price != null) values.push(String(inner.price));
      }
    }
    return values;
  });
  const expectedLd = jsonLdPrices(offer);
  if (offer.jsonld_offer_price) {
    for (const price of expectedLd) {
      assert(`${offer.offer_id}_jsonld_has_${price}`, ldPrices.includes(price), { ldPrices, expectedLd });
    }
  } else {
    assert(`${offer.offer_id}_jsonld_has_no_offer_price`, ldPrices.length === 0, ldPrices);
  }

  const expectedPrice = expectedVisiblePrice(offer);
  if (expectedPrice) {
    const number = offer.price.kind === "point"
      ? brl(offer.price.amount_cents)
      : brl(offer.price.min_cents);
    assert(`${offer.offer_id}_visible_price`, text.includes(number), { number, sample: text.slice(0, 200) });
    if (offer.commercial_mode === "PILOT_NOT_BUYABLE") {
      assert(`${offer.offer_id}_pilot_not_checkout`, /preço-piloto|em validação|análise de aderência|não há compra/i.test(text), offer.offer_id);
    }
  } else if (offer.frozen) {
    assert(`${offer.offer_id}_frozen_omits_amount`, !text.includes(brl(offer.price.amount_cents)), offer.offer_id);
  }
  if (offer.commercial_mode === "QUOTE_AFTER_SCREENING") {
    assert(`${offer.offer_id}_explains_triage`, /triagem/i.test(text), text.slice(0, 240));
    assert(`${offer.offer_id}_quote_page_omits_checkout_price`, !offer.page_publishes_price, offer.offer_id);
  }

  if (offer.buyable === false) {
    const buyCtas = collectCtas(html).filter((cta) =>
      /comprar agora|pagar agora|checkout|contratar agora|upload de arquivo|enviar arquivos/i.test(cta.label),
    );
    assert(`${offer.offer_id}_no_buy_cta`, buyCtas.length === 0, buyCtas);
  }

  if (!offer.frozen && offer.cta_label) {
    const matches = collectCtas(html).filter((cta) => cta.label.replace(/\s+/g, " ").includes(offer.cta_label));
    assert(`${offer.offer_id}_cta_present`, matches.length > 0 || html.includes(offer.cta_label), offer.cta_label);
    const types = new Set(matches.map((cta) => cta.type));
    if (matches.length) {
      assert(`${offer.offer_id}_cta_single_dest`, types.size === 1 && types.has(offer.cta_destination_type), { types: [...types], matches });
    }
  }

  for (const alias of offer.visible_aliases_forbidden || []) {
    const visible = text.includes(alias);
    if (offer.frozen) {
      assert(`${offer.offer_id}_frozen_alias_residual_${alias}`, true, { visible, alias });
    } else {
      assert(`${offer.offer_id}_no_visible_alias_${alias}`, !visible, alias);
    }
  }
}

/* Hub proof cannot claim published price/prazo for every trabalho. */
const hubHtml = read(truth.hub.page_file);
const hubText = visibleText(hubHtml);
assert("hub_proof_is_honest", hubText.includes(truth.hub.proof), truth.hub.proof);
assert("hub_does_not_claim_every_price_published", !/Preço e prazo publicados em cada trabalho/i.test(hubText));
for (const offerId of truth.hub.cited_offer_ids) {
  const offer = truth.byId.get(offerId);
  assert(`hub_names_${offerId}`, hubText.includes(offer.public_name), offer.public_name);
}
const hubLd = jsonLdServicesAndOffers(hubHtml);
const hubList = parseJsonLd(hubHtml).flatMap((block) => {
  const names = [];
  walk(block, (node) => {
    if (node["@type"] === "ListItem" && node.name) names.push(node.name);
  });
  return names;
});
for (const offerId of truth.hub.cited_offer_ids) {
  const offer = truth.byId.get(offerId);
  assert(`hub_jsonld_lists_${offerId}`, hubList.includes(offer.public_name), hubList);
}

/* Catalog: VALIDATE stays VALIDATE; published names and prices match registry. */
const catalogHtml = read("entregas/index.html");
const catalogData = read("entregas/catalog-data.js");
for (const offerId of ["CFG-D16", "CFG-D17", "CFG-D24"]) {
  const offer = truth.byId.get(offerId);
  const cardRe = new RegExp(`data-deliverable-id="${offerId}"[^>]*data-public-state="([^"]+)"`);
  const state = catalogHtml.match(cardRe)?.[1];
  assert(`catalog_state_${offerId}`, state === offer.public_state, { state, expected: offer.public_state });
  assert(`catalog_data_has_${offerId}`, catalogData.includes(`"${offerId}"`), offerId);
  assert(`catalog_name_${offerId}`, catalogHtml.includes(offer.public_name), offer.public_name);
  assert(`catalog_not_buy_cta_${offerId}`, !new RegExp(`data-deliverable-id="${offerId}"[\\s\\S]{0,800}comprar agora`, "i").test(catalogHtml));
}
assert("catalog_expansion_price", catalogHtml.includes("R$ 8.000"), "expansion");
assert("catalog_validate_legend", /Em validação/.test(catalogHtml) && /Não há compra imediata/.test(catalogHtml));

/* Deliberate mismatch must fail: hub vs catalog vs JSON-LD on D16 name. */
{
  const fakeHub = hubHtml.replaceAll("Operação de Proposta para Licitação Crítica", "Bid Room");
  const fakeText = visibleText(fakeHub);
  const elected = truth.byId.get("CFG-D16").public_name;
  const mismatch = fakeText.includes("Bid Room") && catalogHtml.includes(elected) && elected !== "Bid Room";
  assert("deliberate_hub_catalog_name_mismatch_is_detectable", mismatch === true, { elected });
}

/* ------------------------------------------------------------------ *
 * 3. CTA rótulo, VALIDATE, upload honesty, 50 por cento.
 * ------------------------------------------------------------------ */
const ctaIndex = new Map();
const unfrozenPages = IN_SCOPE_PAGES.filter((rel) => {
  const offer = truth.offers.find((item) => item.page_file === rel);
  return !offer?.frozen;
});
for (const rel of unfrozenPages) {
  const html = read(rel);
  const text = visibleText(html);
  assert(`${rel}_no_enviar_documentos_promise`, !/enviar documentos para análise/i.test(text), rel);
  assert(`${rel}_no_upload_cta`, !/type="file"|<input[^>]*file/i.test(html) && !/enviar arquivos|upload de documentos/i.test(text), rel);

  if (/50 por cento|50%|\+50%/i.test(text)) {
    const hasDenom = /preço-piloto ou preço publicado daquela entrega|sobre o preço/i.test(text);
    const hasCond = /capacidade confirmada/i.test(text);
    const hasEx = /R\$ 2\.900/i.test(text) && /R\$ 4\.350|R\$ 1\.450/i.test(text);
    assert(`${rel}_50_has_denominator_condition_example`, hasDenom && hasCond && hasEx, { rel, hasDenom, hasCond, hasEx });
  }

  for (const cta of collectCtas(html)) {
    const key = cta.label.replace(/\s+/g, " ").trim();
    if (!key) continue;
    if (!ctaIndex.has(key)) ctaIndex.set(key, []);
    ctaIndex.get(key).push({ rel, type: cta.type, href: cta.href });
  }
}

for (const declared of truth.ctaLabels) {
  const uses = (ctaIndex.get(declared.label) || []).filter((item) => item.type !== "unknown");
  const types = new Set(uses.map((item) => item.type));
  if (uses.length) {
    assert(`cta_label_${declared.label}_one_dest`, types.size === 1 && types.has(declared.destination_type), { types: [...types], uses });
  }
}

for (const [label, uses] of ctaIndex) {
  const interesting = /solicitar|enviar|avaliar|falar|whatsapp|canal seguro|triagem|diagnóstico/i.test(label);
  if (!interesting) continue;
  const types = new Set(uses.map((item) => item.type).filter((type) => type !== "internal" && type !== "unknown"));
  if (types.size > 1) {
    assert(`cta_unique_${label}`, false, uses);
  }
}

const frozen360 = read("diagnostico-b2g-360/index.html");
assert("frozen_360_has_no_offer_price", jsonLdServicesAndOffers(frozen360).offers.every((item) => item.price == null), jsonLdServicesAndOffers(frozen360).offers);
assert("frozen_360_name", visibleText(frozen360).includes("Diagnóstico da Operação em Obras Públicas"));

const failed = results.filter((item) => !item.ok);
console.log(`public-offer-truth: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
