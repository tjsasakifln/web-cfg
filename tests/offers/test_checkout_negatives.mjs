/**
 * Negative tests for checkout-off + hand-raise. Drives shipped lead-core,
 * offer-checkout handler, and the published Diagnóstico Expansão HTML.
 */
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

function pass(name) {
  console.log("PASS", name);
}
function fail(name, detail) {
  console.error("FAIL", name, detail);
  process.exitCode = 1;
  throw new Error(`FAIL: ${name}`);
}

const page = fs.readFileSync(path.join(root, "diagnostico-b2g-expansao/index.html"), "utf8");
const flags = JSON.parse(fs.readFileSync(path.join(root, "data/offers/flags.json"), "utf8"));
if (flags.production_checkout_enabled !== false) fail("flags_checkout_false", flags);
if (flags.CONFENGE_OFFER_CATALOG_PUBLIC !== false) fail("flags_catalog_false", flags);
pass("flags_remain_false");

if (/id="btn-aceitar"|Contratar Diagnóstico B2G\s*-?\s*R\$ 8\.000/.test(page) && /offer-checkout/.test(page)) {
  fail("page_still_wires_checkout", "checkout CTA still present");
}
if (/\bpagar\b/i.test(page) && /button/i.test(page) && /offer-checkout/.test(page)) {
  fail("pagar_button_with_flag_false", "pay button visible");
}
if (page.includes("/.netlify/functions/offer-checkout")) {
  fail("checkout_url_in_page", "offer-checkout still reachable from HTML");
}
if (page.includes("otp-input") || page.includes("btn-confirmar") || page.includes("created.link")) {
  fail("otp_checkout_impression", "OTP/checkout redirect remains");
}
if (!page.includes("CFG-TERMS-B2B-2026-08-17-v1")) fail("terms_id_visible", "registry terms missing");
if (page.includes("CFG-LEGAL-TERMS-DIAG-EXP-FOUNDER-v1")) fail("founder_terms_on_page");
if (!page.includes("/.netlify/functions/lead")) fail("handraise_posts_to_lead");
if (!page.includes("CFG-DIAG-EXP-v1")) fail("offer_id_present");
pass("page_handraise_not_checkout");

const checkoutFn = require(path.join(root, "netlify/functions/offer-checkout.cjs"));
const off = await checkoutFn.createHandler({
  env: {
    NODE_ENV: "test",
    CONFENGE_OFFER_CATALOG_PUBLIC: "false",
    production_checkout_enabled: "false",
    ASAAS_MODE: "disabled",
  },
})({ httpMethod: "POST", body: JSON.stringify({ offer_id: "CFG-DIAG-EXP-v1" }) });
const offBody = JSON.parse(off.body || "{}");
if (off.statusCode < 400 || offBody.ok === true) {
  fail("checkout_endpoint_flag_false", { status: off.statusCode, body: offBody });
}
pass("checkout_endpoint_flag_false");

const leadCore = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
const baseLead = {
  nome: "Ana Teste",
  email: "ana@example.com",
  estagio: "diagnostico-expansao",
  consentimento: true,
  offer_id: "CFG-DIAG-EXP-v1",
  terms_id: "CFG-TERMS-B2B-2026-08-17-v1",
};

{
  const old = leadCore.validateAndNormalize({ ...baseLead, terms_id: "CFG-LEGAL-TERMS-DIAG-EXP-FOUNDER-v1" });
  if (old.ok || old.error !== "terms_version_mismatch") fail("old_terms_id_blocked", old);
  else pass("old_terms_id_blocked");
}
{
  const price = leadCore.validateAndNormalize({ ...baseLead, amount_cents: 1 });
  if (price.ok || price.error !== "price_mismatch") fail("divergent_price_blocked", price);
  else pass("divergent_price_blocked");
}
{
  const missing = leadCore.validateAndNormalize({ ...baseLead, offer_id: "CFG-DOES-NOT-EXIST" });
  if (missing.ok || missing.error !== "offer_id_unknown") fail("unknown_offer_blocked", missing);
  else pass("unknown_offer_blocked");
}
{
  const ok = leadCore.validateAndNormalize(baseLead);
  if (!ok.ok) fail("canonical_terms_offer_ok", ok);
  else pass("canonical_terms_offer_ok");
}

{
  const leadPath = path.join(root, "netlify/functions/lead.cjs");
  delete require.cache[require.resolve(leadPath)];
  const leadFn = require(leadPath);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-lead-neg-"));
  process.env.LEAD_STORE_DIR = dir;
  process.env.NODE_ENV = "test";
  delete process.env.TURNSTILE_SECRET_KEY;
  const event = {
    httpMethod: "POST",
    headers: { "content-type": "application/json", origin: "https://confenge.com.br" },
    body: JSON.stringify({ ...baseLead, idempotency_key: "diag-dup-1" }),
  };
  const first = JSON.parse((await leadFn.handler(event)).body || "{}");
  const second = JSON.parse((await leadFn.handler(event)).body || "{}");
  if (!first.ok) fail("first_persist", first);
  if (second.duplicate !== true && second.idempotent !== true && second.ok !== true) {
    fail("double_submit_idempotent", second);
  }
  pass("double_submit_idempotent");
}

{
  const leadPath = path.join(root, "netlify/functions/lead.cjs");
  delete require.cache[require.resolve(leadPath)];
  const leadFn = require(leadPath);
  leadFn.setStoreForTests({
    async getByIdempotency() { return null; },
    async put() { throw new Error("store_down"); },
    async update() { return null; },
  });
  const res = await leadFn.handler({
    httpMethod: "POST",
    headers: { "content-type": "application/json", origin: "https://confenge.com.br" },
    body: JSON.stringify({ ...baseLead, idempotency_key: "diag-store-fail" }),
  });
  leadFn.setStoreForTests(null);
  if (res.statusCode < 500) fail("lead_store_failure", res);
  else pass("lead_store_failure");
}

if (process.exitCode) process.exit(1);
console.log("checkout_negatives passed");
