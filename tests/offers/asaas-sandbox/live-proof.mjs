/**
 * Optional SANDBOX_LIVE_PROVEN runner.
 * Executes only when Sandbox env vars are already present.
 * Never hunts files. Never uses production hosts.
 */
import { createRequire } from "module";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);
const { redactProviderPayload } = require(path.join(root, "scripts/offers/providers/redact.cjs"));

const key = process.env.ASAAS_SANDBOX_API_KEY;
const webhook = process.env.ASAAS_SANDBOX_WEBHOOK_TOKEN;
const admin = process.env.CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN;

if (!key || !webhook || !admin) {
  console.log(JSON.stringify({
    classification: "SANDBOX_CREDENTIALS_NOT_PRESENT",
    proof: "CONTRACT_PROVEN",
    command: "ASAAS_MODE=sandbox CONFENGE_OFFER_SANDBOX_ENABLED=true node tests/offers/asaas-sandbox/live-proof.mjs",
  }, null, 2));
  process.exit(0);
}

if (String(key).startsWith("$aact_prod_")) {
  console.error(JSON.stringify({ ok: false, error: "production_key_blocked" }));
  process.exit(2);
}

const checkoutFn = require(path.join(root, "netlify/functions/offer-checkout-sandbox.cjs"));
const webhookFn = require(path.join(root, "netlify/functions/asaas-webhook-sandbox.cjs"));
const { FileOfferStore } = require(path.join(root, "scripts/offers/stores/sandbox-store.cjs"));

const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "asaas-sbx-live-"));
const store = new FileOfferStore(dir);
const env = {
  ...process.env,
  ASAAS_MODE: "sandbox",
  CONFENGE_OFFER_SANDBOX_ENABLED: "true",
};
const checkoutHandler = checkoutFn.createHandler({ env, store });
const webhookHandler = webhookFn.createHandler({ env, store });

const body = {
  offer_id: "CFG-DIAG-EXP-v1",
  sandbox_test: true,
  fixture_id: "sbx-diag-001",
  cnpj: "11222333000181",
  email: "sandbox.diag@example.invalid",
  phone: "4738010919",
};

const first = await checkoutHandler({
  httpMethod: "POST",
  headers: {
    "content-type": "application/json",
    "x-confenge-sandbox-admin-token": admin,
  },
  body: JSON.stringify(body),
});
const replay = await checkoutHandler({
  httpMethod: "POST",
  headers: {
    "content-type": "application/json",
    "x-confenge-sandbox-admin-token": admin,
  },
  body: JSON.stringify(body),
});

const firstBody = JSON.parse(first.body);
const replayBody = JSON.parse(replay.body);
const fixtureWh = JSON.parse(fs.readFileSync(path.join(root, "data/offers/fixtures/asaas-sandbox/webhook-payment-created.json"), "utf8"));
if (firstBody.created && firstBody.created.id) {
  fixtureWh.checkout = { id: firstBody.created.id, status: "ACTIVE" };
}

const wh1 = await webhookHandler({
  httpMethod: "POST",
  headers: {
    "content-type": "application/json",
    "asaas-access-token": webhook,
  },
  body: JSON.stringify(fixtureWh),
});
const wh2 = await webhookHandler({
  httpMethod: "POST",
  headers: {
    "content-type": "application/json",
    "asaas-access-token": webhook,
  },
  body: JSON.stringify(fixtureWh),
});

const evidence = redactProviderPayload({
  classification: "SANDBOX_LIVE_PROVEN",
  checkout: { first: JSON.parse(first.body), replay: JSON.parse(replay.body) },
  webhook: { first: JSON.parse(wh1.body), replay: JSON.parse(wh2.body) },
});
const serialized = JSON.stringify(evidence, null, 2);
const digest = crypto.createHash("sha256").update(serialized).digest("hex");
const out = {
  ...evidence,
  sha256: digest,
  replay_same_id: firstBody.created && replayBody.created && firstBody.created.id === replayBody.created.id,
  webhook_deduped: JSON.parse(wh2.body).duplicate === true,
};
console.log(JSON.stringify(out, null, 2));
if (!out.replay_same_id || !out.webhook_deduped) process.exit(1);
