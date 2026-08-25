#!/usr/bin/env node

/** Render the public #330 product ladder from versioned commercial contracts. */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contractPath = path.join(root, "data/commercial/page-contract-licitacao.v1.json");
const examplesPath = path.join(root, "data/commercial/examples-licitacao.synthetic.v1.json");
const pagePath = path.join(root, "diagnostico-pre-licitacao/index.html");
const START = "<!-- GENERATED:LICITACAO-PRODUCTS:START -->";
const END = "<!-- GENERATED:LICITACAO-PRODUCTS:END -->";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function list(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function exampleBlock(example) {
  const evidence = [
    ["Fato do cenário", example.facts_synthetic_pt_br],
    ["Cálculo do cenário", example.calculations_synthetic_pt_br],
    ["Inferência do cenário", example.inferences_synthetic_pt_br],
    ["Desconhecido", example.unknowns_pt_br],
  ];
  return `<aside class="licitacao-example" aria-labelledby="example-${example.deliverable_id}">
<header><span>Amostra sintética</span><h4 id="example-${example.deliverable_id}">${escapeHtml(example.decision_pt_br)}</h4><p>${escapeHtml(example.scenario_pt_br)}</p></header>
<div class="licitacao-example__evidence">${evidence.map(([label, values]) => `<section><h5>${label}</h5>${list(values)}</section>`).join("")}</div>
<p class="licitacao-example__next"><strong>Próxima ação demonstrativa:</strong> ${escapeHtml(example.next_action_pt_br)}</p>
</aside>`;
}

function tierBlock(item) {
  const tiers = item.price.tiers || [];
  if (!tiers.length) return "";
  return `<section class="licitacao-product__tiers" aria-label="Enquadramentos e preços"><h4>Enquadramento definido na triagem</h4><div>${tiers.map((tier) => `<article><h5>${escapeHtml(tier.tier)}</h5><strong>${escapeHtml(tier.display_pt_br)}</strong><p>${escapeHtml(tier.framing_pt_br)}</p></article>`).join("")}</div></section>`;
}

function productBlock(item, example) {
  const id = item.deliverable_id;
  return `<article class="licitacao-product" data-deliverable-id="${id}" id="unidade-${item.item}">
<header class="licitacao-product__head"><span>${String(item.item).padStart(2, "0")}</span><div><p>Unidade comercial delimitada</p><h3>${escapeHtml(item.public_name_pt_br)}</h3><p>${escapeHtml(item.value_line_pt_br)}</p></div></header>
<p class="licitacao-product__question">${escapeHtml(item.decision_question_pt_br)}</p>
<dl class="licitacao-product__terms"><div><dt>Preço-piloto</dt><dd>${escapeHtml(item.price.display_pt_br)}</dd></div><div><dt>Prazo</dt><dd>${escapeHtml(item.sla_business_days.display_pt_br)}</dd></div><div><dt>Escopo</dt><dd>${escapeHtml(item.scope_note_pt_br)}</dd></div></dl>
${item.safe_deadline_statement_pt_br ? `<p class="licitacao-product__deadline"><strong>Prazo mínimo seguro:</strong> ${escapeHtml(item.safe_deadline_statement_pt_br)}</p>` : ""}
${tierBlock(item)}
<div class="licitacao-product__scope"><section><h4>O cliente fornece</h4>${list(item.required_inputs_pt_br)}</section><section><h4>A CONFENGE entrega</h4>${list(item.output_pt_br)}</section><section><h4>Não inclui</h4>${list(item.exclusions_pt_br)}</section></div>
${exampleBlock(example)}
<a class="button button-secondary" data-asset-id="${id}" data-cta-id="licitacao-fit-${item.item}" data-cta-position="licitacao_product" data-deliverable-id="${id}" data-event-name="cta_click" href="#captura-licitacao">Pedir análise desta unidade</a>
</article>`;
}

function form(contract) {
  const options = contract.items.map((item) => `<option value="${item.deliverable_id}">${String(item.item).padStart(2, "0")} · ${escapeHtml(item.public_name_pt_br)}</option>`).join("");
  return `<section class="section pillar-capture" id="captura-licitacao" data-section-archetype="cta_formal" aria-labelledby="captura-licitacao-title">
<div class="container pillar-capture-grid"><div class="pillar-capture-copy"><p class="eyebrow">Triagem antes da proposta</p><h2 id="captura-licitacao-title">Registre a decisão e o prazo do edital.</h2><p>Informe apenas identificadores públicos e contexto de enquadramento. Não envie planilha, atestado, senha, token, certificado digital nem documento pessoal neste formulário.</p><p>Preço-piloto não significa contratação automática: escopo, prazo seguro e capacidade passam por revisão humana.</p></div>
<form class="pillar-capture-form licitacao-capture-form" name="diagnostico-confenge" method="post" action="/.netlify/functions/lead" data-offer-id="" data-cta-id="licitacao-products-handraise" data-asset-id="licitacao-products" data-route-family="diagnostico-pre-licitacao" data-cta-position="product_capture" data-journey="edital">
<input type="hidden" name="offer_id" value=""><input type="hidden" name="terms_id" value=""><input type="hidden" id="jornada-hidden" name="jornada" value="edital"><input type="hidden" id="estagio" name="estagio" value="licitacao-produto"><input type="hidden" name="origem" value="diagnostico-pre-licitacao"><input type="hidden" name="asset_id" value="licitacao-products"><input type="hidden" name="cta_id" value="licitacao-products-handraise"><input type="hidden" name="route_family" value="diagnostico-pre-licitacao"><input type="hidden" name="landing_page" value="https://confenge.com.br/diagnostico-pre-licitacao/">
<label>Unidade para a decisão <select id="deliverable-id" name="deliverable_id" required><option value="">Selecione uma unidade</option>${options}</select></label>
<label>Identificador público do edital <input name="public_contract_id" maxlength="80" required placeholder="Número do edital ou identificador PNCP"></label>
<div class="licitacao-capture-form__row"><label>Prazo da proposta <input name="opportunity_deadline" type="date" required></label><label>Quantidade de lotes <input name="lot_count" type="number" inputmode="numeric" min="1" max="999" required></label></div>
<label>Faixa de valor estimado <select name="contract_value_band" required><option value="">Selecione</option><option value="ate_5m">Até R$ 5 milhões</option><option value="5m_20m">De R$ 5 milhões a R$ 20 milhões</option><option value="20m_100m">De R$ 20 milhões a R$ 100 milhões</option><option value="acima_100m">Acima de R$ 100 milhões</option><option value="UNKNOWN">Ainda não identificado</option></select></label>
<label>Regime de execução <select name="execution_regime" required><option value="">Selecione</option><option value="empreitada_preco_global">Empreitada por preço global</option><option value="empreitada_preco_unitario">Empreitada por preço unitário</option><option value="contratacao_integrada">Contratação integrada</option><option value="contratacao_semi_integrada">Contratação semi-integrada</option><option value="outro">Outro regime</option><option value="UNKNOWN">Ainda não identificado</option></select></label>
<label>Decisão que precisa tomar <select name="decision_intent" required><option value="">Selecione</option><option value="avaliar_disputa">Avaliar se deve disputar</option><option value="avancar">Avançar</option><option value="avancar_condicoes">Avançar com condições</option><option value="esclarecer_impugnar">Esclarecer ou impugnar</option><option value="recusar">Recusar a oportunidade</option><option value="UNKNOWN">Ainda não definida</option></select></label>
<label>Nome do representante <input id="nome" name="nome" required autocomplete="name"></label><label>Empresa <input id="empresa" name="empresa" autocomplete="organization"></label><label>E-mail profissional <input id="email" name="email" type="email" autocomplete="email"></label><label>WhatsApp <input id="telefone" name="telefone" inputmode="numeric" autocomplete="tel"></label><label>Contexto sem documento sigiloso <textarea id="mensagem" name="mensagem" rows="4" maxlength="2000" placeholder="Decisão a tomar e condição que impede avançar."></textarea></label><label class="capture-consent"><input type="checkbox" name="consentimento" value="1" required> Autorizo o uso destes dados para retorno sobre esta demanda.</label><button class="button button-primary" type="submit">Enviar para análise</button><p class="form-status" role="status" aria-live="polite"></p>
</form></div></section>`;
}

export function render(contract, examplesDoc) {
  const examples = new Map(examplesDoc.examples.map((entry) => [entry.deliverable_id, entry]));
  const nav = contract.items.map((item) => `<a href="#unidade-${item.item}"><span>${String(item.item).padStart(2, "0")}</span>${escapeHtml(item.public_name_pt_br)}</a>`).join("");
  return `${START}
<section class="licitacao-products" id="unidades-licitacao" data-section-archetype="compare_ladder" aria-labelledby="licitacao-products-title">
<div class="container"><header class="licitacao-products__intro"><p class="eyebrow">Cinco decisões diferentes</p><h2 id="licitacao-products-title">Triagem, habilitação, orçamento, concorrência e coordenação não são o mesmo trabalho.</h2><p>Compare o objeto, o artefato e a fronteira antes de mobilizar a equipe. Todos os valores são preços-piloto e nenhuma unidade promete vitória, habilitação ou preço vencedor.</p></header><nav class="licitacao-products__nav" aria-label="Escolher unidade comercial">${nav}</nav>
<div class="licitacao-products__list">${contract.items.map((item) => productBlock(item, examples.get(item.deliverable_id))).join("\n")}</div>
<aside class="licitacao-products__rules"><h3>Crédito e urgência sem dupla cobrança</h3><p>${escapeHtml(contract.credit_rule.statement_pt_br)}</p><p>${escapeHtml(contract.urgency_rule.statement_pt_br)}</p></aside></div>
</section>
${form(contract)}
${END}`;
}

function replaceBlock(html, rendered) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < start) throw new Error("licitacao product markers missing");
  return `${html.slice(0, start)}${rendered}${html.slice(end + END.length)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const examples = JSON.parse(fs.readFileSync(examplesPath, "utf8"));
  const current = fs.readFileSync(pagePath, "utf8");
  const next = replaceBlock(current, render(contract, examples));
  if (process.argv.includes("--check")) {
    if (next !== current) {
      console.error("LICITACAO_PRODUCTS_DRIFT: run render_licitacao_products.mjs --write");
      process.exit(1);
    }
    console.log(`LICITACAO_PRODUCTS_OK items=${contract.items.length} examples=${examples.examples.length}`);
  } else if (process.argv.includes("--write")) {
    fs.writeFileSync(pagePath, next);
    console.log(`LICITACAO_PRODUCTS_WRITTEN items=${contract.items.length} examples=${examples.examples.length}`);
  } else {
    console.error("usage: render_licitacao_products.mjs --check|--write");
    process.exit(2);
  }
}
