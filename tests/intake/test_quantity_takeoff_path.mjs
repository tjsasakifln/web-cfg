import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  CANONICAL_EXCERPT_REL,
  TRAIL_STEPS,
  injectSampleTrail,
  isTestFixture,
  loadCanonicalExcerpt,
  loadExcerptFromFile,
  renderPendingTrail,
  renderSampleTrail,
  renderTrailForTest,
  trailStepText,
} from "../../quantitativos-orcamento-obras/sample-trail.mjs";

const ROOT = path.resolve(".");
const LANDING = path.resolve("quantitativos-orcamento-obras/index.html");
const FIXTURE = path.resolve("tests/intake/fixtures/quantity-takeoff-trail.fixture.json");
const DECISION_PAGES = [
  {
    job: "documentos-para-levantamento",
    file: "conteudos/documentos-para-levantamento-quantitativos/index.html",
    route: "/conteudos/documentos-para-levantamento-quantitativos/",
    example: /escritório de arquitetura|projeto arquitetônico|plantas incompletas/i,
    criteria: /o que muda o recorte|critério/i,
    send: /envie|enviar|o que enviar|documentos/i,
    expect: /planilha de quantitativos|memória/i,
  },
  {
    job: "comparar-propostas",
    file: "conteudos/comparar-propostas-execucao-obra/index.html",
    route: "/conteudos/comparar-propostas-execucao-obra/",
    example: /duas propostas|mesmo nome de serviço/i,
    criteria: /escopo|unidades|exclusões|quantidades|responsabilidades/i,
    send: /envie|enviar|o que enviar|propostas/i,
    expect: /equalizar|equivalência/i,
  },
  {
    job: "revisar-ou-refazer",
    file: "conteudos/revisar-ou-refazer-orcamento-obra/index.html",
    route: "/conteudos/revisar-ou-refazer-orcamento-obra/",
    example: /orçamento (já )?existente|planilha antiga|orçamento de \d{4}/i,
    criteria: /revisão|refazer|elaborar de novo|quando basta revisar/i,
    send: /envie|enviar|o que enviar|planilha/i,
    expect: /parecer|achados|nova orçamentação|reorçar/i,
  },
];

const FIXTURE_TOKENS = [
  "ALV-VED-14",
  "ALV-01",
  "30,64",
  "30.64",
  "P-12 a P-18",
  "TEST_FIXTURE_NOT_FOR_PUBLICATION",
  "12,40 × 2,80",
];

function read(rel) {
  return fs.readFileSync(path.resolve(rel), "utf8");
}

