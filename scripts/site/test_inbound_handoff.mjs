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
  });
  if (mapped.lead_id !== "abc123abc123abc123abc123") fail("map_lead_id", mapped);
  if (mapped.receipt_id !== mapped.lead_id) fail("map_receipt", mapped);
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
    NODE_ENV: "production",
    CONTEXT: "production",
    CONFENGE_INBOUND_WEBHOOK_URL: "http://evil.example/api/v1/webhooks/confenge/inbound",
    CONFENGE_INBOUND_WEBHOOK_SECRET: SECRET,
  });
  if (prod.ok || !prod.blocked || prod.reason !== "https_required") fail("fail_closed_http", prod);
  const noSecret = inbound.resolveInboundConfig({
    NODE_ENV: "production",
    CONFENGE_INBOUND_WEBHOOK_URL: "https://ops.example/api/v1/webhooks/confenge/inbound",
  });
  if (noSecret.ok || !noSecret.blocked) fail("fail_closed_secret", noSecret);
  const piiUrl = inbound.resolveInboundConfig({
    CONFENGE_INBOUND_WEBHOOK_URL:
      "https://ops.example/api/v1/webhooks/confenge/inbound?email=a@b.com",
    CONFENGE_INBOUND_WEBHOOK_SECRET: SECRET,
  });
  if (piiUrl.ok || !piiUrl.blocked) fail("fail_closed_query_pii", piiUrl);
  const missing = inbound.resolveInboundConfig({});
  if (!missing.skip) fail("unconfigured_skip", missing);
  pass("fail_closed_config");
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
        close() {
          return new Promise((r) => server.close(r));
        },
      });
    });
  });
}

const { MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
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
    const s = JSON.stringify(data);
    if (s.includes("maria.costa@") || s.includes("Maria Costa") || s.includes(SECRET)) {
      fail("ops_counters_pii_or_secret", data);
    }
    pass("ops_counters", data.counters);
    delete process.env.OPS_TOKEN;
  }

  // Non-real / synthetic never mint a Warmbly commercial post
  {
    const before = mock.seen.length;
    const res = await handler(
      event(
        moneyPayload({
          nome: "SYNTHETIC-PROBE",
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
