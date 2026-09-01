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
  return contract.public_copy_overrides?.[value] || value;
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
<ol><li data-ladder-step="unit"><strong>Esta unidade basta</strong><span>Quando a decisão é ${escapeHtml(lowerFirst(item.value_first.actual_contract_value))} O recorte continua limitado a ${escapeHtml(item.objeto_incluido)}.</span></li>
<li data-ladder-step="diagnosis"><strong>Diagnóstico integrado</strong><span>É necessário quando ${escapeHtml(ladder.diagnosis_trigger)}. O <a href="${escapeHtml(ladder.diagnosis_route)}">${escapeHtml(contract.package.public_name_pt_br)}</a> reúne ${escapeHtml(ladder.diagnosis_scope)} por ${escapeHtml(contract.package.package_price_display)}. ${diagnosisBoundary(contract, item)}</span></li>
<li data-ladder-step="recurring"><strong>Direção recorrente</strong><span>A <a href="${escapeHtml(ladder.recurring_direction_route)}">${escapeHtml(ladder.recurring_direction_name_pt_br)}</a> é apropriada quando ${escapeHtml(ladder.recurring_direction_trigger)}; seu escopo é ${escapeHtml(ladder.recurring_direction_scope)}.</span></li></ol>
</section>`;
}

function creditNote(contract, item) {
  return `${CREDIT_START}
<li>${diagnosisBoundary(contract, item)}</li>
${CREDIT_END}`;
}

function readingRules(item) {
  return `<aside class="eight-contract__reading"><h3>Como ler o resultado</h3><dl><div><dt>Cobertura</dt><dd>${escapeHtml(item.objeto_incluido)}</dd></div><div><dt>Data</dt><dd>A data de corte aparece no pedido e na entrega.</dd></div><div><dt>Método</dt><dd>Fontes públicas com origem e versão registradas, reconciliação declarada e decisão humana.</dd></div><div><dt>Ausência</dt><dd>Quando a fonte não sustenta uma afirmação, o campo recebe NÃO INFORMADO.</dd></div></dl></aside>`;
}

function routeBlock(contract, item) {
  const value = item.value_first;
  if (!value) throw new Error(`EIGHT_VALUE_FIRST_MISSING: ${item.deliverable_id}`);
  return `${ROUTE_START}
<section class="eight-contract" aria-labelledby="eight-contract-${item.number}">
<div class="container"><header class="eight-contract__head"><p class="eyebrow">Decisão e artefato desta unidade</p><h2 id="eight-contract-${item.number}">${escapeHtml(item.issue_331_name)}</h2><p data-copy-role="value_outcome">${escapeHtml(value.actual_contract_value)}</p></header>
<div class="eight-contract__scope eight-contract__value"><section data-copy-role="value_created"><h3>Trabalho que a entrega comprime</h3><p>${escapeHtml(value.work_removed)}</p></section><section data-copy-role="artifact"><h3>Como o artefato entra na decisão</h3><p>${escapeHtml(value.artifact_use)}</p></section><section data-copy-role="positive_proof"><h3>O que você pode inspecionar</h3><p>${escapeHtml(value.proof_statement)}</p></section><section><h3>Por que este preço</h3><p>${escapeHtml(value.price_anchor)}</p></section></div>
<p class="eight-contract__synthetic-boundary">O exemplo integral acima continua sintético e demonstra formato e método, não resultado de cliente. A adaptação contratada preserva o objeto, as entradas, a saída, o prazo e os limites abaixo.</p>
<dl class="eight-contract__terms"><div><dt>Preço preservado</dt><dd>${escapeHtml(item.price_display)}</dd></div><div><dt>SLA</dt><dd>${escapeHtml(item.sla.text)}</dd></div><div><dt>Marco do prazo</dt><dd>${escapeHtml(item.sla.counts_from === "UNKNOWN" ? "confirmado antes da cobrança" : item.sla.counts_from)}</dd></div></dl>
${offerLadder(contract, item)}
<div class="eight-contract__scope"><section><h3>Objeto incluído</h3><p>${escapeHtml(item.objeto_incluido)}</p></section><section><h3>Entradas</h3>${list(item.entrada)}</section><section><h3>Saída mínima</h3><p>${escapeHtml(item.saida_minima)}</p></section><section><h3>Fronteiras</h3>${list(item.fronteira.map((value) => publicCopy(contract, value)))}</section></div>
${readingRules(item)}</div>
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
  return renderActionLabels(next, item);
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
