/**
 * Build-time excerpt renderer for the quantity-takeoff sample trail.
 *
 * The canonical numbers live in the INB-06 demonstrative. This module turns
 * that excerpt into HTML so the same figures are not copied by hand. Tests
 * feed a fixture; the public page must not publish that fixture.
 */
import fs from "node:fs";
import path from "node:path";

export const EXCERPT_SCHEMA = "confenge.quantity-takeoff-excerpt/1.0";
export const CANONICAL_EXCERPT_REL =
  "casos/demonstrativo-quantitativos-orcamento/excerpt.v1.json";
export const TRAIL_STEPS = Object.freeze([
  "element",
  "criterion",
  "calculation",
  "quantity",
  "spreadsheet_item",
]);
export const SLOT_ID = "qty-sample-trail";
export const TEST_FIXTURE_STATUS = "TEST_FIXTURE_NOT_FOR_PUBLICATION";

const STEP_LABELS = {
  element: "Elemento identificado",
  criterion: "Critério de medição",
  calculation: "Cálculo",
  quantity: "Quantidade",
  spreadsheet_item: "Item de planilha",
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
  return path.resolve(root, CANONICAL_EXCERPT_REL);
}

export function loadExcerptFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const excerpt = JSON.parse(raw);
  assertExcerpt(excerpt);
  return excerpt;
}

export function loadCanonicalExcerpt(root = process.cwd()) {
  const filePath = canonicalExcerptPath(root);
  if (!fs.existsSync(filePath)) return null;
  const excerpt = loadExcerptFromFile(filePath);
  if (isTestFixture(excerpt)) {
    throw new Error("canonical excerpt must not be a test fixture");
  }
  return excerpt;
}

export function assertExcerpt(excerpt) {
  if (!excerpt || excerpt.schema !== EXCERPT_SCHEMA) {
    throw new Error(`excerpt schema must be ${EXCERPT_SCHEMA}`);
  }
  for (const step of TRAIL_STEPS) {
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
  const id = step.id ? `<code data-trail-id="${escapeHtml(step.id)}">${escapeHtml(step.id)}</code> ` : "";
  return `${id}<strong>${name}</strong><span>Origem: ${source}</span>`;
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

const STEP_RENDERERS = {
  element: renderElement,
  criterion: renderCriterion,
  calculation: renderCalculation,
  quantity: renderQuantity,
  spreadsheet_item: renderSpreadsheetItem,
};

export function renderPendingTrail() {
  return [
    `<div id="${SLOT_ID}" data-sample-trail-slot="canonical" data-sample-trail-state="awaiting-canonical-excerpt">`,
    '<p class="qty-trail-disclaimer">Amostra demonstrativa. Não é orçamento válido para executar obra, não representa cliente e não fecha preço, prazo ou quantidade contratual.</p>',
    '<ol class="qty-trail-steps">',
    ...TRAIL_STEPS.map((step, index) => {
      const n = String(index + 1).padStart(2, "0");
      const body = {
        element: "O recorte do projeto — parede, laje, tubulação, serviço — fica identificado com a planta, o memorial ou o documento que o originou.",
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
  if (!excerpt) return renderPendingTrail();
  assertExcerpt(excerpt);
  if (isTestFixture(excerpt)) {
    throw new Error("refusing to render a test fixture as a public sample");
  }
  const disclaimer = escapeHtml(
    excerpt.disclaimer
      || "Amostra demonstrativa. Não é orçamento válido para executar obra.",
  );
  const items = TRAIL_STEPS.map((step, index) => {
    const n = String(index + 1).padStart(2, "0");
    const inner = STEP_RENDERERS[step](excerpt[step]);
    return `<li data-trail-step="${step}"><span class="qty-trail-n">${n}</span><h3>${STEP_LABELS[step]}</h3><div class="qty-trail-body">${inner}</div></li>`;
  });
  return [
    `<div id="${SLOT_ID}" data-sample-trail-slot="canonical" data-sample-trail-state="canonical">`,
    `<p class="qty-trail-disclaimer">${disclaimer}</p>`,
    '<ol class="qty-trail-steps">',
    ...items,
    "</ol>",
    "</div>",
  ].join("");
}

/** Render a trail for tests only. Never write this HTML into a public page. */
export function renderTrailForTest(excerpt) {
  assertExcerpt(excerpt);
  const disclaimer = escapeHtml(
    excerpt.disclaimer
      || "Amostra demonstrativa de teste. Não é orçamento válido para executar obra.",
  );
  const items = TRAIL_STEPS.map((step, index) => {
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

const SLOT_RE = /<div\b[^>]*\bid=["']qty-sample-trail["'][^>]*>[\s\S]*?<\/div>/i;

export function injectSampleTrail(pageHtml, excerpt) {
  const fragment = renderSampleTrail(excerpt);
  if (!SLOT_RE.test(pageHtml)) {
    throw new Error("page HTML is missing #qty-sample-trail slot");
  }
  return pageHtml.replace(SLOT_RE, fragment);
}

export function trailStepText(html, step) {
  const match = html.match(
    new RegExp(`<li\\b[^>]*data-trail-step=["']${step}["'][^>]*>([\\s\\S]*?)</li>`, "i"),
  );
  if (!match) return "";
  return match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
