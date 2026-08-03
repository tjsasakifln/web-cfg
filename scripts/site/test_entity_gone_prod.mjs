/**
 * Production entity cleanup gates.
 * Fails if abandoned product URLs return 200 or soft-redirect to home.
 *
 *   node scripts/site/test_entity_gone_prod.mjs
 *   node scripts/site/test_entity_gone_prod.mjs https://confenge.com.br
 */
const BASE = (process.argv[2] || process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");

/** Abandoned products / old entity — must be 410 (not 200, not 301→home). */
const GONE_410 = [
  "/vision",
  "/nexgen",
  "/avcbclcb",
  "/avcb",
  "/avcb-clcb",
  "/clcb",
  "/avaliacoes",
  "/avaliacoes-imobiliarias",
  "/avaliacao-imovel",
  "/ia",
  "/inteligencia-artificial",
  "/automacao",
];

/** Legacy with semantic substitute — single hop 301, never to bare home unless fragment offer. */
const REDIRECT_OK = [
  { from: "/blog", allow: ["/conteudos"] },
  { from: "/servicos", allow: ["#como-atuamos", "/#como-atuamos"] },
  { from: "/contato", allow: ["#contato", "/#contato"] },
  { from: "/privacy-policy", allow: ["/privacidade"] },
];

const failures = [];
function ok(name, cond, detail = "") {
  if (cond) console.log("PASS", name);
  else {
    console.error("FAIL", name, detail);
    failures.push(`${name}: ${detail}`);
  }
}

async function probe(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  const loc = res.headers.get("location") || res.headers.get("Location") || "";
  return { status: res.status, location: loc };
}

function isHome(loc) {
  if (!loc) return false;
  try {
    const u = new URL(loc, BASE);
    return (u.pathname === "/" || u.pathname === "") && !u.hash;
  } catch {
    return loc === "/" || loc === BASE || loc === BASE + "/";
  }
}

async function main() {
  console.log({ base: BASE });
  for (const path of GONE_410) {
    const r = await probe(path);
    ok(
      `gone_410:${path}`,
      r.status === 410,
      `status=${r.status} location=${r.location}`
    );
    ok(
      `gone_not_home:${path}`,
      !(r.status >= 300 && r.status < 400 && isHome(r.location)),
      `status=${r.status} location=${r.location}`
    );
    ok(
      `gone_not_200:${path}`,
      r.status !== 200,
      `status=${r.status}`
    );
  }

  for (const rule of REDIRECT_OK) {
    const r = await probe(rule.from);
    ok(`redirect_3xx:${rule.from}`, r.status === 301 || r.status === 302, `status=${r.status}`);
    const loc = r.location || "";
    const allowed = rule.allow.some((a) => loc.includes(a));
    ok(`redirect_target:${rule.from}`, allowed, `location=${loc}`);
    ok(`redirect_not_bare_home:${rule.from}`, !isHome(loc) || rule.allow.some((a) => a.includes("#")), `location=${loc}`);
  }

  // robots should list single sitemap index (not five)
  const robots = await fetch(`${BASE}/robots.txt`).then((r) => r.text());
  const sitemapLines = robots.split("\n").filter((l) => /^sitemap:/i.test(l.trim()));
  ok(
    "robots_single_sitemap_index",
    sitemapLines.length === 1 && sitemapLines[0].includes("sitemap-index.xml"),
    sitemapLines.join(" | ")
  );
  ok("robots_disallow_ops", /disallow:\s*\/ops\//i.test(robots), robots.slice(0, 200));

  // hub must not claim 120
  const hub = await fetch(`${BASE}/conteudos/`).then((r) => r.text());
  ok("hub_no_120_guias", !/120\s*guias/i.test(hub), "found 120 guias");
  ok("hub_has_22_or_numberOfItems_22", /numberOfItems"\s*:\s*22|22\s*guias/i.test(hub));

  if (failures.length) {
    console.error("\nENTITY CLEANUP FAILURES:", failures.length);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }
  console.log("\nALL entity-gone production checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
