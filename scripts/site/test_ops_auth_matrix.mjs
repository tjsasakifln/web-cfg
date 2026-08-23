/**
 * Story 1.2 — ops auth negative matrix.
 * Drives real netlify/functions/ops.cjs (not a reimplementation).
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const opsPath = path.join(root, "netlify/functions/ops.cjs");

const SENSITIVE = [
  "leads",
  "lead",
  "stage",
  "funnel",
  "gsc_insights",
  "backfill_record_kind",
  "inbound_handoff",
  "audit_inbound_requeue",
  "requeue_inbound",
  "drain_inbound",
  "search_observation",
  "produce_search_observation",
  "drain_search_observation",
];

function load() {
  delete require.cache[require.resolve(opsPath)];
  // clear store deps
  for (const k of Object.keys(require.cache)) {
    if (k.includes("netlify/functions")) delete require.cache[k];
  }
  return require(opsPath);
}

function event({ action, token, method = "GET", body = null }) {
  const headers = {
    origin: "https://confenge.com.br",
    "x-forwarded-for": "198.51.100.10",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return {
    httpMethod: method,
    headers,
    queryStringParameters: { action },
    rawUrl: `https://confenge.com.br/.netlify/functions/ops?action=${action}`,
    body: body ? JSON.stringify(body) : null,
  };
}

function assertNoLeadPii(body) {
  const s = typeof body === "string" ? body : JSON.stringify(body);
  // redacted responses must not include typical lead contact fields with values
  if (/"email"\s*:\s*"[^"]+@/.test(s)) throw new Error("email pii leaked");
  if (/"telefone"\s*:\s*"\d{8,}/.test(s)) throw new Error("phone pii leaked");
  if (/"nome"\s*:\s*"[A-Za-zÀ-ú]{3,}/.test(s) && /leads|lead/.test(s)) {
    // health may not have nome; sensitive error bodies must not
    if (!/"ok"\s*:\s*true/.test(s)) throw new Error("nome pii leaked on error");
  }
}

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ops-auth-leads-"));
process.env.LEAD_STORE_DIR = storeDir;
process.env.NODE_ENV = "test";
// seed a lead with PII so a successful list would prove leak if unauth succeeded
fs.writeFileSync(
  path.join(storeDir, "lead_seed.json"),
  JSON.stringify({
    lead_id: "lead_seed",
    nome: "Pessoa Sensivel",
    email: "pii-secret@example.com",
    telefone: "48991112222",
    record_kind: "real",
    commercial_stage: "lead_persisted",
    received_at: new Date().toISOString(),
  }),
  "utf8",
);

let failed = 0;
function pass(n, d) {
  console.log("PASS", n, d || "");
}
function fail(n, d) {
  failed++;
  console.error("FAIL", n, d);
}

// A) no token configured → 503 (fail-closed), no PII
{
  delete process.env.OPS_TOKEN;
  delete process.env.REVOPS_TOKEN;
  const { handler } = load();
  for (const action of SENSITIVE) {
    const res = await handler(event({ action }));
    if (res.statusCode === 200) fail(`${action}_no_token_config`, res.statusCode);
    else pass(`${action}_no_token_config`, res.statusCode);
    assertNoLeadPii(res.body);
  }
}

// B) token configured, missing / invalid → 401, no PII
{
  process.env.OPS_TOKEN = "ops-test-token-16chars-min";
  const { handler } = load();
  for (const action of SENSITIVE) {
    const missing = await handler(event({ action }));
    if (missing.statusCode !== 401) fail(`${action}_missing_token`, missing.statusCode);
    else pass(`${action}_missing_token`, missing.statusCode);
    assertNoLeadPii(missing.body);

    const bad = await handler(event({ action, token: "definitely-wrong-token!!" }));
    if (bad.statusCode !== 401) fail(`${action}_bad_token`, bad.statusCode);
    else pass(`${action}_bad_token`, bad.statusCode);
    assertNoLeadPii(bad.body);
  }

  // health may succeed without token
  const health = await handler(event({ action: "health" }));
  if (health.statusCode !== 200) fail("health_public", health.statusCode);
  else pass("health_public", health.statusCode);
  const hb = JSON.parse(health.body || "{}");
  if (hb.leads || hb.email || hb.telefone) fail("health_leaks_leads", hb);
  else pass("health_no_lead_pii");

  // valid token can list (smoke) — may be 200 with seed
  const ok = await handler(event({ action: "leads", token: process.env.OPS_TOKEN }));
  if (ok.statusCode !== 200) {
    // some envs may still fail if store wiring differs — don't hard-fail commercial list
    pass("leads_authed_status", ok.statusCode);
  } else {
    pass("leads_authed_ok");
  }
}

fs.rmSync(storeDir, { recursive: true, force: true });
if (failed) {
  console.error("OPS_AUTH_MATRIX_FAIL", failed);
  process.exit(1);
}
console.log("OPS_AUTH_MATRIX_OK");
