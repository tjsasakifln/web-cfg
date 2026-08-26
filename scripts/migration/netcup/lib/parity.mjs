import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { buildHostContract } from "./contract.mjs";
import { extractSeoSignals } from "./html-seo.mjs";
import { MATERIAL_HEADERS, classifyResponseHeaders } from "./origin-client.mjs";

function bodyHash(body) {
  return createHash("sha256").update(body).digest("hex");
}

function routeExists(root, path) {
  return existsSync(resolve(root, path.replace(/^\//, ""), "index.html"));
}

function addCase(cases, seen, candidate) {
  const key = `${candidate.path}\u0000${candidate.id}`;
  if (seen.has(key)) return;
  seen.add(key);
  cases.push(candidate);
}

function sampleRoutePath(rule) {
  if (rule.from.match === "prefix") return rule.from.path.replace(/\*$/, "__host_parity__/deep-path");
  return rule.from.path;
}

export function buildParityMatrix(root, contract, dynamicPaths = []) {
  const cases = [];
  const seen = new Set();
  const add = (candidate) => addCase(cases, seen, candidate);
  add({ id: "home", path: "/", expectedStatus: 200, bodyHash: true, seo: true, category: "html" });

  for (const route of [
    "/diretoria-b2g/",
    "/diagnostico-b2g-360/",
    "/defesa-margem-contratos-publicos/",
    "/entregas/",
  ]) {
    if (routeExists(root, route)) add({ id: `money:${route}`, path: route, expectedStatus: 200, bodyHash: true, seo: true, category: "money" });
  }
  for (const route of [
    "/ferramentas/",
    "/ferramentas/diagnostico-defesa-margem/",
    "/ferramentas/checklist-reequilibrio/",
  ]) {
    if (routeExists(root, route)) add({ id: `tool:${route}`, path: route, expectedStatus: 200, bodyHash: true, seo: true, category: "tool" });
  }

  add({ id: "pretty-url:no-slash", path: "/diretoria-b2g", expectedStatus: null, bodyHash: false, seo: false, category: "pretty-url" });
  add({ id: "pretty-url:html", path: "/privacidade.html", expectedStatus: 301, bodyHash: false, seo: false, category: "pretty-url" });
  add({ id: "asset:mutable-css", path: "/styles.css", expectedStatus: 200, bodyHash: true, seo: false, category: "asset" });
  add({ id: "asset:mutable-js", path: "/script.js", expectedStatus: 200, bodyHash: true, seo: false, category: "asset" });
  for (const rule of contract.headers) {
    const cache = rule.headers.find((header) => header.name.toLowerCase() === "cache-control")?.value || "";
    if (rule.match === "exact" && /immutable/i.test(cache)) {
      add({ id: `asset:fingerprinted:${rule.path}`, path: rule.path, expectedStatus: 200, bodyHash: true, seo: false, category: "asset" });
    }
  }
  add({
    id: "asset:missing",
    path: "/assets/__confenge_host_parity_missing__.css",
    expectedStatus: 404,
    bodyHash: true,
    seo: false,
    category: "asset",
  });
  add({ id: "robots", path: "/robots.txt", expectedStatus: 200, bodyHash: true, seo: false, category: "seo-control" });

  for (const name of readdirSync(root).filter((name) => /^sitemap(?:-[a-z0-9-]+)?\.(?:xml|txt)$/i.test(name)).sort()) {
    add({ id: `sitemap:${name}`, path: `/${name}`, expectedStatus: 200, bodyHash: true, seo: false, category: "sitemap" });
  }

  for (const rule of contract.routes.filter((candidate) => candidate.from.kind === "path")) {
    const path = sampleRoutePath(rule);
    add({
      id: `route:${rule.order}:${rule.from.raw}`,
      path,
      expectedStatus: rule.status,
      bodyHash: rule.action === "rewrite" || rule.action === "gone",
      seo: rule.action === "rewrite",
      category: rule.action,
    });
  }
  for (const path of ["/servicos?host_parity=query", "/obrigado?host_parity=query", "/intranet?host_parity=query"]) {
    add({
      id: `query-preservation:${path.split("?")[0]}`,
      path,
      expectedStatus: path.startsWith("/obrigado") ? 200 : path.startsWith("/intranet") ? 302 : 301,
      bodyHash: path.startsWith("/obrigado"),
      seo: path.startsWith("/obrigado"),
      category: "query",
    });
  }
  add({ id: "custom-404", path: "/__confenge_host_parity_missing_page__", expectedStatus: 404, bodyHash: true, seo: false, category: "404" });

  for (const path of contract.seo.releaseIdentity.paths) {
    add({ id: `identity:${path}`, path, expectedStatus: 200, bodyHash: false, seo: false, category: "identity" });
  }
  for (const name of readdirSync(root).filter((name) => /^[a-f0-9]{32,}\.txt$/i.test(name)).sort()) {
    const path = `/${name}`;
    if (statSync(resolve(root, name)).isFile()) add({ id: `gsc:${name}`, path, expectedStatus: 200, bodyHash: true, seo: false, category: "verification" });
  }
  for (const path of dynamicPaths) {
    add({ id: `runtime:${path}`, path, expectedStatus: null, bodyHash: false, seo: false, category: "runtime" });
  }
  return cases;
}

function compareValue(diffs, field, baseline, candidate) {
  if (baseline !== candidate) diffs.push({ field, baseline, candidate });
}

export function compareResponses(testCase, baseline, candidate, { strictHeaderInventory = true } = {}) {
  const differences = [];
  if (testCase.expectedStatus != null) {
    if (baseline.status !== testCase.expectedStatus) {
      differences.push({ field: "baseline.status_vs_contract", baseline: baseline.status, candidate: testCase.expectedStatus });
    }
    if (candidate.status !== testCase.expectedStatus) {
      differences.push({ field: "candidate.status_vs_contract", baseline: testCase.expectedStatus, candidate: candidate.status });
    }
  }
  compareValue(differences, "status", baseline.status, candidate.status);
  const baselineHeaders = classifyResponseHeaders(baseline.headers);
  const candidateHeaders = classifyResponseHeaders(candidate.headers);
  for (const name of MATERIAL_HEADERS) {
    compareValue(differences, `header:${name}`, baselineHeaders.material[name], candidateHeaders.material[name]);
  }
  if (strictHeaderInventory) {
    const additional = new Set([
      ...Object.keys(baselineHeaders.unclassified),
      ...Object.keys(candidateHeaders.unclassified),
    ]);
    for (const name of [...additional].sort()) {
      compareValue(
        differences,
        `additional_header:${name}`,
        baselineHeaders.unclassified[name] ?? null,
        candidateHeaders.unclassified[name] ?? null,
      );
    }
  }
  if (testCase.bodyHash) compareValue(differences, "body_sha256", bodyHash(baseline.body), bodyHash(candidate.body));
  if (testCase.seo && baseline.status === 200 && candidate.status === 200) {
    const left = extractSeoSignals(baseline.body);
    const right = extractSeoSignals(candidate.body);
    compareValue(differences, "html:canonical", JSON.stringify(left.canonical), JSON.stringify(right.canonical));
    compareValue(differences, "html:meta_robots", JSON.stringify(left.metaRobots), JSON.stringify(right.metaRobots));
  }
  return {
    ok: differences.length === 0,
    id: testCase.id,
    path: testCase.path,
    category: testCase.category,
    baseline: {
      status: baseline.status,
      url: baseline.url,
      materialHeaders: baselineHeaders.material,
      bodySha256: testCase.bodyHash ? bodyHash(baseline.body) : null,
    },
    candidate: {
      status: candidate.status,
      url: candidate.url,
      materialHeaders: candidateHeaders.material,
      bodySha256: testCase.bodyHash ? bodyHash(candidate.body) : null,
    },
    explicitlyExcludedHeaders: {
      baseline: baselineHeaders.excluded,
      candidate: candidateHeaders.excluded,
    },
    additionalComparedHeaders: strictHeaderInventory
      ? [...new Set([
          ...Object.keys(baselineHeaders.unclassified),
          ...Object.keys(candidateHeaders.unclassified),
        ])].sort()
      : [],
    differences,
  };
}

async function mapLimit(values, limit, task) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      results[index] = await task(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

export async function runParityHarness({
  root,
  baselineClient,
  candidateClient,
  dynamicPaths = [],
  concurrency = 6,
  strictHeaderInventory = true,
  onProgress = () => {},
}) {
  const { contract, contractHash } = buildHostContract(root);
  const matrix = buildParityMatrix(root, contract, dynamicPaths);
  const results = await mapLimit(matrix, concurrency, async (testCase, index) => {
    try {
      const [baselineResult, candidateResult] = await Promise.allSettled([
        baselineClient.request(testCase.path),
        candidateClient.request(testCase.path),
      ]);
      if (baselineResult.status === "rejected" || candidateResult.status === "rejected") {
        const differences = [];
        if (baselineResult.status === "rejected") {
          differences.push({ field: "baseline.request_error", baseline: baselineResult.reason.message, candidate: null });
        }
        if (candidateResult.status === "rejected") {
          differences.push({ field: "candidate.request_error", baseline: null, candidate: candidateResult.reason.message });
        }
        const result = {
          ok: false,
          id: testCase.id,
          path: testCase.path,
          category: testCase.category,
          differences,
        };
        onProgress({ index: index + 1, total: matrix.length, id: testCase.id, ok: false });
        return result;
      }
      const baseline = baselineResult.value;
      const candidate = candidateResult.value;
      const result = compareResponses(testCase, baseline, candidate, { strictHeaderInventory });
      onProgress({ index: index + 1, total: matrix.length, id: testCase.id, ok: result.ok });
      return result;
    } catch (error) {
      const result = {
        ok: false,
        id: testCase.id,
        path: testCase.path,
        category: testCase.category,
        differences: [{ field: "request_error", baseline: null, candidate: error.message }],
      };
      onProgress({ index: index + 1, total: matrix.length, id: testCase.id, ok: false });
      return result;
    }
  });
  const failed = results.filter((result) => !result.ok);
  return {
    schema: "confenge.origin-parity-report/v1",
    state: contract.state,
    contractHash,
    hostArchitectureVersion: contract.hostArchitectureVersion,
    origins: {
      baseline: {
        baseUrl: baselineClient.baseUrl,
        requestedHost: baselineClient.requestedHost,
        evidenceMode: baselineClient.evidenceMode,
      },
      candidate: {
        baseUrl: candidateClient.baseUrl,
        requestedHost: candidateClient.requestedHost,
        evidenceMode: candidateClient.evidenceMode,
      },
    },
    strictHeaderInventory,
    materialHeaders: MATERIAL_HEADERS,
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
    ok: failed.length === 0,
    results,
  };
}
