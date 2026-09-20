/**
 * Contraprovas de A06-RECEBIMENTO-04 e -07 (campanha BOFU-FECHAMENTO-20260919).
 *
 * Executa scripts/revops/scheduled_daily.mjs contra um servidor falso que:
 *   (a) responde ao drain_inbound com {ok:true, email_reconcile_required:1}
 *       → o relatório precisa ter ok=false e o alerta email_reconcile_required;
 *   (b) responde 201 nas DUAS POSTs da sonda com o mesmo lead_id
 *       → probe_idempotent_same_id precisa FALHAR (a réplica tem de ser 200 +
 *       idempotent:true, contrato da sonda canônica synthetic_lead_probe.mjs);
 *   (c) lista um lead real com delivery.email=error recebido há 2 h
 *       → alerta real_leads_email_stale.
 * Num segundo cenário tudo saudável (200 idempotent, reconcile 0, e-mail ok) o
 * relatório precisa ser ok=true, para que o check novo não reprove o dia bom.
 *
 * Também documenta o limite do drain: classifyEmailRetry devolve
 * reconcile_required/window_expired para um registro real recebido há mais de
 * 24 h, e retry para um recebido há 2 h.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const PROBE_SECRET_FIXTURE = "unit-test-lead-probe-secret-0123456789abcdef";
let failed = 0;
function pass(name, detail = "") {
  console.log("PASS", name, detail);
}
function fail(name, detail) {
  console.error("FAIL", name, detail);
  failed += 1;
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const counts = {
  visitor: 0, cta_triggered: 0, form_started: 0, lead_persisted: 0, contacted: 0,
  qualified: 0, meeting: 0, proposal: 0, won: 0, lost: 0,
};

/**
 * @param {object} scenario
 * @param {number} scenario.reconcileRequired
 * @param {boolean} scenario.replayIdempotent  second POST answers 200 + idempotent:true
 * @param {Array<object>} scenario.realLeads   payload of leads&kind=real&pii=0
 */
function startServer(scenario) {
  let posts = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/.well-known/build-info.json") {
      send(res, 200, { commit: "f".repeat(40) });
      return;
    }
    if (url.pathname === "/.netlify/functions/lead" && req.method === "POST") {
      posts += 1;
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        if (posts === 1 || !scenario.replayIdempotent) {
          send(res, 201, { ok: true, lead_id: "lead-fixture-0001", notify_status: "skipped", email_status: "skipped" });
        } else {
          send(res, 200, { ok: true, idempotent: true, lead_id: "lead-fixture-0001", notify_status: "skipped", email_status: "skipped" });
        }
      });
      return;
    }
    if (url.pathname === "/.netlify/functions/ops") {
      const action = url.searchParams.get("action");
      switch (action) {
        case "health":
          send(res, 200, { ok: true, auth_configured: true });
          return;
        case "funnel":
          send(res, 200, { ok: true, commercial_only: true, funnel: { counts, pipeline_value: 0, revenue: 0 } });
          return;
        case "system_health":
          send(res, 200, { ok: true, counts_by_kind: { real: scenario.realLeads.length, synthetic: 1 } });
          return;
        case "leads":
          send(res, 200, { ok: true, leads: scenario.realLeads, count: scenario.realLeads.length });
          return;
        case "weekly_report":
          send(res, 200, { ok: true, commercial_only: true, leads_total: 0, leads_excluded_non_real: 1 });
          return;
        case "gsc_insights":
          send(res, 200, { ok: true, status: "UNKNOWN" });
          return;
        case "inbound_handoff":
          send(res, 200, { ok: true, counters: { persisted_leads: 1, delivered: 1 } });
          return;
        case "drain_inbound":
          send(res, 200, {
            ok: true,
            attempted: 0,
            delivered: 0,
            email_attempted: 0,
            email_delivered: 0,
            email_retryable: 0,
            email_reconcile_required: scenario.reconcileRequired,
            email_retry: {
              email_reconcile_required: scenario.reconcileRequired,
              reconcile_reasons: scenario.reconcileRequired ? { window_expired: scenario.reconcileRequired } : {},
            },
          });
          return;
        case "produce_search_observation":
          send(res, 200, { ok: true, status: "noop" });
          return;
        case "drain_search_observation":
          send(res, 200, { ok: true, attempted: 0, held: 0 });
          return;
        default:
          send(res, 404, { ok: false, error: "unknown_action" });
          return;
      }
    }
    // critical public URLs
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer({ server, port: server.address().port }));
  });
}

