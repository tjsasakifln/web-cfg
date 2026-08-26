import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRACT_SCHEMA = "confenge.http-host-contract/v1";
export const CONTRACT_VERSION = 1;
export const HOST_ARCHITECTURE_VERSION = "confenge-static-nginx/v1";
export const CANONICAL_HOST = "confenge.com.br";
export const DYNAMIC_ROUTE_PREFIX = "/.netlify/functions/";

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const HEADER_NAME = /^[A-Za-z][0-9A-Za-z-]*$/;
const STATUS = /^(200|301|302|410)(!)?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SIMPLE_TOML_STRING = /^"((?:[^"\\]|\\["\\bfnrt])*)"$/;

export class HostContractError extends Error {
  constructor(code, source, line, message) {
    const at = line ? `${source}:${line}` : source;
    super(`[${code}] ${at}: ${message}`);
    this.name = "HostContractError";
    this.code = code;
    this.source = source;
    this.line = line || null;
  }
}

function fail(code, source, line, message) {
  throw new HostContractError(code, source, line, message);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function validateText(text, source) {
  if (typeof text !== "string") fail("HC_INPUT_INVALID", source, 0, "input must be UTF-8 text");
  if (text.charCodeAt(0) === 0xfeff) fail("HC_INPUT_BOM", source, 1, "UTF-8 BOM is not accepted");
  if (text.includes("\r") && !text.includes("\r\n")) {
    fail("HC_INPUT_NEWLINE", source, 1, "bare carriage return is not accepted");
  }
  return text.replaceAll("\r\n", "\n");
}

function validatePathSelector(selector, source, line, kind) {
  if (!selector.startsWith("/")) {
    fail(`HC_${kind}_SELECTOR_UNSUPPORTED`, source, line, `only absolute path selectors are supported: ${selector}`);
  }
  if (CONTROL.test(selector) || /[?#%\s;{}"'$]/.test(selector) || selector.includes("\\") || selector.includes("//")) {
    fail(`HC_${kind}_SELECTOR_INVALID`, source, line, `unsafe path selector: ${selector}`);
  }
  if (selector.split("/").some((segment) => segment === "." || segment === "..")) {
    fail(`HC_${kind}_SELECTOR_INVALID`, source, line, `dot-segment normalization is forbidden: ${selector}`);
  }
  const stars = (selector.match(/\*/g) || []).length;
  if (stars > 1 || (stars === 1 && !selector.endsWith("/*")) || selector.includes(":")) {
    fail(
      `HC_${kind}_SELECTOR_UNSUPPORTED`,
      source,
      line,
      `only exact paths and a single terminal /* are safely translatable: ${selector}`,
    );
  }
  return stars === 1 ? "prefix" : "exact";
}

function normalizedSelectorPath(path, match) {
  if (match === "global") return "/*";
  const withoutWildcard = match === "prefix" ? path.slice(0, -2) : path;
  return withoutWildcard !== "/" && withoutWildcard.endsWith("/")
    ? withoutWildcard.slice(0, -1)
    : withoutWildcard;
}

function normalizedSelectorIdentity(path, match) {
  return `${match}:${normalizedSelectorPath(path, match)}`;
}

function classifyHeader(name) {
  const key = name.toLowerCase();
  if (key === "cache-control") return "cache-control";
  if (key === "content-type") return "content-type";
  if (key === "x-robots-tag") return "x-robots";
  if (key === "content-security-policy") return "csp";
  if (key === "strict-transport-security") return "hsts";
  return "response-header";
}

export function parseHeaders(text, { source = "_headers" } = {}) {
  const normalized = validateText(text, source);
  const rules = [];
  let current = null;

  normalized.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    if (!/^[ \t]/.test(raw)) {
      const matchType = validatePathSelector(trimmed, source, line, "HEADER");
      const match = trimmed === "/*" ? "global" : matchType;
      const identity = normalizedSelectorIdentity(trimmed, match);
      if (rules.some((rule) => normalizedSelectorIdentity(rule.path, rule.match) === identity)) {
        fail("HC_HEADER_SELECTOR_DUPLICATE", source, line, `duplicate header selector: ${trimmed}`);
      }
      current = {
        order: rules.length,
        path: trimmed,
        match,
        headers: [],
        provenance: [{ source, line }],
      };
      rules.push(current);
      return;
    }

    if (!current) fail("HC_HEADER_ORPHAN", source, line, "header has no path selector");
    const colon = trimmed.indexOf(":");
    if (colon <= 0) fail("HC_HEADER_INVALID", source, line, `expected Header-Name: value, got: ${trimmed}`);
    const name = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!HEADER_NAME.test(name)) fail("HC_HEADER_NAME_INVALID", source, line, `invalid header field name: ${name}`);
    if (!value || CONTROL.test(value)) fail("HC_HEADER_VALUE_INVALID", source, line, `empty or unsafe value for ${name}`);
    if (current.headers.some((header) => header.name.toLowerCase() === name.toLowerCase())) {
      fail(
        "HC_HEADER_DUPLICATE",
        source,
        line,
        `duplicate ${name} under ${current.path}; combine multi-values explicitly to avoid ambiguity`,
      );
    }
    current.headers.push({ name, value, semantic: classifyHeader(name), line });
  });

  for (const rule of rules) {
    if (rule.headers.length === 0) {
      fail("HC_HEADER_SELECTOR_EMPTY", source, rule.provenance[0].line, `selector has no headers: ${rule.path}`);
    }
  }
  if (!rules.some((rule) => rule.match === "global")) {
    fail("HC_HEADER_GLOBAL_MISSING", source, 0, "a /* global header rule is required");
  }
  return rules;
}

