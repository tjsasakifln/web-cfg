/**
 * Drives the shipped lead handler with Money Asset attribution.
 * Asserts persist, allowlisted fields, idempotency, and no PII in the response.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-money-leads-"));
process.env.LEAD_STORE_DIR = storeDir;
process.env.NODE_ENV = "test";
delete process.env.NTFY_URL;
delete process.env.NTFY_TOKEN;
delete process.env.RESEND_API_KEY;
delete process.env.OPS_WEBHOOK_URL;
delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.LEAD_REQUIRE_TURNSTILE;

const leadPath = path.join(root, "netlify/functions/lead.cjs");
function loadHandler() {
  delete require.cache[require.resolve(leadPath)];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-core.cjs"))];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-store.cjs"))];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-delivery.cjs"))];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"))];
  return require(leadPath);
}

const { handler, setStoreForTests } = loadHandler();
const { MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
const { _reset } = require(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"));
const mem = new MemoryStore();
setStoreForTests(mem);
_reset();

function event(body) {
  return {
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-money-asset-test/1.0",
      "x-forwarded-for": "203.0.113.77",
    },
    body: JSON.stringify(body),
  };
}

const payload = {
  nome: "QA Money Asset",
  email: "qa-money@example.com",
  estagio: "problema urgente em contrato",
  jornada: "contrato",
  consentimento: "on",
  origem: "/ferramentas/diagnostico-defesa-margem/",
  landing_page: "/ferramentas/diagnostico-defesa-margem/",
  asset_id: "diagnostico-defesa-margem",
  route_family: "defesa-margem-diagnostico",
  public_contract_id: "83102277000152-2-000626/2026",
  public_id_slug: "md-8569b618",
  cta_id: "segunda-leitura-contrato",
  mensagem: "PII_MUST_NOT_LEAK_IN_RESPONSE",
  idempotency_key: "money-asset-idk-001",
};

const r1 = await handler(event(payload));
const d1 = JSON.parse(r1.body);
if (r1.statusCode !== 201 || !d1.ok || !d1.lead_id) {
  throw new Error(`persist failed ${r1.statusCode} ${r1.body}`);
}
const bodyStr = JSON.stringify(d1);
if (bodyStr.includes("PII_MUST_NOT_LEAK") || bodyStr.includes("qa-money@") || bodyStr.includes("QA Money")) {
  throw new Error(`response leaked PII: ${bodyStr}`);
}
const stored = await mem.get(d1.lead_id);
if (!stored) throw new Error("not stored");
if (stored.asset_id !== "diagnostico-defesa-margem") throw new Error("asset_id missing");
if (stored.route_family !== "defesa-margem-diagnostico") throw new Error("route_family missing");
if (stored.public_contract_id !== "83102277000152-2-000626/2026") throw new Error("public_contract_id missing");
if (stored.public_id_slug !== "md-8569b618") throw new Error("public_id_slug missing");
if (stored.public_entity_id) throw new Error("public_entity_id must stay absent unless supplied");
if (stored.jornada !== "contrato") throw new Error("journey missing");
if (stored.source !== "CONFENGE_WEB") throw new Error("source CONFENGE_WEB missing");

const r2 = await handler(event(payload));
const d2 = JSON.parse(r2.body);
if (r2.statusCode !== 200 || d2.idempotent !== true || d2.lead_id !== d1.lead_id) {
  throw new Error(`idempotency failed ${r2.statusCode} ${r2.body}`);
}

const collect = require(path.join(root, "netlify/functions/collect.cjs"));
const analytics = await collect.handler({
  httpMethod: "POST",
  headers: { "content-type": "application/json", origin: "https://confenge.com.br" },
  body: JSON.stringify({
    events: [
      {
        event: "lead_created",
        props: {
          asset_id: "diagnostico-defesa-margem",
          route_family: "defesa-margem-diagnostico",
          public_id_slug: "md-8569b618",
          nome: "Alice",
          email: "alice@example.com",
          telefone: "48999999999",
          mensagem: "secreto",
        },
        path: "/ferramentas/diagnostico-defesa-margem/",
      },
    ],
  }),
});
const analyticsBody = JSON.parse(analytics.body);
if (analytics.statusCode !== 202 || analyticsBody.ok !== true || analyticsBody.accepted < 1) {
  throw new Error(`collector rejected money-asset event ${analytics.statusCode} ${analytics.body}`);
}
const scrubbed = collect._scrubProps({
  asset_id: "diagnostico-defesa-margem",
  nome: "Alice",
  email: "alice@example.com",
  telefone: "48999999999",
  mensagem: "secreto",
});
if (scrubbed.nome || scrubbed.email || scrubbed.telefone || scrubbed.mensagem) {
  throw new Error(`scrubProps leaked PII ${JSON.stringify(scrubbed)}`);
}
if (!scrubbed.asset_id) throw new Error("scrubProps dropped asset_id");

console.log("MONEY_ASSET_LEAD_OK", { lead_id: d1.lead_id, idempotent: d2.idempotent });
