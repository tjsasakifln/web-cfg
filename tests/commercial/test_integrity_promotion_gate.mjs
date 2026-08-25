/** Gate hermético de promoção da consulta preliminar de integridade, issue 156. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { consumerSuitesForPath } from "../../scripts/site/affected_graph.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_PATH = path.join(root, "data/quality/integrity-promotion-gate.v1.json");
const REGISTRY_PATH = path.join(root, "data/commercial/deliverables-registry.v1.json");
const SELF_PATH = fileURLToPath(import.meta.url);
const NAME = "integrity-promotion-gate";
const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
const filled = (value) => typeof value === "string" && value.trim().length > 0;
function listFiles(start, predicate, out = []) {
  const excluded = new Set([".git", ".claude", "node_modules", "_site", "tests", "docs", ".github"]);
  for (const entry of fs.readdirSync(start, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const absolute = path.join(start, entry.name);
    if (entry.isDirectory()) listFiles(absolute, predicate, out);
    else if (predicate(absolute)) out.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return out.sort();
}

assert("data_exists", fs.existsSync(DATA_PATH), DATA_PATH);
assert("registry_exists", fs.existsSync(REGISTRY_PATH), REGISTRY_PATH);
const raw = fs.readFileSync(DATA_PATH, "utf8");
let data;
try {
  data = JSON.parse(raw);
  assert("data_parses", true, DATA_PATH);
} catch (error) {
  assert("data_parses", false, String(error));
  process.exit(1);
}
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const canonicalById = new Map((registry.deliverables ?? []).map((item) => [item.deliverable_id, item]));

assert("schema", data.schema === "integrity-promotion-gate-v1", data.schema);
assert("version", data.contract_version === "v1", data.contract_version);
assert("source_issue", data.source_issue === "#156", data.source_issue);
assert("updated_at", data.updated_at === "2026-08-24", data.updated_at);
assert("priority", data.priority === "P2", data.priority);
assert("category", data.campaign_category === "BLOCKED_EXTERNAL", data.campaign_category);
assert("decision", data.decision_state === "VALIDATE" && data.decision_mode === "HOLD", [data.decision_state, data.decision_mode]);
assert("hermetic", data.hermetic === true && data.offline_only === true && data.network_calls_allowed === false, data);
assert("network_policy", /offline/i.test(data.network_policy_pt_br ?? "") && /nenhuma chamada/i.test(data.network_policy_pt_br ?? ""), data.network_policy_pt_br);

const producer = data.producer ?? {};
assert("producer_contract", producer.contract_id === "public-read-integrity/1.0", producer.contract_id);
assert("producer_owner", producer.owner === "extra-cli" && producer.owner_branch === "main" && producer.owner_commit === "8e15f94", producer);
assert("producer_delivered", producer.delivered === true && producer.in_production === true, producer);
assert("producer_select_only", producer.access_mode === "SELECT_ONLY", producer.access_mode);
assert("producer_tests", producer.focused_suite_tests_passed === 45 && producer.focused_suite_tests_failed === 0, producer);
const CAPABILITIES = ["schema", "fixtures", "fail_closed_pagination", "provenance", "ttl", "select_only"];
assert("producer_capabilities", JSON.stringify(producer.delivered_capabilities) === JSON.stringify(CAPABILITIES), producer.delivered_capabilities);
assert("producer_terminal_rule", /página terminal/i.test(producer.pagination_rule_pt_br ?? "") && /UNKNOWN/.test(producer.pagination_rule_pt_br ?? ""), producer.pagination_rule_pt_br);
assert("producer_two_sources", JSON.stringify(producer.sources?.map((source) => source.source_id)) === JSON.stringify(["CEIS", "CNEP"]), producer.sources);
for (const source of producer.sources ?? []) {
  assert(`source_${source.source_id}_official_url`, source.official_url === "https://portaldatransparencia.gov.br/sancoes", source);
  assert(`source_${source.source_id}_key`, source.requires_official_key === true, source);
  assert(`source_${source.source_id}_freshness`, source.freshness_required === true, source);
  assert(`source_${source.source_id}_coverage`, source.coverage_declared_required === true, source);
}
const boundary = producer.web_cfg_boundary ?? {};
for (const key of ["creates_crawler", "creates_identity_store", "creates_second_truth_plane", "creates_parallel_datalake", "acquires_sources_directly", "stores_cnpj"]) {
  assert(`boundary_${key}_false`, boundary[key] === false, boundary);
}
assert("boundary_consumes_contract", boundary.consumes_versioned_select_only_contract === true, boundary);
assert("boundary_authority_refs", JSON.stringify(boundary.authority_refs) === JSON.stringify(["AGENTS.md", "docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md", "docs/architecture/RUNTIME-AUTHORITY.md"]), boundary.authority_refs);

const blocker = data.blocker ?? {};
assert("blocker_exact", blocker.blocker_id === "portal-transparencia-api-key-absent" && blocker.kind === "EXTERNAL_INPUT_MISSING", blocker);
assert("blocker_secret", blocker.secret_name === "PORTAL_TRANSPARENCIA_API_KEY" && blocker.environment === "ec-prod", blocker);
assert("blocker_absent", blocker.state === "ABSENT", blocker.state);
assert("blocker_extra_cli", blocker.owner === "extra-cli" && blocker.resolvable_by_web_cfg === false && blocker.resolvable_by_this_pr === false, blocker);

const promotion = data.promotion_state ?? {};
assert("promotion_blocked", promotion.current === "BLOCKED_EXTERNAL" && promotion.initial_state === "BLOCKED_EXTERNAL", promotion);
assert("promotion_states", JSON.stringify(promotion.allowed_states) === JSON.stringify(["BLOCKED_EXTERNAL", "READY_FOR_KEYED_CANARY", "PROMOTED"]), promotion.allowed_states);
assert("promotion_terminal", promotion.terminal_state === "PROMOTED", promotion.terminal_state);
assert("promotion_requires_all", promotion.advance_requires_all_conditions_satisfied === true && promotion.advance_requires_all_evidence_slots_filled === true, promotion);
const REQUIRED_EVIDENCE = ["recorded_at", "recorded_by", "artifact_ref", "verification_note_pt_br"];
assert("promotion_required_evidence", JSON.stringify(promotion.required_evidence_fields) === JSON.stringify(REQUIRED_EVIDENCE), promotion.required_evidence_fields);
assert("promotion_two_conditions", promotion.conditions?.length === 2, promotion.conditions);
assert("promotion_condition_ids", JSON.stringify(promotion.conditions?.map((condition) => condition.condition_id)) === JSON.stringify(["official_api_key_configured", "redacted_live_safe_canary"]), promotion.conditions);
assert("promotion_condition_order", JSON.stringify(promotion.conditions?.map((condition) => condition.order)) === JSON.stringify([1, 2]), promotion.conditions);
let allSatisfied = true;
let allEvidenceFilled = true;
for (const condition of promotion.conditions ?? []) {
  assert(`condition_${condition.condition_id}_not_satisfied`, condition.satisfied === false, condition);
  allSatisfied &&= condition.satisfied === true;
  for (const field of REQUIRED_EVIDENCE) {
    assert(`condition_${condition.condition_id}_${field}_empty`, condition.evidence?.[field] === null, condition.evidence);
    allEvidenceFilled &&= filled(condition.evidence?.[field]);
  }
}
assert("blocked_when_conditions_missing", promotion.current === "BLOCKED_EXTERNAL" || (allSatisfied && allEvidenceFilled), { current: promotion.current, allSatisfied, allEvidenceFilled });
const canaryCondition = promotion.conditions?.find((condition) => condition.condition_id === "redacted_live_safe_canary");
assert("canary_proofs_exact", JSON.stringify(canaryCondition?.must_prove) === JSON.stringify(["terminal_pagination", "per_source_freshness", "no_cnpj_in_public_artifacts"]), canaryCondition);
assert("canary_redacted", canaryCondition?.redaction_required === true && canaryCondition?.cnpj_allowed_in_public_artifact === false, canaryCondition);
for (const field of ["terminal_pagination_proof", "per_source_freshness_proof", "cnpj_redaction_proof"]) {
  assert(`canary_${field}_empty`, canaryCondition?.evidence?.[field] === null, canaryCondition?.evidence);
}

const never = data.never_publish ?? {};
assert("forbidden_tokens", JSON.stringify(never.forbidden_conclusion_tokens) === JSON.stringify(["NO_MATCH_CONFIRMED", "empresa limpa", "empresa idônea", "nada consta"]), never.forbidden_conclusion_tokens);
assert("clean_certificate_false", never.clean_company_certificate_publishable === false, never);
for (const key of ["partial_never_becomes_zero", "unknown_never_becomes_zero", "partial_never_becomes_no_match_confirmed", "unknown_never_becomes_no_match_confirmed", "absence_of_evidence_is_not_evidence_of_absence"]) {
  assert(`never_${key}`, never[key] === true, never);
}
assert("finding_states", JSON.stringify(never.allowed_finding_states) === JSON.stringify(["ENCONTRADO", "NAO_ENCONTRADO_NA_COBERTURA", "UNKNOWN"]), never.allowed_finding_states);
assert("aggregate_states", JSON.stringify(never.allowed_aggregate_states) === JSON.stringify(["PARTIAL", "UNKNOWN", "COMPLETE_WITHIN_DECLARED_COVERAGE"]), never.allowed_aggregate_states);
assert("zero_requires_four", never.zero_result_requires?.length === 4 && new Set(never.zero_result_requires).size === 4, never.zero_result_requires);

const FAILURE_IDS = ["timeout", "http_429", "http_5xx", "schema_drift", "partial_parse", "incomplete_pagination", "stale"];
assert("failure_modes_seven", data.failure_modes?.length === 7, data.failure_modes);
assert("failure_ids_exact", JSON.stringify(data.failure_modes?.map((mode) => mode.failure_mode_id)) === JSON.stringify(FAILURE_IDS), data.failure_modes);
for (const mode of data.failure_modes ?? []) {
  assert(`failure_${mode.failure_mode_id}_mapping`, ["PARTIAL", "UNKNOWN"].includes(mode.maps_to), mode);
  assert(`failure_${mode.failure_mode_id}_no_confirmed_negative`, mode.may_produce_confirmed_negative === false, mode);
  assert(`failure_${mode.failure_mode_id}_no_zero`, mode.may_produce_zero === false, mode);
  assert(`failure_${mode.failure_mode_id}_not_publishable`, mode.publishable === false, mode);
  assert(`failure_${mode.failure_mode_id}_label`, filled(mode.label_pt_br), mode);
}
const failurePolicy = data.failure_mode_policy ?? {};
assert("failure_policy_closed", failurePolicy.exhaustive === true && failurePolicy.closed_list === true, failurePolicy);
assert("failure_allowed", JSON.stringify(failurePolicy.allowed_mappings) === JSON.stringify(["PARTIAL", "UNKNOWN"]), failurePolicy.allowed_mappings);
assert("failure_forbidden", JSON.stringify(failurePolicy.forbidden_mappings) === JSON.stringify(["NO_MATCH_CONFIRMED", "ZERO", "CLEAN", "COMPLETE_WITHIN_DECLARED_COVERAGE"]), failurePolicy.forbidden_mappings);
assert("failure_default_unknown", failurePolicy.default_when_unlisted === "UNKNOWN", failurePolicy.default_when_unlisted);

const observation = data.keyless_canary_observation ?? {};
assert("observation_fact", observation.recorded_as === "FACT" && observation.observed_at === "2026-08-24", observation);
assert("observation_not_reexecuted", observation.reexecuted_by_this_gate === false && observation.key_present === false, observation);
assert("observation_sources", JSON.stringify(observation.per_source?.map((source) => source.source_id)) === JSON.stringify(["CEIS", "CNEP"]), observation.per_source);
for (const source of observation.per_source ?? []) {
  assert(`observation_${source.source_id}_unknown`, source.result_state === "UNKNOWN", source);
  assert(`observation_${source.source_id}_incomplete`, source.coverage === "INCOMPLETE", source);
  assert(`observation_${source.source_id}_no_false_negative`, source.false_no_match_confirmed_count === 0, source);
}
assert("observation_aggregate_unknown", observation.aggregate_result_state === "UNKNOWN", observation);
assert("observation_zero_false", observation.false_no_match_confirmed_total === 0, observation);
assert("observation_not_published_or_promotion", observation.published === false && observation.satisfies_promotion === false, observation);

const consumer = data.consumer_pr_174 ?? {};
assert("consumer_closed_unmerged", consumer.pr_number === 174 && consumer.state === "CLOSED_UNMERGED", consumer);
assert("consumer_not_resurrected", consumer.may_be_resurrected === false, consumer);
assert("consumer_requires_both", JSON.stringify(consumer.resurrection_requires_all) === JSON.stringify(["keyed_canary_recorded", "explicit_slot_after_issue_155"]), consumer.resurrection_requires_all);
assert("consumer_after_155", consumer.sequencing_issue === "#155" && consumer.must_come_after_issue === 155, consumer);
assert("consumer_surfaces_false", Object.values(consumer.forbidden_surface_reintroduction ?? {}).every((value) => value === false), consumer.forbidden_surface_reintroduction);
assert("consumer_prefixes", consumer.forbidden_route_prefixes?.length === 8 && new Set(consumer.forbidden_route_prefixes).size === 8, consumer.forbidden_route_prefixes);

const publication = data.publication_constraints ?? {};
assert("publication_noindex", publication.individual_result_noindex === true && publication.individual_result_indexable === false, publication);
assert("publication_no_distribution", publication.individual_result_in_sitemap === false && publication.individual_result_in_internal_links === false, publication);
assert("publication_no_cnpj", publication.cnpj_in_public_artifacts === false && publication.cnpj_in_analytics === false && publication.cnpj_in_urls === false, publication);
assert("publication_no_pii", publication.pii_in_analytics === false, publication);
assert("publication_capture", publication.price_route_requires_lead_capture === true, publication);

const downstream = data.downstream_blocks ?? [];
assert("downstream_two", downstream.length === 2, downstream);
assert("downstream_ids", JSON.stringify(downstream.map((entry) => entry.deliverable_id)) === JSON.stringify(["CFG-D11", "CFG-D43"]), downstream);
for (const expected of downstream) {
  const canonical = canonicalById.get(expected.deliverable_id);
  const prefix = `downstream_${expected.deliverable_id}`;
  assert(`${prefix}_exists`, Boolean(canonical), expected);
  if (!canonical) continue;
  assert(`${prefix}_state`, canonical.public_state === expected.expected_public_state && canonical.public_state === "BLOCKED", canonical.public_state);
  assert(`${prefix}_block`, canonical.blocking_issue === expected.expected_blocking_issue && canonical.blocking_issue === "#156", canonical.blocking_issue);
  assert(`${prefix}_route`, canonical.route === null && expected.expected_route === null, [canonical.route, expected.expected_route]);
  assert(`${prefix}_checkout`, canonical.checkout_enabled === false && expected.expected_checkout_enabled === false, canonical.checkout_enabled);
  assert(`${prefix}_lead`, canonical.lead_destination === null && expected.expected_lead_destination === null, canonical.lead_destination);
  assert(`${prefix}_promotion_required`, expected.unblock_requires_promotion_state === "PROMOTED", expected);
}

const htmlFiles = listFiles(root, (file) => file.endsWith(".html"));
assert("public_html_inventory", htmlFiles.length >= 200, htmlFiles.length);
const publicHtml = new Map(htmlFiles.map((relative) => [relative, fs.readFileSync(path.join(root, relative), "utf8")]));
const forbiddenTokens = never.forbidden_conclusion_variants ?? [];
for (const [relative, html] of publicHtml) {
  for (const token of forbiddenTokens) {
    assert(`html_${relative}_${forbiddenTokens.indexOf(token)}_no_false_conclusion`, !html.toLowerCase().includes(token.toLowerCase()), token);
  }
  for (const prefix of consumer.forbidden_route_prefixes ?? []) {
    assert(`html_${relative}_no_route_${prefix}`, !html.toLowerCase().includes(prefix.toLowerCase()), prefix);
  }
}
const sitemapFiles = fs.readdirSync(root).filter((name) => /^sitemap.*\.xml$/.test(name)).sort();
assert("sitemaps_present", sitemapFiles.length > 0, sitemapFiles);
for (const sitemap of sitemapFiles) {
  const text = fs.readFileSync(path.join(root, sitemap), "utf8").toLowerCase();
  for (const prefix of consumer.forbidden_route_prefixes ?? []) {
    assert(`sitemap_${sitemap}_no_${prefix}`, !text.includes(prefix.toLowerCase()), prefix);
  }
}
for (const prefix of consumer.forbidden_route_prefixes ?? []) {
  assert(`no_directory_${prefix}`, !fs.existsSync(path.join(root, prefix)), prefix);
}

const external = data.external_input_still_required ?? [];
assert("external_two", external.length === 2, external);
assert("external_ids", JSON.stringify(external.map((entry) => entry.input_id)) === JSON.stringify(["official_api_key_in_ec_prod", "redacted_live_safe_canary_run"]), external);
assert("external_pending", external.every((entry) => entry.owner === "extra-cli" && entry.state === "PENDING" && filled(entry.description_pt_br)), external);

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const selfRaw = fs.readFileSync(SELF_PATH, "utf8");
assert("no_em_dash_data", !raw.includes(EM_DASH), raw.indexOf(EM_DASH));
assert("no_en_dash_data", !raw.includes(EN_DASH), raw.indexOf(EN_DASH));
assert("no_em_dash_test", !selfRaw.includes(EM_DASH), selfRaw.indexOf(EM_DASH));
assert("no_en_dash_test", !selfRaw.includes(EN_DASH), selfRaw.indexOf(EN_DASH));

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert("npm_script", pkg.scripts?.["test:integrity-promotion-gate"] === "node tests/commercial/test_integrity_promotion_gate.mjs", pkg.scripts?.["test:integrity-promotion-gate"]);
assert("npm_chain", String(pkg.scripts?.test ?? "").includes("npm run test:integrity-promotion-gate"), pkg.scripts?.test);
const workflow = fs.readFileSync(path.join(root, ".github/workflows/site-ci.yml"), "utf8");
assert("workflow", workflow.includes("npm run test:integrity-promotion-gate"), "site-ci.yml");
const graph = fs.readFileSync(path.join(root, "scripts/site/affected_graph.mjs"), "utf8");
assert("graph", graph.includes('"test:integrity-promotion-gate"'), "affected_graph.mjs");
assert("graph_contract", graph.includes("data/quality/integrity-promotion-gate.v1.json"), "affected_graph.mjs");
assert("graph_registry", graph.includes("data/commercial/deliverables-registry.v1.json"), "affected_graph.mjs");
assert(
  "affected_public_html_selects_integrity_gate",
  consumerSuitesForPath("conteudos/fixture-public-surface/index.html").some((entry) => entry.id === "test:integrity-promotion-gate"),
  "conteudos/fixture-public-surface/index.html",
);

const failed = results.filter((result) => !result.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
console.log(`${NAME}: scanned ${htmlFiles.length} public HTML files and ${sitemapFiles.length} sitemap files`);
if (failed.length) {
  console.error(`${NAME}: ${failed.length} check(s) failed`);
  process.exit(1);
}
