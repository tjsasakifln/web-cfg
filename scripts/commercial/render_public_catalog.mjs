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
const pagePath = path.join(root, "entregas/index.html");

const CATALOG_START = "<!-- GENERATED:PUBLIC-CATALOG:START -->";
const CATALOG_END = "<!-- GENERATED:PUBLIC-CATALOG:END -->";
const SELECT_START = "<!-- GENERATED:DELIVERABLE-SELECT:START -->";
const SELECT_END = "<!-- GENERATED:DELIVERABLE-SELECT:END -->";

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
    // Describe the contractual instruments without reading as a promise of
    // outcome under the public copy contract.
    .replace(/garantia de proposta e garantia contratual dimensionadas/gi, "cauções de proposta e garantia contratual dimensionadas");
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
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return entry.sla.cadence ? `${entry.sla.cadence}, após ${after}` : `cadência confirmada após ${after}`;
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

function itemCard(entry) {
  const state = STATE[entry.public_state];
  const title = escapeHtml(entry.public_name_pt_br);
  const alias = entry.public_name !== entry.public_name_pt_br
    ? /360\s*°/.test(entry.public_name)
      ? '<p class="catalog-item__alias">Nome anterior preservado no histórico do catálogo.</p>'
      : `<p class="catalog-item__alias">Também publicado como: ${escapeHtml(entry.public_name)}</p>`
    : "";
  const action = entry.public_state === "PUBLISHED"
    ? `<a class="text-link" data-asset-id="${entry.deliverable_id}" data-cta-id="catalog-open-${entry.catalog_number}" data-cta-position="catalog_index" data-event-name="cta_click" href="${escapeHtml(entry.route)}">Consultar exemplo completo</a>`
    : entry.public_state === "VALIDATE"
      ? `<a class="text-link" data-asset-id="${entry.deliverable_id}" data-cta-id="catalog-fit-${entry.catalog_number}" data-cta-position="catalog_index" data-deliverable-id="${entry.deliverable_id}" data-event-name="cta_click" href="#captura-entregas">Pedir análise de aderência</a>`
      : '<span class="catalog-item__unavailable">Contratação indisponível</span>';

  const search = [entry.public_name_pt_br, entry.public_name, ...(entry.name_aliases || []), entry.trigger, entry.decision_question]
    .join(" ").toLocaleLowerCase("pt-BR");
  return `<article class="catalog-item catalog-item--${entry.public_state.toLowerCase()}" data-deliverable-id="${entry.deliverable_id}" data-public-state="${entry.public_state}" data-task-door="${entry.task_door}" data-object="${objectKind(entry)}" data-urgency="${urgencyKind(entry)}" data-price-band="${priceBand(entry)}" data-billing="${entry.price.billing}" data-search="${escapeHtml(search)}" data-name="${title}" data-trigger="${escapeHtml(publicText(entry.trigger))}" data-decision="${escapeHtml(publicText(entry.decision_question))}" data-unit="${escapeHtml(publicText(entry.scope.unit))}" data-input="${escapeHtml(publicText(entry.required_inputs[0]))}" data-output="${escapeHtml(publicText(entry.included_outputs[0]))}" data-sla="${escapeHtml(publicText(slaLabel(entry)))}" data-price="${escapeHtml(priceLabel(entry))}" data-exclusion="${escapeHtml(publicText(entry.exclusions[0]))}" data-step-up="${escapeHtml(stepUpLabel(entry))}" id="entrega-${entry.catalog_number}">
<header class="catalog-item__head"><span class="catalog-item__number">${entry.catalog_number}</span><span class="catalog-item__state">${state.label}</span></header>
<h5>${title}</h5>
${alias}
<p class="catalog-item__question">${escapeHtml(entry.decision_question)}</p>
<dl class="catalog-item__facts"><div><dt>Preço</dt><dd>${priceLabel(entry)}</dd></div><div><dt>Prazo</dt><dd>${escapeHtml(publicText(slaLabel(entry)))}</dd></div><div><dt>Saída principal</dt><dd>${escapeHtml(publicText(entry.included_outputs[0]))}</dd></div></dl>
<p class="catalog-item__evidence">Dados públicos com fonte, data, método e cobertura. Cada afirmação é marcada como fato, cálculo, inferência ou desconhecido.</p>
<p class="catalog-item__state-note">${state.explanation}</p>
<label class="catalog-item__compare"><input type="checkbox" value="${entry.deliverable_id}" data-compare-item/> Comparar esta entrega</label>
${action}
</article>`;
}

function subgroupMarkup(door, subgroup, byNumber) {
  const entries = subgroup.items.map((number) => byNumber.get(number));
  return `<section class="catalog-subgroup" aria-labelledby="subgrupo-${subgroup.subgroup_id}">
<header><h4 id="subgrupo-${subgroup.subgroup_id}">${escapeHtml(subgroup.label_pt_br)}</h4><p>${escapeHtml(subgroup.decisive_difference_pt_br)}</p></header>
<div class="catalog-items">${entries.map(itemCard).join("\n")}</div>
</section>`;
}

