/**
 * Injectable Asaas Sandbox provider. No production host, no real money.
 * HTTP, clock, store and config are injected so contract tests never touch the network.
 */
const crypto = require("crypto");
const { AUTHORITY, getOffer, snapshotOffer } = require("../registry.cjs");
const { buildExternalReference } = require("../external-reference.cjs");
const { commercialEvent, TYPES, normalizeStatus } = require("../events.cjs");
const { decideCapacity, emptyInventory } = require("../capacity.cjs");
const { evaluateEligibility } = require("../eligibility.cjs");
const { redactProviderPayload } = require("./redact.cjs");
const {
  resolveConfig,
  requireSandboxRuntime,
  assertSandboxApiUrl,
  assertSandboxLinkUrl,
  isProductionHost,
  hostnameOf,
} = require("./config.cjs");
const { matchFixture, loadAllowlist, isSandboxTestPayload } = require("./fixtures.cjs");
const { decideCanonicalTransition, objectIdFromPayload } = require("./status-machine.cjs");

const PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const CALLBACK_HOST_ALLOW = new Set(["example.com"]);
const OFFICIAL_PAYMENT_EVENTS = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_AUTHORIZED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_ANTICIPATED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_REFUND_DENIED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_DUNNING_RECEIVED",
  "PAYMENT_BANK_SLIP_CANCELLED",
  "PAYMENT_DUNNING_REQUESTED",
  "PAYMENT_BANK_SLIP_VIEWED",
  "PAYMENT_CHECKOUT_VIEWED",
  "PAYMENT_SPLIT_CANCELLED",
  "PAYMENT_SPLIT_DIVERGENCE_BLOCK",
  "PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED",
]);
const OFFICIAL_CHECKOUT_EVENTS = new Set([
  "CHECKOUT_CREATED",
  "CHECKOUT_CANCELED",
  "CHECKOUT_EXPIRED",
  "CHECKOUT_PAID",
]);

function computeProviderIdempotencyKey({ correlation_id, offer_id, catalog_version } = {}) {
  const material = `${correlation_id || ""}|${offer_id || ""}|${catalog_version || AUTHORITY.authority_version}`;
  return `asaas-sbx:${crypto.createHash("sha256").update(material).digest("hex").slice(0, 32)}`;
}

function computeCorrelationId({ offer_id, catalog_version, fixture_id } = {}) {
  const material = `${offer_id || ""}|${catalog_version || AUTHORITY.authority_version}|${fixture_id || "default"}`;
  return `corr_${crypto.createHash("sha256").update(material).digest("hex").slice(0, 24)}`;
}

function resolveBillingShape(offer) {
  if (!offer) return { ok: false, error: "offer_unknown" };
  if (offer.checkout_mode === "detached" && offer.billing_mode === "one_time") {
    return { ok: true, operation: "checkout", chargeType: "DETACHED" };
  }
  if (
    offer.billing_mode === "subscription"
    && offer.cycle === "MONTHLY"
    && Number.isInteger(offer.max_payments)
    && offer.max_payments > 0
  ) {
    return { ok: true, operation: "subscription", cycle: "MONTHLY", maxPayments: offer.max_payments };
  }
  return { ok: false, error: "UNSUPPORTED_OFFER_BILLING_SHAPE" };
}

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

function itemName(offer) {
  const raw = String(offer.public_name || offer.offer_id).replace(/CONFENGE\s*-\s*/i, "");
  return raw.slice(0, 30);
}

function joinUrl(base, pathName) {
  const root = String(base).replace(/\/$/, "");
  const suffix = pathName.startsWith("/") ? pathName : `/${pathName}`;
  if (root.endsWith("/v3") && suffix.startsWith("/v3/")) {
    return `${root}${suffix.slice(3)}`;
  }
  if (!root.endsWith("/v3") && !suffix.startsWith("/v3/")) {
    return `${root}/v3${suffix}`;
  }
  return `${root}${suffix}`;
}

