/**
 * Production cutover gates — fail when live site is on older SHA or architecture.
 * Usage:
 *   node scripts/site/test_production_cutover.mjs
 *   node scripts/site/test_production_cutover.mjs https://confenge.com.br
 *   node scripts/site/test_production_cutover.mjs --phase candidate --base https://confenge.com.br --resolve "$NETCUP_ORIGIN_IP"
 *   BASE_URL=http://127.0.0.1:8765 node scripts/site/test_production_cutover.mjs
 *
 * Candidate/live phases assert release SHA and build identity without assuming a hosting vendor.
 * HTTPS pre-DNS evidence uses curl --resolve with normal certificate validation; --insecure is forbidden.
 */
import { createHash } from "crypto";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { HOST_ARCHITECTURE_VERSION } from "../migration/netcup/lib/contract.mjs";
import { createOriginClient } from "../migration/netcup/lib/origin-client.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function usage() {
  console.log(`Usage:
  node scripts/site/test_production_cutover.mjs [URL]
  node scripts/site/test_production_cutover.mjs --phase baseline|candidate|live|local --base URL [options]

Options:
  --host HOST                              HTTP pre-DNS Host header
  --resolve IP                             HTTPS pre-DNS curl --resolve
  --expected-sha SHA                       Expected web-cfg release
  --expected-artifact-hash SHA256          Exact _site artifact identity
  --expected-host-architecture-version VER Host pack architecture identity
  --expected-runtime-identity ID           Runtime identity when applicable
  --runtime-identity-path PATH             Runtime identity endpoint
  --runtime-identity-field FIELD           Dotted JSON identity field
`);
}

function parseOptions(argv) {
  const parsed = {
    base: process.env.BASE_URL || "https://confenge.com.br",
    phase: process.env.CUTOVER_PHASE || null,
    host: process.env.CANDIDATE_HOST || null,
    resolveIp: process.env.CANDIDATE_RESOLVE || null,
    expectedSha: process.env.EXPECTED_SHA || null,
    expectedArtifactHash: process.env.EXPECTED_ARTIFACT_HASH || null,
    expectedRuntimeIdentity: process.env.EXPECTED_RUNTIME_IDENTITY || null,
    runtimeIdentityPath: process.env.RUNTIME_IDENTITY_PATH || "/.well-known/runtime-info.json",
    runtimeIdentityField: process.env.RUNTIME_IDENTITY_FIELD || "runtime_identity",
    expectedHostArchitectureVersion: process.env.EXPECTED_HOST_ARCHITECTURE_VERSION || null,
  };
  let positionalUsed = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (!arg.startsWith("--") && !positionalUsed) {
      parsed.base = arg;
      positionalUsed = true;
    } else if (arg === "--base") parsed.base = argv[++index];
    else if (arg === "--phase") parsed.phase = argv[++index];
    else if (arg === "--host") parsed.host = argv[++index];
    else if (arg === "--resolve") parsed.resolveIp = argv[++index];
    else if (arg === "--expected-sha") parsed.expectedSha = argv[++index];
    else if (arg === "--expected-artifact-hash") parsed.expectedArtifactHash = argv[++index];
    else if (arg === "--expected-runtime-identity") parsed.expectedRuntimeIdentity = argv[++index];
    else if (arg === "--runtime-identity-path") parsed.runtimeIdentityPath = argv[++index];
    else if (arg === "--runtime-identity-field") parsed.runtimeIdentityField = argv[++index];
    else if (arg === "--expected-host-architecture-version") parsed.expectedHostArchitectureVersion = argv[++index];
    else throw new Error(`unknown cutover argument: ${arg}`);
  }
  parsed.base = parsed.base.replace(/\/$/, "");
  const hostname = new URL(parsed.base).hostname;
  parsed.phase ||= parsed.resolveIp ? "candidate" : /^(?:127\.0\.0\.1|localhost|::1)$/.test(hostname) ? "local" : hostname === "confenge.com.br" ? "baseline" : "candidate";
  if (!new Set(["local", "baseline", "candidate", "live"]).has(parsed.phase)) throw new Error(`invalid --phase ${parsed.phase}`);
  return parsed;
}

