import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const require = createRequire(import.meta.url);
const adaptive = require("../../netlify/functions/lib/adaptive-intake.cjs");
const handoff = require("../../netlify/functions/lib/inbound-handoff.cjs");
const leadCore = require("../../netlify/functions/lib/lead-core.cjs");

const pin = Object.freeze({
  policy_id: "NET_NEW_INBOUND_HANDRAISER",
  policy_version: "1.0.0-draft.20260904",
  canonical_name: "NET_NEW_INBOUND_HANDRAISER/1.0.0-draft.20260904",
  policy_hash: "sha256:405ac86064a90641b843352d21cd21703744115de9592558e100671d92276df7",
  governance_source_sha: "0074722ce66f16af06dd4799ee88064ea8a12fc1",
  intake_version: "CONFENGE_WEB_INTAKE/2.1.0-mv03.20260905",
  source_asset_id: "technical_triage_v1",
  offer_candidate_id: "technical_triage_review",
  outbound_eligible: false,
  auto_send: false,
});
const allNuclei = Object.keys(adaptive.NUCLEI).join(",");
const pinHash = adaptive.pinHash(pin);
const adaptiveEnv = () => ({
  NODE_ENV: "test",
  ADAPTIVE_INTAKE_PIN_JSON: JSON.stringify(pin),
  ADAPTIVE_INTAKE_NUCLEI: allNuclei,
});

