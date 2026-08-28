#!/usr/bin/env node

/**
 * Render the public 54-deliverable index from the canonical registries.
 *
 * The committed HTML is intentional: visitors, crawlers and the conversion
 * gate receive the same content without depending on client-side rendering.
 * `--check` makes registry/HTML drift fail closed in CI.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = path.join(root, "data/commercial/deliverables-registry.v1.json");
const doorsPath = path.join(root, "data/commercial/task-doors.v1.json");
const namingPath = path.join(root, "data/commercial/offer-naming.v1.json");
const executionPath = path.join(root, "data/commercial/page-contract-execucao.v1.json");
const pagePath = path.join(root, "entregas/index.html");
const clientDataPath = path.join(root, "entregas/catalog-data.js");

const CATALOG_START = "<!-- GENERATED:PUBLIC-CATALOG:START -->";
const CATALOG_END = "<!-- GENERATED:PUBLIC-CATALOG:END -->";
const SELECT_START = "<!-- GENERATED:DELIVERABLE-SELECT:START -->";
const SELECT_END = "<!-- GENERATED:DELIVERABLE-SELECT:END -->";
const CLIENT_DATA_SCHEMA = "confenge.public-deliverable-catalog/1.1";
const CLIENT_DATA_FIELDS = [
  "id",
  "name",
  "trigger",
  "decision",
  "unit",
  "input",
  "inputKinds",
  "inputCount",
  "decisionBusinessDays",
  "output",
  "sla",
  "price",
  "exclusion",
  "stepUp",
  "publicState",
  "contractHtml",
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function publicText(value) {
  return String(value ?? "")
    .replace(/\bFACT\b/g, "FATO")
    .replace(/\bCALCULATION\b/g, "CÁLCULO")
    .replace(/\bINFERENCE\b/g, "INFERÊNCIA")
    .replace(/\bUNKNOWN\b/g, "DESCONHECIDO")
    .replace(/\binputs\b/gi, "insumos")
    .replace(/\bextra-cli\b/gi, "fonte versionada de dados públicos")
    .replace(/\bDataLake\b/gi, "base paralela de dados")
    .replace(/fale conosco/gi, "atendimento genérico")
    .replace(/\bcheckout\b/gi, "contratação automática")
    .replace(/\bkickoff\b/gi, "início")
    .replace(/\s*\(CFG-D\d{2}\)/g, "")
    // The public integrity gate rejects these phrases even inside negative
    // attributes: they can be detached from their context by search engines,
    // analytics or client-side comparison. Keep the private contract exact and
    // publish the boundary without serializing a false conclusion.
    .replace(/certificado, selo ou declaração de empresa limpa/gi, "certificado universal, selo ou declaração conclusiva de integridade")
    .replace(/\bempresa limpa\b/gi, "ausência absoluta de risco")
    .replace(/\bempresa idônea\b/gi, "idoneidade universal")
    .replace(/\bnada consta\b/gi, "ausência absoluta de registros")
    .replace(/\bNO_MATCH_CONFIRMED\b/g, "NÃO LOCALIZADO NA COBERTURA")
    // Describe the contractual instruments without reading as a promise of
    // outcome under the public copy contract.
    .replace(/garantia de proposta e garantia contratual dimensionadas/gi, "cauções de proposta e garantia contratual dimensionadas");
}

const INPUT_TERMS = {
  edital: ["edital"],
  planilha: ["planilha", "orcamento", "curva abc", "bdi"],
  documentos: ["documento", "anexo", "contrato", "atestado", "protocolo"],
  cronograma: ["cronograma"],
  dados: ["dado", "base", "fonte", "historico", "serie", "cnpj"],
};

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function inputKinds(entry) {
  const inputs = normalize(entry.required_inputs.map(publicText).join(" "));
  return Object.entries(INPUT_TERMS)
    .filter(([, terms]) => terms.some((term) => inputs.includes(term)))
    .map(([kind]) => kind);
}

function stepUpLabel(entry) {
  if (entry.offer_container === "expansion_package") {
    return "Diagnóstico de Expansão no Mercado Público";
  }
  if (entry.offer_container === "diretoria_fracionada") {
    return "Diretoria Fracionada para o Mercado Público";
  }
  return "entrega pontual";
}

function lowerFirst(value) {
  const text = String(value || "").trim();
  return text ? `${text[0].toLocaleLowerCase("pt-BR")}${text.slice(1)}` : text;
}

function publicList(values, prefix = "") {
  return `<ul>${values.map((value) => `<li>${escapeHtml(prefix)}${escapeHtml(publicText(value))}</li>`).join("")}</ul>`;
}

function copyClause(key, title, content) {
  return `<section data-copy-clause="${key}"><h6>${title}</h6>${content}</section>`;
}

function boundaryAgainst(item, number) {
  return item?.boundary_vs_existing_offers?.find((boundary) => boundary.against_item === number);
}

function executionCreditDisclosure(credit) {
  return `O maior valor efetivamente pago no item ${credit.source_item} gera um único crédito para o item 51 ou para o item 16 em até ${credit.window_days} dias, sem acúmulo e limitado ao valor pago.`;
}

function executionCallout(entry, executionContract) {
  if (!Array.isArray(executionContract?.items)) {
    throw new Error("PUBLIC_EXECUTION_CONTRACT_MISSING: data/commercial/page-contract-execucao.v1.json is required");
  }
  const byNumber = new Map(executionContract.items.map((item) => [item.number, item]));

  if (entry.deliverable_id === "CFG-D16") {
    const executionItems = executionContract.items.map((item) =>
      `<li><a href="#entrega-${item.number}"><span>${item.number}</span>${escapeHtml(item.public_name_pt_br)}</a></li>`
    ).join("");
    const credit = byNumber.get(51).credit_rule;
    return `<section class="catalog-item__execution" data-execution-composition="CFG-D16" aria-labelledby="execution-composition-title">
<h6 id="execution-composition-title">Coordenação ou execução avulsa?</h6>
<p>O item 16 coordena a oportunidade inteira. As seis execuções abaixo continuam compráveis separadamente:</p>
<ul>${executionItems}</ul>
<p data-execution-no-double-charge>Quando alguma execução compõe o item 16, a proposta discrimina cada item incluído e não soma preços silenciosamente.</p>
<p data-execution-credit>${executionCreditDisclosure(credit)}</p>
</section>`;
  }

  const executionItem = executionContract.items.find((item) => item.deliverable_id === entry.deliverable_id);
  if (!executionItem) return "";
  const tierLines = executionItem.pricing.tiers.map((tier) => {
    const sla = Number.isInteger(tier.sla_business_days) ? ` · ${tier.sla_business_days} dias úteis` : "";
    return `<li><strong>${escapeHtml(tier.name_pt_br)}: ${brl(tier.price_cents)}</strong>${sla}<br/>${escapeHtml(tier.unit_pt_br)}</li>`;
  });
  const additionLines = (executionItem.pricing.additional_charges || []).map((charge) =>
    `<li><strong>${escapeHtml(charge.name_pt_br)}: ${brl(charge.price_cents)}</strong><br/>${escapeHtml(charge.unit_pt_br)}</li>`
  );
  const sections = [
    `<div data-execution-pricing="${entry.deliverable_id}"><h6>Faixas publicadas</h6><ul>${[...tierLines, ...additionLines].join("")}</ul></div>`,
  ];

  if (entry.deliverable_id === "CFG-D49") {
    const boundary = boundaryAgainst(executionItem, 14);
    sections.push(`<div data-execution-boundary="14-49"><h6>Auditar ou produzir?</h6><p>${escapeHtml(boundary.statement_pt_br)}</p></div>`);
  }

  if (entry.deliverable_id === "CFG-D51") {
    const boundary = boundaryAgainst(executionItem, 13);
    sections.push(`<div data-execution-boundary="13-51"><h6>Diagnosticar ou montar?</h6><p>${escapeHtml(boundary.statement_pt_br)}</p></div>`);
    sections.push(`<div data-execution-credit="13-51"><h6>Crédito do diagnóstico</h6><p>${escapeHtml(executionCreditDisclosure(executionItem.credit_rule))}</p></div>`);
  }

  if (entry.deliverable_id === "CFG-D53") {
    sections.push(`<div data-execution-operator="client-only"><h6>Quem opera a sessão</h6><p>${escapeHtml(executionItem.operator_of_record_pt_br)} A CONFENGE não dá lance e não opera credencial, login, certificado ou plataforma pelo cliente.</p></div>`);
  }

  return `<aside class="catalog-item__execution" data-execution-offer="${entry.deliverable_id}">${sections.join("")}</aside>`;
}

function contractBody(entry, neighbor, executionContract) {
  const state = STATE[entry.public_state];
  const proof = entry.public_state === "PUBLISHED"
    ? `Em ${entry.public_name_pt_br}, a amostra sintética integral mostra ${publicText(lowerFirst(entry.included_outputs[0]))}, com método, fonte, data e cobertura visíveis. Nenhum caso real é insinuado.`
    : `Em ${entry.public_name_pt_br}, a prova disponível é a estrutura verificável de ${publicText(lowerFirst(entry.included_outputs[0]))}. Caso real não publicado.`;
  const actionExpectation = entry.public_state === "PUBLISHED"
    ? `Consultar o exemplo de ${entry.public_name_pt_br} abre a amostra no navegador. Contratação, escopo e prazo continuam sujeitos a confirmação.`
    : entry.public_state === "VALIDATE"
      ? `Pedir aderência para ${entry.public_name_pt_br} leva à captura terminal. Uma pessoa revisa contexto, capacidade e prazo antes de qualquer proposta.`
      : `${entry.public_name_pt_br} está indisponível. O estado só muda depois que cobertura e proveniência cumprirem o gate.`;
  const neighborCopy = neighbor
    ? `Compare com ${neighbor.public_name_pt_br} quando a pergunta for: ${neighbor.decision_question} Esta entrega cabe quando a pergunta for: ${entry.decision_question}`
    : `Não há alternativa vizinha na mesma tarefa. Próximo passo comercial: ${stepUpLabel(entry)}.`;
  const grades = entry.data_contract.evidence_grades.map((grade) => publicText(grade).toLocaleLowerCase("pt-BR"));
  const clauses = [
    copyClause("decision_oriented_name", "Decisão orientadora", `<p>${escapeHtml(entry.public_name_pt_br)} responde: ${escapeHtml(entry.decision_question)}</p>`),
    copyClause("observable_trigger", "Compre quando", `<p>${escapeHtml(publicText(lowerFirst(entry.trigger)))}</p>`),
    copyClause("cost_of_inaction", "Custo de não agir", `<p>Sem esta análise, a pergunta “${escapeHtml(entry.decision_question)}” segue sem critério documentado.</p>`),
    copyClause("decision_that_changes", "Decisão antes e depois", `<p>Antes: ${escapeHtml(entry.decision_question)} Depois: ${escapeHtml(publicText(entry.included_outputs[0]))}.</p>`),
    copyClause("concrete_result_and_artifact_example", "Resultado e artefato", publicList(entry.included_outputs)),
    copyClause("scope_in", "O que entra", `<p>${escapeHtml(publicText(entry.scope.unit))}.</p>${publicList(entry.scope.limits)}`),
    copyClause("client_inputs_and_sla_start", "Insumos e início do prazo", `${publicList(entry.required_inputs)}<p>O prazo começa após ${escapeHtml(publicText(entry.sla.starts_after))}.</p>`),
    copyClause("method_and_provenance", "Método e proveniência", `<p>Em ${escapeHtml(entry.public_name_pt_br)}, a decisão “${escapeHtml(entry.decision_question)}” usa fonte, data, método e cobertura, com afirmações marcadas como ${escapeHtml(grades.join(", "))}.</p>`),
    copyClause("price_and_sla_same_block", "Preço e prazo", `<p>${escapeHtml(entry.public_name_pt_br)}: <strong>${escapeHtml(priceLabel(entry))}</strong> · ${escapeHtml(publicText(slaLabel(entry)))}</p>`),
    copyClause("exclusions_and_third_party", "Não inclui", publicList(entry.exclusions, "Não inclui: ")),
    copyClause("fit_and_misfit", "Serve e não serve", `<p>Serve quando ${escapeHtml(publicText(lowerFirst(entry.trigger)))}</p><p>Não serve para ${escapeHtml(publicText(entry.exclusions[0]))}.</p>`),
    copyClause("proof_matching_real_state", "Prova disponível", `<p>${escapeHtml(proof)}</p>`),
    copyClause("specific_objections", "Objeção que precisa ser resolvida", `<p>Em ${escapeHtml(entry.public_name_pt_br)}, sem ${escapeHtml(publicText(entry.required_inputs[0]))}, o SLA não começa e a decisão “${escapeHtml(entry.decision_question)}” permanece em revisão.</p>`),
    copyClause("cta_with_post_click_expectation", "Próxima ação", `<p>${escapeHtml(actionExpectation)}</p><p>Estado atual: ${escapeHtml(state.label)}.</p>`),
    copyClause("neighbor_alternative_and_step_up", "Alternativa e próximo nível", `<p>${escapeHtml(neighborCopy)}</p><p>Próximo nível: ${escapeHtml(stepUpLabel(entry))}.</p>`),
  ];
  return `${clauses.join("")}${executionCallout(entry, executionContract)}`;
}

function brl(cents) {
  return `R$ ${Math.round(Number(cents) / 100).toLocaleString("pt-BR")}`;
}

function priceLabel(entry) {
  const suffix = entry.price.billing === "subscription_monthly" ? "/mês" : "";
  if (Array.isArray(entry.price.tiers) && entry.price.tiers.length) {
    const values = entry.price.tiers.map(({ amount_cents }) => amount_cents).sort((a, b) => a - b);
    return `${brl(values[0])} a ${brl(values.at(-1))}${suffix}`;
  }
  return `${brl(entry.price.amount_cents)}${suffix}`;
}

function slaLabel(entry) {
  const { business_days_min: min, business_days_max: max, starts_after: after } = entry.sla;
  if (min === null && max === null) {
    if (entry.sla.cadence) return `${entry.sla.cadence}; início após ${after}`;
    if (after === "triagem de enquadramento") return "Definido na triagem de enquadramento";
    return `Definido na triagem; início após ${after}`;
  }
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error(`invalid SLA bounds for ${entry.deliverable_id}`);
  }
  const days = min === max ? `${min} dias úteis` : `${min} a ${max} dias úteis`;
  return `${days}, após ${after}`;
}

function objectKind(entry) {
  if (entry.task_door === "GROW") return "mercado";
  if (["QUALIFY", "PROPOSE"].includes(entry.task_door)) return "edital";
  if (["START", "PROTECT", "CLOSE"].includes(entry.task_door)) return "contrato";
  return "equipe";
}

function urgencyKind(entry) {
  const safe = entry.sla.safe_deadline_business_days;
  const max = entry.sla.business_days_max;
  if (Number.isInteger(safe) && safe <= 5) return "prazo-processual";
  if (Number.isInteger(max) && max <= 3) return "ate-3";
  if (Number.isInteger(max) && max <= 7) return "ate-7";
  return "planejada";
}

function decisionBusinessDays(entry) {
  const candidates = [entry.sla.business_days_max, entry.sla.safe_deadline_business_days]
    .filter(Number.isInteger);
  return candidates.length ? Math.max(...candidates) : "";
}

function priceBand(entry) {
  const amount = Array.isArray(entry.price.tiers)
    ? Math.min(...entry.price.tiers.map((tier) => tier.amount_cents))
    : entry.price.amount_cents;
  if (amount <= 200000) return "ate-2000";
  if (amount <= 500000) return "2001-5000";
  if (amount <= 1000000) return "5001-10000";
  return "acima-10000";
}

const STATE = {
  PUBLISHED: {
    label: "Publicada",
    explanation: "Exemplo completo publicado. A contratação continua sujeita à confirmação de escopo e prazo.",
  },
  VALIDATE: {
    label: "Em validação",
    explanation: "Preço-piloto. Não há compra imediata; escopo, capacidade e aderência passam por revisão humana.",
  },
  BLOCKED: {
    label: "Indisponível",
    explanation: "A cobertura e a proveniência ainda não cumprem o gate. A CONFENGE não aceita esta contratação agora.",
  },
};

const VITRINE_HEADING_IDS = {
  "01": "first-deliverable-title",
  "02": "deliverable-base-quantitativa-title",
  "03": "deliverable-apresentacao-executiva-title",
  "04": "deliverable-mapa-compradores-title",
  "05": "deliverable-contratos-vincendos-title",
  "06": "deliverable-mapeamento-concorrentes-title",
  "07": "deliverable-painel-precos-title",
  "08": "deliverable-relatorio-executivo-title",
};
const VITRINE_CTA_SLUGS = {
  "01": "priorizacao",
  "02": "base-quantitativa",
  "03": "apresentacao-executiva",
  "04": "mapa-compradores",
  "05": "contratos-vincendos",
  "06": "mapeamento-concorrentes",
  "07": "painel-precos",
  "08": "relatorio-executivo",
};

export function publishedVitrine(registry) {
  const items = (registry.deliverables || []).filter((entry) => entry.public_state === "PUBLISHED");
  if (items.length !== 8) throw new Error(`PUBLIC_VITRINE_COUNT: expected 8 published entregas, got ${items.length}`);
  const numbers = items.map((entry) => entry.catalog_number);
  if (JSON.stringify(numbers) !== JSON.stringify(["01", "02", "03", "04", "05", "06", "07", "08"])) {
    throw new Error(`PUBLIC_VITRINE_ORDER: expected CFG-D01..CFG-D08, got ${numbers.join(",")}`);
  }
  return items;
}

function fitLabel(entry) {
  if (entry.offer_container === "expansion_package") {
    return "Unidade do Diagnóstico. Crédito em até 60 dias, sem acúmulo.";
  }
  return "À parte, fora do pacote. Sem crédito.";
}

function searchAliases(entry) {
  return escapeHtml((entry.name_aliases || []).filter((name) => name !== entry.public_name_pt_br).join(" | "));
}

function comparisonRow(entry) {
  const slug = VITRINE_CTA_SLUGS[entry.catalog_number];
  const creditCell = entry.offer_container === "expansion_package"
    ? "Sim, em até 60 dias"
    : "Não. Entrega à parte, fora do pacote";
  const creditClass = entry.offer_container === "expansion_package" ? "" : ' class="compare-credit-off"';
  return `<tr>
<th scope="row"><span class="compare-index">${entry.catalog_number}</span><a data-asset-id="entregas-exemplos-hub" data-cta-id="deliverables-table-${slug}" data-cta-position="ladder_table" data-event-name="cta_click" href="${escapeHtml(entry.route)}">${escapeHtml(entry.public_name_pt_br)}</a></th>
<td data-label="Situação">${escapeHtml(publicText(entry.trigger))}</td>
<td data-label="Decisão">${escapeHtml(entry.decision_question)}</td>
<td data-label="Saída">${escapeHtml(publicText(entry.included_outputs[0]))}</td>
<td data-label="Prazo">${escapeHtml(publicText(slaLabel(entry)))}</td>
<td data-label="Preço"><strong>${escapeHtml(priceLabel(entry))}</strong></td>
<td data-label="Fit"${creditClass}>${creditCell}</td>
</tr>`;
}

function vitrineCard(entry) {
  const headingId = VITRINE_HEADING_IDS[entry.catalog_number];
  const slug = VITRINE_CTA_SLUGS[entry.catalog_number];
  const exampleCtaId = entry.catalog_number === "01" ? "deliverables-open-report" : `deliverables-open-${slug}`;
  const scopeCtaId = entry.catalog_number === "01" ? "deliverables-understand-scope" : `deliverables-scope-${slug}`;
  const examplePosition = entry.catalog_number === "01" ? "example_01_open" : `example_${entry.catalog_number}_open`;
  const scopePosition = entry.catalog_number === "01" ? "example_01_scope" : `example_${entry.catalog_number}_scope`;
  const bundle = entry.offer_container === "expansion_package"
    ? `<p class="vitrine-item__credit">O valor é abatido do <a data-asset-id="entregas-exemplos-hub" data-cta-id="deliverables-bundle-from-${slug}" data-cta-position="example_${entry.catalog_number}_price" data-event-name="cta_click" href="/diagnostico-b2g-expansao/">Diagnóstico de Expansão no Mercado Público</a> se ele for contratado em até 60 dias, sem acúmulo com outros créditos.</p>`
    : `<p class="vitrine-item__credit">Por que abre a biblioteca: é o degrau mais barato e o único sem o crédito de 60 dias. Entrega à parte, fora do Diagnóstico de Expansão no Mercado Público. Relatório adaptado: R$ 599 por unidade. A CONFENGE busca os editais abertos no raio informado. A quantidade depende das licitações publicadas, e a profundidade é a máxima permitida pelas informações da empresa. Bases da análise: editais abertos localizados pela CONFENGE e realidade da construtora. Compare com o <a data-asset-id="entregas-exemplos-hub" data-cta-id="deliverables-bundle-from-${slug}" data-cta-position="example_${entry.catalog_number}_price" data-event-name="cta_click" href="/diagnostico-b2g-expansao/">Diagnóstico de Expansão no Mercado Público</a>.</p>`;
  const open = entry.catalog_number === "01"
    ? `<section id="primeiro-exemplo" data-section-archetype="ladder_entry" aria-labelledby="${headingId}"><article class="vitrine-item vitrine-item--anchor" data-deliverable-id="${entry.deliverable_id}" data-public-state="${entry.public_state}" data-search-aliases="${searchAliases(entry)}" id="entrega-${entry.catalog_number}">`
    : `<article class="vitrine-item" data-deliverable-id="${entry.deliverable_id}" data-public-state="${entry.public_state}" data-search-aliases="${searchAliases(entry)}" id="entrega-${entry.catalog_number}">`;
  const close = entry.catalog_number === "01" ? "</article></section>" : "</article>";
  return `${open}
<header class="vitrine-item__head"><span>${entry.catalog_number}</span><h2 id="${headingId}">${escapeHtml(entry.public_name_pt_br)}</h2><strong>${escapeHtml(priceLabel(entry))}</strong></header>
<p class="vitrine-item__value">${escapeHtml(entry.value_line_pt_br)}</p>
<dl class="vitrine-item__facts">
<div><dt>Situação</dt><dd>${escapeHtml(publicText(entry.trigger))}</dd></div>
<div><dt>Decisão</dt><dd>${escapeHtml(entry.decision_question)}</dd></div>
<div><dt>Saída</dt><dd>${escapeHtml(publicText(entry.included_outputs[0]))}</dd></div>
<div><dt>Prazo</dt><dd>${escapeHtml(publicText(slaLabel(entry)))}</dd></div>
<div><dt>Preço</dt><dd>${escapeHtml(priceLabel(entry))}</dd></div>
<div><dt>Fit</dt><dd>${escapeHtml(fitLabel(entry))}</dd></div>
</dl>
${bundle}
<div class="vitrine-item__actions">
<a class="button button-secondary" data-asset-id="entregas-exemplos-hub" data-cta-id="${exampleCtaId}" data-cta-position="${examplePosition}" data-event-name="cta_click" href="${escapeHtml(entry.route)}">Ver o exemplo de ${escapeHtml(entry.public_name_pt_br)} <svg class="icon"><use href="#i-arrow"></use></svg></a>
<a class="text-link" data-asset-id="entregas-exemplos-hub" data-cta-id="${scopeCtaId}" data-cta-position="${scopePosition}" data-event-name="cta_click" href="#captura-entregas">Pedir análise de ${escapeHtml(entry.public_name_pt_br)}</a>
</div>
${close}`;
}

function renderComparison(published) {
  return `<section class="deliverable-compare" id="comparar" data-section-archetype="compare_ladder" aria-labelledby="compare-title">
<div class="container">
<div class="compare-head">
<div>
<p class="eyebrow">As oito, lado a lado</p>
<h2 id="compare-title">Escolha pela pergunta que você precisa responder.</h2>
</div>
<p class="compare-lead">Sete das oito são unidades avulsas do <a data-asset-id="entregas-exemplos-hub" data-cta-id="deliverables-bundle-from-ladder-table" data-cta-position="ladder_table_summary" data-event-name="cta_click" href="/diagnostico-b2g-expansao/">Diagnóstico de Expansão no Mercado Público</a> e devolvem o valor pago se o pacote for contratado em até 60 dias. A primeira é contratada à parte e por isso não entra nessa regra.</p>
</div>
<div class="compare-scroll" role="region" aria-label="Tabela comparativa das oito entregas" tabindex="0">
<table class="compare-table">
<caption class="compare-caption">Entregas publicadas, com situação, decisão, saída, prazo, preço e encaixe no pacote de R$ 8.000.</caption>
<thead><tr><th scope="col">Entrega</th><th scope="col">Situação</th><th scope="col">Decisão</th><th scope="col">Saída</th><th scope="col">Prazo</th><th scope="col">Preço</th><th scope="col">Fit</th></tr></thead>
<tbody>
${published.map(comparisonRow).join("\n")}
</tbody>
</table>
</div>
<dl class="compare-ladder-figures">
<div><dt>Faixa por unidade</dt><dd>R$ 599 a R$ 3.750</dd></div>
<div><dt>As sete unidades, uma a uma</dt><dd>R$ 12.280</dd></div>
<div><dt>Diagnóstico de Expansão no Mercado Público</dt><dd>R$ 8.000</dd></div>
</dl>
<p class="compare-note">A diferença entre R$ 12.280 e R$ 8.000 é R$ 4.280. Todos os exemplos usam a mesma base sintética. Empresa, órgãos, concorrentes, valores e decisões são demonstrativos e não representam cliente real.</p>
</div>
</section>`;
}

function renderFraming(published) {
  const items = published.map((entry) =>
    `<li><a href="#entrega-${entry.catalog_number}">${escapeHtml(entry.decision_question)}</a></li>`
  ).join("");
  return `<section class="deliverable-frame" id="enquadrar" data-section-archetype="reading_method" aria-labelledby="catalog-framing-title">
<div class="container">
<p class="eyebrow">Enquadramento</p>
<h2 id="catalog-framing-title">Qual pergunta está na mesa?</h2>
<p>As oito ofertas publicadas cabem em uma tela. Escolha a pergunta; o próximo passo é o exemplo integral ou o pedido de análise desta unidade.</p>
<ol class="deliverable-frame__list">${items}</ol>
<a class="button button-secondary" data-asset-id="entregas-exemplos-hub" data-cta-id="deliverables-frame-capture" data-cta-position="framing" data-event-name="cta_click" href="#captura-entregas">Se a pergunta não está na lista, registrar o caso</a>
</div>
</section>`;
}

export function renderClientData(registry, executionContract) {
  const byTask = new Map();
  for (const entry of registry.deliverables) {
    if (!byTask.has(entry.task_door)) byTask.set(entry.task_door, []);
    byTask.get(entry.task_door).push(entry);
  }
  const items = registry.deliverables.map((entry) => {
    const taskEntries = byTask.get(entry.task_door) || [];
    const ownIndex = taskEntries.findIndex((candidate) => candidate.deliverable_id === entry.deliverable_id);
    const neighbor = taskEntries.length > 1
      ? taskEntries[ownIndex === taskEntries.length - 1 ? ownIndex - 1 : ownIndex + 1]
      : null;
    return [
      entry.deliverable_id,
      publicText(entry.public_name_pt_br),
      publicText(entry.trigger),
      publicText(entry.decision_question),
      publicText(entry.scope.unit),
      publicText(entry.required_inputs[0]),
      inputKinds(entry),
      entry.required_inputs.length,
      decisionBusinessDays(entry),
      publicText(entry.included_outputs[0]),
      publicText(slaLabel(entry)),
      priceLabel(entry),
      publicText(entry.exclusions[0]),
      stepUpLabel(entry),
      entry.public_state,
      contractBody(entry, neighbor, executionContract),
    ];
  });
  const payload = { schema: CLIENT_DATA_SCHEMA, fields: CLIENT_DATA_FIELDS, items };
  const rendered = `window.CONFENGE_CATALOG_DATA=${JSON.stringify(payload)};\n`;
  if (/<(?:script|iframe|object|embed)\b|\son[a-z]+\s*=|javascript:/i.test(rendered)) {
    throw new Error("active markup is forbidden in public catalog data");
  }
  for (const forbidden of ["NO_MATCH_CONFIRMED", "empresa limpa", "empresa idônea", "empresa idonea", "nada consta"]) {
    if (rendered.toLocaleLowerCase("pt-BR").includes(forbidden.toLocaleLowerCase("pt-BR"))) {
      throw new Error(`forbidden public catalog conclusion: ${forbidden}`);
    }
  }
  return rendered;
}

export function renderCatalog(registry) {
  const published = publishedVitrine(registry);
  return `${CATALOG_START}
${renderFraming(published)}
${renderComparison(published)}
<section class="deliverables-vitrine" id="indice-integral" data-section-archetype="catalog_index" aria-labelledby="catalog-title">
<div class="container">
<header class="deliverables-vitrine__intro"><p class="eyebrow">Oito ofertas contratáveis</p><h2 id="catalog-title">Cada entrega responde uma pergunta, com preço e prazo visíveis.</h2><p>A vitrine pública mostra só as oito unidades publicadas, de R$ 599 a R$ 3.750. O restante do rol interno permanece registro, não produto.</p></header>
<div class="vitrine-items">${published.map(vitrineCard).join("\n")}</div>
</div>
</section>
${CATALOG_END}`;
}

export function renderSelect(registry) {
  const options = publishedVitrine(registry).map((entry) =>
    `<option value="${entry.deliverable_id}">${entry.catalog_number} · ${escapeHtml(entry.public_name_pt_br)}</option>`
  ).join("\n");
  return `${SELECT_START}
<label>Entrega relacionada <select id="deliverable-id" name="deliverable_id"><option value="">Ainda não sei qual entrega escolher</option>${options}</select></label>
${SELECT_END}`;
}

function replaceBlock(html, start, end, rendered) {
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from < 0 || to < from) throw new Error(`generated markers missing: ${start}`);
  return `${html.slice(0, from)}${rendered}${html.slice(to + end.length)}`;
}

export function renderPage(html, registry) {
  let next = replaceBlock(html, CATALOG_START, CATALOG_END, renderCatalog(registry));
  next = replaceBlock(next, SELECT_START, SELECT_END, renderSelect(registry));
  return next;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const taskDoors = JSON.parse(fs.readFileSync(doorsPath, "utf8"));
  const naming = JSON.parse(fs.readFileSync(namingPath, "utf8"));
  const executionContract = JSON.parse(fs.readFileSync(executionPath, "utf8"));
  const valueById = new Map(naming.names.map((entry) => [entry.deliverable_id, entry.value_line_pt_br]));
  const renderedRegistry = {
    ...registry,
    deliverables: registry.deliverables.map((entry) => ({
      ...entry,
      value_line_pt_br: valueById.get(entry.deliverable_id),
    })),
  };
  const current = fs.readFileSync(pagePath, "utf8");
  const rendered = renderPage(current, renderedRegistry);
  const clientData = renderClientData(renderedRegistry, executionContract);
  const currentClientData = fs.existsSync(clientDataPath)
    ? fs.readFileSync(clientDataPath, "utf8")
    : "";
  if (process.argv.includes("--check")) {
    const drift = [];
    if (rendered !== current) drift.push(path.relative(root, pagePath));
    if (clientData !== currentClientData) drift.push(path.relative(root, clientDataPath));
    if (drift.length) {
      console.error(`PUBLIC_CATALOG_DRIFT: ${drift.join(", ")}; run node scripts/commercial/render_public_catalog.mjs --write`);
      process.exit(1);
    }
    console.log(`PUBLIC_CATALOG_OK internal=${registry.deliverables.length} public=${publishedVitrine(renderedRegistry).length}`);
  } else if (process.argv.includes("--write")) {
    fs.writeFileSync(pagePath, rendered);
    fs.writeFileSync(clientDataPath, clientData);
    console.log(`PUBLIC_CATALOG_WRITTEN internal=${registry.deliverables.length} public=${publishedVitrine(renderedRegistry).length}`);
  } else {
    console.error("usage: render_public_catalog.mjs --check|--write");
    process.exit(2);
  }
}