function visibleMain(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
  return main
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveInternalHref(href, fromFile) {
  const raw = String(href).split("#")[0].split("?")[0];
  if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("https://wa.me")) {
    return { kind: "external-or-fragment", href };
  }
  if (/^https?:\/\//i.test(raw) && !raw.startsWith("https://confenge.com.br/")) {
    return { kind: "external", href };
  }
  let pathname = raw.startsWith("https://confenge.com.br")
    ? raw.slice("https://confenge.com.br".length)
    : raw;
  if (!pathname.startsWith("/")) {
    pathname = path.posix.normalize(
      "/" + path.posix.join(path.posix.dirname(fromFile.replace(/\\/g, "/")), pathname),
    );
  }
  const file = pathname.endsWith("/")
    ? pathname.slice(1) + "index.html"
    : pathname.replace(/^\//, "") + (pathname.endsWith(".html") ? "" : "/index.html");
  return { kind: "internal", href: pathname, file };
}

function assertTrailMatchesExcerpt(html, excerpt) {
  for (const step of TRAIL_STEPS) {
    const text = trailStepText(html, step);
    assert.notEqual(text, "", `missing trail step ${step}`);
  }
  const quantityText = trailStepText(html, "quantity");
  const itemText = trailStepText(html, "spreadsheet_item");
  const calcText = trailStepText(html, "calculation");
  const formatted = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(
    excerpt.quantity.value,
  );
  const lengthFormatted = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(
    excerpt.calculation.inputs[0].value,
  );
  assert.match(quantityText, new RegExp(formatted.replace(".", "\\.")));
  assert.match(itemText, new RegExp(excerpt.spreadsheet_item.code));
  assert.match(itemText, new RegExp(formatted.replace(".", "\\.")));
  assert.match(calcText, new RegExp(lengthFormatted.replace(".", "\\.")));
  assert.match(calcText, /C × H|memória|vão/i);
  assert.match(html, /data-trail-step="element"/);
  assert.match(html, /data-trail-step="criterion"/);
  assert.match(html, /data-trail-step="calculation"/);
  assert.match(html, /data-trail-step="quantity"/);
  assert.match(html, /data-trail-step="spreadsheet_item"/);
}

test("fixture trail renderer produces the five-step chain from the shared excerpt", () => {
  const excerpt = loadExcerptFromFile(FIXTURE);
  assert.equal(isTestFixture(excerpt), true);
  const html = renderTrailForTest(excerpt);
  assertTrailMatchesExcerpt(html, excerpt);
  assert.match(html, /Não é orçamento válido para executar obra/);
});

test("mutating one trail number makes the excerpt assertion fail", () => {
  const excerpt = loadExcerptFromFile(FIXTURE);
  const html = renderTrailForTest(excerpt);
  const mutated = html.replaceAll("30,64", "99,99");
  assert.notEqual(mutated, html);
  assert.throws(
    () => assertTrailMatchesExcerpt(mutated, excerpt),
    /30,64|quantity|match/i,
  );
});

test("public renderer refuses to publish the test fixture", () => {
  const excerpt = loadExcerptFromFile(FIXTURE);
  assert.throws(
    () => renderSampleTrail(excerpt),
    /test fixture/,
  );
});

test("shipped landing does not present the test fixture as a real sample", () => {
  const html = read(LANDING);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
  assert.match(main, /id="qty-sample-trail"/);
  assert.match(main, /data-sample-trail-state="awaiting-canonical-excerpt"/);
  assert.match(main, /Amostra demonstrativa/);
  assert.match(main, /Não é orçamento válido para executar obra/);
  for (const token of FIXTURE_TOKENS) {
    assert.equal(html.includes(token), false, `public HTML leaked fixture token ${token}`);
  }
  const pending = renderPendingTrail();
  assert.equal(main.includes('data-trail-step="element"'), true);
  assert.equal(main.includes('data-trail-step="criterion"'), true);
  assert.equal(main.includes('data-trail-step="calculation"'), true);
  assert.equal(main.includes('data-trail-step="quantity"'), true);
  assert.equal(main.includes('data-trail-step="spreadsheet_item"'), true);
  assert.equal(pending.includes('data-sample-trail-state="awaiting-canonical-excerpt"'), true);
});

test("canonical excerpt is absent or real, never the test fixture", () => {
  const excerpt = loadCanonicalExcerpt(ROOT);
  if (excerpt === null) {
    assert.equal(fs.existsSync(path.resolve(CANONICAL_EXCERPT_REL)), false);
    return;
  }
  assert.equal(isTestFixture(excerpt), false);
  const injected = injectSampleTrail(read(LANDING), excerpt);
  assert.match(injected, /data-sample-trail-state="canonical"/);
});

test("each decision job has a rendered destination with example, criteria, send/expect and service link", () => {
  const landing = read(LANDING);
  for (const page of DECISION_PAGES) {
    const abs = path.resolve(page.file);
    assert.equal(fs.existsSync(abs), true, `missing ${page.file}`);
    const html = fs.readFileSync(abs, "utf8");
    const text = visibleMain(html);
    assert.match(html, /<meta(?=[^>]*name="robots")(?=[^>]*content="index,follow[^\"]*")[^>]*>/);
    assert.match(text, page.example, `${page.job}: missing concrete example`);
    assert.match(text, page.criteria, `${page.job}: missing decision criteria`);
    assert.match(text, page.send, `${page.job}: missing send guidance`);
    assert.match(text, page.expect, `${page.job}: missing expect guidance`);
    const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
    const service = hrefs.find((href) => href.startsWith("/quantitativos-orcamento-obras/"));
    assert.ok(service, `${page.job}: missing service link`);
    const resolved = resolveInternalHref(service, page.file);
    if (resolved.kind === "internal") {
      assert.equal(fs.existsSync(path.resolve(resolved.file)), true, `${page.job}: broken ${resolved.file}`);
    }
    assert.match(landing, new RegExp(page.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const href of hrefs) {
      const target = resolveInternalHref(href, page.file);
      if (target.kind !== "internal") continue;
      if (target.file.startsWith("http")) continue;
      assert.equal(
        fs.existsSync(path.resolve(target.file)),
        true,
        `${page.job}: broken internal href ${href} -> ${target.file}`,
      );
    }
  }
});
