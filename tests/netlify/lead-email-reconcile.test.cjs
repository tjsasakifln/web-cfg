/**
 * A07/G3 — drain-based lead e-mail retry (reconcileEmailDeliveries) and its
 * consumer, ops `drain_inbound`.
 *
 * The provider mock implements Resend's documented Idempotency-Key semantics
 * (reconfirmed 2026-09-18): same key + same payload → the original id without
 * a second send; same key while the first request is in flight → 409
 * concurrent_idempotent_requests; same key + different payload → 409
 * invalid_idempotent_request. `sends` counts real e-mails, `replays` counts
 * idempotent hits — the invariant under test is "never two e-mails per lead".
 *
 * Run: node --test tests/netlify/lead-email-reconcile.test.cjs
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const deliveryPath = path.join(root, "netlify/functions/lib/lead-delivery.cjs");
const storePath = path.join(root, "netlify/functions/lib/lead-store.cjs");
const opsPath = path.join(root, "netlify/functions/ops.cjs");

process.env.NODE_ENV = "test";
delete process.env.OPS_WEBHOOK_URL;
delete process.env.NTFY_URL;
delete process.env.NTFY_TOKEN;

const { reconcileEmailDeliveries, classifyEmailRetry, emailIdempotencyKey, EMAIL_RETRY_MAX_ATTEMPTS } =
  require(deliveryPath);
const { MemoryStore } = require(storePath);

const PII = {
  email: "pessoa.privada@construtora.com.br",
  phone: "48999990000",
  message: "mensagem confidencial do cliente",
};

function realRecord(overrides = {}) {
  const received = overrides.received_at || new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return {
    lead_id: overrides.lead_id || `lead-${Math.random().toString(36).slice(2, 14)}`,
    record_kind: "real",
    received_at: received,
    status: "persisted",
    jornada: "operacao",
    estagio: "diagnostico operacao",
    nome: "Pessoa Privada",
    email: PII.email,
    telefone: PII.phone,
    mensagem: PII.message,
    consentimento: true,
    audit: [{ at: received, event: "created", status: "persisted" }],
    delivery: {
      notify: { status: "skipped", attempts: 1 },
      email: { status: "error", attempts: 1, reason: "timeout", idempotency_key: `lead-email/${overrides.lead_id || ""}` },
    },
    ...overrides,
  };
}

/** Resend mock with idempotency semantics. */
function resendMock({ latencyMs = 0, forceStatus = null } = {}) {
  const byKey = new Map(); // key -> { id, body, done }
  const stats = { sends: 0, replays: 0, concurrent: 0, mismatch: 0, calls: 0 };
  let seq = 0;
  const fetchImpl = async (url, init = {}) => {
    stats.calls += 1;
    const key = (init.headers || {})["Idempotency-Key"];
    const body = String(init.body || "");
    if (forceStatus) {
      return { ok: false, status: forceStatus.status, json: async () => forceStatus.body, text: async () => "" };
    }
    const existing = key ? byKey.get(key) : null;
    if (existing) {
      if (!existing.done) {
        stats.concurrent += 1;
        return {
          ok: false,
          status: 409,
          json: async () => ({ statusCode: 409, name: "concurrent_idempotent_requests", message: "in flight" }),
          text: async () => "",
        };
      }
      if (existing.body !== body) {
        stats.mismatch += 1;
        return {
          ok: false,
          status: 409,
          json: async () => ({ statusCode: 409, name: "invalid_idempotent_request", message: "payload differs" }),
          text: async () => "",
        };
      }
      stats.replays += 1;
      return { ok: true, status: 200, json: async () => ({ id: existing.id }), text: async () => "" };
    }
    seq += 1;
    const entry = { id: `resend-msg-${seq}`, body, done: false };
    if (key) byKey.set(key, entry);
    stats.sends += 1;
    if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
    entry.done = true;
    return { ok: true, status: 200, json: async () => ({ id: entry.id }), text: async () => "" };
  };
  return { fetchImpl, stats, byKey };
}

