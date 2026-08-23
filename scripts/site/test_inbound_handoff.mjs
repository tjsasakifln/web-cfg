/**
 * Drives the shipped lead handler + inbound-handoff against a mock Warmbly
 * inbound verifier. Not a reimplementation of capture. Persist-first, HMAC,
 * idempotent retry, 401/5xx/timeout, query-PII reject, fail-closed, no secrets.
 */
import { createRequire } from "module";
import crypto from "crypto";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-inbound-"));
process.env.LEAD_STORE_DIR = storeDir;
process.env.NODE_ENV = "test";
delete process.env.NTFY_URL;
delete process.env.RESEND_API_KEY;
delete process.env.OPS_WEBHOOK_URL;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.LEAD_REQUIRE_TURNSTILE;
delete process.env.CONTEXT;
delete process.env.NETLIFY_CONTEXT;

const SECRET = "inbound-test-secret-not-for-prod";
const CANARY_ENV = {
  CONFENGE_INBOUND_CANARY_ENABLED: "1",
  CONFENGE_INBOUND_CANARY_ASSET_ID: "diagnostico-defesa-margem",
};
const PII_QUERY_KEYS = [
  "email",
  "nome",
  "telefone",
  "cnpj",
  "phone",
  "name",
  "mensagem",
  "consent",
];

function independentVerify(secret, header, rawBody, now = Date.now()) {
  let tUnix = 0;
  let sig = "";
  for (const part of String(header || "").split(",")) {
    const p = part.trim();
    if (p.startsWith("t=")) tUnix = Number(p.slice(2));
    if (p.startsWith("v1=")) sig = p.slice(3);
  }
  if (!tUnix || !sig) return { ok: false, reason: "malformed" };
  if (Math.abs(now - tUnix * 1000) > 5 * 60 * 1000) return { ok: false, reason: "skew" };
  const mac = crypto.createHmac("sha256", secret).update(`${tUnix}.${rawBody}`).digest("hex");
  if (mac !== sig) return { ok: false, reason: "mismatch" };
  return { ok: true };
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

const inboundPath = path.join(root, "netlify/functions/lib/inbound-handoff.cjs");
const leadPath = path.join(root, "netlify/functions/lead.cjs");
const opsPath = path.join(root, "netlify/functions/ops.cjs");

function loadInbound() {
  delete require.cache[require.resolve(inboundPath)];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-core.cjs"))];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-store.cjs"))];
  return require(inboundPath);
}

function loadHandler() {
  for (const rel of [
    "netlify/functions/lead.cjs",
    "netlify/functions/lib/lead-core.cjs",
    "netlify/functions/lib/lead-store.cjs",
    "netlify/functions/lib/lead-delivery.cjs",
    "netlify/functions/lib/lead-rate-limit.cjs",
    "netlify/functions/lib/inbound-handoff.cjs",
  ]) {
    const p = path.join(root, rel);
    if (require.cache[require.resolve(p)]) delete require.cache[require.resolve(p)];
  }
  return require(leadPath);
}

const inbound = loadInbound();

// --- mapper: present in, missing out, no invention ---
{
  const mapped = inbound.mapLeadToInboundV1({
    lead_id: "abc123abc123abc123abc123",
    received_at: "2026-08-14T14:55:00.000Z",
    source: "CONFENGE_WEB",
    route_family: "defesa-margem-diagnostico",
    asset_id: "diagnostico-defesa-margem",
    cta_id: "segunda-leitura-contrato",
    landing_page: "/ferramentas/diagnostico-defesa-margem/",
    public_contract_id: "01619104000141-1-000123/2026",
    public_id_slug: "qc-caixa-dagua-2026",
    nome: "QA Inbound",
    email: "qa-inbound@example.com",
    telefone: "48988344559",
    consentimento: true,
    utm_source: "test",
    utm_medium: "cpc",
    mensagem: "Quero uma segunda leitura",
    correlation_id: "corr-1",
    record_kind: "synthetic",
  });
  if (mapped.lead_id !== "abc123abc123abc123abc123") fail("map_lead_id", mapped);
  if (mapped.receipt_id !== mapped.lead_id) fail("map_receipt", mapped);
  if (mapped.record_kind !== "synthetic") fail("map_record_kind", mapped);
  if (mapped.source !== "CONFENGE_WEB") fail("map_source", mapped.source);
  if (mapped.landing_url !== "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/") {
    fail("map_landing_url", mapped.landing_url);
  }
  if (mapped.landing_page) fail("map_must_use_contract_landing_url", mapped);
  if (mapped.contract_public_id !== "01619104000141-1-000123/2026") fail("map_contract", mapped);
  if (mapped.public_contract_id) fail("map_must_alias_contract", mapped);
  if (mapped.entity_public_id) fail("map_invented_entity", mapped);
  if (mapped.cnpj) fail("map_invented_cnpj_from_public_id", mapped);
  if (mapped.name !== "QA Inbound" || mapped.email !== "qa-inbound@example.com") fail("map_contact", mapped);
  if (!mapped.consent || mapped.consent.granted !== true) fail("map_consent", mapped);
  if (!mapped.utm || mapped.utm.source !== "test") fail("map_utm", mapped);
  if (mapped.correlation_id !== "corr-1") fail("map_corr", mapped);
  pass("mapper_present_fields");
}

