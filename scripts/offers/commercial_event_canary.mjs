#!/usr/bin/env node
/**
 * Signed commercial_event canary against Warmbly health.
 * GET-only unless CONFENGE_COMMERCIAL_EVENT_WEBHOOK_SECRET is set.
 * Never emits payment_received. Never fabricates DELIVERED.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const ce = require(path.join(root, "netlify/functions/lib/commercial-event.cjs"));

const VERSION = "confenge.commercial_event.v1";
const DEFAULT_HEALTH =
  process.env.CONFENGE_COMMERCIAL_EVENT_HEALTH_URL ||
  process.env.CONFENGE_INBOUND_HEALTH_URL ||
  "https://api.confenge.com.br/api/v1/webhooks/confenge/inbound/health";

function parseArgs(argv) {
  const out = { health: DEFAULT_HEALTH };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--health-url" && argv[i + 1]) {
      out.health = argv[++i];
    }
  }
  return out;
}

function hasSecret(env = process.env) {
  return Boolean(
    String(env.CONFENGE_COMMERCIAL_EVENT_WEBHOOK_SECRET || env.CONFENGE_INBOUND_WEBHOOK_SECRET || "").trim(),
  );
}

export async function runCanary({ env = process.env, healthUrl } = {}) {
  const health = healthUrl || parseArgs(process.argv).health;
  const capEnv = {
    ...env,
    CONFENGE_COMMERCIAL_EVENT_HEALTH_URL: health,
    CONFENGE_INBOUND_HEALTH_URL: health,
  };
  const cap = await ce.readCapability(capEnv);
  const announced = Boolean(cap.ok && (cap.versions || []).includes(VERSION));
  const report = {
    health_url: health,
    capability_ok: Boolean(cap.ok),
    capability_reason: cap.reason || null,
    versions: cap.versions || [],
    announced_commercial_event_v1: announced,
    hmac_secret_present: hasSecret(env),
    producer_enabled: ce.isProducerEnabled(env),
    payment_received_fabricated: false,
  };
  if (!announced) {
    return {
      ...report,
      status: "WAITING_WARMBLY_COMMERCIAL_EVENT_CAPABILITY",
    };
  }
  if (!hasSecret(env)) {
    return {
      ...report,
      status: "SIGNED_CANARY_HELD_NO_HMAC_SECRET",
    };
  }
  if (!ce.isProducerEnabled(env)) {
    return {
      ...report,
      status: "SIGNED_CANARY_HELD_PRODUCER_DISABLED",
    };
  }
  const produced = await ce.produce(
    {
      type: "offer_selected",
      offer_id: "CFG-DIAG-EXP-v1",
      offer_version: "v1",
      origin: "canary",
      event_id: `ce_canary_${Date.now()}`,
    },
    { env: { ...capEnv, CONFENGE_COMMERCIAL_EVENT_ENABLED: "1" } },
  );
  return {
    ...report,
    status: produced.ok && produced.record && produced.record.outbox
      ? produced.record.outbox.status
      : "CANARY_PRODUCE_FAILED",
    produce_ok: Boolean(produced.ok),
    outbox: produced.record && produced.record.outbox,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv);
  const report = await runCanary({ healthUrl: args.health });
  console.log(JSON.stringify(report, null, 2));
  console.log("COMMERCIAL_EVENT_CANARY", report.status);
}
