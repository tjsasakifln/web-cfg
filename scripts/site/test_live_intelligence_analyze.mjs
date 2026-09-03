/**
 * Drives the real netlify/functions/live-intelligence-analyze.cjs handler.
 * Covers: method/origin, CNPJ validation, digest lookup, fail-closed states for
 * an absent/stale dataset and an unmatched valid CNPJ, opaque analysis_id, and
 * the invariant that no CNPJ ever reaches the route, the response or the log.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

process.env.NODE_ENV = "test";

const fn = require(path.join(root, "netlify/functions/live-intelligence-analyze.cjs"));
const rate = require(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"));
const cnpjLib = require(path.join(root, "scripts/conversion/cnpj.cjs"));
const resultStore = require(path.join(root, "netlify/functions/lib/live-intelligence-result-store.cjs"));
const liveCompanies = require(path.join(root, "data/live_intelligence/live/companies.json"));

// Fixture CNPJs with valid check digits. They belong to no real company.
const KNOWN_CNPJ = "11222333000181";
const KNOWN_MASKED = "11.222.333/0001-81";
const UNKNOWN_CNPJ = "44556677000186";
const INVALID_CNPJ = "11222333000180";

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log("PASS", name, detail ? JSON.stringify(detail) : "");
}
function fail(name, detail) {
  console.error("FAIL", name, detail ? JSON.stringify(detail) : "");
  process.exit(1);
}

/** Reset the shared limiter so one assertion does not starve the next. */
async function post(body, method = "POST", headers = {}) {
  rate._reset();
  return fn.handler(event(body, method, headers));
}

