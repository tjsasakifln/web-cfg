/**
 * Fail-closed composition on the map that will be published.
 * Mutates the embedded landing artifact, not a fabricated diagnose() result.
 * Isolated diagnostic and isolated money pages must still pass.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPurchaseRouteMap,
  deriveToolDestinationMap,
  assertReleasedComposition,
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

function pageExists(publicPath) {
  return existsSync(resolve(root, publicPath.replace(/^\//, ""), "index.html"));
}

function embed(map) {
  return '<script type="application/json" id="pptr-destination-map">' + JSON.stringify(map) + "</script>";
}

const html = readFileSync(resolve(root, LANDING_REL), "utf8");
const publishedMap = parseEmbeddedMap(html);
const authority = loadPurchaseRouteMap(root);
const derived = deriveToolDestinationMap(authority, root);

expect("artifact_map_present", Boolean(publishedMap && publishedMap.by_purchase_id));
const baseline = assertReleasedComposition(publishedMap, authority, root);
expect("baseline_composition_pass", baseline.length === 0, JSON.stringify(baseline));
expect(
  "derived_equals_published_review",
  derived.by_purchase_id["revisao-tecnica-projetos"].path ===
    publishedMap.by_purchase_id["revisao-tecnica-projetos"].path,
);

const clashDiag = E.diagnosePrivateProjectTechnicalReadiness({
  ...presentAnswers(),
  coordination: "nenhum",
  bim_or_constructability: "nenhum",
  decision_on_table: "iniciar_execucao",
});
const reviewDiag = E.diagnosePrivateProjectTechnicalReadiness({
  ...presentAnswers(),
  design_set: "parcial",
});
expect(
  "isolated_diag_clash",
  clashDiag.routing.primary && clashDiag.routing.primary.id === "compatibilizacao",
);
expect(
  "isolated_diag_review",
  reviewDiag.routing.primary && reviewDiag.routing.primary.id === "revisao",
);
expect("isolated_page_clash", pageExists("/compatibilizacao-projetos-engenharia/"));
expect("isolated_page_review", pageExists("/revisao-tecnica-projetos-engenharia/"));
expect("isolated_page_qty", pageExists("/quantitativos-orcamento-obras/"));
expect("isolated_page_elab", pageExists("/projetos-complementares-engenharia/"));

function mutateAndProve(label, mutate) {
  const clone = structuredClone(publishedMap);
  mutate(clone);
  const mutatedHtml = html.replace(
    /<script type="application\/json" id="pptr-destination-map">[^<]+<\/script>/,
    embed(clone),
  );
  const reparsed = parseEmbeddedMap(mutatedHtml);
  writeFileSync(resolve(scratch, "mutated-" + label + ".json"), JSON.stringify(clone, null, 2));
  const failures = assertReleasedComposition(reparsed, authority, root);
  expect(
    label + "_composition_fails",
    failures.length > 0,
    JSON.stringify(failures),
  );
  expect(
    label + "_diag_still_clash",
    E.diagnosePrivateProjectTechnicalReadiness({
      ...presentAnswers(),
      coordination: "nenhum",
      bim_or_constructability: "nenhum",
      decision_on_table: "iniciar_execucao",
    }).routing.primary.id === "compatibilizacao",
  );
  expect(
    label + "_diag_still_review",
    E.diagnosePrivateProjectTechnicalReadiness({
      ...presentAnswers(),
      design_set: "parcial",
    }).routing.primary.id === "revisao",
  );
  expect(label + "_page_clash_still", pageExists("/compatibilizacao-projetos-engenharia/"));
  expect(label + "_page_review_still", pageExists("/revisao-tecnica-projetos-engenharia/"));
  return failures;
}

const clashGone = mutateAndProve("delete_clash_key", (map) => {
  delete map.by_purchase_id["compatibilizacao-projetos"];
  if (map.by_route_id) delete map.by_route_id.compatibilizacao;
  if (map.by_offer_id) delete map.by_offer_id.bim_coordination_clash_register;
});
expect(
  "delete_clash_reason_key",
  clashGone.some((row) => row.code === "purchase_key_missing"),
  JSON.stringify(clashGone),
);

const reviewGone = mutateAndProve("delete_review_key", (map) => {
  delete map.by_purchase_id["revisao-tecnica-projetos"];
  if (map.by_route_id) delete map.by_route_id.revisao;
});
expect(
  "delete_review_reason_key",
  reviewGone.some((row) => row.code === "purchase_key_missing"),
  JSON.stringify(reviewGone),
);

const swapped = mutateAndProve("review_to_elaboration", (map) => {
  map.by_purchase_id["revisao-tecnica-projetos"] = {
    ...map.by_purchase_id["revisao-tecnica-projetos"],
    path: "/projetos-complementares-engenharia/",
  };
  if (map.by_route_id && map.by_route_id.revisao) {
    map.by_route_id.revisao = {
      ...map.by_route_id.revisao,
      path: "/projetos-complementares-engenharia/",
    };
  }
});
expect(
  "swap_refused_by_semantics",
  swapped.some((row) => row.code === "purchase_function_semantics"),
  JSON.stringify(swapped),
);
expect(
  "swap_not_only_url_exists",
  pageExists("/projetos-complementares-engenharia/") &&
    swapped.some((row) => /projetos-complementares/.test(row.detail || "")),
  JSON.stringify(swapped),
);

const firstCatalogWouldBeWrong = E.resolveCommercialDestination(
  "complementary_engineering_project_review",
  publishedMap,
);
expect(
  "offer_id_only_does_not_pick_first",
  firstCatalogWouldBeWrong.present === false && firstCatalogWouldBeWrong.href === null,
);

if (failed) {
  console.error("FAILED", failed);
  process.exit(1);
}
console.log("ALL destination map composition counterproofs passed");
