#!/usr/bin/env node
/*
 * Canais contextuais das rotas privadas manuais (CONFENGE-BOFU-FECHAMENTO-20260919, WS-E).
 *
 * Contraprovas estáticas, lidas da fonte, dos achados FAMILIAS-PRIVADAS-A-01,
 * A-06, A-07, B-02 e B-06: cada situação nomeada tem o seu canal com
 * mensagem própria; todo canal do herói e do bloco de contato carrega
 * data-cta-id e a família da rota; o caminho "escrever com calma" leva a uma
 * página com formulário (ou carrega o tema). O mesmo módulo é consumido por
 * test_contact_journeys.mjs antes do navegador; aqui roda sem artefato:
 *
 *   node scripts/site/test_private_route_channels.mjs [--root <dir>]
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const PRIVATE_ROUTES = [
  "inspecao-diagnostico-edificacoes",
  "seguranca-trabalho-apoio-tecnico",
  "assistencia-tecnica-pericial-engenharia",
  "projetos-complementares-engenharia",
  "revisao-tecnica-projetos-engenharia",
  "compatibilizacao-projetos-engenharia",
  "quantitativos-orcamento-obras",
];
// A-01: cada situação da inspeção sai com a sua própria mensagem.
const INSPECTION_SITUATIONS = [
  ["recebimento-entrega", /recebimento|entrega/i],
  ["reforma-condominio", /reforma/i],
  ["documentacao-as-built", /constru[íi]do|as-built/i],
];

function mainOf(html) { return html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || ""; }
function attr(tag, name) { return tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? null; }
function anchors(fragment) { return [...fragment.matchAll(/<a\b[^>]*>/gi)].map(m => m[0]); }
function waText(tag) {
  const href = attr(tag, "href") || "";
  const m = href.match(/^https:\/\/wa\.me\/\d+\?text=([^"&]*)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}
function block(html, openRe) {
  // Bloco de um elemento identificado (li ou section) até o fechamento do mesmo tipo,
  // respeitando aninhamento.
  const open = html.match(openRe);
  if (!open) return "";
  const tag = open[0].match(/^<(\w+)/)[1];
  let depth = 0;
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "gi");
  re.lastIndex = open.index;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("</")) { depth -= 1; if (depth === 0) return html.slice(open.index, m.index + m[0].length); }
    else depth += 1;
  }
  return html.slice(open.index);
}

export function privateRouteChannelProblems(root = here) {
  const problems = [];
  const pages = new Map();
  for (const route of PRIVATE_ROUTES) {
    const file = join(root, route, "index.html");
    if (!existsSync(file)) { problems.push(`${route}: index.html ausente em ${root}`); continue; }
    pages.set(route, readFileSync(file, "utf8"));
  }

  // A-07 / B-06: herói com três canais nomeados e família igual à do contato.
  for (const [route, html] of pages) {
    const main = mainOf(html);
    const hero = block(main, /<section\b[^>]*class="svc-open"[^>]*>/i);
    const contactFamily = anchors(main).map(a => attr(a, "data-fallback-channel") ? attr(a, "data-route-family") : null).find(Boolean);
    if (!contactFamily) problems.push(`/${route}/: bloco de contato sem data-route-family`);
    const heroChannels = anchors(hero).filter(a => /href="(?:https:\/\/wa\.me\/|mailto:|tel:)/i.test(a));
    const kinds = new Set(heroChannels.map(a => (attr(a, "href") || "").replace(/^(https:\/\/wa\.me\/|mailto:|tel:).*/i, "$1")));
    if (kinds.size < 3) problems.push(`/${route}/: herói sem os três canais diretos (${[...kinds].join(", ") || "nenhum"})`);
    for (const a of heroChannels) {
      if (!attr(a, "data-cta-id")) problems.push(`/${route}/: canal do herói sem data-cta-id: ${attr(a, "href")?.slice(0, 40)}`);
      if (contactFamily && attr(a, "data-route-family") !== contactFamily) problems.push(`/${route}/: canal do herói sem data-route-family=${contactFamily}: ${attr(a, "href")?.slice(0, 40)}`);
    }
    for (const a of anchors(main).filter(a => /href="(?:https:\/\/wa\.me\/|mailto:)/i.test(a))) {
      if (!attr(a, "data-cta-id")) problems.push(`/${route}/: WhatsApp ou e-mail em <main> sem data-cta-id: ${attr(a, "href")?.slice(0, 60)}`);
    }
    // A-06: "escrever com calma" leva a formulário ou carrega o tema.
    const calm = anchors(main.match(/<p class="contact-note">Se preferir escrever com calma[\s\S]*?<\/p>/i)?.[0] || "");
    for (const a of calm) {
      const href = attr(a, "href") || "";
      const path = href.replace(/[?#].*$/, "");
      const target = join(root, path === "/" || path === "" ? "index.html" : `${path.replace(/^\/|\/$/g, "")}/index.html`);
      const hasForm = existsSync(target) && /<form\b/i.test(readFileSync(target, "utf8"));
      const hasTema = /[?&]tema=/.test(href) || Boolean(attr(a, "data-tema"));
      if (!hasForm && !hasTema) problems.push(`/${route}/: 'escrever com calma' leva a ${href} (sem formulário e sem tema)`);
    }
  }

  // A-08: enquanto a autoridade do intake adaptativo não estiver FINAL, nenhuma
  // rota privada carrega /assets/js/adaptive-intake.js (requisição morta: a
  // página não tem formulário e o endpoint responde 503).
  const authorityFile = join(root, "netlify/functions/data/adaptive-intake-authority.json");
  const authorityStatus = existsSync(authorityFile) ? JSON.parse(readFileSync(authorityFile, "utf8")).status : "WITHHELD";
  if (authorityStatus !== "FINAL") {
    for (const [route, html] of pages) {
      if (/<script\b[^>]*\bsrc="\/assets\/js\/adaptive-intake\.js"/i.test(html)) problems.push(`/${route}/: carrega /assets/js/adaptive-intake.js com autoridade ${authorityStatus}`);
    }
  }

  // A-01: inspeção, um WhatsApp por situação e mensagens distintas na página.
  const inspection = mainOf(pages.get("inspecao-diagnostico-edificacoes") || "");
  for (const [id, pattern] of INSPECTION_SITUATIONS) {
    const li = block(inspection, new RegExp(`<li\\b[^>]*id="${id}"[^>]*>`, "i"));
    const texts = anchors(li).map(waText).filter(Boolean);
    if (!texts.some(t => pattern.test(t))) problems.push(`/inspecao-diagnostico-edificacoes/#${id}: sem WhatsApp cujo texto cite ${pattern}`);
  }
  const distinct = new Set(anchors(inspection).map(waText).filter(Boolean));
  if (distinct.size < 4) problems.push(`/inspecao-diagnostico-edificacoes/: ${distinct.size} mensagem(ns) de WhatsApp distinta(s), mínimo 4`);

  // B-02: disputa trabalhista com prova rotulada e canal próprio.
  const labor = block(mainOf(pages.get("seguranca-trabalho-apoio-tecnico") || ""), /<section\b[^>]*id="assistencia-trabalhista"[^>]*>/i);
  if (!/<(figure|table)\b[\s\S]*?demonstrativ/i.test(labor)) problems.push("/seguranca-trabalho-apoio-tecnico/#assistencia-trabalhista: sem figure/table rotulada como demonstrativa");
  if (!anchors(labor).map(waText).filter(Boolean).some(t => /trabalhista/i.test(t))) problems.push("/seguranca-trabalho-apoio-tecnico/#assistencia-trabalhista: sem WhatsApp cujo texto cite 'trabalhista'");
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const idx = process.argv.indexOf("--root");
  const root = idx > 0 ? resolve(process.argv[idx + 1]) : here;
  const problems = privateRouteChannelProblems(root);
  if (problems.length) {
    console.error(`PRIVATE_ROUTE_CHANNELS_FAIL (${problems.length})`);
    for (const p of problems) console.error("  " + p);
    process.exit(1);
  }
  console.log(`PRIVATE_ROUTE_CHANNELS_OK routes=${PRIVATE_ROUTES.length} root=${root}`);
}
