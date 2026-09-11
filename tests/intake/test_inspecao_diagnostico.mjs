import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const PAGE = path.resolve("inspecao-diagnostico-edificacoes/index.html");

function backedMoneyWordings() {
  const registry = JSON.parse(
    fs.readFileSync(path.resolve("data/site/credential-registry.json"), "utf8"),
  );
  return registry.claims
    .filter((claim) => claim.status === "VERIFIED" || claim.status === "SELF_ATTESTED")
    .flatMap((claim) => [claim.claim, ...(claim.allowed_wording ?? [])])
    .filter((wording) => typeof wording === "string" && wording.includes("R$"))
    .map((wording) => wording.toLowerCase());
}

const PRICE_LANGUAGE =
  /(a partir de|por apenas|investimento de|valor do servi|pre[çc]o|honor[áa]rio|mensalidade|desconto|or[çc]amento a partir)/i;
const MONEY_RESULT_LANGUAGE = /(economiz|recuper|gerou|poupou|retorno de)/i;

function unbackedMoneyProblems(html) {
  const backed = backedMoneyWordings();
  const text = String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const problems = [];
  for (const match of text.matchAll(/R\$\s*\d/g)) {
    const window = text.slice(Math.max(0, match.index - 200), match.index + 200);
    const low = window.toLowerCase();
    if (!backed.some((wording) => low.includes(wording))) {
      problems.push(`unbacked_money:${window.trim().slice(0, 120)}`);
    }
    if (PRICE_LANGUAGE.test(low) || MONEY_RESULT_LANGUAGE.test(low)) {
      problems.push(`price_or_result_money:${window.trim().slice(0, 120)}`);
    }
  }
  return problems;
}

function mainOf(html) {
  return html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
}

function jsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  return blocks.map((block) => JSON.parse(block[1]));
}

const authorityStatusOf = () => JSON.parse(
  fs.readFileSync(path.resolve("netlify/functions/data/adaptive-intake-authority.json"), "utf8"),
).status;

test("inspection diagnosis page ships a commercial path with honest situations and deliverable", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  const main = mainOf(html);

  assert.match(html, /<title>Inspeção e diagnóstico de edificações \| CONFENGE<\/title>/);
  assert.match(html, /<link href="https:\/\/confenge\.com\.br\/inspecao-diagnostico-edificacoes\/" rel="canonical"\/>/);
  assert.match(html, /<meta(?=[^>]*name="robots")(?=[^>]*content="index,follow[^\"]*")[^>]*>/);

  for (const expected of [
    "Fissura ou trinca",
    "Infiltração ou umidade",
    "Condição do imóvel ou recebimento",
    "Relatório de inspeção e condição",
    "Delimitar a pergunta",
    "Registrar constatações",
  ]) {
    assert.equal(main.includes(expected), true, `missing commercial copy: ${expected}`);
  }

  assert.match(main, /Inspeção\./);
  assert.match(main, /Diagnóstico\./);
  assert.match(main, /Projeto de reparo\./);
  assert.match(main, /Perícia ou assistência em disputa\./);
  assert.match(main, /não misturamos inspeção privada com laudo judicial/i);

  assert.match(main, /Amostra didática original/);
  assert.match(main, /Não é inspeção realizada, não é foto de cliente, não é prova de campo e não é laudo/);
  assert.equal(/laudo fict[ií]cio/i.test(main), false);
  assert.equal(/caso de cliente/i.test(main), false);
});

test("inspection page keeps local coverage honest and location as optional context", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  const main = mainOf(html);
  const graph = jsonLd(html);

  assert.match(main, /município entra como contexto, não como barreira/i);
  assert.match(main, /Visita, logística, atribuição profissional e ART/i);
  assert.match(main, /Não há endereço de loja, mapa de unidades, tempo de chegada nem equipe de campo publicada/);
  assert.match(main, /telefone com DDD 48 é canal de contato, não cobertura de uma cidade/);
  assert.match(main, /Atendimento no Brasil depende de escopo, local, logística/);

  assert.equal(/LocalBusiness/i.test(html), false);
  assert.equal(/streetAddress/i.test(html), false);
  assert.equal(/hasMap|PostalAddress/i.test(html), false);
  assert.equal(/Florianópolis/i.test(main), false);
  assert.equal(/tempo de chegada/i.test(main) && /minutos/i.test(main), false);
  assert.equal(/unidades? em (são paulo|curitiba|florianópolis)/i.test(main), false);
  assert.equal(
    /atendemos (em|nas cidades|nos municípios) .{0,80}(são paulo|curitiba|porto alegre|florianópolis)/i.test(main),
    false,
  );

  const blob = JSON.stringify(graph);
  assert.match(blob, /"@type":"Country"/);
  assert.match(blob, /"name":"Brasil"/);
  assert.equal(/"addressLocality"/i.test(blob), false);
  assert.equal(/"LocalBusiness"/i.test(blob), false);
});