function parseAbsoluteSource(value, source, line) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("HC_REDIRECT_SOURCE_INVALID", source, line, `invalid absolute source URL: ${value}`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    fail("HC_REDIRECT_SOURCE_INVALID", source, line, `unsafe absolute source URL: ${value}`);
  }
  if (url.port) fail("HC_REDIRECT_SOURCE_UNSUPPORTED", source, line, `source ports are not safely translatable: ${value}`);
  const match = validatePathSelector(url.pathname, source, line, "REDIRECT");
  return {
    kind: "host",
    protocol: url.protocol.slice(0, -1),
    host: url.hostname.toLowerCase(),
    path: url.pathname,
    match: url.pathname === "/*" ? "host-all" : match,
    raw: value,
  };
}

function parseRedirectSource(value, source, line) {
  if (/^https?:\/\//i.test(value)) return parseAbsoluteSource(value, source, line);
  const match = validatePathSelector(value, source, line, "REDIRECT");
  return { kind: "path", path: value, match, raw: value };
}

function parseRedirectTarget(value, redirectSource, status, source, line) {
  if (CONTROL.test(value) || /[\s;%{}"'`$]/.test(value) || value.includes("\\")) {
    fail("HC_REDIRECT_TARGET_INVALID", source, line, `unsafe redirect target: ${value}`);
  }
  if ((value.match(/#/g) || []).length > 1) {
    fail("HC_REDIRECT_TARGET_INVALID", source, line, `target may contain at most one fragment delimiter: ${value}`);
  }
  const absolute = /^https?:\/\//i.test(value);
  if (!absolute && !value.startsWith("/")) {
    fail("HC_REDIRECT_TARGET_INVALID", source, line, `target must be absolute path or http(s) URL: ${value}`);
  }
  let parsed;
  try {
    parsed = new URL(value, "https://contract.invalid");
  } catch {
    fail("HC_REDIRECT_TARGET_INVALID", source, line, `invalid target URL: ${value}`);
  }
  if (parsed.username || parsed.password || !['http:', 'https:'].includes(parsed.protocol)) {
    fail("HC_REDIRECT_TARGET_INVALID", source, line, `unsafe target URL: ${value}`);
  }
  if (parsed.search) {
    fail(
      "HC_REDIRECT_TARGET_QUERY_UNSUPPORTED",
      source,
      line,
      `destination query strings require an explicit merge policy and are not safely translatable: ${value}`,
    );
  }
  if (status === 200 && (absolute || parsed.hash)) {
    fail("HC_REWRITE_TARGET_UNSUPPORTED", source, line, `200 rewrites must target a local server path without fragment: ${value}`);
  }
  const sourceHasSplat = redirectSource.path.endsWith("/*");
  const splatCount = (value.match(/:splat/g) || []).length;
  if (splatCount > 1 || (splatCount === 1 && !sourceHasSplat) || (sourceHasSplat && splatCount !== 1)) {
    fail(
      "HC_REDIRECT_SPLAT_UNSAFE",
      source,
      line,
      `terminal wildcard and :splat must have a one-to-one mapping: ${redirectSource.raw} -> ${value}`,
    );
  }
  if (/:[A-Za-z_]/.test(value.replaceAll(":splat", ""))) {
    fail("HC_REDIRECT_PLACEHOLDER_UNSUPPORTED", source, line, `named placeholders are not safely translated: ${value}`);
  }
  return {
    raw: value,
    absolute,
    origin: absolute ? parsed.origin : null,
    pathname: parsed.pathname,
    fragment: parsed.hash ? parsed.hash.slice(1) : null,
    usesSplat: splatCount === 1,
  };
}

function makeRedirectRule({ from, to, statusToken, source, line, origin }) {
  const statusMatch = statusToken.match(STATUS);
  if (!statusMatch) {
    fail(
      "HC_REDIRECT_STATUS_UNSUPPORTED",
      source,
      line,
      `unsupported status ${statusToken}; supported statuses are 200, 301, 302 and 410`,
    );
  }
  const status = Number(statusMatch[1]);
  const force = Boolean(statusMatch[2]);
  if (status === 410 && force) fail("HC_REDIRECT_FORCE_UNSUPPORTED", source, line, "410! has no safe host-neutral meaning");
  const parsedSource = parseRedirectSource(from, source, line);
  const target = parseRedirectTarget(to, parsedSource, status, source, line);
  if (parsedSource.kind === "host" && (parsedSource.match !== "host-all" || !force || ![301, 302].includes(status))) {
    fail(
      "HC_HOST_CANONIZATION_UNSUPPORTED",
      source,
      line,
      "host rules must be forced 301/302 terminal-wildcard canonicalizations",
    );
  }
  if (status === 410 && target.absolute) {
    fail("HC_GONE_TARGET_UNSUPPORTED", source, line, "410 body must be a local static path");
  }
  return {
    order: origin.order,
    from: parsedSource,
    to: target,
    status,
    action: status === 200 ? "rewrite" : status === 410 ? "gone" : "redirect",
    force,
    preserveQuery: [200, 301, 302].includes(status),
    fragmentServerSide: false,
    shadowPolicy: force ? "rule-first" : "static-file-first",
    provenance: [{ source, line, syntax: origin.syntax }],
  };
}

export function parseRedirects(text, { source = "_redirects", orderOffset = 0 } = {}) {
  const normalized = validateText(text, source);
  const rules = [];
  normalized.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 3) {
      fail(
        "HC_REDIRECT_ARITY_UNSUPPORTED",
        source,
        line,
        `conditional/extended redirect syntax is not safely translated (${parts.length} fields): ${trimmed}`,
      );
    }
    rules.push(
      makeRedirectRule({
        from: parts[0],
        to: parts[1],
        statusToken: parts[2],
        source,
        line,
        origin: { order: orderOffset + rules.length, syntax: "netlify-redirects" },
      }),
    );
  });
  return rules;
}

function decodeTomlString(raw, source, line) {
  const match = raw.match(SIMPLE_TOML_STRING);
  if (!match) fail("HC_NETLIFY_TOML_VALUE_UNSUPPORTED", source, line, `only simple quoted strings are supported: ${raw}`);
  try {
    return JSON.parse(raw);
  } catch {
    fail("HC_NETLIFY_TOML_VALUE_UNSUPPORTED", source, line, `invalid TOML string: ${raw}`);
  }
}

function parseTomlScalar(raw, source, line) {
  if (SIMPLE_TOML_STRING.test(raw)) return decodeTomlString(raw, source, line);
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === "true") return true;
  if (raw === "false") return false;
  fail("HC_NETLIFY_TOML_VALUE_UNSUPPORTED", source, line, `unsupported TOML value: ${raw}`);
}

