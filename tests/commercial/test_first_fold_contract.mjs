/**
 * Gate fail-closed do contrato de primeira dobra (issue #327).
 *
 * O contrato `data/commercial/first-fold-contract.v1.json` ja existia em main,
 * mas nada impedia que alguem promovesse uma rota para MEASURED_PASS por
 * opiniao, inventasse uma sessao humana ou publicasse uma superficie comercial
 * nova sem linha de censo. Este gate fecha as quatro portas:
 *
 *   1. estado medido exige registro de medicao; PENDING exige medicao nula;
 *   2. nenhuma alegacao de compreensao pode nascer de automacao;
 *   3. o censo e derivado do registro publico de familias, nao mantido a mao;
 *   4. as quatro respostas, os viewports e as duas falhas medidas ficam presos.
 *
 * A automacao aqui verifica presenca, ordem, viewport e regressao de contrato.
 * Ela nunca declara compreensao humana: isso depende do protocolo de 3 segundos
 * que #183, #184 e #188 possuem e que segue NOT_STARTED.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { consumerSuitesForPath } from "../../scripts/site/affected_graph.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const NAME = "first-fold-contract";

const DATA_PATH = path.join(root, "data/commercial/first-fold-contract.v1.json");
const FAMILY_REGISTRY_PATH = path.join(root, "data/organic/public-family-registry.json");
const BOFU_PATH = path.join(root, "data/organic/bofu-intent-matrix.json");
const SELF_PATH = path.join(__dirname, "test_first_fold_contract.mjs");

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
function assert(name, cond, detail) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}
function bail() {
  const failed = results.filter((r) => !r.ok);
  console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
  process.exit(1);
}

assert("data_file_exists", fs.existsSync(DATA_PATH), DATA_PATH);
assert("family_registry_exists", fs.existsSync(FAMILY_REGISTRY_PATH), FAMILY_REGISTRY_PATH);
assert("bofu_matrix_exists", fs.existsSync(BOFU_PATH), BOFU_PATH);
if (!fs.existsSync(DATA_PATH) || !fs.existsSync(FAMILY_REGISTRY_PATH) || !fs.existsSync(BOFU_PATH)) bail();

const raw = fs.readFileSync(DATA_PATH, "utf8");
let data = null;
try {
  data = JSON.parse(raw);
  pass("data_file_parses");
} catch (err) {
  fail("data_file_parses", String(err));
  bail();
}
const families = JSON.parse(fs.readFileSync(FAMILY_REGISTRY_PATH, "utf8"));
const bofu = JSON.parse(fs.readFileSync(BOFU_PATH, "utf8"));
pass("family_registry_parses");
pass("bofu_matrix_parses");

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function walkStrings(node, at, out) {
  if (typeof node === "string") {
    out.push({ at, value: node });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => walkStrings(child, `${at}[${i}]`, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) walkStrings(child, `${at}.${key}`, out);
  }
  return out;
}
const allStrings = walkStrings(data, "$", []);
const filled = (v) => typeof v === "string" && v.trim().length > 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (v) => [...v].sort();

function routeToFile(route) {
  const slug = String(route).replace(/^\/+/, "").replace(/\/+$/, "");
  return slug ? path.join(root, slug, "index.html") : path.join(root, "index.html");
}
function mainOf(route) {
  const file = routeToFile(route);
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, "utf8");
  const m = html.match(/<main[\s\S]*?<\/main>/i);
  return m ? m[0] : html;
}
function hrefsIn(html) {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].split("#")[0].split("?")[0]);
}

/* ------------------------------------------------------------------ */
/* 1. identidade do contrato                                           */
/* ------------------------------------------------------------------ */

assert("schema_is_first_fold_v1", data.schema === "confenge.first-fold-contract/1.0", data.schema);
assert("contract_version_frozen", data.contract_version === "CFG-FIRST-FOLD-2026-08-27-v2", data.contract_version);
assert("issue_is_327", data.issue === "#327", data.issue);
assert("rule_names_three_seconds", /3 segundos/.test(data.rule || ""), data.rule);
assert("rule_names_skeptical_visitor", /c[eé]tico/i.test(data.rule || ""), data.rule);
assert("rule_does_not_say_five_seconds", !/5 segundos/.test(data.rule || ""), data.rule);
assert(
  "no_surface_of_contract_claims_five_seconds",
  !allStrings.some((s) => /\b5 segundos\b/.test(s.value)),
  allStrings.filter((s) => /\b5 segundos\b/.test(s.value)).map((s) => s.at),
);

/* ------------------------------------------------------------------ */
/* 2. as quatro respostas obrigatorias, nesta ordem                     */
/* ------------------------------------------------------------------ */

