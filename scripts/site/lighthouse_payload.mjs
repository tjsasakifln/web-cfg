/**
 * Payload and network semantics shared by the local Lighthouse gate and the
 * post-promote runtime acceptance, so that the same artifact is judged by the
 * same yardstick on the lab server and on the public edge.
 *
 * Why this exists (2026-09-10, netcup-release run 34501989732): Lighthouse's
 * `total-byte-weight` sums `transferSize`, which counts response HEADERS as
 * well as bodies. The lab server sends ~150 bytes of headers per response; the
 * canonical edge sent ~6 KB (a 5.3 KB Content-Security-Policy on every asset,
 * plus Cloudflare's NEL/Report-To). The very same artifact measured 153,642
 * bytes locally and 201,033 bytes on the edge, with zero third-party
 * requests. A performance budget limits what the visitor downloads as content;
 * header overhead is a host-contract concern with its own gate
 * (scripts/migration/netcup/validate-nginx.mjs). So the budget compares
 * CONTENT bytes: the compressed body of every first-party response the page
 * loaded, re-fetched with the same Accept-Encoding and counted on the wire.
 *
 * LCP: the lab run is http://127.0.0.1 with a ~2 ms TTFB. Lighthouse's
 * simulation (mobile, 150 ms RTT) adds the OBSERVED server latency of the
 * document and one extra RTT for TLS on https origins. Those two terms are
 * infrastructure (edge geography, origin distance, TLS), not the artifact. In
 * runtime mode they are measured from the run itself and recorded as an
 * explicit allowance; the budget number is never changed.
 */
import http from "node:http";
import https from "node:https";

export const ACCEPT_ENCODING = "gzip, deflate, br";
export const SIMULATED_RTT_MS = 150;

function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/**
 * Count the bytes of the response BODY exactly as sent (compressed when the
 * server compresses). Node's http/https clients do not decode bodies, so the
 * chunk lengths are the wire bytes of the entity, without headers or framing.
 */
export function fetchWireBodyBytes(url, { timeoutMs = 20000, userAgent = "confenge-lighthouse-payload/1" } = {}) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolvePromise, reject) => {
    const request = client.request(
      target,
      { method: "GET", headers: { "accept-encoding": ACCEPT_ENCODING, "user-agent": userAgent } },
      (response) => {
        let bytes = 0;
        response.on("data", (chunk) => { bytes += chunk.length; });
        response.on("end", () => resolvePromise({
          status: response.statusCode,
          bytes,
          encoding: response.headers["content-encoding"] || "identity",
        }));
        response.on("error", reject);
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`payload fetch timeout: ${url}`)));
    request.on("error", reject);
    request.end();
  });
}

/**
 * Content payload of a Lighthouse run: every finished first-party 200 response
 * from the `network-requests` audit, re-fetched and measured on the wire.
 * Fails closed: a request that cannot be re-fetched with the same status makes
 * the measurement invalid (null) instead of silently shrinking the total.
 */
export async function measureContentByteWeight(networkItems, origin, fetcher = fetchWireBodyBytes) {
  const seen = new Set();
  const requests = [];
  for (const item of networkItems || []) {
    const url = String(item?.url || "");
    if (!url || seen.has(url) || !sameOrigin(url, origin)) continue;
    if (Number(item.statusCode) !== 200 || item.finished === false) continue;
    seen.add(url);
    requests.push({ url, transfer_size: Number(item.transferSize) || 0, resource_size: Number(item.resourceSize) || 0 });
  }
  let contentBytes = 0;
  const measured = [];
  for (const request of requests) {
    const response = await fetcher(request.url);
    if (response.status !== 200) {
      return { content_byte_weight: null, requests: measured, error: `payload refetch ${request.url} -> ${response.status}` };
    }
    contentBytes += response.bytes;
    measured.push({ ...request, content_bytes: response.bytes, encoding: response.encoding });
  }
  return { content_byte_weight: contentBytes, requests: measured, error: null };
}

/**
 * Header overhead is what transferSize adds on top of content. It is reported
 * for evidence and gated by the host-contract E2E, never by the content budget.
 */
export function headerByteWeight(totalByteWeight, contentByteWeight) {
  if (!Number.isFinite(totalByteWeight) || !Number.isFinite(contentByteWeight)) return null;
  return Math.max(0, totalByteWeight - contentByteWeight);
}

/**
 * Measured network allowance for the LCP budget in runtime mode:
 * observed document server latency (TTFB minus one observed RTT) plus one
 * simulated RTT for TLS when the origin is https. Zero in lab mode.
 */
export function lcpNetworkAllowanceMs({ audits, origin, runtimeMode }) {
  if (!runtimeMode) return { allowance_ms: 0, observed_ttfb_ms: null, observed_rtt_ms: null, tls_rtt_ms: 0 };
  const metrics = audits?.metrics?.details?.items?.[0] || {};
  const observedTtfb = Number(metrics.timeToFirstByte);
  const observedRtt = Number(audits?.["network-rtt"]?.numericValue);
  const serverLatency = Number.isFinite(observedTtfb)
    ? Math.max(0, observedTtfb - (Number.isFinite(observedRtt) ? observedRtt : 0))
    : 0;
  const tlsRtt = /^https:/i.test(String(origin)) ? SIMULATED_RTT_MS : 0;
  return {
    allowance_ms: Math.round(serverLatency + tlsRtt),
    observed_ttfb_ms: Number.isFinite(observedTtfb) ? observedTtfb : null,
    observed_rtt_ms: Number.isFinite(observedRtt) ? observedRtt : null,
    tls_rtt_ms: tlsRtt,
  };
}
