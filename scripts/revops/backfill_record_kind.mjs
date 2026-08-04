/**
 * Audit + backfill record_kind for existing leads (preview by default).
 *
 * Usage:
 *   OPS_TOKEN=… node scripts/revops/backfill_record_kind.mjs              # dry-run preview
 *   OPS_TOKEN=… node scripts/revops/backfill_record_kind.mjs --apply       # write
 *   OPS_TOKEN=… node scripts/revops/backfill_record_kind.mjs --rollback SNAPSHOT_ID
 *   node scripts/revops/backfill_record_kind.mjs --local-fixture           # unit path via MemoryStore
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const BASE = (process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");
const TOKEN = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const localFixture = args.includes("--local-fixture");
const rollbackIdx = args.indexOf("--rollback");
const rollbackId = rollbackIdx >= 0 ? args[rollbackIdx + 1] : null;

if (localFixture) {
  const { buildLeadRecord, MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
  const stages = require(path.join(root, "netlify/functions/lib/lead-stages.cjs"));
  const { classifyForBackfill, countByKind } = require(path.join(root, "netlify/functions/lib/record-kind.cjs"));

  const mem = new MemoryStore();
  const probe = buildLeadRecord({
    lead_id: "probe1",
    lead: {
      nome: "SYNTHETIC-PROBE",
      email: "probe@example.com",
      estagio: "synthetic probe, discard",
      jornada: "operacao",
      origem: "/synthetic-probe-daily",
      utm_source: "synthetic",
      landing_page: "/",
      consentimento: "true",
      telefone: null,
      empresa: null,
      mensagem: "[QA] probe",
      idempotency_key: "idk:probe1",
    },
    received_at: new Date().toISOString(),
    ip_hash: "h",
    fingerprint: "f",
    headers: { "user-agent": "confenge-daily-probe/1.0", "x-confenge-probe": "1" },
  });
  // Simulate pre-migration row missing kind but with multi-signal body
  const legacy = {
    ...probe,
    lead_id: "legacy-probe",
    record_kind: undefined,
    record_kind_signals: undefined,
    nome: "SYNTHETIC-PROBE",
    email: "probe+old@example.com",
    utm_source: "synthetic",
    origem: "/synthetic-probe-daily",
    stage_history: [{ to: "contacted", actor: "daily-probe" }],
  };
  delete legacy.record_kind;
  const real = buildLeadRecord({
    lead_id: "real1",
    lead: {
      nome: "Construtora Alfa",
      email: "compras@construtora-alfa.com.br",
      telefone: "48999990000",
      estagio: "contrato",
      jornada: "contrato",
      origem: "site",
      utm_source: "google",
      landing_page: "/conteudos/",
      consentimento: "true",
      empresa: "Alfa",
      mensagem: null,
      idempotency_key: "idk:real1",
    },
    received_at: new Date().toISOString(),
    ip_hash: "h2",
    fingerprint: "f2",
  });
  await mem.put(probe);
  await mem.put(legacy);
  await mem.put(real);

  const all = await mem.list();
  const candidates = [];
  for (const l of all) {
    // force re-classify legacy as if kind missing
    const row = l.lead_id === "legacy-probe" ? { ...l, record_kind: "real" } : l;
    const clf = classifyForBackfill(row);
    if (clf.action === "mark" || (l.lead_id === "legacy-probe" && clf.action === "keep" && clf.signals.length >= 2)) {
      // for legacy without stored kind, re-run detection
    }
    if (l.lead_id === "legacy-probe") {
      const { detectNonRealSignals } = require(path.join(root, "netlify/functions/lib/record-kind.cjs"));
      const det = detectNonRealSignals(legacy);
      if (det.kind) {
        candidates.push({ lead_id: l.lead_id, to: det.kind, signals: det.signals });
        await mem.update(l.lead_id, {
          record_kind: det.kind,
          record_kind_signals: det.signals,
          next_action: "exclude_from_commercial",
        });
      }
    }
  }

  const after = await mem.list();
  const funnel = stages.funnelRates(after);
  const health = stages.systemHealth(after);
  const out = {
    ok: true,
    mode: "local-fixture",
    counts_by_kind: countByKind(after),
    funnel_real_n: funnel.n,
    funnel_commercial_only: funnel.commercial_only,
    system_health: health,
    probe_kind: (await mem.get("probe1")).record_kind,
    real_kind: (await mem.get("real1")).record_kind,
    legacy_kind: (await mem.get("legacy-probe")).record_kind,
  };
  // Assertions
  if (out.probe_kind !== "synthetic") {
    console.error("FAIL probe_not_synthetic", out);
    process.exit(1);
  }
  if (out.real_kind !== "real") {
    console.error("FAIL real_not_real", out);
    process.exit(1);
  }
  if (out.funnel_real_n !== 1) {
    console.error("FAIL funnel_includes_synthetic", out);
    process.exit(1);
  }
  if (out.legacy_kind !== "synthetic" && out.legacy_kind !== "qa") {
    console.error("FAIL legacy_not_classified", out);
    process.exit(1);
  }
  console.log(JSON.stringify(out, null, 2));
  console.log("BACKFILL_LOCAL_OK");
  process.exit(0);
}

if (!TOKEN) {
  console.error("OPS_TOKEN or REVOPS_TOKEN required (or use --local-fixture)");
  process.exit(2);
}

async function api(action, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}/.netlify/functions/ops?action=${action}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

if (rollbackId) {
  const { status, data } = await api("rollback_record_kind", {
    method: "POST",
    body: { snapshot_id: rollbackId, actor: "backfill-cli" },
  });
  console.log(JSON.stringify({ status, data }, null, 2));
  process.exit(data.ok ? 0 : 1);
}

const { status, data } = await api("backfill_record_kind", {
  method: "POST",
  body: apply ? { apply: true, dry_run: false, actor: "backfill-cli" } : { dry_run: true },
});
console.log(JSON.stringify({ status, data }, null, 2));
if (!data.ok) process.exit(1);
if (!apply) {
  console.log(`\nPreview only (${data.candidate_count || 0} candidates). Re-run with --apply to write.`);
}
process.exit(0);
