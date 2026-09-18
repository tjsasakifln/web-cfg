/**
 * Build-time renderer for the two summarized proof entrances of the
 * quantity-takeoff and budgeting route (campaign ORC-B2B-20260913).
 *
 * The landing page must let a buyer recognize the delivery in the two objects
 * the market actually asks about, edificação and infraestrutura, without
 * reproducing either demonstrative page inside the landing. Every number and
 * identifier here is read from the canonical descriptors of the two pilots:
 *
 *   data/demonstrative/private-project-pilot/{source,consumption}.v1.json
 *   data/demonstrative/infrastructure-pilot/{source,consumption}.v1.json
 *
 * Nothing is retyped by hand. A geometry or criteria change in the pilots
 * requires regenerating them and recomposing this slot; a missing public CSV
 * or demonstrative page fails closed instead of publishing a promise.
 */
import fs from "node:fs";
import path from "node:path";

export const ENTRANCES_SCHEMA = "confenge.quantity-proof-entrances/1.0";
// `data-proof-id` is reserved for a REGISTERED REAL CLIENT PROOF and is policed
// by tests/commercial/test_real_proof_registry.mjs. These entrances are
// demonstrative method excerpts with no client behind them, so they carry
// `data-demonstrative-id` and must never claim the reserved marker.
export const SLOT_ID = "qty-proof-entrances";
export const SLOT_MARK_START = "<!--orc-b2b-20260913:proof-entrances-->";
export const SLOT_MARK_END = "<!--/orc-b2b-20260913:proof-entrances-->";

/**
 * One entrance per published pilot. `quantity_id` names the row whose memory
 * the entrance shows; the budget row is found by that id, never assumed.
 */
export const ENTRANCE_SPECS = Object.freeze([
  Object.freeze({
    key: "edificacao",
    domain_pt_br: "Edificação",
    buyer_pt_br:
      "Construtora, escritório de projeto, incorporadora ou proprietário que vai orçar, comparar propostas ou conferir a planilha de uma edificação.",
    source_rel: "data/demonstrative/private-project-pilot/source.v1.json",
    consumption_rel: "data/demonstrative/private-project-pilot/consumption.v1.json",
    csv_rels: Object.freeze([
      "casos/demonstrativo-projeto-privado/data/quantitativos.csv",
      "casos/demonstrativo-projeto-privado/data/orcamento.csv",
      "casos/demonstrativo-projeto-privado/data/coordenacao.csv",
      "casos/demonstrativo-projeto-privado/data/revisao.csv",
    ]),
    quantity_id: "Q-PAR-01",
    criterion_key: "opening_deduction_rule_pt_br",
  }),
  Object.freeze({
    key: "infraestrutura",
    domain_pt_br: "Infraestrutura",
    buyer_pt_br:
      "Construtora, empresa de engenharia, loteador ou contratante público que vai orçar ou conferir pavimento, drenagem e obras lineares.",
    source_rel: "data/demonstrative/infrastructure-pilot/source.v1.json",
    consumption_rel: "data/demonstrative/infrastructure-pilot/consumption.v1.json",
    csv_rels: Object.freeze([
      "casos/demonstrativo-infraestrutura/data/quantitativos.csv",
      "casos/demonstrativo-infraestrutura/data/orcamento.csv",
      "casos/demonstrativo-infraestrutura/data/coordenacao.csv",
      "casos/demonstrativo-infraestrutura/data/revisao.csv",
    ]),
    quantity_id: "Q-SUB-01",
    criterion_key: "layer_volume_rule_pt_br",
  }),
]);

const UNIT_LABELS = Object.freeze({ m: "m", m2: "m²", m3: "m³", un: "un" });

function capitalize(text) {
  const value = String(text ?? "");
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function unitLabel(unit) {
  return UNIT_LABELS[unit] || String(unit ?? "");
}

/**
 * Keep the decimal places the canonical descriptor declares: "42.00" is a
 * measured volume, not the integer 42, and the engineering reading depends on
 * that precision.
 */
export function formatNumber(value) {
  const raw = String(value ?? "").trim();
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: Math.min(decimals, 4),
    maximumFractionDigits: Math.max(Math.min(decimals, 4), 0),
  }).format(numeric);
}

/**
 * A takeoff formula is only publishable when it is plain arithmetic. Anything
 * with function calls or comparison operators is machine notation, not a
 * memory a buyer can read, and must stay in the demonstrative page.
 */
