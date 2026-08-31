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
const previewEligibility = require("../../netlify/functions/offer-eligibility.cjs");
const { _reset } = require("../../netlify/functions/lib/lead-rate-limit.cjs");
const { safeLog, redactSensitiveText } = require("../../netlify/functions/lib/lead-core.cjs");
const store = new FileStore(root);
intake.setStoreForTests(store);

const logCanaries = {
  ip: "198.51.100.42",
  ipv6: "2001:db8::442",
  userAgent: "privacy-canary-user-agent/442",
  referer: "https://outside.invalid/private-referer-442?source=private-query-442",
  cookie: "__Host-private-cookie-442=private-cookie-value-442",
  query: "private-query-442",
  uri: "private-uri-442",
};

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
    "x-forwarded-for": logCanaries.ip,
    "user-agent": logCanaries.userAgent,
    referer: logCanaries.referer,
    cookie: logCanaries.cookie,
    ...headers,
  },
  path: `/api/web/market-answer-intake/${logCanaries.uri}`,
  rawUrl: `https://confenge.com.br/api/web/market-answer-intake/${logCanaries.uri}?q=${logCanaries.query}`,
  rawQuery: `q=${logCanaries.query}`,
  queryStringParameters: { q: logCanaries.query },
  body: JSON.stringify(body(key)),
});

const stdoutLines = [];
const stderrLines = [];
const originalLog = console.log;
const originalError = console.error;
console.log = (...values) => stdoutLines.push(values.map(String).join(" "));
console.error = (...values) => stderrLines.push(values.map(String).join(" "));

let missing;
let wrong;
let correct;
let response;
let persisted;
try {
  _reset();
  missing = await intake.handler(event("security-missing"));
  assert.equal(missing.statusCode, 403);
  assert.equal(JSON.parse(missing.body).error, "anti_abuse");
  assert.equal((await store.list()).length, 0);

  _reset();
  wrong = await intake.handler(event("security-wrong", {
    "X-Confenge-Probe": "wrong-secret-32-characters-minimum-2026",
  }));
  assert.equal(wrong.statusCode, 403);
  assert.equal((await store.list()).length, 0);

  _reset();
  correct = await intake.handler(event("security-correct", {
    "X-Confenge-Probe": process.env.LEAD_PROBE_SECRET,
  }));
  assert.equal(correct.statusCode, 201);
  response = JSON.parse(correct.body);
  persisted = await store.get(response.lead_id);
  assert.equal(persisted.record_kind, "synthetic");
  assert.equal(persisted.synthetic_probe_authenticated, true);
  assert.equal(persisted.next_action, "exclude_from_commercial");

  // Exercise the same logger used by handler error paths with adversarial input.
  // The public logging seam must reject free-form event names and field values,
  // while retaining the opaque receipt needed for operations.
  const adversarialLogFields = {
    message: "private.person@example.com +55 (11) 98888-7766 123.456.789-09 12.345.678/0001-90",
    authorization: "Bearer must-not-leak",
    client_address: logCanaries.ip,
    user_agent: logCanaries.userAgent,
    referer: logCanaries.referer,
    cookie: logCanaries.cookie,
    request_uri: `/private/${logCanaries.uri}?q=${logCanaries.query}`,
    code: logCanaries.query,
    reason: logCanaries.userAgent,
    http: 5511988887766,
    lead_id: "abcdef123456789012345678",
    journey: "contrato",
    stage_len: 42,
    has_phone: true,
    has_email: true,
    handoff: "PENDING",
    as_of: "2026-08-31T12:00:00Z",
    history_state_sha256: "0123456789abcdef",
    promoted: true,
    dead: 2,
    aborted: 1,
    abort_reason: "policy_blocked",
    backlog_attempted: 3,
    backlog_policy_blocked: 1,
  };
  safeLog("error", "redaction_probe", adversarialLogFields);
  safeLog("error/private-error-442", `redaction_probe/${logCanaries.uri}?q=${logCanaries.query}`, adversarialLogFields);
  safeLog("error", "redaction_probe", { code: logCanaries.ipv6 });
  safeLog("info", "operational_probe", {
    status: "persisted",
    http: 202,
    attempts: 2,
    reason: "retryable",
  });
} finally {
  console.log = originalLog;
  console.error = originalError;
}

assert(stdoutLines.length > 0, "handler did not emit an operational stdout log");
assert(stderrLines.length > 0, "error path did not emit an operational stderr log");
const logText = [...stdoutLines, ...stderrLines].join("\n");
for (const needle of [
  "private.person",
  "98888",
  "123.456",
  "12.345",
  "must-not-leak",
  ...Object.values(logCanaries),
]) {
  assert.equal(logText.includes(needle), false, `request canary leaked in app log: ${needle}`);
}
assert(logText.includes("abcdef123456789012345678"), "opaque receipt was over-redacted");
for (const aggregate of [
  '"journey":"contrato"',
  '"stage_len":42',
  '"has_phone":true',
  '"has_email":true',
  '"handoff":"PENDING"',
  '"as_of":"2026-08-31T12:00:00Z"',
  '"history_state_sha256":"0123456789abcdef"',
  '"promoted":true',
  '"dead":2',
  '"aborted":1',
  '"abort_reason":"policy_blocked"',
  '"backlog_attempted":3',
  '"backlog_policy_blocked":1',
]) {
  assert(logText.includes(aggregate), `operational aggregate was over-redacted: ${aggregate}`);
}
assert.equal(redactSensitiveText("failure for (11) 98888-7766"), "failure for [redacted]");
const parsedLogs = [...stdoutLines, ...stderrLines].map((line) => JSON.parse(line));
const invalidEvent = parsedLogs.find((line) => line.event === "invalid_event");
assert.equal(invalidEvent?.level, "error", "invalid log metadata did not fail closed");
const operationalEvent = parsedLogs.find((line) => line.event === "operational_probe");
assert.deepEqual(
  {
    level: operationalEvent?.level,
    status: operationalEvent?.status,
    http: operationalEvent?.http,
    attempts: operationalEvent?.attempts,
    reason: operationalEvent?.reason,
  },
  { level: "info", status: "persisted", http: 202, attempts: 2, reason: "retryable" },
  "allowlisted operational fields were over-redacted",
);

const beforePreview = (await store.list()).length;
const preview = await previewEligibility.handler({
  httpMethod: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    cnpj: "12.345.678/0001-90",
    representante: "Must Not Persist",
    offer_id: "preview-offer",
    accept_terms: true,
  }),
});
assert.equal(preview.statusCode, 403);
assert.equal(JSON.parse(preview.body).error, "preview_intake_disabled");
assert.equal((await store.list()).length, beforePreview);

process.stdout.write(JSON.stringify({
  ok: true,
  context: process.env.CONTEXT,
  missing_token_http: missing.statusCode,
  wrong_probe_http: wrong.statusCode,
  authenticated_probe_http: correct.statusCode,
  record_kind: persisted.record_kind,
  commercial_next_action: persisted.next_action,
  production_preview_intake_http: preview.statusCode,
  app_log_stdout_redaction: "PASS",
  app_log_stderr_redaction: "PASS",
}) + "\n");
