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

function readingRules(item) {
  return `<aside class="eight-contract__reading"><h3>Como ler o resultado</h3><dl><div><dt>Cobertura</dt><dd>${escapeHtml(item.objeto_incluido)}</dd></div><div><dt>Data</dt><dd>A data de corte aparece no pedido e na entrega.</dd></div><div><dt>Método</dt><dd>Fontes públicas com origem e versão registradas, reconciliação declarada e decisão humana.</dd></div><div><dt>Ausência</dt><dd>Quando a fonte não sustenta uma afirmação, o campo recebe NÃO INFORMADO.</dd></div></dl></aside>`;
}

function routeBlock(contract, item) {
  return `${ROUTE_START}
<section class="eight-contract" aria-labelledby="eight-contract-${item.number}">
<div class="container"><header class="eight-contract__head"><p class="eyebrow">Contrato desta unidade</p><h2 id="eight-contract-${item.number}">${escapeHtml(item.issue_331_name)}</h2><p>O exemplo integral acima continua sintético. Estes são objeto, entradas, saída, prazo e limites da adaptação contratada.</p></header>
<dl class="eight-contract__terms"><div><dt>Preço preservado</dt><dd>${escapeHtml(item.price_display)}</dd></div><div><dt>SLA</dt><dd>${escapeHtml(item.sla.text)}</dd></div><div><dt>Marco do prazo</dt><dd>${escapeHtml(item.sla.counts_from === "UNKNOWN" ? "confirmado antes da cobrança" : item.sla.counts_from)}</dd></div></dl>
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
  return next;
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
