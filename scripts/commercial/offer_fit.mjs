#!/usr/bin/env node
/**
 * Situação → fit / não-fit → próximo passo.
 *
 * Premissas derivadas da escada e dos preços publicados (#341).
 * Nenhum corte é WTP observada. Copy, formulário e testes leem esta unidade.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

export const NEXT_STEPS = Object.freeze([
  "conteudo_ferramenta",
  "entrega_entrada",
  "diagnostico",
  "projeto_critico",
  "diretoria",
]);

export function loadOfferFitMatrix(base = root) {
  return JSON.parse(
    fs.readFileSync(path.join(base, "data/commercial/offer-fit-matrix.v1.json"), "utf8"),
  );
}

export function loadPricingPolicy(base = root) {
  return JSON.parse(
    fs.readFileSync(path.join(base, "data/commercial/pricing-policy.v1.json"), "utf8"),
  );
}

export function formatBrlFromCents(cents) {
  const negative = cents < 0;
  const abs = Math.abs(Number(cents) || 0);
  const [reais, frac] = (abs / 100).toFixed(2).split(".");
  const grouped = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}R$ ${grouped},${frac}`;
}

export function citedCutsMatchPolicy(matrix, policy) {
  const problems = [];
  const ladder = Array.isArray(policy.ladder) ? policy.ladder : [];
  for (const [key, band] of Object.entries(matrix.cited_bands || {})) {
    const tier = ladder.find((item) => item.tier_id === band.tier_id);
    if (!tier) {
      problems.push(`missing_tier:${key}`);
      continue;
    }
    if (tier.price_band.min_cents !== band.min_cents || tier.price_band.max_cents !== band.max_cents) {
      problems.push(`band_drift:${key}`);
    }
    if (tier.billing !== band.billing) problems.push(`billing_drift:${key}`);
  }
  return problems;
}

function offerByStep(matrix, nextStep) {
  return (matrix.offers || []).find((item) => item.next_step === nextStep) || null;
}

const PAID_LADDER_DESC = Object.freeze([
  "diretoria",
  "projeto_critico",
  "diagnostico",
  "entrega_entrada",
  "conteudo_ferramenta",
]);

export function riskBandCeilingCents(risk, matrix) {
  const row = ((matrix.dimensions || {}).risk_band || {}).values || [];
  const found = row.find((item) => item.id === risk);
  if (!found || risk === "unknown") return null;
  if (Number.isFinite(found.max_cents)) return found.max_cents;
  if (Number.isFinite(found.max_cents_exclusive)) return found.max_cents_exclusive - 1;
  if (Number.isFinite(found.min_cents_exclusive)) return Number.POSITIVE_INFINITY;
  return null;
}

export function paidStepFloorCents(nextStep, matrix) {
  if (nextStep === "conteudo_ferramenta") return 0;
  const offer = offerByStep(matrix, nextStep);
  if (!offer || !offer.ladder_tier_id) return 0;
  const band = Object.values(matrix.cited_bands || {}).find((item) => item.tier_id === offer.ladder_tier_id);
  return band && Number.isFinite(band.min_cents) ? band.min_cents : 0;
}

export function clampStepToRisk(nextStep, risk, matrix) {
  const ceiling = riskBandCeilingCents(risk, matrix);
  if (ceiling == null) return nextStep;
  if (paidStepFloorCents(nextStep, matrix) <= ceiling) return nextStep;
  const start = Math.max(0, PAID_LADDER_DESC.indexOf(nextStep));
  for (let i = start; i < PAID_LADDER_DESC.length; i += 1) {
    const step = PAID_LADDER_DESC[i];
    if (paidStepFloorCents(step, matrix) <= ceiling) return step;
  }
  return "conteudo_ferramenta";
}

function urgencyRank(value) {
  if (value === "ate_48h") return 4;
  if (value === "ate_7d") return 3;
  if (value === "ate_30d") return 2;
  if (value === "planejamento") return 1;
  return 0;
}

/**
 * Encaminha uma situação para um dos seis próximos passos.
 * Dimensões ausentes valem "unknown". Nunca inventa ROI.
 */
