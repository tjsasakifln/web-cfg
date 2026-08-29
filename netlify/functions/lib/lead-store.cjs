/**
 * Durable lead store abstractions.
 * - MemoryStore: tests / local
 * - FileStore: host-owned durable adapter (single VPS)
 * - NetlifyBlobsStore: legacy rollback adapter during migration
 * - Composite: primary + optional mirror webhook for CRM
 */
const crypto = require("crypto");
const { safeLog } = require("./lead-core.cjs");
const { HostFileBackend, sha256 } = require("./host-file-store.cjs");
const {
  isProductionProfile,
  resolveStorageConfig,
  createHostBackend,
  loadLegacyNetlifyStore,
  storageReadiness,
} = require("./storage-config.cjs");

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
    this.system = new Map();
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
    const next = {
      ...cur,
      ...patch,
      lead_id: cur.lead_id,
      idempotency_key: cur.idempotency_key,
      updated_at: new Date().toISOString(),
    };
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
  async getSystemRecord(id) {
    return this.system.get(id) || null;
  }
  async putSystemRecord(id, record) {
    this.system.set(id, record);
    return record;
  }
}

class FileStore {
  constructor(dir, options = {}) {
    this.dir = dir;
    this.namespace = options.namespace || "leads";
    this.backend = options.backend || new HostFileBackend(dir, {
      releaseRoot: options.releaseRoot,
      allowInsideRelease: options.allowInsideRelease,
    });
    this.records = this.backend.namespace(this.namespace);
    this.idempotency = this.backend.namespace(`${this.namespace}-idempotency`);
    this.system = this.backend.namespace("ops-system");
  }
  _findByIdempotencyUnlocked(key, { repair = true } = {}) {
    const indexKey = sha256(String(key));
    const index = this.idempotency.get(indexKey);
    if (index) {
      if (!index.lead_id || index.idempotency_sha256 !== indexKey) {
        const err = new Error("idempotency_index_corrupt");
        err.code = "STORE_CORRUPT";
        throw err;
      }
      const record = this.records.get(index.lead_id);
      if (!record || sha256(String(record.idempotency_key || "")) !== indexKey) {
        const err = new Error("idempotency_index_dangling");
        err.code = "STORE_CORRUPT";
        throw err;
      }
      return record;
    }

    // The record is the source of truth. A crash can happen after the atomic
    // record rename and before the derived idempotency index rename; recover
    // that single-record state under the global writer lock.
    const matches = this.records.list()
      .map((row) => row.value)
      .filter((record) => record && String(record.idempotency_key || "") === String(key));
    if (matches.length > 1) {
      const err = new Error("idempotency_index_corrupt");
      err.code = "STORE_CORRUPT";
      throw err;
    }
    if (matches.length === 1) {
      const record = matches[0];
      if (repair) {
        this.idempotency._putUnlocked(indexKey, {
          lead_id: String(record.lead_id),
          idempotency_sha256: indexKey,
        }, { onlyIfNew: true });
      }
      return record;
    }
    return null;
  }
  async getByIdempotency(key) {
    return this.backend.withExclusiveLock(() => this._findByIdempotencyUnlocked(key));
  }
  async get(id) {
    return this.records.get(String(id));
  }
  async put(record, { onlyIfNew = false } = {}) {
    if (!record || !record.lead_id) {
      const err = new Error("lead_id_required");
      err.code = "STORE_KEY_INVALID";
      throw err;
    }
    return this.backend.withExclusiveLock(() => {
      const id = String(record.lead_id);
      if (record.idempotency_key) {
        const idempotentExisting = this._findByIdempotencyUnlocked(record.idempotency_key);
        if (idempotentExisting && (onlyIfNew || String(idempotentExisting.lead_id) !== id)) {
          throw alreadyExistsError(idempotentExisting);
        }
      }
      const current = this.records.get(id);
      if (onlyIfNew && current) throw alreadyExistsError(current);
      const written = this.records._putUnlocked(id, record, { onlyIfNew });
      if (onlyIfNew && !written.inserted) throw alreadyExistsError(written.value);
      if (record.idempotency_key) {
        const indexKey = sha256(String(record.idempotency_key));
        const index = this.idempotency._putUnlocked(
          indexKey,
          { lead_id: id, idempotency_sha256: indexKey },
          { onlyIfNew: true },
        );
        if (!index.inserted && index.value.lead_id !== id) {
          const idempotentExisting = this.records.get(index.value.lead_id);
          if (!idempotentExisting) {
            const err = new Error("idempotency_index_dangling");
            err.code = "STORE_CORRUPT";
            throw err;
          }
          throw alreadyExistsError(idempotentExisting);
        }
      }
      return record;
    });
  }
  async update(id, patch) {
    return this.backend.withExclusiveLock(() => {
      const cur = this.records.get(String(id));
      if (!cur) return null;
      const next = {
        ...cur,
        ...patch,
        lead_id: cur.lead_id,
        idempotency_key: cur.idempotency_key,
        updated_at: new Date().toISOString(),
      };
      this.records._putUnlocked(String(id), next);
      return next;
    });
  }
  async delete(id) {
    return this.backend.withExclusiveLock(() => {
      const cur = this.records.get(String(id));
      if (!cur) return false;
      this.records._deleteUnlocked(String(id));
      if (cur.idempotency_key) {
        const indexKey = sha256(String(cur.idempotency_key));
        this.idempotency._deleteUnlocked(indexKey);
      }
      return true;
    });
  }
  async list() {
    return this.records.list().map((row) => row.value);
  }
  async getSystemRecord(id) {
    return this.system.get(String(id));
  }
  async putSystemRecord(id, record, { onlyIfNew = false } = {}) {
    const result = this.system.put(String(id), record, { onlyIfNew });
    if (onlyIfNew && !result.inserted) throw alreadyExistsError(result.value);
    return record;
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
    const next = {
      ...cur,
      ...patch,
      lead_id: cur.lead_id,
      idempotency_key: cur.idempotency_key,
      updated_at: new Date().toISOString(),
    };
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
  async getSystemRecord(id) {
    return this._getJson(`system/${id}`);
  }
  async putSystemRecord(id, record) {
    await this._setJson(`system/${id}`, record);
    return record;
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
    const next = {
      ...cur,
      ...patch,
      lead_id: cur.lead_id,
      idempotency_key: cur.idempotency_key,
      updated_at: new Date().toISOString(),
    };
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
function memoryFallbackAllowed(env = process.env) {
  if (isProductionProfile(env)) return false;
  if (env.LEAD_ALLOW_MEMORY_FALLBACK === "1") return true;
  if (String(env.NODE_ENV || "").toLowerCase() === "test") return true;
  return false;
}

function assertProductionStorePolicy(env = process.env, event = null) {
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
  if (env.LEAD_STORE_HTTP_URL) {
    return {
      ok: false,
      code: "http_store_atomic_create_unproven",
      message: "Generic HTTP lead stores are forbidden in production without atomic create-only semantics",
    };
  }
  const storage = resolveStorageConfig(env, event, { allowTestMemory: false });
  if (!storage.ok) {
    return {
      ok: false,
      code: storage.code,
      message: "A durable CONFENGE storage backend must be explicitly configured",
    };
  }
  if (env.LEAD_REQUIRE_ORIGIN !== "1") {
    return {
      ok: false,
      code: "origin_guard_required_in_production",
      message: "LEAD_REQUIRE_ORIGIN=1 is required in production profile",
    };
  }
  if (env.LEAD_REQUIRE_TURNSTILE !== "1") {
    return {
      ok: false,
      code: "turnstile_guard_required_in_production",
      message: "LEAD_REQUIRE_TURNSTILE=1 is required in production profile",
    };
  }
  if (String(env.TURNSTILE_SECRET_KEY || "").length < 16) {
    return {
      ok: false,
      code: "turnstile_secret_required_in_production",
      message: "TURNSTILE_SECRET_KEY must be configured in production profile",
    };
  }
  if (String(env.IP_HASH_SALT || "").length < 32 || env.IP_HASH_SALT === "confenge") {
    return {
      ok: false,
      code: "ip_hash_salt_required_in_production",
      message: "IP_HASH_SALT must be a private value of at least 32 characters in production profile",
    };
  }
  return { ok: true };
}

async function createStore(options = {}) {
  if (options.store) return options.store;
  const env = options.env || process.env;
  const event = options.event || (options && options.httpMethod ? options : null);
  const policy = assertProductionStorePolicy(env, event);
  if (!policy.ok) {
    safeLog("error", "store_policy_violation", { code: policy.code });
    return null;
  }
  if (options.forceMemory) {
    if (isProductionProfile(env)) {
      safeLog("error", "store_memory_blocked_production", {});
      return null;
    }
    return Object.assign(globalMemory, { ephemeral: true });
  }
  const cfg = resolveStorageConfig(env, event, { allowTestMemory: true });
  if (!cfg.ok) {
    safeLog("error", "store_configuration_invalid", { code: cfg.code });
    return null;
  }
  if (cfg.backend === "memory") {
    if (isProductionProfile(env)) return null;
    return Object.assign(globalMemory, { ephemeral: true });
  }
  if (cfg.backend === "filesystem") {
    const opened = createHostBackend(env, { event, releaseRoot: options.releaseRoot });
    if (!opened.backend) {
      safeLog("error", "store_filesystem_unavailable", { code: opened.config.code });
      return null;
    }
    return new FileStore(cfg.root, { backend: opened.backend, namespace: options.namespace || "leads" });
  }
  if (cfg.backend === "http") {
    return new HttpStore({
      baseUrl: env.LEAD_STORE_HTTP_URL,
      token: env.LEAD_STORE_HTTP_TOKEN,
      getUrlTemplate: env.LEAD_STORE_HTTP_GET_IDEMPOTENCY_URL || "",
    });
  }
  // Legacy rollback adapter. Dependency loading is conditional on selection.
  try {
    const store = loadLegacyNetlifyStore("confenge-leads", env, event);
    return new NetlifyBlobsStore(store);
  } catch (err) {
    safeLog("warn", "store_blobs_unavailable", {
      reason: err && err.message ? String(err.message).slice(0, 160) : "unknown",
      has_context: Boolean(env.NETLIFY_BLOBS_CONTEXT),
      has_site: Boolean(env.SITE_ID || env.NETLIFY_SITE_ID),
    });
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
    deliverable_id: lead.deliverable_id || null,
    analysis_cutoff: lead.analysis_cutoff || null,
    opportunity_deadline: lead.opportunity_deadline || null,
    contract_event: lead.contract_event || null,
    contract_stage: lead.contract_stage || null,
    contract_value_band: lead.contract_value_band || null,
    lot_count: lead.lot_count || null,
    execution_regime: lead.execution_regime || null,
    decision_intent: lead.decision_intent || null,
    faixa_contrato: lead.faixa_contrato || null,
    risco_em_jogo: lead.risco_em_jogo || null,
    frequencia: lead.frequencia || null,
    maturidade_documental: lead.maturidade_documental || null,
    capacidade_interna: lead.capacidade_interna || null,
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
  storageReadiness,
};
