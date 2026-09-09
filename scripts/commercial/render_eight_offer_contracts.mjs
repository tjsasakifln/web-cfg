#!/usr/bin/env node

/** Render the public #331 scope contract into the eight example routes. */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contractPath = path.join(root, "data/commercial/page-contract-eight.v1.json");
const ROUTE_START = "<!-- GENERATED:EIGHT-OFFER-CONTRACT:START -->";
const ROUTE_END = "<!-- GENERATED:EIGHT-OFFER-CONTRACT:END -->";
const FIELDS_START = "<!-- GENERATED:EIGHT-OFFER-FIELDS:START -->";
const FIELDS_END = "<!-- GENERATED:EIGHT-OFFER-FIELDS:END -->";
const CREDIT_START = "<!-- GENERATED:EIGHT-OFFER-CREDIT:START -->";
const CREDIT_END = "<!-- GENERATED:EIGHT-OFFER-CREDIT:END -->";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function list(values) {
  return `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

function publicCopy(contract, value) {
  return String(contract.public_copy_overrides?.[value] || value)
    .replace(/\binputs válidos\b/gi, "informações necessárias confirmadas")
    .replace(/\binputs\b/gi, "informações necessárias")
    .replace(/\bchecks\b/gi, "conferências")
    .replace(/\bgates\b/gi, "condições")
    .replace(/\bgate\b/gi, "condição")
    .replace(/\bartefato\b/gi, "documento");
}

const EDITORIAL_REPLACEMENTS = new Map([
  ["reordenar o ordenação", "refazer o quadro comparativo"],
  ["reordenar o ranking", "refazer o quadro comparativo"],
  ["quadro comparativo por frequência, depois por valor", "Quadro comparativo por frequência, depois por valor"],
  ["quadro comparativo por frequência", "Quadro comparativo por frequência"],
  ["Foco nos compradores de maior encaixe, gates antes de cada avanço", "Foco nos compradores de maior encaixe, condições antes de cada avanço"],
  ["Foco, gates e política de dados", "Foco, condições de avanço e política de dados"],
  ["oportunidades que passam nos gates", "oportunidades que atendem às condições"],
  ["Nota alta não substitui gate.", "Nota alta não substitui condição obrigatória."],
  ["o gate concreto", "a condição concreta"],
  ["sem gate pendente", "sem condição pendente"],
  ["com o gate que ainda governa o avanço", "com a condição que ainda governa o avanço"],
  ["Gate pendente", "Condição pendente"],
  [">GATES<", ">CONDIÇÕES<"],
  ["Autorizar os gates antes de cada avanço", "Autorizar as condições antes de cada avanço"],
  ["o gate correspondente", "a condição correspondente"],
  ["gates concretos prevalecem", "condições concretas prevalecem"],
  ["GATE DE RECORTE", "CONDIÇÃO DE RECORTE"],
  ["GATE DE RECONFIRMAÇÃO", "CONDIÇÃO DE RECONFIRMAÇÃO"],
  ["GATE DE PREPARAÇÃO", "CONDIÇÃO DE PREPARAÇÃO"],
  ["o gate de preparação", "a condição de preparação"],
  ["no gate de reconfirmação", "na condição de reconfirmação"],
  ["Gate permanente", "Condição permanente"],
  ["Gates e consolidação", "Critérios e consolidação"],
  ["Depois dos gates", "Depois dos critérios"],
  ["Unidade e gates", "Unidade e critérios"],
  ["Antes do ranking, o gate.", "Antes do ranking, o critério de exclusão."],
  [">Gates<", ">Critérios<"],
  ["Natureza privada é gate.", "Natureza privada é critério de inclusão."],
  ["GATE APLICADO NO EXEMPLO", "CRITÉRIO APLICADO NO EXEMPLO"],
  ["registrada como gate", "registrada como exclusão fundamentada"],
  ["Aplicação dos gates de natureza privada e de aderência ao recorte.", "Aplicação dos critérios de natureza privada e de aderência ao recorte."],
  ["Primeiro gate", "Primeira condição"],
  ["são gates anteriores", "são condições anteriores"],
  ["aplica gates eliminatórios", "aplica critérios eliminatórios"],
  ["Critérios e gates", "Critérios eliminatórios"],
  ["separa gates objetivos", "separa critérios objetivos"],
  ["Sem gate eliminatório", "Sem impedimento eliminatório"],
  ["GATE DOCUMENTAL", "CONDIÇÃO DOCUMENTAL"],
  ["GATE ECONÔMICO", "CONDIÇÃO ECONÔMICA"],
  ["GATE EXECUTIVO", "DECISÃO EXECUTIVA"],
  ["Aplicação de gates eliminatórios.", "Aplicação de critérios eliminatórios."],
  ["intenção define o uso do artefato", "finalidade explica como a entrega será usada"],
]);

function renderEditorialLanguage(html) {
  let next = html;
  for (const [before, after] of EDITORIAL_REPLACEMENTS) next = next.replaceAll(before, after);
  const translate = (value) => String(value)
    .replace(/\bCLUSTERS\b/g, "CONJUNTOS")
    .replace(/\bClusters\b/g, "Conjuntos")
    .replace(/\bclusters\b/g, "conjuntos")
    .replace(/\bCLUSTER\b/g, "CONJUNTO")
    .replace(/\bCluster\b/g, "Conjunto")
    .replace(/\bcluster\b/g, "conjunto")
    .replace(/\b(?:SCORES|PONTUAÇÕES)\b/g, "ÍNDICES")
    .replace(/\b(?:Scores|Pontuações)\b/g, "Índices")
    .replace(/\b(?:scores|pontuações)\b/g, "índices")
    .replace(/\b(?:SCORE|PONTUAÇÃO)\b/g, "ÍNDICE")
    .replace(/\b(?:Score|Pontuação)\b/g, "Índice")
    .replace(/\b(?:score|pontuação)\b/g, "índice")
    .replace(/\bO (?:rank|ordem)\b/g, "A posição")
    .replace(/\bo (?:rank|ordem)\b/g, "a posição")
    .replace(/\bRANK\b/g, "POSIÇÃO")
    .replace(/\bRank\b/g, "Posição")
    .replace(/\brank\b/g, "posição")
    .replace(/\bfalso ordenação\b/gi, "quadro comparativo enganoso")
    .replace(/\bdo ordenação\b/gi, "do quadro comparativo")
    .replace(/\bno ordenação\b/gi, "no quadro comparativo")
    .replace(/\bo ordenação\b/gi, "o quadro comparativo")
    .replace(/\bnovo ordenação\b/gi, "novo quadro comparativo")
    .replace(/\bordenação\b/gi, "quadro comparativo")
    .replace(/\branking\b/gi, "quadro comparativo")
    .replace(/\bTOP 15\b/g, "15 PRIMEIROS")
    .replace(/\bTop 15\b/g, "15 primeiros")
    .replace(/\btop 15\b/g, "15 primeiros")
    .replace(/\bchecklist\b/gi, "lista de conferência")
    .replace(/\bgatilhos\b/gi, "condições")
    .replace(/\bgatilho\b/gi, "condição")
    .replace(/\bTICKET\b/g, "VALOR")
    .replace(/\bTicket\b/g, "Valor")
    .replace(/\bticket\b/g, "valor")
    .replace(/\btop 1\b/gi, "maior fornecedor")
    .replace(/\bB2G\b/g, "obras públicas");

  // Translate only visitor-visible text and accessibility/metadata values;
  // route names, CSS classes, event ids and scripts remain stable.
  let rawElement = null;
  next = next.replace(/<[^>]+>|[^<]+/g, (token) => {
    if (token.startsWith("<")) {
      if (/^<(script|style)\b/i.test(token)) rawElement = token.match(/^<(script|style)\b/i)[1].toLowerCase();
      if (/^<\/(script|style)\b/i.test(token)) rawElement = null;
      if (rawElement) return token;
      return token.replace(/\b(content|aria-label|alt|title)="([^"]*)"/gi, (_, name, value) => `${name}="${translate(value)}"`);
    }
    return rawElement ? token : translate(token);
  });

  next = next.replace(/(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/gi, (whole, open, body, close) => {
    try {
      const walk = (value) => {
        if (Array.isArray(value)) return value.map(walk);
        if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child)]));
        if (typeof value !== "string" || /^(?:https?:\/\/|\/)/.test(value)) return value;
        return translate(value);
      };
      return `${open}${JSON.stringify(walk(JSON.parse(body)))}${close}`;
    } catch {
      return whole;
    }
  });
  return next;
}

function lowerFirst(value) {
  const text = String(value || "");
  return text ? `${text[0].toLocaleLowerCase("pt-BR")}${text.slice(1)}` : text;
}

function diagnosisBoundary(contract, item) {
  const pkg = contract.package;
  const diagnosis = `<a href="${escapeHtml(contract.value_ladder.diagnosis_route)}">${escapeHtml(pkg.public_name_pt_br)}</a>`;
  if (!item.generates_package_credit) {
    return `A unidade 01 fica fora do ${diagnosis} de ${escapeHtml(pkg.package_price_display)} e não gera crédito de ${pkg.credit_window_days} dias.`;
  }
  return `O maior valor pago é abatido do ${diagnosis} de ${escapeHtml(pkg.package_price_display)} se ele for contratado em até ${pkg.credit_window_days} dias, sem acúmulo.`;
}

function offerLadder(contract, item) {
  const ladder = contract.value_ladder;
  if (!ladder) throw new Error("EIGHT_VALUE_LADDER_MISSING");
  return `<section class="eight-contract__ladder" data-offer-ladder="unit-diagnosis-recurring" aria-labelledby="eight-ladder-${item.number}">
<p class="eyebrow">Próxima camada pelo tipo de decisão</p><h3 id="eight-ladder-${item.number}">Unidade, Diagnóstico ou direção recorrente?</h3>
<ol><li data-ladder-step="unit"><strong>Esta unidade basta</strong><span>Quando a decisão é ${escapeHtml(lowerFirst(publicCopy(contract, item.value_first.actual_contract_value)))} O recorte continua limitado a ${escapeHtml(publicCopy(contract, item.objeto_incluido))}.</span></li>
<li data-ladder-step="diagnosis"><strong>Diagnóstico integrado</strong><span>É necessário quando ${escapeHtml(publicCopy(contract, ladder.diagnosis_trigger))}. O <a href="${escapeHtml(ladder.diagnosis_route)}">${escapeHtml(contract.package.public_name_pt_br)}</a> reúne ${escapeHtml(publicCopy(contract, ladder.diagnosis_scope))} por ${escapeHtml(contract.package.package_price_display)}. ${diagnosisBoundary(contract, item)}</span></li>
<li data-ladder-step="recurring"><strong>Direção recorrente</strong><span>A <a href="${escapeHtml(ladder.recurring_direction_route)}">${escapeHtml(ladder.recurring_direction_name_pt_br)}</a> é apropriada quando ${escapeHtml(publicCopy(contract, ladder.recurring_direction_trigger))}; seu escopo é ${escapeHtml(publicCopy(contract, ladder.recurring_direction_scope))}.</span></li></ol>
</section>`;
}

function creditNote(contract, item) {
  return `${CREDIT_START}
<li>${diagnosisBoundary(contract, item)}</li>
${CREDIT_END}`;
}

function readingRules(contract, item) {
  return `<aside class="eight-contract__reading"><h3>Como ler o resultado</h3><dl><div><dt>Cobertura</dt><dd>${escapeHtml(publicCopy(contract, item.objeto_incluido))}</dd></div><div><dt>Data</dt><dd>A data de corte aparece no pedido e na entrega.</dd></div><div><dt>Método</dt><dd>Fontes públicas com origem e versão registradas, reconciliação declarada e decisão humana.</dd></div><div><dt>Ausência</dt><dd>Quando a fonte não sustenta uma afirmação, o campo recebe NÃO INFORMADO.</dd></div></dl></aside>`;
}

function routeBlock(contract, item) {
  const value = item.value_first;
  if (!value) throw new Error(`EIGHT_VALUE_FIRST_MISSING: ${item.deliverable_id}`);
  return `${ROUTE_START}
<section class="eight-contract" aria-labelledby="eight-contract-${item.number}">
<div class="container"><header class="eight-contract__head"><p class="eyebrow">Decisão e entrega desta unidade</p><h2 id="eight-contract-${item.number}">${escapeHtml(item.issue_331_name)}</h2><p data-copy-role="value_outcome">${escapeHtml(publicCopy(contract, value.actual_contract_value))}</p></header>
<div class="eight-contract__scope eight-contract__value"><section data-copy-role="value_created"><h3>Trabalho realizado</h3><p>${escapeHtml(publicCopy(contract, value.work_removed))}</p></section><section data-copy-role="artifact"><h3>Como a entrega entra na decisão</h3><p>${escapeHtml(publicCopy(contract, value.artifact_use))}</p></section><section data-copy-role="positive_proof"><h3>O que você pode inspecionar</h3><p>${escapeHtml(publicCopy(contract, value.proof_statement))}</p></section><section><h3>Por que este preço</h3><p>${escapeHtml(publicCopy(contract, value.price_anchor))}</p></section></div>
<p class="eight-contract__synthetic-boundary">O exemplo integral acima usa dados sintéticos para demonstrar formato e método. O preço e as condições abaixo pertencem à adaptação contratada; o exemplo não representa resultado de cliente.</p>
<dl class="eight-contract__terms"><div><dt>Preço</dt><dd>${escapeHtml(item.price_display)}</dd></div><div><dt>Prazo de entrega</dt><dd>${escapeHtml(publicCopy(contract, item.sla.text))}</dd></div><div><dt>Quando a contagem começa</dt><dd>${escapeHtml(item.sla.counts_from === "UNKNOWN" ? "Definida e confirmada por escrito na proposta antes da cobrança." : `${publicCopy(contract, item.sla.counts_from)}. A CONFENGE confirma por escrito a condição de início antes da cobrança.`)}</dd></div></dl>
${offerLadder(contract, item)}
<div class="eight-contract__scope"><section><h3>Trabalho incluído</h3><p>${escapeHtml(publicCopy(contract, item.objeto_incluido))}</p></section><section><h3>Informações necessárias</h3>${list(item.entrada.map((value) => publicCopy(contract, value)))}</section><section><h3>Conteúdo entregue</h3><p>${escapeHtml(publicCopy(contract, item.saida_minima))}</p></section><section><h3>Limites</h3>${list(item.fronteira.map((value) => publicCopy(contract, value)))}</section></div>
${readingRules(contract, item)}</div>
</section>
${ROUTE_END}`;
}

function formFields(item) {
  return `${FIELDS_START}
<input name="deliverable_id" type="hidden" value="${item.deliverable_id}"/>
<label>CNPJ da empresa <input name="cnpj" inputmode="numeric" maxlength="14" pattern="[0-9]{14}" required/></label>
<div class="eight-contract-form__row"><label>Data de corte da análise <input name="analysis_cutoff" type="date" required/></label><label>Data-limite da decisão <input name="opportunity_deadline" type="date" required/></label></div>
<label>Decisão que está na mesa <select name="decision_intent" required><option value="">Selecione</option><option value="priorizar_oportunidades">Definir foco da equipe</option><option value="validar_mercado">Validar mercado e cobertura</option><option value="escolher_territorio">Escolher território ou comprador</option><option value="monitorar_renovacoes">Monitorar renovação ou relicitação</option><option value="comparar_concorrentes">Comparar concorrentes</option><option value="referenciar_precos">Referenciar preços observados</option><option value="consolidar_plano">Consolidar plano de expansão</option><option value="UNKNOWN">Ainda não definida</option></select></label>
${FIELDS_END}`;
}

function replaceBlock(html, start, end, block, insertionNeedle) {
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from >= 0 && to >= from) return `${html.slice(0, from)}${block}${html.slice(to + end.length)}`;
  if (!html.includes(insertionNeedle)) throw new Error(`insertion needle missing: ${insertionNeedle}`);
  return html.replace(insertionNeedle, `${block}\n${insertionNeedle}`);
}

function ensureCss(html, needle) {
  const link = '<link href="/assets/eight-offer-contract.css" rel="stylesheet"/>';
  if (html.includes(link)) return html;
  if (!html.includes(needle)) throw new Error(`stylesheet needle missing: ${needle}`);
  return html.replace(needle, `${needle}\n${link}`);
}

function renderActionLabels(html, item) {
  const action = item.value_first?.cta_configure;
  if (!action) throw new Error(`EIGHT_CTA_NEXT_STATE_MISSING: ${item.deliverable_id}`);
  const fullLabel = `${action} por ${item.price_display}`;
  return html.replace(
    /<a\b([^>]*\bdata-next-action-id=["'][^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi,
    (_full, attrs, content) => {
      let nextAttrs = attrs;
      const position = attrs.match(/\bdata-cta-position=["']([^"']+)["']/i)?.[1] || "";
      const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
      const ariaLabel = /https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(href)
        ? `${fullLabel} pelo WhatsApp`
        : `${fullLabel}: abrir configuração do pedido`;
      if (/\baria-label=["']/i.test(nextAttrs)) {
        nextAttrs = nextAttrs.replace(/\baria-label=["'][^"']*["']/i, `aria-label="${escapeHtml(ariaLabel)}"`);
      }
      if (/<span\b/i.test(content)) {
        const nextContent = content.replace(/<span\b[^>]*>[\s\S]*?<\/span>/i, "<span>Configurar pedido</span>");
        return `<a${nextAttrs}>${nextContent}</a>`;
      }
      if (position === "report_header") return `<a${nextAttrs}>Configurar pedido</a>`;
      const suffix = content.match(/\s*(<svg\b[\s\S]*)$/i)?.[1] || "";
      return `<a${nextAttrs}>${escapeHtml(fullLabel)}${suffix ? ` ${suffix}` : ""}</a>`;
    },
  );
}

function renderRoute(html, contract, item) {
  let next = ensureCss(html, '<link href="/assets/report-capture.css" rel="stylesheet"/>');
  next = replaceBlock(next, ROUTE_START, ROUTE_END, routeBlock(contract, item), '<section class="report-capture"');
  const fields = formFields(item);
  if (next.includes(FIELDS_START)) {
    next = replaceBlock(next, FIELDS_START, FIELDS_END, fields, "unused");
  } else {
    const match = next.match(/<form\b[^>]*\bid="captura-modelo"[^>]*>/i);
    if (!match) throw new Error(`capture form missing: ${item.file}`);
    next = next.replace(match[0], `${match[0]}\n${fields}`);
  }
  const generatedCredit = creditNote(contract, item);
  if (next.includes(CREDIT_START)) {
    next = replaceBlock(next, CREDIT_START, CREDIT_END, generatedCredit, "unused");
  } else {
    const legacyCredit = /<li>O valor volta como crédito se o Diagnóstico de Expansão no Mercado Público for contratado em até 60 dias\.<\/li>/i;
    if (!legacyCredit.test(next)) throw new Error(`legacy credit note missing: ${item.file}`);
    next = next.replace(legacyCredit, generatedCredit);
  }
  return renderEditorialLanguage(renderActionLabels(next, item));
}

function renderAll(contract) {
  const updates = [];
  for (const item of contract.deliverables) {
    const absolute = path.join(root, item.file);
    const current = fs.readFileSync(absolute, "utf8");
    updates.push({ absolute, current, next: renderRoute(current, contract, item) });
  }
  return updates;
}

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const updates = renderAll(contract);
if (process.argv.includes("--check")) {
  const drift = updates.filter((entry) => entry.current !== entry.next).map((entry) => path.relative(root, entry.absolute));
  if (drift.length) {
    console.error(`EIGHT_OFFER_CONTRACT_DRIFT: ${drift.join(", ")}`);
    process.exit(1);
  }
  console.log(`EIGHT_OFFER_CONTRACT_OK routes=${contract.deliverables.length}`);
} else if (process.argv.includes("--write")) {
  for (const entry of updates) fs.writeFileSync(entry.absolute, entry.next);
  console.log(`EIGHT_OFFER_CONTRACT_WRITTEN routes=${contract.deliverables.length}`);
} else {
  console.error("usage: render_eight_offer_contracts.mjs --check|--write");
  process.exit(2);
}
