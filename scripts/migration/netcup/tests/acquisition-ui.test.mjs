import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { footerMatches, proposalAnchorErrors } from "../../../site/acquisition_ui_contract.mjs";

test("rendered footer uses the full canonical navigation, including negative controls", () => {
  const columns = JSON.parse(fs.readFileSync(new URL("../../../../data/site/public-ia-map.json", import.meta.url), "utf8")).footer.columns;
  const observed = columns.map(({ heading, links }) => ({ heading, links: structuredClone(links) }));
  assert.ok(footerMatches(observed, columns));
  for (const mutate of [
    (copy) => copy.pop(),
    (copy) => copy[0].links.pop(),
    (copy) => { copy[0].links[0].href = "/entregas/"; },
    (copy) => { copy[0].heading = "Biblioteca"; },
    (copy) => copy[0].links.push(copy[0].links[0]),
  ]) {
    const changed = structuredClone(observed);
    mutate(changed);
    assert.equal(footerMatches(changed, columns), false);
  }
});

test("proposal anchor gate requires target, attribution, one event and privacy", () => {
  const expected = { id: "service-hero-proposal", route: "/service/", href: "#contact", route_family: "engineering", asset_id: "service_v1" };
  const actual = { count: 1, href: expected.href, targetCount: 1, position: "hero", family: expected.route_family, asset: expected.asset_id };
  const emitted = { count: 1, hasPiiKey: false, hasPiiValue: false, event: { event: "cta_click", cta_id: expected.id, page_path: expected.route, route_family: expected.route_family, asset_id: expected.asset_id, destination_type: "form", cta_position: "hero" } };
  assert.deepEqual(proposalAnchorErrors(actual, expected, emitted), []);
  for (const [field, value] of [["count", 0], ["count", 2], ["href", "#other"], ["targetCount", 0], ["targetCount", 2], ["position", "footer"], ["family", "other"], ["asset", "other"]]) {
    assert.ok(proposalAnchorErrors({ ...actual, [field]: value }, expected, emitted).length, field);
  }
  for (const [field, value] of [["count", 0], ["count", 2], ["hasPiiKey", true], ["hasPiiValue", true]]) {
    assert.ok(proposalAnchorErrors(actual, expected, { ...emitted, [field]: value }).length, field);
  }
  for (const field of ["event", "cta_id", "page_path", "route_family", "asset_id", "destination_type", "cta_position"]) {
    assert.ok(proposalAnchorErrors(actual, expected, { ...emitted, event: { ...emitted.event, [field]: "other" } }).length, field);
  }
});
