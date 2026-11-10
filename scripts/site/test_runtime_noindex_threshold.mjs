import assert from "node:assert/strict";
import { evaluateLighthouseResults, seoScoreWithoutCrawlability } from "./lighthouse_thresholds.mjs";

const route = "/oportunidades/00394429000100-1-002200/2026/";
const row = (extra = {}) => ({
  path: route,
  run: 1,
  performance: 100,
  accessibility: 100,
  best_practices: 100,
  seo: 70,
  seo_without_crawlability: 100,
  lcp_ms: 1000,
  cls: 0,
  tbt_ms: 0,
  longest_own_task_ms: 0,
  ...extra,
});
const home = (run) => ({
  ...row({ path: "/", run, seo: 100, seo_without_crawlability: 100 }),
  total_byte_weight: 1000,
  content_byte_weight: 1000,
  dom_elements: 10,
  font_display_score: 1,
  lcp_network_allowance_ms: 0,
});
const homes = [home(1), home(2), home(3)];
const options = {
  measuredPages: ["/", route],
  seoOnlyExemptPages: new Set([route]),
  homeRuns: 3,
};
assert.equal(evaluateLighthouseResults([...homes, row()], options).ok, true);
assert.equal(evaluateLighthouseResults([...homes, row({ accessibility: 94 })], options).ok, false);
assert.equal(evaluateLighthouseResults([...homes, row({ accessibility: undefined })], options).ok, false);
assert.equal(evaluateLighthouseResults([...homes, row({ best_practices: 94 })], options).ok, false);
assert.equal(evaluateLighthouseResults([...homes, row({ best_practices: Number.NaN })], options).ok, false);
assert.equal(evaluateLighthouseResults([...homes, row({ seo_without_crawlability: 90 })], options).ok, false);
assert.equal(evaluateLighthouseResults([...homes, row()], { ...options, seoOnlyExemptPages: new Set() }).ok, false);
assert.equal(evaluateLighthouseResults([...homes, row({ seo_without_crawlability: undefined })], options).ok, false);
const category = { auditRefs: [{ id: "is-crawlable", weight: 3 }, { id: "document-title", weight: 1 }, { id: "meta-description", weight: 1 }] };
assert.equal(seoScoreWithoutCrawlability(category, { "is-crawlable": { score: 0 }, "document-title": { score: 1 }, "meta-description": { score: 1 } }), 100);
assert.equal(seoScoreWithoutCrawlability(category, { "is-crawlable": { score: 0 }, "document-title": { score: 0 }, "meta-description": { score: 1 } }), 50);
assert.equal(seoScoreWithoutCrawlability(category, { "is-crawlable": { score: 0 }, "document-title": { score: null, scoreDisplayMode: "error" }, "meta-description": { score: 1 } }), null);
assert.equal(seoScoreWithoutCrawlability(category, { "is-crawlable": { score: 0 }, "document-title": { score: null, scoreDisplayMode: "notApplicable" }, "meta-description": { score: 1 } }), 100);

console.log("RUNTIME_NOINDEX_THRESHOLD_OK");
