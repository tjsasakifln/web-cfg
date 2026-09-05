/**
 * Single runtime-authority gate.
 * Parses docs/architecture/RUNTIME-AUTHORITY.md and compares DNS, architecture
 * header, build SHA, authority record and expected environment.
 *
 * Compare logic has no DNS/HTTP I/O. Live observation is opt-in and read-only.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const AUTHORITY_PATH = join(ROOT, "docs/architecture/RUNTIME-AUTHORITY.md");
export const FIXTURE_DIR = join(ROOT, "scripts/site/fixtures/runtime-authority");

export const SCAN_POLICY_PATH = join(ROOT, "data/ops/runtime-authority-scan.json");

/**
 * The scan inventory is derived from the repository, not from a curated file
 * list. `loadScanPolicy` only supplies detection rules, benign contexts and the
 * minimal exception register — never the set of files that get looked at.
 */
export function loadScanPolicy(root = ROOT) {
  const raw = readFileSync(join(root, "data/ops/runtime-authority-scan.json"), "utf8");
  const policy = JSON.parse(raw);
  if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
    throw new Error("scan_policy_rules_missing");
  }
  if (!Array.isArray(policy.exceptions)) throw new Error("scan_policy_exceptions_missing");
  return policy;
}

function compileRules(policy) {
  return policy.rules.map((rule) => ({
    ...rule,
    re: new RegExp(rule.re, rule.multiline ? "im" : "i"),
  }));
}

function compileBenign(policy) {
  return (policy.benign_contexts || []).map((ctx) => ({
    ...ctx,
    re: new RegExp(ctx.re, "i"),
  }));
}

/**
 * Enumerates every tracked text surface that even mentions the legacy host.
 * A new document that instructs Netlify production is scanned the moment it is
 * committed; nothing has to be added to a list first.
 */