const REQUIRED_ANSWERS = [
  ["what", "o que a CONFENGE resolve ou entrega"],
  ["who", "para quem ou para qual situação aquilo serve"],
  ["why_believe", "por que há motivo verificável para acreditar"],
  ["next_action", "qual é a próxima ação dominante"],
];
const answers = Array.isArray(data.required_answers) ? data.required_answers : [];
assert("required_answers_is_array", Array.isArray(data.required_answers), typeof data.required_answers);
assert("required_answers_exactly_four", answers.length === 4, answers.length);
assert(
  "required_answers_keys_in_order",
  eq(answers.map((a) => a.key), REQUIRED_ANSWERS.map(([k]) => k)),
  answers.map((a) => a.key),
);
REQUIRED_ANSWERS.forEach(([key, question], index) => {
  const entry = answers[index];
  assert(`required_answer_${key}_position`, entry?.key === key, entry?.key);
  assert(`required_answer_${key}_question_frozen`, entry?.question === question, entry?.question);
  assert(`required_answer_${key}_question_filled`, filled(entry?.question), entry?.question);
  assert(
    `required_answer_${key}_has_no_extra_fields`,
    entry && eq(sorted(Object.keys(entry)), ["key", "question"]),
    entry ? Object.keys(entry) : null,
  );
});
assert("required_answers_keys_unique", new Set(answers.map((a) => a.key)).size === answers.length, answers.length);

/* ------------------------------------------------------------------ */
/* 3. viewports mandatorios e viewport observado                        */
/* ------------------------------------------------------------------ */

const viewports = Array.isArray(data.viewports) ? data.viewports : [];
const vpKey = (v) => `${v.width}x${v.height}`;
const vpSet = new Set(viewports.map(vpKey));
assert("viewports_is_array", Array.isArray(data.viewports), typeof data.viewports);
assert("viewports_exactly_three", viewports.length === 3, viewports.length);
assert("viewport_mobile_390x844_present", vpSet.has("390x844"), [...vpSet]);
assert("viewport_laptop_1366x768_present", vpSet.has("1366x768"), [...vpSet]);
assert("viewport_observed_1363x936_present", vpSet.has("1363x936"), [...vpSet]);
for (const v of viewports) {
  assert(`viewport_${vpKey(v)}_label_filled`, filled(v.label), v.label);
  assert(`viewport_${vpKey(v)}_width_integer`, Number.isInteger(v.width) && v.width > 0, v.width);
  assert(`viewport_${vpKey(v)}_height_integer`, Number.isInteger(v.height) && v.height > 0, v.height);
}
assert(
  "viewport_labels_unique",
  new Set(viewports.map((v) => v.label)).size === viewports.length,
  viewports.map((v) => v.label),
);
assert(
  "viewport_observed_is_labeled_as_observed",
  viewports.find((v) => vpKey(v) === "1363x936")?.label === "observado_producao_2026_08_24",
  viewports.find((v) => vpKey(v) === "1363x936")?.label,
);
assert(
  "viewport_mandated_pair_is_the_pair_of_the_issue",
  viewports.filter((v) => ["390x844", "1366x768"].includes(vpKey(v))).length === 2,
  viewports.map(vpKey),
);

/* ------------------------------------------------------------------ */
/* 4. estados de evidencia e regra de medicao                           */
/* ------------------------------------------------------------------ */

const STATES = ["PENDING", "MEASURED_PASS", "MEASURED_FAIL"];
assert("evidence_states_exact", eq(data.evidence_states, STATES), data.evidence_states);
const rule = data.measurement_rule || "";
assert("measurement_rule_filled", filled(rule), rule);
assert("measurement_rule_requires_linked_record", /registro de medi[cç][aã]o vinculado/i.test(rule), rule);
assert("measurement_rule_forbids_opinion", /opini[aã]o/i.test(rule), rule);
assert("measurement_rule_names_axe", /axe/i.test(rule), rule);
assert("measurement_rule_names_lighthouse", /lighthouse/i.test(rule), rule);
assert("measurement_rule_names_overflow", /overflow/i.test(rule), rule);
assert(
  "measurement_rule_says_not_approved_by_those_gates",
  /Nenhuma superf[ií]cie [ée] aprovada por opini[aã]o ou por passar em axe, Lighthouse e overflow/i.test(rule),
  rule,
);

/* ------------------------------------------------------------------ */
/* 5. nenhuma alegacao de compreensao vinda de automacao                */
/* ------------------------------------------------------------------ */

const hv = data.human_validation || {};
assert("human_validation_present", hv && typeof hv === "object", typeof hv);
assert("human_validation_state_not_started", hv.state === "NOT_STARTED", hv.state);
assert("human_validation_minimum_five", hv.minimum_icp_sessions === 5, hv.minimum_icp_sessions);
assert("human_validation_completed_zero", hv.completed_icp_sessions === 0, hv.completed_icp_sessions);
assert("human_validation_sessions_empty", Array.isArray(hv.sessions) && hv.sessions.length === 0, hv.sessions);
assert("human_validation_participants_empty", Array.isArray(hv.participants) && hv.participants.length === 0, hv.participants);
assert("human_validation_protocol_package_named", hv.protocol_package === "docs/research/icp-trust-session-v1", hv.protocol_package);
assert(
  "human_validation_protocol_package_exists_on_disk",
  fs.existsSync(path.join(root, hv.protocol_package || "___missing___")),
  hv.protocol_package,
);
assert(
  "human_validation_has_no_non_empty_array",
  Object.entries(hv).every(([, value]) => !Array.isArray(value) || value.length === 0),
  Object.entries(hv).filter(([, v]) => Array.isArray(v) && v.length),
);
assert(
  "human_validation_has_no_counter_above_zero_except_minimum",
  Object.entries(hv).every(([key, value]) => typeof value !== "number" || key === "minimum_icp_sessions" || value === 0),
  Object.entries(hv).filter(([k, v]) => typeof v === "number" && k !== "minimum_icp_sessions" && v !== 0),
);

