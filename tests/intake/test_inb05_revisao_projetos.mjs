import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(".");
const LANDING = "revisao-tecnica-projetos-engenharia/index.html";
const CHOICE = "conteudos/revisao-compatibilizacao-ou-elaboracao-projetos/index.html";
const HIRING = "conteudos/como-contratar-revisao-tecnica-projeto/index.html";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mainOf(html) {
  return html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
}

function titleOf(html) {
  return html.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
}

function h1Of(html) {
  return html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
}

function attr(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] || "";
}

function metaByName(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((item) => attr(item, "name") === name);
  return tag ? attr(tag, "content") : "";
}

function metaDescription(html) {
  return metaByName(html, "description");
}

function canonicalOf(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const tag = tags.find((item) => attr(item, "rel").toLowerCase() === "canonical");
  return tag ? attr(tag, "href") : "";
}

const PRICE_LANGUAGE =
  /(a partir de|por apenas|investimento de|valor do servi|pre[çc]o|honor[áa]rio|mensalidade|desconto|or[çc]amento a partir|checkout)/i;

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
    if (PRICE_LANGUAGE.test(low)) {
      problems.push(`price_or_result_money:${window.trim().slice(0, 120)}`);
    }
  }
  return problems;
}

function stripRefusals(text) {
  return String(text)
    .replace(/n[aã]o oferecemos[^.]*\./gi, " ")
    .replace(/n[aã]o publicamos[^.]*\./gi, " ")
    .replace(/n[aã]o se conclui[^.]*\./gi, " ")
    .replace(/n[aã]o substituímos[^.]*\./gi, " ")
    .replace(/esta recomendação não substitui[^.]*\./gi, " ");
}

