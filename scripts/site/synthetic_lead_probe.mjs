/**
 * Authenticated, non-human inbound proof against a base URL.
 *
 * The probe fails before POST unless both server credentials and the Warmbly
 * no-dispatch safety gate are ready. It creates one durable row, retries the
 * same idempotency key, then emits only aggregate booleans and a receipt hash.
 * No human identity, raw receipt, secret or free-text lead field is printed.
 */
import { createHash } from "node:crypto";

const base = (process.argv[2] || "https://confenge.com.br").replace(/\/$/, "");
const probeSecret = process.argv[3] || process.env.LEAD_PROBE_SECRET || "";
const opsToken = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
const expectedSha = String(process.env.EXPECTED_SHA || "").trim();
const stamp = Date.now();
const idem = `synthetic-probe-${stamp}`;

function finishEarly(reason) {
  console.log(JSON.stringify({
    ok: false,
    state: "BLOCKED_BEFORE_POST",
    reason,
    base,
    ts: new Date().toISOString(),
  }));
  process.exit(1);
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
};
const ok = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  ok,
  state: ok ? "TRANSPORT_READY" : "TRANSPORT_PROOF_FAILED",
  base,
  live_sha: liveSha,
  receipt_sha256: leadId ? createHash("sha256").update(leadId).digest("hex") : null,
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
if (!ok) process.exit(1);
