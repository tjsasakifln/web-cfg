import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const routes = [
  ["/seguranca-trabalho-apoio-tecnico/", "seguranca-trabalho-apoio-tecnico/index.html"],
  ["/elaboracao-pgr/", "elaboracao-pgr/index.html"],
  ["/revisao-atualizacao-pgr/", "revisao-atualizacao-pgr/index.html"],
  ["/pgr-documentacao-sst-obras/", "pgr-documentacao-sst-obras/index.html"],
  ["/terceirizacao-documentacao-sst/", "terceirizacao-documentacao-sst/index.html"],
];
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const pages = new Map(routes.map(([route, file]) => [route, read(file)]));
const visible = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("visible-copy checks ignore browser-tolerated script and style closing tags", () => {
  const html = '<p>Oferta publicada</p><script>visita talvez necessária</script\t\n bar><style>.fake{content:"diagnóstico"}</style trailing>';
  assert.equal(visible(html), "Oferta publicada");
});

function commercialViolations(html) {
  const text = visible(html);
  const bad = [];
  for (const [id, expression] of [
    ["visit_maybe", /talvez (?:seja )?necess[aá]ria? (?:uma )?(?:visita|vistoria)/i],
    ["visit_in_scope", /(?:visita|vistoria|medi[cç][aã]o) (?:poder[aá]|pode|vai) (?:entrar|fazer parte) (?:da|do|no) (?:oferta|escopo|proposta)/i],
    ["diagnosis_product", /(?:entrega|produto) (?:principal|inicial)[^.!]{0,80}(?:diagn[oó]stico|encaminhamento)/i],
    ["paid_diagnosis", /(?:contrat(?:ar|e)|compre|pague|pre[cç]o|R\$)[^.!]{0,80}\bdiagn[oó]stico\b|\bdiagn[oó]stico\b[^.!]{0,80}(?:por R\$|com pre[cç]o|como produto|como entrega)/i],
    ["generic_agency", /solu[cç][oõ]es (?:personalizadas|sob medida)|excel[eê]ncia|parceiro estrat[eé]gico|potencialize/i],
    ["absolute_remote", /100% remoto|qualquer (?:laudo|documento) a dist[aâ]ncia/i],
    ["internal_journey", /\bjornada\b/i],
  ]) if (expression.test(text)) bad.push(id);
  if (/[—–]/.test(text)) bad.push("dash");
  return bad;
}

