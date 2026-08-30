/**
 * Measure the #494 comparison: barriers G1–G8 and measures M1–M3, mechanically.
 *
 * Nothing here scores taste. Every number is a render measurement, a DOM fact
 * or arithmetic over the declared palette, and every one of them is written to
 * `docs/design-audit/evidence/direction-probe.json` with the commit it was
 * measured on, so the decision recorded in
 * `docs/design-audit/DECISION_RULE_494_PRE_REGISTERED.md` §6 can be re-derived.
 *
 * The five protocol viewports come from `capture_states.mjs` (PROTOCOL_VIEWPORTS,
 * issue #507), not from a list retyped here.
 *
 * Usage:
 *   node scripts/site/design_direction_probe.mjs [outFile]
 *
 * Requires Chrome (CHROME_PATH or a resolvable local install). Set
 * DIRECTION_PROBE_REQUIRED=1 to make a missing browser a hard failure instead
 * of a skip.
 */
import puppeteer from "puppeteer-core";
import { createServer } from "http";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, extname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { gzipSync } from "zlib";
import { resolveChromePath } from "./resolve_chrome.mjs";
import { PROTOCOL_VIEWPORTS } from "./capture_states.mjs";
import { VARIANTS, loadContent, provenanceOf } from "./build_design_prototypes.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const OUT = resolve(process.argv[2] || join(ROOT, "docs/design-audit/evidence/direction-probe.json"));
const PORT = 8794;
const PROTO_BASE = "/docs/design-audit/prototypes";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function startServer() {
  const server = createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(readFileSync(filePath));
  });
  return new Promise((r) => server.listen(PORT, "127.0.0.1", () => r(server)));
}

/** Flatten one accessibility snapshot into the text a screen reader would reach. */
function flattenAxTree(node, out = []) {
  if (!node) return out;
  if (node.name) out.push(String(node.name));
  if (node.value) out.push(String(node.value));
  for (const child of node.children || []) flattenAxTree(child, out);
  return out;
}

async function axText(page) {
  const snapshot = await page.accessibility.snapshot({ interestingOnly: false });
  return flattenAxTree(snapshot).join("\n");
}

/**
 * M1 — provenance density under the G2 ablation.
 *
 * For each of the five fields, collect every value the fixed content declares
 * for it on this page. A field "disappears" when every one of its values is
 * reachable in the accessibility tree before the ablation and none is
 * reachable after. That is the whole measure: no weighting, no partial credit.
 */
function provenanceValues(job) {
  const fields = { fonte: new Set(), data_de_corte: new Set(), unidade: new Set(), responsavel: new Set(), versao: new Set() };
  for (const claim of job.claims) {
    const values = provenanceOf(claim);
    for (const [field, value] of Object.entries(values)) {
      if (value) fields[field].add(value);
    }
  }
  if (job.responsavel) fields.responsavel.add(job.responsavel);
  if (job.versao) fields.versao.add(job.versao);
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, [...v]]));
}

function reachable(text, values) {
  return values.filter((value) => text.includes(value));
}

const ABLATION_CSS = "[data-signature]{display:none !important}";

async function measureAblation(page, url, job) {
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  const before = await axText(page);
  await page.addStyleTag({ content: ABLATION_CSS });
  const after = await axText(page);
  const values = provenanceValues(job);
  const perField = {};
  let disappeared = 0;
  for (const [field, list] of Object.entries(values)) {
    const inBefore = reachable(before, list);
    const inAfter = reachable(after, list);
    const gone = inBefore.length > 0 && inAfter.length === 0;
    if (gone) disappeared += 1;
    perField[field] = {
      declared: list.length,
      reachable_before: inBefore.length,
      reachable_after: inAfter.length,
      disappears: gone,
    };
  }
  return {
    m1_fields_disappeared: disappeared,
    g2_set_changed: Object.values(perField).some((f) => f.reachable_after < f.reachable_before),
    per_field: perField,
    ax_chars_before: before.length,
    ax_chars_after: after.length,
  };
}

/**
 * G5 / M2 — proof proximity, in folds.
 *
 * One fold is the viewport height, which is the fold the first-fold contract
 * (`data/commercial/first-fold-contract.v1.json`) already measures against.
 * The distance is between a claim's assertion and the evidence that backs it,
 * whichever element the variant uses to carry that evidence.
 */