{
  const sparse = inbound.mapLeadToInboundV1({
    lead_id: "only-id-0000000000000001",
    received_at: "2026-08-14T14:55:00.000Z",
    consentimento: false,
  });
  if (sparse.contract_public_id || sparse.entity_public_id || sparse.cnpj || sparse.company) {
    fail("sparse_invented", sparse);
  }
  if (sparse.consent) fail("sparse_consent_not_collected", sparse);
  if (sparse.utm) fail("sparse_utm", sparse);
  if (sparse.route_family || sparse.asset_id) fail("sparse_attr", sparse);
  pass("mapper_absent_stays_absent");
}

{
  const signed = inbound.signWarmblyInbound(SECRET, '{"lead_id":"x"}', 1_700_000_000);
  const check = independentVerify(SECRET, signed, '{"lead_id":"x"}', 1_700_000_000 * 1000);
  if (!check.ok) fail("hmac_independent_verify", { signed, check });
  const bad = independentVerify(SECRET, signed.replace(/.$/, "0"), '{"lead_id":"x"}', 1_700_000_000 * 1000);
  if (bad.ok) fail("hmac_must_reject_tamper", bad);
  pass("hmac_matches_warmbly_contract");
}

{
  const prod = inbound.resolveInboundConfig({
    ...CANARY_ENV,
    NODE_ENV: "production",
    CONTEXT: "production",
    CONFENGE_INBOUND_WEBHOOK_URL: "http://evil.example/api/v1/webhooks/confenge/inbound",
    CONFENGE_INBOUND_WEBHOOK_SECRET: SECRET,
  });
  if (prod.ok || !prod.blocked || prod.reason !== "https_required") fail("fail_closed_http", prod);
  const noSecret = inbound.resolveInboundConfig({
    ...CANARY_ENV,
    NODE_ENV: "production",
    CONFENGE_INBOUND_WEBHOOK_URL: "https://ops.example/api/v1/webhooks/confenge/inbound",
  });
  if (noSecret.ok || !noSecret.blocked) fail("fail_closed_secret", noSecret);
  const piiUrl = inbound.resolveInboundConfig({
    ...CANARY_ENV,
    CONFENGE_INBOUND_WEBHOOK_URL:
      "https://ops.example/api/v1/webhooks/confenge/inbound?email=a@b.com",
    CONFENGE_INBOUND_WEBHOOK_SECRET: SECRET,
  });
  if (piiUrl.ok || !piiUrl.blocked) fail("fail_closed_query_pii", piiUrl);
  const missing = inbound.resolveInboundConfig({});
  if (!missing.skip || missing.reason !== "not_configured") fail("unconfigured_skip", missing);
  const wrongHost = inbound.resolveInboundConfig({
    CONFENGE_INBOUND_WEBHOOK_URL: "https://ops.example/api/v1/webhooks/confenge/inbound",
    CONFENGE_INBOUND_WEBHOOK_SECRET: SECRET,
    CONFENGE_INBOUND_ALLOWED_HOSTS: "api.confenge.com.br",
  });
  if (wrongHost.ok || wrongHost.reason !== "host_not_allowed") fail("fail_closed_wrong_host", wrongHost);
  const wrongPath = inbound.resolveInboundConfig({
    CONFENGE_INBOUND_WEBHOOK_URL: "https://api.confenge.com.br/not-inbound",
    CONFENGE_INBOUND_WEBHOOK_SECRET: SECRET,
  });
  if (wrongPath.ok || wrongPath.reason !== "invalid_path") fail("fail_closed_wrong_path", wrongPath);
  const flagOff = inbound.evaluateCanaryRecord({ asset_id: "diagnostico-defesa-margem", record_kind: "real" }, {});
  if (flagOff.status !== "SKIPPED" || flagOff.reason !== "flag_disabled") fail("canary_flag", flagOff);
  const wrongScope = inbound.evaluateCanaryRecord({ asset_id: "diagnostico-defesa-margem", record_kind: "real" }, {
    ...CANARY_ENV,
    CONFENGE_INBOUND_CANARY_ASSET_ID: "all-pages",
    CONFENGE_INBOUND_WEBHOOK_URL: "https://api.confenge.com.br/api/v1/webhooks/confenge/inbound",
    CONFENGE_INBOUND_WEBHOOK_SECRET: SECRET,
  });
  if (wrongScope.status !== "BLOCKED" || wrongScope.reason !== "canary_scope_invalid") fail("canary_scope", wrongScope);
  const outside = inbound.evaluateCanaryRecord(
    { asset_id: "diretoria-b2g", record_kind: "real" },
    {
      ...CANARY_ENV,
      CONFENGE_INBOUND_WEBHOOK_URL: "https://api.confenge.com.br/api/v1/webhooks/confenge/inbound",
      CONFENGE_INBOUND_WEBHOOK_SECRET: SECRET,
    },
  );
  if (outside.status !== "SKIPPED" || outside.reason !== "outside_canary") fail("outside_canary", outside);
  pass("fail_closed_config");
}