export function routeSituation(input = {}, matrix) {
  if (!matrix || !Array.isArray(matrix.offers)) {
    throw new Error("offer-fit matrix required");
  }
  const ticket = input.ticket_band || "unknown";
  const risk = input.risk_band || "unknown";
  const frequency = input.frequency || "unknown";
  const urgency = input.urgency || "unknown";
  const docs = input.document_maturity || "unknown";
  const capacity = input.internal_capacity || "unknown";
  const premisesUsed = [];
  const cited = [];

  const finish = (nextStep, extraPremises = []) => {
    const affordable = clampStepToRisk(nextStep, risk, matrix);
    if (affordable !== nextStep) {
      premisesUsed.push("cost_coverage");
      const ceiling = riskBandCeilingCents(risk, matrix);
      if (ceiling != null) {
        for (let i = cited.length - 1; i >= 0; i -= 1) {
          const min = matrix.cited_bands[cited[i]] && matrix.cited_bands[cited[i]].min_cents;
          if (Number.isFinite(min) && min > ceiling) cited.splice(i, 1);
        }
      }
      const offerBand = offerByStep(matrix, affordable);
      const bandKey = Object.entries(matrix.cited_bands || {}).find(
        ([, band]) => offerBand && band.tier_id === offerBand.ladder_tier_id,
      );
      if (bandKey && !cited.includes(bandKey[0])) cited.push(bandKey[0]);
    }
    const offer = offerByStep(matrix, affordable);
    const ids = [...new Set(["not_validated_price", ...premisesUsed, ...extraPremises])];
    const premises = ids.map((id) => {
      const row = (matrix.premises || []).find((item) => item.id === id);
      return row ? row.statement : id;
    });
    return {
      next_step: affordable,
      next_step_label: (matrix.next_step_labels && matrix.next_step_labels[affordable]) || affordable,
      offer_id: offer ? offer.offer_id : affordable,
      fit: offer ? offer.fit : "",
      not_fit: offer ? offer.not_fit : "",
      public_next: offer ? offer.public_next : "",
      premises,
      cited_price_bands: cited,
    };
  };

  const mark = (premiseId, bandKey) => {
    premisesUsed.push(premiseId);
    if (bandKey && matrix.cited_bands[bandKey] && !cited.includes(bandKey)) cited.push(bandKey);
  };

  const lowRisk = risk === "abaixo_entrada";
  const oneOff = frequency === "pontual" || frequency === "unknown";
  const selfSufficient =
    (docs === "forte" || docs === "unknown") &&
    (capacity === "suficiente" || capacity === "unknown") &&
    urgencyRank(urgency) <= 1;

  // Nenhum estado terminal e uma recusa. Documentos organizados e equipe
  // interna capaz mudam QUAL passo e util, nunca se o visitante e atendido:
  // o menor passo util continua sendo um passo.
  if (lowRisk && oneOff && selfSufficient && ticket !== "acima_1m") {
    mark("smallest_useful_step", "entrada_factual");
    mark("cost_coverage", "entrada_factual");
    return finish("conteudo_ferramenta");
  }

  // Porte sozinho nao roteia: orcamento desconhecido nao e orcamento pequeno.
  if (lowRisk) {
    mark("smallest_useful_step", "entrada_factual");
    mark("cost_coverage", "diagnostico_delimitado");
    return finish("conteudo_ferramenta");
  }

  if (
    frequency === "recorrente" &&
    risk === "acima_dossie" &&
    (capacity === "limitada" || capacity === "inexistente")
  ) {
    mark("recurrence_separate_from_one_off", "lideranca_fracionada");
    mark("cost_coverage", "recorrencia_gerenciada");
    return finish("diretoria");
  }

  if (docs === "fraca" && risk !== "abaixo_entrada") {
    mark("weak_docs_before_dossie", "diagnostico_delimitado");
    if (risk === "faixa_entrada") {
      mark("cost_coverage", "entrada_factual");
      return finish("entrega_entrada");
    }
    return finish("diagnostico");
  }

  if (
    urgencyRank(urgency) >= 3 &&
    (risk === "faixa_dossie" || risk === "acima_dossie") &&
    docs !== "fraca"
  ) {
    mark("cost_coverage", "dossie_critico");
    return finish("projeto_critico");
  }

  if (risk === "faixa_entrada") {
    mark("cost_coverage", "entrada_factual");
    return finish("entrega_entrada");
  }
  if (risk === "faixa_diagnostico") {
    mark("cost_coverage", "diagnostico_delimitado");
    return finish("diagnostico");
  }
  if (risk === "faixa_dossie" || risk === "acima_dossie") {
    mark("cost_coverage", "dossie_critico");
    if (frequency === "recorrente") {
      mark("recurrence_separate_from_one_off", "lideranca_fracionada");
      return finish("diretoria");
    }
    return finish("projeto_critico");
  }

  if (ticket === "ate_250k") {
    mark("home_porte_from_pncp", "diagnostico_delimitado");
    return finish("conteudo_ferramenta");
  }
  if (ticket === "250k_1m") {
    mark("home_porte_from_pncp", "diagnostico_delimitado");
    return finish("diagnostico");
  }
  if (ticket === "acima_1m") {
    mark("home_porte_from_pncp", "dossie_critico");
    if (frequency === "recorrente") {
      mark("recurrence_separate_from_one_off", "lideranca_fracionada");
      return finish("diretoria");
    }
    return finish("projeto_critico");
  }

  mark("cost_coverage", "diagnostico_delimitado");
  return finish("diagnostico");
}

