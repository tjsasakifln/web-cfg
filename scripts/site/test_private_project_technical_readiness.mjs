/**
 * Drives the shipped private_project_technical_readiness_v1 transform.
 * No reimplementation. No starting past diagnosePrivateProjectTechnicalReadiness.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const enginePath = resolve(root, "assets/js/private-project-technical-readiness.cjs");
const jsPath = resolve(root, "assets/js/private-project-technical-readiness.js");
const E = require(enginePath);

const htmlPath = resolve(
  root,
  "ferramentas/prontidao-tecnica-obra-privada/index.html",
);
const appPath = resolve(
  root,
  "ferramentas/prontidao-tecnica-obra-privada/app.js",
);

let failed = 0;
const pass = (n, d = "") => console.log("PASS", n, d);
const fail = (n, d) => {
  console.error("FAIL", n, d);
  failed += 1;
};

function expect(name, cond, detail) {
  if (cond) pass(name, detail || "");
  else fail(name, detail || "");
}

const {
  diagnosePrivateProjectTechnicalReadiness: diagnose,
  ENGINE_ID,
  ASSET_ID,
  NUCLEUS,
  OFFER_CANDIDATE,
  SOURCE,
  EVIDENCE_PRESENT,
  GAP,
  UNKNOWN,
  FACT_USER_SUPPLIED,
  CALCULATION,
  INFERENCE,
  PRIORITY_UNKNOWN,
  DOMAIN_IDS,
  VOCAB,
  QUESTION_IDS,
  compareDomainReadiness,
  buildAnalyticsEvent,
  collectForbiddenClaims,
  causalDomainsForQuestion,
  emptyAnswers,
  normalizeAnswers,
} = E;

expect("twins_identical", readFileSync(jsPath, "utf8") === readFileSync(enginePath, "utf8"));
expect("engine_id", ENGINE_ID === "private_project_technical_readiness_v1");
expect("asset_id", ASSET_ID === ENGINE_ID);
expect("nucleus", NUCLEUS === "building_engineering_documentation");
expect("offer", OFFER_CANDIDATE === "private_project_technical_readiness_assessment");
expect("source", SOURCE === "CONFENGE_WEB");
expect("outbound_false", E.OUTBOUND_ELIGIBLE === false);
expect("auto_send_false", E.AUTO_SEND === false);
expect("seven_domains", DOMAIN_IDS.length === 7);

function presentAnswers() {
  return {
    work_stage: "execucao",
    decision_on_table: "aprovar_medicao",
    scope_record: "escrito_assinado",
    design_set: "completo_revisao_atual",
    revision_control: "numerada_com_datas",
    design_responsibility: "nomeada_por_disciplina",
    quantities: "takeoff_ligado_projetos",
    budget: "composicoes_e_bases",
    calc_memory: "presente_ligada",
    coordination: "issue_register_rastreado",
    bim_or_constructability: "revisao_construtibilidade_registrada",
    change_control: "registro_escrito_com_impacto",
    execution_records: "diario_e_base_medicao",
    measurement_trace: "ligada_orcamento_e_executado",
    asbuilt: "atual",
    handover_docs: "manuais_garantias_ensaios",
    art_declared: "emitida_declarada",
    inspections_declared: "registradas",
  };
}

function gapAnswers() {
  return {
    work_stage: "execucao",
    decision_on_table: "iniciar_execucao",
    scope_record: "so_verbal",
    design_set: "nenhum",
    revision_control: "arquivos_sem_controle",
    design_responsibility: "nao_nomeada",
    quantities: "nenhum",
    budget: "nenhum",
    calc_memory: "nenhum",
    coordination: "nenhum",
    bim_or_constructability: "nenhum",
    change_control: "nenhum",
    execution_records: "nenhum",
    measurement_trace: "nenhum",
    asbuilt: "nenhum",
    handover_docs: "nenhum",
    art_declared: "nao_emitida_declarada",
    inspections_declared: "nao_registradas",
  };
}

function domainById(result, id) {
  return result.domains.find((row) => row.id === id);
}

{
  const first = diagnose(presentAnswers(), { expected_engine_id: ENGINE_ID });
  const second = diagnose(presentAnswers(), { expected_engine_id: ENGINE_ID });
  expect("replay_deep_equal", JSON.stringify(first) === JSON.stringify(second));
  expect("replay_hash", first.result_hash === second.result_hash);
  expect("no_percentage_field", !("percentage" in first) && !("score" in first) && !("progressPct" in first));
  expect("all_present", first.gap_count === 0 && first.unknown_count === 0 && first.present_count === 7);
  expect("facts_epistemic", first.facts.work_stage.epistemic === FACT_USER_SUPPLIED);
  expect("domain_calc", first.domains.every((d) => d.epistemic === CALCULATION));
  expect("consequence_inference", first.domains.every((d) => d.consequence_epistemic === INFERENCE));
  expect("hash_shape", /^[0-9a-f]{8}$/.test(first.result_hash));
  expect("bridge_no_pii", !JSON.stringify(first.commercial_bridge).includes("@") && first.commercial_bridge.outbound_eligible === false);
}

{
  let threw = false;
  try {
    diagnose({ ...presentAnswers(), email: "pessoa@example.invalid" });
  } catch (err) {
    threw = String(err.message).startsWith("forbidden_input:");
  }
  expect("reject_contact_key", threw);
}

{
  const withoutContact = diagnose(presentAnswers());
  expect("result_without_contact", withoutContact.domains.length === 7 && withoutContact.gap_count === 0);
}

{
  const unknownAll = diagnose({});
  expect("all_unknown_count", unknownAll.unknown_count === 7 && unknownAll.present_count === 0 && unknownAll.gap_count === 0, JSON.stringify({ u: unknownAll.unknown_count, p: unknownAll.present_count, g: unknownAll.gap_count }));
  for (const id of DOMAIN_IDS) {
    expect("unknown_" + id, domainById(unknownAll, id).status === UNKNOWN);
    expect("unknown_priority_" + id, domainById(unknownAll, id).priority === PRIORITY_UNKNOWN);
  }
  expect("unknown_stage_not_present_execution", domainById(unknownAll, "changes_execution_measurement").applicability === "unknown_until_stage_or_decision_declared");
  expect("unknown_stage_not_present_handover", domainById(unknownAll, "asbuilt_handover_operations").applicability === "unknown_until_stage_or_decision_declared");
  const planning = diagnose({ work_stage: "planejamento" });
  expect("planning_skips_execution", domainById(planning, "changes_execution_measurement").applicability === "not_required_at_declared_stage" && domainById(planning, "changes_execution_measurement").status === EVIDENCE_PRESENT);
  expect("planning_skips_handover", domainById(planning, "asbuilt_handover_operations").applicability === "not_required_at_declared_stage" && domainById(planning, "asbuilt_handover_operations").status === EVIDENCE_PRESENT);
}

{
  const gapped = diagnose(gapAnswers());
  expect("gaps_on_required", gapped.gap_count >= 5);
  const art = domainById(gapped, "technical_responsibility_art_inspections");
  expect("d7_gap_declared_absence", art.status === GAP);
  expect("d7_no_legal", art.legal_conclusion === false && art.art_validity_conclusion === false && art.declared_condition_only === true);
  expect("d7_gap_names_art_document", /documento de ART/i.test(art.missing_evidence));
  expect("d7_gap_names_inspection_records", /registros de inspeção/i.test(art.missing_evidence));
  expect("d7_gap_not_restating_declaration_prompt", !/Declaração de condição de ART \(emitida/i.test(art.missing_evidence));
  const artOnly = diagnose({ ...gapAnswers(), inspections_declared: "registradas" });
  const artOnlyRow = domainById(artOnly, "technical_responsibility_art_inspections");
  expect("d7_art_only_gap_names_art", /documento de ART/i.test(artOnlyRow.missing_evidence));
  expect("d7_art_only_gap_skips_inspections", !/registros de inspeção/i.test(artOnlyRow.missing_evidence));
  const blob = JSON.stringify(gapped).toLowerCase();
  expect("d7_no_validade", !blob.includes("art válida") && !blob.includes("art valida"));
  expect("d7_no_regular", !blob.includes("regularidade comprovada"));
}

{
  const hits = collectForbiddenClaims(JSON.stringify(diagnose(presentAnswers())) + JSON.stringify(diagnose(gapAnswers())) + JSON.stringify(diagnose({})));
  expect("no_forbidden_claims", hits.length === 0, hits.join(","));
}

{
  const present = diagnose(presentAnswers());
  const unknownBudget = diagnose({ ...presentAnswers(), budget: UNKNOWN });
  const gapBudget = diagnose({ ...presentAnswers(), budget: "nenhum" });
  expect("unknown_not_present", domainById(unknownBudget, "quantities_budget_bases_memory").status === UNKNOWN);
  expect("gap_is_gap", domainById(gapBudget, "quantities_budget_bases_memory").status === GAP);
  expect("unknown_vs_present_neutral", compareDomainReadiness(UNKNOWN, EVIDENCE_PRESENT) === 0);
  expect("unknown_vs_gap_neutral", compareDomainReadiness(UNKNOWN, GAP) === 0);
  expect("gap_vs_present_signed", compareDomainReadiness(GAP, EVIDENCE_PRESENT) === 1);
  expect("present_vs_gap_signed", compareDomainReadiness(EVIDENCE_PRESENT, GAP) === -1);
  for (const id of DOMAIN_IDS) {
    if (id === "quantities_budget_bases_memory") continue;
    expect(
      "unknown_does_not_move_" + id,
      JSON.stringify(domainById(present, id)) === JSON.stringify(domainById(unknownBudget, id)),
    );
  }
  expect(
    "unknown_not_better_than_present",
    unknownBudget.present_count === present.present_count - 1 && unknownBudget.gap_count === present.gap_count,
  );
  expect(
    "unknown_not_worse_as_gap",
    unknownBudget.gap_count === 0 && gapBudget.gap_count === 1,
  );
}

{
  const base = presentAnswers();
  const left = diagnose(base);
  for (const questionId of QUESTION_IDS) {
    const options = VOCAB[questionId].filter((value) => value !== base[questionId]);
    for (const value of options) {
      const next = { ...base, [questionId]: value };
      const right = diagnose(next);
      const causal = new Set(causalDomainsForQuestion(questionId));
      for (const id of DOMAIN_IDS) {
        const changed = JSON.stringify(domainById(left, id)) !== JSON.stringify(domainById(right, id));
        if (changed && !causal.has(id)) {
          fail("sensitivity_" + questionId + "_" + value + "_" + id, "non-causal domain changed");
        }
      }
    }
  }
  pass("sensitivity_grid", "one-answer changes stayed in causal domains");
}

{
  const fingerprints = new Set();
  const hashes = new Map();
  function add(input) {
    const result = diagnose(input);
    const key = JSON.stringify(normalizeAnswers(input));
    fingerprints.add(key);
    const prev = hashes.get(key);
    if (prev && prev !== result.result_hash) fail("hash_drift", key);
    hashes.set(key, result.result_hash);
    if (result.domains.length !== 7) fail("domain_count", String(result.domains.length));
    if ("percentage" in result) fail("percentage_leaked");
  }
  add({});
  add(presentAnswers());
  add(gapAnswers());
  add(emptyAnswers());
  for (const questionId of QUESTION_IDS) {
    for (const value of VOCAB[questionId]) {
      add({ [questionId]: value });
    }
  }
  for (const stage of VOCAB.work_stage) {
    for (const decision of VOCAB.decision_on_table) {
      add({ work_stage: stage, decision_on_table: decision });
    }
  }
  const qty = VOCAB.quantities;
  const budget = VOCAB.budget;
  const memory = VOCAB.calc_memory;
  for (const q of qty) {
    for (const b of budget) {
      for (const m of memory) {
        add({ quantities: q, budget: b, calc_memory: m, work_stage: "projeto", decision_on_table: "contratar_execucao" });
      }
    }
  }
  expect("synthetic_at_least_100", fingerprints.size >= 100, String(fingerprints.size));
  expect("unique_hashes_for_unique_inputs", hashes.size === fingerprints.size, String(hashes.size));
}

{
  const result = diagnose(presentAnswers());
  const event = buildAnalyticsEvent(result);
  expect("analytics_keys", JSON.stringify(Object.keys(event).sort()) === JSON.stringify(["tool"]));
  expect("analytics_no_answers", !JSON.stringify(event).includes("takeoff") && !JSON.stringify(event).includes("execucao"));
  expect("analytics_tool_id", event.tool === ENGINE_ID);
}

{
  const html = readFileSync(htmlPath, "utf8");
  expect("html_public_canonical", /rel=["']canonical["'][^>]*https:\/\/confenge\.com\.br\/ferramentas\/prontidao-tecnica-obra-privada\//i.test(html));
  expect("html_h1_job", /<h1[^>]*>[\s\S]*evidências técnicas[\s\S]*obra privada/i.test(html) || /<h1[^>]*>[\s\S]*evidencias tecnicas[\s\S]*obra privada/i.test(html) || /<h1[^>]*>[\s\S]*presentes, ausentes ou desconhecidas/i.test(html));
  expect("html_title_job", /<title>[\s\S]*prontidão técnica de obra privada/i.test(html) || /<title>[\s\S]*prontidao tecnica de obra privada/i.test(html));
  for (const label of [
    "Decisão, escopo e estágio",
    "Projetos, revisões e responsabilidade",
    "Quantitativos, orçamento, bases e memória",
    "Compatibilização, constructability e BIM",
    "Mudanças, execução, medição e rastreabilidade",
    "As-built, entrega, operação e documentação final",
    "Condições declaradas de ART e inspeções",
  ]) {
    expect("html_domain_" + label.slice(0, 12), html.includes(label));
  }
  expect("html_method", /método e limites/i.test(html) || /metodo e limites/i.test(html));
  expect("html_no_textarea", !/<textarea/i.test(html));
  expect("html_no_file", !/type=["']file["']/i.test(html));
  expect("html_no_email", !/type=["']email["']/i.test(html) && !/name=["']email["']/i.test(html));
  expect("html_no_tel", !/type=["']tel["']/i.test(html) && !/name=["']telefone["']/i.test(html));
  expect("html_skip_link", /class=["']skip-link["']/.test(html));
  expect("html_result_before_cta", html.indexOf("id=\"resultado\"") < html.indexOf("id=\"cta-comercial\"") && html.indexOf("id=\"resultado\"") > html.indexOf("id=\"diagnostico\""));
  expect("html_no_generic_specialist", !/fale com especialista/i.test(html));
  expect("html_no_ia_claim", !/inteligência artificial/i.test(html) && !/inteligencia artificial/i.test(html));
  expect("html_plain_script", /<script src="[^"]+private-project-technical-readiness\.js">/.test(html) && !/type=["']module["']/.test(html));
  expect("html_no_emdash", !html.includes("\u2014"));
  const htmlHits = collectForbiddenClaims(html.replace(/prontidão/gi, "").replace(/prontidao/gi, ""));
  expect("html_forbidden_claims", htmlHits.length === 0, htmlHits.join(","));
}

{
  const app = readFileSync(appPath, "utf8");
  expect("app_no_module", !/type=["']module["']/.test(app) && !/\bimport\b/.test(app) && !/\bexport\b/.test(app));
  expect("app_calls_shipped", /diagnosePrivateProjectTechnicalReadiness/.test(app));
  expect("app_no_contact_gate", !/email.*required/i.test(app));
}

{
  const js = readFileSync(jsPath, "utf8");
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(js, sandbox);
  const api = sandbox.ConfengePrivateProjectTechnicalReadiness;
  expect("window_global_attach", Boolean(api && api.diagnosePrivateProjectTechnicalReadiness));
  expect("no_module_leak_when_window", sandbox.module === undefined);
  const browserResult = api.diagnosePrivateProjectTechnicalReadiness(presentAnswers());
  const nodeResult = diagnose(presentAnswers());
  expect("browser_node_hash", browserResult.result_hash === nodeResult.result_hash);
}

if (failed) {
  console.error("FAILED", failed);
  process.exit(1);
}
console.log("ALL private_project_technical_readiness checks passed");
