/**
 * Guards for the #494 comparison: fixed content, isolation, and a decision
 * that stays re-derivable from the evidence it was taken on.
 *
 * These run offline. The browser measurements live in
 * `docs/design-audit/evidence/direction-probe.json`, written by
 * `scripts/site/design_direction_probe.mjs`; what is asserted here is that the
 * committed evidence still says what the recorded decision claims it says, so
 * the outcome in `DECISION_RULE_494_PRE_REGISTERED.md` §6 cannot drift away
 * from the numbers underneath it.
 *
 * Usage: node --test scripts/site/test_design_direction.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { build, loadContent, revisionState, VARIANTS } from "./build_design_prototypes.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PROTOTYPES = join(ROOT, "docs/design-audit/prototypes");
const EVIDENCE = join(ROOT, "docs/design-audit/evidence");
const RULE = join(ROOT, "docs/design-audit/DECISION_RULE_494_PRE_REGISTERED.md");

/**
 * The #494 subtree, where "zero @font-face" is a measured fact of that
 * comparison rather than a site-wide rule.
 *
 * #494 compared two provenance mechanisms under one fixed palette and one
 * fixed type stack: neither candidate proposed a webfont, the specimen page
 * says so in prose, and the budget it was measured against was
 * `font_files_max: 0`. Asserting the absence of `@font-face` across every
 * future prototype would make that campaign's finding a constitution.
 * Campaigns that are allowed to propose type — the 2026-08-30 breakthrough
 * canary is — keep every other guarantee here and gain one: a declared
 * `@font-face` must resolve to a versioned file inside this repository.
 */
const LEGACY_494 = ["a-trilho-de-memoria", "b-estado-de-revisao"].map((slug) =>
  join(PROTOTYPES, slug),
);
const isLegacy494 = (path) =>
  LEGACY_494.some((dir) => path.startsWith(dir + sep)) ||
  path === join(PROTOTYPES, "base.css") ||
  path === join(PROTOTYPES, "fixed-content.json");

const content = loadContent();

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const readText = (path) => readFileSync(path, "utf8");

/**
 * Visible text of a prototype page.
 *
 * Two deliberate choices, both to keep this a text comparison and not a
 * half-written HTML parser:
 *
 *  - No `<script>`/`<style>` stripping. A regex that tries to match those two
 *    elements is wrong on `<script >`, on `</script\n>` and on a comment that
 *    contains either word — and it is unnecessary here, because
 *    `test_prototype_has_no_inline_script_or_style` asserts the prototypes
 *    contain neither. Assert the absence; do not paper over it.
 *  - Entities are decoded in **one pass** through a table. Chained replaces
 *    turn `&amp;lt;` into `<`, which is the double-escaping defect: text that
 *    escaped a literal `&lt;` would come back as a tag.
 */
