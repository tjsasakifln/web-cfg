/**
 * Hub indexability truth: set equality against an independent policy source.
 *
 * Independent eligibility (not circular with audited HTML robots):
 *   1. seo/content-disposition-2026-08-02.json disposition === "manter"
 *      minus SUPERSEDED_URLS (inbound_first_remediate.py)
 *   2. plus STILL_PUBLISHED_CONSOLIDAR_URLS — consolidar peers that remain on
 *      the public library until a real consolidation 301 lands (versioned in
 *      inbound_first_remediate.py; not derived from live robots)
 *
 * A systemic noindex flip cannot shrink both expected and actual together.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DISPOSITION_PATH = resolve(ROOT, "seo/content-disposition-2026-08-02.json");
const REMEDIATE_PY = resolve(ROOT, "scripts/site/inbound_first_remediate.py");
const HUB_PATH = resolve(ROOT, "conteudos/index.html");

function robotsOf(html) {
  const m =
    html.match(/name=["']robots["'][^>]*content=["']([^"']+)/i) ||
    html.match(/content=["']([^"']+)["'][^>]*name=["']robots["']/i);
  return (m ? m[1] : "MISSING").toLowerCase();
}

function isIndexableHtml(html) {
  const robots = robotsOf(html);
  if (robots === "missing") return true;
  return !robots.includes("noindex");
}

/** Parse a frozenset({ "/conteudos/..." }) constant from the remediation module. */
function loadUrlFrozenset(constName) {
  const src = readFileSync(REMEDIATE_PY, "utf8");
  const re = new RegExp(
    `${constName}\\s*=\\s*frozenset\\s*\\(\\s*\\{([^}]+)\\}`,
    "s",
  );
  const block = src.match(re);
  if (!block) {
    throw new Error(`${constName} block not found in inbound_first_remediate.py`);
  }
  return new Set(
    [...block[1].matchAll(/["'](\/conteudos\/[^"']+)["']/g)].map((m) => m[1]),
  );
}

function loadSupersededUrls() {
  const urls = loadUrlFrozenset("SUPERSEDED_URLS");
  if (!urls.size) throw new Error("SUPERSEDED_URLS parsed empty");
  return urls;
}

function loadStillPublishedConsolidarUrls() {
  // May be empty if all consolidar peers already have 301s.
  return loadUrlFrozenset("STILL_PUBLISHED_CONSOLIDAR_URLS");
}

/**
 * Policy-declared indexable /conteudos/ URLs.
 * Canonical inventory: disposition=manter minus superseded, plus still-published consolidar.
 */
function loadPolicyIndexableUrls() {
  const data = JSON.parse(readFileSync(DISPOSITION_PATH, "utf8"));
  const items = data.items || [];
  const superseded = loadSupersededUrls();
  const stillConsolidar = loadStillPublishedConsolidarUrls();
  const urls = new Set();
  for (const it of items) {
    if (it.disposition !== "manter") continue;
    const path = it.path;
    if (!path || !path.startsWith("/conteudos/")) continue;
    const norm = path.endsWith("/") ? path : `${path}/`;
    if (superseded.has(norm)) continue;
    urls.add(norm);
  }
  for (const u of stillConsolidar) {
    if (superseded.has(u)) continue;
    // require the HTML file to exist (published artifact)
    const slug = u.replace(/^\/conteudos\/|\/$/g, "");
    if (existsSync(join(ROOT, "conteudos", slug, "index.html"))) {
      urls.add(u.endsWith("/") ? u : `${u}/`);
    }
  }
  return urls;
}

function loadLiveIndexableConteudosUrls() {
  const folder = resolve(ROOT, "conteudos");
  const urls = new Set();
  const superseded = loadSupersededUrls();
  for (const name of readdirSync(folder)) {
    const path = join(folder, name, "index.html");
    if (!existsSync(path)) continue;
    const url = `/conteudos/${name}/`;
    if (superseded.has(url)) {
      // Superseded must never count as indexable, even if robots drift.
      continue;
    }
    if (isIndexableHtml(readFileSync(path, "utf8"))) {
      urls.add(url);
    }
  }
  return urls;
}

function loadHubListedConteudosUrls(hubHtml) {
  const urls = new Set();
  const re = /href=["'](\/conteudos\/[^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(hubHtml)) !== null) {
    let u = m[1];
    if (u === "/conteudos/" || u === "/conteudos") continue;
    if (!u.endsWith("/")) u = `${u}/`;
    // Only leaf guide paths (slug), not nested assets
    if (/^\/conteudos\/[^/]+\/$/.test(u)) urls.add(u);
  }
  return urls;
}