function mapProviderEventToCanonicalEvent(raw, context = {}) {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      error: "invalid_event",
      status: "UNKNOWN",
      event: commercialEvent({
        synthetic: true,
        type: TYPES.COMMERCIAL_EXCEPTION,
        exception_code: "INVALID_PROVIDER_EVENT",
        offer_id: context.offer_id,
      }),
    };
  }
  const providerEventId = raw.id || raw.event_id || null;
  if (!providerEventId) {
    return {
      ok: false,
      error: "event_id_missing",
      status: "UNKNOWN",
      event: commercialEvent({
        synthetic: true,
        type: TYPES.COMMERCIAL_EXCEPTION,
        exception_code: "PROVIDER_EVENT_ID_MISSING",
        offer_id: context.offer_id,
        provider_raw_status: raw.event || raw.status || null,
      }),
    };
  }
  const officialEvent = String(raw.event || "").trim().toUpperCase();
  const rawStatus = raw.payment && raw.payment.status
    ? raw.payment.status
    : (raw.checkout && raw.checkout.status) || raw.status || officialEvent;
  const offerId = context.offer_id
    || (raw.payment && raw.payment.externalReference && String(raw.payment.externalReference).split(":")[1])
    || (raw.checkout && raw.checkout.externalReference && String(raw.checkout.externalReference).split(":")[1])
    || null;
  const externalReference = (raw.payment && raw.payment.externalReference)
    || (raw.checkout && raw.checkout.externalReference)
    || context.external_reference
    || null;
  const amountCents = context.amount_cents
    || (raw.payment && raw.payment.value != null ? Math.round(Number(raw.payment.value) * 100) : null);

  const knownOfficial = OFFICIAL_PAYMENT_EVENTS.has(officialEvent) || OFFICIAL_CHECKOUT_EVENTS.has(officialEvent);
  if (officialEvent && !knownOfficial) {
    return {
      ok: false,
      error: "unknown_provider_status",
      status: "UNKNOWN",
      exception: true,
      event: commercialEvent({
        synthetic: true,
        type: TYPES.COMMERCIAL_EXCEPTION,
        exception_code: "UNKNOWN_PROVIDER_STATUS",
        offer_id: offerId,
        provider_event_id: providerEventId,
        provider_raw_status: officialEvent || rawStatus,
        external_reference: externalReference,
        amount_cents: amountCents,
        occurred_at: raw.dateCreated ? new Date(raw.dateCreated.replace(" ", "T") + "Z").toISOString() : undefined,
      }),
    };
  }

  let type = TYPES.PAYMENT_UNKNOWN;
  let canonical = normalizeStatus(rawStatus || officialEvent);
  if (officialEvent === "CHECKOUT_CREATED" || officialEvent === "PAYMENT_CREATED") {
    type = officialEvent === "CHECKOUT_CREATED" ? TYPES.CHECKOUT_CREATED : TYPES.PAYMENT_CREATED;
    canonical = officialEvent === "CHECKOUT_CREATED" ? "CREATED" : "CREATED";
  } else if (officialEvent === "PAYMENT_CONFIRMED" || officialEvent === "PAYMENT_RECEIVED" || officialEvent === "CHECKOUT_PAID") {
    type = TYPES.PAYMENT_RECEIVED;
    canonical = "PAYMENT_RECEIVED";
  } else if (officialEvent === "PAYMENT_OVERDUE") {
    type = TYPES.PAYMENT_OVERDUE;
    canonical = "PAYMENT_OVERDUE";
  } else if (officialEvent === "PAYMENT_REFUNDED" || officialEvent === "PAYMENT_PARTIALLY_REFUNDED") {
    type = TYPES.PAYMENT_REFUNDED;
    canonical = "PAYMENT_REFUNDED";
  } else if (
    officialEvent === "PAYMENT_DELETED"
    || officialEvent === "CHECKOUT_CANCELED"
    || officialEvent === "CHECKOUT_EXPIRED"
  ) {
    type = TYPES.COMMERCIAL_EXCEPTION;
    canonical = "UNKNOWN";
  } else if (
    officialEvent === "PAYMENT_AWAITING_RISK_ANALYSIS"
    || officialEvent === "PAYMENT_AUTHORIZED"
    || officialEvent === "PAYMENT_UPDATED"
    || officialEvent === "PAYMENT_REFUND_IN_PROGRESS"
    || canonical === "PAYMENT_PENDING"
  ) {
    type = TYPES.PAYMENT_PENDING;
    canonical = "PAYMENT_PENDING";
  } else if (knownOfficial) {
    type = TYPES.PAYMENT_UNKNOWN;
    canonical = "UNKNOWN";
  } else {
    return {
      ok: false,
      error: "unknown_provider_status",
      status: "UNKNOWN",
      exception: true,
      event: commercialEvent({
        synthetic: true,
        type: TYPES.COMMERCIAL_EXCEPTION,
        exception_code: "UNKNOWN_PROVIDER_STATUS",
        offer_id: offerId,
        provider_event_id: providerEventId,
        provider_raw_status: officialEvent || rawStatus,
        external_reference: externalReference,
        amount_cents: amountCents,
      }),
    };
  }

  const event = commercialEvent({
    synthetic: true,
    event_id: `canon_${crypto.createHash("sha256").update(String(providerEventId)).digest("hex").slice(0, 16)}`,
    type,
    offer_id: offerId,
    offer_version: context.offer_version || null,
    terms_version: context.terms_version || null,
    external_reference: externalReference,
    provider_event_id: providerEventId,
    provider_raw_status: officialEvent || rawStatus,
    canonical_status: canonical,
    amount_cents: amountCents,
    occurred_at: raw.dateCreated ? new Date(String(raw.dateCreated).replace(" ", "T") + "Z").toISOString() : undefined,
    exception_code: type === TYPES.COMMERCIAL_EXCEPTION ? officialEvent || "PROVIDER_CANCELLED" : null,
  });
  if (type === TYPES.CHECKOUT_CREATED || type === TYPES.PAYMENT_CREATED || type === TYPES.PAYMENT_PENDING) {
    event.financial_confirmation = false;
    event.revenue = false;
  }
  return { ok: true, event, status: canonical };
}

