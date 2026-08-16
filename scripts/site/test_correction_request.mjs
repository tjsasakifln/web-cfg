/**
 * Drives the shipped correction-core and correction handler.
 * A passing test must fail if the real entry point accepts extra PII
 * or invents a numbered prazo.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-corrections-"));
process.env.CORRECTION_STORE_DIR = storeDir;
process.env.NODE_ENV = "test";

const corePath = path.join(root, "netlify/functions/lib/correction-core.cjs");
const handlerPath = path.join(root, "netlify/functions/correction.cjs");

function load() {
  delete require.cache[require.resolve(corePath)];
  delete require.cache[require.resolve(handlerPath)];
  return {
    core: require(corePath),
    handlerMod: require(handlerPath),
  };
}

const { core, handlerMod } = load();
const { handler, setStoreForTests, MemoryCorrectionStore } = handlerMod;
const mem = new MemoryCorrectionStore();
setStoreForTests(mem);

const policy = JSON.parse(
  fs.readFileSync(path.join(root, "data/site/editorial-policy.json"), "utf8"),
);

function event(body, method = "POST") {
  return {
    httpMethod: method,
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-correction-test/1.0",
      "x-forwarded-for": "203.0.113.60",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log("PASS", name, detail || "");
}
function fail(name, detail) {
  console.error("FAIL", name, detail);
  process.exitCode = 1;
  throw new Error(`FAIL: ${name} — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

const minPii = {
  page_url: "https://confenge.com.br/inteligencia/",
  contested_excerpt: "Trecho que afirma um número sem fonte.",
  proposed_correction: "Marcar o número como UNKNOWN até existir export nomeado.",
  contact: "redacao@example.com",
  consentimento: true,
};

{
  const validated = core.validateCorrectionRequest(minPii);
  if (!validated.ok || !validated.request) fail("validate_min_pii", validated);
  const receipt = core.issueReceipt(validated.request, { policyVersion: policy.current_version });
  if (!receipt.ok || !String(receipt.receipt_id).startsWith("corr-")) fail("receipt_id", receipt);
  if (receipt.prazo !== "UNKNOWN") fail("prazo_unknown", receipt);
  if (receipt.policy_version !== policy.current_version) fail("receipt_policy_version", receipt);
  pass("core_min_pii_receipt");
}

{
  const res = await handler(event(minPii));
  const body = JSON.parse(res.body);
  if (res.statusCode !== 201) fail("handler_status", { status: res.statusCode, body });
  if (!body.ok || !body.receipt_id) fail("handler_receipt", body);
  if (body.prazo !== "UNKNOWN") fail("handler_prazo", body);
  if (body.policy_version !== policy.current_version) fail("handler_version", body);
  if (body.contact || body.email || body.contested_excerpt || body.cpf) {
    fail("handler_response_pii", body);
  }
  const stored = await mem.get(body.receipt_id);
  if (!stored || stored.prazo !== "UNKNOWN") fail("handler_persisted", stored);
  pass("handler_min_pii_receipt");
}

for (const extra of [
  { cpf: "123.456.789-09" },
  { rg: "12.345.678-9" },
  { date_of_birth: "1990-01-01" },
  { home_address: "Rua das Flores 100" },
]) {
  const payload = { ...minPii, ...extra };
  const validated = core.validateCorrectionRequest(payload);
  if (validated.ok || validated.error !== "extra_pii_rejected") {
    fail("core_rejects_extra_pii", { extra, validated });
  }
  const before = mem.map.size;
  const res = await handler(event(payload));
  const body = JSON.parse(res.body);
  if (res.statusCode !== 400 || body.error !== "extra_pii_rejected") {
    fail("handler_rejects_extra_pii", { extra, status: res.statusCode, body });
  }
  if (mem.map.size !== before) {
    fail("extra_pii_persisted", { extra, size: mem.map.size });
  }
  if (body.contact || body.cpf || body.rg || body.home_address || body.date_of_birth) {
    fail("extra_pii_in_public_json", body);
  }
  pass(`reject_${Object.keys(extra)[0]}`, body.error);
}

{
  const res = await handler(event(minPii, "GET"));
  if (res.statusCode !== 405) fail("method_guard", res.statusCode);
  pass("method_guard", res.statusCode);
}

{
  const missing = { ...minPii };
  delete missing.page_url;
  const validated = core.validateCorrectionRequest(missing);
  if (validated.ok) fail("missing_url_accepted", validated);
  pass("missing_url_rejected", validated.error);
}

if (process.exitCode) {
  console.error("correction tests failed");
  process.exit(1);
}
console.log(`OK ${results.length} correction checks`);