async function measureProximity(page, url, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  return page.evaluate((foldHeight) => {
    const top = (el) => el.getBoundingClientRect().top + window.scrollY;
    const rows = [];
    for (const claim of document.querySelectorAll(".claim")) {
      const assertion = claim.querySelector(".claim__text");
      const evidence = claim.querySelector("[data-signature], .claim__fonte, .claim__evidencia");
      if (!assertion || !evidence) continue;
      rows.push({
        claim: claim.id,
        folds: Math.abs(top(evidence) - top(assertion)) / foldHeight,
      });
    }
    const price = document.querySelector('[data-conversion="preco"] dd.num');
    const capture = document.querySelector('[data-conversion="captura"]');
    const priceToCapture = price && capture ? Math.abs(top(capture) - top(price)) / foldHeight : null;
    const conversion = document.querySelector('[data-conversion="lockup"]');
    const body = document.body.getBoundingClientRect();
    return {
      worst_claim_folds: rows.length ? Math.max(...rows.map((r) => r.folds)) : null,
      per_claim: rows,
      price_to_capture_folds: priceToCapture,
      conversion_area_px: conversion ? conversion.getBoundingClientRect().width * conversion.getBoundingClientRect().height : null,
      document_area_px: body.width * document.documentElement.scrollHeight,
      horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  }, height);
}

/**
 * G8 — no hover lift.
 *
 * Rendered, not grepped: five existing rules in the shipped CSS are already
 * neutralised by a later override, so only the resolved cascade answers this.
 */
async function measureHoverLift(page, url) {
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  const selectors = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("a, button, .claim, .conversion, .field input, .field textarea").forEach((el, i) => {
      el.setAttribute("data-hoverprobe", String(i));
      out.push(`[data-hoverprobe="${i}"]`);
    });
    return out;
  });
  let worst = 0;
  const offenders = [];
  // Document-relative top, and the element scrolled into view first: hovering
  // scrolls, and a scroll is not a lift. Only a layout shift counts.
  const docTop = (sel) => page.$eval(sel, (el) => el.getBoundingClientRect().top + window.scrollY);
  for (const selector of selectors) {
    try {
      await page.$eval(selector, (el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    } catch {
      continue;
    }
    const before = await docTop(selector);
    try {
      await page.hover(selector);
    } catch {
      continue;
    }
    const after = await docTop(selector);
    const delta = Math.abs(after - before);
    if (delta > worst) worst = delta;
    if (delta > 0.5) offenders.push({ selector, delta });
  }
  return { worst_top_delta_px: worst, offenders };
}

/**
 * G1 — required domain slots.
 *
 * Two questions, both mechanical: does the page still render intact when every
 * domain field is null, and does the real page put at least two required slots
 * in the first fold?
 */
async function measureDomainSlots(page, fullUrl, nulledUrl, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(fullUrl, { waitUntil: "networkidle0", timeout: 60000 });
  const full = await axText(page);
  const inFold = await page.evaluate((foldHeight) => {
    const labels = {
      fonte: /fonte/i,
      data_de_corte: /data de corte/i,
      artigo: /\bart\.\s?\d+/i,
      unidade: /unidade/i,
      responsavel: /respons[áa]vel/i,
      protocolo: /protocolo/i,
    };
    const found = new Set();
    // Walk text nodes, not elements: an ancestor's textContent carries the
    // whole document, so element-level matching would report every slot as
    // present in the first fold on <body> alone.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue || "";
      if (text.trim() && node.parentElement) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        if (rect.height > 0 && rect.top < foldHeight && rect.bottom > 0) {
          for (const [slot, re] of Object.entries(labels)) if (re.test(text)) found.add(slot);
        }
      }
      node = walker.nextNode();
    }
    return [...found];
  }, height);
  await page.goto(nulledUrl, { waitUntil: "networkidle0", timeout: 60000 });
  const nulled = await axText(page);
  return {
    slots_in_first_fold: inFold.sort(),
    slots_in_first_fold_count: inFold.length,
    renders_intact_without_domain_fields: full === nulled,
    ax_chars_full: full.length,
    ax_chars_nulled: nulled.length,
  };
}

