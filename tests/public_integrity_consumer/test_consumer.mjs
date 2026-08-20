/**
 * Drives shipped public-integrity consume / map / store / intake / handler /
 * copy-scan / analytics. Not a reimplementation.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

process.env.NODE_ENV = "test";
process.env.LEAD_ALLOW_MEMORY_FALLBACK = "1";
delete process.env.PUBLIC_INTEGRITY_CONSUMER;
delete process.env.TURNSTILE_SECRET_KEY;

const consumeMod = require(path.join(root, "scripts/public_integrity_consumer/consume.cjs"));
const mapMod = require(path.join(root, "scripts/public_integrity_consumer/map.cjs"));
const hashing = require(path.join(root, "scripts/public_integrity_consumer/hashing.cjs"));
const fixtures = require(path.join(root, "scripts/public_integrity_consumer/fixtures.cjs"));
const copy = require(path.join(root, "scripts/public_integrity_consumer/copy.cjs"));
const privacy = require(path.join(root, "scripts/public_integrity_consumer/privacy.cjs"));
const attribution = require(path.join(root, "scripts/public_integrity_consumer/attribution.cjs"));
const flag = require(path.join(root, "scripts/public_integrity_consumer/flag.cjs"));
const storeMod = require(path.join(root, "scripts/public_integrity_consumer/store.cjs"));
const tokenMod = require(path.join(root, "scripts/public_integrity_consumer/token.cjs"));
const intake = require(path.join(root, "scripts/public_integrity_consumer/intake.cjs"));
const render = require(path.join(root, "scripts/public_integrity_consumer/render.cjs"));
const cnpj = require(path.join(root, "scripts/conversion/cnpj.cjs"));
const { ASSET, FLAG_NAME } = require(path.join(root, "scripts/public_integrity_consumer/constants.cjs"));

const fnPath = path.join(root, "netlify/functions/public-integrity-consult.cjs");
function loadHandler() {
  for (const rel of [
    "netlify/functions/public-integrity-consult.cjs",
    "scripts/public_integrity_consumer/intake.cjs",
  ]) {
    const p = path.join(root, rel);
    try {
      if (require.cache[require.resolve(p)]) delete require.cache[require.resolve(p)];
    } catch {
      /* ignore */
    }
  }
  return require(fnPath);
}

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log("PASS", name, detail || "");
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
  process.exitCode = 1;
}

function composeValidCnpj(stem12) {
  for (let i = 0; i < 100; i += 1) {
    const cand = `${stem12}${String(i).padStart(2, "0")}`;
    if (cnpj.isValidCnpj(cand)) return cand;
  }
  throw new Error("compose_failed");
}

const VALID = composeValidCnpj("112223330001");
const INVALID = "11222333000100";

