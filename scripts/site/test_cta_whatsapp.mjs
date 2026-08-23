/**
 * Audit main WhatsApp CTAs: correct number + non-empty text param, and gate
 * every SVG path payload the site ships (issue #187).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseSvgPath, extractPathData } from "./svg_path_grammar.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NUMBER = "5548988344559";
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "data/site/whatsapp-messages.json"), "utf8"),
);

const matrix = JSON.parse(
  fs.readFileSync(path.join(root, "data/organic/bofu-intent-matrix.json"), "utf8"),
);
const serviceRows = matrix.rows || [];
const pages = serviceRows.map(({ canonical_service_route }) =>
  `${canonical_service_route.replace(/^\/+|\/+$/g, "")}/index.html`,
);
const frozenBaseline = JSON.parse(
  fs.readFileSync(path.join(root, "data/bofu-dominance/frozen-specs/hashes.json"), "utf8"),
);
const frozenPages = new Set(Object.keys(frozenBaseline.pillars || {}).map((slug) => `${slug}/index.html`));
const constantsSource = fs.readFileSync(
  path.join(root, "scripts/bofu_dominance/frozen_specs/constants.py"),
  "utf8",
);
const safeDateMatch = constantsSource.match(/EARLIEST_SAFE_ACTION_AT\s*=\s*date\((\d+),\s*(\d+),\s*(\d+)\)/);
if (!safeDateMatch) throw new Error("EARLIEST_SAFE_ACTION_AT missing");
const earliestSafeActionAt = `${safeDateMatch[1]}-${safeDateMatch[2].padStart(2, "0")}-${safeDateMatch[3].padStart(2, "0")}`;
const auditDate = process.env.BOFU_GATE_DATE || new Date().toISOString().slice(0, 10);
const genericPrefill = "Olá, Tiago. Gostaria de analisar uma demanda relacionada a licitação, contrato ou obra pública.";
const requiredCatalogKey = new Map([
  ["defesa-tecnica-contratos-publicos/index.html", "sancao_notificacao"],
  ["acompanhamento-contratos-obras/index.html", "contrato_pressao"],
  ["atrasos-prorrogacao-obras-publicas/index.html", "atraso_pagamento"],
]);

const issues = [];
const warnings = [];
const found = [];

for (const rel of pages) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    issues.push({ rel, error: "missing_file" });
    continue;
  }
  const html = fs.readFileSync(full, "utf8");
  const re = /https:\/\/wa\.me\/(\d+)\?text=([^"'\s]+)/g;
  let m;
  let count = 0;
  let genericFound = false;
  while ((m = re.exec(html))) {
    count++;
    const num = m[1];
    const text = decodeURIComponent(m[2]);
    if (num !== NUMBER) issues.push({ rel, error: "wrong_number", num });
    if (!text || text.length < 20) issues.push({ rel, error: "weak_text", text });
    if (text === genericPrefill) genericFound = true;
    const requiredKey = requiredCatalogKey.get(rel);
    if (requiredKey && text !== catalog.messages[requiredKey]) {
      issues.push({ rel, error: "catalog_prefill_mismatch", required_key: requiredKey, text });
    }
    found.push({ rel, num, text_len: text.length });
  }
  if (count === 0) issues.push({ rel, error: "no_wa_link" });
  if (genericFound) {
    const finding = { rel, error: "generic_prefill_on_service_page" };
    if (frozenPages.has(rel) && auditDate < earliestSafeActionAt) warnings.push(finding);
    else issues.push(finding);
  }
}

// Catalog completeness
for (const key of [
  "contrato_pressao",
  "glosa_medicao",
  "aditivo",
  "reequilibrio",
  "atraso_pagamento",
  "sancao_notificacao",
  "edital",
  "orcamento_bdi",
  "proposta",
  "diagnostico_b2g",
  "pseo_conteudo",
]) {
  if (!catalog.messages[key] || catalog.messages[key].length < 20) {
    issues.push({ error: "catalog_missing", key });
  }
}

if (catalog.number_e164 !== NUMBER) issues.push({ error: "catalog_number" });

const SKIP_DIRS = new Set(["node_modules", "_site", ".git", ".venv", "venv", ".worktrees"]);
// Fixture pages carry deliberately broken path data; they are graded by the
// fixture harness below, never by the site-wide scan.
const SVG_FIXTURE_DIR = "scripts/site/fixtures/svg_path";

function walkHtmlFiles(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (rel === SVG_FIXTURE_DIR) continue;
    if (ent.isDirectory()) walkHtmlFiles(full, acc);
    else if (ent.name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

function svgPathCommandsParse(d) {
  return parseSvgPath(d).ok;
}

function hasCorruptNumber(d) {
  return /0\.6\.7/.test(d) || /0 \.6\.7/.test(d) || /\d\.\d+\.\d/.test(d);
}

/**
 * Grammar gate: every `d` payload in a scanned document must parse. Returns the
 * issues found so the same routine grades generated HTML and template sources.
 */
