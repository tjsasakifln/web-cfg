/**
 * Durable lead store abstractions.
 * - MemoryStore: tests / local
 * - FileStore: optional LEAD_STORE_DIR for durable local/dev
 * - NetlifyBlobsStore: production on Netlify (when @netlify/blobs available)
 * - Composite: primary + optional mirror webhook for CRM
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { safeLog } = require("./lead-core.cjs");

function alreadyExistsError(existing) {
  const err = new Error("already_exists");
  err.code = "ALREADY_EXISTS";
  err.existing = existing || null;
  return err;
}

class MemoryStore {
  constructor() {
    this.map = new Map();
    this.byIdem = new Map();
  }
  async getByIdempotency(key) {
    const id = this.byIdem.get(key);
    if (!id) return null;
    return this.map.get(id) || null;
  }
  async get(id) {
    return this.map.get(id) || null;
  }
  async put(record, { onlyIfNew = false } = {}) {
    if (onlyIfNew && this.map.has(record.lead_id)) {
      throw alreadyExistsError(this.map.get(record.lead_id));
    }
    this.map.set(record.lead_id, record);
    if (record.idempotency_key) this.byIdem.set(record.idempotency_key, record.lead_id);
    return record;
  }
  async update(id, patch) {
    const cur = this.map.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
    this.map.set(id, next);
    return next;
  }
  async delete(id) {
    const cur = this.map.get(id);
    if (cur?.idempotency_key) this.byIdem.delete(cur.idempotency_key);
    return this.map.delete(id);
  }
  async list() {
    return [...this.map.values()];
  }
}

class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.idemDir = path.join(dir, "idem");
    fs.mkdirSync(this.idemDir, { recursive: true });
  }
  _path(id) {
    return path.join(this.dir, `${id}.json`);
  }
  _idemPath(key) {
    const h = crypto.createHash("sha256").update(key).digest("hex").slice(0, 40);
    return path.join(this.idemDir, `${h}.json`);
  }
  async getByIdempotency(key) {
    try {
      const p = this._idemPath(key);
      if (!fs.existsSync(p)) return null;
      const { lead_id } = JSON.parse(fs.readFileSync(p, "utf8"));
      return this.get(lead_id);
    } catch {
      return null;
    }
  }
  async get(id) {
    try {
      const p = this._path(id);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }
  async put(record, { onlyIfNew = false } = {}) {
    if (onlyIfNew && fs.existsSync(this._path(record.lead_id))) {
      throw alreadyExistsError(await this.get(record.lead_id));
    }
    fs.writeFileSync(this._path(record.lead_id), JSON.stringify(record, null, 0), "utf8");
    if (record.idempotency_key) {
      fs.writeFileSync(
        this._idemPath(record.idempotency_key),
        JSON.stringify({ lead_id: record.lead_id }),
        "utf8",
      );
    }
    return record;
  }
  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
    return this.put(next);
  }
  async delete(id) {
    const cur = await this.get(id);
    if (!cur) return false;
    try {
      fs.unlinkSync(this._path(id));
    } catch {
      /* ignore */
    }
    if (cur.idempotency_key) {
      try {
        fs.unlinkSync(this._idemPath(cur.idempotency_key));
      } catch {
        /* ignore */
      }
    }
    return true;
  }
  async list() {
    const out = [];
    let names = [];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return out;
    }
    for (const name of names) {
      if (!name.endsWith(".json") || name.startsWith(".")) continue;
      const rec = await this.get(name.replace(/\.json$/, ""));
      if (rec && rec.lead_id) out.push(rec);
    }
    return out;
  }
}

