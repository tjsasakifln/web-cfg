/**
 * Build-time excerpt renderer for the quantity-takeoff sample trail.
 *
 * Canonical numbers come from the private-project demonstrative
 * (source.v1.json → derive → consumption.v1.json). Tests may feed a fixture;
 * the public page must not publish that fixture and must not ship a
 * future-promise placeholder when the demonstrative exists.
 */
import fs from "node:fs";
import path from "node:path";

export const EXCERPT_SCHEMA = "confenge.quantity-takeoff-excerpt/1.0";
export const CONSUMPTION_REL =
  "data/demonstrative/private-project-pilot/consumption.v1.json";
export const SOURCE_REL =
  "data/demonstrative/private-project-pilot/source.v1.json";
export const REQUIRED_CSV_RELS = Object.freeze([
  "casos/demonstrativo-projeto-privado/data/quantitativos.csv",
  "casos/demonstrativo-projeto-privado/data/orcamento.csv",
  "casos/demonstrativo-projeto-privado/data/revisao.csv",
  "casos/demonstrativo-projeto-privado/data/coordenacao.csv",
]);
/** @deprecated phantom path from INB-03; do not write a second number source here. */
export const CANONICAL_EXCERPT_REL =
  "casos/demonstrativo-quantitativos-orcamento/excerpt.v1.json";
export const TRAIL_STEPS = Object.freeze([
  "element",
  "criterion",
  "calculation",
  "quantity",
  "spreadsheet_item",
  "review_reference",
]);
export const SLOT_ID = "qty-sample-trail";
export const SLOT_MARK_START = "<!--pos-inb-02:qty-trail-->";
export const SLOT_MARK_END = "<!--/pos-inb-02:qty-trail-->";
export const TEST_FIXTURE_STATUS = "TEST_FIXTURE_NOT_FOR_PUBLICATION";

const STEP_LABELS = {
  element: "Elemento identificado",
  criterion: "Critério de medição",
  calculation: "Cálculo",
  quantity: "Quantidade",
  spreadsheet_item: "Item de planilha",
  review_reference: "Referência de revisão",
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isTestFixture(excerpt) {
  return Boolean(excerpt) && excerpt.status === TEST_FIXTURE_STATUS;
}

export function canonicalExcerptPath(root = process.cwd()) {
  return path.resolve(root, CONSUMPTION_REL);
}

export function requiredInputPaths(root = process.cwd()) {
  return [
    path.resolve(root, SOURCE_REL),
    path.resolve(root, CONSUMPTION_REL),
    ...REQUIRED_CSV_RELS.map((rel) => path.resolve(root, rel)),
  ];
}

export function missingRequiredInputs(root = process.cwd()) {
  return requiredInputPaths(root).filter((filePath) => !fs.existsSync(filePath));
}

export function assertRequiredInputs(root = process.cwd()) {
  const missing = missingRequiredInputs(root);
  if (missing.length) {
    const rels = missing.map((filePath) => path.relative(root, filePath) || filePath);
    throw new Error(`required_demonstrative_input_missing:${rels.join(",")}`);
  }
}

export function loadExcerptFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const excerpt = JSON.parse(raw);
  assertExcerpt(excerpt);
  return excerpt;
}

export function excerptFromConsumption(consumption) {
  if (!consumption || consumption.schema !== "confenge.demonstrative-sample-descriptor/1.0") {
    throw new Error("consumption_schema_invalid");
  }
  const excerpt = consumption.sample_trail;
  if (!excerpt) {
    throw new Error("consumption_missing_sample_trail");
  }
  assertExcerpt(excerpt);
  if (isTestFixture(excerpt)) {
    throw new Error("canonical excerpt must not be a test fixture");
  }
  const qty = (consumption.quantity_rows || []).find((row) => row.id === excerpt.quantity_id);
  if (!qty) {
    throw new Error("sample_trail_quantity_not_in_consumption");
  }
  if (Number(qty.quantity) !== Number(excerpt.quantity.value)) {
    throw new Error("sample_trail_quantity_diverges_from_consumption");
  }
  return excerpt;
}

export function loadCanonicalExcerpt(root = process.cwd()) {
  assertRequiredInputs(root);
  const consumption = JSON.parse(fs.readFileSync(canonicalExcerptPath(root), "utf8"));
  return excerptFromConsumption(consumption);
}

