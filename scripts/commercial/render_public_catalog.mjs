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
const executionPath = path.join(root, "data/commercial/page-contract-execucao.v1.json");
const eightContractPath = path.join(root, "data/commercial/page-contract-eight.v1.json");
const pagePath = path.join(root, "entregas/index.html");
const clientDataPath = path.join(root, "entregas/catalog-data.js");

const CATALOG_START = "<!-- GENERATED:PUBLIC-CATALOG:START -->";
const CATALOG_END = "<!-- GENERATED:PUBLIC-CATALOG:END -->";
const SELECT_START = "<!-- GENERATED:DELIVERABLE-SELECT:START -->";
const SELECT_END = "<!-- GENERATED:DELIVERABLE-SELECT:END -->";
const LEGACY_HUB_START = "<!-- GENERATED:EIGHT-OFFER-HUB:START -->";
const LEGACY_HUB_END = "<!-- GENERATED:EIGHT-OFFER-HUB:END -->";
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
    .replace(/\binputs válidos\b/gi, "informações necessárias confirmadas")
    .replace(/\binputs\b/gi, "informações necessárias")
    .replace(/\bchecks\b/gi, "conferências")
    .replace(/\bgates\b/gi, "condições")
    .replace(/\bgate\b/gi, "condição")
    .replace(/\bartefato\b/gi, "documento")
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
    copyClause("concrete_result_and_artifact_example", "Resultado e entrega", publicList(entry.included_outputs)),
    copyClause("scope_in", "O que entra", `<p>${escapeHtml(publicText(entry.scope.unit))}.</p>${publicList(entry.scope.limits)}`),
    copyClause("client_inputs_and_sla_start", "Informações necessárias e início do prazo", `${publicList(entry.required_inputs)}<p>O prazo começa após ${escapeHtml(publicText(entry.sla.starts_after))}.</p>`),
    copyClause("method_and_provenance", "Método e proveniência", `<p>Em ${escapeHtml(entry.public_name_pt_br)}, a decisão “${escapeHtml(entry.decision_question)}” usa fonte, data, método e cobertura, com afirmações marcadas como ${escapeHtml(grades.join(", "))}.</p>`),
    copyClause("price_and_sla_same_block", "Preço e prazo", `<p>${escapeHtml(entry.public_name_pt_br)}: <strong>${escapeHtml(priceLabel(entry))}</strong> · ${escapeHtml(publicText(slaLabel(entry)))}</p>`),
    copyClause("exclusions_and_third_party", "Não inclui", publicList(entry.exclusions, "Não inclui: ")),
    copyClause("fit_and_misfit", "Serve e não serve", `<p>Serve quando ${escapeHtml(publicText(lowerFirst(entry.trigger)))}</p><p>Não serve para ${escapeHtml(publicText(entry.exclusions[0]))}.</p>`),
    copyClause("proof_matching_real_state", "Prova disponível", `<p>${escapeHtml(proof)}</p>`),
    copyClause("specific_objections", "Informação que precisa ser resolvida", `<p>Em ${escapeHtml(entry.public_name_pt_br)}, sem ${escapeHtml(publicText(entry.required_inputs[0]))}, o prazo não começa e a decisão “${escapeHtml(entry.decision_question)}” permanece em revisão.</p>`),
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

