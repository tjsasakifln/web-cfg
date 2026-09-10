import assert from "node:assert/strict";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import {
  LCP_ALLOWANCE_CAP_MS,
  fetchWireBodyBytes,
  headerByteWeight,
  lcpNetworkAllowanceMs,
  measureContentByteWeight,
} from "./lighthouse_payload.mjs";

// A server that behaves like the canonical edge: gzip bodies and a 6 KB
// header on every response. The content budget must see only the bodies.
const bigHeader = "x".repeat(6000);
const html = Buffer.from(`<!doctype html><title>t</title>${"<p>conteudo</p>".repeat(400)}`);
const css = Buffer.from(`${".a{color:red}".repeat(800)}`);
const png = Buffer.alloc(973, 7);
const gz = (body) => gzipSync(body, { level: 6 });
const server = createServer((req, res) => {
  const route = req.url.split("?")[0];
  const table = { "/": [html, "text/html"], "/styles.css": [css, "text/css"], "/favicon.png": [png, "image/png", false] };
  const entry = table[route];
  if (!entry) { res.writeHead(404, { "content-security-policy": bigHeader }); res.end("nope"); return; }
  const [body, type, compress = true] = entry;
  const payload = compress ? gz(body) : body;
  res.writeHead(200, {
    "content-type": type,
    "content-security-policy": bigHeader,
    ...(compress ? { "content-encoding": "gzip" } : {}),
  });
  res.end(payload);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

try {
  const home = await fetchWireBodyBytes(`${origin}/`);
  assert.equal(home.status, 200);
  assert.equal(home.bytes, gz(html).length, "wire bytes are the compressed body, not the raw body");
  assert.equal(home.encoding, "gzip");

  const items = [
    { url: `${origin}/`, statusCode: 200, transferSize: gz(html).length + 6100, resourceSize: html.length, finished: true },
    { url: `${origin}/styles.css`, statusCode: 200, transferSize: gz(css).length + 6100, resourceSize: css.length, finished: true },
    { url: `${origin}/favicon.png`, statusCode: 200, transferSize: 973 + 6100, resourceSize: 973, finished: true },
    { url: `${origin}/styles.css`, statusCode: 200, transferSize: 1, resourceSize: 1, finished: true }, // duplicate URL
    { url: "https://challenges.cloudflare.com/turnstile/v0/api.js", statusCode: 200, transferSize: 50000, finished: true }, // third party
    { url: `${origin}/missing.js`, statusCode: 404, transferSize: 6200, finished: true },
  ];
  const measured = await measureContentByteWeight(items, origin);
  assert.equal(measured.error, null);
  assert.equal(measured.requests.length, 3, "first-party 200 responses, de-duplicated");
  assert.equal(measured.content_byte_weight, gz(html).length + gz(css).length + 973);
  const transferTotal = items.slice(0, 3).reduce((sum, item) => sum + item.transferSize, 0);
  assert.ok(headerByteWeight(transferTotal, measured.content_byte_weight) >= 18000, "header overhead is reported, not hidden");
  assert.ok(measured.content_byte_weight < transferTotal - 18000, "the content budget ignores ~6 KB of headers per response");

  // Fail closed: a response that no longer answers 200 invalidates the measurement.
  const broken = await measureContentByteWeight(
    [{ url: `${origin}/gone.css`, statusCode: 200, transferSize: 10, finished: true }],
    origin,
  );
  assert.equal(broken.content_byte_weight, null);
  assert.match(broken.error, /payload refetch .*-> 404/);

  // Network allowance: zero in lab mode; the OBSERVED origin latency on the
  // edge (network-server-latency), capped, and zero when not measured.
  // metrics.timeToFirstByte is Lantern's SIMULATED TTFB (~450 ms in the lab
  // too) and must never feed the allowance.
  const edgeAudits = { metrics: { details: { items: [{ timeToFirstByte: 456 }] } }, "network-rtt": { numericValue: 22 }, "network-server-latency": { numericValue: 7.6 } };
  assert.equal(lcpNetworkAllowanceMs({ audits: edgeAudits, runtimeMode: false }).allowance_ms, 0, "lab mode never has an allowance");
  const edge = lcpNetworkAllowanceMs({ audits: edgeAudits, runtimeMode: true });
  assert.equal(edge.allowance_ms, 7, "the allowance is the observed origin latency, floored");
  assert.equal(edge.capped, false);
  const simulatedOnly = { metrics: { details: { items: [{ timeToFirstByte: 450 }] } }, "network-rtt": { numericValue: 0.9 } };
  assert.equal(lcpNetworkAllowanceMs({ audits: simulatedOnly, runtimeMode: true }).allowance_ms, 0, "the simulated TTFB buys nothing");
  assert.equal(lcpNetworkAllowanceMs({ audits: {}, runtimeMode: true }).allowance_ms, 0, "no measurement, no allowance");
  const slowOrigin = lcpNetworkAllowanceMs({ audits: { "network-server-latency": { numericValue: 900 } }, runtimeMode: true });
  assert.equal(slowOrigin.allowance_ms, LCP_ALLOWANCE_CAP_MS, "an incident-sized latency is capped, not credited");
  assert.equal(slowOrigin.capped, true);
  assert.equal(lcpNetworkAllowanceMs({ audits: { "network-server-latency": { numericValue: -5 } }, runtimeMode: true }).allowance_ms, 0);

  // Transient edge answers are retried; a stable non-200 still fails closed.
  {
    let calls = 0;
    const flaky = async () => { calls += 1; return calls < 3 ? { status: 429, bytes: 0, encoding: "identity" } : { status: 200, bytes: 321, encoding: "gzip" }; };
    const recovered = await measureContentByteWeight([{ url: `${origin}/x.css`, statusCode: 200, transferSize: 1, finished: true }], origin, flaky, { sleep: async () => {} });
    assert.equal(recovered.content_byte_weight, 321);
    assert.equal(calls, 3);
    let stableCalls = 0;
    const stable = async () => { stableCalls += 1; return { status: 403, bytes: 0, encoding: "identity" }; };
    const refused = await measureContentByteWeight([{ url: `${origin}/y.css`, statusCode: 200, transferSize: 1, finished: true }], origin, stable, { sleep: async () => {} });
    assert.equal(refused.content_byte_weight, null);
    assert.match(refused.error, /-> 403/);
    assert.equal(stableCalls, 3);
  }
  console.log("LIGHTHOUSE_PAYLOAD_OK", JSON.stringify({ content: measured.content_byte_weight, transfer: transferTotal }));
} finally {
  server.close();
}