function verifySandboxWebhook(rawHeaders, config) {
  const { headerValue, verifyWebhookToken } = require("./config.cjs");
  const token = headerValue(rawHeaders, "asaas-access-token");
  if (!verifyWebhookToken(config, token)) {
    return { ok: false, error: "invalid_webhook_token" };
  }
  return { ok: true };
}

async function applySandboxWebhookEvent(store, mapped, raw) {
  if (!store) return { ok: false, error: "store_unavailable", statusCode: 503 };
  const event = mapped && mapped.event;
  if (!event || !event.provider_event_id) {
    return { ok: false, error: (mapped && mapped.error) || "event_id_missing", statusCode: 400 };
  }
  const providerEventId = event.provider_event_id;
  const processedKey = `processed:${providerEventId}`;
  const existing = await store.get(processedKey);
  if (existing && existing.applied) {
    return {
      ok: true,
      duplicate: true,
      inserted: false,
      decision: existing.decision || { action: "idempotent", reason: "already_applied" },
      event,
      object_status: existing.object_status || null,
    };
  }

  if (!existing) {
    const reserved = await store.markProviderEventProcessed(providerEventId, {
      applied: false,
      event_type: event.type,
      offer_id: event.offer_id,
      correlation_id: event.external_reference,
    });
    if (!reserved.inserted && reserved.value && reserved.value.applied) {
      return {
        ok: true,
        duplicate: true,
        inserted: false,
        decision: reserved.value.decision || { action: "idempotent", reason: "already_applied" },
        event,
        object_status: reserved.value.object_status || null,
      };
    }
  }

  const objectId = objectIdFromPayload(raw);
  const objectKey = objectId ? `object:${objectId}` : null;
  const current = objectKey ? await store.get(objectKey) : null;
  const decision = decideCanonicalTransition(current && current.canonical_status, mapped);

  if (store.appendCanonicalEvent) {
    await store.appendCanonicalEvent({
      ...event,
      transition: decision.action,
      transition_reason: decision.reason,
    });
  }

  if (decision.apply && objectKey) {
    await store.put(objectKey, {
      kind: "sandbox_payment_object",
      environment: "sandbox",
      object_id: objectId,
      canonical_status: decision.next,
      last_provider_event_id: providerEventId,
      offer_id: event.offer_id,
    });
  }

  const completed = {
    kind: "processed_provider_event",
    environment: "sandbox",
    provider_event_id: providerEventId,
    applied: true,
    event_type: event.type,
    offer_id: event.offer_id,
    correlation_id: event.external_reference,
    decision,
    object_status: decision.next || (current && current.canonical_status) || null,
  };
  await store.put(processedKey, completed);

  return {
    ok: mapped.ok !== false,
    duplicate: false,
    inserted: true,
    decision,
    event,
    object_status: completed.object_status,
  };
}

