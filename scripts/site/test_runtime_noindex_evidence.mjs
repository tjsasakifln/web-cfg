import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runtimeLighthouseContractForRoute,
  verifyRuntimeAcceptedProjectionDocument,
  verifyRuntimeInventoryDocument,
  verifyRuntimeRenderedPageDocument,
} from "./interface_coverage.mjs";

const selectedRoute = "/oportunidades/00394429000100-1-002200/2026/";
const indexRoute = "/oportunidades/00394429000100-1-002201/2026/";
const sha = "a".repeat(40);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hub = Buffer.from("<html><body>hub</body></html>");
const html = (route, id, state) => Buffer.from(
  `<!doctype html><html><head><link href="https://confenge.com.br${route}" rel="canonical"><meta content="${state === "INDEX" ? "index,follow" : "noindex,nofollow"}" name="robots"></head><body data-index-state="${state}" data-opportunity-id="${id}"></body></html>`,
);
const pages = new Map([
  [selectedRoute, html(selectedRoute, "00394429000100-1-002200/2026", "NOINDEX")],
  [indexRoute, html(indexRoute, "00394429000100-1-002201/2026", "INDEX")],
]);
const projection = {
  schema: "confenge.live-intelligence-overlay/v1",
  release_sha: sha,
  official_live: true,
  source_kind: "official_live",
  source_run_id: "fixture-http-noindex",
  as_of: "2026-11-09T00:00:00Z",
  manifest_hash: "b".repeat(64),
  consumer_observed_manifest_hash: "b".repeat(64),
  accepted_projection_sha256: "c".repeat(64),
  routes: [...pages].map(([route, body]) => {
    const opportunity_id = route.slice("/oportunidades/".length, -1);
    return {
      opportunity_id,
      route,
      html_path: `_site${route}index.html`,
      content_hash: "d".repeat(64),
      sha256: createHash("sha256").update(body).digest("hex"),
    };
  }),
  indexable_routes: [indexRoute],
  static_html_paths: ["_site/oportunidades/index.html"],
  static_html_sha256: { "_site/oportunidades/index.html": createHash("sha256").update(hub).digest("hex") },
  removed_html_paths: [],
};
const sitemap = `<urlset><url><loc>https://confenge.com.br${indexRoute}</loc></url></urlset>`;

const server = createServer((request, response) => {
  if (request.url === "/.well-known/build-info.json") return void response.end(JSON.stringify({ commit: sha }));
  if (request.url === "/.well-known/runtime-info.json") return void response.end(JSON.stringify({ release_sha: sha }));
  if (request.url === "/.well-known/live-intelligence-overlay.json") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(projection));
    return;
  }
  if (request.url === "/sitemap-oportunidades.xml") {
    response.setHeader("content-type", "application/xml");
    response.end(sitemap);
    return;
  }
  if (request.url === "/oportunidades/") return void response.end(hub);
  if (request.url === "/") return void response.end("<html><body>home</body></html>");
  const body = pages.get(request.url);
  response.statusCode = body ? 200 : 404;
  response.end(body || "missing");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let fixtureDir = null;
