import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inventory = JSON.parse(readFileSync(resolve(root, "data/organic/margin-defense-cluster-inventory.json"), "utf8"));
assert.equal(inventory.money_asset, "/ferramentas/diagnostico-defesa-margem/");
const required = ["reajuste","reequilibrio","aditivos","medicao_glosa","prazo_atraso_pagamento","bdi","matriz_de_riscos","alteracao_de_escopo","sinapi_referenciais","diagnostico_factual"];
const byIntent = Object.fromEntries(inventory.intents.map((row) => [row.intent, row]));
for (const intent of required) {
  assert.ok(byIntent[intent], intent);
  assert.ok(["KEEP","CONSOLIDATE","IMPROVE","CREATE"].includes(byIntent[intent].disposition));
  assert.ok(byIntent[intent].canonical.startsWith("/"));
}
assert.equal(inventory.intents.filter((row) => row.disposition === "CREATE").length, 0);
for (const row of inventory.intents) {
  const file = resolve(root, row.canonical.replace(/^\//, ""), "index.html");
  assert.ok(existsSync(file), row.canonical);
  const html = readFileSync(file, "utf8");
  if (row.canonical === inventory.money_asset) {
    assert.ok(!/noindex/i.test(html));
    assert.ok(html.includes('rel="canonical"'));
    assert.ok(html.includes("application/ld+json"));
    assert.ok(html.includes("UNKNOWN"));
  } else if (!/noindex/i.test(html)) {
    assert.ok(html.includes("diagnostico-defesa-margem") || row.disposition === "KEEP", row.intent);
    assert.ok(!/href="\/(vision|nexgen|avcb|clcb|avaliacoes|ia)\//.test(html));
  }
}
const sitemap = readFileSync(resolve(root, "sitemap.xml"), "utf8");
assert.ok(sitemap.includes("https://confenge.com.br/ferramentas/diagnostico-defesa-margem/"));
assert.ok(!/\/vision|\/nexgen|\/avcb|\/clcb|\/avaliacoes|\/ia\//.test(sitemap));
const redirects = readFileSync(resolve(root, "_redirects"), "utf8");
assert.match(redirects, /^\/servicos\s+\/#como-atuamos\s+301/m);
assert.match(redirects, /^\/vision\s+\/404\.html\s+410/m);
console.log("MARGIN_CLUSTER_INVENTORY_OK", inventory.intents.map((r)=>r.intent+":"+r.disposition));