export function illustrationEconomics(contractCents, matrix) {
  const contract = Number(contractCents);
  if (!Number.isFinite(contract) || contract <= 0) {
    throw new Error("contract cents required");
  }
  const onePercent = Math.round(contract * 0.01);
  const dossie = matrix.cited_bands.dossie_critico;
  const diagnostico = matrix.cited_bands.diagnostico_delimitado;
  const diretoria = matrix.cited_bands.lideranca_fracionada;
  const panel = (matrix.home_illustrations || []).find(
    (item) => item.contract_cents === contract,
  );
  return {
    kind: "illustration",
    is_roi_claim: false,
    label: "Conta ilustrativa, não é economia observada",
    contract_cents: contract,
    contract_display: formatBrlFromCents(contract),
    one_percent_cents: onePercent,
    one_percent_display: formatBrlFromCents(onePercent),
    cost: {
      label: "custo",
      display: dossie.display,
      min_cents: dossie.min_cents,
      max_cents: dossie.max_cents,
      billing: dossie.billing,
    },
    risk: {
      label: "risco",
      floor_display: diagnostico.display,
      min_cents: diagnostico.min_cents,
    },
    recurrence: {
      label: "recorrência",
      display: diretoria.display,
      min_cents: diretoria.min_cents,
      max_cents: diretoria.max_cents,
      billing: diretoria.billing,
    },
    limit: {
      label: "limite",
      statement:
        "O percentual não é economia observada. Abaixo do piso de diagnóstico, o formato indicado é uma entrega de entrada ou a ferramenta pública.",
    },
    dossie_covers_one_percent: onePercent >= dossie.min_cents,
    copy: panel ? panel.copy : "",
    premises: ["percent_is_illustration", "cost_coverage", "recurrence_separate_from_one_off", "not_validated_price"],
  };
}

export function publicCopyNeedles(matrix) {
  const needles = [];
  for (const copy of Object.values(matrix.route_copy || {})) {
    needles.push(copy.headline, copy.body);
  }
  for (const panel of matrix.home_illustrations || []) {
    needles.push(panel.copy, panel.contract_display, panel.pncp_path);
  }
  return needles;
}