const FORBIDDEN_CLAIM = /\b(validad[oa]s?|validated|comprovad[oa]s?|aprovad[oa]s? pela medi)/i;
const forbiddenHits = allStrings.filter((s) => FORBIDDEN_CLAIM.test(s.value));
assert("no_comprehension_claim_string_in_contract", forbiddenHits.length === 0, forbiddenHits.map((s) => `${s.at}: ${s.value}`));

const boundary = data.automation_boundary || {};
assert("automation_boundary_present", boundary && typeof boundary === "object", typeof boundary);
assert(
  "automation_boundary_may_verify_list",
  eq(boundary.may_verify_pt_br, ["presença", "ordem", "viewport", "regressão de contrato"]),
  boundary.may_verify_pt_br,
);
assert(
  "automation_boundary_refuses_comprehension",
  /nunca declara compreens[aã]o humana/i.test(boundary.may_not_declare_pt_br || ""),
  boundary.may_not_declare_pt_br,
);
assert(
  "automation_boundary_refuses_llm_and_synthetic_users",
  /LLM/.test(boundary.llm_and_synthetic_users_pt_br || "") &&
    /sint[eé]tico/i.test(boundary.llm_and_synthetic_users_pt_br || "") &&
    /screenshot/i.test(boundary.llm_and_synthetic_users_pt_br || ""),
  boundary.llm_and_synthetic_users_pt_br,
);
assert(
  "human_validation_note_says_protocol_not_executed",
  /ainda n[aã]o foi executado/i.test(hv.note_pt_br || ""),
  hv.note_pt_br,
);

/* ------------------------------------------------------------------ */
/* 6. disciplina de medicao por linha do censo                          */
/* ------------------------------------------------------------------ */

const census = Array.isArray(data.census) ? data.census : [];
const CENSUS_KEYS = ["route", "surface_class", "evidence_state", "measurement", "observed_2026_08_24"];
const MEASUREMENT_KEYS = ["date", "viewport", "finding"];
const OBLIGATED_CLASSES = ["home", "money_hub", "money_offer", "money_example"];

assert("census_is_array", Array.isArray(data.census), typeof data.census);
assert("census_not_empty", census.length > 0, census.length);
assert("census_routes_unique", new Set(census.map((s) => s.route)).size === census.length, census.length);
assert(
  "obligated_surface_classes_declared",
  eq(data.obligated_surface_classes, OBLIGATED_CLASSES),
  data.obligated_surface_classes,
);

for (const surface of census) {
  const r = surface.route;
  assert(`census_${r}_route_filled`, filled(r), r);
  assert(`census_${r}_route_is_absolute_directory`, /^\/(?:[a-z0-9-]+\/)*$/.test(String(r)), r);
  assert(`census_${r}_keys_allowlisted`, Object.keys(surface).every((k) => CENSUS_KEYS.includes(k)), Object.keys(surface));
  assert(`census_${r}_class_obligated`, OBLIGATED_CLASSES.includes(surface.surface_class), surface.surface_class);
  assert(`census_${r}_state_declared`, STATES.includes(surface.evidence_state), surface.evidence_state);
  assert(`census_${r}_file_on_disk`, fs.existsSync(routeToFile(r)), routeToFile(r));

  if (surface.evidence_state === "PENDING") {
    assert(`census_${r}_pending_has_null_measurement`, surface.measurement === null, surface.measurement);
    assert(`census_${r}_pending_measurement_key_present`, "measurement" in surface, Object.keys(surface));
  } else {
    const m = surface.measurement;
    assert(`census_${r}_measured_has_record`, m !== null && typeof m === "object" && !Array.isArray(m), m);
    assert(`census_${r}_measured_keys_allowlisted`, m && Object.keys(m).every((k) => MEASUREMENT_KEYS.includes(k)), m && Object.keys(m));
    assert(`census_${r}_measured_has_date`, filled(m?.date) && /^\d{4}-\d{2}-\d{2}$/.test(m?.date || ""), m?.date);
    assert(`census_${r}_measured_date_is_real`, !Number.isNaN(Date.parse(m?.date || "")), m?.date);
    assert(`census_${r}_measured_has_viewport`, filled(m?.viewport) && vpSet.has(m.viewport), m?.viewport);
    assert(`census_${r}_measured_has_finding`, filled(m?.finding) && m.finding.trim().length >= 20, m?.finding);
    assert(`census_${r}_measured_finding_has_no_claim`, !FORBIDDEN_CLAIM.test(m?.finding || ""), m?.finding);
  }
}

