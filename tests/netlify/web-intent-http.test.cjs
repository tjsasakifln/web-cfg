/**
 * HTTP integration tests for web-intent delivery.
 * Mocks a Warmbly-like server and validates HMAC signature.
 * Uses Node.js built-in test runner (node --test).
 */
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const crypto = require("crypto");

const {
  postSignedInbound,
  signWarmblyInbound,
  verifyWarmblyInbound,
  STATUS,
  setFetchForTests,
} = require("../../netlify/functions/lib/inbound-handoff.cjs");

const {
  buildWebIntentEnvelope,
} = require("../../netlify/functions/lib/web-intent-builder.cjs");

test("HTTP POST with HMAC signature", async (t) => {
  await t.test("delivers MONITOR_COMPANY envelope with valid HMAC", async () => {
    const secret = "test-secret-32-characters-minimum-";
    const requests = [];

    // Use global fetch if available (Node.js 18+)
    const mockFetch = async (url, options) => {
      const signature = options.headers["X-Warmbly-Signature"];
      const body = options.body;
      const isValid = verifyWarmblyInbound(secret, signature, body, Date.now());

      requests.push({
        method: options.method,
        url,
        signature,
        signatureValid: isValid,
        body: JSON.parse(body),
      });

      if (!isValid) {
        return new Response(JSON.stringify({ ok: false, error: "invalid_signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const payload = JSON.parse(body);
      const idempotencyKey = options.headers["Idempotency-Key"];

      return new Response(JSON.stringify({
        ok: true,
        id: idempotencyKey,
        schema: payload.schema,
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    // Mock fetch
    setFetchForTests(mockFetch);

    try {
      const formData = {
        intent_kind: "MONITOR_COMPANY",
        email: "test@example.com",
        nome: "Test User",
        company_ref: "cref123:abc",
        topic: "contract monitoring",
        cadence: "weekly",
        consent_checked: true,
        consent_at: new Date().toISOString(),
      };

      const buildResult = buildWebIntentEnvelope(formData);
      assert.strictEqual(buildResult.ok, true);

      const envelope = buildResult.envelope;

      // POST with generic signed inbound
      const result = await postSignedInbound(envelope, {
        now: new Date(),
        env: {
          CONFENGE_INBOUND_WEBHOOK_URL: "http://127.0.0.1:9999/api/v1/webhooks/confenge/inbound",
          CONFENGE_INBOUND_WEBHOOK_SECRET: secret,
          NODE_ENV: "test",
        },
      });

      assert.strictEqual(result.status, STATUS.DELIVERED);
      assert.strictEqual(result.http, 201);

      assert.strictEqual(requests.length, 1);
      const request = requests[0];
      assert.strictEqual(request.signatureValid, true);
      assert.strictEqual(request.body.schema, "CONFENGE_WEB_INTENT/1.0");
      assert.strictEqual(request.body.intent_kind, "MONITOR_COMPANY");
      assert.strictEqual(request.body.contact_email, "test@example.com");
    } finally {
      setFetchForTests(null);
    }
  });

  await t.test("rejects REQUEST_HUMAN_REVIEW without company_ref", async () => {
    const secret = "test-secret-32-characters-minimum-";
    const server = http.createServer((req, res) => {
      res.writeHead(400);
      res.end();
    });

    await new Promise((resolve) => {
      server.listen(0, resolve);
    });

    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/api/v1/webhooks/confenge/inbound`;

    try {
      const formData = {
        intent_kind: "REQUEST_HUMAN_REVIEW",
        email: "test@example.com",
        nome: "Test User",
        // Missing company_ref — should fail at build time
      };

      const buildResult = buildWebIntentEnvelope(formData);
      assert.strictEqual(buildResult.ok, false);
    } finally {
      server.close();
    }
  });

  await t.test("handles 401 Unauthorized from Warmbly", async () => {
    const secret = "test-secret-32-characters-minimum-";

    const mockFetch = async (url, options) => {
      const signature = options.headers["X-Warmbly-Signature"];
      const body = options.body;

      // Verify signature fails on purpose (wrong secret on server side)
      const isValid = verifyWarmblyInbound("different-secret", signature, body, Date.now());

      if (!isValid) {
        return new Response(JSON.stringify({ ok: false, error: "invalid_signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    };

    setFetchForTests(mockFetch);

    try {
      const envelope = {
        schema: "CONFENGE_WEB_INTENT/1.0",
        intent_kind: "REQUEST_DEEP_DIVE",
        lane: "confenge_web",
        contact_email: "test@example.com",
        company_ref: "cref:123",
        occurred_at: new Date().toISOString(),
      };

      const result = await postSignedInbound(envelope, {
        now: new Date(),
        env: {
          CONFENGE_INBOUND_WEBHOOK_URL: "http://127.0.0.1:9999/api/v1/webhooks/confenge/inbound",
          CONFENGE_INBOUND_WEBHOOK_SECRET: secret,
          NODE_ENV: "test",
        },
      });

      assert.strictEqual(result.status, STATUS.BLOCKED);
      assert.strictEqual(result.http, 401);
    } finally {
      setFetchForTests(null);
    }
  });
});

console.log("✓ Web-intent HTTP tests loaded");
