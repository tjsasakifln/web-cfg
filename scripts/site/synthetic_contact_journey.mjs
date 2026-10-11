/**
 * Read-only browser fixture for the controlled specialized-contact proof.
 *
 * It follows one fixed public CTA and returns only the technical FormData
 * fields needed by the authenticated synthetic probe. The browser never
 * submits the form and any unexpected POST fails the journey.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const SPECIALIZED_QA_CONTRACT = "CONFENGE_SPECIALIZED_CONTACT_QA/1.0";
export const SPECIALIZED_QA_ENTRY_PATH = "/servicos/#servico-sst";
export const SPECIALIZED_QA_CTA_SELECTOR = '[data-hub-link="servicos-sst-labor-assistance"]';
export const SPECIALIZED_QA_CONTEXT_KEYS = Object.freeze([
  "asset_id",
  "cta_id",
  "route_family",
  "jornada",
  "estagio",
  "origem",
  "landing_page",
  "source_origin_asset_id",
  "source_origin_route_family",
  "tema",
]);
export const SPECIALIZED_QA_WIRE_CONTEXT_KEYS = Object.freeze(
  SPECIALIZED_QA_CONTEXT_KEYS.filter((key) => key !== "origem"),
);
export const SPECIALIZED_QA_CONTEXT = Object.freeze({
  asset_id: "home-institutional",
  cta_id: "home-proposal-submit",
  route_family: "home",
  jornada: "pericia",
  estagio: "perícia, assistência técnica ou avaliação",
  origem: "/servicos/",
  landing_page: "/servicos/",
  source_origin_asset_id: null,
  source_origin_route_family: "servicos-corporativos",
  tema: "Assistência técnica trabalhista em SST",
});

function exactContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).sort().join("\n") !== [...SPECIALIZED_QA_CONTEXT_KEYS].sort().join("\n")) {
    return null;
  }
  const out = {};
  for (const key of SPECIALIZED_QA_CONTEXT_KEYS) {
    const actual = value[key] == null ? null : String(value[key]);
    const expected = SPECIALIZED_QA_CONTEXT[key];
    if (actual !== expected) return null;
    out[key] = actual;
  }
  return out;
}

export function specializedQaContextSha256(context) {
  const exact = exactContext(context);
  if (!exact) return null;
  return createHash("sha256").update(JSON.stringify(exact)).digest("hex");
}

export function specializedQaWireContextSha256(context) {
  const exact = exactContext(context);
  if (!exact) return null;
  const projection = Object.fromEntries(
    SPECIALIZED_QA_WIRE_CONTEXT_KEYS.map((key) => [key, exact[key]]),
  );
  return createHash("sha256").update(JSON.stringify(projection)).digest("hex");
}

export function validateSpecializedQaJourney(result, expectedSha) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, reason: "browser_fixture_invalid" };
  }
  if (result.contract !== SPECIALIZED_QA_CONTRACT) {
    return { ok: false, reason: "browser_fixture_contract_mismatch" };
  }
  if (!/^[0-9a-f]{40}$/.test(String(expectedSha || "")) || result.live_sha !== expectedSha) {
    return { ok: false, reason: "browser_fixture_release_mismatch" };
  }
  const routeChecks = {
    entry_path: result.entry_path === SPECIALIZED_QA_ENTRY_PATH,
    cta_selector: result.cta_selector === SPECIALIZED_QA_CTA_SELECTOR,
    target_path: result.target_path === "/",
    target_hash: result.target_hash === "#contato",
    public_query: result.public_query === "",
    post_requests: result.post_requests === 0,
    mutation_requests: result.mutation_requests === 0,
    external_requests: result.external_requests === 0,
    captcha_sitekey_configured: result.captcha_sitekey_configured === true,
    captcha_loader_present: result.captcha_loader_present === true,
    captcha_widget_requests_blocked: result.captcha_widget_requests_blocked === 1,
    analytics_requests_blocked:
      Number.isInteger(result.analytics_requests_blocked) && result.analytics_requests_blocked >= 0,
  };
  const invalidFields = Object.entries(routeChecks)
    .filter(([, valid]) => !valid)
    .map(([field]) => field);
  if (invalidFields.length) {
    return {
      ok: false,
      reason: "browser_fixture_route_mismatch",
      invalid_fields: invalidFields,
    };
  }
  const context = exactContext(result.context);
  if (!context) return { ok: false, reason: "browser_fixture_context_mismatch" };
  const contextSha256 = specializedQaContextSha256(context);
  if (result.context_sha256 !== contextSha256) {
    return { ok: false, reason: "browser_fixture_hash_mismatch" };
  }
  return { ok: true, context, context_sha256: contextSha256 };
}

function executablePath() {
  const configured = String(process.env.CHROME_PATH || process.env.CHROME_BIN || "").trim();
  if (configured) return configured;
  if (process.platform === "win32") {
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }
  return "";
}

export async function captureSpecializedQaJourney(baseArg, expectedShaArg) {
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
  const liveSha = String(build && build.commit || "");
  if (!buildResponse.ok || liveSha !== expectedSha) throw new Error("live_build_identity_mismatch");

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
  let captchaWidgetAttempts = 0;
  let resolveCaptchaWidgetAttempt;
  const captchaWidgetAttemptObserved = new Promise((resolveObserved) => {
    resolveCaptchaWidgetAttempt = resolveObserved;
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    // Install the deny gate before the first navigation. Merely noticing a
    // POST after Chromium has put it on the wire is too late for a read-only
    // proof. Only same-origin GET/HEAD resources are allowed; mutation,
    // analytics and external channel requests are aborted in Chromium.
    await page.setRequestInterception(true);
    await page.exposeFunction("__confengeQaBlockedRequest", (kind, method) => {
      if (kind === "analytics") analyticsAttempts += 1;
      else mutationAttempts.push(String(method || "UNKNOWN").toUpperCase());
    });
    await page.evaluateOnNewDocument(() => {
      const classify = (raw) => {
        try { return new URL(String(raw || ""), window.location.href).pathname === "/api/web/collect" ? "analytics" : "mutation"; }
        catch { return "mutation"; }
      };
      const report = (raw, method) => {
        try { window.__confengeQaBlockedRequest(classify(raw), method); } catch { /* binding unavailable */ }
      };
      const originalFetch = window.fetch;
      window.fetch = function qaReadOnlyFetch(input, init) {
        const method = String(init?.method || input?.method || "GET").toUpperCase();
        if (!["GET", "HEAD"].includes(method)) {
          report(input?.url || input, method);
          return Promise.reject(new DOMException("Blocked by controlled QA", "SecurityError"));
        }
        return originalFetch.apply(this, arguments);
      };
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function qaReadOnlyOpen(method, url) {
        const verb = String(method || "GET").toUpperCase();
        if (!["GET", "HEAD"].includes(verb)) {
          report(url, verb);
          throw new DOMException("Blocked by controlled QA", "SecurityError");
        }
        return originalOpen.apply(this, arguments);
      };
      try {
        Object.defineProperty(Navigator.prototype, "sendBeacon", {
          configurable: true,
          value(url) { report(url, "POST"); return true; },
        });
      } catch { /* CDP interception remains the backstop */ }
      const blockSubmit = function qaReadOnlySubmit() {
        report(this?.action || window.location.href, "POST");
        throw new DOMException("Blocked by controlled QA", "SecurityError");
      };
      HTMLFormElement.prototype.submit = blockSubmit;
      HTMLFormElement.prototype.requestSubmit = blockSubmit;
    });
    page.on("request", (request) => {
      const method = request.method().toUpperCase();
      let sameOrigin = false;
      let path = "";
      let requestUrl = "";
      try {
        const parsed = new URL(request.url());
        requestUrl = parsed.href;
        sameOrigin = parsed.origin === parsedBase.origin;
        path = parsed.pathname;
      } catch { sameOrigin = false; }
      if (!["GET", "HEAD"].includes(method)) {
        if (sameOrigin && path === "/api/web/collect") analyticsAttempts += 1;
        else mutationAttempts.push(method);
        request.abort("blockedbyclient").catch(() => {});
        return;
      }
      if (!sameOrigin) {
        if (
          method === "GET" &&
          requestUrl === "https://challenges.cloudflare.com/turnstile/v0/api.js"
        ) {
          captchaWidgetAttempts += 1;
          resolveCaptchaWidgetAttempt();
          request.abort("blockedbyclient").catch(() => {});
          return;
        }
        externalAttempts.push(method);
        request.abort("blockedbyclient").catch(() => {});
        return;
      }
      request.continue().catch(() => {});
    });
    await page.goto(`${base}${SPECIALIZED_QA_ENTRY_PATH}`, { waitUntil: "networkidle2" });
    const cta = await page.$eval(SPECIALIZED_QA_CTA_SELECTOR, (element) => ({
      href: element.getAttribute("href"),
      journey: element.getAttribute("data-journey"),
      route_family: element.getAttribute("data-route-family"),
      tema: element.getAttribute("data-tema"),
      origem: element.getAttribute("data-origem"),
      origin_url: element.getAttribute("data-origin-url"),
    }));
    const expectedCta = {
      href: "/#contato",
      journey: "pericia",
      route_family: "servicos-corporativos",
      tema: SPECIALIZED_QA_CONTEXT.tema,
      origem: "/servicos/",
      origin_url: "/servicos/",
    };
    if (JSON.stringify(cta) !== JSON.stringify(expectedCta)) throw new Error("specialized_cta_fixture_mismatch");

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click(SPECIALIZED_QA_CTA_SELECTOR),
    ]);
    await page.waitForSelector('form[data-capture-form][name="diagnostico-b2g"]');
    await page.$eval(
      'form[data-capture-form][name="diagnostico-b2g"]',
      (form) => form.scrollIntoView({ block: "center" }),
    );
    await page.waitForFunction(
      (expectedTheme) => {
        const form = document.querySelector('form[data-capture-form][name="diagnostico-b2g"]');
        if (!form) return false;
        const data = new FormData(form);
        return data.get("tema") === expectedTheme && data.get("jornada") === "pericia";
      },
      {},
      SPECIALIZED_QA_CONTEXT.tema,
    );
    try {
      await page.waitForFunction(() => {
        const slot = document.getElementById("turnstile-slot");
        const key = String(slot?.getAttribute("data-turnstile-sitekey") || "").trim();
        const loader = document.querySelector(
          'script[data-confenge-turnstile="1"][src="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
        );
        return key.length >= 10 && key !== "SITEKEY" && Boolean(loader);
      }, { timeout: 5000 });
    } catch {
      throw new Error("captcha_widget_loader_missing");
    }
    if (captchaWidgetAttempts === 0) {
      let timeoutId;
      try {
        await Promise.race([
          captchaWidgetAttemptObserved,
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("captcha_widget_request_missing")), 5000);
          }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const browserState = await page.evaluate((keys) => {
      const form = document.querySelector('form[data-capture-form][name="diagnostico-b2g"]');
      const data = new FormData(form);
      const context = {};
      for (const key of keys) {
        const values = data.getAll(key);
        if (values.length > 1) throw new Error(`duplicate_technical_field:${key}`);
        if (values.length && typeof values[0] !== "string") throw new Error(`non_text_technical_field:${key}`);
        context[key] = values.length && values[0] !== "" ? values[0] : null;
      }
      return {
        context,
        target_path: window.location.pathname,
        target_hash: window.location.hash,
        public_query: window.location.search,
        captcha_sitekey_configured: (() => {
          const slot = document.getElementById("turnstile-slot");
          const key = String(slot?.getAttribute("data-turnstile-sitekey") || "").trim();
          return key.length >= 10 && key !== "SITEKEY";
        })(),
        captcha_loader_present: Boolean(document.querySelector(
          'script[data-confenge-turnstile="1"][src="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
        )),
      };
    }, SPECIALIZED_QA_CONTEXT_KEYS);
    if (mutationAttempts.length) throw new Error("browser_mutation_forbidden");
    if (externalAttempts.length) throw new Error("browser_external_request_forbidden");

    const contextSha256 = specializedQaContextSha256(browserState.context);
    if (!contextSha256) throw new Error("specialized_form_context_mismatch");
    const result = {
      ok: true,
      contract: SPECIALIZED_QA_CONTRACT,
      live_sha: liveSha,
      entry_path: SPECIALIZED_QA_ENTRY_PATH,
      cta_selector: SPECIALIZED_QA_CTA_SELECTOR,
      target_path: browserState.target_path,
      target_hash: browserState.target_hash,
      public_query: browserState.public_query,
      post_requests: mutationAttempts.filter((method) => method === "POST").length,
      mutation_requests: mutationAttempts.length,
      external_requests: externalAttempts.length,
      analytics_requests_blocked: analyticsAttempts,
      captcha_sitekey_configured: browserState.captcha_sitekey_configured,
      captcha_loader_present: browserState.captcha_loader_present,
      captcha_widget_requests_blocked: captchaWidgetAttempts,
      context: browserState.context,
      context_sha256: contextSha256,
    };
    const validated = validateSpecializedQaJourney(result, expectedSha);
    if (!validated.ok) {
      const fields = Array.isArray(validated.invalid_fields) && validated.invalid_fields.length
        ? `:${validated.invalid_fields.join(",")}`
        : "";
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
    const result = await captureSpecializedQaJourney(process.argv[2], process.env.EXPECTED_SHA);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      state: "BLOCKED_BEFORE_POST",
      reason: String(error && error.message || "browser_journey_failed").slice(0, 120),
    }));
    process.exitCode = 1;
  }
}
