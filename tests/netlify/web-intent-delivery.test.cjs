/**
 * Tests for web-intent delivery to Warmbly.
 * Tests the full pipeline: form data → envelope → validation → signed POST.
 * Uses Node.js built-in test runner (node --test).
 */
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");

const {
  postSignedInbound,
  postWebIntentToWarmbly,
  signWarmblyInbound,
  verifyWarmblyInbound,
  STATUS,
} = require("../../netlify/functions/lib/inbound-handoff.cjs");

const {
  buildWebIntentEnvelope,
  validateWebIntentEnvelope,
} = require("../../netlify/functions/lib/web-intent-builder.cjs");

test("postWebIntentToWarmbly", async (t) => {
  await t.test("builds and validates MONITOR_COMPANY envelope", async () => {
    const formData = {
      intent_kind: "MONITOR_COMPANY",
      email: "test@example.com",
      nome: "Test User",
      company_ref: "cref123:abc",
      topic: "contract monitoring",
      cadence: "weekly",
      consentimento: "on",
      consent_at: new Date().toISOString(),
    };

    const result = await postWebIntentToWarmbly(formData, {
      now: new Date(),
      env: {
        CONFENGE_INBOUND_WEBHOOK_URL: "",
        CONFENGE_INBOUND_WEBHOOK_SECRET: "",
      },
    });

    // Should skip (no URL configured)
    assert.strictEqual(result.status, STATUS.SKIPPED);
  });

  await t.test("rejects missing intent_kind", async () => {
    const formData = {
      email: "test@example.com",
      nome: "Test User",
    };

    const result = await postWebIntentToWarmbly(formData, {
      now: new Date(),
      env: {
        CONFENGE_INBOUND_WEBHOOK_URL: "",
        CONFENGE_INBOUND_WEBHOOK_SECRET: "",
      },
    });

    assert.strictEqual(result.status, STATUS.SKIPPED);
    assert.strictEqual(result.reason, "no_intent_kind");
  });

  await t.test("rejects invalid envelope (missing company_ref for MONITOR_COMPANY)", async () => {
    const formData = {
      intent_kind: "MONITOR_COMPANY",
      email: "test@example.com",
      nome: "Test User",
      // Missing company_ref — should fail validation
      consentimento: "on",
      consent_at: new Date().toISOString(),
    };

    const result = await postWebIntentToWarmbly(formData, {
      now: new Date(),
      env: {
        CONFENGE_INBOUND_WEBHOOK_URL: "",
        CONFENGE_INBOUND_WEBHOOK_SECRET: "",
      },
    });

    assert.strictEqual(result.status, STATUS.BLOCKED);
    assert.strictEqual(result.reason, "envelope_build_failed");
  });

  await t.test("builds REQUEST_DEEP_DIVE without consent", async () => {
    const formData = {
      intent_kind: "REQUEST_DEEP_DIVE",
      email: "test@example.com",
      nome: "Test User",
      company_ref: "cref456:def",
      // No consent required for REQUEST_*
    };

    const result = await postWebIntentToWarmbly(formData, {
      now: new Date(),
      env: {
        CONFENGE_INBOUND_WEBHOOK_URL: "",
        CONFENGE_INBOUND_WEBHOOK_SECRET: "",
      },
    });

    // Should skip (no URL configured) but not because of validation
    assert.strictEqual(result.status, STATUS.SKIPPED);
  });
});

test("postSignedInbound", async (t) => {
  await t.test("returns SKIPPED when config is not configured", async () => {
    const envelope = {
      schema: "CONFENGE_WEB_INTENT/1.0",
      intent_kind: "REQUEST_DEEP_DIVE",
      lane: "confenge_web",
      contact_email: "test@example.com",
      occurred_at: new Date().toISOString(),
    };

    const result = await postSignedInbound(envelope, {
      now: new Date(),
      env: {
        CONFENGE_INBOUND_WEBHOOK_URL: "",
        CONFENGE_INBOUND_WEBHOOK_SECRET: "",
      },
    });

    assert.strictEqual(result.status, STATUS.SKIPPED);
  });
});

test("signWarmblyInbound / verifyWarmblyInbound round-trip", async (t) => {
  await t.test("signs and verifies envelope correctly", () => {
    const secret = "test-secret-32-chars-long-string";
    const envelope = {
      schema: "CONFENGE_WEB_INTENT/1.0",
      intent_kind: "REQUEST_DEEP_DIVE",
      lane: "confenge_web",
      contact_email: "test@example.com",
      occurred_at: new Date().toISOString(),
    };
    const body = JSON.stringify(envelope);
    const now = new Date();
    const unixSeconds = Math.floor(now.getTime() / 1000);

    const signature = signWarmblyInbound(secret, body, unixSeconds);
    assert.match(signature, /^t=\d+,v1=[0-9a-f]{64}$/);

    const verified = verifyWarmblyInbound(secret, signature, body, now.getTime());
    assert.strictEqual(verified, true);
  });

  await t.test("rejects mismatched signature", () => {
    const secret = "test-secret-32-chars-long-string";
    const body = '{"test":"data"}';
    const now = new Date();
    const unixSeconds = Math.floor(now.getTime() / 1000);

    const signature = signWarmblyInbound(secret, body, unixSeconds);
    const verified = verifyWarmblyInbound(secret, signature, '{"test":"different"}', now.getTime());
    assert.strictEqual(verified, false);
  });

  await t.test("rejects signature with expired timestamp", () => {
    const secret = "test-secret-32-chars-long-string";
    const body = '{"test":"data"}';
    const oldTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    const unixSeconds = Math.floor(oldTime.getTime() / 1000);

    const signature = signWarmblyInbound(secret, body, unixSeconds);
    const currentTime = Date.now(); // Use current time for verification
    const verified = verifyWarmblyInbound(secret, signature, body, currentTime);
    assert.strictEqual(verified, false);
  });
});

console.log("✓ Web-intent delivery tests loaded");
