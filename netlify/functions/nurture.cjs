/**
 * Nurture API — CONFENGE
 *
 * GET  ?action=health
 * GET  ?action=tracks          public track metadata (no PII)
 * POST ?action=subscribe       { email, track, consent, source?, landing_page? }
 * GET  ?action=confirm&token=&id=
 * GET  ?action=unsubscribe&token=&id=  (also POST one-click)
 * POST ?action=tick            OPS_TOKEN — process due sends
 * POST ?action=stop_commercial OPS_TOKEN — { email|lead_id, stage }
 * GET  ?action=status&id=      OPS_TOKEN
 */
const crypto = require("crypto");
const {
  corsHeaders,
  clientIp,
  safeLog,
  originAllowed,
} = require("./lib/lead-core.cjs");
const {
  loadTracks,
  buildSubscription,
  confirmSubscription,
  unsubscribe,
  isSuppressed,
  suppressEmail,
  shouldStopForCommercialStage,
  stopForCommercial,
  nextDueMessage,
  renderBody,
  afterSend,
  sendResendNurture,
  publicSubSummary,
  sealToken,
  openTokenDetails,
  TRACKS,
} = require("./lib/nurture-core.cjs");
const {
  nurtureRateLimit,
  nurtureFingerprint,
  nurtureIpHash,
} = require("./lib/nurture-rate-limit.cjs");

const MAX_SUBSCRIBE_BODY = 8 * 1024;

const CANONICAL_PUBLIC_ORIGINS = new Set([
  "https://confenge.com.br",
  "https://www.confenge.com.br",
]);

function isProductionProfile(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  const context = String(env.CONTEXT || env.NETLIFY_CONTEXT || "").trim().toLowerCase();
  return nodeEnv === "production" || context === "production";
}

function productionRequestOrigin(event) {
  const headers = event?.headers || {};
  const origin = String(headers.origin || headers.Origin || "").trim();
  if (origin) return origin;
  const referer = String(headers.referer || headers.Referer || "").trim();
  if (!referer) return "";
  try {
    const parsed = new URL(referer);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function subscribeOriginAllowed(event, originCheck, env = process.env) {
  if (!originCheck.ok) return false;
  if (!isProductionProfile(env)) return true;
  return CANONICAL_PUBLIC_ORIGINS.has(productionRequestOrigin(event));
}

function bindBlobs(event) {
  try {
    const { connectLambda } = require("@netlify/blobs");
    if (event && event.blobs) connectLambda(event);
  } catch {
    /* optional */
  }
}

function authOps(event) {
  const expected = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
  if (!expected) return { ok: false, reason: "ops_token_not_configured" };
  const h = event.headers || {};
  const auth = String(h.authorization || h.Authorization || "");
  let token = String(h["x-ops-token"] || h["X-Ops-Token"] || "");
  if (auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  if (!token || token.length < 16) return { ok: false, reason: "unauthorized" };
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true };
}

function json(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(origin || "https://confenge.com.br"),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
    body: JSON.stringify(body),
  };
}

function html(statusCode, title, bodyHtml) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
    body: `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="robots" content="noindex"/><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:2rem auto;padding:0 1rem;line-height:1.5}a{color:#0b5fff}</style>
</head><body>${bodyHtml}<p><a href="https://confenge.com.br/">CONFENGE</a></p></body></html>`,
  };
}

function parseBody(event) {
  let raw = event.body || "";
  if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // form-urlencoded
    const out = {};
    for (const part of raw.split("&")) {
      const [k, v] = part.split("=");
      if (k) out[decodeURIComponent(k)] = decodeURIComponent((v || "").replace(/\+/g, " "));
    }
    return out;
  }
}

function rawBody(event) {
  const raw = event.body || "";
  return event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : String(raw);
}

