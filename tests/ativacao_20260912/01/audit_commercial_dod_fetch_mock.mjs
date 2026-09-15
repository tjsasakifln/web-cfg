import fs from "node:fs";

// Records every outbound request of scripts/money_asset/audit_commercial_dod.mjs.
// No request reaches the network: every URL gets a small in-process response.
const requests = [];
const scenario = process.env.COMMERCIAL_DOD_SCENARIO || "ready";
globalThis.fetch = async (url, options = {}) => {
  const target = new URL(url);
  const method = options.method || "GET";
  requests.push({ host: target.host, path: target.pathname, method, signal: Boolean(options.signal) });
  if (method !== "GET" && scenario === "inbound_hang") {
    return new Promise((resolve, reject) => {
      if (!options.signal) return reject(new Error("missing deadline"));
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  }
  if (method !== "GET") {
    return new Response("private-inbound-body-must-not-be-persisted", { status: 401 });
  }
  if (target.pathname === "/sitemap.xml") return new Response("<urlset/>", { status: 200 });
  if (target.pathname.endsWith(".json")) return new Response("{}", { status: 200 });
  return new Response("<html><body><section id=\"identificacao\">Utility</section></body></html>", { status: 200 });
};
process.on("exit", () => fs.writeFileSync(process.env.COMMERCIAL_DOD_TRACE_PATH, JSON.stringify(requests)));