async function runDaily(scenario) {
  const { server, port } = await startServer(scenario);
  const proofDir = mkdtempSync(join(tmpdir(), "confenge-daily-checks-"));
  // spawn (not execFileSync): the fake server lives in this process and must
  // keep answering while the daily job runs.
  const { code, stdout } = await new Promise((resolveRun) => {
    const child = spawn(process.execPath, [resolve(ROOT, "scripts/revops/scheduled_daily.mjs")], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        BASE_URL: `http://127.0.0.1:${port}`,
        EXPECTED_SHA: "f".repeat(40),
        OPS_TOKEN: "unit-test-token",
        LEAD_PROBE_SECRET: PROBE_SECRET_FIXTURE,
        OPS_FETCH_MAX_ATTEMPTS: "1",
        OPS_FETCH_BACKOFF_MS: "0",
        OPS_FETCH_TIMEOUT_MS: "5000",
        REVOPS_RUN_DIR: proofDir,
      },
    });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", () => {});
    child.on("close", (exitCode) => resolveRun({ code: exitCode, stdout: out }));
  });
  server.closeAllConnections?.();
  server.close();
  const exitOk = code === 0;
  const reports = readdirSync(proofDir).filter((name) => name.endsWith(".json"));
  const report = reports.length === 1 ? JSON.parse(readFileSync(resolve(proofDir, reports[0]), "utf8")) : null;
  return { exitOk, stdout, report };
}

const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

// Cenário 1: drain conta 1 reconcile_required, réplica 201/201, lead real com e-mail em erro há 2 h.
{
  const { exitOk, report } = await runDaily({
    reconcileRequired: 1,
    replayIdempotent: false,
    realLeads: [{ lead_id: "lead-fixture-real-0001", received_at: twoHoursAgo, needs_contact: false, delivery: { notify: "skipped", email: "error" } }],
  });
  const checks = Object.fromEntries((report?.checks || []).map((c) => [c.name, c]));
  const alertNames = (report?.alerts || []).map((a) => a.name);
  if (!report || report.completed !== true) fail("daily_completes_with_fake_ops", report);
  else pass("daily_completes_with_fake_ops");

  // A06-04 (a): email_reconcile_required=1 → check crítico reprovado, ok=false, alerta nomeado.
  const reconcileCheck = checks.email_reconcile_required;
  if (!reconcileCheck || reconcileCheck.ok !== false || reconcileCheck.critical !== true) {
    fail("email_reconcile_required_check_present_critical_and_failed", reconcileCheck);
  } else pass("email_reconcile_required_check_present_critical_and_failed", reconcileCheck.detail);
  if (!alertNames.includes("email_reconcile_required")) fail("email_reconcile_required_alert", alertNames);
  else pass("email_reconcile_required_alert");
  if (report.ok !== false || exitOk) fail("daily_ok_false_with_reconcile_required", { ok: report.ok, exitOk });
  else pass("daily_ok_false_with_reconcile_required");

  // A06-04 (a): lead real com delivery.email=error há > 1 h → alerta.
  if (!checks.real_leads_email_delivered || checks.real_leads_email_delivered.ok !== false) {
    fail("real_leads_email_delivered_check_failed_for_stale_error", checks.real_leads_email_delivered);
  } else pass("real_leads_email_delivered_check_failed_for_stale_error", checks.real_leads_email_delivered.detail);
  const stale = (report.alerts || []).find((a) => a.name === "real_leads_email_stale");
  if (!stale || !Array.isArray(stale.lead_ids) || stale.lead_ids[0] !== "lead-fixture-real-0001") {
    fail("real_leads_email_stale_alert_lists_id", stale);
  } else pass("real_leads_email_stale_alert_lists_id");

  // A06-07: réplica 201/201 com o mesmo lead_id NÃO é idempotência provada.
  if (!checks.probe_idempotent_same_id || checks.probe_idempotent_same_id.ok !== false) {
    fail("probe_replay_201_must_fail", checks.probe_idempotent_same_id);
  } else pass("probe_replay_201_must_fail", checks.probe_idempotent_same_id.detail);

  // Chave de idempotência da sonda não derivável de Date.now().
  const src = readFileSync(resolve(ROOT, "scripts/revops/scheduled_daily.mjs"), "utf8");
  if (/scheduled-probe-\$\{stamp\}/.test(src) || !/randomUUID\(\)/.test(src)) fail("probe_idempotency_key_not_derivable");
  else pass("probe_idempotency_key_not_derivable");

  // Nada de PII no relatório: só ids.
  const text = JSON.stringify(report);
  if (/@|telefone|"nome"/.test(text.replace(/probe\+daily-\d+@example\.com/g, ""))) fail("daily_report_ids_only");
  else pass("daily_report_ids_only");
}