class NetlifyBlobsStore {
  constructor(store, options = {}) {
    this.store = store;
    const prefix = options.prefix == null ? "leads/" : String(options.prefix);
    this.prefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  }
  _recordKey(id) {
    return `${this.prefix}${id}`;
  }
  /**
   * @returns {{ modified: boolean, etag?: string }}
   */
  async _setJson(key, value, { onlyIfNew = false } = {}) {
    // IMPORTANT: use store.set() (not setJSON) when onlyIfNew is required.
    // @netlify/blobs setJSON spreads conditions into makeRequest incorrectly
    // (...conditions instead of conditions: {...}), so if-none-match never
    // applies and create-only writes silently overwrite — replaying POST as 201.
    // store.set() passes { conditions } correctly and returns modified:false on 412.
    if (onlyIfNew) {
      try {
        const result = await this.store.set(key, JSON.stringify(value), {
          onlyIfNew: true,
        });
        if (result && result.modified === false) return { modified: false };
        return { modified: true, etag: result && result.etag };
      } catch (err) {
        if (err && /precondition|412|if-none-match/i.test(String(err.message || err))) {
          return { modified: false };
        }
        throw err;
      }
    }
    if (typeof this.store.setJSON === "function") {
      try {
        const result = await this.store.setJSON(key, value);
        if (result && result.modified === false) return { modified: false };
        return { modified: true, etag: result && result.etag };
      } catch (err) {
        if (!err || !/consistency|uncached/i.test(String(err.message || err))) throw err;
      }
    }
    const result = await this.store.set(key, JSON.stringify(value), {
      contentType: "application/json",
    });
    if (result && result.modified === false) return { modified: false };
    return { modified: true, etag: result && result.etag };
  }
  async _getJson(key) {
    // Use store default consistency. Do NOT force consistency:"strong" on get
    // after an eventual set — that combination can miss the just-written key
    // (persist_verify_miss in production).
    try {
      const asJson = await this.store.get(key, { type: "json" });
      if (asJson != null) return asJson;
    } catch {
      /* try text */
    }
    try {
      const text = await this.store.get(key, { type: "text" });
      if (!text) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  async getByIdempotency(key) {
    const h = crypto.createHash("sha256").update(key).digest("hex").slice(0, 40);
    try {
      const raw = await this._getJson(`idem/${h}`);
      if (!raw?.lead_id) return null;
      return this.get(raw.lead_id);
    } catch {
      return null;
    }
  }
  async get(id) {
    try {
      return (await this._getJson(this._recordKey(id))) || null;
    } catch {
      return null;
    }
  }
  async put(record, { onlyIfNew = false } = {}) {
    // Lead body first (same order as pre-idempotency-hardening path that worked in prod).
    // onlyIfNew: concurrent/retry must not overwrite or re-deliver an existing lead.
    const write = await this._setJson(this._recordKey(record.lead_id), record, { onlyIfNew });
    if (onlyIfNew && write && write.modified === false) {
      // Precondition failed — key exists. Brief get retry (eventual read lag).
      let existing = await this.get(record.lead_id);
      if (!existing) {
        await new Promise((r) => setTimeout(r, 150));
        existing = await this.get(record.lead_id);
      }
      throw alreadyExistsError(existing);
    }
    if (record.idempotency_key) {
      const h = crypto.createHash("sha256").update(record.idempotency_key).digest("hex").slice(0, 40);
      await this._setJson(`idem/${h}`, { lead_id: record.lead_id });
    }
    return record;
  }
  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
    return this.put(next);
  }
  async delete(id) {
    const cur = await this.get(id);
    if (!cur) return false;
    await this.store.delete(this._recordKey(id));
    if (cur.idempotency_key) {
      const h = crypto.createHash("sha256").update(cur.idempotency_key).digest("hex").slice(0, 40);
      try {
        await this.store.delete(`idem/${h}`);
      } catch {
        /* ignore */
      }
    }
    return true;
  }
  async list() {
    const out = [];
    if (!this.store || typeof this.store.list !== "function") return out;
    try {
      let cursor;
      do {
        const page = await this.store.list({ prefix: this.prefix, cursor });
        const blobs = page.blobs || [];
        for (const b of blobs) {
          const key = b.key || b;
          const id = String(key).startsWith(this.prefix)
            ? String(key).slice(this.prefix.length)
            : String(key);
          const rec = await this.get(id);
          if (rec) out.push(rec);
        }
        cursor = page.cursor || page.next_cursor;
        if (!page.truncated) break;
      } while (cursor);
    } catch (err) {
      safeLog("warn", "blobs_list_fail", {
        reason: err && err.message ? String(err.message).slice(0, 80) : "fail",
      });
    }
    return out;
  }
}

/** Singleton memory for cold-start-friendly rate buckets in same instance */
const globalMemory = new MemoryStore();

/**
 * HTTP durable store: POST JSON to create; optional GET for idempotency lookup.
 * Compatible with n8n/Make/Supabase Edge/Airtable proxy that returns the record.
 */
class HttpStore {
  constructor({ baseUrl, token, getUrlTemplate }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token || "";
    this.getUrlTemplate = getUrlTemplate || "";
  }
  _headers() {
    const h = { "Content-Type": "application/json", Accept: "application/json" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }
  async getByIdempotency(key) {
    if (!this.getUrlTemplate) return null;
    try {
      const url = this.getUrlTemplate.replace("{idempotency_key}", encodeURIComponent(key));
      const res = await fetch(url, { headers: this._headers() });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.lead_id ? data : null;
    } catch {
      return null;
    }
  }
  async get(id) {
    try {
      const res = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, {
        headers: this._headers(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
  async put(record, { onlyIfNew = false } = {}) {
    if (onlyIfNew) {
      const existing = await this.get(record.lead_id);
      if (existing && existing.lead_id) throw alreadyExistsError(existing);
    }
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      const err = new Error(`http_store_${res.status}`);
      throw err;
    }
    return record;
  }
  async update(id, patch) {
    const cur = (await this.get(id)) || { lead_id: id };
    const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: this._headers(),
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      // Some backends only support POST upsert
      return this.put(next);
    }
    return next;
  }
  async delete(id) {
    try {
      await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: this._headers(),
      });
      return true;
    } catch {
      return false;
    }
  }
}


/**
 * Production-like profile: Netlify production context or NODE_ENV=production.
 * Memory fallback and LEAD_ALLOW_MEMORY_FALLBACK are forbidden here.
 */
function isProductionProfile(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "").toLowerCase();
  const context = String(env.CONTEXT || env.NETLIFY_CONTEXT || "").toLowerCase();
  if (nodeEnv === "production") return true;
  if (context === "production") return true;
  return false;
}

function memoryFallbackAllowed(env = process.env) {
  if (isProductionProfile(env)) return false;
  if (env.LEAD_ALLOW_MEMORY_FALLBACK === "1") return true;
  if (String(env.NODE_ENV || "").toLowerCase() === "test") return true;
  return false;
}

function assertProductionStorePolicy(env = process.env) {
  if (!isProductionProfile(env)) return { ok: true };
  if (env.LEAD_ALLOW_MEMORY_FALLBACK === "1") {
    return {
      ok: false,
      code: "memory_fallback_forbidden_in_production",
      message: "LEAD_ALLOW_MEMORY_FALLBACK must not be set in production profile",
    };
  }
  if (env.LEAD_STORE === "memory") {
    return {
      ok: false,
      code: "memory_store_forbidden_in_production",
      message: "LEAD_STORE=memory is forbidden in production profile",
    };
  }
  return { ok: true };
}

async function createStore(options = {}) {
  if (options.store) return options.store;
  const policy = assertProductionStorePolicy(process.env);
  if (!policy.ok) {
    safeLog("error", "store_policy_violation", { code: policy.code });
    return null;
  }
  if (process.env.LEAD_STORE === "memory" || options.forceMemory) {
    if (isProductionProfile()) {
      safeLog("error", "store_memory_blocked_production", {});
      return null;
    }
    return Object.assign(globalMemory, { ephemeral: true });
  }
  if (process.env.LEAD_STORE_DIR) {
    return new FileStore(process.env.LEAD_STORE_DIR);
  }
  // Explicit HTTP durable backend (n8n/Airtable/Supabase proxy)
  if (process.env.LEAD_STORE_HTTP_URL) {
    return new HttpStore({
      baseUrl: process.env.LEAD_STORE_HTTP_URL,
      token: process.env.LEAD_STORE_HTTP_TOKEN,
      getUrlTemplate: process.env.LEAD_STORE_HTTP_GET_IDEMPOTENCY_URL || "",
    });
  }
  // Prefer Netlify Blobs in production (auto context or manual siteID+token)
  try {
    // eslint-disable-next-line import/no-unresolved
    const blobs = require("@netlify/blobs");
    const siteID =
      process.env.NETLIFY_BLOBS_SITE_ID ||
      process.env.SITE_ID ||
      process.env.NETLIFY_SITE_ID ||
      "";
    const token =
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.NETLIFY_API_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN ||
      "";
    let store;
    if (siteID && token) {
      // Do not set consistency:"strong" here — production Lambda context is not
      // always configured for strong reads (BlobsConsistencyError → 503).
      store = blobs.getStore({
        name: "confenge-leads",
        siteID,
        token,
      });
      safeLog("info", "store_blobs_manual_creds", { site_len: siteID.length });
    } else {
      // Context from connectLambda(event) / NETLIFY_BLOBS_CONTEXT
      store = blobs.getStore("confenge-leads");
    }
    return new NetlifyBlobsStore(store);
  } catch (err) {
    safeLog("warn", "store_blobs_unavailable", {
      reason: err && err.message ? String(err.message).slice(0, 160) : "unknown",
      has_context: Boolean(process.env.NETLIFY_BLOBS_CONTEXT),
      has_site: Boolean(process.env.SITE_ID || process.env.NETLIFY_SITE_ID),
    });
  }
  // Last resort: memory (ephemeral) — never in production profile
  if (memoryFallbackAllowed(process.env)) {
    return Object.assign(globalMemory, { ephemeral: true });
  }
  return null;
}

function buildLeadRecord({ lead_id, lead, received_at, ip_hash, fingerprint, status, headers }) {
  const retention = Number(process.env.LEAD_RETAIN_DAYS || 730);
  const delete_after = new Date(Date.now() + retention * 864e5).toISOString();
  let commercial = {};
  try {
    const { commercialDefaults } = require("./lead-stages.cjs");
    commercial = commercialDefaults(received_at);
  } catch {
    commercial = {
      commercial_stage: "lead_persisted",
      stage_history: [{ at: received_at, from: "form_started", to: "lead_persisted", actor: "system" }],
      owner: null,
      next_action: "first_contact",
      last_contact_at: null,
      loss_reason: null,
      proposal_value: null,
      contract_value: null,
      revenue_received: null,
      ops_notes: [],
    };
  }

  let kindInfo = {
    record_kind: "internal",
    signals: ["classifier_unavailable"],
    classified_at: received_at,
    classifier: "classifier_error_fail_closed",
  };
  try {
    const { resolveRecordKind, RECORD_KINDS } = require("./record-kind.cjs");
    const classified = resolveRecordKind(lead || {}, { headers });
    if (
      !classified ||
      !Array.isArray(RECORD_KINDS) ||
      !RECORD_KINDS.includes(classified.record_kind)
    ) {
      throw new Error("record_kind_classifier_invalid_result");
    }
    kindInfo = {
      ...classified,
      classified_at: classified.classified_at || received_at,
    };
  } catch {
    kindInfo = {
      record_kind: "internal",
      signals: ["classifier_unavailable"],
      classified_at: received_at,
      classifier: "classifier_error_fail_closed",
    };
    safeLog("error", "record_kind_classifier_fail_closed", {
      lead_id: String(lead_id || "").slice(0, 64),
      fallback_kind: "internal",
    });
  }

  const audit = [
    { at: received_at, event: "created", status: status || "persisted" },
  ];
  try {
    const { kindAuditEntry } = require("./record-kind.cjs");
    audit.push(
      kindAuditEntry({
        from: null,
        to: kindInfo.record_kind,
        signals: kindInfo.signals,
        actor: "system",
        note: kindInfo.classifier,
      })
    );
  } catch {
    audit.push({
      at: received_at,
      event: "record_kind",
      to: kindInfo.record_kind,
      signals: kindInfo.signals || [],
    });
  }

  // Non-real leads never enter commercial next_action queue
  const nextAction =
    kindInfo.record_kind === "real" ? commercial.next_action : "exclude_from_commercial";

  return {
    lead_id,
    status: status || "persisted",
    record_kind: kindInfo.record_kind,
    record_kind_signals: kindInfo.signals || [],
    record_kind_classified_at: kindInfo.classified_at || received_at,
    commercial_stage: commercial.commercial_stage || "lead_persisted",
    stage_history: commercial.stage_history || [],
    owner: commercial.owner,
    next_action: nextAction,
    last_contact_at: commercial.last_contact_at,
    loss_reason: commercial.loss_reason,
    proposal_value: commercial.proposal_value,
    contract_value: commercial.contract_value,
    revenue_received: commercial.revenue_received,
    ops_notes: commercial.ops_notes || [],
    session_id: lead.session_id || lead.sid || null,
    previous_page: lead.previous_page || lead.referrer || null,
    cta_id: lead.cta_id || null,
    offer_id: lead.offer_id || null,
    received_at,
    updated_at: received_at,
    delete_after,
    nome: lead.nome,
    telefone: lead.telefone,
    email: lead.email,
    empresa: lead.empresa,
    estagio: lead.estagio,
    jornada: lead.jornada,
    urgencia: lead.urgencia,
    mensagem: lead.mensagem,
    consentimento: true,
    origem: lead.origem,
    landing_page: lead.landing_page,
    landing_url: lead.landing_url || lead.landing_page || null,
    referrer: lead.referrer,
    utm_source: lead.utm_source,
    utm_medium: lead.utm_medium,
    utm_campaign: lead.utm_campaign,
    utm_content: lead.utm_content,
    utm_term: lead.utm_term,
    content_cluster: lead.content_cluster,
    asset_id: lead.asset_id || null,
    route_family: lead.route_family || null,
    public_contract_id: lead.public_contract_id || null,
    public_entity_id: lead.public_entity_id || null,
    public_id_slug: lead.public_id_slug || null,
    correlation_id: lead.correlation_id || null,
    analysis_id: lead.analysis_id || null,
    evidence_pack_version: lead.evidence_pack_version || null,
    asset_family: lead.asset_family || null,
    cnpj: lead.cnpj || null,
    // Radar Decisório purchase parameters. Durable record of what was bought;
    // never rendered into analytics, fixtures or git.
    radar_params: lead.radar_params || null,
    external_reference: lead.external_reference || null,
    source: "CONFENGE_WEB",
    idempotency_key: lead.idempotency_key,
    ip_hash,
    fingerprint,
    delivery: {
      notify: { status: "pending", attempts: 0 },
      email: { status: "pending", attempts: 0 },
    },
    audit,
  };
}

module.exports = {
  MemoryStore,
  FileStore,
  NetlifyBlobsStore,
  createStore,
  buildLeadRecord,
  globalMemory,
  isProductionProfile,
  memoryFallbackAllowed,
  assertProductionStorePolicy,
};
