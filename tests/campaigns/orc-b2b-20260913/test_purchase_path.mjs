/**
 * ORC-B2B-20260913: what the buyer can actually do on the quantity-takeoff and
 * budgeting route.
 *
 * The suite starts from the six buyer behaviours, not from a file count. Each
 * scenario reads the shipped source HTML. Counterproofs mutate an in-memory
 * copy or a temporary root: a mutation must fail the same assertion that the
 * clean control passes, otherwise the assertion proves nothing.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ENTRANCE_SPECS,
  buildEntrance,
  injectProofEntrances,
  loadEntrances,
  missingRequiredInputs,
  renderProofEntrances,
} from "../../../quantitativos-orcamento-obras/proof-entrances.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const LANDING_REL = "quantitativos-orcamento-obras/index.html";
const SUPPORT_RELS = Object.freeze([
  "conteudos/documentos-para-levantamento-quantitativos/index.html",
  "conteudos/comparar-propostas-execucao-obra/index.html",
  "conteudos/revisar-ou-refazer-orcamento-obra/index.html",
]);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** Strip script and style so "present in static HTML" means visible without JS. */
function staticBody(html) {
  return html
    .split("</head>")[1]
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
}

function text(html) {
  return staticBody(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function entranceBlock(html, key) {
  const match = html.match(
    new RegExp(`<article\\b[^>]*data-proof-entrance="${key}"[\\s\\S]*?</article>`, "i"),
  );
  return match ? match[0] : "";
}

// ---------------------------------------------------------------- predicates
// Each predicate is used by a scenario and by at least one counterproof.

export function declaresContractedService(html) {
  const body = text(html);
  return (
    /serviço de engenharia contratado/i.test(body)
    && /não é software/i.test(body)
    && /planilha gratuita/i.test(body)
  );
}

export function namesWhoContracts(html) {
  const body = text(html);
  return ["construtora", "empresa de engenharia", "escritório de projeto", "terceirizar"].every(
    (term) => body.toLowerCase().includes(term),
  );
}

export function keepsSmallAndPublicDemand(html) {
  const body = text(html).toLowerCase();
  return /demanda pequena/.test(body) && /obra pública/.test(body);
}

export function offersThreeModalities(html) {
  return (
    html.includes('id="levantamento-quantitativos"')
    && html.includes('id="elaboracao-orcamento"')
    && html.includes('id="revisao-orcamento"')
  );
}

export function reachesProof(html, href) {
  return html.includes(`href="${href}"`);
}

export function entranceIsCanonical(html, key, expected) {
  const block = entranceBlock(html, key);
  if (!block) return false;
  return (
    block.includes(`data-proof-quantity="${expected.quantity}"`)
    && block.includes(`data-proof-item="${expected.budget_id}"`)
    && block.includes(`href="${expected.url}#quantitativos"`)
  );
}

export function entranceDeclaresDemonstrativeNature(html, key) {
  const block = entranceBlock(html, key);
  return (
    /exemplo demonstrativo de método/i.test(block)
    && /não representa cliente, obra executada/i.test(block)
    && /hipotéticos/i.test(block)
    && /não são preço da CONFENGE/i.test(block)
  );
}

export function entranceFilesResolve(html, key, spec) {
  const block = entranceBlock(html, key);
  return spec.csv_rels.every(
    (rel) => block.includes(`href="/${rel}"`) && fs.existsSync(path.join(root, rel)),
  );
}

export function asksOnlyWhatIsNeeded(html) {
  const body = text(html).toLowerCase();
  const forbidden = ["informe o cnpj", "informe o cpf", "valor da obra", "endereço exato da obra"];
  return !forbidden.some((term) => body.includes(term));
}

export function acceptsPartialProject(html) {
  const body = text(html).toLowerCase();
  return (
    html.includes('id="projeto-parcial"')
    && /documentação inicial incompleta não/.test(body)
    && /insumos possíveis/.test(body)
  );
}

export function doesNotForcePublicBidding(html) {
  const body = text(html).toLowerCase();
  return /não pedimos campos de licitação/.test(body);
}

export function contactChannelsAreStatic(html) {
  const body = staticBody(html);
  return (
    /href="https:\/\/wa\.me\/[^"]+"/.test(body)
    && /href="mailto:[^"]+"/.test(body)
    && /href="tel:\+[0-9]+"/.test(body)
  );
}

