/**
 * Injected Sandbox store: put-if-absent, get, append event, mark processed.
 * Memory/file for tests. Netlify Blobs for function runtime. Never process memory
 * as the serverless dedupe guarantee.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
  constructor(dir, { clock } = {}) {
    this.dir = dir;
    this.clock = clock || { now: () => new Date() };
    fs.mkdirSync(dir, { recursive: true });
  }
  _path(key) {
    const h = crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 40);
    return path.join(this.dir, `${h}.json`);
  }
  async get(key) {
    try {
      const file = this._path(key);
      if (!fs.existsSync(file)) return null;
      const rec = JSON.parse(fs.readFileSync(file, "utf8"));
      if (expired(rec, this.clock.now())) {
        try { fs.unlinkSync(file); } catch { /* ignore */ }
        return null;
      }
      return rec;
    } catch {
      return null;
    }
  }
  async putIfAbsent(key, value, { ttlMs = DEFAULT_TTL_MS } = {}) {
    const file = this._path(key);
    if (fs.existsSync(file)) {
      const existing = await this.get(key);
      if (existing) return { inserted: false, value: existing };
    }
    const now = this.clock.now();
    const record = {
      ...value,
      store_key: key,
      created_at: value.created_at || now.toISOString(),
      expires_at: value.expires_at || new Date(now.getTime() + ttlMs).toISOString(),
    };
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record), { flag: "wx" });
    try {
      fs.linkSync(tmp, file);
      fs.unlinkSync(tmp);
      return { inserted: true, value: record };
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      if (err && err.code === "EEXIST") {
        return { inserted: false, value: await this.get(key) };
      }
      throw err;
    }
  }
  async put(key, value) {
    const now = this.clock.now();
    const record = { ...value, store_key: key, updated_at: now.toISOString() };
    fs.writeFileSync(this._path(key), JSON.stringify(record));
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

class NetlifyBlobsOfferStore {
  constructor(blobsStore, { clock } = {}) {
    this.store = blobsStore;
    this.clock = clock || { now: () => new Date() };
  }
  _key(key) {
    const h = crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 40);
    return `offers-sandbox/${h}`;
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

function isProductionProfile(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "").toLowerCase();
  const context = String(env.CONTEXT || env.NETLIFY_CONTEXT || "").toLowerCase();
  return nodeEnv === "production" || context === "production";
}

async function createSandboxStore(options = {}) {
  if (options.store) return options.store;
  const env = options.env || process.env;
  const clock = options.clock;
  if (options.forceUnavailable) return null;
  if (env.ASAAS_SANDBOX_STORE_DIR) {
    return new FileOfferStore(env.ASAAS_SANDBOX_STORE_DIR, { clock });
  }
  try {
    // eslint-disable-next-line import/no-unresolved
    const blobs = require("@netlify/blobs");
    if (options.event && options.event.blobs) {
      try { blobs.connectLambda(options.event); } catch { /* context already bound */ }
    }
    const siteID = env.NETLIFY_BLOBS_SITE_ID || env.SITE_ID || env.NETLIFY_SITE_ID || "";
    const token = env.NETLIFY_BLOBS_TOKEN || env.NETLIFY_API_TOKEN || env.NETLIFY_AUTH_TOKEN || "";
    let store;
    if (siteID && token) {
      store = blobs.getStore({ name: "confenge-offers-sandbox", siteID, token });
    } else if (env.NETLIFY_BLOBS_CONTEXT || (options.event && options.event.blobs)) {
      store = blobs.getStore("confenge-offers-sandbox");
    }
    if (store) return new NetlifyBlobsOfferStore(store, { clock });
  } catch {
    /* blobs unavailable */
  }
  if (options.allowMemory === true && !isProductionProfile(env)) {
    return new MemoryOfferStore({ clock });
  }
  return null;
}

module.exports = {
  DEFAULT_TTL_MS,
  alreadyExists,
  MemoryOfferStore,
  FileOfferStore,
  NetlifyBlobsOfferStore,
  createSandboxStore,
  isProductionProfile,
};
