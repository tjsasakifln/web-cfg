import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  HostContractError,
  buildHostContract,
  mergeRedirectRules,
  parseHeaders,
  parseNetlifyRedirects,
  parseRedirects,
  sha256,
  stableJson,
} from "../lib/contract.mjs";
import {
  renderHeaders,
  renderLocations,
  renderNginx,
  renderRedirects,
  renderRuntimeLocations,
  renderRuntimeUpstream,
  writeRenderedContract,
} from "../lib/nginx.mjs";
import { sitemapUrlSet } from "../lib/html-seo.mjs";

const ROOT = resolve(new URL("../../../..", import.meta.url).pathname);
const FIXTURES = resolve(new URL("fixtures", import.meta.url).pathname);

function fixture(name) {
  return readFileSync(resolve(FIXTURES, name), "utf8");
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof HostContractError && error.code === code && error.message.includes(`[${code}]`));
}

/** Read one generated `map <source> <variable> { ... }` block back out. */
function mapBlock(rendered, variable) {
  const opening = ` ${variable} {\n`;
  const start = rendered.indexOf(opening);
  assert(start !== -1, `no map emits ${variable}`);
  const lineStart = rendered.lastIndexOf("\nmap ", start) + "\nmap ".length;
  const end = rendered.indexOf("\n}", start);
  return {
    source: rendered.slice(lineStart, start),
    entries: rendered
      .slice(start + opening.length, end)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parsed = line.match(/^(\S+)\s+"([\s\S]*)";$/);
        assert(parsed, `unparseable map entry for ${variable}: ${line}`);
        // Single-pass inverse of the renderer's escapeLiteral.
        return { key: parsed[1], value: parsed[2].replace(/\\(.)/g, "$1") };
      }),
  };
}

const DOCUMENT_MAP_SOURCE = '"$confenge_document_marker$request_uri"';

test("parses nominal 301, 302, 200 rewrite and 410 actions", () => {
  const inputs = [
    ["301.redirects", 301, "redirect"],
    ["302.redirects", 302, "redirect"],
    ["200-rewrite.redirects", 200, "rewrite"],
    ["410.redirects", 410, "gone"],
  ];
  for (const [name, status, action] of inputs) {
    const [rule] = parseRedirects(fixture(name), { source: name });
    assert.equal(rule.status, status);
    assert.equal(rule.action, action);
    assert.equal(rule.preserveQuery, status !== 410);
  }
});

test("preserves wildcard/splat mapping and rule order", () => {
  const rules = parseRedirects(`${fixture("301.redirects")}${fixture("wildcard.redirects")}`, { source: "ordered" });
  assert.deepEqual(rules.map((rule) => rule.order), [0, 1]);
  assert.equal(rules[1].from.match, "prefix");
  assert.equal(rules[1].to.usesSplat, true);
});

test("normalizes global/path headers, cache, content type and X-Robots", () => {
  const rules = parseHeaders(fixture("headers-valid.headers"), { source: "headers-valid" });
  assert.equal(rules[0].match, "global");
  assert.equal(rules[1].match, "prefix");
  assert.equal(rules[2].match, "exact");
  assert.equal(rules[1].headers[0].semantic, "cache-control");
  assert.equal(rules[2].headers.find((header) => header.semantic === "content-type").value, "text/plain; charset=utf-8");
  assert.equal(rules[2].headers.find((header) => header.semantic === "x-robots").value, "noindex, nofollow");
});

test("withdrawn prefixes return 410 without weakening redirect or rewrite mapping", () => {
  const [rule] = parseRedirects("/retired/* /404.html 410\n");
  assert.equal(rule.action, "gone");
  assert.equal(rule.from.match, "prefix");
  assert.equal(rule.to.usesSplat, false);
  assert.equal(rule.shadowPolicy, "rule-first");
  const { contract } = buildHostContract(ROOT);
  contract.routes = [rule];
  const output = renderRedirects(contract);
  assert.match(output, /return 410;/);
  assert.doesNotMatch(output, /add_header Location|rewrite \^/);
  assert.doesNotMatch(output, /try_files/);
  for (const status of [200, 301, 302]) {
    expectCode(() => parseRedirects(`/retired/* /404.html ${status}\n`), "HC_REDIRECT_SPLAT_UNSAFE");
  }
  expectCode(() => parseRedirects("/retired /target/:splat 410\n"), "HC_REDIRECT_SPLAT_UNSAFE");
  expectCode(() => parseRedirects("/retired https://example.com/gone 410\n"), "HC_GONE_TARGET_UNSUPPORTED");
});

