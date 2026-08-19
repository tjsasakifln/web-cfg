/**
 * Injectable Asaas production adapter for CFG-DIAG-EXP-v1 only.
 * Separate from asaas-sandbox.cjs. Never a hybrid.
 */
const crypto = require("crypto");
const { getOffer, snapshotOffer } = require("../registry.cjs");
const { commercialEvent, TYPES } = require("../events.cjs");
const { redactProviderPayload } = require("./redact.cjs");
const { decideCanonicalTransition, objectIdFromPayload } = require("./status-machine.cjs");
const {
  resolveProductionConfig,
  requireProductionRuntime,
  assertProductionApiUrl,
  assertProductionLinkUrl,
  assertCallbackUrl,
  verifyWebhookToken,
  headerValue,
  APPROVED_OFFER,
  APPROVED_AMOUNT_CENTS,
  TERMS_VERSION,
  PINNED_LEGAL_HASH,
} = require("./config-production.cjs");
const { requireValidAcceptance } = require("../acceptance.cjs");

const PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function centsToReais(cents) {
  if (!Number.isInteger(cents) || cents < 0 || !Number.isSafeInteger(cents)) {
    const err = new Error("unsafe_amount");
    err.code = "unsafe_amount";
    throw err;
  }
  const reais = Number((cents / 100).toFixed(2));
  if (Math.round(reais * 100) !== cents) {
    const err = new Error("unsafe_amount");
    err.code = "unsafe_amount";
    throw err;
  }
  return reais;
}

function joinUrl(base, pathName) {
  const root = String(base).replace(/\/$/, "");
  const suffix = pathName.startsWith("/") ? pathName : `/${pathName}`;
  if (root.endsWith("/v3") && suffix.startsWith("/v3/")) return `${root}${suffix.slice(3)}`;
  if (!root.endsWith("/v3") && !suffix.startsWith("/v3/")) return `${root}/v3${suffix}`;
  return `${root}${suffix}`;
}

function computeProviderIdempotencyKey({ acceptance_id, offer_id } = {}) {
  const material = `${acceptance_id || ""}|${offer_id || ""}|${PINNED_LEGAL_HASH}`;
  return `asaas-prod:${crypto.createHash("sha256").update(material).digest("hex").slice(0, 32)}`;
}

function computeCorrelationId({ acceptance_id } = {}) {
  return `corr_${crypto.createHash("sha256").update(String(acceptance_id || "")).digest("hex").slice(0, 24)}`;
}

function minimizeCreated(record) {
  if (!record) return null;
  return {
    id: record.provider_id || null,
    link: record.provider_link || null,
    kind: "checkout",
    offer_id: record.offer_id,
    status: record.provider_status || null,
    correlation_id: record.correlation_id || null,
    external_reference: record.external_reference || null,
  };
}