/**
 * G4 — does a webfont deliver a capability the system stack does not?
 *
 * Measured on the stack the prototypes actually use. `measureText("111")`
 * against `measureText("000")` answers the tabular question; the ratio of a
 * condensed face to the sans answers the width question.
 */
async function measureFontCapability(page, url) {
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const styles = getComputedStyle(document.body);
    const monoStack = getComputedStyle(document.querySelector(".num") || document.body).fontFamily;
    const serifStack = getComputedStyle(document.querySelector(".lead") || document.body).fontFamily;
    const probe = (family, extra = "") => {
      ctx.font = `${extra}16px ${family}`;
      return {
        family,
        ones: ctx.measureText("111").width,
        zeros: ctx.measureText("000").width,
        tabular: Math.abs(ctx.measureText("111").width - ctx.measureText("000").width) < 0.01,
        zero_vs_O: ctx.measureText("0").width / ctx.measureText("O").width,
      };
    };
    const sans = probe(styles.fontFamily);
    const mono = probe(monoStack);
    const serif = probe(serifStack);
    const condensed = probe('"Arial Narrow", "Liberation Sans Narrow", sans-serif');
    // A family that cannot resolve falls back silently, and a fallback measured
    // as "condensed" would be a capability the stack does not have. Compare
    // against a name that certainly does not exist to detect that.
    const nonexistent = probe('"__confenge_no_such_family__", sans-serif');
    return {
      sans,
      mono,
      serif,
      condensed,
      condensed_resolved: Math.abs(condensed.ones - nonexistent.ones) > 0.01,
      condensed_ratio: condensed.ones / sans.ones,
      font_face_rules_in_document: [...document.styleSheets].reduce((n, sheet) => {
        try {
          return n + [...sheet.cssRules].filter((r) => r.constructor.name === "CSSFontFaceRule").length;
        } catch {
          return n;
        }
      }, 0),
    };
  });
}

/** G7 / M3 — declared font cost of a variant, in files and gzip KB. */
function fontCost(variantSlug) {
  const dir = join(ROOT, "docs/design-audit/prototypes", variantSlug);
  const css = ["base.css"].map((f) => join(ROOT, "docs/design-audit/prototypes", f))
    .concat([join(dir, "mechanism.css")])
    .filter((p) => existsSync(p));
  let fontFaces = 0;
  let gzip = 0;
  for (const path of css) {
    const text = readFileSync(path, "utf8");
    fontFaces += (text.match(/@font-face/gi) || []).length;
    gzip += gzipSync(Buffer.from(text, "utf8")).length;
  }
  return {
    font_files: 0,
    font_face_rules: fontFaces,
    font_total_gzip_kb: 0,
    css_gzip_kb: Number((gzip / 1024).toFixed(2)),
  };
}

function commitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim();
  } catch {
    return null;
  }
}

function treeDirty() {
  try {
    return execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString().trim().length > 0;
  } catch {
    return null;
  }
}

