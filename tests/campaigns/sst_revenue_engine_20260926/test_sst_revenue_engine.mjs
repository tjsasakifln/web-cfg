import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pagePath = path.join(root, "seguranca-trabalho-apoio-tecnico/index.html");
const page = fs.readFileSync(pagePath, "utf8");

function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function anchorAttributes(html) {
  return [...html.matchAll(/<a\b([^>]*)>/gi)].map((match) => match[1]);
}

test("one canonical SST route owns the purchase intent", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, "data/organic/public-family-registry.json"), "utf8"));
  const pageRows = (registry.families || registry.routes || registry.pages || []).filter((row) =>
    JSON.stringify(row).includes("/seguranca-trabalho-apoio-tecnico/"),
  );
  assert.equal(pageRows.length, 1);
  assert.match(page, /<link href="https:\/\/confenge\.com\.br\/seguranca-trabalho-apoio-tecnico\/" rel="canonical"\/>/);
  assert.doesNotMatch(page, /noindex/i);
});

test("problem first sections and remote boundary are visible", () => {
  const text = visibleText(page);
  for (const expected of [
    "Documentação de segurança do trabalho organizada remotamente",
    "Revisar ou atualizar o PGR ocupacional",
    "PGR de canteiro precisa acompanhar a etapa da obra",
    "podendo chegar a três anos na hipótese normativa aplicável",
    "depois da implementação das medidas de prevenção",
    "solicitação justificada dos trabalhadores ou da CIPA",
    "O trabalho pode começar a distância. O método decide até onde ele pode ir.",
    "fatores ergonômicos e psicossociais relacionados ao trabalho",
    "O eSocial recebe eventos, não o PGR em si",
    "ART quando aplicável ao serviço contratado",
  ]) {
    assert.ok(text.includes(expected), expected);
  }
  for (const id of ["situacoes-sst", "pgr-obras", "trabalho-remoto", "documentos-sst", "duvidas-sst", "contato-sst"]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
});

test("contextual CTAs preserve route, journey and distinct topics", () => {
  const contextual = anchorAttributes(page).filter((attrs) => /data-journey="sst"/.test(attrs));
  assert.ok(contextual.length >= 10, contextual.length);
  const topics = new Set();
  const ids = new Set();
  for (const attrs of contextual) {
    const topic = attrs.match(/data-tema="([^"]+)"/)?.[1];
    const id = attrs.match(/data-cta-id="([^"]+)"/)?.[1];
    if (topic) topics.add(topic);
    if (id) {
      assert.ok(!ids.has(id), `duplicate CTA id: ${id}`);
      ids.add(id);
    }
  }
  assert.ok(topics.has("Revisão ou atualização do PGR ocupacional"));
  assert.ok(topics.has("PGR de canteiro NR 18"));
  assert.ok(topics.has("Organização remota da rotina documental de SST"));
  assert.ok(topics.has("Exigência de documento de SST"));
  assert.match(page, /data-origem="\/seguranca-trabalho-apoio-tecnico\/"/);
});

