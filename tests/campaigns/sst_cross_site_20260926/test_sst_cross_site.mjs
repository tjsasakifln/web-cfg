import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const hubRoute = "/seguranca-trabalho-apoio-tecnico/";
const entryPositions = {
  "home-service-sst": "home_services",
  "services-sst-hub": "service_directory",
  "triage-sst-hub": "contact_directory",
  "deliverables-sst-hub": "capabilities",
  "profile-sst-hub": "profile_scope",
};
const attr = (node, name) => node?.attrs?.find((item) => item.name === name)?.value;
const text = (node) => node?.nodeName === "#text" ? node.value : (node?.childNodes || []).map(text).join(" ");
const nodes = (node) => [node, ...(node?.childNodes || []).flatMap(nodes)];
function mainNodes(html) {
  const main = nodes(parse(html)).find((node) => node.tagName === "main");
  assert.ok(main, "SST entrance must be inside the actual main content");
  return nodes(main);
}
function assertSstEntry(html, id, scopeId, fragment = "") {
  const main = mainNodes(html);
  const scope = scopeId ? main.find((node) => attr(node, "id") === scopeId) : main[0];
  assert.ok(scope, `missing SST entrance scope: ${scopeId}`);
  const matches = nodes(scope).filter((node) => node.tagName === "a" && attr(node, "data-cta-id") === id);
  assert.equal(matches.length, 1, `one attributed SST entrance: ${id}`);
  const entry = matches[0];
  assert.equal(attr(entry, "href"), hubRoute + fragment);
  assert.equal(attr(entry, "data-event-name"), "cta_click");
  assert.ok(entryPositions[id], "SST entry has a declared stable position");
  assert.equal(attr(entry, "data-cta-position"), entryPositions[id]);
  assert.equal(attr(entry, "data-journey"), "sst");
  assert.equal(attr(entry, "data-route-family"), "seguranca-trabalho-apoio-tecnico");
  assert.match(attr(entry, "data-tema") || "", /SST|Segurança do Trabalho/i);
  assert.match(text(entry), /SST|Segurança do Trabalho/i);
  return entry;
}
function assertHubTerminals(html) {
  const scope = mainNodes(html).find((node) => attr(node, "id") === "contato-sst");
  assert.ok(scope, "SST contact target must exist inside main");
  const channels = nodes(scope).filter((node) => node.tagName === "a" && attr(node, "data-fallback-channel"));
  assert.equal(channels.length, 3);
  for (const [channel, destination] of [["whatsapp", "https://wa.me/5548988344559"], ["email", "mailto:tiago.sasaki@confenge.com.br"], ["phone", "tel:+5548988344559"]]) {
    const matches = channels.filter((node) => attr(node, "data-fallback-channel") === channel);
    assert.equal(matches.length, 1, `one real ${channel} terminal`);
    const node = matches[0];
    assert.equal(attr(node, "data-cta-id"), `sst-hub-contact-${channel}`);
    const href = attr(node, "href") || "";
    if (channel === "whatsapp") {
      const url = new URL(href);
      assert.equal(url.origin + url.pathname, destination);
      assert.ok(url.searchParams.get("text"), "WhatsApp must carry the documentary request");
    } else assert.equal(channel === "phone" ? href : href.split("?")[0], destination);
    assert.equal(attr(node, "data-journey"), "sst");
    assert.equal(attr(node, "data-route-family"), "seguranca-trabalho-apoio-tecnico");
    assert.match(attr(node, "data-tema") || "", /SST|Segurança do Trabalho/i);
  }
}

test("home presents documentary SST execution and routes with declared intent to its remote hub", () => {
  const home = read("index.html");
  assert.match(home, /"jobTitle":"Engenheiro Civil e Engenheiro de Segurança do Trabalho"/);
  const entry = assertSstEntry(home, "home-service-sst", "servicos-complementares");
  assert.match(text(entry), /Elaboração, revisão e organização de documentação técnica de SST/);
  const hub = read("seguranca-trabalho-apoio-tecnico/index.html");
  for (const material of [/execução documental remota/, /ART quando aplicável/, /nota fiscal/]) assert.match(text(mainNodes(hub)[0]), material);
  assert.doesNotMatch(home, /situacao-sst[\s\S]{0,1500}assistencia-trabalhista/);
});

test("general intake has a safe, explicit SST need selector", () => {
  const home = read("index.html");
  for (const expected of [
    "Elaborar PGR",
    "Revisar ou atualizar PGR",
    "Documentação de SST para obra",
    "Terceirizar ou organizar documentação de SST",
    "Recebi uma exigência específica",
    "Não sei o que preciso",
    "Outro",
  ]) assert.match(home, new RegExp(expected));
  assert.match(home, /name="sst_necessidade"/);
  assert.match(home, /<fieldset class="form-sst-need" data-sst-need hidden>/);
  assert.doesNotMatch(home, /data-sst-need[\s\S]{0,1200}type="file"/);
});