function withResend(mock, fn) {
  const originalFetch = globalThis.fetch;
  const prevKey = process.env.RESEND_API_KEY;
  const prevTo = process.env.LEAD_NOTIFY_EMAIL;
  globalThis.fetch = mock.fetchImpl;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_NOTIFY_EMAIL = "ops@confenge.com.br";
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = originalFetch;
      if (prevKey == null) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = prevKey;
      if (prevTo == null) delete process.env.LEAD_NOTIFY_EMAIL;
      else process.env.LEAD_NOTIFY_EMAIL = prevTo;
    });
}

function captureLogs(fn) {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  for (const k of Object.keys(orig)) {
    console[k] = (...args) => lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  }
  return Promise.resolve()
    .then(fn)
    .then((result) => ({ result, lines }))
    .finally(() => {
      for (const k of Object.keys(orig)) console[k] = orig[k];
    });
}

function assertNoPii(text, label) {
  for (const [k, v] of Object.entries(PII)) {
    assert.ok(!String(text).includes(v), `${label} leaks ${k}`);
  }
}

test("classifyEmailRetry", async (t) => {
  const now = new Date("2026-09-18T12:00:00.000Z");
  await t.test("retries real error/pending inside 24 h with attempts < max", () => {
    const rec = realRecord({ received_at: "2026-09-18T11:00:00.000Z" });
    assert.deepStrictEqual(classifyEmailRetry(rec, now), { class: "retry", reason: "error", attempts: 1 });
    rec.delivery.email = { status: "pending", attempts: 0 };
    assert.strictEqual(classifyEmailRetry(rec, now).class, "retry");
    delete rec.delivery;
    assert.strictEqual(classifyEmailRetry(rec, now).class, "retry", "missing delivery block = pending");
  });
  await t.test("ignores non-real, adaptive and settled rows", () => {
    assert.strictEqual(classifyEmailRetry(realRecord({ record_kind: "synthetic" }), now).class, "ignore");
    assert.strictEqual(classifyEmailRetry(realRecord({ record_kind: "qa" }), now).class, "ignore");
    assert.strictEqual(classifyEmailRetry(realRecord({ adaptive_intake: true }), now).class, "ignore");
    const ok = realRecord();
    ok.delivery.email = { status: "ok", attempts: 1, provider_id: "x" };
    assert.strictEqual(classifyEmailRetry(ok, now).class, "ignore");
    const skipped = realRecord();
    skipped.delivery.email = { status: "skipped", reason: "not_configured" };
    assert.strictEqual(classifyEmailRetry(skipped, now).class, "ignore");
  });
  await t.test("reports, never re-sends, outside the window / exhausted / mismatch", () => {
    const old = realRecord({ received_at: "2026-09-17T11:59:00.000Z" });
    assert.deepStrictEqual(classifyEmailRetry(old, now), { class: "reconcile_required", reason: "window_expired" });
    const exhausted = realRecord({ received_at: "2026-09-18T11:00:00.000Z" });
    exhausted.delivery.email.attempts = EMAIL_RETRY_MAX_ATTEMPTS;
    assert.deepStrictEqual(classifyEmailRetry(exhausted, now), { class: "reconcile_required", reason: "attempts_exhausted" });
    const mismatch = realRecord({ received_at: "2026-09-18T11:00:00.000Z" });
    mismatch.delivery.email.reason = "payload_mismatch";
    assert.deepStrictEqual(classifyEmailRetry(mismatch, now), { class: "reconcile_required", reason: "payload_mismatch" });
  });
  await t.test("a fresh in-flight claim is skipped; a stale one is retried", () => {
    const rec = realRecord({ received_at: "2026-09-18T11:00:00.000Z" });
    rec.delivery.email.retry_in_flight_at = "2026-09-18T11:59:30.000Z";
    assert.strictEqual(classifyEmailRetry(rec, now).class, "in_flight");
    rec.delivery.email.retry_in_flight_at = "2026-09-18T11:00:00.000Z";
    assert.strictEqual(classifyEmailRetry(rec, now).class, "retry");
  });
});

