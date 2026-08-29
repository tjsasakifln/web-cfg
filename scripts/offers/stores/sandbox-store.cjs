/**
 * Injected Sandbox store: put-if-absent, get, append event, mark processed.
 * Memory/file for tests. The public runtime uses the host-owned filesystem adapter.
 * The Netlify Blobs adapter is legacy preview compatibility. Never process memory
 * as a runtime dedupe guarantee.
 */
const crypto = require("crypto");
const { HostFileBackend } = require("../../../netlify/functions/lib/host-file-store.cjs");
const {
  isProductionProfile,
  resolveStorageConfig,
  createHostBackend,
  loadLegacyNetlifyStore,
} = require("../../../netlify/functions/lib/storage-config.cjs");

const DEFAULT_TTL_MS = 48 * 3600 * 1000;

function alreadyExists(existing) {
  const err = new Error("already_exists");
  err.code = "ALREADY_EXISTS";
  err.existing = existing || null;
  return err;
}

function expired(record, now) {
  if (!record || !record.expires_at) return false;
  return new Date(record.expires_at).getTime() <= now.getTime();
}

class MemoryOfferStore {
  constructor({ clock } = {}) {
    this.clock = clock || { now: () => new Date() };
    this.map = new Map();
    this.events = [];
    this.processed = new Map();
  }
  async get(key) {
    const rec = this.map.get(key);
    if (!rec) return null;
    if (expired(rec, this.clock.now())) {
      this.map.delete(key);
      return null;
    }
    return rec;
  }
  async putIfAbsent(key, value, { ttlMs = DEFAULT_TTL_MS } = {}) {
    const current = this.map.get(key);
    if (current && !expired(current, this.clock.now())) {
      return { inserted: false, value: current };
    }
    const now = this.clock.now();
    const record = {
      ...value,
      store_key: key,
      created_at: value.created_at || now.toISOString(),
      expires_at: value.expires_at || new Date(now.getTime() + ttlMs).toISOString(),
    };
    this.map.set(key, record);
    return { inserted: true, value: record };
  }
  async put(key, value) {
    const now = this.clock.now();
    const record = { ...value, store_key: key, updated_at: now.toISOString() };
    this.map.set(key, record);
    return record;
  }
  async appendCanonicalEvent(event) {
    if (event && event.event_id) {
      const result = await this.putIfAbsent(`event:${event.event_id}`, {
        kind: "canonical_event",
        environment: "sandbox",
        event,
      });
      if (result.inserted) this.events.push(event);
      return result;
    }
    this.events.push(event);
    return { inserted: true, value: event };
  }
  async markProviderEventProcessed(providerEventId, meta = {}) {
    const key = `processed:${providerEventId}`;
    const result = await this.putIfAbsent(key, {
      kind: "processed_provider_event",
      environment: "sandbox",
      provider_event_id: providerEventId,
      ...meta,
    });
    this.processed.set(providerEventId, result.value);
    return result;
  }
  async isProviderEventProcessed(providerEventId) {
    const rec = await this.get(`processed:${providerEventId}`);
    return Boolean(rec);
  }
}

class FileOfferStore {
  constructor(dir, { clock, namespace = "offers-sandbox", backend } = {}) {
    this.dir = dir;
    this.clock = clock || { now: () => new Date() };
    this.backend = backend || new HostFileBackend(dir);
    this.records = this.backend.namespace(namespace);
  }
  async get(key) {
    const rec = this.records.get(String(key));
    if (!rec) return null;
    if (expired(rec, this.clock.now())) {
      this.records.delete(String(key));
      return null;
    }
    return rec;
  }
  async putIfAbsent(key, value, { ttlMs = DEFAULT_TTL_MS } = {}) {
    return this.backend.withExclusiveLock(() => {
      const logicalKey = String(key);
      const current = this.records.get(logicalKey);
      if (current && !expired(current, this.clock.now())) {
        return { inserted: false, value: current };
      }
      if (current) this.records._deleteUnlocked(logicalKey);
      const now = this.clock.now();
      const record = {
        ...value,
        store_key: key,
        created_at: value.created_at || now.toISOString(),
        expires_at: value.expires_at || new Date(now.getTime() + ttlMs).toISOString(),
      };
      return this.records._putUnlocked(logicalKey, record, { onlyIfNew: true });
    });
  }
  async put(key, value) {
    const now = this.clock.now();
    const record = { ...value, store_key: key, updated_at: now.toISOString() };
    this.records.put(String(key), record);
    return record;
  }
  async delete(key) {
    return this.records.delete(String(key));
  }
  async list() {
    return this.records.list().map((row) => row.value);
  }
  async appendCanonicalEvent(event) {
    if (event && event.event_id) {
      return this.putIfAbsent(`event:${event.event_id}`, {
        kind: "canonical_event",
        environment: "sandbox",
        event,
      });
    }
    return { inserted: true, value: event };
  }
  async markProviderEventProcessed(providerEventId, meta = {}) {
    return this.putIfAbsent(`processed:${providerEventId}`, {
      kind: "processed_provider_event",
      environment: "sandbox",
      provider_event_id: providerEventId,
      ...meta,
    });
  }
  async isProviderEventProcessed(providerEventId) {
    return Boolean(await this.get(`processed:${providerEventId}`));
  }
}

