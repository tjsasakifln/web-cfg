import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import {
  HOST_ARCHITECTURE_VERSION,
  buildHostContract,
  sha256,
  stableJson,
} from "./contract.mjs";

const BANNER = [
  "# GENERATED FILE. DO NOT EDIT.",
  "# Source of truth: _headers, _redirects, netlify.toml and static artifact invariants.",
  `# Host architecture: ${HOST_ARCHITECTURE_VERSION}`,
].join("\n");

function escapeLiteral(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$");
}

function quoted(value) {
  return `"${escapeLiteral(value)}"`;
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function variableName(name) {
  return `$confenge_header_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function normalizedExact(path) {
  if (path === "/") return "/";
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function selectorBase(path) {
  return path.endsWith("/*") ? path.slice(0, -2) : normalizedExact(path);
}

function selectorContains(selector, path) {
  if (selector.match === "global") return true;
  if (selector.match === "exact") return normalizedExact(selector.path) === normalizedExact(path);
  const base = selectorBase(selector.path);
  return normalizedExact(path) === base || normalizedExact(path).startsWith(`${base}/`);
}

function effectiveHeadersForSelector(contract, selector) {
  const base = selectorBase(selector.path);
  const merged = new Map();
  for (const rule of contract.headers) {
    const applies =
      rule.match === "global" ||
      (rule.match === "prefix" && (
        base.startsWith(`${selectorBase(rule.path)}/`) ||
        (selector.match === "prefix" && base === selectorBase(rule.path))
      )) ||
      (rule.match === "exact" && selector.match === "exact" && normalizedExact(rule.path) === base);
    if (!applies) continue;
    for (const header of rule.headers) merged.set(header.name.toLowerCase(), header);
  }
  return [...merged.values()];
}

function headerDirectives(headers, indent = "  ") {
  const lines = [];
  const contentType = headers.find((header) => header.name.toLowerCase() === "content-type");
  if (contentType) {
    lines.push(`${indent}types {}`);
    lines.push(`${indent}default_type ${quoted(contentType.value)};`);
  }
  for (const header of headers) {
    if (header.name.toLowerCase() === "content-type") continue;
    lines.push(`${indent}add_header ${header.name} ${quoted(header.value)} always;`);
  }
  return lines;
}

function allHeaderNames(contract) {
  const names = new Map();
  for (const rule of contract.headers) {
    for (const header of rule.headers) {
      if (header.name.toLowerCase() === "content-type") continue;
      names.set(header.name.toLowerCase(), header.name);
    }
  }
  return [...names.entries()].map(([lower, name]) => ({ lower, name }));
}

function requestUriRegex(selector) {
  const suffix = "(?:\\?.*)?$";
  if (selector.match === "exact") {
    const exact = normalizedExact(selector.path);
    return `~^${regexEscape(exact)}${exact === "/" ? "" : "/?"}${suffix}`;
  }
  const base = selectorBase(selector.path);
  return `~^${regexEscape(base)}/.*${suffix}`;
}

function headerValueForSelector(contract, selector, lowerName) {
  return effectiveHeadersForSelector(contract, selector).find(
    (header) => header.name.toLowerCase() === lowerName,
  )?.value;
}

function routeRegex(rule) {
  const path = rule.from.path;
  if (rule.from.match === "prefix") {
    const base = selectorBase(path);
    return `^${regexEscape(base)}/(.*)$`;
  }
  const exact = normalizedExact(path);
  if (exact === "/") return "^/$";
  return `^${regexEscape(exact)}/?$`;
}

function renderTemplate(raw, variables = {}) {
  const [withoutFragment, fragment = null] = raw.split("#", 2);
  const pieces = withoutFragment.split(":splat");
  let rendered = pieces.map(escapeLiteral).join(variables.splat || "");
  if (variables.query) rendered += "$is_args$args";
  if (fragment !== null) rendered += `#${escapeLiteral(fragment)}`;
  return rendered;
}

function absoluteRedirectTarget(contract, rule, splatVariable) {
  return renderTemplate(rule.to.raw, { splat: splatVariable, query: rule.preserveQuery });
}

function localRewriteTarget(rule, splatVariable) {
  return renderTemplate(rule.to.raw, { splat: splatVariable, query: false });
}

function renderTerminalAction(contract, rule, { indent = "  ", splatVariable = "$1", redirectResponse = null } = {}) {
  if (rule.action === "redirect") {
    if (!redirectResponse) throw new Error(`[HC_NGINX_REDIRECT_RESPONSE_MISSING] rule ${rule.order}`);
    return [
      `${indent}error_page 418 =${rule.status} ${redirectResponse};`,
      `${indent}return 418;`,
    ];
  }
  if (rule.action === "gone") return [`${indent}return 410;`];
  const target = localRewriteTarget(rule, splatVariable);
  return [
    `${indent}rewrite ^ "${target}" break;`,
  ];
}

function sameSelector(headerRule, route) {
  if (route.from.kind !== "path") return false;
  return headerRule.match === route.from.match && normalizedExact(headerRule.path) === normalizedExact(route.from.path);
}

function exactSelectorCapturedByWildcard(headerRule, routes) {
  if (headerRule.match !== "exact") return null;
  return routes.find(
    (route) =>
      route.from.kind === "path" &&
      route.from.match === "prefix" &&
      selectorContains({ path: route.from.path, match: "prefix" }, headerRule.path) &&
      !routes.some((candidate) => sameSelector(headerRule, candidate)),
  );
}

export function renderHeaders(contract) {
  const global = contract.headers.find((rule) => rule.match === "global");
  const lines = [
    BANNER,
    "# Include in nginx http context. Maps use the original request URI so custom 404/410 bodies",
    "# retain the headers of the requested path instead of those of /404.html.",
  ];
  const scoped = contract.headers
    .filter((rule) => rule.match !== "global")
    .sort((a, b) =>
      selectorBase(b.path).length - selectorBase(a.path).length ||
      (a.match === b.match ? 0 : a.match === "exact" ? -1 : 1) ||
      a.order - b.order,
    );
  for (const { lower, name } of allHeaderNames(contract)) {
    const defaultValue = global.headers.find((header) => header.name.toLowerCase() === lower)?.value || "";
    lines.push(`map $request_uri ${variableName(name)} {`);
    lines.push(`  default ${quoted(defaultValue)};`);
    for (const selector of scoped) {
      const value = headerValueForSelector(contract, selector, lower);
      if (value === undefined || value === defaultValue) continue;
      lines.push(`  ${requestUriRegex(selector)} ${quoted(value)};`);
    }
    lines.push("}", "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function redirectResponseDirectives(contract, indent = "  ") {
  const policy = contract.resolution.redirectResponses;
  const lines = [
    `${indent}types {}`,
    `${indent}default_type ${quoted(policy.contentType)};`,
  ];
  for (const { name } of allHeaderNames(contract)) {
    lines.push(`${indent}add_header ${name} ${variableName(name)} always;`);
  }
  return lines;
}

function redirectResponseLocation(contract, rule, responseName, splatVariable) {
  const target = absoluteRedirectTarget(contract, rule, splatVariable);
  const bodyTarget = renderTemplate(rule.to.raw, { splat: splatVariable, query: false });
  return [
    `location ${responseName} {`,
    ...redirectResponseDirectives(contract),
    `  add_header Location "${target}" always;`,
    `  return 200 "Redirecting to ${bodyTarget}";`,
    "}",
  ];
}

export function renderRedirects(contract) {
  const lines = [
    BANNER,
    "# Include inside the canonical nginx server block.",
    "# Netlify emits relative Location for same-origin rules and Pretty URL normalization.",
    "absolute_redirect off;",
    "",
  ];
  const hostRules = contract.routes.filter((rule) => rule.from.kind === "host");
  for (const rule of hostRules) {
    const hostLocation = `@confenge_host_contract_host_${rule.order}`;
    lines.push(`# rule ${rule.order}: ${rule.from.raw} -> ${rule.to.raw} ${rule.status}${rule.force ? "!" : ""}`);
    lines.push(`error_page 418 =${rule.status} ${hostLocation};`);
    lines.push(`if ($host = ${rule.from.host}) {`);
    lines.push("  return 418;");
    lines.push("}");
    lines.push(`location ${hostLocation} {`);
    lines.push(...redirectResponseDirectives(contract));
    lines.push(`  add_header Location "${escapeLiteral(rule.to.origin)}$request_uri" always;`);
    lines.push(`  return 200 "Redirecting to ${escapeLiteral(rule.to.origin)}$request_uri";`);
    lines.push("}", "");
  }

  const pathRules = contract.routes.filter((rule) => rule.from.kind === "path");
  for (const rule of pathRules) {
    const routeName = `@confenge_host_contract_rule_${rule.order}`;
    const responseName = `@confenge_host_contract_redirect_${rule.order}`;
    const captureVariable = `$confenge_splat_${rule.order}`;
    lines.push(`# rule ${rule.order}: ${rule.from.raw} -> ${rule.to.raw} ${rule.status}${rule.force ? "!" : ""}`);
    lines.push(`location ~ ${routeRegex(rule)} {`);
    if (rule.from.match === "prefix") lines.push(`  set ${captureVariable} $1;`);
    if (rule.force) {
      lines.push(...renderTerminalAction(contract, rule, {
        splatVariable: rule.from.match === "prefix" ? captureVariable : "",
        redirectResponse: responseName,
      }));
    } else {
      lines.push(`  try_files $uri $uri/ $uri.html $uri/index.html ${routeName};`);
    }
    lines.push("}");

    if (!rule.force) {
      lines.push(`location ${routeName} {`);
      lines.push(
        ...renderTerminalAction(contract, rule, {
          splatVariable: rule.from.match === "prefix" ? captureVariable : "",
          redirectResponse: responseName,
        }),
      );
      lines.push("}");
    }
    if (rule.action === "redirect") {
      lines.push(...redirectResponseLocation(
        contract,
        rule,
        responseName,
        rule.from.match === "prefix" ? captureVariable : "",
      ));
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderLocations(contract) {
  const pathRoutes = contract.routes.filter((rule) => rule.from.kind === "path");
  const lines = [
    BANNER,
    "# Include inside the canonical nginx server block after root is set.",
    "# Dynamic routes are emitted separately in runtime-locations.generated.conf.",
    "error_page 404 /404.html;",
    "error_page 410 /404.html;",
    "",
  ];

  for (const { name } of allHeaderNames(contract)) {
    lines.push(`add_header ${name} ${variableName(name)} always;`);
  }
  lines.push("");

  for (const headerRule of contract.headers) {
    if (headerRule.match === "global") continue;
    const contentType = headerRule.headers.find((header) => header.name.toLowerCase() === "content-type");
    if (!contentType) continue;
    if (pathRoutes.some((route) => sameSelector(headerRule, route))) {
      throw new Error(`[HC_CONTENT_TYPE_ROUTE_CONFLICT] ${headerRule.path} is both a route and Content-Type selector`);
    }
    const captured = exactSelectorCapturedByWildcard(headerRule, pathRoutes);
    if (captured) {
      throw new Error(
        `[HC_LOCATION_PRECEDENCE_CONFLICT] ${headerRule.path} would override ordered route ${captured.from.path}`,
      );
    }
    if (headerRule.match === "exact") {
      lines.push(`location = ${quoted(headerRule.path)} {`);
    } else {
      const base = selectorBase(headerRule.path);
      lines.push(`location ${quoted(`${base}/`)} {`);
    }
    lines.push("  types {}");
    lines.push(`  default_type ${quoted(contentType.value)};`);
    lines.push("  try_files $uri $uri/ $uri.html $uri/index.html =404;");
    lines.push("}", "");
  }

  lines.push("location / {");
  lines.push("  try_files $uri $uri/ $uri.html $uri/index.html =404;");
  lines.push("}");
  return `${lines.join("\n").trimEnd()}\n`;
}

function runtimeProxyDirectives(indent = "  ") {
  return [
    `${indent}proxy_pass http://confenge_web_runtime;`,
    `${indent}proxy_http_version 1.1;`,
    `${indent}proxy_set_header Host $host;`,
    `${indent}proxy_set_header X-Forwarded-For $remote_addr;`,
    `${indent}proxy_set_header X-Real-IP $remote_addr;`,
    `${indent}proxy_set_header X-Forwarded-Proto $scheme;`,
    `${indent}proxy_set_header X-Request-Id $request_id;`,
    `${indent}proxy_set_header Connection "";`,
    `${indent}proxy_intercept_errors off;`,
  ];
}

export function renderRuntimeUpstream(contract) {
  const { host, port } = contract.runtime.upstream;
  return `${[
    BANNER,
    "# Include in nginx http context. Netcup production has one canonical runtime upstream.",
    "upstream confenge_web_runtime {",
    `  server ${host}:${port};`,
    "  keepalive 16;",
    "}",
  ].join("\n")}\n`;
}

export function renderRuntimeLocations(contract) {
  const names = contract.runtime.httpFunctions.map(regexEscape).join("|");
  if (!names) throw new Error("[HC_RUNTIME_ALLOWLIST_EMPTY] no HTTP functions were discovered");
  const lines = [
    BANNER,
    "# Include inside the canonical server block before static locations.",
    `location ~ ^/(?:\\.netlify/functions|api/web)/(?:${names})$ {`,
    ...runtimeProxyDirectives(),
    "}",
    "",
  ];
  for (const path of ["/healthz", "/ready", "/runtime-identity", contract.runtime.identityPath]) {
    lines.push(`location = ${path} {`);
    lines.push(...runtimeProxyDirectives());
    lines.push("}", "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderNginx(contract) {
  return {
    "headers.generated.conf": renderHeaders(contract),
    "redirects.generated.conf": renderRedirects(contract),
    "runtime-upstream.generated.conf": renderRuntimeUpstream(contract),
    "runtime-locations.generated.conf": renderRuntimeLocations(contract),
    "locations.generated.conf": renderLocations(contract),
  };
}

export function writeRenderedContract({ root, outputDir }) {
  const { contract, contractHash } = buildHostContract(root);
  const contractJson = stableJson(contract);
  if (sha256(contractJson) !== contractHash) throw new Error("contract hash invariant failed");
  const outputs = {
    "contract.normalized.json": contractJson,
    "contract.sha256": `${contractHash}  contract.normalized.json\n`,
    ...renderNginx(contract),
  };
  const resolvedOutput = resolve(outputDir);
  mkdirSync(resolvedOutput, { recursive: true });
  for (const [name, body] of Object.entries(outputs)) {
    writeFileSync(resolve(resolvedOutput, name), body, { encoding: "utf8", mode: 0o644 });
  }
  const manifest = {
    schema: "confenge.http-host-contract-manifest/v1",
    contractHash,
    hostArchitectureVersion: contract.hostArchitectureVersion,
    state: contract.state,
    sources: contract.sources,
    outputs: Object.entries(outputs).map(([name, body]) => ({
      path: basename(name),
      sha256: sha256(body),
      bytes: Buffer.byteLength(body),
    })),
  };
  const manifestBody = stableJson(manifest);
  writeFileSync(resolve(resolvedOutput, "manifest.json"), manifestBody, { encoding: "utf8", mode: 0o644 });
  return {
    contract,
    contractHash,
    manifest,
    manifestHash: sha256(manifestBody),
    outputDir: resolvedOutput,
  };
}
