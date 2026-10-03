import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const qaPath = path.join(root, "netlify/functions/lib/qa-email.cjs");
const deliveryPath = path.join(root, "netlify/functions/lib/lead-delivery.cjs");
const leadPath = path.join(root, "netlify/functions/lead.cjs");
const storePath = path.join(root, "netlify/functions/lib/lead-store.cjs");
const inboundPath = path.join(root, "netlify/functions/lib/inbound-handoff.cjs");
const ratePath = path.join(root, "netlify/functions/lib/lead-rate-limit.cjs");

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const PROBE_SECRET = "probe-secret-fixture-at-least-32-characters";
const OPS_TOKEN = "ops-token-fixture-at-least-16-characters";

function probeRecord(overrides = {}) {
  return {
    lead_id: "lead_qa_fixture_0001",
    record_kind: "synthetic",
    synthetic_probe_authenticated: true,
    next_action: "exclude_from_commercial",
    ...overrides,
  };
}

function qaEvent(headers = {}) {
  return {
    headers: {
      "x-confenge-qa-email": "1",
      "x-confenge-ops-token": OPS_TOKEN,
      "x-confenge-expected-sha": SHA,
      ...headers,
    },
  };
}

const qa = require(qaPath);
const env = {
  OPS_TOKEN,
  RUNTIME_RELEASE_SHA: SHA,
  LEAD_NOTIFY_EMAIL: "inbox@confenge.com.br",
};

// Negative guard matrix: every request-scoped proof is independently required.
{
  const noOptIn = qa.authorizeQaEmailRequest({
    event: { headers: {} },
    originCheck: { probe: true },
    record: probeRecord(),
    env,
  });
  assert.deepEqual(noOptIn, { requested: false, ok: false, reason: "not_requested" });

  const noProbeAuth = qa.authorizeQaEmailRequest({
    event: qaEvent(),
    originCheck: { probe: false },
    record: probeRecord(),
    env,
  });
  assert.equal(noProbeAuth.reason, "authenticated_probe_required");

  const noOpsAuth = qa.authorizeQaEmailRequest({
    event: qaEvent({ "x-confenge-ops-token": "wrong-token-long-enough" }),
    originCheck: { probe: true },
    record: probeRecord(),
    env,
  });
  assert.equal(noOpsAuth.reason, "ops_token_invalid");

  const real = qa.authorizeQaEmailRequest({
    event: qaEvent(),
    originCheck: { probe: true },
    record: probeRecord({ record_kind: "real", synthetic_probe_authenticated: false }),
    env,
  });
  assert.equal(real.reason, "synthetic_record_required");

  const recipientOverride = qa.authorizeQaEmailRequest({
    event: qaEvent({ "x-confenge-qa-recipient": "attacker@example.com" }),
    originCheck: { probe: true },
    record: probeRecord(),
    env,
  });
  assert.equal(recipientOverride.reason, "recipient_override_forbidden");

  const wrongSha = qa.authorizeQaEmailRequest({
    event: qaEvent({ "x-confenge-expected-sha": OTHER_SHA }),
    originCheck: { probe: true },
    record: probeRecord(),
    env,
  });
  assert.equal(wrongSha.reason, "release_sha_mismatch");

  const allowed = qa.authorizeQaEmailRequest({
    event: qaEvent(),
    originCheck: { probe: true },
    record: probeRecord(),
    env,
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.expected_sha, SHA);
  console.log("PASS qa_email_request_guard_matrix");
}

// Delivery payload is fixed to LEAD_NOTIFY_EMAIL and contains no submitted PII.
{
  const previous = {
    key: process.env.RESEND_API_KEY,
    to: process.env.LEAD_NOTIFY_EMAIL,
    from: process.env.LEAD_FROM_EMAIL,
  };
  const originalFetch = globalThis.fetch;
  let captured = null;
  try {
    process.env.RESEND_API_KEY = "resend-fixture-secret";
    process.env.LEAD_NOTIFY_EMAIL = "inbox@confenge.com.br";
    process.env.LEAD_FROM_EMAIL = "CONFENGE QA <qa@confenge.com.br>";
    globalThis.fetch = async (_url, init) => {
      captured = { headers: init.headers, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ id: "re_qa-123:abc" }) };
    };
    const { deliverQaEmail } = require(deliveryPath);
    const record = probeRecord({
      nome: "PERSONAL NAME MUST NOT LEAK",
      email: "person@example.com",
      telefone: "48999999999",
      mensagem: "PRIVATE MESSAGE MUST NOT LEAK",
    });
    const result = await deliverQaEmail(record, {
      authorized: true,
      expectedSha: SHA,
      handoffDelivered: true,
    });
    assert.equal(result.status, "ok");
    assert.equal(result.provider_id, "re_qa-123:abc");
    assert.deepEqual(captured.body.to, ["inbox@confenge.com.br"]);
    assert.equal(captured.body.reply_to, undefined);
    assert.equal(captured.body.subject, `[TESTE CONTROLADO] CONFENGE ${record.lead_id}`);
    const wire = JSON.stringify(captured.body);
    for (const forbidden of [record.nome, record.email, record.telefone, record.mensagem]) {
      assert.equal(wire.includes(forbidden), false);
    }
    assert.equal(captured.headers["Idempotency-Key"], `qa-email/${record.lead_id}`);
    const blocked = await deliverQaEmail(record, {
      authorized: true,
      expectedSha: SHA,
      handoffDelivered: false,
    });
    assert.equal(blocked.reason, "handoff_not_delivered");
    console.log("PASS qa_email_payload_is_fixed_redacted_and_handoff_gated");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envName = key === "key" ? "RESEND_API_KEY" : key === "to" ? "LEAD_NOTIFY_EMAIL" : "LEAD_FROM_EMAIL";
      if (value == null) delete process.env[envName];
      else process.env[envName] = value;
    }
  }
}

