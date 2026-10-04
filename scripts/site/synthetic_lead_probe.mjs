/**
 * Authenticated, non-human inbound proof against a base URL.
 *
 * The probe fails before POST unless both server credentials and the Warmbly
 * no-dispatch safety gate are ready. It creates one durable row, retries the
 * same idempotency key, then emits only aggregate booleans and a receipt hash.
 * No human identity, raw receipt, secret or free-text lead field is printed.
 */
import { createHash, randomUUID } from "node:crypto";
import { parse } from "parse5";

const blockedProbe = Symbol("controlled_probe_block");
const CONTEXT_FIELDS = ["asset_id", "cta_id", "route_family", "jornada", "estagio", "origem"];
const ATTRIBUTION_FIELDS = ["asset_id", "cta_id", "route_family"];
const CONTEXT_VALUE = /^[\w./:-]{1,120}$/;

// Browser-compatible HTML parsing keeps quoted attribute values from being
// mistaken for attributes. This deliberately accepts only a conservative
// subset of controls: a hidden input that is local to this form and not inside
// a disabled fieldset. Form data attributes only corroborate that value.
// It does not claim to reproduce every browser FormData edge case.
export function servedFormContext(html) {
  const attrs = (node) => Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
  const descendants = (node) => (node.childNodes || []).flatMap((child) => [child, ...descendants(child)]);
  const form = descendants(parse(String(html || ""))).find((node) => {
    if (node.tagName !== "form") return false;
    const values = attrs(node);
    return Object.hasOwn(values, "data-capture-form")
      || (values.class || "").split(/\s+/).includes("pillar-capture-form");
  });
  if (!form) return null;

  const values = attrs(form);
  const attr = (name) => values[name];
  const inputs = descendants(form).filter((node) => node.tagName === "input");
  const isInsideDisabledFieldset = (node) => {
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
      if (parent.tagName === "fieldset" && Object.hasOwn(attrs(parent), "disabled")) return true;
      if (parent === form) break;
    }
    return false;
  };
  const context = {};
  for (const name of CONTEXT_FIELDS) {
    const controls = inputs.filter((node) => attrs(node).name === name);
    if (controls.length > 1) return { error: "duplicate_hidden", field: name };
    if (!controls.length) continue;
    const fields = attrs(controls[0]);
    if (Object.hasOwn(fields, "disabled")) return { error: "disabled_hidden", field: name };
    if (isInsideDisabledFieldset(controls[0])) return { error: "unsupported_form_control", field: name };
    if (Object.hasOwn(fields, "form") && fields.form !== values.id) {
      return { error: "unsupported_form_control", field: name };
    }
    if (String(fields.type || "").toLowerCase() !== "hidden") return { error: "not_hidden", field: name };
    const value = fields.value;
    // Empty optional controls are omitted by this context reader; required
    // attribution is checked below before any POST.
    if (value === "" && !ATTRIBUTION_FIELDS.includes(name) && name !== "origem") continue;
    if (typeof value !== "string" || !CONTEXT_VALUE.test(value)) {
      return { error: "invalid_hidden_value", field: name };
    }
    context[name] = value;
  }

  for (const name of ATTRIBUTION_FIELDS) {
    const declared = attr(`data-${name.replace("_", "-")}`);
    if (declared === undefined) continue;
    if (typeof declared !== "string" || !CONTEXT_VALUE.test(declared)) {
      return { error: "invalid_attribute_value", field: name };
    }
    if (!context[name] || declared !== context[name]) {
      return { error: "attribute_hidden_mismatch", field: name };
    }
  }
  return { context };
}

