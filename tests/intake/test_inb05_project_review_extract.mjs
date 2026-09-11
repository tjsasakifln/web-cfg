import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  CANONICAL_06_PATHS,
  EXTRACT_CLASSES,
  assertHonestExtract,
  classifyExtract,
  parseRevisaoCsv,
} from "../../scripts/campaigns/inb-20260911/05/project_review_extract.mjs";

function load06() {
  const consumptionPath = fs.existsSync(CANONICAL_06_PATHS.consumption)
    ? CANONICAL_06_PATHS.consumption
    : CANONICAL_06_PATHS.fixtureConsumption;
  const csvPath = fs.existsSync(CANONICAL_06_PATHS.revisaoCsv)
    ? CANONICAL_06_PATHS.revisaoCsv
    : CANONICAL_06_PATHS.fixtureCsv;
  return {
    consumption: JSON.parse(fs.readFileSync(path.resolve(consumptionPath), "utf8")),
    csv: fs.readFileSync(path.resolve(csvPath), "utf8"),
    consumptionPath,
    csvPath,
  };
}

function byId(classified, id) {
  return classified.items.find((item) => item.id === id);
}

const landing = fs.readFileSync(
  path.resolve("revisao-tecnica-projetos-engenharia/index.html"),
  "utf8",
);
const choice = fs.readFileSync(
  path.resolve("conteudos/revisao-compatibilizacao-ou-elaboracao-projetos/index.html"),
  "utf8",
);
const hiring = fs.readFileSync(
  path.resolve("conteudos/como-contratar-revisao-tecnica-projeto/index.html"),
  "utf8",
);

test("fixture copies 06 review_findings RF-01 and RF-02, not a second building", () => {
  const { consumption, csv } = load06();
  assert.equal(consumption.schema, "confenge.demonstrative-sample-descriptor/1.0");
  assert.equal(consumption.proof_id, "demo-private-project-pilot-2026-09");
  const ids = consumption.review_findings.map((item) => item.id);
  assert.deepEqual(ids, ["RF-01", "RF-02"]);
  assert.deepEqual(consumption.review_findings[0].element_ids, ["WN-01", "B-01"]);
  assert.deepEqual(consumption.review_findings[1].element_ids, ["HS-01"]);
  const rows = parseRevisaoCsv(csv);
  assert.equal(rows[0].constatacao, "A verga da janela WN-01 invade o volume da viga B-01 no estado original.");
  assert.equal(rows[1].constatacao, "O poço hidrossanitário HS-01 não declara vão livre interno nem diâmetros.");
  assert.equal(/V12|E-04|50×30|40×30/.test(JSON.stringify(consumption) + csv), false);
});

test("06 rows yield four distinguishable honest classes", () => {
  const { consumption, csv } = load06();
  const classified = classifyExtract(consumption, { revisaoCsv: csv });
  assertHonestExtract(classified);
  assert.equal(classified.source_campaign, "06");
  assert.equal(classified.founder_approved, false);
  assert.equal(classified.not_client_work, true);
  assert.equal(classified.honesty.four_classes_present, true);
  assert.equal(classified.honesty.concludes_risk, false);
  assert.equal(classified.honesty.concludes_noncompliance, false);
  assert.equal(byId(classified, "RF-01").class, EXTRACT_CLASSES.CONSTATACAO_SUSTENTADA);
  assert.equal(byId(classified, "RF-02").class, EXTRACT_CLASSES.INFORMACAO_FALTANTE);
  assert.equal(byId(classified, "RF-01-acao").class, EXTRACT_CLASSES.RECOMENDACAO);
  assert.equal(byId(classified, "RF-01-norma").class, EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA);
  assert.equal(byId(classified, "RF-02-norma").class, EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA);
});

