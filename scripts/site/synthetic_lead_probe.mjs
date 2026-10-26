/**
 * Authenticated, non-human inbound proof against a base URL.
 *
 * The probe fails before POST unless both server credentials and the Warmbly
 * no-dispatch safety gate are ready. It creates one durable row, retries the
 * same idempotency key, then emits only aggregate booleans and a receipt hash.
 * No human identity, raw receipt, secret or free-text lead field is printed.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parse } from "parse5";
import {
  SPECIALIZED_QA_CONTEXT_KEYS,
  specializedQaContextSha256,
  specializedQaWireContextSha256,
  validateSpecializedQaJourney,
} from "./synthetic_contact_journey.mjs";
import {
  PRIORITY_ADITIVO_FORM_PATH,
  priorityAditivoContextSha256,
  validatePriorityAditivoJourney,
} from "./synthetic_priority_aditivo_journey.mjs";

const blockedProbe = Symbol("controlled_probe_block");
const require = createRequire(import.meta.url);
const { admittedNames } = require("../../netlify/functions/lib/event-contract.cjs");
const ANALYTICS_EVENT_NAMES = new Set(admittedNames());
const ANALYTICS_LOOKBACK_DAYS = 14;
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
const probeScenario = String(process.env.PROBE_SCENARIO || "").trim();
const priorityAditivoScenario = probeScenario === "priority-aditivo";
const stamp = Date.now();
// Ordinary probes remain random. The authorized QA-email probe instead uses a
// stable HMAC so a rerun cannot create another delivery.
const idem = verifyQaEmail
  ? `synthetic-probe-qa-${createHmac("sha256", probeSecret).update(`confenge:qa-email-probe:v1:${expectedSha}`).digest("hex")}`
  : `synthetic-probe-${randomUUID()}`;

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
if (probeScenario && !["priority-aditivo", "legacy-sst"].includes(probeScenario)) {
  finishEarly("probe_scenario_invalid");
}
if (priorityAditivoScenario && verifyQaEmail) finishEarly("priority_aditivo_email_forbidden");
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
  const keys = ["visitor", "cta_triggered", "form_started", "lead_persisted", "contacted", "qualified", "meeting", "proposal", "won", "lost"];
  const counts = funnel.data?.funnel?.counts;
  const values = {
    pipeline_value: funnel.data?.funnel?.pipeline_value,
    revenue: funnel.data?.funnel?.revenue,
    weekly_pipeline_real: weekly.data?.system_health?.pipeline_real,
    weekly_revenue_real: weekly.data?.system_health?.revenue_real,
  };
  const weeklyCounts = {
    weekly_leads_total: weekly.data?.leads_total,
    weekly_leads_new_7d: weekly.data?.leads_new_7d,
  };
  const errors = [];
  if (funnel.http !== 200 || funnel.data?.ok !== true || funnel.data?.commercial_only !== true) errors.push("funnel_unavailable");
  if (weekly.http !== 200 || weekly.data?.ok !== true || weekly.data?.commercial_only !== true) errors.push("weekly_report_unavailable");
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) errors.push("funnel_counts_missing_or_invalid");
  for (const key of keys) if (!Number.isInteger(counts?.[key]) || counts[key] < 0) errors.push(`funnel_count_invalid:${key}`);
  for (const [key, value] of Object.entries(weeklyCounts)) if (!Number.isInteger(value) || value < 0) errors.push(`weekly_count_invalid:${key}`);
  for (const [key, value] of Object.entries(values)) if (!Number.isFinite(value) || value < 0) errors.push(`commercial_metric_invalid:${key}`);
  return { ok: errors.length === 0, errors, snapshot: errors.length ? null : { funnel_counts: Object.fromEntries(keys.map((key) => [key, counts[key]])), ...weeklyCounts, ...values } };
}
function syntheticCounters(system, weekly) {
  const synthetic = system.data?.counts_by_kind?.synthetic;
  const excluded = weekly.data?.leads_excluded_non_real;
  const errors = [];
  if (system.http !== 200 || system.data?.ok !== true) errors.push("system_health_unavailable");
  if (weekly.http !== 200 || weekly.data?.ok !== true || weekly.data?.commercial_only !== true) errors.push("weekly_report_unavailable");
  if (!Number.isInteger(synthetic) || synthetic < 0) errors.push("synthetic_counter_invalid");
  if (!Number.isInteger(excluded) || excluded < 0) errors.push("excluded_counter_invalid");
  return { ok: errors.length === 0, errors, synthetic: errors.length ? null : synthetic, excluded: errors.length ? null : excluded };
}

function operationalSnapshot(system, inbound) {
  const kindKeys = ["real", "synthetic", "qa"];
  const handoffKeys = [
    "persisted_leads", "pending", "delivered", "retryable", "retries",
    "permanent_failures", "skipped", "blocked", "dead",
  ];
  const errors = [];
  if (system.http !== 200 || system.data?.ok !== true) errors.push("system_health_unavailable");
  if (inbound.http !== 200 || inbound.data?.ok !== true) errors.push("inbound_handoff_unavailable");
  const kinds = system.data?.counts_by_kind;
  const handoff = inbound.data?.counters;
  for (const key of kindKeys) {
    if (!Number.isInteger(kinds?.[key]) || kinds[key] < 0) errors.push(`record_kind_count_invalid:${key}`);
  }
  for (const key of handoffKeys) {
    if (!Number.isInteger(handoff?.[key]) || handoff[key] < 0) errors.push(`handoff_count_invalid:${key}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    snapshot: errors.length
      ? null
      : {
          leads_by_kind: Object.fromEntries(kindKeys.map((key) => [key, kinds[key]])),
          handoff: Object.fromEntries(handoffKeys.map((key) => [key, handoff[key]])),
        },
  };
}

function analyticsSnapshot(summary) {
  const errors = [];
  if (summary.http !== 200 || summary.data?.ok !== true) errors.push("analytics_summary_unavailable");
  const eventsLoaded = summary.data?.events_loaded;
  const aggregate = summary.data?.aggregate;
  const generatedAt = aggregate?.generated_at;
  const daily = aggregate?.daily;
  if (!Number.isInteger(eventsLoaded) || eventsLoaded < 0) errors.push("analytics_events_loaded_invalid");
  if (!aggregate || typeof aggregate !== "object" || Array.isArray(aggregate)) errors.push("analytics_aggregate_invalid");
  if (!Array.isArray(daily)) errors.push("analytics_daily_invalid");
  const generatedAtMs = Date.parse(generatedAt || "");
  if (!Number.isFinite(generatedAtMs)) errors.push("analytics_generated_at_invalid");
  const earliestDay = Number.isFinite(generatedAtMs)
    ? new Date(generatedAtMs - ANALYTICS_LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10)
    : null;
  const generatedDay = Number.isFinite(generatedAtMs)
    ? new Date(generatedAtMs).toISOString().slice(0, 10)
    : null;

  const counts = {};
  const days = [];
  let admittedTotal = 0;
  if (Array.isArray(daily)) {
    for (const row of daily) {
      const day = row?.day;
      const parsedDay = /^\d{4}-\d{2}-\d{2}$/.test(day || "")
        ? new Date(`${day}T00:00:00Z`)
        : null;
      const validDay = parsedDay && !Number.isNaN(parsedDay.valueOf()) &&
        parsedDay.toISOString().slice(0, 10) === day;
      if (!validDay) errors.push("analytics_day_invalid");
      if (validDay && (day < earliestDay || day > generatedDay)) {
        errors.push("analytics_day_outside_window");
      }
      const byEvent = row?.by_event;
      if (!byEvent || typeof byEvent !== "object" || Array.isArray(byEvent)) {
        errors.push("analytics_by_event_invalid");
        continue;
      }
      let rowTotal = 0;
      for (const [name, count] of Object.entries(byEvent)) {
        if (!ANALYTICS_EVENT_NAMES.has(name)) errors.push(`analytics_event_name_invalid:${name}`);
        if (!Number.isInteger(count) || count < 0) {
          errors.push(`analytics_event_count_invalid:${name}`);
          continue;
        }
        if (ANALYTICS_EVENT_NAMES.has(name)) counts[name] = (counts[name] || 0) + count;
        rowTotal += count;
      }
      if (!Number.isInteger(row?.events) || row.events < 0 || row.events !== rowTotal) {
        errors.push("analytics_daily_total_invalid");
      }
      admittedTotal += rowTotal;
      if (validDay) days.push(day);
    }
  }
  if (Number.isInteger(eventsLoaded) && admittedTotal > eventsLoaded) {
    errors.push("analytics_admitted_total_exceeds_loaded");
  }
  if (errors.length) return { ok: false, errors, snapshot: null };
  days.sort();
  const status = eventsLoaded === 0
    ? "NO_EVENTS_IN_WINDOW"
    : days.length === 0
      ? "NO_ADMITTED_EVENTS_IN_WINDOW"
      : "AGGREGATED_EVENTS_PRESENT";
  return {
    ok: true,
    errors: [],
    snapshot: {
      events_loaded: eventsLoaded,
      counts_by_event: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
      coverage: {
        lookback_days: ANALYTICS_LOOKBACK_DAYS,
        all_time: false,
        events_loaded_unit: "event_records_not_visitors",
        backend_loader_limits: {
          filesystem: "all_rows_within_window",
          legacy: "up_to_200_blobs_per_day",
        },
        generated_at: new Date(generatedAt).toISOString(),
        event_day_start: days[0] || null,
        event_day_end: days.at(-1) || null,
        status,
      },
    },
  };
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const build = await jsonRequest("/.well-known/build-info.json");
const liveSha = String(build.data?.commit || "");
if (build.http !== 200 || !/^[0-9a-f]{40}$/.test(liveSha)) finishEarly("live_build_identity_missing");
if (expectedSha && liveSha !== expectedSha) finishEarly("live_build_identity_mismatch");

const [beforeFunnel, beforeSystem, beforeWeekly, beforeInbound, beforeAnalytics] = await Promise.all([
  ops("funnel"),
  ops("system_health"),
  ops("weekly_report"),
  ops("inbound_handoff"),
  ops("analytics_summary"),
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
  beforeFunnel.http !== 200 || beforeFunnel.data?.ok !== true || beforeFunnel.data?.commercial_only !== true ||
  beforeSystem.http !== 200 || beforeSystem.data?.ok !== true ||
  beforeWeekly.http !== 200 || beforeWeekly.data?.ok !== true || beforeWeekly.data?.commercial_only !== true
) finishEarly("commercial_baseline_unavailable");
const beforeCommercial = commercialSnapshot(beforeFunnel, beforeWeekly);
const beforeCounters = syntheticCounters(beforeSystem, beforeWeekly);
if (!beforeCommercial.ok || !beforeCounters.ok) finishEarly("commercial_baseline_metrics_invalid");
const beforeOperational = operationalSnapshot(beforeSystem, beforeInbound);
if (!beforeOperational.ok) finishEarly("operational_baseline_metrics_invalid");
const analytics = analyticsSnapshot(beforeAnalytics);
if (!analytics.ok) finishEarly("analytics_summary_invalid");

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

// The e-mail-enabled production proof must be tied to the actual browser
// journey. The file contains only allowlisted technical fields and is accepted
// only when its fixed CTA, route, DOM state, zero-POST observation and release
// SHA all match the literal fixture in synthetic_contact_journey.mjs.
const browserFixturePath = String(process.env.PROBE_BROWSER_CONTEXT_FILE || "").trim();
let browserJourney = null;
let browserContextSha256 = null;
let technicalContextSha256 = null;
let wireContextSha256 = null;
if (verifyQaEmail && !browserFixturePath) finishEarly("qa_browser_fixture_required");
if (priorityAditivoScenario && !browserFixturePath) finishEarly("priority_browser_fixture_required");
if (priorityAditivoScenario && pagePath !== PRIORITY_ADITIVO_FORM_PATH) {
  finishEarly("priority_probe_page_path_mismatch");
}
if (browserFixturePath) {
  let parsed;
  let raw = "";
  try {
    raw = readFileSync(browserFixturePath, "utf8");
  } catch {
    finishEarly("browser_fixture_unreadable");
  }
  if (Buffer.byteLength(raw, "utf8") > 32 * 1024) finishEarly("browser_fixture_too_large");
  try { parsed = JSON.parse(raw); } catch { finishEarly("browser_fixture_unreadable"); }
  const validated = priorityAditivoScenario
    ? validatePriorityAditivoJourney(parsed, expectedSha)
    : validateSpecializedQaJourney(parsed, expectedSha);
  if (!validated.ok) finishEarly(validated.reason);
  browserJourney = parsed;
  browserContextSha256 = validated.context_sha256;
  technicalContextSha256 = priorityAditivoScenario ? null : validated.context_sha256;
  wireContextSha256 = priorityAditivoScenario
    ? null
    : specializedQaWireContextSha256(validated.context);
  if (!servedForm) finishEarly("browser_fixture_requires_served_form");
  if (["asset_id", "cta_id", "route_family"].some((key) => servedForm[key] !== validated.context[key])) {
    finishEarly("browser_fixture_capture_identity_mismatch");
  }
  for (const [key, value] of Object.entries(pageContext)) {
    if (value && validated.context[key] !== value && !["origem", "landing_page", "jornada", "estagio"].includes(key)) {
      finishEarly("browser_fixture_environment_mismatch");
    }
  }
  Object.assign(pageContext, validated.context);
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
const afterCommercial = commercialSnapshot(afterFunnel, afterWeekly);
const afterCounters = syntheticCounters(afterSystem, afterWeekly);
const afterOperational = operationalSnapshot(afterSystem, receiptOps);
const beforeSynthetic = beforeCounters.synthetic;
const afterSynthetic = afterCounters.synthetic;
const beforeExcluded = beforeCounters.excluded;
const afterExcluded = afterCounters.excluded;
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
  persisted_exactly_once: afterCounters.ok && afterSynthetic - beforeSynthetic === 1,
  excluded_non_real_exactly_once: afterCounters.ok && afterExcluded - beforeExcluded === 1,
  commercial_snapshot_after_valid: afterCommercial.ok,
  synthetic_counters_after_valid: afterCounters.ok,
  operational_snapshot_after_valid: afterOperational.ok,
  commercial_metrics_unchanged: beforeCommercial.ok && afterCommercial.ok && sameJson(beforeCommercial.snapshot, afterCommercial.snapshot),
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
  ...(browserJourney && priorityAditivoScenario
    ? {
        // The private ops API computes this digest from the durable row. A
        // local re-hash of the outbound payload would not prove persistence.
        priority_aditivo_context_persisted:
          /^[0-9a-f]{64}$/.test(String(receipt?.priority_aditivo_context_sha256 || "")) &&
          receipt?.priority_aditivo_context_sha256 === browserContextSha256,
        priority_aditivo_context_hash_valid:
          browserContextSha256 === priorityAditivoContextSha256(pageContext),
        priority_aditivo_email_disabled:
          !verifyQaEmail && receipt?.delivery?.qa_email_status !== "ok",
      }
    : browserJourney
      ? {
        specialized_context_persisted: SPECIALIZED_QA_CONTEXT_KEYS.every(
          (key) => (receipt?.technical_context?.[key] ?? null) === (pageContext[key] ?? null),
        ),
        specialized_persisted_and_handoff_hashes_match_scopes:
          /^[0-9a-f]{64}$/.test(String(technicalContextSha256 || "")) &&
          /^[0-9a-f]{64}$/.test(String(wireContextSha256 || "")) &&
          receipt?.technical_context_sha256 === technicalContextSha256 &&
          receipt?.handoff?.technical_context_sha256 === wireContextSha256,
        }
      : {}),
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
  scenario: probeScenario || (verifyQaEmail ? "legacy-sst" : "standard"),
  page_context: Object.keys(pageContext).length ? pageContext : null,
  page_path: pagePath || null,
  served_form: servedForm,
  persisted_context: receipt?.technical_context || (receipt ? { asset_id: receipt.asset_id || null, route_family: receipt.route_family || null, cta_id: receipt.cta_id || null } : null),
  technical_context_sha256: technicalContextSha256,
  browser_context_sha256: browserContextSha256,
  handoff_context_sha256: wireContextSha256,
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
  aggregates: {
    before: beforeOperational.snapshot,
    after: afterOperational.snapshot,
  },
  analytics_summary: analytics.snapshot,
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
