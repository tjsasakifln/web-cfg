/**
 * Weekly real-only report fetch + optional Resend email.
 *   OPS_TOKEN=… node scripts/revops/scheduled_weekly.mjs
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");
const TOKEN = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
const SEND = process.env.WEEKLY_SEND_EMAIL !== "0";

const out = { job: "weekly", base: BASE, ts: new Date().toISOString() };

if (!TOKEN) {
  console.error(JSON.stringify({ ok: false, error: "OPS_TOKEN_required" }));
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

const reportRes = await fetch(`${BASE}/.netlify/functions/ops?action=weekly_report`, { headers });
const report = await reportRes.json().catch(() => ({}));
out.report = {
  ok: report.ok,
  commercial_only: report.commercial_only,
  leads_total: report.leads_total,
  leads_new_7d: report.leads_new_7d,
  leads_excluded_non_real: report.leads_excluded_non_real,
  pipeline: report.funnel?.pipeline_value,
  revenue: report.funnel?.revenue,
  system_health: report.system_health,
  sla_breaches: report.sla_breaches,
};

if (!report.ok || report.commercial_only !== true) {
  out.ok = false;
  out.error = "weekly_report_not_real_only";
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

if (SEND) {
  const emailRes = await fetch(`${BASE}/.netlify/functions/ops?action=weekly_email`, {
    method: "POST",
    headers,
    body: "{}",
  });
  const emailBody = await emailRes.json().catch(() => ({}));
  out.email = { http: emailRes.status, ...emailBody };
  // Resend may be unconfigured — surface but don't hard-fail the report fetch
  if (emailRes.status === 503 && emailBody.error === "resend_not_configured") {
    out.email_note = "RESEND_API_KEY or OPS_REPORT_EMAIL not configured — report generated, not emailed";
  } else if (!emailBody.ok && emailRes.status !== 503) {
    out.ok = false;
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }
}

out.ok = true;
const runDir = resolve(ROOT, "data/revops/schedule-runs");
mkdirSync(runDir, { recursive: true });
writeFileSync(
  resolve(runDir, `weekly-${out.ts.slice(0, 10)}.json`),
  JSON.stringify(out, null, 2) + "\n"
);
console.log(JSON.stringify(out, null, 2));
