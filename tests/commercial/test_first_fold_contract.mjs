/**
 * Gate fail-closed do contrato de primeira dobra (issue #327).
 *
 * O contrato `data/commercial/first-fold-contract.v1.json` ja existia em main,
 * mas nada impedia que alguem promovesse uma rota para MEASURED_PASS por
 * opiniao, inventasse uma sessao humana ou publicasse uma superficie comercial
 * nova sem linha de censo. Este gate fecha as portas:
 *
 *   1. nenhuma rota obrigada pode ficar sem medicao;
 *   2. o estado de cada rota e refeito a partir do registro bruto de
 *      `data/commercial/first-fold-measurements.v1.json`, com as mesmas funcoes
 *      de `scripts/site/first_fold_rules.mjs` que o medidor usou, entao editar o
 *      censo a mao reprova;
 *   3. nenhuma alegacao de compreensao pode nascer de automacao;
 *   4. o censo e derivado do registro publico de familias, nao mantido a mao;
 *   5. uma falha medida precisa nomear dono e data, e so e aceita numa rota que
 *      a #291 realmente congelou.
 *
 * A automacao aqui verifica caixa renderizada, contagem de acao, repeticao
 * lexical, viewport e regressao de contrato. Ela nunca declara compreensao
 * humana: isso depende do protocolo de 3 segundos que #183, #184 e #188
 * possuem e que segue NOT_STARTED.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { consumerSuitesForPath } from "../../scripts/site/affected_graph.mjs";
import {
  DESKTOP_VIEWPORT,
  FIRST_FOLD_ROLES,
  MOBILE_VIEWPORT,
  ROLE_SELECTORS,
  blockerText,
  categoryRepetition,
  foldProblems,
  frozenRoutes,
  measurementRecord,
} from "../../scripts/site/first_fold_rules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const NAME = "first-fold-contract";

const DATA_PATH = path.join(root, "data/commercial/first-fold-contract.v1.json");
const FAMILY_REGISTRY_PATH = path.join(root, "data/organic/public-family-registry.json");
const BOFU_PATH = path.join(root, "data/organic/bofu-intent-matrix.json");
const EVIDENCE_PATH = path.join(root, "data/commercial/first-fold-measurements.v1.json");
const UNLOCK_PLAN_PATH = path.join(root, "data/bofu-dominance/frozen-specs/unlock-plan.v1.json");
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
assert("contract_version_frozen", data.contract_version === "CFG-FIRST-FOLD-2026-08-30-v3", data.contract_version);
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
const MEASUREMENT_KEYS = ["date", "viewport", "finding", "blocker"];
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
// A #327 fechou as pendencias medindo, nao apagando a linha. O gate agora
// recusa qualquer rota obrigada que volte a nao ter medicao: uma superficie
// comercial nova entra no censo ja medida ou reprova.
assert("census_has_no_pending_surface", pending.length === 0, pending.map((s) => s.route));
assert("every_obligated_surface_is_measured", measured.length === census.length, [measured.length, census.length]);
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
  "measured_set_is_the_whole_census",
  eq(sorted(measured.map((s) => s.route)), sorted(census.map((s) => s.route))),
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
/* 7. o censo e derivado da medicao, nao digitado                       */
/* ------------------------------------------------------------------ */

const byRoute = new Map(census.map((s) => [s.route, s]));

// A #327 mediu as 25 rotas em Chrome headless, nos dois viewports obrigados.
// O registro bruto vive num arquivo proprio, e este gate refaz o veredito a
// partir dele com as mesmas funcoes que o medidor usou. Promover uma rota
// editando o censo a mao passa a reprovar, porque o texto do registro e
// derivado das coordenadas e nao pode ser escrito por opiniao.
assert("measurement_evidence_exists", fs.existsSync(EVIDENCE_PATH), EVIDENCE_PATH);
assert("unlock_plan_exists", fs.existsSync(UNLOCK_PLAN_PATH), UNLOCK_PLAN_PATH);
if (!fs.existsSync(EVIDENCE_PATH) || !fs.existsSync(UNLOCK_PLAN_PATH)) bail();