const measured = census.filter((s) => s.evidence_state !== "PENDING");
const pending = census.filter((s) => s.evidence_state === "PENDING");
assert("census_has_pending_surfaces", pending.length > 0, pending.length);
assert(
  "no_measured_surface_without_record",
  measured.every((s) => s.measurement && s.measurement.date && s.measurement.viewport && s.measurement.finding),
  measured.filter((s) => !(s.measurement && s.measurement.date)).map((s) => s.route),
);
assert(
  "no_pending_surface_with_record",
  pending.every((s) => s.measurement === null),
  pending.filter((s) => s.measurement !== null).map((s) => s.route),
);
assert(
  "measured_surfaces_are_the_same_three",
  eq(sorted(measured.map((s) => s.route)), sorted(["/servicos-obras-publicas/", "/problemas-que-resolvemos/", "/diagnostico-b2g-expansao/"])),
  measured.map((s) => s.route),
);
assert(
  "every_measurement_is_dated",
  measured.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.measurement.date)),
  measured.map((s) => [s.route, s.measurement.date]),
);
assert(
  "every_measurement_uses_a_declared_viewport",
  measured.every((s) => vpSet.has(s.measurement.viewport)),
  measured.map((s) => [s.route, s.measurement.viewport]),
);

/* ------------------------------------------------------------------ */
/* 7. as duas falhas documentadas continuam documentadas                */
/* ------------------------------------------------------------------ */

const byRoute = new Map(census.map((s) => [s.route, s]));
const FROZEN = {
  "/servicos-obras-publicas/": {
    surface_class: "money_hub",
    evidence_state: "MEASURED_PASS",
    date: "2026-08-27",
    viewport: "1366x768",
    finding:
      "H1 de y=235 a y=333; linha de prova de y=445 a y=488; ação primária inteira de y=595 a y=645 em 1366x768, e de y=762 a y=812 em 390x844, dentro da dobra nos dois",
  },
  "/problemas-que-resolvemos/": {
    surface_class: "money_hub",
    evidence_state: "MEASURED_PASS",
    date: "2026-08-27",
    viewport: "1366x768",
    finding:
      "H1 de y=235 a y=382; linha de prova de y=466 a y=510; ação primária inteira de y=616 a y=666 em 1366x768, e de y=768 a y=818 em 390x844, dentro da dobra nos dois",
  },
  "/diagnostico-b2g-expansao/": {
    surface_class: "money_offer",
    evidence_state: "MEASURED_FAIL",
    date: "2026-08-24",
    viewport: "1363x936",
    finding: "preço, prazo, destinatário e CTA na primeira dobra; razão de confiança ainda declaratória e sem prova verificável",
  },
};
for (const [route, expected] of Object.entries(FROZEN)) {
  const s = byRoute.get(route);
  assert(`frozen_${route}_in_census`, Boolean(s), route);
  if (!s) continue;
  assert(`frozen_${route}_class`, s.surface_class === expected.surface_class, s.surface_class);
  assert(`frozen_${route}_state`, s.evidence_state === expected.evidence_state, s.evidence_state);
  assert(`frozen_${route}_measurement_present`, Boolean(s.measurement), s.measurement);
  assert(`frozen_${route}_date`, s.measurement?.date === expected.date, s.measurement?.date);
  assert(`frozen_${route}_viewport`, s.measurement?.viewport === expected.viewport, s.measurement?.viewport);
  assert(`frozen_${route}_finding_intact`, s.measurement?.finding === expected.finding, s.measurement?.finding);
}
// Os dois hubs foram remediados na #327. O registro deixa de guardar o texto da
// falha e passa a guardar a geometria medida: a promocao so vale com coordenadas
// nos dois viewports declarados, nunca com uma afirmacao generica de melhoria.
for (const route of ["/servicos-obras-publicas/", "/problemas-que-resolvemos/"]) {
  const finding = byRoute.get(route)?.measurement?.finding || "";
  assert(`${route}_pass_records_geometry`, /y=\d+/.test(finding), finding);
  assert(`${route}_pass_names_both_viewports`, /1366x768/.test(finding) && /390x844/.test(finding), finding);
  assert(`${route}_pass_records_primary_action`, /a[cç][aã]o prim[aá]ria/i.test(finding), finding);
}
assert(
  "reference_fails_without_verifiable_proof",
  byRoute.get("/diagnostico-b2g-expansao/")?.evidence_state === "MEASURED_FAIL" &&
    /declarat[oó]ria/i.test(byRoute.get("/diagnostico-b2g-expansao/")?.measurement?.finding || "") &&
    /sem prova verific[aá]vel/i.test(byRoute.get("/diagnostico-b2g-expansao/")?.measurement?.finding || ""),
  byRoute.get("/diagnostico-b2g-expansao/")?.measurement?.finding,
);

