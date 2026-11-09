"use strict";

const { parentPort } = require("node:worker_threads");
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const { readFile, realpath, stat } = require("node:fs/promises");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { todayInBrazil, monthsAgo } = require("./market-radar-dates.cjs");

const POINTER_SCHEMA = "confenge.market-radar.pointer/v1";
const DATA_SCHEMA = "confenge.market-radar/v1";
const MAX_BYTES = 4 * 1024 * 1024 * 1024;
const PAGE_SIZE = 25;
const CACHE_MAX = 96;
const CACHE_TTL = 20_000;
const CACHE_MAX_BYTES = 8 * 1024 * 1024;
let active = null;
let loading = null;
const cache = new Map();
let cacheBytes = 0;

function fail(code, message, status = 503) {
  const error = new Error(message || code);
  error.code = code;
  error.status = status;
  return error;
}

function instant(value, name) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) throw fail("snapshot_invalid", `${name} inválido`);
  return ms;
}

function validateMeta(meta, now = Date.now()) {
  if (!meta || meta.schema !== DATA_SCHEMA || meta.state !== "READY" || meta.source !== "PNCP" || meta.producer !== "extra-cli") {
    throw fail("snapshot_invalid", "Metadados do radar são incompatíveis.");
  }
  if (meta.value_aggregation !== false) throw fail("snapshot_invalid", "Política financeira do snapshot é incompatível.");
  const generated = instant(meta.generated_at, "generated_at");
  const source = instant(meta.source_as_of, "source_as_of");
  const ingestion = instant(meta.ingestion_latest_at, "ingestion_latest_at");
  if (generated > now + 300_000 || source > now + 300_000 || ingestion > now + 300_000) throw fail("snapshot_invalid", "Snapshot futuro recusado.");
  if (now - generated > 36 * 3600_000 || now - source > 48 * 3600_000 || now - ingestion > 48 * 3600_000) {
    throw fail("data_stale", "Os dados estão desatualizados.");
  }
  for (const key of ["window_start", "window_end", "coverage_note", "value_note"]) {
    if (!String(meta[key] || "").trim()) throw fail("snapshot_invalid", `Metadado ausente: ${key}`);
  }
  if (!Number.isSafeInteger(meta.record_count) || meta.record_count <= 0 || !Number.isSafeInteger(meta.excluded_count) || meta.excluded_count < 0) {
    throw fail("snapshot_invalid", "Contagens do snapshot são inválidas.");
  }
  if (String(meta.coverage_note).length > 1000 || String(meta.value_note).length > 1000 || !Array.isArray(meta.limitations) || meta.limitations.length > 12 || !meta.limitations.every((x) => typeof x === "string" && x.length <= 500)) {
    throw fail("snapshot_invalid", "Limitações do snapshot são inválidas.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.window_start) || !/^\d{4}-\d{2}-\d{2}$/.test(meta.window_end) || meta.window_start > meta.window_end || source > generated || ingestion > generated) {
    throw fail("snapshot_invalid", "Janela ou ordem temporal do snapshot é inválida.");
  }
}

async function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function signature(info) {
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}`;
}

async function resolveSnapshot(canonicalRoot, pointerInfo) {
  const pointerPath = path.join(canonicalRoot, "current.json");
  if (!pointerInfo.isFile() || pointerInfo.size < 100 || pointerInfo.size > 128 * 1024) throw fail("snapshot_invalid", "Tamanho do ponteiro é inválido.");
  let pointer;
  try {
    pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  } catch {
    throw fail("snapshot_invalid", "Ponteiro do radar inválido.");
  }
  if (pointer.schema !== POINTER_SCHEMA || !/^snapshot-[a-f0-9]{64}\.sqlite$/.test(String(pointer.file || "")) || !/^[a-f0-9]{64}$/.test(String(pointer.sha256 || ""))) {
    throw fail("snapshot_invalid", "Ponteiro do radar inválido.");
  }
  if (!Number.isSafeInteger(pointer.bytes) || pointer.bytes < 4096 || pointer.bytes > MAX_BYTES) throw fail("snapshot_invalid", "Tamanho do snapshot inválido.");
  validateMeta(pointer.meta);
  const file = await realpath(path.join(canonicalRoot, pointer.file)).catch(() => { throw fail("data_unavailable", "Snapshot do radar ausente."); });
  const relative = path.relative(canonicalRoot, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw fail("snapshot_invalid", "Caminho do snapshot recusado.");
  const info = await stat(file);
  if (!info.isFile() || info.size !== pointer.bytes) throw fail("snapshot_invalid", "Arquivo do snapshot divergente.");
  if (await sha256(file) !== pointer.sha256) throw fail("snapshot_invalid", "Hash do snapshot divergente.");
  return { pointer, file, pointerSignature: signature(pointerInfo) };
}

function scalar(db, sql) {
  const statement = db.prepare(sql);
  statement.setReadBigInts(true);
  return statement.get();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

async function load(root) {
  if (loading) return loading;
  loading = (async () => {
    const canonicalRoot = await realpath(root).catch(() => { throw fail("data_unavailable", "Dados do radar indisponíveis."); });
    const pointerInfo = await stat(path.join(canonicalRoot, "current.json")).catch(() => { throw fail("data_unavailable", "Dados do radar indisponíveis."); });
    const pointerSignature = signature(pointerInfo);
    if (active && active.pointerSignature === pointerSignature) {
      validateMeta(active.meta);
      return active;
    }
    const resolved = await resolveSnapshot(canonicalRoot, pointerInfo);
    const db = new DatabaseSync(resolved.file, { readOnly: true });
    try {
      db.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY;");
      const quick = scalar(db, "PRAGMA quick_check");
      const version = scalar(db, "PRAGMA user_version");
      if (quick.quick_check !== "ok" || Number(version.user_version) !== 1) throw fail("snapshot_invalid", "Integridade SQLite recusada.");
      const required = new Set(["contracts", "contract_search", "metadata"]);
      for (const row of db.prepare("SELECT name FROM sqlite_schema WHERE name IN ('contracts','contract_search','metadata')").all()) required.delete(row.name);
      if (required.size) throw fail("snapshot_invalid", "Schema SQLite incompleto.");
      const columns = db.prepare("PRAGMA table_info(contracts)").all().map((row) => row.name);
      const expectedColumns = ["rowid","id","object","buyer_id","buyer_name","uf","city","supplier_id","supplier_name","value_cents","published_at","starts_at","ends_at","source_updated_at","source_url","expiry_eligible"];
      if (JSON.stringify(columns) !== JSON.stringify(expectedColumns)) throw fail("snapshot_invalid", "Colunas SQLite incompatíveis.");
      const storedRow = db.prepare("SELECT value FROM metadata WHERE key='meta'").get();
      let storedMeta;
      try { storedMeta = JSON.parse(storedRow?.value || ""); } catch { throw fail("snapshot_invalid", "Metadados internos do snapshot inválidos."); }
      if (JSON.stringify(canonical(storedMeta)) !== JSON.stringify(canonical(resolved.pointer.meta))) throw fail("snapshot_invalid", "Metadados internos do snapshot divergentes.");
      const actualCount = scalar(db, "SELECT COUNT(*) AS count FROM contracts");
      if (number(actualCount.count) !== resolved.pointer.meta.record_count) throw fail("snapshot_invalid", "Contagem interna do snapshot divergente.");
      const previous = active;
      active = { db, hash: resolved.pointer.sha256, pointerSignature: resolved.pointerSignature, meta: Object.freeze({ ...resolved.pointer.meta }) };
      cache.clear();
      cacheBytes = 0;
      previous?.db.close();
      return active;
    } catch (error) {
      db.close();
      throw error;
    }
  })().finally(() => { loading = null; });
  return loading;
}

function cents(value) {
  if (value == null) return null;
  const amount = typeof value === "bigint" ? value : BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function number(value) {
  const numeric = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(numeric)) throw fail("snapshot_invalid", "Agregado fora do intervalo seguro.");
  return numeric;
}

function where(filters, today) {
  const clauses = [];
  const values = {};
  if (filters.q) { clauses.push("contracts.rowid IN (SELECT rowid FROM contract_search WHERE contract_search MATCH $match)"); values.$match = filters.match; }
  if (filters.uf) { clauses.push("uf = $uf"); values.$uf = filters.uf; }
  if (filters.months !== "all") { clauses.push("published_at >= $published"); values.$published = monthsAgo(today, Number(filters.months)); }
  if (filters.ending !== "all") {
    clauses.push("expiry_eligible = 1 AND ends_at >= $today AND ends_at <= date($today, $ending)");
    values.$today = today;
    values.$ending = `+${filters.ending} days`;
  }
  if (filters.buyer) { clauses.push("buyer_id = $buyer"); values.$buyer = filters.buyer; }
  if (filters.supplier) { clauses.push("supplier_id = $supplier"); values.$supplier = filters.supplier; }
  return { sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", values };
}

function prepared(db, sql, values, all = false) {
  const statement = db.prepare(sql);
  statement.setReadBigInts(true);
  return all ? statement.all(values) : statement.get(values);
}

function mapRanking(rows, type) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ...(type === "buyer" ? { uf: row.uf || "" } : {}),
    contracts: number(row.contracts),
    total_value: null,
  }));
}

function execute(db, filters) {
  const today = todayInBrazil();
  const filter = where(filters, today);
  const summary = prepared(db, `SELECT COUNT(*) contracts, COUNT(DISTINCT buyer_id) buyers, COUNT(DISTINCT supplier_id) suppliers, COUNT(value_cents) valued_contracts, SUM(CASE WHEN expiry_eligible=1 AND ends_at>=$today AND ends_at<=date($today,'+90 days') THEN 1 ELSE 0 END) ending_90 FROM contracts${filter.sql}`, { ...filter.values, $today: today });
  const buyerRows = prepared(db, `SELECT id,name,uf,contracts FROM (SELECT buyer_id id,buyer_name name,uf,COUNT(*) OVER(PARTITION BY buyer_id) contracts,ROW_NUMBER() OVER(PARTITION BY buyer_id ORDER BY published_at DESC,id ASC) rn FROM contracts${filter.sql}) WHERE rn=1 ORDER BY contracts DESC,name ASC LIMIT 10`, filter.values, true);
  const supplierRows = prepared(db, `SELECT id,name,contracts FROM (SELECT supplier_id id,supplier_name name,COUNT(*) OVER(PARTITION BY supplier_id) contracts,ROW_NUMBER() OVER(PARTITION BY supplier_id ORDER BY published_at DESC,id ASC) rn FROM contracts${filter.sql}) WHERE rn=1 ORDER BY contracts DESC,name ASC LIMIT 10`, filter.values, true);
  const total = number(summary.contracts);
  const page = filters.page;
  const order = {
    recent: "published_at DESC, id ASC",
    ending: "CASE WHEN expiry_eligible=1 AND ends_at>=$today THEN 0 ELSE 1 END ASC, CASE WHEN expiry_eligible=1 AND ends_at>=$today THEN ends_at END ASC, published_at DESC, id ASC",
  }[filters.sort];
  const records = prepared(db, `SELECT id, substr(object,1,2000) object, substr(buyer_name,1,300) buyer_name, buyer_id, uf, substr(city,1,100) city, substr(supplier_name,1,300) supplier_name, supplier_id, value_cents, published_at, starts_at, ends_at, source_updated_at, substr(source_url,1,300) source_url FROM contracts${filter.sql} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, filters.sort === "ending" ? { ...filter.values, $today: today } : filter.values, true).map((row) => ({
    ...row,
    value: cents(row.value_cents),
    value_cents: undefined,
    source_url: /^https:\/\/pncp\.gov\.br\/app\/contratos\/\d{14}\/\d{4}\/\d+$/.test(String(row.source_url || "")) ? row.source_url : null,
  }));
  const actualPages = Math.ceil(total / PAGE_SIZE);
  return {
    summary: {
      contracts: total,
      buyers: number(summary.buyers),
      suppliers: number(summary.suppliers),
      total_value: null,
      valued_contracts: number(summary.valued_contracts),
      ending_90: number(summary.ending_90 || 0n),
    },
    buyers: mapRanking(buyerRows, "buyer"),
    suppliers: mapRanking(supplierRows, "supplier"),
    records,
    pagination: { page, page_size: PAGE_SIZE, total, pages: Math.min(100, actualPages), limited: actualPages > 100 },
  };
}

