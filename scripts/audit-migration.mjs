#!/usr/bin/env node
/**
 * Audit SEO migration / host canonization / legacy URL handling for CONFENGE.
 *
 * Usage:
 *   node scripts/audit-migration.mjs --base=https://confenge.com.br
 *   node scripts/audit-migration.mjs --base=http://localhost:8888
 *   npm run audit:migration -- --base=https://confenge.com.br
 *
 * Exit 0 only when critical checks pass.
 * Network errors are failures (never masked as success).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TIMEOUT_MS = 15000;
const CANON_HOST = "confenge.com.br";

function parseArgs(argv) {
  const out = { base: "https://confenge.com.br", follow: false, map: null };
  for (const a of argv) {
    if (a.startsWith("--base=")) out.base = a.slice(7).replace(/\/$/, "");
    else if (a === "--follow") out.follow = true;
    else if (a.startsWith("--map=")) out.map = a.slice(6);
  }
  return out;
}

function loadMap(mapPath) {
  const p = mapPath || join(ROOT, "docs/legacy-url-map.csv");
  if (!existsSync(p)) throw new Error(`legacy map not found: ${p}`);
  const text = readFileSync(p, "utf8").trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // simple CSV: no embedded commas in fields of this map
    const cols = lines[i].split(",");
    if (cols.length < 6) continue;
    const row = {};
    header.forEach((h, idx) => {
      row[h.trim()] = (cols[idx] || "").trim();
    });
    // reason may contain commas — rejoin remainder
    if (cols.length > header.length) {
      const reasonIdx = header.indexOf("reason");
      if (reasonIdx >= 0) {
        row.reason = cols.slice(reasonIdx, cols.length - 1).join(",").trim();
        row.validated_after_deploy = cols[cols.length - 1].trim();
      }
    }
    rows.push(row);
  }
  return rows;
}

async function fetchHead(url, { follow = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: follow ? "follow" : "manual",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "CONFENGE-migration-audit/1.0 (+https://confenge.com.br/; technical SEO)",
        Accept: "*/*",
      },
    });
    const location = res.headers.get("location") || "";
    const status = res.status;
    // After redirect:follow, res.url is the final URL (critical for host hops).
    const finalUrl = res.url || url;
    let body = "";
    // only read body for HTML probes when small / needed
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text") || ct.includes("xml") || ct.includes("json") || ct.includes("html")) {
      body = await res.text();
      if (body.length > 500_000) body = body.slice(0, 500_000);
    }
    return { status, location, body, url: finalUrl, ok: true, error: null };
  } catch (err) {
    return {
      status: 0,
      location: "",
      body: "",
      url,
      ok: false,
      error: err?.name === "AbortError" ? "timeout" : String(err?.message || err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function absLocation(base, location) {
  if (!location) return "";
  try {
    return new URL(location, base).href;
  } catch {
    return location;
  }
}

function extractCanonical(html) {
  const m =
    html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  return m ? m[1] : "";
}

function parseSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = args.base;
  const isProd =
    base.includes("confenge.com.br") || base.includes("confenge.netlify.app");
  const isLocal =
    /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/i.test(base) ||
    base.startsWith("http://127.");
  // Redirect rules from netlify.toml are not applied by plain static servers.
  // Test them only on a deployed edge: canonical Netcup or the legacy preview.
  const httpRedirectsAuthoritative = isProd && !isLocal;
  const failures = [];
  const warnings = [];
  const rows = [];

  console.log(`\n=== CONFENGE migration audit ===`);
  console.log(
    `base=${base}  follow=${args.follow}  prodish=${isProd}  httpRedirectsAuthoritative=${httpRedirectsAuthoritative}\n`
  );

  let map;
  try {
    map = loadMap(args.map);
  } catch (e) {
    console.error("CRITICAL: cannot load map:", e.message);
    process.exit(2);
  }

  // --- Config / static artifact checks (always) ---
  const tomlPath = join(ROOT, "netlify.toml");
  const redirectsPath = join(ROOT, "_redirects");
  const robotsPath = join(ROOT, "robots.txt");
  const sitemapPath = join(ROOT, "sitemap.xml");
  const termsPath = join(ROOT, "termos-de-uso/index.html");
  const page404 = join(ROOT, "404.html");

  const toml = existsSync(tomlPath) ? readFileSync(tomlPath, "utf8") : "";
  const redirectsFile = existsSync(redirectsPath)
    ? readFileSync(redirectsPath, "utf8")
    : "";
  const cfgBlob = `${redirectsFile}\n${toml}`;
  const robotsLocal = existsSync(robotsPath) ? readFileSync(robotsPath, "utf8") : "";
  const sitemapLocal = existsSync(sitemapPath) ? readFileSync(sitemapPath, "utf8") : "";

  function check(cond, msg, critical = true) {
    rows.push({ ok: !!cond, msg, critical });
    if (!cond) {
      if (critical) failures.push(msg);
      else warnings.push(msg);
      console.log(`${critical ? "FAIL" : "WARN"} ${msg}`);
    } else {
      console.log(`OK   ${msg}`);
    }
  }

  check(!!toml, "netlify.toml present");
  check(!!redirectsFile, "_redirects present in publish root");
  check(
    /confenge\.netlify\.app\/\*/.test(cfgBlob) &&
      /confenge\.com\.br\/:splat/.test(cfgBlob),
    "host redirect confenge.netlify.app → confenge.com.br/:splat"
  );
  check(
    !/\/\* *\/index\.html *200/.test(cfgBlob) &&
      !/\/\* +\/index\.html +200/.test(cfgBlob),
    "no SPA /* → index.html 200"
  );
  check(
    /\/vision\s+\/404\.html\s+410/.test(redirectsFile),
    "abandoned /vision is 410 in _redirects"
  );
  check(!/\/vision\s+\/\s+301/.test(redirectsFile), "/vision must not 301 to home");
  check(
    /\/terms-and-conditions\s+\/termos-de-uso\//.test(redirectsFile),
    "terms-and-conditions → /termos-de-uso/ (not privacy)"
  );
  check(
    /\/politica-de-privacidade\s+\/privacidade\//.test(redirectsFile),
    "politica-de-privacidade → /privacidade/"
  );
  check(/\/blog\s+\/conteudos\//.test(redirectsFile), "_redirects has /blog → /conteudos/");
  check(
    /\/servicos\s+\/servicos-obras-publicas\//.test(redirectsFile),
    "_redirects has /servicos → /servicos-obras-publicas/"
  );
  check(/\/contato\s+\/#contato/.test(redirectsFile), "_redirects has /contato → /#contato");
  let slashOnly = 0;
  for (const line of redirectsFile.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const parts = s.split(/\s+/);
    if (parts.length >= 3 && /^301/.test(parts[2])) {
      if (
        parts[0].replace(/\/$/, "") === parts[1].replace(/\/$/, "") &&
        parts[0] !== parts[1]
      ) {
        slashOnly++;
      }
    }
  }
  check(slashOnly === 0, `no trailing-slash-only redirects (${slashOnly})`);
  check(existsSync(termsPath), "termos-de-uso/index.html exists");
  check(existsSync(page404), "404.html exists");
  const html404 = existsSync(page404) ? readFileSync(page404, "utf8") : "";
  check(/noindex/i.test(html404), "404.html has noindex");
  check(!/rel=["']canonical["']/i.test(html404), "404.html has no canonical");
  check(/href=["']\/conteudos\/["']/.test(html404), "404.html links to biblioteca");
  check(/href=["']\/#contato["']/.test(html404), "404.html links to contato");
  check(/href=["']\/["']/.test(html404), "404.html links to home");
  check(
    /Sitemap:\s*https:\/\/confenge\.com\.br\/sitemap-index\.xml/i.test(robotsLocal),
    "robots.txt Sitemap canonical"
  );
  check(!/netlify\.app/i.test(robotsLocal), "robots.txt has no netlify.app");
  check(!/hostinger/i.test(robotsLocal), "robots.txt has no hostinger");

  const smUrls = parseSitemapUrls(sitemapLocal);
  check(smUrls.length > 0, `sitemap has URLs (${smUrls.length})`);
  const badSm = smUrls.filter(
    (u) =>
      !u.startsWith("https://confenge.com.br/") ||
      u.includes("www.") ||
      u.includes("netlify.app") ||
      u.includes("http://")
  );
  check(badSm.length === 0, `sitemap only apex HTTPS (${badSm.length} bad)`);
  const dup = smUrls.filter((u, i) => smUrls.indexOf(u) !== i);
  check(dup.length === 0, `sitemap no duplicates (${dup.length})`);
  check(
    smUrls.includes("https://confenge.com.br/termos-de-uso/"),
    "sitemap includes /termos-de-uso/"
  );
  check(
    !smUrls.some((u) => {
      const path = new URL(u).pathname.replace(/\/$/, "") || "/";
      return new Set(["/vision", "/nexgen", "/avcbclcb", "/blog", "/servicos", "/404"]).has(path);
    }),
    "sitemap excludes legacy/error paths"
  );

  // Public HTML identity / internal legacy links
  const brandBad = [
    "Avaliações e Projetos",
    "Vision Consultoria",
    "NexGen CFG",
    "Modela Pro",
    "confenge@confenge.com.br",
    "parceiro@confenge.com.br",
    "Avenida Prefeito Osmar Cunha",
  ];
  const publicHtml = [];
  function walk(dir) {
    // lightweight: only top-level and known dirs
  }
  const candidates = [
    "index.html",
    "404.html",
    "obrigado.html",
    "privacidade/index.html",
    "termos-de-uso/index.html",
    "conteudos/index.html",
  ];
  for (const rel of candidates) {
    const p = join(ROOT, rel);
    if (existsSync(p)) publicHtml.push({ rel, t: readFileSync(p, "utf8") });
  }
  for (const { rel, t } of publicHtml) {
    for (const term of brandBad) {
      if (t.includes(term)) failures.push(`old brand in ${rel}: ${term}`);
    }
    // canonical host
    const can = extractCanonical(t);
    if (can && (can.includes("netlify.app") || can.includes("www.") || can.startsWith("http://"))) {
      check(false, `bad canonical ${rel} → ${can}`);
    }
    if (rel !== "404.html" && rel !== "obrigado.html" && !can) {
      check(false, `missing canonical ${rel}`);
    }
  }

  // Internal hrefs to legacy paths in public samples
  const legacyPaths = map
    .map((r) => r.old_url)
    .filter((u) => u.startsWith("/") && !u.includes("*") && !u.includes("desconhecido"));
  for (const { rel, t } of publicHtml) {
    for (const leg of legacyPaths) {
      if (["/privacidade/", "/privacidade", "/termos-de-uso/", "/termos-de-uso"].includes(leg))
        continue;
      const re = new RegExp(
        `href=["']${leg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
      );
      if (re.test(t)) check(false, `internal legacy link ${rel} → ${leg}`);
    }
  }

  // --- HTTP checks ---
  console.log("\n--- HTTP probes ---\n");

  const pathChecks = [
    { path: "/", wantStatus: [200], name: "home" },
    { path: "/robots.txt", wantStatus: [200], name: "robots" },
    { path: "/sitemap.xml", wantStatus: [200], name: "sitemap" },
    { path: "/conteudos/", wantStatus: [200], name: "biblioteca" },
    { path: "/privacidade/", wantStatus: [200], name: "privacidade" },
    { path: "/termos-de-uso/", wantStatus: [200], name: "termos" },
    { path: "/blog", wantStatus: [301, 308], locIncludes: "/conteudos", name: "blog→conteudos" },
    {
      path: "/servicos",
      wantStatus: [301, 308],
      locIncludes: "servicos-obras-publicas",
      name: "servicos→servicos-obras-publicas",
    },
    {
      path: "/contato",
      wantStatus: [301, 308],
      locIncludes: "contato",
      name: "contato→#contato",
    },
    {
      path: "/privacy-policy",
      wantStatus: [301, 308],
      locIncludes: "privacidade",
      name: "privacy-policy",
    },
    {
      path: "/politica-de-privacidade",
      wantStatus: [301, 308],
      locIncludes: "privacidade",
      name: "politica-de-privacidade",
    },
    {
      path: "/terms-and-conditions",
      wantStatus: [301, 308],
      locIncludes: "termos-de-uso",
      name: "terms→termos",
    },
    {
      path: "/trabalhe-conosco",
      wantStatus: [404, 410],
      forbidLocHome: true,
      name: "trabalhe-conosco gone",
    },
    {
      path: "/vision",
      wantStatus: [404, 410],
      forbidLocHome: true,
      name: "vision gone",
    },
    {
      path: "/nexgen",
      wantStatus: [404, 410],
      forbidLocHome: true,
      name: "nexgen gone",
    },
    {
      path: "/avcbclcb",
      wantStatus: [404, 410],
      forbidLocHome: true,
      name: "avcbclcb gone",
    },
    {
      path: "/this-migration-audit-missing-page-xyz",
      wantStatus: [404],
      name: "unknown 404",
    },
  ];

  const table = [];

  for (const c of pathChecks) {
    const url = base + c.path;
    const res = await fetchHead(url, { follow: false });
    if (!res.ok) {
      check(false, `${c.name}: network error ${res.error} (${url})`);
      table.push({ path: c.path, status: "ERR", location: res.error, result: "FAIL" });
      continue;
    }
    const loc = res.location || "";
    const abs = absLocation(url, loc);
    let pass = c.wantStatus.includes(res.status);
    if (pass && c.locIncludes) {
      pass = loc.toLowerCase().includes(c.locIncludes.toLowerCase());
    }
    if (pass && c.forbidLocHome) {
      // must not soft-404: 301/302 to /
      if ([301, 302, 307, 308].includes(res.status)) {
        const pathOnly = (() => {
          try {
            return new URL(abs || loc, base).pathname;
          } catch {
            return loc;
          }
        })();
        if (pathOnly === "/" || loc === "/" || loc.endsWith("confenge.com.br/")) {
          pass = false;
        }
      }
    }

    // On plain static preview, Netlify rules are not applied: treat redirect/410
    // probes as non-critical if static config already encodes the decision.
    const needsEdge =
      c.wantStatus.some((s) => [301, 308, 410].includes(s)) || c.forbidLocHome;
    const criticalHttp = !needsEdge || httpRedirectsAuthoritative;
    if (!pass && needsEdge && !httpRedirectsAuthoritative) {
      const pathKey = c.path.replace(/\/$/, "") || c.path;
      const inCfg =
        redirectsFile.includes(pathKey) ||
        toml.includes(`from = "${c.path}"`) ||
        toml.includes(`from = "${pathKey}"`);
      check(
        inCfg,
        `${c.name}: local static ${res.status} (Netlify edge not applied); config has rule=${inCfg}`,
        true
      );
      table.push({
        path: c.path,
        status: res.status,
        location: loc || "(local; edge N/A)",
        result: inCfg ? "CONFIG" : "FAIL",
      });
      continue;
    }

    check(
      pass,
      `${c.name}: ${res.status} loc=${loc || "-"} (want ${c.wantStatus.join("|")})`,
      criticalHttp
    );
    table.push({
      path: c.path,
      status: res.status,
      location: loc || "-",
      result: pass ? "OK" : "FAIL",
    });

    // destination check for redirects — one hop, only when edge is authoritative
    if (
      pass &&
      httpRedirectsAuthoritative &&
      [301, 308].includes(res.status) &&
      loc
    ) {
      const destUrl = absLocation(base + c.path, loc).split("#")[0];
      const dest = await fetchHead(destUrl, { follow: false });
      if (!dest.ok) {
        check(false, `dest of ${c.path}: network ${dest.error}`, true);
      } else if ([301, 302, 307, 308].includes(dest.status)) {
        check(
          false,
          `redirect chain ${c.path} → ${loc} → ${dest.status} ${dest.location}`,
          true
        );
      } else if (dest.status !== 200 && !loc.includes("#")) {
        check(false, `dest of ${c.path} not 200: ${dest.status} ${destUrl}`, true);
      }
    }
  }

  // Canonical sample on live home / termos
  for (const p of ["/", "/termos-de-uso/", "/privacidade/"]) {
    const res = await fetchHead(base + p, { follow: true });
    if (!res.ok) {
      check(false, `canonical probe ${p}: ${res.error}`);
      continue;
    }
    if (res.status !== 200) {
      check(false, `canonical probe ${p}: status ${res.status}`);
      continue;
    }
    const can = extractCanonical(res.body);
    const expect = `https://${CANON_HOST}${p === "/" ? "/" : p}`;
    // local preview may rewrite hosts — only enforce apex on production base
    if (isProd && base.includes(CANON_HOST)) {
      check(can === expect || can === expect.replace(/\/$/, ""), `live canonical ${p} → ${can}`);
    } else {
      check(!!can || !isProd, `live has canonical or non-prod ${p}: ${can || "(none)"}`, false);
    }
  }

  // Host matrix (only meaningful when base is production apex)
  if (base === "https://confenge.com.br" || base === "https://www.confenge.com.br") {
    console.log("\n--- Host canonization ---\n");
    const hosts = [
      {
        url: "https://confenge.com.br/",
        want: [200],
        finalHost: "confenge.com.br",
      },
      {
        url: "https://www.confenge.com.br/",
        want: [301, 308],
        locHost: "confenge.com.br",
      },
      {
        url: "https://confenge.netlify.app/",
        want: [301, 308],
        locHost: "confenge.com.br",
      },
      {
        url: "https://confenge.netlify.app/conteudos/",
        want: [301, 308],
        locIncludes: "confenge.com.br/conteudos",
      },
      {
        url: "http://confenge.com.br/",
        want: [301, 308],
        locIncludes: "https://",
      },
    ];
    for (const h of hosts) {
      const res = await fetchHead(h.url, { follow: false });
      if (!res.ok) {
        check(false, `host ${h.url}: ${res.error}`);
        continue;
      }
      let pass = h.want.includes(res.status);
      const loc = res.location || "";
      if (pass && h.locHost) pass = loc.includes(h.locHost);
      if (pass && h.locIncludes) pass = loc.includes(h.locIncludes);
      check(pass, `host ${h.url} → ${res.status} ${loc || "(no loc)"}`);
    }

    // netlify.app deep path should land on apex 200 after follow
    const deep = await fetchHead("https://confenge.netlify.app/conteudos/", {
      follow: true,
    });
    if (!deep.ok) check(false, `netlify follow deep: ${deep.error}`);
    else {
      check(
        deep.status === 200 && deep.url.includes("confenge.com.br"),
        `netlify.app/conteudos/ follows to apex 200 (${deep.status} ${deep.url})`,
        // if redirect not yet deployed, critical
        true
      );
    }
  } else {
    warnings.push(
      "Host matrix (www / netlify.app) skipped — base is not production apex"
    );
    console.log(
      "WARN Host matrix skipped (set --base=https://confenge.com.br for full host checks)"
    );
  }

  // Live robots + sitemap content when probing production-like
  const robotsLive = await fetchHead(base + "/robots.txt", { follow: true });
  if (robotsLive.ok && robotsLive.status === 200) {
    check(
      /Sitemap:\s*https:\/\/confenge\.com\.br\/sitemap-index\.xml/i.test(robotsLive.body),
      "live robots Sitemap line"
    );
  }

  const smLive = await fetchHead(base + "/sitemap.xml", { follow: true });
  if (smLive.ok && smLive.status === 200) {
    const urls = parseSitemapUrls(smLive.body);
    check(urls.length > 0, `live sitemap URLs=${urls.length}`);
    const bad = urls.filter((u) => !u.startsWith(`https://${CANON_HOST}/`));
    check(bad.length === 0, `live sitemap apex-only bad=${bad.length}`);
  }

  // Table
  console.log("\n--- Results table ---\n");
  console.log(
    `${pad("PATH", 40)} ${pad("STATUS", 8)} ${pad("LOCATION", 40)} ${pad("RESULT", 6)}`
  );
  for (const r of table) {
    console.log(
      `${pad(r.path, 40)} ${pad(r.status, 8)} ${pad(r.location, 40)} ${pad(r.result, 6)}`
    );
  }

  console.log(
    `\nSummary: OK=${rows.filter((r) => r.ok).length} FAIL=${failures.length} WARN=${warnings.length}`
  );
  if (failures.length) {
    console.log("\nCritical failures:");
    for (const f of failures) console.log(" -", f);
    process.exit(1);
  }
  console.log("\nAUDIT_OK");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