export function assertExcerpt(excerpt) {
  if (!excerpt || excerpt.schema !== EXCERPT_SCHEMA) {
    throw new Error(`excerpt schema must be ${EXCERPT_SCHEMA}`);
  }
  const required = isTestFixture(excerpt)
    ? TRAIL_STEPS.filter((step) => step !== "review_reference")
    : TRAIL_STEPS;
  for (const step of required) {
    if (!excerpt[step] || typeof excerpt[step] !== "object") {
      throw new Error(`excerpt missing step: ${step}`);
    }
  }
  if (excerpt.quantity?.value == null || excerpt.quantity?.unit == null) {
    throw new Error("excerpt.quantity needs value and unit");
  }
  if (!excerpt.spreadsheet_item?.code || excerpt.spreadsheet_item?.quantity == null) {
    throw new Error("excerpt.spreadsheet_item needs code and quantity");
  }
}

function formatNumber(value) {
  if (typeof value === "number") {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value);
  }
  return String(value);
}

function renderElement(step) {
  const name = escapeHtml(step.name);
  const source = escapeHtml(step.source);
  const location = step.location
    ? `<span data-trail-location="true">Localização no desenho: ${escapeHtml(step.location)}</span>`
    : "";
  const id = step.id ? `<code data-trail-id="${escapeHtml(step.id)}">${escapeHtml(step.id)}</code> ` : "";
  return `${id}<strong>${name}</strong><span>Origem: ${source}</span>${location}`;
}

function renderCriterion(step) {
  const unit = escapeHtml(step.unit);
  const rule = escapeHtml(step.rule);
  return `<strong>Unidade: ${unit}</strong><span>${rule}</span>`;
}

function renderCalculation(step) {
  const formula = escapeHtml(step.formula);
  const memory = escapeHtml(step.memory);
  const inputs = Array.isArray(step.inputs)
    ? `<p class="qty-trail-inputs">${step.inputs
        .map((input) => {
          const value = formatNumber(input.value);
          return `<span>${escapeHtml(input.label)} <data value="${escapeHtml(value)}">${escapeHtml(value)} ${escapeHtml(input.unit || "")}</data></span>`;
        })
        .join(" · ")}</p>`
    : "";
  return `<strong>${formula}</strong>${inputs}<span data-trail-memory="true">${memory}</span>`;
}

function renderQuantity(step) {
  const value = formatNumber(step.value);
  const unit = escapeHtml(step.unit);
  return `<data data-trail-quantity="${escapeHtml(value)}" value="${escapeHtml(value)}">${escapeHtml(value)} ${unit}</data>`;
}

function renderSpreadsheetItem(step) {
  const code = escapeHtml(step.code);
  const description = escapeHtml(step.description);
  const unit = escapeHtml(step.unit);
  const quantity = formatNumber(step.quantity);
  return `<code data-trail-item-code="${code}">${code}</code> <span>${description}</span> <data data-trail-item-quantity="${escapeHtml(quantity)}" value="${escapeHtml(quantity)}">${escapeHtml(quantity)} ${unit}</data>`;
}

function renderReviewReference(step) {
  const id = step.id ? `<code data-trail-review-id="${escapeHtml(step.id)}">${escapeHtml(step.id)}</code> ` : "";
  const doc = step.document_ref
    ? `<span>Documento ${escapeHtml(step.document_ref)}</span>`
    : "";
  const href = step.href
    ? `<a href="${escapeHtml(step.href)}">${escapeHtml(step.text || step.label || "Ver a revisão")}</a>`
    : `<span>${escapeHtml(step.text || "")}</span>`;
  return `${id}${href}${doc}`;
}

const STEP_RENDERERS = {
  element: renderElement,
  criterion: renderCriterion,
  calculation: renderCalculation,
  quantity: renderQuantity,
  spreadsheet_item: renderSpreadsheetItem,
  review_reference: renderReviewReference,
};

export function renderPendingTrail() {
  return [
    `<div id="${SLOT_ID}" data-sample-trail-slot="canonical" data-sample-trail-state="awaiting-canonical-excerpt">`,
    '<p class="qty-trail-disclaimer">Amostra demonstrativa. Não é orçamento válido para executar obra, não representa cliente e não fecha preço, prazo ou quantidade contratual.</p>',
    '<ol class="qty-trail-steps">',
    ...TRAIL_STEPS.map((step, index) => {
      const n = String(index + 1).padStart(2, "0");
      const body = {
        element: "O recorte do projeto, parede, laje, tubulação, serviço, fica identificado com a planta, o memorial ou o documento que o originou.",
        criterion: "A unidade e a regra de medição usadas na leitura, inclusive o que entra e o que fica de fora.",
        calculation: "A memória conferível: fórmula, dimensões lidas e descontos aplicados.",
        quantity: "O resultado da memória, na unidade do critério, ainda sem preço.",
        spreadsheet_item: "O item da planilha ou do orçamento que recebe essa quantidade, com código e descrição equivalentes ao recorte.",
      }[step];
      return `<li data-trail-step="${step}"><span class="qty-trail-n">${n}</span><h3>${STEP_LABELS[step]}</h3><p>${body}</p></li>`;
    }),
    "</ol>",
    "<p>Os números conferíveis desta trilha entram aqui quando o demonstrativo canônico da CONFENGE estiver publicado. Até lá, o método já é este: elemento, critério, cálculo, quantidade e item de planilha.</p>",
    "</div>",
  ].join("");
}

