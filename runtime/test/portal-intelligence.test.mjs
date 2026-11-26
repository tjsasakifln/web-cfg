import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import http from "node:http";
import { createPortal } from "../portal/server.mjs";
import { digest, passwordHash } from "../portal/security.mjs";
import { createIntelligenceReader, intelligenceCsv, intelligenceView, territory } from "../portal/intelligence.mjs";

const now = Date.parse("2026-11-26T12:00:00Z");
const instant = (minutes) => new Date(now + minutes * 60_000).toISOString();
const proof = (kind = "edital") => ({ kind, url: "https://pncp.gov.br/app/documentos/1", sha256: "a".repeat(64), locator: "p. 3, item 2" });
const site = (code = "4216602", extra = {}) => ({ code, evidence: proof("projeto"), ...extra });
const geo = (...sites) => ({ basis: "all_execution_sites", sites });
const pool = (records, patch = {}) => ({
  schema: "confenge.extra-intelligence/v1", producer: "extra-cli", mode: "OFFICIAL_LIVE", scope: "extra-sc-sao-jose-200/v1",
  generatedAt: instant(-1), sourceCut: instant(-2),
  coverage: {
    notices: { scanned: 10, unreviewed: 4, windowStart: "2026-11-15", windowEnd: "2026-12-10", truncated: false },
    contracts: { scanned: 100, unreviewed: 43, windowStart: "2025-11-01", windowEnd: "2026-11-26", truncated: true },
  }, records, ...patch,
});
const ticket = (id, opts = {}) => ({
  kind: "notice", key: "notice:" + id, title: "Reforma de EEB em São José",
  buyer: "Secretaria responsável", buyerKey: "org:122", family: "edificacoes", physicalWork: true,
  officialUrl: "https://pncp.gov.br/app/editais/" + id, scopeEvidence: proof(),
  execution: geo(site()), notice: {
    state: "open", closesAt: instant(720), opensAt: instant(-2000), statusVerifiedAt: instant(-30),
    amount: { type: "estimated", cents: 50000, evidence: proof("edital") }, evidence: proof("ato_oficial"),
  },
  ...opts,
});
const contract = (id, kind = "initial", cfg = {}) => ({
  ...ticket(id), key: "contract:" + id, kind: "contract", officialUrl: "https://pncp.gov.br/app/contratos/" + id,
  contract: { state: "active_proven", endsOn: "2027-01-12", endConflict: false, statusVerifiedAt: instant(-30),
    publishedOn: "2026-06-01", endEvidence: proof("aditivo"), contractor: "Empresa X",
    amount: { type: kind, cents: 8800000, evidence: proof("contrato") }, ...cfg },
});
const view = (records, options = {}) => intelligenceView(pool(records), { now, ...options });

test("territorial binding never uses the administrative address or an incomplete lot", () => {
  assert.equal(territory(geo(site())).result, "confirmado");
  assert.equal(territory({ basis: "buyer_city", sites: [site()] }).result, "local_sem_prova");
  assert.equal(territory(geo(site(), site("4106902"))).result, "fora_do_territorio");
  assert.equal(territory(geo(site("4200051"))).result, "fora_do_territorio");
  assert.equal(territory(geo(site(), { code: "4205407" })).result, "local_sem_prova");
  assert.equal(territory(geo(site("4200200"), site("4205407"))).result, "confirmado");
  const atBorder = "4200408"; // Anchieta would be outside and never accepted by a false coordinate.
  assert.notEqual(territory(geo(site(atBorder, { point: { lon: -48.63, lat: -27.62, uncertaintyM: 1, evidence: proof("projeto") } }))).result, "confirmado");
  assert.notEqual(territory(geo(site("4209300", { point: { lon: -48.63, lat: -27.62, uncertaintyM: 1, evidence: proof("projeto") } }))).result, "confirmado");
  assert.equal(territory(geo(site("4209300"))).result, "limite_sem_prova");
  assert.equal(territory(geo(site("4209300", { point: { lon: -50.326, lat: -27.815, uncertaintyM: 10, evidence: proof("projeto") } }))).result, "confirmado");
  const { decidir, coverage } = view([
    ticket("1"), ticket("2", { title: "Aquisição de material de construção", physicalWork: false }),
    ticket("3", { execution: null }), ticket("4", { execution: geo(site("4106902")) }),
    ticket("5", { scopeEvidence: { ...proof(), url: "https://pncp.gov.br.evil.example/edital" } }),
  ]);
  assert.deepEqual(decidir.map((r) => r.id), ["notice:1"]);
  assert.deepEqual(coverage.pending, { escopo_sem_prova: 2, local_sem_prova: 1 });
});

test("deadline, suspension, conflicting identity and missing evidence fail closed", () => {
  const a = ticket("a");
  const rows = [
    a,
    ticket("b", { notice: { ...a.notice, closesAt: instant(20) } }),
    ticket("c", { notice: { ...a.notice, state: "suspended" } }),
    ticket("d", { notice: { ...a.notice, closesAt: instant(0) } }),
    ticket("e", { notice: { ...a.notice, closesAt: "2026-11-27" } }),
    ticket("f", { notice: { ...a.notice, opensAt: instant(45) } }),
    ticket("g", { notice: { ...a.notice, statusVerifiedAt: instant(-1500) } }),
    ticket("h", { notice: { ...a.notice, statusVerifiedAt: instant(-1) } }),
    ticket("i", { notice: { ...a.notice, evidence: { ...proof(), sha256: "" } } }),
    ticket("dup"), ticket("DUP", { officialUrl: "https://pncp.gov.br/app/editais/alt" }),
  ];
  assert.deepEqual(view(rows).decidir.map((r) => r.id), ["notice:b", "notice:a"]);
  assert.equal(view(rows).coverage.pending.identidade_em_conflito, 2);
  assert.equal(view(rows, { family: "outras_obras" }).decidir.length, 0);
  assert.throws(() => view(rows, { family: "constructor" }), { status: 422 });
});

