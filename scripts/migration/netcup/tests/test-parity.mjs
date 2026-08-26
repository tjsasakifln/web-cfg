import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { extractSeoSignals, sitemapUrlSet } from "../lib/html-seo.mjs";
import { compareResponses } from "../lib/parity.mjs";
import { createOriginClient } from "../lib/origin-client.mjs";

function response({ status = 200, headers = {}, body = "same" } = {}) {
  return { status, headers, body: Buffer.from(body), url: "http://origin.test/" };
}

const baseCase = { id: "fixture", path: "/", category: "test", expectedStatus: 200, bodyHash: true, seo: false };
const security = {
  "cache-control": "no-cache, max-age=0",
  "content-security-policy": "default-src 'self'; object-src 'none'",
  "strict-transport-security": "max-age=31536000",
  "content-type": "text/html; charset=utf-8",
};

test("parity comparator detects independent status/header/body regressions", () => {
  const left = response({ headers: security });
  const status = compareResponses(baseCase, left, response({ status: 404, headers: security }));
  assert(status.differences.some((diff) => diff.field === "status"));
  const header = compareResponses(baseCase, left, response({ headers: { ...security, "cache-control": "public, max-age=999" } }));
  assert(header.differences.some((diff) => diff.field === "header:cache-control"));
  const body = compareResponses(baseCase, left, response({ headers: security, body: "changed" }));
  assert(body.differences.some((diff) => diff.field === "body_sha256"));
});

test("volatile headers are explicitly excluded and additional headers are compared", () => {
  const left = response({ headers: { ...security, date: "one", server: "A" } });
  const right = response({ headers: { ...security, date: "two", server: "B" } });
  const clean = compareResponses(baseCase, left, right);
  assert.equal(clean.ok, true);
  assert.equal(clean.explicitlyExcludedHeaders.baseline.date, "response clock");
  const unknown = compareResponses(baseCase, left, response({ headers: { ...security, "x-mystery": "1" } }));
  assert(unknown.differences.some((diff) => diff.field === "additional_header:x-mystery"));
  const sameUnknown = compareResponses(
    baseCase,
    response({ headers: { ...security, "x-mystery": "1" } }),
    response({ headers: { ...security, "x-mystery": "1" } }),
  );
  assert.equal(sameUnknown.ok, true);
  assert.deepEqual(sameUnknown.additionalComparedHeaders, ["x-mystery"]);
});

test("material normalization ignores formatting but not semantics", () => {
  const left = response({ headers: security });
  const reordered = response({ headers: {
    ...security,
    "cache-control": "max-age=0,no-cache",
    "content-security-policy": "object-src 'none'; default-src 'self'",
  } });
  assert.equal(compareResponses(baseCase, left, reordered).ok, true);
});

test("HTTP pre-DNS mode sends canonical Host header", async () => {
  let observedHost = null;
  const server = createServer((request, reply) => {
    observedHost = request.headers.host;
    reply.writeHead(200, { "Content-Type": "text/plain" });
    reply.end("ok");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const port = server.address().port;
    const client = createOriginClient({
      label: "candidate",
      baseUrl: `http://127.0.0.1:${port}`,
      hostHeader: "confenge.com.br",
    });
    const result = await client.request("/probe?x=1");
    assert.equal(result.status, 200);
    assert.equal(observedHost, "confenge.com.br");
    assert.equal(client.evidenceMode, "http-origin-with-host-header");
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("HTTPS resolve mode refuses an HTTP URL and never offers insecure evidence", () => {
  assert.throws(
    () => createOriginClient({ label: "candidate", baseUrl: "http://confenge.com.br", resolveIp: "127.0.0.1" }),
    /requires an https base URL/,
  );
  assert.throws(
    () => createOriginClient({ label: "candidate", baseUrl: "https://confenge.com.br", resolveIp: "not-an-ip" }),
    /must be an IP address/,
  );
  assert.throws(
    () => createOriginClient({ label: "candidate", baseUrl: "https://candidate.example/path" }),
    /must be an http\(s\) origin/,
  );
});

test("SEO parser ignores tag-shaped script data and preserves canonical entities", () => {
  const html = `<!doctype html><html><head>
    <link rel="canonical alternate" href="https://confenge.com.br/page/?a=1&amp;b=2&amp;literal=&amp;quot;">
    <meta name="robots" content="follow, noindex">
    <script>const bait = '<meta name="robots" content="index">';</script>
    </head><body data-turnstile-sitekey="site-key"></body></html>`;
  const signals = extractSeoSignals(html);
  assert.deepEqual(signals.canonical, ["https://confenge.com.br/page/?a=1&b=2&literal=&quot;"]);
  assert.deepEqual(signals.metaRobots, ["follow,noindex"]);
  assert.deepEqual(signals.turnstileSiteKeys, ["site-key"]);
});

test("sitemap parser compares URL sets independent of XML order", () => {
  const one = sitemapUrlSet("<urlset><url><loc>https://confenge.com.br/b</loc></url><url><loc>https://confenge.com.br/a</loc></url></urlset>");
  const two = sitemapUrlSet("https://confenge.com.br/a\nhttps://confenge.com.br/b\n", "text/plain");
  assert.deepEqual(one, two);
});