test("reconcileEmailDeliveries", async (t) => {
  await t.test("restart between persist and delivery: pending row is delivered by the drain with the lead key", async () => {
    const store = new MemoryStore();
    const rec = realRecord({ lead_id: "lead-pending-after-restart-01" });
    rec.delivery = { notify: { status: "pending", attempts: 0 }, email: { status: "pending", attempts: 0 } };
    await store.put(rec);
    const mock = resendMock();
    const { result, lines } = await captureLogs(() => withResend(mock, () => reconcileEmailDeliveries(store, { limit: 5 })));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.attempted, 1);
    assert.strictEqual(result.delivered, 1);
    assert.strictEqual(result.email_reconcile_required, 0);
    assert.strictEqual(mock.stats.sends, 1);
    const key = emailIdempotencyKey(rec);
    assert.strictEqual(key, "lead-email/lead-pending-after-restart-01");
    assert.ok(mock.byKey.has(key), "provider saw the lead key");
    const stored = await store.get(rec.lead_id);
    assert.strictEqual(stored.delivery.email.status, "ok");
    assert.strictEqual(stored.delivery.email.attempts, 1);
    assert.strictEqual(stored.delivery.email.provider_id, "resend-msg-1");
    assert.strictEqual(stored.delivery.email.idempotency_key, key);
    assert.strictEqual(stored.delivery.email.retry_in_flight_at, null);
    assert.strictEqual(stored.delivery.email.retry_token, null);
    assert.strictEqual(stored.delivery.notify.status, "pending", "notify block survives the shallow merge");
    assert.strictEqual(stored.status, "persisted_notified");
    assert.strictEqual(stored.audit.at(-1).event, "email_retry");
    assertNoPii(JSON.stringify(result), "summary");
    assertNoPii(lines.join("\n"), "logs");
  });

  await t.test("timeout that actually sent: same key returns the original id, no second e-mail", async () => {
    const store = new MemoryStore();
    const rec = realRecord({ lead_id: "lead-timeout-but-sent-01" });
    await store.put(rec);
    const mock = resendMock();
    // The capture attempt reached Resend (and was accepted) but the answer
    // never arrived: seed the provider with that key + the exact payload.
    await withResend(mock, async () => {
      const { deliverResendEmail } = require(deliveryPath);
      const first = await deliverResendEmail(rec);
      assert.strictEqual(first.status, "ok");
    });
    assert.strictEqual(mock.stats.sends, 1);
    const result = await withResend(mock, () => reconcileEmailDeliveries(store, {}));
    assert.strictEqual(result.delivered, 1);
    assert.strictEqual(mock.stats.sends, 1, "no second e-mail");
    assert.strictEqual(mock.stats.replays, 1, "idempotent replay");
    const stored = await store.get(rec.lead_id);
    assert.strictEqual(stored.delivery.email.provider_id, "resend-msg-1");
    assert.strictEqual(stored.delivery.email.attempts, 2);
  });

  await t.test("outside 24 h, exhausted and payload_mismatch rows are counted, not sent", async () => {
    const store = new MemoryStore();
    const old = realRecord({ lead_id: "lead-old-01", received_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() });
    const exhausted = realRecord({ lead_id: "lead-exhausted-01" });
    exhausted.delivery.email.attempts = EMAIL_RETRY_MAX_ATTEMPTS;
    const mismatch = realRecord({ lead_id: "lead-mismatch-01" });
    mismatch.delivery.email.reason = "payload_mismatch";
    const synthetic = realRecord({ lead_id: "lead-synthetic-01", record_kind: "synthetic" });
    for (const r of [old, exhausted, mismatch, synthetic]) await store.put(r);
    const mock = resendMock();
    const result = await withResend(mock, () => reconcileEmailDeliveries(store, {}));
    assert.strictEqual(mock.stats.calls, 0, "nothing re-sent blindly");
    assert.strictEqual(result.attempted, 0);
    assert.strictEqual(result.email_reconcile_required, 3);
    assert.deepStrictEqual(result.reconcile_reasons, { window_expired: 1, attempts_exhausted: 1, payload_mismatch: 1 });
    for (const r of [old, exhausted, mismatch]) {
      const stored = await store.get(r.lead_id);
      assert.strictEqual(stored.delivery.email.status, "error", "row untouched");
    }
  });

  await t.test("live 409 invalid_idempotent_request → payload_mismatch, needs reconciliation, no further retry", async () => {
    const store = new MemoryStore();
    const rec = realRecord({ lead_id: "lead-live-mismatch-01" });
    await store.put(rec);
    const mock = resendMock({ forceStatus: { status: 409, body: { statusCode: 409, name: "invalid_idempotent_request" } } });
    const result = await withResend(mock, () => reconcileEmailDeliveries(store, {}));
    assert.strictEqual(mock.stats.calls, 1, "final answer, not retried inside the pass");
    assert.strictEqual(result.attempted, 1);
    assert.strictEqual(result.delivered, 0);
    assert.strictEqual(result.email_reconcile_required, 1);
    assert.deepStrictEqual(result.reconcile_reasons, { payload_mismatch: 1 });
    const stored = await store.get(rec.lead_id);
    assert.strictEqual(stored.delivery.email.status, "error");
    assert.strictEqual(stored.delivery.email.reason, "payload_mismatch");
    assert.strictEqual(stored.delivery.email.http, 409);
    // Next pass: reported, never sent again.
    const again = await withResend(mock, () => reconcileEmailDeliveries(store, {}));
    assert.strictEqual(mock.stats.calls, 1);
    assert.strictEqual(again.attempted, 0);
    assert.strictEqual(again.email_reconcile_required, 1);
  });

  await t.test("attempt accounting stops at the max and reports attempts_exhausted", async () => {
    const store = new MemoryStore();
    const rec = realRecord({ lead_id: "lead-attempts-01" });
    await store.put(rec); // attempts: 1 from capture
    const mock = resendMock({ forceStatus: { status: 500, body: {} } });
    const r2 = await withResend(mock, () => reconcileEmailDeliveries(store, {}));
    assert.strictEqual(r2.attempted, 1);
    assert.strictEqual(r2.retryable, 1);
    assert.strictEqual((await store.get(rec.lead_id)).delivery.email.attempts, 2);
    const r3 = await withResend(mock, () => reconcileEmailDeliveries(store, {}));
    assert.strictEqual(r3.attempted, 1);
    assert.strictEqual(r3.email_reconcile_required, 1);
    assert.deepStrictEqual(r3.reconcile_reasons, { attempts_exhausted: 1 });
    assert.strictEqual((await store.get(rec.lead_id)).delivery.email.attempts, EMAIL_RETRY_MAX_ATTEMPTS);
    const r4 = await withResend(mock, () => reconcileEmailDeliveries(store, {}));
    assert.strictEqual(r4.attempted, 0);
    assert.strictEqual(r4.email_reconcile_required, 1);
  });

  await t.test("concurrent drains never produce two e-mails for one lead", async () => {
    const store = new MemoryStore();
    const rec = realRecord({ lead_id: "lead-concurrent-drain-01" });
    await store.put(rec);
    const mock = resendMock({ latencyMs: 60 });
    const [a, b] = await withResend(mock, () => Promise.all([
      reconcileEmailDeliveries(store, {}),
      reconcileEmailDeliveries(store, {}),
    ]));
    assert.strictEqual(mock.stats.sends, 1, `exactly one e-mail (calls=${mock.stats.calls})`);
    assert.strictEqual(a.ok && b.ok, true);
    assert.strictEqual(a.delivered + b.delivered, 1, "exactly one pass reports the delivery");
    assert.strictEqual(a.in_flight + b.in_flight, 1, "the other pass stepped back");
    const stored = await store.get(rec.lead_id);
    assert.strictEqual(stored.delivery.email.status, "ok");
    assert.strictEqual(stored.delivery.email.provider_id, "resend-msg-1");
    assert.strictEqual(stored.delivery.email.retry_token, null);
    assert.strictEqual(stored.audit.filter((e) => e.event === "email_retry").length, 1);
  });

  await t.test("a concurrent 409 never clobbers the winner's ok", async () => {
    // Interleaving the token fence cannot exclude: both passes hold a claim,
    // the winner's send lands first and writes ok, the loser's send answers
    // 409 concurrent. Simulated by letting the loser's post-send read see the
    // winner's ok: the loser must step back without a store write.
    const store = new MemoryStore();
    const rec = realRecord({ lead_id: "lead-concurrent-409-01" });
    await store.put(rec);
    let gets = 0;
    let updates = 0;
    const originalGet = store.get.bind(store);
    const originalUpdate = store.update.bind(store);
    store.get = async (id) => {
      gets += 1;
      const cur = await originalGet(id);
      // 1st get = pre-claim read, 2nd = claim verification, 3rd = post-send read
      if (gets >= 3 && cur) {
        return { ...cur, status: "persisted_notified", delivery: { ...cur.delivery, email: { ...cur.delivery.email, status: "ok", provider_id: "winner-id", retry_token: null } } };
      }
      return cur;
    };
    store.update = async (id, patch) => {
      updates += 1;
      return originalUpdate(id, patch);
    };
    const loserMock = resendMock({ forceStatus: { status: 409, body: { statusCode: 409, name: "concurrent_idempotent_requests" } } });
    const result = await withResend(loserMock, () => reconcileEmailDeliveries(store, {}));
    assert.strictEqual(result.attempted, 1);
    assert.strictEqual(result.delivered, 0);
    assert.strictEqual(result.retryable, 0);
    assert.strictEqual(result.in_flight, 1, "loser stepped back");
    assert.strictEqual(updates, 1, "only the claim was written; the winner's ok was not overwritten");
    assert.ok(gets >= 3);
  });

  await t.test("without RESEND_API_KEY nothing is attempted; candidates are reported", async () => {
    const store = new MemoryStore();
    await store.put(realRecord({ lead_id: "lead-unconfigured-01" }));
    const mock = resendMock();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fetchImpl;
    delete process.env.RESEND_API_KEY;
    try {
      const result = await reconcileEmailDeliveries(store, {});
      assert.strictEqual(result.configured, false);
      assert.strictEqual(result.candidates, 1);
      assert.strictEqual(result.attempted, 0);
      assert.strictEqual(mock.stats.calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("limit bounds sends per pass; the rest is deferred, not dropped", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 4; i++) await store.put(realRecord({ lead_id: `lead-limit-0${i}` }));
    const mock = resendMock();
    const first = await withResend(mock, () => reconcileEmailDeliveries(store, { limit: 2 }));
    assert.strictEqual(first.attempted, 2);
    assert.strictEqual(first.deferred, 2);
    const second = await withResend(mock, () => reconcileEmailDeliveries(store, { limit: 2 }));
    assert.strictEqual(second.attempted, 2);
    assert.strictEqual(second.deferred, 0);
    assert.strictEqual(mock.stats.sends, 4);
  });

  await t.test("ops status set by an operator is never overwritten", async () => {
    const store = new MemoryStore();
    await store.put(realRecord({ lead_id: "lead-stage-01", status: "contacted", commercial_stage: "contacted" }));
    const mock = resendMock();
    await withResend(mock, () => reconcileEmailDeliveries(store, {}));
    const stored = await store.get("lead-stage-01");
    assert.strictEqual(stored.delivery.email.status, "ok");
    assert.strictEqual(stored.status, "contacted");
  });
});

test("ops drain_inbound runs the e-mail retry and reports counts only", async (t) => {
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-email-reconcile-"));
  const prev = {
    LEAD_STORE_DIR: process.env.LEAD_STORE_DIR,
    OPS_TOKEN: process.env.OPS_TOKEN,
    REVOPS_TOKEN: process.env.REVOPS_TOKEN,
    CONFENGE_INBOUND_WEBHOOK_URL: process.env.CONFENGE_INBOUND_WEBHOOK_URL,
    CONFENGE_INBOUND_WEBHOOK_SECRET: process.env.CONFENGE_INBOUND_WEBHOOK_SECRET,
  };
  process.env.LEAD_STORE_DIR = storeDir;
  process.env.OPS_TOKEN = "ops-test-token-16chars-min";
  delete process.env.REVOPS_TOKEN;
  delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
  delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
  for (const k of Object.keys(require.cache)) {
    if (k.includes("netlify/functions")) delete require.cache[k];
  }
  const ops = require(opsPath);
  const { createStore } = require(storePath);
  const event = (extra = {}) => ({
    httpMethod: "POST",
    headers: {
      origin: "https://confenge.com.br",
      "x-forwarded-for": "198.51.100.10",
      "content-type": "application/json",
      ...(extra.headers || {}),
    },
    queryStringParameters: { action: "drain_inbound" },
    rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=drain_inbound",
    body: JSON.stringify({ limit: 20 }),
  });
  try {
    const store = await createStore({ event: event() });
    const rec = realRecord({ lead_id: "lead-ops-drain-pending-01" });
    rec.delivery = { notify: { status: "pending", attempts: 0 }, email: { status: "pending", attempts: 0 } };
    rec.handoff = { target: "warmbly_inbound", status: "SKIPPED", reason: "not_configured", attempts: 0, next_attempt_at: null };
    await store.put(rec);
    const old = realRecord({ lead_id: "lead-ops-drain-old-01", received_at: new Date(Date.now() - 30 * 3600 * 1000).toISOString() });
    old.handoff = rec.handoff;
    await store.put(old);

    await t.test("without OPS_TOKEN the drain (and any receipt) is unreachable", async () => {
      const res = await ops.handler(event());
      assert.strictEqual(res.statusCode, 401);
    });

    await t.test("authenticated drain delivers the pending row and counts the old one", async () => {
      const mock = resendMock();
      const { result: res, lines } = await captureLogs(() => withResend(mock, () =>
        ops.handler(event({ headers: { authorization: `Bearer ${process.env.OPS_TOKEN}` } }))));
      assert.strictEqual(res.statusCode, 200, res.body);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.email_retry.attempted, 1);
      assert.strictEqual(body.email_retry.delivered, 1);
      assert.strictEqual(body.email_reconcile_required, 1);
      assert.deepStrictEqual(body.email_retry.reconcile_reasons, { window_expired: 1 });
      assert.strictEqual(mock.stats.sends, 1);
      assertNoPii(res.body, "drain response");
      assertNoPii(lines.join("\n"), "drain logs");
      assert.ok(!res.body.includes("lead-ops-drain-pending-01"), "no lead ids in the drain summary");
      const stored = await store.get("lead-ops-drain-pending-01");
      assert.strictEqual(stored.delivery.email.status, "ok");
      assert.strictEqual(stored.delivery.email.idempotency_key, "lead-email/lead-ops-drain-pending-01");
    });

    await t.test("second drain is a no-op for the delivered row", async () => {
      const mock = resendMock();
      const res = await withResend(mock, () =>
        ops.handler(event({ headers: { authorization: `Bearer ${process.env.OPS_TOKEN}` } })));
      const body = JSON.parse(res.body);
      assert.strictEqual(body.email_retry.attempted, 0);
      assert.strictEqual(body.email_reconcile_required, 1);
      assert.strictEqual(mock.stats.calls, 0);
    });
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
});
