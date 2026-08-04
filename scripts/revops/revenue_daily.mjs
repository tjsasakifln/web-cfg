/**
 * Daily revenue ops: health + isolated synthetic probe + commercial real-only checks.
 * Usage:
 *   OPS_TOKEN=… node scripts/revops/revenue_daily.mjs
 *   OPS_TOKEN=… node scripts/revops/revenue_daily.mjs https://confenge.com.br
 *
 * Probe validates endpoint, validation, persistence, delivery signals, idempotency.
 * Must NOT inflate commercial funnel (record_kind=synthetic).
 */
const BASE = (process.argv[2] || process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");
const TOKEN = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
const headers = {
  Accept: "application/json",
  Authorization: TOKEN ? `Bearer ${TOKEN}` : "",
  "Content-Type": "application/json",
  Origin: "https://confenge.com.br",
};

async function j(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers...(opts.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const out = { base: BASE, ts: new Date().toISOString(), checks: [] };
function check(name, ok, detail) {
  out.checks.push({ name, ok, detail });
  console.log(ok ? "PASS" : "FAIL", name, detail || "");
}

// 1 health
{
  const { status, body } = await j("/.netlify/functions/ops?action=health");
  check("ops_health", status === 200 && body.ok, `auth=${body.auth_configured}`);
  check("ops_auth_configured", body.auth_configured === true, body.auth_configured);
}

// 2 isolated form probe
let commercialBefore = null;
if (TOKEN) {
  const { body } = await j("/.netlify/functions/ops?action=funnel");
  commercialBefore = body.funnel?.counts?.lead_persisted ?? null;
  out.commercial_before = commercialBefore;
}

const probeStamp = Date.now();
const idemKey = `probe-daily-${probeStamp}`;
const payload = {
  nome: "SYNTHETIC-PROBE",
  email: `probe+${probeStamp}@example.com`,
  estagio: "synthetic probe, discard",
  jornada: "operacao",
  consentimento: "true",
  origem: "/synthetic-probe-daily",
  utm_source: "synthetic",
  utm_medium: "daily",
  landing_page: "/",
  test_mode: true,
  record_kind: "synthetic",
  mensagem: "[QA] synthetic probe, do not contact",
  idempotency_key: idemKey,
};

const probeHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://confenge.com.br",
  "User-Agent": `confenge-daily-probe/1.0 (${probeStamp})`,
  "X-Confenge-Probe": "1",
  "Idempotency-Key": idemKey,
  "X-Forwarded-For": `203.0.113.${1 + Math.floor(Math.random() * 200)}`,
};

{
  const res = await fetch(`${BASE}/.netlify/functions/lead`, {
    method: "POST",
    headers: probeHeaders,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  check("form_probe_201", res.status === 201 || res.status === 200, `http=${res.status} id=${body.lead_id || ""}`);
  check("form_probe_lead_id", Boolean(body.lead_id), body.lead_id);
  check("form_probe_ok_flag", body.ok === true, body.ok);
  const blob = JSON.stringify(body);
  check(
    "form_probe_no_secret_leak",
    !/ntfy|formsubmit|confenge-prod-leads|RESEND_API_KEY|topic/i.test(blob),
    "public body clean"
  );
  out.lead_id = body.lead_id;

  // Delivery statuses are non-PII and required (ok|pending|skipped|error)
  const stOk = (s) => /^(ok|pending|skipped|error)$/.test(String(s || ""));
  check("form_probe_notify_status", stOk(body.notify_status), body.notify_status);
  check("form_probe_email_status", stOk(body.email_status), body.email_status);
  out.delivery = { notify: body.notify_status, email: body.email_status };

  // Idempotency: same key MUST return same lead_id
  const res2 = await fetch(`${BASE}/.netlify/functions/lead`, {
    method: "POST",
    headers: probeHeaders,
    body: JSON.stringify(payload),
  });
  const body2 = await res2.json().catch(() => ({}));
  check(
    "form_probe_idempotent",
    (res2.status === 200 || res2.status === 201) && body2.lead_id === body.lead_id,
    `http=${res2.status} id1=${body.lead_id} id2=${body2.lead_id}`
  );
  out.idempotent = {
    status: res2.status,
    same_id: body2.lead_id === body.lead_id,
    idempotent_flag: body2.idempotent === true,
  };

  if (body.lead_id && TOKEN) {
    const lead = await j(`/.netlify/functions/ops?action=lead&id=${encodeURIComponent(body.lead_id)}&pii=0`);
    const rec = lead.body.lead || {};
    check("probe_record_kind_non_real", rec.record_kind && rec.record_kind !== "real", rec.record_kind);
    check(
      "probe_persistence_readable",
      lead.body.ok === true && rec.lead_id === body.lead_id,
      `kind=${rec.record_kind}`
    );
    const del = rec.delivery || {};
    const notifySt = del.notify || body.notify_status;
    const emailSt = del.email || body.email_status;
    check("probe_ops_notify_status", stOk(notifySt), notifySt);
    check("probe_ops_email_status", stOk(emailSt), emailSt);
    check("ops_auth_with_token", lead.status === 200 && lead.body.ok === true, lead.status);
    // Never auto-stage commercial
    check(
      "probe_not_commercial_stage",
      !["contacted", "qualified", "meeting", "proposal", "won"].includes(rec.commercial_stage),
      rec.commercial_stage
    );

    const sh = await j("/.netlify/functions/ops?action=system_health");
    check("system_health_ok", sh.body.ok === true, JSON.stringify(sh.body.counts_by_kind || {}));
    out.system_health = {
      real: sh.body.real_leads,
      synthetic: sh.body.synthetic_leads,
      last_real_conversion: sh.body.last_real_conversion,
    };
  }
}

// 3 funnel real-only + commercial counters must not rise from probe
if (TOKEN) {
  const { body } = await j("/.netlify/functions/ops?action=funnel");
  check("funnel_ok", body.ok === true, JSON.stringify(body.funnel?.counts || {}));
  check("funnel_commercial_only", body.commercial_only === true, body.commercial_only);
  out.funnel = body.funnel;
  out.system_health_funnel = body.system_health;
  if (commercialBefore != null && body.funnel?.counts) {
    const after = body.funnel.counts.lead_persisted;
    check(
      "probe_did_not_inflate_commercial",
      after === commercialBefore,
      `before=${commercialBefore} after=${after}`
    );
  }
  const w = await j("/.netlify/functions/ops?action=weekly_report");
  check("weekly_report", w.body.ok === true, `leads=${w.body.leads_total}`);
  check("weekly_commercial_only", w.body.commercial_only === true, w.body.commercial_only);
  out.weekly = {
    leads_total: w.body.leads_total,
    new_7d: w.body.leads_new_7d,
    pipeline: w.body.funnel?.pipeline_value,
    excluded: w.body.leads_excluded_non_real,
  };
  const a = await j("/.netlify/functions/ops?action=analytics_summary");
  check("analytics_summary", a.body.ok === true, `events=${a.body.events_loaded}`);
  out.analytics_events = a.body.events_loaded;

  const gsc = await j("/.netlify/functions/ops?action=gsc_insights");
  check("gsc_insights_auth", gsc.status === 200 && gsc.body.ok === true, `http=${gsc.status}`);
  const pub = await fetch(`${BASE}/ops/data/gsc-insights.json`, { redirect: "manual" });
  check(
    "gsc_static_not_public",
    pub.status === 404 || pub.status === 403 || pub.status === 410 || pub.status === 301,
    `http=${pub.status}`
  );
}

const failed = out.checks.filter((c) => !c.ok).length;
console.log(JSON.stringify({ ok: failed === 0, failed, summary: out }, null, 2));
if (failed) process.exit(1);
