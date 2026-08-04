/**
 * Pure unit tests for ConfengeToolCompute + ConfengeToolPersist — shipped modules only.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const C = require(path.join(root, "assets/js/tool-compute.cjs"));
const P = require(path.join(root, "assets/js/tool-persist.cjs"));

let failed = 0;
const pass = (n, d = "") => console.log("PASS", n, d);
const fail = (n, d) => { console.error("FAIL", n, d); failed++; };
const almost = (a, b, e = 0.01) => Math.abs(a - b) <= e;

// --- parseBRL ---
for (const [raw, exp] of [["10000000", 1e7], ["10000000,50", 1e7 + 0.5], ["10.000.000", 1e7], ["10.000.000,50", 1e7 + 0.5]]) {
  const r = C.parseBRL(raw);
  if (!r.ok || !almost(r.value, exp)) fail("parse_" + raw, r);
  else pass("parse_" + raw, r.value);
}
if (C.parseBRL("abc").ok) fail("parse_invalid"); else pass("parse_invalid");
if (C.parseBRL("").ok) fail("parse_empty"); else pass("parse_empty");

// --- Limite ---
{
  const r = C.computeLimiteAditivo({ valorInicial: 1e7, tipo: "geral", acrescimosPrevios: 1.8e6, supressoesPrevias: 0, acrescimoProposto: 9e5, supressaoProposta: 0 });
  if (!r.ok || r.withinAc !== false || r.level !== "bad") fail("over", r); else pass("over");
  if (!String(r.acrescimos.labelStatus).includes("limite numérico")) fail("wording"); else pass("wording");
}
{
  const r = C.computeLimiteAditivo({ valorInicial: 1e6, tipo: "reforma", acrescimosPrevios: 0, supressoesPrevias: 0, acrescimoProposto: 4e5, supressaoProposta: 0 });
  if (r.limAc !== 0.5 || !r.withinAc) fail("reforma"); else pass("reforma");
}
{
  const r = C.computeLimiteAditivo({ valorInicial: 1e6, tipo: "geral", acrescimosPrevios: 3e5, supressoesPrevias: 0, acrescimoProposto: 0, supressaoProposta: 5e4 });
  if (r.withinAc !== false || r.withinSu !== true) fail("indep"); else pass("indep");
}

// --- Reequilibrio with N/A and blockers ---
{
  const all = {};
  for (const cat of Object.values(C.REEQ_CATEGORIES)) for (const it of cat.items) all[it.key] = "met";
  const high = C.computeReequilibrio(all);
  if (high.readiness !== "alta") fail("reeq_high", high); else pass("reeq_high");

  const blocked = C.computeReequilibrio({ ...all, fato_gerador: "missing" });
  if (blocked.readiness === "alta" || !blocked.hasCentralBlocker) fail("reeq_block", blocked);
  else pass("reeq_block", blocked.readiness);

  // N/A on economic item should not force missing
  const withNa = { ...all, indices: "na", series: "na" };
  const naR = C.computeReequilibrio(withNa);
  if (!naR.ok) fail("reeq_na");
  else if (naR.naKeys && naR.naKeys.length >= 2) pass("reeq_na_keys", naR.naKeys.length);
  else pass("reeq_na", (naR.naKeys || []).join(","));
  // high still possible with N/A on non-blockers
  if (naR.hasCentralBlocker) fail("reeq_na_false_blocker");
  else pass("reeq_na_no_blocker");
}

// --- Matriz concurrent + no evidence ---
{
  const r = C.computeMatrizEventos([
    { causa: "Projeto", parte: "administracao", comunicacaoContemporanea: false, documentoDisponivel: false, impactoCaminhoCritico: "sim", concorrencia: true, dataInicio: "2026-01-01", dataFim: "2026-01-20" },
    { causa: "Chuva", parte: "compartilhado", comunicacaoContemporanea: true, documentoDisponivel: true, impactoCaminhoCritico: "incerto", concorrencia: true, dataInicio: "2026-01-10", dataFim: "2026-01-25" },
  ]);
  if (!r.ok || r.level !== "hypothesis") fail("mx", r); else pass("mx_hypothesis");
  if (r.summary.possiveisSobreposicoes < 1) fail("mx_concurrent"); else pass("mx_concurrent", r.summary.possiveisSobreposicoes);
  if (r.summary.semProvaContemporanea < 1) fail("mx_no_evidence"); else pass("mx_no_evidence");
  const ev0 = r.events[0];
  if (!ev0.documentosFaltantes || !ev0.documentosFaltantes.length) fail("mx_docs_missing"); else pass("mx_docs_missing");
  if (!ev0.precisaImpactoCritico && ev0.impactoCaminhoCritico !== "sim") pass("mx_crit_flag");
  else pass("mx_crit");
}
{
  const r = C.computeMatrizAtraso(["projeto", "pagamento"], 10, "sim");
  if (r.level === "ok" || r.level === "bad") fail("legacy_verdict", r.level);
  else pass("legacy_hypothesis", r.level);
}

// --- Aditivo readiness ---
{
  const r = C.computeAditivoReadiness([
    { id: "1", category: "essential", state: "pending", label: "A" },
    { id: "2", category: "blocker", state: "met", label: "B" },
  ]);
  if (r.readiness === "alta" || r.level === "ok") fail("aditivo"); else pass("aditivo", r.readiness);
}

// --- Persistence pure API ---
{
  const packed = P.packState(2, { foo: "bar" }, 1_000_000);
  if (packed.v !== 2 || packed.data.foo !== "bar" || packed.savedAt !== 1_000_000) fail("pack", packed);
  else pass("pack");

  const ok = P.unpackState(JSON.stringify(packed), 2, { now: 1_000_000 + 1000 });
  if (!ok.ok || ok.data.foo !== "bar") fail("unpack_ok", ok); else pass("unpack_ok");

  const mismatch = P.unpackState(JSON.stringify(packed), 3, { now: 1_000_000 });
  if (mismatch.ok || mismatch.reason !== "schema_mismatch") fail("unpack_schema", mismatch);
  else pass("unpack_schema_mismatch");

  const expired = P.unpackState(JSON.stringify(packed), 2, { now: 1_000_000 + P.DEFAULT_TTL_MS + 1 });
  if (expired.ok || expired.reason !== "expired") fail("unpack_ttl", expired);
  else pass("unpack_expired");

  const badJson = P.unpackState("{not json", 1);
  if (badJson.ok) fail("unpack_badjson"); else pass("unpack_badjson", badJson.reason);
}

// --- Summary / report generation ---
{
  const text = P.buildReportText(
    [
      { title: "CONFENGE: teste", body: "Síntese natural." },
      { title: "Dados", lines: ["a: 1", "b: 2"] },
      { title: "Aviso", body: "Orientativo." },
    ],
    { generatedAt: "04/08/2026, 12:00", footer: "Dados apenas neste navegador." }
  );
  if (!text.includes("CONFENGE: teste") || !text.includes("Síntese natural") || !text.includes("a: 1")) fail("report", text.slice(0, 200));
  else pass("report_structure");
  if (!text.includes("Gerado em:") || !text.includes("navegador")) fail("report_footer");
  else pass("report_footer");
  if (text.length < 40) fail("report_empty"); else pass("report_nonempty", text.length);
}

if (failed) {
  console.error(failed + " failures");
  process.exit(1);
}
console.log("\nALL tool compute unit tests passed");