const ENTITIES = Object.freeze({
  "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&#39;": "'",
});
const stripTags = (html) => html
  .replace(/<[^>]*>/g, " ")
  .replace(/&(?:nbsp|amp|quot|lt|gt|#39);/g, (entity) => ENTITIES[entity])
  .replace(/\s+/g, " ")
  .trim();

const pagePath = (variantKey, jobId) => join(PROTOTYPES, VARIANTS[variantKey].slug, jobId, "index.html");

/** The corpus that must be identical across variants: every authored string. */
function fixedCorpus(job) {
  const strings = [job.eyebrow, job.h1, job.lead, job.captura.titulo, job.captura.lead,
    job.acao_terminal.label, job.acao_secundaria.label, job.responsavel, job.protocolo, job.versao];
  if (job.oferta) {
    strings.push(job.oferta.unidade_nome, job.oferta.titulo, job.oferta.resumo,
      job.oferta.preco, job.oferta.preco_unidade, job.oferta.sla);
  }
  for (const claim of job.claims) {
    strings.push(claim.text);
    if (claim.evidencia) strings.push(claim.evidencia);
  }
  return strings.filter(Boolean);
}

test("the generator is the only author: the committed prototypes match a fresh build", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cfg-proto-"));
  const written = build({ outDir: tmp, content });
  assert.ok(written.length >= 17, `expected the full matrix, got ${written.length} files`);
  for (const rel of written) {
    assert.equal(
      readText(join(tmp, rel)),
      readText(join(PROTOTYPES, rel)),
      `${rel} is out of date — run npm run design:prototypes`,
    );
  }
});

test("fixed content: every authored string reaches both variants, and no other", () => {
  for (const job of content.jobs) {
    const corpus = fixedCorpus(job);
    const rendered = Object.fromEntries(
      Object.keys(VARIANTS).map((key) => [key, stripTags(readText(pagePath(key, job.id)))]),
    );
    for (const value of corpus) {
      const flat = value.replace(/\s+/g, " ").trim();
      for (const [key, text] of Object.entries(rendered)) {
        assert.ok(text.includes(flat), `variante ${key}, job ${job.id}: falta a string fixa ${JSON.stringify(flat.slice(0, 60))}`);
      }
    }
  }
});

test("conversion is never the variable: the terminal action and the price↔capture pair are byte-identical", () => {
  const block = (html, marker) => {
    const start = html.indexOf(marker);
    assert.notEqual(start, -1, `bloco ${marker} ausente`);
    const end = html.indexOf("</section>", start);
    return html.slice(start, end);
  };
  for (const job of content.jobs) {
    const a = readText(pagePath("a", job.id));
    const b = readText(pagePath("b", job.id));
    assert.equal(
      block(a, '<section class="conversion"'),
      block(b, '<section class="conversion"'),
      `job ${job.id}: a subárvore de conversão diverge entre as variantes`,
    );
    assert.equal(
      block(a, '<section class="captura"'),
      block(b, '<section class="captura"'),
      `job ${job.id}: a captura diverge entre as variantes`,
    );
  }
});

test("mechanism B renders no drawn carimbo", () => {
  const css = readText(join(PROTOTYPES, VARIANTS.b.slug, "mechanism.css"));
  for (const forbidden of [/transform\s*:\s*rotate/i, /writing-mode/i, /position\s*:\s*absolute/i]) {
    assert.ok(!forbidden.test(css), `mechanism.css de B usa ${forbidden} — carimbo desenhado é proibido`);
  }
  // A four-sided border on the state block is the title-block caricature. The
  // marker is a start-edge keyline plus the word, and nothing else.
  const stateRules = css.match(/\.estado[^{]*\{[^}]*\}/g) || [];
  assert.ok(stateRules.length > 0, "nenhuma regra .estado encontrada");
  for (const rule of stateRules) {
    assert.ok(
      !/(^|[^-])border\s*:/.test(rule),
      `regra de estado com borda de quatro lados: ${rule.slice(0, 80)}`,
    );
  }
});

test("no remote asset, no remote font, no CSP widening inside the prototypes", () => {
  // Public-source hosts a prototype may LINK to. Linking is not loading: an
  // outbound anchor to the law or to PNCP costs the visitor nothing until it
  // is clicked, and the whole direction rests on citing those sources.
  const LINKABLE = /^https:\/\/(?:www\.planalto\.gov\.br|pncp\.gov\.br)\//;
  for (const path of walk(PROTOTYPES)) {
    const text = readText(path);
    if (isLegacy494(path)) {
      // The rule, not the word: the specimen page says "zero @font-face" in prose.
      assert.ok(!/@font-face\s*\{/i.test(text), `${relative(ROOT, path)} declara uma regra @font-face`);
    }
    assert.ok(!/fonts\.(googleapis|gstatic|bunny)\./i.test(text), `${relative(ROOT, path)} referencia fonte remota`);
    assert.ok(!/<meta[^>]+Content-Security-Policy/i.test(text), `${relative(ROOT, path)} mexe em CSP`);

    // A declared face must resolve to a versioned file in this repository.
    for (const [, url] of text.matchAll(/@font-face\s*\{[^}]*url\(\s*"([^"]+)"/gi)) {
      assert.ok(url.startsWith("/assets/"), `${relative(ROOT, path)}: fonte fora de /assets/: ${url}`);
      assert.ok(
        statSync(join(ROOT, url.replace(/^\//, ""))).isFile(),
        `${relative(ROOT, path)}: fonte declarada não existe no repositório: ${url}`,
      );
    }

    if (!path.endsWith(".html")) continue;
    // Loads are what a prototype must not take from a third party. `src` on
    // any tag and `href` on <link> load; `href` on <a> navigates.
    const loads = [
      ...(text.match(/\bsrc\s*=\s*"https?:\/\/[^"]+"/gi) || []),
      ...(text.match(/<link\b[^>]*\bhref\s*=\s*"https?:\/\/[^"]+"/gi) || []),
    ];
    assert.deepEqual(loads, [], `${relative(ROOT, path)} carrega recurso de terceiro`);
    for (const [, url] of text.matchAll(/<a\b[^>]*\bhref\s*=\s*"(https?:\/\/[^"]+)"/gi)) {
      assert.ok(LINKABLE.test(url), `${relative(ROOT, path)} aponta para host não público: ${url}`);
    }
  }
});

test("prototype pages carry no inline script and no inline style", () => {
  // This is what lets `stripTags` skip script/style handling entirely, and it
  // is worth asserting on its own: a prototype that grew an inline script
  // would be measuring something the JS-off protocol state does not render.
  for (const path of walk(PROTOTYPES)) {
    if (!path.endsWith(".html")) continue;
    const html = readText(path);
    assert.ok(!/<script[\s>]/i.test(html), `${relative(ROOT, path)} tem <script> inline`);
    assert.ok(!/<style[\s>]/i.test(html), `${relative(ROOT, path)} tem <style> inline`);
    assert.ok(!/\son[a-z]+\s*=/i.test(html), `${relative(ROOT, path)} tem handler inline`);
  }
});

test("prototypes live only under the isolated path, and declare themselves noindex", () => {
  for (const path of walk(PROTOTYPES)) {
    assert.ok(path.startsWith(PROTOTYPES), `${path} fora do caminho isolado`);
    if (!path.endsWith(".html")) continue;
    assert.match(readText(path), /name="robots" content="noindex,nofollow,noarchive"/);
  }
});

test("the revision state of mechanism B is derived, never authored", () => {
  const meta = { today: content.today, validadeDias: content.validade_dias };
  const observed = new Set();
  for (const job of content.jobs) {
    const html = readText(pagePath("b", job.id));
    for (const claim of job.claims) {
      const expected = revisionState(claim, meta);
      observed.add(expected);
      assert.match(
        html,
        new RegExp(`id="${claim.id}"[^>]*data-revision-state="${expected}"`),
        `job ${job.id}, claim ${claim.id}: estado renderizado diverge do derivado (${expected})`,
      );
    }
  }
  // The mechanism is only observable if the fixed content exercises all three
  // states; a corpus that is entirely fresh would not test anything.
  assert.deepEqual([...observed].sort(), ["sem-data", "valida", "vencida"]);
});

test("the committed evidence still supports the recorded decision", () => {
  const probe = JSON.parse(readText(join(EVIDENCE, "direction-probe.json")));
  const palette = JSON.parse(readText(join(EVIDENCE, "palette-g3.json")));
  const rule = readText(RULE);

  // G1–G8, on the numbers, for both candidates.
  for (const [key, row] of Object.entries(probe.summary)) {
    assert.equal(row.G1_renders_intact_without_domain_fields, false, `${key}: G1 — renderiza intacta sem os campos de domínio`);
    assert.ok(row.G1_min_slots_in_first_fold >= 2, `${key}: G1 — menos de 2 slots na primeira dobra`);
    assert.equal(row.G2_extractable_set_changes, true, `${key}: G2 — a assinatura não carrega informação`);
    assert.ok(row.M2_worst_proof_proximity_folds <= 1, `${key}: G5 — prova a mais de uma dobra do claim`);
    assert.equal(row.G7_budget.within_budget, true, `${key}: G7 — fora do budget de fonte`);
    assert.ok(row.G8_worst_hover_top_delta_px < 0.5, `${key}: G8 — hover lift de ${row.G8_worst_hover_top_delta_px}px`);
    assert.equal(row.worst_horizontal_overflow_px, 0, `${key}: refluxo horizontal`);
  }
  assert.equal(palette.g3_pass, true, "G3 — papel semântico sem separação de luminância e sem portador não-cromático");

  // §4.3: a candidate wins only by ≥2 fields of M1 in every job of the
  // protocol. No compensation between jobs, exactly as §4.1 forbids
  // compensation between barriers.
  const [left, right] = Object.keys(probe.summary);
  const perJob = (key) => probe.summary[key].M1_per_job;
  const margin = (winner, loser) => Math.min(
    ...Object.keys(perJob(winner)).map((job) => perJob(winner)[job] - perJob(loser)[job]),
  );
  const best = Math.max(margin(left, right), margin(right, left));
  const outcome = best >= 2 ? "SELECT_DIRECTION" : "KEEP_CURRENT";

  assert.match(rule, /<!-- RESULTADO/, "o marcador de resultado sumiu do arquivo da regra");
  const recorded = rule.split("<!-- RESULTADO")[1] || "";
  assert.ok(
    recorded.includes(outcome),
    `a regra registra um desfecho diferente do que as medidas produzem (${outcome})`,
  );
});

test("the capture index is durable, hashed, and on the five protocol viewports", () => {
  const index = JSON.parse(readText(join(EVIDENCE, "capture-index.json")));
  assert.deepEqual(index.protocol.viewports, ["390x844", "768x1024", "1366x768", "1363x936", "1440x1000"]);
  assert.equal(typeof index.comparison_ready, "boolean", "capture comparability is undeclared");
  if (index.comparison_ready) {
    assert.deepEqual(index.comparison_blockers, [], "comparable capture still declares blockers");
  } else {
    assert.ok(index.comparison_blockers.length > 0, "historical capture blockers disappeared");
  }
  assert.ok(index.file_count >= 45, `índice raso: ${index.file_count} arquivos`);
  for (const group of index.groups) {
    assert.equal(group.state.fullpage, true, `${group.group}: captura não é full-page`);
    assert.equal(group.state.javascript, "off", `${group.group}: captura com JS ligado`);
    assert.equal(group.state.motion, "reduced", `${group.group}: captura sem reduced-motion`);
    assert.ok(group.commit_sha, `${group.group}: manifesto sem SHA`);
    assert.ok(group.captured_at, `${group.group}: manifesto sem data`);
    for (const file of group.files) {
      assert.match(file.sha256, /^[0-9a-f]{64}$/, `${group.group}/${file.file}: hash ausente`);
      assert.ok(file.bytes > 0, `${group.group}/${file.file}: arquivo vazio`);
    }
  }
});

test("the capture index comparability gate fails closed", () => {
  const result = spawnSync(
    "python3",
    [join(ROOT, "scripts/site/index_design_direction_capture.py"), "--self-test"],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /CAPTURE_INDEX_SELF_TEST_OK/);
});

test("the fixed content itself is well formed", () => {
  assert.equal(content.schema, "confenge.design-direction-fixed-content/1.0");
  assert.equal(content.jobs.length, 3);
  assert.deepEqual(content.jobs.map((job) => job.id).sort(), ["comercial", "instrumento", "leitura"]);
  assert.deepEqual(
    content.provenance_fields.slice().sort(),
    ["data_de_corte", "fonte", "responsavel", "unidade", "versao"],
  );
  assert.ok(statSync(join(PROTOTYPES, "README.md")).isFile());
  for (const job of content.jobs) {
    assert.ok(job.claims.length >= 4, `${job.id}: corpus curto demais para medir`);
    assert.ok(job.claims.some((claim) => !claim.fonte), `${job.id}: nenhum claim sem fonte, o comportamento sem dado não é exercitado`);
  }
});
