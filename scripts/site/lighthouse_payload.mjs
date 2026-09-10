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
 * LCP: the lab run is http://127.0.0.1 with sub-millisecond server latency.
 * Lighthouse's simulation adds the OBSERVED server latency of the origin to
 * every request on the critical path; on the edge that latency is geography
 * (runner → edge → origin) and not the artifact. In runtime mode the median
 * observed server latency (`network-server-latency`) is recorded as an explicit,
 * capped allowance; the budget number itself never changes and a missing
 * measurement yields no allowance at all. (`metrics.timeToFirstByte` is NOT
 * used: it is Lantern's simulated TTFB — ~450 ms with the mobile RTT — and is
 * the same in the lab and on the edge.)
 *
 * Protocol: Lantern models multiplexing only for `h2`; an `h3` (QUIC) session
 * is simulated as HTTP/1.1 with a TCP+TLS handshake per connection, which
 * inflated the edge LCP by ~300 ms on Cloudflare. The runner disables QUIC so
 * the edge is measured over HTTP/2, the protocol the simulator models; real
 * visitors on HTTP/3 do at least as well.
 */
import http from "node:http";
import https from "node:https";

export const ACCEPT_ENCODING = "gzip, deflate, br";
// Ceiling for the runtime allowance: observed origin latency is tens of ms on
// the edge; anything larger is an incident, not a budget.
export const LCP_ALLOWANCE_CAP_MS = 250;
const REFETCH_ATTEMPTS = 3;
const REFETCH_BACKOFF_MS = 1500;

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
export function fetchWireBodyBytes(url, options = {}) {
  return fetchWireBodyBytesOnce(url, options);
}

function fetchWireBodyBytesOnce(url, { timeoutMs = 20000, userAgent = "confenge-lighthouse-payload/1" } = {}) {
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
// A transient transport/edge answer (network error, 403/429/5xx) is retried
// before it counts as a failed measurement, so a challenge or a blip is
// distinguishable from a real regression; a stable non-200 still fails closed.
async function fetchWithRetry(fetcher, url, { attempts = REFETCH_ATTEMPTS, backoffMs = REFETCH_BACKOFF_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetcher(url);
      if (response.status === 200 || !(response.status === 403 || response.status === 429 || response.status >= 500)) return response;
      last = response;
    } catch (error) {
      last = { status: 0, bytes: 0, encoding: "identity", error: String(error?.message || error) };
    }
    if (attempt < attempts) await sleep(backoffMs * attempt);
  }
  return last;
}

export async function measureContentByteWeight(networkItems, origin, fetcher = fetchWireBodyBytes, retryOptions = {}) {
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
    const response = await fetchWithRetry(fetcher, request.url, retryOptions);
    if (response.status !== 200) {
      return { content_byte_weight: null, requests: measured, error: `payload refetch ${request.url} -> ${response.status}${response.error ? ` (${response.error})` : ""}` };
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
 * Measured network allowance for the LCP budget in runtime mode: the median
 * OBSERVED origin latency of the run (`network-server-latency`), capped at
 * LCP_ALLOWANCE_CAP_MS. Zero in lab mode, zero when the audit is absent.
 */
export function lcpNetworkAllowanceMs({ audits, runtimeMode }) {
  const observed = Number(audits?.["network-server-latency"]?.numericValue);
  const observedRtt = Number(audits?.["network-rtt"]?.numericValue);
  if (!runtimeMode) {
    return { allowance_ms: 0, observed_server_latency_ms: Number.isFinite(observed) ? observed : null, observed_rtt_ms: Number.isFinite(observedRtt) ? observedRtt : null, capped: false };
  }
  if (!Number.isFinite(observed) || observed < 0) {
    return { allowance_ms: 0, observed_server_latency_ms: null, observed_rtt_ms: Number.isFinite(observedRtt) ? observedRtt : null, capped: false };
  }
  const capped = observed > LCP_ALLOWANCE_CAP_MS;
  return {
    allowance_ms: Math.floor(Math.min(observed, LCP_ALLOWANCE_CAP_MS)),
    observed_server_latency_ms: observed,
    observed_rtt_ms: Number.isFinite(observedRtt) ? observedRtt : null,
    capped,
  };
}
