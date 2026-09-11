import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const E = require(resolve(root, "assets/js/private-project-technical-readiness.cjs"));

const html = readFileSync(
  resolve(root, "ferramentas/prontidao-tecnica-obra-privada/index.html"),
  "utf8",
);
const app = readFileSync(
  resolve(root, "ferramentas/prontidao-tecnica-obra-privada/app.js"),
  "utf8",
);
const js = readFileSync(resolve(root, "assets/js/private-project-technical-readiness.js"), "utf8");
const cjs = readFileSync(resolve(root, "assets/js/private-project-technical-readiness.cjs"), "utf8");

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

const publicHtml = html
  .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
  .replace(/<header[\s\S]*?<\/header>/gi, " ")
  .replace(/<script type="application\/json" id="pptr-destination-map">[\s\S]*?<\/script>/gi, " ");

expect("twins", js === cjs);
expect("buyer_h1", /Organize as informações da sua obra e veja o próximo passo/.test(html));
expect("buyer_lead", /sem cadastro/.test(html) && /sem envio das respostas à CONFENGE/.test(html));
expect("no_vocabulario_fechado", !/vocabulário fechado/i.test(publicHtml));
expect("no_calculo_deterministico", !/cálculo determinístico/i.test(publicHtml));
expect("no_issue_register", !/Issue register rastreado/i.test(publicHtml));
expect("no_internal_dominio", !/estado de cada domínio/i.test(publicHtml));
expect("no_unpublished", !/ainda não foram publicadas|ainda não está nesta versão|até a página específica estar publicada/i.test(html + app));
expect("no_window_global_read", !/ConfengeCanonicalDestinationMap/.test(app));
expect("method_expandable", /<details class="pptr-method"/.test(html) && /<summary id="metodo">/.test(html));
expect("noscript_honest", /nenhum resultado personalizado é produzido/i.test(html));
expect("noscript_qty", html.includes('href="/quantitativos-orcamento-obras/"'));
expect("noscript_clash", html.includes('href="/compatibilizacao-projetos-engenharia/"'));
expect("noscript_review", html.includes('href="/revisao-tecnica-projetos-engenharia/"'));
expect("direct_before_form", html.indexOf('id="acesso-direto"') < html.indexOf('id="diagnostico"'));
expect("no_cadastro", !/cadastre-se|crie uma conta|paywall/i.test(html));
expect("no_percentage", !/% de prontid|progressPct|score percentual/i.test(html + app));
expect("no_urgency", !/urgente|últimas vagas|somente hoje/i.test(publicHtml));
expect("edit_control", html.includes('id="btn-edit"') && /btn-edit/.test(app));
expect("reset_control", html.includes('id="btn-reset"'));
expect("result_focus", /resultEl\.focus/.test(app));
expect("no_processed_without_js", /form\.querySelectorAll\("\.pptr-runtime-fields"\)/.test(app) && /disabled/.test(html));
expect("tool_complete_not_lead", /tool_complete/.test(app) && !/qualified_lead/.test(app));
expect("internal_issue_register_value_kept", html.includes('value="issue_register_rastreado"'));

const cta = html.match(/id="cta-triagem"[^>]*href="([^"]+)"/);
expect("contact_base", Boolean(cta && cta[1].startsWith("/triagem-tecnica/")));
const qty = E.diagnosePrivateProjectTechnicalReadiness({
  work_stage: "execucao",
  decision_on_table: "aprovar_medicao",
  scope_record: "escrito_assinado",
  design_set: "completo_revisao_atual",
  revision_control: "numerada_com_datas",
  design_responsibility: "nomeada_por_disciplina",
  quantities: "nenhum",
  budget: "nenhum",
  calc_memory: "nenhum",
  coordination: "issue_register_rastreado",
  bim_or_constructability: "revisao_construtibilidade_registrada",
  change_control: "registro_escrito_com_impacto",
  execution_records: "diario_e_base_medicao",
  measurement_trace: "ligada_orcamento_e_executado",
  asbuilt: "atual",
  handover_docs: "manuais_garantias_ensaios",
  art_declared: "emitida_declarada",
  inspections_declared: "registradas",
});
const href = E.buildContactHref(qty.contact_context);
const query = href.split("?")[1] ? href.split("?")[1].split("#")[0] : "";
const keys = query
  ? query.split("&").map((part) => decodeURIComponent(part.split("=")[0]))
  : [];
const allowed = new Set(E.CONTACT_QUERY_KEYS);
expect("contact_keys_subset", keys.every((key) => allowed.has(key)), keys.join(","));
expect("contact_no_answers", !href.includes("nenhum") && !href.includes("work_stage"));
expect("contact_need_code", /need_code=obra_edificacao_ou_documentacao/.test(href));
expect("no_force_tool", /Não é obrigatório passar por esta leitura/.test(html));

if (failed) {
  console.error("FAILED", failed);
  process.exit(1);
}
console.log("ALL copy and static checks passed");
