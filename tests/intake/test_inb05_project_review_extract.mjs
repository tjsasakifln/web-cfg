import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  EXTRACT_CLASSES,
  assertHonestExtract,
  classifyExtract,
  classifyItem,
} from "../../scripts/campaigns/inb-20260911/05/project_review_extract.mjs";

const fixture = JSON.parse(
  fs.readFileSync(path.resolve("tests/fixtures/inb05/format-example-extract.json"), "utf8"),
);
const landing = fs.readFileSync(
  path.resolve("revisao-tecnica-projetos-engenharia/index.html"),
  "utf8",
);

function byId(classified, id) {
  return classified.items.find((item) => item.id === id);
}

test("format example yields four distinguishable honest classes", () => {
  const classified = classifyExtract(fixture);
  assertHonestExtract(classified);
  assert.equal(classified.founder_approved, false);
  assert.equal(classified.not_client_work, true);
  assert.equal(classified.honesty.four_classes_present, true);
  assert.equal(classified.honesty.concludes_risk, false);
  assert.equal(classified.honesty.concludes_noncompliance, false);
  assert.equal(classified.honesty.invented_project_error, false);
  assert.equal(byId(classified, "item-viga-v12").class, EXTRACT_CLASSES.CONSTATACAO_SUSTENTADA);
  assert.equal(byId(classified, "item-memorial-revisao").class, EXTRACT_CLASSES.INFORMACAO_FALTANTE);
  assert.equal(byId(classified, "item-spec-ausente").class, EXTRACT_CLASSES.INFORMACAO_FALTANTE);
  assert.equal(byId(classified, "item-recomendacao-coordenar").class, EXTRACT_CLASSES.RECOMENDACAO);
  assert.equal(byId(classified, "item-geometria-norma").class, EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA);
  assert.equal(byId(classified, "chk-armadura").class, EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA);
});

test("landing extract texts are the classified fixture, not a second invented story", () => {
  const classified = classifyExtract(fixture);
  assert.match(landing, /data-extract-canonical-source="pending-inb-06"/);
  assert.equal(landing.includes(classified.package.object), true, classified.package.object);
  assert.match(landing, /O corte A-A desenha a viga V12 com seção 50×30 cm/);
  assert.match(landing, /qual revisão do memorial acompanha a prancha E-04 R02/);
  assert.match(landing, /documento de especificação de concreto/);
  assert.match(landing, /não substitui a autoria nem aprova o projeto/);
  assert.match(landing, /qual critério se aplica à V12 neste recorte/);
  assert.match(landing, /Item de conferência ainda não realizado; não é erro do projeto/);
});

test("absent document stays pending and is not a project error", () => {
  const classified = classifyExtract(fixture);
  const item = byId(classified, "item-spec-ausente");
  assert.equal(item.class, EXTRACT_CLASSES.INFORMACAO_FALTANTE);
  assert.equal(item.concludes_noncompliance, false);
  assert.equal(item.question_preserved, true);
  assert.ok(item.honesty_notes.includes("document_absent"));
});

test("divergent revision stays as missing information", () => {
  const classified = classifyExtract(fixture);
  const item = byId(classified, "item-memorial-revisao");
  assert.equal(item.class, EXTRACT_CLASSES.INFORMACAO_FALTANTE);
  assert.ok(item.honesty_notes.includes("revision_diverges"));
  assert.equal(item.concludes_risk, false);
});

test("unreferenced evidence does not sustain a finding", () => {
  const mutated = structuredClone(fixture);
  mutated.items = [
    {
      id: "item-unreferenced",
      kind: "finding",
      document_id: "doc-e04",
      document_revision: "R02",
      element: "viga V12",
      finding_text: "Seção incompatível com o memorial.",
      evidence_refs: ["doc-ghost#inexistente"],
    },
  ];
  mutated.checklist = [];
  const classified = classifyExtract(mutated);
  const item = byId(classified, "item-unreferenced");
  assert.equal(item.class, EXTRACT_CLASSES.INFORMACAO_FALTANTE);
  assert.ok(item.honesty_notes.includes("evidence_not_referenced"));
  assert.equal(item.concludes_noncompliance, false);
});

test("unanswered checklist is not converted into a project error", () => {
  const classified = classifyExtract(fixture);
  const item = byId(classified, "chk-armadura");
  assert.equal(item.class, EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA);
  assert.match(item.finding_text, /não é erro do projeto/);
  assert.equal(item.concludes_noncompliance, false);
});

test("unverified geometry or norm keeps the technical question", () => {
  const classified = classifyExtract(fixture);
  const item = byId(classified, "item-geometria-norma");
  assert.equal(item.class, EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA);
  assert.equal(item.question_preserved, true);
  assert.equal(item.concludes_risk, false);
  assert.equal(item.concludes_noncompliance, false);
  assert.match(item.forwarding, /pergunta técnica/);
});

test("mutation: forcing a risk conclusion without evidence is refused", () => {
  const documents = new Map([
    ["doc-e04", { id: "doc-e04", name: "E-04", revision: "R02", present: true }],
  ]);
  const forced = classifyItem(
    {
      id: "forced-risk",
      document_id: "doc-e04",
      document_revision: "R02",
      finding_text: "Há risco estrutural.",
      conclusion: "risco",
      evidence_refs: [],
      geometry_verified: false,
      norm_verified: false,
    },
    documents,
    { geometry_verified: false, norm_verified: false },
  );
  assert.notEqual(forced.class, "risco");
  assert.equal(forced.concludes_risk, false);
  assert.equal(forced.concludes_noncompliance, false);
  assert.equal(forced.rejected_conclusion, "risco");
  assert.equal(forced.question_preserved, true);
  assert.throws(
    () =>
      assertHonestExtract({
        items: [{ ...forced, class: "risco", concludes_risk: true }],
        honesty: {
          concludes_risk: true,
          concludes_noncompliance: false,
          invented_project_error: true,
        },
      }),
    /extract_concludes_risk/,
  );
});