const entregas = byRoute.get("/entregas/");
assert("entregas_in_census", Boolean(entregas), "/entregas/");
assert("entregas_still_pending", entregas?.evidence_state === "PENDING", entregas?.evidence_state);
assert("entregas_measurement_null", entregas?.measurement === null, entregas?.measurement);
assert(
  "entregas_observed_note_intact",
  entregas?.observed_2026_08_24 ===
    "documento com cerca de 11266 px de altura; hero promove Conhecer o primeiro exemplo",
  entregas?.observed_2026_08_24,
);
assert("entregas_observed_note_keeps_height", /11266 px/.test(entregas?.observed_2026_08_24 || ""), entregas?.observed_2026_08_24);
assert(
  "observed_note_is_not_a_measurement",
  census.filter((s) => "observed_2026_08_24" in s).every((s) => s.evidence_state === "PENDING"),
  census.filter((s) => "observed_2026_08_24" in s).map((s) => [s.route, s.evidence_state]),
);

/* ------------------------------------------------------------------ */
/* 8. censo derivado do registro publico de familias                    */
/* ------------------------------------------------------------------ */

assert("family_registry_is_fail_closed", families.fail_closed === true, families.fail_closed);
const famList = Array.isArray(families.families) ? families.families : [];
assert("family_registry_has_families", famList.length > 0, famList.length);

const derivation = data.census_derivation || {};
assert("census_derivation_present", derivation && typeof derivation === "object", typeof derivation);
assert("census_derivation_authority_is_family_registry", derivation.authority === "data/organic/public-family-registry.json", derivation.authority);
assert("census_derivation_refuses_manual_allowlist", /n[aã]o [ée] allowlist manual/i.test(derivation.rule_pt_br || ""), derivation.rule_pt_br);
assert("census_derivation_declares_audit_log", /imprime o conjunto derivado/i.test(derivation.audit_pt_br || ""), derivation.audit_pt_br);
const derivationSources = Array.isArray(derivation.sources) ? derivation.sources : [];
assert("census_derivation_has_five_sources", derivationSources.length === 5, derivationSources.length);
assert(
  "census_derivation_source_ids",
  eq(derivationSources.map((s) => s.id), ["home", "money_offer", "money_example", "money_hub_priced", "money_hub_triage"]),
  derivationSources.map((s) => s.id),
);
for (const src of derivationSources) {
  assert(`derivation_source_${src.id}_class_obligated`, OBLIGATED_CLASSES.includes(src.surface_class), src.surface_class);
  assert(`derivation_source_${src.id}_from_filled`, filled(src.from), src.from);
  assert(
    `derivation_source_${src.id}_points_at_declared_authority`,
    String(src.from).startsWith("data/organic/public-family-registry.json#families["),
    src.from,
  );
}
const triageSource = derivationSources.find((s) => s.id === "money_hub_triage");
assert("derivation_triage_threshold_is_two", triageSource?.minimum_distinct_service_links === 2, triageSource?.minimum_distinct_service_links);
assert("derivation_triage_filter_written", filled(triageSource?.filter_pt_br), triageSource?.filter_pt_br);

// --- derivacao efetiva, contra o disco --------------------------------
const derived = new Map(); // route -> { surface_class, why }
function derive(route, surfaceClass, why) {
  if (!derived.has(route)) derived.set(route, { surface_class: surfaceClass, why });
}

// (a) home
const homeFamily = famList.find((f) => f.id === "home");
assert("derivation_home_family_exists", Boolean(homeFamily), "home");
for (const r of homeFamily?.match?.routes || []) derive(r, "home", "familia home");

// (b) money_offer: rotas canonicas de servico da matriz BOFU, citada pela familia service-pillars
const pillars = famList.find((f) => f.id === "service-pillars");
assert("derivation_service_pillars_family_exists", Boolean(pillars), "service-pillars");
assert(
  "derivation_service_pillars_points_at_bofu_matrix",
  pillars?.match?.source === "data/organic/bofu-intent-matrix.json#rows[].canonical_service_route",
  pillars?.match?.source,
);
const canonicalServiceRoutes = [...new Set((bofu.rows || []).map((r) => r.canonical_service_route).filter(Boolean))].sort();
assert("derivation_bofu_has_service_routes", canonicalServiceRoutes.length > 0, canonicalServiceRoutes.length);
for (const r of canonicalServiceRoutes) derive(r, "money_offer", "rota canonica de servico da matriz BOFU");