test("overdue source does not look current; history preserves semantics and duplication constraints", () => {
  const rows = [
    ticket("a"), contract("1"), contract("2", "untyped", { endConflict: true }),
    contract("3", "estimated", { endsOn: "2027-02-29" }), contract("4", "amended", { endsOn: "2027-10-01" }),
    { ...contract("5"), buyerKey: "org:200" }, { ...contract("6"), family: "viaria" },
  ];
  const result = view(rows);
  assert.deepEqual(result.antecipar.find((r) => r.id === "contract:1").history.map((r) => r.id), ["contract:4", "contract:3", "contract:2"]);
  assert.equal(result.preparar.length, 6);
  assert.equal(result.preparar.find((r) => r.id === "contract:2").amount, null);
  assert.equal(result.preparar.find((r) => r.id === "contract:3").amount, null);
  const stale = intelligenceView(pool(rows, { generatedAt: instant(-40), sourceCut: instant(-41) }), { now });
  assert.equal(stale.stale, true);
  assert.equal(stale.antecipar.length, 0);
  assert.equal(stale.decidir.length, 0);
  assert.equal(stale.preparar.length, 6);
  assert.throws(() => intelligenceView(pool(rows, { mode: "FIXTURE" }), { now }), { status: 503 });
  assert.throws(() => intelligenceView(pool(rows, { sourceCut: instant(20) }), { now }), { status: 503 });
});

test("CSV exports the exact filtered revision with source links and formula protection", () => {
  const confirmed = view([ticket("a", { title: "\u200b  =HYPERLINK(\"test\")", execution: geo(site()) }), ticket("b", { family: "viaria" })], { family: "edificacoes" });
  assert.match(intelligenceCsv(confirmed, "decidir", confirmed.revision), /"'​  =HYPERLINK\(""test""\)"/u);
  assert.match(intelligenceCsv(confirmed, "decidir", confirmed.revision), /São José\/SC/);
  assert.doesNotMatch(intelligenceCsv(confirmed, "decidir", confirmed.revision), /editais\/b/);
  assert.throws(() => intelligenceCsv(confirmed, "decidir", "0".repeat(64)), { status: 409 });
  assert.notEqual(view([ticket("a")], { now: now + 45 * 60_000 }).revision, view([ticket("a")]).revision);
});

test("reader rejects mutable, malformed and linked files", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "extra-intelligence-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));
  const live = join(tmp, "current.json");
  const read = createIntelligenceReader(live);
  await writeFile(live, JSON.stringify(pool([ticket("a")])), { mode: 0o640 });
  assert.equal((await read({ now })).decidir.length, 1);
  await symlink(live, join(tmp, "link"));
  await assert.rejects(createIntelligenceReader(join(tmp, "link"))({ now }), { status: 503 });
  await writeFile(live, "{");
  await assert.rejects(read({ now }), { status: 503 });
  assert.equal(createIntelligenceReader("relative"), null);
});

test("both intelligence endpoints are strictly bounded to the EXTRA client auth and revision", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "extra-intelligence-auth-"));
  const initial = await passwordHash("Initial customer password");
  await writeFile(join(directory, "setup.json"), JSON.stringify({
    client: initial, admin: initial, adminActivation: digest("activation"),
  }));
  let reads = 0;
  let portal;
  const server = http.createServer((req, res) => portal.handle(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  portal = createPortal({ directory, origin, clock: () => now, readIntelligence: (opts) => {
    reads++; return intelligenceView(pool([ticket("a")]), opts);
  } });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    portal.close();
    await rm(directory, { recursive: true, force: true });
  });
  const endpoint = origin + "/api/portal";
  const headers = (cookie) => cookie ? { Cookie: cookie } : {};
  const login = async (role, username) => {
    const res = await fetch(endpoint + "/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ role, username, password: "Initial customer password", newPassword: "A stronger new password", activationCode: "activation" }) });
    assert.equal(res.status, 200);
    return res.headers.get("set-cookie").split(";")[0];
  };
  const request = (path, cookie) => fetch(endpoint + path, { headers: headers(cookie) });
  const admin = await login("admin", "admincfg");
  const client = await login("client", "EXTRA");
  assert.equal((await request("/intelligence")).status, 401);
  assert.equal((await request("/intelligence.csv", admin)).status, 403);
  assert.equal((await request("/intelligence", admin)).status, 403);
  assert.equal(reads, 0);
  const response = await request("/intelligence", client);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(response.headers.get("x-robots-tag"), /noindex/);
  const payload = await response.json();
  assert.equal((await request("/intelligence?family=edificacoes&family=viaria", client)).status, 422);
  assert.equal((await request("/intelligence?scope=all", client)).status, 422);
  const csv = await request("/intelligence.csv?tab=decidir&revision=" + payload.revision, client);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.match(await csv.text(), /Reforma de EEB/);
});
