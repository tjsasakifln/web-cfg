/**
 * Drives shipped script.js multi-step form + asserts analytics without PII.
 */
import fs from "fs";
import vm from "vm";
import { URLSearchParams } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const code = fs.readFileSync(path.join(root, "script.js"), "utf8");
const formSource = fs.readFileSync(path.join(root, "js/modules/form.js"), "utf8");

if (!formSource.includes("fetch('/api/web/lead'") || formSource.includes("fetch('/.netlify/functions/lead'")) {
  console.error("FAIL: browser form must use the canonical Netcup lead route");
  process.exit(1);
}

if (!formSource.includes("lead_id: protocol")) {
  console.error("FAIL: persisted analytics does not carry the server receipt id");
  process.exit(1);
}
for (const needle of ["validationCategory", "validation_category: 'rate_limited'"]) {
  if (!formSource.includes(needle)) {
    console.error("FAIL: form validation category source missing", needle);
    process.exit(1);
  }
}

// Structural: shipped home has multi-step form + journey CTAs
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const needle of [
  'data-form-multistep="true"',
  'name="diagnostico-b2g"',
  "Solicitar canal seguro para envio",
  "Descrever minha situação",
  'data-set-journey="contrato"',
  'data-journey="edital"',
  'data-journey="operacao"',
  'id="estagio"',
  'data-form-step="1"',
  'data-form-step="2"',
  'id="faixa_contrato"',
  'id="risco_em_jogo"',
  'id="frequencia"',
  'id="maturidade_documental"',
  'id="capacidade_interna"',
  'name="consentimento"',
  'data-offer-fit-hint',
]) {
  if (!home.includes(needle)) {
    console.error("FAIL: home missing", needle);
    process.exit(1);
  }
}
// The corporate shell keeps the existing B2G form explicitly scoped to the
// protected public-works vertical instead of presenting it as a generic form.
if (!home.includes("Falar sobre obras públicas")) {
  console.error("FAIL: home missing protected B2G form scope");
  process.exit(1);
}
const formMatch = home.match(/<form\b[^>]*id="formulario-contato"[\s\S]*?<\/form>/);
if (!formMatch) {
  console.error("FAIL: home form missing");
  process.exit(1);
}
const step1 = formMatch[0].match(/data-form-step="1"[\s\S]*?<\/fieldset>/);
if (!step1) {
  console.error("FAIL: form step 1 missing");
  process.exit(1);
}
for (const bad of ["cnpj", "cpf", 'type="file"', "faixa_contrato", "risco_em_jogo"]) {
  if (step1[0].includes(bad === "cnpj" || bad === "cpf" ? bad : bad)) {
    if (["cnpj", "cpf", 'type="file"'].includes(bad) && step1[0].includes(bad)) {
      console.error("FAIL: sensitive field in step 1", bad);
      process.exit(1);
    }
  }
}
if (/name="(cnpj|cpf)"/i.test(step1[0]) || /type="file"/i.test(step1[0])) {
  console.error("FAIL: step 1 asks sensitive data");
  process.exit(1);
}
if (step1[0].includes("faixa_contrato") || step1[0].includes("risco_em_jogo")) {
  console.error("FAIL: ICP fields must stay off step 1");
  process.exit(1);
}
// No visitor-facing marketing metalinguage on the conversion surface
for (const leak of ["Sem CTA genérico", "Jornada A", "Jornada B", "Jornada C", "Risco de não agir"]) {
  if (home.includes(leak)) {
    console.error("FAIL: metalinguage leak on home", leak);
    process.exit(1);
  }
}
for (const f of ["obrigado-contrato.html", "obrigado-edital.html", "obrigado-operacao.html"]) {
  const t = fs.readFileSync(path.join(root, f), "utf8");
  if (!t.includes("data-lead-success") || !t.includes("wa.me")) {
    console.error("FAIL: confirmation page incomplete", f);
    process.exit(1);
  }
}
for (const f of ["obrigado-contrato.html", "obrigado-edital.html"]) {
  const t = fs.readFileSync(path.join(root, f), "utf8");
  if (!t.includes("id=\"receipt-id\"") || !t.includes("canal escolhido posteriormente") || !t.includes("Solicitar canal seguro para envio")) {
    console.error("FAIL: confirmation missing persisted protocol or B SLA", f);
    process.exit(1);
  }
  if (/type\s*=\s*['"]file['"]/i.test(t)) {
    console.error("FAIL: confirmation has file input", f);
    process.exit(1);
  }
}
if (!home.includes('id="canal_seguro"') || !home.includes('name="document_intent"')) {
  console.error("FAIL: home form missing secure-channel fields");
  process.exit(1);
}
if (/type\s*=\s*['"]file['"]/i.test(home)) {
  console.error("FAIL: home capture form has type=file");
  process.exit(1);
}

// Unit: track() redacts PII (real shipped function)
const dataLayer = [];
const document = {
  readyState: "complete",
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({ type: "", name: "", value: "" }),
  documentElement: { scrollHeight: 2000 },
  addEventListener: () => {},
  body: { classList: { remove() {}, add() {} }, getAttribute: () => null },
};
const windowObj = {
  dataLayer,
  matchMedia: () => ({ matches: false }),
  location: { pathname: "/", search: "", hash: "" },
  document,
  addEventListener: () => {},
  innerHeight: 800,
  scrollY: 0,
  sessionStorage: { getItem: () => null, setItem: () => {} },
  CONFENGE_DEBUG_ANALYTICS: false,
};
windowObj.window = windowObj;
const sandbox = { window: windowObj, document, console, URLSearchParams };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const track = sandbox.window.confengeTrack;
if (typeof track !== "function") {
  console.error("FAIL: confengeTrack missing");
  process.exit(1);
}

// Simulate funnel events the shipped code emits (same names/params shape)
track("lead_form_start", { page_path: "/", journey: "contrato", device_context: "desktop" });
track("lead_form_step", { page_path: "/", form_step: 2, journey: "contrato", stage_category: "problema urgente em contrato" });
track("lead_form_submit", {
  page_path: "/",
  journey: "contrato",
  stage_category: "problema urgente em contrato",
  urgency_category: "até 48 horas",
  nome: "should-not-pass",
  email: "leak@example.com",
  telefone: "+5548999999999",
  mensagem: "secret document text",
});
track("lead_form_error", {
  page_path: "/",
  validation_category: "contact_format",
  field: "email",
  field_value: "leak@example.com",
  native_message: "Invalid email",
});
track("whatsapp_click", { page_path: "/", journey: "contrato", cta_position: "hero" });
track("email_click", { page_path: "/", destination_type: "email" });
track("service_page_view", { page_path: "/defesa-margem-contratos-publicos/", offer_id: "contract-defense" });

const events = dataLayer.map((e) => e.event);
for (const need of [
  "lead_form_start",
  "lead_form_step",
  "lead_form_submit",
  "whatsapp_click",
  "email_click",
  "service_page_view",
]) {
  if (!events.includes(need)) {
    console.error("FAIL: missing event", need, events);
    process.exit(1);
  }
}
const blob = JSON.stringify(dataLayer);
for (const bad of ["should-not-pass", "leak@example.com", "+5548999999999", "secret document text"]) {
  if (blob.includes(bad)) {
    console.error("FAIL: PII leaked", bad);
    process.exit(1);
  }
}
// journey preserved on submit without PII
const sub = dataLayer.find((e) => e.event === "lead_form_submit");
if (sub.journey !== "contrato" || sub.nome || sub.email || sub.telefone || sub.mensagem) {
  console.error("FAIL: submit payload", sub);
  process.exit(1);
}
const validation = dataLayer.find((e) => e.event === "lead_form_error");
if (!validation || validation.validation_category !== "contact_format") {
  console.error("FAIL: validation category missing", validation);
  process.exit(1);
}
for (const key of ["field", "field_value", "native_message"]) {
  if (validation[key] != null) {
    console.error("FAIL: validation PII/debug key leaked", { key, validation });
    process.exit(1);
  }
}

// Script source must implement multi-step + journey actions
for (const needle of [
  "lead_form_step",
  "obrigado-contrato",
  "obrigado-edital",
  "obrigado-operacao",
  "applyJourneyToForm",
  "data-form-next",
  "utm_source",
]) {
  if (!code.includes(needle)) {
    console.error("FAIL: script.js missing", needle);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// #611 (A02) — a home aceitava apenas situacoes de contrato publico. Um
// visitante de projeto, quantitativos, obra, imovel, pericia, SST ou de um
// orgao publico so tinha "Outro", e "Outro" caia, em silencio, na jornada
// B2G "operacao" e na escada de precos de obra publica.
// Estas verificacoes prendem tres regressoes: a situacao sumir do select, a
// situacao ser convertida em orcamento ou em degrau B2G, e vocabulario de
// controle chegar ao visitante.
// ---------------------------------------------------------------------------
const situationFail = (name, detail) => {
  console.error("FAIL:", name, detail === undefined ? "" : detail);
  process.exit(1);
};

const selectMatch = home.match(/<select\b[^>]*id="estagio"[\s\S]*?<\/select>/);
if (!selectMatch) situationFail("home estagio select missing");
const estagioSelect = selectMatch[0];

// As oito situacoes que a home precisa saber dizer. O valor e o texto que o
// visitante escolhe e que /lead recebe em `estagio` (texto livre, 120 chars).
const HOME_SITUATION_VALUES = {
  projeto: "projeto, revisão ou compatibilização",
  quantitativos: "quantitativos ou orçamento",
  obra_imovel: "obra ou imóvel para inspecionar ou documentar",
  pericia: "perícia, assistência técnica ou avaliação",
  sst: "segurança do trabalho",
  contratada_obra_publica: "problema urgente em contrato",
  orgao_publico: "planejamento de órgão público",
  outra: "outro",
};
for (const [id, value] of Object.entries(HOME_SITUATION_VALUES)) {
  if (!estagioSelect.includes(`value="${value}"`)) {
    situationFail("home select cannot express the situation", `${id} -> ${value}`);
  }
}

// As cinco opcoes publicas de hoje seguem intactas, com a mesma jornada.
const PRESERVED_PUBLIC_OPTIONS = {
  "problema urgente em contrato": "contrato",
  "edital ou proposta em análise": "edital",
  "estruturando a operação no mercado público": "operacao",
  "escolhendo oportunidades": "operacao",
  "contrato em execução": "contrato",
};
// A marca data-journey-default (opcao neutra que o preenchimento automatico
// prefere quando varias opcoes partilham a jornada) nao altera valor nem jornada.
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const [value, journey] of Object.entries(PRESERVED_PUBLIC_OPTIONS)) {
  const intact = new RegExp(`<option value="${escapeRe(value)}" data-journey="${journey}"( data-journey-default)?>`);
  if (!intact.test(estagioSelect)) {
    situationFail("public option changed", `${value} -> ${journey}`);
  }
}

const homeSituation = sandbox.window.confengeHomeSituation;
if (typeof homeSituation !== "function") {
  situationFail("script.js does not publish confengeHomeSituation");
}

// Toda opcao oferecida tem um proximo passo declarado. Uma opcao sem entrada
// cai no default 'operacao' de stageToJourney, que e a conversao silenciosa.
const optionValues = [...estagioSelect.matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)]
  .map((m) => m[1])
  .filter(Boolean);
if (optionValues.length < 12) situationFail("estagio option inventory shrank", optionValues.length);
for (const value of optionValues) {
  if (!homeSituation(value)) situationFail("option has no declared next step", value);
}

const PUBLIC_WORKS_JOURNEYS = new Set(["contrato", "edital", "operacao"]);
// O data-journey gravado no HTML tem de dizer o mesmo que o roteamento. Sem
// isto, trocar o atributo de uma situacao privada para "operacao" mandava o
// visitante para a jornada B2G assim que a home fosse aberta com ?jornada=.
const optionJourneys = new Map(
  [...estagioSelect.matchAll(/<option\b[^>]*\bvalue="([^"]*)"[^>]*\bdata-journey="([^"]*)"/g)]
    .map((m) => [m[1], m[2]]),
);
for (const value of optionValues) {
  const declared = optionJourneys.get(value);
  if (!declared) situationFail("option has no data-journey", value);
  if (declared !== homeSituation(value).journey) {
    situationFail("data-journey contradicts the situation", `${value}: ${declared}`);
  }
}
const LADDER_TIERS = new Set([
  "conteudo_ferramenta",
  "entrega_entrada",
  "diagnostico",
  "projeto_critico",
  "diretoria",
]);
const INVENTED_PROMISE = /R\$|\bdias? útil|\bdias? úteis|\bSLA\b|\bprazo de\b|\bem até\b|\bprotocolo em\b/i;

const nonLadder = [];
for (const value of optionValues) {
  const fit = homeSituation(value);
  if (fit.ladder !== false) {
    if (!PUBLIC_WORKS_JOURNEYS.has(fit.journey)) {
      situationFail("ladder situation outside the public-works journeys", `${value} -> ${fit.journey}`);
    }
    continue;
  }
  nonLadder.push(value);
  if (PUBLIC_WORKS_JOURNEYS.has(fit.journey)) {
    situationFail("non public-works situation routed into a B2G journey", `${value} -> ${fit.journey}`);
  }
  if (LADDER_TIERS.has(fit.journey)) {
    situationFail("non public-works situation routed into a priced tier", `${value} -> ${fit.journey}`);
  }
  for (const field of ["next_step", "route", "whatsapp"]) {
    if (!fit[field] || String(fit[field]).trim().length < 3) {
      situationFail("situation reaches no useful action", `${value} missing ${field}`);
    }
  }
  for (const field of ["next_step", "detail", "route_label"]) {
    const text = String(fit[field] || "");
    if (INVENTED_PROMISE.test(text)) {
      situationFail("situation copy invents a price or a deadline", `${value}: ${text}`);
    }
  }
}
if (nonLadder.length < 7) situationFail("private and agency situations missing from the resolver", nonLadder);

// O contra-caso executavel do defeito de origem: stageToJourney classificava
// por substring do vocabulario de obra publica e devolvia 'operacao' para
// tudo o que nao reconhecia. Uma pericia, um caso de SST, um projeto ou um
// orgao publico saiam da home com jornada B2G e destino /obrigado-operacao,
// sem ninguem ter escolhido obra publica. Aqui roda a MESMA funcao que o
// formulario usa -- se a consulta a tabela de situacoes for removida de
// stageToJourney, ou se um destino B2G voltar, isto reprova.
const stageToJourney = sandbox.window.confengeStageToJourney;
const journeyActions = sandbox.window.CONFENGE_JOURNEY_ACTIONS;
if (typeof stageToJourney !== "function") situationFail("script.js does not publish confengeStageToJourney");
if (!journeyActions || typeof journeyActions !== "object") situationFail("script.js does not publish the journey destinations");
const PUBLIC_WORKS_DESTINATIONS = new Set(["/obrigado-contrato", "/obrigado-edital", "/obrigado-operacao"]);
for (const value of optionValues) {
  const fit = homeSituation(value);
  const routedJourney = stageToJourney(value);
  if (routedJourney !== fit.journey) {
    situationFail("routing disagrees with the declared situation", `${value}: ${routedJourney} != ${fit.journey}`);
  }
  const destination = journeyActions[routedJourney] || "/obrigado";
  if (fit.ladder === false) {
    if (PUBLIC_WORKS_JOURNEYS.has(routedJourney)) {
      situationFail("stageToJourney still falls back to a public-works journey", `${value} -> ${routedJourney}`);
    }
    if (PUBLIC_WORKS_DESTINATIONS.has(destination)) {
      situationFail("non public-works situation confirms on a public-works page", `${value} -> ${destination}`);
    }
  } else if (!PUBLIC_WORKS_DESTINATIONS.has(destination)) {
    situationFail("public-works situation lost its confirmation page", `${value} -> ${destination}`);
  }
}
// E o destino de hoje das cinco opcoes publicas, exatamente como hoje.
for (const [value, journey] of Object.entries(PRESERVED_PUBLIC_OPTIONS)) {
  if (stageToJourney(value) !== journey) {
    situationFail("public option changed journey at runtime", `${value} -> ${stageToJourney(value)}`);
  }
}

// O pedido de projeto nao pode virar um pedido de orcamento.
const projeto = homeSituation("projeto, revisão ou compatibilização");
const orcamento = homeSituation("quantitativos ou orçamento");
if (projeto.journey === orcamento.journey || projeto.route === orcamento.route) {
  situationFail("projeto silently converted into orçamento", `${projeto.route} / ${orcamento.route}`);
}
if (/orçamento|orcamento/i.test(projeto.route)) {
  situationFail("projeto routed to the orçamento page", projeto.route);
}

// A escada B2G tem de ser separavel do resto do formulario, e as superficies
// que respondem a situacao escolhida precisam existir no HTML publicado.
const formHtml = formMatch[0];
for (const hook of [
  "data-b2g-qualification",
  "data-situation-next",
  "data-situation-detail",
  "data-situation-channels",
  "data-situation-route",
  "data-situation-whatsapp",
]) {
  if (!formHtml.includes(hook)) situationFail("form missing situation hook", hook);
}
const ladderBlock = formHtml.match(/<div\b[^>]*data-b2g-qualification[^>]*>[\s\S]*?data-offer-fit-hint[\s\S]*?<\/p>/);
if (!ladderBlock) situationFail("public-works qualification block is not delimited");
for (const icp of ["faixa_contrato", "risco_em_jogo", "frequencia", "maturidade_documental", "capacidade_interna"]) {
  if (!ladderBlock[0].includes(`name="${icp}"`)) {
    situationFail("ICP field outside the public-works block", icp);
  }
}
for (const channel of ["wa.me/5548988344559", "mailto:tiago.sasaki@confenge.com.br", "tel:+5548988344559"]) {
  if (!formHtml.includes(channel)) situationFail("contextual channel missing from the form", channel);
}

// Vocabulario de controle nao chega ao visitante: nem no texto visivel da
// secao de contato, nem nos rotulos dos grupos do select, nem no proximo
// passo que o formulario escreve na tela.
const visibleText = (fragment) => fragment
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;/gi, " ")
  .replace(/\s+/g, " ");
const contactSection = home.match(/<section\b[^>]*id="contato"[\s\S]*?<\/section>/);
if (!contactSection) situationFail("contact section missing");
const optgroupLabels = [...estagioSelect.matchAll(/<optgroup\b[^>]*\blabel="([^"]*)"/g)].map((m) => m[1]);
if (optgroupLabels.length < 3) situationFail("estagio groups missing", optgroupLabels);
const resolverCopy = optionValues.flatMap((value) => {
  const fit = homeSituation(value);
  return [fit.next_step, fit.detail, fit.route_label].filter(Boolean);
});
const CONTROL_VOCABULARY = [
  "UNKNOWN",
  "as_of",
  "PII",
  "SLA",
  "B2G",
  "ICP",
  "data-journey",
  "next_step",
  "ladder",
  "conteudo_ferramenta",
  "entrega_entrada",
  "projeto_critico",
  "diagnostico_delimitado",
  "dossie_critico",
  "operacao",
  "orcamento",
  "pericia",
];
for (const surface of [visibleText(contactSection[0]), ...optgroupLabels, ...resolverCopy]) {
  for (const token of CONTROL_VOCABULARY) {
    if (surface.includes(token)) {
      situationFail("control vocabulary reached the visitor", `${token} in: ${surface.slice(0, 160)}`);
    }
  }
}

console.log(
  "SITUATION_COVERAGE_OK",
  JSON.stringify({
    options: optionValues.length,
    situations: Object.keys(HOME_SITUATION_VALUES).length,
    non_ladder: nonLadder.length,
    public_ladder: optionValues.length - nonLadder.length,
  }),
);

console.log(
  "FORM_FUNNEL_OK",
  JSON.stringify({
    events: [...new Set(events)],
    submit_journey: sub.journey,
    home_multistep: true,
  }),
);