let evidence = null;
try {
  evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf8"));
  pass("measurement_evidence_parses");
} catch (err) {
  fail("measurement_evidence_parses", String(err));
  bail();
}
const unlockPlan = JSON.parse(fs.readFileSync(UNLOCK_PLAN_PATH, "utf8"));
const FROZEN_ROUTES = frozenRoutes(unlockPlan);
const BLOCKER = blockerText(unlockPlan);

assert("evidence_schema_is_measurements_v1", evidence.schema === "confenge.first-fold-measurements/1.0", evidence.schema);
assert("evidence_belongs_to_issue_327", evidence.issue === "#327", evidence.issue);
assert("evidence_names_the_shared_rules_module", evidence.rules === "scripts/site/first_fold_rules.mjs", evidence.rules);
assert(
  "evidence_rules_module_exists_on_disk",
  fs.existsSync(path.join(root, evidence.rules || "___missing___")),
  evidence.rules,
);
assert("evidence_measures_both_mandated_viewports", eq(evidence.viewports, [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]), evidence.viewports);
assert(
  "evidence_viewports_are_declared_by_the_contract",
  (evidence.viewports || []).every((v) => vpSet.has(v)),
  evidence.viewports,
);
assert("evidence_records_a_commit_sha", /^[0-9a-f]{40}$/.test(evidence.commit_sha || ""), evidence.commit_sha);
assert("evidence_records_a_measurement_date", /^\d{4}-\d{2}-\d{2}$/.test(evidence.measured_on || ""), evidence.measured_on);
assert("evidence_role_selectors_match_the_rules", eq(evidence.role_selectors, ROLE_SELECTORS), Object.keys(evidence.role_selectors || {}));
assert(
  "unlock_plan_still_refuses_html_mutation",
  unlockPlan.html_mutation_authorized === false,
  unlockPlan.html_mutation_authorized,
);
assert("unlock_plan_protects_six_pillars", FROZEN_ROUTES.size === 6, [...FROZEN_ROUTES]);

const measuredByRoute = new Map((evidence.routes || []).map((row) => [row.route, row]));
assert(
  "evidence_covers_exactly_the_census",
  eq(sorted([...measuredByRoute.keys()]), sorted(census.map((s) => s.route))),
  {
    missing: census.map((s) => s.route).filter((r) => !measuredByRoute.has(r)),
    extra: [...measuredByRoute.keys()].filter((r) => !byRoute.has(r)),
  },
);

const ACTION_RE =
  /a[cç][aã]o prim[aá]ria inteira de y=(\d+) a y=(\d+) em (\d+)x(\d+), e de y=(\d+) a y=(\d+) em (\d+)x(\d+)/i;
const HEAD_RE = /H1 de y=(\d+) a y=(\d+); linha de prova de y=(\d+) a y=(\d+)/i;

