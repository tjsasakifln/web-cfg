"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { STORE_TTL_SECONDS } = require("./constants.cjs");
const { isExpired } = require("./token.cjs");

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
    return this.get(id);
  }
  async get(id) {
    const rec = this.map.get(id) || null;
    if (!rec) return null;
    if (isExpired(rec.expires_at, new Date())) {
      await this.delete(id);
      return null;
    }
    return rec;
  }
  async put(record, { onlyIfNew = false } = {}) {
    const id = record.token || record.id;
    if (onlyIfNew && this.map.has(id)) {
      throw alreadyExistsError(this.map.get(id));
    }
    this.map.set(id, record);
    if (record.idempotency_key) this.byIdem.set(record.idempotency_key, id);
    return record;
  }
  async delete(id) {
    const cur = this.map.get(id);
    if (cur && cur.idempotency_key) this.byIdem.delete(cur.idempotency_key);
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
      const { token } = JSON.parse(fs.readFileSync(p, "utf8"));
      return this.get(token);
    } catch {
      return null;
    }
  }
  async get(id) {
    try {
      const p = this._path(id);
      if (!fs.existsSync(p)) return null;
      const rec = JSON.parse(fs.readFileSync(p, "utf8"));
      if (isExpired(rec.expires_at, new Date())) {
        await this.delete(id);
        return null;
      }
      return rec;
    } catch {
      return null;
    }
  }
  async put(record, { onlyIfNew = false } = {}) {
    const id = record.token || record.id;
    if (onlyIfNew && fs.existsSync(this._path(id))) {
      throw alreadyExistsError(await this.get(id));
    }
    fs.writeFileSync(this._path(id), JSON.stringify(record), "utf8");
    if (record.idempotency_key) {
      fs.writeFileSync(this._idemPath(record.idempotency_key), JSON.stringify({ token: id }), "utf8");
    }
    return record;
  }
  async delete(id) {
    const cur = await this.get(id).catch(() => null);
    try {
      fs.unlinkSync(this._path(id));
    } catch {
      /* ignore */
    }
    if (cur && cur.idempotency_key) {
      try {
        fs.unlinkSync(this._idemPath(cur.idempotency_key));
      } catch {
        /* ignore */
      }
    }
    return true;
  }
}

class UnavailableStore {
  async get() {
    throw Object.assign(new Error("store_unavailable"), { code: "STORE_UNAVAILABLE" });
  }
  async getByIdempotency() {
    throw Object.assign(new Error("store_unavailable"), { code: "STORE_UNAVAILABLE" });
  }
  async put() {
    throw Object.assign(new Error("store_unavailable"), { code: "STORE_UNAVAILABLE" });
  }
  async delete() {
    throw Object.assign(new Error("store_unavailable"), { code: "STORE_UNAVAILABLE" });
  }
}

function createStore(env = process.env) {
  if (env.PUBLIC_INTEGRITY_STORE === "unavailable") return new UnavailableStore();
  if (env.PUBLIC_INTEGRITY_STORE_DIR) return new FileStore(env.PUBLIC_INTEGRITY_STORE_DIR);
  if (env.NODE_ENV === "test" || env.PUBLIC_INTEGRITY_MEMORY === "1") return new MemoryStore();
  if (env.PUBLIC_INTEGRITY_STORE_DIR === "") return new MemoryStore();
  try {
    const { getStore } = require("@netlify/blobs");
    return new BlobsStore(getStore("public-integrity-consumer"));
  } catch {
    if (env.LEAD_ALLOW_MEMORY_FALLBACK === "1") return new MemoryStore();
    return new MemoryStore();
  }
}

class BlobsStore {
  constructor(store) {
    this.store = store;
  }
  async get(id) {
    const raw = await this.store.get(id, { type: "json" });
    if (!raw) return null;
    if (isExpired(raw.expires_at, new Date())) {
      await this.delete(id);
      return null;
    }
    return raw;
  }
  async getByIdempotency(key) {
    const h = crypto.createHash("sha256").update(key).digest("hex").slice(0, 40);
    const ptr = await this.store.get(`idem/${h}`, { type: "json" });
    if (!ptr || !ptr.token) return null;
    return this.get(ptr.token);
  }
  async put(record, { onlyIfNew = false } = {}) {
    const id = record.token || record.id;
    if (onlyIfNew) {
      const existing = await this.store.get(id, { type: "json" });
      if (existing) throw alreadyExistsError(existing);
    }
    await this.store.setJSON(id, record);
    if (record.idempotency_key) {
      const h = crypto.createHash("sha256").update(record.idempotency_key).digest("hex").slice(0, 40);
      await this.store.setJSON(`idem/${h}`, { token: id });
    }
    return record;
  }
  async delete(id) {
    try {
      await this.store.delete(id);
    } catch {
      /* ignore */
    }
    return true;
  }
}

function defaultTtlSeconds() {
  return STORE_TTL_SECONDS;
}

module.exports = {
  MemoryStore,
  FileStore,
  UnavailableStore,
  BlobsStore,
  createStore,
  defaultTtlSeconds,
};