export function enumerateScannedFiles({ root = ROOT, policy = loadScanPolicy(root), prefilter = true } = {}) {
  const inventory = policy.inventory || {};
  const extensions = inventory.text_extensions || [];
  const excluded = inventory.excluded_prefixes || [];
  const mention = new RegExp(inventory.prefilter || "netlify", "i");
  const tracked = execSync("git ls-files -z", { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
  const selected = [];
  for (const rel of tracked) {
    if (excluded.some((prefix) => rel === prefix || rel.startsWith(prefix))) continue;
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    const ext = dot > 0 ? base.slice(dot) : "";
    const extensionless = dot <= 0 && /^[A-Z0-9][A-Z0-9._-]*$/.test(base);
    if (!extensions.includes(ext) && !(inventory.extensionless_uppercase_docs && extensionless)) continue;
    let text;
    try {
      text = readFileSync(join(root, rel), "utf8");
    } catch {
      continue;
    }
    if (prefilter && !mention.test(text)) continue;
    selected.push({ path: rel, text });
  }
  return selected;
}

/**
 * Line-oriented so a benign mention on one line cannot excuse an instruction on
 * another. Label-style contracts (`WHERE_TO_SET:` then the value) are matched on
 * a two-line window as well.
 */
export function findForbiddenProductionInstructions(text, file = "<text>", policy = loadScanPolicy()) {
  const rules = compileRules(policy);
  const benign = compileBenign(policy);
  const negation = policy.negation_guard ? new RegExp(policy.negation_guard.re, "i") : null;
  const lines = String(text).replaceAll("\r\n", "\n").split("\n");
  const hits = [];
  const seen = new Set();
  const units = [];
  for (let i = 0; i < lines.length; i += 1) {
    units.push({ line: i + 1, content: lines[i], window: false, previous: lines[i - 1] || "" });
    if (i + 1 < lines.length) {
      units.push({
        line: i + 1,
        content: `${lines[i]}\n${lines[i + 1]}`,
        window: true,
        previous: lines[i - 1] || "",
      });
    }
  }
  for (const unit of units) {
    if (!/netlify/i.test(unit.content) && !/PROD_TRAFFIC_UNCHANGED/.test(unit.content)) continue;
    for (const rule of rules) {
      // Only label-style rules ("WHERE_TO_SET:" then the value) need the
      // two-line window. Running every rule on it would report each single-line
      // hit twice, once under the previous line number.
      if (unit.window !== Boolean(rule.window)) continue;
      const match = unit.content.match(rule.re);
      if (!match) continue;
      const matchStart = match.index ?? 0;
      const matchEnd = matchStart + match[0].length;
      const excused = rule.allow_benign_context !== false && benign.some((ctx) => {
        const flags = ctx.re.flags.includes("g") ? ctx.re.flags : `${ctx.re.flags}g`;
        for (const benignMatch of unit.content.matchAll(new RegExp(ctx.re.source, flags))) {
          const benignStart = benignMatch.index ?? 0;
          const benignEnd = benignStart + benignMatch[0].length;
          const overlaps = benignStart < matchEnd && benignEnd > matchStart;
          if (ctx.scope !== "clause") return overlaps;
          if (benignEnd < matchStart) {
            if (!/[.;\n]/.test(unit.content.slice(benignEnd, matchStart))) return true;
          } else if (benignStart > matchEnd) {
            if (!/[.;\n]/.test(unit.content.slice(matchEnd, benignStart))) return true;
          } else {
            return true;
          }
        }
        return false;
      });
      if (excused) continue;
      if (negation) {
        // A prohibition often wraps: "... nem republicar um\ndeploy Netlify ...".
        // The previous line is prepended only when this line genuinely continues
        // it: no sentence terminator above, no new list/table/heading marker here
        // and the match near the start. A new bullet resets the clause, so an
        // unrelated "not" one line up can never excuse an instruction.
        const continues =
          unit.previous.trim() !== "" &&
          !/[.:;|)!?]\s*$/.test(unit.previous) &&
          !/^\s*(?:[-*+>#|]|\d+[.)])\s/.test(unit.content) &&
          !/^\s*[A-Z][A-Z0-9_]{2,}\s*:/.test(unit.content) &&
          match.index <= 24;
        const prefix = continues ? unit.previous : "";
        const carried = `${prefix}\n${unit.content}`;
        const at = match.index + prefix.length + 1;
        const from = Math.max(0, at - (policy.negation_guard.lookbehind || 80));
        // Cut the lookbehind at the last clause boundary. "Do not reactivate X;
        // set Y on Netlify production" must still fail: the prohibition belongs
        // to the clause before the semicolon, not to the instruction after it.
        const before = carried.slice(from, at).split(/[;.](?=\s|$)/).pop();
        const after = carried.slice(at, at + match[0].length + (policy.negation_guard.lookahead || 0));
        if (negation.test(`${before}${after}`)) continue;
      }
      const key = `${rule.name}:${unit.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        file,
        rule: rule.name,
        line: unit.line,
        detail: `${rule.detail}: ${match[0].replaceAll("\n", " ").trim().slice(0, 160)}`,
      });
    }
  }
  return hits;
}

/**
 * Scans the derived inventory and audits the exception register itself: a stale
 * entry, an entry that no longer earns its keep, or a "historical" file that
 * never says it is historical all fail the gate.
 */
export function scanOperatorDocs({ root = ROOT, policy = loadScanPolicy(root) } = {}) {
  if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
    throw new Error("scan_policy_rules_missing");
  }
  const files = enumerateScannedFiles({ root, policy });
  const exceptions = new Map(policy.exceptions.map((item) => [item.path, item]));
  const kinds = new Set(policy.exception_kinds ? Object.keys(policy.exception_kinds) : []);
  const hits = [];
  const registerFailures = [];
  const used = new Set();

  for (const { path: rel, text } of files) {
    const found = findForbiddenProductionInstructions(text, rel, policy);
    if (!found.length) continue;
    const exception = exceptions.get(rel);
    if (!exception) {
      hits.push(...found);
      continue;
    }
    used.add(rel);
    if (exception.kind === "historical_record") {
      // A historical record is honoured only for the exact bytes that were
      // reviewed. Any later edit invalidates the pin and the file goes back to
      // being a live surface, so the register can never quietly cover new text.
      const digest = createHash("sha256").update(text, "utf8").digest("hex");
      if (digest !== exception.sha256) {
        registerFailures.push({
          file: rel,
          rule: "historical_exception_content_changed",
          detail: `pinned ${String(exception.sha256).slice(0, 16)}… but the file now hashes ${digest.slice(0, 16)}…`,
        });
      }
    }
  }

  for (const item of policy.exceptions) {
    if (!item.reason || !item.owner || !item.kind) {
      registerFailures.push({
        file: item.path,
        rule: "exception_missing_justification",
        detail: "every exception needs kind, reason and owner",
      });
      continue;
    }
    if (kinds.size && !kinds.has(item.kind)) {
      registerFailures.push({
        file: item.path,
        rule: "exception_unknown_kind",
        detail: `kind=${item.kind} is not declared in exception_kinds`,
      });
      continue;
    }
    if (item.kind === "historical_record" && !/^[0-9a-f]{64}$/.test(String(item.sha256 || ""))) {
      registerFailures.push({
        file: item.path,
        rule: "historical_exception_unpinned",
        detail: "a historical_record exception must pin the reviewed content with sha256",
      });
      continue;
    }
    if (!files.some((file) => file.path === item.path)) {
      registerFailures.push({
        file: item.path,
        rule: "exception_path_absent",
        detail: "exception names a file the derived inventory no longer contains",
      });
      continue;
    }
    if (!used.has(item.path)) {
      registerFailures.push({
        file: item.path,
        rule: "exception_no_longer_needed",
        detail: "file produces no hits; delete the exception instead of carrying it",
      });
    }
  }

  const all = [...hits, ...registerFailures];
  return {
    ok: all.length === 0,
    scanned: files.length,
    exceptions: policy.exceptions.length,
    hits: all,
    violations: hits,
    register_failures: registerFailures,
  };
}

const YAML_FENCE = /```yaml\r?\n([\s\S]*?)\r?\n```/;

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

function overlaps(left, right) {
  const wanted = new Set(asList(right));
  return asList(left).some((item) => wanted.has(item));
}

function isCloudflareProxy(dns) {
  return String(dns.proxy || "").trim().toLowerCase() === "cloudflare";
}

function fail(failures, code, detail) {
  failures.push({ code, detail });
}

export function observationFromAuthority(authority) {
  const prod = authority.public_canonical || {};
  const dns = prod.dns || {};
  const proxied = isCloudflareProxy(dns);
  return {
    dns: {
      // Proxied A answers are deliberately examples, not authority. They prove
      // fixtures and callers do not pin Cloudflare's dynamic anycast addresses.
      apex_a: proxied ? ["104.16.0.1"] : [...(dns.apex_a || [])],
      www_a: proxied ? ["172.64.0.1"] : [],
      www_cname: proxied ? "" : dns.www_cname || "",
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
  if (isCloudflareProxy(dns)) {
    const originA = asList(dns.origin_apex_a);
    const apexA = asList(obsDns.apex_a);
    const wwwA = asList(obsDns.www_a);
    if (originA.length === 0) {
      fail(failures, "dns_origin_authority_missing", "proxied DNS must declare origin_apex_a");
    }
    if (apexA.length === 0 || overlaps(apexA, originA)) {
      fail(
        failures,
        "dns_apex_mismatch",
        `proxied apex must have an A answer and hide origin=${JSON.stringify(originA)}; observed=${JSON.stringify(apexA)}`,
      );
    }
    if (wwwA.length === 0 || overlaps(wwwA, originA)) {
      fail(
        failures,
        "dns_www_mismatch",
        `proxied www must have an A answer and hide origin=${JSON.stringify(originA)}; observed=${JSON.stringify(wwwA)}`,
      );
    }
  } else {
    // Preserve the original exact-address contract for a deliberately
    // non-proxied authority record.
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
  }
  if (!sameSet(obsDns.nameservers, dns.nameservers)) {
    fail(
      failures,
      "dns_nameserver_mismatch",
      `observed=${JSON.stringify(obsDns.nameservers)} expected=${JSON.stringify(dns.nameservers)}`,
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
  if (prod.expected_profile && obsHttp.profile !== prod.expected_profile) {
    fail(
      failures,
      "profile_mismatch",
      `observed=${obsHttp.profile} expected=${prod.expected_profile}`,
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
  const [apexA, wwwA, wwwCname, nameservers] = await Promise.all([
    doh(apex, "A"),
    doh(www, "A"),
    doh(www, "CNAME"),
    doh(apex, "NS"),
  ]);
  return {
    dns: {
      apex_a: apexA,
      www_a: wwwA,
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
        usage: "node scripts/site/runtime_authority.mjs --fixture matching|divergent-host|divergent-dns|divergent-www-dns|divergent-header | --live",
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
