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
assert("six_offers", offers.length === 6, offers.length);
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
assert("ticket_below_dossie_not_paid", belowDossier.economically_indicated === false, belowDossier);

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
  "nao_indicado",
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
assert("local_not_indicated_for_dossie", localEcon.economically_indicated_for_dossie === false, localEcon);
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

const failed = results.filter((r) => !r.ok);
console.log(`offer-fit-matrix: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify({ ok: false, failed: failed.map((f) => f.name) }, null, 2));
  process.exit(1);
}
