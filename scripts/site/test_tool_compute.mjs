/**
 * Pure unit tests for ConfengeToolCompute — drives the shipped module only.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const C = require(path.join(root, "assets/js/tool-compute.cjs"));

let failed = 0;
function pass(n, d = "") {
  console.log("PASS", n, d);
}
function fail(n, d) {
  console.error("FAIL", n, d);
  failed += 1;
}
function almost(a, b, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

// --- Limite aditivo art.125 ---
{
  const r = C.computeLimiteAditivo({
    valorInicial: 10_000_000,
    tipo: "geral",
    acrescimosPrevios: 1_800_000,
    supressoesPrevias: 0,
    acrescimoProposto: 900_000,
    supressaoProposta: 0,
  });
  if (!r.ok) fail("limite_ok");
  else pass("limite_ok");
  if (!almost(r.maxAc, 2_500_000)) fail("maxAc_25", r.maxAc);
  else pass("maxAc_25", r.maxAc);
  if (!almost(r.acTotal, 2_700_000)) fail("acTotal", r.acTotal);
  else pass("acTotal", r.acTotal);
  if (!almost(r.salAc, -200_000)) fail("salAc_negative", r.salAc);
  else pass("salAc_negative", r.salAc);
  if (r.level !== "bad" || r.withinAc !== false) fail("over_cap_level", r);
  else pass("over_cap_bad");
}

{
  const r = C.computeLimiteAditivo({
    valorInicial: 1_000_000,
    tipo: "reforma",
    acrescimosPrevios: 0,
    supressoesPrevias: 0,
    acrescimoProposto: 400_000,
    supressaoProposta: 0,
  });
  if (!almost(r.limAc, 0.5) || !almost(r.maxAc, 500_000)) fail("reforma_50", r);
  else pass("reforma_50");
  if (r.withinAc !== true || r.level === "bad") fail("reforma_within", r);
  else pass("reforma_within");
}

{
  const r = C.computeLimiteAditivo({ valorInicial: 0, tipo: "geral", acrescimosPrevios: 0, supressoesPrevias: 0, acrescimoProposto: 0, supressaoProposta: 0 });
  if (r.ok !== false) fail("zero_valor");
  else pass("zero_valor_rejected");
}

{
  // exact 25% boundary
  const r = C.computeLimiteAditivo({
    valorInicial: 1_000_000,
    tipo: "geral",
    acrescimosPrevios: 250_000,
    supressoesPrevias: 0,
    acrescimoProposto: 0,
    supressaoProposta: 0,
  });
  if (!r.withinAc || !almost(r.salAc, 0)) fail("exact_25_boundary", r);
  else pass("exact_25_boundary");
}

// --- Checklist ---
{
  const keys = ["a", "b", "c", "d", "comunicacao", "planilha", "cronologia", "composicoes"];
  const r = C.computeChecklistScore(["a", "b", "c", "d", "comunicacao", "planilha"], keys, "alta");
  if (r.score_pct !== 75) fail("score_75", r);
  else pass("score_75");
  if (r.level !== "ok") fail("level_ok_at_75", r.level);
  else pass("level_ok_at_75");
  if (!r.missing.includes("cronologia")) fail("missing_cronologia");
  else pass("missing_cronologia");
}

{
  const r = C.computeChecklistScore([], ["a", "b", "c", "d"], "media");
  if (r.score !== 0 || r.level !== "bad") fail("empty_checklist", r);
  else pass("empty_checklist_bad");
}

{
  const r = C.computeChecklistScore(["a"], ["a", "b", "c", "d"], "alta");
  if (r.level !== "bad" || !r.next.includes("urgente_incompleto")) fail("urgente", r);
  else pass("urgente_incompleto");
}

// --- Matriz atraso ---
{
  const r = C.computeMatrizAtraso(["projeto", "pagamento"], 45, "sim");
  if (!r.ok) fail("matriz_ok");
  else pass("matriz_ok");
  if (r.counts.administracao !== 2) fail("adm_count", r.counts);
  else pass("adm_count_2");
  if (r.level !== "ok") fail("adm_level", r.level);
  else pass("adm_tendency_ok");
  if (r.dias !== 45) fail("dias", r.dias);
  else pass("dias_45");
}

{
  const r = C.computeMatrizAtraso(["mao_obra", "equip"], 10, "nao");
  if (r.counts.contratado !== 2 || r.level !== "bad") fail("contratado_bad", r);
  else pass("contratado_tendency_bad");
}

{
  const r = C.computeMatrizAtraso([], 0, "nao");
  if (r.ok !== false) fail("empty_causes");
  else pass("empty_causes_rejected");
}

// Non-trivial: result changes with inputs
{
  const a = C.computeLimiteAditivo({
    valorInicial: 100, tipo: "geral", acrescimosPrevios: 0, supressoesPrevias: 0, acrescimoProposto: 10, supressaoProposta: 0,
  });
  const b = C.computeLimiteAditivo({
    valorInicial: 100, tipo: "geral", acrescimosPrevios: 0, supressoesPrevias: 0, acrescimoProposto: 40, supressaoProposta: 0,
  });
  if (a.level === b.level && a.withinAc === b.withinAc) fail("nontrivial_diff");
  else pass("nontrivial_diff_levels", `${a.level}->${b.level}`);
}

if (failed) {
  console.error(failed + " failures");
  process.exit(1);
}
console.log("\nALL tool compute unit tests passed");
