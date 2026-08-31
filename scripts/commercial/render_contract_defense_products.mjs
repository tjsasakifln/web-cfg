#!/usr/bin/env node

/** Render the #333 contract products into the six owned routes and the services hub. */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/page-contract-contratos.v1.json"), "utf8"));
const unlockPlan = JSON.parse(fs.readFileSync(path.join(root, "data/bofu-dominance/frozen-specs/unlock-plan.v1.json"), "utf8"));
const frozenHashes = JSON.parse(fs.readFileSync(path.join(root, "data/bofu-dominance/frozen-specs/hashes.json"), "utf8"));
const mutationAuthorized = unlockPlan.html_mutation_authorized === true &&
  (unlockPlan.preconditions_all_required || []).every((entry) => entry.state === "READY");
const heldProtectedSlugs = mutationAuthorized ? new Set() : new Set(unlockPlan.protected_pillars || []);
const ROUTE_START = "<!-- GENERATED:CONTRACT-DEFENSE-PRODUCT:START -->";
const ROUTE_END = "<!-- GENERATED:CONTRACT-DEFENSE-PRODUCT:END -->";
const FIELDS_START = "<!-- GENERATED:CONTRACT-DEFENSE-FIELDS:START -->";
const FIELDS_END = "<!-- GENERATED:CONTRACT-DEFENSE-FIELDS:END -->";
const HUB_START = "<!-- GENERATED:CONTRACT-DEFENSE-HUB:START -->";
const HUB_END = "<!-- GENERATED:CONTRACT-DEFENSE-HUB:END -->";

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const list = (values) => `<ul>${values.map((value) => `<li>${esc(value)}</li>`).join("")}</ul>`;
const price = (cents) => `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(cents / 100)}`;
const publicEvidence = (value) => String(value)
  .replace(/\bFACT\b/g, "fato")
  .replace(/\bCALCULATION\b/g, "cálculo")
  .replace(/\bINFERENCE\b/g, "inferência")
  .replace(/\bUNKNOWN\b/g, "não informado");

function replaceBlock(html, start, end, block, needle) {
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from >= 0 && to >= from) return `${html.slice(0, from)}${block}${html.slice(to + end.length)}`;
  if (!html.includes(needle)) throw new Error(`insertion needle missing: ${needle}`);
  return html.replace(needle, `${block}\n${needle}`);
}