test("public route is low-friction, transparent and free of sensitive inputs", () => {
  const html = fs.readFileSync(path.resolve("triagem-tecnica/index.html"), "utf8");
  const publicConfig = fs.readFileSync(path.resolve("netlify/functions/adaptive-intake-config.cjs"), "utf8");
  for (const expected of [
    "menos de um minuto",
    "não é contratação nem pagamento",
    "canal seguro",
    "Escopo, responsabilidade técnica",
    "Pedir revisão de encaixe pelo WhatsApp",
    "Enviar o contexto por e-mail",
    "Ligar para explicar a demanda",
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
  assert.match(html, /<meta(?=[^>]*name="robots")(?=[^>]*content="index,follow[^\"]*")[^>]*>/);
  assert.match(html, /action="\/\.netlify\/functions\/lead"/);
  assert.match(html, /data-config-endpoint="\/\.netlify\/functions\/adaptive-intake-config"/);
  assert.equal((html.match(/data-intake-step/g) || []).length, 2);
  assert.equal((html.match(/data-fallback-channel=/g) || []).length, 3);
  const browser = fs.readFileSync(path.resolve("assets/js/adaptive-intake.js"), "utf8");
  assert.match(browser, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(browser, /JSON\.stringify\(\{ digest: digest, key: boundKey \}\)/);
  assert.doesNotMatch(browser, /sessionStorage\.setItem\([^\n]+currentFingerprint/);
  assert.match(browser, /confenge_pseo_attribution/);
  assert.doesNotMatch(browser, /lead_alternative_channel/);
  for (const eventName of ["whatsapp_click", "email_click", "outbound_click"]) {
    assert.equal(browser.includes(`"${eventName}"`), true, `non-canonical alternative event: ${eventName}`);
  }
  assert.match(browser, /setStep\(0, false\)/);
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    assert.equal(browser.includes(`"${key}"`), true, `missing attribution allowlist: ${key}`);
  }
});

test("MV-09 publishes one bounded private wedge with embedded triage and three safe channels", () => {
  const html = fs.readFileSync(path.resolve("quantitativos-orcamento-obras/index.html"), "utf8");
  for (const expected of [
    "Orçamento só orienta a decisão quando quantidades e premissas aparecem",
    "CONFENGE, Engenharia, Perícias e Inteligência Técnica",
    "data-default-need=\"obra_edificacao_ou_documentacao\"",
    "intake_context=quantities_budget",
    "data-location hidden",
    "não recebe arquivo, planta, orçamento, endereço exato, CPF, processo ou texto livre",
  ]) {
    assert.equal(html.includes(expected), true, `missing bounded wedge contract: ${expected}`);
  }
  assert.match(html, /<meta(?=[^>]*name="robots")(?=[^>]*content="index,follow[^\"]*")[^>]*>/);
  assert.match(html, /action="\/\.netlify\/functions\/lead"/);
  assert.match(html, /data-authority-config-endpoint="\/\.netlify\/functions\/adaptive-intake-config\?intake_context=quantities_budget"/);
  assert.equal((html.match(/data-fallback-channel=/g) || []).length, 3);
  assert.equal((html.match(/name="location_(?:city|uf)"/g) || []).length, 2);
  assert.equal(/name="(?:mensagem|arquivo|upload|endereco|cpf|processo)"/i.test(html), false);
  assert.equal(/\b(?:1|2)\s+dias?\s+[úu]teis\b/i.test(html), false);
  assert.equal(/R\$\s*\d/.test(html), false);
  for (const withheldRoute of [
    "/pericias-avaliacoes/",
    "/seguranca-trabalho/",
    "/compatibilizacao-revisao/",
    "/inspecao-documentacao/",
  ]) {
    assert.equal(html.includes(withheldRoute), false, `unapproved journey leaked: ${withheldRoute}`);
  }
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
    landing_family: "triagem-tecnica",
    route_family: "triagem-tecnica",
    asset_id: "technical_triage_v1",
    cta_id: "technical-triage-submit",
    origem: "/triagem-tecnica/",
    landing_page: "/triagem-tecnica/",
    document_intent: "secure_channel_request",
    source_origin_asset_id: "private_project_technical_readiness_v1",
    source_origin_route_family: "prontidao-tecnica-obra-privada",
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
      env: adaptiveEnv(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.fields.nucleus_id, "public_works_b2g");
    assert.equal(result.fields.canal_preferido, "whatsapp");
    assert.equal(result.fields.location_material, false);
    assert.equal(result.fields.outbound_eligible, false);
    assert.equal(result.fields.auto_send, false);
  });

  test("keeps every admitted technical nucleus reachable from public vocabulary", () => {
    const cases = [
      ["pericia_ou_disputa_tecnica", "expert_evidence_assistance", false],
      ["avaliacao_de_imovel", "property_valuation", true],
      ["obra_edificacao_ou_documentacao", "building_engineering_documentation", true],
      ["seguranca_do_trabalho", "occupational_safety", true],
      ["licitacao_obra_ou_contrato_publico", "public_works_b2g", false],
      ["outra_demanda_tecnica", "other_technical_need", false],
    ];
    for (const [needCode, nucleus, needsLocation] of cases) {
      const result = adaptive.validateAdaptiveIntake(base({
        need_code: needCode,
        ...(needsLocation ? { location_city: "São José", location_uf: "SC" } : {}),
      }), { env: adaptiveEnv() });
      assert.equal(result.ok, true, needCode);
      assert.equal(result.fields.nucleus_id, nucleus, needCode);
    }
  });

  test("turns another technical need into NEEDS_CONTEXT", () => {
    const result = adaptive.validateAdaptiveIntake(base({
      need_code: "outra_demanda_tecnica",
      telefone: "",
      email: "fixture@example.test",
      preferred_channel: "email",
    }), {
      env: adaptiveEnv(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.fields.nucleus_id, "other_technical_need");
    assert.equal(result.fields.qualification_state, "NEEDS_CONTEXT");
  });

  test("asks for minimized location only when inspection scope makes it material", () => {
    const env = adaptiveEnv();
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

    const documentaryBudget = adaptive.validateAdaptiveIntake(base({
      need_code: "obra_edificacao_ou_documentacao",
      intake_context: "quantities_budget",
    }), { env });
    assert.equal(documentaryBudget.ok, true);
    assert.equal(documentaryBudget.fields.location_material, false);
    assert.equal(documentaryBudget.fields.city, null);
    assert.equal(documentaryBudget.fields.uf, null);
    assert.equal(adaptive.validateAdaptiveIntake(base({
      need_code: "avaliacao_de_imovel",
      intake_context: "quantities_budget",
    }), { env }).error, "intake_context_mismatch");
  });

  test("rejects free text, sensitive fields and mismatched channels before persistence", () => {
    const env = adaptiveEnv();
    assert.equal(adaptive.validateAdaptiveIntake(base({ processo: "0000000" }), { env }).error, "sensitive_field_rejected");
    assert.equal(adaptive.validateAdaptiveIntake(base({ mensagem: "texto" }), { env }).error, "sensitive_field_rejected");
    assert.equal(adaptive.validateAdaptiveIntake(base({ preferred_channel: "email" }), { env }).error, "contact_channel_mismatch");
    assert.equal(adaptive.validateAdaptiveIntake(base({ asset_id: "tampered_asset" }), { env }).error, "source_asset_unknown");
    const scrubbedAttribution = adaptive.validateAdaptiveIntake(base({
      source_origin_asset_id: "12.345.678/0001-90",
      source_origin_route_family: "123.456.789-09",
      utm_campaign: "pessoa@example.com",
    }), { env });
    assert.equal(scrubbedAttribution.ok, true);
    assert.equal(scrubbedAttribution.fields.source_origin_asset_id, "");
    assert.equal(scrubbedAttribution.fields.source_origin_route_family, "");
    assert.equal(scrubbedAttribution.fields.utm_campaign || "", "");
    assert.equal(leadCore.sanitizeAttributionValue("12.345.678/0001-90", 80, "utm_campaign"), "");
    assert.equal(leadCore.sanitizeAttributionValue("123.456.789-09", 80, "utm_content"), "");
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
    const payload = base({ utm_source: "google", utm_campaign: "triagem_tecnica" });
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
    assert.equal(stored.utm_source, "google");
    assert.equal(stored.utm_campaign, "triagem_tecnica");
    assert.equal(stored.source_origin_asset_id, "private_project_technical_readiness_v1");
    assert.equal(stored.source_origin_route_family, "prontidao-tecnica-obra-privada");
    assert.match(stored.delivery.email.status, /^skipped(?:_adaptive)?$/);
    assert.match(stored.delivery.notify.status, /^skipped(?:_adaptive)?$/);
  });

  test("rejects reuse of an adaptive idempotency key with different admission material", async () => {
    const reused = base({
      idempotency_key: "mv03-test-conflict-001",
      need_code: "pericia_ou_disputa_tecnica",
    });
    const first = await leadModule.handler(event(reused));
    assert.equal(first.statusCode, 201);

    const changed = await leadModule.handler(event({
      ...reused,
      need_code: "licitacao_obra_ou_contrato_publico",
    }));
    assert.equal(changed.statusCode, 409);
    assert.equal(JSON.parse(changed.body).error, "idempotency_conflict");

    const unbound = base({ idempotency_key: "mv03-test-unbound-001" });
    const unboundFirst = await leadModule.handler(event(unbound));
    const unboundRecord = await store.get(JSON.parse(unboundFirst.body).lead_id);
    delete unboundRecord.idempotency_material_hash;
    const unboundRetry = await leadModule.handler(event(unbound));
    assert.equal(unboundRetry.statusCode, 409);
    assert.equal(JSON.parse(unboundRetry.body).error, "idempotency_conflict");
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
    route_family: "triagem-tecnica",
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
    source_origin_asset_id: "private_project_technical_readiness_v1",
    source_origin_route_family: "prontidao-tecnica-obra-privada",
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
    assert.equal(payload.source.system, "web-cfg");
    assert.equal(payload.hash, pin.policy_hash);
    assert.equal(payload.acquisition_lane, "NET_NEW_INBOUND");
    assert.equal(payload.nucleus_id, "other_technical_need");
    assert.equal(payload.landing_asset.kind, "TRIAGE");
    assert.equal(payload.site_location.material, false);
    assert.equal(payload.protected_contact.phone, "5548988344559");
    assert.equal(payload.protected_contact.preferred_channel, "WHATSAPP");
    assert.equal(payload.protected_contact.organization, "Organização Sintética");
    assert.equal(payload.attribution.phone, undefined);
    assert.equal(payload.attribution.source_origin_asset, "private_project_technical_readiness_v1");
    assert.equal(payload.attribution.source_origin_family, "prontidao-tecnica-obra-privada");
    assert.equal(payload.outbound_eligible, false);
    assert.equal(payload.auto_send, false);
    const byPhone = handoff.mapAdaptiveLeadToNetNewInbound({ ...record, canal_preferido: "phone" });
    assert.equal(byPhone.protected_contact.preferred_channel, "PHONE");
  });

  test("accepts only an explicit safe receipt, blocks rejection and retries UNKNOWN", async () => {
    const payload = handoff.mapAdaptiveLeadToNetNewInbound(record);
    const replies = [
      { outcome: "ACCEPTED", reason: "", receipt: "warmbly-receipt-1" },
      { outcome: "REJECTED_WITH_REASON", reason: "nucleus_unknown", receipt: "warmbly-receipt-2" },
      { outcome: "UNKNOWN", reason: "downstream_unavailable", receipt: "warmbly-receipt-3" },
    ];
    let posted = null;
    handoff.setFetchForTests(async (url, options) => {
      if (options.method === "POST") posted = replies.shift();
      const reply = posted;
      if (options.method === "GET") {
        assert.match(String(url), /\/api\/v1\/webhooks\/confenge\/inbound\/handraisers\/lead-/);
        assert.match(options.headers["X-Warmbly-Signature"], /^t=\d+,v1=[0-9a-f]{64}$/);
      }
      return new Response(JSON.stringify({ data: {
        ...reply,
        logical_id: payload.logical_id,
        inbound_only: true,
        outbound_eligible: false,
        auto_send: false,
        dispatch_attempted: false,
      } }), { status: options.method === "GET" ? 200 : 201, headers: { "content-type": "application/json" } });
    });

    const accepted = await handoff.postSignedInbound(payload, { env });
    assert.equal(accepted.status, handoff.STATUS.DELIVERED, JSON.stringify(accepted));
    assert.equal(accepted.downstream.readback_verified, true);
    assert.equal(accepted.downstream.outcome, "ACCEPTED");
    assert.equal(accepted.downstream.downstream_receipt, "warmbly-receipt-1");

    const rejected = await handoff.postSignedInbound(payload, { env });
    assert.equal(rejected.status, handoff.STATUS.BLOCKED);
    assert.equal(rejected.last_error, "admission_rejected:nucleus_unknown");

    const unknown = await handoff.postSignedInbound(payload, { env });
    assert.equal(unknown.status, handoff.STATUS.RETRYABLE);
  });

  test("retries uncorrelated rejection and mismatched readback instead of blocking or delivering", async () => {
    const payload = handoff.mapAdaptiveLeadToNetNewInbound(record);
    handoff.setFetchForTests(async () => new Response(JSON.stringify({ data: {
      outcome: "REJECTED_WITH_REASON",
      reason: "nucleus_unknown",
      logical_id: "WRONG",
      inbound_only: true,
      outbound_eligible: false,
      auto_send: false,
      dispatch_attempted: false,
    } }), { status: 201, headers: { "content-type": "application/json" } }));
    const uncorrelated = await handoff.postSignedInbound(payload, { env });
    assert.equal(uncorrelated.status, handoff.STATUS.RETRYABLE);

    let call = 0;
    handoff.setFetchForTests(async () => {
      call += 1;
      return new Response(JSON.stringify({ data: {
        outcome: "ACCEPTED",
        receipt: call === 1 ? "warmbly-receipt-post" : "warmbly-receipt-other",
        logical_id: payload.logical_id,
        inbound_only: true,
        outbound_eligible: false,
        auto_send: false,
        dispatch_attempted: false,
      } }), { status: call === 1 ? 201 : 200, headers: { "content-type": "application/json" } });
    });
    const mismatched = await handoff.postSignedInbound(payload, { env });
    assert.equal(mismatched.status, handoff.STATUS.RETRYABLE);
    assert.equal(call, 2);
  });
});