// --- strict historical SKIPPED classifier: unknown never defaults to real ---
{
  const base = {
    lead_id: "abc123abc123abc123abc123",
    receipt_id: "abc123abc123abc123abc123",
    record_kind: "real",
    consentimento: true,
    email: "compras@construtora-real.com.br",
    handoff: { status: "SKIPPED", reason: "not_configured" },
  };
  const expectClass = (name, record, expected) => {
    const got = inbound.classifySkippedForRequeue(record);
    if (got.classification !== expected) fail(name, got);
  };
  expectClass(
    "requeue_non_real_reason_never",
    { ...base, handoff: { status: "SKIPPED", reason: "non_real" } },
    inbound.REQUEUE_CLASS.NEVER_REQUEUE_NON_REAL,
  );
  expectClass(
    "requeue_synthetic_never",
    { ...base, record_kind: "synthetic" },
    inbound.REQUEUE_CLASS.NEVER_REQUEUE_NON_REAL,
  );
  expectClass("requeue_qa_never", { ...base, record_kind: "qa" }, inbound.REQUEUE_CLASS.NEVER_REQUEUE_NON_REAL);
  expectClass(
    "requeue_missing_consent_manual",
    { ...base, consentimento: false },
    inbound.REQUEUE_CLASS.MANUAL_REVIEW_LEGACY,
  );
  const { record_kind: _legacyKind, ...legacy } = base;
  expectClass("requeue_legacy_kind_manual", legacy, inbound.REQUEUE_CLASS.MANUAL_REVIEW_LEGACY);
  expectClass(
    "requeue_reserved_test_identity_never",
    { ...base, email: "person@example.com" },
    inbound.REQUEUE_CLASS.NEVER_REQUEUE_NON_REAL,
  );
  expectClass(
    "requeue_dnc_suppressed",
    { ...base, consent: { granted: true, dnc: true } },
    inbound.REQUEUE_CLASS.DNC_OR_SUPPRESSED,
  );
  expectClass("requeue_real_consent_eligible", base, inbound.REQUEUE_CLASS.ELIGIBLE_REAL_NOT_CONFIGURED);
  const audit = inbound.auditSkippedHandoffs([base, legacy, { ...base, record_kind: "synthetic" }]);
  if (audit.total !== 3 || audit.eligible_real_not_configured !== 1 || audit.manual_review !== 1 || audit.never_requeue !== 1) {
    fail("requeue_aggregate_audit", audit);
  }
  const auditBlob = JSON.stringify(audit);
  if (auditBlob.includes(base.email) || auditBlob.includes(base.lead_id)) fail("requeue_audit_pii", audit);
  pass("strict_requeue_classifier_and_aggregate_audit", audit.by_commercial_eligibility);
}

function moneyPayload(extra = {}) {
  return {
    nome: "Maria Costa",
    email: extra.email || "maria.costa@construtora-norte.com.br",
    estagio: "problema urgente em contrato",
    jornada: "contrato",
    consentimento: "on",
    origem: "/ferramentas/diagnostico-defesa-margem/",
    landing_page: "/ferramentas/diagnostico-defesa-margem/",
    asset_id: "diagnostico-defesa-margem",
    route_family: "defesa-margem-diagnostico",
    public_contract_id: "01619104000141-1-000123/2026",
    public_id_slug: "qc-caixa-dagua-2026",
    cta_id: "segunda-leitura-contrato",
    utm_source: "test",
    utm_medium: "cpc",
    mensagem: "PII_MUST_NOT_LEAK",
    ...extra,
  };
}