class NetlifyBlobsOfferStore {
  constructor(blobsStore, { clock, keyPrefix = "offers-sandbox/" } = {}) {
    this.store = blobsStore;
    this.clock = clock || { now: () => new Date() };
    this.keyPrefix = keyPrefix;
  }
  _key(key) {
    const h = crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 40);
    return `${this.keyPrefix}${h}`;
  }
  async _read(key) {
    try {
      const text = await this.store.get(this._key(key), { type: "text" });
      if (!text) return null;
      const rec = JSON.parse(text);
      if (expired(rec, this.clock.now())) return null;
      return rec;
    } catch {
      return null;
    }
  }
  async get(key) {
    return this._read(key);
  }
  async putIfAbsent(key, value, { ttlMs = DEFAULT_TTL_MS } = {}) {
    const now = this.clock.now();
    const record = {
      ...value,
      store_key: key,
      created_at: value.created_at || now.toISOString(),
      expires_at: value.expires_at || new Date(now.getTime() + ttlMs).toISOString(),
    };
    try {
      const result = await this.store.set(this._key(key), JSON.stringify(record), { onlyIfNew: true });
      if (result && result.modified === false) {
        return { inserted: false, value: await this._read(key) };
      }
      return { inserted: true, value: record };
    } catch (err) {
      if (err && /precondition|412|if-none-match|already/i.test(String(err.message || err))) {
        return { inserted: false, value: await this._read(key) };
      }
      throw err;
    }
  }
  async put(key, value) {
    const now = this.clock.now();
    const record = { ...value, store_key: key, updated_at: now.toISOString() };
    await this.store.set(this._key(key), JSON.stringify(record));
    return record;
  }
  async appendCanonicalEvent(event) {
    if (event && event.event_id) {
      return this.putIfAbsent(`event:${event.event_id}`, {
        kind: "canonical_event",
        environment: "sandbox",
        event,
      });
    }
    return { inserted: true, value: event };
  }
  async markProviderEventProcessed(providerEventId, meta = {}) {
    return this.putIfAbsent(`processed:${providerEventId}`, {
      kind: "processed_provider_event",
      environment: "sandbox",
      provider_event_id: providerEventId,
      ...meta,
    });
  }
  async isProviderEventProcessed(providerEventId) {
    return Boolean(await this.get(`processed:${providerEventId}`));
  }
}

async function createSandboxStore(options = {}) {
  if (options.store) return options.store;
  const env = options.env || process.env;
  const clock = options.clock;
  if (options.forceUnavailable) return null;
  const cfgEnv = env.ASAAS_SANDBOX_STORE_DIR && !env.CONFENGE_STORAGE_BACKEND
    ? { ...env, LEAD_STORE_DIR: env.ASAAS_SANDBOX_STORE_DIR }
    : env;
  const cfg = resolveStorageConfig(cfgEnv, options.event, { allowTestMemory: options.allowMemory === true });
  if (cfg.ok && cfg.backend === "filesystem") {
    const opened = createHostBackend(cfgEnv, { event: options.event });
    return opened.backend
      ? new FileOfferStore(cfg.root, { clock, namespace: "offers-sandbox", backend: opened.backend })
      : null;
  }
  if (cfg.ok && cfg.backend === "netlify-blobs") try {
    const store = loadLegacyNetlifyStore("confenge-offers-sandbox", env, options.event);
    return new NetlifyBlobsOfferStore(store, { clock });
  } catch {
    /* blobs unavailable */
  }
  if (options.allowMemory === true && cfg.ok && cfg.backend === "memory") {
    return new MemoryOfferStore({ clock });
  }
  return null;
}

async function createProductionStore(options = {}) {
  if (options.store) return options.store;
  const env = options.env || process.env;
  const clock = options.clock;
  if (options.forceUnavailable) return null;
  const cfgEnv = env.ASAAS_PRODUCTION_STORE_DIR && !env.CONFENGE_STORAGE_BACKEND
    ? { ...env, LEAD_STORE_DIR: env.ASAAS_PRODUCTION_STORE_DIR }
    : env;
  const cfg = resolveStorageConfig(cfgEnv, options.event, { allowTestMemory: options.allowMemory === true });
  if (cfg.ok && cfg.backend === "filesystem") {
    const opened = createHostBackend(cfgEnv, { event: options.event });
    return opened.backend
      ? new FileOfferStore(cfg.root, { clock, namespace: "offers-production", backend: opened.backend })
      : null;
  }
  if (cfg.ok && cfg.backend === "netlify-blobs") try {
    const store = loadLegacyNetlifyStore("confenge-offers-production", env, options.event);
    return new NetlifyBlobsOfferStore(store, { clock, keyPrefix: "offers-production/" });
  } catch {
    /* blobs unavailable */
  }
  if (options.allowMemory === true && cfg.ok && cfg.backend === "memory") {
    return new MemoryOfferStore({ clock });
  }
  return null;
}

async function resolveProductionStore(deps, event) {
  if (Object.prototype.hasOwnProperty.call(deps, "store")) return deps.store;
  return createProductionStore({
    env: deps.env || process.env,
    event,
    clock: deps.clock,
    allowMemory: false,
  });
}

module.exports = {
  DEFAULT_TTL_MS,
  alreadyExists,
  MemoryOfferStore,
  FileOfferStore,
  NetlifyBlobsOfferStore,
  createSandboxStore,
  createProductionStore,
  resolveProductionStore,
  isProductionProfile,
};
