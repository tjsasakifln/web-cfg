/**
 * Daily revenue ops: health + synthetic form + optional weekly snapshot.
 * Usage:
 *   OPS_TOKEN=… node scripts/revops/revenue_daily.mjs
 *   OPS_TOKEN=… node scripts/revops/revenue_daily.mjs https://confenge.com.br
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
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
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
// 2 form probe via real lead endpoint
{
  const payload = {
    nome: "SYNTHETIC-PROBE",
    email: `probe+${Date.now()}@example.com`,
    estagio: "synthetic probe — discard",
    jornada: "operacao",
    consentimento: "true",
    origem: "/synthetic-probe-daily",
    utm_source: "synthetic",
    utm_medium: "daily",
    landing_page: "/",
  };
  const res = await fetch(`${BASE}/.netlify/functions/lead`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://confenge.com.br",
      "User-Agent": `confenge-daily-probe/1.0 (${Date.now()})`,
      "X-Forwarded-For": `203.0.113.${1 + Math.floor(Math.random() * 200)}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  check("form_probe_201", res.status === 201 || res.status === 200, `http=${res.status} id=${body.lead_id || ""}`);
  check("form_probe_lead_id", Boolean(body.lead_id), body.lead_id);
  out.lead_id = body.lead_id;
  if (body.lead_id && TOKEN) {
    const st = await j("/.netlify/functions/ops?action=stage", {
      method: "POST",
      body: JSON.stringify({ lead_id: body.lead_id, stage: "contacted", actor: "daily-probe", note: "auto" }),
    });
    check("stage_contacted", st.body.ok === true, st.body.lead?.commercial_stage || st.body.error);
  }
}
// 3 funnel
if (TOKEN) {
  const { body } = await j("/.netlify/functions/ops?action=funnel");
  check("funnel_ok", body.ok === true, JSON.stringify(body.funnel?.counts || {}));
  out.funnel = body.funnel;
  const w = await j("/.netlify/functions/ops?action=weekly_report");
  check("weekly_report", w.body.ok === true, `leads=${w.body.leads_total}`);
  out.weekly = { leads_total: w.body.leads_total, new_7d: w.body.leads_new_7d, pipeline: w.body.funnel?.pipeline_value };
  const a = await j("/.netlify/functions/ops?action=analytics_summary");
  check("analytics_summary", a.body.ok === true, `events=${a.body.events_loaded}`);
  out.analytics_events = a.body.events_loaded;
}

const failed = out.checks.filter((c) => !c.ok).length;
console.log(JSON.stringify({ ok: failed === 0, failed, summary: out }, null, 2));
if (failed) process.exit(1);