// (c) priced_offer: rotas explicitas e prefixos expandidos contra o disco
const pricedFamilies = famList.filter((f) => f.profile === "priced_offer");
assert("derivation_has_priced_offer_families", pricedFamilies.length >= 2, pricedFamilies.map((f) => f.id));
for (const fam of pricedFamilies) {
  for (const r of fam.match?.routes || []) derive(r, "money_hub", `familia priced_offer ${fam.id}`);
  const prefix = fam.match?.prefix;
  if (!prefix) continue;
  const parent = prefix.replace(/^\/+/, "").replace(/\/[^/]*$/, "");
  const leaf = prefix.split("/").pop();
  const dir = path.join(root, parent);
  assert(`derivation_prefix_parent_exists_${fam.id}`, fs.existsSync(dir), dir);
  if (!fs.existsSync(dir)) continue;
  const found = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(leaf))
    .filter((d) => fs.existsSync(path.join(dir, d.name, "index.html")))
    .map((d) => `/${parent}/${d.name}/`)
    .sort();
  assert(`derivation_prefix_expands_${fam.id}`, found.length > 0, found.length);
  for (const r of found) derive(r, "money_example", `prefixo ${prefix} expandido no disco`);
}

// (d) hubs de triagem: familias service_transition com duas ou mais rotas canonicas no <main>
const triageFamilies = famList.filter((f) => f.terminal_action === "service_transition" && Array.isArray(f.match?.routes));
assert("derivation_has_triage_families", triageFamilies.length >= 1, triageFamilies.map((f) => f.id));
const triageAudit = [];
const canonSet = new Set(canonicalServiceRoutes);
for (const fam of triageFamilies) {
  for (const r of fam.match.routes) {
    const html = mainOf(r);
    assert(`derivation_triage_${r}_has_main`, Boolean(html), r);
    if (!html) continue;
    const links = [...new Set(hrefsIn(html).filter((h) => canonSet.has(h)))].sort();
    triageAudit.push({ family: fam.id, route: r, links: links.length });
    if (links.length >= 2) derive(r, "money_hub", `hub de triagem com ${links.length} rotas canonicas no main`);
  }
}
assert("derivation_triage_audited_every_family_route", triageAudit.length === triageFamilies.reduce((n, f) => n + f.match.routes.length, 0), triageAudit.length);

// --- confronto derivado x censo ---------------------------------------
const derivedRoutes = sorted([...derived.keys()]);
const censusRoutes = sorted(census.map((s) => s.route));
assert("derived_set_is_not_empty", derivedRoutes.length > 0, derivedRoutes.length);
assert("derived_count_matches_census_count", derivedRoutes.length === censusRoutes.length, [derivedRoutes.length, censusRoutes.length]);
assert("derived_set_equals_census_set", eq(derivedRoutes, censusRoutes), {
  missing_from_census: derivedRoutes.filter((r) => !censusRoutes.includes(r)),
  not_derived: censusRoutes.filter((r) => !derivedRoutes.includes(r)),
});
for (const [route, info] of derived) {
  const s = byRoute.get(route);
  assert(`derived_route_in_census_${route}`, Boolean(s), `${route} derivado de ${info.why} e ausente do censo`);
  if (!s) continue;
  assert(`derived_route_class_matches_${route}`, s.surface_class === info.surface_class, [s.surface_class, info.surface_class]);
}
for (const route of censusRoutes) {
  assert(`census_route_is_derivable_${route}`, derived.has(route), `${route} esta no censo mas nao sai da derivacao`);
}
for (const cls of OBLIGATED_CLASSES) {
  const derivedOfClass = sorted([...derived.entries()].filter(([, i]) => i.surface_class === cls).map(([r]) => r));
  const censusOfClass = sorted(census.filter((s) => s.surface_class === cls).map((s) => s.route));
  assert(`derived_class_${cls}_matches_census`, eq(derivedOfClass, censusOfClass), { derivedOfClass, censusOfClass });
  assert(`derived_class_${cls}_not_empty`, derivedOfClass.length > 0, derivedOfClass.length);
}

// toda rota do censo pertence a uma familia publica declarada
function familyFor(route) {
  const exact = famList.find((f) => (f.match?.routes || []).includes(route));
  if (exact) return exact;
  const prefixed = famList
    .filter((f) => f.match?.prefix && route.startsWith(f.match.prefix))
    .sort((a, b) => b.match.prefix.length - a.match.prefix.length)[0];
  if (prefixed) return prefixed;
  if (canonSet.has(route)) return pillars;
  return null;
}
for (const route of censusRoutes) {
  const fam = familyFor(route);
  assert(`census_route_belongs_to_declared_family_${route}`, Boolean(fam), route);
  assert(`census_route_family_declares_conversion_gate_${route}`, fam?.gate_coverage?.conversion === "full", fam?.gate_coverage);
}

/* ------------------------------------------------------------------ */
/* 9. uma unica acao primaria dominante e nao repeticao de categoria     */
/* ------------------------------------------------------------------ */

const inv = data.first_fold_invariants || {};
assert("first_fold_invariants_present", inv && typeof inv === "object", typeof inv);
assert(
  "first_fold_invariants_keys",
  eq(sorted(Object.keys(inv)), ["category_repetition", "single_primary_action"]),
  Object.keys(inv),
);

