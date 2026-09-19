/**
 * BOFU-FECHAMENTO-20260919 — FAMILIAS-PRIVADAS-A-02 / A-05.
 * Drives the shipped private_project_technical_readiness engine (no
 * reimplementation) and the tool landing.
 *
 *  A-02: aceitar_entrega + as-built ausente bloqueava a decisao e a tabela de
 *        encaminhamento devolvia primary=null com "nenhuma contratacao e
 *        sugerida". Agora a rota 'documentacao' (purchase documentar-as-built,
 *        offer asbuilt_document_reconciliation) responde ao dominio, toda ordem
 *        de prioridade lista todas as rotas, e uma lacuna bloqueante sem rota
 *        propria pede conversa de escopo em vez de "nenhuma contratacao".
 *  A-05: o pedido de conversa de escopo leva o recorte no contrato que o
 *        formulario da home le (?jornada=, ?tema=, ?origem=, #contato).
 *
 *   node scripts/site/test_private_readiness_asbuilt_route.mjs
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const E = require(resolve(root, "assets/js/private-project-technical-readiness.cjs"));
const html = readFileSync(resolve(root, "ferramentas/prontidao-tecnica-obra-privada/index.html"), "utf8");
const app = readFileSync(resolve(root, "ferramentas/prontidao-tecnica-obra-privada/app.js"), "utf8");

let failed = 0;
const expect = (name, cond, detail = "") => {
  if (cond) console.log("PASS", name, detail);
  else { console.error("FAIL", name, detail); failed += 1; }
};

const { diagnosePrivateProjectTechnicalReadiness: diagnose, ROUTING_TABLE, VOCAB, GAP, PRIORITY_BLOCKING } = E;

function presentAnswers(overrides = {}) {
  return {
    work_stage: "entrega",
    decision_on_table: "aceitar_entrega",
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
    ...overrides,
  };
}

// --- A-02: o cenario reproduzido em producao -------------------------------
{
  const result = diagnose(presentAnswers({ asbuilt: "nenhum", handover_docs: "nenhum" }));
  const asbuilt = result.domains.find((row) => row.id === "asbuilt_handover_operations");
  expect("asbuilt_domain_gap_blocking", asbuilt.status === GAP && asbuilt.priority === PRIORITY_BLOCKING, asbuilt.priority);
  const primary = result.routing.primary;
  expect("asbuilt_primary_present", Boolean(primary), JSON.stringify(result.routing.triggered_ids));
  expect("asbuilt_primary_intent_family", primary && primary.intent_family === "documentar_as_built_regularizar", primary && primary.intent_family);
  expect("asbuilt_primary_route_id", primary && primary.id === "documentacao");
  expect("asbuilt_primary_offer", primary && primary.offer_id === "asbuilt_document_reconciliation");
  expect("asbuilt_primary_purchase", primary && primary.purchase_id === "documentar-as-built");
  expect("asbuilt_primary_href", primary && primary.href === "/inspecao-diagnostico-edificacoes/#documentacao-as-built", primary && primary.href);
  expect("asbuilt_summary_not_three_paths", !/orçamento, revisão ou compatibilização/i.test(result.routing.summary_next), result.routing.summary_next);
  expect("asbuilt_no_regularization_promise", !/habite-se garantido|regularização garantida|aprovação garantida/i.test(JSON.stringify(result)));
  expect("asbuilt_org_acts_stay_with_org", /atos do órgão/i.test(primary ? primary.next : ""), primary && primary.next);
  // A-05: contrato lido pelo formulario da home.
  const href = E.buildContactHref(result.contact_context);
  expect("contact_href_home_form", href.startsWith("/?") && href.endsWith("#contato"), href);
  expect("contact_href_journey_obra", /[?&]jornada=obra(&|$|#)/.test(href), href);
  expect("contact_href_tema_public_name", /[?&]tema=Registro%20do%20constru/.test(href), href);
  expect("contact_href_origem_tool", /[?&]origem=%2Fferramentas%2Fprontidao-tecnica-obra-privada%2F/.test(href), href);
  expect("contact_href_keeps_need_code", /[?&]need_code=obra_edificacao_ou_documentacao/.test(href), href);
  expect("contact_href_keeps_intent_family", /[?&]intent_family=documentar_as_built_regularizar/.test(href), href);
  expect("contact_href_no_answers", !/nenhum|work_stage|asbuilt=/.test(href), href);
  expect("contact_href_no_pii_keys", !/nome|email|telefone|mensagem/.test(href), href);
}

// --- A-05: mapa intent_family -> jornada da home, para todas as rotas --------
{
  const expected = {
    orcar_planejar_decidir: "orcamento",
    projetar_revisar_compatibilizar: "projeto",
    documentar_as_built_regularizar: "obra",
  };
  for (const row of ROUTING_TABLE) {
    expect(`journey_mapped_${row.id}`, E.JOURNEY_BY_INTENT_FAMILY[row.intent_family] === expected[row.intent_family], row.intent_family);
  }
  const qty = diagnose(presentAnswers({ quantities: "nenhum", budget: "nenhum", calc_memory: "nenhum", asbuilt: "atual" }));
  const qtyHref = E.buildContactHref(qty.contact_context);
  expect("contact_href_qty_journey_orcamento", /[?&]jornada=orcamento(&|$|#)/.test(qtyHref), qtyHref);
  // Sem encaminhamento principal (conversa de escopo): jornada generica e tema
  // que nomeia a ferramenta, nunca uma resposta do questionario.
  const unknown = diagnose({});
  expect("unknown_scope_conversation", unknown.routing.primary === null && unknown.routing.scope_conversation === true);
  const scopeHref = E.buildContactHref(unknown.contact_context);
  expect("contact_href_scope_journey_outro", /[?&]jornada=outro(&|$|#)/.test(scopeHref), scopeHref);
  expect("contact_href_scope_tema", /[?&]tema=conversa%20de%20escopo/.test(scopeHref), scopeHref);
  const homeKeys = ["jornada", "tema", "origem", "need_code", "intent_family"];
  expect("contact_query_keys_are_the_home_contract", E.CONTACT_QUERY_KEYS.join(",") === homeKeys.join(","), E.CONTACT_QUERY_KEYS.join(","));
}

// --- A-02: toda ordem de prioridade lista todas as rotas --------------------
{
  const allIds = ROUTING_TABLE.map((row) => row.id).sort().join(",");
  for (const decision of VOCAB.decision_on_table) {
    const result = diagnose(presentAnswers({
      work_stage: "retomada",
      decision_on_table: decision,
      design_set: "parcial",
      revision_control: "arquivos_sem_controle",
      quantities: "nenhum",
      coordination: "nenhum",
      asbuilt: "nenhum",
    }));
    const routed = result.routing;
    const ids = [routed.primary && routed.primary.id, ...routed.alternatives.map((row) => row.id)].filter(Boolean).sort().join(",");
    expect(`all_routes_triggered_${decision}`, routed.primary !== null && ids === allIds, ids);
  }
  for (const decision of ["aceitar_entrega", "operar_manter", "retomar_obra"]) {
    const result = diagnose(presentAnswers({
      work_stage: "retomada",
      decision_on_table: decision,
      quantities: "nenhum",
      asbuilt: "nenhum",
    }));
    expect(`handover_decision_prefers_documentacao_${decision}`, result.routing.primary && result.routing.primary.id === "documentacao", result.routing.primary && result.routing.primary.id);
  }
  const execution = diagnose(presentAnswers({
    work_stage: "execucao",
    decision_on_table: "iniciar_execucao",
    coordination: "nenhum",
    asbuilt: "nenhum",
  }));
  expect("execution_decision_keeps_compat_first", execution.routing.primary && execution.routing.primary.id === "compatibilizacao", execution.routing.primary && execution.routing.primary.id);
}

// --- A-02: lacuna bloqueante nunca termina em "nenhuma contratacao" ---------
{
  const gapFor = {
    decision_scope_stage: { scope_record: "so_verbal" },
    design_set_revisions_responsibility: { design_set: "parcial", revision_control: "arquivos_sem_controle" },
    quantities_budget_bases_memory: { quantities: "nenhum" },
    coordination_constructability_bim: { coordination: "nenhum" },
    changes_execution_measurement: { change_control: "informal" },
    asbuilt_handover_operations: { asbuilt: "desatualizado" },
    technical_responsibility_art_inspections: { art_declared: "nao_emitida_declarada" },
  };
  let checked = 0;
  for (const decision of VOCAB.decision_on_table) {
    for (const [domainId, overrides] of Object.entries(gapFor)) {
      const result = diagnose(presentAnswers({ work_stage: "retomada", decision_on_table: decision, ...overrides }));
      const domain = result.domains.find((row) => row.id === domainId);
      if (!(domain.status === GAP && domain.priority === PRIORITY_BLOCKING)) continue;
      checked += 1;
      const routed = result.routing;
      const ok = routed.primary !== null || routed.scope_conversation === true;
      expect(`blocking_gap_routed_or_scope_${decision}_${domainId}`, ok, routed.summary_next);
      if (!routed.primary) {
        expect(`blocking_gap_no_false_no_service_${decision}_${domainId}`, !/nenhuma contratação é sugerida/i.test(routed.summary_next), routed.summary_next);
      }
    }
  }
  expect("blocking_gap_matrix_non_empty", checked >= 10, String(checked));
  const allPresent = diagnose(presentAnswers());
  expect("all_present_no_service_wording", /nenhuma contratação é sugerida/i.test(allPresent.routing.summary_next) && !/orçamento, revisão ou compatibilização/i.test(allPresent.routing.summary_next), allPresent.routing.summary_next);
  expect("all_present_no_scope_required", allPresent.routing.scope_conversation === false);
}

// --- A-02: landing e runtime da ferramenta ----------------------------------
{
  const direct = html.match(/<section[^>]*id="acesso-direto"[\s\S]*?<\/section>/);
  expect("html_acesso_direto_present", Boolean(direct));
  expect(
    "html_acesso_direto_links_asbuilt",
    Boolean(direct) && /<a href="\/inspecao-diagnostico-edificacoes\/#documentacao-as-built"[^>]*data-tool-to-offer="asbuilt_document_reconciliation"/.test(direct[0]),
  );
  expect("html_asbuilt_link_not_a_declared_cta", Boolean(direct) && !/documentacao-as-built"[^>]*data-cta-id/.test(direct[0]));
  const target = readFileSync(resolve(root, "inspecao-diagnostico-edificacoes/index.html"), "utf8");
  expect("target_anchor_exists", /id="documentacao-as-built"/.test(target));
  expect("app_uses_route_href_fallback", /route\.href/.test(app));
  expect("app_still_uses_resolver_first", /resolveCommercialDestination/.test(app));
  expect("twins_identical", readFileSync(resolve(root, "assets/js/private-project-technical-readiness.js"), "utf8") === readFileSync(resolve(root, "assets/js/private-project-technical-readiness.cjs"), "utf8"));
}

if (failed) {
  console.error("FAILED", failed);
  process.exit(1);
}
console.log("ALL private_readiness_asbuilt_route checks passed");
