/**
 * Gate da rota comercial unica de Medicoes/Glosas, issue 390.
 *
 * O pilar canonico permanece byte-frozen por 128/291. Este gate prova a
 * transferencia semantica nas superficies autorizadas e falha se alguem
 * criar um segundo destino comercial, enfraquecer a atribuicao ou editar o
 * destino protegido antes do desbloqueio.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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

assert("schema", contract.schema === "confenge.organic.single-commercial-route.v1", contract.schema);
assert("decision_execute_now", contract.decision_state === "EXECUTE_NOW", contract.decision_state);
assert("source_issue_390", contract.source_issue === 390, contract.source_issue);
assert("parent_issue_387", contract.parent_issue === 387, contract.parent_issue);
assert("public_implementation_is_partial", contract.implementation?.public_state === "PARTIAL", contract.implementation);
assert(
  "completed_surfaces_are_home_and_hub",
  equal(contract.implementation?.completed_surface_roles, ["home", "services_hub"]),
  contract.implementation?.completed_surface_roles,
);
assert(
  "pending_surfaces_are_explicit",
  equal(contract.implementation?.pending_surface_roles, ["editorial_canary", "canonical_destination"]),
  contract.implementation?.pending_surface_roles,
);
assert("parent_issue_cannot_close", contract.implementation?.parent_issue_close_allowed === false, contract.implementation);

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
assert(
  "price_exposure_respects_freeze",
  terms.public_price_exposure?.state === "DEFERRED_BY_FROZEN_DESTINATION" &&
    /byte-frozen/i.test(terms.public_price_exposure?.reason_pt_br || ""),
  terms.public_price_exposure,
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
const authorized = contract.surfaces.filter((surface) => surface.mutation_state === "AUTHORIZED");
assert("two_authorized_surfaces", authorized.length === 2, authorized.map((surface) => surface.role));
for (const surface of authorized) {
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
  "canary_is_exclusive_to_389",
  canarySurface?.mutation_state === "OWNED_BY_389_READ_ONLY" && canarySurface?.content_owner_issue === 389,
  canarySurface,
);
assert(
  "canary_existing_link_reaches_single_route",
  canarySurface?.existing_semantic_link === route.commercial_transfer_route &&
    canaryHtml.includes(`href="${route.commercial_transfer_route}"`),
  canarySurface?.existing_semantic_link,
);
assert(
  "canary_final_cta_contract_handed_to_389",
  canarySurface?.required_final_cta_id === "canary-medicao-dossie",
  canarySurface?.required_final_cta_id,
);

const pillar = contract.surfaces.find((surface) => surface.role === "canonical_destination");
assert("pillar_is_frozen_read_only", pillar?.mutation_state === "FROZEN_READ_ONLY", pillar);
assert("pillar_freeze_owners", equal(pillar?.freeze_owner_issues, [128, 291]), pillar?.freeze_owner_issues);
assert("pillar_unlock_date_unchanged", pillar?.earliest_safe_action_at === "2026-09-16", pillar?.earliest_safe_action_at);
assert("pillar_hash_matches_live", sha256(pillar.file) === pillar.expected_sha256, sha256(pillar.file));
assert("pillar_hash_matches_reviewed_baseline", frozenHashes.forbidden[pillar.file] === pillar.expected_sha256, frozenHashes.forbidden[pillar.file]);
assert("pillar_links_back_to_canary", read(pillar.file).includes(`href="${canarySurface.route}"`), canarySurface.route);

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