function mapProductionEvent(raw, context = {}) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid_event", event: commercialEvent({ type: TYPES.COMMERCIAL_EXCEPTION }) };
  }
  const providerEventId = raw.id || raw.event_id || null;
  if (!providerEventId) {
    return {
      ok: false,
      error: "event_id_missing",
      event: commercialEvent({ type: TYPES.COMMERCIAL_EXCEPTION, exception_code: "PROVIDER_EVENT_ID_MISSING" }),
    };
  }
  const officialEvent = String(raw.event || "").trim().toUpperCase();
  const offerId = context.offer_id || APPROVED_OFFER;
  const externalReference = (raw.payment && raw.payment.externalReference)
    || (raw.checkout && raw.checkout.externalReference)
    || context.external_reference
    || null;
  const amountCents = context.amount_cents
    || (raw.payment && raw.payment.value != null ? Math.round(Number(raw.payment.value) * 100) : APPROVED_AMOUNT_CENTS);

  let type = TYPES.PAYMENT_UNKNOWN;
  let canonical = "UNKNOWN";
  if (officialEvent === "CHECKOUT_CREATED") {
    type = TYPES.CHECKOUT_CREATED;
    canonical = "CREATED";
  } else if (officialEvent === "PAYMENT_CREATED") {
    type = TYPES.PAYMENT_CREATED;
    canonical = "CREATED";
  } else if (officialEvent === "PAYMENT_CONFIRMED") {
    type = TYPES.PAYMENT_CONFIRMED;
    canonical = "PAYMENT_CONFIRMED";
  } else if (officialEvent === "PAYMENT_RECEIVED") {
    type = TYPES.PAYMENT_RECEIVED;
    canonical = "PAYMENT_RECEIVED";
  } else if (officialEvent === "CHECKOUT_PAID") {
    type = TYPES.PAYMENT_PENDING;
    canonical = "PAYMENT_PENDING";
  } else if (officialEvent === "PAYMENT_OVERDUE") {
    type = TYPES.PAYMENT_OVERDUE;
    canonical = "PAYMENT_OVERDUE";
  } else if (officialEvent === "PAYMENT_REFUNDED" || officialEvent === "PAYMENT_PARTIALLY_REFUNDED") {
    type = TYPES.PAYMENT_REFUNDED;
    canonical = "PAYMENT_REFUNDED";
  } else if (officialEvent === "PAYMENT_CHARGEBACK_REQUESTED" || officialEvent === "PAYMENT_CHARGEBACK_DISPUTE") {
    type = TYPES.COMMERCIAL_EXCEPTION;
    canonical = "UNKNOWN";
  } else if (officialEvent === "PAYMENT_DELETED" || officialEvent === "CHECKOUT_CANCELED" || officialEvent === "CHECKOUT_EXPIRED") {
    type = TYPES.COMMERCIAL_EXCEPTION;
    canonical = "UNKNOWN";
  } else if (!officialEvent) {
    return { ok: false, error: "unknown_provider_status", event: commercialEvent({ type: TYPES.COMMERCIAL_EXCEPTION, exception_code: "UNKNOWN_PROVIDER_STATUS", provider_event_id: providerEventId }) };
  } else {
    type = TYPES.PAYMENT_UNKNOWN;
    canonical = "UNKNOWN";
  }

  const event = commercialEvent({
    event_id: `canon_${crypto.createHash("sha256").update(String(providerEventId)).digest("hex").slice(0, 16)}`,
    type,
    offer_id: offerId,
    terms_version: TERMS_VERSION,
    external_reference: externalReference,
    provider_event_id: providerEventId,
    provider_raw_status: officialEvent,
    canonical_status: canonical,
    amount_cents: amountCents,
  });
  if (type === TYPES.PAYMENT_CONFIRMED) {
    event.financial_confirmation = true;
    event.received_revenue = false;
    event.revenue = false;
    event.nfse_manual_queue = true;
  } else if (type === TYPES.PAYMENT_RECEIVED) {
    event.financial_confirmation = true;
    event.received_revenue = true;
    event.revenue = false;
    event.counsel_review_trigger = true;
  } else {
    event.financial_confirmation = false;
    event.received_revenue = false;
    event.revenue = false;
  }
  if (type === TYPES.COMMERCIAL_EXCEPTION && /CHARGEBACK/.test(officialEvent)) {
    event.exception_code = "CHARGEBACK";
  }
  return { ok: type !== TYPES.PAYMENT_UNKNOWN || officialEvent !== "", event, status: canonical };
}

