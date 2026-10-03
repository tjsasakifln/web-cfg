import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(".");
const PAGE = path.join(ROOT, "projetos-complementares-engenharia/index.html");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const mainOf = (html) => html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
const textOf = (html) => String(html)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

test("institutional route states disciplines, deliverables and proposal factors", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  const main = mainOf(html);
  const text = textOf(main);
  assert.match(html, /<title>Projetos complementares de engenharia \| CONFENGE<\/title>/);
  assert.match(main, /Solicitar proposta de projetos complementares/);
  for (const expected of [
    "Estruturas",
    "Instalações",
    "Infraestrutura",
    "Coordenação",
    "Desenhos técnicos",
    "Memórias e especificações",
    "Coordenação e revisões",
    "Responsabilidade técnica",
  ]) {
    assert.match(text, new RegExp(expected, "i"), expected);
  }
  assert.match(text, /entregas, revisões, prazo, investimento e responsáveis/i);
});

test("three technical figures prove a discipline, package composition and revision cycle", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  assert.match(html, /assets\/pranchas\/drenagem-rede-(?:desktop|mobile)\.svg/);
  for (const id of ["pacote-entrega", "interfaces-versoes"]) {
    const desktop = `assets/projetos-complementares-engenharia/${id}.svg`;
    const mobile = `assets/pranchas/${id}-mobile.svg`;
    assert.equal(fs.existsSync(path.join(ROOT, desktop)), true, desktop);
    assert.equal(fs.existsSync(path.join(ROOT, mobile)), true, mobile);
    assert.match(html, new RegExp(`src="/${desktop.replaceAll("/", "\\/")}"`));
    assert.match(html, new RegExp(`srcset="/${mobile.replaceAll("/", "\\/")}"`));
  }
  assert.match(textOf(html), /arquitetura de origem permanece identificada com seu autor/i);
  assert.match(textOf(html), /versão devolvida registra data, responsável e mudança/i);
});

test("canonical deliverables fragment and legacy alias both resolve", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  assert.match(html, /id="entregas-servico"/);
  assert.match(html, /id="entregaveis"/);
  assert.match(read("parcerias-engenharia/index.html"), /projetos-complementares-engenharia\/#entregas-servico/);
});

test("authorship and demonstrative boundaries stay factual", () => {
  const text = textOf(fs.readFileSync(PAGE, "utf8"));
  assert.match(text, /Cada especialidade é atribuída ao profissional habilitado indicado na proposta/i);
  assert.match(text, /Exemplo demonstrativo/i);
  assert.match(text, /sem dimensionamento de um empreendimento real/i);
  assert.doesNotMatch(text, /habilitação irrestrita|assinamos projeto alheio|aprovação garantida|conformidade total/i);
  assert.doesNotMatch(text, /R\$\s*\d|\d+\s+dias úteis|\d+\s+revisões incluídas/i);
});

test("contact accepts useful references through three channels with a privacy boundary", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  const main = mainOf(html);
  assert.equal((html.match(/data-fallback-channel=/g) || []).length, 3);
  assert.match(main, /https:\/\/wa\.me\/5548988344559/);
  assert.match(main, /mailto:tiago\.sasaki@confenge\.com\.br/);
  assert.match(main, /tel:\+5548988344559/);
  assert.match(main, /referências não sigilosas por WhatsApp ou e-mail/i);
  assert.match(main, /material exigir controle de acesso ou contiver dados sensíveis, combinamos o canal adequado/i);
  assert.match(main, /href="\/privacidade\/"/);
  assert.doesNotMatch(html, /name="(?:arquivo|upload|endereco|cpf|processo)"/i);
});
