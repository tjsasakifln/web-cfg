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
  runtimeLighthouseContractForRoute,
  verifyRuntimeAcceptedProjectionDocument,
  verifyRuntimeInventoryDocument,
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
// The census is measured from every artifact route on every run. Fixed totals
// would turn legitimate retirement/publication into a stale gate; recomputing
// independently retains the important invariant that no current risk escapes.
const measuredRisk = routes.map((route) => {
  const html = readFileSync(routeToFile(ROOT, route), "utf8");
  return { route, price: hasPrice(html), capture: hasCaptureForm(html) };
});
assert.equal(coverage.axe.price_route_count, measuredRisk.filter((row) => row.price).length);
assert.equal(coverage.axe.capture_form_route_count, measuredRisk.filter((row) => row.capture).length);
assert.equal(coverage.axe.route_count, measuredRisk.filter((row) => row.price || row.capture).length);
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
assert.equal(coverage.lighthouse.supplemental_family_count, 1);
assert.equal(coverage.lighthouse.runtime_families.length, 1);
assert.equal(
  coverage.lighthouse.pages.length,
  coverage.lighthouse.canonical_family_count
    - coverage.lighthouse.runtime_families.length
    + coverage.lighthouse.supplemental_family_count
    + policy.lighthouse.additional_pages.length,
);
assert(coverage.lighthouse.pages.includes("/conteudos/atraso-na-medicao-obra-publica/"));
assert(coverage.lighthouse.pages.includes("/diretoria-b2g/"));
assert(coverage.lighthouse.pages.includes("/diagnostico-b2g-expansao/"));
assert(coverage.lighthouse.pages.includes("/ferramentas/prontidao-tecnica-obra-privada/"));
assert(coverage.lighthouse.pages.includes("/triagem-tecnica/"));
assert(coverage.lighthouse.pages.includes("/servicos/"));
assert(coverage.lighthouse.pages.includes("/quantitativos-orcamento-obras/"));
assert.equal(new Set(coverage.lighthouse.pages).size, coverage.lighthouse.pages.length);
assert.deepEqual(
  new Set(coverage.lighthouse.families.filter((family) => family.kind === "canonical").map((family) => family.id)),
  new Set(registry.families.map((family) => family.id)),
  "Lighthouse commercial taxonomy must be exactly the canonical public registry",
);
for (const family of coverage.lighthouse.families) {
  assert(family.representative_reason, `family has no representative reason: ${family.id}`);
  if (family.runtime_only) {
    assert.equal(family.route_count, 0, `runtime-only family leaked into package: ${family.id}`);
    assert.equal(family.lighthouse_representative, null);
    assert(!coverage.lighthouse.pages.includes(family.lighthouse_representative));
    assert.equal(family.runtime_only.post_stage_lighthouse_required, true);
    continue;
  }
  assert(coverage.lighthouse.pages.includes(family.lighthouse_representative));
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

const runtimeContract = runtimeLighthouseContractForRoute(
  "/oportunidades/00394429000100-1-002200/2026/",
  policy,
  registry,
);
assert.equal(runtimeContract.family_id, "live-intelligence-opportunity");
assert.equal(runtimeContract.post_stage_lighthouse_required, true);
assert.equal(runtimeContract.inventory_route, "/sitemap-oportunidades.xml");
assert.equal(runtimeContract.accepted_projection_route, "/.well-known/live-intelligence-overlay.json");
const expectedRuntimeSha = "a".repeat(40);
const acceptedRuntimeDocument = {
  schema: "confenge.live-intelligence-overlay/v1",
  release_sha: expectedRuntimeSha,
  official_live: true,
  source_kind: "official_live",
  source_run_id: "LI-2026-09-09-test",
  as_of: "2026-09-09T12:00:00Z",
  manifest_hash: "b".repeat(64),
  consumer_observed_manifest_hash: "b".repeat(64),
  accepted_projection_sha256: "c".repeat(64),
  routes: [{
    opportunity_id: "00394429000100-1-002200/2026",
    route: runtimeContract.route,
    html_path: "_site/oportunidades/00394429000100-1-002200/2026/index.html",
    content_hash: "d".repeat(64),
    sha256: "e".repeat(64),
  }],
  static_html_paths: ["_site/oportunidades/index.html"],
  static_html_sha256: { "_site/oportunidades/index.html": "f".repeat(64) },
  removed_html_paths: [],
};
assert.equal(
  verifyRuntimeAcceptedProjectionDocument(
    runtimeContract.route,
    acceptedRuntimeDocument,
    runtimeContract,
    expectedRuntimeSha,
  ).opportunity_id,
  "00394429000100-1-002200/2026",
);
assert.equal(
  verifyRuntimeInventoryDocument(
    runtimeContract.route,
    `<urlset><url><loc>https://confenge.com.br${runtimeContract.route}</loc></url></urlset>`,
    runtimeContract,
    acceptedRuntimeDocument.routes.map((item) => item.route),
  ),
  true,
);
assert.throws(
  () => verifyRuntimeInventoryDocument(
    runtimeContract.route,
    `<urlset><url><loc>https://confenge.com.br${runtimeContract.route}</loc></url><url><loc>https://confenge.com.br/oportunidades/unaccepted/</loc></url></urlset>`,
    runtimeContract,
    acceptedRuntimeDocument.routes.map((item) => item.route),
  ),
  /sitemap differs from the exact accepted projection/,
  "a sitemap-only opportunity absent from the accepted projection must fail closed",
);
assert.throws(
  () => verifyRuntimeAcceptedProjectionDocument(
    runtimeContract.route,
    { ...acceptedRuntimeDocument, routes: [] },
    runtimeContract,
    expectedRuntimeSha,
  ),
  /has no exact routes/,
  "a family-level official claim without an exact accepted route cannot approve Lighthouse",
);
assert.throws(
  () => verifyRuntimeAcceptedProjectionDocument(
    runtimeContract.route,
    { ...acceptedRuntimeDocument, consumer_observed_manifest_hash: "f".repeat(64) },
    runtimeContract,
    expectedRuntimeSha,
  ),
  /divergent producer\/consumer manifest hashes/,
  "an accepted projection with divergent hash identity must fail closed",
);
assert.throws(
  () => verifyRuntimeAcceptedProjectionDocument(
    runtimeContract.route,
    { ...acceptedRuntimeDocument, release_sha: "0".repeat(40) },
    runtimeContract,
    expectedRuntimeSha,
  ),
  /release mismatch/,
  "accepted routes from another release cannot certify the candidate",
);
assert.throws(
  () => verifyRuntimeAcceptedProjectionDocument(
    runtimeContract.route,
    {
      ...acceptedRuntimeDocument,
      removed_html_paths: [acceptedRuntimeDocument.routes[0].html_path],
    },
    runtimeContract,
    expectedRuntimeSha,
  ),
  /both publishes and removes/,
  "the stage manifest cannot claim the selected page as both published and withdrawn",
);
assert.throws(
  () => verifyRuntimeAcceptedProjectionDocument(
    runtimeContract.route,
    { ...acceptedRuntimeDocument, static_html_paths: ["_site/oportunidades/unaccepted/index.html"] },
    runtimeContract,
    expectedRuntimeSha,
  ),
  /invalid static_html_paths allowlist/,
  "a static family hub cannot authorize an arbitrary opportunity child",
);
assert.throws(
  () => verifyRuntimeAcceptedProjectionDocument(
    runtimeContract.route,
    { ...acceptedRuntimeDocument, static_html_sha256: {} },
    runtimeContract,
    expectedRuntimeSha,
  ),
  /invalid static_html_sha256 identity/,
  "the static commercial hub must be bound to its exact served bytes",
);
assert.throws(
  () => verifyRuntimeInventoryDocument(
    runtimeContract.route,
    "<urlset></urlset>",
    runtimeContract,
  ),
  /absent from \/sitemap-oportunidades\.xml/,
  "a syntactically valid route is not runtime evidence until the stage inventory contains it",
);
assert.throws(
  () => runtimeLighthouseContractForRoute("/oportunidades/", policy, registry),
  /does not match the owned detail-route contract/,
  "the runtime hub is not a substitute for a real opportunity detail page",
);

const genericRuntimeException = structuredClone(policy);
genericRuntimeException.lighthouse.canonical_representatives
  .find((entry) => entry.family_id === "live-intelligence-opportunity")
  .runtime_only.owner = "some-runtime";
assert.throws(
  () => deriveCoverage({ policy: genericRuntimeException, registry, siteRoot: ROOT }),
  /invalid official runtime Lighthouse contract/,
  "a generic runtime exception cannot waive package coverage",
);

const virtualRepresentative = structuredClone(policy);
const virtualEntry = virtualRepresentative.lighthouse.canonical_representatives
  .find((entry) => entry.family_id === "live-intelligence-opportunity");
delete virtualEntry.runtime_only;
virtualEntry.route = "/oportunidades/pe-2026-000188-reforma-ubs-londrina-pr/";
assert.throws(
  () => deriveCoverage({ policy: virtualRepresentative, registry, siteRoot: ROOT }),
  /Lighthouse families absent from the artifact/,
  "a source fixture absent from the package cannot stand in for runtime evidence",
);

assert.throws(
  () => deriveCoverage({
    policy,
    registry,
    siteRoot: ROOT,
    routes: [...routes, "/oportunidades/pe-2026-000188-reforma-ubs-londrina-pr/"],
  }),
  /runtime-only Lighthouse families must be absent from the package/,
  "putting a committed opportunity fixture back into the package must fail closed",
);

assert.match(runner, /--runtime-route requires --expected-sha/);
assert.match(runner, /--only omitted mandatory runtime Lighthouse route/);
assert.match(runner, /\.well-known\/build-info\.json/);
assert.match(runner, /\.well-known\/runtime-info\.json/);
assert.match(runner, /contract\.accepted_projection_route/);
assert.match(runner, /verifyRuntimeAcceptedProjectionDocument/);
assert.match(runner, /verifyRuntimeInventoryDocument/);
assert.match(runner, /accepted HTML digest mismatch/);
assert.match(runner, /data-opportunity-id/);

console.log(
  `INTERFACE_COVERAGE_OK routes=${coverage.route_count} axe=${coverage.axe.route_count}x2 `
    + `lighthouse_families=${coverage.lighthouse.families.length} pages=${coverage.lighthouse.pages.length}`,
);