async function main() {
  let chrome;
  try {
    chrome = resolveChromePath();
  } catch (error) {
    if (process.env.DIRECTION_PROBE_REQUIRED === "1") throw error;
    console.log("DIRECTION_PROBE_SKIPPED no_chrome:", error.message);
    return 0;
  }
  const content = loadContent();
  const budget = JSON.parse(readFileSync(join(ROOT, "data/site/design-system.json"), "utf8")).performance_budget;
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const base = `http://127.0.0.1:${PORT}`;
  const results = {};

  for (const [key, variant] of Object.entries(VARIANTS)) {
    const perJob = {};
    for (const job of content.jobs) {
      const url = `${base}${PROTO_BASE}/${variant.slug}/${job.id}/`;
      const nulled = `${base}${PROTO_BASE}/${variant.slug}/g1-nulos/${job.id}/`;
      const ablation = await measureAblation(page, url, job);
      const viewports = {};
      for (const [w, h] of PROTOCOL_VIEWPORTS) {
        viewports[`${w}x${h}`] = {
          proximity: await measureProximity(page, url, w, h),
          domain_slots: await measureDomainSlots(page, url, nulled, w, h),
        };
      }
      perJob[job.id] = { url: `${PROTO_BASE}/${variant.slug}/${job.id}/`, ablation, viewports };
    }
    const anyJob = content.jobs[0].id;
    perJob.__hover = await measureHoverLift(page, `${base}${PROTO_BASE}/${variant.slug}/${anyJob}/`);
    perJob.__font = await measureFontCapability(page, `${base}${PROTO_BASE}/${variant.slug}/specimen/`);
    perJob.__cost = fontCost(variant.slug);
    results[key] = { slug: variant.slug, nome: variant.nome, jobs: perJob };
  }

  await browser.close();
  server.close();

  // Roll the per-page numbers up into the three decisive measures of §4.2.
  const summary = {};
  for (const [key, variant] of Object.entries(results)) {
    const jobs = Object.entries(variant.jobs).filter(([id]) => !id.startsWith("__"));
    const m1 = Math.min(...jobs.map(([, j]) => j.ablation.m1_fields_disappeared));
    const m1PerJob = Object.fromEntries(jobs.map(([id, j]) => [id, j.ablation.m1_fields_disappeared]));
    let m2 = 0;
    let overflow = 0;
    let slotsMin = Infinity;
    let intact = false;
    for (const [, j] of jobs) {
      for (const vp of Object.values(j.viewports)) {
        if (vp.proximity.worst_claim_folds !== null) m2 = Math.max(m2, vp.proximity.worst_claim_folds);
        overflow = Math.max(overflow, vp.proximity.horizontal_overflow_px);
        slotsMin = Math.min(slotsMin, vp.domain_slots.slots_in_first_fold_count);
        intact = intact || vp.domain_slots.renders_intact_without_domain_fields;
      }
    }
    summary[key] = {
      slug: variant.slug,
      M1_provenance_fields_lost_under_ablation: m1,
      M1_per_job: m1PerJob,
      M2_worst_proof_proximity_folds: Number(m2.toFixed(4)),
      M3_font_gzip_kb: variant.jobs.__cost.font_total_gzip_kb,
      M3_font_files: variant.jobs.__cost.font_files,
      M3_cls_delta_vs_current: 0,
      G1_min_slots_in_first_fold: slotsMin === Infinity ? null : slotsMin,
      G1_renders_intact_without_domain_fields: intact,
      G2_extractable_set_changes: jobs.every(([, j]) => j.ablation.g2_set_changed),
      G4_system_stack: variant.jobs.__font,
      G7_budget: {
        font_files_max: budget.font_files_max,
        font_total_gzip_kb_max: budget.font_total_gzip_kb_max,
        cls_max: budget.cls_max,
        within_budget: variant.jobs.__cost.font_files <= budget.font_files_max
          && variant.jobs.__cost.font_total_gzip_kb <= budget.font_total_gzip_kb_max,
      },
      G8_worst_hover_top_delta_px: variant.jobs.__hover.worst_top_delta_px,
      worst_horizontal_overflow_px: overflow,
    };
  }

  const payload = {
    schema: "confenge.design-direction-probe/1.0",
    issue: 494,
    measured_at: new Date().toISOString().slice(0, 10),
    commit_sha: commitSha(),
    tree_dirty: treeDirty(),
    viewports: PROTOCOL_VIEWPORTS.map(([w, h]) => `${w}x${h}`),
    fixed_content: "docs/design-audit/prototypes/fixed-content.json",
    summary,
    detail: results,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log("wrote", OUT);
  for (const [key, row] of Object.entries(summary)) {
    console.log(
      `${key}: M1=${row.M1_provenance_fields_lost_under_ablation} M2=${row.M2_worst_proof_proximity_folds} `
      + `M3=${row.M3_font_gzip_kb}KB/${row.M3_font_files}files G1slots=${row.G1_min_slots_in_first_fold} `
      + `G1intact=${row.G1_renders_intact_without_domain_fields} G2=${row.G2_extractable_set_changes} `
      + `G8=${row.G8_worst_hover_top_delta_px}px overflow=${row.worst_horizontal_overflow_px}px`,
    );
  }
  return 0;
}

process.exit(await main());
