import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { htmlText as visibleText } from "../support/html_text.mjs";

const PAGE = path.resolve("inspecao-diagnostico-edificacoes/index.html");

function mainOf(html) {
  return html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
}

test("inspection route presents a factual service, technical sample and proposal path", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  const main = mainOf(html);
  assert.match(html, /<title>Inspeção e diagnóstico de edificações \| CONFENGE<\/title>/);
  assert.match(html, /href="https:\/\/confenge\.com\.br\/inspecao-diagnostico-edificacoes\/" rel="canonical"/);
  assert.match(main, /Solicitar proposta de inspeção e diagnóstico/);
  assert.match(main, /id="situacoes-inspecao"/);
  assert.match(main, /Recebimento e entrega/);
  assert.match(main, /Reforma em condomínio/);
  assert.match(main, /Documentação do construído/);
  assert.match(main, /Amostra didática original/);
  assert.match(main, /assets\/pranchas\/inspecao-fachada-(?:desktop|mobile)\.svg/);
  assert.match(main, /Matriz de reconciliação da fachada sintética/);
});

test("inspection, diagnosis, repair and forensic support remain distinct", () => {
  const text = visibleText(mainOf(fs.readFileSync(PAGE, "utf8")));
  for (const expected of [
    "Inspeção",
    "Diagnóstico",
    "Projeto de reparo",
    "Perícia ou assistência em disputa",
    "assistência da parte permanece distinta da perícia do juízo",
  ]) {
    assert.match(text, new RegExp(expected, "i"), expected);
  }
  assert.match(text, /Fotografia ajuda a localizar a manifestação, mas não permite diagnosticar causa, estabilidade ou solução à distância/i);
  assert.match(text, /não ensina reparo/i);
  assert.match(text, /suspeita de risco imediato à segurança das pessoas/i);
  assert.match(text, /avaliação presencial competente e os canais locais adequados/i);
});

test("route refuses photo diagnosis, improvised repair and invented local presence", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  const text = visibleText(mainOf(html));
  assert.doesNotMatch(text, /diagnóstico por fotografia|envie [^.]{0,80}foto[^.]{0,80}diagnosticamos/i);
  assert.doesNotMatch(text, /raspe|quebre a parede|retire o reboco/i);
  assert.doesNotMatch(text, /tempo de chegada|mapa de unidades|nossa loja|unidades em (?:São Paulo|Curitiba|Florianópolis)/i);
  assert.doesNotMatch(html, /LocalBusiness|streetAddress|addressLocality|hasMap/);

  const unsafeMutation = text.replace(
    "Fotografia ajuda a localizar a manifestação, mas não permite diagnosticar causa, estabilidade ou solução à distância.",
    "Envie a foto e diagnosticamos a causa por fotografia.",
  );
  assert.match(unsafeMutation, /diagnosticamos a causa por fotografia/i);
});

test("contact has three live channels, positive intake and privacy boundary", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  const main = mainOf(html);
  assert.equal((html.match(/data-fallback-channel=/g) || []).length, 3);
  assert.match(main, /https:\/\/wa\.me\/5548988344559\?text=/);
  assert.match(main, /mailto:tiago\.sasaki@confenge\.com\.br\?subject=/);
  assert.match(main, /href="tel:\+5548988344559"/);
  assert.match(main, /Fotos gerais ou referências não sigilosas podem ajudar a definir o escopo inicial/);
  assert.match(main, /Dados pessoais, endereços completos e documentos controlados são tratados pelo canal adequado ao escopo/);
  assert.match(main, /href="\/privacidade\/"/);
  assert.doesNotMatch(html, /name="(?:arquivo|upload|endereco|cpf|processo)"/i);
});