export function parseNetlifyRedirects(text, { source = "netlify.toml", orderOffset = 0 } = {}) {
  const normalized = validateText(text, source);
  const blocks = [];
  let active = null;
  let table = "";

  normalized.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const arrayTable = trimmed.match(/^\[\[([^\]]+)\]\]$/);
    if (arrayTable) {
      table = arrayTable[1].trim();
      active = null;
      if (table === "redirects") {
        active = { values: {}, lines: {}, line };
        blocks.push(active);
      } else if (table === "headers" || table === "edge_functions" || /redirect|header/i.test(table)) {
        fail("HC_NETLIFY_HTTP_TABLE_UNSUPPORTED", source, line, `HTTP behavior table [[${table}]] has no safe translator`);
      }
      return;
    }
    const normalTable = trimmed.match(/^\[([^\]]+)\]$/);
    if (normalTable) {
      table = normalTable[1].trim();
      active = null;
      if (/redirect|header/i.test(table)) {
        fail("HC_NETLIFY_HTTP_TABLE_UNSUPPORTED", source, line, `HTTP behavior table [${table}] has no safe translator`);
      }
      return;
    }
    if (!active || table !== "redirects") return;
    const assignment = trimmed.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!assignment) fail("HC_NETLIFY_REDIRECT_SYNTAX", source, line, `invalid [[redirects]] assignment: ${trimmed}`);
    const key = assignment[1];
    if (!new Set(["from", "to", "status", "force"]).has(key)) {
      fail("HC_NETLIFY_REDIRECT_KEY_UNSUPPORTED", source, line, `unsupported [[redirects]] key: ${key}`);
    }
    if (Object.hasOwn(active.values, key)) {
      fail("HC_NETLIFY_REDIRECT_KEY_DUPLICATE", source, line, `duplicate [[redirects]] key: ${key}`);
    }
    active.values[key] = parseTomlScalar(assignment[2].trim(), source, line);
    active.lines[key] = line;
  });

  return blocks.map((block, index) => {
    for (const required of ["from", "to", "status"]) {
      if (!Object.hasOwn(block.values, required)) {
        fail("HC_NETLIFY_REDIRECT_REQUIRED", source, block.line, `[[redirects]] is missing ${required}`);
      }
    }
    if (typeof block.values.from !== "string" || typeof block.values.to !== "string" || !Number.isInteger(block.values.status)) {
      fail("HC_NETLIFY_REDIRECT_TYPE", source, block.line, "from/to must be strings and status must be an integer");
    }
    if (Object.hasOwn(block.values, "force") && typeof block.values.force !== "boolean") {
      fail("HC_NETLIFY_REDIRECT_TYPE", source, block.lines.force, "force must be boolean");
    }
    const statusToken = `${block.values.status}${block.values.force ? "!" : ""}`;
    return makeRedirectRule({
      from: block.values.from,
      to: block.values.to,
      statusToken,
      source,
      line: block.line,
      origin: { order: orderOffset + index, syntax: "netlify-toml" },
    });
  });
}

