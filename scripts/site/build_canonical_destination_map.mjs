#!/usr/bin/env node
/**
 * POS-INB-10: derive the browser destination map from the owned purchase-route-map.
 * Rebuild: node scripts/site/build_canonical_destination_map.mjs --write
 * Check:   node scripts/site/build_canonical_destination_map.mjs --check
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAP_REL = "data/bofu-dominance/core/purchase-route-map.v1.json";
const MODULE_REL = "js/modules/canonical-destination-map.js";
const JSON_REL = "data/site/canonical-destination-map.v1.json";

const SCHEMA = "confenge.canonical-destination-map/1.0";

/** offer_id used by both revisão and elaboração; 04's readiness table maps it to revisão. */
const OFFER_TO_PURCHASE = Object.freeze({
  quantity_takeoff_budgeting: "quantitativos-orcamento",
  bim_coordination_clash_register: "compatibilizacao-projetos",
  complementary_engineering_project_review: "revisao-tecnica-projetos",
});

function publicPath(url) {
  const value = String(url || "");
  if (!value.startsWith("/") || value.includes("://")) return null;
  return value;
}

export function buildCanonicalDestinationMap(document) {
  const byPurchase = {};
  const byOffer = {};
  for (const row of document.purchases || []) {
    const purchaseId = row?.purchase_id;
    const href = publicPath(row?.source_of_truth || row?.primary_url);
    if (!purchaseId || !href || href.includes("#")) continue;
    byPurchase[purchaseId] = {
      path: href,
      intent_family: row.intent_family || null,
      offer_id: row.offer_id || null,
    };
  }
  for (const [offerId, purchaseId] of Object.entries(OFFER_TO_PURCHASE)) {
    const entry = byPurchase[purchaseId];
    if (entry) {
      byOffer[offerId] = {
        path: entry.path,
        intent_family: entry.intent_family,
        purchase_id: purchaseId,
      };
    }
  }
  return {
    schema: SCHEMA,
    source: MAP_REL,
    by_offer_id: byOffer,
    by_purchase_id: byPurchase,
  };
}

function renderModule(map) {
  const json = JSON.stringify(map, null, 2);
  return `/* MODULE canonical-destination-map — POS-INB-10
 * Derived JSON twin of data/site/canonical-destination-map.v1.json.
 * Not assembled into frozen /script.js; 04 embeds the map in HTML.
 * Generated from ${MAP_REL}. Rebuild: node scripts/site/build_canonical_destination_map.mjs --write
 */
(() => {
  const MAP = ${json};
  window.ConfengeCanonicalDestinationMap = MAP;
})();
`;
}

function main() {
  const document = JSON.parse(fs.readFileSync(path.join(root, MAP_REL), "utf8"));
  const map = buildCanonicalDestinationMap(document);
  const moduleText = renderModule(map);
  const jsonText = `${JSON.stringify(map, null, 2)}\n`;
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check") || !write;
  const modulePath = path.join(root, MODULE_REL);
  const jsonPath = path.join(root, JSON_REL);
  if (write) {
    fs.mkdirSync(path.dirname(modulePath), { recursive: true });
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(modulePath, moduleText);
    fs.writeFileSync(jsonPath, jsonText);
    console.log("wrote", MODULE_REL, JSON_REL);
    return;
  }
  if (check) {
    const currentModule = fs.existsSync(modulePath) ? fs.readFileSync(modulePath, "utf8") : "";
    const currentJson = fs.existsSync(jsonPath) ? fs.readFileSync(jsonPath, "utf8") : "";
    if (currentModule !== moduleText || currentJson !== jsonText) {
      console.error("FAIL canonical destination map is stale; run build_canonical_destination_map.mjs --write");
      process.exit(1);
    }
    console.log("canonical destination map: CHECK_OK");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