export function contactNamesTheService(html) {
  const body = staticBody(html);
  const whatsapp = body.match(/href="(https:\/\/wa\.me\/[^"]+)"/);
  if (!whatsapp) return false;
  const message = decodeURIComponent(whatsapp[1]);
  return /quantitativos|orçamento/i.test(message);
}

export function supportLandsOnTheService(html) {
  return html.includes('href="/quantitativos-orcamento-obras/');
}

export function equalizationMatrixIsStatic(html) {
  const body = staticBody(html);
  return (
    body.includes('id="matriz-de-equalizacao"')
    && /<table class="data-table">/.test(body)
    && ["Escopo", "Unidades", "Quantidades", "Exclusões", "Responsabilidades"].every((row) =>
      body.includes(`<th scope="row">${row}</th>`),
    )
  );
}

export function firstRequestExampleIsSafe(html) {
  const body = staticBody(html);
  if (!body.includes('id="exemplo-de-pedido"')) return false;
  const quote = body.match(/<blockquote[\s\S]*?<\/blockquote>/i);
  if (!quote) return false;
  const sample = quote[0];
  // The example must not teach the buyer to send identifying or sensitive data.
  return !/\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|rua |avenida /i.test(sample);
}

// ----------------------------------------------------------------- scenarios

test("A. empresa que chega por levantamento entende que contrata um serviço, vê a amostra e fala da modalidade", () => {
  const html = read(LANDING_REL);
  assert.ok(declaresContractedService(html), "a página precisa dizer que é serviço contratado");
  assert.ok(namesWhoContracts(html), "quem contrata precisa estar nomeado");
  assert.ok(keepsSmallAndPublicDemand(html), "demanda pequena e obra pública seguem acolhidas");
  assert.ok(offersThreeModalities(html), "as três modalidades seguem distintas");
  assert.ok(
    reachesProof(html, "/casos/demonstrativo-projeto-privado/#quantitativos"),
    "a amostra de edificação precisa estar a um clique",
  );
  assert.ok(contactNamesTheService(html), "o primeiro contato precisa nomear o serviço");
});

test("B. escritório com projeto parcial encontra insumos e pede proposta sem CNPJ, valor ou projeto completo", () => {
  const html = read(LANDING_REL);
  assert.ok(acceptsPartialProject(html), "projeto parcial precisa ser acolhido explicitamente");
  assert.ok(asksOnlyWhatIsNeeded(html), "a página não pode exigir CNPJ, CPF, valor ou endereço exato");
  const documentos = read(SUPPORT_RELS[0]);
  assert.ok(firstRequestExampleIsSafe(documentos), "o exemplo de pedido não pode ensinar dado sensível");
  assert.ok(supportLandsOnTheService(documentos));
});

test("C. contratante que quer revisão de planilha não é mandado para projeto nem para pleito público", () => {
  const html = read(LANDING_REL);
  assert.ok(html.includes('id="revisao-orcamento"'), "a revisão de orçamento precisa existir como pedido");
  assert.ok(doesNotForcePublicBidding(html), "o comprador privado não pode ser obrigado a campos de licitação");
  const revisar = read(SUPPORT_RELS[2]);
  assert.ok(supportLandsOnTheService(revisar));
  const body = text(revisar).toLowerCase();
  assert.ok(
    /revisão testa o número/.test(body),
    "o conteúdo de revisão precisa distinguir revisar de elaborar",
  );
  assert.ok(
    !/revisão técnica de projetos/i.test(text(html).slice(0, 1200)),
    "a primeira dobra não deve trocar revisão de orçamento por revisão de projeto",
  );
});

