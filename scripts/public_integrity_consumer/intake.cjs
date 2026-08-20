"use strict";

const crypto = require("crypto");
const { validateCnpj, assertNoCnpjInUrl } = require("../conversion/cnpj.cjs");
const { ASSET, TOKEN_TTL_SECONDS, STORE_TTL_SECONDS } = require("./constants.cjs");
const { flagEnabled, prepareMode, loadFlag } = require("./flag.cjs");
const { consumeEnvelope } = require("./consume.cjs");
const { mapPublicView } = require("./map.cjs");
const { loadEnvelope } = require("./fixtures.cjs");
const { mintToken, mintCorrelationId, tokenLooksOpaque, expiresAt, isExpired } = require("./token.cjs");
const { attributionEvent } = require("./attribution.cjs");
const { redactLog, scanCnpjLeaks, stripCnpjKeys } = require("./privacy.cjs");
const { resultHtml } = require("./render.cjs");
const copyMod = require("./copy.cjs");

function honeypot(data) {
  const hp = data && (data["empresa-site"] || data.bot_field || data.website || data.fax);
  return Boolean(hp && String(hp).trim());
}

function resultUrl(token) {
  return `${ASSET.result_path}?t=${encodeURIComponent(token)}`;
}

function idempotencyKey(explicit, eventId) {
  if (explicit) {
    let e = String(explicit).trim();
    if (e.toLowerCase().startsWith("idk:")) e = e.slice(4);
    e = e.slice(0, 120);
    if (e) return `idk:${e}`;
  }
  if (eventId) {
    return `evt:${String(eventId).slice(0, 120)}`;
  }
  return null;
}

function unknownBody({ error, message, reason_codes, view }) {
  const c = copyMod.journeyCopy();
  return {
    ok: false,
    error: error || "unknown",
    message: message || "Nao foi possivel concluir a leitura.",
    aggregate_state: (view && view.aggregate_state) || "UNKNOWN",
    coverage_class: (view && view.coverage_class) || "unknown",
    view: view || null,
    empty_success: false,
    reason_codes: reason_codes || [error || "unknown"],
    copy: { next_action: c.next_action_unknown, method: c.method },
    not_legal_conclusion: true,
  };
}

function publicConsultBody({ token, view, idempotent, correlation_id, event }) {
  const url = resultUrl(token);
  return {
    ok: true,
    token,
    result_url: url,
    correlation_id,
    idempotent: Boolean(idempotent),
    aggregate_state: view.aggregate_state,
    coverage_class: view.coverage_class,
    view,
    empty_success: false,
    not_legal_conclusion: true,
    attribution: event,
  };
}

async function lookupExisting(store, idemKey) {
  if (!store || !idemKey) return null;
  if (store.getByIdempotency) {
    const byIdem = await store.getByIdempotency(idemKey);
    if (byIdem) return byIdem;
  }
  return null;
}

function loadFixtureEnvelope(body) {
  const id = String((body && (body.fixture_id || body.fixture)) || "empty-complete");
  const env = loadEnvelope(id);
  if (!env) return { ok: false, error: "fixture_unknown" };
  return { ok: true, envelope: env, fixture_id: id };
}