export function renderSampleTrail(excerpt) {
  if (!excerpt) {
    throw new Error("canonical_excerpt_required");
  }
  assertExcerpt(excerpt);
  if (isTestFixture(excerpt)) {
    throw new Error("refusing to render a test fixture as a public sample");
  }
  const disclaimer = escapeHtml(
    excerpt.disclaimer
      || "Amostra demonstrativa. Não é orçamento válido para executar obra, não é preço da CONFENGE e não é SINAPI real.",
  );
  const items = TRAIL_STEPS.map((step, index) => {
    const n = String(index + 1).padStart(2, "0");
    const inner = STEP_RENDERERS[step](excerpt[step]);
    return `<li data-trail-step="${step}"><span class="qty-trail-n">${n}</span><h3>${STEP_LABELS[step]}</h3><div class="qty-trail-body">${inner}</div></li>`;
  });
  const demoHref = escapeHtml(
    excerpt.demonstrative_href || excerpt.demonstrative_url || "/casos/demonstrativo-projeto-privado/",
  );
  return [
    `${SLOT_MARK_START}<div id="${SLOT_ID}" data-sample-trail-slot="canonical" data-sample-trail-state="canonical">`,
    `<p class="qty-trail-disclaimer">${disclaimer}</p>`,
    '<ol class="qty-trail-steps">',
    ...items,
    "</ol>",
    `<p class="qty-trail-link">Os números desta trilha saem do <a href="${demoHref}">exemplo demonstrativo do recorte de banheiro</a>. Preços hipotéticos daquele recorte não são preço do serviço nem SINAPI real.</p>`,
    `</div>${SLOT_MARK_END}`,
  ].join("");
}

/** Render a trail for tests only. Never write this HTML into a public page. */
export function renderTrailForTest(excerpt) {
  assertExcerpt(excerpt);
  const disclaimer = escapeHtml(
    excerpt.disclaimer
      || "Amostra demonstrativa de teste. Não é orçamento válido para executar obra.",
  );
  const steps = TRAIL_STEPS.filter((step) => excerpt[step]);
  const items = steps.map((step, index) => {
    const n = String(index + 1).padStart(2, "0");
    const inner = STEP_RENDERERS[step](excerpt[step]);
    return `<li data-trail-step="${step}"><span class="qty-trail-n">${n}</span><h3>${STEP_LABELS[step]}</h3><div class="qty-trail-body">${inner}</div></li>`;
  });
  return [
    `<div id="${SLOT_ID}" data-sample-trail-slot="test" data-sample-trail-state="test-fixture">`,
    `<p class="qty-trail-disclaimer">${disclaimer}</p>`,
    '<ol class="qty-trail-steps">',
    ...items,
    "</ol>",
    "</div>",
  ].join("");
}

const SLOT_RE = /<!--pos-inb-02:qty-trail-->[\s\S]*?<!--\/pos-inb-02:qty-trail-->/i;
const LEGACY_SLOT_RE = /<div\b[^>]*\bid=["']qty-sample-trail["'][^>]*>[\s\S]*?<\/div>/i;

export function injectSampleTrail(pageHtml, excerpt) {
  if (!excerpt) {
    throw new Error("canonical_excerpt_required");
  }
  const fragment = renderSampleTrail(excerpt);
  if (SLOT_RE.test(pageHtml)) {
    return pageHtml.replace(SLOT_RE, fragment);
  }
  if (LEGACY_SLOT_RE.test(pageHtml)) {
    return pageHtml.replace(LEGACY_SLOT_RE, fragment);
  }
  throw new Error("page HTML is missing #qty-sample-trail slot");
}

export function trailStepText(html, step) {
  const match = html.match(
    new RegExp(`<li\\b[^>]*data-trail-step=["']${step}["'][^>]*>([\\s\\S]*?)</li>`, "i"),
  );
  if (!match) return "";
  return match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
