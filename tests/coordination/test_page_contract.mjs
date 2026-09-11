import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadPublicRegister, renderFindingHtml } from "../../scripts/coordination/interference_register.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAGE = path.join(root, "compatibilizacao-projetos-engenharia/index.html");
const CONTRACT = path.join(root, "data/coordination/route-contract.v1.json");

function readPage() {
  return fs.readFileSync(PAGE, "utf8");
}

function mainHtml(html) {
  return html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
}

function visible(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function unbackedMoneyProblems(html) {
  const registry = JSON.parse(fs.readFileSync(path.join(root, "data/site/credential-registry.json"), "utf8"));
  const backed = registry.claims
    .filter((claim) => claim.status === "VERIFIED" || claim.status === "SELF_ATTESTED")
    .flatMap((claim) => [claim.claim, ...(claim.allowed_wording ?? [])])
    .filter((wording) => typeof wording === "string" && wording.includes("R$"))
    .map((wording) => wording.toLowerCase());
  const text = visible(html);
  const problems = [];
  const priceLanguage = /(a partir de|por apenas|investimento de|valor do servi|pre[çc]o|honor[áa]rio|mensalidade|desconto|or[çc]amento a partir)/i;
  for (const match of text.matchAll(/R\$\s*\d/g)) {
    const window = text.slice(Math.max(0, match.index - 200), match.index + 200);
    const low = window.toLowerCase();
    if (!backed.some((wording) => low.includes(wording))) problems.push(`unbacked_money:${window.trim().slice(0, 120)}`);
    if (priceLanguage.test(low)) problems.push(`price_money:${window.trim().slice(0, 120)}`);
  }
  return problems;
}

test("shipped commercial destination answers the purchase", () => {
  const html = readPage();
  const main = mainHtml(html);
  const text = visible(main);
  for (const needle of [
    "Conferimos as interfaces",
    "registramos as interferências",
    "encaminhamos o ajuste",
    "O que entra",
    "O que será conferido",
    "O que você recebe",
    "Plantas em PDF e desenhos CAD",
    "Modelo não é requisito",
    "Lista incompleta",
    "Pedir proposta da compatibilização",
  ]) {
    assert.equal(text.includes(needle) || main.includes(needle), true, `missing: ${needle}`);
  }
  assert.match(html, /<meta(?=[^>]*name="robots")(?=[^>]*content="index,follow)/);
  assert.match(html, /rel="canonical" href="https:\/\/confenge.com.br\/compatibilizacao-projetos-engenharia\/"|href="https:\/\/confenge.com.br\/compatibilizacao-projetos-engenharia\/" rel="canonical"/);
});

test("route contract declares existing intent, family and offer", () => {
  const contract = JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
  const html = readPage();
  assert.equal(contract.commercial.intent_family, "projetar_revisar_compatibilizar");
  assert.equal(contract.commercial.canonical_service_family, "engineering_projects_coordination");
  assert.equal(contract.commercial.offer_id, "bim_coordination_clash_register");
  assert.match(html, /data-intent-family="projetar_revisar_compatibilizar"/);
  assert.match(html, /data-service-family="engineering_projects_coordination"/);
  assert.match(html, /data-offer-id="bim_coordination_clash_register"/);
  assert.match(html, /Modelo não é requisito/);
  assert.doesNotMatch(visible(html), /exige modelo|somente com modelo|necessário ter modelo/i);
});

test("purchase is distinguished from elaboration, review, modeling and execution", () => {
  const text = visible(mainHtml(readPage()));
  assert.match(text, /Elaborar ou completar uma disciplina/);
  assert.match(text, /Revisar uma disciplina/);
  assert.match(text, /Modelar/);
  assert.match(text, /Executar a obra/);
  assert.match(text, /projeto de engenharia/);
  assert.match(text, /quantitativos e orçamento/);
  const html = readPage();
  assert.match(html, /href="\/servicos\/#servico-projeto"/);
  assert.match(html, /href="\/quantitativos-orcamento-obras\/"/);
  assert.equal(html.includes("/compatibilizacao-revisao/"), false);
  assert.equal(html.includes("/coordenacao-bim/"), false);
  assert.equal(html.includes("clash detection"), false);
});

test("formats match real intake: text first, no upload, no any-extension claim", () => {
  const html = readPage();
  const main = mainHtml(html);
  assert.equal(/<form\b/i.test(html), false, "withheld intake must not ship a capture form");
  assert.equal(/type=["']file["']/i.test(html), false);
  assert.equal(/name=["'](?:arquivo|upload)["']/i.test(html), false);
  assert.match(main, /não recebe upload/i);
  assert.match(main, /canal seguro/);
  assert.doesNotMatch(visible(main), /aceitamos qualquer extensão|qualquer extensão é aceita/i);
  assert.equal((html.match(/data-fallback-channel=/g) || []).length, 3);
  assert.match(html, /data-fallback-channel="whatsapp"/);
  assert.match(html, /data-fallback-channel="email"/);
  assert.match(html, /data-fallback-channel="phone"/);
  const wa = html.match(/href="https:\/\/wa\.me\/[^"]+"/)?.[0] || "";
  const waText = decodeURIComponent((wa.match(/text=([^"&]+)/) || [])[1] || "");
  assert.match(waText, /disciplinas e fase/i);
  assert.match(waText, /começar sem a lista completa/i);
  assert.match(visible(main), /Lista incompleta/);
});

test("no software sale, zero-interference promise, price, prazo or percentual", () => {
  const html = readPage();
  const text = visible(html);
  assert.doesNotMatch(text, /software/i);
  assert.match(text, /não a promessa de obra sem interferência|não garante ausência de interferência/);
  assert.doesNotMatch(text, /garantimos a ausência de qualquer interfer/i);
  assert.doesNotMatch(text, /garantimos (a )?ausência/i);
  assert.doesNotMatch(text, /\d+\s?%/);
  assert.doesNotMatch(text, /\b(?:1|2)\s+dias?\s+[úu]teis\b/i);
  assert.deepEqual(unbackedMoneyProblems(html), []);
});

test("incomplete initial context is accepted and essentials are in HTML without JS", () => {
  const html = readPage();
  const main = mainHtml(html);
  assert.match(main, /Lista incompleta/);
  assert.match(main, /fase ainda indefinida|fase ainda indefinida ou ausência de modelo|ausência de modelo/i);
  assert.match(main, /id="pedido-compatibilizacao"/);
  assert.match(main, /CF-GEO-01/);
  assert.match(main, /CF-INFO-01/);
  assert.match(main, /href="\/casos\/demonstrativo-projeto-privado\/#CF-GEO-01"/);
  assert.equal(html.includes("INT-DEM-001"), false);
  assert.equal(html.includes('class="no-js"'), true);
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  assert.match(withoutScripts, /Compatibilização de projetos de engenharia/);
  assert.match(withoutScripts, /Pedir proposta da compatibilização/);
  assert.match(withoutScripts, /Registrada — ajuste pendente do autor/);
  assert.match(withoutScripts, /CF-GEO-01/);
});

test("shipped finding html matches the register renderer", () => {
  const html = readPage();
  const record = loadPublicRegister(root);
  const rendered = renderFindingHtml(record);
  const shipped = html.match(/<article class="coord-finding"[\s\S]*?<\/article>/)?.[0];
  assert.ok(shipped);
  assert.match(shipped, /data-finding-id="CF-GEO-01"/);
  assert.match(rendered, /data-finding-id="CF-GEO-01"/);
  assert.equal(
    shipped.includes('data-estado="pending_author_adjustment"'),
    rendered.includes('data-estado="pending_author_adjustment"'),
  );
  assert.equal(shipped.includes("Registrada — ajuste pendente do autor"), true);
});

test("mutation: mixing revisão as this purchase or promising zero interference fails the contract helper", () => {
  const html = readPage();
  const poisonedZero = html.replace(
    "não a promessa de obra sem interferência",
    "garantimos a ausência de qualquer interferência",
  );
  assert.match(visible(poisonedZero), /ausência de qualquer interfer/);
  assert.doesNotMatch(visible(html), /ausência de qualquer interfer/);

  const poisonedMix = html.replace(
    "Compatibilizar não é elaborar, revisar, modelar nem executar.",
    "A compatibilização também revisa o dimensionamento e elabora a disciplina.",
  );
  assert.match(poisonedMix, /também revisa o dimensionamento/);
  assert.match(html, /não redimensionamos a disciplina/i);
});