test("landing extract texts are the 06 rows, not a second invented story", () => {
  const { consumption, csv } = load06();
  const classified = classifyExtract(consumption, { revisaoCsv: csv });
  const rf1 = byId(classified, "RF-01");
  const rf2 = byId(classified, "RF-02");
  assert.match(landing, /data-extract-canonical-source="inb-06"/);
  assert.match(landing, /data-proof-id="demo-private-project-pilot-2026-09"/);
  assert.match(landing, /href="\/casos\/demonstrativo-projeto-privado\/"/);
  assert.match(landing, /href="\/casos\/demonstrativo-projeto-privado\/data\/revisao.csv"/);
  assert.equal(landing.includes(rf1.finding_text), true, rf1.finding_text);
  assert.equal(landing.includes(rf2.finding_text), true, rf2.finding_text);
  assert.match(landing, /WN-01/);
  assert.match(landing, /B-01/);
  assert.match(landing, /HS-01/);
  assert.match(landing, /PR-ARQ-R00/);
  assert.match(landing, /PR-HID-R00/);
  assert.equal(/V12|E-04|50×30|40×30/.test(landing + choice + hiring), false);
  assert.match(choice, /WN-01/);
  assert.match(hiring, /HS-01/);
});

test("absent document stays pending and is not a project error", () => {
  const { consumption, csv } = load06();
  const mutated = structuredClone(consumption);
  mutated.elements = mutated.elements.filter((el) => el.id !== "HS-01");
  const classified = classifyExtract(mutated, { revisaoCsv: csv });
  const item = byId(classified, "RF-02");
  assert.equal(item.class, EXTRACT_CLASSES.INFORMACAO_FALTANTE);
  assert.equal(item.concludes_noncompliance, false);
  assert.equal(item.question_preserved, true);
  assert.ok(item.honesty_notes.includes("document_absent"));
});

test("divergent revision stays as missing information", () => {
  const { consumption, csv } = load06();
  const rows = parseRevisaoCsv(csv);
  rows[0].revisao = "R02";
  const classified = classifyExtract(consumption, { revisaoRows: rows });
  const item = byId(classified, "RF-01");
  assert.equal(item.class, EXTRACT_CLASSES.INFORMACAO_FALTANTE);
  assert.ok(item.honesty_notes.includes("revision_diverges"));
  assert.equal(item.concludes_risk, false);
});

test("unreferenced evidence does not sustain a finding", () => {
  const { consumption, csv } = load06();
  const mutated = structuredClone(consumption);
  mutated.review_findings = [
    {
      ...mutated.review_findings[0],
      related_finding_id: "CF-GHOST",
    },
  ];
  const classified = classifyExtract(mutated, { revisaoCsv: csv });
  const item = byId(classified, "RF-01");
  assert.equal(item.class, EXTRACT_CLASSES.INFORMACAO_FALTANTE);
  assert.ok(item.honesty_notes.includes("evidence_not_referenced"));
  assert.equal(item.concludes_noncompliance, false);
});

test("unanswered checklist is not converted into a project error", () => {
  const { consumption, csv } = load06();
  const mutated = structuredClone(consumption);
  mutated.checklist = [
    { id: "chk-armadura", prompt: "Conferir armadura da B-01 contra o memorial", status: "not_performed" },
  ];
  const classified = classifyExtract(mutated, { revisaoCsv: csv });
  const item = byId(classified, "chk-armadura");
  assert.equal(item.class, EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA);
  assert.match(item.finding_text, /não é erro do projeto/);
  assert.equal(item.concludes_noncompliance, false);
});

test("unverified geometry or norm keeps the technical question", () => {
  const { consumption, csv } = load06();
  const classified = classifyExtract(consumption, { revisaoCsv: csv });
  const item = byId(classified, "RF-01-norma");
  assert.equal(item.class, EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA);
  assert.equal(item.question_preserved, true);
  assert.equal(item.concludes_risk, false);
  assert.equal(item.concludes_noncompliance, false);
  assert.match(item.forwarding, /pergunta técnica/);
  assert.match(item.finding_text, /sem exame de norma de dimensionamento/i);
});

test("mutation: forcing a risk conclusion without evidence is refused", () => {
  const { consumption, csv } = load06();
  const mutated = structuredClone(consumption);
  mutated.review_findings = [
    {
      ...mutated.review_findings[1],
      conclusion: "risco",
    },
  ];
  const classified = classifyExtract(mutated, { revisaoCsv: csv });
  const forced = byId(classified, "RF-02");
  assert.notEqual(forced.class, "risco");
  assert.equal(forced.concludes_risk, false);
  assert.equal(forced.concludes_noncompliance, false);
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