function setEq(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function fmtSet(s) {
  return [...s].sort().join("\n");
}

function diffSets(labelLeft, left, labelRight, right) {
  const onlyL = [...left].filter((x) => !right.has(x)).sort();
  const onlyR = [...right].filter((x) => !left.has(x)).sort();
  const parts = [];
  if (onlyL.length) parts.push(`only_in_${labelLeft}: ${onlyL.join(", ")}`);
  if (onlyR.length) parts.push(`only_in_${labelRight}: ${onlyR.join(", ")}`);
  return parts.join(" | ") || "equal";
}

const hub = readFileSync(HUB_PATH, "utf8");
const policySet = loadPolicyIndexableUrls();
const liveSet = loadLiveIndexableConteudosUrls();
const hubSet = loadHubListedConteudosUrls(hub);
const expected = policySet.size;
const stillConsolidar = loadStillPublishedConsolidarUrls();
const superseded = loadSupersededUrls();

let fail = 0;
function ok(n, c, d = "") {
  if (c) console.log("PASS", n);
  else {
    console.error("FAIL", n, d);
    fail += 1;
  }
}

ok("no_corrupted_p_R", !/<p R\s/i.test(hub));
ok("no_datalake", !/datalake/i.test(hub));
ok("no_false_evergreen_intel", !/publica páginas evergreen com agregados/i.test(hub));
ok("no_120_guias", !/120\s*guias/i.test(hub));
ok("points_to_tools_or_radar", /\/ferramentas\/|\/radar\/nacional/.test(hub));

ok(
  "policy_indexable_nonempty",
  expected > 0 && expected < 100,
  `policy set size ${expected}`,
);

// Set equality: policy ↔ live HTML without noindex ↔ hub listings
ok(
  "set_eq_policy_live",
  setEq(policySet, liveSet),
  diffSets("policy", policySet, "live", liveSet),
);
ok(
  "set_eq_policy_hub",
  setEq(policySet, hubSet),
  diffSets("policy", policySet, "hub", hubSet),
);
ok(
  "set_eq_live_hub",
  setEq(liveSet, hubSet),
  diffSets("live", liveSet, "hub", hubSet),
);

// Counts derived from the independent policy set (not from counting the same HTML robots)
ok(
  "content_lead_problem_first",
  /Qual problema de licitação ou contrato você precisa resolver\?/.test(hub),
  "hub hero must ask the visitor problem",
);
ok(
  "no_public_indexable_jargon",
  !/guias indexáveis|conteúdos indexáveis|frentes de decisão|eixos integrados|página-pilar/i.test(hub),
  "taxonomy jargon must not appear on hub",
);
ok(
  "hub_search_priority",
  /data-hub-search|hub-search-priority|Buscar por problema/i.test(hub),
  "problem search must be primary",
);
ok(
  "no_zero_guias_public",
  !/\b0\s*guias\b/i.test(hub),
  "zero-count themes must not show 0 guias",
);
ok(
  "plural_one_guia",
  !/\b1\s*guias\b/i.test(hub),
  "must use 1 guia not 1 guias",
);
ok(
  `numberOfItems_${expected}`,
  new RegExp(`"numberOfItems"\\s*:\\s*${expected}`).test(hub),
  `expected numberOfItems ${expected}`,
);
// Hub metrics tile (not cluster cards)
ok(
  "no_hub_metrics_dashboard",
  !/<div class="hub-metrics">/i.test(hub),
  "hub-metrics dashboard tile should be gone",
);
ok(
  "problem_stages_present",
  /Antes de contratar/.test(hub) && /Durante a execução/.test(hub) && /Quando há conflito/.test(hub),
  "three journey stages required",
);
ok(
  "featured_lead_support",
  /featured-decision/.test(hub) && /featured-lead/.test(hub),
  "featured should be lead + support, not equal card grid",
);

// Superseded must never reappear as indexable or on the hub
for (const u of superseded) {
  ok(`superseded_not_in_policy_${u}`, !policySet.has(u));
  ok(`superseded_not_in_live_${u}`, !liveSet.has(u));
  ok(`superseded_not_in_hub_${u}`, !hubSet.has(u) && !hub.includes(u));
  const slug = u.replace(/^\/conteudos\/|\/$/g, "");
  const path = join(ROOT, "conteudos", slug, "index.html");
  if (existsSync(path)) {
    const robots = robotsOf(readFileSync(path, "utf8"));
    ok(`superseded_html_noindex_${u}`, robots.includes("noindex"), robots);
  }
}

// Still-published consolidar peers must remain in the independent policy set
for (const u of stillConsolidar) {
  ok(`still_consolidar_in_policy_${u}`, policySet.has(u));
}

// remediate must not use partial class= capture; hub rebuild is problem-first
const rem = readFileSync(REMEDIATE_PY, "utf8");
ok("remediate_no_partial_attr_regex", !/\(class="content-lead">\)\(\[\^<\]\+\)/.test(rem));
ok(
  "remediate_hub_problem_first",
  rem.includes("Qual problema de licitação ou contrato você precisa resolver") &&
    rem.includes("problem-stages") &&
    rem.includes("featured-lead"),
  "remediate_hub must rebuild problem-first hub structure",
);
// Must not globally rewrite every "N guias" string to the hub total
ok(
  "remediate_no_global_digit_guias_rewrite",
  !/re\.sub\(\s*r["']\\b\\d\+\\s\+guias\\b["']/.test(rem) &&
    !/re\.sub\(r"\\b\\d\+\\s\+guias\\b"/.test(rem),
  "broad \\\\b\\\\d+\\\\s+guias\\\\b rewrite must not exist",
);

// Counterfactual integrity: policy set is independent of live robots counts
ok(
  "policy_independent_of_live_robots",
  policySet.size > 0 &&
    !readFileSync(DISPOSITION_PATH, "utf8").includes("numberOfItems") &&
    rem.includes("STILL_PUBLISHED_CONSOLIDAR_URLS"),
  "policy set must remain non-empty even if live HTML were all noindex",
);

if (fail) {
  console.error("HUB_TRUTH_DETAIL", {
    policy_size: policySet.size,
    live_size: liveSet.size,
    hub_size: hubSet.size,
    policy: fmtSet(policySet),
    live: fmtSet(liveSet),
    hub: fmtSet(hubSet),
  });
  process.exit(1);
}
console.log("ALL hub truth checks passed", {
  HUB_EXPECTATION_SOURCE:
    "seo/content-disposition-2026-08-02.json#manter minus SUPERSEDED_URLS plus STILL_PUBLISHED_CONSOLIDAR_URLS",
  policy_indexable: expected,
  live_indexable: liveSet.size,
  hub_listed: hubSet.size,
  still_published_consolidar: [...stillConsolidar],
});
