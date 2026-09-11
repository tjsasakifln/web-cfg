/**
 * Isolated capture helpers for POS-INB-20260911/01.
 * Unique LEAD_STORE_DIR, no outbound env, shipped handler only.
 */
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);

const SCRATCH_STORES = "/tmp/grok-goal-8f5409acdd48/implementer/stores";

export function unsetOutboundEnv() {
  for (const key of [
    "NTFY_URL",
    "NTFY_TOKEN",
    "NTFY_TOPIC",
    "FORMSUBMIT_URL",
    "RESEND_API_KEY",
    "OPS_WEBHOOK_URL",
    "OPS_WEBHOOK_SECRET",
    "CONFENGE_INBOUND_WEBHOOK_URL",
    "CONFENGE_INBOUND_WEBHOOK_SECRET",
    "TURNSTILE_SECRET_KEY",
    "LEAD_REQUIRE_TURNSTILE",
    "LEAD_PROBE_SECRET",
    "OPS_TOKEN",
  ]) {
    delete process.env[key];
  }
}

export function makeStoreDir(label) {
  fs.mkdirSync(SCRATCH_STORES, { recursive: true, mode: 0o700 });
  const dir = fs.mkdtempSync(path.join(SCRATCH_STORES, `${label}-`));
  fs.chmodSync(dir, 0o700);
  return dir;
}

export function isolateEnv(storeDir) {
  unsetOutboundEnv();
  process.env.NODE_ENV = "test";
  process.env.LEAD_STORE_DIR = storeDir;
  delete process.env.CONFENGE_STORAGE_BACKEND;
  delete process.env.LEAD_STORE;
  delete process.env.LEAD_ALLOW_MEMORY_FALLBACK;
  delete process.env.LEAD_REQUIRE_ORIGIN;
  delete process.env.CONFENGE_RUNTIME_PROFILE;
  delete process.env.CONTEXT;
  delete process.env.NETLIFY_CONTEXT;
}

export function loadLeadHandler() {
  const leadPath = path.join(ROOT, "netlify/functions/lead.cjs");
  const extras = [
    "netlify/functions/lib/lead-core.cjs",
    "netlify/functions/lib/lead-store.cjs",
    "netlify/functions/lib/lead-delivery.cjs",
    "netlify/functions/lib/lead-rate-limit.cjs",
    "netlify/functions/lib/inbound-handoff.cjs",
    "netlify/functions/lib/storage-config.cjs",
    "netlify/functions/lib/host-file-store.cjs",
    "netlify/functions/lib/record-kind.cjs",
    "netlify/functions/lib/adaptive-intake.cjs",
  ];
  delete require.cache[require.resolve(leadPath)];
  for (const rel of extras) {
    try {
      delete require.cache[require.resolve(path.join(ROOT, rel))];
    } catch {
      /* optional */
    }
  }
  return require(leadPath);
}

export function loadFileStore() {
  return require(path.join(ROOT, "netlify/functions/lib/lead-store.cjs")).FileStore;
}

export function event(body, method = "POST", extraHeaders = {}) {
  const { ip, ...rest } = extraHeaders;
  return {
    httpMethod: method,
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "pos-inb-01-local/1.0",
      "x-forwarded-for": ip || "203.0.113.80",
      ...rest,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

const results = [];
export function pass(name, detail) {
  results.push({ name, ok: true, detail: detail || null });
  console.log("PASS", name, detail ? JSON.stringify(detail) : "");
}
export function fail(name, detail) {
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
  process.exitCode = 1;
  throw new Error(`FAIL: ${name}`);
}
export function getResults() {
  return results;
}

export function privatePayload(extra = {}) {
  return {
    nome: "Ana Privada",
    telefone: "48988344559",
    estagio: "projeto, revisão ou compatibilização",
    jornada: "projeto",
    consentimento: "on",
    origem: "/ferramentas/checklist-reequilibrio/",
    landing_url: "/ferramentas/checklist-reequilibrio/",
    landing_page: "/ferramentas/checklist-reequilibrio/",
    empresa: "",
    cnpj: "",
    public_contract_id: "",
    analytics_consent: false,
    marketing_consent: false,
    cookie_consent: "denied",
    ...extra,
  };
}

export function tmpCleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export { os, fs, path, require };