const summaryPath = join(ROOT, "docs", "lighthouse-runs", `summary-${sha}.json`);
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const document = await fetch(`${origin}/.well-known/live-intelligence-overlay.json`).then((response) => response.json());
  const contract = runtimeLighthouseContractForRoute(selectedRoute);
  verifyRuntimeAcceptedProjectionDocument(selectedRoute, document, contract, sha);
  const verified = [];
  for (const item of document.routes) {
    const body = Buffer.from(await fetch(`${origin}${item.route}`).then((response) => response.arrayBuffer()));
    assert.equal(createHash("sha256").update(body).digest("hex"), item.sha256);
    verified.push(verifyRuntimeRenderedPageDocument(item.route, body.toString("utf8"), item));
  }
  const inventory = await fetch(`${origin}/sitemap-oportunidades.xml`).then((response) => response.text());
  const proof = verifyRuntimeInventoryDocument(selectedRoute, inventory, contract, verified, projection.indexable_routes);
  assert.equal(proof.selected.index_state, "NOINDEX");
  assert.deepEqual(proof.inventoried, [indexRoute]);
  assert.deepEqual(proof.expected, [indexRoute]);
  assert.throws(
    () => verifyRuntimeInventoryDocument(selectedRoute, inventory, contract, verified, [selectedRoute]),
    /rendered INDEX states differ from sealed indexable_routes/,
    "the sealed INDEX subset cannot contradict the digest-bound rendered state",
  );

  fixtureDir = mkdtempSync(join(tmpdir(), "confenge-runtime-noindex-runner-"));
  const child = join(fixtureDir, "measure.mjs");
  writeFileSync(child, `import{readFileSync,writeFileSync}from"node:fs";const[s,o]=process.argv.slice(2),x=JSON.parse(readFileSync(s,"utf8"));if(x.preflight){writeFileSync(o,JSON.stringify({outcome:"MEASURED",phase:"complete",lhr_written:false}));process.exit(0)}const row={path:x.path,run:x.run,performance:100,accessibility:100,best_practices:100,seo:x.path==="/"?100:70,seo_without_crawlability:100,lcp_ms:1000,cls:0,tbt_ms:0,longest_own_task_ms:0,dom_elements:10,total_byte_weight:1000,content_byte_weight:1000,lcp_network_allowance_ms:0,font_display_score:1,image_aspect_ratio:1,image_size_responsive:1};writeFileSync(x.out_json,"{}");writeFileSync(o,JSON.stringify({outcome:"MEASURED",phase:"complete",row,lhr_written:true}));`);
  const completed = await new Promise((done) => {
    const childProcess = spawn(process.execPath, [
      "scripts/site/run_lighthouse.mjs", origin, `--runtime-route=${selectedRoute}`,
      `--expected-sha=${sha}`, `--label=${sha}`, `--only=/,${selectedRoute}`, "--runs=3", "--public-edge",
    ], { cwd: ROOT, env: { ...globalThis.process.env, LH_TEST_FIXTURE_MODE: "runtime-noindex-evidence", LH_TEST_MEASURE_CHILD: child }, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    childProcess.stdout.on("data", () => {});
    childProcess.stderr.on("data", (chunk) => { stderr += chunk; });
    childProcess.on("close", (code) => done({ code, stderr }));
  });
  assert.equal(completed.code, 0, completed.stderr);
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  assert.equal(summary.terminal_state, "MEASURED_PASS");
  assert.equal(summary.coverage.runtime_evidence.routes[0].index_state, "NOINDEX");
  assert.deepEqual(summary.coverage.seo_only_exempt_pages, [selectedRoute]);
  assert.equal(summary.results.filter((row) => row.path === "/").length, 3);
  assert.equal(summary.results.find((row) => row.path === selectedRoute).seo_without_crawlability, 100);
  for (const file of [summaryPath, ...summary.results.map((row) => join(ROOT, "docs", "lighthouse-runs", `${row.path === "/" ? "home" : "oportunidades_00394429000100-1-002200_2026"}-${sha}${row.path === "/" ? `-run-${row.run}` : ""}.json`))]) rmSync(file, { force: true });
  rmSync(fixtureDir, { recursive: true, force: true });
} finally {
  for (const file of [
    summaryPath,
    ...[1, 2, 3].map((run) => join(ROOT, "docs", "lighthouse-runs", `home-${sha}-run-${run}.json`)),
    join(ROOT, "docs", "lighthouse-runs", `oportunidades_00394429000100-1-002200_2026-${sha}.json`),
  ]) rmSync(file, { force: true });
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
  await new Promise((resolve) => server.close(resolve));
}

console.log("RUNTIME_NOINDEX_HTTP_EVIDENCE_OK");
