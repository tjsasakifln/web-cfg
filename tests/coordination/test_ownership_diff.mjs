import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function changedFiles() {
  const out = execFileSync("git", ["diff", "--name-only", "origin/main"], {
    cwd: root,
    encoding: "utf8",
  });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  return `${out}\n${untracked}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

test("campaign diff does not edit /servicos/ or a revisão page", () => {
  const files = changedFiles();
  assert.ok(files.length > 0, "expected owned files in the campaign diff");
  const forbidden = files.filter((rel) => {
    if (rel === "servicos/index.html" || rel.startsWith("servicos/")) return true;
    if (rel === "revisao-projetos-engenharia/index.html") return true;
    if (rel.startsWith("revisao-projetos")) return true;
    return false;
  });
  assert.deepEqual(forbidden, []);
  assert.equal(files.some((rel) => rel === "compatibilizacao-projetos-engenharia/index.html"), true);
  assert.equal(files.some((rel) => rel === "conteudos/quando-compatibilizar-projetos/index.html"), true);
  assert.equal(files.some((rel) => rel === "conteudos/como-contratar-compatibilizacao-projetos/index.html"), true);
  assert.equal(files.some((rel) => rel.startsWith("coordenacao-bim")), false);
  assert.equal(files.some((rel) => rel.includes("clash-detection")), false);
});
