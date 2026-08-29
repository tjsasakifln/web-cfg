import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isConfengeMoneyAssetLoc,
  MONEY_ASSET_CANONICAL,
  MONEY_ASSET_LOC_SPOOFS,
  sitemapHasMoneyAssetLoc,
} from "./money_asset_loc.mjs";
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
assert.ok(byIntent.aditivos.supporting.includes("/conteudos/limite-aditivo-25-50-obra-publica/"));
assert.ok(!JSON.stringify(inventory).includes("/lei-14133-obras/limite-25-50-aditivo-obra/"));
function assertAuthority(html, path) {
  assert.ok(/Método:/.test(html), `${path} missing Método`);
  assert.ok(/Fonte:/.test(html), `${path} missing Fonte`);
  assert.ok(/Limitação:/.test(html), `${path} missing Limitação`);
  assert.ok(/Sem revisão independente|segundo revisor|Revisado em/.test(html), `${path} missing revisão disclosure`);
  assert.ok(/<time datetime="\d{4}-\d{2}-\d{2}">/.test(html), `${path} missing updated_at time`);
  assert.ok(!/href="\/(vision|nexgen|avcb|clcb|avaliacoes|ia)\//.test(html), path);
}

const audited = [];
for (const row of inventory.intents) {
  const file = resolve(root, row.canonical.replace(/^\//, ""), "index.html");
  assert.ok(existsSync(file), row.canonical);
  const html = readFileSync(file, "utf8");
  if (/noindex/i.test(html)) continue;
  assertAuthority(html, row.canonical);
  if (row.canonical === inventory.money_asset) {
    assert.ok(html.includes('rel="canonical"'));
    assert.ok(html.includes("application/ld+json"));
    assert.ok(html.includes("UNKNOWN"));
    assert.ok(!/pncp_supplier_contracts/i.test(html), "money asset must not leak internal source family");
  } else {
    assert.ok(html.includes("diagnostico-defesa-margem") || row.disposition === "KEEP", row.intent);
  }
  audited.push({
    intent: row.intent,
    disposition: row.disposition,
    canonical: row.canonical,
    method: /Método:/.test(html),
    fonte: /Fonte:/.test(html),
    limitations: /Limitação:/.test(html),
    review: /Sem revisão independente|segundo revisor|Revisado em/.test(html),
    updated_at: /<time datetime="\d{4}-\d{2}-\d{2}">/.test(html),
  });
}
const sitemap = readFileSync(resolve(root, "sitemap.xml"), "utf8");
assert.equal(isConfengeMoneyAssetLoc(MONEY_ASSET_CANONICAL), true);
for (const spoof of MONEY_ASSET_LOC_SPOOFS) {
  assert.equal(isConfengeMoneyAssetLoc(spoof), false, spoof);
  assert.equal(
    sitemapHasMoneyAssetLoc(`<urlset><url><loc>${spoof}</loc></url></urlset>`),
    false,
    spoof,
  );
}
assert.ok(sitemapHasMoneyAssetLoc(sitemap), "sitemap must contain parsed money-asset loc");
assert.ok(!/\/vision|\/nexgen|\/avcb|\/clcb|\/avaliacoes|\/ia\//.test(sitemap));
const redirects = readFileSync(resolve(root, "_redirects"), "utf8");
assert.match(redirects, /^\/servicos\s+\/#como-atuamos\s+301/m);
assert.match(redirects, /^\/vision\s+\/404\.html\s+410/m);
console.log("MARGIN_CLUSTER_INVENTORY_OK", audited);