test("decision support refuses photo diagnosis, unsafe DIY and invented commercial terms", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  const main = mainOf(html);

  assert.match(main, /id="como-contratar"/);
  assert.match(main, /Fotografia não permite diagnosticar causa, estabilidade ou solução à distância/);
  assert.match(main, /Não ensina reparo/);
  assert.match(main, /suspeita de risco imediato à segurança das pessoas/);
  assert.match(main, /procure avaliação presencial competente e os canais locais adequados/);
  assert.match(main, /não conclui o seu caso concreto/);

  const photoDiagnosisProblems = (source) => {
    const text = String(source).replace(/<[^>]+>/g, " ");
    const hits = [];
    if (/diagn[oó]stico por fotografia/i.test(text)) hits.push("photo_diagnosis_phrase");
    if (/envie [^\.]{0,80}foto[^\.]{0,80}diagnost/i.test(text)) hits.push("photo_diagnosis_invite");
    return hits;
  };
  const cityDoorwayProblems = (source) => {
    const text = String(source).replace(/<[^>]+>/g, " ");
    const hits = [];
    if (/unidades? em [^\.]{0,80}(s[aã]o paulo|curitiba|florian[oó]polis)/i.test(text)) hits.push("city_unit_list");
    if (/tempo de chegada/i.test(text) && /\d+\s*minutos/i.test(text)) hits.push("arrival_time");
    return hits;
  };

  assert.deepEqual(photoDiagnosisProblems(html), []);
  assert.deepEqual(cityDoorwayProblems(html), []);
  assert.notEqual(
    photoDiagnosisProblems(
      html.replace(
        "Fotografia não permite diagnosticar causa, estabilidade ou solução à distância.",
        "Envie a foto e diagnosticamos a causa por fotografia.",
      ),
    ).length,
    0,
    "a photo-diagnosis promise must fail",
  );
  assert.notEqual(
    cityDoorwayProblems(
      html.replace(
        "Não publicamos lista de cidades nem unidade de atendimento.",
        "Unidades em São Paulo, Curitiba e Florianópolis, com tempo de chegada de 40 minutos.",
      ),
    ).length,
    0,
    "a city doorway must fail",
  );
  assert.equal(/ raspe | quebre a parede | retire o reboco /i.test(main), false);
  assert.deepEqual(unbackedMoneyProblems(html), []);
  assert.notEqual(
    unbackedMoneyProblems(html.replace("</ul>", "<li>Inspeção a partir de R$ 1.900 por relatório.</li></ul>")).length,
    0,
    "an unpublished price on the inspection path must fail",
  );
});

test("inspection contact reuses existing channels, accepts incomplete context and ships without a dead form", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  const main = mainOf(html);

  assert.equal((html.match(/data-fallback-channel=/g) || []).length, 3);
  assert.match(main, /https:\/\/wa\.me\/5548988344559\?text=/);
  assert.match(main, /mailto:tiago\.sasaki@confenge\.com\.br\?subject=/);
  assert.match(main, /href="tel:\+5548988344559"/);
  assert.match(main, /necessidade, o município e o que já foi observado/);
  assert.match(main, /Contexto inicial incompleto não impede o contato/);
  assert.match(main, /não recebe arquivo, planta, endereço exato, CPF, processo/);
  assert.match(main, /retenção de até 730 dias/);
  assert.match(main, /href="\/privacidade\/"/);
  assert.equal(/utm_/i.test(main), false);
  assert.equal(/name="(?:mensagem|arquivo|upload|endereco|cpf|processo)"/i.test(html), false);

  if (authorityStatusOf() === "FINAL") {
    assert.match(html, /action="\/\.netlify\/functions\/lead"/);
  } else {
    assert.equal(/data-adaptive-intake-form/.test(html), false, "withheld authority must not ship a dead form");
    assert.equal(/<form\b/.test(html), false, "withheld authority must not ship a capture form");
  }

  const secondRead = fs.readFileSync(PAGE, "utf8");
  assert.equal(secondRead, html, "shipped HTML must be stable across reads");
  assert.match(secondRead, /Conversar sobre a inspeção/);
  assert.match(secondRead, /https:\/\/wa\.me\/5548988344559/);
});