function createDefaultHttp({ config, logger, clock, circuit }) {
  const state = circuit || { failures: 0, openUntil: 0 };
  return {
    async request({ method, url, headers, body, timeoutMs }) {
      const now = (clock && clock.now ? clock.now() : new Date()).getTime();
      if (state.openUntil && now < state.openUntil) {
        const err = new Error("circuit_open");
        err.code = "CIRCUIT_OPEN";
        throw err;
      }
      const checked = assertSandboxApiUrl(url);
      if (!checked.ok) {
        const err = new Error(checked.error);
        err.code = checked.error;
        throw err;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs || config.timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body == null ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
          redirect: "manual",
          signal: ctrl.signal,
        });
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (location && isProductionHost(hostnameOf(location))) {
            const err = new Error("production_redirect_blocked");
            err.code = "PRODUCTION_REDIRECT_BLOCKED";
            throw err;
          }
          const locCheck = location ? assertSandboxApiUrl(location) : { ok: false, error: "redirect_not_allowlisted" };
          if (!locCheck.ok) {
            const err = new Error(locCheck.error || "redirect_not_allowlisted");
            err.code = "REDIRECT_BLOCKED";
            throw err;
          }
        }
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        state.failures = 0;
        state.openUntil = 0;
        return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: json, text };
      } catch (err) {
        if (err && err.code === "PRODUCTION_REDIRECT_BLOCKED") throw err;
        state.failures += 1;
        if (state.failures >= (config.circuitThreshold || 5)) {
          state.openUntil = now + (config.circuitCooldownMs || 30000);
        }
        if (err && (err.name === "AbortError" || err.code === "ABORT_ERR")) {
          const timeout = new Error("timeout");
          timeout.code = "ETIMEDOUT";
          throw timeout;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function createAsaasSandboxProvider(deps = {}) {
  const clock = deps.clock || { now: () => new Date() };
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const logs = deps.logs || [];
  const logger = deps.logger || {
    info: (msg, extra) => logs.push({ level: "info", msg, extra: redactProviderPayload(extra) }),
    warn: (msg, extra) => logs.push({ level: "warn", msg, extra: redactProviderPayload(extra) }),
    error: (msg, extra) => logs.push({ level: "error", msg, extra: redactProviderPayload(extra) }),
  };
  const config = deps.config || resolveConfig(deps.env || process.env);
  const store = deps.store;
  const fixtures = deps.fixtures || loadAllowlist();
  const outbound = [];
  const circuit = deps.circuit || { failures: 0, openUntil: 0 };
  const http = deps.http || createDefaultHttp({ config, logger, clock, circuit });

  async function providerRequest({ method, pathName, body, retry = false }) {
    if (!config.ok) return { ok: false, error: config.error };
    const url = joinUrl(config.baseUrl, pathName);
    const checked = assertSandboxApiUrl(url);
    if (!checked.ok) return { ok: false, error: checked.error === "production_host_blocked" ? "production_base_url_blocked" : checked.error };
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "User-Agent": config.userAgent,
      access_token: config.apiKey,
    };
    outbound.push({ method, url, path: pathName });
    logger.info("asaas_sandbox_request", { method, url, path: pathName, environment: "sandbox" });
    const exec = async () => http.request({
      method,
      url,
      headers,
      body: method === "GET" ? undefined : body,
      timeoutMs: config.timeoutMs,
    });
    try {
      let res;
      try {
        res = await exec();
      } catch (err) {
        if (retry && method === "GET") {
          res = await exec();
        } else {
          throw err;
        }
      }
      if (res && res.status >= 300 && res.status < 400) {
        const location = res.headers && (res.headers.location || res.headers.Location);
        if (location && isProductionHost(hostnameOf(location))) {
          return { ok: false, error: "production_redirect_blocked" };
        }
        return { ok: false, error: "redirect_not_allowlisted" };
      }
      return { ok: true, status: res.status, body: res.body, text: res.text };
    } catch (err) {
      const code = err && err.code;
      if (code === "PRODUCTION_REDIRECT_BLOCKED" || /production_redirect/i.test(String(err && err.message))) {
        return { ok: false, error: "production_redirect_blocked" };
      }
      if (code === "ETIMEDOUT" || code === "ABORT_ERR") {
        return { ok: false, error: "timeout", sent: true };
      }
      if (code === "CIRCUIT_OPEN") return { ok: false, error: "circuit_open" };
      if (code === "production_host_blocked" || code === "production_base_url_blocked") {
        return { ok: false, error: "production_base_url_blocked" };
      }
      return { ok: false, error: code || "provider_request_failed" };
    }
  }

  async function getSandboxPayment({ kind, id, externalReference } = {}) {
    if (id && kind === "checkout") {
      return providerRequest({ method: "GET", pathName: `/v3/checkouts/${encodeURIComponent(id)}`, retry: true });
    }
    if (id && kind === "subscription") {
      return providerRequest({ method: "GET", pathName: `/v3/subscriptions/${encodeURIComponent(id)}`, retry: true });
    }
    if (id) {
      return providerRequest({ method: "GET", pathName: `/v3/payments/${encodeURIComponent(id)}`, retry: true });
    }
    if (externalReference && kind === "checkout") {
      return providerRequest({
        method: "GET",
        pathName: `/v3/checkouts?externalReference=${encodeURIComponent(externalReference)}`,
        retry: true,
      });
    }
    if (externalReference) {
      return providerRequest({
        method: "GET",
        pathName: `/v3/subscriptions?externalReference=${encodeURIComponent(externalReference)}`,
        retry: true,
      });
    }
    return { ok: false, error: "lookup_missing" };
  }

  async function findOrCreateCustomer(fixture, externalReference) {
    const listed = await providerRequest({
      method: "GET",
      pathName: `/v3/customers?cpfCnpj=${encodeURIComponent(fixture.cpfCnpj)}`,
      retry: true,
    });
    if (listed.ok && listed.body && Array.isArray(listed.body.data) && listed.body.data[0] && listed.body.data[0].id) {
      return { ok: true, id: listed.body.data[0].id, reused: true };
    }
    const created = await providerRequest({
      method: "POST",
      pathName: "/v3/customers",
      body: {
        name: fixture.name,
        cpfCnpj: fixture.cpfCnpj,
        email: fixture.email,
        phone: fixture.phone,
        notificationDisabled: true,
        externalReference: `cfg-sbx:${fixture.fixture_id}`,
      },
    });
    if (!created.ok) return created;
    if (!created.body || !created.body.id) return { ok: false, error: "customer_create_failed" };
    return { ok: true, id: created.body.id, reused: false };
  }

  async function createSandboxCheckout(input = {}) {
    const runtime = requireSandboxRuntime(config, { needApiKey: true });
    if (!runtime.ok) return runtime;
    if (!store) return { ok: false, error: "store_unavailable", statusCode: 503 };

    const offer = getOffer(input.offer_id);
    if (!offer) return { ok: false, error: "offer_unknown", statusCode: 422 };
    const shape = resolveBillingShape(offer);
    if (!shape.ok) return { ok: false, error: shape.error, statusCode: 422 };

    if (!isSandboxTestPayload(input) && !input.fixture_id) {
      return { ok: false, error: "sandbox_test_required", statusCode: 422 };
    }
    const allowed = matchFixture(input, fixtures);
    if (!allowed.ok) return { ok: false, error: allowed.error, statusCode: 422 };
    const fixture = allowed.fixture;

    const inventory = input.inventory || emptyInventory(clock.now());
    const capacity = decideCapacity({ offer, inventory, now: clock.now() });
    if (capacity.status !== "APPROVED") {
      return { ok: false, error: "capacity_not_approved", status: capacity.status, reason: capacity.reason, statusCode: 422 };
    }
    const eligibility = evaluateEligibility({
      cnpj: fixture.cpfCnpj,
      representante: fixture.representante || input.representante,
      offerId: offer.offer_id,
      targetContract: fixture.target_contract || input.target_contract,
      startDate: fixture.start_date || input.start_date,
      inventory: emptyInventory(clock.now()),
      now: clock.now(),
    });
    if (!eligibility.ok || eligibility.status !== "APPROVED") {
      return { ok: false, error: eligibility.error || "eligibility_rejected", status: eligibility.status, statusCode: 422 };
    }

    const catalogVersion = AUTHORITY.authority_version;
    const correlationId = input.correlation_id || computeCorrelationId({
      offer_id: offer.offer_id,
      catalog_version: catalogVersion,
      fixture_id: fixture.fixture_id,
    });
    const idempotencyKey = computeProviderIdempotencyKey({
      correlation_id: correlationId,
      offer_id: offer.offer_id,
      catalog_version: catalogVersion,
    });
    const referenceCheck = buildExternalReference(offer.offer_id, correlationId);
    if (!referenceCheck.ok) {
      return { ok: false, error: referenceCheck.error || "external_reference_invalid", statusCode: 422 };
    }
    const externalReference = referenceCheck.external_reference;

    let amountReais;
    try {
      amountReais = centsToReais(offer.amount_cents);
    } catch {
      return { ok: false, error: "unsafe_amount", statusCode: 422 };
    }

    const reserved = await store.putIfAbsent(idempotencyKey, {
      kind: "checkout_reservation",
      environment: "sandbox",
      status: "pending",
      offer_id: offer.offer_id,
      offer_version: offer.offer_version,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
      external_reference: externalReference,
      operation: shape.operation,
      amount_cents: offer.amount_cents,
      fixture_id: fixture.fixture_id,
    });
    const baseRecord = reserved.value;

    async function persistSuccess(record, { idempotent = false } = {}) {
      const event = commercialEvent({
        synthetic: true,
        type: TYPES.CHECKOUT_CREATED,
        offer_id: offer.offer_id,
        offer_version: offer.offer_version,
        terms_version: input.terms_version || null,
        external_reference: externalReference,
        provider_event_id: record.provider_id,
        provider_raw_status: record.provider_status || "CREATED",
        amount_cents: offer.amount_cents,
      });
      event.financial_confirmation = false;
      event.revenue = false;
      const saved = {
        ...baseRecord,
        ...record,
        status: "created",
        environment: "sandbox",
        event,
        offer_snapshot: snapshotOffer(offer),
      };
      await store.put(idempotencyKey, saved);
      if (store.appendCanonicalEvent) await store.appendCanonicalEvent(event);
      return {
        ok: true,
        idempotent,
        payment: false,
        revenue: false,
        environment: "sandbox",
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
        created: minimizeCreated(saved),
        event,
      };
    }

    async function reconcileExisting() {
      const reconciled = await getSandboxPayment({
        kind: shape.operation,
        externalReference,
      });
      const found = extractProviderObject(reconciled);
      if (!found || !found.id) return null;
      const linkCheck = found.link ? assertSandboxLinkUrl(found.link) : { ok: true, url: null };
      if (!linkCheck.ok) return { ok: false, error: linkCheck.error, statusCode: 502 };
      return persistSuccess({
        provider_id: found.id,
        provider_link: linkCheck.url,
        provider_status: found.status || "ACTIVE",
        kind: shape.operation,
        reconciled: true,
      }, { idempotent: true });
    }

    if (!reserved.inserted) {
      const existing = reserved.value;
      if (existing && existing.provider_id) {
        return {
          ok: true,
          idempotent: true,
          payment: false,
          revenue: false,
          environment: "sandbox",
          correlation_id: existing.correlation_id,
          idempotency_key: idempotencyKey,
          created: minimizeCreated(existing),
          event: existing.event || null,
        };
      }
      const recovered = await reconcileExisting();
      if (recovered) return recovered;
      for (let i = 0; i < 8; i += 1) {
        await sleep(15);
        const again = await store.get(idempotencyKey);
        if (again && again.provider_id) {
          return {
            ok: true,
            idempotent: true,
            payment: false,
            revenue: false,
            environment: "sandbox",
            correlation_id: again.correlation_id,
            idempotency_key: idempotencyKey,
            created: minimizeCreated(again),
            event: again.event || null,
          };
        }
      }
      return {
        ok: true,
        idempotent: true,
        pending: true,
        payment: false,
        revenue: false,
        environment: "sandbox",
        correlation_id: existing && existing.correlation_id,
        idempotency_key: idempotencyKey,
        created: existing ? minimizeCreated(existing) : null,
      };
    }

    let providerResult;
    if (shape.operation === "checkout") {
      const payload = {
        billingTypes: ["PIX", "CREDIT_CARD"],
        chargeTypes: ["DETACHED"],
        minutesToExpire: 60,
        externalReference,
        callback: {
          successUrl: "https://example.com/asaas/sandbox/success",
          cancelUrl: "https://example.com/asaas/sandbox/cancel",
          expiredUrl: "https://example.com/asaas/sandbox/expired",
        },
        items: [{
          name: itemName(offer),
          description: offer.offer_id,
          quantity: 1,
          value: amountReais,
          imageBase64: PIXEL_PNG,
        }],
        customerData: {
          name: fixture.name,
          cpfCnpj: fixture.cpfCnpj,
          email: fixture.email,
          phone: fixture.phone,
        },
      };
      providerResult = await providerRequest({ method: "POST", pathName: "/v3/checkouts", body: payload });
      if (providerResult.ok && providerResult.body && providerResult.body.id) {
        const linkCheck = assertSandboxLinkUrl(providerResult.body.link);
        if (!linkCheck.ok) return { ok: false, error: linkCheck.error, statusCode: 502 };
        return persistSuccess({
          provider_id: providerResult.body.id,
          provider_link: linkCheck.url,
          provider_status: providerResult.body.status || "ACTIVE",
          kind: "checkout",
        });
      }
    } else {
      const customer = await findOrCreateCustomer(fixture, externalReference);
      if (!customer.ok) {
        if (customer.error === "timeout") {
          return { ok: false, error: "timeout", idempotency_key: idempotencyKey, statusCode: 504 };
        }
        return { ok: false, error: customer.error || "customer_failed", statusCode: 502 };
      }
      const due = fixture.start_date || isoDate(clock.now());
      providerResult = await providerRequest({
        method: "POST",
        pathName: "/v3/subscriptions",
        body: {
          customer: customer.id,
          billingType: "UNDEFINED",
          value: amountReais,
          nextDueDate: due,
          cycle: "MONTHLY",
          maxPayments: shape.maxPayments,
          description: itemName(offer),
          externalReference,
        },
      });
      if (providerResult.ok && providerResult.body && providerResult.body.id) {
        return persistSuccess({
          provider_id: providerResult.body.id,
          provider_link: null,
          provider_status: providerResult.body.status || "ACTIVE",
          kind: "subscription",
          customer_id: customer.id,
          max_payments: shape.maxPayments,
        });
      }
    }

    if (providerResult && providerResult.error === "timeout") {
      const recovered = await reconcileExisting();
      if (recovered) return recovered;
      return { ok: false, error: "timeout", idempotency_key: idempotencyKey, statusCode: 504 };
    }

    logger.warn("asaas_sandbox_create_failed", { error: providerResult && providerResult.error, status: providerResult && providerResult.status });
    return {
      ok: false,
      error: (providerResult && providerResult.error) || "provider_create_failed",
      statusCode: 502,
      idempotency_key: idempotencyKey,
    };
  }

  return {
    createSandboxCheckout,
    getSandboxPayment,
    verifySandboxWebhook: (headers) => verifySandboxWebhook(headers, config),
    mapProviderEventToCanonicalEvent,
    applySandboxWebhookEvent,
    computeProviderIdempotencyKey,
    computeCorrelationId,
    redactProviderPayload,
    resolveBillingShape,
    outbound,
    logs,
    config,
    store,
  };
}

function minimizeCreated(record) {
  if (!record) return null;
  return {
    id: record.provider_id || null,
    link: record.provider_link || null,
    kind: record.kind || record.operation || null,
    offer_id: record.offer_id,
    status: record.provider_status || record.status || null,
    correlation_id: record.correlation_id,
    external_reference: record.external_reference,
    max_payments: record.max_payments || null,
  };
}

function extractProviderObject(result) {
  if (!result || !result.ok || !result.body) return null;
  if (result.body.id) return result.body;
  if (Array.isArray(result.body.data) && result.body.data[0]) return result.body.data[0];
  return null;
}

function isoDate(now) {
  const d = now instanceof Date ? now : new Date(now);
  return d.toISOString().slice(0, 10);
}

module.exports = {
  PIXEL_PNG,
  CALLBACK_HOST_ALLOW,
  OFFICIAL_PAYMENT_EVENTS,
  OFFICIAL_CHECKOUT_EVENTS,
  computeProviderIdempotencyKey,
  computeCorrelationId,
  resolveBillingShape,
  mapProviderEventToCanonicalEvent,
  applySandboxWebhookEvent,
  verifySandboxWebhook,
  redactProviderPayload,
  createAsaasSandboxProvider,
  createDefaultHttp,
  centsToReais,
  decideCanonicalTransition,
  objectIdFromPayload,
};