// Cenário 2: dia saudável → ok=true (o check novo não reprova por si só).
{
  const { exitOk, report } = await runDaily({
    reconcileRequired: 0,
    replayIdempotent: true,
    realLeads: [{ lead_id: "lead-fixture-real-0002", received_at: twoHoursAgo, needs_contact: false, delivery: { notify: "ok", email: "ok" } }],
  });
  const checks = Object.fromEntries((report?.checks || []).map((c) => [c.name, c]));
  const failedCritical = (report?.checks || []).filter((c) => !c.ok && c.critical !== false).map((c) => c.name);
  if (!report || report.ok !== true || !exitOk) fail("daily_ok_true_when_healthy", { ok: report?.ok, exitOk, failedCritical });
  else pass("daily_ok_true_when_healthy");
  if (checks.probe_idempotent_same_id?.ok !== true) fail("probe_replay_200_idempotent_passes", checks.probe_idempotent_same_id);
  else pass("probe_replay_200_idempotent_passes");
  if (checks.email_reconcile_required?.ok !== true) fail("email_reconcile_zero_passes", checks.email_reconcile_required);
  else pass("email_reconcile_zero_passes");
  if (checks.real_leads_email_delivered?.ok !== true) fail("real_leads_email_ok_passes", checks.real_leads_email_delivered);
  else pass("real_leads_email_ok_passes");
}

// Limite documentado do drain (lead-delivery.cjs): fora da janela de 24 h da
// idempotência do Resend o registro só é contado (reconcile_required), nunca
// reenviado; dentro dela (2 h) é retry. Um agendador mais frequente que o
// diário (P-10) é o que garante que o retry caiba na janela mesmo com drift.
{
  const { classifyEmailRetry, reconcileEmailDeliveries, EMAIL_IDEMPOTENCY_WINDOW_MS } = require(
    resolve(ROOT, "netlify/functions/lib/lead-delivery.cjs"),
  );
  const now = new Date("2026-09-19T12:00:00.000Z");
  const base = {
    lead_id: "lead-fixture-real-0003",
    record_kind: "real",
    nome: "Fixture",
    email: "fixture@construtora.com.br",
    consentimento: true,
    delivery: { notify: { status: "skipped" }, email: { status: "error", reason: "timeout", attempts: 1 } },
  };
  const expired = { ...base, received_at: new Date(now.getTime() - EMAIL_IDEMPOTENCY_WINDOW_MS - 60 * 1000).toISOString() };
  const fresh = { ...base, lead_id: "lead-fixture-real-0004", received_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() };
  const clsExpired = classifyEmailRetry(expired, now);
  const clsFresh = classifyEmailRetry(fresh, now);
  if (clsExpired.class !== "reconcile_required" || clsExpired.reason !== "window_expired") fail("drain_window_expired_is_reconcile_required", clsExpired);
  else pass("drain_window_expired_is_reconcile_required", JSON.stringify(clsExpired));
  if (clsFresh.class !== "retry") fail("drain_2h_is_retry", clsFresh);
  else pass("drain_2h_is_retry", JSON.stringify(clsFresh));
  let updates = 0;
  const store = {
    list: async () => [expired],
    update: async () => { updates += 1; return expired; },
  };
  const summary = await reconcileEmailDeliveries(store, { now, limit: 5, env: { RESEND_API_KEY: "re_fixture" } });
  if (summary.attempted !== 0 || summary.email_reconcile_required !== 1 || updates !== 0) {
    fail("drain_expired_counted_not_resent", summary);
  } else pass("drain_expired_counted_not_resent", JSON.stringify({ attempted: summary.attempted, email_reconcile_required: summary.email_reconcile_required }));
}

if (failed) {
  console.error(`\n${failed} scheduled_daily check(s) failed`);
  process.exit(1);
}
console.log("\nALL scheduled_daily checks passed");