test("five distinct routes are indexable, canonical and registered", () => {
  const registry = JSON.parse(read("data/organic/public-family-registry.json"));
  const registered = registry.families.flatMap((row) => row.match?.routes || []);
  for (const [route] of routes) assert.equal(registered.filter((item) => item === route).length, 1, route);
  const sitemap = read("sitemap.xml");
  for (const [route, html] of pages) {
    assert.match(html, new RegExp(`<link href="https:\\/\\/confenge\\.com\\.br${route.replaceAll("/", "\\/")}" rel="canonical"\\/>`));
    assert.doesNotMatch(html, /noindex/i);
    const escapedRoute = `https://confenge.com.br${route}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(sitemap, new RegExp(`<loc>${escapedRoute}<\\/loc>\\s*<lastmod>2026-09-26<\\/lastmod>`), route);
  }
  assert.equal(new Set([...pages.values()].map((html) => html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1])).size, 5);
});

test("each route sells a concrete remote result and a specific next step", () => {
  const requirements = new Map([
    ["/seguranca-trabalho-apoio-tecnico/", ["execução documental remota", "Resolver minha documentação de SST"]],
    ["/elaboracao-pgr/", ["Inventário de Riscos", "Plano de Ação", "Solicitar elaboração do PGR"]],
    ["/revisao-atualizacao-pgr/", ["versão revisada", "Enviar meu PGR para revisão"]],
    ["/pgr-documentacao-sst-obras/", ["etapas da obra", "Organizar a documentação de SST da obra"]],
    ["/terceirizacao-documentacao-sst/", ["braço técnico externo", "Passar a documentação de SST para a CONFENGE"]],
  ]);
  for (const [route, expected] of requirements) {
    const text = visible(pages.get(route));
    for (const phrase of expected) assert.ok(text.includes(phrase), `${route}: ${phrase}`);
    assert.ok(text.includes("Engenheiro Civil e Engenheiro de Segurança do Trabalho"), route);
    assert.ok(text.includes("ART quando aplicável"), route);
    assert.ok(text.includes("nota fiscal"), route);
  }
});

test("published copy excludes field work from the remote offer without overpromising", () => {
  for (const [route, html] of pages) {
    assert.deepEqual(commercialViolations(html), [], route);
    const text = visible(html);
    assert.match(text, /atividade presencial[^.]{0,160}fora|fora (?:deste|do) escopo remoto/i, route);
    assert.match(text, /evid[eê]ncias|informa[cç][oõ]es|registros|documentos/i, route);
  }
  assert.deepEqual(commercialViolations(pages.get("/elaboracao-pgr/").replace("fica fora deste escopo remoto", "talvez seja necessária uma visita")), ["visit_maybe"]);
  assert.ok(commercialViolations(pages.get("/elaboracao-pgr/").replace("PGR elaborado", "produto principal: diagnóstico")).includes("diagnosis_product"));
  assert.ok(commercialViolations(pages.get("/elaboracao-pgr/").replace("PGR elaborado", "contrate o diagnóstico por R$ 599")).includes("paid_diagnosis"));
});

test("CTAs carry contextual analytics and safe first-contact copy", () => {
  const expectedIds = ["sst-hub-cta", "pgr-cta", "pgr-review-cta", "sst-obra-cta", "sst-outsourcing-cta"];
  for (const [index, [route]] of routes.entries()) {
    const html = pages.get(route);
    assert.ok(html.includes(`data-cta-id="${expectedIds[index]}"`), route);
    assert.match(html, /href="https:\/\/wa\.me\/5548988344559\?text=[^"]+"/i, route);
    assert.match(html, /data-journey="sst"/, route);
    assert.match(html, /data-tema="[^"]+"/, route);
    assert.match(html, /Comece descrevendo o caso|primeiro contato[^.]{0,120}(?:sem arquivo|não envie arquivo)/i, route);
    assert.doesNotMatch(html, /type=["']file["']/i, route);
  }
});

test("shell and hero CTAs are declared SST clicks with unique identities", () => {
  const shellIds = new Map([
    ["/seguranca-trabalho-apoio-tecnico/", ["sst-hub-header", "sst-hub-mobile"]],
    ["/elaboracao-pgr/", ["pgr-header", "pgr-mobile"]],
    ["/revisao-atualizacao-pgr/", ["pgr-review-header", "pgr-review-mobile"]],
    ["/pgr-documentacao-sst-obras/", ["sst-obra-header", "sst-obra-mobile"]],
    ["/terceirizacao-documentacao-sst/", ["sst-outsourcing-header", "sst-outsourcing-mobile"]],
  ]);
  const allIds = [];
  for (const [route, expectedIds] of shellIds) {
    const html = pages.get(route);
    for (const id of expectedIds) {
      const anchor = html.match(new RegExp(`<a\\b[^>]*data-cta-id="${id}"[^>]*>`))?.[0] || "";
      assert.match(anchor, /data-event-name="cta_click"/, `${route}: ${id}`);
      assert.match(anchor, /data-journey="sst"/, `${route}: ${id}`);
      assert.match(anchor, /data-tema="[^"]+"/, `${route}: ${id}`);
      allIds.push(id);
    }
  }
  assert.equal(new Set(allIds).size, allIds.length, "header and mobile IDs stay unique");

  const hubHero = pages.get("/seguranca-trabalho-apoio-tecnico/")
    .match(/<a\b[^>]*data-cta-id="sst-hub-cta"[^>]*>/)?.[0] || "";
  assert.match(hubHero, /data-event-name="cta_click"/);
  assert.match(hubHero, /data-journey="sst"/);
  assert.match(hubHero, /data-tema="Execução documental remota de SST"/);

  const browserTracker = read("js/modules/nav.js");
  assert.match(browserTracker, /if \(sstContext\(el\).*isDeclaredCta[\s\S]{0,160}trackSstCta\(el, classified, withCta\)/);
  assert.match(browserTracker, /track\('sst_cta_click', props\)/);
});

test("metadata, JSON-LD and breadcrumbs are valid on every page", () => {
  for (const [route, html] of pages) {
    assert.match(html, /<meta content="[^"]{80,}" name="description"\/>/, route);
    assert.match(html, /property="og:title"/, route);
    assert.match(html, /property="og:description"/, route);
    assert.match(html, /<time datetime="2026-09-26">26 de setembro de 2026<\/time>/, route);
    assert.match(html, /aria-label="Navegação estrutural"/, route);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length >= 1, route);
    for (const block of blocks) assert.doesNotThrow(() => JSON.parse(block[1]), route);
    assert.ok(blocks.some((block) => block[1].includes("BreadcrumbList") && block[1].includes("Service")), route);
  }
});

test("the demonstrative table remains keyboard accessible on narrow screens", () => {
  const hub = pages.get("/seguranca-trabalho-apoio-tecnico/");
  const wrapper = hub.match(/<div\b[^>]*class="table-wrap"[^>]*>/)?.[0] || "";
  assert.match(wrapper, /tabindex="0"/);
  assert.match(wrapper, /role="region"/);
  assert.match(wrapper, /aria-label="[^"]+"/);
});

test("the service directory projects the canonical SST label into JSON-LD", () => {
  const services = read("servicos/index.html");
  assert.doesNotMatch(services, /Apoio técnico de segurança do trabalho/);
  const blocks = [...services.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const entries = blocks.flatMap((block) => block["@graph"] || [])
    .flatMap((node) => node.mainEntity?.itemListElement || []);
  const sst = entries.find((entry) => entry.url === "https://confenge.com.br/seguranca-trabalho-apoio-tecnico/");
  assert.equal(sst?.name, "Documentação de SST");
});

test("portfolio is exhaustive about remote, conditional and excluded work", () => {
  const portfolio = JSON.parse(read("data/commercial/sst-remote-portfolio.v1.json"));
  assert.equal(portfolio.contract, "CONFENGE_SST_REMOTE_PORTFOLIO/1.0.0");
  for (const key of ["REMOTO_COMERCIALIZAVEL", "REMOTO_CONDICIONAL", "NAO_OFERTAR_NESTA_VERTICAL"]) assert.ok(portfolio.classes[key]);
  assert.equal(portfolio.commercial_routes.length, 5);
  const excluded = JSON.stringify(portfolio.classes.NAO_OFERTAR_NESTA_VERTICAL);
  for (const item of ["ASO", "PCMSO", "dosimetria", "medição de calor", "inspeção física de canteiro"]) assert.ok(excluded.includes(item), item);
});

test("the release artifact allowlist packages every SST purchase route", () => {
  const publicArtifact = read("scripts/pseo/public_artifact.py");
  for (const [, file] of routes) {
    const topLevel = file.split("/")[0];
    assert.match(publicArtifact, new RegExp(`"${topLevel}"`), topLevel);
  }
});
