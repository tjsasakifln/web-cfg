import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { CANONICAL_HOST } from "./contract.mjs";

const execFileAsync = promisify(execFile);

export const MATERIAL_HEADERS = Object.freeze([
  "location",
  "cache-control",
  "content-security-policy",
  "strict-transport-security",
  "x-robots-tag",
  "content-type",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
]);

export const EXCLUDED_HEADERS = Object.freeze({
  "accept-ranges": "transport capability",
  age: "edge-cache residence time",
  "alt-svc": "connection advertisement",
  "cache-status": "provider cache telemetry",
  connection: "hop-by-hop transport",
  "content-encoding": "wire representation; body is decoded before hashing",
  "content-length": "wire representation length",
  date: "response clock",
  etag: "provider-specific validator; body SHA-256 is compared",
  expires: "legacy cache timestamp; Cache-Control is authoritative",
  "keep-alive": "hop-by-hop transport",
  "last-modified": "filesystem/deploy timestamp; body SHA-256 is compared",
  "netlify-vary": "Netlify cache implementation detail",
  pragma: "legacy cache compatibility; Cache-Control is authoritative",
  "request-id": "request correlation identifier",
  "server-timing": "provider request telemetry",
  server: "provider identity",
  "set-cookie": "request-scoped state outside the static host contract",
  "traceparent": "distributed trace identifier",
  trailer: "hop-by-hop transport",
  "transfer-encoding": "hop-by-hop transport",
  upgrade: "hop-by-hop transport",
  vary: "content-negotiation implementation; decoded body and material headers are compared",
  via: "intermediary identity",
  "x-cache": "provider cache telemetry",
  "x-cache-hits": "provider cache telemetry",
  "x-nf-request-id": "Netlify request correlation identifier",
  "x-request-id": "request correlation identifier",
  "x-served-by": "provider edge identity",
});

function safeBase(baseUrl, label) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`${label} base URL is invalid: ${baseUrl}`);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} base URL must be an http(s) origin without path/credentials/query/fragment`);
  }
  return url;
}

function parseHeaders(raw) {
  const blocks = raw
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => /^HTTP\/\d(?:\.\d)?\s+\d{3}/i.test(block));
  if (blocks.length === 0) throw new Error("curl returned no parseable HTTP response headers");
  const lines = blocks.at(-1).split(/\r?\n/);
  const statusMatch = lines.shift().match(/^HTTP\/\S+\s+(\d{3})/i);
  const headers = {};
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  return { status: Number(statusMatch[1]), headers };
}

function joinedUrl(base, path) {
  if (!path.startsWith("/")) throw new Error(`probe path must start with /: ${path}`);
  const url = new URL(base.toString());
  const query = path.indexOf("?");
  url.pathname = query === -1 ? path : path.slice(0, query);
  url.search = query === -1 ? "" : path.slice(query);
  return url.toString();
}

export function createOriginClient({
  label,
  baseUrl,
  hostHeader = null,
  resolveIp = null,
  canonicalHost = CANONICAL_HOST,
  timeoutSeconds = 20,
}) {
  const base = safeBase(baseUrl, label);
  if (resolveIp && base.protocol !== "https:") {
    throw new Error(`${label}: --resolve requires an https base URL; use Host header mode for HTTP`);
  }
  if (resolveIp && base.hostname !== canonicalHost) {
    throw new Error(`${label}: HTTPS resolve must keep URL host ${canonicalHost} for SNI/certificate validation`);
  }
  if (resolveIp && !isIP(resolveIp)) throw new Error(`${label}: --resolve value must be an IP address`);
  if (hostHeader && /[\s\r\n]/.test(hostHeader)) throw new Error(`${label}: unsafe Host header`);
  const evidenceMode = resolveIp
    ? "https-curl-resolve-valid-certificate-required"
    : hostHeader && base.protocol === "http:"
      ? "http-origin-with-host-header"
      : base.hostname === canonicalHost
        ? "canonical-url-dns"
        : "alternate-base-url";

  async function request(path, { method = "GET", extraHeaders = {} } = {}) {
    const scratch = mkdtempSync(join(tmpdir(), "confenge-host-parity-"));
    const headersPath = join(scratch, "headers.txt");
    const bodyPath = join(scratch, "body.bin");
    const url = joinedUrl(base, path);
    const args = [
      "--silent",
      "--show-error",
      "--compressed",
      "--proto",
      "=http,https",
      "--max-time",
      String(timeoutSeconds),
      "--request",
      method,
      "--dump-header",
      headersPath,
      "--output",
      bodyPath,
      "--write-out",
      "%{url_effective}",
    ];
    if (resolveIp) {
      const port = base.port || "443";
      const address = isIP(resolveIp) === 6 ? `[${resolveIp}]` : resolveIp;
      args.push("--resolve", `${base.hostname}:${port}:${address}`);
    }
    if (hostHeader) args.push("--header", `Host: ${hostHeader}`);
    for (const [name, value] of Object.entries(extraHeaders)) {
      if (/[^!#$%&'*+.^_`|~0-9A-Za-z-]/.test(name) || /[\r\n]/.test(String(value))) {
        throw new Error(`${label}: unsafe request header ${name}`);
      }
      args.push("--header", `${name}: ${value}`);
    }
    args.push(url);
    if (args.includes("-k") || args.includes("--insecure")) throw new Error("TLS evidence must never use --insecure");

    try {
      const { stdout } = await execFileAsync("curl", args, {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      });
      const parsed = parseHeaders(readFileSync(headersPath, "utf8"));
      return {
        ...parsed,
        body: readFileSync(bodyPath),
        url: stdout.trim() || url,
        requestPath: path,
      };
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  return {
    label,
    baseUrl: base.origin,
    requestedHost: hostHeader || base.hostname,
    evidenceMode,
    resolveIp: resolveIp || null,
    request,
  };
}