async function handleConsult({ store, body, env, now } = {}) {
  const data = body && typeof body === "object" ? body : {};
  const clock = now || new Date();
  const logs = [];
  const runtimeEnv = env || process.env;

  if (!prepareMode(runtimeEnv) && !flagEnabled(runtimeEnv)) {
    return {
      statusCode: 404,
      headers: { Location: undefined },
      body: unknownBody({ error: "flag_off", message: "Consulta indisponivel." }),
      logs,
    };
  }

  if (honeypot(data)) {
    return {
      statusCode: 200,
      body: { ok: true, status: "suppressed", auto_send: false, empty_success: false },
      logs,
    };
  }

  const checked = validateCnpj(data.cnpj || data.cnpj14);
  if (!checked.ok) {
    const view = mapPublicView({
      ok: false,
      error: "invalid_cnpj",
      reason_codes: ["invalid_cnpj"],
      envelope: null,
    });
    const bodyOut = unknownBody({
      error: "invalid_cnpj",
      message: checked.message || "CNPJ invalido.",
      reason_codes: ["invalid_cnpj"],
      view,
    });
    const leak = scanCnpjLeaks(bodyOut, data.cnpj || data.cnpj14);
    if (leak.length) {
      return {
        statusCode: 500,
        body: unknownBody({ error: "pii_leak_blocked", reason_codes: ["pii_leak_blocked"] }),
        logs,
      };
    }
    logs.push({ event: "invalid_cnpj", fields: redactLog({ error: "invalid_cnpj" }, { cnpj: data.cnpj }) });
    return { statusCode: 400, body: bodyOut, logs };
  }

  if (!store) {
    const view = mapPublicView({ ok: false, error: "store_unavailable", reason_codes: ["store_unavailable"] });
    return {
      statusCode: 503,
      body: unknownBody({ error: "store_unavailable", message: "Servico temporariamente indisponivel.", view }),
      logs,
    };
  }

  const correlation_id = String(data.correlation_id || mintCorrelationId()).slice(0, 80);
  const eventId = data.event_id || data.request_id || data.idempotency_key || data.idempotencyKey;
  const idemKey = idempotencyKey(data.idempotency_key || data.idempotencyKey, eventId);

  try {
    if (idemKey) {
      const existing = await lookupExisting(store, idemKey);
      if (existing && existing.view) {
        const event = attributionEvent({
          eventName: "public_integrity_replay",
          aggregate_state: existing.view.aggregate_state,
          coverage_class: existing.view.coverage_class,
          correlation_id: existing.correlation_id || correlation_id,
          session_id: existing.session_id,
          event_id: idemKey,
          flag: flagEnabled(runtimeEnv) ? "on" : "off",
        });
        const bodyOut = publicConsultBody({
          token: existing.token,
          view: existing.view,
          idempotent: true,
          correlation_id: existing.correlation_id || correlation_id,
          event,
        });
        const urlCheck = assertNoCnpjInUrl(bodyOut.result_url, checked.cnpj);
        if (!urlCheck.ok) {
          return { statusCode: 500, body: unknownBody({ error: "pii_leak_blocked" }), logs };
        }
        logs.push({ event: "replay", fields: redactLog({ token_len: existing.token.length }, { cnpj: checked.cnpj }) });
        return {
          statusCode: 200,
          headers: { Location: bodyOut.result_url },
          body: bodyOut,
          record: existing,
          logs,
        };
      }
    }
  } catch (err) {
    const view = mapPublicView({ ok: false, error: "store_unavailable", reason_codes: ["store_unavailable"] });
    logs.push({ event: "store_unavailable", fields: { code: String(err && err.message).slice(0, 80) } });
    return {
      statusCode: 503,
      body: unknownBody({ error: "store_unavailable", message: "Servico temporariamente indisponivel.", view }),
      logs,
    };
  }

  const loaded = loadFixtureEnvelope(data);
  if (!loaded.ok) {
    const view = mapPublicView({ ok: false, error: loaded.error, reason_codes: [loaded.error] });
    return { statusCode: 400, body: unknownBody({ error: loaded.error, view }), logs };
  }

  const consumed = consumeEnvelope(loaded.envelope);
  const view = mapPublicView(consumed);
  const token = mintToken();
  if (!tokenLooksOpaque(token) || require("./privacy.cjs").scanCnpjLeaks(token, checked.cnpj).length) {
    return { statusCode: 500, body: unknownBody({ error: "token_mint_failed" }), logs };
  }

  const session_id = `s-${crypto.randomBytes(8).toString("hex")}`;
  const event = attributionEvent({
    eventName: "public_integrity_consult",
    aggregate_state: view.aggregate_state,
    coverage_class: view.coverage_class,
    correlation_id,
    session_id,
    event_id: idemKey || token,
    flag: flagEnabled(runtimeEnv) ? "on" : "off",
  });

  const record = {
    token,
    id: token,
    view: stripCnpjKeys(view, checked.cnpj),
    created_at: clock.toISOString(),
    expires_at: expiresAt(clock, TOKEN_TTL_SECONDS),
    store_expires_at: expiresAt(clock, STORE_TTL_SECONDS),
    correlation_id,
    session_id,
    idempotency_key: idemKey,
    fixture_id: loaded.fixture_id,
    aggregate_state: view.aggregate_state,
    coverage_class: view.coverage_class,
    attribution: event,
  };

  try {
    await store.put(record, { onlyIfNew: Boolean(idemKey) });
  } catch (err) {
    if (err && err.code === "ALREADY_EXISTS" && err.existing) {
      const rec = err.existing;
      const bodyOut = publicConsultBody({
        token: rec.token,
        view: rec.view,
        idempotent: true,
        correlation_id: rec.correlation_id || correlation_id,
        event: rec.attribution || event,
      });
      return { statusCode: 200, headers: { Location: bodyOut.result_url }, body: bodyOut, record: rec, logs };
    }
    const failView = mapPublicView({ ok: false, error: "store_unavailable", reason_codes: ["store_unavailable"] });
    logs.push({ event: "persist_failed", fields: { code: String(err && err.message).slice(0, 80) } });
    return {
      statusCode: 503,
      body: unknownBody({ error: "store_unavailable", message: "Servico temporariamente indisponivel.", view: failView }),
      logs,
    };
  }

  const bodyOut = publicConsultBody({ token, view, idempotent: false, correlation_id, event });
  const leak = scanCnpjLeaks(bodyOut, checked.cnpj);
  const urlCheck = assertNoCnpjInUrl(bodyOut.result_url, checked.cnpj);
  if (leak.length || !urlCheck.ok) {
    try {
      await store.delete(token);
    } catch {
      /* ignore */
    }
    return { statusCode: 500, body: unknownBody({ error: "pii_leak_blocked" }), logs };
  }

  logs.push({
    event: "consult_ok",
    fields: redactLog(
      { aggregate_state: view.aggregate_state, coverage_class: view.coverage_class, fixture_id: loaded.fixture_id },
      { cnpj: checked.cnpj },
    ),
  });

  return {
    statusCode: view.ok ? 200 : 200,
    headers: {
      Location: bodyOut.result_url,
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
    body: bodyOut,
    record,
    logs,
    html: resultHtml(view, { token }),
  };
}

async function handleResult({ store, token, env, now, wantsHtml } = {}) {
  const logs = [];
  const runtimeEnv = env || process.env;
  if (!prepareMode(runtimeEnv) && !flagEnabled(runtimeEnv)) {
    return { statusCode: 404, body: unknownBody({ error: "flag_off" }), logs };
  }
  if (!token || !tokenLooksOpaque(token)) {
    const view = mapPublicView({ ok: false, error: "token_invalid", reason_codes: ["token_invalid"] });
    return { statusCode: 404, body: unknownBody({ error: "token_invalid", message: "Resultado indisponivel.", view }), logs };
  }
  if (!store) {
    const view = mapPublicView({ ok: false, error: "store_unavailable", reason_codes: ["store_unavailable"] });
    return { statusCode: 503, body: unknownBody({ error: "store_unavailable", view }), logs };
  }
  let record;
  try {
    record = await store.get(token);
  } catch (err) {
    const view = mapPublicView({ ok: false, error: "store_unavailable", reason_codes: ["store_unavailable"] });
    return { statusCode: 503, body: unknownBody({ error: "store_unavailable", view }), logs };
  }
  if (!record) {
    const view = mapPublicView({ ok: false, error: "token_expired", reason_codes: ["token_expired"] });
    return { statusCode: 404, body: unknownBody({ error: "token_expired", message: "Resultado expirado ou inexistente.", view }), logs };
  }
  if (isExpired(record.expires_at, now || new Date())) {
    try {
      await store.delete(token);
    } catch {
      /* ignore */
    }
    const view = mapPublicView({ ok: false, error: "token_expired", reason_codes: ["token_expired"] });
    return { statusCode: 404, body: unknownBody({ error: "token_expired", message: "Resultado expirado ou inexistente.", view }), logs };
  }
  const bodyOut = publicConsultBody({
    token: record.token,
    view: record.view,
    idempotent: true,
    correlation_id: record.correlation_id,
    event: record.attribution,
  });
  return {
    statusCode: 200,
    headers: {
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
    body: bodyOut,
    html: wantsHtml ? resultHtml(record.view, { token: record.token }) : undefined,
    record,
    logs,
  };
}

async function handleDelete({ store, token }) {
  if (!store || !token) {
    return { statusCode: 400, body: unknownBody({ error: "token_invalid" }) };
  }
  try {
    await store.delete(token);
    return { statusCode: 200, body: { ok: true, deleted: true, empty_success: false } };
  } catch {
    return { statusCode: 503, body: unknownBody({ error: "store_unavailable" }) };
  }
}

module.exports = {
  handleConsult,
  handleResult,
  handleDelete,
  resultUrl,
  loadFlag,
};