const spa = inv.single_primary_action || {};
assert("single_primary_action_max_is_one", spa.max_primary_actions === 1, spa.max_primary_actions);
assert("single_primary_action_secondary_needs_distinct_function", spa.secondary_requires_distinct_function === true, spa.secondary_requires_distinct_function);
assert("single_primary_action_rule_written", filled(spa.rule_pt_br), spa.rule_pt_br);
assert("single_primary_action_rule_forbids_competing", /concorrente/i.test(spa.rule_pt_br || ""), spa.rule_pt_br);
assert("single_primary_action_state_declared_not_measured", spa.state === "DECLARED_NOT_MEASURED", spa.state);
assert("single_primary_action_no_fabricated_measurement", Array.isArray(spa.measured_surfaces) && spa.measured_surfaces.length === 0, spa.measured_surfaces);

const rep = inv.category_repetition || {};
assert("category_repetition_fields", eq(rep.fields, ["eyebrow", "h1", "lead"]), rep.fields);
assert("category_repetition_rule_written", filled(rep.rule_pt_br), rep.rule_pt_br);
assert("category_repetition_rule_requires_new_information", /sem acrescentar informa[cç][aã]o/i.test(rep.rule_pt_br || ""), rep.rule_pt_br);
assert("category_repetition_state_declared_not_measured", rep.state === "DECLARED_NOT_MEASURED", rep.state);
assert("category_repetition_no_fabricated_measurement", Array.isArray(rep.measured_surfaces) && rep.measured_surfaces.length === 0, rep.measured_surfaces);
const repFindings = Array.isArray(rep.recorded_findings) ? rep.recorded_findings : [];
assert("category_repetition_has_the_recorded_finding", repFindings.length === 1, repFindings.length);
assert("category_repetition_finding_route", repFindings[0]?.route === "/problemas-que-resolvemos/", repFindings[0]?.route);
assert("category_repetition_finding_date", repFindings[0]?.date === "2026-08-24", repFindings[0]?.date);
assert("category_repetition_finding_viewport", repFindings[0]?.viewport === "1363x936", repFindings[0]?.viewport);
assert("category_repetition_finding_text", /repete a mesma categoria/i.test(repFindings[0]?.finding || ""), repFindings[0]?.finding);
for (const f of repFindings) {
  assert(`category_repetition_finding_route_in_census_${f.route}`, byRoute.has(f.route), f.route);
  assert(`category_repetition_finding_viewport_declared_${f.route}`, vpSet.has(f.viewport), f.viewport);
}
assert(
  "no_census_row_declares_a_second_primary_action",
  census.every((s) => !("primary_actions" in s) || s.primary_actions <= spa.max_primary_actions),
  census.filter((s) => "primary_actions" in s && s.primary_actions > 1).map((s) => s.route),
);

/* ------------------------------------------------------------------ */
/* 10. nao duplicacao: donos nomeados, aceitacao nao repetida            */
/* ------------------------------------------------------------------ */

const own = data.ownership || {};
assert("ownership_present", own && typeof own === "object", typeof own);
const protocolOwners = Array.isArray(own.human_protocol_owners) ? own.human_protocol_owners : [];
assert("ownership_has_three_protocol_owners", protocolOwners.length === 3, protocolOwners.length);
assert(
  "ownership_protocol_owner_issues",
  eq(protocolOwners.map((o) => o.issue), ["#183", "#184", "#188"]),
  protocolOwners.map((o) => o.issue),
);
for (const owner of protocolOwners) {
  assert(`ownership_${owner.issue}_scope_written`, filled(owner.owns_pt_br), owner.owns_pt_br);
  assert(`ownership_${owner.issue}_scope_is_protocol`, /protocolo|recrutamento/i.test(owner.owns_pt_br || ""), owner.owns_pt_br);
  assert(`ownership_${owner.issue}_keys`, eq(sorted(Object.keys(owner)), ["issue", "owns_pt_br"]), Object.keys(owner));
}
const delegated = Array.isArray(own.delegated_scopes) ? own.delegated_scopes : [];
const delegatedByIssue = new Map(delegated.map((d) => [d.issue, d]));
assert("ownership_delegates_295_entregas", /entregas/i.test(delegatedByIssue.get("#295")?.owns_pt_br || ""), delegatedByIssue.get("#295"));
assert("ownership_delegates_295_comparability", /comparabilidade/i.test(delegatedByIssue.get("#295")?.owns_pt_br || ""), delegatedByIssue.get("#295"));
assert("ownership_delegates_300_terminal_action", /a[cç][aã]o terminal/i.test(delegatedByIssue.get("#300")?.owns_pt_br || ""), delegatedByIssue.get("#300"));
assert("ownership_delegates_267_parity", /paridade/i.test(delegatedByIssue.get("#267")?.owns_pt_br || ""), delegatedByIssue.get("#267"));
assert("ownership_non_restatement_written", filled(own.non_restatement_pt_br), own.non_restatement_pt_br);
assert(
  "ownership_non_restatement_says_only_owned_evidence",
  /somente a evid[eê]ncia que lhe pertence/i.test(own.non_restatement_pt_br || ""),
  own.non_restatement_pt_br,
);

