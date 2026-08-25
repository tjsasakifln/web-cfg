/**
 * Daily scheduled RevOps orchestration (GitHub Actions primary scheduler).
 * Validates production health, isolated probe, deploy identity, commercial alerts.
 *
 *   node scripts/revops/scheduled_daily.mjs
 *   BASE_URL=… OPS_TOKEN=… node scripts/revops/scheduled_daily.mjs
 *
 * Exit 0 only when all critical checks pass. Writes proof under data/revops/schedule-runs/.
 */
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createOpsJsonClient, sanitizeTransportError } from "./ops_fetch.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");
const TOKEN = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
const out = {
  job: "daily",
  base: BASE,
  ts: new Date().toISOString(),
  checks: [],
  alerts: [],
  ops_requests: [],
  completed: false,
};

function check(name, ok, detail = "", { critical = true } = {}) {
  out.checks.push({ name, ok, detail, critical });
  console.log(ok ? "PASS" : "FAIL", name, detail);
  if (!ok && critical) out.alerts.push({ name, detail });
}

const j = createOpsJsonClient({
  base: BASE,
  token: TOKEN,
  onResult: (request) => out.ops_requests.push(request),
});

async function run() {

// 1 Critical URLs
const critical = ["/", "/conteudos/", "/ferramentas/", "/ops/", "/robots.txt", "/sitemap.xml"];
for (const p of critical) {
  try {
    const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
    const ok = res.status === 200 || res.status === 301 || res.status === 302;
    check(`url${p}`, ok, `http=${res.status}`);
  } catch (e) {
    check(`url${p}`, false, String(e.message || e));
  }
}

// 2 Deploy vs expected main
{
  try {
    const expected =
      process.env.EXPECTED_SHA ||
      process.env.GITHUB_SHA ||
      execSync("git rev-parse origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
    const bi = await fetch(`${BASE}/.well-known/build-info.json`).then((r) => r.json());
    check("build_info_present", Boolean(bi.commit), bi.commit || "missing");
    // On schedule from Actions, tip may be ahead of production briefly — soft when GITHUB_SHA set
    if (process.env.REQUIRE_DEPLOY_MATCH === "1") {
      check("deploy_matches_expected", bi.commit === expected, `live=${bi.commit} expected=${expected}`);
    } else {
      const match = bi.commit === expected || (expected && String(bi.commit).startsWith(String(expected).slice(0, 7)));
      check("deploy_identity", Boolean(bi.commit), `live=${bi.commit} expected=${expected} match=${match}`, {
        critical: false,
      });
      if (!match) {
        out.alerts.push({
          name: "deploy_divergence",
          detail: `production ${bi.commit} != expected ${expected}`,
        });
      }
    }
    out.build_info = bi;
  } catch (e) {
    check("build_info", false, String(e.message || e));
  }
}

// 3 Ops health
{
  const { status, body } = await j("/.netlify/functions/ops?action=health");
  check("ops_health", status === 200 && body.ok === true, `auth_configured=${body.auth_configured}`);
}

// 4 Isolated synthetic probe (must not inflate commercial; must be idempotent)
{
  let before = null;
  if (TOKEN) {
    const f = await j("/.netlify/functions/ops?action=funnel");
    before = f.body.funnel?.counts?.lead_persisted ?? null;
  }
  const stamp = Date.now();
  const idem = `scheduled-probe-${stamp}`;
  const payload = {
    nome: "SYNTHETIC-PROBE",
    email: `probe+daily-${stamp}@example.com`,
    estagio: "synthetic probe — discard",
    jornada: "operacao",
    consentimento: "true",
    origem: "/synthetic-probe-daily",
    utm_source: "synthetic",
    utm_medium: "scheduled",
    landing_page: "/",
    test_mode: true,
    record_kind: "synthetic",
    mensagem: "[QA] scheduled daily probe — do not contact",
    idempotency_key: idem,
  };
  const probeHdr = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Origin: "https://confenge.com.br",
    "User-Agent": `confenge-daily-probe/1.0 (${stamp})`,
    "X-Confenge-Probe": "1",
    "Idempotency-Key": idem,
    "X-Forwarded-For": `203.0.113.${1 + Math.floor(Math.random() * 200)}`,
  };
  const res = await fetch(`${BASE}/.netlify/functions/lead`, {
    method: "POST",
    headers: probeHdr,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  check("isolated_probe", res.status === 201 || res.status === 200, `id=${body.lead_id || ""}`);
  const stOk = (s) => /^(ok|pending|skipped|error)$/.test(String(s || ""));
  check("probe_notify_status", stOk(body.notify_status), body.notify_status);
  check("probe_email_status", stOk(body.email_status), body.email_status);
  const res2 = await fetch(`${BASE}/.netlify/functions/lead`, {
    method: "POST",
    headers: probeHdr,
    body: JSON.stringify(payload),
  });
  const body2 = await res2.json().catch(() => ({}));
  check(
    "probe_idempotent_same_id",
    (res2.status === 200 || res2.status === 201) && body2.lead_id === body.lead_id,
    `id1=${body.lead_id} id2=${body2.lead_id}`
  );
  if (TOKEN && before != null) {
    const f = await j("/.netlify/functions/ops?action=funnel");
    const after = f.body.funnel?.counts?.lead_persisted;
    check("probe_no_commercial_inflate", after === before, `before=${before} after=${after}`);
  }
}

// 5 System health + uncontacted real leads
if (TOKEN) {
  const sh = await j("/.netlify/functions/ops?action=system_health");
  check("system_health", sh.body.ok === true, JSON.stringify(sh.body.counts_by_kind || {}));
  out.system_health = {
    real: sh.body.real_leads,
    synthetic: sh.body.synthetic_leads,
    pipeline_real: sh.body.pipeline_real,
    revenue_real: sh.body.revenue_real,
    last_real_conversion: sh.body.last_real_conversion,
  };

  const leads = await j("/.netlify/functions/ops?action=leads&kind=real&pii=0");
  const breaches = (leads.body.leads || []).filter((l) => l.needs_contact);
  const leadsOk = leads.status === 200 && leads.body.ok === true;
  check("real_leads_sla", leadsOk && breaches.length === 0, `sla_breaches=${breaches.length}`);
  if (breaches.length) {
    const ages = breaches.map((lead) => Number(lead.sla_hours_open || 0));
    const ageBuckets = {
      h4_8: ages.filter((hours) => hours < 8).length,
      h8_24: ages.filter((hours) => hours >= 8 && hours < 24).length,
      h24_plus: ages.filter((hours) => hours >= 24).length,
    };
    out.lead_sla = {
      breaches: breaches.length,
      age_buckets: ageBuckets,
      max_age_hours: Math.max(...ages),
      commercial_only: true,
    };
    out.alerts.push({
      name: "real_leads_sla_breach",
      detail: `${breaches.length} real lead(s) need first contact`,
      age_buckets: ageBuckets,
    });
    const alert = await j("/.netlify/functions/ops?action=sla_alert", {
      method: "POST",
      body: "{}",
    });
    check(
      "real_leads_sla_alert_delivery",
      alert.status === 200 && alert.body.ok === true && alert.body.alerted === true,
      `http=${alert.status} routed=${Boolean(alert.body.alerted)}`
    );
    out.lead_sla.alert_delivery = {
      ok: alert.body.ok === true,
      http: alert.status,
      alerted: alert.body.alerted === true,
      owner_domain: alert.body.owner_domain || null,
    };
  }

  // Resend / storage signals via weekly report shape (no email send)
  const week = await j("/.netlify/functions/ops?action=weekly_report");
  check(
    "weekly_report_real_only",
    week.body.ok === true && week.body.commercial_only === true,
    `leads=${week.body.leads_total} excluded=${week.body.leads_excluded_non_real}`
  );

  // GSC auth endpoint
  const gsc = await j("/.netlify/functions/ops?action=gsc_insights");
  check("gsc_insights_auth", gsc.status === 200 && gsc.body.ok === true, `http=${gsc.status}`, {
    critical: false,
  });

  const inbound = await j("/.netlify/functions/ops?action=inbound_handoff");
  check(
    "inbound_handoff_counters",
    inbound.status === 200 && inbound.body.ok === true,
    JSON.stringify(inbound.body.counters || {}),
    { critical: false }
  );
  out.inbound_handoff = inbound.body.counters || null;
  const drain = await j("/.netlify/functions/ops?action=drain_inbound", {
    method: "POST",
    body: JSON.stringify({ limit: 20 }),
  });
  check(
    "inbound_handoff_drain",
    drain.status === 200 && drain.body.ok === true,
    `attempted=${drain.body.attempted || 0} delivered=${drain.body.delivered || 0}`,
    { critical: false }
  );
  const soProduce = await j("/.netlify/functions/ops?action=produce_search_observation", {
    method: "POST",
    body: JSON.stringify({}),
  });
  check(
    "search_observation_produce",
    soProduce.status === 200 && soProduce.body.ok === true,
    `status=${soProduce.body.status || soProduce.body.error || soProduce.status}`,
    { critical: false }
  );
  out.search_observation = { produce: soProduce.body || null };
  const soDrain = await j("/.netlify/functions/ops?action=drain_search_observation", {
    method: "POST",
    body: JSON.stringify({ limit: 20 }),
  });
  check(
    "search_observation_drain",
    soDrain.status === 200 && soDrain.body.ok === true,
    `attempted=${soDrain.body.attempted || 0} held=${soDrain.body.held || 0}`,
    { critical: false }
  );
  out.search_observation = { ...(out.search_observation || {}), drain: soDrain.body || null };
} else {
  check("ops_token", false, "OPS_TOKEN not set — real-lead SLA cannot be evaluated");
  out.alerts.push({
    name: "ops_token_missing",
    detail: "OPS_TOKEN not set — commercial funnel/system_health checks skipped",
  });
}

function parseJsonBlob(text) {
  const t = String(text || "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    return { raw: t.slice(0, 200) };
  }
}

// 6 GSC sync (best-effort; missing credentials is non-fatal with exact report)
{
  try {
    const result = execSync(
      "python3 scripts/revops/search_demand_observatory.py sync --days 28 --reprocess-days 3 --allow-missing-creds",
      { cwd: ROOT, encoding: "utf8", timeout: 120000, env: process.env }
    );
    const parsed = parseJsonBlob(result);
    out.gsc_sync = parsed;
    if (parsed.ok) check("gsc_sync", true, `rows=${parsed.rows || 0} last=${parsed.last_sync || ""}`);
    else if (parsed.error === "missing_credentials") {
      check("gsc_sync", true, "BLOCKED missing GSC_CREDENTIALS_JSON (expected external)", {
        critical: false,
      });
      out.alerts.push({
        name: "gsc_credentials_missing",
        detail: "Set GitHub secret GSC_CREDENTIALS_JSON (service account) + GSC_SITE_URL",
        required_env: parsed.required_env,
      });
    } else {
      check("gsc_sync", false, JSON.stringify(parsed).slice(0, 200), { critical: false });
    }
  } catch (e) {
    check("gsc_sync", false, String(e.message || e).slice(0, 200), { critical: false });
  }
}

// Persist proof
  out.completed = true;
}

function persistProof() {
const runDir = process.env.REVOPS_RUN_DIR
  ? resolve(process.env.REVOPS_RUN_DIR)
  : resolve(ROOT, "data/revops/schedule-runs");
mkdirSync(runDir, { recursive: true });
const day = out.ts.slice(0, 10);
const proofPath = resolve(runDir, `daily-${day}-${Date.now().toString(36)}.json`);
const failedCritical = out.checks.filter((c) => !c.ok && c.critical !== false).length;
out.ok = failedCritical === 0;
out.failed_critical = failedCritical;
writeFileSync(proofPath, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ ok: out.ok, failed_critical: failedCritical, proof: proofPath, alerts: out.alerts }, null, 2));
return out.ok;
}

try {
  await run();
} catch (error) {
  const detail = sanitizeTransportError(error);
  out.fatal_error = detail;
  check("orchestration_unhandled", false, detail);
} finally {
  const ok = persistProof();
  if (!ok) process.exitCode = 1;
}
