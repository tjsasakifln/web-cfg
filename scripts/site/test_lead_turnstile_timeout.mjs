/**
 * A06-RECEBIMENTO-05 (campanha BOFU-FECHAMENTO-20260919): o siteverify do
 * Turnstile é limitado pelo mesmo orçamento das demais chamadas externas do
 * POST /api/web/lead (LEAD_DELIVERY_TIMEOUT_MS). Este teste pendura o fetch
 * para challenges.cloudflare.com e exige que o handler real
 * (netlify/functions/lead.cjs):
 *   1. responda 403 anti_abuse em menos de 1 s com LEAD_DELIVERY_TIMEOUT_MS=150
 *      (antes da correção o request ficava aberto até o abort de 15 s do
 *      navegador);
 *   2. registre safeLog turnstile_siteverify_failed (sem token, sem PII);
 *   3. não persista nada (store.list() vazio) — nada a replicar;
 *   4. também não persista quando o siteverify responde success:false depois
 *      do prazo (a resposta tardia não vale como verificação).
 * Reprova se o handler ultrapassar 1 s (siteverify sem deadline), responder
 * diferente de 403 ou escrever um registro antes do Turnstile.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-leads-turnstile-"));
process.env.LEAD_STORE_DIR = storeDir;
process.env.NODE_ENV = "test";
for (const key of [
  "NTFY_URL", "NTFY_TOKEN", "NTFY_TOPIC", "FORMSUBMIT_URL", "RESEND_API_KEY", "OPS_WEBHOOK_URL",
  "CONFENGE_INBOUND_WEBHOOK_URL", "CONFENGE_INBOUND_WEBHOOK_SECRET", "LEAD_REQUIRE_ORIGIN",
]) delete process.env[key];
process.env.TURNSTILE_SECRET_KEY = "turnstile-secret-fixture-value";
process.env.LEAD_REQUIRE_TURNSTILE = "1";
process.env.LEAD_DELIVERY_TIMEOUT_MS = "150";

const leadPath = path.join(root, "netlify/functions/lead.cjs");
const ratePath = path.join(root, "netlify/functions/lib/lead-rate-limit.cjs");
function loadHandler() {
  for (const rel of [
    "netlify/functions/lead.cjs",
    "netlify/functions/lib/lead-core.cjs",
    "netlify/functions/lib/lead-store.cjs",
    "netlify/functions/lib/lead-delivery.cjs",
    "netlify/functions/lib/lead-rate-limit.cjs",
  ]) delete require.cache[require.resolve(path.join(root, rel))];
  return require(leadPath);
}
function isRequestToHost(url, hostname) {
  try {
    return new URL(String(url)).hostname === hostname;
  } catch {
    return false;
  }
}
function event(body, extraHeaders = {}) {
  return {
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-lead-test/1.0",
      "x-forwarded-for": extraHeaders.ip || "203.0.113.77",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

let failed = 0;
function pass(name, detail = "") {
  console.log("PASS", name, detail);
}
function fail(name, detail) {
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
  failed += 1;
}

const { handler, setStoreForTests } = loadHandler();
const { MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
const { _reset } = require(ratePath);
const { deliveryTimeoutMs } = require(path.join(root, "netlify/functions/lib/lead-delivery.cjs"));
if (deliveryTimeoutMs() !== 150) fail("timeout_budget_fixture", deliveryTimeoutMs());
else pass("timeout_budget_fixture", "LEAD_DELIVERY_TIMEOUT_MS=150");

const payload = {
  nome: "Renata Diretora",
  email: "renata.diretora@construtora.com.br",
  estagio: "diagnostico operacao",
  jornada: "operacao",
  consentimento: "on",
  turnstile_token: "tok-hanging",
};

// Capture safeLog lines (stdout JSON) without silencing other output.
const logLines = [];
const originalLog = console.log;
console.log = (...args) => {
  const line = args.map(String).join(" ");
  if (line.startsWith("{")) logLines.push(line);
  else originalLog(...args);
};

const originalFetch = globalThis.fetch;
let siteverifyCalls = 0;
let pendingTimers = [];

// 1) siteverify that never answers: hangs until the handler's own signal aborts it.
globalThis.fetch = (url, opts) => {
  if (isRequestToHost(url, "challenges.cloudflare.com")) {
    siteverifyCalls += 1;
    return new Promise((_resolve, reject) => {
      const signal = opts && opts.signal;
      if (signal) {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        }, { once: true });
      }
      // Safety net so a handler without deadline cannot hang this test forever.
      pendingTimers.push(setTimeout(() => reject(Object.assign(new Error("fixture_gave_up"), { name: "FixtureTimeout" })), 5000));
    });
  }
  return Promise.resolve({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) });
};

try {
  const store = new MemoryStore();
  setStoreForTests(store);
  _reset();
  const t0 = performance.now();
  const res = await handler(event(payload));
  const elapsed = performance.now() - t0;
  const body = JSON.parse(res.body || "{}");
  if (res.statusCode !== 403 || body.error !== "anti_abuse") fail("turnstile_timeout_403_anti_abuse", { status: res.statusCode, body });
  else pass("turnstile_timeout_403_anti_abuse", `http=${res.statusCode}`);
  if (elapsed >= 1000) fail("turnstile_timeout_under_1s", `elapsed_ms=${Math.round(elapsed)}`);
  else pass("turnstile_timeout_under_1s", `elapsed_ms=${Math.round(elapsed)}`);
  if (siteverifyCalls !== 1) fail("turnstile_siteverify_called_once", siteverifyCalls);
  else pass("turnstile_siteverify_called_once");
  const failedLog = logLines.find((l) => l.includes('"event":"turnstile_siteverify_failed"'));
  const rejectedLog = logLines.find((l) => l.includes('"event":"turnstile_rejected"'));
  if (!failedLog) fail("turnstile_siteverify_failed_logged", logLines.slice(-5));
  else pass("turnstile_siteverify_failed_logged");
  if (!rejectedLog || !rejectedLog.includes("turnstile_timeout")) fail("turnstile_rejected_reason_timeout", rejectedLog);
  else pass("turnstile_rejected_reason_timeout");
  if (logLines.some((l) => l.includes("tok-hanging") || l.includes("renata.diretora"))) fail("turnstile_logs_without_token_or_pii");
  else pass("turnstile_logs_without_token_or_pii");
  const stored = await store.list();
  if (stored.length !== 0) fail("turnstile_timeout_persists_nothing", stored.map((r) => r.lead_id));
  else pass("turnstile_timeout_persists_nothing");
  if (String(res.body).includes("tok-hanging") || String(res.body).includes("turnstile_timeout")) fail("turnstile_public_body_whitelisted", res.body);
  else pass("turnstile_public_body_whitelisted");
} finally {
  for (const t of pendingTimers) clearTimeout(t);
  pendingTimers = [];
}

// 2) siteverify answers success:false only AFTER the deadline: still 403, still nothing persisted.
globalThis.fetch = (url, opts) => {
  if (isRequestToHost(url, "challenges.cloudflare.com")) {
    siteverifyCalls += 1;
    return new Promise((resolve, reject) => {
      const signal = opts && opts.signal;
      if (signal) {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        }, { once: true });
      }
      pendingTimers.push(setTimeout(() => resolve({ ok: true, status: 200, text: async () => '{"success":false}', json: async () => ({ success: false }) }), 400));
    });
  }
  return Promise.resolve({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) });
};
try {
  const store = new MemoryStore();
  setStoreForTests(store);
  _reset();
  const t0 = performance.now();
  const res = await handler(event({ ...payload, turnstile_token: "tok-late-false" }, { ip: "203.0.113.78" }));
  const elapsed = performance.now() - t0;
  const body = JSON.parse(res.body || "{}");
  if (res.statusCode !== 403 || body.error !== "anti_abuse") fail("turnstile_late_false_403", { status: res.statusCode, body });
  else pass("turnstile_late_false_403", `http=${res.statusCode} elapsed_ms=${Math.round(elapsed)}`);
  if (elapsed >= 1000) fail("turnstile_late_false_under_1s", `elapsed_ms=${Math.round(elapsed)}`);
  else pass("turnstile_late_false_under_1s");
  const stored = await store.list();
  if (stored.length !== 0) fail("turnstile_late_false_persists_nothing", stored.map((r) => r.lead_id));
  else pass("turnstile_late_false_persists_nothing");
} finally {
  for (const t of pendingTimers) clearTimeout(t);
  pendingTimers = [];
}

// 3) Control: an instant success:true persists (the gate blocks only the unverified path).
globalThis.fetch = (url) => {
  if (isRequestToHost(url, "challenges.cloudflare.com")) {
    return Promise.resolve({ ok: true, status: 200, text: async () => '{"success":true}', json: async () => ({ success: true }) });
  }
  return Promise.resolve({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) });
};
{
  const store = new MemoryStore();
  setStoreForTests(store);
  _reset();
  const res = await handler(event({ ...payload, turnstile_token: "tok-instant-ok" }, { ip: "203.0.113.79" }));
  const body = JSON.parse(res.body || "{}");
  const stored = await store.list();
  if (res.statusCode !== 201 || !body.lead_id || stored.length !== 1) fail("turnstile_instant_success_persists", { status: res.statusCode, stored: stored.length });
  else pass("turnstile_instant_success_persists", `lead_id=${body.lead_id}`);
}

globalThis.fetch = originalFetch;
console.log = originalLog;
if (failed) {
  console.error(`\n${failed} turnstile timeout check(s) failed`);
  process.exit(1);
}
console.log("\nALL turnstile timeout checks passed");