export function readableFormula(formula) {
  const raw = String(formula ?? "").trim();
  if (!raw || !/^[0-9.*+\-/() ]+$/.test(raw)) return null;
  return raw
    .replace(/\*/g, " × ")
    .replace(/\//g, " ÷ ")
    .replace(/(\d+)\.(\d+)/g, "$1,$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function criterionText(source, criterionKey) {
  const criteria = source && source.takeoff_criteria;
  const value = criteria && criteria[criterionKey];
  if (!value || typeof value !== "string") {
    throw new Error(`proof_entrance_criterion_missing:${criterionKey}`);
  }
  return value;
}

export function requiredInputPaths(root = process.cwd()) {
  const rels = [];
  for (const spec of ENTRANCE_SPECS) {
    rels.push(spec.source_rel, spec.consumption_rel, ...spec.csv_rels);
  }
  return rels.map((rel) => path.resolve(root, rel));
}

export function missingRequiredInputs(root = process.cwd()) {
  return requiredInputPaths(root).filter((filePath) => !fs.existsSync(filePath));
}

export function assertRequiredInputs(root = process.cwd()) {
  const missing = missingRequiredInputs(root);
  if (missing.length) {
    const rels = missing.map((filePath) => path.relative(root, filePath) || filePath);
    throw new Error(`required_proof_entrance_input_missing:${rels.join(",")}`);
  }
}

/**
 * The bathroom pilot has no `cut_pt_br`; its recorte is stated by the canonical
 * room geometry instead of a retyped sentence.
 */
function cutText(source, consumption) {
  if (consumption.cut_pt_br) return consumption.cut_pt_br;
  if (source.cut_pt_br) return source.cut_pt_br;
  const room = source.room;
  if (room && room.interior_length_m && room.interior_width_m && room.ceiling_height_m) {
    return `Um ambiente de ${formatNumber(room.interior_length_m)} m por ${formatNumber(room.interior_width_m)} m, com pé-direito de ${formatNumber(room.ceiling_height_m)} m, paredes, aberturas e critério de medição declarados. Não é projeto executivo nem orçamento para executar obra.`;
  }
  throw new Error(`proof_entrance_cut_unavailable:${consumption.proof_id || "unknown"}`);
}

export function buildEntrance(spec, root = process.cwd()) {
  const source = JSON.parse(fs.readFileSync(path.resolve(root, spec.source_rel), "utf8"));
  const consumption = JSON.parse(
    fs.readFileSync(path.resolve(root, spec.consumption_rel), "utf8"),
  );
  if (consumption.schema !== "confenge.demonstrative-sample-descriptor/1.0") {
    throw new Error(`proof_entrance_consumption_schema_invalid:${spec.key}`);
  }
  const quantity = (consumption.quantity_rows || []).find((row) => row.id === spec.quantity_id);
  if (!quantity) {
    throw new Error(`proof_entrance_quantity_row_missing:${spec.key}:${spec.quantity_id}`);
  }
  const budget = (consumption.budget_rows || []).find(
    (row) => row.quantity_id === spec.quantity_id,
  );
  if (!budget) {
    throw new Error(`proof_entrance_budget_row_missing:${spec.key}:${spec.quantity_id}`);
  }
  if (Number(budget.quantity) !== Number(quantity.quantity)) {
    throw new Error(`proof_entrance_quantity_diverges:${spec.key}:${spec.quantity_id}`);
  }
  if (!consumption.url) {
    throw new Error(`proof_entrance_url_missing:${spec.key}`);
  }
  const csvAssets = (consumption.assets || []).filter((asset) => asset.type === "csv");
  for (const rel of spec.csv_rels) {
    if (!csvAssets.some((asset) => asset.path === rel)) {
      throw new Error(`proof_entrance_csv_not_declared:${spec.key}:${rel}`);
    }
  }
  return {
    schema: ENTRANCES_SCHEMA,
    key: spec.key,
    domain_pt_br: spec.domain_pt_br,
    buyer_pt_br: spec.buyer_pt_br,
    proof_id: consumption.proof_id,
    title: source.title,
    label_pt_br: consumption.label_pt_br,
    cut_pt_br: cutText(source, consumption),
    url: consumption.url,
    quantitativos_anchor: `${consumption.url}#quantitativos`,
    orcamento_anchor: `${consumption.url}#orcamento`,
    sheet_ref: quantity.sheet_ref,
    criterion_pt_br: criterionText(source, spec.criterion_key),
    formula: readableFormula(quantity.formula),
    quantity_id: quantity.id,
    quantity_value: quantity.quantity,
    quantity_unit: quantity.unit,
    budget_id: budget.id,
    price_class: budget.price_class,
    csv: spec.csv_rels.map((rel) => {
      const asset = csvAssets.find((candidate) => candidate.path === rel);
      return { url: asset.url, label: csvLabel(rel) };
    }),
  };
}

function csvLabel(rel) {
  const name = path.basename(rel, ".csv");
  return (
    {
      quantitativos: "quantitativos.csv",
      orcamento: "orcamento.csv",
      coordenacao: "coordenacao.csv",
      revisao: "revisao.csv",
    }[name] || `${name}.csv`
  );
}

export function loadEntrances(root = process.cwd()) {
  assertRequiredInputs(root);
  return ENTRANCE_SPECS.map((spec) => buildEntrance(spec, root));
}

function renderEntrance(entrance) {
  const unit = unitLabel(entrance.quantity_unit);
  const quantity = formatNumber(entrance.quantity_value);
  // Owner decision 2026-09-18 (CONFENGE-LAPIDACAO-COMERCIAL-20260918): the
  // visible label "Exemplo demonstrativo" identifies the card on its own; no
  // negative restatement ("não representa cliente...") follows it. The
  // hypothetical-price qualifier lives once, next to the price table of the
  // demonstrative page the card links to (tests/campaigns/orc-b2b-20260913
  // pin the visible label per card and the qualifier at that table).
  const label = capitalize(entrance.label_pt_br);
  return [
    `<article class="qty-proof-entrance" data-proof-entrance="${escapeHtml(entrance.key)}" data-demonstrative-id="${escapeHtml(entrance.proof_id)}">`,
    `<p class="eyebrow">${escapeHtml(label)} · ${escapeHtml(entrance.domain_pt_br)}</p>`,
    `<h3>${escapeHtml(entrance.title)}</h3>`,
    `<p>${escapeHtml(entrance.buyer_pt_br)}</p>`,
    `<p class="qty-proof-cut">${escapeHtml(entrance.cut_pt_br)}</p>`,
    '<dl class="qty-proof-chain">',
    `<dt>Desenho</dt><dd><code>${escapeHtml(entrance.sheet_ref)}</code></dd>`,
    `<dt>Critério</dt><dd>${escapeHtml(entrance.criterion_pt_br)}</dd>`,
    entrance.formula
      ? `<dt>Memória</dt><dd><data data-proof-formula="${escapeHtml(entrance.formula)}">${escapeHtml(entrance.formula)} = ${escapeHtml(quantity)} ${escapeHtml(unit)}</data></dd>`
      : "",
    `<dt>Quantidade</dt><dd><code>${escapeHtml(entrance.quantity_id)}</code> <data data-proof-quantity="${escapeHtml(entrance.quantity_value)}" value="${escapeHtml(entrance.quantity_value)}">${escapeHtml(quantity)} ${escapeHtml(unit)}</data></dd>`,
    `<dt>Item de planilha</dt><dd><code data-proof-item="${escapeHtml(entrance.budget_id)}">${escapeHtml(entrance.budget_id)}</code></dd>`,
    "</dl>",
    `<p class="qty-proof-links"><a class="button button-secondary" href="${escapeHtml(entrance.quantitativos_anchor)}">Abrir o exemplo de ${escapeHtml(entrance.domain_pt_br.toLowerCase())}</a></p>`,
    `<p class="qty-proof-files">Arquivos abertos deste recorte: ${entrance.csv
      .map(
        (file) =>
          `<a href="${escapeHtml(file.url)}" aria-label="${escapeHtml(file.label)} do recorte de ${escapeHtml(entrance.domain_pt_br.toLowerCase())}">${escapeHtml(file.label)}</a>`,
      )
      .join(", ")}.</p>`,
    "</article>",
  ].join("");
}

export function renderProofEntrances(entrances) {
  if (!Array.isArray(entrances) || entrances.length !== ENTRANCE_SPECS.length) {
    throw new Error("proof_entrances_required");
  }
  for (const entrance of entrances) {
    if (!entrance || entrance.schema !== ENTRANCES_SCHEMA) {
      throw new Error(`proof_entrance_schema_invalid:${entrance && entrance.key}`);
    }
  }
  return [
    `${SLOT_MARK_START}<div id="${SLOT_ID}" data-proof-entrances-slot="canonical" data-proof-entrances-state="canonical">`,
    '<div class="qty-proof-grid">',
    ...entrances.map((entrance) => renderEntrance(entrance)),
    "</div>",
    `</div>${SLOT_MARK_END}`,
  ].join("");
}

const SLOT_RE = new RegExp(
  `${SLOT_MARK_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${SLOT_MARK_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
  "i",
);

export function injectProofEntrances(pageHtml, entrances) {
  const fragment = renderProofEntrances(entrances);
  if (!SLOT_RE.test(pageHtml)) {
    throw new Error(`page HTML is missing #${SLOT_ID} slot`);
  }
  return pageHtml.replace(SLOT_RE, fragment);
}