function event(body, method = "POST", headers = {}) {
  return {
    httpMethod: method,
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-live-intelligence-test/1.0",
      "x-forwarded-for": headers.ip || "203.0.113.77",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

// --- 1. The committed projection is what the function reads -----------------
if (liveCompanies.index_eligible !== false) fail("dataset_index_eligible", liveCompanies.index_eligible);
if (liveCompanies.source_kind !== "test_only_fixture") fail("dataset_source_kind", liveCompanies.source_kind);
if (!liveCompanies.companies[cnpjLib.hashCnpj(KNOWN_CNPJ)]) {
  fail("dataset_missing_known_digest", cnpjLib.hashCnpj(KNOWN_CNPJ));
}
pass("dataset_shape");

// --- 2. Transport ------------------------------------------------------------
// GET is a legitimate verb here, but only for token resolution — it never
// reads a CNPJ from the body. A GET with a CNPJ payload and no token resolves
// exactly like any other GET without a valid token: 404, not a distinct
// "method not allowed" status that would leak whether the verb itself is
// meaningful for CNPJ submission.
const getRes = await post({ cnpj: KNOWN_CNPJ }, "GET");
if (getRes.statusCode !== 404) fail("get_without_token_is_not_found", getRes.statusCode);
pass("get_is_token_resolution_only");

// A method with no meaning for this endpoint (neither submit nor resolve) is
// still rejected outright.
const putRes = await post({ cnpj: KNOWN_CNPJ }, "PUT");
if (putRes.statusCode !== 405) fail("method_not_allowed", putRes.statusCode);
pass("method_not_allowed");

const optionsRes = await post("", "OPTIONS");
if (optionsRes.statusCode !== 204) fail("options_preflight", optionsRes.statusCode);
pass("options_preflight");

const foreign = await post({ cnpj: KNOWN_CNPJ }, "POST", { origin: "https://evil.example" });
if (foreign.statusCode === 200) fail("foreign_origin_accepted", foreign.statusCode);
pass("foreign_origin_denied", { status: foreign.statusCode });

// --- 3. Validation -----------------------------------------------------------
for (const [name, value] of [
  ["vazio", ""],
  ["curto", "1122233300"],
  ["digito_verificador_errado", INVALID_CNPJ],
  ["repetido", "11111111111111"],
  ["nao_string", { cnpj: 1 }],
]) {
  const res = await post({ cnpj: value });
  if (res.statusCode !== 422) fail(`cnpj_invalid_${name}`, { status: res.statusCode, body: res.body });
  const body = JSON.parse(res.body);
  if (body.error !== "cnpj_invalid") fail(`cnpj_invalid_error_${name}`, body);
  pass(`cnpj_invalid_${name}`);
}

// A formatted CNPJ is the same subject; the visitor should not have to strip it.
const formatted = await post({ cnpj: KNOWN_MASKED });
const formattedBody = JSON.parse(formatted.body);
if (formatted.statusCode !== 200 || formattedBody.state !== fn.RESULT_STATES.MATCH) {
  fail("formatted_cnpj_match", formattedBody);
}
pass("formatted_cnpj_match");

// --- 4. Match ----------------------------------------------------------------
const matchRes = await post({ cnpj: KNOWN_CNPJ });
const match = JSON.parse(matchRes.body);
if (matchRes.statusCode !== 200 || match.state !== fn.RESULT_STATES.MATCH) fail("match_state", match);
if (!match.categorias.length || !match.oportunidades_aderentes.length) fail("match_empty_result", match);
if (!match.dimensoes_da_aderencia.length) fail("match_no_dimensions", match);
if (match.disclaimer !== fn.DISCLAIMER_PT) fail("match_disclaimer", match.disclaimer);
if (!/habilitação|capacidade|recomendação/.test(match.disclaimer)) fail("disclaimer_text", match.disclaimer);
if (!match.limitations.length) fail("match_no_limitations", match);
pass("match_result", { state: match.state, aderentes: match.oportunidades_aderentes.length });

// The result is the answer, returned before any contact form is asked for.
for (const formField of ["nome", "email", "telefone", "consentimento", "turnstile"]) {
  if (formField in match) fail("result_asks_for_contact_first", formField);
}
pass("result_before_form");

// --- 5. Opaque analysis_id, never CNPJ-derived -------------------------------
// 16 random bytes as four hyphen-separated 8-hex groups. Widened from 8 bytes
// because this token now addresses a publicly shareable URL, where 64 bits is
// thin; 128 bits is not guessable.
const TOKEN_SHAPE = /^li_[0-9a-f]{8}(?:-[0-9a-f]{8}){3}$/;
if (!TOKEN_SHAPE.test(match.analysis_id)) fail("analysis_id_shape", match.analysis_id);
// The hyphens plus the all-digit-group rejection cap every digit run at seven,
// so `\d{8,}` — the widest digit rule any PII scanner here applies — can never
// match a token we mint, and no token is ever silently dropped as a document
// number. Strictly stronger than the previous `\d{9,}` guard.
if (/(?<!\d)\d{14}(?!\d)/.test(match.analysis_id)) fail("analysis_id_looks_like_a_cnpj", match.analysis_id);
for (let i = 0; i < 2000; i += 1) {
  const t = fn.newAnalysisId();
  if (!TOKEN_SHAPE.test(t)) fail("analysis_id_shape_drift", t);
  if (/\d{8}/.test(t)) fail("analysis_id_digit_run_too_long", t);
}
pass("analysis_id_cannot_look_like_a_cnpj");
// The shareable address the response advertises must be the one that resolves.
// `/analise-cnpj/r/` is a real static page; the opaque token rides in `?t=`
// because the host contract cannot map many token paths onto one page (a
// wildcard source requires a one-to-one :splat, :placeholder sources and
// destination queries are both rejected, and the runtime location allowlist is
// anchored at the function name).
if (match.result_path !== `/analise-cnpj/r/?t=${match.analysis_id}`) fail("result_path", match.result_path);
if (!require("fs").existsSync(path.join(root, "analise-cnpj/r/index.html"))) {
  fail("result_path_has_no_page_behind_it");
}
pass("result_path_points_at_the_real_shareable_route");

const urlCheck = cnpjLib.assertNoCnpjInUrl(match.result_path, KNOWN_CNPJ);
if (!urlCheck.ok) fail("cnpj_in_result_path", urlCheck);
pass("cnpj_never_in_route");

const second = JSON.parse((await post({ cnpj: KNOWN_CNPJ })).body);
if (second.analysis_id === match.analysis_id) fail("analysis_id_is_derived", match.analysis_id);
pass("analysis_id_is_random");

// The digest must not leak either: it is a stable pseudonym for the CNPJ.
const blob = JSON.stringify(match);
if (blob.includes(cnpjLib.hashCnpj(KNOWN_CNPJ))) fail("digest_in_response", cnpjLib.hashCnpj(KNOWN_CNPJ));
if (blob.includes(KNOWN_CNPJ) || blob.includes(KNOWN_MASKED)) fail("cnpj_in_response", blob.slice(0, 200));
if (cnpjLib.containsCnpj(blob.replace(/"analysis_id":"[^"]*"|"result_path":"[^"]*"/g, ""), KNOWN_CNPJ)) {
  fail("cnpj_digits_in_response", blob.slice(0, 200));
}
pass("no_subject_identifier_in_response");

// --- 6. Fail closed ----------------------------------------------------------
const noMatch = JSON.parse((await post({ cnpj: UNKNOWN_CNPJ })).body);
if (noMatch.state !== fn.RESULT_STATES.NO_MATCH || noMatch.reason !== "no_match") fail("no_match_state", noMatch);
if (noMatch.perfil !== null || noMatch.categorias.length || noMatch.oportunidades_aderentes.length) {
  fail("no_match_fabricated_profile", noMatch);
}
if (!/Sem dados suficientes/i.test(noMatch.titulo)) fail("no_match_title", noMatch.titulo);
pass("valid_cnpj_without_data_is_explicit");

const original = liveCompanies;
fn._setDatasetForTests(null);
const absent = JSON.parse((await post({ cnpj: KNOWN_CNPJ })).body);
if (absent.state !== fn.RESULT_STATES.NO_MATCH || absent.reason !== "dataset_absent") fail("dataset_absent", absent);
if (absent.perfil !== null) fail("dataset_absent_fabricated", absent);
pass("dataset_absent_fails_closed");

fn._setDatasetForTests({
  ...original,
  source_as_of: "2026-08-01T03:00:00+00:00",
  generated_at: "2026-09-01T09:00:00+00:00",
});
const stale = JSON.parse((await post({ cnpj: KNOWN_CNPJ })).body);
if (stale.state !== fn.RESULT_STATES.NO_MATCH || stale.reason !== "freshness_stale") fail("dataset_stale", stale);
pass("dataset_stale_fails_closed");

fn._setDatasetForTests({ ...original, source_as_of: "", generated_at: "" });
const noClock = JSON.parse((await post({ cnpj: KNOWN_CNPJ })).body);
if (noClock.reason !== "freshness_absent") fail("dataset_freshness_absent", noClock);
pass("dataset_without_clocks_fails_closed");

fn._setDatasetForTests(original);

// --- 7. Isolated from the lead and outbound flows ----------------------------
// This function now persists one thing: the public result record that backs the
// shareable /analise-cnpj/r/<token>/ page. That is a deliberate re-scope of the
// old blanket "no storage" assertion, which item 2 of this change made
// impossible to keep — the analyze path is the only place the result exists, so
// it is the only place that can store it.
//
// The invariant that actually mattered is kept and made specific: no lead flow,
// no outbound call, and nothing written outside this function's own namespace.
/** Comments are prose, not behaviour. Scan the code only. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const source = stripComments(
  require("fs").readFileSync(path.join(root, "netlify/functions/live-intelligence-analyze.cjs"), "utf8"),
);
for (const forbidden of ["lead-store", "createStore", "inbound-handoff", "fetch(", "writeFile"]) {
  if (source.includes(forbidden)) fail("analyze_touches_lead_or_outbound_flow", forbidden);
}
pass("analyze_has_no_lead_or_outbound_flow");

const storeSource = require("fs").readFileSync(
  path.join(root, "netlify/functions/lib/live-intelligence-result-store.cjs"),
  "utf8",
);
// The result store writes to exactly one namespace, and it is not the leads one.
const namespaceLiterals = [...storeSource.matchAll(/namespace\(([^)]*)\)/g)].map((m) => m[1].trim());
for (const literal of namespaceLiterals) {
  if (literal !== "STORE_NAMESPACE") fail("result_store_opens_unexpected_namespace", literal);
}
if (resultStore.STORE_NAMESPACE !== "live-intelligence-results") {
  fail("result_store_namespace", resultStore.STORE_NAMESPACE);
}
if (/\bleads\b/.test(storeSource.replace(/^\s*\*.*$/gm, "").replace(/\/\/.*$/gm, ""))) {
  fail("result_store_references_leads_namespace");
}
pass("result_store_writes_only_its_own_namespace", { namespace: resultStore.STORE_NAMESPACE });

// The new namespace is governed by the existing retention job rather than being
// an ungoverned store that accumulates forever.
const retentionSource = require("fs").readFileSync(path.join(root, "scripts/storage/retention.mjs"), "utf8");
if (!retentionSource.includes(`"${resultStore.STORE_NAMESPACE}":`)) {
  fail("result_namespace_not_registered_for_retention", resultStore.STORE_NAMESPACE);
}
pass("result_namespace_is_covered_by_retention");

// --- 8. The shareable result surface -----------------------------------------
// A result that exists only in a JS closure dies on refresh and cannot be
// shared. These assertions drive the real store and the real GET handler.

/**
 * The shell at /analise-cnpj/r/index.html hydrates itself from this call. The
 * token travels as an opaque query value; the path stays exactly the function's
 * allowlisted route, because the production nginx location and the portable
 * runtime both anchor function routes at the function name.
 */
function getByToken(token, headers = {}) {
  rate._reset();
  return fn.handler({
    httpMethod: "GET",
    path: "/api/web/live-intelligence-analyze",
    queryStringParameters: token == null ? {} : { token },
    headers: { origin: "https://confenge.com.br", accept: "application/json", ...headers },
    body: null,
  });
}

const shared = JSON.parse((await post({ cnpj: KNOWN_CNPJ })).body);
const sharedPath = shared.result_path;

// The stored record carries exactly the allowed fields and nothing else.
const storedRecord = resultStore.loadResult(shared.analysis_id);
if (!storedRecord) fail("result_not_persisted", shared.analysis_id);
const envelopeKeys = Object.keys(storedRecord).sort();
if (JSON.stringify(envelopeKeys) !== JSON.stringify([...resultStore.ENVELOPE_FIELDS].sort())) {
  fail("stored_envelope_keys", envelopeKeys);
}
const storedKeys = Object.keys(storedRecord.result);
const extra = storedKeys.filter((k) => !resultStore.RESULT_FIELDS.includes(k));
if (extra.length) fail("stored_record_has_unlisted_fields", extra);
pass("stored_record_matches_the_declared_field_set", { fields: storedKeys.length });

// Nothing from the lead-capture flow, and no subject identifier, may ever be in it.
const storedBlob = JSON.stringify(storedRecord);
for (const forbidden of resultStore.FORBIDDEN_FIELDS) {
  if (new RegExp(`"${forbidden}"\\s*:`, "i").test(storedBlob)) {
    fail("stored_record_has_forbidden_field", forbidden);
  }
}
if (storedBlob.includes(KNOWN_CNPJ) || storedBlob.includes(KNOWN_MASKED)) {
  fail("stored_record_contains_cnpj");
}
if (storedBlob.includes(cnpjLib.hashCnpj(KNOWN_CNPJ))) fail("stored_record_contains_digest");
if (cnpjLib.containsCnpj(storedBlob.replace(/"(?:result_token|analysis_id|result_path)":"[^"]*"/g, ""), KNOWN_CNPJ)) {
  fail("stored_record_contains_cnpj_digits");
}
pass("stored_record_carries_no_pii_and_no_subject_identifier");

// The opaque token cannot be derived from the CNPJ: the same CNPJ analysed
// repeatedly yields unrelated tokens, so a token is not a function of its input.
const tokens = new Set();
for (let i = 0; i < 25; i += 1) {
  tokens.add(JSON.parse((await post({ cnpj: KNOWN_CNPJ })).body).analysis_id);
}
if (tokens.size !== 25) fail("token_is_derived_from_cnpj", tokens.size);
pass("token_is_random_not_cnpj_derived", { distinct: tokens.size });

// The token resolves, and resolves to the result.
const page = await getByToken(shared.analysis_id);
if (page.statusCode !== 200) fail("shared_token_does_not_resolve", page.statusCode);
if (!/noindex/i.test(page.headers["X-Robots-Tag"] || "")) fail("shared_result_is_indexable", page.headers);
const pageBody = JSON.parse(page.body);
if (pageBody.titulo !== shared.titulo) fail("shared_result_mismatch", pageBody.titulo);
if (pageBody.analysis_id !== shared.analysis_id) fail("shared_result_wrong_token", pageBody.analysis_id);
pass("shared_url_resolves_to_the_result");

// The served record is the same closed field set as the stored one.
const servedExtra = Object.keys(pageBody).filter(
  (k) => k !== "ok" && !resultStore.RESULT_FIELDS.includes(k),
);
if (servedExtra.length) fail("served_record_has_unlisted_fields", servedExtra);
pass("served_record_matches_the_declared_field_set");

// A hard refresh, back/forward, and a cold open from another browser session are
// all the same thing to the server: a fresh request with no client state, no
// cookie and no referer. The result is not user-scoped — that is what makes it
// shareable rather than merely persistent.
const reopened = await getByToken(shared.analysis_id, { cookie: "", referer: "" });
if (reopened.statusCode !== 200) fail("shared_url_is_session_scoped", reopened.statusCode);
if (reopened.body !== page.body) fail("shared_url_is_not_stable", "body differed between opens");
pass("shared_url_survives_refresh_and_cold_open_in_another_session");

// The address and the payload never contain the CNPJ.
if (cnpjLib.containsCnpj(sharedPath, KNOWN_CNPJ)) fail("cnpj_in_shared_path", sharedPath);
if (!cnpjLib.assertNoCnpjInUrl(sharedPath, KNOWN_CNPJ).ok) fail("cnpj_in_shared_url", sharedPath);
if (page.body.includes(KNOWN_CNPJ) || page.body.includes(KNOWN_MASKED)) fail("cnpj_in_shared_payload");
if (page.body.includes(cnpjLib.hashCnpj(KNOWN_CNPJ))) fail("digest_in_shared_payload");
pass("shared_url_and_payload_never_contain_the_cnpj");

// The static shell that serves every result address carries no result data of
// its own and no CNPJ — it is the same bytes for every visitor.
const shellHtml = require("fs").readFileSync(path.join(root, "analise-cnpj/r/index.html"), "utf8");
const robotsMeta = (shellHtml.match(/<meta[^>]*name="robots"[^>]*>/i) || [""])[0];
if (!/content="noindex/i.test(robotsMeta)) fail("result_shell_is_not_noindex", robotsMeta);
if (shellHtml.includes(KNOWN_CNPJ) || shellHtml.includes(KNOWN_MASKED)) fail("cnpj_in_result_shell");
if (/li_[0-9a-f]{8}-/.test(shellHtml)) fail("result_shell_carries_a_token");
pass("result_shell_is_noindex_and_result_free");

// An unknown, malformed, or absent token all answer identically (404, same
// body shape) — a malformed token must not be distinguishable from a
// never-issued one via a different status code (that distinction is itself
// an oracle an attacker could use to probe the token space).
for (const [name, token] of [
  ["desconhecido", "li_deadbeef-deadbeef-deadbeef-deadbeef"],
  ["malformado", "li_short"],
  ["travessia", "../../etc/passwd"],
  ["ausente", null],
]) {
  const missing = await getByToken(token);
  if (missing.statusCode !== 404) fail(`unknown_token_${name}`, missing.statusCode);
  if (JSON.parse(missing.body).error !== "result_not_found") fail(`unknown_token_${name}_shape`, missing.body);
  if (missing.body.includes(KNOWN_CNPJ)) fail(`unknown_token_${name}_echoed_cnpj`);
}
pass("unknown_token_is_not_resolvable");

// The read path enforces expiry itself; it must not depend on the retention
// sweep (scripts/storage/retention.mjs) having already run — that is a
// scheduled/manual job, not a request-time guarantee. A record whose
// delete_after is already in the past must never be served.
const staleToken = resultStore.newResultToken();
const staleNow = new Date(Date.now() - 400 * 864e5); // long before any real TTL
const staleWrite = resultStore.saveResult(
  { ...match, analysis_id: staleToken, result_path: resultStore.resultRoute(staleToken) },
  { now: staleNow },
);
if (!staleWrite.ok) fail("stale_record_write_failed", staleWrite);
if (resultStore.loadResult(staleToken)) fail("expired_record_still_served_by_store", staleToken);
pass("store_read_path_enforces_expiry_without_relying_on_the_sweep");

// And the handler answers an expired-but-unswept token exactly like a
// never-issued one — same status, same body shape, no way to tell them apart.
const staleViaHandler = await getByToken(staleToken);
if (staleViaHandler.statusCode !== 404) fail("expired_token_via_handler_status", staleViaHandler.statusCode);
if (JSON.parse(staleViaHandler.body).error !== "result_not_found") {
  fail("expired_token_via_handler_shape", staleViaHandler.body);
}
pass("expired_token_answered_same_as_never_issued");

// --- 9. JS-absent: a native form POST never puts the CNPJ in a URL ------------
// This is the fail-closed path from item 1. No fetch, no preventDefault, no JS
// at all: exactly what a browser does when the deferred script fails to load.
async function nativeFormPost(rawValue) {
  rate._reset();
  return fn.handler({
    httpMethod: "POST",
    path: "/api/web/live-intelligence-analyze",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html,application/xhtml+xml",
      origin: "https://confenge.com.br",
      referer: "https://confenge.com.br/analise-cnpj/",
      "user-agent": "Mozilla/5.0 (no-js)",
      "x-forwarded-for": "203.0.113.78",
    },
    body: `cnpj=${encodeURIComponent(rawValue)}`,
  });
}

const native = await nativeFormPost(KNOWN_MASKED);

// The privacy guarantee, stated exactly: a native POST carries the CNPJ in the
// request body, so nothing about it can reach a URL, a history entry or an
// onward Referer — with no JS running and no preventDefault() involved.
if (native.statusCode !== 200) fail("native_form_post_status", native.statusCode);
if (native.headers.Location) fail("native_form_post_should_not_redirect", native.headers.Location);
if (!/text\/html/.test(native.headers["Content-Type"] || "")) fail("native_form_content_type", native.headers);
if (!/noindex/i.test(native.headers["X-Robots-Tag"] || "")) fail("native_form_page_is_indexable", native.headers);
// The answer is served, not withheld: a no-JS visitor still gets their result.
if (!/Perfil contratual/i.test(native.body)) fail("js_absent_visitor_got_no_result");
// Provenance is disclosed, not just computed: fonte_kind must actually render.
if (!/Procedência técnica/i.test(native.body)) fail("native_page_missing_provenance_section");
if (match.fonte_kind && !native.body.includes(match.fonte_kind)) {
  fail("native_page_missing_fonte_kind_value", match.fonte_kind);
}
pass("provenance_source_kind_is_actually_rendered");
// And nothing in that response echoes the submitted CNPJ back.
if (native.body.includes(KNOWN_CNPJ) || native.body.includes(KNOWN_MASKED)) {
  fail("cnpj_echoed_into_js_absent_page");
}
if (native.body.includes(cnpjLib.hashCnpj(KNOWN_CNPJ))) fail("digest_in_js_absent_page");
// Every link the rendered page offers is CNPJ-free, so no onward navigation can
// carry it either.
for (const href of [...native.body.matchAll(/href="([^"]*)"/g)].map((m) => m[1])) {
  if (cnpjLib.containsCnpj(href, KNOWN_CNPJ)) fail("cnpj_in_js_absent_page_link", href);
}
pass("js_absent_form_post_answers_without_any_url_carrying_the_cnpj");

// A GET carrying a CNPJ is not a thing this endpoint will ever answer. A CNPJ
// is not a valid token shape, so it resolves the same way any other
// malformed/unknown token does: 404, never a distinct status.
const getWithCnpj = await getByToken(KNOWN_CNPJ);
if (getWithCnpj.statusCode !== 404) fail("get_with_cnpj_answered", getWithCnpj.statusCode);
const getWithCnpjKey = await fn.handler({
  httpMethod: "GET",
  path: "/api/web/live-intelligence-analyze",
  queryStringParameters: { cnpj: KNOWN_CNPJ },
  headers: { origin: "https://confenge.com.br", accept: "application/json" },
  body: null,
});
if (getWithCnpjKey.statusCode !== 404) fail("get_with_cnpj_key_answered", getWithCnpjKey.statusCode);
pass("no_get_request_carrying_a_cnpj_is_ever_answered");

// --- 10. Hostile and malformed input ------------------------------------------
// Every one is rejected or handled fail-closed, and none is echoed back into the
// response body or into any URL.
const HOSTILE = [
  ["comprimento_13", "1122233300018"],
  ["comprimento_15", "112223330001811"],
  ["nao_numerico", "abcdefghijklmn"],
  ["checksum_invalido", "11222333000182"],
  ["vazio_espacos", "   "],
  ["muito_longo", "1".repeat(500)],
  ["injecao_html", "<script>alert(1)</script>"],
  ["injecao_sql", "' OR 1=1--"],
  ["travessia", "../../etc/passwd"],
  ["nulo_embutido", `11222333000181${String.fromCharCode(0)}`],
  ["crlf", "11222333000181\r\nX-Injected: 1"],
];
for (const [name, value] of HOSTILE) {
  const res = await post({ cnpj: value });
  if (res.statusCode === 200) {
    const body = JSON.parse(res.body);
    // A hostile string that normalizes to a real CNPJ is allowed to succeed,
    // but only through the same opaque-token path as any other lookup.
    if (!/^\/analise-cnpj\/r\/li_/.test(body.result_path || "")) {
      fail(`hostile_${name}_bypassed_the_token_path`, body.result_path);
    }
    if (cnpjLib.containsCnpj(body.result_path, value)) fail(`hostile_${name}_in_result_path`, body.result_path);
    continue;
  }
  // Every fail-closed rejection is acceptable; being answered is not. 422 is an
  // invalid CNPJ, 413 an oversized body, 415/400 a body the parser refuses (a
  // NUL byte, for one). What must never happen is a 200 outside the token path.
  if (![400, 413, 415, 422, 429].includes(res.statusCode)) {
    fail(`hostile_${name}_status`, res.statusCode);
  }
  // The rejected input must never be reflected back to the caller.
  if (res.body.includes(value.slice(0, 40)) && value.trim().length > 3) {
    fail(`hostile_${name}_echoed_input`, res.body.slice(0, 200));
  }
  // And the native path must not reflect it into a page or a Location either.
  const nativeRes = await nativeFormPost(value);
  const loc = nativeRes.headers.Location || "";
  if (loc && cnpjLib.containsCnpj(loc, value)) fail(`hostile_${name}_native_location`, loc);
  if (loc.includes("?") || loc.includes("=")) fail(`hostile_${name}_native_query`, loc);
  if (nativeRes.body && nativeRes.body.includes(value.slice(0, 40)) && value.trim().length > 3) {
    fail(`hostile_${name}_native_echoed_input`, nativeRes.body.slice(0, 200));
  }
}
pass("hostile_inputs_fail_closed_without_echo", { cases: HOSTILE.length });

// A deeply nested array in the `cnpj` field must fail closed like any other
// hostile input, not crash the handler. String(raw) on a ~5000-deep array
// recurses through Array.prototype.toString and throws RangeError if the
// validator does not reject non-string input before ever coercing it.
const nestedArrayBody = '{"cnpj":' + "[".repeat(5000) + "]".repeat(5000) + "}";
const nestedRes = await post(nestedArrayBody);
if (![400, 413, 415, 422].includes(nestedRes.statusCode)) {
  fail("nested_array_cnpj_status", nestedRes.statusCode);
}
pass("nested_array_cnpj_fails_closed_not_crashes");

// Non-string CNPJ values whose default JS coercion happens to look like a
// valid CNPJ (a single-element array, a bare number) must not be silently
// accepted as equivalent to the real string.
for (const [name, body] of [
  ["array_de_um_elemento", { cnpj: [KNOWN_CNPJ] }],
  ["numero", { cnpj: Number(KNOWN_CNPJ) }],
]) {
  const res = await post(body);
  if (res.statusCode === 200) fail(`non_string_cnpj_${name}_accepted`, res.statusCode);
}
pass("non_string_cnpj_input_rejected");

// --- 11. The durable backend, not just the test memory adapter ---------------
// Everything above ran on the in-memory adapter. Production is the host-owned
// filesystem store, so the same round trip is driven against a real
// HostFileBackend on disk: a shareable URL that only works in tests is not a
// shareable URL.
const fsMod = require("fs");
const osMod = require("os");
const storeDir = fsMod.mkdtempSync(path.join(osMod.tmpdir(), "confenge-li-results-"));
const durableEnv = {
  ...process.env,
  NODE_ENV: "test",
  CONFENGE_STORAGE_BACKEND: "filesystem",
  CONFENGE_STORAGE_DIR: storeDir,
};
try {
  const durable = { ...match, analysis_id: resultStore.newResultToken() };
  durable.result_path = resultStore.resultRoute(durable.analysis_id);
  const wrote = resultStore.saveResult(durable, { env: durableEnv });
  if (!wrote.ok) fail("durable_write_failed", wrote);
  const readBack = resultStore.loadResult(durable.analysis_id, { env: durableEnv });
  if (!readBack) fail("durable_read_failed", durable.analysis_id);
  if (readBack.result.titulo !== durable.titulo) fail("durable_round_trip_mismatch");
  if (JSON.stringify(Object.keys(readBack).sort()) !== JSON.stringify([...resultStore.ENVELOPE_FIELDS].sort())) {
    fail("durable_envelope_keys", Object.keys(readBack));
  }
  pass("durable_filesystem_round_trip", { backend: "filesystem" });

  // The record is written under the namespace retention sweeps, with the
  // delete_after field that job reads. Without both, records would accumulate
  // forever in an ungoverned store.
  const nsDir = path.join(storeDir, "v1", resultStore.STORE_NAMESPACE);
  if (!fsMod.existsSync(nsDir)) fail("durable_namespace_dir_missing", nsDir);
  const files = fsMod.readdirSync(nsDir).filter((f) => f.endsWith(".json"));
  if (files.length !== 1) fail("durable_record_count", files.length);
  const onDisk = JSON.parse(fsMod.readFileSync(path.join(nsDir, files[0]), "utf8"));
  if (onDisk.schema !== "confenge-host-file-record/v1") fail("durable_envelope_schema", onDisk.schema);
  if (onDisk.namespace !== resultStore.STORE_NAMESPACE) fail("durable_envelope_namespace", onDisk.namespace);
  if (!Date.parse(onDisk.value.delete_after)) fail("durable_record_has_no_retention_clock", onDisk.value);
  const ttlDays = (Date.parse(onDisk.value.delete_after) - Date.parse(onDisk.value.created_at)) / 864e5;
  // A cached projection of public data, not a lead: it must not inherit the
  // 730-day lead retention.
  if (!(ttlDays > 0 && ttlDays <= 90)) fail("durable_retention_window", ttlDays);
  pass("durable_record_is_retention_governed", { ttl_days: ttlDays });

  // Nothing that reached the disk resembles the subject of the lookup.
  const rawFile = fsMod.readFileSync(path.join(nsDir, files[0]), "utf8");
  if (rawFile.includes(KNOWN_CNPJ) || rawFile.includes(KNOWN_MASKED)) fail("cnpj_on_disk");
  if (rawFile.includes(cnpjLib.hashCnpj(KNOWN_CNPJ))) fail("digest_on_disk");
  pass("nothing_on_disk_identifies_the_company");

  // A caller that passes lead-flow data cannot get it onto disk: the allowlist
  // projection drops it before the write, so the record still lands but clean.
  const dirtyToken = resultStore.newResultToken();
  const dirty = resultStore.saveResult(
    {
      ...durable,
      analysis_id: dirtyToken,
      result_path: resultStore.resultRoute(dirtyToken),
      email: "alguem@example.com",
      nome: "Fulano",
      telefone: "48988344559",
      consentimento: true,
      cnpj: KNOWN_CNPJ,
      intent_kind: "MONITOR_COMPANY",
      lead_id: "lead-123",
    },
    { env: durableEnv },
  );
  if (!dirty.ok) fail("projection_should_drop_extras_not_fail_the_write", dirty);
  const dirtyBack = resultStore.loadResult(dirtyToken, { env: durableEnv });
  if (!dirtyBack) fail("projected_record_not_readable", dirtyToken);
  for (const leaked of ["email", "nome", "telefone", "consentimento", "cnpj", "intent_kind", "lead_id"]) {
    if (leaked in dirtyBack.result) fail("lead_flow_field_survived_projection", leaked);
  }
  const everything = fsMod
    .readdirSync(nsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => fsMod.readFileSync(path.join(nsDir, f), "utf8"))
    .join("");
  for (const needle of ["alguem@example.com", "Fulano", "48988344559", "lead-123", KNOWN_CNPJ, KNOWN_MASKED]) {
    if (everything.includes(needle)) fail("lead_flow_value_reached_disk", needle);
  }
  pass("lead_flow_fields_cannot_reach_disk_even_when_passed_in");
} finally {
  fsMod.rmSync(storeDir, { recursive: true, force: true });
}

console.log("LIVE_INTELLIGENCE_ANALYZE_OK", JSON.stringify({ tests: results.length }));