async function getNurtureStore(event) {
  bindBlobs(event);
  // Memory for tests
  if (global.__nurtureStore) return global.__nurtureStore;
  if (process.env.NURTURE_STORE_DIR || process.env.LEAD_STORE_DIR) {
    const dir = process.env.NURTURE_STORE_DIR || require("path").join(process.env.LEAD_STORE_DIR, "nurture");
    const fs = require("fs");
    const path = require("path");
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "suppression"), { recursive: true });
    return {
      async get(id) {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8"));
        } catch {
          return null;
        }
      },
      async put(rec) {
        fs.writeFileSync(path.join(dir, `${rec.subscription_id}.json`), JSON.stringify(rec));
        return rec;
      },
      async list() {
        return fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => {
            try {
              return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      },
      async listSuppression() {
        const sdir = path.join(dir, "suppression");
        if (!fs.existsSync(sdir)) return [];
        return fs
          .readdirSync(sdir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => {
            try {
              return JSON.parse(fs.readFileSync(path.join(sdir, f), "utf8"));
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      },
      async putSuppression(row) {
        const h = row.email_hash || crypto.randomBytes(8).toString("hex");
        fs.writeFileSync(path.join(dir, "suppression", `${h}.json`), JSON.stringify(row));
        return row;
      },
    };
  }
  try {
    const { getStore } = require("@netlify/blobs");
    const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "";
    const token =
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.NETLIFY_API_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN ||
      "";
    const store =
      siteID && token
        ? getStore({ name: "confenge-nurture", siteID, token })
        : getStore({ name: "confenge-nurture" });
    return {
      async get(id) {
        try {
          return (await store.get(`subs/${id}`, { type: "json" })) || null;
        } catch {
          return null;
        }
      },
      async put(rec) {
        await store.setJSON(`subs/${rec.subscription_id}`, rec);
        return rec;
      },
      async list() {
        const out = [];
        if (typeof store.list !== "function") return out;
        try {
          const listed = await store.list({ prefix: "subs/" });
          for (const b of listed.blobs || []) {
            try {
              const rec = await store.get(b.key, { type: "json" });
              if (rec) out.push(rec);
            } catch {
              /* skip */
            }
          }
        } catch {
          /* empty */
        }
        return out;
      },
      async listSuppression() {
        const out = [];
        if (typeof store.list !== "function") return out;
        try {
          const listed = await store.list({ prefix: "suppression/" });
          for (const b of listed.blobs || []) {
            try {
              const rec = await store.get(b.key, { type: "json" });
              if (rec) out.push(rec);
            } catch {
              /* skip */
            }
          }
        } catch {
          /* empty */
        }
        return out;
      },
      async putSuppression(row) {
        const h = row.email_hash || crypto.randomBytes(8).toString("hex");
        await store.setJSON(`suppression/${h}`, row);
        return row;
      },
    };
  } catch (err) {
    safeLog("warn", "nurture_store_unavailable", {
      reason: err && err.message ? String(err.message).slice(0, 80) : "skip",
    });
    if (process.env.NODE_ENV === "test" || process.env.LEAD_ALLOW_MEMORY_FALLBACK === "1") {
      const mem = new Map();
      const sup = new Map();
      return {
        async get(id) {
          return mem.get(id) || null;
        },
        async put(rec) {
          mem.set(rec.subscription_id, rec);
          return rec;
        },
        async list() {
          return [...mem.values()];
        },
        async listSuppression() {
          return [...sup.values()];
        },
        async putSuppression(row) {
          sup.set(row.email_hash, row);
          return row;
        },
      };
    }
    return null;
  }
}

exports.handler = async (event) => {
  const originCheck = originAllowed(event);
  const origin = originCheck.origin || "https://confenge.com.br";
  const qs = event.queryStringParameters || {};
  const action = String(qs.action || "health").toLowerCase();
  const acceptHdr = String(event.headers?.accept || event.headers?.Accept || "");
  // Prefer JSON when client asks for it (API/tests); HTML only for browser navigations.
  const wantsHtml =
    acceptHdr.includes("text/html") && !acceptHdr.includes("application/json");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }

  if (action === "health") {
    return json(
      200,
      {
        ok: true,
        service: "confenge-nurture",
        tracks: TRACKS,
        resend_configured: Boolean(process.env.RESEND_API_KEY),
        token_secret_configured: String(process.env.NURTURE_TOKEN_SECRET || "").length >= 32,
        token_rotation_window: String(process.env.NURTURE_TOKEN_SECRET_PREVIOUS || "").length >= 32,
        ts: new Date().toISOString(),
      },
      origin
    );
  }

  const tracksData = loadTracks();

  if (action === "tracks" && event.httpMethod === "GET") {
    const tracks = tracksData.tracks || {};
    const publicTracks = Object.values(tracks).map((t) => ({
      id: t.id,
      label: t.label,
      intent: t.intent,
      offer: t.offer,
      consent_label: t.consent_label,
      message_count: (t.messages || []).length,
    }));
    return json(200, { ok: true, tracks: publicTracks }, origin);
  }

  if (action === "subscribe" && event.httpMethod === "POST") {
    if (!subscribeOriginAllowed(event, originCheck)) {
      safeLog("warn", "nurture_origin_denied", {});
      return json(403, { ok: false, error: "origin_denied" }, "https://confenge.com.br");
    }
    if (Buffer.byteLength(rawBody(event), "utf8") > MAX_SUBSCRIBE_BODY) {
      return json(413, { ok: false, error: "payload_too_large" }, origin);
    }
    const ip = clientIp(event);
    const rate = nurtureRateLimit({ ip, fingerprint: nurtureFingerprint(event, ip) });
    if (!rate.allowed) {
      const ipHash = nurtureIpHash(ip);
      safeLog("warn", "nurture_rate_limited", { reason: rate.reason, ip_hash: ipHash });
      const response = json(429, { ok: false, error: "rate_limited" }, origin);
      response.headers["Retry-After"] = String(rate.retryAfter);
      return response;
    }
  }

  const store = await getNurtureStore(event);

  if (action === "subscribe" && event.httpMethod === "POST") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const body = parseBody(event);
    try {
      const suppression = await store.listSuppression();
      if (isSuppressed(suppression, body.email)) {
        // Silent success to avoid probing
        return json(202, { ok: true, status: "accepted" }, origin);
      }
      const { record, confirm_token, unsub_token } = buildSubscription({
        email: body.email,
        track: body.track,
        consent: body.consent === true || body.consent === "true" || body.consent === "on" || body.consent === "1",
        source: body.source,
        landing_page: body.landing_page,
        lead_id: body.lead_id,
      });
      // Confirmation raw exists only long enough to build this response email.
      // Future unsubscribe links use an authenticated sealed token at rest.
      record.unsub_token_sealed = sealToken(
        unsub_token,
        record.subscription_id,
        process.env,
      );
      await store.put(record);

      const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://confenge.com.br";
      const confirmUrl = `${base}/.netlify/functions/nurture?action=confirm&id=${record.subscription_id}&token=${confirm_token}`;
      const unsubUrl = `${base}/.netlify/functions/nurture?action=unsubscribe&id=${record.subscription_id}&token=${unsub_token}`;

      // Confirmation email
      const trackMeta = (tracksData.tracks || {})[record.track] || {};
      const confirmText = [
        "CONFENGE — confirme sua inscrição na sequência técnica.",
        `Trilha: ${trackMeta.label || record.track}`,
        "",
        "Clique para confirmar (obrigatório):",
        confirmUrl,
        "",
        "Se não foi você, ignore este e-mail ou cancele:",
        unsubUrl,
      ].join("\n");

      const send = await sendResendNurture({
        to: record.email,
        subject: `Confirme: sequência ${trackMeta.label || record.track} — CONFENGE`,
        text: confirmText,
        unsubUrl,
      });

      safeLog("info", "nurture_subscribe", {
        subscription_id: record.subscription_id,
        track: record.track,
        send: send.status,
        ip_hash: nurtureIpHash(clientIp(event)),
      });

      // Never return email or raw tokens in JSON
      return json(
        201,
        {
          ok: true,
          status: "pending_confirm",
          subscription_id: record.subscription_id,
          track: record.track,
          confirm_email: send.status,
          message: "Enviamos um e-mail de confirmação. A sequência só começa após o clique.",
        },
        origin
      );
    } catch (err) {
      const unavailable = err.code === "nurture_token_secret_not_configured";
      return json(
        unavailable ? 503 : 400,
        {
          ok: false,
          error: unavailable ? "nurture_not_configured" : (err.code || "subscribe_error"),
          message: unavailable ? "Serviço temporariamente indisponível." : err.message,
        },
        origin,
      );
    }
  }

  if (action === "confirm" && (event.httpMethod === "GET" || event.httpMethod === "POST")) {
    if (!store) {
      return wantsHtml
        ? html(503, "Indisponível", "<h1>Serviço indisponível</h1>")
        : json(503, { ok: false, error: "store_unavailable" }, origin);
    }
    const id = String(qs.id || "");
    const token = String(qs.token || "");
    try {
      const rec = await store.get(id);
      const next = confirmSubscription(rec, token);
      // Drop confirm raw after confirm
      delete next._confirm_raw;
      await store.put(next);
      // Send first message immediately if day_offset 0
      await processOne(store, next, tracksData);
      if (wantsHtml) {
        return html(
          200,
          "Inscrição confirmada",
          `<h1>Inscrição confirmada</h1><p>Você receberá a sequência técnica da trilha <strong>${next.track}</strong>. Pode sair a qualquer momento pelo link no rodapé dos e-mails.</p>`
        );
      }
      return json(200, { ok: true, status: "active", subscription_id: next.subscription_id }, origin);
    } catch (err) {
      if (wantsHtml) {
        return html(400, "Link inválido", `<h1>Link inválido ou expirado</h1><p>${err.code || "error"}</p>`);
      }
      return json(400, { ok: false, error: err.code || "confirm_error" }, origin);
    }
  }

  if (action === "unsubscribe" && (event.httpMethod === "GET" || event.httpMethod === "POST")) {
    if (!store) {
      return wantsHtml
        ? html(503, "Indisponível", "<h1>Serviço indisponível</h1>")
        : json(503, { ok: false, error: "store_unavailable" }, origin);
    }
    const id = String(qs.id || "");
    const token = String(qs.token || parseBody(event).token || "");
    try {
      const rec = await store.get(id);
      const next = unsubscribe(rec, token, "user_unsub");
      await store.put(next);
      const row = suppressEmail(null, next.email, "unsubscribe");
      if (row) await store.putSuppression(row);
      if (wantsHtml) {
        return html(
          200,
          "Descadastrado",
          "<h1>Descadastro concluído</h1><p>Você não receberá mais esta sequência. A lista de supressão foi atualizada.</p>"
        );
      }
      return json(200, { ok: true, status: "unsubscribed" }, origin);
    } catch (err) {
      if (wantsHtml) {
        return html(400, "Link inválido", `<h1>Não foi possível descadastrar</h1><p>${err.code || "error"}</p>`);
      }
      return json(400, { ok: false, error: err.code || "unsub_error" }, origin);
    }
  }

  // --- authenticated ops ---
  if (["tick", "stop_commercial", "status", "list"].includes(action)) {
    const auth = authOps(event);
    if (!auth.ok) {
      return json(auth.reason === "ops_token_not_configured" ? 503 : 401, { ok: false, error: auth.reason }, origin);
    }
  }

  if (action === "status" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const rec = await store.get(String(qs.id || ""));
    if (!rec) return json(404, { ok: false, error: "not_found" }, origin);
    return json(200, { ok: true, subscription: publicSubSummary(rec) }, origin);
  }

  if (action === "list" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const all = await store.list();
    return json(
      200,
      { ok: true, count: all.length, subscriptions: all.map(publicSubSummary) },
      origin
    );
  }

  if (action === "stop_commercial" && event.httpMethod === "POST") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const body = parseBody(event);
    const stage = body.stage || "meeting";
    if (!shouldStopForCommercialStage(stage) && stage !== "force") {
      return json(400, { ok: false, error: "stage_not_stopping" }, origin);
    }
    const all = await store.list();
    let n = 0;
    for (const rec of all) {
      if (body.lead_id && rec.lead_id !== body.lead_id) continue;
      if (body.email && rec.email !== String(body.email).toLowerCase()) continue;
      if (body.subscription_id && rec.subscription_id !== body.subscription_id) continue;
      if (rec.status !== "active" && rec.status !== "pending_confirm") continue;
      await store.put(stopForCommercial(rec, stage));
      n += 1;
    }
    return json(200, { ok: true, stopped: n }, origin);
  }

  if (action === "tick" && event.httpMethod === "POST") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const all = await store.list();
    const suppression = await store.listSuppression();
    let sent = 0;
    let skipped = 0;
    let errors = 0;
    for (const rec of all) {
      if (rec.status !== "active") {
        skipped += 1;
        continue;
      }
      if (isSuppressed(suppression, rec.email)) {
        await store.put({ ...rec, status: "suppressed", stopped_reason: "suppression_list" });
        skipped += 1;
        continue;
      }
      const result = await processOne(store, rec, tracksData);
      if (result === "sent") sent += 1;
      else if (result === "error") errors += 1;
      else skipped += 1;
    }
    return json(200, { ok: true, sent, skipped, errors, scanned: all.length }, origin);
  }

  return json(404, { ok: false, error: "unknown_action", action }, origin);
};

