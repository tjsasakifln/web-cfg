import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  conferralState,
  displayEstado,
  loadPublicRegister,
  renderFindingHtml,
  PUBLIC_ESTADO,
} from "../../scripts/coordination/interference_register.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAGE = path.join(root, "compatibilizacao-projetos-engenharia/index.html");
const FIXTURE = path.join(root, "tests/coordination/fixtures/pending-finding.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function visible(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

test("shipped page finding stays pending after detection-only", () => {
  const record = loadPublicRegister(root);
  assert.equal(record.finding.detection, "detected");
  assert.equal(record.finding.correction_status, "pending");
  const estado = displayEstado(record.finding, record.live_documents);
  assert.equal(estado.code, "pending_author_adjustment");
  assert.equal(estado.resolved, false);
  assert.equal(estado.label, PUBLIC_ESTADO.pending_author_adjustment);
  assert.match(estado.label, /pendente/i);
  assert.doesNotMatch(estado.label, /corrigid|resolvid/i);

  const html = fs.readFileSync(PAGE, "utf8");
  const finding = html.match(/<article class="coord-finding"[\s\S]*?<\/article>/);
  assert.ok(finding, "shipped page must contain the finding article");
  assert.match(finding[0], /data-detection="detected"/);
  assert.match(finding[0], /data-estado="pending_author_adjustment"/);
  assert.match(finding[0], /data-resolved="false"/);
  assert.match(finding[0], /Registrada — ajuste pendente do autor/);
  assert.doesNotMatch(finding[0], /Corrigid|correção resolvida|resolvida/i);
});

test("regenerating the finding html does not promote pending to resolved", () => {
  const record = loadPublicRegister(root);
  const first = renderFindingHtml(record);
  const second = renderFindingHtml(clone(record));
  assert.equal(first, second);
  assert.match(first, /data-estado="pending_author_adjustment"/);
  assert.match(second, /data-resolved="false"/);
  const html = fs.readFileSync(PAGE, "utf8");
  assert.match(html, /data-finding-id="INT-DEM-001"/);
  assert.match(html, /data-estado-label="pending_author_adjustment"/);
});

test("same element, new document revision is not conferred against the new revision", () => {
  const record = loadPublicRegister(root);
  const live = clone(record.live_documents);
  const structural = live.find((row) => row.document_id === "EST-VIG-01");
  assert.ok(structural, "public register must include the structural document");
  assert.equal(structural.revision, "R03");
  structural.revision = "R04";

  const conferral = conferralState(record.finding, live);
  assert.equal(conferral.stale, true);
  assert.equal(conferral.document_id, "EST-VIG-01");
  assert.equal(conferral.conferred_revision, "R03");
  assert.equal(conferral.live_revision, "R04");

  const estado = displayEstado(record.finding, live);
  assert.equal(estado.code, "stale_revision");
  assert.equal(estado.resolved, false);
  assert.match(estado.detail, /EST-VIG-01/);
  assert.match(estado.detail, /R03/);
  assert.match(estado.detail, /R04/);
  assert.match(estado.label, /Não conferida contra a revisão atual/);
  assert.match(estado.detail, /não foi conferido contra a revisão nova/);
  assert.doesNotMatch(estado.detail, /foi conferido contra a revisão R04/);

  const rendered = renderFindingHtml(record, live);
  assert.match(rendered, /data-estado="stale_revision"/);
  assert.match(rendered, /Não conferida contra a revisão atual/);
  assert.match(rendered, /R03 → R04/);
  assert.doesNotMatch(rendered, /data-resolved="true"/);
  assert.doesNotMatch(visible(rendered), /Corrigid/i);
});

test("claimed resolved without author acceptance stays pending", () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const finding = fixture.finding;
  finding.detection = "detected";
  finding.correction_status = "resolved";
  finding.correction_designed = false;
  finding.author_acceptance.accepted = false;
  const estado = displayEstado(finding, fixture.live_documents);
  assert.equal(estado.code, "pending_author_adjustment");
  assert.equal(estado.resolved, false);
  assert.equal(estado.withheld_invalid_resolution, true);
  const rendered = renderFindingHtml({ ...fixture, finding }, fixture.live_documents);
  assert.match(rendered, /ajuste pendente do autor/);
  assert.doesNotMatch(visible(rendered), /Corrigid|correção resolvida/i);
});

test("pending recommendation does not become correção resolvida", () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  fixture.finding.correction_designed = true;
  fixture.finding.correction_status = "pending";
  fixture.finding.author_acceptance.accepted = false;
  const estado = displayEstado(fixture.finding, fixture.live_documents);
  assert.equal(estado.code, "correction_proposed");
  assert.equal(estado.resolved, false);
  assert.match(estado.label, /aguarda aceite/);
  assert.doesNotMatch(estado.label, /resolvid|corrigid/i);
});

test("mutation: a renderer that labels detection as Corrigido is rejected", () => {
  const record = loadPublicRegister(root);
  const honest = renderFindingHtml(record);
  const mutated = honest
    .replace(/data-estado="pending_author_adjustment"/g, 'data-estado="resolved"')
    .replace(/data-resolved="false"/g, 'data-resolved="true"')
    .replace(/Registrada — ajuste pendente do autor/g, "Corrigido");
  assert.match(mutated, /Corrigido/);
  assert.notEqual(mutated, honest);
  const shipped = fs.readFileSync(PAGE, "utf8");
  assert.equal(shipped.includes("Corrigido"), false);
  assert.equal(/data-resolved="true"/.test(shipped), false);
  const estado = displayEstado(record.finding, record.live_documents);
  assert.notEqual(estado.label, "Corrigido");
});

test("public register is didactic until an INB-06 overlay exists", () => {
  const record = loadPublicRegister(root);
  const overlayPresent = record.loaded_from !== "data/coordination/interference-register.v1.json";
  if (!overlayPresent) {
    assert.equal(record.source, "didactic_first_party");
    const html = fs.readFileSync(PAGE, "utf8");
    assert.match(html, /Exemplo demonstrativo\. Não é obra de cliente\./);
    assert.doesNotMatch(html, /Fixture de teste/);
  }
});
