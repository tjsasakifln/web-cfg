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
  async put(record) {
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
  async put(record) {
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
}

class NetlifyBlobsStore {
  constructor(store) {
    this.store = store;
  }
  async getByIdempotency(key) {
    const h = crypto.createHash("sha256").update(key).digest("hex").slice(0, 40);
    try {
      const raw = await this.store.get(`idem/${h}`, { type: "json" });
      if (!raw?.lead_id) return null;
      return this.get(raw.lead_id);
    } catch {
      return null;
    }
  }
  async get(id) {
    try {
      return (await this.store.get(`leads/${id}`, { type: "json" })) || null;
    } catch {
      return null;
    }
  }
  async put(record) {
    await this.store.setJSON(`leads/${record.lead_id}`, record);
    if (record.idempotency_key) {
      const h = crypto.createHash("sha256").update(record.idempotency_key).digest("hex").slice(0, 40);
      await this.store.setJSON(`idem/${h}`, { lead_id: record.lead_id });
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
    await this.store.delete(`leads/${id}`);
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
}

/** Singleton memory for cold-start-friendly rate buckets in same instance */
const globalMemory = new MemoryStore();

async function createStore(options = {}) {
  if (options.store) return options.store;
  if (process.env.LEAD_STORE === "memory" || options.forceMemory) {
    return globalMemory;
  }
  if (process.env.LEAD_STORE_DIR) {
    return new FileStore(process.env.LEAD_STORE_DIR);
  }
  // Prefer Netlify Blobs in production
  try {
    // Dynamic require so local unit tests without the package still load lead-core
    // eslint-disable-next-line import/no-unresolved
    const { getStore } = require("@netlify/blobs");
    const store = getStore({ name: "confenge-leads", consistency: "strong" });
    return new NetlifyBlobsStore(store);
  } catch (err) {
    safeLog("warn", "store_blobs_unavailable", {
      reason: err && err.message ? String(err.message).slice(0, 120) : "unknown",
    });
  }
  // Last resort: memory (ephemeral) — handler must treat as non-durable for success policy
  if (process.env.LEAD_ALLOW_MEMORY_FALLBACK === "1" || process.env.NODE_ENV === "test") {
    return Object.assign(globalMemory, { ephemeral: true });
  }
  return null;
}

function buildLeadRecord({ lead_id, lead, received_at, ip_hash, fingerprint, status }) {
  const retention = Number(process.env.LEAD_RETAIN_DAYS || 730);
  const delete_after = new Date(Date.now() + retention * 864e5).toISOString();
  return {
    lead_id,
    status: status || "persisted",
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
    referrer: lead.referrer,
    utm_source: lead.utm_source,
    utm_medium: lead.utm_medium,
    utm_campaign: lead.utm_campaign,
    utm_content: lead.utm_content,
    utm_term: lead.utm_term,
    content_cluster: lead.content_cluster,
    idempotency_key: lead.idempotency_key,
    ip_hash,
    fingerprint,
    delivery: {
      notify: { status: "pending", attempts: 0 },
      email: { status: "pending", attempts: 0 },
    },
    audit: [{ at: received_at, event: "created", status: status || "persisted" }],
  };
}

module.exports = {
  MemoryStore,
  FileStore,
  NetlifyBlobsStore,
  createStore,
  buildLeadRecord,
  globalMemory,
};