function redirectIdentity(rule) {
  return stableJson({
    from: rule.from,
    to: rule.to,
    status: rule.status,
    force: rule.force,
  });
}

function fromIdentity(rule) {
  return stableJson({
    kind: rule.from.kind,
    protocol: rule.from.protocol || null,
    host: rule.from.host || null,
    match: rule.from.match,
    path: normalizedSelectorPath(
      rule.from.path,
      rule.from.match === "host-all" ? "prefix" : rule.from.match,
    ),
  });
}

export function mergeRedirectRules(primary, secondary) {
  const merged = primary.map((rule) => ({ ...rule, provenance: [...rule.provenance] }));
  for (const rule of secondary) {
    const sameFrom = merged.find((candidate) => fromIdentity(candidate) === fromIdentity(rule));
    if (!sameFrom) {
      merged.push({ ...rule, order: merged.length, provenance: [...rule.provenance] });
      continue;
    }
    if (redirectIdentity(sameFrom) !== redirectIdentity(rule)) {
      fail(
        "HC_REDIRECT_CONFLICT",
        rule.provenance[0].source,
        rule.provenance[0].line,
        `conflicting rule for ${rule.from.raw}; primary is ${sameFrom.status} ${sameFrom.to.raw}`,
      );
    }
    sameFrom.provenance.push(...rule.provenance);
  }
  const seen = new Map();
  for (const rule of merged) {
    const key = fromIdentity(rule);
    if (seen.has(key)) {
      fail(
        "HC_REDIRECT_DUPLICATE",
        rule.provenance[0].source,
        rule.provenance[0].line,
        `duplicate rule for ${rule.from.raw}`,
      );
    }
    seen.set(key, rule);
  }
  return merged.map((rule, order) => ({ ...rule, order }));
}

