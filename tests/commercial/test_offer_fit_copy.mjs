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
    // The institutional home no longer carries a frozen PNCP market panel.
    // Keep the underlying offer-fit matrix for routing, while making sure the
    // removed examples cannot be mistaken for CONFENGE client proof.
    const CLIENT_FRAMING = /clientes? da CONFENGE|nossos clientes|clientes? atendidos?|carteira de clientes|resultados? (?:da|de|obtidos? pela) CONFENGE|cases? de cliente/i;
    assert("home_not_client_proof_page_wide", !CLIENT_FRAMING.test(html), "client framing anywhere on the home");
    assert("home_retired_market_panel_absent", !html.includes('id="mercado-pncp"'), "legacy PNCP panel");
    for (const panel of matrix.home_illustrations) {
      assert(`home_omits_retired_${panel.panel}_contract`, !html.includes(panel.contract_display), panel.contract_display);
      assert(`home_omits_retired_${panel.panel}_pncp`, !html.includes(panel.pncp_path), panel.pncp_path);
    }
    assert("home_institutional_service_index_present", html.includes('data-section-archetype="service_index"'), "service index");
    assert("home_links_current_service_surfaces", /href="\/(?:projetos|servicos)\/"/.test(html), "current services");
    const form = html.match(/<form\b[^>]*id="formulario-contato"[\s\S]*?<\/form>/);
    assert("home_form_present", Boolean(form), "form");
    const step1 = form ? form[0].match(/data-form-step="1"[\s\S]*?<\/fieldset>/) : null;
    const step2 = form ? form[0].match(/data-form-step="2"[\s\S]*?<\/fieldset>/) : null;
    assert("home_form_steps", Boolean(step1 && step2), "steps");
    for (const field of ["faixa_contrato", "risco_em_jogo", "frequencia", "maturidade_documental", "capacidade_interna"]) {
      assert(`icp_field_in_step2_${field}`, step2 && step2[0].includes(`name="${field}"`), field);
      assert(`icp_field_not_step1_${field}`, step1 && !step1[0].includes(`name="${field}"`), field);
    }
    assert("step1_no_cnpj", step1 && !/name="(cnpj|cpf)"|type="file"/i.test(step1[0]), "sensitive");
    assert("step2_no_cnpj_upload", step2 && !/name="(cnpj|cpf)"|type="file"/i.test(step2[0]), "sensitive");
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
      // 2026-09-08. Exigia o literal "Custo" com C maiusculo no HTML, o que so
      // acontecia quando a copy comecava com o rotulo "Custo de ...". Era uma
      // trava de redacao e mantinha os paragrafos em formato de ficha interna.
      // A propriedade e que a rota fale do custo; a caixa da letra nao importa.
      assert(`${route.key}_custo`, /custo/i.test(copy.body) && /custo/i.test(html), route.key);
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
