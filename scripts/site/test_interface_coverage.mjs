import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ROOT,
  deriveCoverage,
  hasCaptureForm,
  hasPrice,
  isNoindex,
  loadManifestRoutes,
  loadPolicy,
  loadPublicFamilyRegistry,
  resolveSiteRoot,
  routeToFile,
} from "./interface_coverage.mjs";

const rootFixture = mkdtempSync(join(tmpdir(), "confenge-site-root-"));
writeFileSync(join(rootFixture, "index.html"), "source");
assert.equal(resolveSiteRoot(rootFixture), rootFixture);
mkdirSync(join(rootFixture, "_site"));
writeFileSync(join(rootFixture, "_site", "index.html"), "artifact");
assert.equal(resolveSiteRoot(rootFixture), join(rootFixture, "_site"));

// Detector fixtures are independent of the production census and cover the
// encodings/forms that caused the adversarial-review false results.
assert(hasPrice("<p>Investimento: R$&nbsp;1.000,00</p>"));
assert(hasPrice("<p>Investimento: R$&#160;<strong>599</strong></p>"));
assert(hasPrice("<p>Investimento: <span>R$</span>&#xA0;<strong>750</strong></p>"));
assert(hasPrice("<p>Investimento: R<span>$</span><strong>599</strong></p>"));
assert(hasPrice("<p>Investimento: R&#36; 599</p>"));
assert(hasPrice("<p>Investimento: R&dollar; 599</p>"));
assert(!hasPrice('<script type="application/ld+json">{"price":"R$ 599"}</script>'));
assert(!hasCaptureForm('<form class="tool-form"><input name="valor"></form>'));
assert(!hasCaptureForm('<form action="#"><select name="base"></select></form>'));
assert(hasCaptureForm('<form data-capture-form><input name="email"></form>'));
assert(hasCaptureForm('<form action="/.netlify/functions/lead"><textarea name="contexto"></textarea></form>'));

const policy = loadPolicy();
const registry = loadPublicFamilyRegistry();
const coverage = deriveCoverage({ policy, registry, siteRoot: ROOT });
const routes = loadManifestRoutes();
const selected = new Set(coverage.axe.routes.map((entry) => entry.route));

assert.equal(coverage.route_count, routes.length, "coverage must sweep the full public manifest");
assert.deepEqual(
  coverage.viewports.map((viewport) => [viewport.width, viewport.height]),
  [[390, 844], [1440, 1000]],
  "axe must cover mobile and desktop without weakening either viewport",
);

for (const route of routes) {
  const html = readFileSync(routeToFile(ROOT, route), "utf8");
  if (hasPrice(html) || hasCaptureForm(html)) {
    assert(selected.has(route), `money/capture route escaped axe coverage: ${route}`);
  }
}
assert(coverage.axe.routes.every((entry) =>
  entry.reasons.length > 0
  && entry.reasons.every((reason) => reason === "price" || reason === "capture_form")
), "axe routes must derive only from declared visitor risk");
// #566 withdrew 18 priced pSEO pages. #563/W1 added 3 fixture opportunity pages with visible BRL (44+3=47) and 3 axe routes (53+3=56).
// All 18 rendered a visible price and none carried a capture form, so the
// price count drops by exactly 18. The recovered Art. 125 receipt and the
// issue #61 reequilibrio checklist receipt are result-gated capture forms and
// have to be included in the recaptured census. Direct convergence adds one
// fail-closed capture route, so the current census is 28 forms across 57 routes.
assert.equal(coverage.axe.price_route_count, 47);
assert.equal(coverage.axe.capture_form_route_count, 28);
assert.equal(coverage.axe.route_count, 57);
assert(selected.has("/conteudos/atraso-na-medicao-obra-publica/"));
assert(selected.has("/conteudos/sinapi-desonerado-nao-desonerado/"));
assert.deepEqual(
  coverage.axe.routes.find((entry) => entry.route === "/conteudos/sinapi-desonerado-nao-desonerado/").reasons,
  ["price"],
  "SINAPI article has visible NBSP price but its calculator is not a capture form",
);
for (const route of [
  "/ferramentas/matriz-atraso-obra/",
]) {
  const html = readFileSync(routeToFile(ROOT, route), "utf8");
  assert(!hasCaptureForm(html), `local calculator must not be called a capture form: ${route}`);
}
for (const [route, why] of [
  ["/ferramentas/limite-acrescimos-supressoes/", "issue #556 utility must expose its persisted on-page CFG-D19 terminal capture"],
  ["/ferramentas/checklist-reequilibrio/", "issue #61 debt closure must expose the persisted result-gated terminal capture"],
]) {
  assert(hasCaptureForm(readFileSync(routeToFile(ROOT, route), "utf8")), why);
}

