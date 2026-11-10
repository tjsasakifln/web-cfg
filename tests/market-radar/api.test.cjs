"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "market-radar-"));
process.env.NODE_ENV = "development";
process.env.MARKET_RADAR_DIR = root;
const api = require("../../netlify/functions/market-radar.cjs");
const client = require("../../netlify/functions/lib/market-radar-client.cjs");

function iso(hoursAgo = 0) { return new Date(Date.now() - hoursAgo * 3600_000).toISOString(); }
function day(offset = 0) { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }

function installSnapshot({ generatedHours = 1, sourceHours = 2, ingestionHours = 3, corruptHash = false, revision = "base", mutateStoredMeta = null } = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const filename = `snapshot-${token}.sqlite`;
  const file = path.join(root, filename);
  const meta = {
    schema: "confenge.market-radar/v1", generated_at: iso(generatedHours), source_as_of: iso(sourceHours), ingestion_latest_at: iso(ingestionHours),
    window_start: day(-730), window_end: day(), record_count: 3, excluded_count: 7,
    coverage_note: "Contratos PNCP selecionados no recorte.", source: "PNCP", producer: "extra-cli", state: "READY",
    value_note: "Valor informado pela fonte; tipos não discriminados e não somados.", value_aggregation: false,
    limitations: ["Fim de vigência não confirma nova licitação."],
  };
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA user_version=1;
    CREATE TABLE contracts(rowid INTEGER PRIMARY KEY, id TEXT UNIQUE, object TEXT, buyer_id TEXT, buyer_name TEXT, uf TEXT, city TEXT, supplier_id TEXT, supplier_name TEXT, value_cents INTEGER, published_at TEXT, starts_at TEXT, ends_at TEXT, source_updated_at TEXT, source_url TEXT, expiry_eligible INTEGER);
    CREATE VIRTUAL TABLE contract_search USING fts5(object, content='contracts', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE INDEX ix_contracts_published ON contracts(published_at);
    CREATE INDEX ix_contracts_uf ON contracts(uf);
    CREATE INDEX ix_contracts_buyer ON contracts(buyer_id);
    CREATE INDEX ix_contracts_supplier ON contracts(supplier_id);
    CREATE INDEX ix_contracts_end ON contracts(expiry_eligible,ends_at);
  `);
  const insert = db.prepare("INSERT INTO contracts(id,object,buyer_id,buyer_name,uf,city,supplier_id,supplier_name,value_cents,published_at,starts_at,ends_at,source_updated_at,source_url,expiry_eligible) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  insert.run("contrato-1", `serviços de engenharia escolar ${revision}`, "1".repeat(24), `Prefeitura Alfa ${revision}`, "SC", "Florianópolis", "2".repeat(24), `Engenharia Um ${revision}`, 12345, day(-10), day(-9), day(30), iso(3), "https://pncp.gov.br/app/contratos/12345678000190/2026/1", 1);
  insert.run("contrato-2", "serviços de limpeza predial", "1".repeat(24), "Prefeitura Antiga", "SC", "Florianópolis", "3".repeat(24), "Limpeza Dois", null, day(-20), day(-19), day(120), iso(3), "https://pncp.gov.br/app/contratos/12345678000190/2026/2", 1);
  insert.run("contrato-3", "engenharia viária", "4".repeat(24), "Estado Beta", "PR", "Curitiba", "2".repeat(24), "Engenharia Antiga", 50000, day(-40), day(-39), day(20), iso(3), "https://evil.example/3", 0);
  db.exec("INSERT INTO contract_search(contract_search) VALUES('rebuild')");
  const storedMeta = structuredClone(meta);
  if (mutateStoredMeta) mutateStoredMeta(storedMeta);
  db.prepare("INSERT INTO metadata(key,value) VALUES('meta',?)").run(JSON.stringify(storedMeta));
  db.close();
  const bytes = fs.statSync(file).size;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  fs.writeFileSync(path.join(root, "current.json"), JSON.stringify({ schema: "confenge.market-radar.pointer/v1", file: filename, sha256: corruptHash ? "b".repeat(64) : hash, bytes, meta }));
}

function event(method, body, extra = {}) {
  return { httpMethod: method, headers: { origin: "http://localhost", "client-ip": "127.0.0.1", ...extra }, body: body == null ? "" : JSON.stringify(body), queryStringParameters: {} };
}

test("filters reject PII, FTS operators, unknown fields and removed money sort", () => {
  assert.equal(api._test.filters({ q: "nome@empresa.com" }).error, "query_invalid");
  assert.equal(api._test.filters({ q: "12345678901" }).error, "query_invalid");
  assert.equal(api._test.filters({ q: "12.345.678/0001-90" }).error, "query_invalid");
  assert.equal(api._test.filters({ q: "(48) 3333-4444" }).error, "query_invalid");
  assert.equal(api._test.filters({ q: "99999-9999" }).error, "query_invalid");
  assert.equal(api._test.filters({ q: "engenharia OR limpeza" }).ok, true);
  assert.equal(api._test.filters({ sort: "value" }).error, "filter_invalid");
  assert.equal(api._test.filters({ secret: "x" }).error, "filter_unknown");
});

test("absent snapshot is explicit 503, never an empty market", async () => {
  const result = await api.handler(event("GET"));
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.body).ok, false);
});

test("query reconciles summary, rankings, records and protects unsafe source URLs", async () => {
  installSnapshot();
  const result = await api.handler(event("POST", { q: "engenharia", months: "24", sort: "recent" }));
  assert.equal(result.statusCode, 200, result.body);
  const body = JSON.parse(result.body);
  assert.equal(body.summary.contracts, 2);
  assert.equal(body.summary.buyers, 2);
  assert.equal(body.summary.suppliers, 1);
  assert.equal(body.summary.total_value, null);
  assert.equal(body.summary.valued_contracts, 2);
  assert.equal(body.suppliers[0].contracts, 2);
  assert.equal(body.suppliers[0].total_value, null);
  assert.equal(body.suppliers[0].name, "Engenharia Um base");
  assert.equal(body.records.length, 2);
  assert.equal(body.records.find((row) => row.id === "contrato-3").source_url, null);
  assert.equal(body.meta.value_aggregation, false);
  assert.equal(body.meta.ingestion_latest_at != null, true);
  assert.equal("source_updated_at" in body.meta, false);
  assert.equal(JSON.stringify(body).includes("match"), false);
});

test("expiry filter only includes eligible current signals and entity filter is exact", async () => {
  const expiry = JSON.parse((await api.handler(event("POST", { ending: "90", months: "all" }))).body);
  assert.equal(expiry.summary.contracts, 1);
  assert.equal(expiry.records[0].id, "contrato-1");
  const supplier = JSON.parse((await api.handler(event("POST", { supplier: "3".repeat(24), months: "all" }))).body);
  assert.equal(supplier.summary.contracts, 1);
  assert.equal(supplier.records[0].supplier_name, "Limpeza Dois");
  const ending = JSON.parse((await api.handler(event("POST", { sort: "ending", months: "all" }))).body);
  assert.equal(ending.records[0].id, "contrato-1");
});

test("rankings keep the latest entity name inside the filtered universe", async () => {
  const cleaning = JSON.parse((await api.handler(event("POST", { q: "limpeza", months: "all" }))).body);
  assert.equal(cleaning.buyers[0].name, "Prefeitura Antiga");
  assert.equal(cleaning.suppliers[0].name, "Limpeza Dois");
});

test("stale generation, stale ingestion and hash-divergent snapshots fail closed", async () => {
  installSnapshot({ generatedHours: 40 });
  let result = await api.handler(event("GET"));
  assert.equal(result.statusCode, 503);
  installSnapshot({ ingestionHours: 50 });
  result = await api.handler(event("GET"));
  assert.equal(result.statusCode, 503);
  installSnapshot({ corruptHash: true });
  result = await api.handler(event("GET"));
  assert.equal(result.statusCode, 503);
});

test("metadata is bound to the hashed database and pointer rollover invalidates cached results", async () => {
  installSnapshot({ mutateStoredMeta: (meta) => { meta.coverage_note = "divergente"; } });
  let result = await api.handler(event("GET"));
  assert.equal(result.statusCode, 503);

  installSnapshot({ revision: "v1" });
  result = await api.handler(event("POST", { months: "all" }));
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(JSON.parse(result.body).records[0].object.endsWith("v1"), true);

  installSnapshot({ revision: "v2" });
  result = await api.handler(event("POST", { months: "all" }));
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(JSON.parse(result.body).records[0].object.endsWith("v2"), true);
});

test("request boundary rejects unsafe transport and pagination", async () => {
  assert.equal(api._test.filters({ page: 101 }).error, "filter_invalid");
  assert.equal(api._test.filters({ q: "a" }).error, "query_invalid");
  assert.equal((await api.handler({ ...event("POST", {}), queryStringParameters: { q: "segredo" } })).statusCode, 400);
  assert.equal((await api.handler(event("POST", {}, { origin: "https://example.invalid", "sec-fetch-site": "cross-site" }))).statusCode, 403);
  const head = await api.handler(event("HEAD"));
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, "");
});

test.after(async () => {
  await client._stopForTests();
  fs.rmSync(root, { recursive: true, force: true });
});