test("accepts a long CSP without truncation", () => {
  const [global] = parseHeaders(fixture("csp-long.headers"), { source: "csp-long" });
  const csp = global.headers.find((header) => header.semantic === "csp").value;
  assert.match(csp, /sha256-bbbbb/);
  assert.match(csp, /upgrade-insecure-requests$/);
});

test("sitemap entity decoding is single-pass", () => {
  assert.deepEqual(
    sitemapUrlSet("<urlset><url><loc>https://confenge.com.br/x?a=1&amp;amp;b=2</loc></url></urlset>"),
    ["https://confenge.com.br/x?a=1&amp;b=2"],
  );
});

test("unsupported constructs hard fail with nominal messages", () => {
  expectCode(() => parseRedirects(fixture("unsupported.redirects"), { source: "unsupported" }), "HC_REDIRECT_ARITY_UNSUPPORTED");
  expectCode(() => parseRedirects("/x /y 307\n", { source: "status" }), "HC_REDIRECT_STATUS_UNSUPPORTED");
  expectCode(() => parseNetlifyRedirects(fixture("unsupported-netlify.toml"), { source: "netlify.toml" }), "HC_NETLIFY_REDIRECT_KEY_UNSUPPORTED");
});

test("malicious/invalid input and duplicate headers fail closed", () => {
  expectCode(() => parseHeaders(fixture("malicious.headers"), { source: "malicious" }), "HC_HEADER_SELECTOR_INVALID");
  expectCode(() => parseHeaders(fixture("duplicate.headers"), { source: "duplicate" }), "HC_HEADER_DUPLICATE");
  expectCode(() => parseHeaders("  X-Test: orphan\n", { source: "orphan" }), "HC_HEADER_ORPHAN");
  expectCode(() => parseHeaders("/*\n  X-Test: one\n/same\n  X-Test: two\n/same/\n  X-Test: three\n", { source: "normalized-duplicate" }), "HC_HEADER_SELECTOR_DUPLICATE");
  expectCode(() => parseRedirects("/encoded%2fpath /target 301\n", { source: "encoded" }), "HC_REDIRECT_SELECTOR_INVALID");
  expectCode(() => parseRedirects("/source /target;return 301\n", { source: "injected-target" }), "HC_REDIRECT_TARGET_INVALID");
});

test("duplicate/conflicting redirect sources are detected", () => {
  const primary = parseRedirects(fixture("conflict-primary.redirects"), { source: "primary" });
  const secondary = parseRedirects(fixture("conflict-secondary.redirects"), { source: "secondary" });
  expectCode(() => mergeRedirectRules(primary, secondary), "HC_REDIRECT_CONFLICT");
  const duplicatePrimary = parseRedirects("/same /one 301\n/same /one 301\n", { source: "duplicate" });
  expectCode(() => mergeRedirectRules(duplicatePrimary, []), "HC_REDIRECT_DUPLICATE");
  const normalizedDuplicate = parseRedirects("/same /one 301\n/same/ /two 302\n", { source: "normalized-duplicate" });
  expectCode(() => mergeRedirectRules(normalizedDuplicate, []), "HC_REDIRECT_DUPLICATE");
});

test("canonical contract deduplicates identical netlify.toml rule and covers required semantics", () => {
  const { contract, contractHash } = buildHostContract(ROOT);
  assert.match(contractHash, /^[a-f0-9]{64}$/);
  assert.equal(contract.canonical.origin, "https://confenge.com.br");
  assert.equal(contract.canonical.www.owner, "edge");
  assert.equal(contract.runtime.nginxProxyGenerated, true);
  assert.equal(contract.runtime.upstream.port, 18100);
  assert.equal(contract.runtime.storageContractVersion, "confenge-host-file-record/v1");
  assert.equal(contract.runtime.httpFunctions.includes("ops"), true);
  assert.equal(contract.runtime.httpFunctions.includes("search-observation-tick"), false);
  assert.equal(contract.resolution.prettyUrls.enabled, true);
  assert.equal(contract.resolution.custom404.status, 404);
  assert.equal(contract.resolution.redirectResponses.applyEffectiveRequestHeaders, true);
  assert.equal(contract.resolution.redirectResponses.contentType, "text/plain; charset=utf-8");
  assert.equal(contract.routes[0].provenance.length, 2);
  assert.equal(contract.routes.find((rule) => rule.from.raw === "/intranet").status, 302);
  assert.equal(contract.routes.find((rule) => rule.from.raw === "/obrigado").action, "rewrite");
  assert.equal(contract.routes.find((rule) => rule.from.raw === "/vision").action, "gone");
});