function doorMarkup(door, byNumber) {
  const progressive = door.progressive_disclosure;
  let content;
  if (progressive?.required) {
    content = progressive.subgroups.map((subgroup) => subgroupMarkup(door, subgroup, byNumber)).join("\n");
  } else {
    content = `<section class="catalog-subgroup" aria-label="Opções para ${escapeHtml(door.public_label_pt_br)}"><h4 class="catalog-subgroup__title catalog-subgroup__title--plain">Opções para esta tarefa</h4><div class="catalog-items">${door.members.map(({ item }) => itemCard(byNumber.get(item))).join("\n")}</div></section>`;
  }
  return `<section class="catalog-door" data-task-door="${door.door}" id="porta-${door.door.toLowerCase()}" aria-labelledby="porta-${door.door.toLowerCase()}-title">
<header class="catalog-door__head"><p class="eyebrow">Tarefa ${String(door.order).padStart(2, "0")}</p><h3 id="porta-${door.door.toLowerCase()}-title">${escapeHtml(door.public_label_pt_br)}</h3><p>${escapeHtml(door.decision_question_pt_br)}</p><span>${door.member_count} entregáveis</span></header>
${content}
</section>`;
}

export function renderCatalog(registry, taskDoors) {
  const byNumber = new Map(registry.deliverables.map((entry) => [entry.catalog_number, entry]));
  const nav = taskDoors.doors.map((door) => `<a href="#porta-${door.door.toLowerCase()}"><span>${door.order}</span>${escapeHtml(door.public_label_pt_br)} <small>${door.member_count}</small></a>`).join("\n");
  const doors = taskDoors.doors.map((door) => doorMarkup(door, byNumber)).join("\n");
  const taskOptions = taskDoors.doors.map((door) => `<option value="${door.door}">${escapeHtml(door.public_label_pt_br)}</option>`).join("");
  const inputOptions = taskDoors.interaction_rules.framing_steps[2].options_pt_br.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  const alphabetical = [...registry.deliverables]
    .sort((a, b) => a.public_name_pt_br.localeCompare(b.public_name_pt_br, "pt-BR"))
    .map((entry) => `<li data-alpha-item="${entry.deliverable_id}"><a href="#entrega-${entry.catalog_number}"><span>${entry.catalog_number}</span>${escapeHtml(entry.public_name_pt_br)}<small>${priceLabel(entry)} · ${STATE[entry.public_state].label}</small></a></li>`)
    .join("\n");
  return `${CATALOG_START}
<section class="deliverables-catalog" id="indice-integral" data-section-archetype="catalog_index" aria-labelledby="catalog-title">
<div class="container">
<header class="deliverables-catalog__intro"><p class="eyebrow">Índice integral</p><h2 id="catalog-title">54 entregáveis, organizados pela decisão na mesa.</h2><p>As oito entregas publicadas continuam disponíveis por inteiro. As demais aparecem com preço-piloto e estado explícito: estar no catálogo não significa compra imediata nem preço validado.</p><p><strong>Faixa:</strong> R$ 599 a R$ 39.800, com recorrências identificadas como mensais. São 54 entregáveis e 2 contêineres comerciais; planos não inflam a contagem.</p></header>
<section class="catalog-framing" id="enquadrar" aria-labelledby="catalog-framing-title"><header><p class="eyebrow">Enquadramento em três passos</p><h3 id="catalog-framing-title">Comece pela situação, não pelo nome do produto.</h3></header><div class="catalog-framing__steps"><label><span>1</span> O que está acontecendo agora?<select data-frame-task><option value="">Escolha uma tarefa</option>${taskOptions}</select></label><label><span>2</span> Qual é o objeto e o prazo?<select data-frame-object><option value="">Escolha o objeto</option><option value="edital">Edital ou lote</option><option value="contrato">Contrato ou evento</option><option value="mercado">Carteira ou mercado</option><option value="equipe">Equipe ou operação</option></select><input type="date" data-frame-deadline aria-label="Prazo da decisão"/></label><label><span>3</span> O que você já tem?<select data-frame-input><option value="">Escolha o insumo</option>${inputOptions}</select></label></div><a class="button button-secondary" href="#indice-integral" data-catalog-recommend>Mostrar até três caminhos</a><p>${escapeHtml(taskDoors.interaction_rules.recommendation_output.disclaimer_pt_br)}</p><div class="catalog-recommendation" data-catalog-recommendation hidden aria-live="polite"></div></section>
<section class="catalog-filters" data-catalog-filters hidden aria-labelledby="catalog-filter-title"><div><p class="eyebrow">Busca e filtros</p><h3 id="catalog-filter-title">Reduza o rol sem esconder o que existe.</h3></div><label>Buscar por nome, situação ou decisão <input type="search" data-filter-query autocomplete="off"/></label><label>Tarefa <select data-filter="task"><option value="">Todas</option>${taskOptions}</select></label><label>Objeto <select data-filter="object"><option value="">Todos</option><option value="edital">Edital ou lote</option><option value="contrato">Contrato ou evento</option><option value="mercado">Carteira ou mercado</option><option value="equipe">Equipe ou operação</option></select></label><label>Urgência segura <select data-filter="urgency"><option value="">Todas</option><option value="prazo-processual">Prazo processual</option><option value="ate-3">Até 3 dias úteis</option><option value="ate-7">Até 7 dias úteis</option><option value="planejada">Planejada ou recorrente</option></select></label><label>Preço <select data-filter="price"><option value="">Todos</option><option value="ate-2000">Até R$ 2.000</option><option value="2001-5000">R$ 2.001 a R$ 5.000</option><option value="5001-10000">R$ 5.001 a R$ 10.000</option><option value="acima-10000">Acima de R$ 10.000</option></select></label><label>Contratação <select data-filter="billing"><option value="">Todas</option><option value="one_time">Pontual</option><option value="subscription_monthly">Recorrente</option></select></label><label>Estado <select data-filter="state"><option value="">Todos</option><option value="PUBLISHED">Publicada</option><option value="VALIDATE">Em validação</option><option value="BLOCKED">Indisponível</option></select></label><div class="catalog-filter-actions"><button type="button" data-view="task" aria-pressed="true">Por tarefa</button><button type="button" data-view="alpha" aria-pressed="false">Ordem alfabética</button><button type="button" data-clear-filters>Limpar filtros</button></div><p class="catalog-filter-status" data-filter-status role="status" aria-live="polite">54 entregáveis encontrados.</p></section>
<aside class="catalog-compare-tray" data-compare-tray hidden aria-live="polite"><p><strong data-compare-count>0</strong> selecionadas · escolha de 2 a 4</p><button type="button" data-compare-open disabled>Comparar seleção</button><button type="button" data-compare-clear>Limpar comparação</button></aside><section class="catalog-comparison" data-comparison hidden aria-labelledby="catalog-comparison-title"><header><p class="eyebrow">Comparação selecionada</p><h3 id="catalog-comparison-title">Diferenças que mudam a compra.</h3></header><div data-comparison-items></div></section>
<nav class="catalog-door-nav" aria-label="Escolher entregáveis pela tarefa">${nav}</nav>
<div data-task-view>${doors}</div>
<details class="catalog-alpha" data-alpha-view><summary>Ver índice em ordem alfabética</summary><ol>${alphabetical}</ol></details>
<div class="catalog-empty" data-catalog-empty hidden><h3>Nenhuma entrega combina com todos os filtros.</h3><p>Limpe um filtro, aumente o prazo ou registre a pergunta no item 48. Um resultado vazio não transforma uma oferta bloqueada em disponível.</p><button type="button" data-clear-filters>Limpar filtros</button></div>
<aside class="catalog-boundary"><h3>Se o pedido não cabe no rol</h3><p>Ele só pode seguir para o item 48, Estudo Sob Medida com Dados Públicos, quando houver objeto e fronteira verificáveis. Caso contrário, a demanda é recusada. Não existe serviço oculto em atendimento genérico.</p></aside>
</div>
</section>
${CATALOG_END}`;
}