function sourceRecord(root, path) {
  if (!existsSync(path) || !statSync(path).isFile()) fail("HC_SOURCE_MISSING", relative(root, path), 0, "canonical source file is missing");
  const bytes = readFileSync(path);
  return {
    path: relative(root, path).replaceAll("\\", "/"),
    sha256: sha256(bytes),
    bytes: bytes.length,
  };
}

function canonicalOrigin(routes) {
  const hosts = routes.filter((rule) => rule.from.kind === "host");
  if (hosts.length !== 1) fail("HC_HOST_CANONIZATION_COUNT", "_redirects", 0, `expected exactly one host canonicalization, found ${hosts.length}`);
  const rule = hosts[0];
  if (!rule.to.absolute || rule.to.pathname !== "/:splat" || rule.to.fragment) {
    fail("HC_HOST_CANONIZATION_TARGET", rule.provenance[0].source, rule.provenance[0].line, "host canonicalization must preserve the complete path via /:splat");
  }
  if (rule.to.origin !== `https://${CANONICAL_HOST}`) {
    fail("HC_CANONICAL_HOST_MISMATCH", rule.provenance[0].source, rule.provenance[0].line, `canonical target must be https://${CANONICAL_HOST}`);
  }
  if (rule.from.host === `www.${CANONICAL_HOST}`) {
    fail("HC_WWW_OWNERSHIP", rule.provenance[0].source, rule.provenance[0].line, "www canonicalization belongs to the edge, not this nginx contract");
  }
  return rule.to.origin;
}

function validateRequiredSemantics(root, headers, routes) {
  const global = headers.find((rule) => rule.match === "global");
  const names = new Set(global.headers.map((header) => header.name.toLowerCase()));
  for (const required of ["content-security-policy", "strict-transport-security", "cache-control"]) {
    if (!names.has(required)) fail("HC_REQUIRED_HEADER_MISSING", "_headers", global.provenance[0].line, `global ${required} is required`);
  }
  if (global.headers.some((header) => header.name.toLowerCase() === "content-type")) {
    fail("HC_GLOBAL_CONTENT_TYPE_UNSUPPORTED", "_headers", global.provenance[0].line, "global Content-Type cannot be translated safely across heterogeneous static assets");
  }
  const requiredActions = new Map([
    ["/intranet", [302, "redirect"]],
    ["/obrigado", [200, "rewrite"]],
    ["/vision", [410, "gone"]],
  ]);
  for (const [path, [status, action]] of requiredActions) {
    const found = routes.find((rule) => rule.from.kind === "path" && rule.from.path === path);
    if (!found || found.status !== status || found.action !== action) {
      fail("HC_REQUIRED_ROUTE_MISSING", "_redirects", 0, `${path} must be a ${status} ${action}`);
    }
  }
  const fourOhFour = resolve(root, "404.html");
  if (!existsSync(fourOhFour) || !statSync(fourOhFour).isFile()) {
    fail("HC_ARTIFACT_404_MISSING", "404.html", 0, "custom 404 body is required");
  }
}

