/**
 * Redirect / 410 / fragment integrity gates (local _site expectations + optional live base).
 * Usage:
 *   node scripts/site/test_redirects.mjs
 *   node scripts/site/test_redirects.mjs https://confenge.com.br
 *
 * Default: validates shipped `_redirects` (and `_site/_redirects` after build if
 * present) plus fragment targets in source/home HTML.
 * With a base URL: also probes HTTP status/Location against that host.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.argv[2] || process.env.BASE_URL || "").replace(/\/$/, "");
const OPS_HOST = "https://ops.confenge.com.br/";
const INTRANET_EXACT = "/intranet";
const INTRANET_SPLAT = "/intranet/*";

export function parseRules(text) {
  const rules = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    // from to status[!]?
    const parts = t.split(/\s+/);
    if (parts.length < 3) continue;
    const from = parts[0];
    const to = parts[1];
    const status = parts[2].replace("!", "");
    rules.push({ from, to, status, raw: t, force: parts[2].endsWith("!") });
  }
  return rules;
}

export function loadRedirectFiles(root = ROOT) {
  const files = [];
  const source = resolve(root, "_redirects");
  if (!existsSync(source)) {
    throw new Error("_redirects not found");
  }
  files.push({
    label: "source:_redirects",
    path: source,
    text: readFileSync(source, "utf8"),
  });
  const siteCopy = resolve(root, "_site/_redirects");
  if (existsSync(siteCopy)) {
    files.push({
      label: "artifact:_site/_redirects",
      path: siteCopy,
      text: readFileSync(siteCopy, "utf8"),
    });
  }
  return files;
}

function isIntranetFrom(from) {
  return from === INTRANET_EXACT || from === `${INTRANET_EXACT}/` || from.startsWith("/intranet/");
}

function targetsOpsHost(to) {
  if (!to) return false;
  return to === OPS_HOST || to === `${OPS_HOST}:splat` || to.startsWith(OPS_HOST);
}

function isIntranetLoop(rule) {
  if (rule.from === rule.to) return true;
  const to = (rule.to || "").toLowerCase();
  if (to.includes("/intranet")) return true;
  return /https?:\/\/[^/]*confenge\.com\.br\/intranet(?:\/|$)/i.test(rule.to);
}

export function intranetGatewayFailures(rules, label = "redirects") {
  const failures = [];
  const exact = rules.find((r) => r.from === INTRANET_EXACT || r.from === `${INTRANET_EXACT}/`);
  const splat = rules.find((r) => r.from === INTRANET_SPLAT);
  if (!exact) failures.push(`${label}: missing ${INTRANET_EXACT}`);
  if (!splat) failures.push(`${label}: missing ${INTRANET_SPLAT}`);
  for (const r of rules.filter((rule) => isIntranetFrom(rule.from))) {
    if (r.status === "301") {
      failures.push(`${label}: ${r.from} must not be 301 (${r.raw})`);
    }
    if (r.status === "200") {
      failures.push(`${label}: ${r.from} must not be 200 proxy/rewrite (${r.raw})`);
    }
    if (r.status !== "302") {
      failures.push(`${label}: ${r.from} status must be 302, got ${r.status} (${r.raw})`);
    }
    if (!targetsOpsHost(r.to)) {
      failures.push(`${label}: ${r.from} target must be ${OPS_HOST} (splat allowed), got ${r.to}`);
    }
    if (r.from === r.to) {
      failures.push(`${label}: ${r.from} from === to`);
    }
    if (isIntranetLoop(r)) {
      failures.push(`${label}: ${r.from} loops onto /intranet (${r.raw})`);
    }
  }
  return failures;
}

function ok(failures, name, cond, detail = "") {
  if (cond) console.log("PASS", name);
  else {
    console.error("FAIL", name, detail);
    failures.push(`${name}: ${detail}`);
  }
}

function internalRedirectPath(value, { source = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    let parsed;
    try { parsed = new URL(raw.replace(":splat", "__SPLAT__")); } catch (_) { return null; }
    if (source || !["confenge.com.br", "www.confenge.com.br"].includes(parsed.hostname)) return null;
    const restored = parsed.pathname.replace("__SPLAT__", ":splat");
    return restored.replace(/\/$/, "") || "/";
  }
  if (!raw.startsWith("/")) return null;
  const path = raw.split("#", 1)[0].split("?", 1)[0];
  return path.replace(/\/$/, "") || "/";
}

export function redirectTopologyFailures(rules, label = "redirects") {
  const failures = [];
  const graph = new Map();
  for (const rule of rules) {
    if (!["301", "302", "307", "308"].includes(rule.status)) continue;
    const from = internalRedirectPath(rule.from, { source: true });
    const to = internalRedirectPath(rule.to);
    if (!from || !to) continue;
    if (graph.has(from)) failures.push(`${label}: duplicate redirect source ${from}`);
    graph.set(from, to);
  }
  for (const [from, to] of graph) {
    if (from === to) failures.push(`${label}: redirect loop ${from} -> ${to}`);
    if (graph.has(to) && from !== to) {
      failures.push(`${label}: redirect chain ${from} -> ${to} -> ${graph.get(to)}`);
    }
    const seen = new Set([from]);
    let cursor = to;
    while (graph.has(cursor)) {
      if (seen.has(cursor)) {
        failures.push(`${label}: redirect cycle reaches ${cursor} from ${from}`);
        break;
      }
      seen.add(cursor);
      cursor = graph.get(cursor);
    }
  }
  return [...new Set(failures)];
}

export function abandonedBrandHomeFailures(rules, label = "redirects") {
  const abandoned = new Set([
    "/vision", "/nexgen", "/avcbclcb", "/avcb", "/avcb-clcb", "/clcb",
    "/avaliacoes", "/avaliacoes-imobiliarias", "/avaliacao-imovel",
    "/ia", "/inteligencia-artificial", "/automacao",
  ]);
  return rules
    .filter((rule) => abandoned.has(internalRedirectPath(rule.from, { source: true })))
    .filter((rule) => ["301", "302", "307", "308"].includes(rule.status))
    .filter((rule) => internalRedirectPath(rule.to) === "/")
    .map((rule) => `${label}: abandoned brand blanket-redirects home (${rule.raw || `${rule.from} ${rule.to} ${rule.status}`})`);
}

export async function runRedirectGates({ root = ROOT, base = BASE, log = console } = {}) {
  const failures = [];
  const sources = loadRedirectFiles(root);
  const source = sources[0];
  const rules = parseRules(source.text);
  ok(failures, "redirects_file_nonempty", rules.length >= 5, `count=${rules.length}`);

  const byFrom = Object.fromEntries(rules.map((r) => [r.from, r]));
  ok(
    failures,
    "servicos_redirect_removed",
    !byFrom["/servicos"],
    JSON.stringify(byFrom["/servicos"])
  );
  const corporateServicesPath = resolve(root, "servicos/index.html");
  ok(failures, "servicos_page_exists", existsSync(corporateServicesPath), corporateServicesPath);
  if (existsSync(corporateServicesPath)) {
    const corporateServices = readFileSync(corporateServicesPath, "utf8");
    ok(
      failures,
      "servicos_indexable_after_mv09",
      /content=["']index,follow["'][^>]*name=["']robots["']/i.test(corporateServices),
      "MV-09 must publish the registered corporate services family"
    );
  }
  ok(
    failures,
    "servicos_html_rule",
    byFrom["/servicos.html"]?.to === "/servicos/" || byFrom["/servicos.html"]?.to === "/servicos",
    JSON.stringify(byFrom["/servicos.html"])
  );
  ok(failures, "servicos_html_301", byFrom["/servicos.html"]?.status === "301", byFrom["/servicos.html"]?.status);
  ok(failures, "vision_410", byFrom["/vision"]?.status === "410", JSON.stringify(byFrom["/vision"]));
  ok(failures, "nexgen_410", byFrom["/nexgen"]?.status === "410", JSON.stringify(byFrom["/nexgen"]));
  ok(failures, "avcbclcb_410", byFrom["/avcbclcb"]?.status === "410", JSON.stringify(byFrom["/avcbclcb"]));
  ok(
    failures,
    "trabalhe_conosco_410",
    byFrom["/trabalhe-conosco"]?.status === "410",
    JSON.stringify(byFrom["/trabalhe-conosco"])
  );

  for (const path of ["/vision", "/nexgen", "/avcbclcb", "/avcb", "/ia", "/avaliacoes", "/trabalhe-conosco"]) {
    const r = byFrom[path];
    if (!r) continue;
    ok(
      failures,
      `no_soft404_home:${path}`,
      !(r.status === "301" && (r.to === "/" || r.to === "https://confenge.com.br/" || r.to === "https://confenge.com.br")),
      JSON.stringify(r)
    );
  }

  const homePath = existsSync(resolve(root, "_site/index.html"))
    ? resolve(root, "_site/index.html")
    : resolve(root, "index.html");
  const home = readFileSync(homePath, "utf8");
  const fragmentTargets = new Set();
  for (const r of rules) {
    const m = r.to.match(/#([A-Za-z0-9_-]+)/);
    if (m) fragmentTargets.add(m[1]);
  }
  for (const frag of fragmentTargets) {
    ok(failures, `fragment_exists:#${frag}`, home.includes(`id="${frag}"`), `id=${frag} missing in home`);
  }

  for (const r of rules) {
    if (r.from === r.to) {
      failures.push(`loop_rule: ${r.raw}`);
      log.error("FAIL loop_rule", r.raw);
    }
  }

  for (const failure of redirectTopologyFailures(rules, "source:_redirects")) {
    failures.push(failure);
    log.error("FAIL redirect_topology", failure);
  }
  for (const failure of abandonedBrandHomeFailures(rules, "source:_redirects")) {
    failures.push(failure);
    log.error("FAIL abandoned_brand_home", failure);
  }
  for (const abandoned of ["/nexgen", "/vision"]) {
    const r = byFrom[abandoned];
    ok(
      failures,
      `abandoned_not_301_home:${abandoned}`,
      r?.status === "410",
      JSON.stringify(r)
    );
  }

  for (const src of sources) {
    const parsed = parseRules(src.text);
    const intranetFails = intranetGatewayFailures(parsed, src.label);
    if (intranetFails.length === 0) {
      log.log("PASS", `${src.label}:intranet_gateway`);
    } else {
      for (const f of intranetFails) {
        log.error("FAIL", f);
        failures.push(f);
      }
    }
  }

  const reject301 = intranetGatewayFailures(
    [{ from: "/intranet", to: "https://ops.confenge.com.br/", status: "301", raw: "/intranet https://ops.confenge.com.br/ 301" }],
    "fixture"
  );
  ok(failures, "intranet_matcher_rejects_301", reject301.some((f) => f.includes("301")), reject301.join("|"));
  const reject200 = intranetGatewayFailures(
    [{ from: "/intranet", to: "https://ops.confenge.com.br/", status: "200", raw: "/intranet https://ops.confenge.com.br/ 200" }],
    "fixture"
  );
  ok(
    failures,
    "intranet_matcher_rejects_200",
    reject200.some((f) => f.includes("200")),
    reject200.join("|")
  );
  const rejectLoop = intranetGatewayFailures(
    [{ from: "/intranet", to: "/intranet", status: "302", raw: "/intranet /intranet 302" }],
    "fixture"
  );
  ok(
    failures,
    "intranet_matcher_rejects_loop",
    rejectLoop.some((f) => f.includes("loop") || f.includes("from === to")),
    rejectLoop.join("|")
  );
  const acceptSplat = intranetGatewayFailures(
    [
      { from: "/intranet", to: "https://ops.confenge.com.br/", status: "302", raw: "/intranet https://ops.confenge.com.br/ 302" },
      { from: "/intranet/*", to: "https://ops.confenge.com.br/:splat", status: "302", raw: "/intranet/* https://ops.confenge.com.br/:splat 302" },
    ],
    "fixture"
  );
  ok(failures, "intranet_matcher_accepts_splat_302", acceptSplat.length === 0, acceptSplat.join("|"));

  const chainFixture = redirectTopologyFailures([
    { from: "/old", to: "https://confenge.com.br/middle/", status: "301" },
    { from: "/middle", to: "/final/", status: "301" },
  ], "fixture");
  ok(
    failures,
    "topology_rejects_absolute_internal_chain",
    chainFixture.some((f) => f.includes("redirect chain")),
    chainFixture.join("|")
  );
  const cycleFixture = redirectTopologyFailures([
    { from: "/a", to: "/b", status: "301" },
    { from: "/b", to: "/a", status: "301" },
  ], "fixture");
  ok(
    failures,
    "topology_rejects_cycle",
    cycleFixture.some((f) => f.includes("cycle")),
    cycleFixture.join("|")
  );
  const selfFixture = redirectTopologyFailures([
    { from: "/same", to: "/same/", status: "301" },
  ], "fixture");
  ok(
    failures,
    "topology_rejects_normalized_self_loop",
    selfFixture.some((f) => f.includes("loop")),
    selfFixture.join("|")
  );
  const blanketFixture = abandonedBrandHomeFailures([
    { from: "/nexgen", to: "https://confenge.com.br/", status: "301", raw: "/nexgen https://confenge.com.br/ 301" },
  ], "fixture");
  ok(
    failures,
    "abandoned_brand_matcher_rejects_absolute_home",
    blanketFixture.length === 1,
    blanketFixture.join("|")
  );

  ok(
    failures,
    "no_intranet_html_page",
    !existsSync(resolve(root, "intranet/index.html")) && !existsSync(resolve(root, "intranet.html")),
    "intranet HTML page must not exist"
  );

  // CFG10X-09: lei 25/50 URL consolidates onto the conteudos owner. Force 301,
  // destination is not itself a from-path (no chain), from ≠ to (no loop).
  const limitDonor = "/lei-14133-obras/limite-25-50-aditivo-obra/";
  const limitOwner = "/conteudos/limite-aditivo-25-50-obra-publica/";
  const limitRule = byFrom[limitDonor];
  ok(
    failures,
    "cfg10x09_limit_301",
    limitRule?.to === limitOwner && (limitRule?.status === "301") && limitRule?.force === true,
    JSON.stringify(limitRule)
  );
  ok(failures, "cfg10x09_limit_no_loop", limitDonor !== limitOwner, `${limitDonor} -> ${limitOwner}`);
  ok(
    failures,
    "cfg10x09_limit_no_chain",
    !byFrom[limitOwner],
    `owner is itself a from-path: ${JSON.stringify(byFrom[limitOwner])}`
  );

  const tomlPath = resolve(root, "netlify.toml");
  if (existsSync(tomlPath)) {
    const toml = readFileSync(tomlPath, "utf8");
    const pathRule = /(?:^|\n)\s*(?:from\s*=\s*["']\/intranet|\/intranet\b)/.test(toml);
    ok(failures, "netlify_toml_no_intranet_path", !pathRule, "do not duplicate /intranet in netlify.toml");
  }

  if (!base) {
    log.log("SKIP live probes (no base URL)");
  } else {
    const probes = [
      { path: "/servicos", expectStatus: [200] },
      { path: "/vision", expectStatus: [410] },
      { path: "/nexgen", expectStatus: [410] },
      { path: "/avcbclcb", expectStatus: [410] },
      { path: "/contato", expectStatus: [301, 302, 308], locIncludes: "contato" },
    ];
    for (const p of probes) {
      const res = await fetch(`${base}${p.path}`, { redirect: "manual" });
      const loc = res.headers.get("location") || "";
      ok(
        failures,
        `live_status:${p.path}`,
        p.expectStatus.includes(res.status),
        `status=${res.status} loc=${loc}`
      );
      if (p.locIncludes) {
        ok(failures, `live_loc:${p.path}`, loc.includes(p.locIncludes), `loc=${loc}`);
      }
    }
  }

  if (failures.length) {
    log.error("\nREDIRECT FAILURES:", failures.length);
    for (const f of failures) log.error(" -", f);
    return { ok: false, failures };
  }
  log.log("\nALL redirect gates passed");
  return { ok: true, failures };
}

const isDirect =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  const result = await runRedirectGates();
  if (!result.ok) process.exit(1);
}
