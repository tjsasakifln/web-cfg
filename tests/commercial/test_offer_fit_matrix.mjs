/**
 * Gate CFG10X-17: matriz oferta→fit→não-fit→próximo passo.
 *
 * Exercita scripts/commercial/offer_fit.mjs (unidade embarcada), não uma
 * reimplementação. Cortes citados existem na política de preço publicada.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  NEXT_STEPS,
  citedCutsMatchPolicy,
  expectedBrowserModule,
  formatBrlFromCents,
  illustrationEconomics,
  loadOfferFitMatrix,
  loadPricingPolicy,
  paidStepFloorCents,
  riskBandCeilingCents,
  routeSituation,
} from "../../scripts/commercial/offer_fit.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
function assert(name, cond, detail) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

const matrix = loadOfferFitMatrix(root);
const policy = loadPricingPolicy(root);

assert("schema", matrix.schema === "confenge.offer-fit-matrix/1.0", matrix.schema);
assert("state_premises_only", matrix.state === "PREMISES_ONLY", matrix.state);
assert("wtp_claim_forbidden", matrix.wtp_claim_forbidden === true, matrix.wtp_claim_forbidden);
assert("policy_still_not_started", policy.state === "NOT_STARTED", policy.state);
assert(
  "next_steps_are_the_six",
  JSON.stringify(matrix.next_steps) === JSON.stringify(NEXT_STEPS),
  matrix.next_steps,
);

const cutProblems = citedCutsMatchPolicy(matrix, policy);
assert("cited_cuts_exist_in_published_policy", cutProblems.length === 0, cutProblems);
assert("no_validated_price_claim", !/\bVALIDATED\b/.test(JSON.stringify(matrix)), "validated");

const dimensionIds = {
  ticket_band: ["ate_250k", "250k_1m", "acima_1m", "unknown"],
  risk_band: ["abaixo_entrada", "faixa_entrada", "faixa_diagnostico", "faixa_dossie", "acima_dossie", "unknown"],
  frequency: ["pontual", "recorrente", "unknown"],
  urgency: ["ate_48h", "ate_7d", "ate_30d", "planejamento", "unknown"],
  document_maturity: ["forte", "parcial", "fraca", "unknown"],
  internal_capacity: ["suficiente", "limitada", "inexistente", "unknown"],
};
for (const [dim, ids] of Object.entries(dimensionIds)) {
  const got = (matrix.dimensions[dim].values || []).map((item) => item.id);
  assert(`dimension_${dim}`, JSON.stringify(got) === JSON.stringify(ids), got);
  assert(`dimension_${dim}_optional`, matrix.dimensions[dim].required === false, matrix.dimensions[dim]);
  assert(`dimension_${dim}_not_sensitive`, matrix.dimensions[dim].sensitive === false, matrix.dimensions[dim]);
}
assert(
  "step1_forbids_sensitive",
  ["cnpj", "cpf", "upload"].every((item) => matrix.sensitive_fields_forbidden_on_step_1.includes(item)),
  matrix.sensitive_fields_forbidden_on_step_1,
);

const offers = matrix.offers || [];
assert("five_offers", offers.length === 5, offers.length);
for (const offer of offers) {
  assert(`offer_next_step_${offer.offer_id}`, NEXT_STEPS.includes(offer.next_step), offer.next_step);
  assert(`offer_fit_${offer.offer_id}`, typeof offer.fit === "string" && offer.fit.length > 20, offer.fit);
  assert(`offer_not_fit_${offer.offer_id}`, typeof offer.not_fit === "string" && offer.not_fit.length > 20, offer.not_fit);
  assert(`offer_next_${offer.offer_id}`, typeof offer.public_next === "string" && offer.public_next.length > 10, offer.public_next);
}

function checkRoute(name, input, expectStep) {
  const first = routeSituation(input, matrix);
  const second = routeSituation(input, matrix);
  assert(`${name}_deterministic`, JSON.stringify(first) === JSON.stringify(second), name);
  assert(`${name}_next_step_allowed`, NEXT_STEPS.includes(first.next_step), first.next_step);
  assert(`${name}_next_step`, first.next_step === expectStep, { got: first.next_step, expect: expectStep });
  assert(`${name}_premises`, Array.isArray(first.premises) && first.premises.length > 0, first.premises);
  assert(
    `${name}_cited_in_policy`,
    first.cited_price_bands.every((key) => matrix.cited_bands[key]),
    first.cited_price_bands,
  );
  return first;
}

const belowDossier = checkRoute(
  "ticket_below_dossie",
  { ticket_band: "ate_250k", risk_band: "unknown", frequency: "pontual" },
  "conteudo_ferramenta",
);
assert(
  "ticket_below_dossie_still_has_a_next_step",
  Boolean(belowDossier.public_next && belowDossier.public_next.trim()),
  belowDossier,
);

checkRoute(
  "entrada_band",
  { risk_band: "faixa_entrada", frequency: "pontual", document_maturity: "parcial" },
  "entrega_entrada",
);

checkRoute(
  "dossie_band_pontual",
  { risk_band: "faixa_dossie", frequency: "pontual", document_maturity: "parcial", urgency: "ate_7d" },
  "projeto_critico",
);

checkRoute(
  "recorrente_vs_pontual_diretoria",
  {
    ticket_band: "acima_1m",
    risk_band: "acima_dossie",
    frequency: "recorrente",
    internal_capacity: "limitada",
  },
  "diretoria",
);

checkRoute(
  "recorrente_vs_pontual_projeto",
  { ticket_band: "acima_1m", risk_band: "acima_dossie", frequency: "pontual", document_maturity: "parcial" },
  "projeto_critico",
);

const recorrenteEntrada = checkRoute(
  "recorrente_risk_faixa_entrada_not_diretoria",
  {
    ticket_band: "acima_1m",
    risk_band: "faixa_entrada",
    frequency: "recorrente",
    internal_capacity: "limitada",
  },
  "entrega_entrada",
);
assert(
  "recorrente_faixa_entrada_not_lideranca",
  !recorrenteEntrada.cited_price_bands.includes("lideranca_fracionada"),
  recorrenteEntrada.cited_price_bands,
);
assert(
  "recorrente_faixa_entrada_floor_within_risk",
  paidStepFloorCents(recorrenteEntrada.next_step, matrix) <= riskBandCeilingCents("faixa_entrada", matrix),
  {
    step: recorrenteEntrada.next_step,
    floor: paidStepFloorCents(recorrenteEntrada.next_step, matrix),
    ceiling: riskBandCeilingCents("faixa_entrada", matrix),
  },
);

const recorrenteAbaixo = checkRoute(
  "recorrente_risk_abaixo_entrada_not_paid",
  {
    ticket_band: "acima_1m",
    risk_band: "abaixo_entrada",
    frequency: "recorrente",
    internal_capacity: "limitada",
  },
  "conteudo_ferramenta",
);
assert(
  "recorrente_abaixo_entrada_still_has_a_next_step",
  Boolean(recorrenteAbaixo.public_next && recorrenteAbaixo.public_next.trim()),
  recorrenteAbaixo,
);

const recFloor = matrix.cited_bands.recorrencia_gerenciada.min_cents;
const leadFloor = matrix.cited_bands.lideranca_fracionada.min_cents;
assert("recorrencia_floor_below_lideranca", recFloor < leadFloor, { recFloor, leadFloor });

const entradaCeiling = riskBandCeilingCents("faixa_entrada", matrix);
assert("faixa_entrada_below_recorrencia_floor", entradaCeiling < recFloor, { entradaCeiling, recFloor });
assert("faixa_entrada_below_lideranca_floor", entradaCeiling < leadFloor, { entradaCeiling, leadFloor });

const diagnosticoCeiling = riskBandCeilingCents("faixa_diagnostico", matrix);
assert(
  "faixa_diagnostico_below_lideranca_floor",
  diagnosticoCeiling < leadFloor,
  { diagnosticoCeiling, leadFloor },
);

const recorrenteDiagnostico = checkRoute(
  "recorrente_risk_below_lideranca_floor",
  {
    ticket_band: "acima_1m",
    risk_band: "faixa_diagnostico",
    frequency: "recorrente",
    internal_capacity: "limitada",
  },
  "diagnostico",
);
assert(
  "recorrente_diagnostico_not_diretoria",
  recorrenteDiagnostico.next_step !== "diretoria",
  recorrenteDiagnostico,
);
assert(
  "recorrente_diagnostico_floor_within_risk",
  paidStepFloorCents(recorrenteDiagnostico.next_step, matrix) <= diagnosticoCeiling,
  {
    step: recorrenteDiagnostico.next_step,
    floor: paidStepFloorCents(recorrenteDiagnostico.next_step, matrix),
    ceiling: diagnosticoCeiling,
  },
);

for (const risk of dimensionIds.risk_band.filter((id) => id !== "unknown")) {
  const input = {
    ticket_band: "acima_1m",
    risk_band: risk,
    frequency: "recorrente",
    internal_capacity: "limitada",
  };
  const routed = routeSituation(input, matrix);
  const again = routeSituation(input, matrix);
  const ceiling = riskBandCeilingCents(risk, matrix);
  const floor = paidStepFloorCents(routed.next_step, matrix);
  assert(`recorrente_${risk}_deterministic`, JSON.stringify(routed) === JSON.stringify(again), risk);
  assert(`recorrente_${risk}_floor_within_risk`, floor <= ceiling, {
    step: routed.next_step,
    floor,
    ceiling,
  });
  if (ceiling < recFloor || ceiling < leadFloor) {
    assert(`recorrente_${risk}_not_diretoria`, routed.next_step !== "diretoria", routed);
  }
}

checkRoute(
  "urgencia_projeto",
  { risk_band: "faixa_dossie", urgency: "ate_48h", document_maturity: "parcial", frequency: "pontual" },
  "projeto_critico",
);

checkRoute(
  "docs_fracos",
  { risk_band: "acima_dossie", document_maturity: "fraca", urgency: "ate_48h", frequency: "pontual" },
  "diagnostico",
);

checkRoute(
  "capacidade_interna_nao_fit",
  {
    risk_band: "abaixo_entrada",
    frequency: "pontual",
    document_maturity: "forte",
    internal_capacity: "suficiente",
    urgency: "planejamento",
  },
  "conteudo_ferramenta",
);

const unknown = checkRoute("unknown_defaults_diagnostico", {}, "diagnostico");
assert("unknown_has_diagnostico_cut", unknown.cited_price_bands.includes("diagnostico_delimitado"), unknown);

const local = matrix.home_illustrations.find((item) => item.panel === "local");
const localEcon = illustrationEconomics(local.contract_cents, matrix);
const localAgain = illustrationEconomics(local.contract_cents, matrix);
assert("illustration_deterministic", JSON.stringify(localEcon) === JSON.stringify(localAgain), "local");
assert("illustration_not_roi", localEcon.is_roi_claim === false && localEcon.kind === "illustration", localEcon);
assert("illustration_label", /ilustrativ/i.test(localEcon.label), localEcon.label);
assert(
  "illustration_one_percent_matches_published_math",
  localEcon.one_percent_cents === local.one_percent_cents &&
    localEcon.one_percent_display === local.one_percent_display,
  { got: localEcon.one_percent_display, expect: local.one_percent_display },
);
assert(
  "local_one_percent_below_dossie_floor",
  localEcon.one_percent_cents < matrix.cited_bands.dossie_critico.min_cents,
  { one: localEcon.one_percent_cents, dossie: matrix.cited_bands.dossie_critico.min_cents },
);
assert("local_one_percent_does_not_cover_dossie", localEcon.dossie_covers_one_percent === false, localEcon);
assert("illustration_has_cost", localEcon.cost.label === "custo" && /R\$/.test(localEcon.cost.display), localEcon.cost);
assert("illustration_has_risk", localEcon.risk.label === "risco", localEcon.risk);
assert("illustration_has_recurrence", localEcon.recurrence.label === "recorrência", localEcon.recurrence);
assert("illustration_has_limit", localEcon.limit.label === "limite", localEcon.limit);
assert(
  "illustration_copy_has_four_anchors",
  /custo/i.test(local.copy) && /risco/i.test(local.copy) && /recorrência/i.test(local.copy) && /limite/i.test(local.copy),
  local.copy,
);
assert("format_local_contract", formatBrlFromCents(17973767) === "R$ 179.737,67", formatBrlFromCents(17973767));
assert("format_one_percent", formatBrlFromCents(179738) === "R$ 1.797,38", formatBrlFromCents(179738));

for (const panel of matrix.home_illustrations) {
  const econ = illustrationEconomics(panel.contract_cents, matrix);
  assert(`panel_${panel.panel}_kind`, econ.kind === "illustration" && econ.is_roi_claim === false, panel.panel);
  assert(`panel_${panel.panel}_math`, econ.one_percent_cents === panel.one_percent_cents, panel);
  assert(`panel_${panel.panel}_copy_ilustr`, /ilustrativ/i.test(panel.copy), panel.copy);
  assert(`panel_${panel.panel}_not_exemplo_ilustrativo`, !/exemplo ilustrativo/i.test(panel.copy), panel.copy);
}

const browserExpected = expectedBrowserModule(root);
const browserPath = path.join(root, "js/modules/offer-fit.js");
assert("browser_module_present", fs.existsSync(browserPath), browserPath);
assert(
  "browser_module_is_generated_from_matrix",
  fs.readFileSync(browserPath, "utf8") === browserExpected,
  "run: node scripts/commercial/offer_fit.mjs --write-browser",
);

const DASH_RE = new RegExp("[" + String.fromCharCode(8212, 8211) + "]");
const selfRaw = fs.readFileSync(path.join(__dirname, "test_offer_fit_matrix.mjs"), "utf8");
const moduleRaw = fs.readFileSync(path.join(root, "scripts/commercial/offer_fit.mjs"), "utf8");
const matrixRaw = fs.readFileSync(path.join(root, "data/commercial/offer-fit-matrix.v1.json"), "utf8");
assert("matrix_has_no_em_dash", !DASH_RE.test(matrixRaw), "travessao proibido");
assert("module_has_no_em_dash", !DASH_RE.test(moduleRaw), "travessao proibido");
assert("test_has_no_em_dash", !DASH_RE.test(selfRaw), "travessao proibido");

// --- contracaso da direcao de 2026-09-06 -------------------------------------
// Variar SOMENTE o porte informado, entre pequeno, grande e desconhecido, nao
// pode remover o caminho de contato nem produzir uma recusa. O formato indicado
// PODE mudar: escopo e proposta se ajustam a necessidade. O atendimento nao.
const REFUSAL_RE = /n[\u00e3a]o (contratar|[\u00e9e] economicamente indicada)|n[\u00e3a]o indicad[oa]|desqualific/i;
const sizeOnly = ["ate_250k", "250k_1m", "acima_1m", "unknown"].map((band) => ({
  band,
  routed: routeSituation({ ticket_band: band }, matrix),
}));
for (const { band, routed } of sizeOnly) {
  assert(`size_${band}_has_next_step`, NEXT_STEPS.includes(routed.next_step), routed);
  assert(`size_${band}_has_public_next`, Boolean(routed.public_next && routed.public_next.trim()), routed);
  assert(`size_${band}_is_not_a_refusal`, !REFUSAL_RE.test(routed.public_next), routed.public_next);
  assert(`size_${band}_offer_exists`, Boolean(routed.offer_id), routed);
}
// Orcamento desconhecido nao pode ser tratado como orcamento pequeno.
const unknownBand = sizeOnly.find((x) => x.band === "unknown").routed;
assert(
  "unknown_budget_is_not_demoted_to_the_smallest_step",
  unknownBand.next_step !== "conteudo_ferramenta",
  unknownBand,
);
// Nenhum passo terminal do roteador pode ser uma recusa, em nenhuma combinacao.
for (const step of NEXT_STEPS) {
  const offer = matrix.offers.find((o) => o.next_step === step);
  assert(`offer_${step}_exists`, Boolean(offer), step);
  assert(`offer_${step}_public_next_is_not_a_refusal`, !REFUSAL_RE.test(offer.public_next), offer.public_next);
}

const failed = results.filter((r) => !r.ok);
console.log(`offer-fit-matrix: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify({ ok: false, failed: failed.map((f) => f.name) }, null, 2));
  process.exit(1);
}