const VITRINE_DECISION_NAV = {
  "01": "Onde disputar?",
  "02": "Fontes dos números?",
  "03": "O que decidir?",
  "04": "Órgãos prioritários?",
  "05": "Contratos a vencer?",
  "06": "Mapa dos concorrentes?",
  "07": "Escala dos contratos?",
  "08": "Onde alocar?",
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

function searchAliases(entry) {
  return escapeHtml((entry.name_aliases || []).filter((name) => name !== entry.public_name_pt_br).join(" | "));
}

function renderCompactList(values) {
  return `<ul>${values.map((value) => `<li>${escapeHtml(publicText(value))}</li>`).join("")}</ul>`;
}

function renderInlineList(values) {
  return escapeHtml(values.map((value) => publicText(value)).join("; "));
}

function eightContractCopy(contract, value) {
  return publicText(contract.public_copy_overrides?.[value] || value);
}

function deadlineStart(contractItem) {
  if (contractItem.sla.counts_from === "UNKNOWN") {
    return "Definida e confirmada por escrito na proposta antes da cobrança.";
  }
  return `${publicText(contractItem.sla.counts_from)}. A CONFENGE confirma por escrito a condição de início antes da cobrança.`;
}

function vitrineCard(entry, contractItem) {
  if (!contractItem || contractItem.deliverable_id !== entry.deliverable_id) {
    throw new Error(`EIGHT_CONTRACT_MISSING: ${entry.deliverable_id}`);
  }
  const headingId = VITRINE_HEADING_IDS[entry.catalog_number];
  const slug = VITRINE_CTA_SLUGS[entry.catalog_number];
  const exampleCtaId = entry.catalog_number === "01" ? "deliverables-open-report" : `deliverables-open-${slug}`;
  const scopeCtaId = entry.catalog_number === "01" ? "deliverables-understand-scope" : `deliverables-scope-${slug}`;
  const examplePosition = entry.catalog_number === "01" ? "example_01_open" : `example_${entry.catalog_number}_open`;
  const scopePosition = entry.catalog_number === "01" ? "example_01_scope" : `example_${entry.catalog_number}_scope`;
  const value = contractItem.value_first;
  if (!value) throw new Error(`EIGHT_VALUE_FIRST_MISSING: ${entry.deliverable_id}`);
  const bundle = entry.offer_container === "expansion_package"
    ? `<p class="vitrine-item__credit"><strong>Pacote e crédito</strong> O valor é abatido do <a data-asset-id="entregas-exemplos-hub" data-cta-id="deliverables-bundle-from-${slug}" data-cta-position="example_${entry.catalog_number}_price" data-event-name="cta_click" href="/diagnostico-b2g-expansao/">Diagnóstico de Expansão no Mercado Público</a> se ele for contratado em até 60 dias; créditos não se acumulam.</p>`
    : `<p class="vitrine-item__credit"><strong>Pacote e crédito</strong> Relatório avulso, à parte e fora do Diagnóstico; é o único sem o crédito de 60 dias. Adaptado: R$ 599 por unidade. A CONFENGE busca os editais abertos no raio informado. A quantidade depende das licitações publicadas; a profundidade é a máxima permitida pelas informações da empresa. Bases: editais abertos localizados pela CONFENGE e realidade da construtora. Compare com o <a data-asset-id="entregas-exemplos-hub" data-cta-id="deliverables-bundle-from-${slug}" data-cta-position="example_${entry.catalog_number}_price" data-event-name="cta_click" href="/diagnostico-b2g-expansao/">Diagnóstico de Expansão no Mercado Público</a>.</p>`;
  const anchorClass = entry.catalog_number === "01" ? " vitrine-item--anchor" : "";
  const open = `<article class="vitrine-item${anchorClass}" data-primary-offer="true" data-deliverable-id="${entry.deliverable_id}" data-public-state="${entry.public_state}" data-search-aliases="${searchAliases(entry)}" id="entrega-${entry.catalog_number}">`;
  const close = "</article>";
  return `${open}
<header class="vitrine-item__head"><div class="vitrine-item__identity"><span>${entry.catalog_number}</span><span class="offer-state">Oferta publicada</span></div><h2 id="${headingId}">${escapeHtml(entry.public_name_pt_br)}</h2><p class="vitrine-item__price"><span>Preço</span><strong>${escapeHtml(priceLabel(entry))}</strong></p></header>
<dl class="vitrine-item__facts">
<div data-copy-role="value_outcome"><dt>Decisão</dt><dd>${escapeHtml(value.actual_contract_value)}</dd></div>
<div data-copy-role="value_created"><dt>Trabalho realizado</dt><dd>${escapeHtml(publicText(value.work_removed))}</dd></div>
<div data-copy-role="artifact"><dt>Como a entrega será usada</dt><dd>${escapeHtml(publicText(value.artifact_use))}</dd></div>
<div data-copy-role="positive_proof"><dt>O que você pode inspecionar</dt><dd>${escapeHtml(publicText(value.proof_statement))}</dd></div>
<div><dt>Situação</dt><dd>${escapeHtml(publicText(entry.trigger))}</dd></div>
<div><dt>Informações necessárias</dt><dd>${renderInlineList(entry.required_inputs)}</dd></div>
<div><dt>Trabalho incluído</dt><dd>${escapeHtml(publicText(contractItem.objeto_incluido))}</dd></div>
<div><dt>Saída</dt><dd>${escapeHtml(publicText(contractItem.saida_minima))}</dd></div>
<div><dt>Por que este preço</dt><dd>${escapeHtml(publicText(value.price_anchor))}</dd></div>
<div><dt>Prazo</dt><dd>${escapeHtml(publicText(contractItem.sla.text))}</dd></div>
<div><dt>Quando a contagem começa</dt><dd>${escapeHtml(deadlineStart(contractItem))}</dd></div>
</dl>
${bundle}
<div class="vitrine-item__actions">
<a aria-label="Ver o demonstrativo sintético de ${escapeHtml(entry.public_name_pt_br)}: ${escapeHtml(value.cta_inspect)}" class="button button-secondary" data-asset-id="entregas-exemplos-hub" data-cta-id="${exampleCtaId}" data-cta-position="${examplePosition}" data-event-name="cta_click" href="${escapeHtml(entry.route)}">${escapeHtml(value.cta_inspect)} <svg class="icon"><use href="#i-arrow"></use></svg></a>
<a aria-label="Pedir análise de ${escapeHtml(entry.public_name_pt_br)}: ${escapeHtml(value.cta_configure)}" class="text-link" data-asset-id="entregas-exemplos-hub" data-cta-id="${scopeCtaId}" data-cta-position="${scopePosition}" data-event-name="cta_click" href="#captura-entregas">${escapeHtml(value.cta_configure)}</a>
</div>
${close}`;
}

function renderOfferLadder(contract) {
  const ladder = contract.value_ladder;
  const pkg = contract.package;
  if (!ladder) throw new Error("PUBLIC_VALUE_LADDER_MISSING");
  return `<section class="offer-value-ladder" data-offer-ladder="unit-diagnosis-recurring" aria-labelledby="offer-value-ladder-title">
<header><p class="eyebrow">Próxima camada pelo tipo de decisão</p><h3 id="offer-value-ladder-title">Unidade, Diagnóstico ou direção recorrente?</h3><p>A escolha começa pela situação e pelo recorte da decisão, não apenas pelo preço.</p></header>
<ol><li data-ladder-step="unit"><strong>Uma unidade basta</strong><span>Quando há uma pergunta delimitada e o recorte permanece nos eixos declarados na oferta.</span></li>
<li data-ladder-step="diagnosis"><strong>Diagnóstico integrado</strong><span>Quando ${escapeHtml(ladder.diagnosis_trigger)}, o <a data-asset-id="entregas-exemplos-hub" data-cta-id="deliverables-bundle-from-offer-summary" data-cta-position="offer_summary" data-event-name="cta_click" href="${escapeHtml(ladder.diagnosis_route)}">${escapeHtml(pkg.public_name_pt_br)}</a> reúne ${escapeHtml(ladder.diagnosis_scope)} por ${escapeHtml(pkg.package_price_display)}.</span></li>
<li data-ladder-step="recurring"><strong>Direção recorrente</strong><span>Quando ${escapeHtml(ladder.recurring_direction_trigger)}, a <a href="${escapeHtml(ladder.recurring_direction_route)}">${escapeHtml(ladder.recurring_direction_name_pt_br)}</a> assume ${escapeHtml(ladder.recurring_direction_scope)}.</span></li></ol>
<dl class="compare-ladder-figures">
<div><dt>Faixa por unidade</dt><dd>R$ 599 a R$ 3.750</dd></div>
<div><dt>As sete unidades, uma a uma</dt><dd>${escapeHtml(pkg.units_sum_display)}</dd></div>
<div><dt>${escapeHtml(pkg.public_name_pt_br)}</dt><dd>${escapeHtml(pkg.package_price_display)}</dd></div>
</dl>
<p class="compare-note">Sete ofertas geram um único crédito, sem acúmulo, se o ${escapeHtml(pkg.public_name_pt_br)} for contratado em até ${pkg.credit_window_days} dias. A unidade 01 fica fora do Diagnóstico e não gera crédito de ${pkg.credit_window_days} dias. A diferença entre ${escapeHtml(pkg.units_sum_display)} e ${escapeHtml(pkg.package_price_display)} é R$ 4.280. Os exemplos usam dados sintéticos; não representam cliente real.</p>
</section>`;
}

function renderDecisionNav(published) {
  const decisions = published.map((entry) =>
    `<li><a aria-label="${escapeHtml(entry.decision_question)}" href="#entrega-${entry.catalog_number}"><span>${entry.catalog_number}</span>${escapeHtml(VITRINE_DECISION_NAV[entry.catalog_number])}</a></li>`,
  ).join("");
  return `<div class="deliverables-example-nav">
<div class="container">
<nav class="offer-decision-nav" aria-label="Escolher análise para obra pública pela decisão"><p id="examples-nav-title">Ofertas de análises para obras públicas</p><ol>${decisions}</ol></nav>
</div>
</div>`;
}

function renderOfferShowcase(published, eightContract) {
  const contractById = new Map(
    eightContract.deliverables.map((entry) => [entry.deliverable_id, entry]),
  );
  const commonBoundaries = eightContract.common_boundaries
    .map((value) => eightContractCopy(eightContract, value));
  const commonInputs = eightContract.common_inputs.map((value) => publicText(value));
  return `<section class="deliverables-vitrine" id="enquadrar" data-section-archetype="catalog_index" aria-labelledby="catalog-title">
<div class="container">
<header class="deliverables-vitrine__intro"><p class="eyebrow">Ofertas com preço publicado</p><h2 id="catalog-title">Oito análises para licitações e mercado de obras públicas.</h2><p>Cada oferta reúne a situação atendida, o trabalho incluído, as informações necessárias, o conteúdo entregue, o preço, o prazo e a próxima ação. Os demais serviços de engenharia seguem por proposta porque variam com disciplina, fase, documentos e responsabilidade.</p></header>
<div class="vitrine-items">${published.map((entry) => vitrineCard(entry, contractById.get(entry.deliverable_id))).join("\n")}</div>
${renderOfferLadder(eightContract)}
<aside class="published-offers__common" aria-labelledby="published-common-title"><div><p class="eyebrow">Condições da análise</p><h3 id="published-common-title">O que vale para as oito ofertas</h3><p><strong>Informações comuns:</strong> ${renderInlineList(commonInputs)}. Cada oferta acrescenta o que precisa para começar.</p></div><div><h4>Preço, condições e exemplos</h4><p>As oito ofertas publicadas vão de R$ 599 a R$ 3.750. Os preços e condições pertencem somente às ofertas que os exibem; o aviso de dados sintéticos pertence somente aos exemplos demonstrativos.</p><h4>Limites comuns</h4><p>${renderInlineList(commonBoundaries)}. Cobertura, data de corte, método e o rótulo NÃO INFORMADO acompanham o resultado.</p></div></aside>
</div>
</section>`;
}

// 2026-09-09. A vitrine publicava o inventário interno de 54 capacidades e seus
// estados de maturidade. Isso descrevia a administração do catálogo, não o que
// um comprador recebe. O registro continua íntegro como autoridade B2G, mas a
// página pública mostra as famílias de entrega que a empresa efetivamente
// explica e o caminho correspondente. Nenhuma capacidade é promovida por esta
// projeção e os oito preços autorizados continuam vindo do contrato tipado.
function datePtBr(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  if (!year || !month || !day) throw new Error(`PUBLIC_CATALOG_DATE_INVALID: ${iso}`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function publicCatalogDates(registry) {
  const dates = registry.public_catalog || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dates.date_published || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dates.date_modified || "")) {
    throw new Error("PUBLIC_CATALOG_DATES_MISSING");
  }
  return dates;
}

function renderServiceDeliveryOverview(registry) {
  const dates = publicCatalogDates(registry);
  return `<section class="capability-roll" id="servicos-e-entregas" data-section-archetype="reading_method" aria-labelledby="service-deliveries-title">
<div class="container">
<header class="capability-roll__intro"><p class="eyebrow">Serviços de engenharia</p><h2 id="service-deliveries-title">Projetos para orientar a execução, orçamentos para contratar com critério e análises para decidir com respaldo.</h2><p>Os oito itens com preço abaixo pertencem à especialidade de inteligência para obras públicas. A atuação da CONFENGE também inclui projetos e serviços de engenharia para obras públicas e privadas, definidos por proposta depois da leitura da necessidade.</p></header>
<div class="capability-groups">
<article class="capability-group"><div class="capability-group__body"><h3>Projetos, revisão e compatibilização</h3><p>Cálculos, plantas, detalhes, especificações e memória de cálculo; relatório de revisão com pontos localizados; ou registro das interferências e soluções entre estruturas e instalações hidrossanitárias, elétricas, de incêndio, climatização e telecomunicações.</p><div class="capability-group__schema"><details class="capability-group__schema-details"><summary class="capability-group__schema-title"><strong>Esquema ilustrativo da entrega.</strong> Como o conteúdo do projeto se organiza</summary><p class="capability-group__schema-label">A estrutura do que você recebe e para que serve cada peça. Modelo de organização do conteúdo, sem obra executada e sem dados de cliente.</p><ol class="capability-group__schema-list"><li><strong>Plantas e cortes</strong> onde cada elemento fica e como a obra se lê no papel.</li><li><strong>Detalhes</strong> as ligações e os pontos que a planta não consegue mostrar na mesma escala.</li><li><strong>Especificações</strong> o que cada material e serviço precisa atender para ser aceito.</li><li><strong>Memória de cálculo</strong> os critérios e as verificações que sustentam o que foi dimensionado.</li><li><strong>Registro de compatibilização</strong> as interferências encontradas entre disciplinas e a solução acordada para cada uma.</li></ol><p class="capability-group__schema-note">Cada peça responde a uma pergunta diferente na obra: a planta orienta a execução, o detalhe resolve a ligação, a especificação define o aceite e a memória sustenta a decisão técnica.</p></details></div><p><a href="/servicos/#servico-projeto">Entender o trabalho de projeto</a></p></div></article>
<article class="capability-group"><div class="capability-group__body"><h3>Quantitativos e orçamento</h3><p>Planilha de serviços e quantidades, memória dos critérios, composições abertas, referências e data-base para comparar propostas, preparar contratação ou revisar a estimativa de obra pública ou privada.</p><div class="capability-group__schema"><details class="capability-group__schema-details"><summary class="capability-group__schema-title"><strong>Esquema ilustrativo da entrega.</strong> Como o orçamento se forma</summary><p class="capability-group__schema-label">A estrutura do que você recebe e para que serve cada peça. Modelo de organização do conteúdo, sem obra executada e sem dados de cliente.</p><ol class="capability-group__schema-list"><li><strong>Levantamento de quantidades</strong> o que será executado e quanto, item a item, com o critério de medição declarado.</li><li><strong>Composições de custo</strong> mão de obra, material e equipamento de cada serviço, abertos para conferência.</li><li><strong>Referências e data-base</strong> a fonte de preço adotada e a data a que ela se refere.</li><li><strong>Planilha orçamentária</strong> o total por item e por etapa, na estrutura em que a proposta será comparada.</li><li><strong>Memória dos critérios</strong> o que foi incluído, o que foi excluído e por quê.</li></ol><p class="capability-group__schema-note">É essa cadeia que permite comparar propostas pelo mesmo critério, em vez de comparar apenas o preço final.</p></details></div><p><a href="/quantitativos-orcamento-obras/">Ver quantitativos e orçamento de obras</a></p></div></article>
<article class="capability-group"><div class="capability-group__body"><h3>Inspeção e diagnóstico de edificações</h3><p>Relatório de inspeção, laudo de estado ou documentação técnica do que existe, com localização das evidências e a condição encontrada. Serve para priorizar manutenção, orçar reparo, registrar a situação do imóvel ou decidir a intervenção.</p><div class="capability-group__schema"><details class="capability-group__schema-details"><summary class="capability-group__schema-title"><strong>Esquema ilustrativo da entrega.</strong> Como o relatório de inspeção se organiza</summary><p class="capability-group__schema-label">A estrutura do que você recebe e para que serve cada peça. Modelo de organização do conteúdo, sem obra executada e sem dados de cliente.</p><ol class="capability-group__schema-list"><li><strong>Objeto e acesso</strong> o que foi inspecionado, em que data e o que pôde ser visto no local.</li><li><strong>Manifestações registradas</strong> onde cada fissura, infiltração ou desgaste aparece, com localização.</li><li><strong>Origem provável</strong> a explicação técnica compatível com o que foi observado.</li><li><strong>Recomendação</strong> o que fazer, em que ordem, e o que precisa ser investigado antes.</li><li><strong>Limites do exame</strong> o que não foi acessível e o que dependeria de ensaio ou abertura.</li></ol><p class="capability-group__schema-note">A inspeção descreve a condição do que existe. Ela orienta manutenção e reparo, e não substitui a perícia quando a pergunta é de responsabilidade ou de prova.</p></details></div><p><a href="/inspecao-diagnostico-edificacoes/">Ver inspeção e diagnóstico de edificações</a></p></div></article>
<article class="capability-group"><div class="capability-group__body"><h3>Perícia, assistência técnica e avaliação</h3><p>Laudo pericial, parecer de assistente técnico ou laudo de avaliação com método declarado, evidências rastreáveis e conclusão delimitada. Serve para sustentar prova, apoiar a parte numa discussão técnica ou fundamentar o valor de um imóvel.</p><div class="capability-group__schema"><details class="capability-group__schema-details"><summary class="capability-group__schema-title"><strong>Esquema ilustrativo da entrega.</strong> Como o laudo, o parecer ou a avaliação se estrutura</summary><p class="capability-group__schema-label">A estrutura do que você recebe e para que serve cada peça. Modelo de organização do conteúdo, sem obra executada e sem dados de cliente.</p><ol class="capability-group__schema-list"><li><strong>Objeto e quesitos</strong> o que foi examinado e as perguntas que o documento precisa responder.</li><li><strong>Evidências</strong> o que foi observado, medido ou obtido em documento, com data e origem.</li><li><strong>Método</strong> como as evidências foram analisadas e qual norma ou referência foi aplicada.</li><li><strong>Conclusão</strong> a resposta aos quesitos, delimitada ao que as evidências sustentam.</li><li><strong>Limites</strong> o que o documento não conclui e o que exigiria investigação adicional.</li></ol><p class="capability-group__schema-note">Diferente da inspeção, aqui a pergunta é de prova ou de valor: o método declarado e a rastreabilidade das evidências são o que permite a terceiros conferir a conclusão. O papel técnico permanece separado do trabalho jurídico.</p></details></div><p><a href="/assistencia-tecnica-pericial-engenharia/">Ver assistência técnica pericial</a></p></div></article>
<article class="capability-group"><div class="capability-group__body"><h3>Segurança do trabalho</h3><p>Programa de gerenciamento de risco ocupacional, laudo das condições de exposição, parecer sobre adequação de frente de obra ou relatório de assistência técnica, dentro da atribuição profissional confirmada para o objeto.</p><div class="capability-group__schema"><details class="capability-group__schema-details"><summary class="capability-group__schema-title"><strong>Esquema ilustrativo da entrega.</strong> Como o documento de segurança do trabalho se organiza</summary><p class="capability-group__schema-label">A estrutura do que você recebe e para que serve cada peça. Modelo de organização do conteúdo, sem obra executada e sem dados de cliente.</p><ol class="capability-group__schema-list"><li><strong>Atividades e frentes</strong> o que é executado, por quem e em que condição.</li><li><strong>Agentes e exposição</strong> os riscos identificados e como a exposição foi caracterizada.</li><li><strong>Controles existentes</strong> o que já está implantado e o que a documentação interna registra.</li><li><strong>Medidas e prioridade</strong> o que corrigir, em que ordem, e o que depende de terceiros.</li><li><strong>Registros</strong> o que precisa ser mantido e revisado, e em que periodicidade.</li></ol><p class="capability-group__schema-note">O documento serve para corrigir controles, manter registros e subsidiar a assistência técnica. Atribuições de engenharia não se confundem com atos médicos.</p></details></div><p><a href="/seguranca-trabalho-apoio-tecnico/">Ver apoio técnico de SST</a></p></div></article>
</div>
<p class="catalog-publication-dates"><small>Publicação original: <time datetime="${dates.date_published}">${datePtBr(dates.date_published)}</time>. Revisão comercial: <time datetime="${dates.date_modified}">${datePtBr(dates.date_modified)}</time>.</small></p>
</div>
</section>`;
}

export function renderClientData(registry, executionContract) {
  const byTask = new Map();
  for (const entry of publishedVitrine(registry)) {
    if (!byTask.has(entry.task_door)) byTask.set(entry.task_door, []);
    byTask.get(entry.task_door).push(entry);
  }
  const items = publishedVitrine(registry).map((entry) => {
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

export function renderCatalog(registry, taskDoors, eightContract) {
  const published = publishedVitrine(registry);
  return `${CATALOG_START}
${renderDecisionNav(published)}
${renderServiceDeliveryOverview(registry)}
${renderOfferShowcase(published, eightContract)}
${CATALOG_END}`;
}

// A entrega escolhida pode declarar a jornada (data-journey na opcao). As
// familias "por proposta" nao sao B2G: sem isto o formulario mantinha o
// "operacao" oculto, confirmava em /obrigado-operacao e informava a jornada
// errada ao analytics, enquanto o servidor gravava outra. O script e local a
// esta pagina (hash de CSP calculado no build) para nao pesar o bundle da home.
export function renderSelect(registry) {
  const options = publishedVitrine(registry).map((entry) =>
    `<option value="${entry.deliverable_id}">${entry.catalog_number} · ${escapeHtml(entry.public_name_pt_br)}</option>`
  ).join("\n");
  return `${SELECT_START}
<label>Entrega relacionada <select id="deliverable-id" name="deliverable_id"><option value="">Ainda não sei qual entrega escolher</option>
<optgroup label="Serviços de engenharia, por proposta">
<option value="SERV-PROJETO" data-journey="projeto">Projeto, revisão ou compatibilização</option>
<option value="SERV-ORCAMENTO" data-journey="orcamento">Quantitativos e orçamento</option>
<option value="SERV-DIAGNOSTICO" data-journey="obra">Inspeção, diagnóstico ou documentação de obra e imóvel</option>
<option value="SERV-PERICIA" data-journey="pericia">Perícia, assistência técnica ou avaliação</option>
<option value="SERV-SST" data-journey="sst">Segurança do trabalho</option>
</optgroup>
<optgroup label="Análises para obras públicas, com preço publicado">${options}</optgroup></select></label>
<script>(function(){var s=document.querySelector('select[name="deliverable_id"]'),f=s&&s.form,h=f&&f.elements.jornada;if(!h)return;var b=h.value;s.addEventListener('change',function(){var o=s.selectedOptions[0],j=(o&&o.dataset.journey)||b,m=window.CONFENGE_JOURNEY_ACTIONS||{};h.value=j;f.setAttribute('data-success-destination',m[j]||'/obrigado');});})();</script>
${SELECT_END}`;
}

function replaceBlock(html, start, end, rendered) {
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from < 0 || to < from) throw new Error(`generated markers missing: ${start}`);
  return `${html.slice(0, from)}${rendered}${html.slice(to + end.length)}`;
}

function syncCatalogJsonLd(html, registry) {
  const dates = publicCatalogDates(registry);
  let found = false;
  const next = html.replace(
    /(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/i,
    (whole, open, body, close) => {
      const parsed = JSON.parse(body);
      const graph = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [];
      const page = graph.find((node) =>
        node?.["@type"] === "CollectionPage" &&
        node?.url === "https://confenge.com.br/entregas/"
      );
      if (!page) return whole;
      page.datePublished = dates.date_published;
      page.dateModified = dates.date_modified;
      found = true;
      return `${open}${JSON.stringify(parsed)}${close}`;
    },
  );
  if (!found) throw new Error("PUBLIC_CATALOG_JSONLD_MISSING");
  return next;
}

export function renderPage(html, registry, taskDoors, eightContract) {
  let next = replaceBlock(
    html,
    CATALOG_START,
    CATALOG_END,
    renderCatalog(registry, taskDoors, eightContract),
  );
  if (next.includes(LEGACY_HUB_START)) {
    next = replaceBlock(next, LEGACY_HUB_START, LEGACY_HUB_END, "");
  }
  next = replaceBlock(next, SELECT_START, SELECT_END, renderSelect(registry));
  return syncCatalogJsonLd(next, registry);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const taskDoors = JSON.parse(fs.readFileSync(doorsPath, "utf8"));
  const executionContract = JSON.parse(fs.readFileSync(executionPath, "utf8"));
  const eightContract = JSON.parse(fs.readFileSync(eightContractPath, "utf8"));
  const current = fs.readFileSync(pagePath, "utf8");
  const rendered = renderPage(current, registry, taskDoors, eightContract);
  const clientData = renderClientData(registry, executionContract);
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
    console.log(`PUBLIC_CATALOG_OK internal=${registry.deliverables.length} public=${publishedVitrine(registry).length}`);
  } else if (process.argv.includes("--write")) {
    fs.writeFileSync(pagePath, rendered);
    fs.writeFileSync(clientDataPath, clientData);
    console.log(`PUBLIC_CATALOG_WRITTEN internal=${registry.deliverables.length} public=${publishedVitrine(registry).length}`);
  } else {
    console.error("usage: render_public_catalog.mjs --check|--write");
    process.exit(2);
  }
}