test("every direct SST channel carries journey and topic into analytics", () => {
  const direct = anchorAttributes(page).filter(
    (attrs) => /data-route-family="seguranca-trabalho-apoio-tecnico"/.test(attrs)
      && /href="(?:https:\/\/wa\.me\/|mailto:|tel:)/.test(attrs),
  );
  assert.ok(direct.length >= 9, direct.length);
  for (const attrs of direct) {
    assert.match(attrs, /data-journey="sst"/);
    assert.match(attrs, /data-tema="[^"]+"/);
  }
  const nav = fs.readFileSync(path.join(root, "js/modules/nav.js"), "utf8");
  assert.match(nav, /const commercialTopic = el\.getAttribute\('data-tema'\)/);
  assert.match(nav, /track\('whatsapp_click',[\s\S]*?topic: commercialTopic/);
  assert.match(nav, /track\('email_click',[\s\S]*?topic: commercialTopic/);
  assert.match(nav, /classified\.kind === 'tel'[\s\S]*?topic: commercialTopic/);
});

test("page keeps sensitive data and health acts out of first contact", () => {
  assert.doesNotMatch(page, /<form\b/i);
  assert.doesNotMatch(page, /type=["']file["']/i);
  const text = visibleText(page);
  assert.ok(text.includes("Não envie arquivo, nome de trabalhador, CPF, exame ou atestado no primeiro contato."));
  assert.ok(text.includes("Exame, ASO, PCMSO, diagnóstico, aptidão e nexo clínico"));
});

test("regulatory overclaims remain rejected", () => {
  const text = visibleText(page);
  for (const forbidden of [
    /100% remoto/i,
    /sem visita em qualquer caso/i,
    /PGR (é )?enviado ao eSocial[.!]/i,
    /profissional habilitado ou método/i,
    /Insalubridade: depende de medição/i,
    /documentos existentes, vencidos/i,
    /garante conformidade/i,
    /elimina autuação/i,
  ]) {
    assert.doesNotMatch(text, forbidden);
  }
});

test("official credentials are verified while identifiers stay out of rendered surfaces", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, "data/site/credential-registry.json"), "utf8"));
  const byId = new Map(registry.claims.map((claim) => [claim.id, claim]));
  const expectedPersonalCredentials = new Set([
    "person-civil-eesc-usp",
    "person-crea-active",
    "person-crea-sc",
    "person-rnp",
    "person-titles-civil-sst",
    "person-sst-engineer",
    "person-technical-link",
    "person-cptec-registration",
    "person-postgrad-valuations",
  ]);
  const classifiedPersonalCredentials = registry.claims
    .filter((claim) => claim.entity === "person" && claim.claim_category === "credential")
    .map((claim) => claim.id);
  assert.deepEqual(new Set(classifiedPersonalCredentials), expectedPersonalCredentials);
  for (const id of expectedPersonalCredentials) assert.equal(byId.get(id)?.status, "VERIFIED", id);
  assert.equal(byId.get("person-analyzed-volume")?.claim_category, "operational_history");
  assert.equal(byId.get("person-analyzed-volume")?.status, "SELF_ATTESTED");
  assert.equal(byId.get("service-art-nf")?.claim_category, "operational_rule");
  assert.equal(byId.get("service-art-nf")?.status, "SELF_ATTESTED");
  for (const id of ["person-crea-sc", "person-rnp"]) {
    assert.equal(byId.get(id)?.status, "VERIFIED", id);
    assert.deepEqual(byId.get(id)?.projection_surfaces, [], id);
  }
  assert.ok(visibleText(page).includes("Engenheiro Civil e Engenheiro de Segurança do Trabalho"));
  const specialist = fs.readFileSync(
    path.join(root, "especialista/tiago-jun-sasaki/index.html"),
    "utf8",
  );
  assert.match(specialist, /<title>Tiago Jun Sasaki \| Engenheiro Civil e de Segurança do Trabalho \| CONFENGE<\/title>/);
  assert.match(specialist, /"jobTitle":"Engenheiro Civil e Engenheiro de Segurança do Trabalho"/);
  assert.match(specialist, /"knowsAbout":\[[^\]]*"Engenharia de Segurança do Trabalho"/);
  assert.match(specialist, /"dateModified":"2026-09-26"/);
  const confidence = fs.readFileSync(path.join(root, "confianca/index.html"), "utf8");
  assert.match(confidence, /"dateModified":"2026-09-26"/);
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  assert.match(
    sitemap,
    /<loc>https:\/\/confenge\.com\.br\/confianca\/<\/loc>\s*<lastmod>2026-09-26<\/lastmod>/,
  );
});

test("campaign closes complete family coverage without claiming commercial result", () => {
  const matrix = JSON.parse(
    fs.readFileSync(
      path.join(root, "docs/campaigns/sst-revenue-engine-20260926/evidence/coverage-matrix.json"),
      "utf8",
    ),
  );
  const gaps = JSON.parse(
    fs.readFileSync(
      path.join(root, "docs/campaigns/sst-revenue-engine-20260926/evidence/prior-gap-closure.json"),
      "utf8",
    ),
  );
  const intentContract = JSON.parse(
    fs.readFileSync(path.join(root, "data/corporate/intent-family-matrix.v1.json"), "utf8"),
  );
  assert.equal(matrix.family_count, 13);
  assert.equal(matrix.rows.length, 13);
  assert.equal(new Set(matrix.rows.map((row) => row.intent_family)).size, 13);
  const expected = new Map(
    intentContract.intent_families.map((row) => [row.intent_family, row]),
  );
  assert.deepEqual(
    [...matrix.rows.map((row) => row.intent_family)].sort(),
    [...expected.keys()].sort(),
  );
  for (const row of matrix.rows) {
    assert.equal(row.owner, expected.get(row.intent_family).canonical_service_family, row.intent_family);
    assert.equal(row.terminal_action, expected.get(row.intent_family).terminal_action, row.intent_family);
  }
  const sst = matrix.rows.find((row) => row.intent_family === "organizar_sst");
  assert.equal(sst.canonical_route, "/seguranca-trabalho-apoio-tecnico/");
  assert.equal(sst.indexability, "index,follow");
  assert.equal(matrix.explicit_checks.quantitativos, "covered in orcar_planejar_decidir");
  assert.equal(matrix.explicit_checks.sinapi, "reference content remains under cost planning, not SST");
  assert.equal(gaps.gaps.find((gap) => gap.id === "G03")?.state, "PENDING_HUMAN");
  assert.equal(gaps.gaps.find((gap) => gap.id === "COMMERCIAL_RESULT")?.state, "NOT_YET_MEASURED");
});