async function processOne(store, rec, tracksData) {
  const due = nextDueMessage(rec, tracksData, Date.now());
  if (!due) return "not_due";
  let unsubToken;
  try {
    if (rec.unsub_token_sealed) {
      const opened = openTokenDetails(rec.unsub_token_sealed, rec.subscription_id, process.env);
      unsubToken = opened.token;
      if (opened.key_slot === "previous") {
        const migrated = {
          ...rec,
          unsub_token_sealed: sealToken(unsubToken, rec.subscription_id, process.env),
        };
        await store.put(migrated);
        rec = migrated;
      }
    } else if (rec._unsub_raw) {
      // One-way migration for records created before sealed-token support.
      unsubToken = rec._unsub_raw;
      const migrated = {
        ...rec,
        unsub_token_sealed: sealToken(unsubToken, rec.subscription_id, process.env),
      };
      delete migrated._unsub_raw;
      delete migrated._confirm_raw;
      await store.put(migrated);
      rec = migrated;
    } else {
      throw Object.assign(new Error("unsubscribe_token_missing"), { code: "unsubscribe_token_missing" });
    }
  } catch (err) {
    safeLog("error", "nurture_unsubscribe_token_unavailable", {
      subscription_id: String(rec.subscription_id || "").slice(0, 32),
      reason: String(err.code || "token_error").slice(0, 64),
    });
    return "error";
  }
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://confenge.com.br";
  const unsubUrl = `${base}/.netlify/functions/nurture?action=unsubscribe&id=${rec.subscription_id}&token=${unsubToken}`;
  const text = renderBody(due.body_template, {
    cta_url: due.cta_url,
    tool_url: due.tool_url,
    unsubscribe_url: unsubUrl,
  });
  const footer = `\n\n---\nCONFENGE · sequência ${due.track_id} (${due.index + 1}/5)\nSair: ${unsubUrl}\n`;
  const send = await sendResendNurture({
    to: rec.email,
    subject: due.subject,
    text: text + footer,
    unsubUrl,
  });
  if (send.status === "skipped") {
    // Still advance in test/dev so sequences are testable without Resend
    if (process.env.NURTURE_ADVANCE_WITHOUT_RESEND === "1" || process.env.NODE_ENV === "test") {
      await store.put(afterSend(rec, due.index, "dry-run"));
      return "sent";
    }
    return "skipped";
  }
  if (!send.ok) return "error";
  await store.put(afterSend(rec, due.index, send.provider_id));
  return "sent";
}

// test helpers
exports._setStore = (s) => {
  global.__nurtureStore = s;
};
exports._clearStore = () => {
  delete global.__nurtureStore;
};
exports._processOne = processOne;