export function renderSelect(registry) {
  const options = registry.deliverables.map((entry) => {
    const disabled = entry.public_state === "BLOCKED" ? " disabled" : "";
    const suffix = entry.public_state === "BLOCKED" ? " (indisponível)" : "";
    return `<option value="${entry.deliverable_id}"${disabled}>${entry.catalog_number} · ${escapeHtml(entry.public_name_pt_br)}${suffix}</option>`;
  }).join("\n");
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

export function renderPage(html, registry, taskDoors) {
  let next = replaceBlock(html, CATALOG_START, CATALOG_END, renderCatalog(registry, taskDoors));
  next = replaceBlock(next, SELECT_START, SELECT_END, renderSelect(registry));
  return next;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const taskDoors = JSON.parse(fs.readFileSync(doorsPath, "utf8"));
  const current = fs.readFileSync(pagePath, "utf8");
  const rendered = renderPage(current, registry, taskDoors);
  if (process.argv.includes("--check")) {
    if (rendered !== current) {
      console.error("PUBLIC_CATALOG_DRIFT: run node scripts/commercial/render_public_catalog.mjs --write");
      process.exit(1);
    }
    console.log(`PUBLIC_CATALOG_OK items=${registry.deliverables.length} doors=${taskDoors.doors.length}`);
  } else if (process.argv.includes("--write")) {
    fs.writeFileSync(pagePath, rendered);
    console.log(`PUBLIC_CATALOG_WRITTEN items=${registry.deliverables.length} doors=${taskDoors.doors.length}`);
  } else {
    console.error("usage: render_public_catalog.mjs --check|--write");
    process.exit(2);
  }
}
