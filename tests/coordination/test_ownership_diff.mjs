import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAGE = "compatibilizacao-projetos-engenharia/index.html";
const CONTENTS = [
  "conteudos/quando-compatibilizar-projetos/index.html",
  "conteudos/como-contratar-compatibilizacao-projetos/index.html",
];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

// Until VALOR-IMEDIATO-20260914 this file compared `git diff origin/main` with
// the ownership list of the 2026-09-11 coordination campaign (the compat page
// plus its two guides had to be in the diff; /servicos/ and revisão pages could
// not be). That property belonged to one branch: on main the diff is empty and
// any later campaign that legitimately touches /servicos/ or the guides fails
// it. What must hold on every branch is the shape it protected: the landing
// exists, keeps its two guides reachable both ways, and never resurrects the
// retired /coordenacao-bim/ and "clash detection" surfaces.
test("compat landing and its two guides exist and link both ways", () => {
  const page = read(PAGE);
  for (const rel of CONTENTS) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, `missing guide: ${rel}`);
    const href = "/" + rel.replace(/index\.html$/, "");
    assert.equal(page.includes(`href="${href}"`), true, `landing does not link ${href}`);
    assert.match(read(rel), /href="\/compatibilizacao-projetos-engenharia\//);
  }
});

test("retired coordination surfaces do not come back through the landing or the guides", () => {
  for (const rel of [PAGE, ...CONTENTS]) {
    const html = read(rel);
    assert.equal(html.includes("/coordenacao-bim/"), false, `${rel} links /coordenacao-bim/`);
    assert.equal(html.includes("/compatibilizacao-revisao/"), false, `${rel} links /compatibilizacao-revisao/`);
    assert.equal(/clash[- ]detection/i.test(html), false, `${rel} sells clash detection`);
  }
  assert.equal(fs.existsSync(path.join(root, "coordenacao-bim")), false);
});