function normalizedTokenList(value, separator) {
  return value
    .split(separator)
    .map((part) => part.trim().replace(/\s+/g, " ").toLowerCase())
    .filter(Boolean)
    .sort()
    .join(separator === ";" ? ";" : ",");
}

export function normalizeMaterialHeader(name, value) {
  if (value == null) return null;
  const trimmed = value.trim();
  if (name === "location") return trimmed;
  if (name === "cache-control" || name === "x-robots-tag") return normalizedTokenList(trimmed, ",");
  if (name === "strict-transport-security") return normalizedTokenList(trimmed, ";");
  if (name === "content-security-policy") {
    const directives = trimmed
      .split(";")
      .map((directive) => directive.trim().split(/\s+/).filter(Boolean))
      .filter((tokens) => tokens.length)
      .map(([directive, ...values]) => `${directive.toLowerCase()} ${values.sort().join(" ")}`.trim())
      .sort();
    return directives.join(";");
  }
  if (name === "content-type") return trimmed.toLowerCase().replace(/\s*;\s*/g, ";").replace(/charset=([A-Z0-9_-]+)/i, (_, charset) => `charset=${charset.toLowerCase()}`);
  return trimmed.replace(/\s+/g, " ").toLowerCase();
}

export function classifyResponseHeaders(headers) {
  const material = {};
  const excluded = {};
  const unclassified = {};
  for (const [name, value] of Object.entries(headers)) {
    if (MATERIAL_HEADERS.includes(name)) material[name] = normalizeMaterialHeader(name, value);
    else if (Object.hasOwn(EXCLUDED_HEADERS, name)) excluded[name] = EXCLUDED_HEADERS[name];
    else unclassified[name] = value;
  }
  for (const name of MATERIAL_HEADERS) if (!Object.hasOwn(material, name)) material[name] = null;
  return { material, excluded, unclassified };
}
