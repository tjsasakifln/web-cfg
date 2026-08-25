/**
 * Nurture sequences — CONFENGE.
 * Tracks: contrato | edital | operacao (5 messages each).
 * PII only in private store; public responses never echo email in full.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { safeLog } = require("./lead-core.cjs");

const TRACKS = ["contrato", "edital", "operacao"];
const TRACK_SET = new Set(TRACKS);

function loadTracks() {
  const candidates = [
    path.join(__dirname, "../../../data/nurture/tracks.json"),
    path.join(process.cwd(), "data/nurture/tracks.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      }
    } catch {
      /* try next */
    }
  }
  return { tracks: {} };
}

function normalizeEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e || e.length > 200) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function emailHash(email, salt) {
  return crypto
    .createHash("sha256")
    .update(String(salt || process.env.IP_HASH_SALT || "confenge") + "|" + email)
    .digest("hex")
    .slice(0, 32);
}

function tokenPair() {
  const raw = crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw || "")).digest("hex");
}

function nurtureTokenKey(env = process.env) {
  const secret = String(env.NURTURE_TOKEN_SECRET || "");
  if (secret.length < 32) {
    const err = new Error("nurture_token_secret_not_configured");
    err.code = "nurture_token_secret_not_configured";
    throw err;
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function sealToken(raw, context, env = process.env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", nurtureTokenKey(env), iv);
  cipher.setAAD(Buffer.from(String(context || ""), "utf8"));
  const encrypted = Buffer.concat([cipher.update(String(raw || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

function openToken(sealed, context, env = process.env) {
  const [version, ivRaw, tagRaw, encryptedRaw] = String(sealed || "").split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    const err = new Error("invalid_sealed_token");
    err.code = "invalid_sealed_token";
    throw err;
  }
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      nurtureTokenKey(env),
      Buffer.from(ivRaw, "base64url"),
    );
    decipher.setAAD(Buffer.from(String(context || ""), "utf8"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (cause) {
    if (cause?.code === "nurture_token_secret_not_configured") throw cause;
    const err = new Error("invalid_sealed_token");
    err.code = "invalid_sealed_token";
    throw err;
  }
}

function publicSubSummary(rec) {
  if (!rec) return null;
  return {
    subscription_id: rec.subscription_id,
    track: rec.track,
    status: rec.status,
    created_at: rec.created_at,
    confirmed_at: rec.confirmed_at || null,
    next_message_index: rec.next_message_index,
    messages_sent: rec.messages_sent || 0,
    stopped_reason: rec.stopped_reason || null,
  };
}

/**
 * Create pending subscription (double opt-in).
 */
function buildSubscription({ email, track, consent, source, landing_page, lead_id }) {
  const e = normalizeEmail(email);
  if (!e) {
    const err = new Error("invalid_email");
    err.code = "invalid_email";
    throw err;
  }
  if (!TRACK_SET.has(track)) {
    const err = new Error("invalid_track");
    err.code = "invalid_track";
    throw err;
  }
  if (!consent) {
    const err = new Error("consent_required");
    err.code = "consent_required";
    throw err;
  }
  const now = new Date().toISOString();
  const confirm = tokenPair();
  const unsub = tokenPair();
  const subscription_id = crypto
    .createHash("sha256")
    .update(e + "|" + track + "|" + now + "|" + crypto.randomBytes(8).toString("hex"))
    .digest("hex")
    .slice(0, 24);

  return {
    record: {
      subscription_id,
      email: e,
      email_hash: emailHash(e),
      track,
      status: "pending_confirm",
      consent: true,
      consent_at: now,
      source: source ? String(source).slice(0, 120) : null,
      landing_page: landing_page ? String(landing_page).slice(0, 240) : null,
      lead_id: lead_id ? String(lead_id).slice(0, 40) : null,
      created_at: now,
      updated_at: now,
      confirmed_at: null,
      unsubscribed_at: null,
      next_message_index: 0,
      messages_sent: 0,
      last_sent_at: null,
      send_log: [],
      confirm_token_hash: confirm.hash,
      unsub_token_hash: unsub.hash,
      stopped_reason: null,
      commercial_stage_stop: false,
    },
    confirm_token: confirm.raw,
    unsub_token: unsub.raw,
  };
}

function confirmSubscription(rec, tokenRaw) {
  if (!rec) {
    const err = new Error("not_found");
    err.code = "not_found";
    throw err;
  }
  if (rec.status === "suppressed" || rec.status === "unsubscribed") {
    const err = new Error("suppressed");
    err.code = "suppressed";
    throw err;
  }
  if (hashToken(tokenRaw) !== rec.confirm_token_hash) {
    const err = new Error("invalid_token");
    err.code = "invalid_token";
    throw err;
  }
  const now = new Date().toISOString();
  return {
    ...rec,
    status: "active",
    confirmed_at: now,
    updated_at: now,
    confirm_token_hash: null, // one-time
  };
}

function unsubscribe(rec, tokenRaw, reason) {
  if (!rec) {
    const err = new Error("not_found");
    err.code = "not_found";
    throw err;
  }
  if (hashToken(tokenRaw) !== rec.unsub_token_hash) {
    const err = new Error("invalid_token");
    err.code = "invalid_token";
    throw err;
  }
  const now = new Date().toISOString();
  return {
    ...rec,
    status: "unsubscribed",
    unsubscribed_at: now,
    updated_at: now,
    stopped_reason: reason ? String(reason).slice(0, 80) : "user_unsub",
  };
}

function suppressEmail(storeRecord, email, reason) {
  const e = normalizeEmail(email);
  if (!e) return null;
  const now = new Date().toISOString();
  return {
    email_hash: emailHash(e),
    // store email only in private suppression list for matching — ops only
    email: e,
    reason: reason ? String(reason).slice(0, 80) : "manual",
    at: now,
  };
}

function isSuppressed(suppressionList, email) {
  const e = normalizeEmail(email);
  if (!e) return true;
  const h = emailHash(e);
  return (suppressionList || []).some((s) => s.email_hash === h || s.email === e);
}

/**
 * Stop nurture when lead advances commercially (meeting+).
 */
function shouldStopForCommercialStage(stage) {
  const s = String(stage || "");
  return ["meeting", "proposal", "won", "lost", "qualified"].includes(s);
}

function stopForCommercial(rec, stage) {
  const now = new Date().toISOString();
  return {
    ...rec,
    status: "stopped_commercial",
    updated_at: now,
    stopped_reason: `commercial_stage:${stage}`,
    commercial_stage_stop: true,
  };
}

/**
 * Render next due message for an active subscription.
 * Returns null if nothing due.
 */
function nextDueMessage(rec, tracksData, nowMs) {
  if (!rec || rec.status !== "active") return null;
  const track = (tracksData.tracks || {})[rec.track];
  if (!track || !Array.isArray(track.messages)) return null;
  const idx = rec.next_message_index || 0;
  if (idx >= track.messages.length) return null;

  const msg = track.messages[idx];
  const confirmed = Date.parse(rec.confirmed_at || rec.created_at);
  if (!Number.isFinite(confirmed)) return null;
  const dueAt = confirmed + (Number(msg.day_offset) || 0) * 864e5;
  if ((nowMs || Date.now()) < dueAt) return null;

  const site = tracksData.site || "https://confenge.com.br";
  // unsub URL uses token only when we still have raw — caller injects
  return {
    index: idx,
    day_offset: msg.day_offset,
    subject: msg.subject,
    preheader: msg.preheader,
    body_template: msg.body_md,
    track_id: track.id,
    offer: track.offer,
    cta_url: track.cta_default,
    tool_url: track.tool,
    site,
  };
}

function renderBody(template, vars) {
  let out = String(template || "");
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.split(`{{${k}}}`).join(String(v || ""));
  }
  return out;
}

/**
 * Mark message sent and advance index.
 */
function afterSend(rec, index, provider_id) {
  const now = new Date().toISOString();
  const log = Array.isArray(rec.send_log) ? rec.send_log.slice() : [];
  log.push({
    at: now,
    index,
    provider_id: provider_id ? String(provider_id).slice(0, 64) : undefined,
  });
  const next = index + 1;
  const trackLen = 5;
  const done = next >= trackLen;
  return {
    ...rec,
    next_message_index: next,
    messages_sent: (rec.messages_sent || 0) + 1,
    last_sent_at: now,
    updated_at: now,
    send_log: log.slice(-20),
    status: done ? "completed" : rec.status,
  };
}

async function sendResendNurture({ to, subject, text, from, unsubUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, status: "skipped", reason: "resend_not_configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from || process.env.NURTURE_FROM_EMAIL || "CONFENGE <nurture@confenge.com.br>",
      to: [to],
      subject: String(subject).slice(0, 200),
      text,
      headers: unsubUrl
        ? {
            "List-Unsubscribe": `<${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    safeLog("error", "nurture_resend_fail", { http: res.status, detail: t.slice(0, 80) });
    return { ok: false, status: "error", reason: `resend_http_${res.status}` };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, status: "ok", provider_id: data.id };
}

module.exports = {
  TRACKS,
  loadTracks,
  normalizeEmail,
  emailHash,
  buildSubscription,
  confirmSubscription,
  unsubscribe,
  suppressEmail,
  isSuppressed,
  shouldStopForCommercialStage,
  stopForCommercial,
  nextDueMessage,
  renderBody,
  afterSend,
  sendResendNurture,
  publicSubSummary,
  hashToken,
  tokenPair,
  nurtureTokenKey,
  sealToken,
  openToken,
};
