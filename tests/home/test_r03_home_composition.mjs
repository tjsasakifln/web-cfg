#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/home-10x.css"), "utf8");
const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";

function indexOfOrFail(fragment, label = fragment) {
  const position = main.indexOf(fragment);
  assert.notEqual(position, -1, label);
  return position;
}

// A abertura declara a empresa e a amplitude pública/privada antes de qualquer
// especialidade. A chamada principal chega ao contato genérico.
const opening = main.match(/<section[^>]+class="[^"]*home-opening[^"]*"[\s\S]*?<\/section>/i)?.[0] || "";
assert.match(opening, /Empresa de engenharia para necessidades públicas e privadas/);
assert.match(opening, /href="#contato"/);
assert.doesNotMatch(opening, /data-(?:tema|journey|route-family)=/);

// As sete frentes oficiais ficam visíveis, uma vez cada, imediatamente depois
// da abertura. A ordem do documento protege a escolha antes do aprofundamento.
const routeIds = [
  "home-service-projects",
  "home-private-quantities-budget",
  "home-service-inspection",
  "home-service-expert-evidence",
  "home-service-valuation",
  "home-service-sst",
  "home-service-public-works",
];
for (const id of routeIds) {
  assert.equal((main.match(new RegExp(`data-cta-id="${id}"`, "g")) || []).length, 1, id);
}
const openingPosition = indexOfOrFail("class=\"hero home-opening\"", "abertura");
const routesPosition = indexOfOrFail("class=\"section home-services\"", "sete frentes");
const conductionPosition = indexOfOrFail("class=\"section home-conduction\"", "condução transversal");
const evidencePosition = indexOfOrFail("class=\"section home-evidence\"", "entregas e provas");
const contextsPosition = indexOfOrFail("class=\"section home-contexts\"", "contextos");
const companyPosition = indexOfOrFail("class=\"section home-company\"", "empresa");
const contactPosition = indexOfOrFail("id=\"contato\"", "contato");
assert.deepEqual(
  [openingPosition, routesPosition, conductionPosition, evidencePosition, contextsPosition, companyPosition, contactPosition],
  [...[openingPosition, routesPosition, conductionPosition, evidencePosition, contextsPosition, companyPosition, contactPosition]].sort((a, b) => a - b),
);
assert.match(main, /class="section home-evidence" data-section-archetype="content_editorial"/);
assert.match(main, /class="section home-contexts" data-section-archetype="sector_editorial"/);

// Contraprova editorial: o miolo antigo voltado a disciplinas e ao processo de
// projeto não pode reaparecer depois das sete escolhas.
assert.doesNotMatch(main, /Competências de projeto|Onde projetamos|Do conceito à documentação/);
assert.doesNotMatch(main, /class="[^"]*(?:home-capabilities|home-sectors|home-delivery-flow)[^"]*"/);
assert.match(main, /Um projeto, uma inspeção, uma avaliação, uma perícia, uma documentação de SST ou uma questão de obra pública exigem métodos diferentes/);

// Provas de naturezas distintas permanecem identificadas e levam a recursos
// públicos existentes, sem criar alegação de cliente.
for (const href of [
  "/casos/demonstrativo-projeto-privado/",
  "/entregas/",
  "/casos/medicao-glosa-demonstrativo/",
]) {
  assert.match(main, new RegExp(`href="${href.replaceAll("/", "\\/")}"`));
  assert.equal(fs.existsSync(path.join(root, href.slice(1), "index.html")), true, href);
}
assert.match(main, /Quando um material é demonstrativo, ele permanece identificado como tal/);
assert.doesNotMatch(main, /caso de cliente|cliente atendido|resultado comprovado/i);

// Condomínios e Parcerias são caminhos contextuais posteriores às sete frentes.
assert.match(main, /data-cta-id="home-context-condominiums"[^>]+href="\/engenharia-condominios\/"/);
assert.match(main, /data-cta-id="home-context-partners"[^>]+href="\/parcerias-engenharia\/"/);

// A visita genérica não entra no formulário com assunto ou jornada escolhidos.
assert.match(main, /<option disabled="" selected="" value="">Selecione<\/option>/);
assert.match(main, /name="jornada" id="jornada-hidden" type="hidden" value=""/);
assert.match(main, /<input name="origem" type="hidden" value="\/"\/>/);

// O CSS mantém as novas seções responsivas e os alvos essenciais operáveis.
assert.match(css, /\.home-conduction__flow\{display:grid;grid-template-columns:repeat\(4/);
assert.match(css, /\.home-evidence__grid\{display:grid;grid-template-columns:repeat\(3/);
assert.match(css, /@media \(max-width:620px\)[\s\S]*\.home-conduction__flow\{grid-template-columns:1fr/);
assert.match(css, /\.home-evidence__grid a\{[^}]*min-height:44px/);

console.log("OK R03 home composition");
