import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { CANONICAL_HOST, buildHostContract } from "./contract.mjs";
import { extractSeoSignals, sitemapUrlSet } from "./html-seo.mjs";
import { buildParityMatrix } from "./parity.mjs";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function check(list, id, condition, detail = {}) {
  list.push({ id, ok: Boolean(condition), detail });
}

function pathnameOf(path) {
  return path.split("?", 1)[0];
}

function artifactFile(site, path) {
  const pathname = pathnameOf(path);
  const rel = pathname.replace(/^\//, "");
  const choices = pathname === "/"
    ? [resolve(site, "index.html")]
    : [resolve(site, rel), resolve(site, `${rel}.html`), resolve(site, rel, "index.html")];
  return choices.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) || null;
}

function selectorSample(rule) {
  return rule.match === "exact" ? rule.path : rule.path.replace(/\*$/, "__seo_adversarial__");
}

function privateSelectors(contract, robotsText) {
  const selectors = contract.headers
    .filter((rule) => rule.headers.some((header) => header.name.toLowerCase() === "x-robots-tag" && /\bnoindex\b/i.test(header.value)))
    .map((rule) => rule.path);
  for (const match of robotsText.matchAll(/^\s*Disallow:\s*(\S+)/gim)) selectors.push(match[1].endsWith("/") ? `${match[1]}*` : match[1]);
  return [...new Set(selectors)].sort();
}

function selectorMatchesUrl(selector, url) {
  const path = new URL(url).pathname;
  if (selector.endsWith("/*")) {
    const base = selector.slice(0, -1);
    return path.startsWith(base);
  }
  return path === selector || path === `${selector}/`;
}

function expectedArtifactForCase(site, contract, testCase) {
  if (testCase.expectedStatus === 404 || testCase.category === "gone") return resolve(site, "404.html");
  const route = contract.routes.find(
    (candidate) => candidate.from.kind === "path" && pathnameOf(testCase.path) === candidate.from.path.replace(/\/$/, ""),
  );
  if (route?.action === "rewrite") return artifactFile(site, route.to.pathname);
  return artifactFile(site, testCase.path);
}

function readJsonResponse(response) {
  try {
    return JSON.parse(response.body.toString("utf8"));
  } catch {
    return null;
  }
}

function candidatePathFromLocation(location, currentPath) {
  const base = `https://${CANONICAL_HOST}${pathnameOf(currentPath)}`;
  const parsed = new URL(location, base);
  return `${parsed.pathname}${parsed.search}`;
}

