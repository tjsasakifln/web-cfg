import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRIORITY_ADITIVO_CONTRACT,
  PRIORITY_ADITIVO_CONTEXT,
  PRIORITY_ADITIVO_CONTEXT_KEYS,
  PRIORITY_ADITIVO_CTA_SELECTOR,
  PRIORITY_ADITIVO_ENTRY_PATH,
  PRIORITY_ADITIVO_FORM_PATH,
  PRIORITY_ADITIVO_FORM_SELECTOR,
  capturePriorityAditivoJourney,
  priorityAditivoContextSha256,
  validatePriorityAditivoJourney,
} from "./synthetic_priority_aditivo_journey.mjs";

const root = realpathSync(resolve(fileURLToPath(new URL("../..", import.meta.url))));
const require = createRequire(import.meta.url);
const { priorityAditivoPersistedContextSha256 } = require(
  resolve(root, "netlify/functions/lib/inbound-handoff.cjs"),
);
const probePath = resolve(root, "scripts/site/synthetic_lead_probe.mjs");
const SHA = "a".repeat(40);
const RECEIPT = "synthetic:fixture:priority-aditivo:0001";
const browserRequired = !process.argv.includes("--unit-only");
const temp = mkdtempSync(resolve(tmpdir(), "confenge-priority-aditivo-proof-"));
const fixturePath = resolve(temp, "priority-aditivo-journey.json");
let created = false;
let postCount = 0;
let postedBody = null;
let requestCount = 0;
let persistedContext = { ...PRIORITY_ADITIVO_CONTEXT };

const zeroCounts = {
  visitor: 0, cta_triggered: 0, form_started: 0, lead_persisted: 0, contacted: 0,
  qualified: 0, meeting: 0, proposal: 0, won: 0, lost: 0,
};

function syntheticPriorityRecord(overrides = {}) {
  return {
    lead_id: RECEIPT,
    receipt_id: RECEIPT,
    received_at: "2026-10-25T12:00:00.000Z",
    status: "new",
    record_kind: "synthetic",
    synthetic_probe_authenticated: true,
    next_action: "exclude_from_commercial",
    source: "CONFENGE_WEB",
    ...PRIORITY_ADITIVO_CONTEXT,
    handoff: {
      target: "warmbly_inbound",
      status: "DELIVERED",
      attempts: 1,
      delivered_at: "2026-10-25T12:00:01.000Z",
      downstream: { http: 201, duplicate: false, downstream_receipt: RECEIPT },
    },
    delivery: {
      notify: { status: "skipped" },
      email: { status: "skipped" },
    },
    ...overrides,
  };
}

