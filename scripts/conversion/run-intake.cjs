#!/usr/bin/env node
/**
 * Drive the shipped market-answer-intake handler.
 * Usage:
 *   node scripts/conversion/run-intake.cjs --action xray --cnpj 11222333000181 --idempotency-key k1
 *   node scripts/conversion/run-intake.cjs --action xray --fail-transport --store-dir DIR
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] || fallback;
}
function has(name) {
  return process.argv.includes(`--${name}`);
}

const storeDir = arg("store-dir", process.env.CONVERSION_STORE_DIR || "");
if (storeDir) {
  fs.mkdirSync(storeDir, { recursive: true });
  process.env.LEAD_STORE_DIR = storeDir;
}
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.LEAD_ALLOW_MEMORY_FALLBACK = process.env.LEAD_ALLOW_MEMORY_FALLBACK || "1";

if (!process.env.CONFENGE_INBOUND_WEBHOOK_URL && !has("no-webhook")) {
  process.env.CONFENGE_INBOUND_WEBHOOK_URL =
    "http://127.0.0.1:9/api/v1/webhooks/confenge/inbound";
  process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = process.env.CONFENGE_INBOUND_WEBHOOK_SECRET || "conversion-dev-secret";
}

const root = path.join(__dirname, "../..");
const intakePath = path.join(root, "netlify/functions/market-answer-intake.cjs");
const storePath = path.join(root, "netlify/functions/lib/lead-store.cjs");

const intake = require(intakePath);
const { MemoryStore, FileStore } = require(storePath);

const store = storeDir ? new FileStore(storeDir) : new MemoryStore();
intake.setStoreForTests(store);

if (has("fail-transport")) {
  intake.setFetchForTests(async () => {
    const err = new Error("timeout");
    err.name = "AbortError";
    throw err;
  });
} else if (has("ok-transport")) {
  intake.setFetchForTests(async () => ({
    status: 201,
    json: async () => ({ ok: true, data: { receipt_id: "wb-1", action: { id: "act-1" } } }),
  }));
}

const action = arg("action", "xray");
const cnpj = arg("cnpj", "11222333000181");
const idem = arg("idempotency-key", "conv-88-demo");
const fixtureState = arg("fixture-state", "");

const body = {
  action,
  cnpj,
  idempotency_key: idem,
  correlation_id: arg("correlation-id", "c-conv-88"),
  market_answer_id: "ma-pavimentacao-valor-tipico-v0",
  intent: action === "handraise" ? "revisar_contrato" : "ver_propria_empresa",
  cta: "Veja sua empresa neste mercado",
  fixture_state: fixtureState || undefined,
};

if (action === "handraise") {
  body.nome = arg("nome", "QA Conversion");
  body.email = arg("email", "qa-conversion@example.com");
  body.estagio = "segunda leitura de contrato";
  body.consentimento = true;
  body.jornada = "contrato";
}

const event = {
  httpMethod: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://confenge.com.br",
    "idempotency-key": idem,
    "user-agent": "conversion-run-intake/1.0",
  },
  body: JSON.stringify(body),
};

intake.handler(event).then(async (res) => {
  const parsed = JSON.parse(res.body);
  const receipts = typeof store.list === "function" ? await store.list() : [];
  const out = {
    statusCode: res.statusCode,
    body: parsed,
    store_count: receipts.length,
    receipt_ids: receipts.map((r) => r.lead_id || r.receipt_id),
    auto_send: parsed.auto_send,
    public_url: parsed.public_url || null,
  };
  const dest = arg("out", "");
  const text = JSON.stringify(out, null, 2);
  if (dest) fs.writeFileSync(dest, text + "\n", "utf8");
  process.stdout.write(text + "\n");
  if (res.statusCode >= 500) process.exitCode = 1;
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

void pathToFileURL;
