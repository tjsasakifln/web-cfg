/**
 * Tests for CONFENGE_WEB_INTENT/1.0 envelope builder and validator.
 * Uses Node.js built-in test runner (node --test).
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  INTENT_KINDS,
  MONITOR_INTENT_KINDS,
  REQUEST_INTENT_KINDS,
  isValidEmail,
  isReservedId,
  isValidIsoTimestamp,
  validateWebIntentEnvelope,
  buildWebIntentEnvelope,
} = require("../../netlify/functions/lib/web-intent-builder.cjs");

test("isValidEmail", async (t) => {
  await t.test("accepts valid emails", () => {
    assert.strictEqual(isValidEmail("user@example.com"), true);
    assert.strictEqual(isValidEmail("test@domain.co"), true);
  });

  await t.test("rejects invalid emails", () => {
    assert.strictEqual(isValidEmail(""), false);
    assert.strictEqual(isValidEmail("notanemail"), false);
    assert.strictEqual(isValidEmail("user @domain.com"), false);
    assert.strictEqual(isValidEmail("user@"), false);
  });
});

test("isReservedId", async (t) => {
  await t.test("rejects CNPJ patterns (14 digits)", () => {
    assert.strictEqual(isReservedId("12345678901234"), true);
    assert.strictEqual(isReservedId("00000000000000"), true);
  });

  await t.test("rejects share token patterns", () => {
    assert.strictEqual(isReservedId("li_12345678-12345678-12345678-12345678"), true);
    assert.strictEqual(isReservedId("li_abcdef01-abcdef01-abcdef01-abcdef01"), true);
  });

  await t.test("accepts valid IDs", () => {
    assert.strictEqual(isReservedId("cref123:abcd1234"), false);
    assert.strictEqual(isReservedId("opp-valid-id"), false);
    assert.strictEqual(isReservedId(""), false);
  });
});

test("isValidIsoTimestamp", async (t) => {
  await t.test("accepts valid ISO timestamps", () => {
    assert.strictEqual(isValidIsoTimestamp("2026-09-03T10:30:00.000Z"), true);
    assert.strictEqual(isValidIsoTimestamp(new Date().toISOString()), true);
  });

  await t.test("rejects invalid timestamps", () => {
    assert.strictEqual(isValidIsoTimestamp(""), false);
    assert.strictEqual(isValidIsoTimestamp("not-a-date"), false);
    assert.strictEqual(isValidIsoTimestamp("2026-13-45"), false);
  });
});

test("validateWebIntentEnvelope", async (t) => {
  const validMonitorCompanyEnvelope = {
    schema: "CONFENGE_WEB_INTENT/1.0",
    intent_kind: "MONITOR_COMPANY",
    lane: "confenge_web",
    company_ref: "cref123:abcd1234",
    contact_email: "user@example.com",
    contact_name: "User Name",
    topic: "contract monitoring",
    cadence: "weekly",
    consent_source: "web_form_checkbox",
    consent_at: "2026-09-03T10:30:00Z",
    consent_provenance_ok: true,
    occurred_at: "2026-09-03T10:35:00Z",
    evidence: "interested in procurement",
    notes: "",
  };

  await t.test("accepts valid MONITOR_COMPANY envelope", () => {
    const result = validateWebIntentEnvelope(validMonitorCompanyEnvelope);
    assert.strictEqual(result.ok, true);
  });

  await t.test("rejects envelope with wrong schema", () => {
    const envelope = { ...validMonitorCompanyEnvelope, schema: "WRONG" };
    const result = validateWebIntentEnvelope(envelope);
    assert.strictEqual(result.ok, false);
    assert(result.errors.includes("schema_mismatch"));
  });

  await t.test("rejects envelope with invalid intent_kind", () => {
    const envelope = { ...validMonitorCompanyEnvelope, intent_kind: "INVALID_KIND" };
    const result = validateWebIntentEnvelope(envelope);
    assert.strictEqual(result.ok, false);
    assert(result.errors.includes("intent_kind_invalid"));
  });

  await t.test("rejects envelope with reserved company_ref (CNPJ)", () => {
    const envelope = { ...validMonitorCompanyEnvelope, company_ref: "12345678901234" };
    const result = validateWebIntentEnvelope(envelope);
    assert.strictEqual(result.ok, false);
    assert(result.errors.includes("company_ref_reserved"));
  });

  await t.test("rejects envelope with reserved company_ref (share token)", () => {
    const envelope = { ...validMonitorCompanyEnvelope, company_ref: "li_12345678-12345678-12345678-12345678" };
    const result = validateWebIntentEnvelope(envelope);
    assert.strictEqual(result.ok, false);
    assert(result.errors.includes("company_ref_reserved"));
  });

  await t.test("rejects MONITOR_COMPANY without company_ref", () => {
    const envelope = { ...validMonitorCompanyEnvelope, company_ref: undefined };
    const result = validateWebIntentEnvelope(envelope);
    assert.strictEqual(result.ok, false);
    assert(result.errors.includes("company_ref_required"));
  });

  await t.test("rejects MONITOR_OPPORTUNITY without opportunity_id", () => {
    const envelope = {
      schema: "CONFENGE_WEB_INTENT/1.0",
      intent_kind: "MONITOR_OPPORTUNITY",
      lane: "confenge_web",
      contact_email: "user@example.com",
      contact_name: "User",
      consent_source: "web_form_checkbox",
      consent_at: "2026-09-03T10:30:00Z",
      consent_provenance_ok: true,
      occurred_at: "2026-09-03T10:35:00Z",
    };
    const result = validateWebIntentEnvelope(envelope);
    assert.strictEqual(result.ok, false);
    assert(result.errors.includes("opportunity_id_required"));
  });

  await t.test("rejects MONITOR_COMPANY without consent", () => {
    const envelope = { ...validMonitorCompanyEnvelope, consent_at: "" };
    const result = validateWebIntentEnvelope(envelope);
    assert.strictEqual(result.ok, false);
    assert(result.errors.includes("consent_at_invalid"));
  });

  await t.test("accepts REQUEST_DEEP_DIVE without consent", () => {
    const envelope = {
      schema: "CONFENGE_WEB_INTENT/1.0",
      intent_kind: "REQUEST_DEEP_DIVE",
      lane: "confenge_web",
      company_ref: "cref123:abcd1234",
      contact_email: "user@example.com",
      contact_name: "User",
      occurred_at: "2026-09-03T10:35:00Z",
    };
    const result = validateWebIntentEnvelope(envelope);
    assert.strictEqual(result.ok, true);
  });

  await t.test("accepts REQUEST_HUMAN_REVIEW with valid fields", () => {
    const envelope = {
      schema: "CONFENGE_WEB_INTENT/1.0",
      intent_kind: "REQUEST_HUMAN_REVIEW",
      lane: "confenge_web",
      company_ref: "cref999:xyz123",
      contact_email: "user@example.com",
      contact_name: "User",
      occurred_at: "2026-09-03T10:35:00Z",
    };
    const result = validateWebIntentEnvelope(envelope);
    assert.strictEqual(result.ok, true);
  });
});

test("buildWebIntentEnvelope", async (t) => {
  await t.test("builds valid MONITOR_COMPANY envelope", () => {
    const input = {
      intent_kind: "MONITOR_COMPANY",
      email: "user@example.com",
      name: "User Name",
      company_ref: "cref123:abcd1234",
      topic: "contract monitoring",
      cadence: "weekly",
      consent_checked: true,
      consent_at: "2026-09-03T10:30:00Z",
      evidence: "interested in government contracts",
      occurred_at: "2026-09-03T10:35:00Z",
    };
    const result = buildWebIntentEnvelope(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.envelope.schema, "CONFENGE_WEB_INTENT/1.0");
    assert.strictEqual(result.envelope.intent_kind, "MONITOR_COMPANY");
    assert.strictEqual(result.envelope.contact_email, "user@example.com");
    assert.strictEqual(result.envelope.cadence, "weekly");
  });

  await t.test("builds valid MONITOR_OPPORTUNITY envelope", () => {
    const input = {
      intent_kind: "MONITOR_OPPORTUNITY",
      email: "user@example.com",
      name: "User",
      opportunity_id: "opp-12345",
      consent_checked: true,
      consent_at: "2026-09-03T10:30:00Z",
    };
    const result = buildWebIntentEnvelope(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.envelope.intent_kind, "MONITOR_OPPORTUNITY");
    assert.strictEqual(result.envelope.opportunity_id, "opp-12345");
  });

  await t.test("builds valid REQUEST_DEEP_DIVE envelope without consent", () => {
    const input = {
      intent_kind: "REQUEST_DEEP_DIVE",
      email: "user@example.com",
      name: "User",
      company_ref: "cref123:abcd1234",
    };
    const result = buildWebIntentEnvelope(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.envelope.intent_kind, "REQUEST_DEEP_DIVE");
    assert.strictEqual(result.envelope.consent_source, null);
  });

  await t.test("rejects envelope without consent for MONITOR_*", () => {
    const input = {
      intent_kind: "MONITOR_COMPANY",
      email: "user@example.com",
      name: "User",
      company_ref: "cref123:abcd1234",
      consent_checked: false,
    };
    const result = buildWebIntentEnvelope(input);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "consent_required_for_monitor");
  });

  await t.test("rejects envelope with invalid email", () => {
    const input = {
      intent_kind: "MONITOR_COMPANY",
      email: "not-an-email",
      name: "User",
      company_ref: "cref123:abcd1234",
      consent_checked: true,
      consent_at: "2026-09-03T10:30:00Z",
    };
    const result = buildWebIntentEnvelope(input);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "email_invalid_or_missing");
  });

  await t.test("defaults cadence to 'immediate' for MONITOR_*", () => {
    const input = {
      intent_kind: "MONITOR_COMPANY",
      email: "user@example.com",
      name: "User",
      company_ref: "cref123:abcd1234",
      consent_checked: true,
      consent_at: "2026-09-03T10:30:00Z",
    };
    const result = buildWebIntentEnvelope(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.envelope.cadence, "immediate");
  });

  await t.test("normalizes email to lowercase", () => {
    const input = {
      intent_kind: "REQUEST_DEEP_DIVE",
      email: "User@EXAMPLE.COM",
      name: "User",
      company_ref: "cref123:abcd1234",
    };
    const result = buildWebIntentEnvelope(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.envelope.contact_email, "user@example.com");
  });

  await t.test("clamps text fields to max lengths", () => {
    const longTopic = "a".repeat(300);
    const input = {
      intent_kind: "MONITOR_COMPANY",
      email: "user@example.com",
      name: "x".repeat(200),
      company_ref: "cref123:abcd1234",
      topic: longTopic,
      consent_checked: true,
      consent_at: "2026-09-03T10:30:00Z",
    };
    const result = buildWebIntentEnvelope(input);
    assert.strictEqual(result.ok, true);
    assert(result.envelope.contact_name.length <= 160);
    assert(result.envelope.topic.length <= 200);
  });
});

test("Intent kind sets", async (t) => {
  await t.test("has correct INTENT_KINDS", () => {
    assert(INTENT_KINDS.has("MONITOR_OPPORTUNITY"));
    assert(INTENT_KINDS.has("MONITOR_COMPANY"));
    assert(INTENT_KINDS.has("REQUEST_DEEP_DIVE"));
    assert(INTENT_KINDS.has("REQUEST_HUMAN_REVIEW"));
    assert.strictEqual(INTENT_KINDS.size, 4);
  });

  await t.test("has correct MONITOR_INTENT_KINDS", () => {
    assert(MONITOR_INTENT_KINDS.has("MONITOR_COMPANY"));
    assert(MONITOR_INTENT_KINDS.has("MONITOR_OPPORTUNITY"));
    assert(!MONITOR_INTENT_KINDS.has("REQUEST_DEEP_DIVE"));
  });

  await t.test("has correct REQUEST_INTENT_KINDS", () => {
    assert(REQUEST_INTENT_KINDS.has("REQUEST_DEEP_DIVE"));
    assert(REQUEST_INTENT_KINDS.has("REQUEST_HUMAN_REVIEW"));
    assert(!REQUEST_INTENT_KINDS.has("MONITOR_COMPANY"));
  });
});