test("D. comprador de infraestrutura encontra o demonstrativo certo, sua natureza e os arquivos", () => {
  const html = read(LANDING_REL);
  const spec = ENTRANCE_SPECS.find((candidate) => candidate.key === "infraestrutura");
  const entrance = buildEntrance(spec, root);
  assert.equal(entrance.url, "/casos/demonstrativo-infraestrutura/");
  assert.ok(
    entranceIsCanonical(html, "infraestrutura", {
      quantity: entrance.quantity_value,
      budget_id: entrance.budget_id,
      url: entrance.url,
    }),
    "a entrada de infraestrutura precisa publicar quantidade, item e destino canônicos",
  );
  assert.ok(entranceDeclaresDemonstrativeNature(html, "infraestrutura"));
  assert.ok(entranceFilesResolve(html, "infraestrutura", spec), "os CSV daquele recorte precisam existir");
});

test("D2. a entrada de edificação preserva a memória Q-PAR-01 e os arquivos publicados", () => {
  const html = read(LANDING_REL);
  const spec = ENTRANCE_SPECS.find((candidate) => candidate.key === "edificacao");
  const entrance = buildEntrance(spec, root);
  assert.equal(entrance.quantity_id, "Q-PAR-01");
  assert.equal(entrance.budget_id, "ORC-PAR-01");
  assert.equal(Number(entrance.quantity_value), 19.6);
  assert.ok(entranceIsCanonical(html, "edificacao", {
    quantity: entrance.quantity_value,
    budget_id: entrance.budget_id,
    url: entrance.url,
  }));
  assert.ok(entranceFilesResolve(html, "edificacao", spec));
  assert.ok(
    html.includes('data-trail-memory="true"'),
    "a memória da trilha publicada não pode desaparecer",
  );
  assert.ok(html.includes("19,60 m²"), "a memória precisa mostrar a procedência da quantidade");
});

test("E. quem vem do conteúdo ou do kit chega à mesma oferta, sem recomeçar a seleção", () => {
  for (const rel of SUPPORT_RELS) {
    const html = read(rel);
    assert.ok(supportLandsOnTheService(html), `${rel} precisa levar ao serviço`);
  }
  assert.ok(equalizationMatrixIsStatic(read(SUPPORT_RELS[1])), "a matriz de equalização é estática");
  const kits = JSON.parse(read("data/distribution/partner-reference-kits.v1.json"));
  const serialized = JSON.stringify(kits);
  assert.ok(
    serialized.includes("/quantitativos-orcamento-obras/"),
    "o kit precisa apontar direto para a rota, sem escolha intermediária",
  );
});

test("F. visitante sem JavaScript vê a oferta, a prova essencial e um canal de contato", () => {
  const html = read(LANDING_REL);
  const body = staticBody(html);
  assert.ok(body.includes('data-proof-entrance="edificacao"'), "a prova não pode depender de JS");
  assert.ok(body.includes('data-proof-entrance="infraestrutura"'));
  assert.ok(body.includes('data-trail-step="quantity"'), "a trilha precisa estar no HTML");
  assert.ok(contactChannelsAreStatic(html), "telefone e e-mail precisam funcionar sem script");
  assert.ok(
    !/data-proof-entrances-state="awaiting-canonical-descriptors"/.test(html),
    "a composição precisa ter rodado; o estado de espera não pode ser publicado",
  );
});

// -------------------------------------------------------------- counterproofs

test("contraprova: remover um arquivo prometido reprova a composição", (t) => {
  assert.deepEqual(missingRequiredInputs(root), [], "controle limpo passa");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orc-b2b-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const spec of ENTRANCE_SPECS) {
    for (const rel of [spec.source_rel, spec.consumption_rel, ...spec.csv_rels]) {
      const target = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, rel), target);
    }
  }
  assert.deepEqual(missingRequiredInputs(tmp), [], "a cópia completa também passa");

  const removed = "casos/demonstrativo-infraestrutura/data/orcamento.csv";
  fs.rmSync(path.join(tmp, removed));
  assert.throws(
    () => loadEntrances(tmp),
    /required_proof_entrance_input_missing/,
    "a falta de um CSV prometido precisa reprovar fechado",
  );
});

