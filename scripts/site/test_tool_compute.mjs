/**
 * Pure unit tests for ConfengeToolCompute + ConfengeToolPersist — shipped modules only.
 * Drives assets/js/tool-compute.cjs (twin of the browser module). No reimplementation.
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const C = require(path.join(root, "assets/js/tool-compute.cjs"));
const P = require(path.join(root, "assets/js/tool-persist.cjs"));
const fixtures = JSON.parse(
  readFileSync(path.join(root, "scripts/site/fixtures/tools/tool-compute.json"), "utf8")
);

let failed = 0;
const pass = (n, d = "") => console.log("PASS", n, d);
const fail = (n, d) => { console.error("FAIL", n, d); failed++; };
const almost = (a, b, e = 0.01) => Math.abs(a - b) <= e;

function assertFinite(label, obj) {
  const bad = C.nonFinitePaths(obj);
  if (bad.length) fail(label + "_nonfinite", bad);
  else pass(label + "_finite");
}

function assertNoSilentZero(label, result) {
  if (result && result.ok) fail(label + "_silent_ok", result);
  else pass(label + "_rejected");
}

// --- twins ---
{
  const js = readFileSync(path.join(root, "assets/js/tool-compute.js"), "utf8");
  const cjs = readFileSync(path.join(root, "assets/js/tool-compute.cjs"), "utf8");
  if (js !== cjs) fail("twins_identical");
  else pass("twins_identical");
}

// --- parseBRL from fixtures ---
for (const row of fixtures.parseBRL) {
  const r = C.parseBRL(row.raw);
  if (!r.ok || !almost(r.value, row.value)) fail("parse_" + row.raw, r);
  else pass("parse_" + row.raw, r.value);
}
for (const raw of fixtures.parseBRL_invalid) {
  if (C.parseBRL(raw).ok) fail("parse_invalid_" + JSON.stringify(raw));
  else pass("parse_invalid_" + JSON.stringify(raw));
}

// --- Limite fixtures ---
for (const [name, case_] of Object.entries(fixtures.limite)) {
  const r = C.computeLimiteAditivo(case_.input);
  const exp = case_.expect;
  if (exp.ok === false) {
    if (r.ok) fail("fx_" + name + "_should_fail", r);
    else pass("fx_" + name + "_rejected", r.error);
    continue;
  }
  if (!r.ok) { fail("fx_" + name + "_ok", r); continue; }
  let ok = true;
  for (const [k, v] of Object.entries(exp)) {
    if (k === "ok" || k === "roundedContains") continue;
    if (r[k] !== v && !almost(r[k], v)) { fail("fx_" + name + "_" + k, { got: r[k], exp: v }); ok = false; }
  }
  if (exp.roundedContains && !(r.roundedFields || []).includes(exp.roundedContains)) {
    fail("fx_" + name + "_rounded", r.roundedFields); ok = false;
  }
  if (ok) pass("fx_" + name);
  assertFinite("fx_" + name, r);
}

{
  const r = C.computeLimiteAditivo(fixtures.limite.geral_25_over.input);
  if (!String(r.acrescimos.labelStatus).includes("limite numérico")) fail("wording"); else pass("wording");
}

// silent 0-coercion: invalid extra axis must not become 0 with ok:true
assertNoSilentZero("coerce_abc", C.computeLimiteAditivo({ valorInicial: 1e6, tipo: "geral", acrescimosPrevios: "abc" }));
assertNoSilentZero("coerce_nan", C.computeLimiteAditivo({ valorInicial: 1e6, tipo: "geral", acrescimosPrevios: Number.NaN }));
assertNoSilentZero("coerce_inf", C.computeLimiteAditivo({ valorInicial: 1e6, tipo: "geral", acrescimoProposto: Number.POSITIVE_INFINITY }));
assertNoSilentZero("coerce_neg_base", C.computeLimiteAditivo({ valorInicial: -1000, tipo: "geral" }));

{
  const r = C.readMoney("abc", "x");
  if (r.ok) fail("readMoney_abc"); else pass("readMoney_abc", r.error);
}

// property: random-but-deterministic bases, cents arithmetic, no NaN
{
  let props = 0;
  for (let i = 0; i < 80; i++) {
    const V = 10_000 + i * 12_345.67;
    const tipo = i % 2 ? "reforma" : "geral";
    const acPrev = (i * 111.11) % (V * 0.2);
    const suPrev = (i * 77.7) % (V * 0.1);
    const acNow = (i * 33.3) % (V * 0.15);
    const suNow = (i * 9.9) % (V * 0.05);
    const r = C.computeLimiteAditivo({
      valorInicial: V, tipo, acrescimosPrevios: acPrev, supressoesPrevias: suPrev,
      acrescimoProposto: acNow, supressaoProposta: suNow
    });
    if (!r.ok) { fail("prop_ok_" + i, r); break; }
    const bad = C.nonFinitePaths(r);
    if (bad.length) { fail("prop_finite_" + i, bad); break; }
    const limAc = tipo === "reforma" ? 0.5 : 0.25;
    if (r.limAc !== limAc) { fail("prop_lim_" + i, r.limAc); break; }
    const V2 = C.roundBRL(V);
    const maxAc = C.roundBRL(V2 * limAc);
    if (!almost(r.maxAc, maxAc, 0.011)) { fail("prop_max_" + i, { got: r.maxAc, exp: maxAc }); break; }
    const total = C.roundBRL(C.roundBRL(acPrev) + C.roundBRL(acNow));
    if (!almost(r.acTotal, total, 0.011)) { fail("prop_total_" + i, { got: r.acTotal, exp: total }); break; }
    const within = total <= maxAc + 0.0001;
    if (r.withinAc !== within) { fail("prop_within_" + i, { within, got: r.withinAc, total, maxAc }); break; }
    const expl = C.explainLimite(r);
    if (!expl.layers.fato || !expl.layers.calculo || !expl.layers.inferencia || !expl.layers.unknown) {
      fail("prop_explain_" + i, expl); break;
    }
    if (/parecer jurídico vinculante|tem direito|deve protocolar/i.test(JSON.stringify(expl))) {
      fail("prop_legal_" + i); break;
    }
    const cta = expl.cta.branch;
    const expectBranch = (!r.withinAc || !r.withinSu) ? "excedido" : "dentro";
    if (cta !== expectBranch) { fail("prop_cta_" + i, { cta, expectBranch }); break; }
    props += 1;
  }
  if (props === 80) pass("property_limite_80");
}

// explainLimite both branches
{
  const over = C.explainLimite(C.computeLimiteAditivo(fixtures.limite.geral_25_over.input));
  if (over.cta.branch !== "excedido") fail("cta_over", over.cta); else pass("cta_over");
  const ok = C.explainLimite(C.computeLimiteAditivo(fixtures.limite.reforma_50_ok.input));
  if (ok.cta.branch !== "dentro") fail("cta_ok", ok.cta); else pass("cta_ok");
  if (!ok.premises.some((p) => /art\. 125/i.test(p))) fail("premise_art125"); else pass("premise_art125");
}

// --- Reequilibrio with N/A, blockers, urgency order, ressalvas ---
{
  const all = {};
  for (const cat of Object.values(C.REEQ_CATEGORIES)) for (const it of cat.items) all[it.key] = "met";
  const high = C.computeReequilibrio(all);
  if (high.readiness !== "alta") fail("reeq_high", high); else pass("reeq_high");
  if (!Array.isArray(high.naKeys) || high.naKeys.length !== 0) fail("reeq_naKeys_empty", high.naKeys);
  else pass("reeq_naKeys_empty");
  assertFinite("reeq_high", high);
  const explHigh = C.explainReequilibrio(high);
  if (explHigh.cta.branch !== "pronto") fail("reeq_cta_high", explHigh.cta); else pass("reeq_cta_high");

  const blocked = C.computeReequilibrio({ ...all, fato_gerador: "missing" });
  if (blocked.readiness === "alta" || !blocked.hasCentralBlocker) fail("reeq_block", blocked);
  else pass("reeq_block", blocked.readiness);
  if (!blocked.ressalvas || !blocked.ressalvas.some((s) => /bloqueador/i.test(s))) fail("reeq_ressalvas", blocked.ressalvas);
  else pass("reeq_ressalvas");
  const explB = C.explainReequilibrio(blocked);
  if (explB.cta.branch !== "bloqueado") fail("reeq_cta_block"); else pass("reeq_cta_block");
  if (!explB.layers.unknown || /tem direito/i.test(JSON.stringify(explB))) fail("reeq_no_right");
  else pass("reeq_no_right");

  const withNa = { ...all, indices: "na", series: "na" };
  const naR = C.computeReequilibrio(withNa);
  if (!naR.ok) fail("reeq_na");
  else if (!Array.isArray(naR.naKeys) || naR.naKeys.length < 2) fail("reeq_na_keys", naR.naKeys);
  else if (!naR.naKeys.includes("indices") || !naR.naKeys.includes("series")) fail("reeq_na_keys_content", naR.naKeys);
  else pass("reeq_na_keys", naR.naKeys.join(","));
  if (naR.hasCentralBlocker) fail("reeq_na_false_blocker");
  else pass("reeq_na_no_blocker");

  const partial = {
    ...all,
    fato_gerador: "missing",
    contrato: "missing",
    planilha: "missing",
    pedido: "missing",
    anexos: "missing",
  };
  const alta = C.computeReequilibrio(partial, { urgencia: "alta", materialidade: "alta" });
  const baixa = C.computeReequilibrio(partial, { urgencia: "baixa", materialidade: "baixa" });
  const altaKeys = (alta.correctionOrder || []).map((o) => o.key).join(",");
  const baixaKeys = (baixa.correctionOrder || []).map((o) => o.key).join(",");
  if (!altaKeys || !baixaKeys) fail("reeq_urgency_order_empty", { altaKeys, baixaKeys });
  else if (altaKeys === baixaKeys) fail("reeq_urgency_order_same", altaKeys);
  else pass("reeq_urgency_order_diff", "alta=" + altaKeys + " | baixa=" + baixaKeys);

  const altaReasons = (alta.correctionOrder || []).map((o) => o.reason);
  if (!altaReasons.some((r) => /urgente/.test(r))) fail("reeq_alta_reason", altaReasons);
  else pass("reeq_alta_reason");
  const iFato = alta.correctionOrder.findIndex((o) => o.key === "fato_gerador");
  const iContrato = alta.correctionOrder.findIndex((o) => o.key === "contrato");
  const iPlanilha = alta.correctionOrder.findIndex((o) => o.key === "planilha");
  const iPedido = alta.correctionOrder.findIndex((o) => o.key === "pedido");
  if (!(iFato < iContrato && iContrato < iPlanilha && iPlanilha < iPedido)) {
    fail("reeq_alta_criticality", { iFato, iContrato, iPlanilha, iPedido, keys: altaKeys });
  } else pass("reeq_alta_criticality");

  const iPedidoB = baixa.correctionOrder.findIndex((o) => o.key === "pedido");
  const iPlanilhaB = baixa.correctionOrder.findIndex((o) => o.key === "planilha");
  if (!(iPedidoB < iPlanilhaB)) fail("reeq_baixa_process_before_econ", { iPedidoB, iPlanilhaB, keys: baixaKeys });
  else pass("reeq_baixa_process_before_econ");

  if (!alta.ressalvas || alta.ressalvas.length < 2) fail("reeq_alta_ressalvas_count", alta.ressalvas);
  else pass("reeq_alta_ressalvas", alta.ressalvas.length);
}

// Boundary: removing every item from the denominator cannot become medium/pronto.
{
  const allNa = {};
  for (const cat of Object.values(C.REEQ_CATEGORIES)) {
    for (const item of cat.items) allNa[item.key] = "na";
  }
  const r = C.computeReequilibrio(allNa);
  if (r.ok || r.error !== "sem_itens_aplicaveis") fail("reeq_all_na_rejected", r);
  else pass("reeq_all_na_rejected", r.error);
}

// Invalid public states fail explicitly instead of being silently read as pending.
{
  const r = C.computeReequilibrio({ fato_gerador: "talvez" });
  if (r.ok || r.error !== "estado_invalido") fail("reeq_invalid_state_rejected", r);
  else pass("reeq_invalid_state_rejected", r.error);
}

// Deterministic property sweep: a missing central blocker can never yield high readiness.
{
  let seed = 0x10c0ffee;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const keys = Object.values(C.REEQ_CATEGORIES).flatMap((cat) => cat.items.map((item) => item.key));
  let checked = 0;
  for (let i = 0; i < 64; i++) {
    const states = Object.fromEntries(keys.map((key) => [key, (next() & 1) ? "met" : "missing"]));
    states.fato_gerador = "missing";
    const r = C.computeReequilibrio(states, { urgencia: i % 3 === 0 ? "alta" : "media" });
    if (!r.ok || !r.hasCentralBlocker || r.readiness === "alta" || r.level === "ok") {
      fail("property_reeq_blocker_" + i, r);
      break;
    }
    if (C.nonFinitePaths(r).length) {
      fail("property_reeq_finite_" + i, C.nonFinitePaths(r));
      break;
    }
    checked += 1;
  }
  if (checked === 64) pass("property_reeq_blocker_64");
}

// --- Matriz concurrent + no evidence ---
{
  const r = C.computeMatrizEventos([
    { causa: "Projeto", parte: "administracao", comunicacaoContemporanea: false, documentoDisponivel: false, impactoCaminhoCritico: "sim", concorrencia: true, dataInicio: "2026-01-01", dataFim: "2026-01-20" },
    { causa: "Chuva", parte: "compartilhado", comunicacaoContemporanea: true, documentoDisponivel: true, impactoCaminhoCritico: "incerto", concorrencia: true, dataInicio: "2026-01-10", dataFim: "2026-01-25" },
  ]);
  if (!r.ok || r.level !== "hypothesis") fail("mx", r); else pass("mx_hypothesis");
  if (r.summary.possiveisSobreposicoes < 1) fail("mx_concurrent"); else pass("mx_concurrent", r.summary.possiveisSobreposicoes);
  if ((r.summary.sobrepostosPorData || 0) < 2) fail("mx_date_overlap", r.summary); else pass("mx_date_overlap", r.summary.sobrepostosPorData);
  if (r.summary.semProvaContemporanea < 1) fail("mx_no_evidence"); else pass("mx_no_evidence");
  const ev0 = r.events[0];
  if (!ev0.documentosFaltantes || !ev0.documentosFaltantes.length) fail("mx_docs_missing"); else pass("mx_docs_missing");
  if (!ev0.precisaImpactoCritico) fail("mx_crit_needs_activity"); else pass("mx_crit_needs_activity");
  const expl = C.explainMatriz(r);
  if (expl.cta.branch !== "lacunas") fail("mx_cta_lacunas", expl.cta); else pass("mx_cta_lacunas");
  if (!/hipótese/i.test(expl.layers.inferencia)) fail("mx_inferencia"); else pass("mx_inferencia");
  assertFinite("mx", r);
}

{
  const disjoint = C.computeMatrizEventos([
    { causa: "A", parte: "administracao", comunicacaoContemporanea: true, documentoDisponivel: true, atividadeAfetada: "fundação", impactoCaminhoCritico: "nao", dataInicio: "2026-01-01", dataFim: "2026-01-05" },
    { causa: "B", parte: "contratado", comunicacaoContemporanea: true, documentoDisponivel: true, atividadeAfetada: "revestimento", impactoCaminhoCritico: "nao", dataInicio: "2026-02-01", dataFim: "2026-02-05" },
  ]);
  if (!disjoint.ok) fail("mx_disjoint_ok", disjoint);
  else if (disjoint.summary.sobrepostosPorData !== 0) fail("mx_no_overlap", disjoint.summary);
  else pass("mx_no_overlap");
  if (disjoint.level !== "hypothesis") fail("mx_still_hypothesis"); else pass("mx_still_hypothesis");
  const expl = C.explainMatriz(disjoint);
  if (expl.cta.branch !== "completa") fail("mx_cta_completa", expl.cta); else pass("mx_cta_completa");
}

{
  const zeroDur = C.computeMatrizEventos([
    { causa: "Parada zero", parte: "indefinida", duracaoDias: 0, dataInicio: "2026-03-01" }
  ]);
  if (!zeroDur.ok) fail("mx_zero_dur", zeroDur);
  else if (zeroDur.events[0].duracaoDias !== 0) fail("mx_zero_kept", zeroDur.events[0]);
  else pass("mx_zero_dur_kept");
}

{
  const badDur = C.computeMatrizEventos([{ causa: "X", duracaoDias: -3 }]);
  if (badDur.ok) fail("mx_neg_dur"); else pass("mx_neg_dur", badDur.error);
}

{
  const impossibleDate = C.computeMatrizEventos([
    { causa: "Data impossível", dataInicio: "2026-02-30", duracaoDias: 1 }
  ]);
  if (impossibleDate.ok || impossibleDate.error !== "evento_invalido" ||
      !impossibleDate.invalid?.some((x) => x.error === "data_inicio_invalida")) {
    fail("mx_impossible_date_rejected", impossibleDate);
  } else pass("mx_impossible_date_rejected");
}

// A duration completes the interval when no end date was supplied.
{
  const durationOverlap = C.computeMatrizEventos([
    { causa: "A", dataInicio: "2026-01-01", duracaoDias: 10 },
    { causa: "B", dataInicio: "2026-01-05", dataFim: "2026-01-06" },
  ]);
  if (!durationOverlap.ok || durationOverlap.summary.sobrepostosPorData !== 2) {
    fail("mx_duration_overlap", durationOverlap);
  } else pass("mx_duration_overlap");
}

// Deterministic property sweep: valid event intervals remain hypotheses and finite.
{
  let checked = 0;
  for (let day = 1; day <= 28; day++) {
    const dd = String(day).padStart(2, "0");
    const r = C.computeMatrizEventos([
      { causa: "Evento " + day, dataInicio: `2026-04-${dd}`, duracaoDias: day % 7 }
    ]);
    if (!r.ok || r.level !== "hypothesis" || C.nonFinitePaths(r).length) {
      fail("property_matriz_hypothesis_" + day, r);
      break;
    }
    if (/veredito automático|culpa (?:é|está) determinada|direito (?:é|está) reconhecido/i.test(JSON.stringify(r))) {
      fail("property_matriz_legal_" + day, r);
      break;
    }
    checked += 1;
  }
  if (checked === 28) pass("property_matriz_hypothesis_28");
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
  if (/\b(cpf|cnpj|email|telefone|whatsapp)\s*[:=]/i.test(text)) fail("report_pii_fields");
  else pass("report_no_pii_fields");
}

if (failed) {
  console.error(failed + " failures");
  process.exit(1);
}
console.log("\nALL tool compute unit tests passed");
