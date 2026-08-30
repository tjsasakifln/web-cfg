import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { loadRuntimeConfig } from "../lib/config.mjs";
import { createFunctionRegistry } from "../lib/functions.mjs";
import { createStructuredLogger } from "../lib/logger.mjs";
import { createPortableRuntime } from "../lib/server.mjs";
import { executeScheduledFunction } from "../schedule.mjs";
import { temporaryDirectory } from "./helpers.mjs";

const RELEVANT_HEADERS = new Set([
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-allow-origin",
  "cache-control",
  "content-type",
  "location",
  "retry-after",
  "x-content-type-options",
  "x-robots-tag",
]);
const DYNAMIC_FIELDS = new Set([
  "build_timestamp",
  "generated_at",
  "lead_id",
  "received_at",
  "receipt_id",
  "ts",
]);

function saveEnvironment(keys) {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(saved) {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function normalized(value, key = "") {
  if (DYNAMIC_FIELDS.has(key)) return "<dynamic>";
  if (Array.isArray(value)) return value.map((entry) => normalized(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((name) => [name, normalized(value[name], name)]),
    );
  }
  return value;
}

function parseBody(response) {
  try {
    return JSON.parse(response.body || "{}");
  } catch {
    return response.body || "";
  }
}

function eventFor(fixture) {
  const url = new URL("https://confenge.com.br" + fixture.path);
  const query = {};
  for (const [key, value] of url.searchParams) query[key] = value;
  return {
    httpMethod: fixture.method,
    headers: {
      accept: "application/json",
      origin: "https://confenge.com.br",
      "content-type": fixture.body == null ? "application/json" : "application/json",
      "user-agent": "confenge-runtime-parity/1",
      "x-forwarded-for": "203.0.113.45",
      ...(fixture.headers || {}),
    },
    body: fixture.body == null ? "" : fixture.body,
    isBase64Encoded: false,
    path: url.pathname,
    rawUrl: url.toString(),
    rawQuery: url.search.slice(1),
    queryStringParameters: query,
    multiValueQueryStringParameters: Object.fromEntries(
      [...url.searchParams.keys()].map((key) => [key, url.searchParams.getAll(key)]),
    ),
    requestContext: {
      requestId: "direct-parity",
      identity: { sourceIp: "203.0.113.45" },
    },
  };
}

async function httpFor(baseUrl, fixture) {
  return fetch(baseUrl + fixture.path, {
    method: fixture.method,
    headers: {
      accept: "application/json",
      origin: "https://confenge.com.br",
      "content-type": "application/json",
      "user-agent": "confenge-runtime-parity/1",
      "x-forwarded-for": "203.0.113.45",
      ...(fixture.headers || {}),
    },
    body: ["GET", "HEAD"].includes(fixture.method)
      ? undefined
      : (fixture.body == null ? "" : fixture.body),
  });
}

test("every HTTP function preserves direct-handler status, relevant headers and normalized body", async (t) => {
  const keys = [
    "ASAAS_MODE",
    "CONFENGE_OFFER_CATALOG_PUBLIC",
    "CONTEXT",
    "CORRECTION_STORE_DIR",
    "LEAD_ALLOW_MEMORY_FALLBACK",
    "LEAD_REQUIRE_ORIGIN",
    "LEAD_REQUIRE_TURNSTILE",
    "LEAD_STORE",
    "LEAD_STORE_DIR",
    "NETLIFY_CONTEXT",
    "NODE_ENV",
    "NURTURE_ADVANCE_WITHOUT_RESEND",
    "NURTURE_TOKEN_SECRET",
    "OPS_TOKEN",
    "REAL_MONEY_MUTATION_ENABLED",
    "RESEND_API_KEY",
    "RUNTIME_FUNCTIONS_DIR",
    "RUNTIME_PORT",
    "TURNSTILE_SECRET_KEY",
  ];
  const saved = saveEnvironment(keys);
  t.after(() => restoreEnvironment(saved));

  process.env.NODE_ENV = "test";
  process.env.LEAD_STORE = "memory";
  delete process.env.LEAD_STORE_DIR;
  delete process.env.CORRECTION_STORE_DIR;
  delete process.env.CONTEXT;
  delete process.env.NETLIFY_CONTEXT;
  process.env.NURTURE_TOKEN_SECRET = "n".repeat(40);
  process.env.NURTURE_ADVANCE_WITHOUT_RESEND = "1";
  process.env.OPS_TOKEN = "ops-token-for-runtime-parity";
  process.env.ASAAS_MODE = "disabled";
  process.env.CONFENGE_OFFER_CATALOG_PUBLIC = "false";
  process.env.REAL_MONEY_MUTATION_ENABLED = "false";
  delete process.env.RESEND_API_KEY;
  delete process.env.RUNTIME_FUNCTIONS_DIR;
  process.env.RUNTIME_PORT = "0";

  const collectBody = JSON.stringify({
    events: [{
      event: "page_view",
      props: {
        page_path: "/",
        asset_id: "home",
        intent: "aprender_mercado",
        cta_id: "",
      },
      path: "/",
      sid: "sess-222222222222222222222222222",
    }],
  });
  const invalidXray = JSON.stringify({
    action: "xray",
    cnpj: "00000000000000",
    consentimento: true,
  });
  const correctionExtraPii = JSON.stringify({
    page_url: "https://confenge.com.br/inteligencia/",
    contested_excerpt: "Trecho que afirma um número sem fonte.",
    proposed_correction: "Marcar o número como UNKNOWN até existir export nomeado.",
    contact: "redacao@example.com",
    consentimento: true,
    date_of_birth: "1990-01-01",
  });
  const fixtures = [
    { name: "asaas-webhook", method: "GET", path: "/.netlify/functions/asaas-webhook" },
    { name: "asaas-webhook-sandbox", method: "GET", path: "/.netlify/functions/asaas-webhook-sandbox" },
    { name: "collect", method: "POST", path: "/.netlify/functions/collect", body: collectBody },
    { name: "conversion-intake", method: "POST", path: "/.netlify/functions/conversion-intake", body: invalidXray },
    { name: "correction", method: "POST", path: "/.netlify/functions/correction", body: correctionExtraPii },
    {
      name: "lead",
      method: "POST",
      path: "/.netlify/functions/lead?source=runtime-parity",
      body: JSON.stringify({
        nome: "Bot",
        telefone: "48999999999",
        estagio: "outro",
        consentimento: "on",
        "empresa-site": "spam",
      }),
    },
    { name: "market-answer-intake", method: "POST", path: "/.netlify/functions/market-answer-intake", body: invalidXray },
    { name: "nurture", method: "GET", path: "/.netlify/functions/nurture?action=health" },
    {
      name: "offer-checkout",
      method: "POST",
      path: "/.netlify/functions/offer-checkout",
      body: JSON.stringify({ offer_id: "CFG-DIAG-EXP-v1" }),
    },
    {
      name: "offer-checkout-sandbox",
      method: "POST",
      path: "/.netlify/functions/offer-checkout-sandbox",
      body: "{}",
    },
    { name: "offer-eligibility", method: "GET", path: "/.netlify/functions/offer-eligibility" },
    { name: "offer-terms-accept", method: "GET", path: "/.netlify/functions/offer-terms-accept" },
    { name: "ops", method: "GET", path: "/.netlify/functions/ops?action=health" },
  ];

  const config = loadRuntimeConfig();
  const registry = createFunctionRegistry({
    functionsDir: config.functionsDir,
    netlifyTomlPath: config.netlifyTomlPath,
  });
  const runtime = createPortableRuntime({
    config,
    registry,
    logger: createStructuredLogger({ sink: () => {} }),
  });
  const address = await runtime.listen();
  t.after(() => runtime.shutdown("parity-test"));
  const baseUrl = "http://127.0.0.1:" + address.port;

  const httpNames = registry.definitions
    .filter((definition) => !definition.schedule)
    .map((definition) => definition.name)
    .sort();
  assert.deepEqual(fixtures.map((fixture) => fixture.name).sort(), httpNames);

  for (const fixture of fixtures) {
    const handler = registry.getHttpHandler(fixture.name);
    assert.equal(typeof handler, "function", fixture.name);
    const direct = await handler(eventFor(fixture), { functionName: fixture.name });
    const portable = await httpFor(baseUrl, fixture);
    assert.equal(portable.status, direct.statusCode, fixture.name + " status");
    for (const [name, value] of Object.entries(direct.headers || {})) {
      if (!RELEVANT_HEADERS.has(name.toLowerCase())) continue;
      assert.equal(portable.headers.get(name), String(value), fixture.name + " header " + name);
    }
    const portableBody = await portable.text();
    const portableResponse = { body: portableBody };
    assert.deepEqual(
      normalized(parseBody(portableResponse)),
      normalized(parseBody(direct)),
      fixture.name + " body",
    );
  }

  const scheduleHandler = registry.getScheduledHandler("search-observation-tick");
  assert.equal(typeof scheduleHandler, "function");
  const directDirectory = temporaryDirectory("confenge-runtime-schedule-direct-");
  const portableDirectory = temporaryDirectory("confenge-runtime-schedule-portable-");
  t.after(() => {
    rmSync(directDirectory, { recursive: true, force: true });
    rmSync(portableDirectory, { recursive: true, force: true });
  });
  delete process.env.LEAD_STORE;
  process.env.LEAD_STORE_DIR = directDirectory;
  const directSchedule = await scheduleHandler({ httpMethod: "POST", headers: {} });
  process.env.LEAD_STORE_DIR = portableDirectory;
  const scheduleConfig = loadRuntimeConfig();
  const portableSchedule = await executeScheduledFunction("search-observation-tick", {
    config: scheduleConfig,
    registry,
    logger: () => {},
  });
  assert.equal(portableSchedule.exitCode, 0);
  assert.equal(portableSchedule.response.statusCode, directSchedule.statusCode);
  assert.deepEqual(
    normalized(parseBody(portableSchedule.response)),
    normalized(parseBody(directSchedule)),
  );
});
