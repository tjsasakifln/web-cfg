/**
 * Single runtime-authority gate.
 * Parses docs/architecture/RUNTIME-AUTHORITY.md and compares DNS, architecture
 * header, build SHA, authority record and expected environment.
 *
 * Compare logic has no DNS/HTTP I/O. Live observation is opt-in and read-only.
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const AUTHORITY_PATH = join(ROOT, "docs/architecture/RUNTIME-AUTHORITY.md");
export const FIXTURE_DIR = join(ROOT, "scripts/site/fixtures/runtime-authority");

export const CURRENT_OPERATOR_DOCS = Object.freeze([
  "docs/architecture/RUNTIME-AUTHORITY.md",
  "docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md",
  "deploy/netcup/README.md",
  "runtime/README.md",
  "docs/ops/ROLLBACK.md",
  "docs/ops/ENV-VARS.md",
  "docs/ops/LEAD-HANDLING.md",
  "docs/ops/HOST-OWNED-STORAGE.md",
  "docs/ops/HOST-OWNED-STORAGE-RUNBOOK.md",
  "docs/ops/EXTERNAL-ACTIONS.md",
  "docs/ops/SLO-MONITORING.md",
  "DEPLOY-CHECKLIST.txt",
  "docs/migration/smartlic-confenge/ROLLBACK.md",
  "docs/migrations/smartlic/RUNBOOK.md",
  "docs/migrations/smartlic/HANDOFF-2115.md",
]);

export const FORBIDDEN_PRODUCTION_PHRASES = Object.freeze([
  "PROD_TRAFFIC_UNCHANGED",
  "Netlify remains the current public authority",
  "Netlify is still the public authority",
  "Netlify is still production",
  "Rollback de produção (Netlify)",
  "publish previous known-good Netlify deploy",
  "Publique este diretório na Netlify",
  "Netlify UI → Site → Deploys",
  "Configurar no Netlify → Site configuration",
  "restore previous production deploy in Netlify UI",
]);

const YAML_FENCE = /```yaml\n([\s\S]*?)\n```/;

export function parseScalar(raw) {
  const value = String(raw).trim();
  if (value === "" || value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "[]") return [];
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseScalar(item));
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) return line.slice(0, i).trimEnd();
  }
  return line;
}

export function parseSimpleYaml(text) {
  const source = String(text).replaceAll("\r\n", "\n");
  const rawLines = source.split("\n");
  const items = [];
  for (const raw of rawLines) {
    const stripped = stripComment(raw);
    if (!stripped.trim()) continue;
    const indent = stripped.match(/^ */)[0].length;
    const content = stripped.slice(indent);
    items.push({ indent, content });
  }

  function parseBlock(index, indent) {
    if (index >= items.length) return [{}, index];
    const first = items[index];
    if (first.content.startsWith("- ")) {
      const list = [];
      let i = index;
      while (i < items.length && items[i].indent === indent && items[i].content.startsWith("- ")) {
        const rest = items[i].content.slice(2).trim();
        if (!rest) {
          const [child, next] = parseBlock(i + 1, indent + 2);
          list.push(child);
          i = next;
        } else if (rest.includes(": ") || rest.endsWith(":")) {
          const fake = [{ indent: indent + 2, content: rest }];
          const saved = items.splice(i + 1, 0, ...fake);
          const [child, next] = parseBlock(i + 1, indent + 2);
          items.splice(i + 1, fake.length);
          list.push(child);
          i = next - fake.length;
        } else {
          list.push(parseScalar(rest));
          i += 1;
        }
      }
      return [list, i];
    }

    const map = {};
    let i = index;
    while (i < items.length && items[i].indent === indent && !items[i].content.startsWith("- ")) {
      const line = items[i].content;
      const colon = line.indexOf(":");
      if (colon < 0) throw new Error(`yaml_line_missing_colon:${line}`);
      const key = line.slice(0, colon).trim();
      const remainder = line.slice(colon + 1).trim();
      if (remainder) {
        map[key] = parseScalar(remainder);
        i += 1;
      } else if (i + 1 < items.length && items[i + 1].indent > indent) {
        const [child, next] = parseBlock(i + 1, items[i + 1].indent);
        map[key] = child;
        i = next;
      } else {
        map[key] = null;
        i += 1;
      }
    }
    return [map, i];
  }

  const [doc] = parseBlock(0, items[0] ? items[0].indent : 0);
  return doc;
}

export function parseAuthorityMarkdown(markdown) {
  const match = String(markdown).match(YAML_FENCE);
  if (!match) throw new Error("authority_yaml_block_missing");
  const record = parseSimpleYaml(match[1]);
  if (!record || typeof record !== "object") throw new Error("authority_yaml_invalid");
  return record;
}

export function loadAuthorityFromRepo(root = ROOT) {
  const markdown = readFileSync(join(root, "docs/architecture/RUNTIME-AUTHORITY.md"), "utf8");
  return parseAuthorityMarkdown(markdown);
}

