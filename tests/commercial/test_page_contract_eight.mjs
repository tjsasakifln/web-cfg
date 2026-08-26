/**
 * Gate do contrato de página das oito entregas atuais (issue 331).
 *
 * Invariante protegido: o registro comercial versionado e a rota publicada não
 * podem divergir em silêncio. O teste lê os HTMLs reais das oito rotas e do hub
 * /entregas/, confere preço, aritmética do pacote, janela de crédito, limites
 * permitidos e fronteiras negadas. Nenhum HTML é escrito por este gate.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const NAME = "page-contract-eight";

const results = [];
function assert(name, cond, detail) {
  if (cond) results.push({ name, ok: true });
  else {
    results.push({ name, ok: false, detail: String(detail).slice(0, 300) });
    console.error("FAIL", name, String(detail).slice(0, 300));
  }
}

const contractPath = path.join(root, "data/commercial/page-contract-eight.v1.json");
const raw = fs.readFileSync(contractPath, "utf8");
const contract = JSON.parse(raw);

function textOf(rel) {
  const html = fs.readFileSync(path.join(root, rel), "utf8");
  return html
    .replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function brl(cents) {
  const reais = Math.trunc(cents / 100);
  return "R$ " + String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function nonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function nonEmptyList(v) {
  return Array.isArray(v) && v.length > 0 && v.every(nonEmptyString);
}

function publicCopy(value) {
  return contract.public_copy_overrides?.[value] || value;
}

// ---------------------------------------------------------------- 0. tipografia
// travessao e meia-risca sao proibidos; o padrao e montado por code point para
// que o proprio gate nao contenha os caracteres que ele proibe.
const DASHES = new RegExp("[" + String.fromCharCode(8212, 8211) + "]");
assert("sem_travessao_no_contrato", !DASHES.test(raw), "travessao proibido no JSON");
assert(
  "sem_travessao_no_gate",
  !DASHES.test(fs.readFileSync(fileURLToPath(import.meta.url), "utf8")),
  "travessao proibido no teste",
);
assert("issue_declarada", contract.issue === 331 && contract.parent_issue === 329, contract.issue);
assert("versao_publica_v2", contract.version === "v2", contract.version);
assert("preco_congelado", contract.price_change_allowed === false, contract.price_change_allowed);

// ------------------------------------------------- 1. as oito entradas completas
const dels = contract.deliverables;
assert("oito_entradas", Array.isArray(dels) && dels.length === 8, dels && dels.length);
const numbers = dels.map((d) => d.number);
assert(
  "numeracao_01_a_08",
  JSON.stringify(numbers) === JSON.stringify(["01", "02", "03", "04", "05", "06", "07", "08"]),
  numbers.join(","),
);
assert(
  "identidade_canonica_01_a_08",
  JSON.stringify(dels.map((d) => d.deliverable_id)) ===
    JSON.stringify(numbers.map((number) => `CFG-D${number}`)),
  dels.map((d) => d.deliverable_id).join(","),
);

const REQUIRED_DENIALS = [
  ["nega_saas", /não é alerta ilimitado, assinatura, SaaS ou banco de dados do cliente/],
  ["nega_promessa", /não promete edital futuro, vitória, preço vencedor ou demanda/],
  ["exige_unknown", /ausência de dado vira UNKNOWN/],
  ["exige_decisao_humana", /classificação automática nunca encerra decisão humana/],
];

// escopo não pode ser limitado por contagem de folhas
const PAGE_LIMIT = /p[áa]gina/i;

for (const d of dels) {
  const n = d.number;
  assert(`campos_preenchidos_${n}`,
    nonEmptyString(d.issue_331_name) &&
      nonEmptyString(d.published_name_pt_br) &&
      nonEmptyString(d.route) &&
      nonEmptyString(d.file) &&
      nonEmptyString(d.objeto_incluido) &&
      nonEmptyString(d.saida_minima),
    JSON.stringify(d).slice(0, 200));
  assert(`entrada_${n}`, nonEmptyList(d.entrada) && d.entrada.length >= 5, d.entrada);
  assert(`fronteira_${n}`, nonEmptyList(d.fronteira), d.fronteira);
  assert(`preco_inteiro_positivo_${n}`,
    Number.isInteger(d.price_cents) && d.price_cents > 0 && d.price_cents % 100 === 0,
    d.price_cents);
  assert(`preco_display_coerente_${n}`, d.price_display === brl(d.price_cents),
    `${d.price_display} != ${brl(d.price_cents)}`);

  // 8. SLA positivo e com marco inicial declarado
  assert(`sla_positivo_${n}`, Number.isInteger(d.sla.business_days) && d.sla.business_days > 0, d.sla);
  assert(`sla_marco_${n}`, nonEmptyString(d.sla.counts_from), d.sla);
  assert(`sla_texto_bate_${n}`, d.sla.text.startsWith(`${d.sla.business_days} dias úteis`), d.sla.text);
  if (d.sla.counts_from_declared === true) {
    assert(`sla_marco_citado_${n}`, d.sla.text.includes(d.sla.counts_from), d.sla);
  } else {
    assert(`sla_marco_unknown_${n}`, d.sla.counts_from === "UNKNOWN", d.sla);
  }

  // 6. nenhum limite escrito em contagem de folhas
  const scopeText = [d.objeto_incluido, d.saida_minima, ...d.entrada, ...d.fronteira].join(" | ");
  assert(`sem_limite_por_paginas_${n}`, !PAGE_LIMIT.test(scopeText), scopeText.slice(0, 160));

  // 7. cada fronteira nega o que a 331 nega
  const fr = d.fronteira.join(" | ");
  for (const [label, re] of REQUIRED_DENIALS) {
    assert(`${label}_${n}`, re.test(fr), fr.slice(0, 160));
  }
}

// ------------------------------------------ 6b. eixos de limite exatamente os da 331
const EIXOS = ["empresa", "território", "tipologia", "período", "módulo", "número de casos aprofundados"];
assert("eixos_de_limite", JSON.stringify(contract.limit_dimensions) === JSON.stringify(EIXOS),
  JSON.stringify(contract.limit_dimensions));
assert("paginas_proibidas", (contract.forbidden_limit_dimensions || []).includes("páginas"),
  contract.forbidden_limit_dimensions);
assert("nenhum_eixo_e_pagina", !contract.limit_dimensions.some((x) => PAGE_LIMIT.test(x)),
  contract.limit_dimensions);

// ------------------------------------------------ 1b. entradas comuns e fronteiras
assert("entradas_comuns", nonEmptyList(contract.common_inputs) && contract.common_inputs.length === 5,
  contract.common_inputs);
assert("fronteiras_comuns", nonEmptyList(contract.common_boundaries) && contract.common_boundaries.length === 5,
  contract.common_boundaries);
for (const d of dels) {
  assert(`entrada_espelha_comuns_${d.number}`,
    contract.common_inputs.every((i) => d.entrada.includes(i)), d.entrada);
  assert(`fronteira_espelha_comuns_${d.number}`,
    contract.common_boundaries.every((b) => d.fronteira.includes(b)), d.fronteira);
}

// ---------------------------------- 2 e 3. paridade real com o site, preço inalterado
const PRECO_ESPERADO = {
  "01": 59900, "02": 69000, "03": 89000, "04": 120000,
  "05": 145000, "06": 190000, "07": 240000, "08": 375000,
};
const hubFile = contract.package.hub_file;
assert("hub_existe", fs.existsSync(path.join(root, hubFile)), hubFile);
const hubText = textOf(hubFile);
const hubHtml = fs.readFileSync(path.join(root, hubFile), "utf8");

for (const d of dels) {
  const n = d.number;
  const abs = path.join(root, d.file);
  const exists = fs.existsSync(abs);
  assert(`rota_existe_${n}`, exists, d.file);
  assert(`rota_bate_com_arquivo_${n}`, d.file === `${d.route.replace(/^\/|\/$/g, "")}/index.html`, d.route);
  assert(`preco_da_issue_${n}`, d.price_cents === PRECO_ESPERADO[n],
    `${d.price_cents} != ${PRECO_ESPERADO[n]}`);
  if (!exists) continue;
  const pageText = textOf(d.file);
  const pageHtml = fs.readFileSync(abs, "utf8");
  assert(`pagina_imprime_preco_${n}`, pageText.includes(d.price_display),
    `${d.price_display} ausente em ${d.file}`);
  assert(`pagina_imprime_nome_${n}`,
    pageText.toLowerCase().includes(d.published_name_pt_br.toLowerCase()),
    `${d.published_name_pt_br} ausente em ${d.file}`);
  assert(`hub_imprime_preco_${n}`, hubText.includes(d.price_display),
    `${d.price_display} ausente no hub`);
  assert(`hub_imprime_nome_${n}`,
    hubText.toLowerCase().includes(d.published_name_pt_br.toLowerCase()),
    `${d.published_name_pt_br} ausente no hub`);
  for (const [field, value] of [
    ["objeto", d.objeto_incluido],
    ["saida", d.saida_minima],
    ["sla", d.sla.text],
  ]) {
    assert(`pagina_imprime_${field}_${n}`, pageText.includes(value), `${field} ausente em ${d.file}`);
    assert(`hub_imprime_${field}_${n}`, hubText.includes(value), `${field} ausente no hub`);
  }
  for (const value of [...d.entrada, ...d.fronteira.map(publicCopy)]) {
    assert(`pagina_imprime_campo_${n}_${results.length}`, pageText.includes(value), value);
    assert(`hub_imprime_campo_${n}_${results.length}`, hubText.includes(value), value);
  }
  assert(`pagina_exemplo_sintetico_${n}`, /sint[ée]tic/i.test(pageText), d.file);
  assert(`pagina_contexto_resultado_${n}`,
    /Como ler o resultado/.test(pageText) && /Cobertura/.test(pageText) &&
      /Data/.test(pageText) && /Método/.test(pageText) && /NÃO INFORMADO/.test(pageText),
    d.file);
  const numericSlas = [...pageText.matchAll(/\b(\d+) dias úteis/g)].map((match) => Number(match[1]));
  assert(`pagina_sem_sla_concorrente_${n}`,
    numericSlas.length > 0 && numericSlas.every((days) => days === d.sla.business_days),
    numericSlas.join(","));
  assert(`pagina_css_contrato_${n}`, pageHtml.includes('/assets/eight-offer-contract.css'), d.file);
  assert(`pagina_form_deliverable_${n}`,
    pageHtml.includes(`name="deliverable_id" type="hidden" value="${d.deliverable_id}"`),
    d.deliverable_id);
  for (const field of contract.public_implementation.capture_fields) {
    assert(`pagina_form_captura_${n}_${field}`, pageHtml.includes(`name="${field}"`), field);
  }
  assert(`pagina_form_sem_checkout_${n}`,
    pageHtml.includes('name="offer_id" type="hidden" value=""') &&
      pageHtml.includes('name="terms_id" type="hidden" value=""') &&
      !/\.netlify\/functions\/checkout|data-checkout/i.test(pageHtml),
    d.file);
}
assert("hub_sem_css_contrato_bloqueante", !hubHtml.includes('/assets/eight-offer-contract.css'));
assert("hub_css_local", hubHtml.includes('/entregas/styles.css') && textOf("entregas/styles.css").includes('.eight-hub'));
assert("hub_contexto_resultado", /Cobertura, data de corte, método e o rótulo NÃO INFORMADO/.test(hubText));
const radarPurchaseText = textOf("comercial/radar-decisorio/index.html");
assert("radar_compra_sla_3_dias", /prazo de 3 dias úteis/i.test(radarPurchaseText), radarPurchaseText.slice(0, 180));
assert("radar_sem_promessa_48h", !/48 horas úteis/i.test(`${radarPurchaseText} ${textOf(dels[0].file)}`), "48h residual");

// nenhum preço fora dos oito aparece como preço de unidade no contrato
const cents = dels.map((d) => d.price_cents);
assert("precos_unicos", new Set(cents).size === 8, cents.join(","));
assert("precos_crescentes", cents.every((c, i) => i === 0 || c > cents[i - 1]), cents.join(","));

// ------------------------------------------- 4. aritmética do pacote continua exata
const pkg = contract.package;
const inPkg = dels.filter((d) => d.in_package);
const outPkg = dels.filter((d) => !d.in_package);
assert("sete_no_pacote", inPkg.length === 7 && outPkg.length === 1, `${inPkg.length}/${outPkg.length}`);
assert("unidade_01_fora", outPkg[0] && outPkg[0].number === "01", outPkg.map((d) => d.number));
assert("unidade_01_sem_credito",
  outPkg[0] && outPkg[0].generates_package_credit === false &&
    pkg.unit_01_in_package === false && pkg.unit_01_generates_credit === false,
  JSON.stringify({ u: outPkg[0] && outPkg[0].generates_package_credit, p: pkg.unit_01_in_package }));
assert("unidades_do_pacote_02_a_08",
  JSON.stringify(pkg.units_in_package) === JSON.stringify(["02", "03", "04", "05", "06", "07", "08"]),
  pkg.units_in_package);
assert("credito_para_todas_do_pacote", inPkg.every((d) => d.generates_package_credit === true),
  inPkg.map((d) => `${d.number}:${d.generates_package_credit}`).join(","));

const soma = inPkg.reduce((a, d) => a + d.price_cents, 0);
assert("soma_02_a_08_igual_12280", soma === 1228000, soma);
assert("soma_declarada_bate", pkg.units_sum_cents === soma, `${pkg.units_sum_cents} != ${soma}`);
assert("soma_display", pkg.units_sum_display === brl(soma), pkg.units_sum_display);
assert("pacote_8000", pkg.package_price_cents === 800000 && pkg.package_price_display === "R$ 8.000",
  pkg.package_price_cents);
assert("pacote_mais_barato_que_soma", pkg.package_price_cents < soma,
  `${pkg.package_price_cents} >= ${soma}`);
assert("hub_mostra_soma", hubText.includes(brl(soma)), "R$ 12.280 ausente no hub");
assert("hub_mostra_pacote", hubText.includes(pkg.package_price_display), "R$ 8.000 ausente no hub");
assert("hub_diz_01_fora_do_pacote",
  /fora do pacote|fora do Diagn/i.test(hubText) && /à parte/i.test(hubText),
  hubText.slice(0, 120));
assert("hub_nega_credito_para_01",
  /R\$ 599\s*Não\.?\s*Entrega à parte, fora do pacote/i.test(hubText) ||
    /único sem o crédito de 60 dias/i.test(hubText),
  "hub não nega crédito da unidade 01");

// cruzamento com o snapshot de oferta já existente em main
const snap = JSON.parse(fs.readFileSync(path.join(root, "data/offers/catalog.snapshot.json"), "utf8"));
const diag = snap.offers.find((o) => o.offer_id === "CFG-DIAG-EXP-v1");
assert("pacote_bate_com_snapshot_de_oferta", diag && diag.amount_cents === pkg.package_price_cents,
  diag && diag.amount_cents);
assert("sla_do_pacote_10_a_15",
  pkg.package_sla_business_days_min === 10 && pkg.package_sla_business_days_max === 15 &&
    diag.sla_business_days === "10-15",
  `${pkg.package_sla_business_days_min}-${pkg.package_sla_business_days_max}`);

// -------------------------------------------------- 5. janela de crédito do pacote
assert("janela_60_dias", pkg.credit_window_days === 60, pkg.credit_window_days);
assert("credito_pelo_maior_valor", /maior valor/i.test(pkg.credit_basis), pkg.credit_basis);
assert("credito_nao_acumula", pkg.credit_stacks === false && /sem acúmulo/i.test(pkg.credit_stacking_note),
  `${pkg.credit_stacks} ${pkg.credit_stacking_note}`);
assert("hub_mostra_janela_60", /em até 60 dias/i.test(hubText), "60 dias ausente no hub");
assert("hub_mostra_sem_acumulo", /sem acúmulo/i.test(hubText), "sem acúmulo ausente no hub");

// -------------------------- lacuna de marco de SLA: pode encolher, nunca crescer
const unknowns = dels.filter((d) => d.sla.counts_from === "UNKNOWN").map((d) => d.number);
assert("lacuna_de_marco_nao_cresce", unknowns.length <= 5, `UNKNOWN em ${unknowns.join(",")}`);
assert("lacuna_declarada",
  JSON.stringify(contract.sla_counts_from_gap.unknown) === JSON.stringify(unknowns),
  `${contract.sla_counts_from_gap.unknown} != ${unknowns}`);
assert("marcos_declarados_pela_issue",
  JSON.stringify(contract.sla_counts_from_gap.declared_in_issue) ===
    JSON.stringify(dels.filter((d) => d.sla.counts_from_declared).map((d) => d.number)),
  contract.sla_counts_from_gap.declared_in_issue);

// -------------------------------------- o que esta PR deliberadamente não entrega
const nd = contract.not_delivered_here;
assert("nada_declarado_validado",
  nd.html_changed === true && nd.price_changed === false &&
    nd.first_sale_evidence === "NOT_STARTED" && Array.isArray(nd.evidence) && nd.evidence.length === 0,
  JSON.stringify(nd));
assert("campos_da_primeira_venda",
  JSON.stringify(nd.first_sale_fields) === JSON.stringify(["horas", "retrabalho", "margem", "outcome"]),
  nd.first_sale_fields);
assert("sla_visivel_nas_rotas",
  nd.sla_visible_on_route_pages === "DONE" && dels.every((d) => textOf(d.file).includes(d.sla.text)),
  "SLA ausente em alguma rota");
assert("implementacao_publica_declarada",
  contract.public_implementation?.route_pages === 8 &&
    contract.public_implementation?.hub_route === "/entregas/" &&
    contract.public_implementation?.analytics_contains_qualification === false &&
    contract.public_implementation?.checkout_enabled === false,
  JSON.stringify(contract.public_implementation));
const analyticsCode = [
  "netlify/functions/collect.cjs",
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
const eventRegistry = JSON.parse(fs.readFileSync(path.join(root, "netlify/functions/lib/event-registry.json"), "utf8"));
assert("cnpj_bloqueado_como_pii_no_analytics", eventRegistry.pii_keys.includes("cnpj"));
for (const field of ["analysis_cutoff", "opportunity_deadline", "decision_intent"]) {
  assert(`qualificacao_fora_do_analytics_${field}`, !analyticsCode.includes(field), field);
}
const captureCss = fs.readFileSync(path.join(root, "assets/report-capture.css"), "utf8");
assert(
  "datas_com_alvo_de_toque_legivel",
  captureCss.includes('.report-capture-form input[type="date"]'),
  "inputs de data escapam do estilo de controles do formulário",
);
const rendererCheck = spawnSync(
  process.execPath,
  [path.join(root, "scripts/commercial/render_eight_offer_contracts.mjs"), "--check"],
  { cwd: root, encoding: "utf8" },
);
assert("renderer_sem_drift", rendererCheck.status === 0, `${rendererCheck.stdout}\n${rendererCheck.stderr}`);

const failed = results.filter((r) => !r.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(JSON.stringify({ ok: false, failed: failed.map((f) => f.name) }, null, 2));
  process.exit(1);
}