for (const surface of census) {
  const route = surface.route;
  const row = measuredByRoute.get(route);
  assert(`evidence_${route}_present`, Boolean(row), route);
  if (!row) continue;

  // O veredito nao e opiniao: e a lista de problemas geometricos da medicao.
  const derived = measurementRecord(row, BLOCKER);
  assert(`census_${route}_state_matches_the_measurement`, surface.evidence_state === derived.state, [
    surface.evidence_state,
    derived.state,
    foldProblems(row),
  ]);
  assert(`census_${route}_record_is_derived_from_the_measurement`, eq(surface.measurement, derived.record), [
    surface.measurement,
    derived.record,
  ]);
  assert(`census_${route}_date_matches_the_measurement`, surface.measurement?.date === evidence.measured_on, [
    surface.measurement?.date,
    evidence.measured_on,
  ]);

  // A repeticao de categoria tambem e refeita a partir do texto medido, para
  // que o invariante nao possa ser declarado sem o texto que o sustenta.
  const desktop = row.viewports?.[DESKTOP_VIEWPORT];
  const repetition = categoryRepetition({
    eyebrow: desktop?.roles?.eyebrow?.text,
    h1: desktop?.roles?.h1?.text,
    lead: desktop?.roles?.lead?.text,
  });
  assert(`evidence_${route}_repetition_is_reproducible`, eq(row.category_repetition, repetition), [
    row.category_repetition,
    repetition,
  ]);

  for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
    const view = row.viewports?.[viewport];
    assert(`evidence_${route}_${viewport}_present`, Boolean(view), viewport);
    if (!view) continue;
    assert(`evidence_${route}_${viewport}_reports_its_own_viewport`, view.viewport === viewport, view.viewport);
    if (surface.evidence_state !== "MEASURED_PASS") continue;
    const height = Number(viewport.split("x")[1]);
    for (const role of FIRST_FOLD_ROLES) {
      const box = view.roles?.[role]?.box;
      assert(
        `pass_${route}_${viewport}_${role}_inside_the_fold`,
        Boolean(box) && box.top >= 0 && box.bottom <= height && box.bottom > box.top,
        [role, box, height],
      );
    }
    assert(
      `pass_${route}_${viewport}_has_one_primary_action`,
      (view.primary_actions_in_fold || []).length === 1,
      (view.primary_actions_in_fold || []).map((a) => a.text),
    );
    assert(`pass_${route}_${viewport}_has_no_horizontal_overflow`, view.horizontal_overflow === false, view.horizontal_overflow);
  }

  if (surface.evidence_state === "MEASURED_PASS") {
    assert(`pass_${route}_repetition_is_clean`, row.category_repetition?.ok === true, row.category_repetition);

    // Razao de confianca conferivel: a linha de prova precisa levar a um
    // destino publico que existe no disco e abre sem cadastro. Uma frase de
    // posicionamento sem destino nao e prova, e foi exatamente o defeito
    // medido em /diagnostico-b2g-expansao/ em 2026-08-24.
    const proofLink = desktop?.verifiable_proof;
    assert(`pass_${route}_proof_links_a_public_destination`, Boolean(proofLink?.href), proofLink);
    if (proofLink?.href) {
      assert(`pass_${route}_proof_destination_is_internal`, proofLink.href.startsWith("/"), proofLink.href);
      assert(
        `pass_${route}_proof_destination_is_published`,
        fs.existsSync(routeToFile(proofLink.href.split("#")[0].split("?")[0])),
        proofLink.href,
      );
    }

    // O texto do registro precisa citar a geometria e bater com ela.
    const finding = surface.measurement?.finding || "";
    const action = finding.match(ACTION_RE);
    const head = finding.match(HEAD_RE);
    assert(`pass_${route}_records_primary_action_geometry`, Boolean(action), finding);
    assert(`pass_${route}_records_head_geometry`, Boolean(head), finding);
    if (!action || !head) continue;
    const [, actionTopDesktop, actionBottomDesktop, w1, h1v, actionTopMobile, actionBottomMobile, w2, h2v] = action.map(Number);
    const [, h1Top, h1Bottom, proofTop, proofBottom] = head.map(Number);

    assert(`pass_${route}_names_declared_viewports`, vpSet.has(`${w1}x${h1v}`) && vpSet.has(`${w2}x${h2v}`), [
      `${w1}x${h1v}`,
      `${w2}x${h2v}`,
    ]);
    assert(`pass_${route}_names_two_distinct_viewports`, `${w1}x${h1v}` !== `${w2}x${h2v}`, [w1, w2]);
    assert(`pass_${route}_action_within_fold_at_${w1}x${h1v}`, actionBottomDesktop <= h1v, [actionBottomDesktop, h1v]);
    assert(`pass_${route}_action_within_fold_at_${w2}x${h2v}`, actionBottomMobile <= h2v, [actionBottomMobile, h2v]);
    assert(`pass_${route}_action_boxes_have_height`, actionBottomDesktop > actionTopDesktop && actionBottomMobile > actionTopMobile, [
      actionTopDesktop,
      actionBottomDesktop,
      actionTopMobile,
      actionBottomMobile,
    ]);
    assert(`pass_${route}_head_boxes_have_height`, h1Bottom > h1Top && proofBottom > proofTop, [h1Top, h1Bottom, proofTop, proofBottom]);
    assert(`pass_${route}_head_within_fold_at_${w1}x${h1v}`, proofBottom <= h1v && h1Bottom <= h1v, [h1Bottom, proofBottom, h1v]);
    assert(`pass_${route}_title_is_read_before_the_proof`, h1Top < proofTop, [h1Top, proofTop]);

    // As coordenadas citadas sao as coordenadas medidas, nao numeros redondos.
    const measuredH1 = row.viewports[DESKTOP_VIEWPORT].roles.h1.box;
    const measuredProof = row.viewports[DESKTOP_VIEWPORT].roles.proof.box;
    const measuredActionDesktop = row.viewports[DESKTOP_VIEWPORT].roles.primary_action.box;
    const measuredActionMobile = row.viewports[MOBILE_VIEWPORT].roles.primary_action.box;
    assert(`pass_${route}_h1_coordinates_match_the_measurement`, h1Top === measuredH1.top && h1Bottom === measuredH1.bottom, [
      [h1Top, h1Bottom],
      measuredH1,
    ]);
    assert(
      `pass_${route}_proof_coordinates_match_the_measurement`,
      proofTop === measuredProof.top && proofBottom === measuredProof.bottom,
      [[proofTop, proofBottom], measuredProof],
    );
    assert(
      `pass_${route}_action_coordinates_match_the_measurement`,
      actionTopDesktop === measuredActionDesktop.top &&
        actionBottomDesktop === measuredActionDesktop.bottom &&
        actionTopMobile === measuredActionMobile.top &&
        actionBottomMobile === measuredActionMobile.bottom,
      [[actionTopDesktop, actionBottomDesktop, actionTopMobile, actionBottomMobile], measuredActionDesktop, measuredActionMobile],
    );
  }

  if (surface.evidence_state === "MEASURED_FAIL") {
    // Uma falha honesta nomeia dono e data. Falha sem bloqueio declarado, ou
    // numa rota que ninguem congelou, e divida escondida e reprova aqui.
    assert(`fail_${route}_records_coordinates`, /y=\d+/.test(surface.measurement?.finding || ""), surface.measurement?.finding);
    assert(`fail_${route}_names_a_blocking_issue`, /#\d+/.test(surface.measurement?.blocker || ""), surface.measurement?.blocker);
    assert(`fail_${route}_blocker_is_the_declared_one`, surface.measurement?.blocker === BLOCKER, surface.measurement?.blocker);
    assert(`fail_${route}_is_a_frozen_pillar`, FROZEN_ROUTES.has(route), route);
    assert(`fail_${route}_has_measured_problems`, foldProblems(row).length > 0, foldProblems(row));
  }
}

