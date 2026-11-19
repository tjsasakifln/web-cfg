import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { evaluateHomeAcquisition } from "../../../site/home_acquisition_contract.mjs";

import {
  HostContractError,
  buildHostContract,
  mergeRedirectRules,
  mergePublishedFreecadCacheRules,
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

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const FIXTURES = fileURLToPath(new URL("fixtures/", import.meta.url));

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

/** Resolve emitted header maps as nginx does for a response's URI/type. */
function renderedHeaderValue(rendered, variable, requestUri, contentType) {
  const variables = [...rendered.matchAll(/^map [^\n]+ (\$[a-z0-9_]+) \{$/gm)]
    .map((match) => match[1])
    .filter((name) => name === variable || name.startsWith(`${variable}_part_`));
  assert(variables.length, `no emitted map for ${variable}`);
  return variables.map((name) => {
    const block = mapBlock(rendered, name);
    const key = block.source === DOCUMENT_MAP_SOURCE && /^text\/html/i.test(contentType)
      ? `html:${requestUri}` : requestUri;
    const match = block.entries.find((entry) => entry.key.startsWith("~")
      && new RegExp(entry.key.slice(1)).test(key));
    return (match || block.entries.find((entry) => entry.key === "default")).value;
  }).join("");
}

function publishedFreecadFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "confenge-freecad-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {};
  for (const name of ["FreeCAD.js", "FreeCAD.wasm", "FreeCAD.data"]) {
    const bytes = Buffer.from(`contract fixture: ${name}`);
    const hash = sha256(bytes);
    const path = `/assets/freecad/FreeCAD-${hash.slice(0, 12)}.${name.split(".")[1]}`;
    const target = resolve(root, "_site", path.slice(1));
    mkdirSync(resolve(root, "_site/assets/freecad"), { recursive: true });
    writeFileSync(target, bytes);
    files[name] = { path, size: bytes.length, sha256: hash, url: `https://fixture.invalid/${name}` };
  }
  const pin = { schema: "confenge.freecad-runtime/v1", version: "fixture", files, adapted_sources: { installer: "private" } };
  const published = { schema: pin.schema, version: pin.version, files: structuredClone(files) };
  mkdirSync(resolve(root, "scripts/freecad"), { recursive: true });
  writeFileSync(resolve(root, "scripts/freecad/runtime.json"), JSON.stringify(pin));
  writeFileSync(resolve(root, "_site/assets/freecad/runtime.json"), JSON.stringify(published));
  writeFileSync(resolve(root, "_site/index.html"), "<!doctype html><title>Published fixture</title>");
  const headers = parseHeaders(`/*
  Cache-Control: no-cache, max-age=0, must-revalidate, no-transform
/assets/freecad/*
  Cache-Control: public, max-age=0, must-revalidate, no-transform
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
${files["FreeCAD.js"].path}
  Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'
${files["FreeCAD.wasm"].path}
  Content-Type: application/wasm
`);
  return { root, pin, published, headers };
}

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
  assert.match(locations, /location = "\/manifest\.webmanifest" \{\n\s+types \{\}\n\s+default_type "application\/manifest\+json";/);
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
  assert.match(runtimeLocations, /location = \/\.netlify\/functions\/tool-credits \{\n  client_max_body_size 4m;/);
  assert.match(runtimeLocations, /location = \/api\/web\/tool-credits \{\n  client_max_body_size 4m;/);
  const runtimeBlocks = [...runtimeLocations.matchAll(/location ([^\n]+) \{\n([\s\S]*?)\n\}/g)];
  const signedWebhookLocations = [];
  for (const name of ["tool-credits-webhook", "project-orders-webhook"]) {
    for (const prefix of ["/.netlify/functions", "/api/web"]) {
      const selector = `= ${prefix}/${name}`;
      signedWebhookLocations.push(selector);
      const block = runtimeBlocks.find(([, candidate]) => candidate === selector)?.[2];
      assert.equal(typeof block, "string", selector);
      assert.match(block, /client_max_body_size 64k;/);
      assert.match(block, /proxy_set_header X-Request-Id \$http_x_request_id;/);
      assert.doesNotMatch(block, /proxy_set_header X-Request-Id \$request_id;/);
    }
  }
  assert.deepEqual(runtimeBlocks
    .filter(([, , block]) => /proxy_set_header X-Request-Id \$http_x_request_id;/.test(block))
    .map(([, selector]) => selector).sort(), signedWebhookLocations.sort());
  const genericRuntime = runtimeBlocks.find(([, selector]) =>
    selector.startsWith("~ ^/(?:\\.netlify/functions|api/web)/"))?.[2];
  assert.equal(typeof genericRuntime, "string");
  assert.match(genericRuntime, /proxy_set_header X-Request-Id \$request_id;/);
  assert.doesNotMatch(genericRuntime, /proxy_set_header X-Request-Id \$http_x_request_id;/);
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

test("field kit cards redirect only the 74 named packs to the catalogue", () => {
  const { contract } = buildHostContract(ROOT);
  const output = renderRuntimeLocations(contract);
  assert.equal(contract.runtime.cadFieldIds.length, 74);
  for (const id of contract.runtime.cadFieldIds) {
    assert.ok(output.includes("location = /library/kits/" + id + " {"));
    assert.ok(output.includes('return 302 "/cad/aplicativos/?area=' + id + '#pacotes";'));
  }
  assert.ok(!output.includes("location /library/"));
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

test("pinned FreeCAD and imported EPANET workers receive their exact CSP on JavaScript responses", () => {
  const headers = parseHeaders(readFileSync(resolve(ROOT, "_headers"), "utf8"));
  const rendered = renderHeaders({ headers });
  const policies = [
    ["/assets/freecad/FreeCAD-3f8c1ff4a0ee.js", "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'"],
    ["/ferramentas/epanet-inp/worker.mjs", "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'; object-src 'none'; base-uri 'none'"],
  ];
  for (const [path, policy] of policies) {
    for (const requestUri of [path, `${path}?probe=worker-policy`]) {
      assert.equal(
        renderedHeaderValue(rendered, "$confenge_header_content_security_policy", requestUri, "application/javascript"),
        policy,
        `${requestUri} must receive the worker policy from the emitted maps`,
      );
    }
  }
  for (const path of [
    "/assets/freecad/FreeCAD.js",
    "/assets/freecad/FreeCAD-ffffffffffff.js",
    "/assets/freecad/FreeCAD-3f8c1ff4a0ee.js.map",
    "/assets/freecad/FreeCAD-fafb7fb93d7c.wasm",
    "/ferramentas/epanet-inp/app.mjs",
    "/ferramentas/epanet-inp/engine.mjs",
    "/ferramentas/epanet-inp/worker.mjs/other",
  ]) {
    assert.equal(
      renderedHeaderValue(rendered, "$confenge_header_content_security_policy", path, "application/javascript"),
      "",
      `${path} must not inherit a worker execution exception`,
    );
  }
});

test("FreeCAD isolation headers survive the renderer on documents and binary/script assets", () => {
  const headers = parseHeaders(readFileSync(resolve(ROOT, "_headers"), "utf8"));
  const rendered = renderHeaders({ headers });
  for (const path of ["/cad/freecad/", "/cad/freecad/index.html"]) {
    assert.equal(renderedHeaderValue(rendered, "$confenge_header_cross_origin_opener_policy", path, "text/html"), "same-origin");
    assert.equal(renderedHeaderValue(rendered, "$confenge_header_cross_origin_embedder_policy", path, "text/html"), "require-corp");
  }
  for (const [path, type] of [
    ["/assets/freecad/FreeCAD-3f8c1ff4a0ee.js", "application/javascript"],
    ["/assets/freecad/FreeCAD-fafb7fb93d7c.wasm", "application/wasm"],
    ["/assets/freecad/FreeCAD-e3cae3720c2f.data", "application/octet-stream"],
  ]) {
    assert.equal(renderedHeaderValue(rendered, "$confenge_header_cross_origin_embedder_policy", path, type), "require-corp");
    assert.equal(renderedHeaderValue(rendered, "$confenge_header_cross_origin_resource_policy", path, type), "same-origin");
    assert.equal(renderedHeaderValue(rendered, "$confenge_header_x_robots_tag", path, type), "noindex");
  }
});

test("published FreeCAD cache composes exact selectors and binds both manifests", (t) => {
  const { root, pin, headers } = publishedFreecadFixture(t);
  const original = structuredClone(headers);
  const result = mergePublishedFreecadCacheRules(root, headers);
  assert.equal(new Set(result.headers.map((rule) => rule.path)).size, result.headers.length);
  for (const rule of original) {
    const updated = result.headers.find((entry) => entry.path === rule.path);
    for (const header of rule.headers) assert.deepEqual(updated.headers.find((entry) => entry.name === header.name), header);
  }
  const rendered = renderHeaders({ headers: result.headers });
  for (const file of Object.values(pin.files)) {
    const rule = result.headers.find((entry) => entry.path === file.path);
    assert.equal(rule.headers.filter((header) => header.name.toLowerCase() === "cache-control").length, 1);
    assert.equal(renderedHeaderValue(rendered, "$confenge_header_cache_control", file.path, "application/octet-stream"), "public, max-age=31536000, immutable");
    assert.ok(rule.provenance.some((entry) => entry.source === "_site/assets/freecad/runtime.json"));
  }
  for (const path of ["/", "/assets/freecad/runtime.json"]) {
    const cache = renderedHeaderValue(rendered, "$confenge_header_cache_control", path, "text/html");
    assert.match(cache, /max-age=0/);
    assert.doesNotMatch(cache, /immutable/);
  }
  assert.deepEqual(result.sources.map((source) => source.path), ["scripts/freecad/runtime.json", "_site/assets/freecad/runtime.json"]);
  for (const source of result.sources) assert.equal(source.sha256, sha256(readFileSync(resolve(root, source.path))));
  const once = stableJson(result.headers);
  assert.equal(stableJson(mergePublishedFreecadCacheRules(root, result.headers).headers), once);
});

test("source-only CSS fixtures remain valid but a published artifact needs FreeCAD", (t) => {
  const root = mkdtempSync(join(tmpdir(), "confenge-freecad-source-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const headers = parseHeaders("/*\n  Cache-Control: no-cache\n");
  assert.deepEqual(mergePublishedFreecadCacheRules(root, headers), { headers, sources: [] });
  mkdirSync(resolve(root, "_site/.well-known"), { recursive: true });
  writeFileSync(resolve(root, "_site/.well-known/css-assets.json"), '{"files":{}}');
  assert.deepEqual(mergePublishedFreecadCacheRules(root, headers), { headers, sources: [] });
  writeFileSync(resolve(root, "_site/.well-known/build-info.json"), "{}");
  expectCode(() => mergePublishedFreecadCacheRules(root, headers), "HC_FREECAD_MANIFEST_MISSING");
});

test("complete host-contract render carries published FreeCAD cache and source attestations", (t) => {
  const { root, pin } = publishedFreecadFixture(t);
  const inputs = ["_headers", "_redirects", "netlify.toml", "404.html", "robots.txt", ".well-known/README.md", "runtime/contract.json",
    ...readdirSync(resolve(ROOT, "netlify/functions")).filter((name) => name.endsWith(".cjs")).map((name) => `netlify/functions/${name}`),
    ...readdirSync(ROOT).filter((name) => /^sitemap(?:-[a-z0-9-]+)?\.(?:xml|txt)$/i.test(name)),
  ];
  for (const path of inputs) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(resolve(ROOT, path)));
  }
  const realPin = JSON.parse(readFileSync(resolve(ROOT, "scripts/freecad/runtime.json"), "utf8"));
  let headers = readFileSync(resolve(root, "_headers"), "utf8");
  for (const name of Object.keys(pin.files)) headers = headers.replaceAll(realPin.files[name].path, pin.files[name].path);
  writeFileSync(resolve(root, "_headers"), headers);
  const { contract } = buildHostContract(root);
  for (const path of ["scripts/freecad/runtime.json", "_site/assets/freecad/runtime.json"]) {
    assert.equal(contract.sources.find((source) => source.path === path)?.sha256, sha256(readFileSync(resolve(root, path))));
  }
  const outputDir = resolve(root, "host-output");
  const first = writeRenderedContract({ root, outputDir });
  const second = writeRenderedContract({ root, outputDir });
  assert.equal(first.contractHash, second.contractHash);
  assert.equal(first.manifestHash, second.manifestHash);
  const manifest = JSON.parse(readFileSync(resolve(outputDir, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.sources, contract.sources);
  const rendered = readFileSync(resolve(outputDir, "headers.generated.conf"), "utf8");
  for (const file of Object.values(pin.files)) {
    assert.equal(renderedHeaderValue(rendered, "$confenge_header_cache_control", file.path, "application/octet-stream"), "public, max-age=31536000, immutable");
  }
});

test("published FreeCAD manifests must match the pin without extra or missing files", (t) => {
  for (const mutate of [
    (manifest) => { manifest.version = "unreviewed"; },
    (manifest) => { manifest.files["FreeCAD.js"].sha256 = "0".repeat(64); },
    (manifest) => { manifest.files["FreeCAD.wasm"].size += 1; },
    (manifest) => { delete manifest.files["FreeCAD.data"]; },
    (manifest) => { manifest.files.extra = manifest.files["FreeCAD.js"]; },
  ]) {
    const { root, headers, published } = publishedFreecadFixture(t);
    mutate(published);
    writeFileSync(resolve(root, "_site/assets/freecad/runtime.json"), JSON.stringify(published));
    expectCode(() => mergePublishedFreecadCacheRules(root, headers), "HC_FREECAD_MANIFEST_MISMATCH");
  }
});

test("FreeCAD pins reject non-string hashes and unsafe content-addressed paths", (t) => {
  for (const mutate of [
    (file) => { file.sha256 = [file.sha256]; },
    (file) => { file.path = "/assets/freecad/../mutable.js"; },
  ]) {
    const { root, headers, pin, published } = publishedFreecadFixture(t);
    mutate(pin.files["FreeCAD.js"]);
    published.files = structuredClone(pin.files);
    writeFileSync(resolve(root, "scripts/freecad/runtime.json"), JSON.stringify(pin));
    writeFileSync(resolve(root, "_site/assets/freecad/runtime.json"), JSON.stringify(published));
    expectCode(() => mergePublishedFreecadCacheRules(root, headers), "HC_FREECAD_PIN_INVALID");
  }
});

test("FreeCAD cache refuses absent or truncated published files without mutating headers", (t) => {
  for (const absent of [true, false]) {
    const { root, headers, pin } = publishedFreecadFixture(t);
    const target = resolve(root, "_site", pin.files["FreeCAD.data"].path.slice(1));
    if (absent) rmSync(target);
    else writeFileSync(target, "truncated");
    const original = stableJson(headers);
    expectCode(() => mergePublishedFreecadCacheRules(root, headers), "HC_FREECAD_ASSET_INVALID");
    assert.equal(stableJson(headers), original);
  }
});

test("FreeCAD cache preserves compatible authored directives and rejects conflicts", (t) => {
  for (const value of ["IMMUTABLE, public, max-age=31536000, no-transform,", "private, no-store"]) {
    const { root, headers, pin } = publishedFreecadFixture(t);
    const rule = headers.find((entry) => entry.path === pin.files["FreeCAD.js"].path);
    rule.headers.push({ name: "cache-control", value, semantic: "cache-control", line: 1 });
    if (value.includes("private")) {
      const original = stableJson(headers);
      expectCode(() => mergePublishedFreecadCacheRules(root, headers), "HC_FREECAD_CACHE_CONFLICT");
      assert.equal(stableJson(headers), original);
    } else {
      mergePublishedFreecadCacheRules(root, headers);
      assert.deepEqual(rule.headers.filter((header) => header.name.toLowerCase() === "cache-control").map((header) => header.value), [value]);
    }
  }
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

test("production home acceptance requires institutional scope, attributed paths and persisted proposal", () => {
  const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
  assert.deepEqual(evaluateHomeAcquisition(html), {
    headingScope: true, executionScope: true, amplitudeScope: true, processScope: true, deliveryProof: true,
    discoveryPaths: true, proposalPath: true,
  });
  for (const [old, replacement, field] of [
    ["necessidades públicas e privadas", "projetos privados", "headingScope"],
    ["Projetos e serviços de", "Atuação para", "headingScope"],
    ["A CONFENGE elabora e coordena projetos", "A CONFENGE apresenta serviços", "executionScope"],
    ["Desenvolvemos projetos, planilhas e laudos", "Desenvolvemos documentos técnicos", "executionScope"],
    ["para apoiar a contratação e a execução do empreendimento.", "ao longo do trabalho.", "executionScope"],
    ["Conduzir e integrar", "Conduzir", "processScope"],
    ["critérios de medição explícitos", "informações disponíveis", "deliveryProof"],
    ["com quantidades vinculadas aos desenhos", "com referências disponíveis", "deliveryProof"],
    ["reúnem verificações e fundamentação técnica", "reúnem informações técnicas", "deliveryProof"],
    ["Documentação técnica que sustenta", "Caso real de sucesso: documentação técnica que sustenta", "deliveryProof"],
    ['data-cta-id="home-service-projects"', 'data-cta-id="outro"', "discoveryPaths"],
    ['href="/inspecao-diagnostico-edificacoes/"', 'href="/x/"', "discoveryPaths"],
    ['data-cta-position="home_services"', 'data-cta-position="outro"', "discoveryPaths"],
    ['href="#contato"', 'href="/triagem-tecnica/"', "proposalPath"],
    ['data-receipt-required="true"', 'data-receipt-required="false"', "proposalPath"],
    ['data-ajax="true"', 'data-ajax="false"', "proposalPath"],
    ['data-capture-form', 'data-capture-form-disabled', "proposalPath"],
    ['name="diagnostico-b2g"', 'name="outro"', "proposalPath"],
    ['data-cta-position="hero"', 'data-cta-position="hero" data-email="test@example.invalid"', "proposalPath"],
  ]) {
    assert.ok(html.includes(old), old);
    assert.equal(evaluateHomeAcquisition(html.replaceAll(old, replacement))[field], false, field);
  }
  const scope = html.match(/<ul\b[^>]*class="[^"]*\bhome-opening__scope\b[^"]*"[^>]*>[\s\S]*?<\/ul>/i)?.[0];
  assert.ok(scope);
  for (const need of ["Projetos", "Orçamento", "Inspeção", "perícia", "Avaliação", "SST", "Obras públicas"]) {
    assert.ok(scope.includes(need), need);
    const missingNeed = html.replace(scope, scope.replace(need, "Apoio"));
    assert.equal(evaluateHomeAcquisition(missingNeed).amplitudeScope, false, `missing visible need: ${need}`);
    assert.equal(evaluateHomeAcquisition(missingNeed + `<footer>${need}</footer>`).amplitudeScope, false, `footer cannot supply ${need}`);
  }
  assert.equal(evaluateHomeAcquisition(html.replace(scope, scope.replace("SST", "Segurança do trabalho"))).amplitudeScope, true);
  for (const hidden of [' hidden', ' aria-hidden="true"']) {
    assert.equal(evaluateHomeAcquisition(html.replace(scope, scope.replace("<ul", `<ul${hidden}`))).amplitudeScope, false);
    assert.equal(evaluateHomeAcquisition(html.replace(scope, scope.replace("<li", `<li${hidden}`))).amplitudeScope, false, "hidden list item cannot supply a service need");
  }
  assert.equal(evaluateHomeAcquisition(html.replace(scope, `<script type="application/json">${scope}</script>`)).amplitudeScope, false, "metadata cannot supply the visible scope");

  const deliveryIds = ["home-delivery-coordination", "home-delivery-budget", "home-delivery-documents"];
  const deliveryArticles = [];
  for (const id of deliveryIds) {
    const article = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)].map((match) => match[0])
      .find((value) => value.includes(`data-cta-id="${id}"`));
    assert.ok(article, id);
    deliveryArticles.push(article);
    assert.equal(evaluateHomeAcquisition(html.replace(article, "")).deliveryProof, false, `missing delivery: ${id}`);
    assert.equal(evaluateHomeAcquisition(html.replace(article, article.replace("<article", "<article hidden"))).deliveryProof, false, `hidden delivery: ${id}`);
    assert.ok(article.includes("<p>"), id);
    assert.equal(evaluateHomeAcquisition(html.replace(article, article.replace("<p>", "<p hidden>"))).deliveryProof, false, `hidden technical content: ${id}`);
    const anchor = article.match(/<a\b[^>]*>[\s\S]*?<\/a>/i)?.[0];
    assert.ok(anchor, id);
    assert.equal(evaluateHomeAcquisition(html.replace(anchor, anchor.replace("<a", "<a hidden"))).deliveryProof, false, `hidden delivery link: ${id}`);
    const emptyPromise = `<article><h3>Entrega técnica</h3><p>Documentação conforme o escopo.</p>${anchor}</article>`;
    assert.equal(evaluateHomeAcquisition(html.replace(article, emptyPromise)).deliveryProof, false, `content-free delivery: ${id}`);
    assert.equal(evaluateHomeAcquisition(html.replace(anchor, anchor.replace(/href="[^"]+"/, 'href="/x/"'))).deliveryProof, false, `wrong delivery destination: ${id}`);
  }
  const combinedContent = deliveryArticles.map((article) => article.replace(/^<article\b[^>]*>|<\/article>$/gi, "")).join("\n");
  const collapsedCards = deliveryArticles.slice(1).reduce((source, article) => source.replace(article, ""), html)
    .replace(deliveryArticles[0], `<article>${combinedContent}</article><article></article><article></article>`);
  assert.equal(evaluateHomeAcquisition(collapsedCards).deliveryProof, false, "three placeholders cannot replace three distinct technical deliveries");
  for (const [id, field] of [["home-service-projects", "discoveryPaths"], [null, "proposalPath"], ...deliveryIds.map((id) => [id, "deliveryProof"])]) {
    const anchor = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0])
      .find((value) => id ? value.includes(`data-cta-id="${id}"`) : value.includes('data-cta-position="hero"') && value.includes("button-primary"));
    assert.ok(anchor);
    const eventless = anchor.replace('data-event-name="cta_click"', '');
    const openingEnd = eventless.indexOf(">");
    assert.ok(openingEnd > 0);
    const moved = eventless.slice(0, openingEnd + 1) + '<span data-event-name="cta_click"></span>' + eventless.slice(openingEnd + 1);
    assert.equal(evaluateHomeAcquisition(html.replace(anchor, moved))[field], false, field);
  }
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
  assert.ok(rendered.includes("types { application/javascript mjs; application/wasm wasm; }\n  gzip_types application/javascript application/wasm;"));
  // A type with no charset parameter emits no charset directives at all.
  assert.match(rendered, /default_type "text\/plain";\n\s+try_files/);
  console.log("PASS default_type_charset_split_keeps_gzip_matchable");
}
