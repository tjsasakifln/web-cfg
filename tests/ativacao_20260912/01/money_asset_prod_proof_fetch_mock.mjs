import fs from "node:fs";

const requests = [];
const scenario = process.env.MONEY_PROOF_SCENARIO || "ready";
// Shorten only this child's deadline so the body-hang regression stays fast.
const realSetTimeout = globalThis.setTimeout;
if (scenario === "body_timeout" || scenario === "sitemap_timeout") {
  globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms === 8000 ? 5 : ms, ...args);
}
globalThis.fetch = async (url, options = {}) => {
  const target = new URL(url);
  requests.push({ path: target.pathname, method: options.method || "GET", authorization: Boolean(new Headers(options.headers).get("authorization")) });
  if (scenario === "network_error" || (scenario === "sitemap_throw" && target.pathname === "/sitemap.xml")) throw new Error("private-upstream-error-must-not-be-printed");
  if (scenario === "body_timeout" || (scenario === "sitemap_timeout" && target.pathname === "/sitemap.xml")) {
    return {
      status: 200,
      headers: new Headers(),
      text: () => new Promise((resolve, reject) => {
        if (!options.signal) return reject(new Error("missing deadline"));
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    };
  }
  if (target.pathname === "/sitemap.xml") {
    return new Response("<urlset/>", { status: scenario === "sitemap_error" ? 503 : 200 });
  }
  return new Response('<meta name="robots" content="noindex"><section id="identificacao">Utility</section><section id="segunda-leitura">Pedir uma segunda leitura do contrato</section>');
};
process.on("exit", () => fs.writeFileSync(process.env.MONEY_PROOF_TRACE_PATH, JSON.stringify(requests)));