// Toda rota que a #291 congela esta no censo e continua reprovando enquanto o
// HTML dela nao puder ser tocado. Quando a data chegar, remediar e remedir.
for (const route of FROZEN_ROUTES) {
  assert(`frozen_pillar_${route}_is_in_the_census`, byRoute.has(route), route);
  assert(
    `frozen_pillar_${route}_is_not_promoted_while_frozen`,
    byRoute.get(route)?.evidence_state === "MEASURED_FAIL",
    byRoute.get(route)?.evidence_state,
  );
}
const failures = census.filter((s) => s.evidence_state === "MEASURED_FAIL");
assert(
  "every_measured_failure_is_a_frozen_pillar",
  failures.every((s) => FROZEN_ROUTES.has(s.route)),
  failures.map((s) => s.route),
);
assert(
  "the_reference_offer_no_longer_lacks_verifiable_proof",
  byRoute.get("/diagnostico-b2g-expansao/")?.evidence_state === "MEASURED_PASS" &&
    Boolean(measuredByRoute.get("/diagnostico-b2g-expansao/")?.viewports?.[DESKTOP_VIEWPORT]?.verifiable_proof?.href),
  [
    byRoute.get("/diagnostico-b2g-expansao/")?.evidence_state,
    measuredByRoute.get("/diagnostico-b2g-expansao/")?.viewports?.[DESKTOP_VIEWPORT]?.verifiable_proof,
  ],
);