function asList(value) {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => String(item).replace(/\.$/, "").toLowerCase()).sort();
}

function normalizeCname(value) {
  if (value == null || value === "") return "";
  return String(value).trim().replace(/\.$/, "").toLowerCase();
}

function sameSet(left, right) {
  const a = asList(left);
  const b = asList(right);
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

function fail(failures, code, detail) {
  failures.push({ code, detail });
}

export function observationFromAuthority(authority) {
  const prod = authority.public_canonical || {};
  const dns = prod.dns || {};
  return {
    dns: {
      apex_a: [...(dns.apex_a || [])],
      www_cname: dns.www_cname || "",
      nameservers: [...(dns.nameservers || [])],
    },
    http: {
      server: prod.expected_server_header || "",
      architecture_header: prod.host_architecture_version || "",
      environment: prod.expected_environment || "",
      profile: prod.expected_profile || "",
      commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  };
}

export function applyObservationMutations(observed, mutations) {
  const clone = structuredClone(observed);
  for (const [path, value] of Object.entries(mutations || {})) {
    const parts = path.split(".");
    let cursor = clone;
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return clone;
}

export function compareRuntimeAuthority({ authority, observed, expected = {} }) {
  const failures = [];
  if (!authority || typeof authority !== "object") {
    fail(failures, "authority_missing", "authority record is required");
    return { ok: false, failures };
  }
  const prod = authority.public_canonical || {};
  const stage = authority.stage || {};
  const legacy = authority.legacy || {};
  const dns = prod.dns || {};
  const obs = observed || {};
  const obsDns = obs.dns || {};
  const obsHttp = obs.http || {};

  if (prod.plane !== "production") {
    fail(failures, "production_plane_missing", `public_canonical.plane=${prod.plane}`);
  }
  if (stage.plane !== "stage") {
    fail(failures, "stage_plane_missing", `stage.plane=${stage.plane}`);
  }
  if (legacy.plane !== "legacy" || legacy.public_canonical !== false) {
    fail(failures, "legacy_plane_missing", "legacy must be named and not canonical");
  }
  if (prod.host_kind !== "nginx-netcup") {
    fail(failures, "host_kind_mismatch", `host_kind=${prod.host_kind}`);
  }
  if (/^netlify$/i.test(String(prod.host || "").trim()) || prod.host_kind === "netlify") {
    fail(failures, "netlify_named_as_production_host", String(prod.host));
  }
  if (!sameSet(obsDns.apex_a, dns.apex_a)) {
    fail(
      failures,
      "dns_apex_mismatch",
      `observed=${JSON.stringify(obsDns.apex_a)} expected=${JSON.stringify(dns.apex_a)}`,
    );
  }
  if (normalizeCname(obsDns.www_cname) !== normalizeCname(dns.www_cname)) {
    fail(
      failures,
      "dns_www_mismatch",
      `observed=${obsDns.www_cname} expected=${dns.www_cname}`,
    );
  }
  if (String(obsHttp.server || "").toLowerCase() !== String(prod.expected_server_header || "").toLowerCase()) {
    fail(
      failures,
      "server_header_mismatch",
      `observed=${obsHttp.server} expected=${prod.expected_server_header}`,
    );
  }
  if (obsHttp.architecture_header !== prod.host_architecture_version) {
    fail(
      failures,
      "architecture_header_mismatch",
      `observed=${obsHttp.architecture_header} expected=${prod.host_architecture_version}`,
    );
  }
  const expectedEnvironment = expected.environment || prod.expected_environment;
  if (expectedEnvironment && obsHttp.environment !== expectedEnvironment) {
    fail(
      failures,
      "environment_mismatch",
      `observed=${obsHttp.environment} expected=${expectedEnvironment}`,
    );
  }
  if (expected.sha) {
    if (obsHttp.commit !== expected.sha) {
      fail(failures, "build_sha_mismatch", `observed=${obsHttp.commit} expected=${expected.sha}`);
    }
  }
  return {
    ok: failures.length === 0,
    failures,
    plane: prod.plane,
    host_kind: prod.host_kind,
    host_architecture_version: prod.host_architecture_version,
    expected_environment: expectedEnvironment,
  };
}

export function scanOperatorDocs({ root = ROOT, files = CURRENT_OPERATOR_DOCS } = {}) {
  const hits = [];
  for (const rel of files) {
    const path = join(root, rel);
    const text = readFileSync(path, "utf8");
    if (/^\s*host:\s*Netlify\s*$/m.test(text)) {
      hits.push({ file: rel, rule: "yaml_host_netlify", detail: "host: Netlify" });
    }
    for (const phrase of FORBIDDEN_PRODUCTION_PHRASES) {
      if (text.includes(phrase)) hits.push({ file: rel, rule: "forbidden_phrase", detail: phrase });
    }
  }
  return { ok: hits.length === 0, hits };
}

export function loadFixture(name, { root = ROOT, authority } = {}) {
  const record = authority || loadAuthorityFromRepo(root);
  const path = join(root, "scripts/site/fixtures/runtime-authority", `${name}.json`);
  const fixture = JSON.parse(readFileSync(path, "utf8"));
  let observed = fixture.observed;
  if (fixture.mode === "from-authority") {
    observed = applyObservationMutations(observationFromAuthority(record), fixture.mutate || {});
  }
  return {
    name,
    authority: record,
    observed,
    expected: fixture.expected || {
      sha: observed.http.commit,
      environment: record.public_canonical.expected_environment,
    },
  };
}

export function listFixtureNames(root = ROOT) {
  return readdirSync(join(root, "scripts/site/fixtures/runtime-authority"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();
}

function header(headers, name) {
  const want = name.toLowerCase();
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === want) return value;
  }
  return null;
}

async function doh(name, type) {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
  if (!res.ok) throw new Error(`doh_http_${res.status}:${name}:${type}`);
  const body = await res.json();
  const answers = body.Answer || [];
  return answers.filter((row) => row.type === (type === "A" ? 1 : type === "CNAME" ? 5 : type === "NS" ? 2 : row.type)).map((row) => row.data);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, headers: res.headers };
}

export async function observeLive({ origin = "https://confenge.com.br" } = {}) {
  const apex = new URL(origin).hostname;
  const www = apex.startsWith("www.") ? apex : `www.${apex}`;
  const home = await fetch(origin.endsWith("/") ? origin : `${origin}/`, {
    redirect: "manual",
    headers: { "User-Agent": "confenge-runtime-authority-gate" },
  });
  const build = await fetchJson(`${origin.replace(/\/$/, "")}/.well-known/build-info.json`);
  const runtime = await fetchJson(`${origin.replace(/\/$/, "")}/.well-known/runtime-info.json`);
  const [apexA, wwwCname, nameservers] = await Promise.all([
    doh(apex, "A"),
    doh(www, "CNAME"),
    doh(apex, "NS"),
  ]);
  return {
    dns: {
      apex_a: apexA,
      www_cname: wwwCname[0] || "",
      nameservers,
    },
    http: {
      server: header(home.headers, "server"),
      architecture_header: header(home.headers, "x-confenge-host-architecture-version"),
      environment: (build.json && build.json.environment) || (runtime.json && runtime.json.environment) || "",
      profile: (runtime.json && runtime.json.profile) || "",
      commit: (build.json && build.json.commit) || (runtime.json && runtime.json.release_sha) || "",
      home_status: home.status,
    },
    live: {
      build_info: build.json,
      runtime_info: runtime.json,
    },
  };
}

export function expectedShaFromGit(root = ROOT) {
  if (process.env.EXPECTED_SHA) return process.env.EXPECTED_SHA.trim();
  try {
    return execSync("git rev-parse origin/main", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return execSync("git rev-parse main", { cwd: root, encoding: "utf8" }).trim();
  }
}

export async function runCompare(argv = process.argv.slice(2)) {
  const args = { fixture: null, live: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--fixture") args.fixture = argv[++i];
    else if (arg === "--live") args.live = true;
    else if (arg === "--help" || arg === "-h") {
      return {
        ok: true,
        usage: "node scripts/site/runtime_authority.mjs --fixture matching|divergent-host|divergent-dns|divergent-header | --live",
      };
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }
  const authority = loadAuthorityFromRepo();
  const docs = scanOperatorDocs();
  if (args.live) {
    const observed = await observeLive();
    const compared = compareRuntimeAuthority({
      authority,
      observed,
      expected: { sha: expectedShaFromGit(), environment: authority.public_canonical.expected_environment },
    });
    return { mode: "live", docs, ...compared, observed };
  }
  const name = args.fixture || "matching";
  const loaded = loadFixture(name, { authority });
  const compared = compareRuntimeAuthority(loaded);
  if (name === "matching" && !docs.ok) {
    compared.ok = false;
    compared.failures = [
      ...(compared.failures || []),
      ...docs.hits.map((hit) => ({ code: hit.rule, detail: `${hit.file}:${hit.detail}` })),
    ];
  }
  return { mode: "fixture", fixture: name, docs, ...compared };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runCompare()
    .then((result) => {
      const payload = { ...result };
      if (payload.docs && !payload.docs.ok && payload.mode === "live") {
        payload.ok = false;
        payload.failures = [...(payload.failures || []), ...payload.docs.hits.map((hit) => ({ code: hit.rule, detail: `${hit.file}:${hit.detail}` }))];
      }
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      process.exit(payload.ok ? 0 : 1);
    })
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ ok: false, error: String(error.message || error) })}\n`);
      process.exit(1);
    });
}