async function handle(message) {
  const loaded = await load(message.root);
  if (message.action === "meta") return { meta: loaded.meta, hash: loaded.hash };
  const key = loaded.hash + ":" + JSON.stringify(message.filters);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;
  const value = { ...execute(loaded.db, message.filters), meta: loaded.meta, hash: loaded.hash };
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes <= CACHE_MAX_BYTES / 2) {
    const previous = cache.get(key);
    if (previous) cacheBytes -= previous.bytes;
    cache.delete(key);
    cache.set(key, { at: Date.now(), value, bytes });
    cacheBytes += bytes;
  }
  while (cache.size > CACHE_MAX || cacheBytes > CACHE_MAX_BYTES) {
    const oldest = cache.keys().next().value;
    cacheBytes -= cache.get(oldest).bytes;
    cache.delete(oldest);
  }
  return value;
}

const workQueue = [];
const canceled = new Set();
let processing = false;

async function processQueue() {
  if (processing) return;
  processing = true;
  while (workQueue.length) {
    await new Promise((resolve) => setImmediate(resolve));
    const message = workQueue.shift();
    if (canceled.delete(message.id)) continue;
    parentPort.postMessage({ id: message.id, started: true });
    try {
      const value = await handle(message);
      if (!canceled.delete(message.id)) parentPort.postMessage({ id: message.id, ok: true, value });
    } catch (error) {
      if (!canceled.delete(message.id)) parentPort.postMessage({ id: message.id, ok: false, error: error.code || "data_unavailable", status: error.status || 503, message: error.message || "Dados indisponíveis." });
    }
  }
  processing = false;
}

parentPort.on("message", (message) => {
  if (message.cancel) {
    canceled.add(message.id);
    return;
  }
  workQueue.push(message);
  processQueue();
});
