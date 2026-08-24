import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ROOT,
  deriveCoverage,
  hasCaptureForm,
  hasPrice,
  isNoindex,
  loadManifestRoutes,
  loadPolicy,
  routeToFile,
} from "./interface_coverage.mjs";

const policy = loadPolicy();
const coverage = deriveCoverage({ policy, siteRoot: ROOT });
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

assert.equal(coverage.axe.page_loads, coverage.axe.route_count * 2);
assert(coverage.axe.not_sampled.every((entry) => entry.reason), "every omitted axe route needs a reason");
assert.equal(coverage.lighthouse.families.length, policy.commercial_families.length);
assert.equal(new Set(coverage.lighthouse.pages).size, coverage.lighthouse.pages.length);
for (const family of coverage.lighthouse.families) {
  assert(
    coverage.lighthouse.pages.includes(family.lighthouse_representative),
    `family has no Lighthouse run: ${family.id}`,
  );
  assert(family.representative_reason, `family has no representative reason: ${family.id}`);
  if (family.seo_exempt) {
    assert(family.seo_exempt_reason, `SEO-exempt family has no reason: ${family.id}`);
    const html = readFileSync(routeToFile(ROOT, family.lighthouse_representative), "utf8");
    assert(isNoindex(html), `SEO-exempt representative is not noindex: ${family.id}`);
  }
}
assert.deepEqual(coverage.lighthouse.thresholds, {
  performance: 90,
  accessibility: 95,
  best_practices: 95,
  seo: 95,
});

const workflow = readFileSync(new URL("../../.github/workflows/site-ci.yml", import.meta.url), "utf8");
assert(!workflow.includes("LH_PAGES:"), "site-ci must not restore a hand-written Lighthouse route list");
const runner = readFileSync(new URL("./run_lighthouse.mjs", import.meta.url), "utf8");
assert(runner.includes("coverage.lighthouse.pages"), "Lighthouse runner must consume derived coverage");

const stalePolicy = structuredClone(policy);
stalePolicy.commercial_families = stalePolicy.commercial_families.filter(
  (family) => family.id !== "home",
);
assert.throws(
  () => deriveCoverage({ policy: stalePolicy, siteRoot: ROOT }),
  /routes match no commercial family/,
  "a new or unclassified public family must fail closed",
);

console.log(
  `INTERFACE_COVERAGE_OK routes=${coverage.route_count} axe=${coverage.axe.route_count}x2 `
    + `lighthouse_families=${coverage.lighthouse.families.length} pages=${coverage.lighthouse.pages.length}`,
);