export async function runSeoAdversarial({
  root,
  baselineClient,
  candidateClient,
  legacyClient = null,
  wwwClient = null,
  artifactRoot = resolve(root, "_site"),
}) {
  const { contract, contractHash } = buildHostContract(root);
  const checks = [];
  if (!existsSync(resolve(artifactRoot, "index.html"))) {
    throw new Error(`public artifact missing at ${artifactRoot}; run npm run build:site first`);
  }

  const sitemapNames = readdirSync(root).filter((name) => /^sitemap(?:-[a-z0-9-]+)?\.(?:xml|txt)$/i.test(name)).sort();
  const aggregateSitemapUrls = new Set();
  for (const name of sitemapNames) {
    const path = `/${name}`;
    const [baseline, candidate] = await Promise.all([baselineClient.request(path), candidateClient.request(path)]);
    const localPath = existsSync(resolve(artifactRoot, name)) ? resolve(artifactRoot, name) : resolve(root, name);
    const local = sitemapUrlSet(readFileSync(localPath), name.endsWith(".txt") ? "text/plain" : "application/xml");
    const left = sitemapUrlSet(baseline.body, baseline.headers["content-type"] || "");
    const right = sitemapUrlSet(candidate.body, candidate.headers["content-type"] || "");
    right.forEach((url) => aggregateSitemapUrls.add(url));
    check(checks, `sitemap-status:${name}`, baseline.status === 200 && candidate.status === 200, { baseline: baseline.status, candidate: candidate.status });
    check(checks, `sitemap-baseline-candidate-set:${name}`, sameJson(left, right), { baselineCount: left.length, candidateCount: right.length });
    check(checks, `sitemap-candidate-artifact-set:${name}`, sameJson(local, right), { artifactCount: local.length, candidateCount: right.length });
  }

  const [baselineRobots, candidateRobots] = await Promise.all([
    baselineClient.request("/robots.txt"),
    candidateClient.request("/robots.txt"),
  ]);
  const artifactRobots = readFileSync(resolve(artifactRoot, "robots.txt"));
  check(checks, "robots-status", baselineRobots.status === 200 && candidateRobots.status === 200, { baseline: baselineRobots.status, candidate: candidateRobots.status });
  check(checks, "robots-baseline-candidate-hash", hash(baselineRobots.body) === hash(candidateRobots.body), { baseline: hash(baselineRobots.body), candidate: hash(candidateRobots.body) });
  check(checks, "robots-candidate-artifact-hash", hash(candidateRobots.body) === hash(artifactRobots), { candidate: hash(candidateRobots.body), artifact: hash(artifactRobots) });

  const privatePaths = privateSelectors(contract, artifactRobots.toString("utf8"));
  for (const selector of privatePaths) {
    const leaked = [...aggregateSitemapUrls].filter((url) => selectorMatchesUrl(selector, url));
    check(checks, `private-not-in-sitemap:${selector}`, leaked.length === 0, { leaked: leaked.slice(0, 10) });
  }

  const indexableArtifact = [];
  for (const file of readdirRecursive(artifactRoot, ".html")) {
    const signals = extractSeoSignals(readFileSync(file));
    const noindex = signals.metaRobots.some((value) => value.split(",").includes("noindex"));
    if (noindex) continue;
    const rel = relative(artifactRoot, file).replaceAll("\\", "/");
    const canonicalOk =
      signals.canonical.length === 1 &&
      signals.canonical[0].startsWith(`https://${CANONICAL_HOST}/`) &&
      !signals.canonical[0].includes("www.") &&
      !signals.canonical[0].includes("netlify.app") &&
      !signals.canonical[0].startsWith("http://");
    indexableArtifact.push({
      rel,
      file,
      candidatePath: canonicalOk
        ? `${new URL(signals.canonical[0]).pathname}${new URL(signals.canonical[0]).search}`
        : null,
    });
    check(checks, `artifact-canonical:${rel}`, canonicalOk, { canonical: signals.canonical });
  }
  check(checks, "artifact-indexable-canonical-census", indexableArtifact.length > 0, { html: indexableArtifact.length });

  for (let offset = 0; offset < indexableArtifact.length; offset += 6) {
    const batch = indexableArtifact.slice(offset, offset + 6);
    const responses = await Promise.all(
      batch.map((artifact) => artifact.candidatePath ? candidateClient.request(artifact.candidatePath) : null),
    );
    batch.forEach((artifact, index) => {
      const response = responses[index];
      const expected = readFileSync(artifact.file);
      check(
        checks,
        `indexable-body-artifact:${artifact.rel}`,
        Boolean(response) && response.status === 200 && hash(response.body) === hash(expected),
        {
          candidatePath: artifact.candidatePath,
          status: response?.status || null,
          candidate: response ? hash(response.body) : null,
          artifact: hash(expected),
        },
      );
    });
  }

  const representative = buildParityMatrix(root, contract).filter((testCase) => testCase.seo && testCase.expectedStatus === 200);
  for (const testCase of representative) {
    const [baseline, candidate] = await Promise.all([
      baselineClient.request(testCase.path),
      candidateClient.request(testCase.path),
    ]);
    const left = extractSeoSignals(baseline.body);
    const right = extractSeoSignals(candidate.body);
    check(checks, `canonical-unchanged:${testCase.path}`, sameJson(left.canonical, right.canonical), { baseline: left.canonical, candidate: right.canonical });
    check(checks, `meta-robots-unchanged:${testCase.path}`, sameJson(left.metaRobots, right.metaRobots), { baseline: left.metaRobots, candidate: right.metaRobots });
  }

  for (const rule of contract.routes.filter((candidate) => candidate.from.kind === "path" && candidate.status === 301)) {
    const requestPath = rule.from.match === "prefix" ? rule.from.path.replace(/\*$/, "__seo_chain__") : rule.from.path;
    const first = await candidateClient.request(requestPath);
    const location = first.headers.location || "";
    check(checks, `redirect-301:${rule.from.raw}`, first.status === 301 && Boolean(location), { status: first.status, location });
    if (first.status === 301 && location) {
      const serverPath = candidatePathFromLocation(location, requestPath);
      const second = await candidateClient.request(serverPath);
      check(checks, `redirect-no-chain:${rule.from.raw}`, second.status < 300 || second.status >= 400, { first: location, secondStatus: second.status, serverPath });
      if (rule.to.fragment) {
        check(checks, `fragment-client-side:${rule.from.raw}`, location.includes(`#${rule.to.fragment}`) && !serverPath.includes("#"), { location, serverPath });
      }
    }
  }

  for (const rule of contract.routes.filter((candidate) => candidate.from.kind === "path" && candidate.status === 410)) {
    const response = await candidateClient.request(rule.from.path);
    check(checks, `gone-stays-410:${rule.from.path}`, response.status === 410, { status: response.status });
  }
  const [missing, custom404] = await Promise.all([
    candidateClient.request("/__seo_adversarial_missing_page__"),
    candidateClient.request("/404.html"),
  ]);
  check(checks, "custom-404-real-status", missing.status === 404, { status: missing.status });
  check(checks, "custom-404-not-soft", missing.status === 404 && custom404.status === 200 && hash(missing.body) === hash(custom404.body), {
    missingStatus: missing.status,
    customStatus: custom404.status,
    missingHash: hash(missing.body),
    customHash: hash(custom404.body),
  });

  for (const rule of contract.headers.filter((candidate) => candidate.headers.some((header) => header.name.toLowerCase() === "x-robots-tag" && /\bnoindex\b/i.test(header.value)))) {
    const path = selectorSample(rule);
    const response = await candidateClient.request(path);
    const route = contract.routes.find((candidate) => candidate.from.kind === "path" && candidate.from.path === rule.path);
    const redirectOnly = route && [301, 302].includes(route.status);
    const header = (response.headers["x-robots-tag"] || "").toLowerCase();
    const meta = /text\/html/i.test(response.headers["content-type"] || "") ? extractSeoSignals(response.body).metaRobots.join(",") : "";
    check(checks, `noindex-surface:${rule.path}`, (!redirectOnly || [301, 302].includes(response.status)) && (header.includes("noindex") || meta.includes("noindex")), {
      status: response.status,
      xRobots: header,
      metaRobots: meta,
      redirectOnly: Boolean(redirectOnly),
    });
  }

  const matrix = buildParityMatrix(root, contract);
  for (const testCase of matrix.filter((candidate) => candidate.bodyHash && ![301, 302].includes(candidate.expectedStatus))) {
    const expected = expectedArtifactForCase(artifactRoot, contract, testCase);
    if (!expected || !existsSync(expected)) continue;
    const response = await candidateClient.request(testCase.path);
    check(checks, `candidate-body-artifact:${testCase.id}`, hash(response.body) === hash(readFileSync(expected)), {
      status: response.status,
      candidate: hash(response.body),
      artifact: hash(readFileSync(expected)),
      artifactPath: relative(artifactRoot, expected).replaceAll("\\", "/"),
    });
  }

  const [baselineHome, candidateHome] = await Promise.all([
    baselineClient.request("/"),
    candidateClient.request("/"),
  ]);
  const baselineSignals = extractSeoSignals(baselineHome.body);
  const candidateSignals = extractSeoSignals(candidateHome.body);
  check(checks, "gsc-meta-verification", sameJson(baselineSignals.gscVerification, candidateSignals.gscVerification), {
    baseline: baselineSignals.gscVerification,
    candidate: candidateSignals.gscVerification,
  });
  check(checks, "analytics-tags", sameJson(baselineSignals.analyticsIds, candidateSignals.analyticsIds) && sameJson(baselineSignals.scriptSources, candidateSignals.scriptSources), {
    baselineIds: baselineSignals.analyticsIds,
    candidateIds: candidateSignals.analyticsIds,
    baselineScripts: baselineSignals.scriptSources,
    candidateScripts: candidateSignals.scriptSources,
  });
  check(checks, "turnstile-site-key", sameJson(baselineSignals.turnstileSiteKeys, candidateSignals.turnstileSiteKeys), {
    baselineCount: baselineSignals.turnstileSiteKeys.length,
    candidateCount: candidateSignals.turnstileSiteKeys.length,
  });
  const canonicalTlsEvidence = new Set(["https-curl-resolve-valid-certificate-required", "canonical-url-dns"]);
  check(checks, "turnstile-canonical-origin-evidence", candidateClient.requestedHost === CANONICAL_HOST && canonicalTlsEvidence.has(candidateClient.evidenceMode), {
    requestedHost: candidateClient.requestedHost,
    evidenceMode: candidateClient.evidenceMode,
  });

  for (const name of readdirSync(root).filter((entry) => /^[a-f0-9]{32,}\.txt$/i.test(entry))) {
    const [baseline, candidate] = await Promise.all([baselineClient.request(`/${name}`), candidateClient.request(`/${name}`)]);
    const local = readFileSync(resolve(root, name));
    check(checks, `gsc-verification-file:${name}`, baseline.status === 200 && candidate.status === 200 && hash(baseline.body) === hash(candidate.body) && hash(candidate.body) === hash(local), {
      baselineStatus: baseline.status,
      candidateStatus: candidate.status,
      baselineHash: hash(baseline.body),
      candidateHash: hash(candidate.body),
      localHash: hash(local),
    });
  }

  const candidateBuildInfo = await candidateClient.request("/.well-known/build-info.json");
  const candidateIdentity = readJsonResponse(candidateBuildInfo);
  const localIdentityPath = resolve(artifactRoot, ".well-known/build-info.json");
  const localIdentity = existsSync(localIdentityPath) ? JSON.parse(readFileSync(localIdentityPath, "utf8")) : null;
  check(checks, "artifact-identity-hash", Boolean(candidateIdentity?.artifact_hash && localIdentity?.artifact_hash) && candidateIdentity.artifact_hash === localIdentity.artifact_hash, {
    candidate: candidateIdentity?.artifact_hash || null,
    artifact: localIdentity?.artifact_hash || null,
  });

  if (legacyClient) {
    const path = "/__legacy_host_canonical_probe__?host_parity=1";
    const response = await legacyClient.request(path);
    const location = response.headers.location || "";
    check(checks, "legacy-netlify-host-canonicalized", response.status === 301 && location === `https://${CANONICAL_HOST}${path}`, { status: response.status, location });
  }
  if (wwwClient) {
    const path = "/__www_edge_probe__?host_parity=1";
    const response = await wwwClient.request(path);
    const location = response.headers.location || "";
    check(checks, "www-owned-by-edge", response.status === 301 && location === `https://${CANONICAL_HOST}${path}`, { status: response.status, location });
  }

  const failed = checks.filter((item) => !item.ok);
  return {
    schema: "confenge.seo-adversarial-report/v1",
    state: contract.state,
    contractHash,
    hostArchitectureVersion: contract.hostArchitectureVersion,
    artifactRoot,
    candidateEvidenceMode: candidateClient.evidenceMode,
    ok: failed.length === 0,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    checks,
  };
}

function readdirRecursive(root, suffix) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const directory = stack.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(path);
    }
  }
  return files.sort();
}