async function runProbe() {

const base = (process.argv[2] || "https://confenge.com.br").replace(/\/$/, "");
const probeSecret = process.argv[3] || process.env.LEAD_PROBE_SECRET || "";
const opsToken = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
const expectedSha = String(process.env.EXPECTED_SHA || "").trim();
const verifyQaEmailRaw = String(process.env.PROBE_VERIFY_EMAIL || "").trim();
const verifyQaEmail = verifyQaEmailRaw === "1";
const stamp = Date.now();
// Random, never a timestamp: an explicit key is a persistence handle and a
// derivable one could be guessed by a third party (the pre-Turnstile replay in
// lead.cjs only honours front-minted shapes anyway, so this is defensive).
const idem = `synthetic-probe-${randomUUID()}`;

function finishEarly(reason) {
  console.log(JSON.stringify({
    ok: false,
    state: "BLOCKED_BEFORE_POST",
    reason,
    base,
    ts: new Date().toISOString(),
  }));
  throw blockedProbe;
}

let parsedBase;
try {
  parsedBase = new URL(base);
} catch {
  finishEarly("base_url_invalid");
}
const localBase = ["127.0.0.1", "localhost", "::1"].includes(parsedBase.hostname);
if (!localBase && base !== "https://confenge.com.br") finishEarly("canonical_base_required");
if (localBase && !["http:", "https:"].includes(parsedBase.protocol)) finishEarly("local_protocol_invalid");
if (!localBase && parsedBase.protocol !== "https:") finishEarly("https_required");
if (probeSecret.length < 32) finishEarly("lead_probe_secret_missing_or_short");
if (opsToken.length < 16) finishEarly("ops_token_missing_or_short");
if (verifyQaEmailRaw && !["0", "1"].includes(verifyQaEmailRaw)) {
  finishEarly("probe_verify_email_opt_in_invalid");
}
if (verifyQaEmail && !/^[0-9a-f]{40}$/.test(expectedSha)) {
  finishEarly("qa_expected_release_sha_required");
}
if (verifyQaEmail && String(process.env.PROBE_QA_RECIPIENT || "").trim()) {
  finishEarly("qa_recipient_override_forbidden");
}

const authHeaders = { Authorization: `Bearer ${opsToken}`, Accept: "application/json" };

async function jsonRequest(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  const data = await response.json().catch(() => ({}));
  return { http: response.status, data };
}

async function ops(action, leadId = "") {
  const query = new URLSearchParams({ action });
  if (leadId) query.set("lead_id", leadId);
  return jsonRequest(`/.netlify/functions/ops?${query}`, { headers: authHeaders });
}

function commercialSnapshot(funnel, weekly) {
  return {
    funnel_counts: funnel.data?.funnel?.counts || null,
    pipeline_value: funnel.data?.funnel?.pipeline_value ?? null,
    revenue: funnel.data?.funnel?.revenue ?? null,
    weekly_leads_total: weekly.data?.leads_total ?? null,
    weekly_leads_new_7d: weekly.data?.leads_new_7d ?? null,
    weekly_pipeline_real: weekly.data?.system_health?.pipeline_real ?? null,
    weekly_revenue_real: weekly.data?.system_health?.revenue_real ?? null,
  };
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const build = await jsonRequest("/.well-known/build-info.json");
const liveSha = String(build.data?.commit || "");
if (build.http !== 200 || !/^[0-9a-f]{40}$/.test(liveSha)) finishEarly("live_build_identity_missing");
if (expectedSha && liveSha !== expectedSha) finishEarly("live_build_identity_mismatch");

const [beforeFunnel, beforeSystem, beforeWeekly, beforeInbound] = await Promise.all([
  ops("funnel"),
  ops("system_health"),
  ops("weekly_report"),
  ops("inbound_handoff"),
]);
const safety = beforeInbound.data?.safety_gate;
const safeToProbe = Boolean(
  beforeInbound.http === 200 &&
  beforeInbound.data?.ok === true &&
  beforeInbound.data?.configuration?.contract === "READY" &&
  beforeInbound.data?.configuration?.destination_fingerprint === "WARMBLY_PRODUCTION_V1" &&
  safety?.ok === true &&
  safety?.contract === "READY" &&
  safety?.auto_send_off === true &&
  safety?.dispatch_attempted === false
);
if (!safeToProbe) finishEarly("warmbly_safety_gate_not_ready");
if (
  beforeFunnel.http !== 200 || beforeFunnel.data?.commercial_only !== true ||
  beforeSystem.http !== 200 || beforeSystem.data?.ok !== true ||
  beforeWeekly.http !== 200 || beforeWeekly.data?.commercial_only !== true
) finishEarly("commercial_baseline_unavailable");

// Optional page context (2026-09-16): a published capture form can be proved
// with the attribution its hidden fields would send, so the durable synthetic
// record carries the same origem/asset/cta/route_family/jornada/estagio as a
// real submission from that page. Identity, marker and exclusion are unchanged.
const pageContext = {};
for (const [env, field] of [
  ["PROBE_ORIGEM", "origem"],
  ["PROBE_ASSET_ID", "asset_id"],
  ["PROBE_CTA_ID", "cta_id"],
  ["PROBE_ROUTE_FAMILY", "route_family"],
  ["PROBE_JORNADA", "jornada"],
  ["PROBE_ESTAGIO", "estagio"],
  ["PROBE_LANDING_PAGE", "landing_page"],
]) {
  const value = String(process.env[env] || "").trim();
  if (value && !CONTEXT_VALUE.test(value)) finishEarly("probe_context_env_invalid");
  if (value) pageContext[field] = value;
}

// Optional served-form cross-check (A06-RECEBIMENTO-08, 2026-09-19): with
// PROBE_PAGE_PATH the probe reads the published page BEFORE posting and
// requires the context it will send to match the attributes of the served
// capture <form> (data-asset-id / data-cta-id / data-route-family) and its
// hidden jornada/estagio/origem inputs. The persisted record is then proved
// against the page as served, not against values typed into the environment.
// Any mismatch blocks the POST (no synthetic row is created for a page
// context that is not the published one).
const pagePath = String(process.env.PROBE_PAGE_PATH || "").trim();
let servedForm = null;
if (pagePath) {
  if (!/^\/[\w./-]{0,200}$/.test(pagePath)) finishEarly("probe_page_path_invalid");
  const page = await fetch(`${base}${pagePath}`)
    .then(async (r) => ({ http: r.status, text: await r.text() }))
    .catch(() => ({ http: 0, text: "" }));
  if (page.http !== 200) finishEarly("probe_page_unavailable");
  const served = servedFormContext(page.text);
  if (!served) finishEarly("probe_page_capture_form_missing");
  if (served.error) {
    console.log(JSON.stringify({
      ok: false,
      state: "BLOCKED_BEFORE_POST",
      reason: "probe_page_served_form_invalid",
      served_form_error: served.error,
      served_form_field: served.field,
      base,
      page_path: pagePath,
      ts: new Date().toISOString(),
    }));
    throw blockedProbe;
  }
  servedForm = served.context;
  const mismatch = Object.keys(pageContext).filter(
    (key) => pageContext[key] !== (key === "landing_page" ? pagePath : servedForm[key]),
  );
  if (mismatch.length) {
    console.log(JSON.stringify({
      ok: false,
      state: "BLOCKED_BEFORE_POST",
      reason: "page_context_differs_from_served_form",
      base,
      page_path: pagePath,
      mismatch,
      page_context: pageContext,
      served_form: servedForm,
      ts: new Date().toISOString(),
    }));
    throw blockedProbe;
  }
  if (["origem", "asset_id", "cta_id", "route_family"].some((key) => !servedForm[key])) {
    finishEarly("probe_page_attribution_missing");
  }
  // The published form is the source of attribution. Explicit environment
  // values remain cross-checked above; absent values are read from that form.
  Object.assign(pageContext, servedForm);
  pageContext.landing_page = pagePath;
}

const payload = {
  nome: "SYNTHETIC-PROBE",
  email: "probe@example.com",
  estagio: "synthetic probe discard",
  jornada: "operacao",
  // This is a protocol fixture required by the existing intake validator. The
  // server credential, durable synthetic marker and exclusion rule establish
  // that it is not evidence of human consent.
  consentimento: true,
  origem: "/synthetic-probe",
  utm_source: "synthetic",
  utm_medium: "probe",
  utm_campaign: "inbound-live-proof",
  landing_page: "/",
  mensagem: "synthetic probe do not contact",
  ...pageContext,
  test_mode: true,
  record_kind: "synthetic",
  idempotency_key: idem,
};

const headers = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: localBase ? base : "https://confenge.com.br",
  "User-Agent": `confenge-synthetic-probe/2.0 (${stamp})`,
  "X-Forwarded-For": "198.51.100.27",
  "X-Confenge-Probe": probeSecret,
  "Idempotency-Key": idem,
  ...(verifyQaEmail
    ? {
        "X-Confenge-QA-Email": "1",
        "X-Confenge-Ops-Token": opsToken,
        "X-Confenge-Expected-Sha": expectedSha,
      }
    : {}),
};

async function postOnce() {
  const response = await fetch(`${base}/.netlify/functions/lead`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = {}; }
  return { http: response.status, text, data };
}

const first = await postOnce();
const second = await postOnce();
const leadId = String(first.data?.lead_id || first.data?.receipt_id || "");
const sameId = Boolean(leadId) && second.data?.lead_id === leadId;

const [receiptOps, afterFunnel, afterSystem, afterWeekly] = await Promise.all([
  ops("inbound_handoff", leadId),
  ops("funnel"),
  ops("system_health"),
  ops("weekly_report"),
]);
const receipt = receiptOps.data?.receipt;
const beforeCommercial = commercialSnapshot(beforeFunnel, beforeWeekly);
const afterCommercial = commercialSnapshot(afterFunnel, afterWeekly);
const beforeSynthetic = Number(beforeSystem.data?.counts_by_kind?.synthetic);
const afterSynthetic = Number(afterSystem.data?.counts_by_kind?.synthetic);
const beforeExcluded = Number(beforeWeekly.data?.leads_excluded_non_real);
const afterExcluded = Number(afterWeekly.data?.leads_excluded_non_real);
const forbiddenLeak = ["topic", "ntfy", "formsubmit", "upstream", "RESEND_API_KEY"].some(
  (value) => first.text.toLowerCase().includes(value.toLowerCase()),
);
const qaProviderId = String(receipt?.delivery?.qa_email_provider_id || "");
const qaSubject = verifyQaEmail && leadId
  ? `[TESTE CONTROLADO] CONFENGE ${leadId}`
  : null;

const checks = {
  first_create_http_201: first.http === 201 && first.data?.ok === true,
  persistence_receipt_present: /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(leadId),
  retry_http_200_idempotent: second.http === 200 && second.data?.idempotent === true,
  retry_same_receipt: sameId,
  notification_skipped: first.data?.notify_status === "skipped",
  email_skipped: first.data?.email_status === "skipped",
  no_public_secret_leak: !forbiddenLeak,
  authenticated_synthetic_record: receipt?.authenticated_probe === true && receipt?.record_kind === "synthetic",
  excluded_from_commercial: receipt?.next_action === "exclude_from_commercial",
  canonical_source: receipt?.source === "CONFENGE_WEB",
  warmbly_delivered: receipt?.handoff?.status === "DELIVERED",
  exactly_one_handoff_attempt: receipt?.handoff?.attempts === 1,
  downstream_receipt_matches: receipt?.handoff?.downstream?.downstream_receipt === leadId,
  downstream_created_not_duplicate: receipt?.handoff?.downstream?.http === 201 && receipt?.handoff?.downstream?.duplicate === false,
  downstream_action_absent: !receipt?.handoff?.downstream?.action_id,
  persisted_exactly_once: afterSynthetic - beforeSynthetic === 1,
  excluded_non_real_exactly_once: afterExcluded - beforeExcluded === 1,
  commercial_metrics_unchanged: sameJson(beforeCommercial, afterCommercial),
  commercial_contract_real_only: afterFunnel.data?.commercial_only === true && afterWeekly.data?.commercial_only === true,
  // O contexto da pagina (asset_id/route_family/cta_id) tem de chegar ao registro
  // persistido, nao so ao payload enviado (SALTO-INSTITUCIONAL-02, 2026-09-18).
  page_context_persisted: !Object.keys(pageContext).length || ["asset_id", "route_family", "cta_id"].every(
    (key) => !pageContext[key] || receipt?.[key] === pageContext[key],
  ),
  // With PROBE_PAGE_PATH the persisted attribution must equal the served
  // form's attributes (the page as published), not only the values sent.
  served_form_context_persisted: !servedForm || ["asset_id", "route_family", "cta_id"].every(
    (key) => !servedForm[key] || receipt?.[key] === servedForm[key],
  ),
  ...(verifyQaEmail
    ? {
        qa_email_delivered: receipt?.delivery?.qa_email_status === "ok",
        qa_provider_id_sanitized: /^[A-Za-z0-9._:-]{1,64}$/.test(qaProviderId),
      }
    : {}),
};
const ok = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  ok,
  state: ok ? "TRANSPORT_READY" : "TRANSPORT_PROOF_FAILED",
  base,
  live_sha: liveSha,
  page_context: Object.keys(pageContext).length ? pageContext : null,
  page_path: pagePath || null,
  served_form: servedForm,
  persisted_context: receipt ? { asset_id: receipt.asset_id || null, route_family: receipt.route_family || null, cta_id: receipt.cta_id || null } : null,
  receipt_sha256: leadId ? createHash("sha256").update(leadId).digest("hex") : null,
  ...(verifyQaEmail
    ? {
        qa_email: {
          status: receipt?.delivery?.qa_email_status || null,
          provider_id: qaProviderId || null,
          subject: qaSubject,
        },
      }
    : {}),
  warmbly: {
    destination_fingerprint: beforeInbound.data?.configuration?.destination_fingerprint || null,
    contract: safety?.contract || null,
    auto_send: safety ? !safety.auto_send_off : null,
    dispatch_attempted: safety?.dispatch_attempted ?? null,
  },
  deltas: {
    persisted_synthetic: Number.isFinite(afterSynthetic - beforeSynthetic) ? afterSynthetic - beforeSynthetic : null,
    excluded_non_real: Number.isFinite(afterExcluded - beforeExcluded) ? afterExcluded - beforeExcluded : null,
  },
  checks,
  ts: new Date().toISOString(),
}));
if (!ok) process.exitCode = 1;
}

// Stop before POST on a controlled block, then let stdout and HTTP resources
// close normally instead of terminating the process in an active fetch.
try { await runProbe(); } catch (error) {
  if (error !== blockedProbe) throw error;
  process.exitCode = 1;
}
