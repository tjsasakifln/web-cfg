#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-inbound-security-"));
fs.chmodSync(root, 0o700);

process.env.NODE_ENV = "production";
process.env.CONTEXT = "production";
process.env.RUNTIME_PROFILE = "netcup-production";
process.env.LEAD_REQUIRE_ORIGIN = "1";
process.env.LEAD_REQUIRE_TURNSTILE = "1";
process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
process.env.LEAD_PROBE_SECRET = "probe-secret-32-characters-minimum-2026";
process.env.CONFENGE_STORAGE_BACKEND = "filesystem";
process.env.CONFENGE_STORAGE_DIR = root;
delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
delete process.env.RESEND_API_KEY;
delete process.env.NTFY_URL;

const { FileStore } = require("../../netlify/functions/lib/lead-store.cjs");
const intake = require("../../netlify/functions/market-answer-intake.cjs");
const { _reset } = require("../../netlify/functions/lib/lead-rate-limit.cjs");
const { safeLog, redactSensitiveText } = require("../../netlify/functions/lib/lead-core.cjs");
const store = new FileStore(root);
intake.setStoreForTests(store);

const body = (key) => ({
  action: "handraise",
  nome: "Private Test Person",
  email: "private.person@example.com",
  telefone: "+55 (11) 98888-7766",
  estagio: "segunda leitura de contrato",
  jornada: "contrato",
  consentimento: true,
  idempotency_key: key,
});
const event = (key, headers = {}) => ({
  httpMethod: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://confenge.com.br",
    "x-forwarded-for": "203.0.113.77",
    ...headers,
  },
  body: JSON.stringify(body(key)),
});

_reset();
const missing = await intake.handler(event("security-missing"));
assert.equal(missing.statusCode, 403);
assert.equal(JSON.parse(missing.body).error, "anti_abuse");
assert.equal((await store.list()).length, 0);

_reset();
const wrong = await intake.handler(event("security-wrong", {
  "X-Confenge-Probe": "wrong-secret-32-characters-minimum-2026",
}));
assert.equal(wrong.statusCode, 403);
assert.equal((await store.list()).length, 0);

_reset();
const correct = await intake.handler(event("security-correct", {
  "X-Confenge-Probe": process.env.LEAD_PROBE_SECRET,
}));
assert.equal(correct.statusCode, 201);
const response = JSON.parse(correct.body);
const persisted = await store.get(response.lead_id);
assert.equal(persisted.record_kind, "synthetic");
assert.equal(persisted.synthetic_probe_authenticated, true);
assert.equal(persisted.next_action, "exclude_from_commercial");

const originalLog = console.log;
const originalError = console.error;
const lines = [];
console.log = (line) => lines.push(String(line));
console.error = (line) => lines.push(String(line));
try {
  safeLog("error", "redaction_probe", {
    message: "private.person@example.com +55 (11) 98888-7766 123.456.789-09 12.345.678/0001-90",
    authorization: "Bearer must-not-leak",
    lead_id: "abcdef123456789012345678",
  });
} finally {
  console.log = originalLog;
  console.error = originalError;
}
const logText = lines.join("\n");
for (const needle of ["private.person", "98888", "123.456", "12.345", "must-not-leak"]) {
  assert.equal(logText.includes(needle), false, `PII leaked in log: ${needle}`);
}
assert(logText.includes("abcdef123456789012345678"), "opaque receipt was over-redacted");
assert.equal(redactSensitiveText("failure for (11) 98888-7766"), "failure for [redacted]");

process.stdout.write(JSON.stringify({
  ok: true,
  context: process.env.CONTEXT,
  missing_token_http: missing.statusCode,
  wrong_probe_http: wrong.statusCode,
  authenticated_probe_http: correct.statusCode,
  record_kind: persisted.record_kind,
  commercial_next_action: persisted.next_action,
  pii_log_redaction: "PASS",
}) + "\n");