const OPTIONS = parseOptions(process.argv.slice(2));
const BASE = OPTIONS.base;
const requiresReleaseIdentity = OPTIONS.phase !== "local";
const requiresHostArchitecture = OPTIONS.phase === "candidate" || OPTIONS.phase === "live";
const expectedHostArchitectureVersion =
  OPTIONS.expectedHostArchitectureVersion || (requiresHostArchitecture ? HOST_ARCHITECTURE_VERSION : null);
const origin = createOriginClient({
  label: `cutover-${OPTIONS.phase}`,
  baseUrl: BASE,
  hostHeader: OPTIONS.host,
  resolveIp: OPTIONS.resolveIp,
});
/** Exact corporate H1 markup as required by the canonical public shell. */
const EXPECTED_H1_MARKUP =
  '<h1 id="hero-title">Do problema técnico <span class="type-serif">à decisão documentada.</span></h1>';
const RETIRED = [
  "Oito momentos em que",
  "Todo o conteúdo permanece legível sem JavaScript",
  "sem inventar case",
  "sem métrica fictícia",
];

function gitHead() {
  if (OPTIONS.expectedSha) return OPTIONS.expectedSha.trim();
  return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function localArtifact(rel) {
  const sitePath = resolve(ROOT, "_site", rel);
  const srcPath = resolve(ROOT, rel);
  if (existsSync(sitePath)) return readFileSync(sitePath, "utf8");
  if (existsSync(srcPath)) return readFileSync(srcPath, "utf8");
  return null;
}

async function fetchText(path) {
  const res = await origin.request(path);
  return {
    status: res.status,
    headers: { get: (name) => res.headers[name.toLowerCase()] || null },
    body: res.body.toString("utf8"),
    url: res.url,
  };
}

const failures = [];
function ok(name, cond, detail = "") {
  if (cond) console.log("PASS", name);
  else {
    console.error("FAIL", name, detail);
    failures.push(`${name}: ${detail}`);
  }
}

const head = gitHead();
console.log(JSON.stringify({
  base: BASE,
  phase: OPTIONS.phase,
  evidence_mode: origin.evidenceMode,
  requested_host: origin.requestedHost,
  expected_head: head,
  expected_artifact_hash: OPTIONS.expectedArtifactHash,
  expected_host_architecture_version: expectedHostArchitectureVersion,
  expected_runtime_identity: OPTIONS.expectedRuntimeIdentity,
}, null, 2));

// Marker
const marker = await fetchText("/.well-known/pseo-build.json");
ok("marker_http_200", marker.status === 200, `status=${marker.status}`);
let markerJson = {};
try {
  markerJson = JSON.parse(marker.body);
} catch (e) {
  failures.push(`marker_json: ${e}`);
}
if (requiresReleaseIdentity) {
  ok(
    "public_sha_equals_head",
    markerJson.web_cfg_sha === head,
    `live=${markerJson.web_cfg_sha} head=${head}`
  );
} else {
  console.log("SKIP public_sha_equals_head (local phase)");
}

// Host-neutral release identity: SHA + artifact + optional runtime/architecture.
const buildInfoResponse = await fetchText("/.well-known/build-info.json");
ok("build_info_http_200", buildInfoResponse.status === 200, `status=${buildInfoResponse.status}`);
let buildInfo = {};
try {
  buildInfo = JSON.parse(buildInfoResponse.body);
} catch (e) {
  failures.push(`build_info_json: ${e}`);
}
if (requiresReleaseIdentity) {
  ok("build_info_commit_matches_expected", buildInfo.commit === head || buildInfo.web_cfg_sha === head, `identity=${buildInfo.commit || buildInfo.web_cfg_sha} expected=${head}`);
  ok("build_info_has_artifact_hash", /^[a-f0-9]{32,}$/i.test(buildInfo.artifact_hash || ""), `artifact_hash=${buildInfo.artifact_hash}`);
}
let expectedArtifactHash = OPTIONS.expectedArtifactHash;
if (!expectedArtifactHash) {
  const localIdentity = localArtifact(".well-known/build-info.json");
  if (localIdentity) {
    try {
      expectedArtifactHash = JSON.parse(localIdentity).artifact_hash || null;
    } catch {
      // Existing local/source fallback may not be generated yet; explicit env/arg remains available.
    }
  }
}
if (expectedArtifactHash) {
  ok("artifact_hash_matches_expected", buildInfo.artifact_hash === expectedArtifactHash, `live=${buildInfo.artifact_hash} expected=${expectedArtifactHash}`);
} else if (requiresReleaseIdentity) {
  ok("artifact_hash_expected_required", false, "build exact _site first or pass --expected-artifact-hash");
} else {
  console.log("SKIP artifact_hash_matches_expected (no expected artifact hash; pass --expected-artifact-hash)");
}

if (expectedHostArchitectureVersion) {
  const observedArchitecture =
    buildInfo.host_architecture_version ||
    buildInfo.hostArchitectureVersion ||
    buildInfoResponse.headers.get("x-confenge-host-architecture-version") ||
    null;
  ok("host_architecture_version_matches_expected", observedArchitecture === expectedHostArchitectureVersion, `live=${observedArchitecture} expected=${expectedHostArchitectureVersion}`);
} else {
  console.log("SKIP host_architecture_version (not applicable/expected)");
}

function fieldAt(value, dotted) {
  return dotted.split(".").reduce((current, key) => current && current[key], value);
}

if (OPTIONS.expectedRuntimeIdentity) {
  const runtime = await fetchText(OPTIONS.runtimeIdentityPath);
  let runtimeJson = {};
  try {
    runtimeJson = JSON.parse(runtime.body);
  } catch (e) {
    failures.push(`runtime_identity_json: ${e}`);
  }
  const observedRuntime = fieldAt(runtimeJson, OPTIONS.runtimeIdentityField);
  ok("runtime_identity_http_200", runtime.status === 200, `status=${runtime.status} path=${OPTIONS.runtimeIdentityPath}`);
  ok("runtime_identity_matches_expected", observedRuntime === OPTIONS.expectedRuntimeIdentity, `live=${observedRuntime} expected=${OPTIONS.expectedRuntimeIdentity}`);
} else {
  console.log("SKIP runtime_identity (runtime not applicable or no expected identity)");
}

// Home architecture
const home = await fetchText("/");
ok("home_200", home.status === 200, `status=${home.status}`);
ok("home_h1_full", home.body.includes(EXPECTED_H1_MARKUP), "exact corporate H1 missing");
const situationRows = (home.body.match(/class="[^"]*\bsituation-row\b/g) || []).length;
ok("five_situation_paths", situationRows === 5, `situation rows=${situationRows}`);
const blocks = (home.body.match(/data-section-archetype="/g) || []).length;
ok("eight_narrative_blocks", blocks === 8, `archetypes=${blocks}`);
for (const phrase of RETIRED) {
  ok(`retired_absent:${phrase.slice(0, 24)}`, !home.body.includes(phrase), "found retired string");
}
ok("no_preconversion_library", !/biblioteca pré-convers[aã]o/i.test(home.body), "library section present");

// Assets: fingerprint vs _site (or source) artifact
const css = await fetchText("/styles.css");
const js = await fetchText("/script.js");
ok("css_200", css.status === 200 && css.body.length > 1000, `css status=${css.status} len=${css.body.length}`);
ok("js_200", js.status === 200 && js.body.length > 1000, `js status=${js.status} len=${js.body.length}`);
ok("css_has_contact_float", css.body.includes("contact-float"), "contact-float styles missing");
ok("css_has_whatsapp_float", css.body.includes("whatsapp-float"), "whatsapp-float styles missing");

const offerPage = await fetchText("/diretoria-b2g/");
const sheetHrefs = [...offerPage.body.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
  .map((m) => {
    const href = m[0].match(/href=["']([^"']+)["']/i);
    return href ? href[1] : "";
  })
  .filter(Boolean);
const fingerprinted = sheetHrefs.filter((h) => /\/assets\/css\/styles\.[a-f0-9]{12}\.css(\?|$)/i.test(h));
ok(
  "offer_html_stylesheet_fingerprinted",
  fingerprinted.length >= 1,
  `hrefs=${sheetHrefs.join(",")}`
);
if (fingerprinted.length) {
  const linked = await fetchText(fingerprinted[0]);
  ok(
    "linked_css_has_offer_context",
    linked.status === 200 && linked.body.includes(".offer-context{") && linked.body.includes("repeat(3,minmax(0,1fr))"),
    `status=${linked.status} href=${fingerprinted[0]}`
  );
}

const localCss = localArtifact("styles.css");
const localJs = localArtifact("script.js");
if (localCss) {
  const liveHash = sha256(css.body);
  const localHash = sha256(localCss);
  ok(
    "css_sha256_matches_artifact",
    liveHash === localHash,
    `live=${liveHash.slice(0, 16)} local=${localHash.slice(0, 16)} liveLen=${css.body.length} localLen=${localCss.length}`
  );
  ok(
    "css_reduced_data_targets_published_profile",
    css.body.includes("@media (prefers-reduced-data:reduce){.profile-mark img{display:none}"),
    "reduced-data profile fallback missing"
  );
} else {
  console.log("SKIP css_sha256_matches_artifact (no local styles.css)");
}
if (localJs) {
  const liveHash = sha256(js.body);
  const localHash = sha256(localJs);
  ok(
    "js_sha256_matches_artifact",
    liveHash === localHash,
    `live=${liveHash.slice(0, 16)} local=${localHash.slice(0, 16)}`
  );
} else {
  console.log("SKIP js_sha256_matches_artifact (no local script.js)");
}

// Redirect /servicos
const serv = await fetchText("/servicos");
const loc = serv.headers.get("location") || "";
ok(
  "servicos_301",
  serv.status === 301,
  `status=${serv.status} loc=${loc}`
);
ok(
  "servicos_target_hub",
  loc === "/servicos/",
  `loc=${loc}`
);
ok("fragment_situacoes", home.body.includes('id="situacoes"'), "missing id");

// 410
for (const path of ["/vision", "/nexgen", "/avcbclcb"]) {
  const r = await fetchText(path);
  ok(`gone_410:${path}`, r.status === 410, `status=${r.status}`);
}

// robots + sitemap
const robots = await fetchText("/robots.txt");
ok("robots_200", robots.status === 200 && /sitemap/i.test(robots.body), "robots");
const sm = await fetchText("/sitemap.xml");
ok(
  "sitemap_200",
  sm.status === 200 &&
    (sm.body.includes("<urlset") || sm.body.includes("<sitemapindex") || sm.body.includes("<url>")),
  "sitemap"
);









// Public build-injected release result (authoritative SHAs post-deploy)
if (requiresReleaseIdentity) {
  try {
    const rr = await fetchText("/.well-known/release-result.json");
    if (rr.status === 200) {
      const body = JSON.parse(rr.body);
      const releaseSha = body.web_cfg_sha || body.commit || body.final_sha || body.deployed_sha;
      ok(
        "public_release_result_matches_live",
        releaseSha === markerJson.web_cfg_sha || releaseSha === markerJson.commit,
        `release=${releaseSha} live=${markerJson.web_cfg_sha}`
      );
      ok(
        "public_release_result_matches_head",
        releaseSha === head,
        `release=${releaseSha} head=${head}`
      );
    } else {
      console.log("SKIP public_release_result (HTTP", rr.status, ")");
    }
  } catch (e) {
    failures.push(`public_release_result: ${e}`);
  }
}

if (failures.length) {
  console.error("\nCUTOVER FAILURES:", failures.length);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("\nALL production-cutover checks passed for", BASE);
