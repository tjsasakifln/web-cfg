import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { htmlText as visibleText } from "../support/html_text.mjs";

const ROOT = path.resolve(".");
const LANDING = "revisao-tecnica-projetos-engenharia/index.html";
const CHOICE = "conteudos/revisao-compatibilizacao-ou-elaboracao-projetos/index.html";
const HIRING = "conteudos/como-contratar-revisao-tecnica-projeto/index.html";

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const mainOf = (html) => html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
const titleOf = (html) => html.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
const h1Of = (html) => visibleText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");

const pages = { landing: read(LANDING), choice: read(CHOICE), hiring: read(HIRING) };

test("review, choice and hiring routes keep distinct search intent and continuity", () => {
  const titles = Object.values(pages).map(titleOf);
  const headings = Object.values(pages).map(h1Of);
  assert.equal(new Set(titles).size, 3);
  assert.equal(new Set(headings).size, 3);
  assert.match(mainOf(pages.landing), /href="\/conteudos\/revisao-compatibilizacao-ou-elaboracao-projetos\/"/);
  assert.match(mainOf(pages.landing), /href="\/conteudos\/como-contratar-revisao-tecnica-projeto\/"/);
  assert.match(mainOf(pages.choice), /href="\/revisao-tecnica-projetos-engenharia\/"/);
  assert.match(mainOf(pages.hiring), /href="\/revisao-tecnica-projetos-engenharia\/#contato-revisao"/);
});

test("landing explains depth, evidence classes and accountable deliverable", () => {
  const main = mainOf(pages.landing);
  const text = visibleText(main);
  for (const expected of [
    "Documental",
    "Disciplina",
    "Cálculo",
    "Mapa de achados",
    "Implicação técnica",
    "Síntese para decisão",
  ]) {
    assert.match(text, new RegExp(expected, "i"), expected);
  }
  assert.match(main, /data-commercial-presentation="technical-scope"/);
  assert.match(text, /constatação sustentada, recomendação, informação faltante e verificação ainda não realizada/i);
  assert.match(text, /sem converter lacuna de informação em falha comprovada/i);
});

test("review preserves origin authorship and avoids unsupported promises", () => {
  const text = visibleText(mainOf(pages.landing));
  assert.match(text, /preservando a autoria e a responsabilidade do documento de origem/i);
  assert.doesNotMatch(text, /assinamos o projeto de terceiro|aprovação garantida|conformidade total|êxito jurídico/i);
  assert.doesNotMatch(text, /R\$\s*\d/);
  assert.doesNotMatch(text, /\d+\s+dias úteis|\d+\s+revisões incluídas/i);
});

test("review keeps educational references separate from the contracted scope", () => {
  const main = mainOf(pages.landing);
  assert.match(main, /data-commercial-presentation="technical-scope"/);
  assert.match(main, /Exemplo demonstrativo de organização de um registro de revisão/);
  assert.match(main, /href="\/casos\/demonstrativo-projeto-privado\/#revisao"/);
  assert.doesNotMatch(main, /data-extract-kind="demonstrative"|WN-01|HS-01/);
  assert.doesNotMatch(main, /aprovado pelo fundador|resolved_in_R01|\bSELECT\b/);
});

test("proposal path supports live channels and controlled documents", () => {
  const main = mainOf(pages.landing);
  assert.match(main, /Solicitar proposta de revisão técnica/);
  assert.equal((pages.landing.match(/data-fallback-channel=/g) || []).length, 3);
  assert.match(main, /https:\/\/wa\.me\/5548988344559/);
  assert.match(main, /mailto:tiago\.sasaki@confenge\.com\.br/);
  assert.match(main, /tel:\+5548988344559/);
  assert.match(main, /Referências não sigilosas podem ser compartilhadas por WhatsApp ou e-mail/);
  assert.match(main, /documentos com acesso restrito, combinamos o canal e as permissões adequadas/i);
  assert.doesNotMatch(pages.landing, /name="(?:arquivo|upload|endereco|cpf|processo)"/i);
});

test("canonical metadata and service identity stay coherent", () => {
  assert.match(pages.landing, /href="https:\/\/confenge\.com\.br\/revisao-tecnica-projetos-engenharia\/" rel="canonical"/);
  assert.match(pages.landing, /data-intent-family="projetar_revisar_compatibilizar"/);
  assert.match(pages.landing, /data-offer-id="complementary_engineering_project_review"/);
  assert.match(pages.landing, /<main id="conteudo">/);
  assert.match(pages.landing, /Pular para o conteúdo/);
});

test("mutation guard detects an invented third-party signature", () => {
  const text = visibleText(mainOf(pages.landing));
  const mutated = `${text} Assinamos o projeto de terceiro.`;
  const forbidden = /assinamos o projeto de terceiro|aprovação garantida|conformidade total|êxito jurídico/i;
  assert.doesNotMatch(text, forbidden);
  assert.match(mutated, forbidden);
});
