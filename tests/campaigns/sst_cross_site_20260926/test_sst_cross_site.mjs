import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("home presents SST as remote documentary execution and routes to the hub", () => {
  const home = read("index.html");
  assert.match(home, /"jobTitle":"Engenheiro Civil e Engenheiro de Segurança do Trabalho"/);
  assert.match(home, /Assumimos remotamente a documentação contratada/);
  assert.match(home, /documento técnico digital elaborado ou revisado, com responsável identificado, ART quando aplicável e nota fiscal/);
  assert.match(home, /href="\/seguranca-trabalho-apoio-tecnico\/"/);
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

test("cross-site SST entrances preserve the remote documentary offer and BOFU links", () => {
  for (const file of ["servicos/index.html", "triagem-tecnica/index.html", "entregas/index.html"]) {
    const page = read(file);
    assert.match(page, /remot/i, file);
    assert.match(page, /\/seguranca-trabalho-apoio-tecnico\//, file);
    for (const route of ["elaboracao-pgr", "revisao-atualizacao-pgr", "pgr-documentacao-sst-obras", "terceirizacao-documentacao-sst"]) {
      assert.match(page, new RegExp(`/${route}/`), `${file}: ${route}`);
    }
  }
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
  assert.match(profile, /data-cta-id="perfil-sst-whatsapp"[^>]*data-journey="sst"[^>]*data-route-family="seguranca-trabalho-apoio-tecnico"[^>]*data-tema="sst_perfil"[^>]*href="https:\/\/wa\.me\//);
});
