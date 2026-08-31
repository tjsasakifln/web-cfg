/**
 * Read-only live audit for /entregas/ and its eight published model pages.
 *
 * The route and copy expectations come from page-contract-eight.v1.json. The
 * audit never submits a form and never serializes form values. Screenshots are
 * restricted to the viewport or a named DOM element because full-page capture
 * is not reliable until #540 is resolved.
 *
 * Usage:
 *   node scripts/site/audit_deliverables_live.mjs \
 *     --base=https://confenge.com.br \
 *     --out=docs/evidence/commercial-experience-2026-08-31/deliverables
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, "data/commercial/page-contract-eight.v1.json"), "utf8"));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "data/commercial/deliverables-registry.v1.json"), "utf8"));
const authorityDocument = fs.readFileSync(path.join(ROOT, "docs/architecture/RUNTIME-AUTHORITY.md"), "utf8");

function authorityValue(key) {
  const match = authorityDocument.match(new RegExp(`^\\s*${key}:\\s*([^\\n#]+)`, "m"));
  if (!match) throw new Error(`RUNTIME-AUTHORITY missing ${key}`);
  return match[1].trim();
}

const authorityRuntime = {
  environment: authorityValue("expected_environment"),
  profile: authorityValue("expected_profile"),
  host_architecture_version: authorityValue("host_architecture_version"),
};
const expectedCapabilities = registry.deliverables.map((entry) => ({
  id: entry.deliverable_id,
  state: entry.public_state,
}));

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const candidateLocal = option("candidate-local", "0") === "1";
const expectedRuntime = candidateLocal
  ? { ...authorityRuntime, environment: "local", profile: "local-candidate" }
  : authorityRuntime;

const base = option("base", "https://confenge.com.br").replace(/\/$/, "");
const finalOutputDir = path.resolve(ROOT, option("out", "/tmp/confenge-deliverables-live"));
const expectedSha = option(
  "expected-sha",
  execFileSync("git", ["rev-parse", "origin/main"], { cwd: ROOT, encoding: "utf8" }).trim(),
);
fs.mkdirSync(path.dirname(finalOutputDir), { recursive: true });
const outputDir = fs.mkdtempSync(path.join(
  path.dirname(finalOutputDir),
  `.${path.basename(finalOutputDir)}.tmp-`,
));
process.on("exit", () => {
  if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
});
const existingReadme = path.join(finalOutputDir, "README.md");
if (fs.existsSync(existingReadme)) fs.copyFileSync(existingReadme, path.join(outputDir, "README.md"));
const screenshotsDir = path.join(outputDir, "screenshots");
fs.mkdirSync(screenshotsDir, { recursive: true });

const viewports = [
  { id: "390x844", width: 390, height: 844, isMobile: true, hasTouch: true },
  { id: "1366x768", width: 1366, height: 768, isMobile: false, hasTouch: false },
];

const offers = contract.deliverables.map((entry) => ({
  ...entry,
  expectedTexts: [
    ["name", entry.published_name_pt_br],
    ["price", entry.price_display],
    ["scope", entry.objeto_incluido],
    ["output", entry.saida_minima],
    ["decision", entry.value_first.actual_contract_value],
    ["work_removed", entry.value_first.work_removed],
    ["artifact_use", entry.value_first.artifact_use],
    ["proof", entry.value_first.proof_statement],
    ["price_anchor", entry.value_first.price_anchor],
  ].map(([id, text]) => ({ id, text })),
  hubCtaTexts: [
    ["cta_inspect", entry.value_first.cta_inspect],
    ["cta_configure", entry.value_first.cta_configure],
  ].map(([id, text]) => ({ id, text })),
}));

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([:\w-]+)=(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1], match[2] ?? match[3] ?? ""]));
}

function attributionProjection(file) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  const body = attributes(html.match(/<body\b[^>]*>/i)?.[0] || "");
  const formTag = html.match(/<form\b[^>]*action="\/\.netlify\/functions\/lead"[^>]*>/i)?.[0] || "";
  const form = attributes(formTag);
  const keys = ["data-cta-id", "data-asset-id", "data-offer-id", "data-cta-position", "data-route-family", "data-event-name"];
  const ctas = [...html.matchAll(/<(?:a|button|form)\b[^>]*data-cta-id="[^"]+"[^>]*>/gi)]
    .map((match) => attributes(match[0]))
    .map((entry) => Object.fromEntries(keys.map((key) => [key, entry[key] || null])))
    .sort((left, right) => String(left["data-cta-id"]).localeCompare(String(right["data-cta-id"])));
  const deliverableOptions = [...html.matchAll(/<option\b[^>]*value="(CFG-D\d{2})"/gi)].map((match) => match[1]);
  return {
    source: body["data-source"] || null,
    form: {
      action: form.action || null,
      method: form.method || null,
      cta_id: form["data-cta-id"] || null,
      asset_id: form["data-asset-id"] || null,
      offer_id: form["data-offer-id"] || null,
      cta_position: form["data-cta-position"] || null,
      route_family: form["data-route-family"] || null,
    },
    ctas,
    deliverable_options: deliverableOptions,
  };
}

const routeCensus = [
  {
    route: "/entregas/",
    id: "HUB",
    kind: "hub",
    name: "Entregas",
    file: "entregas/index.html",
    price: null,
    package: contract.package,
    expectedTexts: offers.flatMap((entry) => [...entry.expectedTexts, ...entry.hubCtaTexts]),
  },
  ...offers.map((entry) => ({
    route: entry.route,
    id: entry.deliverable_id,
    kind: "model",
    name: entry.published_name_pt_br,
    file: entry.file,
    price: entry.price_display,
    package: contract.package,
    expectedTexts: entry.expectedTexts,
  })),
];
for (const entry of routeCensus) entry.attribution = attributionProjection(entry.file);
const onlyRoute = option("only", "");
const routes = onlyRoute ? routeCensus.filter(({ route }) => route === onlyRoute) : routeCensus;
if (!routes.length) throw new Error(`unknown --only route: ${onlyRoute}`);

function slug(route) {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/\/$/, "").replaceAll("/", "_");
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function screenshotRecord(file, capture = "viewport") {
  return { file: path.relative(outputDir, file), capture, sha256: hashFile(file) };
}

async function json(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

async function captureSegment(page, selector, file) {
  const element = await page.$(selector);
  if (!element) return null;
  await element.evaluate((node) => {
    document.documentElement.style.scrollBehavior = "auto";
    const header = document.querySelector(".site-header");
    const offset = (header?.getBoundingClientRect().height || 0) + 16;
    scrollTo(0, Math.max(0, node.getBoundingClientRect().top + scrollY - offset));
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  await page.screenshot({ path: file, fullPage: false });
  return screenshotRecord(file, "viewport-segment");
}

async function inspectPage(page, expected) {
  return page.evaluate((routeExpected) => {
    const normalize = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const visible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const walk = (node, visit) => {
      if (!node || typeof node !== "object") return;
      visit(node);
      if (Array.isArray(node)) {
        for (const child of node) walk(child, visit);
        return;
      }
      for (const child of Object.values(node)) walk(child, visit);
    };
    const jsonLd = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { jsonLd.push(JSON.parse(script.textContent)); } catch { jsonLd.push({ parse_error: true }); }
    }
    const schemaNodes = [];
    const publicItemLists = [];
    for (const block of jsonLd) walk(block, (node) => {
      if (node["@type"] === "ItemList" && Array.isArray(node.itemListElement)) {
        publicItemLists.push(node.itemListElement.map((item) => ({
          name: item.name || null,
          url: item.url || null,
          position: item.position || null,
        })));
      }
      if (node["@type"]) {
        schemaNodes.push({
          type: node["@type"],
          name: node.name || null,
          url: node.url || null,
          position: node.position || null,
          price: node.price == null ? null : String(node.price),
        });
      }
    });
    const text = normalize(document.body.innerText);
    const missingText = routeExpected.expectedTexts
      .filter(({ text: expectedText }) => !text.includes(normalize(expectedText)))
      .map(({ id }) => id);
    const primaryTargets = [...document.querySelectorAll("a.button, button, input[type=submit]")]
      .filter(visible)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      });
    const unlabeledControls = [...document.querySelectorAll("input, select, textarea")]
      .filter((node) => node.type !== "hidden" && !node.disabled)
      .filter((node) => !(node.labels?.length || node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || node.title))
      .length;
    const tables = [...document.querySelectorAll("table")].map((table) => ({
      has_caption: Boolean(table.querySelector("caption")),
      headers: table.querySelectorAll("th").length,
      headers_without_scope: [...table.querySelectorAll("th")].filter((header) => !header.getAttribute("scope")).length,
    }));
    const form = document.querySelector("main form");
    const offerNodes = schemaNodes.filter(({ type }) => type === "Offer" || type === "AggregateOffer");
    const capabilityRows = [...document.querySelectorAll("[data-capability-id][data-public-state]")];
    const capabilityProjection = capabilityRows
      .map((row) => ({ id: row.getAttribute("data-capability-id"), state: row.getAttribute("data-public-state") }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const stateCounts = capabilityRows.reduce((counts, row) => {
      const state = row.getAttribute("data-public-state");
      counts[state] = (counts[state] || 0) + 1;
      return counts;
    }, {});
    const attributionKeys = ["data-cta-id", "data-asset-id", "data-offer-id", "data-cta-position", "data-route-family", "data-event-name"];
    const observedCtas = [...document.querySelectorAll("a[data-cta-id], button[data-cta-id], form[data-cta-id]")]
      .map((node) => Object.fromEntries(attributionKeys.map((key) => [key, node.getAttribute(key) || null])))
      .sort((left, right) => String(left["data-cta-id"]).localeCompare(String(right["data-cta-id"])));
    const observedAttribution = {
      source: document.body.dataset.source || null,
      form: form ? {
        action: form.getAttribute("action") || null,
        method: form.getAttribute("method") || null,
        cta_id: form.getAttribute("data-cta-id") || null,
        asset_id: form.getAttribute("data-asset-id") || null,
        offer_id: form.getAttribute("data-offer-id") || null,
        cta_position: form.getAttribute("data-cta-position") || null,
        route_family: form.getAttribute("data-route-family") || null,
      } : null,
      ctas: observedCtas,
      deliverable_options: [...document.querySelectorAll('option[value^="CFG-D"]')].map((option) => option.value),
    };
    const hasSynthetic = (node) => /sint[ée]tic/i.test(normalize(node?.textContent));
    const syntheticRoles = routeExpected.kind === "hub" ? {
      first_fold_label: hasSynthetic(document.querySelector(".hero-h1-note")),
      structured_item_labels: publicItemLists.flat().length === 8 && publicItemLists.flat().every(({ name }) => /sint[ée]tic/i.test(normalize(name))),
      offer_boundaries: [...document.querySelectorAll('[data-primary-offer="true"]')].length === 8
        && [...document.querySelectorAll('[data-primary-offer="true"]')].every((node) => /sint[ée]tic/i.test(normalize(node.textContent))),
      inspect_ctas: document.querySelectorAll('[data-primary-offer="true"] [aria-label*="sintético"], [data-primary-offer="true"] [aria-label*="sintetico"]').length === 8,
    } : {
      first_read_label: hasSynthetic(document.querySelector(".report-proof-line")),
      artifact_label: hasSynthetic(document.querySelector(".report-cover-foot")),
      contract_boundary: hasSynthetic(document.querySelector(".eight-contract__synthetic-boundary")),
      structured_disclosure: /sint[ée]tic/i.test(JSON.stringify(jsonLd)),
    };
    // The ladder must be an explicit main-content component, never only a link
    // in global chrome/footer or an incidental mention elsewhere on the page.
    const ladderNodes = [...document.querySelectorAll("main [data-offer-ladder]")];
    const ladderText = normalize(ladderNodes.map((node) => node.textContent).join(" "));
    const ladderLinks = ladderNodes.flatMap((node) => [...node.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href"),
      text: normalize(link.textContent),
    })));
    return {
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      title: document.title,
      h1_count: document.querySelectorAll("h1").length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      source: document.body.dataset.source || null,
      missing_text: missingText,
      synthetic_mentions: (text.match(/sint[ée]tic/gi) || []).length,
      synthetic_roles: syntheticRoles,
      value_roles: [...document.querySelectorAll("[data-copy-role]")].reduce((counts, node) => {
        const role = node.getAttribute("data-copy-role");
        counts[role] = (counts[role] || 0) + 1;
        return counts;
      }, {}),
      primary_targets: {
        count: primaryTargets.length,
        below_44px: primaryTargets.filter(({ width, height }) => width < 44 || height < 44).length,
      },
      unlabeled_controls: unlabeledControls,
      tables,
      form: form ? {
        action: form.getAttribute("action"),
        has_cta_id: Boolean(form.dataset.ctaId),
        has_asset_id: Boolean(form.dataset.assetId),
        has_offer_id: Boolean(normalize(form.dataset.offerId)),
        consent_required: Boolean(form.querySelector('[name="consentimento"][required]')),
        deliverable_options: form.querySelectorAll('[name="deliverable_id"] option').length,
      } : null,
      attribution: {
        matches_canonical_source: JSON.stringify(observedAttribution) === JSON.stringify(routeExpected.attribution),
        observed_ctas: observedCtas.length,
        expected_ctas: routeExpected.attribution.ctas.length,
      },
      ladder: {
        explicit_components: ladderNodes.length,
        has_units_sum: ladderText.includes(routeExpected.package.units_sum_display),
        has_package_price: ladderText.includes(routeExpected.package.package_price_display),
        has_credit_window: ladderText.includes(`${routeExpected.package.credit_window_days} dias`),
        promises_credit: /(?:volta como crédito|valor (?:pago )?é abatido|abate o valor)/i.test(ladderText),
        says_unit_01_has_no_credit: /(?:únic[oa] sem o crédito|não gera crédito|fora do diagnóstico)/i.test(ladderText),
        diagnosis_link: ladderLinks.some(({ href }) => href === "/diagnostico-b2g-expansao/"),
        recurring_direction_context: ladderLinks.some(({ href, text: label }) => href === "/diretoria-b2g/" && /recorr|diretoria/i.test(label)),
      },
      schema: {
        parse_errors: jsonLd.filter((entry) => entry.parse_error).length,
        types: [...new Set(schemaNodes.map(({ type }) => type))],
        item_list: publicItemLists.flat(),
        offer_nodes: offerNodes,
      },
      hub: routeExpected.kind === "hub" ? {
        primary_offers: document.querySelectorAll('[data-primary-offer="true"]').length,
        capabilities: capabilityRows.length,
        state_counts: stateCounts,
        capability_projection: capabilityProjection,
      } : null,
    };
  }, expected);
}

function validateMetrics(metrics, expected) {
  const errors = [];
  add(errors, metrics.canonical === `${base}${expected.route}`, "canonical_mismatch");
  add(errors, metrics.h1_count === 1, "h1_count");
  add(errors, metrics.overflow === false, "horizontal_overflow");
  add(errors, metrics.source === "CONFENGE_WEB", "source_not_CONFENGE_WEB");
  add(errors, metrics.missing_text.length === 0, `missing_contract_text:${metrics.missing_text.join(",")}`);
  add(errors, metrics.synthetic_mentions >= (expected.kind === "hub" ? 8 : 1), "synthetic_label_missing");
  add(errors, Object.values(metrics.synthetic_roles).every(Boolean), "synthetic_roles_incomplete");
  add(errors, metrics.primary_targets.count > 0 && metrics.primary_targets.below_44px === 0, "primary_target_below_44px");
  add(errors, metrics.unlabeled_controls === 0, "unlabeled_form_control");
  add(errors, metrics.tables.every((table) => table.has_caption && table.headers > 0 && table.headers_without_scope === 0), "table_semantics");
  add(errors, metrics.form?.action === "/.netlify/functions/lead", "capture_form_action");
  add(errors, metrics.form?.has_cta_id && metrics.form?.has_asset_id && metrics.form?.consent_required, "capture_attribution_or_consent");
  add(errors, metrics.attribution.matches_canonical_source, "attribution_drift");
  add(errors, metrics.schema.parse_errors === 0, "jsonld_parse_error");
  if (expected.kind === "hub") {
    add(errors, ["CollectionPage", "ItemList", "BreadcrumbList"].every((type) => metrics.schema.types.includes(type)), "hub_schema_types");
    add(errors, metrics.schema.item_list.length === 8, "item_list_count");
    add(errors, metrics.hub?.primary_offers === 8, "primary_offer_count");
    add(errors, metrics.hub?.capabilities === 54, "capability_count");
    add(errors, JSON.stringify(metrics.hub?.state_counts) === JSON.stringify({ PUBLISHED: 8, VALIDATE: 44, BLOCKED: 2 }), "capability_semantics");
    add(errors, JSON.stringify(metrics.hub?.capability_projection) === JSON.stringify(expectedCapabilities), "capability_identity_or_state_drift");
    add(errors, metrics.ladder.explicit_components === 1, "explicit_value_ladder_missing");
    add(errors, metrics.ladder.has_units_sum && metrics.ladder.has_package_price && metrics.ladder.has_credit_window, "value_ladder_arithmetic");
    add(errors, metrics.ladder.says_unit_01_has_no_credit, "unit_01_no_credit_boundary_missing");
    add(errors, metrics.ladder.diagnosis_link, "diagnosis_step_missing");
    add(errors, metrics.ladder.recurring_direction_context, "recurring_direction_step_missing");
    for (const [index, offer] of offers.entries()) {
      const item = metrics.schema.item_list[index];
      add(errors, item?.position === index + 1 && item?.url === `${base}${offer.route}` && item?.name?.includes(offer.published_name_pt_br), `item_list_${offer.deliverable_id}`);
    }
  } else {
    add(errors, ["WebPage", "Report", "BreadcrumbList"].every((type) => metrics.schema.types.includes(type)), "model_schema_types");
    add(errors, metrics.ladder.explicit_components === 1, "explicit_value_ladder_missing");
    add(errors, metrics.ladder.has_credit_window, "credit_window_missing");
    add(errors, metrics.ladder.diagnosis_link, "diagnosis_step_missing");
    add(errors, metrics.ladder.recurring_direction_context, "recurring_direction_step_missing");
    if (expected.id === "CFG-D01") {
      add(errors, !metrics.ladder.promises_credit, "unit_01_false_credit_promise");
      add(errors, metrics.ladder.says_unit_01_has_no_credit, "unit_01_no_credit_boundary_missing");
    } else {
      add(errors, metrics.ladder.has_package_price && metrics.ladder.promises_credit, "package_credit_terms_missing");
    }
  }
  add(errors, metrics.schema.offer_nodes.length === 0, "unexpected_offer_schema_requires_contract_update");
  return errors;
}

async function keyboardAudit(page) {
  await page.bringToFront();
  await page.evaluate(() => {
    scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const stops = [];
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => {
      const rect = document.activeElement?.getBoundingClientRect();
      return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight);
    }, { timeout: 1500, polling: 50 }).catch(() => {});
    stops.push(await page.evaluate((stopIndex) => {
      const node = document.activeElement;
      const rect = node?.getBoundingClientRect();
      const style = node ? getComputedStyle(node) : null;
      return {
        tag: node?.tagName || null,
        id: node?.id || null,
        classes: node?.className || null,
        rect: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
        scroll_y: Math.round(scrollY),
        visible: Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight),
        indicator: Boolean(style && (
          (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0)
          || style.boxShadow !== "none"
        )),
        skip_link: stopIndex === 0 ? Boolean(node?.classList.contains("skip-link")) : null,
      };
    }, index));
  }
  return {
    stops: stops.length,
    visible: stops.filter((stop) => stop.visible).length,
    with_indicator: stops.filter((stop) => stop.indicator).length,
    first_is_skip_link: stops[0]?.skip_link === true,
    details: stops,
  };
}

async function auditLinks(pageUrls) {
  const unique = new Set();
  for (const url of pageUrls) {
    const html = await (await fetch(url)).text();
    for (const match of html.matchAll(/\bhref=["']([^"'#]+)["']/gi)) {
      const resolved = new URL(match[1], url);
      if (resolved.origin === new URL(base).origin) unique.add(`${resolved.origin}${resolved.pathname}${resolved.search}`);
    }
  }
  const broken = [];
  for (const url of [...unique].sort()) {
    const response = await fetch(url, { redirect: "follow" });
    if (response.status >= 400) broken.push({ path: new URL(url).pathname, status: response.status });
  }
  return { checked: unique.size, broken };
}

function validateLiveIdentity(build, runtime, phase) {
  const failures = [];
  add(failures, build.commit === expectedSha, `${phase}:build_sha`);
  add(failures, runtime.release_sha === expectedSha, `${phase}:runtime_sha`);
  add(failures, build.environment === expectedRuntime.environment, `${phase}:build_environment`);
  add(failures, runtime.environment === expectedRuntime.environment, `${phase}:runtime_environment`);
  add(failures, runtime.profile === expectedRuntime.profile, `${phase}:runtime_profile`);
  add(
    failures,
    runtime.host_architecture_version === expectedRuntime.host_architecture_version,
    `${phase}:host_architecture_version`,
  );
  if (failures.length) throw new Error(`live identity mismatch: ${failures.join(",")}`);
}

function publishOutputAtomically() {
  const backup = `${finalOutputDir}.previous-${process.pid}`;
  if (fs.existsSync(backup)) throw new Error(`stale evidence backup exists: ${backup}`);
  const hadPrevious = fs.existsSync(finalOutputDir);
  if (hadPrevious) fs.renameSync(finalOutputDir, backup);
  try {
    fs.renameSync(outputDir, finalOutputDir);
  } catch (error) {
    if (hadPrevious && fs.existsSync(backup) && !fs.existsSync(finalOutputDir)) {
      fs.renameSync(backup, finalOutputDir);
    }
    throw error;
  }
  if (hadPrevious) fs.rmSync(backup, { recursive: true, force: true });
}

const buildInfo = await json(`${base}/.well-known/build-info.json`);
const runtimeInfo = await json(`${base}/.well-known/runtime-info.json`);
validateLiveIdentity(buildInfo, runtimeInfo, "before");

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
} catch (error) {
  console.error("DELIVERABLES_LIVE_BROWSER_REQUIRED", String(error?.message || error));
  process.exit(2);
}

const report = {
  schema: "confenge.deliverables-live-audit/1.0",
  issue: 547,
  generated_at: new Date().toISOString(),
  base_url: base,
  expected_main_sha: expectedSha,
  live_sha: buildInfo.commit,
  artifact_hash: buildInfo.artifact_hash,
  runtime: {
    environment: runtimeInfo.environment,
    profile: runtimeInfo.profile,
    host_architecture_version: runtimeInfo.host_architecture_version,
    expected: expectedRuntime,
  },
  decision_state: "EXECUTE_NOW",
  evidence_mode: candidateLocal ? "LOCAL_CANDIDATE_EXACT_SHA" : "LIVE_AUTHORITY",
  full_page: "DEFERRED_BY_540",
  capture_method: "first-fold viewport and named DOM-element segments only; fullPage is never requested",
  schema_policy: {
    hub_required: ["CollectionPage", "ItemList", "BreadcrumbList"],
    model_required: ["WebPage", "Report", "BreadcrumbList"],
    offer_nodes: "ABSENT_BY_CURRENT_REPORT_CONTRACT; ANY APPEARANCE REQUIRES CONTRACT UPDATE",
  },
  routes: [],
  defects: [],
  links: null,
  summary: null,
};

for (const expected of routes) {
  const routeResult = { route: expected.route, deliverable_id: expected.id, result: "PASS", viewports: [], js_off: null, keyboard: null };
  for (const viewport of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    const sameOriginFailures = [];
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.origin === new URL(base).origin && response.status() >= 400) sameOriginFailures.push({ path: url.pathname, status: response.status() });
    });
    const response = await page.goto(`${base}${expected.route}`, { waitUntil: "networkidle0", timeout: 60000 });
    const metrics = await inspectPage(page, expected);
    await page.evaluate(axeSource);
    const axe = await page.evaluate(async () => {
      const results = await globalThis.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
      });
      return results.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length }));
    });
    const hardAxe = axe.filter(({ impact }) => impact === "critical" || impact === "serious");
    const errors = validateMetrics(metrics, expected);
    add(errors, response && [200, 304].includes(response.status()), `http_${response?.status() || "none"}`);
    add(errors, hardAxe.length === 0, `axe_hard:${hardAxe.map(({ id }) => id).join(",")}`);
    add(errors, sameOriginFailures.length === 0, "same_origin_resource_failure");
    const prefix = `${slug(expected.route)}-${viewport.id}`;
    const firstFold = path.join(screenshotsDir, `${prefix}-first-fold.png`);
    await page.screenshot({ path: firstFold, fullPage: false });
    const segments = [];
    if (viewport.id === "1366x768") {
      const selectors = expected.kind === "hub"
        ? [["decision-nav", ".offer-decision-nav"], ["first-offer", "#entrega-01"], ["last-offer", "#entrega-08"], ["ladder", "[data-offer-ladder]"], ["form", "main form"]]
        : [["value", ".eight-contract__value"], ["ladder", "[data-offer-ladder]"], ["price-cta", ".report-final-offer"], ["form", "main form"]];
      for (const [name, selector] of selectors) {
        const record = await captureSegment(page, selector, path.join(screenshotsDir, `${prefix}-${name}.png`));
        if (record) segments.push(record); else errors.push(`segment_missing:${name}`);
      }
    }
    routeResult.viewports.push({
      viewport: viewport.id,
      http_status: response?.status() || null,
      errors,
      geometry: { overflow: metrics.overflow, primary_targets: metrics.primary_targets },
      accessibility: { hard_axe: hardAxe, unlabeled_controls: metrics.unlabeled_controls, tables: metrics.tables },
      contract: {
        missing_text: metrics.missing_text,
        synthetic_mentions: metrics.synthetic_mentions,
        synthetic_roles: metrics.synthetic_roles,
        value_roles: metrics.value_roles,
        source: metrics.source,
        attribution: metrics.attribution,
        ladder: metrics.ladder,
      },
      schema: metrics.schema,
      hub: metrics.hub,
      evidence: [screenshotRecord(firstFold, "viewport-first-fold"), ...segments],
    });
    if (errors.length) routeResult.result = "DEFECT";
    if (viewport.id === "390x844") {
      routeResult.keyboard = await keyboardAudit(page);
      routeResult.keyboard.errors = [];
      add(routeResult.keyboard.errors, routeResult.keyboard.visible === 10, "focused_control_not_visible");
      add(routeResult.keyboard.errors, routeResult.keyboard.with_indicator === 10, "focus_indicator_missing");
      add(routeResult.keyboard.errors, routeResult.keyboard.first_is_skip_link, "skip_link_not_first");
      if (routeResult.keyboard.errors.length) routeResult.result = "DEFECT";
    }
    await page.close();
  }

  const noJs = await browser.newPage();
  await noJs.setJavaScriptEnabled(false);
  await noJs.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const noJsResponse = await noJs.goto(`${base}${expected.route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await noJs.evaluate(() => document.fonts?.ready || Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 200));
  const noJsMetrics = await inspectPage(noJs, expected);
  const noJsErrors = validateMetrics(noJsMetrics, expected);
  add(noJsErrors, noJsResponse && [200, 304].includes(noJsResponse.status()), `http_${noJsResponse?.status() || "none"}`);
  const noJsFile = path.join(screenshotsDir, `${slug(expected.route)}-390x844-js-off-first-fold.png`);
  await noJs.screenshot({ path: noJsFile, fullPage: false });
  routeResult.js_off = {
    viewport: "390x844",
    http_status: noJsResponse?.status() || null,
    errors: noJsErrors,
    geometry: { overflow: noJsMetrics.overflow },
    evidence: [screenshotRecord(noJsFile, "viewport-first-fold-js-off")],
  };
  if (noJsErrors.length) routeResult.result = "DEFECT";
  await noJs.close();
  report.routes.push(routeResult);
  console.log(`${routeResult.result} ${expected.route}`);
}

await browser.close();
report.links = await auditLinks(routes.map(({ route }) => `${base}${route}`));
const finalBuildInfo = await json(`${base}/.well-known/build-info.json`);
const finalRuntimeInfo = await json(`${base}/.well-known/runtime-info.json`);
validateLiveIdentity(finalBuildInfo, finalRuntimeInfo, "after");
report.identity_rechecked_at = new Date().toISOString();
report.final_artifact_hash = finalBuildInfo.artifact_hash;
const allErrors = (entry) => [
  ...entry.viewports.flatMap(({ errors }) => errors),
  ...entry.js_off.errors,
  ...entry.keyboard.errors,
];
const d01 = report.routes.find(({ deliverable_id: id }) => id === "CFG-D01");
if (d01 && allErrors(d01).includes("unit_01_false_credit_promise")) {
  report.defects.push({
    id: "CFG547-D01-CREDIT-CONTRADICTION",
    severity: "HIGH",
    owner_issue: 547,
    affected_routes: [d01.route],
    symptoms: [
      "unit_01_false_credit_promise",
      "unit_01_no_credit_boundary_missing",
      "diagnosis_step_missing",
    ],
    reproduction: [
      "In /entregas/, inspect CFG-D01: it is the only unit declared outside the package and without 60-day credit.",
      "Open CFG-D01 and scroll to the written-request form: the page says the value returns as credit within 60 days.",
    ],
    probable_files: [
      "casos/modelo-relatorio-inteligencia-licitacoes/index.html",
      "tests/commercial/test_page_contract_eight.mjs",
    ],
    evidence: [
      "screenshots/entregas-1366x768-first-offer.png",
      "screenshots/casos_modelo-relatorio-inteligencia-licitacoes-1366x768-form.png",
    ],
  });
}
const recurringAffected = report.routes
  .filter((entry) => allErrors(entry).includes("recurring_direction_step_missing"))
  .map(({ route }) => route);
if (recurringAffected.length) {
  report.defects.push({
    id: "CFG547-RECURRING-DIRECTION-LADDER-MISSING",
    severity: "MEDIUM",
    owner_issue: 547,
    affected_routes: recurringAffected,
    symptoms: ["recurring_direction_step_missing"],
    reproduction: [
      "Inspect the value-ladder content inside <main> on each route.",
      "No route places /diretoria-b2g/ in the ladder with a recurring-direction trigger or scope; the URL appears only in global chrome/footer.",
    ],
    probable_files: [
      "data/commercial/page-contract-eight.v1.json",
      "scripts/commercial/render_public_catalog.mjs",
      "scripts/commercial/render_eight_offer_contracts.mjs",
    ],
    evidence: [
      "report.json",
      "screenshots/entregas-1366x768-decision-nav.png",
    ],
  });
}
report.summary = {
  pass: report.routes.filter(({ result }) => result === "PASS").length,
  defect: report.routes.filter(({ result }) => result === "DEFECT").length,
  links_checked: report.links.checked,
  broken_links: report.links.broken.length,
};
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
publishOutputAtomically();
console.log("DELIVERABLES_LIVE_AUDIT", JSON.stringify(report.summary));
if (report.summary.defect || report.summary.broken_links) process.exitCode = 1;