function auditPathData(rel, source) {
  const out = [];
  let checked = 0;
  for (const d of extractPathData(source)) {
    checked += 1;
    const parsed = parseSvgPath(d);
    if (!parsed.ok) {
      out.push({
        rel,
        error: "invalid_svg_path",
        reason: parsed.error,
        index: parsed.index,
        d: d.slice(0, 120),
      });
    }
  }
  return { issues: out, checked };
}

const htmlFiles = walkHtmlFiles(root);
let pathsChecked = 0;
for (const full of htmlFiles) {
  const rel = path.relative(root, full).split(path.sep).join("/");
  const html = fs.readFileSync(full, "utf8");
  const dAttrs = extractPathData(html);
  for (const d of dAttrs) {
    if (d.includes("0.6.7") || d.includes("0 .6.7") || hasCorruptNumber(d)) {
      issues.push({ rel, error: "corrupt_svg_path_number", d: d.slice(0, 80) });
    }
  }
  const audited = auditPathData(rel, html);
  pathsChecked += audited.checked;
  issues.push(...audited.issues);
  const symbols = [
    ...html.matchAll(/<symbol\b[^>]*id="i-whatsapp"[^>]*>([\s\S]*?)<\/symbol>/gi),
  ];
  if (html.includes('href="#i-whatsapp"') && !symbols.length) {
    issues.push({ rel, error: "whatsapp_symbol_missing" });
  }
  for (const sym of symbols) {
    const paths = [...sym[1].matchAll(/<path\b[^>]*\bd="([^"]*)"/gi)].map((m) => m[1]);
    if (!paths.length) issues.push({ rel, error: "whatsapp_path_missing" });
    if (paths.length < 2 || !paths.some((d) => d.startsWith("M8.4 7.7"))) {
      issues.push({ rel, error: "whatsapp_phone_glyph_missing" });
    }
    for (const d of paths) {
      if (!svgPathCommandsParse(d)) {
        issues.push({ rel, error: "whatsapp_path_unparsed", d: d.slice(0, 80) });
      }
      if (!d.includes("M20.5 11.6") && !d.includes("M20.5 11.6".replace(" ", ""))) {
        if (d.startsWith("M8.2 7.7")) {
          issues.push({ rel, error: "whatsapp_inner_scribble" });
        }
      }
    }
  }
}

const pseoShell = fs.readFileSync(path.join(root, "scripts/pseo/html_shell.py"), "utf8");
if (!pseoShell.includes('id="i-whatsapp"') || !pseoShell.includes("M8.4 7.7")) {
  issues.push({ rel: "scripts/pseo/html_shell.py", error: "whatsapp_generator_glyph_missing" });
}

// Templates are the upstream of the generated HTML: a broken glyph here would be
// stamped onto every regenerated page, which is how #187 reached 118 files.
const TEMPLATE_SOURCES = ["scripts/pseo/html_shell.py", "styles.css"];
for (const rel of TEMPLATE_SOURCES) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    issues.push({ rel, error: "template_source_missing" });
    continue;
  }
  const audited = auditPathData(rel, fs.readFileSync(full, "utf8"));
  pathsChecked += audited.checked;
  issues.push(...audited.issues);
}

// Negative fixtures: the gate has to be proven to reject the real defect, and
// the positive control has to be proven to survive it.
const fixtureDir = path.join(root, SVG_FIXTURE_DIR);
const fixtureManifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, "manifest.json"), "utf8"));
const fixtureResults = [];
for (const testCase of fixtureManifest.cases || []) {
  const rel = `${SVG_FIXTURE_DIR}/${testCase.file}`;
  const full = path.join(fixtureDir, testCase.file);
  if (!fs.existsSync(full)) {
    issues.push({ rel, error: "svg_path_fixture_missing", id: testCase.id });
    continue;
  }
  const detected = auditPathData(rel, fs.readFileSync(full, "utf8")).issues;
  const caught = detected.length > 0;
  fixtureResults.push({ id: testCase.id, expect: testCase.expect, caught });
  if (testCase.expect === "invalid" && !caught) {
    issues.push({ rel, error: "svg_path_fixture_not_detected", id: testCase.id });
  }
  if (testCase.expect === "valid" && caught) {
    issues.push({
      rel,
      error: "svg_path_gate_false_positive",
      id: testCase.id,
      reason: detected[0].reason,
      d: detected[0].d,
    });
  }
}
if (!fixtureResults.some((r) => r.expect === "invalid")) {
  issues.push({ rel: SVG_FIXTURE_DIR, error: "svg_path_negative_fixtures_missing" });
}
if (!fixtureResults.some((r) => r.expect === "valid")) {
  issues.push({ rel: SVG_FIXTURE_DIR, error: "svg_path_positive_control_missing" });
}