function browserSource(matrix) {
  const payload = JSON.stringify(matrix);
  return `/* MODULE offer-fit - situation to next step from published prices
 * Runtime: assembled into /script.js. Do not load alone.
 * Generated from data/commercial/offer-fit-matrix.v1.json. Do not edit by hand.
 */
      const CONFENGE_OFFER_FIT_MATRIX = ${payload};
      const confengeRouteOfferFit = (input) => {
        const matrix = CONFENGE_OFFER_FIT_MATRIX;
        const ticket = (input && input.ticket_band) || "unknown";
        const risk = (input && input.risk_band) || "unknown";
        const frequency = (input && input.frequency) || "unknown";
        const urgency = (input && input.urgency) || "unknown";
        const docs = (input && input.document_maturity) || "unknown";
        const capacity = (input && input.internal_capacity) || "unknown";
        const offerOf = (step) => (matrix.offers || []).find((item) => item.next_step === step) || null;
        const urg = (value) => {
          if (value === "ate_48h") return 4;
          if (value === "ate_7d") return 3;
          if (value === "ate_30d") return 2;
          if (value === "planejamento") return 1;
          return 0;
        };
        const ceilingOf = (riskId) => {
          const found = (((matrix.dimensions || {}).risk_band || {}).values || []).find((item) => item.id === riskId);
          if (!found || riskId === "unknown") return null;
          if (typeof found.max_cents === "number") return found.max_cents;
          if (typeof found.max_cents_exclusive === "number") return found.max_cents_exclusive - 1;
          if (typeof found.min_cents_exclusive === "number") return Infinity;
          return null;
        };
        const floorOf = (step) => {
          const offer = offerOf(step);
          if (!offer || !offer.ladder_tier_id) return 0;
          const band = Object.values(matrix.cited_bands || {}).find((item) => item.tier_id === offer.ladder_tier_id);
          return band && typeof band.min_cents === "number" ? band.min_cents : 0;
        };
        const clamp = (step) => {
          const ceiling = ceilingOf(risk);
          if (ceiling == null || floorOf(step) <= ceiling) return step;
          const ladder = ["diretoria", "projeto_critico", "diagnostico", "entrega_entrada", "conteudo_ferramenta"];
          const start = Math.max(0, ladder.indexOf(step));
          for (let i = start; i < ladder.length; i += 1) {
            if (floorOf(ladder[i]) <= ceiling) return ladder[i];
          }
          return "conteudo_ferramenta";
        };
        const finish = (nextStep) => {
          const affordable = clamp(nextStep);
          const offer = offerOf(affordable);
          return {
            next_step: affordable,
            next_step_label: (matrix.next_step_labels && matrix.next_step_labels[affordable]) || affordable,
            offer_id: offer ? offer.offer_id : affordable,
            fit: offer ? offer.fit : "",
            not_fit: offer ? offer.not_fit : "",
            public_next: offer ? offer.public_next : "",
          };
        };
        const lowRisk = risk === "abaixo_entrada";
        const oneOff = frequency === "pontual" || frequency === "unknown";
        const selfSufficient =
          (docs === "forte" || docs === "unknown") &&
          (capacity === "suficiente" || capacity === "unknown") &&
          urg(urgency) <= 1;
        if (lowRisk && oneOff && selfSufficient && ticket !== "acima_1m") {
          return finish("conteudo_ferramenta");
        }
        if (lowRisk) {
          return finish("conteudo_ferramenta");
        }
        if (
          frequency === "recorrente" &&
          risk === "acima_dossie" &&
          (capacity === "limitada" || capacity === "inexistente")
        ) {
          return finish("diretoria");
        }
        if (docs === "fraca" && risk !== "abaixo_entrada") {
          if (risk === "faixa_entrada") return finish("entrega_entrada");
          return finish("diagnostico");
        }
        if (urg(urgency) >= 3 && (risk === "faixa_dossie" || risk === "acima_dossie") && docs !== "fraca") {
          return finish("projeto_critico");
        }
        if (risk === "faixa_entrada") return finish("entrega_entrada");
        if (risk === "faixa_diagnostico") return finish("diagnostico");
        if (risk === "faixa_dossie" || risk === "acima_dossie") {
          if (frequency === "recorrente") return finish("diretoria");
          return finish("projeto_critico");
        }
        if (ticket === "ate_250k") return finish("conteudo_ferramenta");
        if (ticket === "250k_1m") return finish("diagnostico");
        if (ticket === "acima_1m") {
          if (frequency === "recorrente") return finish("diretoria");
          return finish("projeto_critico");
        }
        return finish("diagnostico");
      };
      if (typeof window !== "undefined") {
        window.confengeRouteOfferFit = confengeRouteOfferFit;
        window.CONFENGE_OFFER_FIT_MATRIX = CONFENGE_OFFER_FIT_MATRIX;
      }
`;
}

export function browserModulePath(base = root) {
  return path.join(base, "js/modules/offer-fit.js");
}

export function writeBrowserModule(base = root) {
  const matrix = loadOfferFitMatrix(base);
  const dest = browserModulePath(base);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, browserSource(matrix));
  return dest;
}

export function expectedBrowserModule(base = root) {
  return browserSource(loadOfferFitMatrix(base));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv.includes("--write-browser")) {
  const dest = writeBrowserModule();
  console.log("wrote", path.relative(root, dest));
}