function event(body, extraHeaders = {}) {
  return {
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-inbound-test/1.0",
      "x-forwarded-for": extraHeaders.ip || "203.0.113.80",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function startMock({ mode = "ok", secret = SECRET } = {}) {
  const seen = [];
  let autoSendEnabled = false;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const url = new URL(req.url, `http://${req.headers.host}`);
      const rec = {
        method: req.method,
        pathname: url.pathname,
        search: url.search,
        headers: req.headers,
        raw,
      };
      seen.push(rec);

      if (req.method === "GET" && url.pathname === "/api/v1/webhooks/confenge/inbound/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: autoSendEnabled ? "BLOCKED" : "READY",
            auto_send_enabled: autoSendEnabled,
            dispatch_attempted: false,
          }),
        );
        return;
      }

      if (req.method !== "POST" || url.pathname !== "/api/v1/webhooks/confenge/inbound") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      for (const key of url.searchParams.keys()) {
        if (PII_QUERY_KEYS.includes(String(key).toLowerCase())) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "pii_on_query" }));
          return;
        }
      }
      const verified = independentVerify(secret, req.headers["x-warmbly-signature"], raw);
      if (!verified.ok) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid inbound signature", reason: verified.reason }));
        return;
      }
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_json" }));
        return;
      }
      rec.body = body;
      if (mode === "5xx") {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "downstream" }));
        return;
      }
      if (mode === "401") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid inbound signature" }));
        return;
      }
      if (mode === "403") {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "forbidden" }));
        return;
      }
      if (mode === "timeout") {
        return; // never respond
      }
      const duplicate = seen.filter((s) => s.body && s.body.lead_id === body.lead_id).length > 1;
      res.writeHead(duplicate ? 200 : 201, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          data: {
            lead: { id: `wb-${body.lead_id}` },
            action: { id: `act-${body.lead_id}` },
            duplicate,
            next_action: "INBOUND_NOW",
            dispatch_attempted: false,
          },
        }),
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        seen,
        url: `http://127.0.0.1:${port}/api/v1/webhooks/confenge/inbound`,
        setMode(next) {
          mode = next;
        },
        setAutoSendEnabled(next) {
          autoSendEnabled = Boolean(next);
        },
        close() {
          return new Promise((r) => server.close(r));
        },
      });
    });
  });
}

