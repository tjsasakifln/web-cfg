import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

test("typed authorities cannot restore diagnosis or field work as the public SST product", () => {
  const catalog = readJson("data/offers/multivertical/catalog.v2.json");
  assert.equal(catalog.occupational_safety_authority.contract, "CONFENGE_SST_REMOTE_PORTFOLIO/1.0.0");

  const byId = new Map(catalog.offers.map((offer) => [offer.offer_id, offer]));
  const organization = byId.get("sst_risk_documentation_diagnosis");
  assert.equal(organization.public_name, "Organização Documental de SST");
  assert.equal(organization.price_model.ticket_class, "remote_documental");
  assert.equal(organization.inspection_field_rule.included_by_default, false);
  assert.match(organization.paid_triage_rule, /Não há triagem paga autônoma/i);
  assert.ok(!organization.disqualification.some((item) => /pedido de PGR/i.test(item)));
  assert.doesNotMatch(organization.inspection_field_rule.output, /walkthrough|registros? de campo/i);

  const modules = byId.get("sst_pgr_ltcat_aet_inputs");
  assert.equal(modules.price_model.ticket_class, "remote_documental");
  assert.equal(modules.inspection_field_rule.included_by_default, false);
  assert.match(modules.inspection_field_rule.when_required, /fica fora desta oferta remota/i);
  assert.match(modules.paid_triage_rule, /Não há triagem paga autônoma/i);
});

test("routing contracts point SST publication to the remote portfolio", () => {
  const intent = readJson("data/corporate/intent-family-matrix.v1.json");
  assert.equal(
    intent.offer_id_semantics.sst_remote_publication.commercial_portfolio_contract,
    "CONFENGE_SST_REMOTE_PORTFOLIO/1.0.0",
  );

  const purchase = readJson("data/bofu-dominance/core/purchase-route-map.v1.json");
  const sst = purchase.purchases.find((row) => row.purchase_id === "organizar-sst");
  assert.equal(sst.commercial_portfolio_authority, "data/commercial/sst-remote-portfolio.v1.json");
  assert.match(sst.question_answered, /assume remotamente a documentação de SST contratada/i);

  const links = readJson("scripts/site/hub_link_matrix.json").links
    .filter((row) => row.intent_family === "organizar_sst");
  assert.ok(links.length >= 2);
  for (const link of links) assert.match(link.label, /documentação remota/i);
});