export function buildHostContract(root = MODULE_ROOT) {
  const resolvedRoot = resolve(root);
  const headersPath = resolve(resolvedRoot, "_headers");
  const redirectsPath = resolve(resolvedRoot, "_redirects");
  const netlifyPath = resolve(resolvedRoot, "netlify.toml");
  const sitemapPaths = readdirSync(resolvedRoot)
    .filter((name) => /^sitemap(?:-[a-z0-9-]+)?\.(?:xml|txt)$/i.test(name))
    .sort()
    .map((name) => resolve(resolvedRoot, name));
  const verificationPaths = readdirSync(resolvedRoot)
    .filter((name) => /^[a-f0-9]{32,}\.txt$/i.test(name))
    .sort()
    .map((name) => resolve(resolvedRoot, name));
  const sources = [
    headersPath,
    redirectsPath,
    netlifyPath,
    resolve(resolvedRoot, "404.html"),
    resolve(resolvedRoot, "robots.txt"),
    resolve(resolvedRoot, ".well-known/README.md"),
    ...sitemapPaths,
    ...verificationPaths,
  ].map((path) => sourceRecord(resolvedRoot, path));
  const headers = parseHeaders(readFileSync(headersPath, "utf8"), { source: "_headers" });
  const primary = parseRedirects(readFileSync(redirectsPath, "utf8"), { source: "_redirects" });
  const netlify = parseNetlifyRedirects(readFileSync(netlifyPath, "utf8"), {
    source: "netlify.toml",
    orderOffset: primary.length,
  });
  const routes = mergeRedirectRules(primary, netlify);
  const origin = canonicalOrigin(routes);
  validateRequiredSemantics(resolvedRoot, headers, routes);

  const contract = {
    schema: CONTRACT_SCHEMA,
    version: CONTRACT_VERSION,
    hostArchitectureVersion: HOST_ARCHITECTURE_VERSION,
    state: "HTTP_SEO_PARITY_GATE_READY / NETCUP_CANDIDATE_NOT_YET_PROMOTED",
    canonical: {
      origin,
      host: CANONICAL_HOST,
      legacyHosts: routes.filter((rule) => rule.from.kind === "host").map((rule) => rule.from.host),
      www: { owner: "edge", nginxRuleForbidden: true },
      httpToHttps: { owner: "edge", nginxRuleForbidden: true },
    },
    resolution: {
      prettyUrls: {
        enabled: true,
        strategy: ["$uri", "$uri/", "$uri.html", "$uri/index.html", "=404"],
        provenance: "Netlify platform default plus static artifact layout",
      },
      custom404: { status: 404, bodyPath: "/404.html", inferredFromArtifact: true },
      redirectResponses: {
        applyEffectiveRequestHeaders: true,
        contentType: "text/plain; charset=utf-8",
        bodyTemplate: "Redirecting to {target}",
        provenance: [
          "effective request-path selectors from _headers",
          "Netlify generated redirect response invariant",
        ],
      },
    },
    runtime: {
      routePrefix: DYNAMIC_ROUTE_PREFIX,
      translation: "external-runtime-required",
      nginxProxyGenerated: false,
      parity: "probe-when-candidate-runtime-is-available",
    },
    seo: {
      robots: sources.find((source) => source.path === "robots.txt"),
      sitemaps: sources.filter((source) => /^sitemap(?:-[a-z0-9-]+)?\.(?:xml|txt)$/i.test(source.path)),
      verificationFiles: sources.filter((source) => /^[a-f0-9]{32,}\.txt$/i.test(source.path)),
      releaseIdentity: {
        schemaSource: sources.find((source) => source.path === ".well-known/README.md"),
        paths: [
          "/.well-known/pseo-build.json",
          "/.well-known/build-info.json",
          "/.well-known/release-result.json",
          "/.well-known/build-manifest.json",
        ],
        expectedFields: [
          "commit/web_cfg_sha",
          "artifact_hash",
          "host_architecture_version for candidate/live phases",
          "runtime_identity when applicable",
        ],
      },
    },
    headers,
    routes,
    sources,
  };
  return { contract, contractHash: sha256(stableJson(contract)) };
}