const entregas = byRoute.get("/entregas/");
assert("entregas_in_census", Boolean(entregas), "/entregas/");
assert("entregas_is_measured", entregas?.evidence_state === "MEASURED_PASS", entregas?.evidence_state);
assert("entregas_has_a_measurement_record", Boolean(entregas?.measurement?.finding), entregas?.measurement);
assert(
  "entregas_observed_note_intact",
  entregas?.observed_2026_08_24 ===
    "documento com cerca de 11266 px de altura; hero promove Conhecer o primeiro exemplo",
  entregas?.observed_2026_08_24,
);
assert("entregas_observed_note_keeps_height", /11266 px/.test(entregas?.observed_2026_08_24 || ""), entregas?.observed_2026_08_24);
// Uma nota de observacao nunca foi medicao e continua nao sendo: a linha que a
// carrega precisa carregar tambem um registro com coordenadas.
assert(
  "observed_note_is_not_a_measurement",
  census
    .filter((s) => "observed_2026_08_24" in s)
    .every((s) => s.evidence_state !== "PENDING" && /y=\d+/.test(s.measurement?.finding || "")),
  census.filter((s) => "observed_2026_08_24" in s).map((s) => [s.route, s.evidence_state, s.measurement?.finding]),
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
const exampleSource = derivationSources.find((s) => s.id === "money_example");
assert(
  "derivation_money_example_excludes_pilot_staging",
  /PILOT_STAGING/.test(exampleSource?.filter_pt_br || ""),
  exampleSource?.filter_pt_br,
);

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

// (c) priced_offer: rotas explicitas e prefixos expandidos contra o disco.
// PILOT_STAGING stays in the public family registry (ownership + noindex
// governance) but is not a first-fold obligated money surface until the
// dated DEFER decision authorizes activation. Measuring those pages today
// fails the fold (proof/CTA below the fold) and they are not #291-frozen.
const pricedFamilies = famList.filter((f) => f.profile === "priced_offer");
assert("derivation_has_priced_offer_families", pricedFamilies.length >= 2, pricedFamilies.map((f) => f.id));
const obligatedPricedFamilies = pricedFamilies.filter((f) => f.classification !== "PILOT_STAGING");
assert(
  "derivation_excludes_pilot_staging_from_first_fold_census",
  pricedFamilies.some((f) => f.classification === "PILOT_STAGING")
    && obligatedPricedFamilies.every((f) => f.classification !== "PILOT_STAGING"),
  pricedFamilies.filter((f) => f.classification === "PILOT_STAGING").map((f) => f.id),
);
for (const fam of obligatedPricedFamilies) {
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
// O invariante deixou de ser declaratorio. Cada linha vem da contagem de acoes
// primarias inteiramente dentro da dobra, medida nos dois viewports, e o gate
// refaz a contagem contra o registro bruto antes de aceitar o numero.
assert("single_primary_action_state_measured", spa.state === "MEASURED", spa.state);
assert("single_primary_action_measured_on", /^\d{4}-\d{2}-\d{2}$/.test(spa.measured_at || ""), spa.measured_at);
assert(
  "single_primary_action_covers_the_whole_census",
  Array.isArray(spa.measured_surfaces) &&
    eq(sorted(spa.measured_surfaces.map((s) => s.route)), sorted(census.map((s) => s.route))),
  (spa.measured_surfaces || []).map((s) => s.route),
);
for (const entry of spa.measured_surfaces || []) {
  const row = measuredByRoute.get(entry.route);
  const counted = {
    [DESKTOP_VIEWPORT]: (row?.viewports?.[DESKTOP_VIEWPORT]?.primary_actions_in_fold || []).length,
    [MOBILE_VIEWPORT]: (row?.viewports?.[MOBILE_VIEWPORT]?.primary_actions_in_fold || []).length,
  };
  assert(
    `single_primary_action_count_matches_measurement_${entry.route}`,
    eq(entry.primary_actions_in_fold, counted),
    [entry.primary_actions_in_fold, counted],
  );
  for (const [viewport, count] of Object.entries(entry.primary_actions_in_fold || {})) {
    assert(
      `single_primary_action_no_competing_action_${entry.route}_${viewport}`,
      count <= spa.max_primary_actions,
      [viewport, count],
    );
  }
  if (byRoute.get(entry.route)?.evidence_state === "MEASURED_PASS") {
    assert(
      `single_primary_action_is_dominant_${entry.route}`,
      Object.values(entry.primary_actions_in_fold || {}).every((count) => count === 1),
      entry.primary_actions_in_fold,
    );
  }
  // Acao secundaria so vale quando cumpre funcao distinta, ou seja, quando o
  // destino difere do destino da primaria.
  for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
    const view = row?.viewports?.[viewport];
    const primaryHrefs = new Set((view?.primary_actions_in_fold || []).map((a) => a.href));
    const collisions = (view?.secondary_actions_in_fold || []).filter((a) => primaryHrefs.has(a.href));
    assert(
      `secondary_action_has_distinct_function_${entry.route}_${viewport}`,
      spa.secondary_requires_distinct_function !== true || collisions.length === 0,
      collisions,
    );
  }
}

const rep = inv.category_repetition || {};
assert("category_repetition_fields", eq(rep.fields, ["eyebrow", "h1", "lead"]), rep.fields);
assert("category_repetition_rule_written", filled(rep.rule_pt_br), rep.rule_pt_br);
assert("category_repetition_rule_requires_new_information", /sem acrescentar informa[cç][aã]o/i.test(rep.rule_pt_br || ""), rep.rule_pt_br);
// Idem para a repeticao de categoria: o estado vem do texto medido de eyebrow,
// H1 e lead, e o gate reproduz o calculo antes de aceitar a linha.
assert("category_repetition_state_measured", rep.state === "MEASURED", rep.state);
assert("category_repetition_measured_on", /^\d{4}-\d{2}-\d{2}$/.test(rep.measured_at || ""), rep.measured_at);
assert("category_repetition_method_written", filled(rep.method_pt_br), rep.method_pt_br);
assert(
  "category_repetition_covers_the_whole_census",
  Array.isArray(rep.measured_surfaces) &&
    eq(sorted(rep.measured_surfaces.map((s) => s.route)), sorted(census.map((s) => s.route))),
  (rep.measured_surfaces || []).map((s) => s.route),
);
for (const entry of rep.measured_surfaces || []) {
  const row = measuredByRoute.get(entry.route);
  const desktop = row?.viewports?.[DESKTOP_VIEWPORT];
  const recomputed = categoryRepetition({
    eyebrow: desktop?.roles?.eyebrow?.text,
    h1: desktop?.roles?.h1?.text,
    lead: desktop?.roles?.lead?.text,
  });
  assert(`category_repetition_ok_matches_measurement_${entry.route}`, entry.ok === recomputed.ok, [entry.ok, recomputed]);
  assert(
    `category_repetition_words_match_measurement_${entry.route}`,
    eq(entry.eyebrow_adds, recomputed.eyebrow_new.slice(0, 4)) && eq(entry.lead_adds, recomputed.lead_new.slice(0, 4)),
    [entry, recomputed],
  );
  if (byRoute.get(entry.route)?.evidence_state === "MEASURED_PASS") {
    assert(`category_repetition_clean_on_pass_${entry.route}`, entry.ok === true, entry);
  }
}
// A remediacao nao apaga o defeito registrado em 2026-08-24. Ela fica ao lado
// dele, e a rota que o carregava precisa aparecer medida e limpa agora.
assert(
  "category_repetition_recorded_finding_route_is_now_clean",
  (rep.measured_surfaces || []).find((s) => s.route === "/problemas-que-resolvemos/")?.ok === true,
  (rep.measured_surfaces || []).find((s) => s.route === "/problemas-que-resolvemos/"),
);
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
const passing = census.filter((s) => s.evidence_state === "MEASURED_PASS");
console.log(`  medidas=${measured.length} aprovadas=${passing.length} reprovadas=${failures.length} pendentes=${pending.length}`);
for (const s of failures) console.log(`  reprovada ${s.route}: ${s.measurement.finding}`);
console.log(`  sessoes_icp=${hv.completed_icp_sessions}/${hv.minimum_icp_sessions} estado_humano=${hv.state} evidencia=${evidence.commit_sha.slice(0, 12)}`);

/* ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`${NAME}: ${failed.length} check(s) failed`);
  process.exit(1);
}
