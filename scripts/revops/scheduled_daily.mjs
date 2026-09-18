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
import { evaluateConsumerPayload } from "./verify_gsc_freshness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");
const TOKEN = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
// The lead endpoint skips Turnstile only for a probe that proves itself with
// the 32+ character server-side LEAD_PROBE_SECRET (netlify/functions/lead.cjs).
// An unauthenticated synthetic POST has been rejected by production Turnstile
// since 2026-08-24, so without the secret the leg is an external blocker, not
// a request we fire knowing it fails.
const LEAD_PROBE_SECRET = String(process.env.LEAD_PROBE_SECRET || "");
const LEAD_PROBE_SECRET_MIN_LENGTH = 32;
const out = {
  job: "daily",
  base: BASE,
  ts: new Date().toISOString(),
  checks: [],
  alerts: [],
  blocked_external: [],
  ops_requests: [],
  completed: false,
};

function check(name, ok, detail = "", { critical = true } = {}) {
  out.checks.push({ name, ok, detail, critical });
  console.log(ok ? "PASS" : "FAIL", name, detail);
  if (!ok && critical) out.alerts.push({ name, detail });
}

// A named external dependency the repository cannot satisfy by itself. It is
// recorded as a non-critical check that is NOT ok (a blocker is never converted
// to PASS), plus an alert and a blocked_external entry, so the report never
// hides it; it does not fail the schedule because no code change can clear it.
function blockedExternal(name, dependency, detail) {
  out.checks.push({ name, ok: false, detail: `BLOCKED_EXTERNAL dependency=${dependency} ${detail}`, critical: false, blocked_external: true, dependency });
  out.blocked_external.push({ name, dependency, detail });
  out.alerts.push({ name: `${name}_blocked_external`, dependency, detail });
  console.log("BLOCKED_EXTERNAL", name, `dependency=${dependency}`, detail);
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
if (LEAD_PROBE_SECRET.length < LEAD_PROBE_SECRET_MIN_LENGTH) {
  blockedExternal(
    "isolated_probe",
    "LEAD_PROBE_SECRET",
    `GitHub Actions secret absent or shorter than ${LEAD_PROBE_SECRET_MIN_LENGTH} chars; ` +
      "production Turnstile rejects an unauthenticated synthetic lead (since 2026-08-24), " +
      "so the capture/idempotency leg is not exercised (docs/ops/EXTERNAL-ACTIONS.md §1)"
  );
} else {
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
    "X-Confenge-Probe": LEAD_PROBE_SECRET,
    "Idempotency-Key": idem,
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
  check("uncontacted_reals_listed", leads.body.ok === true, `sla_breaches=${breaches.length}`, {
    critical: false,
  });
  if (breaches.length) {
    out.alerts.push({
      name: "real_leads_sla_breach",
      detail: `${breaches.length} real lead(s) need first contact`,
      lead_ids: breaches.slice(0, 10).map((l) => l.lead_id),
    });
  }

  // Resend / storage signals via weekly report shape (no email send)
  const week = await j("/.netlify/functions/ops?action=weekly_report");
  check(
    "weekly_report_real_only",
    week.body.ok === true && week.body.commercial_only === true,
    `leads=${week.body.leads_total} excluded=${week.body.leads_excluded_non_real}`
  );

  // GSC durable consumer (read-only). The producer is the gsc-sync job of the
  // same workflow; this leg only reads the authenticated consumer and records
  // the contract polarity (CURRENT/STALE/UNKNOWN) as sanitized metadata.
  const gsc = await j("/.netlify/functions/ops?action=gsc_insights");
  check("gsc_insights_auth", gsc.status === 200 && gsc.body.ok === true, `http=${gsc.status}`, {
    critical: false,
  });
  const gscConsumer = evaluateConsumerPayload(gsc.status === 200 ? gsc.body : null);
  check(
    "gsc_durable_consumer",
    gscConsumer.status === "CURRENT",
    `status=${gscConsumer.status} as_of=${gscConsumer.as_of || ""} reason_codes=${(gscConsumer.reason_codes || []).join(",")}`,
    { critical: false }
  );
  out.gsc_consumer = {
    status: gscConsumer.status,
    as_of: gscConsumer.as_of || null,
    delivery_source: gscConsumer.delivery_source || null,
    reason_codes: gscConsumer.reason_codes || [],
  };

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
  check("ops_token", true, "OPS_TOKEN not set — commercial checks skipped (set OPS_TOKEN for full daily)", {
    critical: false,
  });
  out.alerts.push({
    name: "ops_token_missing",
    detail: "OPS_TOKEN not set — commercial funnel/system_health checks skipped",
  });
}

// The GSC producer sync is NOT run here. The gsc-sync job of
// .github/workflows/revops-scheduled.yml owns it: it restores the durable
// history first, runs under the gsc-private-snapshot-producer concurrency
// group and publishes through publish_gsc_insights.mjs. Repeating the sync in
// this job ran a second producer without the restored history, which failed
// on every run (revops-scheduled run 35240801751) and added nothing.

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
// `ok` means "no critical check failed"; it never means "every leg was
// exercised". A named external blocker leaves the coverage partial, and the
// capture leg (isolated probe + idempotency) is reported by its own state so
// a report with the probe never fired is distinguishable from a proven one.
out.coverage = out.blocked_external.length === 0 ? "full" : "partial";
out.capture_leg = out.blocked_external.some((b) => b.dependency === "LEAD_PROBE_SECRET")
  ? "BLOCKED_EXTERNAL"
  : "EXERCISED";
writeFileSync(proofPath, JSON.stringify(out, null, 2) + "\n");
for (const blocker of out.blocked_external) {
  console.log(
    `::warning title=daily coverage partial::${blocker.name} BLOCKED_EXTERNAL dependency=${blocker.dependency} — ${blocker.detail}`
  );
}
console.log(
  JSON.stringify(
    { ok: out.ok, coverage: out.coverage, capture_leg: out.capture_leg, failed_critical: failedCritical, proof: proofPath, alerts: out.alerts },
    null,
    2
  )
);
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