function forbiddenCommercialClaims(html) {
  const text = stripRefusals(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const problems = [];
  const banned = [
    [/assinamos o projeto de terceiro/i, "third_party_signature"],
    [/assinatura de projeto de terceiro/i, "offers_third_party_signature"],
    [/aprova[çc][aã]o garantida/i, "guaranteed_approval"],
    [/obra segura/i, "safe_work_promise"],
    [/conformidade total/i, "total_compliance"],
    [/[êe]xito jur[ií]dico/i, "legal_success"],
    [/(emitimos|publicamos) laudo de seguran[çc]a/i, "safety_report"],
    [/utm_source=|utm_medium=|utm_campaign=/i, "utm_on_internal_link"],
  ];
  for (const [re, code] of banned) {
    if (re.test(text)) problems.push(code);
  }
  return problems;
}

function authorityStatusOf() {
  return JSON.parse(
    fs.readFileSync(path.resolve("netlify/functions/data/adaptive-intake-authority.json"), "utf8"),
  ).status;
}

const pages = {
  landing: read(LANDING),
  choice: read(CHOICE),
  hiring: read(HIRING),
};

test("three URLs have distinct title, H1, meta, CTA and continuation", () => {
  const titles = [titleOf(pages.landing), titleOf(pages.choice), titleOf(pages.hiring)];
  const h1s = [h1Of(pages.landing), h1Of(pages.choice), h1Of(pages.hiring)];
  const metas = [metaDescription(pages.landing), metaDescription(pages.choice), metaDescription(pages.hiring)];
  assert.equal(new Set(titles).size, 3, titles.join(" | "));
  assert.equal(new Set(h1s).size, 3, h1s.join(" | "));
  assert.equal(new Set(metas).size, 3, metas.join(" | "));
  assert.match(titleOf(pages.landing), /Revisão técnica de projetos de engenharia/i);
  assert.match(titleOf(pages.choice), /Revisar, compatibilizar ou elaborar/i);
  assert.match(titleOf(pages.hiring), /Como contratar revisão técnica de projeto/i);
  assert.match(pages.landing, /Conversar sobre a revisão do projeto/);
  assert.match(pages.choice, /Pedir revisão do projeto que já tenho/);
  assert.match(pages.hiring, /Enviar o contexto da revisão/);
  assert.match(mainOf(pages.choice), /href="\/revisao-tecnica-projetos-engenharia\/"/);
  assert.match(mainOf(pages.hiring), /href="\/revisao-tecnica-projetos-engenharia\/#contato-revisao"/);
  assert.match(mainOf(pages.choice), /href="\/conteudos\/como-contratar-revisao-tecnica-projeto\/"/);
  assert.match(mainOf(pages.hiring), /href="\/conteudos\/revisao-compatibilizacao-ou-elaboracao-projetos\/"/);
  assert.match(mainOf(pages.landing), /href="\/conteudos\/revisao-compatibilizacao-ou-elaboracao-projetos\/"/);
  assert.match(mainOf(pages.landing), /href="\/conteudos\/como-contratar-revisao-tecnica-projeto\/"/);
});

test("landing first fold states delivery, use and purchase distinction", () => {
  const main = mainOf(pages.landing);
  const fold = main.slice(0, main.indexOf('id="escopo-revisao"'));
  assert.match(fold, /relatório com o que a evidência sustenta/i);
  assert.match(fold, /Não substituímos o autor original nem assinamos projeto de terceiro/i);
  assert.match(fold, /Revisão não é elaboração nem compatibilização/i);
  assert.match(fold, /antes de contratar, executar ou aprovar/i);
});

test("landing names contractual scope factors and three review depths", () => {
  const main = mainOf(pages.landing);
  for (const expected of [
    "Disciplina e objeto",
    "Documentos e critérios",
    "Relatório e encaminhamento",
    "Revisão documental",
    "Revisão técnica de disciplina",
    "Análise de cálculo",
    "validação normativa integral",
  ]) {
    assert.equal(main.includes(expected), true, `missing scope factor: ${expected}`);
  }
  assert.match(main, /Leitura visual ou questionário não é validação normativa integral/);
});

test("landing extract separates four honest classes and refuses invented errors", () => {
  const main = mainOf(pages.landing);
  assert.match(main, /data-extract-kind="demonstrative-format"/);
  assert.match(main, /data-extract-canonical-source="pending-inb-06"/);
  assert.match(main, /Não é conferência de um projeto real/);
  assert.match(main, /não é trabalho de cliente/);
  assert.match(main, /não é conteúdo aprovado pelo fundador/);
  for (const cls of [
    "constatacao_sustentada",
    "informacao_faltante",
    "recomendacao",
    "verificacao_nao_realizada",
  ]) {
    assert.equal(main.includes(`data-extract-class="${cls}"`), true, `missing class ${cls}`);
  }
  assert.match(main, /Item de checklist não respondido não vira erro do projeto|Checklist não respondido não é erro do projeto/);
  assert.match(main, /não se conclui risco, não conformidade/i);
  assert.equal(/classifica[çc][aã]o de gravidade|nota de risco/i.test(main), false);
});

test("incomplete context is welcome and norms are not a gate to talk", () => {
  const main = mainOf(pages.landing);
  assert.match(main, /Não é necessário listar normas ou disciplinas para conversar/);
  assert.match(main, /Documentação inicial incompleta não impede o contato/);
  assert.match(mainOf(pages.hiring), /Não é preciso listar normas/);
});

test("CTA asks for need, contact and optional context; WITHHELD authority keeps live channels", () => {
  const html = pages.landing;
  const main = mainOf(html);
  assert.match(main, /Descreva a necessidade da revisão e como prefere o retorno/);
  assert.match(main, /contexto opcional/);
  assert.equal((html.match(/data-fallback-channel=/g) || []).length, 3);
  assert.match(main, /wa\.me\/5548988344559/);
  assert.match(main, /mailto:tiago\.sasaki@confenge\.com\.br/);
  assert.match(main, /tel:\+5548988344559/);
  if (authorityStatusOf() === "WITHHELD") {
    assert.equal(/data-adaptive-intake-form/.test(html), false, "withheld authority must not ship a dead form");
    assert.equal(/<form\b/.test(html), false, "withheld authority must not ship a capture form");
  }
  assert.equal(/utm_source=|utm_medium=|utm_campaign=/.test(html), false);
});

test("canonical, robots and service identity are coherent", () => {
  for (const [html, canonical] of [
    [pages.landing, "https://confenge.com.br/revisao-tecnica-projetos-engenharia/"],
    [pages.choice, "https://confenge.com.br/conteudos/revisao-compatibilizacao-ou-elaboracao-projetos/"],
    [pages.hiring, "https://confenge.com.br/conteudos/como-contratar-revisao-tecnica-projeto/"],
  ]) {
    assert.equal(canonicalOf(html), canonical);
    assert.match(html, /<meta(?=[^>]*name="robots")(?=[^>]*content="index,follow[^"]*")[^>]*>/);
  }
  assert.match(pages.landing, /data-intent-family="projetar_revisar_compatibilizar"/);
  assert.match(pages.landing, /data-offer-id="complementary_engineering_project_review"/);
  assert.match(pages.landing, /<main id="conteudo">/);
  assert.match(pages.landing, /Pular para o conteúdo/);
});

test("landing refuses unauthorized commercial claims and unbacked money", () => {
  const html = pages.landing;
  assert.deepEqual(unbackedMoneyProblems(html), []);
  assert.deepEqual(forbiddenCommercialClaims(html), []);
  assert.match(html, /Não oferecemos assinatura de projeto de terceiro/);
  assert.match(html, /Não publicamos laudo de segurança/);
});

test("mutation: invented third-party signature or price fails the page guard", () => {
  const html = pages.landing;
  assert.notEqual(
    forbiddenCommercialClaims(html.replace("</h1>", "</h1><p>Assinamos o projeto de terceiro.</p>")).length,
    0,
    "third-party signature must fail",
  );
  assert.notEqual(
    unbackedMoneyProblems(html.replace("</ul>", "<li>Revisão a partir de R$ 2.500 por relatório.</li></ul>")).length,
    0,
    "invented price must fail",
  );
});

test("choice and hiring pages keep WhatsApp in main and do not cannibalize the landing title", () => {
  assert.match(mainOf(pages.choice), /wa\.me\/5548988344559/);
  assert.match(mainOf(pages.hiring), /wa\.me\/5548988344559/);
  assert.notEqual(titleOf(pages.choice), titleOf(pages.landing));
  assert.notEqual(titleOf(pages.hiring), titleOf(pages.landing));
  assert.match(mainOf(pages.choice), /Três compras, três entregas/);
  assert.match(mainOf(pages.hiring), /O que enviar no primeiro contato/);
  assert.equal(/utm_/.test(pages.choice + pages.hiring), false);
});