function everySourceHas(view, keys) {
  if (!view || !Array.isArray(view.sources) || view.sources.length !== 2) return false;
  return view.sources.every((src) => keys.every((k) => src[k] !== undefined && src[k] !== null && src[k] !== ""));
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// --- flag ---
{
  if (flag.flagDefault() !== false && flag.loadFlag().enabled !== false) {
    fail("flag_default_false", flag.loadFlag());
  } else if (flag.loadFlag().enabled !== false) {
    fail("flag_default_false", flag.loadFlag());
  } else pass("flag_default_false", FLAG_NAME);
  if (flag.FLAG_NAME !== "PUBLIC_INTEGRITY_CONSUMER" && FLAG_NAME !== "PUBLIC_INTEGRITY_CONSUMER") {
    fail("flag_name", FLAG_NAME);
  } else pass("flag_name", FLAG_NAME);
}

// --- hash of shipped empty-complete ---
{
  const env = fixtures.loadEnvelope("empty-complete");
  if (env.content_hash !== hashing.contentHash(env)) {
    fail("hash_empty_complete", { claimed: env.content_hash, got: hashing.contentHash(env) });
  } else pass("hash_empty_complete");
}

// --- consume matrix ---
{
  const empty = consumeMod.consumeEnvelope(fixtures.loadEnvelope("empty-complete"));
  if (!empty.ok || empty.aggregate_state !== "NO_MATCH_CONFIRMED") {
    fail("empty_complete_no_match", empty);
  } else pass("empty_complete_no_match");

  const ceis = consumeMod.consumeEnvelope(fixtures.loadEnvelope("ceis-match"));
  if (!ceis.ok || ceis.aggregate_state !== "MATCHES_FOUND") fail("ceis_match", ceis);
  else pass("ceis_match");

  const cnep = consumeMod.consumeEnvelope(fixtures.loadEnvelope("cnep-match"));
  if (!cnep.ok || cnep.aggregate_state !== "MATCHES_FOUND") fail("cnep_match", cnep);
  else pass("cnep_match");

  const multi = consumeMod.consumeEnvelope(fixtures.loadEnvelope("multi-page"));
  const multiView = mapMod.mapPublicView(multi);
  const ids = (multiView.sources.find((s) => s.source_id === "CEIS") || {}).records || [];
  if (ids.length !== 2) fail("multi_page", ids.map((r) => r.official_id));
  else pass("multi_page", ids.map((r) => r.official_id).join(","));
}

let falseEmpty = 0;
for (const id of fixtures.failureIds()) {
  const consumed = consumeMod.consumeEnvelope(fixtures.loadEnvelope(id));
  const view = mapMod.mapPublicView(consumed);
  if (view.aggregate_state === "NO_MATCH_CONFIRMED") {
    falseEmpty += 1;
    fail(`failure_not_empty:${id}`, view.aggregate_state);
  } else if (!["PARTIAL", "UNKNOWN"].includes(view.aggregate_state)) {
    fail(`failure_state:${id}`, view.aggregate_state);
  } else {
    pass(`failure_not_empty:${id}`, view.aggregate_state);
  }
  if (!everySourceHas(view, ["source_id", "status", "coverage_complete", "as_of"])) {
    fail(`failure_source_fields:${id}`, view.sources);
  }
  if (view.as_of === undefined || view.checked_at === undefined) fail(`failure_instante:${id}`, view);
  if (JSON.stringify(view).includes("queried_cnpj")) fail(`failure_cnpj_field:${id}`);
}

{
  const degraded = mapMod.consumeAndMap(fixtures.loadEnvelope("source-degraded"));
  const ceis = degraded.view.sources.find((s) => s.source_id === "CEIS");
  if (degraded.view.aggregate_state === "NO_MATCH_CONFIRMED") fail("degraded_hidden_match");
  else if (!ceis || !ceis.records.length) fail("degraded_match_visible", ceis);
  else pass("degraded_match_visible", ceis.records[0].official_id);
}

{
  const partial = mapMod.consumeAndMap(fixtures.loadEnvelope("parse-partial"));
  if (partial.view.aggregate_state !== "PARTIAL") fail("parse_partial_state", partial.view.aggregate_state);
  else if (!partial.view.sources.some((s) => s.records.some((r) => r.official_id === "9001"))) {
    fail("parse_partial_keeps_record");
  } else pass("parse_partial_keeps_record");
}

{
  const pag = mapMod.consumeAndMap(fixtures.loadEnvelope("incomplete-pagination"));
  if (pag.view.aggregate_state !== "PARTIAL") fail("incomplete_pagination", pag.view.aggregate_state);
  else pass("incomplete_pagination", pag.view.aggregate_state);
}

{
  const stale = mapMod.consumeAndMap(fixtures.loadEnvelope("stale-expired"));
  if (stale.view.aggregate_state === "NO_MATCH_CONFIRMED") fail("stale_empty");
  else if (stale.view.freshness.is_current) fail("stale_current");
  else pass("stale_expired", stale.view.aggregate_state);
}

{
  const inv = mapMod.consumeAndMap(fixtures.loadEnvelope("invalid-cnpj"));
  if (inv.view.aggregate_state !== "UNKNOWN") fail("invalid_cnpj_envelope", inv.view.aggregate_state);
  else pass("invalid_cnpj_envelope");
}

// schema drift mutation
{
  const drifted = clone(fixtures.loadEnvelope("empty-complete"));
  drifted.schema = "public-read-integrity/9.0";
  drifted.schema_version = "public-read-integrity/9.0";
  const got = mapMod.consumeAndMap(drifted);
  if (got.consumed.ok) fail("schema_drift_refused");
  else if (got.view.aggregate_state === "NO_MATCH_CONFIRMED") fail("schema_drift_empty");
  else pass("schema_drift_unknown", got.view.aggregate_state);
}

// forbidden field
{
  const bad = clone(fixtures.loadEnvelope("empty-complete"));
  bad.score = 1;
  const got = mapMod.consumeAndMap(bad);
  if (got.consumed.ok || got.view.aggregate_state === "NO_MATCH_CONFIRMED") fail("forbidden_score", got);
  else pass("forbidden_score", got.consumed.error);
}

// incomplete payload
{
  const bad = clone(fixtures.loadEnvelope("empty-complete"));
  delete bad.sources;
  const got = mapMod.consumeAndMap(bad);
  if (got.view.aggregate_state === "NO_MATCH_CONFIRMED") fail("incomplete_empty");
  else pass("incomplete_payload", got.view.aggregate_state);
}

// hash mismatch
{
  const bad = clone(fixtures.loadEnvelope("empty-complete"));
  bad.limitations = ["mutated"];
  const got = mapMod.consumeAndMap(bad);
  if (got.consumed.ok || got.view.aggregate_state === "NO_MATCH_CONFIRMED") fail("hash_mismatch_empty");
  else pass("hash_mismatch", got.consumed.error);
}

// contradiction: producer NO_MATCH without coverage
{
  const bad = clone(fixtures.loadEnvelope("empty-complete"));
  bad.sources.CEIS.coverage_complete = false;
  bad.sources.CEIS.status = "UNKNOWN";
  const hashed = hashing.attachHash(bad);
  const got = mapMod.consumeAndMap(hashed);
  if (got.view.aggregate_state === "NO_MATCH_CONFIRMED") fail("contradiction_empty");
  else pass("contradiction_no_match", got.view.aggregate_state);
}

// missing pages_fetched represented as UNKNOWN, not zero
{
  const bad = clone(fixtures.loadEnvelope("timeout"));
  delete bad.sources.CEIS.pages_fetched;
  const hashed = hashing.attachHash(bad);
  const view = mapMod.mapPublicView(consumeMod.consumeEnvelope(hashed));
  const ceis = view.sources.find((s) => s.source_id === "CEIS");
  if (ceis.pages_fetched === 0) fail("missing_pages_zero", ceis);
  else if (ceis.pages_fetched !== "UNKNOWN" && consumeMod.consumeEnvelope(hashed).ok) {
    fail("missing_pages", ceis.pages_fetched);
  } else pass("missing_pages_unknown", String(ceis.pages_fetched));
}

// copy lint
{
  const lint = copy.lintAllCopy();
  if (!lint.ok) fail("copy_lint", lint.hits);
  else pass("copy_lint");
  const landing = fs.readFileSync(path.join(root, "piloto/consulta-ocorrencias-publicas/index.html"), "utf8");
  const resultPage = fs.readFileSync(path.join(root, "piloto/consulta-ocorrencias-publicas/r/index.html"), "utf8");
  const htmlHits = copy.scanForbiddenCopy(landing + resultPage);
  if (htmlHits.length) fail("html_forbidden_copy", htmlHits);
  else pass("html_forbidden_copy");
  const c = copy.journeyCopy();
  if (!/preliminar/.test(c.preliminary)) fail("copy_preliminary");
  else pass("copy_preliminary");
  if (!/CEIS/.test(c.sources_covered) || !/CNEP/.test(c.sources_covered)) fail("copy_sources");
  else pass("copy_sources");
  if (!/nao prova ausencia geral/.test(c.absence_not_general)) fail("copy_absence");
  else pass("copy_absence");
  if (!/permanece visivel/.test(c.unavailability_visible)) fail("copy_unavailability");
  else pass("copy_unavailability");
}

// attribution has no CNPJ / result body
{
  const event = attribution.attributionEvent({
    aggregate_state: "PARTIAL",
    coverage_class: "partial",
    correlation_id: "pi-abc",
    session_id: "s-abc",
  });
  if (event.source !== "CONFENGE_WEB") fail("attr_source", event);
  if (event.asset_family !== "public_integrity") fail("attr_family", event);
  if (!event.asset_id || !event.destination_service_id || !event.cta_id) fail("attr_ids", event);
  if ("cnpj" in event || "queried_cnpj" in event || "records" in event) fail("attr_cnpj", event);
  else pass("attribution_safe", `${event.asset_id}/${event.cta_id}`);
}

// token opacity
{
  const t = tokenMod.mintToken();
  if (!tokenMod.tokenLooksOpaque(t)) fail("token_opaque", t);
  if (t.includes(VALID) || privacy.scanCnpjLeaks(t, VALID).length) fail("token_cnpj", t);
  else pass("token_opaque");
}

async function runIntake(store, body) {
  return intake.handleConsult({ store, body, env: process.env, now: new Date() });
}

// invalid CNPJ via shipped intake
{
  const store = new storeMod.MemoryStore();
  const got = await runIntake(store, { cnpj: INVALID, fixture_id: "empty-complete" });
  if (got.body.aggregate_state === "NO_MATCH_CONFIRMED") fail("intake_invalid_empty");
  else if (got.statusCode !== 400) fail("intake_invalid_status", got.statusCode);
  else pass("intake_invalid_cnpj", got.body.aggregate_state);
  if (JSON.stringify(got.body).includes(INVALID) || JSON.stringify(got.body).includes("queried_cnpj")) {
    fail("intake_invalid_leak");
  } else pass("intake_invalid_no_cnpj");
}

// store unavailable
{
  const got = await runIntake(new storeMod.UnavailableStore(), {
    cnpj: VALID,
    fixture_id: "empty-complete",
  });
  if (got.body.aggregate_state === "NO_MATCH_CONFIRMED") fail("store_unavail_empty");
  else if (got.statusCode !== 503) fail("store_unavail_status", got.statusCode);
  else pass("store_unavailable", got.body.aggregate_state);
}

// handler entry: empty-complete twice + failure twice
const handler = loadHandler();
const mem = new storeMod.MemoryStore();
handler.setStoreForTests(mem);

async function postHandler(payload, headers = {}) {
  return handler.handler({
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

async function getHandler(token) {
  return handler.handler({
    httpMethod: "GET",
    headers: { origin: "https://confenge.com.br", accept: "application/json" },
    queryStringParameters: { t: token, action: "result" },
    path: "/.netlify/functions/public-integrity-consult",
  });
}

const emptyBodies = [];
for (const i of [1, 2]) {
  const res = await postHandler({
    cnpj: VALID,
    fixture_id: "empty-complete",
    event_id: `empty-replay-${i === 1 ? "shared" : "shared"}`,
    idempotency_key: "empty-complete-entry",
  });
  const body = JSON.parse(res.body);
  emptyBodies.push(body);
  fs.writeFileSync(path.join(process.env.SCRATCH_ENTRY || "/dev/null"), ""); // no-op if unset
  if (body.aggregate_state !== "NO_MATCH_CONFIRMED") fail(`entry_empty_${i}`, body.aggregate_state);
  else pass(`entry_empty_${i}`, body.aggregate_state);
  const loc = (res.headers && res.headers.Location) || body.result_url || "";
  const urlCheck = cnpj.assertNoCnpjInUrl(loc, VALID);
  if (!urlCheck.ok) fail(`entry_empty_url_${i}`, loc);
  if (privacy.scanCnpjLeaks(res.body, VALID).length) fail(`entry_empty_body_cnpj_${i}`);
  if (!everySourceHas(body.view, ["source_id", "status", "coverage_complete", "as_of"])) {
    fail(`entry_empty_fields_${i}`);
  }
  if (body.view.sources.some((s) => s.coverage_complete !== true)) fail(`entry_empty_coverage_${i}`);
}
if (emptyBodies[0].token !== emptyBodies[1].token) fail("entry_empty_replay_token");
else pass("entry_empty_replay_idempotent", emptyBodies[0].token.slice(0, 8));

const failBodies = [];
for (const i of [1, 2]) {
  const res = await postHandler({
    cnpj: VALID,
    fixture_id: "timeout",
    idempotency_key: "timeout-entry",
  });
  const body = JSON.parse(res.body);
  failBodies.push(body);
  if (!["PARTIAL", "UNKNOWN"].includes(body.aggregate_state)) fail(`entry_fail_${i}`, body.aggregate_state);
  else pass(`entry_fail_${i}`, body.aggregate_state);
  if (body.aggregate_state === "NO_MATCH_CONFIRMED" || body.empty_success) {
    falseEmpty += 1;
    fail(`entry_fail_false_empty_${i}`);
  }
  const loc = (res.headers && res.headers.Location) || body.result_url || "";
  if (!cnpj.assertNoCnpjInUrl(loc, VALID).ok) fail(`entry_fail_url_${i}`, loc);
  if (privacy.scanCnpjLeaks(res.body, VALID).length) fail(`entry_fail_body_cnpj_${i}`);
}
if (failBodies[0].token !== failBodies[1].token) fail("entry_fail_replay_token");
else pass("entry_fail_replay_idempotent");

// GET result + expired token
{
  const ok = await postHandler({ cnpj: VALID, fixture_id: "ceis-match", idempotency_key: "ceis-get" });
  const body = JSON.parse(ok.body);
  const got = await getHandler(body.token);
  const gotBody = JSON.parse(got.body);
  if (got.statusCode !== 200) fail("get_result", got.statusCode);
  else if (gotBody.view.aggregate_state !== "MATCHES_FOUND") fail("get_result_state", gotBody.view.aggregate_state);
  else pass("get_result", gotBody.view.aggregate_state);
  const bad = await getHandler("not-a-valid-token");
  const badBody = JSON.parse(bad.body);
  if (badBody.aggregate_state === "NO_MATCH_CONFIRMED") fail("bad_token_empty");
  else pass("bad_token_unknown", badBody.aggregate_state);

  const rec = await mem.get(body.token);
  rec.expires_at = "2000-01-01T00:00:00.000Z";
  await mem.put(rec);
  const expired = await getHandler(body.token);
  const expBody = JSON.parse(expired.body);
  if (expBody.aggregate_state === "NO_MATCH_CONFIRMED") fail("expired_token_empty");
  else pass("expired_token_unknown", expBody.aggregate_state);
}

// flag off in production env
{
  const store = new storeMod.MemoryStore();
  const got = await intake.handleConsult({
    store,
    body: { cnpj: VALID, fixture_id: "empty-complete" },
    env: { NODE_ENV: "production", PUBLIC_INTEGRITY_CONSUMER: "0" },
    now: new Date(),
  });
  if (got.statusCode !== 404) fail("flag_off_status", got.statusCode);
  else pass("flag_off_404", got.body.error);
}

// HTML render of a match does not include CNPJ
{
  const mapped = mapMod.consumeAndMap(fixtures.loadEnvelope("ceis-match"));
  const html = render.resultHtml(mapped.view, { token: "tok_test_opaque_token_value_0123456789ab" });
  if (privacy.scanCnpjLeaks(html, VALID).length) fail("render_cnpj", html.slice(0, 200));
  if (copy.scanForbiddenCopy(html).length) fail("render_forbidden", copy.scanForbiddenCopy(html));
  if (!html.includes("noindex")) fail("render_robots");
  if (!html.includes("CEIS")) fail("render_source");
  else pass("render_result_safe");
}

// index fail-closed
{
  const landing = fs.readFileSync(path.join(root, "piloto/consulta-ocorrencias-publicas/index.html"), "utf8");
  const resultPage = fs.readFileSync(path.join(root, "piloto/consulta-ocorrencias-publicas/r/index.html"), "utf8");
  const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
  const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
  if (!/noindex/.test(landing) || /index,\s*follow/.test(landing)) fail("landing_robots", landing.match(/robots[^>]+/));
  else pass("landing_noindex");
  if (!/noindex,nofollow,noarchive/.test(resultPage)) fail("result_robots");
  else pass("result_noindex");
  if (!headers.includes("/piloto/consulta-ocorrencias-publicas/*")) fail("headers_path");
  else pass("headers_path");
  if (!/noindex, nofollow, noarchive/.test(headers.split("/piloto/consulta-ocorrencias-publicas/*")[1])) {
    fail("headers_robots");
  } else pass("headers_robots");
  if (!robots.includes("Disallow: /piloto/consulta-ocorrencias-publicas/")) fail("robots_disallow");
  else pass("robots_disallow");
  const sitemaps = [
    "sitemap.xml",
    "sitemap.txt",
    "sitemap-index.xml",
    "sitemap-editorial.xml",
    "sitemap-inteligencia.xml",
    "sitemap-jurisprudencia.xml",
  ];
  let sitemapHits = 0;
  for (const name of sitemaps) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    if (text.includes("consulta-ocorrencias-publicas")) {
      sitemapHits += 1;
      fail("sitemap_member", name);
    }
  }
  if (sitemapHits === 0) pass("sitemap_member_false");
  if (landing.includes('method="post"') && !/action="[^"]*cnpj/i.test(landing)) pass("form_post_no_cnpj_action");
  else fail("form_post", landing.match(/<form[\s\S]*?>/));
}

// CNPJ leak scan over exclusive tree
{
  const roots = [
    path.join(root, "scripts/public_integrity_consumer"),
    path.join(root, "tests/public_integrity_consumer"),
    path.join(root, "data/public-integrity-consumer"),
    path.join(root, "piloto/consulta-ocorrencias-publicas"),
    path.join(root, "docs/ops/campaigns/CONFENGE-WEB-PUBLIC-INTEGRITY-CONSUMER-PREPARE-01"),
    path.join(root, "docs/contracts"),
    path.join(root, "netlify/functions/public-integrity-consult.cjs"),
  ];
  const hits = [];
  function walk(p) {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p)) walk(path.join(p, name));
      return;
    }
    if (!/\.(html|json|cjs|mjs|md|txt)$/.test(p)) return;
    const text = fs.readFileSync(p, "utf8");
    if (cnpj.containsCnpj(text, VALID)) hits.push(`${p}:valid`);
    const formatted = text.match(privacy.FORMATTED_CNPJ);
    if (formatted) hits.push(`${p}:${formatted[0]}`);
  }
  for (const p of roots) walk(p);
  if (hits.length) fail("cnpj_git_scan", hits);
  else pass("cnpj_git_scan_clean");
}

// accessibility-ish structural checks
{
  const landing = fs.readFileSync(path.join(root, "piloto/consulta-ocorrencias-publicas/index.html"), "utf8");
  if (!landing.includes('href="#conteudo"')) fail("a11y_skip");
  else pass("a11y_skip");
  if (!landing.includes("<label for=\"cnpj\">")) fail("a11y_label");
  else pass("a11y_label");
  if (!landing.includes("integrity-submit")) fail("a11y_submit");
  else pass("a11y_keyboard_submit");
  if (!landing.includes('name="viewport"')) fail("mobile_viewport");
  else pass("mobile_viewport");
}

const failed = results.filter((r) => !r.ok);
console.log("SUMMARY", JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  false_empty: falseEmpty,
  flag: FLAG_NAME,
  flag_default: false,
}));
if (failed.length) process.exitCode = 1;