const contractText = allStrings.map((s) => s.value).join("\n");
assert("contract_does_not_restate_4_of_5_acceptance", !/(\b4\s*\/\s*5\b|quatro de cinco|4 de 5)/i.test(contractText), contractText.match(/4\s*\/\s*5|quatro de cinco|4 de 5/i));
assert("contract_does_not_restate_recruitment_criteria", !/eleg[ií]ve(l|is) e consentid/i.test(contractText), contractText.match(/eleg[ií]ve(l|is) e consentid[^\n]*/i));
assert("contract_does_not_copy_axe_lighthouse_acceptance", !/permanecem verdes/i.test(contractText), contractText.match(/permanecem verdes/i));
for (const issue of ["#183", "#184", "#188", "#295", "#300"]) {
  assert(`contract_names_issue_${issue.slice(1)}`, contractText.includes(issue), issue);
}
assert("contract_names_its_own_issue_once_as_owner", data.issue === "#327", data.issue);

/* ------------------------------------------------------------------ */
/* 11. tipografia: sem travessao no contrato nem no gate                 */
/* ------------------------------------------------------------------ */

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const selfRaw = fs.readFileSync(SELF_PATH, "utf8");
assert("no_em_dash_in_data_file", !raw.includes(EM_DASH), raw.indexOf(EM_DASH));
assert("no_en_dash_in_data_file", !raw.includes(EN_DASH), raw.indexOf(EN_DASH));
assert("no_em_dash_in_test_file", !selfRaw.includes(EM_DASH), selfRaw.indexOf(EM_DASH));
assert("no_en_dash_in_test_file", !selfRaw.includes(EN_DASH), selfRaw.indexOf(EN_DASH));

/* ------------------------------------------------------------------ */
/* 12. o gate esta ligado ao CI e ao seletor                             */
/* ------------------------------------------------------------------ */

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert(
  "npm_script_registered",
  pkg.scripts?.["test:first-fold-contract"] === "node tests/commercial/test_first_fold_contract.mjs",
  pkg.scripts?.["test:first-fold-contract"],
);
assert("npm_test_runs_this_gate", /npm run test:first-fold-contract/.test(pkg.scripts?.test || ""), "npm test");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/site-ci.yml"), "utf8");
assert("site_ci_runs_this_gate", workflow.includes("npm run test:first-fold-contract"), "site-ci.yml");
const graph = fs.readFileSync(path.join(root, "scripts/site/affected_graph.mjs"), "utf8");
assert("affected_graph_declares_this_gate", graph.includes('"test:first-fold-contract"'), "affected_graph.mjs");
assert("affected_graph_declares_the_contract_producer", graph.includes("data/commercial/first-fold-contract.v1.json"), "affected_graph.mjs");
assert("affected_graph_declares_the_family_registry_producer", graph.includes("data/organic/public-family-registry.json"), "affected_graph.mjs");
assert(
  "affected_public_html_selects_first_fold_gate",
  consumerSuitesForPath("conteudos/fixture-public-surface/index.html").some((entry) => entry.id === "test:first-fold-contract"),
  "conteudos/fixture-public-surface/index.html",
);

/* ------------------------------------------------------------------ */
/* auditoria legivel da derivacao                                       */
/* ------------------------------------------------------------------ */

console.log(`${NAME}: derivacao do censo (autoridade: data/organic/public-family-registry.json)`);
for (const src of derivationSources) {
  const routes = sorted([...derived.entries()].filter(([, i]) => i.surface_class === src.surface_class).map(([r]) => r));
  console.log(`  ${src.id} (${src.surface_class}) <- ${src.from}${src.resolves_to ? ` -> ${src.resolves_to}` : ""}`);
}
for (const cls of OBLIGATED_CLASSES) {
  const routes = sorted([...derived.entries()].filter(([, i]) => i.surface_class === cls).map(([r]) => r));
  console.log(`  ${cls}: ${routes.length} rota(s) ${JSON.stringify(routes)}`);
}
for (const row of triageAudit) {
  console.log(`  triagem ${row.route} (familia ${row.family}): ${row.links} rota(s) canonica(s) no main, limiar ${triageSource?.minimum_distinct_service_links}`);
}
console.log(`  derivado=${derivedRoutes.length} censo=${censusRoutes.length} diferenca=${JSON.stringify({
  missing_from_census: derivedRoutes.filter((r) => !censusRoutes.includes(r)),
  not_derived: censusRoutes.filter((r) => !derivedRoutes.includes(r)),
})}`);
console.log(`  medidas=${measured.length} pendentes=${pending.length} sessoes_icp=${hv.completed_icp_sessions}/${hv.minimum_icp_sessions} estado_humano=${hv.state}`);

/* ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`${NAME}: ${failed.length} check(s) failed`);
  process.exit(1);
}