test("nginx output preserves fragments/query and emits only the explicit runtime allowlist", () => {
  const { contract } = buildHostContract(ROOT);
  const rendered = renderNginx(contract);
  const redirects = rendered["redirects.generated.conf"];
  const locations = rendered["locations.generated.conf"];
  assert.match(redirects, /add_header Location "\/\$is_args\$args#contato" always;/);
  assert.match(redirects, /servicos-obras-publicas/);
  assert.match(redirects, /add_header Location "https:\/\/ops\.confenge\.com\.br\/\$is_args\$args" always;/);
  assert.match(redirects, /return 410;/);
  assert.match(redirects, /rewrite \^ "\/obrigado\.html" break;/);
  assert.match(redirects, /error_page 418 =301 @confenge_host_contract_host_0;/);
  assert.match(redirects, /location @confenge_host_contract_host_0/);
  assert.match(redirects, /add_header Location "https:\/\/confenge\.com\.br\$request_uri" always;/);
  assert.match(redirects, /default_type "text\/plain; charset=utf-8";/);
  assert.match(redirects, /return 200 "Redirecting to https:\/\/confenge\.com\.br\$request_uri";/);
  assert.doesNotMatch(redirects, /proxy_pass|return 301 "https:\/\/ops[^\n]*intranet/);
  assert.match(locations, /error_page 404 \/404\.html;/);
  assert.match(locations, /try_files \$uri \$uri\/ \$uri\.html \$uri\/index\.html =404;/);
  // Adjusted: CSP is now a document-only header, so its map is keyed on the
  // document marker prefixed onto $request_uri instead of $request_uri alone.
  assert.match(rendered["headers.generated.conf"], /map "\$confenge_document_marker\$request_uri" \$confenge_header_content_security_policy/);
  assert.match(renderRuntimeUpstream(contract), /server 127\.0\.0\.1:18100;/);
  const runtimeLocations = renderRuntimeLocations(contract);
  assert.match(runtimeLocations, /\.netlify\/functions\|api\/web/);
  assert.match(runtimeLocations, /offer-checkout/);
  assert.match(runtimeLocations, /proxy_pass http:\/\/confenge_web_runtime;/);
  assert.match(runtimeLocations, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(runtimeLocations, /proxy_set_header X-Real-IP \$remote_addr;/);
  assert.match(runtimeLocations, /proxy_set_header X-Request-Id \$request_id;/);
  assert.doesNotMatch(runtimeLocations, /proxy_add_x_forwarded_for/);
  assert.doesNotMatch(runtimeLocations, /search-observation-tick/);
  assert.doesNotMatch(runtimeLocations, /location ~ \^\/\.netlify\/functions\/\.\*/);
});

test("host-only control artifacts are denied without removing them from the package", () => {
  const { contract } = buildHostContract(ROOT);
  const locations = renderLocations(contract);
  for (const path of ["/_headers", "/_redirects"]) {
    assert.match(
      locations,
      new RegExp(`location = "${path}" \\{\\n  return 404;\\n\\}`),
    );
    assert.match(
      locations,
      new RegExp(`location = "${path}/" \\{\\n  return 404;\\n\\}`),
    );
  }
});

test("nginx escaping keeps input values inside quoted arguments", () => {
  const { contract } = buildHostContract(ROOT);
  const clone = structuredClone(contract);
  clone.headers[0].headers.push({
    name: "X-Escape-Probe",
    value: '$uri"; return 200; #',
    semantic: "response-header",
    line: 1,
  });
  const rendered = renderHeaders(clone);
  assert.match(rendered, /\\\$uri\\"; return 200; #/);
  assert.equal((rendered.match(/map \$request_uri \$confenge_header_x_escape_probe/g) || []).length, 1);
});

test("long response headers are chunked below nginx's configuration token limit", () => {
  const value = "default-src 'self'; script-src 'self' " + "'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=' ".repeat(90);
  const contract = {
    headers: [
      {
        match: "global",
        headers: [{ name: "Content-Security-Policy", value }],
      },
    ],
    routes: [],
  };
  const headers = renderHeaders(contract);
  // Adjusted: both chunk maps are keyed on the document marker now. The chunks
  // must still concatenate to the exact same CSP bytes for a document.
  assert.match(headers, /map "\$confenge_document_marker\$request_uri" \$confenge_header_content_security_policy \{/);
  assert.match(headers, /map "\$confenge_document_marker\$request_uri" \$confenge_header_content_security_policy_part_1 \{/);
  const cspChunks = [
    mapBlock(headers, "$confenge_header_content_security_policy"),
    mapBlock(headers, "$confenge_header_content_security_policy_part_1"),
  ];
  assert.equal(
    cspChunks.map((chunk) => chunk.entries.find((entry) => entry.key === "~^html:").value).join(""),
    value,
    "a document must receive the global CSP byte-for-byte across both chunks",
  );
  for (const chunk of cspChunks) {
    assert.equal(chunk.entries.find((entry) => entry.key === "default").value, "");
  }
  for (const line of headers.split("\n")) {
    assert(Buffer.byteLength(line) < 4096, `nginx config line must stay below 4 KiB: ${Buffer.byteLength(line)}`);
  }
  assert.match(
    renderLocations(contract),
    /add_header Content-Security-Policy "\$confenge_header_content_security_policy\$confenge_header_content_security_policy_part_1" always;/,
  );
});

test("document-only headers render behind the document marker and default to empty", () => {
  const contract = {
    routes: [],
    headers: [
      {
        match: "global",
        order: 0,
        path: "/*",
        headers: [
          { name: "X-Frame-Options", value: "SAMEORIGIN" },
          { name: "X-Content-Type-Options", value: "nosniff" },
          { name: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { name: "Permissions-Policy", value: "camera=(), microphone=()" },
          { name: "Content-Security-Policy", value: "default-src 'self'" },
          { name: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
    ],
  };
  const rendered = renderHeaders(contract);
  // The marker is the only thing that reads the response Content-Type.
  assert.match(rendered, /map \$sent_http_content_type \$confenge_document_marker \{\n  default "";\n  "~\*\^text\/html" "html:";\n\}/);
  for (const [variable, value] of [
    ["$confenge_header_content_security_policy", "default-src 'self'"],
    ["$confenge_header_x_frame_options", "SAMEORIGIN"],
    ["$confenge_header_permissions_policy", "camera=(), microphone=()"],
    ["$confenge_header_referrer_policy", "strict-origin-when-cross-origin"],
  ]) {
    const block = mapBlock(rendered, variable);
    assert.equal(block.source, DOCUMENT_MAP_SOURCE, `${variable} must key on the document marker`);
    assert.deepEqual(block.entries, [
      { key: "default", value: "" },
      { key: "~^html:", value },
    ], `${variable} must be empty off a document and carry the global value on one`);
  }
  // A header a user agent honours off a document stays unconditional.
  for (const [variable, value] of [
    ["$confenge_header_strict_transport_security", "max-age=31536000; includeSubDomains; preload"],
    ["$confenge_header_x_content_type_options", "nosniff"],
  ]) {
    const block = mapBlock(rendered, variable);
    assert.equal(block.source, "$request_uri", `${variable} must not depend on the response Content-Type`);
    assert.deepEqual(block.entries, [{ key: "default", value }]);
  }
  assert.match(
    renderLocations(contract),
    /add_header Strict-Transport-Security \$confenge_header_strict_transport_security always;/,
  );
});

test("a scoped CSP override applies to documents only and never shadows the global entry", () => {
  const contract = {
    routes: [],
    headers: [
      {
        match: "global",
        order: 0,
        path: "/*",
        headers: [{ name: "Content-Security-Policy", value: "default-src 'self'" }],
      },
      {
        match: "exact",
        order: 1,
        path: "/relatorio",
        headers: [{ name: "Content-Security-Policy", value: "default-src 'none'" }],
      },
      {
        match: "prefix",
        order: 2,
        path: "/ops/*",
        headers: [{ name: "Content-Security-Policy", value: "default-src 'self' https://ops.confenge.com.br" }],
      },
    ],
  };
  const block = mapBlock(renderHeaders(contract), "$confenge_header_content_security_policy");
  assert.equal(block.source, DOCUMENT_MAP_SOURCE);
  // nginx takes the first matching regex, so the catch-all document entry has
  // to stay last; every scoped selector is anchored behind the same marker.
  assert.deepEqual(block.entries, [
    { key: "default", value: "" },
    { key: "~^html:/relatorio/?(?:\\?.*)?$", value: "default-src 'none'" },
    { key: "~^html:/ops/.*(?:\\?.*)?$", value: "default-src 'self' https://ops.confenge.com.br" },
    { key: "~^html:", value: "default-src 'self'" },
  ]);
});

test("exact header selectors are not overwritten by a same-base terminal wildcard", () => {
  const headers = parseHeaders(`/*
  Cache-Control: no-cache
/scope
  X-Robots-Tag: noindex
/scope/*
  X-Robots-Tag: nofollow
`, { source: "precedence" });
  const rendered = renderHeaders({ headers });
  assert(rendered.includes('~^/scope/?(?:\\?.*)?$ "noindex";'));
  assert(rendered.includes('~^/scope/.*(?:\\?.*)?$ "nofollow";'));
});

test("render is byte-deterministic and manifest binds every output", () => {
  const first = mkdtempSync(join(tmpdir(), "confenge-render-a-"));
  const second = mkdtempSync(join(tmpdir(), "confenge-render-b-"));
  try {
    const a = writeRenderedContract({ root: ROOT, outputDir: first });
    const b = writeRenderedContract({ root: ROOT, outputDir: second });
    assert.equal(a.contractHash, b.contractHash);
    assert.equal(a.manifestHash, b.manifestHash);
    const names = readdirSync(first).sort();
    assert.deepEqual(names, readdirSync(second).sort());
    for (const name of names) assert.deepEqual(readFileSync(resolve(first, name)), readFileSync(resolve(second, name)));
    const contractBytes = readFileSync(resolve(first, "contract.normalized.json"));
    assert.equal(sha256(contractBytes), a.contractHash);
    assert.equal(stableJson(a.manifest), readFileSync(resolve(first, "manifest.json"), "utf8"));
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test("production cutover keeps valuable checks and adds host-neutral identities", () => {
  const source = readFileSync(resolve(ROOT, "scripts/site/test_production_cutover.mjs"), "utf8");
  for (const retained of ["home_h1_service_scope", "css_sha256_matches_artifact", "gone_410", "sitemap_200", "public_release_result_matches_head"]) {
    assert.match(source, new RegExp(retained));
  }
  for (const evolved of ["artifact_hash_matches_expected", "artifact_hash_expected_required", "host_architecture_version_matches_expected", "runtime_identity_matches_expected", "requiresHostArchitecture ? HOST_ARCHITECTURE_VERSION", 'OPTIONS.phase === "candidate"']) {
    assert.match(source, new RegExp(evolved.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /arg\s*===\s*["']--insecure|args\.push\([^\n]*--insecure/);
  const originClient = readFileSync(resolve(ROOT, "scripts/migration/netcup/lib/origin-client.mjs"), "utf8");
  assert.doesNotMatch(originClient, /args\.push\([^\n]*(?:--insecure|["']-k["'])/);
});

// A default_type carrying "; charset=utf-8" is compared whole against gzip_types,
// so sitemaps, feeds and JSON indexes were served uncompressed on the Netcup
// origin while Netlify gzipped them. The public Content-Type must not change.
{
  const rendered = renderLocations({
    routes: [],
    hostArchitectureVersion: "confenge-nginx-node/v2",
    headers: [
      { match: "exact", path: "/sitemap.xml", headers: [{ name: "Content-Type", value: "application/xml; charset=utf-8" }] },
      { match: "exact", path: "/content-index.json", headers: [{ name: "Content-Type", value: "application/json; charset=utf-8" }] },
      { match: "exact", path: "/DEPLOY-CHECKLIST.txt", headers: [{ name: "Content-Type", value: "text/plain" }] },
    ],
  });
  assert.match(rendered, /default_type "application\/xml";\n\s+charset utf-8;\n\s+charset_types application\/xml;/);
  assert.match(rendered, /default_type "application\/json";\n\s+charset utf-8;\n\s+charset_types application\/json;/);
  assert.doesNotMatch(rendered, /default_type "[^"]*charset/, "charset must never stay inside default_type");
  // A type with no charset parameter emits no charset directives at all.
  assert.match(rendered, /default_type "text\/plain";\n\s+try_files/);
  console.log("PASS default_type_charset_split_keeps_gzip_matchable");
}
