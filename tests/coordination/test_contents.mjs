import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WHEN = path.join(root, "conteudos/quando-compatibilizar-projetos/index.html");
const HOW = path.join(root, "conteudos/como-contratar-compatibilizacao-projetos/index.html");
const CONTRACT = path.join(root, "data/coordination/route-contract.v1.json");

function visible(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function mainHtml(html) {
  return html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
}

test("the two contents answer distinct visitor jobs", () => {
  const when = fs.readFileSync(WHEN, "utf8");
  const how = fs.readFileSync(HOW, "utf8");
  const contract = JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
  assert.equal(contract.contents[0].path, "/conteudos/quando-compatibilizar-projetos/");
  assert.equal(contract.contents[1].path, "/conteudos/como-contratar-compatibilizacao-projetos/");
  assert.match(visible(when), /Quando compatibilizar os projetos que você já tem/);
  assert.match(visible(how), /Como contratar a compatibilização de projetos/);
  assert.match(visible(when), /se a conferência de interfaces cabe agora/);
  assert.match(visible(how), /fecha escopo, insumos e entrega/);
  assert.notEqual(visible(mainHtml(when)).slice(0, 400), visible(mainHtml(how)).slice(0, 400));
});

test("when-to-hire points to the commercial destination, not generic contact for every question", () => {
  const html = fs.readFileSync(WHEN, "utf8");
  const main = mainHtml(html);
  assert.match(main, /href="\/compatibilizacao-projetos-engenharia\/"/);
  assert.match(main, /href="\/conteudos\/como-contratar-compatibilizacao-projetos\/"/);
  assert.match(main, /href="\/servicos\/#servico-projeto"/);
  assert.match(main, /href="\/quantitativos-orcamento-obras\/"/);
  assert.match(visible(main), /Falta elaborar ou completar uma disciplina/);
  assert.match(visible(main), /dimensionamento de uma peça/);
  assert.equal(main.includes("/#contato"), false);
  assert.equal(main.includes("utm_"), false);
  assert.match(main, /data-fallback-channel="whatsapp"/);
  assert.match(html, /index,follow/);
});

test("how-to-hire delimits scope, inputs and delivery with a coherent next step", () => {
  const html = fs.readFileSync(HOW, "utf8");
  const main = mainHtml(html);
  assert.match(main, /href="\/compatibilizacao-projetos-engenharia\/#pedido-compatibilizacao"/);
  assert.match(main, /href="\/conteudos\/quando-compatibilizar-projetos\/"/);
  assert.match(visible(main), /Texto primeiro/);
  assert.match(visible(main), /não recebe upload/i);
  assert.match(visible(main), /Modelo não é requisito/);
  assert.match(visible(main), /ajuste pendente do autor/);
  assert.match(visible(main), /revisão nova não herda a conferência anterior/i);
  assert.doesNotMatch(visible(main), /\d+\s?%/);
  assert.equal(main.includes("utm_"), false);
  assert.match(main, /data-fallback-channel="whatsapp"/);
});

test("contents invent no cost-reduction percentages and keep sibling purchases distinct", () => {
  for (const file of [WHEN, HOW]) {
    const html = fs.readFileSync(file, "utf8");
    const text = visible(html);
    assert.doesNotMatch(text, /\d+\s?%/);
    assert.doesNotMatch(text, /redu[çc][aã]o de custos/i);
    assert.doesNotMatch(text, /software/i);
    assert.equal(html.includes("/compatibilizacao-revisao/"), false);
    assert.match(html, /data-intent-family="projetar_revisar_compatibilizar"/);
    assert.match(html, /data-service-family="engineering_projects_coordination"/);
  }
});
