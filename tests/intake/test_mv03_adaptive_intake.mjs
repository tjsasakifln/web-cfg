import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const require = createRequire(import.meta.url);
const adaptive = require("../../netlify/functions/lib/adaptive-intake.cjs");
const handoff = require("../../netlify/functions/lib/inbound-handoff.cjs");

const pin = Object.freeze({
  policy_id: "NET_NEW_INBOUND_HANDRAISER",
  policy_version: "1.0.0-draft.20260904",
  canonical_name: "NET_NEW_INBOUND_HANDRAISER/1.0.0-draft.20260904",
  policy_hash: "sha256:405ac86064a90641b843352d21cd21703744115de9592558e100671d92276df7",
  governance_source_sha: "487ef4e061685387c072e2a2f84600dfb14cc6b4",
  intake_version: "CONFENGE_WEB_INTAKE/2.1.0-mv03.20260905",
  source_asset_id: "technical_triage_v1",
  offer_candidate_id: "technical_triage_review",
  outbound_eligible: false,
  auto_send: false,
});
const allNuclei = Object.keys(adaptive.NUCLEI).join(",");
const pinHash = adaptive.pinHash(pin);

test("public route is low-friction, transparent and free of sensitive inputs", () => {
  const html = fs.readFileSync(path.resolve("triagem-tecnica/index.html"), "utf8");
  const publicConfig = fs.readFileSync(path.resolve("netlify/functions/adaptive-intake-config.cjs"), "utf8");
  for (const expected of [
    "menos de um minuto",
    "não é contratação nem pagamento",
    "canal seguro",
    "Escopo, responsabilidade técnica",
    "Conversar pelo WhatsApp",
    "Enviar e-mail",
    "Ligar para",
  ]) {
    assert.equal(html.includes(expected), true, `missing public promise: ${expected}`);
  }
  assert.equal(publicConfig.includes("Outra demanda técnica"), true);
  for (const forbiddenName of [
    "cpf", "processo", "corpus", "prontuario", "empregados", "planta",
    "arquivo", "upload", "conflict_parties", "valor_contrato",
  ]) {
    assert.equal(new RegExp(`name=["']${forbiddenName}["']`, "i").test(html), false);
  }
  assert.equal(/\b(?:1|2)\s+dias?\s+[úu]teis\b/i.test(html), false);
  assert.match(html, /name="robots" content="noindex,follow"/);
  assert.equal((html.match(/data-intake-step/g) || []).length, 2);
});

function base(overrides = {}) {
  return {
    "form-name": "triagem-tecnica",
    adaptive_intake: "true",
    intake_version: pin.intake_version,
    intake_pin_hash: pinHash,
    need_code: "licitacao_obra_ou_contrato_publico",
    nome: "Pessoa Sintética",
    telefone: "48988344559",
    preferred_channel: "whatsapp",
    sensitive_docs_ack: "on",
    consentimento: "on",
    landing_family: "technical-triage",
    route_family: "technical-triage",
    asset_id: "technical_triage_v1",
    cta_id: "technical-triage-submit",
    origem: "/triagem-tecnica/",
    landing_page: "/triagem-tecnica/",
    document_intent: "secure_channel_request",
    idempotency_key: "mv03-test-fixed-001",
    ...overrides,
  };
}