test("contraprova: trocar a modalidade de orçamento por revisão de projeto reprova o cenário D", () => {
  const html = read(LANDING_REL);
  const spec = ENTRANCE_SPECS.find((candidate) => candidate.key === "infraestrutura");
  const entrance = buildEntrance(spec, root);
  const expected = {
    quantity: entrance.quantity_value,
    budget_id: entrance.budget_id,
    url: entrance.url,
  };
  assert.ok(entranceIsCanonical(html, "infraestrutura", expected), "controle passa");

  const mutated = html.replaceAll(
    "/casos/demonstrativo-infraestrutura/",
    "/revisao-tecnica-projetos-engenharia/",
  );
  assert.equal(
    entranceIsCanonical(mutated, "infraestrutura", expected),
    false,
    "desviar o destino precisa reprovar",
  );
});

test("contraprova: omitir a prova na composição reprova o cenário F", () => {
  const html = read(LANDING_REL);
  assert.ok(staticBody(html).includes('data-proof-entrance="infraestrutura"'), "controle passa");

  const emptied = html.replace(
    /<div id="qty-proof-entrances"[\s\S]*?<\/div><!--\/orc-b2b-20260913:proof-entrances-->/,
    '<div id="qty-proof-entrances" data-proof-entrances-slot="canonical" data-proof-entrances-state="awaiting-canonical-descriptors"></div><!--/orc-b2b-20260913:proof-entrances-->',
  );
  assert.equal(
    staticBody(emptied).includes('data-proof-entrance="infraestrutura"'),
    false,
    "slot vazio precisa reprovar",
  );
  assert.match(emptied, /awaiting-canonical-descriptors/);
});

test("contraprova: esconder a natureza demonstrativa reprova as duas entradas", () => {
  const html = read(LANDING_REL);
  for (const key of ["edificacao", "infraestrutura"]) {
    assert.ok(entranceDeclaresDemonstrativeNature(html, key), `controle passa em ${key}`);
  }
  const mutated = html.replace(/<p class="qty-proof-disclaimer">[\s\S]*?<\/p>/g, "");
  for (const key of ["edificacao", "infraestrutura"]) {
    assert.equal(
      entranceDeclaresDemonstrativeNature(mutated, key),
      false,
      `remover a ressalva precisa reprovar em ${key}`,
    );
  }
});

test("contraprova: descritor fora do contrato não vira HTML público", () => {
  const entrances = loadEntrances(root);
  assert.ok(renderProofEntrances(entrances).includes('data-proof-entrances-state="canonical"'));

  assert.throws(() => renderProofEntrances(entrances.slice(0, 1)), /proof_entrances_required/);
  const fake = entrances.map((entrance) => ({ ...entrance, schema: "pseudo/0" }));
  assert.throws(() => renderProofEntrances(fake), /proof_entrance_schema_invalid/);
  assert.throws(
    () => injectProofEntrances("<html><body>sem slot</body></html>", entrances),
    /missing #qty-proof-entrances slot/,
  );
});

test("contraprova: número divergente do descritor canônico reprova a entrada", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orc-b2b-num-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const spec = ENTRANCE_SPECS.find((candidate) => candidate.key === "edificacao");
  for (const rel of [spec.source_rel, spec.consumption_rel, ...spec.csv_rels]) {
    const target = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, rel), target);
  }
  assert.ok(buildEntrance(spec, tmp), "controle passa na cópia");

  const consumptionPath = path.join(tmp, spec.consumption_rel);
  const consumption = JSON.parse(fs.readFileSync(consumptionPath, "utf8"));
  const row = consumption.budget_rows.find((candidate) => candidate.quantity_id === spec.quantity_id);
  row.quantity = "30.64";
  fs.writeFileSync(consumptionPath, JSON.stringify(consumption));
  assert.throws(
    () => buildEntrance(spec, tmp),
    /proof_entrance_quantity_diverges/,
    "quantidade divergente entre planilha e quantitativo precisa reprovar",
  );
});
