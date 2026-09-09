/**
 * Gate da rota comercial unica de Medicoes/Glosas, issue 390.
 *
 * A decisao EXECUTE_NOW autoriza a revisao editorial das quatro superficies.
 * Este gate preserva a transferencia semantica, a procedencia e a integridade
 * dos bytes sem transformar hash, owner historico ou data em veto editorial.
 * Preco publico e checkout continuam fail-closed por suas autoridades materiais.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const sha256 = (relative) =>
  crypto
    .createHash("sha256")
    .update(read(relative).replace(/\r\n/g, "\n"))
    .digest("hex");

const contract = json("data/organic/single-commercial-route.v1.json");
const pageContract = json("data/commercial/page-contract-contratos.v1.json");
const naming = json("data/commercial/offer-naming.v1.json");
const frozenHashes = json("data/bofu-dominance/frozen-specs/hashes.json");
const deliverables = json("data/commercial/deliverables-registry.v1.json");
const commercialConstitution = json("data/corporate/commercial-constitution.v1.json");
const taxonomy = json("data/corporate/taxonomy.v1.json");

const results = [];
function assert(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error("FAIL", name, detail);
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const anchorForCta = (html, ctaId) =>
  (html.match(new RegExp(`<a\\b(?=[^>]*\\bdata-cta-id=["']${ctaId}["'])[^>]*>`, "i")) || [""])[0];
const attr = (tag, name) =>
  (tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i")) || ["", ""])[1];
const elementById = (html, tagName, id) =>
  (html.match(new RegExp(`<${tagName}\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>[\\s\\S]*?<\\/${tagName}>`, "i")) || [""])[0];
const obsoleteEditorialLocks = (candidate) => {
  const serialized = JSON.stringify(candidate);
  const forbiddenStates = [
    "FROZEN_READ_ONLY",
    "OWNED_BY_389_READ_ONLY",
    "DEFERRED_BY_FROZEN_DESTINATION",
  ];
  const errors = forbiddenStates.filter((state) => serialized.includes(state));
  for (const surface of candidate.surfaces || []) {
    if (Object.hasOwn(surface, "earliest_safe_action_at")) errors.push(`${surface.role}:forced_wait`);
  }
  return errors;
};
const priceExposureErrors = ({ exposure, terms, sourceItem, registryItem, pageImplementation, surfaceContexts }) => {
  const errors = [];
  if (exposure.state !== "AUTHORIZED_EXISTING_PILOT_PRICE" || exposure.public_display_authorized !== true) {
    errors.push("existing_public_price_misclassified");
  }
  if (
    exposure.authority_contract !== "data/commercial/page-contract-contratos.v1.json#items[item=18]" ||
    exposure.authority_issue !== 333 ||
    exposure.implementation_pr !== 398 ||
    exposure.implementation_commit !== "9fe19a24b732d4b3233e0fd8b9f2491271750a8b"
  ) errors.push("existing_authority_trace_mismatch");
  if (
    exposure.published_price_cents !== 490000 ||
    exposure.published_price_cents !== terms.pilot_price_cents ||
    exposure.published_price_cents !== sourceItem.pilot_price_cents ||
    exposure.published_price_cents !== registryItem.price.amount_cents
  ) errors.push("published_price_mismatch");
  if (exposure.observed_state !== registryItem.price_state || exposure.observed_state !== terms.price_state) {
    errors.push("price_state_mismatch");
  }
  if (!equal(exposure.display_surfaces, ["services_hub"])) errors.push("display_surfaces_mismatch");
  const pricePattern = /R\$\s*4\.900(?:,00)?/i;
  for (const [role, html] of Object.entries(surfaceContexts || {})) {
    if (pricePattern.test(html) !== exposure.display_surfaces.includes(role)) {
      errors.push(`${role}:price_visibility_mismatch`);
    }
  }
  if (
    exposure.buyable !== false ||
    exposure.checkout_authorized !== false ||
    registryItem.checkout_enabled !== false ||
    pageImplementation.checkout_enabled !== false
  ) errors.push("checkout_or_buyability_without_authority");
  if (exposure.depends_on_form_presence !== false) errors.push("price_incorrectly_depends_on_form");
  return errors;
};

assert("schema", contract.schema === "confenge.organic.single-commercial-route.v1", contract.schema);
assert("decision_execute_now", contract.decision_state === "EXECUTE_NOW", contract.decision_state);
assert("source_issue_390", contract.source_issue === 390, contract.source_issue);
assert("parent_issue_387", contract.parent_issue === 387, contract.parent_issue);
assert("public_implementation_is_partial", contract.implementation?.public_state === "PARTIAL", contract.implementation);
assert(
  "partial_is_historical_issue_state_only",
  contract.implementation?.state_scope === "historical_issue_390_work_record" &&
    contract.implementation?.commercial_campaign_blocked === false,
  contract.implementation,
);
assert(
  "historical_issue_progress_remains_honest",
  equal(contract.implementation?.historical_issue_completed_surface_roles, ["home", "services_hub"]) &&
    equal(contract.implementation?.historical_issue_unresolved_surface_roles, [
      "editorial_canary",
      "canonical_destination",
    ]),
  contract.implementation,
);
assert(
  "all_surface_roles_are_editorially_authorized",
  equal(contract.implementation?.editorially_authorized_surface_roles, [
    "home",
    "services_hub",
    "editorial_canary",
    "canonical_destination",
  ]),
  contract.implementation?.editorially_authorized_surface_roles,
);
assert(
  "no_current_pending_list_recreates_revoked_freeze",
  !Object.hasOwn(contract.implementation || {}, "pending_surface_roles"),
  contract.implementation,
);
assert("parent_issue_cannot_close", contract.implementation?.parent_issue_close_allowed === false, contract.implementation);
assert(
  "execute_now_editorial_authority_has_no_forced_wait",
  contract.editorial_authorization?.decision === "EXECUTE_NOW" &&
    contract.editorial_authorization?.effective_at === "2026-09-09" &&
    contract.editorial_authorization?.forced_wait === false,
  contract.editorial_authorization,
);
assert("obsolete_editorial_lock_chain_absent", obsoleteEditorialLocks(contract).length === 0, obsoleteEditorialLocks(contract));

const frozenMutation = structuredClone(contract);
frozenMutation.surfaces.find((surface) => surface.role === "canonical_destination").mutation_state = "FROZEN_READ_ONLY";
frozenMutation.surfaces.find((surface) => surface.role === "canonical_destination").earliest_safe_action_at = "2026-09-16";
assert(
  "negative_fixture_rejects_restored_freeze",
  obsoleteEditorialLocks(frozenMutation).includes("FROZEN_READ_ONLY") &&
    obsoleteEditorialLocks(frozenMutation).includes("canonical_destination:forced_wait"),
  obsoleteEditorialLocks(frozenMutation),
);

const publicWorksVertical = taxonomy.nuclei.find((nucleus) => nucleus.id === "public_works_b2g");
assert(
  "confenge_umbrella_and_public_private_scope_preserved",
  contract.brand_and_scope?.umbrella_brand === commercialConstitution.brand?.name &&
    contract.brand_and_scope?.corporate_category_pt_br === commercialConstitution.brand?.category_pt_br &&
    equal(contract.brand_and_scope?.umbrella_audiences, ["private", "public"]),
  contract.brand_and_scope,
);
assert(
  "public_works_remains_specialist_vertical_not_corporate_category",
  contract.brand_and_scope?.specialist_vertical === publicWorksVertical?.id &&
    publicWorksVertical?.protection === "protected_vertical" &&
    taxonomy.corporate_category?.b2g_is_corporate_category === false,
  contract.brand_and_scope,
);

const route = contract.route;
assert(
  "single_commercial_transfer_route",
  route.commercial_transfer_route === "/medicoes-glosas-obras-publicas/",
  route.commercial_transfer_route,
);
assert("destination_service_id", route.destination_service_id === "medicoes-glosas-obras-publicas", route.destination_service_id);
assert("deliverable_cfg_d18", route.deliverable_id === "CFG-D18", route.deliverable_id);
assert(
  "defesa_margem_is_context_only",
  equal(route.downstream_context_routes, ["/defesa-margem-contratos-publicos/"]),
  route.downstream_context_routes,
);

const item18 = pageContract.items.find((item) => item.deliverable_id === "CFG-D18");
const name18 = naming.names.find((item) => item.deliverable_id === "CFG-D18");
assert("page_contract_item_18_exists", Boolean(item18));
assert("naming_item_18_exists", Boolean(name18));
assert("name_from_343", route.public_name_pt_br === name18?.public_name_pt_br, route.public_name_pt_br);
assert("value_line_from_343", route.value_line_pt_br === name18?.value_line_pt_br, route.value_line_pt_br);
assert("route_from_333", route.commercial_transfer_route === item18?.route, item18?.route);
assert("decision_question_from_333", route.decision_question_pt_br === item18?.decision_question_pt_br, route.decision_question_pt_br);

const terms = contract.commercial_terms;
assert("scope_from_333", terms.scope_unit_pt_br === item18?.scope_unit_pt_br, terms.scope_unit_pt_br);
assert("documents_from_333", terms.minimum_documents_pt_br === item18?.minimum_document_pt_br, terms.minimum_documents_pt_br);
assert("output_from_333", terms.output_pt_br === item18?.output_pt_br, terms.output_pt_br);
assert("price_from_333", terms.pilot_price_cents === item18?.pilot_price_cents && terms.pilot_price_cents === 490000, terms.pilot_price_cents);
assert("sla_from_333", terms.sla_business_days === item18?.sla_business_days && terms.sla_business_days === 5, terms.sla_business_days);
assert("legal_boundary_from_333", terms.legal_boundary_pt_br === item18?.legal_boundary?.statement_pt_br, terms.legal_boundary_pt_br);
assert("evidence_grades_from_333", equal(terms.evidence_grades, Object.keys(item18?.evidence_grades || {})), terms.evidence_grades);
assert("price_state_is_hypothesis", terms.price_state === "PILOT_HYPOTHESIS", terms.price_state);

const registryItem = deliverables.deliverables.find((item) => item.deliverable_id === route.deliverable_id);
assert("deliverables_registry_cfg_d18_exists", Boolean(registryItem));
assert("cfg_d18_remains_validate", registryItem?.public_state === "VALIDATE", registryItem?.public_state);
assert("cfg_d18_price_remains_public_pilot_hypothesis", registryItem?.price_state === "PILOT_HYPOTHESIS", registryItem?.price_state);
assert("cfg_d18_checkout_remains_disabled", registryItem?.checkout_enabled === false, registryItem?.checkout_enabled);
assert(
  "existing_public_pilot_price_authority_is_traced",
  terms.public_price_exposure?.state === "AUTHORIZED_EXISTING_PILOT_PRICE" &&
    terms.public_price_exposure?.authority_issue === 333 &&
    terms.public_price_exposure?.implementation_pr === 398 &&
    terms.public_price_exposure?.implementation_commit === "9fe19a24b732d4b3233e0fd8b9f2491271750a8b" &&
    terms.public_price_exposure?.observed_state === "PILOT_HYPOTHESIS" &&
    terms.public_price_exposure?.published_price_cents === 490000 &&
    terms.public_price_exposure?.public_display_authorized === true &&
    terms.public_price_exposure?.buyable === false &&
    terms.public_price_exposure?.checkout_authorized === false &&
    terms.public_price_exposure?.depends_on_form_presence === false,
  terms.public_price_exposure,
);
assert(
  "proposal_conditions_do_not_turn_public_price_into_checkout",
  /confere o escopo|conferência do escopo/i.test(terms.public_price_exposure?.proposal_condition_pt_br || "") &&
    /documentos/i.test(terms.public_price_exposure?.proposal_condition_pt_br || "") &&
    /agenda/i.test(terms.public_price_exposure?.proposal_condition_pt_br || "") &&
    /não inicia cobrança/i.test(terms.public_price_exposure?.proposal_condition_pt_br || ""),
  terms.public_price_exposure?.proposal_condition_pt_br,
);

const expectedRoles = ["home", "services_hub", "editorial_canary", "canonical_destination"];
assert("four_surface_roles", equal(contract.surfaces.map((surface) => surface.role), expectedRoles), contract.surfaces.map((surface) => surface.role));
assert("no_new_public_route", contract.ownership?.new_public_route_created === false, contract.ownership);
assert(
  "informational_route_cannot_compete",
  contract.ownership?.informational_route_may_promote_competing_offer === false,
  contract.ownership,
);

const requiredAttrs = contract.primary_cta_contract.required_attributes;
const editoriallyAuthorized = contract.surfaces.filter(
  (surface) => surface.mutation_state === "EDITORIAL_AUTHORIZED",
);
assert("four_editorially_authorized_surfaces", editoriallyAuthorized.length === 4, editoriallyAuthorized.map((surface) => surface.role));
for (const surface of editoriallyAuthorized.filter((item) => item.cta_id)) {
  const html = read(surface.file);
  const tag = anchorForCta(html, surface.cta_id);
  assert(`${surface.role}_file_exists`, fs.existsSync(path.join(root, surface.file)), surface.file);
  assert(`${surface.role}_canonical_name_visible`, html.includes(route.public_name_pt_br), surface.file);
  assert(`${surface.role}_cta_present`, Boolean(tag), surface.cta_id);
  assert(`${surface.role}_cta_destination`, attr(tag, "href") === route.commercial_transfer_route, attr(tag, "href"));
  for (const required of requiredAttrs) {
    assert(`${surface.role}_${required}_present`, Boolean(attr(tag, required)), tag);
  }
  assert(`${surface.role}_route_family`, attr(tag, "data-route-family") === "medicoes-glosas", attr(tag, "data-route-family"));
  assert(`${surface.role}_journey`, attr(tag, "data-journey") === "contrato", attr(tag, "data-journey"));
}

const homeJourney = (read("index.html").match(
  /<li\b(?=[^>]*\bid=["']jornada-contrato["'])[^>]*>[\s\S]*?<\/li>/i,
) || [""])[0];
assert("home_focused_journey_present", Boolean(homeJourney));
assert(
  "home_focused_journey_has_single_route",
  homeJourney.includes(`href="${route.commercial_transfer_route}"`) &&
    !/wa\.me|#formulario-contato|\/reequilibrio-obras-publicas\//i.test(homeJourney),
  homeJourney,
);
assert("home_focused_journey_uses_canonical_name", homeJourney.includes(route.public_name_pt_br), homeJourney);

const canarySurface = contract.surfaces.find((surface) => surface.role === "editorial_canary");
const canaryHtml = read(canarySurface.file);
assert(
  "canary_owner_is_provenance_not_editorial_lock",
  canarySurface?.mutation_state === "EDITORIAL_AUTHORIZED" &&
    canarySurface?.content_owner_issue === 389 &&
    canarySurface?.ownership_role === "historical_provenance",
  canarySurface,
);
assert(
  "canary_existing_link_reaches_single_route",
  canarySurface?.existing_semantic_link === route.commercial_transfer_route &&
    canaryHtml.includes(`href="${route.commercial_transfer_route}"`),
  canarySurface?.existing_semantic_link,
);
assert(
  "canary_final_cta_present",
  canarySurface?.required_final_cta_id === "canary-medicao-dossie" &&
    Boolean(anchorForCta(canaryHtml, canarySurface.required_final_cta_id)),
  canarySurface,
);

const pillar = contract.surfaces.find((surface) => surface.role === "canonical_destination");
assert("pillar_is_editorially_authorized", pillar?.mutation_state === "EDITORIAL_AUTHORIZED", pillar);
assert(
  "pillar_historical_owners_preserved_as_provenance",
  equal(pillar?.historical_freeze_owner_issues, [128, 291]),
  pillar?.historical_freeze_owner_issues,
);
assert("pillar_hash_matches_live", sha256(pillar.file) === pillar.expected_sha256, sha256(pillar.file));
assert("pillar_hash_matches_reviewed_baseline", frozenHashes.forbidden[pillar.file] === pillar.expected_sha256, frozenHashes.forbidden[pillar.file]);
assert("pillar_links_back_to_canary", read(pillar.file).includes(`href="${canarySurface.route}"`), canarySurface.route);
const pillarHtml = read(pillar.file);
assert(
  "rendered_pillar_keeps_umbrella_and_specialist_scope",
  /\bengenharia\b/i.test(pillarHtml) && /\bprivad[oa]s?\b/i.test(pillarHtml) &&
    /públic[oa]s?/i.test(pillarHtml) && pillarHtml.includes(route.commercial_transfer_route),
  pillar.file,
);
assert(
  "rendered_pillar_keeps_professional_and_source_authenticity",
  /href=["']\/especialista\/tiago-jun-sasaki\/["']/.test(pillarHtml) &&
    /14[.]?133\s*\/\s*2021/.test(pillarHtml) && /id=["']metodo["']/.test(pillarHtml),
  pillar.file,
);
assert(
  "pillar_keeps_functional_contextual_contact",
  /href=["']https:\/\/wa\.me\/5548988344559\?text=[^"']+/i.test(pillarHtml) &&
    /href=["']mailto:tiago\.sasaki@confenge\.com\.br["']/i.test(pillarHtml) &&
    /href=["']tel:\+5548988344559["']/i.test(pillarHtml),
  pillar.file,
);

const servicesHubHtml = read("servicos-obras-publicas/index.html");
const item18Card = elementById(servicesHubHtml, "article", "entrega-18");
const hubCapture = elementById(servicesHubHtml, "section", "captura-contrato");
assert("cfg_d18_public_card_exists", Boolean(item18Card), "#entrega-18");
assert(
  "cfg_d18_public_card_matches_authoritative_terms",
  item18Card.includes(route.public_name_pt_br) &&
    item18Card.includes(route.value_line_pt_br) &&
    item18Card.includes("R$ 4.900") &&
    item18Card.includes("5 dias úteis") &&
    item18Card.includes('data-deliverable-id="CFG-D18"') &&
    item18Card.includes('href="#captura-contrato"'),
  item18Card,
);
assert(
  "cfg_d18_public_card_leads_to_contextual_proposal_contact",
  /<form\b[^>]*action="\/\.netlify\/functions\/lead"/i.test(hubCapture) &&
    hubCapture.includes('<option value="CFG-D18">') &&
    /Solicitar uma proposta/i.test(hubCapture) &&
    /confere o escopo, os documentos mínimos e a agenda/i.test(hubCapture) &&
    /envio não inicia cobrança/i.test(hubCapture),
  "#captura-contrato",
);

const surfaceContexts = {
  home: homeJourney,
  services_hub: item18Card,
  editorial_canary: elementById(canaryHtml, "aside", "diagnostico-confenge"),
  canonical_destination: pillarHtml,
};
const priceValidation = {
  exposure: terms.public_price_exposure,
  terms,
  sourceItem: item18,
  registryItem,
  pageImplementation: pageContract.public_implementation,
  surfaceContexts,
};
assert(
  "public_price_matches_authority_and_declared_surface",
  priceExposureErrors(priceValidation).length === 0,
  priceExposureErrors(priceValidation),
);

const falseWithheld = {
  ...terms.public_price_exposure,
  state: "WITHHELD_NO_PUBLICATION_AUTHORITY",
  public_display_authorized: false,
};
assert(
  "negative_fixture_rejects_hiding_existing_public_price",
  priceExposureErrors({ ...priceValidation, exposure: falseWithheld }).includes(
    "existing_public_price_misclassified",
  ),
  priceExposureErrors({ ...priceValidation, exposure: falseWithheld }),
);
const mismatchedPrice = { ...terms.public_price_exposure, published_price_cents: 490100 };
assert(
  "negative_fixture_rejects_public_price_mismatch",
  priceExposureErrors({ ...priceValidation, exposure: mismatchedPrice }).includes("published_price_mismatch"),
  priceExposureErrors({ ...priceValidation, exposure: mismatchedPrice }),
);
const inferredCheckout = { ...terms.public_price_exposure, checkout_authorized: true, buyable: true };
assert(
  "negative_fixture_rejects_checkout_inferred_from_publication",
  priceExposureErrors({ ...priceValidation, exposure: inferredCheckout }).includes(
    "checkout_or_buyability_without_authority",
  ),
  priceExposureErrors({ ...priceValidation, exposure: inferredCheckout }),
);
assert(
  "all_governed_surfaces_remain_without_checkout",
  Object.values(surfaceContexts).every((html) => !/data-checkout|\/\.netlify\/functions\/checkout/i.test(html)),
  Object.keys(surfaceContexts),
);

const renderer = spawnSync(process.execPath, ["scripts/commercial/render_contract_defense_products.mjs", "--check"], {
  cwd: root,
  encoding: "utf8",
});
assert(
  "authoritative_contract_renderer_has_no_drift",
  renderer.status === 0 && /CONTRACT_DEFENSE_PRODUCTS_OK/.test(renderer.stdout),
  `${renderer.stdout}\n${renderer.stderr}`,
);

const eventContractSource = read("script.js");
assert("analytics_source_confenge_web", contract.primary_cta_contract.analytics_source === "CONFENGE_WEB" && /CONFENGE_WEB/.test(eventContractSource));
assert("analytics_pii_forbidden", contract.primary_cta_contract.pii_in_analytics === false);
assert("destination_registered_in_event_contract", eventContractSource.includes(`"${route.commercial_transfer_route}":"${route.destination_service_id}"`));

const failed = results.filter((result) => !result.ok);
console.log(`single-commercial-route: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(JSON.stringify({ ok: false, failed: failed.length, results: failed }, null, 2));
  process.exit(1);
}