assert.equal(coverage.axe.page_loads, coverage.axe.route_count * 2);
assert(coverage.axe.not_sampled.every((entry) => entry.reason), "every omitted axe route needs a reason");
assert.equal(coverage.lighthouse.canonical_family_count, registry.families.length);
assert.equal(coverage.lighthouse.canonical_family_count, 37);
assert.equal(coverage.lighthouse.supplemental_family_count, 1);
assert.equal(coverage.lighthouse.pages.length, 41);
assert(coverage.lighthouse.pages.includes("/conteudos/atraso-na-medicao-obra-publica/"));
assert(coverage.lighthouse.pages.includes("/diretoria-b2g/"));
assert(coverage.lighthouse.pages.includes("/diagnostico-b2g-expansao/"));
assert(coverage.lighthouse.pages.includes("/ferramentas/prontidao-tecnica-obra-privada/"));
assert(coverage.lighthouse.pages.includes("/triagem-tecnica/"));
assert(coverage.lighthouse.pages.includes("/servicos/"));
assert.equal(new Set(coverage.lighthouse.pages).size, coverage.lighthouse.pages.length);
assert.deepEqual(
  new Set(coverage.lighthouse.families.filter((family) => family.kind === "canonical").map((family) => family.id)),
  new Set(registry.families.map((family) => family.id)),
  "Lighthouse commercial taxonomy must be exactly the canonical public registry",
);
for (const family of coverage.lighthouse.families) {
  assert(coverage.lighthouse.pages.includes(family.lighthouse_representative));
  assert(family.representative_reason, `family has no representative reason: ${family.id}`);
  const html = readFileSync(routeToFile(ROOT, family.lighthouse_representative), "utf8");
  if (family.kind === "canonical") {
    if (family.seo_exempt) {
      assert(family.seo_exempt_reason, `canonical noindex family has no SEO reason: ${family.id}`);
      assert(isNoindex(html), `canonical SEO exemption is not noindex: ${family.id}`);
    } else {
      assert(!isNoindex(html), `canonical representative must exercise SEO: ${family.id}`);
    }
  } else {
    assert(family.seo_exempt_reason, `supplemental family has no SEO reason: ${family.id}`);
    assert(isNoindex(html), `supplemental representative is not noindex: ${family.id}`);
  }
}
assert.deepEqual(coverage.lighthouse.thresholds, {
  performance: 90,
  accessibility: 95,
  best_practices: 95,
  seo: 95,
});
assert.equal(
  coverage.lighthouse.not_sampled_count,
  routes.length - coverage.lighthouse.pages.length,
);
assert.deepEqual(
  new Set(coverage.lighthouse.not_sampled.map((entry) => entry.route)),
  new Set(routes.filter((route) => !coverage.lighthouse.pages.includes(route))),
  "every Lighthouse omission must be enumerated route by route",
);
assert(coverage.lighthouse.not_sampled.every((entry) => entry.family && entry.reason));