test("cross-site SST entrances retain intent through the hub and its BOFU branches", () => {
  for (const [file, id] of [["servicos/index.html", "services-sst-hub"], ["triagem-tecnica/index.html", "triage-sst-hub"], ["entregas/index.html", "deliverables-sst-hub"]]) {
    const page = read(file);
    assertSstEntry(page, id);
  }
  const hub = read("seguranca-trabalho-apoio-tecnico/index.html");
  for (const route of ["elaboracao-pgr", "revisao-atualizacao-pgr", "pgr-documentacao-sst-obras", "terceirizacao-documentacao-sst"]) {
    assert.ok(mainNodes(hub).some((node) => node.tagName === "a" && attr(node, "href") === `/${route}/`), route);
  }
  assertHubTerminals(hub);
  assert.doesNotMatch(read("servicos/index.html"), /assistencia-trabalhista/);
  assert.doesNotMatch(read("triagem-tecnica/index.html"), /assistencia-trabalhista/);
});

test("profile and trust disclose the verified dual engineering role without extra credentials", () => {
  for (const file of ["especialista/tiago-jun-sasaki/index.html", "confianca/index.html"]) {
    const page = read(file);
    assert.match(page, /Engenheiro Civil e Engenheiro de Segurança do Trabalho/);
    assert.match(page, /\/seguranca-trabalho-apoio-tecnico\//);
  }
  const profile = read("especialista/tiago-jun-sasaki/index.html");
  assertSstEntry(profile, "profile-sst-hub", "conducao", "#contato-sst");
});

test("SST entrance contract rejects footer substitutes and missing or misplaced intent", () => {
  const source = read("especialista/tiago-jun-sasaki/index.html");
  assertSstEntry(source, "profile-sst-hub", "conducao", "#contato-sst");
  const tag = source.match(/<a\b[^>]*data-cta-id="profile-sst-hub"[^>]*>/)?.[0];
  assert.ok(tag);
  const changed = (replacement) => source.replace(tag, replacement);
  for (const replacement of [
    tag.replace("#contato-sst", ""),
    tag.replace('data-journey="sst"', 'data-journey="contrato"'),
    tag.replace('data-route-family="seguranca-trabalho-apoio-tecnico"', 'data-route-family="triagem-tecnica"'),
    tag.replace('data-tema="Documentação técnica de SST"', 'data-tema=""'),
    tag.replace('data-event-name="cta_click"', '') + '<span data-event-name="cta_click">',
    tag.replace('data-cta-position="profile_scope"', ''),
    tag.replace('data-cta-id="profile-sst-hub"', ''),
    '</section>' + tag,
    tag + '</a>' + tag,
  ]) assert.throws(() => assertSstEntry(changed(replacement), "profile-sst-hub", "conducao", "#contato-sst"));
});

test("SST terminals reject missing targets, duplicate channels and lost attribution", () => {
  const source = read("seguranca-trabalho-apoio-tecnico/index.html");
  assertHubTerminals(source);
  const tag = source.match(/<a\b[^>]*data-fallback-channel="whatsapp"[^>]*>/)?.[0];
  assert.ok(tag);
  for (const changed of [
    source.replace('id="contato-sst"', 'id="retired-contact"'),
    source.replace(tag, tag.replace('data-journey="sst"', 'data-journey="contrato"')),
    source.replace(tag, tag.replace('data-route-family="seguranca-trabalho-apoio-tecnico"', 'data-route-family="generic"')),
    source.replace(tag, tag.replace('data-tema="Execução documental remota de SST"', 'data-tema=""')),
    source.replace(tag, tag.replace('https://wa.me/5548988344559?', '/triagem-tecnica/?')),
    source.replace(tag, tag + '</a>' + tag),
    source.replace('data-cta-id="sst-hub-contact-email"', ''),
    source.replace('data-cta-id="sst-hub-contact-phone"', ''),
    source.replace('mailto:tiago.sasaki@confenge.com.br?', 'mailto:tiago.sasaki@confenge.com.br.evil?'),
    source.replace('tel:+5548988344559', 'tel:+554898834455900'),
    source.replace(tag, tag.replace('https://wa.me/5548988344559?', 'https://wa.me/554898834455900?')),
    source.replace(tag, tag.replace(/\?text=[^"]+/, '')),
  ]) assert.throws(() => assertHubTerminals(changed));
});