function createAsaasProductionProvider(deps = {}) {
  const clock = deps.clock || { now: () => new Date() };
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const logger = deps.logger || { warn() {}, info() {} };
  const config = deps.config || resolveProductionConfig(deps.env || process.env);
  const store = deps.store;
  const http = deps.http;

  async function providerRequest({ method, pathName, body, retry = false }) {
    if (!http || !http.request) return { ok: false, error: "http_missing" };
    const urlCheck = assertProductionApiUrl(joinUrl(config.baseUrl, pathName));
    if (!urlCheck.ok) return { ok: false, error: urlCheck.error };
    try {
      const res = await http.request({
        method,
        url: urlCheck.url,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          access_token: config.apiKey,
          "user-agent": config.userAgent,
        },
        body: body || undefined,
        timeoutMs: config.timeoutMs,
      });
      if (retry && (!res || res.status >= 500)) {
        return providerRequest({ method, pathName, body, retry: false });
      }
      if (!res || res.status >= 400) {
        return { ok: false, error: "provider_http_error", status: res && res.status };
      }
      return { ok: true, body: res.body, status: res.status };
    } catch (err) {
      if (err && err.code === "ETIMEDOUT") return { ok: false, error: "timeout" };
      return { ok: false, error: "provider_request_failed" };
    }
  }

  async function findOrCreateCustomer({ cnpj, name, email, phone, externalReference }) {
    const mappingKey = `customer-cnpj:${String(cnpj).replace(/\D/g, "")}`;
    const mapped = store ? await store.get(mappingKey) : null;
    if (mapped && mapped.customer_id) return { ok: true, id: mapped.customer_id, reused: true };

    const listed = await providerRequest({
      method: "GET",
      pathName: `/v3/customers?cpfCnpj=${encodeURIComponent(cnpj)}`,
      retry: true,
    });
    if (listed.ok && listed.body && Array.isArray(listed.body.data) && listed.body.data[0] && listed.body.data[0].id) {
      if (store) await store.put(mappingKey, { customer_id: listed.body.data[0].id });
      return { ok: true, id: listed.body.data[0].id, reused: true };
    }
    if (listed.error === "timeout") return { ok: false, error: "timeout" };

    const created = await providerRequest({
      method: "POST",
      pathName: "/v3/customers",
      body: {
        name,
        cpfCnpj: cnpj,
        email,
        phone: phone || undefined,
        notificationDisabled: true,
        externalReference,
      },
    });
    if (created.error === "timeout") {
      const again = await providerRequest({
        method: "GET",
        pathName: `/v3/customers?cpfCnpj=${encodeURIComponent(cnpj)}`,
        retry: true,
      });
      if (again.ok && again.body && again.body.data && again.body.data[0]) {
        if (store) await store.put(mappingKey, { customer_id: again.body.data[0].id });
        return { ok: true, id: again.body.data[0].id, reused: true };
      }
      return { ok: false, error: "timeout" };
    }
    if (!created.ok || !created.body || !created.body.id) return { ok: false, error: "customer_create_failed" };
    if (store) await store.put(mappingKey, { customer_id: created.body.id });
    return { ok: true, id: created.body.id, reused: false };
  }

  async function createProductionCheckout(input = {}) {
    const runtime = requireProductionRuntime(config, { needApiKey: true });
    if (!runtime.ok) return runtime;
    if (!store) return { ok: false, error: "store_unavailable", statusCode: 503 };

    if (input.offer_id && input.offer_id !== APPROVED_OFFER) {
      return { ok: false, error: "offer_not_approved", statusCode: 422 };
    }
    if (input.chargeTypes && (input.chargeTypes.includes("RECURRENT") || input.chargeTypes.includes("INSTALLMENT"))) {
      return { ok: false, error: "recurring_blocked", statusCode: 422 };
    }
    if (input.billingTypes && input.billingTypes.includes("BOLETO")) {
      return { ok: false, error: "boleto_not_supported", statusCode: 422 };
    }
    if (input.amount_cents != null && Number(input.amount_cents) !== APPROVED_AMOUNT_CENTS) {
      return { ok: false, error: "price_tamper", statusCode: 422 };
    }
    if (input.currency && input.currency !== "BRL") {
      return { ok: false, error: "price_tamper", statusCode: 422 };
    }

    const offer = getOffer(APPROVED_OFFER);
    if (!offer || offer.amount_cents !== APPROVED_AMOUNT_CENTS) {
      return { ok: false, error: "offer_unknown", statusCode: 422 };
    }

    const accepted = await requireValidAcceptance(store, input.acceptance_id, {
      cnpj: input.cnpj,
      amount_cents: APPROVED_AMOUNT_CENTS,
      offer_id: APPROVED_OFFER,
    });
    if (!accepted.ok) return accepted;
    const acceptance = accepted.acceptance;

    const correlationId = input.correlation_id || computeCorrelationId({ acceptance_id: acceptance.acceptance_id });
    const idempotencyKey = computeProviderIdempotencyKey({
      acceptance_id: acceptance.acceptance_id,
      offer_id: APPROVED_OFFER,
    });
    const externalReference = `cfg:${crypto.createHash("sha256").update(acceptance.acceptance_id).digest("hex").slice(0, 24)}`.slice(0, 200);

    const origin = String(input.callback_origin || "https://confenge.com.br");
    const success = assertCallbackUrl(`${origin.replace(/\/$/, "")}/diagnostico-b2g-expansao/obrigado/`);
    const cancel = assertCallbackUrl(`${origin.replace(/\/$/, "")}/diagnostico-b2g-expansao/cancelado/`);
    const expired = assertCallbackUrl(`${origin.replace(/\/$/, "")}/diagnostico-b2g-expansao/expirado/`);
    if (!success.ok || !cancel.ok || !expired.ok) {
      return { ok: false, error: (success.error || cancel.error || expired.error), statusCode: 422 };
    }

    let amountReais;
    try {
      amountReais = centsToReais(offer.amount_cents);
    } catch {
      return { ok: false, error: "unsafe_amount", statusCode: 422 };
    }

    const reserved = await store.putIfAbsent(idempotencyKey, {
      kind: "checkout_reservation",
      environment: "production",
      status: "pending",
      offer_id: APPROVED_OFFER,
      acceptance_id: acceptance.acceptance_id,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
      external_reference: externalReference,
      amount_cents: APPROVED_AMOUNT_CENTS,
    });

    async function persistSuccess(record, { idempotent = false } = {}) {
      const event = commercialEvent({
        type: TYPES.CHECKOUT_CREATED,
        offer_id: APPROVED_OFFER,
        terms_version: TERMS_VERSION,
        external_reference: externalReference,
        provider_event_id: record.provider_id,
        provider_raw_status: record.provider_status || "CREATED",
        canonical_status: "CREATED",
        amount_cents: APPROVED_AMOUNT_CENTS,
      });
      event.financial_confirmation = false;
      event.received_revenue = false;
      event.revenue = false;
      const saved = {
        ...reserved.value,
        ...record,
        status: "created",
        environment: "production",
        event,
        offer_snapshot: snapshotOffer(offer),
        card_data_present: false,
      };
      await store.put(idempotencyKey, saved);
      if (store.appendCanonicalEvent) await store.appendCanonicalEvent(event);
      return {
        ok: true,
        idempotent,
        payment: false,
        revenue: false,
        received_revenue: false,
        environment: "production",
        correlation_id: correlationId,
        created: minimizeCreated(saved),
        event,
      };
    }

    if (!reserved.inserted && reserved.value && reserved.value.provider_id) {
      return {
        ok: true,
        idempotent: true,
        payment: false,
        revenue: false,
        environment: "production",
        correlation_id: reserved.value.correlation_id,
        created: minimizeCreated(reserved.value),
        event: reserved.value.event || null,
      };
    }

    const customer = await findOrCreateCustomer({
      cnpj: acceptance.cnpj,
      name: acceptance.representative_name,
      email: acceptance.email,
      externalReference,
    });
    if (!customer.ok) {
      return { ok: false, error: customer.error || "customer_failed", statusCode: customer.error === "timeout" ? 504 : 502 };
    }

    const payload = {
      billingTypes: ["PIX", "CREDIT_CARD"],
      chargeTypes: ["DETACHED"],
      minutesToExpire: config.minutesToExpire || 60,
      externalReference,
      callback: {
        successUrl: success.url,
        cancelUrl: cancel.url,
        expiredUrl: expired.url,
      },
      items: [{
        name: "Diagnostico B2G de Expansao",
        description: APPROVED_OFFER,
        quantity: 1,
        value: amountReais,
        imageBase64: PIXEL_PNG,
      }],
      customer: customer.id,
    };

    const providerResult = await providerRequest({ method: "POST", pathName: "/v3/checkouts", body: payload });
    if (providerResult.ok && providerResult.body && providerResult.body.id) {
      const link = providerResult.body.link
        || `https://asaas.com/checkoutSession/show?id=${providerResult.body.id}`;
      const linkCheck = assertProductionLinkUrl(link);
      if (!linkCheck.ok) return { ok: false, error: linkCheck.error, statusCode: 502 };
      return persistSuccess({
        provider_id: providerResult.body.id,
        provider_link: linkCheck.url,
        provider_status: providerResult.body.status || "ACTIVE",
        customer_id: customer.id,
      });
    }
    if (providerResult.error === "timeout") {
      return { ok: false, error: "timeout", statusCode: 504, idempotency_key: idempotencyKey };
    }
    logger.warn("asaas_production_create_failed", { error: providerResult && providerResult.error });
    return { ok: false, error: (providerResult && providerResult.error) || "provider_create_failed", statusCode: 502 };
  }

  function verifyProductionWebhook(rawHeaders) {
    const token = headerValue(rawHeaders, "asaas-access-token");
    if (!verifyWebhookToken(config, token)) {
      return { ok: false, error: "invalid_webhook_token" };
    }
    return { ok: true };
  }

  async function applyProductionWebhookEvent(mapped, raw) {
    if (!store) return { ok: false, error: "store_unavailable", statusCode: 503 };
    const event = mapped && mapped.event;
    if (!event || !event.provider_event_id) {
      return { ok: false, error: (mapped && mapped.error) || "event_id_missing", statusCode: 400 };
    }
    const processedKey = `processed:${event.provider_event_id}`;
    const existing = await store.get(processedKey);
    if (existing && existing.applied) {
      return {
        ok: true,
        duplicate: true,
        decision: existing.decision || { action: "idempotent" },
        event,
        object_status: existing.object_status || null,
      };
    }
    const objectId = objectIdFromPayload(raw);
    const current = objectId ? await store.get(`object:${objectId}`) : null;
    const decision = decideCanonicalTransition(current && current.canonical_status, mapped);
    if (store.appendCanonicalEvent) await store.appendCanonicalEvent(event);
    if (decision.apply && objectId) {
      await store.put(`object:${objectId}`, {
        kind: "payment_object",
        environment: "production",
        canonical_status: decision.next,
        event,
      });
    }
    const applied = {
      kind: "processed_provider_event",
      environment: "production",
      applied: true,
      decision,
      object_status: decision.next,
      event,
    };
    await store.putIfAbsent(processedKey, applied);
    await store.put(processedKey, applied);
    return { ok: true, duplicate: false, decision, event, object_status: decision.next };
  }

  return {
    createProductionCheckout,
    mapProductionEvent,
    verifyProductionWebhook,
    applyProductionWebhookEvent,
    findOrCreateCustomer,
    computeProviderIdempotencyKey,
    redactProviderPayload,
    config,
    store,
  };
}

module.exports = {
  createAsaasProductionProvider,
  mapProductionEvent,
  centsToReais,
  computeProviderIdempotencyKey,
};
