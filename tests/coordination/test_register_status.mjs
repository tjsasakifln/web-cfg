import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  conferralState,
  displayEstado,
  loadPublicRegister,
  mapInb06Consumption,
  renderFindingHtml,
  PUBLIC_ESTADO,
} from "../../scripts/coordination/interference_register.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAGE = path.join(root, "compatibilizacao-projetos-engenharia/index.html");
const FIXTURE = path.join(root, "tests/coordination/fixtures/pending-finding.json");
const INB06 = path.join(root, "tests/coordination/fixtures/inb06-consumption.v1.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function visible(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function shippedFinding(id) {
  const html = fs.readFileSync(PAGE, "utf8");
  const re = new RegExp(`<article class="coord-finding"[^>]*data-finding-id="${id}"[\\s\\S]*?</article>`);
  return html.match(re)?.[0] || "";
}

test("shipped page consumes CF-GEO-01 and presents resolved_in_R01 as corrected in R01 without approval", () => {
  const record = loadPublicRegister(root);
  assert.equal(record.finding.id, "CF-GEO-01");
  assert.equal(record.source, "inb06");
  assert.equal(record.finding.detection, "detected");
  assert.equal(record.finding.correction_status, "pending");
  assert.equal(record.finding.provider_state, "resolved_in_R01");
  const estado = displayEstado(record.finding, record.live_documents);
  assert.equal(estado.code, "corrected_in_revision");
  assert.equal(estado.resolved, false);
  assert.equal(estado.label, PUBLIC_ESTADO.corrected_in_revision);
  assert.match(estado.label, /Corrigido na revisão R01/);
  assert.doesNotMatch(estado.label, /aprovado/i);

  const finding = shippedFinding("CF-GEO-01");
  assert.ok(finding, "shipped page must contain CF-GEO-01");
  assert.match(finding, /data-detection="detected"/);
  assert.match(finding, /data-estado="corrected_in_revision"/);
  assert.match(finding, /data-resolved="false"/);
  assert.match(finding, /Corrigido na revisão R01/);
  assert.match(finding, /href="\/casos\/demonstrativo-projeto-privado\/#CF-GEO-01"/);
  assert.doesNotMatch(finding, /resolved_in_R01/);
  assert.doesNotMatch(visible(finding), /\baprovado\b/i);
  const html = fs.readFileSync(PAGE, "utf8");
  assert.equal(html.includes("INT-DEM-001"), false);
});

test("INB-06 resolved_in_R01 is not author acceptance or safety certification", () => {
  const consumption = JSON.parse(fs.readFileSync(INB06, "utf8"));
  assert.equal(consumption.coordination_findings[0].id, "CF-GEO-01");
  assert.equal(consumption.coordination_findings[0].state, "resolved_in_R01");
  const mapped = mapInb06Consumption(consumption);
  assert.equal(mapped.finding.id, "CF-GEO-01");
  assert.equal(mapped.finding.correction_status, "pending");
  assert.equal(mapped.finding.correction_designed, false);
  assert.equal(mapped.finding.author_acceptance.accepted, false);
  assert.deepEqual(mapped.finding.conferred_against, [
    { document_id: "PR-ARQ", revision: "R00" },
    { document_id: "PR-EST", revision: "R00" },
  ]);
  const estado = displayEstado(mapped.finding, mapped.live_documents);
  assert.equal(estado.resolved, false);
  assert.equal(estado.code, "corrected_in_revision");
  assert.doesNotMatch(estado.label, /aprovado|certifica|valida[çc][aã]o estrutural/i);
});

test("regenerating the finding html does not promote to author-accepted", () => {
  const record = loadPublicRegister(root);
  const first = renderFindingHtml(record);
  const second = renderFindingHtml(clone(record));
  assert.equal(first, second);
  assert.match(first, /data-estado="corrected_in_revision"/);
  assert.match(second, /data-resolved="false"/);
  const html = fs.readFileSync(PAGE, "utf8");
  assert.match(html, /data-finding-id="CF-GEO-01"/);
  assert.match(html, /data-estado-label="corrected_in_revision"/);
});

test("same element, PR-ARQ R00 to R01 is not conferred against the new revision", () => {
  const record = loadPublicRegister(root);
  const live = clone(record.live_documents);
  const arq = live.find((row) => row.document_id === "PR-ARQ");
  assert.ok(arq, "public register must include PR-ARQ");
  assert.equal(arq.revision, "R00");
  arq.revision = "R01";

  const conferral = conferralState(record.finding, live);
  assert.equal(conferral.stale, true);
  assert.equal(conferral.document_id, "PR-ARQ");
  assert.equal(conferral.conferred_revision, "R00");
  assert.equal(conferral.live_revision, "R01");

  const estado = displayEstado(record.finding, live);
  assert.equal(estado.code, "stale_revision");
  assert.equal(estado.resolved, false);
  assert.match(estado.detail, /PR-ARQ/);
  assert.match(estado.detail, /R00/);
  assert.match(estado.detail, /R01/);
  assert.match(estado.label, /Não conferida contra a revisão atual/);
  assert.match(estado.detail, /não foi conferido contra a revisão nova/);

  const rendered = renderFindingHtml(record, live);
  assert.match(rendered, /data-estado="stale_revision"/);
  assert.match(rendered, /Não conferida contra a revisão atual/);
  assert.match(rendered, /R00 → R01/);
  assert.doesNotMatch(rendered, /data-resolved="true"/);
  assert.doesNotMatch(visible(rendered), /Corrigid|resolvido em R01/i);
});

test("CF-INFO-01 stays information requested and is not a geometric correction", () => {
  const record = loadPublicRegister(root);
  const info = (record.secondary_findings || []).find((row) => row.id === "CF-INFO-01");
  assert.ok(info);
  const estado = displayEstado(info, record.live_documents);
  assert.equal(estado.resolved, false);
  assert.equal(estado.code, "information_requested");
  const shipped = shippedFinding("CF-INFO-01");
  assert.match(shipped, /data-estado="information_requested"/);
  assert.match(shipped, /Pedido de informação/);
  assert.doesNotMatch(shipped, /data-resolved="true"/);
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
  assert.doesNotMatch(visible(rendered), /aprovado|correção resolvida/i);
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

test("mutation: unknown provider state is not printed and is not mapped to aprovado", () => {
  const record = loadPublicRegister(root);
  const finding = clone(record.finding);
  finding.provider_state = "unpublished_ok_to_build_v9";
  const estado = displayEstado(finding, record.live_documents);
  assert.equal(estado.resolved, false);
  assert.doesNotMatch(estado.label || "", /unpublished_ok_to_build_v9/);
  assert.doesNotMatch(estado.label || "", /aprovado/i);
  const rendered = renderFindingHtml({ ...record, finding }, record.live_documents);
  assert.doesNotMatch(visible(rendered), /unpublished_ok_to_build_v9/);
  assert.doesNotMatch(visible(rendered), /\baprovado\b/i);
  const shipped = fs.readFileSync(PAGE, "utf8");
  assert.equal(/data-finding-id="CF-GEO-01"[^>]*data-resolved="true"/.test(shipped), false);
  assert.doesNotMatch(shipped, />\s*resolved_in_R01\s*</);
});
