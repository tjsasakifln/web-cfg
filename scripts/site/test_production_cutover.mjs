/**
 * Production cutover gates — fail when live site is on older SHA or architecture.
 * Usage:
 *   node scripts/site/test_production_cutover.mjs
 *   node scripts/site/test_production_cutover.mjs https://confenge.com.br
 *   BASE_URL=http://127.0.0.1:8765 node scripts/site/test_production_cutover.mjs
 *
 * Against production, asserts public /.well-known/pseo-build.json web_cfg_sha == git HEAD
 * (or EXPECTED_SHA). Against local/_site, asserts architecture + asset fingerprint vs _site.
 */
import { createHash } from "crypto";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.argv[2] || process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");
const isProd = /confenge\.com\.br$/i.test(new URL(BASE).hostname);
/** Full H1 as required by production gate (exact phrase family). */
const EXPECTED_H1_FULL = "Licitação vencida não paga a conta. Contrato rentável, sim.";
const RETIRED = [
  "Oito momentos em que",
  "Todo o conteúdo permanece legível sem JavaScript",
  "sem inventar case",
  "sem métrica fictícia",
];

function gitHead() {
  if (process.env.EXPECTED_SHA) return process.env.EXPECTED_SHA.trim();
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
  const url = `${BASE}${path}`;
  const res = await fetch(url, { redirect: "manual" });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body, url };
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
console.log(JSON.stringify({ base: BASE, isProd, expected_head: head }, null, 2));

// Marker
const marker = await fetchText("/.well-known/pseo-build.json");
ok("marker_http_200", marker.status === 200, `status=${marker.status}`);
let markerJson = {};
try {
  markerJson = JSON.parse(marker.body);
} catch (e) {
  failures.push(`marker_json: ${e}`);
}
if (isProd) {
  ok(
    "public_sha_equals_head",
    markerJson.web_cfg_sha === head,
    `live=${markerJson.web_cfg_sha} head=${head}`
  );
} else {
  console.log("SKIP public_sha_equals_head (non-production base)");
}

// Home architecture
const home = await fetchText("/");
ok("home_200", home.status === 200, `status=${home.status}`);
ok(
  "home_h1_full",
  home.body.includes(EXPECTED_H1_FULL) ||
    (home.body.includes("Licitação vencida não paga a conta.") &&
      home.body.includes("Contrato rentável, sim.")),
  "full H1 phrase missing"
);
// Prefer exact h1 element text when present
const h1Match = home.body.match(/<h1[^>]*id="hero-title"[^>]*>([\s\S]*?)<\/h1>/i);
if (h1Match) {
  const h1Text = h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  ok(
    "home_h1_element",
    h1Text.includes("Licitação vencida não paga a conta.") &&
      h1Text.includes("Contrato rentável, sim."),
    `h1=${h1Text.slice(0, 80)}`
  );
}
const macro = (home.body.match(/macro-phase/g) || []).length;
ok("four_macrofases", macro >= 4, `macro-phase count=${macro}`);
const blocks = (home.body.match(/data-section-archetype="/g) || []).length;
ok("seven_narrative_blocks", blocks === 7, `archetypes=${blocks}`);
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
  ok("css_contains_macro_phases", css.body.includes("macro-phase") || css.body.includes("macro-phases"), "macro-phase CSS missing");
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
  serv.status === 301 || serv.status === 302 || serv.status === 308,
  `status=${serv.status} loc=${loc}`
);
ok(
  "servicos_target_fragment",
  /como-atuamos/.test(loc) || /como-atuamos/.test(serv.body),
  `loc=${loc}`
);
ok("fragment_como_atuamos", home.body.includes('id="como-atuamos"'), "missing id");

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
if (isProd) {
  try {
    const rr = await fetchText("/.well-known/release-result.json");
    if (rr.status === 200) {
      const body = JSON.parse(rr.body);
      ok(
        "public_release_result_matches_live",
        body.final_sha === markerJson.web_cfg_sha && body.deployed_sha === markerJson.web_cfg_sha,
        `release=${body.final_sha} live=${markerJson.web_cfg_sha}`
      );
      ok(
        "public_release_result_matches_head",
        body.final_sha === head,
        `release=${body.final_sha} head=${head}`
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