function ensureCss(html) {
  const link = '<link href="/styles-offers.css" rel="stylesheet"/>';
  const legacy = '<link href="/assets/contract-defense-products.css" rel="stylesheet"/>';
  const retired = '<link href="/styles-contract-defense-products.css" rel="stylesheet"/>';
  let found = false;
  const offerLink = /<link\b(?=[^>]*\bhref\s*=\s*["']\/styles-offers\.css["'])[^>]*>\s*/gi;
  const next = html.replaceAll(legacy, "").replaceAll(retired, "").replace(offerLink, (tag) => {
    if (found) return "";
    found = true;
    return tag;
  });
  return found ? next : next.replace("</head>", `${link}\n</head>`);
}

function isHeldProtected(item, current) {
  const slug = item.route?.replace(/^\/|\/$/g, "");
  if (!slug || !heldProtectedSlugs.has(slug)) return false;
  const expected = frozenHashes.forbidden?.[item.page_file];
  const actual = createHash("sha256").update(current).digest("hex");
  if (!expected || actual !== expected) {
    throw new Error(`CONTRACT_DEFENSE_FROZEN_DRIFT: ${item.page_file} expected=${expected} actual=${actual}`);
  }
  return true;
}

function qualificationFields(item, select = false) {
  const deliverable = select
    ? `<label>Entrega mais próxima <select name="deliverable_id" required><option value="">Selecione</option>${contract.items.map((entry) => `<option value="${entry.deliverable_id}">${entry.item}. ${esc(entry.public_name_pt_br)}</option>`).join("")}</select></label>`
    : `<input name="deliverable_id" type="hidden" value="${item.deliverable_id}"/>`;
  return `${FIELDS_START}
${deliverable}
<label>Identificador do contrato <input name="public_contract_id" maxlength="80" required/></label>
<label>Evento observado <select name="contract_event" required><option value="">Selecione</option><option value="risco_margem">Risco à margem</option><option value="medicao_glosa_pagamento">Medição, glosa ou pagamento</option><option value="mudanca_escopo">Mudança de escopo ou serviço extra</option><option value="atraso_prorrogacao">Atraso ou prorrogação</option><option value="reajuste">Reajuste contratual</option><option value="reequilibrio">Reequilíbrio</option><option value="notificacao_sancao">Notificação ou sanção</option><option value="outro">Outro evento contratual</option></select></label>
<div class="contract-product-form__row"><label>Prazo da decisão ou resposta <input name="opportunity_deadline" type="date" required/></label><label>Estágio do evento <select name="contract_stage" required><option value="">Selecione</option><option value="identificado">Identificado</option><option value="documentando">Documentando</option><option value="quantificando">Quantificando</option><option value="em_resposta">Em resposta formal</option><option value="UNKNOWN">Ainda não definido</option></select></label></div>
${FIELDS_END}`;
}

function standaloneForm(item, { hub = false } = {}) {
  const slug = hub ? "servicos-obras-publicas" : item.route.slice(1, -1);
  const asset = hub ? "contract-defense-products" : `${slug}-contract-product`;
  return `<section class="contract-product__capture" id="captura-contrato"><div><h3>Registrar o contexto antes da proposta</h3><p>O envio abre análise humana de documentos e capacidade. Não conclui contratação nem substitui revisão jurídica.</p></div><form name="diagnostico-confenge" method="post" action="/.netlify/functions/lead" data-offer-id="" data-cta-id="${asset}-handraise" data-asset-id="${asset}" data-route-family="${slug}" data-cta-position="contract_capture"><input name="offer_id" type="hidden" value=""/><input name="terms_id" type="hidden" value=""/><input name="jornada" type="hidden" value="contrato"/><input name="estagio" type="hidden" value="${asset}"/><input name="origem" type="hidden" value="${slug}"/><input name="asset_id" type="hidden" value="${asset}"/><input name="cta_id" type="hidden" value="${asset}-handraise"/><input name="route_family" type="hidden" value="${slug}"/><input name="landing_page" type="hidden" value="https://confenge.com.br/${slug}/"/>${qualificationFields(item, hub)}<label>Nome do representante <input name="nome" autocomplete="name" required/></label><label>E-mail profissional <input name="email" type="email" autocomplete="email" required/></label><label>Contexto adicional <textarea name="mensagem" rows="3" maxlength="2000"></textarea></label><label class="contract-product__consent"><input name="consentimento" type="checkbox" value="1" required/> Autorizo o uso destes dados para retorno sobre esta demanda.</label><button class="button button-primary" type="submit">Enviar para análise</button><p class="form-status" role="status" aria-live="polite"></p></form></section>`;
}

function routeBlock(item, hasForm) {
  const gate = item.safe_deadline_gate?.statement_pt_br || `O prazo começa após os documentos mínimos válidos; confirme a data da decisão antes do envio.`;
  return `${ROUTE_START}
<section class="contract-product" aria-labelledby="contract-product-${item.item}"><div class="container"><header><p class="eyebrow">Unidade ${item.item} · preço-piloto</p><h2 id="contract-product-${item.item}">${esc(item.public_name_pt_br)}</h2><p>${esc(item.value_line_pt_br)}</p></header><dl class="contract-product__lockup"><div><dt>Preço-piloto</dt><dd>${price(item.pilot_price_cents)}</dd></div><div><dt>SLA</dt><dd>${item.sla_business_days} dias úteis</dd></div><div><dt>Unidade</dt><dd>${esc(item.scope_unit_pt_br)}</dd></div></dl><p>O preço-piloto cobre a leitura delimitada da unidade, a reconciliação dos documentos mínimos e a saída abaixo. Está em validação e remunera método e artefato, não resultado.</p><div class="contract-product__grid"><section><h3>Documento mínimo</h3><p>${esc(item.minimum_document_pt_br)}</p></section><section><h3>Saída</h3><p>${esc(publicEvidence(item.output_pt_br))}</p></section><section><h3>Não inclui</h3>${list(item.not_included_pt_br)}</section><section><h3>Prazo seguro</h3><p>${esc(gate)}</p><p>${esc(item.legal_boundary.statement_pt_br)}</p></section></div><article class="contract-product__example" aria-label="Exemplo sintético do método"><p data-evidence-grade="EVENT"><strong>Evento sintético</strong> Uma divergência é registrada no contrato demonstrativo.</p><p data-evidence-grade="FACT"><strong>Prova · Fato</strong> ${esc(publicEvidence(item.evidence_grades.FACT))}</p><p data-evidence-grade="CALCULATION"><strong>Cálculo</strong> ${esc(publicEvidence(item.evidence_grades.CALCULATION))}</p><p data-evidence-grade="INFERENCE"><strong>Leitura · Inferência</strong> ${esc(publicEvidence(item.evidence_grades.INFERENCE))}</p><p data-evidence-grade="UNKNOWN"><strong>Lacuna · Não informado</strong> ${esc(publicEvidence(item.evidence_grades.UNKNOWN))}</p><p data-evidence-grade="DECISION"><strong>Decisão</strong> ${esc(item.decision_question_pt_br)}</p></article>${hasForm ? '<p class="contract-product__action"><a class="button button-primary" href="#captura-pilar">Registrar este evento</a></p>' : standaloneForm(item)}</div></section>
${ROUTE_END}`;
}

function hubBlock() {
  const cards = contract.items.map((item) => {
    const slug = item.route?.replace(/^\/|\/$/g, "");
    const dedicatedRouteAvailable = item.route && !heldProtectedSlugs.has(slug);
    const action = dedicatedRouteAvailable
      ? `<a data-deliverable-id="${item.deliverable_id}" href="${item.route}">Ver escopo e exemplo</a>`
      : `<a data-deliverable-id="${item.deliverable_id}" href="#captura-contrato">Registrar este evento</a>`;
    return `<article class="contract-products-hub__card" id="entrega-${item.item}"><p>${String(item.item).padStart(2, "0")}</p><h3>${esc(item.public_name_pt_br)}</h3><p>${esc(item.value_line_pt_br)}</p><dl><div><dt>Preço-piloto</dt><dd>${price(item.pilot_price_cents)}</dd></div><div><dt>SLA</dt><dd>${item.sla_business_days} dias úteis</dd></div></dl>${action}</article>`;
  }).join("");
  return `${HUB_START}
<section class="contract-products-hub" aria-labelledby="contract-products-title"><div class="container"><header><p class="eyebrow">Escolha pelo evento que exige decisão</p><h2 id="contract-products-title">Sete eventos contratuais, cada um com um artefato para agir.</h2><p>O dossiê concentra contrato, registros e cálculo numa saída delimitada para a direção, a engenharia e o jurídico usarem sem reconstruir o caso do zero.</p></header><div class="contract-products-hub__grid">${cards}</div><aside class="contract-products-hub__rules" aria-label="Crédito, urgência e limites"><p>${esc(contract.common_rules.credit_rule.statement_pt_br)}</p><p>${esc(contract.common_rules.urgency_rule.statement_pt_br)}</p><p>${esc(contract.common_rules.public_sources_rule.statement_pt_br)}</p><p>${esc(contract.common_rules.obligation_rule.statement_pt_br)}</p></aside>${standaloneForm(null, { hub: true })}</div></section>
${HUB_END}`;
}

const updates = [];
for (const item of contract.items.filter((entry) => entry.page_file)) {
  const absolute = path.join(root, item.page_file);
  const current = fs.readFileSync(absolute, "utf8");
  if (isHeldProtected(item, current)) {
    updates.push({ absolute, current, next: current, held: true });
    continue;
  }
  const hasNativeCapture = current.includes('<section class="section pillar-capture"');
  const formMatch = hasNativeCapture
    ? current.match(/<form\b[^>]*action="\/\.netlify\/functions\/lead"[^>]*>/i)
    : null;
  let next = ensureCss(current);
  next = replaceBlock(next, ROUTE_START, ROUTE_END, routeBlock(item, Boolean(formMatch)), formMatch ? '<section class="section pillar-capture"' : "</main>");
  if (formMatch) {
    const fields = qualificationFields(item);
    if (next.includes(FIELDS_START)) next = replaceBlock(next, FIELDS_START, FIELDS_END, fields, "unused");
    else next = next.replace(formMatch[0], `${formMatch[0]}\n${fields}`);
  }
  updates.push({ absolute, current, next });
}
const hubPath = path.join(root, "servicos-obras-publicas/index.html");
const hubCurrent = fs.readFileSync(hubPath, "utf8");
let hubNext = ensureCss(hubCurrent);
hubNext = replaceBlock(hubNext, HUB_START, HUB_END, hubBlock(), "</main>");
updates.push({ absolute: hubPath, current: hubCurrent, next: hubNext });

if (process.argv.includes("--check")) {
  const drift = updates.filter(({ current, next }) => current !== next).map(({ absolute }) => path.relative(root, absolute));
  if (drift.length) { console.error(`CONTRACT_DEFENSE_PRODUCT_DRIFT: ${drift.join(", ")}`); process.exit(1); }
  console.log(`CONTRACT_DEFENSE_PRODUCTS_OK routes=${updates.filter((entry) => !entry.held).length - 1} held=${updates.filter((entry) => entry.held).length} hub=1`);
} else if (process.argv.includes("--write")) {
  for (const { absolute, next } of updates) fs.writeFileSync(absolute, next);
  console.log(`CONTRACT_DEFENSE_PRODUCTS_WRITTEN routes=${updates.filter((entry) => !entry.held).length - 1} held=${updates.filter((entry) => entry.held).length} hub=1`);
} else {
  console.error("usage: render_contract_defense_products.mjs --check|--write");
  process.exit(2);
}
