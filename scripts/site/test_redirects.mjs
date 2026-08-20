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

export async function runRedirectGates({ root = ROOT, base = BASE, log = console } = {}) {
  const failures = [];
  const sources = loadRedirectFiles(root);
  const source = sources[0];
  const rules = parseRules(source.text);
  ok(failures, "redirects_file_nonempty", rules.length >= 5, `count=${rules.length}`);

  const byFrom = Object.fromEntries(rules.map((r) => [r.from, r]));
  ok(failures, "servicos_rule", byFrom["/servicos"]?.to?.includes("como-atuamos"), JSON.stringify(byFrom["/servicos"]));
  ok(failures, "servicos_301", byFrom["/servicos"]?.status === "301", byFrom["/servicos"]?.status);
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

  ok(
    failures,
    "no_intranet_html_page",
    !existsSync(resolve(root, "intranet/index.html")) && !existsSync(resolve(root, "intranet.html")),
    "intranet HTML page must not exist"
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
      { path: "/servicos", expectStatus: [301, 302, 308], locIncludes: "como-atuamos" },
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