describe("MV-03 pure adaptive intake", () => {
  test("consumes the pinned Governance policy and rejects unsafe pins", () => {
    assert.equal(adaptive.parsePin(pin).ok, true);
    assert.equal(adaptive.parsePin({ ...pin, auto_send: true }).error, "unsafe_pin");
    assert.equal(adaptive.parsePin({ ...pin, policy_hash: "draft" }).error, "policy_hash_invalid");
  });

  test("accepts one valid return channel and keeps the known B2G nucleus", () => {
    const result = adaptive.validateAdaptiveIntake(base(), {
      env: {
        ADAPTIVE_INTAKE_PIN_JSON: JSON.stringify(pin),
        ADAPTIVE_INTAKE_NUCLEI: allNuclei,
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.fields.nucleus_id, "public_works_b2g");
    assert.equal(result.fields.canal_preferido, "whatsapp");
    assert.equal(result.fields.location_material, false);
    assert.equal(result.fields.outbound_eligible, false);
    assert.equal(result.fields.auto_send, false);
  });

  test("turns another technical need into NEEDS_CONTEXT", () => {
    const result = adaptive.validateAdaptiveIntake(base({
      need_code: "outra_demanda_tecnica",
      telefone: "",
      email: "fixture@example.test",
      preferred_channel: "email",
    }), {
      env: {
        ADAPTIVE_INTAKE_PIN_JSON: JSON.stringify(pin),
        ADAPTIVE_INTAKE_NUCLEI: allNuclei,
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.fields.nucleus_id, "other_technical_need");
    assert.equal(result.fields.qualification_state, "NEEDS_CONTEXT");
  });

  test("asks for minimized location only when inspection scope makes it material", () => {
    const env = {
      ADAPTIVE_INTAKE_PIN_JSON: JSON.stringify(pin),
      ADAPTIVE_INTAKE_NUCLEI: allNuclei,
    };
    const missing = adaptive.validateAdaptiveIntake(base({
      need_code: "avaliacao_de_imovel",
    }), { env });
    assert.equal(missing.error, "location_required");

    const accepted = adaptive.validateAdaptiveIntake(base({
      need_code: "avaliacao_de_imovel",
      location_city: "São José",
      location_uf: "SC",
    }), { env });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.fields.city, "São José");
    assert.equal(accepted.fields.uf, "SC");

    const irrelevant = adaptive.validateAdaptiveIntake(base({
      location_city: "Florianópolis",
      location_uf: "SC",
    }), { env });
    assert.equal(irrelevant.error, "irrelevant_location_rejected");
  });

  test("rejects free text, sensitive fields and mismatched channels before persistence", () => {
    const env = {
      ADAPTIVE_INTAKE_PIN_JSON: JSON.stringify(pin),
      ADAPTIVE_INTAKE_NUCLEI: allNuclei,
    };
    assert.equal(adaptive.validateAdaptiveIntake(base({ processo: "0000000" }), { env }).error, "sensitive_field_rejected");
    assert.equal(adaptive.validateAdaptiveIntake(base({ mensagem: "texto" }), { env }).error, "sensitive_field_rejected");
    assert.equal(adaptive.validateAdaptiveIntake(base({ preferred_channel: "email" }), { env }).error, "contact_channel_mismatch");
  });
});

describe("MV-03 config and persisted lead", () => {
  let leadModule;
  let store;
  let ip = 10;

  before(() => {
    process.env.NODE_ENV = "test";
    process.env.ADAPTIVE_INTAKE_PIN_JSON = JSON.stringify(pin);
    process.env.ADAPTIVE_INTAKE_NUCLEI = allNuclei;
    delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
    delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
    delete process.env.RESEND_API_KEY;
    delete process.env.NTFY_URL;
    delete process.env.NTFY_TOKEN;
    delete process.env.FORMSUBMIT_URL;
    delete process.env.LEAD_REQUIRE_TURNSTILE;
    leadModule = require("../../netlify/functions/lead.cjs");
    const { MemoryStore } = require("../../netlify/functions/lib/lead-store.cjs");
    store = new MemoryStore();
    leadModule.setStoreForTests(store);
  });

  after(() => {
    handoff.setFetchForTests(null);
  });

  function event(payload, key = payload.idempotency_key) {
    ip += 1;
    return {
      httpMethod: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://confenge.com.br",
        "user-agent": "mv03-synthetic-test/1.0",
        "x-forwarded-for": `192.0.2.${ip}`,
        "idempotency-key": key,
      },
      body: JSON.stringify(payload),
    };
  }

  test("serves only public configuration and fails closed without authority", async () => {
    const config = require("../../netlify/functions/adaptive-intake-config.cjs");
    const ok = await config.handler({ httpMethod: "GET" });
    const body = JSON.parse(ok.body);
    assert.equal(ok.statusCode, 200);
    assert.equal(body.intake_pin_hash, pinHash);
    assert.equal(body.options.length, 6);
    assert.equal(JSON.stringify(body).includes("Pessoa Sintética"), false);

    const saved = process.env.ADAPTIVE_INTAKE_PIN_JSON;
    delete process.env.ADAPTIVE_INTAKE_PIN_JSON;
    const unavailable = await config.handler({ httpMethod: "GET" });
    process.env.ADAPTIVE_INTAKE_PIN_JSON = saved;
    assert.equal(unavailable.statusCode, 503);
  });

  test("persists, returns a PII-free receipt and replays idempotently", async () => {
    const payload = base();
    const first = await leadModule.handler(event(payload));
    const firstBody = JSON.parse(first.body);
    assert.equal(first.statusCode, 201);
    assert.equal(firstBody.ok, true);
    assert.match(firstBody.lead_id, /^lead-/);
    assert.equal(JSON.stringify(firstBody).includes("48988344559"), false);
    assert.equal(JSON.stringify(firstBody).includes("Pessoa Sintética"), false);

    const second = await leadModule.handler(event(payload));
    const secondBody = JSON.parse(second.body);
    assert.equal(second.statusCode, 200);
    assert.equal(secondBody.lead_id, firstBody.lead_id);
    assert.equal(secondBody.idempotent, true);

    const stored = await store.get(firstBody.lead_id);
    assert.equal(stored.source, "CONFENGE_WEB");
    assert.equal(stored.outbound_eligible, false);
    assert.equal(stored.auto_send, false);
    assert.match(stored.delivery.email.status, /^skipped(?:_adaptive)?$/);
    assert.match(stored.delivery.notify.status, /^skipped(?:_adaptive)?$/);
  });

  test("persists another need as NEEDS_CONTEXT and safely rejects a sensitive payload", async () => {
    const otherPayload = base({
      idempotency_key: "mv03-test-other-001",
      need_code: "outra_demanda_tecnica",
      telefone: "",
      email: "synthetic@example.test",
      preferred_channel: "email",
    });
    const accepted = await leadModule.handler(event(otherPayload));
    const acceptedBody = JSON.parse(accepted.body);
    assert.equal(accepted.statusCode, 201);
    assert.equal(acceptedBody.qualification_state, "NEEDS_CONTEXT");

    const before = (await store.list()).length;
    const rejected = await leadModule.handler(event(base({
      idempotency_key: "mv03-test-reject-001",
      cpf: "00000000000",
    })));
    assert.equal(rejected.statusCode, 422);
    assert.equal(JSON.parse(rejected.body).error, "sensitive_field_rejected");
    assert.equal((await store.list()).length, before);
  });

  test("keeps a legacy B2G submission compatible", async () => {
    const legacy = {
      nome: "Fixture B2G",
      telefone: "48988344559",
      estagio: "contrato sob pressão",
      jornada: "contrato",
      consentimento: "on",
      idempotency_key: "mv03-legacy-b2g-001",
    };
    const response = await leadModule.handler(event(legacy));
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 201);
    assert.equal(body.ok, true);
    const stored = await store.get(body.lead_id);
    assert.notEqual(stored.adaptive_intake, true);
    assert.equal(stored.jornada, "contrato");
  });
});

describe("MV-03 signed Warmbly handoff", () => {
  const record = {
    adaptive_intake: true,
    lead_id: "lead-1234567890abcdef12345678901",
    receipt_id: "lead-1234567890abcdef12345678901",
    received_at: "2026-09-05T20:00:00.000Z",
    nome: "Pessoa Protegida",
    telefone: "5548988344559",
    email: null,
    empresa: "Organização Sintética",
    consentimento: true,
    source: "CONFENGE_WEB",
    need_code: "outra_demanda_tecnica",
    nucleus_id: "other_technical_need",
    offer_candidate_id: "technical_triage_review",
    source_asset_id: "technical_triage_v1",
    route_family: "technical-triage",
    canal_preferido: "whatsapp",
    pessoa_tipo: "COMPANY",
    decision_role: "UNKNOWN",
    location_material: false,
    qualification_state: "NEEDS_CONTEXT",
    conflict_status: "NOT_SCREENED",
    intake_contract_version: pin.intake_version,
    admission_policy_id: pin.policy_id,
    admission_policy_version: pin.canonical_name,
    admission_policy_hash: pin.policy_hash,
    governance_source_sha: pin.governance_source_sha,
    outbound_eligible: false,
    auto_send: false,
  };
  const env = {
    NODE_ENV: "test",
    CONFENGE_INBOUND_WEBHOOK_URL: "http://127.0.0.1/api/v1/webhooks/confenge/inbound",
    CONFENGE_INBOUND_WEBHOOK_SECRET: "synthetic-secret",
  };

  test("maps official policy fields and keeps contact only in the signed protected block", () => {
    const payload = handoff.mapAdaptiveLeadToNetNewInbound(record);
    assert.equal(payload.origin, "CONFENGE_WEB");
    assert.equal(payload.acquisition_lane, "NET_NEW_INBOUND");
    assert.equal(payload.nucleus_id, "other_technical_need");
    assert.equal(payload.site_location.material, false);
    assert.equal(payload.protected_contact.phone, "5548988344559");
    assert.equal(payload.attribution.phone, undefined);
    assert.equal(payload.outbound_eligible, false);
    assert.equal(payload.auto_send, false);
  });

  test("accepts only an explicit safe receipt, blocks rejection and retries UNKNOWN", async () => {
    const payload = handoff.mapAdaptiveLeadToNetNewInbound(record);
    const replies = [
      { outcome: "ACCEPTED", reason: "", receipt: "warmbly-receipt-1" },
      { outcome: "REJECTED_WITH_REASON", reason: "nucleus_unknown", receipt: "warmbly-receipt-2" },
      { outcome: "UNKNOWN", reason: "downstream_unavailable", receipt: "warmbly-receipt-3" },
    ];
    handoff.setFetchForTests(async () => {
      const reply = replies.shift();
      return new Response(JSON.stringify({ data: {
        ...reply,
        logical_id: payload.logical_id,
        inbound_only: true,
        outbound_eligible: false,
        auto_send: false,
        dispatch_attempted: false,
      } }), { status: 201, headers: { "content-type": "application/json" } });
    });

    const accepted = await handoff.postSignedInbound(payload, { env });
    assert.equal(accepted.status, handoff.STATUS.DELIVERED);
    assert.equal(accepted.downstream.outcome, "ACCEPTED");
    assert.equal(accepted.downstream.downstream_receipt, "warmbly-receipt-1");

    const rejected = await handoff.postSignedInbound(payload, { env });
    assert.equal(rejected.status, handoff.STATUS.BLOCKED);
    assert.equal(rejected.last_error, "admission_rejected:nucleus_unknown");

    const unknown = await handoff.postSignedInbound(payload, { env });
    assert.equal(unknown.status, handoff.STATUS.RETRYABLE);
  });
});
