/**
 * Redirect / 410 / fragment integrity gates (local _site expectations + optional live base).
 * Usage:
 *   node scripts/site/test_redirects.mjs
 *   node scripts/site/test_redirects.mjs https://confenge.com.br
 *
 * Default: validates _redirects source rules and that target fragments exist in source/home HTML.
 * With a base URL: also probes HTTP status/Location against that host.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.argv[2] || process.env.BASE_URL || "").replace(/\/$/, "");
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) console.log("PASS", name);
  else {
    console.error("FAIL", name, detail);
    failures.push(`${name}: ${detail}`);
  }
}

function loadRedirects() {
  for (const p of ["_site/_redirects", "_redirects"]) {
    const full = resolve(ROOT, p);
    if (existsSync(full)) return readFileSync(full, "utf8");
  }
  throw new Error("_redirects not found");
}

function parseRules(text) {
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
    rules.push({ from, to, status, raw: t });
  }
  return rules;
}

const text = loadRedirects();
const rules = parseRules(text);
ok("redirects_file_nonempty", rules.length >= 5, `count=${rules.length}`);

// Required dispositions
const byFrom = Object.fromEntries(rules.map((r) => [r.from, r]));
ok("servicos_rule", byFrom["/servicos"]?.to?.includes("como-atuamos"), JSON.stringify(byFrom["/servicos"]));
ok("servicos_301", byFrom["/servicos"]?.status === "301", byFrom["/servicos"]?.status);
ok("vision_410", byFrom["/vision"]?.status === "410", JSON.stringify(byFrom["/vision"]));
ok("nexgen_410", byFrom["/nexgen"]?.status === "410", JSON.stringify(byFrom["/nexgen"]));
ok("avcbclcb_410", byFrom["/avcbclcb"]?.status === "410", JSON.stringify(byFrom["/avcbclcb"]));

// No soft-404 of abandoned products to bare home
for (const path of ["/vision", "/nexgen", "/avcbclcb", "/avcb", "/ia", "/avaliacoes"]) {
  const r = byFrom[path];
  if (!r) continue;
  ok(
    `no_soft404_home:${path}`,
    !(r.status === "301" && (r.to === "/" || r.to === "https://confenge.com.br/" || r.to === "https://confenge.com.br")),
    JSON.stringify(r)
  );
}

// Fragment targets must exist on home
const homePath = existsSync(resolve(ROOT, "_site/index.html"))
  ? resolve(ROOT, "_site/index.html")
  : resolve(ROOT, "index.html");
const home = readFileSync(homePath, "utf8");
const fragmentTargets = new Set();
for (const r of rules) {
  const m = r.to.match(/#([A-Za-z0-9_-]+)/);
  if (m) fragmentTargets.add(m[1]);
}
for (const frag of fragmentTargets) {
  ok(`fragment_exists:#${frag}`, home.includes(`id="${frag}"`), `id=${frag} missing in home`);
}

// No multi-hop loops in simple self-maps
for (const r of rules) {
  if (r.from === r.to) {
    failures.push(`loop_rule: ${r.raw}`);
    console.error("FAIL loop_rule", r.raw);
  }
}

async function probeLive() {
  if (!BASE) {
    console.log("SKIP live probes (no base URL)");
    return;
  }
  const probes = [
    { path: "/servicos", expectStatus: [301, 302, 308], locIncludes: "como-atuamos" },
    { path: "/vision", expectStatus: [410] },
    { path: "/nexgen", expectStatus: [410] },
    { path: "/avcbclcb", expectStatus: [410] },
    { path: "/contato", expectStatus: [301, 302, 308], locIncludes: "contato" },
  ];
  for (const p of probes) {
    const res = await fetch(`${BASE}${p.path}`, { redirect: "manual" });
    const loc = res.headers.get("location") || "";
    ok(
      `live_status:${p.path}`,
      p.expectStatus.includes(res.status),
      `status=${res.status} loc=${loc}`
    );
    if (p.locIncludes) {
      ok(`live_loc:${p.path}`, loc.includes(p.locIncludes), `loc=${loc}`);
    }
  }
}

await probeLive();

if (failures.length) {
  console.error("\nREDIRECT FAILURES:", failures.length);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("\nALL redirect gates passed");