const workflow = readFileSync(new URL("../../.github/workflows/site-ci.yml", import.meta.url), "utf8");
assert(!workflow.includes("LH_PAGES:"), "site-ci must not restore a hand-written Lighthouse route list");
assert(workflow.includes("npm run audit:layout-sitewide"), "site-ci must execute the claimed sitewide geometry proof");
const runner = readFileSync(new URL("./run_lighthouse.mjs", import.meta.url), "utf8");
assert(runner.includes("coverage.lighthouse.pages"), "Lighthouse runner must consume derived coverage");
for (const envName of ["LH_PAGES", "LH_IMAGE_GATE_PAGES", "LH_SEO_EXEMPT_PAGES"]) {
  assert(!runner.includes(`process.env.${envName}`), `${envName} must not override merge coverage`);
}
const axeRunner = readFileSync(new URL("./audit_axe.mjs", import.meta.url), "utf8");
assert(!axeRunner.includes("exceptionFor"), "critical/serious axe violations cannot be excused");
const layoutRunner = readFileSync(new URL("./audit_sitewide_layout.mjs", import.meta.url), "utf8");
assert(layoutRunner.includes("resolveSiteRoot"), "layout audit must serve the built public artifact");
assert(layoutRunner.includes("loadManifestRoutes"), "layout audit must include root public HTML routes");
for (const route of ["404.html", "comercial/privacidade-leads/index.html"]) {
  const html = readFileSync(join(ROOT, route), "utf8");
  assert(html.includes("/assets/simple-page-a11y-v293.css"), `${route} needs cache-busted narrow-screen CSS`);
}
assert(!Object.hasOwn(policy.axe, "always_include"), "historical axe route lists are forbidden");
assert(!Object.hasOwn(policy, "known_exceptions"), "known axe exceptions are forbidden");

const missingCanonical = structuredClone(policy);
missingCanonical.lighthouse.canonical_representatives =
  missingCanonical.lighthouse.canonical_representatives.filter((entry) => entry.family_id !== "home");
assert.throws(
  () => deriveCoverage({ policy: missingCanonical, registry, siteRoot: ROOT }),
  /must match public-family-registry exactly/,
);

const wrongOwner = structuredClone(policy);
wrongOwner.lighthouse.canonical_representatives.find((entry) => entry.family_id === "home").route = "/casos/aditivo-art125-demonstrativo/";
assert.throws(
  () => deriveCoverage({ policy: wrongOwner, registry, siteRoot: ROOT }),
  /must belong to its resolved family/,
);

const noindexCanonical = structuredClone(policy);
noindexCanonical.lighthouse.canonical_representatives.find((entry) => entry.family_id === "radar").route = "/radar/";
assert.throws(
  () => deriveCoverage({ policy: noindexCanonical, registry, siteRoot: ROOT }),
  /must exercise SEO when an indexable family route exists/,
);

const unclassified = structuredClone(policy);
unclassified.supplemental_families = unclassified.supplemental_families.filter(
  (family) => family.id !== "transaction-utilities-noindex",
);
assert.throws(
  () => deriveCoverage({ policy: unclassified, registry, siteRoot: ROOT }),
  /neither the canonical public-family-registry nor a supplemental noindex family/,
);

const manualAxeList = structuredClone(policy);
manualAxeList.axe.always_include = [{ route: "/" }];
assert.throws(
  () => deriveCoverage({ policy: manualAxeList, registry, siteRoot: ROOT }),
  /always_include is forbidden/,
);

const knownAxeRegression = structuredClone(policy);
knownAxeRegression.known_exceptions = [{ route: "/", viewport: "all", rule: "color-contrast" }];
assert.throws(
  () => deriveCoverage({ policy: knownAxeRegression, registry, siteRoot: ROOT }),
  /known exceptions are forbidden/,
);

console.log(
  `INTERFACE_COVERAGE_OK routes=${coverage.route_count} axe=${coverage.axe.route_count}x2 `
    + `lighthouse_families=${coverage.lighthouse.families.length} pages=${coverage.lighthouse.pages.length}`,
);