async function assertRealOpsReadsPersistedDigest() {
  const envKeys = [
    "CONFENGE_STORAGE_BACKEND", "CONFENGE_STORAGE_DIR", "LEAD_STORE_DIR",
    "NODE_ENV", "CONTEXT", "NETLIFY_CONTEXT", "OPS_TOKEN", "REVOPS_TOKEN",
    "CONFENGE_INBOUND_WEBHOOK_URL", "CONFENGE_INBOUND_WEBHOOK_SECRET", "LEAD_PROBE_SECRET",
  ];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    process.env.CONFENGE_STORAGE_BACKEND = "memory";
    delete process.env.CONFENGE_STORAGE_DIR;
    delete process.env.LEAD_STORE_DIR;
    process.env.NODE_ENV = "test";
    process.env.CONTEXT = "dev";
    delete process.env.NETLIFY_CONTEXT;
    process.env.OPS_TOKEN = "ops-priority-test-token-at-least-16";
    process.env.LEAD_PROBE_SECRET = "probe-priority-test-secret-at-least-32-characters";
    delete process.env.REVOPS_TOKEN;
    delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
    delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;

    const { createStore } = require(resolve(root, "netlify/functions/lib/lead-store.cjs"));
    const lead = require(resolve(root, "netlify/functions/lead.cjs"));
    const ops = require(resolve(root, "netlify/functions/ops.cjs"));
    const opsEvent = (leadId) => ({
      httpMethod: "GET",
      headers: {
        authorization: `Bearer ${process.env.OPS_TOKEN}`,
        origin: "https://confenge.com.br",
        "x-forwarded-for": "127.0.0.1",
      },
      queryStringParameters: { action: "inbound_handoff", lead_id: leadId },
      rawUrl: `https://confenge.com.br/.netlify/functions/ops?action=inbound_handoff&lead_id=${encodeURIComponent(leadId)}`,
    });
    const store = await createStore({ event: opsEvent(RECEIPT) });
    assert.ok(store, "isolated test store must open");
    lead.setStoreForTests(store);
    const capture = await lead.handler({
      httpMethod: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "confenge-synthetic-probe/2.0",
        "x-forwarded-for": "127.0.0.2",
        "x-confenge-probe": process.env.LEAD_PROBE_SECRET,
        "x-confenge-probe-persist-only": "1",
        "idempotency-key": "synthetic-priority-ops-digest-test",
      },
      body: JSON.stringify({
        nome: "SYNTHETIC-PROBE",
        email: "probe@example.com",
        mensagem: "synthetic probe do not contact",
        consentimento: true,
        utm_source: "synthetic",
        utm_medium: "probe",
        utm_campaign: "inbound-live-proof",
        test_mode: true,
        record_kind: "synthetic",
        idempotency_key: "synthetic-priority-ops-digest-test",
        ...PRIORITY_ADITIVO_CONTEXT,
      }),
    });
    assert.equal(capture.statusCode, 201, capture.body);
    const persistedLeadId = JSON.parse(capture.body).lead_id;
    assert.match(persistedLeadId, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/);
    const exact = await store.get(persistedLeadId);
    assert.deepEqual(
      Object.fromEntries(PRIORITY_ADITIVO_CONTEXT_KEYS.map((key) => [key, exact[key]])),
      PRIORITY_ADITIVO_CONTEXT,
      "real lead handler must persist every browser technical field",
    );

    const exactResponse = await ops.handler(opsEvent(persistedLeadId));
    assert.equal(exactResponse.statusCode, 200, exactResponse.body);
    const exactReceipt = JSON.parse(exactResponse.body).receipt;
    const browserDigest = priorityAditivoContextSha256(PRIORITY_ADITIVO_CONTEXT);
    assert.equal(exactReceipt.priority_aditivo_context_sha256, browserDigest);
    for (const key of ["jornada", "estagio", "origem", "landing_page"]) {
      assert.equal(Object.hasOwn(exactReceipt, key), false, `${key} must not be exposed by ops receipt`);
    }

    await store.update(persistedLeadId, { jornada: "licitacao" });
    const driftedResponse = await ops.handler(opsEvent(persistedLeadId));
    assert.equal(driftedResponse.statusCode, 200, driftedResponse.body);
    const driftedReceipt = JSON.parse(driftedResponse.body).receipt;
    assert.match(driftedReceipt.priority_aditivo_context_sha256, /^[0-9a-f]{64}$/);
    assert.notEqual(
      driftedReceipt.priority_aditivo_context_sha256,
      browserDigest,
      "persisted field drift must change the server digest",
    );
  } finally {
    try {
      const lead = require(resolve(root, "netlify/functions/lead.cjs"));
      lead.setStoreForTests(null);
    } catch { /* module did not load */ }
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function staticFile(pathname, res) {
  const clean = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const candidate = resolve(root, `.${decodeURIComponent(clean)}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return false;
  try {
    const file = realpathSync(candidate);
    if (!file.startsWith(`${root}${sep}`) || !statSync(file).isFile()) return false;
    const type = {
      ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2",
      ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg",
    }[extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(readFileSync(file));
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  requestCount += 1;
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/.well-known/build-info.json") return json(res, 200, { commit: SHA });
  if (url.pathname === "/.netlify/functions/ops") {
    const action = url.searchParams.get("action");
    if (action === "analytics_summary") return json(res, 200, {
      ok: true, events_loaded: 0,
      aggregate: { generated_at: "2026-10-25T12:00:00.000Z", daily: [] },
    });
    if (action === "funnel") {
      return json(res, 200, { ok: true, commercial_only: true, funnel: { counts: zeroCounts, pipeline_value: 0, revenue: 0 } });
    }
    if (action === "system_health") {
      return json(res, 200, { ok: true, counts_by_kind: { real: 2, synthetic: created ? 6 : 5, qa: 1 } });
    }
    if (action === "weekly_report") {
      return json(res, 200, {
        ok: true, commercial_only: true, leads_total: 2, leads_new_7d: 0,
        leads_excluded_non_real: created ? 7 : 6,
        system_health: { pipeline_real: 0, revenue_real: 0 },
      });
    }
    if (action === "inbound_handoff") {
      const requested = url.searchParams.get("lead_id");
      return json(res, 200, {
        ok: true,
        counters: {
          persisted_leads: created ? 9 : 8, pending: 0, delivered: created ? 8 : 7,
          retryable: 0, retries: 1, permanent_failures: 0, skipped: 1, blocked: 0, dead: 0,
        },
        configuration: { contract: "READY", destination_fingerprint: "WARMBLY_PRODUCTION_V1" },
        safety_gate: { ok: true, contract: "READY", auto_send_off: true, dispatch_attempted: false },
        receipt: created && requested === RECEIPT ? {
          lead_id: RECEIPT,
          record_kind: "synthetic",
          authenticated_probe: true,
          source: "CONFENGE_WEB",
          next_action: "exclude_from_commercial",
          asset_id: PRIORITY_ADITIVO_CONTEXT.asset_id,
          cta_id: PRIORITY_ADITIVO_CONTEXT.cta_id,
          route_family: PRIORITY_ADITIVO_CONTEXT.route_family,
          priority_aditivo_context_sha256: priorityAditivoPersistedContextSha256(
            syntheticPriorityRecord(persistedContext),
          ),
          handoff: {
            status: "DELIVERED", attempts: 1,
            downstream: { http: 201, duplicate: false, downstream_receipt: RECEIPT },
          },
          delivery: { notify_status: "skipped", email_status: "skipped", qa_email_status: null },
        } : null,
      });
    }
  }
  if (url.pathname === "/.netlify/functions/lead" && req.method === "POST") {
    postCount += 1;
    assert.equal(req.headers["x-confenge-qa-email"], undefined);
    assert.equal(req.headers["x-confenge-ops-token"], undefined);
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      postedBody = JSON.parse(raw);
      if (!created) {
        created = true;
        json(res, 201, { ok: true, lead_id: RECEIPT, status: "persisted", notify_status: "skipped", email_status: "skipped" });
      } else {
        json(res, 200, { ok: true, lead_id: RECEIPT, idempotent: true, notify_status: "skipped", email_status: "skipped" });
      }
    });
    return;
  }
  if (staticFile(url.pathname, res)) return;
  json(res, 404, { ok: false });
});

function literalFixture() {
  const context = { ...PRIORITY_ADITIVO_CONTEXT };
  return {
    ok: true,
    contract: PRIORITY_ADITIVO_CONTRACT,
    live_sha: SHA,
    entry_path: PRIORITY_ADITIVO_ENTRY_PATH,
    cta_selector: PRIORITY_ADITIVO_CTA_SELECTOR,
    form_path: PRIORITY_ADITIVO_FORM_PATH,
    form_selector: PRIORITY_ADITIVO_FORM_SELECTOR,
    target_path: PRIORITY_ADITIVO_FORM_PATH,
    target_hash: "#captura-pilar",
    public_query: "",
    post_requests: 0,
    mutation_requests: 0,
    external_requests: 0,
    analytics_requests_blocked: 0,
    context,
    context_sha256: priorityAditivoContextSha256(context),
  };
}

function runProbe(base, overrides = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [probePath, base], {
      env: {
        ...process.env,
        LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters",
        OPS_TOKEN: "ops-fixture-token-at-least-16",
        EXPECTED_SHA: SHA,
        PROBE_VERIFY_EMAIL: "0",
        PROBE_SCENARIO: "priority-aditivo",
        PROBE_PAGE_PATH: PRIORITY_ADITIVO_FORM_PATH,
        PROBE_BROWSER_CONTEXT_FILE: fixturePath,
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  await assertRealOpsReadsPersistedDigest();
  let journey = literalFixture();
  assert.equal(validatePriorityAditivoJourney(journey, SHA).ok, true);
  assert.deepEqual(Object.keys(journey.context), PRIORITY_ADITIVO_CONTEXT_KEYS);
  assert.equal(
    validatePriorityAditivoJourney({ ...journey, external_requests: 1 }, SHA).reason,
    "priority_browser_fixture_route_mismatch",
  );
  assert.equal(
    validatePriorityAditivoJourney({
      ...journey,
      context: { ...journey.context, cta_id: "mutated" },
    }, SHA).reason,
    "priority_browser_fixture_context_mismatch",
  );
  if (browserRequired) journey = await capturePriorityAditivoJourney(base, SHA);
  else console.log("PASS priority_aditivo_browser_checks_deferred_until_required_step");
  assert.equal(validatePriorityAditivoJourney(journey, SHA).ok, true);
  writeFileSync(fixturePath, JSON.stringify(journey));

  const beforeForbidden = requestCount;
  const forbiddenEmail = await runProbe(base, { PROBE_VERIFY_EMAIL: "1" });
  assert.equal(forbiddenEmail.code, 1);
  assert.equal(JSON.parse(forbiddenEmail.stdout).reason, "priority_aditivo_email_forbidden");
  assert.equal(requestCount, beforeForbidden, "priority scenario must block email opt-in before any request");

  const result = await runProbe(base);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.state, "TRANSPORT_READY");
  assert.equal(proof.scenario, "priority-aditivo");
  assert.equal(proof.checks.priority_aditivo_context_persisted, true);
  assert.equal(proof.checks.priority_aditivo_context_hash_valid, true);
  assert.equal(proof.checks.priority_aditivo_email_disabled, true);
  assert.equal(proof.checks.notification_skipped, true);
  assert.equal(proof.checks.email_skipped, true);
  assert.equal(Object.hasOwn(proof, "qa_email"), false);
  assert.equal(postCount, 2);
  assert.deepEqual(
    Object.fromEntries(PRIORITY_ADITIVO_CONTEXT_KEYS.map((key) => [key, postedBody[key] ?? null])),
    PRIORITY_ADITIVO_CONTEXT,
  );
  assert.deepEqual(proof.aggregates.before.leads_by_kind, { real: 2, synthetic: 5, qa: 1 });
  assert.deepEqual(proof.aggregates.after.leads_by_kind, { real: 2, synthetic: 6, qa: 1 });

  created = false;
  persistedContext = { ...PRIORITY_ADITIVO_CONTEXT, jornada: "licitacao" };
  const drifted = await runProbe(base);
  assert.equal(drifted.code, 1, drifted.stderr || drifted.stdout);
  const driftedProof = JSON.parse(drifted.stdout);
  assert.equal(driftedProof.checks.priority_aditivo_context_hash_valid, true);
  assert.equal(driftedProof.checks.priority_aditivo_context_persisted, false);
  assert.equal(driftedProof.state, "TRANSPORT_PROOF_FAILED");
  console.log(browserRequired
    ? "PASS priority_aditivo_browser_to_persisted_transport_without_email"
    : "PASS priority_aditivo_literal_to_persisted_transport_without_email");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(temp, { recursive: true, force: true });
}
