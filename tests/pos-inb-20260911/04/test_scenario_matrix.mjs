/**
 * Scenario matrix for campaign 09: drive the shipped diagnose/route/resolve
 * path against the built page's embedded map.
 */
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPurchaseRouteMap,
  parseEmbeddedMap,
  LANDING_REL,
} from "../../../scripts/campaigns/pos-inb-20260911/04/derive-destination-map.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const E = require(resolve(root, "assets/js/private-project-technical-readiness.cjs"));
const scratch = process.env.POS_INB_04_SCRATCH || "/tmp/grok-goal-1c376b072c82/implementer";
mkdirSync(scratch, { recursive: true });

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

const html = readFileSync(resolve(root, LANDING_REL), "utf8");
const publishedMap = parseEmbeddedMap(html);
const authority = loadPurchaseRouteMap(root);

function destFor(result) {
  return E.resolveCommercialDestination(result.routing.primary, publishedMap);
}

const matrix = [];

{
  const result = E.diagnosePrivateProjectTechnicalReadiness({
    ...presentAnswers(),
    quantities: "nenhum",
    budget: "nenhum",
    calc_memory: "nenhum",
  });
  const dest = destFor(result);
  const row = {
    id: "orcamento_necessario",
    primary: result.routing.primary && result.routing.primary.id,
    purchase_id: result.routing.primary && result.routing.primary.purchase_id,
    href: dest.href,
  };
  matrix.push(row);
  expect("orcamento_primary", row.primary === "orcamento");
  expect("orcamento_href", row.href === "/quantitativos-orcamento-obras/");
}

{
  const result = E.diagnosePrivateProjectTechnicalReadiness({
    ...presentAnswers(),
    coordination: "nenhum",
    bim_or_constructability: "nenhum",
    decision_on_table: "iniciar_execucao",
  });
  const dest = destFor(result);
  const row = {
    id: "interfaces_nao_conferidas",
    primary: result.routing.primary && result.routing.primary.id,
    purchase_id: result.routing.primary && result.routing.primary.purchase_id,
    href: dest.href,
  };
  matrix.push(row);
  expect("clash_primary", row.primary === "compatibilizacao");
  expect("clash_href", row.href === "/compatibilizacao-projetos-engenharia/");
}

{
  const result = E.diagnosePrivateProjectTechnicalReadiness({
    ...presentAnswers(),
    design_set: "parcial",
  });
  const dest = destFor(result);
  const row = {
    id: "revisao_material_recebido",
    primary: result.routing.primary && result.routing.primary.id,
    purchase_id: result.routing.primary && result.routing.primary.purchase_id,
    href: dest.href,
  };
  matrix.push(row);
  expect("review_primary", row.primary === "revisao");
  expect("review_href", row.href === "/revisao-tecnica-projetos-engenharia/");
  expect("review_not_elaboration", row.href !== "/projetos-complementares-engenharia/");
}

{
  const result = E.diagnosePrivateProjectTechnicalReadiness({
    ...presentAnswers(),
    design_set: "nenhum",
  });
  const dest = destFor(result);
  const blob = JSON.stringify(result).toLowerCase();
  const row = {
    id: "projeto_inexistente",
    primary: result.routing.primary && result.routing.primary.id,
    href: dest.href,
    scope: result.routing.scope_conversation,
  };
  matrix.push(row);
  expect("missing_project_not_review", row.primary === null);
  expect("missing_project_not_elaboration_href", dest.present === false);
  expect("missing_project_not_defective", !blob.includes("projeto defeituoso") && !blob.includes("projeto errado"));
  expect("missing_project_scope", row.scope === true);
}

{
  const result = E.diagnosePrivateProjectTechnicalReadiness({});
  const row = {
    id: "respostas_desconhecidas",
    primary: result.routing.primary && result.routing.primary.id,
    gaps: result.gap_count,
    unknowns: result.unknown_count,
    scope: result.routing.scope_conversation,
  };
  matrix.push(row);
  expect("unknown_no_primary", row.primary === null);
  expect("unknown_not_gap", row.gaps === 0 && row.unknowns === 7);
  expect("unknown_scope", row.scope === true);
}

{
  const result = E.diagnosePrivateProjectTechnicalReadiness({ work_stage: "planejamento" });
  const exec = result.domains.find((d) => d.id === "changes_execution_measurement");
  const hand = result.domains.find((d) => d.id === "asbuilt_handover_operations");
  const row = {
    id: "planejamento_nao_penaliza_entrega",
    exec_status: exec.status,
    exec_appl: exec.applicability,
    hand_status: hand.status,
    hand_appl: hand.applicability,
    gaps: result.gap_count,
  };
  matrix.push(row);
  expect("planning_exec_not_gap", exec.status === E.EVIDENCE_PRESENT && exec.applicability === "not_required_at_declared_stage");
  expect("planning_hand_not_gap", hand.status === E.EVIDENCE_PRESENT && hand.applicability === "not_required_at_declared_stage");
}

{
  const review = E.diagnosePrivateProjectTechnicalReadiness({
    ...presentAnswers(),
    design_set: "parcial",
  });
  const dest = E.resolveCommercialDestination(
    {
      offer_id: "complementary_engineering_project_review",
      purchase_id: "revisao-tecnica-projetos",
    },
    publishedMap,
  );
  const elabPurchase = (authority.purchases || []).find((p) => p.purchase_id === "projetos-complementares");
  expect("shared_ids_keep_review_purchase", dest.href === "/revisao-tecnica-projetos-engenharia/");
  expect(
    "elaboration_has_own_page",
    elabPurchase && elabPurchase.proposed_primary_url === "/projetos-complementares-engenharia/",
  );
  expect(
    "review_route_purchase",
    review.routing.primary.purchase_id === "revisao-tecnica-projetos",
  );
}

writeFileSync(
  resolve(scratch, "scenario-matrix-run.json"),
  JSON.stringify({ map: publishedMap, matrix }, null, 2),
);

if (failed) {
  console.error("FAILED", failed);
  process.exit(1);
}
console.log("ALL scenario matrix checks passed");
