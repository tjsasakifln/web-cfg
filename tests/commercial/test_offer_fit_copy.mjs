/**
 * Copy pública da matriz de fit: home e rotas preferenciais.
 * Lê o HTML enviado, não uma cópia. Premissas vêm da matriz embarcada.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadOfferFitMatrix } from "../../scripts/commercial/offer_fit.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const matrix = loadOfferFitMatrix(root);

const ROUTES = [
  { rel: "index.html", key: null, home: true },
  { rel: "problemas-que-resolvemos/index.html", key: "problemas-que-resolvemos" },
  { rel: "diagnostico-pre-licitacao/index.html", key: "diagnostico-pre-licitacao" },
  { rel: "medicoes-glosas-obras-publicas/index.html", key: "medicoes-glosas-obras-publicas" },
  { rel: "reequilibrio-obras-publicas/index.html", key: "reequilibrio-obras-publicas" },
  { rel: "acompanhamento-contratos-obras/index.html", key: "acompanhamento-contratos-obras" },
];

const results = [];
function assert(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  if (!cond) console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}

for (const route of ROUTES) {
  const html = fs.readFileSync(path.join(root, route.rel), "utf8");
  assert(`${route.rel}_no_dt_one_percent`, !html.includes("<dt>1% do valor</dt>"), route.rel);
  assert(`${route.rel}_no_exemplo_ilustrativo`, !/exemplo ilustrativo/i.test(html), route.rel);
  assert(
    `${route.rel}_no_percent_as_roi`,
    !/economia de 1%|roi de 1%|1% do valor contratado em economia/i.test(html),
    route.rel,
  );
  if (route.home) {
    for (const panel of matrix.home_illustrations) {
      assert(`home_has_${panel.panel}_contract`, html.includes(panel.contract_display), panel.contract_display);
      assert(`home_has_${panel.panel}_pncp`, html.includes(panel.pncp_path), panel.pncp_path);
      assert(`home_has_${panel.panel}_copy`, html.includes(panel.copy), panel.panel);
      assert(`home_${panel.panel}_not_fictional`, !/exemplo fictício|contrato fictício/i.test(html), panel.panel);
    }
    // 2026-08-30 (overhaul value-first). Antes daqui a home era obrigada a
    // escrever "nao sao clientes da CONFENGE", ou seja, a desautorizar a
    // propria empresa para provar honestidade. A propriedade real a proteger
    // nao e a frase: e que o registro do PNCP apareca rotulado como contexto
    // de mercado, com fonte e data de corte, e nunca como prova de cliente.
    // E isso que passa a ser verificado.
    assert("home_source_line", html.includes("Fonte: PNCP") && html.includes("21/08/2026"), "source");
    assert("home_market_context_labelled", /contexto de mercado/i.test(html), "context");
    // 2026-08-30 (revisao adversarial). A versao anterior desta linha era
    // `!CLIENT_FRAMING.test(html) || /contexto de mercado/i.test(html)`, e o
    // lado direito da disjuncao e exatamente o predicado que a linha de cima ja
    // afirmou verdadeiro: a assercao nao podia falhar em nenhuma home possivel.
    // Um gate que nunca reprova nao protege propriedade nenhuma. A disjuncao
    // sai, e a verificacao passa a ser escopada na secao onde a propriedade
    // vive, para que ela tambem nao passe por ausencia de conteudo.
    const CLIENT_FRAMING = /clientes? da CONFENGE|nossos clientes|clientes? atendidos?|carteira de clientes|resultados? (?:da|de|obtidos? pela) CONFENGE|cases? de cliente/i;
    const marketSection = html.match(/<section\b[^>]*id="mercado-pncp"[\s\S]*?<\/section>/);
    assert("home_market_section_present", Boolean(marketSection), "market section");
    assert(
      "home_not_client_proof",
      Boolean(marketSection) && !CLIENT_FRAMING.test(marketSection[0]),
      "client framing inside the PNCP market-context section",
    );
    assert("home_not_client_proof_page_wide", !CLIENT_FRAMING.test(html), "client framing anywhere on the home");
    assert(
      "home_market_provenance_in_section",
      Boolean(marketSection)
        && marketSection[0].includes("Fonte: PNCP")
        && marketSection[0].includes("21/08/2026")
        && /contexto de mercado/i.test(marketSection[0]),
      "provenance must sit inside the section, not float anywhere on the page",
    );
    const form = html.match(/<form\b[^>]*id="formulario-contato"[\s\S]*?<\/form>/);
    assert("home_form_present", Boolean(form), "form");
    const step1 = form ? form[0].match(/<fieldset\b[^>]*data-form-step="1"[^>]*>[\s\S]*?<\/fieldset>/) : null;
    const step2Start = form ? form[0].search(/<fieldset\b[^>]*data-form-step="2"/) : -1;
    const step2 = step2Start >= 0 ? form[0].slice(step2Start) : null;
    assert("home_form_steps", Boolean(step1 && step2), "steps");
    for (const field of ["faixa_contrato", "risco_em_jogo", "frequencia", "maturidade_documental", "capacidade_interna"]) {
      assert(`icp_field_in_step2_${field}`, step2 && step2.includes(`name="${field}"`), field);
      assert(`icp_field_not_step1_${field}`, step1 && !step1[0].includes(`name="${field}"`), field);
    }
    assert("step1_no_cnpj", step1 && !/name="(cnpj|cpf)"|type="file"/i.test(step1[0]), "sensitive");
    assert("step2_no_cnpj_upload", step2 && !/name="(cnpj|cpf)"|type="file"/i.test(step2), "sensitive");
    assert("consent_required", form[0].includes('name="consentimento"') && form[0].includes("required"), "consent");
  } else {
    const copy = matrix.route_copy[route.key];
    assert(`${route.key}_copy_defined`, Boolean(copy), route.key);
    const frozenSibling = route.key === "medicoes-glosas-obras-publicas";
    if (frozenSibling) {
      const hub = fs.readFileSync(path.join(root, "problemas-que-resolvemos/index.html"), "utf8");
      assert(`${route.key}_hub_carries_copy`, hub.includes(matrix.route_copy["problemas-que-resolvemos"].body), route.key);
      assert(`${route.key}_when_not_hire`, html.includes("data-when-not-hire"), route.key);
      assert(`${route.key}_body_words_on_hub`, /custo/i.test(matrix.route_copy["problemas-que-resolvemos"].body) && /recorrência/i.test(hub), route.key);
    } else {
      assert(`${route.key}_headline`, html.includes(copy.headline), copy.headline);
      assert(`${route.key}_body`, html.includes(copy.body), copy.body);
      assert(`${route.key}_custo`, /custo/i.test(copy.body) && html.includes("Custo"), route.key);
      assert(`${route.key}_risco`, /risco/i.test(copy.body), route.key);
      assert(`${route.key}_recorrencia`, /recorrência/i.test(copy.body), route.key);
      assert(`${route.key}_limite`, /limite/i.test(copy.body), route.key);
    }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`offer-fit-copy: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify({ ok: false, failed: failed.map((f) => f.name) }, null, 2));
  process.exit(1);
}
