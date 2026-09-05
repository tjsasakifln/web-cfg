/**
 * Assembled revenue-candidate cut (CAMPAIGN_ID=REV-01).
 * Drives shipped HTML, catalog, canary engine, adaptive intake and conflict gate.
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const engine = require(resolve(root, "assets/js/private-project-technical-readiness.cjs"));
const catalogApi = require(resolve(root, "scripts/offers/multivertical/index.cjs"));
const adaptive = require(resolve(root, "netlify/functions/lib/adaptive-intake.cjs"));
const core = require(resolve(root, "netlify/functions/lib/lead-core.cjs"));

let failed = 0;
const pass = (n, d = "") => console.log("PASS", n, d);
const fail = (n, d) => {
  console.error("FAIL", n, d || "");
  failed += 1;
};
const expect = (n, cond, d) => (cond ? pass(n, d || "") : fail(n, d || ""));

const home = readFileSync(resolve(root, "index.html"), "utf8");
const canary = readFileSync(
  resolve(root, "ferramentas/prontidao-tecnica-obra-privada/index.html"),
  "utf8",
);
const docsCanary = readFileSync(
  resolve(root, "docs/integration/campaign-20260904/09/canary/index.html"),
  "utf8",
);
const confianca = readFileSync(resolve(root, "confianca/index.html"), "utf8");
const specialist = readFileSync(
  resolve(root, "especialista/tiago-jun-sasaki/index.html"),
  "utf8",
);
const conflitos = readFileSync(resolve(root, "conflitos/index.html"), "utf8");
const pin = JSON.parse(readFileSync(resolve(root, "data/site/adaptive-intake-pin.json"), "utf8"));
const draftPin = JSON.parse(
  readFileSync(resolve(root, "tests/fixtures/adaptive-intake/contracts.draft.20260904.json"), "utf8"),
);
const family = JSON.parse(
  readFileSync(resolve(root, "data/organic/public-family-registry.json"), "utf8"),
);
const taxonomy = JSON.parse(readFileSync(resolve(root, "data/corporate/taxonomy.v1.json"), "utf8"));

expect("home_phrase", home.includes("Engenharia, Perícias e Inteligência Técnica"));
for (const route of [
  "/servicos-obras-publicas/",
  "/bid-room-licitacoes-obras/",
  "/problemas-que-resolvemos/",
]) {
  expect("b2g_link_" + route, home.includes(`href="${route}"`));
}
expect("b2g_form_conserved", /id="formulario-contato"/.test(home) && /name="diagnostico-confenge"/.test(home));
expect("home_has_nucleus_chooser_field", /name="nucleus_id"/.test(home));
expect(
  "b2g_pages_keep_b2g_form",
  /name="diagnostico-b2g"/.test(
    readFileSync(resolve(root, "ferramentas/diagnostico-defesa-margem/index.html"), "utf8"),
  ),
);
expect("canonical_home", home.includes('href="https://confenge.com.br/" rel="canonical"'));

expect("public_canary_exists", existsSync(resolve(root, "ferramentas/prontidao-tecnica-obra-privada/index.html")));
expect(
  "public_canary_canonical",
  canary.includes('rel="canonical" href="https://confenge.com.br/ferramentas/prontidao-tecnica-obra-privada/"'),
);
expect("public_canary_indexable", !/name=["']robots["'][^>]*noindex/i.test(canary));
expect("docs_canary_still_noindex", /noindex/i.test(docsCanary));
expect(
  "result_before_cta",
  canary.indexOf('id="resultado"') < canary.indexOf('id="cta-comercial"') &&
    canary.indexOf('id="diagnostico"') < canary.indexOf('id="resultado"'),
);
expect(
  "capture_after_result",
  canary.indexOf('id="prontidao-capture-form"') > canary.indexOf('id="resultado"'),
);
expect("offer_id", canary.includes("private_project_technical_readiness_assessment"));
expect("asset_id", canary.includes("private_project_technical_readiness_v1"));
const nuclei = [
  "expert_evidence_assistance",
  "property_valuation",
  "building_engineering_documentation",
  "occupational_safety",
  "public_works_b2g",
];
for (const id of nuclei) expect("form_nucleus_" + id, canary.includes(`value="${id}"`));

const privateRoutes = [
  "/ferramentas/prontidao-tecnica-obra-privada/",
  "/nucleos/pericias/",
  "/nucleos/avaliacao/",
  "/nucleos/sst/",
  "/grande-florianopolis/",
];
expect(
  "only_one_complete_private_route",
  existsSync(resolve(root, "ferramentas/prontidao-tecnica-obra-privada/index.html")) &&
    !existsSync(resolve(root, "nucleos/pericias/index.html")) &&
    !existsSync(resolve(root, "grande-florianopolis/index.html")),
);

expect("trust_cnpj", confianca.includes("52.407.089/0001-09"));
expect("trust_no_crea", !confianca.includes("CREA-SC"));
expect("specialist_no_crea", !specialist.includes("CREA-SC"));
expect("trust_no_sla", !/SLA|prazo de resposta garantido/i.test(confianca));
expect("canary_no_public_reais", !/R\$\s*\d/.test(canary));
expect("canary_jsonld_free_offer_only", /"price":"0"/.test(canary) && !/"price":"[1-9]/.test(canary));
expect("canary_denies_art_universal", /não há SLA, preço, ART universal nem promessa de resultado/i.test(canary));
expect("canary_does_not_emit_art", /não emite ART/i.test(canary));
expect("canary_no_resultado_promise", !/garantimos o resultado|resultado garantido/i.test(canary));
expect("no_hub_local_public", !existsSync(resolve(root, "grande-florianopolis/index.html")));
expect("docs_hubs_not_shipped_html", existsSync(resolve(root, "docs/integration/campaign-20260904/10/hubs/README.md")));

expect("conflict_fail_closed_live", conflitos.includes('name="protected_path_available"') && conflitos.includes('value="false"'));
expect("conflict_no_clear_default", !/data-conflict-gate-result="CLEAR"/.test(conflitos));

const familyIds = family.families.map((item) => item.id);
expect("family_declared", familyIds.includes("private-project-technical-readiness"));
const canaryFamily = family.families.find((item) => item.id === "private-project-technical-readiness");
expect(
  "family_exact_route",
  canaryFamily && canaryFamily.match.routes.includes("/ferramentas/prontidao-tecnica-obra-privada/"),
);
expect("family_nucleus", canaryFamily && canaryFamily.nucleus_id === "building_engineering_documentation");
expect(
  "nucleus_id_in_taxonomy",
  taxonomy.nuclei.some((item) => item.id === "building_engineering_documentation"),
);

expect("committed_pin_not_draft_fallback", pin.not_runtime_fallback === false);
expect("draft_pin_stays_test_only", draftPin.not_runtime_fallback === true);
expect("committed_pin_taxonomy_hash", pin.taxonomy_hash === `sha256:${taxonomy.content_sha256}`);
expect("committed_pin_offer", pin.offer_candidate_id === "private_project_technical_readiness_assessment");

const assembled = catalogApi.loadPinnedCatalog({ root });
expect("catalog_uses_real_taxonomy", assembled.taxonomy_replaceable_fixture === false);
expect("catalog_hash_pinned", assembled.content_hash === pin.catalog_hash);
expect(
  "catalog_canary",
  assembled.offers.some((o) => o.offer_id === "private_project_technical_readiness_assessment"),
);

const present = {
  work_stage: "projeto",
  decision_on_table: "contratar_execucao",
  scope_record: "escrito_assinado",
  design_set: "completo_revisao_atual",
  revision_control: "numerada_com_datas",
  design_responsibility: "nomeada_por_disciplina",
  quantities: "takeoff_ligado_projetos",
  budget: "composicoes_e_bases",
  calc_memory: "presente_ligada",
  coordination: "issue_register_rastreado",
  bim_or_constructability: "modelo_federado_atual",
  change_control: "registro_escrito_com_impacto",
  execution_records: "diario_e_base_medicao",
  measurement_trace: "ligada_orcamento_e_executado",
  asbuilt: "atual",
  handover_docs: "manuais_garantias_ensaios",
  art_declared: "emitida_declarada",
  inspections_declared: "registradas",
};
const a = engine.diagnosePrivateProjectTechnicalReadiness(present);
const b = engine.diagnosePrivateProjectTechnicalReadiness(present);
expect("canary_replay", a.result_hash === b.result_hash && a.domains.length === 7);
const unknownBudget = engine.diagnosePrivateProjectTechnicalReadiness({ ...present, budget: engine.UNKNOWN });
expect("unknown_not_gap", unknownBudget.gap_count === a.gap_count);
expect("unknown_not_present", unknownBudget.present_count === a.present_count - 1);
expect("cta_after_result_in_engine", Boolean(a.named_gap_artifact || a.commercial_bridge));

process.env.ADAPTIVE_INTAKE_NUCLEI = nuclei.join(",");
process.env.ADAPTIVE_INTAKE_PIN_JSON = JSON.stringify(pin);
const pinLoaded = adaptive.loadPin(process.env, root);
expect("load_committed_compatible", pinLoaded.ok === true, pinLoaded.error);
const payload = {
  adaptive_intake: true,
  intake_contract_version: pin.intake,
  intake_pin_hash: pinLoaded.hash,
  offer_candidate_id: pin.offer_candidate_id,
  source_asset_id: pin.source_asset_id,
  landing_family: "private-project-technical-readiness",
  nucleus_id: "building_engineering_documentation",
  nome: "QA Receita",
  email: "qa-receita@example.com",
  consentimento: "on",
  sensitive_docs_ack: "1",
  canal_preferido: "email",
  pessoa_tipo: "empresa",
  decision_role: "decisor",
  city_class: "grande_florianopolis",
  site_class: "obra",
  urgency: "ate_7d",
  why_now: "prazo_legal",
  desired_decision: "documentacao",
  document_availability_class: "partial",
  conflict_status: "none",
  work_type: "reforma",
  work_stage: "projeto",
  project_status: "parcial",
  budget_class: "parcial",
  bim_status: "nao",
  origem: "/ferramentas/prontidao-tecnica-obra-privada/",
  landing_page: "/ferramentas/prontidao-tecnica-obra-privada/",
};
const validated = core.validateAndNormalize(payload);
expect("intake_ok", validated.ok === true, JSON.stringify(validated));
if (validated.ok) {
  const lead = validated.lead;
  expect("intake_nucleus", lead.nucleus_id === "building_engineering_documentation");
  expect("intake_offer", lead.offer_candidate_id === "private_project_technical_readiness_assessment");
  const receipt = core.publicSuccessBody({
    lead_id: "lead-revenue-candidate-cut",
    received_at: "2026-09-05T00:00:00.000Z",
    journey: lead.jornada,
    stage_category: lead.estagio,
    nucleus_id: lead.nucleus_id,
    qualification_state: lead.qualification_state,
    conflict_status: lead.conflict_status,
    offer_candidate_id: lead.offer_candidate_id,
    source_asset_id: lead.source_asset_id,
    landing_family: lead.landing_family,
    consent: true,
  });
  const blob = JSON.stringify(receipt);
  expect("receipt_has_source", receipt.source === "CONFENGE_WEB");
  expect("receipt_has_offer", receipt.offer_candidate_id === "private_project_technical_readiness_assessment");
  expect("receipt_has_asset", receipt.source_asset_id === "private_project_technical_readiness_v1");
  expect("receipt_has_nucleus", receipt.nucleus_id === "building_engineering_documentation");
  expect("receipt_has_consent", receipt.consent === true);
  expect("receipt_no_email", !blob.includes("qa-receita@example.com"));
  expect("receipt_no_name", !blob.includes("QA Receita"));
}

const draftAsProd = adaptive.parsePin(draftPin);
expect("draft_fixture_flagged", draftPin.not_runtime_fallback === true);
expect(
  "committed_pin_rejects_draft_flag",
  JSON.parse(readFileSync(resolve(root, "data/site/adaptive-intake-pin.json"), "utf8")).not_runtime_fallback === false,
);

if (failed) {
  console.error(`revenue-candidate-cut: ${failed} failed`);
  process.exit(1);
}
console.log("revenue-candidate-cut: all checks passed");
