/**
 * Read-only browser fixture for the fixed priority aditivo journey.
 *
 * The route, CTA and form are literals. Chromium may issue only same-origin
 * GET/HEAD requests; every mutation, analytics request and external request is
 * aborted before it reaches the network. No contact field is read or emitted.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const PRIORITY_ADITIVO_CONTRACT = "CONFENGE_PRIORITY_ADITIVO_PROOF/1.0";
export const PRIORITY_ADITIVO_ENTRY_PATH = "/conteudos/aditivo-empreitada-por-preco-global/";
export const PRIORITY_ADITIVO_CTA_SELECTOR =
  'a.button-secondary[data-destination-type="form"][href="/aditivos-obras-publicas/#captura-pilar"]';
export const PRIORITY_ADITIVO_FORM_PATH = "/aditivos-obras-publicas/";
export const PRIORITY_ADITIVO_FORM_SELECTOR =
  'form.pillar-capture-form[name="diagnostico-confenge"][data-asset-id="aditivos-obras-publicas"]';
export const PRIORITY_ADITIVO_CONTEXT_KEYS = Object.freeze([
  "asset_id", "cta_id", "route_family", "jornada", "estagio", "origem", "landing_page",
]);
export const PRIORITY_ADITIVO_CONTEXT = Object.freeze({
  asset_id: "aditivos-obras-publicas",
  cta_id: "aditivos-obras-publicas-handraise",
  route_family: "aditivos",
  jornada: "contrato",
  estagio: "aditivos-obras-publicas",
  origem: "aditivos-obras-publicas",
  landing_page: "/conteudos/aditivo-empreitada-por-preco-global/",
});

function exactContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).sort().join("\n") !== [...PRIORITY_ADITIVO_CONTEXT_KEYS].sort().join("\n")) {
    return null;
  }
  const out = {};
  for (const key of PRIORITY_ADITIVO_CONTEXT_KEYS) {
    const actual = value[key] == null ? null : String(value[key]);
    if (actual !== PRIORITY_ADITIVO_CONTEXT[key]) return null;
    out[key] = actual;
  }
  return out;
}

export function priorityAditivoContextSha256(context) {
  const exact = exactContext(context);
  return exact ? createHash("sha256").update(JSON.stringify(exact)).digest("hex") : null;
}

export function validatePriorityAditivoJourney(result, expectedSha) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, reason: "priority_browser_fixture_invalid" };
  }
  if (result.contract !== PRIORITY_ADITIVO_CONTRACT) {
    return { ok: false, reason: "priority_browser_fixture_contract_mismatch" };
  }
  if (!/^[0-9a-f]{40}$/.test(String(expectedSha || "")) || result.live_sha !== expectedSha) {
    return { ok: false, reason: "priority_browser_fixture_release_mismatch" };
  }
  const routeChecks = {
    entry_path: result.entry_path === PRIORITY_ADITIVO_ENTRY_PATH,
    cta_selector: result.cta_selector === PRIORITY_ADITIVO_CTA_SELECTOR,
    form_path: result.form_path === PRIORITY_ADITIVO_FORM_PATH,
    form_selector: result.form_selector === PRIORITY_ADITIVO_FORM_SELECTOR,
    target_path: result.target_path === PRIORITY_ADITIVO_FORM_PATH,
    target_hash: result.target_hash === "#captura-pilar",
    public_query: result.public_query === "",
    post_requests: result.post_requests === 0,
    mutation_requests: result.mutation_requests === 0,
    external_requests: result.external_requests === 0,
    analytics_requests_blocked:
      Number.isInteger(result.analytics_requests_blocked) && result.analytics_requests_blocked >= 0,
  };
  const invalidFields = Object.entries(routeChecks)
    .filter(([, valid]) => !valid)
    .map(([field]) => field);
  if (invalidFields.length) {
    return {
      ok: false,
      reason: "priority_browser_fixture_route_mismatch",
      invalid_fields: invalidFields,
    };
  }
  const context = exactContext(result.context);
  if (!context) return { ok: false, reason: "priority_browser_fixture_context_mismatch" };
  const contextSha256 = priorityAditivoContextSha256(context);
  if (result.context_sha256 !== contextSha256) {
    return { ok: false, reason: "priority_browser_fixture_hash_mismatch" };
  }
  return { ok: true, context, context_sha256: contextSha256 };
}

function executablePath() {
  const configured = String(process.env.CHROME_PATH || process.env.CHROME_BIN || "").trim();
  if (configured) return configured;
  if (process.platform === "win32") return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return "";
}

export async function capturePriorityAditivoJourney(baseArg, expectedShaArg) {
  const base = String(baseArg || "https://confenge.com.br").replace(/\/$/, "");
  const expectedSha = String(expectedShaArg || process.env.EXPECTED_SHA || "").trim();
  let parsedBase;
  try { parsedBase = new URL(base); } catch { throw new Error("base_url_invalid"); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsedBase.hostname);
  if (!local && base !== "https://confenge.com.br") throw new Error("canonical_base_required");
  if (!local && parsedBase.protocol !== "https:") throw new Error("https_required");
  if (local && !["http:", "https:"].includes(parsedBase.protocol)) throw new Error("local_protocol_invalid");
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error("expected_release_sha_required");

  const buildResponse = await fetch(`${base}/.well-known/build-info.json`);
  const build = await buildResponse.json().catch(() => ({}));
  if (!buildResponse.ok || String(build?.commit || "") !== expectedSha) {
    throw new Error("live_build_identity_mismatch");
  }

  const chrome = executablePath();
  if (!chrome) throw new Error("chrome_path_required");
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const mutationAttempts = [];
  const externalAttempts = [];
  let analyticsAttempts = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    await page.exposeFunction("__confengePriorityBlockedRequest", (kind, method) => {
      if (kind === "analytics") analyticsAttempts += 1;
      else mutationAttempts.push(String(method || "UNKNOWN").toUpperCase());
    });
    await page.evaluateOnNewDocument(() => {
      const classify = (raw) => {
        try { return new URL(String(raw || ""), window.location.href).pathname === "/api/web/collect" ? "analytics" : "mutation"; }
        catch { return "mutation"; }
      };
      const report = (raw, method) => {
        try { window.__confengePriorityBlockedRequest(classify(raw), method); } catch { /* binding unavailable */ }
      };
      const originalFetch = window.fetch;
      window.fetch = function priorityReadOnlyFetch(input, init) {
        const method = String(init?.method || input?.method || "GET").toUpperCase();
        if (!["GET", "HEAD"].includes(method)) {
          report(input?.url || input, method);
          return Promise.reject(new DOMException("Blocked by priority proof", "SecurityError"));
        }
        return originalFetch.apply(this, arguments);
      };
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function priorityReadOnlyOpen(method, url) {
        const verb = String(method || "GET").toUpperCase();
        if (!["GET", "HEAD"].includes(verb)) {
          report(url, verb);
          throw new DOMException("Blocked by priority proof", "SecurityError");
        }
        return originalOpen.apply(this, arguments);
      };
      try {
        Object.defineProperty(Navigator.prototype, "sendBeacon", {
          configurable: true,
          value(url) { report(url, "POST"); return true; },
        });
      } catch { /* CDP interception remains the backstop */ }
      const blockSubmit = function priorityReadOnlySubmit() {
        report(this?.action || window.location.href, "POST");
        throw new DOMException("Blocked by priority proof", "SecurityError");
      };
      HTMLFormElement.prototype.submit = blockSubmit;
      HTMLFormElement.prototype.requestSubmit = blockSubmit;
    });
    page.on("request", (request) => {
      const method = request.method().toUpperCase();
      let parsed;
      try { parsed = new URL(request.url()); } catch { parsed = null; }
      const sameOrigin = parsed?.origin === parsedBase.origin;
      if (!["GET", "HEAD"].includes(method)) {
        if (sameOrigin && parsed?.pathname === "/api/web/collect") analyticsAttempts += 1;
        else mutationAttempts.push(method);
        request.abort("blockedbyclient").catch(() => {});
      } else if (!sameOrigin) {
        externalAttempts.push(method);
        request.abort("blockedbyclient").catch(() => {});
      } else {
        request.continue().catch(() => {});
      }
    });

    await page.goto(`${base}${PRIORITY_ADITIVO_ENTRY_PATH}`, { waitUntil: "networkidle2" });
    const cta = await page.$eval(PRIORITY_ADITIVO_CTA_SELECTOR, (element) => ({
      href: element.getAttribute("href"),
      destination_type: element.getAttribute("data-destination-type"),
      journey: element.getAttribute("data-journey"),
      tema: element.getAttribute("data-tema"),
      origem: element.getAttribute("data-origem"),
    }));
    const expectedCta = {
      href: "/aditivos-obras-publicas/#captura-pilar",
      destination_type: "form",
      journey: "contrato",
      tema: "Aditivo em empreitada global",
      origem: PRIORITY_ADITIVO_ENTRY_PATH,
    };
    if (JSON.stringify(cta) !== JSON.stringify(expectedCta)) {
      throw new Error("priority_aditivo_cta_fixture_mismatch");
    }
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click(PRIORITY_ADITIVO_CTA_SELECTOR),
    ]);
    const target = new URL(page.url());
    if (target.origin !== parsedBase.origin || target.pathname !== PRIORITY_ADITIVO_FORM_PATH || target.hash !== "#captura-pilar") {
      throw new Error("priority_aditivo_form_route_mismatch");
    }
    await page.waitForSelector(PRIORITY_ADITIVO_FORM_SELECTOR);
    const browserState = await page.$eval(
      PRIORITY_ADITIVO_FORM_SELECTOR,
      (form, keys) => {
        const data = new FormData(form);
        const context = {};
        for (const key of keys) {
          const values = data.getAll(key);
          if (values.length !== 1 || typeof values[0] !== "string" || values[0] === "") {
            throw new Error(`invalid_priority_technical_field:${key}`);
          }
          context[key] = key === "landing_page"
            ? new URL(values[0], window.location.href).pathname
            : values[0];
        }
        return {
          context,
          target_path: window.location.pathname,
          target_hash: window.location.hash,
          public_query: window.location.search,
        };
      },
      PRIORITY_ADITIVO_CONTEXT_KEYS,
    );
    if (mutationAttempts.length) throw new Error("browser_mutation_forbidden");
    if (externalAttempts.length) throw new Error("browser_external_request_forbidden");
    const contextSha256 = priorityAditivoContextSha256(browserState.context);
    if (!contextSha256) {
      const mismatch = PRIORITY_ADITIVO_CONTEXT_KEYS.filter(
        (key) => browserState.context[key] !== PRIORITY_ADITIVO_CONTEXT[key],
      );
      throw new Error(`priority_aditivo_form_context_mismatch:${mismatch.join(",")}`);
    }
    const result = {
      ok: true,
      contract: PRIORITY_ADITIVO_CONTRACT,
      live_sha: expectedSha,
      entry_path: PRIORITY_ADITIVO_ENTRY_PATH,
      cta_selector: PRIORITY_ADITIVO_CTA_SELECTOR,
      form_path: PRIORITY_ADITIVO_FORM_PATH,
      form_selector: PRIORITY_ADITIVO_FORM_SELECTOR,
      target_path: browserState.target_path,
      target_hash: browserState.target_hash,
      public_query: browserState.public_query,
      post_requests: mutationAttempts.filter((method) => method === "POST").length,
      mutation_requests: mutationAttempts.length,
      external_requests: externalAttempts.length,
      analytics_requests_blocked: analyticsAttempts,
      context: browserState.context,
      context_sha256: contextSha256,
    };
    const validated = validatePriorityAditivoJourney(result, expectedSha);
    if (!validated.ok) {
      const fields = validated.invalid_fields?.length ? `:${validated.invalid_fields.join(",")}` : "";
      throw new Error(`${validated.reason}${fields}`);
    }
    return result;
  } finally {
    await browser.close();
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  try {
    const result = await capturePriorityAditivoJourney(process.argv[2], process.env.EXPECTED_SHA);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      state: "BLOCKED_BEFORE_POST",
      reason: String(error?.message || "priority_browser_journey_failed").slice(0, 160),
    }));
    process.exitCode = 1;
  }
}