// Direct grammar regressions cover separators/radii that are easy to weaken
// while refactoring the parser. The extraction cases prove that uppercase and
// unquoted path attributes cannot evade the repository-wide audit.
const parserRegressionCases = [
  { id: "leading-comma", d: "M,0,0", expect: "invalid" },
  { id: "trailing-comma", d: "M0,0,", expect: "invalid" },
  { id: "comma-after-closepath", d: "M0 0Z,", expect: "invalid" },
  { id: "comma-before-command", d: "M0,0L1,1,", expect: "invalid" },
  { id: "negative-arc-rx", d: "M0 0A-1 2 0 0 1 3 4", expect: "invalid" },
  { id: "negative-arc-ry", d: "M0 0A1 -2 0 0 1 3 4", expect: "invalid" },
  { id: "implicit-signed-coordinate", d: "M0-1L.5.5", expect: "valid" },
];
for (const testCase of parserRegressionCases) {
  const parsed = parseSvgPath(testCase.d);
  const accepted = parsed.ok;
  if ((testCase.expect === "valid") !== accepted) {
    issues.push({
      rel: "scripts/site/svg_path_grammar.mjs",
      error: "svg_path_parser_regression",
      id: testCase.id,
      expected: testCase.expect,
      actual: accepted ? "valid" : "invalid",
      reason: parsed.error,
    });
  }
}

const extractionRegressionCases = [
  { id: "uppercase-unquoted", source: "<path D=M,0,0></path>", expected: ["M,0,0"] },
  { id: "lowercase-unquoted", source: "<path d=M0,0></path>", expected: ["M0,0"] },
  { id: "ignore-data-d", source: '<path data-d="M,0,0" d="M0,0"></path>', expected: ["M0,0"] },
  {
    id: "quoted-angle-before-d",
    source: '<path data-note=">" D="M,0,0"></path>',
    expected: ["M,0,0"],
    parse: "invalid",
  },
  {
    id: "fully-percent-encoded-tag",
    source: "%3C%70%61%74%68%20%64%3D%22M0%200%22%3E",
    expected: ["M0 0"],
    parse: "valid",
  },
  {
    id: "fully-percent-encoded-invalid-stays-fail-closed",
    source: "%3Cpath%20d%3D%22M%2C0%2C0%22%3E",
    expected: ["M,0,0"],
    parse: "invalid",
  },
  {
    id: "numeric-html-entity",
    source: '<path d="M0&#32;0"></path>',
    expected: ["M0 0"],
    parse: "valid",
  },
  {
    id: "entity-decode-stays-fail-closed",
    source: '<path d="M0&#44;&#44;0"></path>',
    expected: ["M0,,0"],
    parse: "invalid",
  },
  {
    id: "literal-percent-is-not-url-decoded",
    source: '<path d="M0%200"></path>',
    expected: ["M0%200"],
    parse: "invalid",
  },
  {
    id: "html-entities-decode-once",
    source: '<path d="M0&amp;#32;0"></path>',
    expected: ["M0&#32;0"],
    parse: "invalid",
  },
  {
    id: "ignore-inactive-and-arbitrary-source-text",
    source:
      '<script>const d = "M,0,0"; const x = `<path d="M,0,0">`;</script><!-- <path d="M,0,0"> -->',
    expected: [],
  },
  {
    id: "ignore-percent-encoded-inactive-markup",
    source:
      "%3Cscript%3E%3Cpath%20d%3D%22M%2C0%2C0%22%3E%3C%2Fscript%3E" +
      "%3C%21--%3Cpath%20d%3D%22M%2C0%2C0%22%3E--%3E",
    expected: [],
  },
];
for (const testCase of extractionRegressionCases) {
  const actual = extractPathData(testCase.source);
  if (JSON.stringify(actual) !== JSON.stringify(testCase.expected)) {
    issues.push({
      rel: "scripts/site/svg_path_grammar.mjs",
      error: "svg_path_extraction_regression",
      id: testCase.id,
      expected: testCase.expected,
      actual,
    });
  }
  if (testCase.parse && actual.length === 1) {
    const accepted = parseSvgPath(actual[0]).ok;
    if ((testCase.parse === "valid") !== accepted) {
      issues.push({
        rel: "scripts/site/svg_path_grammar.mjs",
        error: "svg_path_extracted_value_regression",
        id: testCase.id,
        expected: testCase.parse,
        actual: accepted ? "valid" : "invalid",
      });
    }
  }
}

const out = {
  ok: issues.length === 0,
  found: found.length,
  service_pages: pages.length,
  html_scanned: htmlFiles.length,
  svg_paths_checked: pathsChecked,
  svg_path_fixtures: fixtureResults,
  svg_path_parser_regressions: parserRegressionCases.length,
  svg_path_extraction_regressions: extractionRegressionCases.length,
  earliest_safe_action_at: earliestSafeActionAt,
  audit_date: auditDate,
  warnings,
  issues,
};
fs.mkdirSync(path.join(root, "docs/evidence/inbound-10"), { recursive: true });
fs.writeFileSync(
  path.join(root, "docs/evidence/inbound-10/cta-audit.json"),
  JSON.stringify(out, null, 2),
);

if (issues.length) {
  console.error("CTA_AUDIT_FAIL", JSON.stringify(issues, null, 2));
  process.exit(1);
}
console.log(
  "CTA_AUDIT_OK",
  JSON.stringify({
    found: found.length,
    service_pages: pages.length,
    warnings: warnings.length,
    html_scanned: htmlFiles.length,
    svg_paths_checked: pathsChecked,
    svg_path_fixtures: fixtureResults.length,
  }),
);