// Full capture pipeline: synthetic classification, delivered handoff, one QA
// send, durable receipt and an idempotent replay with no duplicate.
{
  const managedEnv = [
    "NODE_ENV", "LEAD_REQUIRE_ORIGIN", "LEAD_PROBE_SECRET", "OPS_TOKEN",
    "RUNTIME_RELEASE_SHA", "RESEND_API_KEY", "LEAD_NOTIFY_EMAIL", "LEAD_FROM_EMAIL",
    "CONFENGE_INBOUND_WEBHOOK_URL", "CONFENGE_INBOUND_WEBHOOK_SECRET",
    "TURNSTILE_SECRET_KEY", "LEAD_REQUIRE_TURNSTILE", "OPS_WEBHOOK_URL", "NTFY_URL",
  ];
  const previousEnv = Object.fromEntries(managedEnv.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let resendCalls = 0;
  let inboundCalls = 0;
  let resendWire = null;
  const resendKeys = [];
  try {
    process.env.NODE_ENV = "test";
    process.env.LEAD_REQUIRE_ORIGIN = "1";
    process.env.LEAD_PROBE_SECRET = PROBE_SECRET;
    process.env.OPS_TOKEN = OPS_TOKEN;
    process.env.RUNTIME_RELEASE_SHA = SHA;
    process.env.RESEND_API_KEY = "resend-fixture-secret";
    process.env.LEAD_NOTIFY_EMAIL = "inbox@confenge.com.br";
    process.env.LEAD_FROM_EMAIL = "CONFENGE QA <qa@confenge.com.br>";
    process.env.CONFENGE_INBOUND_WEBHOOK_URL = "http://127.0.0.1:9/api/v1/webhooks/confenge/inbound";
    process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = "inbound-secret-fixture-at-least-32-characters";
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.LEAD_REQUIRE_TURNSTILE;
    delete process.env.OPS_WEBHOOK_URL;
    delete process.env.NTFY_URL;

    for (const modulePath of [leadPath, storePath, inboundPath, deliveryPath, ratePath]) {
      delete require.cache[require.resolve(modulePath)];
    }
    const inbound = require(inboundPath);
    inbound.setFetchForTests(async (_url, init) => {
      inboundCalls += 1;
      const posted = JSON.parse(init.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({ receipt_id: posted.lead_id, duplicate: false }),
      };
    });
    globalThis.fetch = async (url, init) => {
      assert.equal(new URL(String(url)).hostname, "api.resend.com");
      resendCalls += 1;
      resendKeys.push(init.headers["Idempotency-Key"]);
      resendWire = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ id: "re_pipeline_qa_001" }) };
    };

    const lead = require(leadPath);
    const { MemoryStore } = require(storePath);
    const store = new MemoryStore();
    lead.setStoreForTests(store);
    require(ratePath)._reset();

    const payload = {
      nome: "SYNTHETIC-PROBE",
      email: "probe@example.com",
      estagio: "synthetic probe discard",
      jornada: "operacao",
      consentimento: true,
      origem: "/synthetic-probe",
      utm_source: "synthetic",
      utm_medium: "probe",
      mensagem: "synthetic probe do not contact",
      idempotency_key: "qa-probe-idempotency-0001",
    };
    const event = {
      httpMethod: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "confenge-synthetic-probe/qa-test",
        "x-forwarded-for": "198.51.100.27",
        "x-confenge-probe": PROBE_SECRET,
        "x-confenge-qa-email": "1",
        "x-confenge-ops-token": OPS_TOKEN,
        "x-confenge-expected-sha": SHA,
        "idempotency-key": payload.idempotency_key,
      },
      body: JSON.stringify(payload),
    };
    const first = await lead.handler(event);
    assert.equal(first.statusCode, 201, first.body);
    const firstBody = JSON.parse(first.body);
    assert.equal(firstBody.email_status, "skipped");
    assert.equal(firstBody.notify_status, "skipped");
    assert.equal(resendCalls, 1);
    assert.equal(inboundCalls, 1);

    const stored = await store.get(firstBody.lead_id);
    assert.equal(stored.record_kind, "synthetic");
    assert.equal(stored.synthetic_probe_authenticated, true);
    assert.equal(stored.next_action, "exclude_from_commercial");
    assert.equal(stored.handoff.status, "DELIVERED");
    assert.equal(stored.delivery.email.status, "skipped");
    assert.equal(stored.delivery.qa_email.status, "ok");
    assert.equal(stored.delivery.qa_email.provider_id, "re_pipeline_qa_001");
    assert.equal(stored.delivery.qa_email.attempts, 1);
    assert.equal(resendWire.subject, `[TESTE CONTROLADO] CONFENGE ${firstBody.lead_id}`);

    const invalidReplays = [
      [{ "x-confenge-expected-sha": OTHER_SHA }, 409],
      [{ "x-confenge-ops-token": "wrong-token-long-enough" }, 403],
      [{ "x-confenge-qa-recipient": "override@example.com" }, 400],
    ];
    for (const [headers, status] of invalidReplays) {
      const denied = await lead.handler({
        ...event,
        headers: { ...event.headers, ...headers },
      });
      assert.equal(denied.statusCode, status, denied.body);
      assert.equal(JSON.parse(denied.body).error, "qa_email_denied");
    }
    assert.equal(resendCalls, 1, "invalid replay must be rejected before provider delivery");

    const replay = await lead.handler(event);
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(JSON.parse(replay.body).idempotent, true);
    assert.equal(resendCalls, 1, "idempotent replay must not send a second QA email");
    assert.equal(inboundCalls, 1, "idempotent replay must not repeat the handoff");
    console.log("PASS qa_email_capture_pipeline_is_durable_and_idempotent");

    // Simulate the crash window after the provider accepts the message but
    // before its receipt can be stored. The durable in-flight marker survives;
    // replay uses the exact same Resend idempotency key and recovers the same
    // provider receipt.
    class ReceiptFlakyStore extends MemoryStore {
      constructor() {
        super();
        this.receiptFailures = 0;
      }
      async updateQaEmailState(id, updater) {
        const current = await this.get(id);
        const candidate = updater((current?.delivery?.qa_email) || {}, current);
        if (candidate?.status === "ok" && this.receiptFailures < 3) {
          this.receiptFailures += 1;
          throw new Error("fixture_qa_receipt_write_failed");
        }
        return super.updateQaEmailState(id, () => candidate);
      }
    }
    const flakyStore = new ReceiptFlakyStore();
    lead.setStoreForTests(flakyStore);
    require(ratePath)._reset();
    const crashPayload = {
      ...payload,
      idempotency_key: "qa-probe-crash-window-0002",
    };
    const crashEvent = {
      ...event,
      headers: {
        ...event.headers,
        "idempotency-key": crashPayload.idempotency_key,
      },
      body: JSON.stringify(crashPayload),
    };
    const crashFirst = await lead.handler(crashEvent);
    assert.equal(crashFirst.statusCode, 503, crashFirst.body);
    assert.equal(JSON.parse(crashFirst.body).error, "qa_email_receipt_unconfirmed");
    const [inFlight] = await flakyStore.list();
    assert.equal(inFlight.delivery.qa_email.status, "in_flight");
    assert.equal(inFlight.delivery.qa_email.attempts, 1);
    assert.equal(resendCalls, 2);

    // The original invocation owns a short durable lease. Expire it to model
    // a crashed process before exercising receipt recovery from another one.
    await flakyStore.update(inFlight.lead_id, {
      delivery: {
        ...inFlight.delivery,
        qa_email: {
          ...inFlight.delivery.qa_email,
          lease_until: new Date(Date.now() - 1_000).toISOString(),
        },
      },
    });

    const recovered = await lead.handler(crashEvent);
    assert.equal(recovered.statusCode, 200, recovered.body);
    assert.equal(JSON.parse(recovered.body).idempotent, true);
    const recoveredRecord = await flakyStore.get(inFlight.lead_id);
    assert.equal(recoveredRecord.delivery.qa_email.status, "ok");
    assert.equal(recoveredRecord.delivery.qa_email.provider_id, "re_pipeline_qa_001");
    assert.equal(resendCalls, 3);
    assert.equal(resendKeys.at(-1), resendKeys.at(-2));
    assert.equal(inboundCalls, 2, "QA receipt recovery must not repeat the handoff");
    console.log("PASS qa_email_crash_window_recovers_with_provider_idempotency");

    await flakyStore.update(inFlight.lead_id, {
      delivery: {
        ...recoveredRecord.delivery,
        qa_email: {
          ...recoveredRecord.delivery.qa_email,
          status: "in_flight",
          started_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        },
      },
    });
    const sendsBeforeExpiredReplay = resendCalls;
    const expiredReplay = await lead.handler(crashEvent);
    assert.equal(expiredReplay.statusCode, 200, expiredReplay.body);
    assert.equal(resendCalls, sendsBeforeExpiredReplay, "expired provider window must not resend");
    const manualRecord = await flakyStore.get(inFlight.lead_id);
    assert.equal(manualRecord.delivery.qa_email.status, "manual_reconcile");
    assert.equal(manualRecord.delivery.qa_email.reason, "provider_window_expired");
    console.log("PASS qa_email_expired_provider_window_requires_manual_reconcile");

    // A simultaneous replay can observe the row while its handoff is still
    // pending. It must report "in progress" without turning that state into a
    // terminal block; the original request remains responsible for the send.
    const concurrentStore = new MemoryStore();
    lead.setStoreForTests(concurrentStore);
    require(ratePath)._reset();
    require(inboundPath).setFetchForTests(async (_url, init) => {
      inboundCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const posted = JSON.parse(init.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({ receipt_id: posted.lead_id, duplicate: false }),
      };
    });
    const concurrentPayload = {
      ...payload,
      idempotency_key: "qa-probe-concurrent-0003",
    };
    const concurrentEvent = {
      ...event,
      headers: {
        ...event.headers,
        "idempotency-key": concurrentPayload.idempotency_key,
      },
      body: JSON.stringify(concurrentPayload),
    };
    const sendsBeforeConcurrent = resendCalls;
    const responses = await Promise.all([
      lead.handler(concurrentEvent),
      lead.handler(concurrentEvent),
    ]);
    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [201, 409]);
    assert.equal(
      JSON.parse(responses.find((response) => response.statusCode === 409).body).error,
      "qa_email_pending",
    );
    assert.equal(resendCalls, sendsBeforeConcurrent + 1);
    const [concurrentRecord] = await concurrentStore.list();
    assert.equal(concurrentRecord.handoff.status, "DELIVERED");
    assert.equal(concurrentRecord.delivery.qa_email.status, "ok");
    console.log("PASS qa_email_concurrent_replay_preserves_pending_owner");

    // Once the handoff is already DELIVERED, simultaneous replays must share
    // one provider flight and a late response must not downgrade an accepted
    // durable receipt.
    await concurrentStore.update(concurrentRecord.lead_id, {
      delivery: {
        ...concurrentRecord.delivery,
        qa_email: {
          status: "pending",
          attempts: 0,
          release_sha: SHA,
        },
      },
    });
    globalThis.fetch = async (url, init) => {
      assert.equal(new URL(String(url)).hostname, "api.resend.com");
      resendCalls += 1;
      resendKeys.push(init.headers["Idempotency-Key"]);
      await new Promise((resolve) => setTimeout(resolve, 75));
      return { ok: true, status: 200, json: async () => ({ id: "re_race_ok" }) };
    };
    const sendsBeforeDeliveredRace = resendCalls;
    const deliveredRace = await Promise.all([
      lead.handler(concurrentEvent),
      lead.handler(concurrentEvent),
    ]);
    assert.deepEqual(deliveredRace.map((response) => response.statusCode), [200, 200]);
    assert.equal(
      resendCalls,
      sendsBeforeDeliveredRace + 1,
      "post-handoff concurrent replays must share one provider request",
    );
    const deliveredRaceRecord = await concurrentStore.get(concurrentRecord.lead_id);
    assert.equal(deliveredRaceRecord.delivery.qa_email.status, "ok");
    assert.equal(deliveredRaceRecord.delivery.qa_email.provider_id, "re_race_ok");
    console.log("PASS qa_email_post_handoff_replay_is_single_flight_and_monotonic");

    // Separate serverless instances do not share the module-level Map. The
    // durable store lease must still elect one provider owner.
    await concurrentStore.update(concurrentRecord.lead_id, {
      delivery: {
        ...deliveredRaceRecord.delivery,
        qa_email: { status: "pending", attempts: 0, release_sha: SHA },
      },
    });
    delete require.cache[require.resolve(leadPath)];
    const secondLeadInstance = require(leadPath);
    secondLeadInstance.setStoreForTests(concurrentStore);
    const sendsBeforeCrossInstance = resendCalls;
    const crossInstance = await Promise.all([
      lead.handler(concurrentEvent),
      secondLeadInstance.handler(concurrentEvent),
    ]);
    assert.deepEqual(
      crossInstance.map((response) => response.statusCode).sort(),
      [200, 409],
    );
    assert.equal(
      resendCalls,
      sendsBeforeCrossInstance + 1,
      "durable lease must allow one provider request across module instances",
    );
    const crossInstanceRecord = await concurrentStore.get(concurrentRecord.lead_id);
    assert.equal(crossInstanceRecord.delivery.qa_email.status, "ok");
    assert.equal(crossInstanceRecord.delivery.qa_email.provider_id, "re_race_ok");
    console.log("PASS qa_email_cross_instance_replay_uses_durable_lease");

    // If an owner outlives its lease, a newer owner may recover the provider
    // receipt. The old owner's late non-success response must not clear the
    // new lease or downgrade the newer success.
    await concurrentStore.update(concurrentRecord.lead_id, {
      delivery: {
        ...crossInstanceRecord.delivery,
        qa_email: { status: "pending", attempts: 0, release_sha: SHA },
      },
    });
    const previousTimeout = process.env.LEAD_DELIVERY_TIMEOUT_MS;
    process.env.LEAD_DELIVERY_TIMEOUT_MS = "100";
    const realDateNow = Date.now;
    let wallClockOffset = 0;
    Date.now = () => realDateNow() + wallClockOffset;
    let releaseOldOwner;
    let markOldOwnerStarted;
    const oldOwnerStarted = new Promise((resolve) => { markOldOwnerStarted = resolve; });
    const oldOwnerRelease = new Promise((resolve) => { releaseOldOwner = resolve; });
    let expiryRaceCalls = 0;
    globalThis.fetch = async (url) => {
      assert.equal(new URL(String(url)).hostname, "api.resend.com");
      resendCalls += 1;
      expiryRaceCalls += 1;
      if (expiryRaceCalls === 1) {
        markOldOwnerStarted();
        await oldOwnerRelease;
        return {
          ok: false,
          status: 409,
          json: async () => ({ name: "invalid_idempotent_request" }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ id: "re_new_owner_ok" }) };
    };
    try {
      const oldOwner = lead.handler(concurrentEvent);
      await oldOwnerStarted;
      wallClockOffset = 6_000;
      const newOwner = secondLeadInstance.handler(concurrentEvent);
      const newOwnerResponse = await newOwner;
      assert.equal(newOwnerResponse.statusCode, 200, newOwnerResponse.body);
      releaseOldOwner();
      const oldOwnerResponse = await oldOwner;
      assert.equal(oldOwnerResponse.statusCode, 200, oldOwnerResponse.body);
      assert.equal(expiryRaceCalls, 2);
      const expiryRaceRecord = await concurrentStore.get(concurrentRecord.lead_id);
      assert.equal(expiryRaceRecord.delivery.qa_email.status, "ok");
      assert.equal(expiryRaceRecord.delivery.qa_email.provider_id, "re_new_owner_ok");
      assert.equal(expiryRaceRecord.delivery.qa_email.reason, undefined);
      console.log("PASS qa_email_expired_owner_cannot_downgrade_new_owner");
    } finally {
      Date.now = realDateNow;
      if (previousTimeout == null) delete process.env.LEAD_DELIVERY_TIMEOUT_MS;
      else process.env.LEAD_DELIVERY_TIMEOUT_MS = previousTimeout;
      releaseOldOwner?.();
    }
  } finally {
    try { require(inboundPath).setFetchForTests(null); } catch {}
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
