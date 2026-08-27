#!/usr/bin/env node
/**
 * Authenticated production harness for an isolated host-owned store.
 * It never creates a human lead and never prints credentials or contact data.
 */
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const { FileStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
const inbound = require(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"));
const lead = require(path.join(root, "netlify/functions/lead.cjs"));

const [mode, storeRoot, idem] = process.argv.slice(2);
if (!mode || !storeRoot || !path.isAbsolute(storeRoot)) throw new Error("mode and absolute store root required");
if (String(process.env.CONTEXT || "") !== "production") throw new Error("production_context_required");
if (String(process.env.LEAD_PROBE_SECRET || "").length < 32) throw new Error("probe_secret_required");

const store = new FileStore(storeRoot);
const safeReceipt = (record) => record ? {
  lead_id: record.lead_id,
  record_kind: record.record_kind,
  authenticated_probe: record.synthetic_probe_authenticated === true,
  source: record.source,
  next_action: record.next_action,
  handoff: record.handoff ? {
    status: record.handoff.status,
    attempts: record.handoff.attempts,
    last_error: record.handoff.last_error || null,
    downstream_receipt: record.handoff.downstream?.downstream_receipt || null,
    duplicate: record.handoff.downstream?.duplicate === true,
    downstream_action_present: Boolean(record.handoff.downstream?.action_id),
  } : null,
} : null;

async function capture({ persistOnly = false } = {}) {
  lead.setStoreForTests(store);
  const headers = {
    "content-type": "application/json",
    origin: "https://confenge.com.br",
    "user-agent": "confenge-synthetic-probe/production-e2e",
    "x-forwarded-for": "198.51.100.27",
    "x-confenge-probe": process.env.LEAD_PROBE_SECRET,
    "idempotency-key": idem,
  };
  if (persistOnly) headers["x-confenge-probe-persist-only"] = "1";
  const response = await lead.handler({
    httpMethod: "POST",
    headers,
    body: JSON.stringify({
      nome: "SYNTHETIC-PROBE",
      email: "probe@example.com",
      estagio: "synthetic probe discard",
      jornada: "operacao",
      consentimento: true,
      origem: "/synthetic-probe",
      landing_page: "/",
      utm_source: "synthetic",
      utm_medium: "probe",
      mensagem: "synthetic probe do not contact",
      idempotency_key: idem,
    }),
  });
  const body = JSON.parse(response.body);
  const record = body.lead_id ? await store.get(body.lead_id) : null;
  return {
    http: response.statusCode,
    ok: body.ok === true,
    idempotent: body.idempotent === true,
    receipt: safeReceipt(record),
  };
}

(async () => {
  let output;
  if (mode === "capture") output = await capture();
  else if (mode === "persist-only") output = await capture({ persistOnly: true });
  else if (mode === "drain") {
    const summary = await inbound.drainPendingHandoffs(store, { now: new Date(), env: process.env });
    const records = await store.list();
    output = { summary, receipt: safeReceipt(records.find((row) => row.idempotency_key === `idk:${idem}`) || records[0]) };
  } else if (mode === "read") {
    const record = await store.getByIdempotency(`idk:${idem}`);
    output = { receipt: safeReceipt(record) };
  } else throw new Error("unknown_mode");
  process.stdout.write(JSON.stringify({
    mode,
    context: process.env.CONTEXT,
    destination_fingerprint: inbound.inboundDestinationFingerprint(process.env.CONFENGE_INBOUND_WEBHOOK_URL),
    ...output,
  }) + "\n");
})().catch((error) => {
  process.stderr.write(JSON.stringify({ ok: false, error: inbound.sanitizeError(error) }) + "\n");
  process.exit(1);
});
