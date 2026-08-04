/**
 * Hub indexability truth: set equality against an independent policy source.
 *
 * Independent eligibility (not circular with audited HTML robots):
 *   seo/content-disposition-2026-08-02.json items with disposition === "manter"
 *   minus SUPERSEDED_URLS from scripts/site/inbound_first_remediate.py
 *
 * disposition "consolidar" / "noindex" are not policy-indexable.
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

/** SUPERSEDED_URLS frozenset from the Python remediation module (single source of truth). */
function loadSupersededUrls() {
  const src = readFileSync(REMEDIATE_PY, "utf8");
  const block = src.match(/SUPERSEDED_URLS\s*=\s*frozenset\s*\(\s*\{([^}]+)\}/s);
  if (!block) {
    throw new Error("SUPERSEDED_URLS block not found in inbound_first_remediate.py");
  }
  const urls = [...block[1].matchAll(/["'](\/conteudos\/[^"']+)["']/g)].map((m) => m[1]);
  if (!urls.length) {
    throw new Error("SUPERSEDED_URLS parsed empty");
  }
  return new Set(urls);
}

/**
 * Policy-declared indexable /conteudos/ URLs.
 * Canonical inventory: content-disposition disposition=manter, minus superseded peers.
 */
function loadPolicyIndexableUrls() {
  const data = JSON.parse(readFileSync(DISPOSITION_PATH, "utf8"));
  const items = data.items || [];
  const superseded = loadSupersededUrls();
  const urls = new Set();
  for (const it of items) {
    if (it.disposition !== "manter") continue;
    const path = it.path;
    if (!path || !path.startsWith("/conteudos/")) continue;
    if (superseded.has(path)) continue;
    urls.add(path.endsWith("/") ? path : `${path}/`);
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

// Independent policy non-empty and not a magic constant
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
  `content_lead_${expected}`,
  new RegExp(`class="content-lead">\\s*${expected} guias indexáveis`).test(hub),
  `expected ${expected} guias indexáveis in content-lead`,
);
ok(
  `numberOfItems_${expected}`,
  new RegExp(`"numberOfItems"\\s*:\\s*${expected}`).test(hub),
  `expected numberOfItems ${expected}`,
);

// Superseded must never reappear as indexable or on the hub
const superseded = loadSupersededUrls();
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

// remediate must not use partial class= capture
const rem = readFileSync(REMEDIATE_PY, "utf8");
ok("remediate_no_partial_attr_regex", !/\(class="content-lead">\)\(\[\^<\]\+\)/.test(rem));
ok(
  "remediate_whole_lead_paragraph",
  /content-lead">\[\^<\]\*/.test(rem) ||
    /content-lead">\[/.test(rem) ||
    'content-lead">[^<]*</p>' in rem,
);

// Counterfactual integrity: if every conteudos page were noindex, expected must NOT collapse to 0
// (policy set is independent of live robots). Documented as a structural assertion.
ok(
  "policy_independent_of_live_robots",
  policySet.size > 0 &&
    !(liveSet.size === 0 && policySet.size === 0) &&
    // Policy source file does not encode live robots counts
    !readFileSync(DISPOSITION_PATH, "utf8").includes("numberOfItems"),
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
  HUB_EXPECTATION_SOURCE: "seo/content-disposition-2026-08-02.json#disposition=manter minus SUPERSEDED_URLS",
  policy_indexable: expected,
  live_indexable: liveSet.size,
  hub_listed: hubSet.size,
});