const { MemoryStore, FileStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
const { handler, setStoreForTests } = loadHandler();
const { _reset } = require(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"));
const mem = new MemoryStore();
setStoreForTests(mem);
_reset();

const order = [];
const origPut = mem.put.bind(mem);
mem.put = async (...args) => {
  order.push("persist");
  return origPut(...args);
};

const mock = await startMock({ mode: "ok" });
Object.assign(process.env, CANARY_ENV);
process.env.CONFENGE_INBOUND_WEBHOOK_URL = mock.url;
process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = SECRET;
process.env.CONFENGE_INBOUND_TIMEOUT_MS = "400";

const logs = [];
const origLog = console.log;
const origErr = console.error;
console.log = (...a) => {
  logs.push(a.join(" "));
  origLog(...a);
};
console.error = (...a) => {
  logs.push(a.join(" "));
  origErr(...a);
};

try {
  // persist-first + 201 + contract body
  {
    const origMemGet = mem.get.bind(mem);
    const beforeSeen = mock.seen.length;
    const res = await handler(
      event(moneyPayload({ idempotency_key: "inbound-happy-001" }), {
        "Idempotency-Key": "inbound-happy-001",
      }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.ok || !data.lead_id) fail("persist_success", { res: res.statusCode, data });
    const bodyStr = JSON.stringify(data);
    if (bodyStr.includes("PII_MUST_NOT_LEAK") || bodyStr.includes("maria.costa@") || bodyStr.includes("Maria Costa")) {
      fail("response_pii", data);
    }
    const stored = await origMemGet(data.lead_id);
    if (!stored) fail("not_stored", data.lead_id);
    if (order.indexOf("persist") < 0) fail("persist_not_recorded", order);
    if (mock.seen.length !== beforeSeen + 1) fail("dest_not_called_once", { seen: mock.seen.length, beforeSeen });
    if (order.indexOf("persist") >= 0 && mock.seen.length) {
      // persist must precede dest: put ran before dest request completed
      pass("persist_before_dest", { lead_id: data.lead_id });
    }
    const hit = mock.seen[mock.seen.length - 1];
    if (hit.method !== "POST") fail("dest_method", hit.method);
    if (hit.pathname !== "/api/v1/webhooks/confenge/inbound") fail("dest_path", hit.pathname);
    if (hit.search && hit.search.length > 1) fail("dest_query_must_be_empty", hit.search);
    const destBody = hit.body;
    if (destBody.landing_url !== "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/") {
      fail("dest_landing_url", destBody);
    }
    if (destBody.contract_public_id !== "01619104000141-1-000123/2026") fail("dest_contract", destBody);
    if (destBody.entity_public_id || destBody.cnpj) fail("dest_invented_entity_or_cnpj", destBody);
    if (destBody.source !== "CONFENGE_WEB") fail("dest_source", destBody.source);
    if (destBody.route_family !== "defesa-margem-diagnostico") fail("dest_route", destBody);
    if (destBody.asset_id !== "diagnostico-defesa-margem") fail("dest_asset", destBody);
    if (destBody.cta_id !== "segunda-leitura-contrato") fail("dest_cta", destBody);
    if (!destBody.consent || destBody.consent.granted !== true) fail("dest_consent", destBody);
    const refreshed = await origMemGet(data.lead_id);
    if (!refreshed.handoff || refreshed.handoff.status !== "DELIVERED") {
      fail("handoff_delivered", refreshed.handoff);
    }
    if (refreshed.handoff.downstream && refreshed.handoff.downstream.duplicate === true) {
      fail("first_must_not_be_duplicate", refreshed.handoff);
    }
    globalThis._lastHappy = { lead_id: data.lead_id, destBody };
    pass("handoff_201_contract_fields", { lead_id: data.lead_id });
  }

  // idempotent replay of same lead_id: one stored lead, dest not re-POSTed
  {
    const before = mock.seen.length;
    const storeCount = (await mem.list()).length;
    const res = await handler(
      event(moneyPayload({ idempotency_key: "inbound-happy-001" }), {
        "Idempotency-Key": "inbound-happy-001",
      }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 200 || data.idempotent !== true) fail("replay_status", { s: res.statusCode, data });
    if (data.lead_id !== globalThis._lastHappy.lead_id) fail("replay_new_id", data);
    if (mock.seen.length !== before) fail("replay_redelivered", { before, after: mock.seen.length });
    if ((await mem.list()).length !== storeCount) fail("replay_second_lead", storeCount);
    pass("idempotent_no_second_commercial_post", { lead_id: data.lead_id });
  }

  // 5xx then drain with same key → DELIVERED
  {
    mock.setMode("5xx");
    const res = await handler(
      event(moneyPayload({ idempotency_key: "inbound-5xx-001", email: "maria.5xx@construtora-norte.com.br" }), {
        "Idempotency-Key": "inbound-5xx-001",
      }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("five_xx_capture", data);
    const stored = await mem.get(data.lead_id);
    if (!stored) fail("five_xx_dropped_lead", data.lead_id);
    if (!stored.handoff || stored.handoff.status !== "RETRYABLE") fail("five_xx_status", stored.handoff);
    mock.setMode("ok");
    stored.handoff.next_attempt_at = new Date(Date.now() - 1000).toISOString();
    await mem.update(data.lead_id, { handoff: stored.handoff });
    const drain = await inbound.drainPendingHandoffs(mem, { now: new Date() });
    if (!drain.ok || drain.delivered < 1) fail("five_xx_drain", drain);
    const after = await mem.get(data.lead_id);
    if (after.lead_id !== data.lead_id) fail("five_xx_new_id", after);
    if (after.handoff.status !== "DELIVERED") fail("five_xx_not_delivered", after.handoff);
    const destIds = mock.seen.filter((s) => s.body && s.body.lead_id === data.lead_id);
    if (destIds.length < 2) fail("five_xx_retry_not_seen", destIds.length);
    if (destIds.some((s) => s.body.lead_id !== data.lead_id)) fail("five_xx_key_changed", destIds);
    pass("retry_after_5xx_same_lead_id", { lead_id: data.lead_id, dest_posts: destIds.length });
  }

  // timeout: capture succeeds, RETRYABLE, drain delivers
  {
    mock.setMode("timeout");
    process.env.CONFENGE_INBOUND_TIMEOUT_MS = "150";
    const res = await handler(
      event(moneyPayload({ idempotency_key: "inbound-timeout-001", email: "maria.timeout@construtora-norte.com.br" }), {
        "Idempotency-Key": "inbound-timeout-001",
      }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("timeout_capture", data);
    const stored = await mem.get(data.lead_id);
    if (!stored || stored.handoff.status !== "RETRYABLE") fail("timeout_status", stored && stored.handoff);
    if (stored.handoff.last_error !== "timeout") fail("timeout_error", stored.handoff);
    mock.setMode("ok");
    process.env.CONFENGE_INBOUND_TIMEOUT_MS = "400";
    stored.handoff.next_attempt_at = new Date(Date.now() - 1000).toISOString();
    await mem.update(data.lead_id, { handoff: stored.handoff });
    const drain = await inbound.drainPendingHandoffs(mem, { now: new Date() });
    const after = await mem.get(data.lead_id);
    if (after.handoff.status !== "DELIVERED") fail("timeout_drain", { drain, handoff: after.handoff });
    if (after.lead_id !== data.lead_id) fail("timeout_new_id", after);
    pass("timeout_keeps_lead_then_delivers", { lead_id: data.lead_id });
  }

  // dest 401: lead persisted, handoff BLOCKED
  {
    mock.setMode("401");
    const res = await handler(
      event(moneyPayload({ idempotency_key: "inbound-401-001", email: "maria.401@construtora-norte.com.br" }), {
        "Idempotency-Key": "inbound-401-001",
      }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("unauth_capture", data);
    const stored = await mem.get(data.lead_id);
    if (!stored) fail("unauth_dropped", data.lead_id);
    if (stored.handoff.status !== "BLOCKED") fail("unauth_status", stored.handoff);
    pass("invalid_signature_401_keeps_lead", { lead_id: data.lead_id });
    mock.setMode("ok");
  }

  // fail-closed production http: persist, no dest POST
  {
    const before = mock.seen.length;
    process.env.NODE_ENV = "production";
    process.env.CONTEXT = "production";
    process.env.CONFENGE_INBOUND_WEBHOOK_URL = "http://127.0.0.1:9/api/v1/webhooks/confenge/inbound";
    const res = await handler(
      event(moneyPayload({ idempotency_key: "inbound-closed-001", email: "maria.closed@construtora-norte.com.br" }), {
        "Idempotency-Key": "inbound-closed-001",
      }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("closed_capture", data);
    const stored = await mem.get(data.lead_id);
    if (!stored) fail("closed_dropped", data.lead_id);
    if (!stored.handoff || stored.handoff.status !== "BLOCKED") fail("closed_status", stored.handoff);
    if (mock.seen.length !== before) fail("closed_posted", mock.seen.length - before);
    process.env.NODE_ENV = "test";
    delete process.env.CONTEXT;
    process.env.CONFENGE_INBOUND_WEBHOOK_URL = mock.url;
    pass("fail_closed_no_post");
  }

  // secrets never in logs / response
  {
    const blob = logs.join("\n");
    if (blob.includes(SECRET)) fail("secret_in_logs");
    if (blob.includes("inbound-test-secret")) fail("secret_fragment_in_logs");
    pass("secret_not_logged");
  }

  // ops counters + drain auth surface (no PII)
  {
    const opsFileStore = new FileStore(storeDir);
    await opsFileStore.put({
      lead_id: "opsaudit0000000000000001",
      receipt_id: "opsaudit0000000000000001",
      record_kind: "real",
      consentimento: true,
      nome: "Pessoa que não pode aparecer",
      email: "privado@empresa-real.com.br",
      received_at: "2026-08-20T12:00:00.000Z",
      handoff: { status: "SKIPPED", reason: "not_configured", attempts: 0 },
    });
    await opsFileStore.put({
      lead_id: "opssynth0000000000000001",
      receipt_id: "opssynth0000000000000001",
      record_kind: "synthetic",
      consentimento: true,
      email: "probe@example.com",
      received_at: "2026-08-20T12:01:00.000Z",
      handoff: { status: "SKIPPED", reason: "not_configured", attempts: 0 },
    });
    process.env.OPS_TOKEN = "ops-test-token-16chars-min";
    delete require.cache[require.resolve(opsPath)];
    const ops = require(opsPath);
    const res = await ops.handler({
      httpMethod: "GET",
      headers: {
        origin: "https://confenge.com.br",
        authorization: "Bearer ops-test-token-16chars-min",
      },
      queryStringParameters: { action: "inbound_handoff" },
      rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=inbound_handoff",
    });
    const data = JSON.parse(res.body);
    if (res.statusCode !== 200 || !data.ok || !data.counters) fail("ops_counters", data);
    for (const k of ["persisted_leads", "pending", "delivered", "retries", "permanent_failures", "latency"]) {
      if (!(k in data.counters)) fail("ops_counter_key", k);
    }
    if (
      !data.configuration ||
      data.configuration.webhook_url !== "SET" ||
      data.configuration.webhook_secret !== "SET" ||
      data.configuration.canary_enabled !== "SET" ||
      data.configuration.canary_asset_id !== "diagnostico-defesa-margem" ||
      data.configuration.contract !== "READY" ||
      data.configuration.reason !== null
    ) {
      fail("ops_inbound_configuration", data.configuration);
    }
    const s = JSON.stringify(data);
    if (s.includes("maria.costa@") || s.includes("Maria Costa") || s.includes(SECRET)) {
      fail("ops_counters_pii_or_secret", data);
    }
    pass("ops_inbound_configuration", data.configuration);
    pass("ops_counters", data.counters);

    const opsEvent = (action, method = "GET", body = null) => ({
      httpMethod: method,
      headers: {
        origin: "https://confenge.com.br",
        authorization: "Bearer ops-test-token-16chars-min",
      },
      queryStringParameters: { action },
      rawUrl: `https://confenge.com.br/.netlify/functions/ops?action=${action}`,
      body: body ? JSON.stringify(body) : null,
    });
    const auditRes = await ops.handler(opsEvent("audit_inbound_requeue"));
    const auditData = JSON.parse(auditRes.body);
    if (auditRes.statusCode !== 200 || auditData.audit.eligible_real_not_configured !== 1 || auditData.audit.never_requeue !== 1) {
      fail("ops_requeue_audit", auditData);
    }
    const auditText = JSON.stringify(auditData);
    if (auditText.includes("privado@") || auditText.includes("Pessoa que não")) fail("ops_requeue_audit_pii", auditData);
    const dryRes = await ops.handler(
      opsEvent("requeue_inbound", "POST", { mode: "eligible_only", dry_run: true }),
    );
    const dryData = JSON.parse(dryRes.body);
    if (dryRes.statusCode !== 200 || dryData.eligible_count !== 1 || dryData.never_requeue_count !== 1) {
      fail("ops_requeue_dry_run", dryData);
    }
    mock.setAutoSendEnabled(true);
    const unsafeRes = await ops.handler(
      opsEvent("requeue_inbound", "POST", { mode: "eligible_only", dry_run: false, limit: 1 }),
    );
    if (unsafeRes.statusCode !== 409) fail("ops_requeue_auto_send_abort", JSON.parse(unsafeRes.body));
    if ((await opsFileStore.get("opsaudit0000000000000001")).handoff.status !== "SKIPPED") {
      fail("ops_requeue_auto_send_mutation");
    }
    mock.setAutoSendEnabled(false);
    pass("ops_requeue_audit_dry_run_and_global_abort");
    delete process.env.OPS_TOKEN;
  }

  // Strict requeue is dry-run first, safety-gated, bounded, and idempotent.
  {
    const requeueStore = new MemoryStore();
    const eligible = {
      lead_id: "eligible0000000000000001",
      receipt_id: "eligible0000000000000001",
      asset_id: "diagnostico-defesa-margem",
      record_kind: "real",
      consentimento: true,
      email: "compras@empresa-real.com.br",
      received_at: "2026-08-01T12:00:00.000Z",
      handoff: { status: "SKIPPED", reason: "not_configured", attempts: 0 },
    };
    await requeueStore.put(eligible);
    const dry = await inbound.requeueEligibleHandoffs(requeueStore, { dryRun: true });
    if (!dry.ok || dry.eligible_count !== 1) fail("requeue_dry_run", dry);
    const withoutGate = await inbound.requeueEligibleHandoffs(requeueStore, { dryRun: false, limit: 1 });
    if (withoutGate.ok || withoutGate.error !== "global_safety_gate_required") fail("requeue_requires_global_gate", withoutGate);

    mock.setAutoSendEnabled(true);
    const unsafeGate = await inbound.probeInboundDestinationHealth({ env: process.env });
    if (unsafeGate.ok || unsafeGate.auto_send_off) fail("requeue_auto_send_global_abort", unsafeGate);
    const unsafeRun = await inbound.requeueEligibleHandoffs(requeueStore, {
      dryRun: false,
      limit: 1,
      safetyGate: unsafeGate,
    });
    if (unsafeRun.ok) fail("requeue_auto_send_mutated", unsafeRun);
    if ((await requeueStore.get(eligible.lead_id)).handoff.status !== "SKIPPED") fail("requeue_auto_send_changed_status");

    mock.setAutoSendEnabled(false);
    const gate = await inbound.probeInboundDestinationHealth({ env: process.env });
    if (!gate.ok || !gate.auto_send_off || gate.contract !== "READY") fail("requeue_safe_gate", gate);
    const run = await inbound.requeueEligibleHandoffs(requeueStore, {
      dryRun: false,
      limit: 1,
      safetyGate: gate,
      now: new Date("2026-08-23T02:00:00.000Z"),
    });
    if (!run.ok || run.requeued_count !== 1) fail("requeue_eligible_to_pending", run);
    if ((await requeueStore.get(eligible.lead_id)).handoff.status !== "PENDING") fail("requeue_not_pending", run);
    const repeat = await inbound.requeueEligibleHandoffs(requeueStore, {
      dryRun: false,
      limit: 1,
      safetyGate: gate,
    });
    if (!repeat.ok || repeat.requeued_count !== 0) fail("requeue_second_run_idempotent", repeat);
    const before = mock.seen.filter((item) => item.body && item.body.lead_id === eligible.lead_id).length;
    const drain = await inbound.drainPendingHandoffs(requeueStore, { now: new Date() });
    const delivered = await requeueStore.get(eligible.lead_id);
    if (!drain.ok || drain.delivered !== 1 || delivered.handoff.status !== "DELIVERED") fail("requeue_pending_to_delivered", { drain, handoff: delivered.handoff });
    const after = mock.seen.filter((item) => item.body && item.body.lead_id === eligible.lead_id).length;
    if (after !== before + 1) fail("requeue_exactly_one_post", { before, after });
    pass("requeue_dry_run_gate_pending_delivered_idempotent");
  }

  // Auth failures block the row and abort the remaining batch immediately.
  {
    const blockedStore = new MemoryStore();
    const pending = (lead_id) => ({
      lead_id,
      receipt_id: lead_id,
      asset_id: "diagnostico-defesa-margem",
      record_kind: "real",
      consentimento: true,
      email: "ops@empresa-real.com.br",
      handoff: { status: "PENDING", attempts: 0, next_attempt_at: "2026-08-01T00:00:00.000Z" },
    });
    await blockedStore.put(pending("blocked00000000000000001"));
    await blockedStore.put(pending("blocked00000000000000002"));
    mock.setMode("401");
    const blocked = await inbound.drainPendingHandoffs(blockedStore, { now: new Date() });
    if (!blocked.aborted || blocked.abort_reason !== "authentication_or_destination_blocked" || blocked.attempted !== 1 || blocked.blocked !== 1) {
      fail("requeue_401_batch_abort", blocked);
    }
    const rows = await blockedStore.list();
    if (rows.filter((row) => row.handoff.status === "PENDING").length !== 1) fail("requeue_401_attempted_more_than_one", rows.map((row) => row.handoff.status));
    mock.setMode("403");
    const forbidden = await inbound.postInbound(pending("forbid000000000000000001"), { now: new Date(), env: process.env });
    if (forbidden.status !== "BLOCKED" || forbidden.http !== 403) fail("requeue_403_blocked", forbidden);
    mock.setMode("ok");
    const originalSecret = process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
    process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = "mismatched-test-secret";
    const mismatch = await inbound.postInbound(pending("mismatch00000000000000001"), { now: new Date(), env: process.env });
    process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = originalSecret;
    if (mismatch.status !== "BLOCKED" || mismatch.http !== 401) fail("requeue_secret_mismatch_blocked", mismatch);
    pass("requeue_auth_failures_abort_batch");
  }

  // Non-real / synthetic never mint a Warmbly commercial post
  {
    const before = mock.seen.length;
    const res = await handler(
      event(
        moneyPayload({
          nome: "SYNTHETIC-INBOUND",
          email: "probe+inbound@example.com",
          idempotency_key: "inbound-synth-001",
          utm_source: "synthetic",
        }),
        { "Idempotency-Key": "inbound-synth-001" },
      ),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("synth_capture", data);
    const stored = await mem.get(data.lead_id);
    if (!stored || stored.record_kind === "real") fail("synth_kind", stored && stored.record_kind);
    if (!stored.handoff || stored.handoff.status !== "SKIPPED") fail("synth_handoff", stored.handoff);
    if (mock.seen.length !== before) fail("synth_posted_to_warmbly", mock.seen.length - before);
    pass("non_real_skipped");
  }

  // A signed synthetic probe crosses only during the explicit canary window.
  {
    const probeSecret = "probe-secret-230-at-least-16";
    process.env.LEAD_PROBE_SECRET = probeSecret;
    process.env.CONFENGE_INBOUND_SYNTHETIC_CANARY_ENABLED = "1";
    const before = mock.seen.length;
    const res = await handler(
      event(
        moneyPayload({
          nome: "SYNTHETIC-INBOUND",
          email: "probe+reconcile@example.com",
          mensagem: "[QA] SYNTHETIC-INBOUND do not contact",
          record_kind: "synthetic",
          test_mode: true,
          idempotency_key: "inbound-synth-reconcile-001",
          utm_source: "synthetic",
        }),
        {
          "Idempotency-Key": "inbound-synth-reconcile-001",
          "X-Confenge-Probe": probeSecret,
        },
      ),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 201 || !data.lead_id) fail("synth_canary_capture", data);
    const stored = await mem.get(data.lead_id);
    if (stored?.record_kind !== "synthetic" || stored?.handoff?.status !== "DELIVERED") {
      fail("synth_canary_reconcile", stored);
    }
    const hit = mock.seen.find((item) => item.body?.lead_id === data.lead_id);
    if (!hit || hit.body.record_kind !== "synthetic") fail("synth_canary_contract", hit);
    if (mock.seen.length !== before + 1) fail("synth_canary_post_count", mock.seen.length - before);
    pass("synthetic_canary_authenticated_reconcile", { lead_id: data.lead_id });
    delete process.env.CONFENGE_INBOUND_SYNTHETIC_CANARY_ENABLED;
    delete process.env.LEAD_PROBE_SECRET;
  }

  // money-asset HTML carries public IDs already available; does not invent entity/CNPJ
  {
    const html = fs.readFileSync(
      path.join(root, "ferramentas/diagnostico-defesa-margem/index.html"),
      "utf8",
    );
    if (!html.includes('name="public_contract_id"')) fail("html_public_contract");
    if (!html.includes('name="public_id_slug"')) fail("html_public_slug");
    if (!html.includes('name="asset_id"') || !html.includes('name="cta_id"')) fail("html_asset_cta");
    if (/name="public_entity_id"/.test(html)) fail("html_invented_entity");
    if (/name="cnpj"/.test(html)) fail("html_invented_cnpj");
    pass("money_asset_public_ids_only");
  }

  const counters = inbound.summarizeHandoffs(await mem.list());
  pass("summarize_handoffs", counters);
} finally {
  console.log = origLog;
  console.error = origErr;
  await mock.close();
  try {
    fs.rmSync(storeDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

console.log("INBOUND_HANDOFF_OK", JSON.stringify({ tests: results.length }));
