/** Gate fail-closed do master e do uso do lockup CONFENGE, issue 326. */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contractPath = path.join(root, "data/brand/logo-contract.v1.json");
const selfPath = fileURLToPath(import.meta.url);
const checks = [];
function assert(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
function filled(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function listFiles(start, predicate, out = []) {
  const excluded = new Set([".git", ".claude", "node_modules", "_site", "tests", "docs", ".github"]);
  for (const entry of fs.readdirSync(start, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const absolute = path.join(start, entry.name);
    if (entry.isDirectory()) listFiles(absolute, predicate, out);
    else if (predicate(absolute)) out.push(absolute);
  }
  return out.sort();
}
function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function pngHeader(file) {
  const buffer = fs.readFileSync(file);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(`png_${path.basename(file)}_signature`, buffer.subarray(0, 8).equals(signature), file);
  assert(`png_${path.basename(file)}_ihdr`, buffer.toString("ascii", 12, 16) === "IHDR", file);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
  };
}
function attrs(tag) {
  const parsed = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)) parsed[match[1].toLowerCase()] = match[2];
  return parsed;
}
function cssBlocks(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(",").map((item) => item.trim()),
    declarations: match[2],
  }));
}
function elementsWithClass(html, tagName, className) {
  const openingPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const blocks = [];
  for (const match of html.matchAll(openingPattern)) {
    if (!String(attrs(match[0]).class ?? "").split(/\s+/).includes(className)) continue;
    const end = html.indexOf(`</${tagName}>`, match.index + match[0].length);
    if (end >= 0) blocks.push(html.slice(match.index, end + tagName.length + 3));
  }
  return blocks;
}

assert("contract_exists", fs.existsSync(contractPath), contractPath);
const raw = fs.readFileSync(contractPath, "utf8");
const contract = JSON.parse(raw);
assert("schema", contract.schema === "confenge-logo-contract-v1", contract.schema);
assert("version", contract.contract_version === "v1", contract.contract_version);
assert("issue", contract.source_issue === "#326", contract.source_issue);
assert("updated", contract.updated_at === "2026-08-25", contract.updated_at);
assert("priority_decision", contract.priority === "P1" && contract.decision_state === "EXECUTE_NOW", contract);
assert("blocked_category", contract.campaign_category === "BLOCKED_EXTERNAL", contract.campaign_category);
assert("front", contract.executive_front === "INBOUND_ENGINE", contract.executive_front);
assert("leverage", JSON.stringify(contract.leverage_types) === JSON.stringify(["trust", "distribution", "automation"]), contract.leverage_types);

const surface = contract.public_surface ?? {};
assert("confenge_brand", surface.brand === "CONFENGE", surface.brand);
assert("confenge_domain", surface.domain === "confenge.com.br" && surface.canonical_visitor_surface === "confenge.com.br", surface);
assert("scope_lockup_only", surface.lockup_only === true && surface.sitewide_recolor_allowed === false, surface);

const delivery = contract.delivery_scope ?? {};
assert("gate_only", delivery.this_change === "FAIL_CLOSED_CONTRACT_AND_GATE", delivery);
assert("no_public_mutation", delivery.changes_public_html === false && delivery.changes_live_asset === false, delivery);
assert("no_false_acceptance", delivery.claims_issue_acceptance === false && filled(delivery.reason_pt_br), delivery);

const authority = contract.authority ?? {};
assert("founder_authority", authority.geometry_owner === "founder" && authority.artwork_owner === "founder", authority);
assert("runtime_authority", authority.runtime_owner === "web-cfg" && authority.production_parity_owner === "#267", authority);
assert("authority_refs", JSON.stringify(authority.architecture_refs) === JSON.stringify([
  "AGENTS.md",
  "docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md",
  "docs/architecture/RUNTIME-AUTHORITY.md",
]), authority.architecture_refs);

const master = contract.authorized_master ?? {};
assert("master_absent", master.state === "ABSENT", master.state);
assert("master_blocked", master.promotion_state === "BLOCKED_AWAITING_FOUNDER_ARTWORK", master.promotion_state);
assert("target_svg", master.target_path === "assets/logo-confenge.svg" && master.target_format === "SVG", master);
for (const key of ["may_trace_raster", "may_guess_font", "may_generate_geometry", "may_embed_raster_image", "may_swap_live_asset"]) {
  assert(`master_${key}_false`, master[key] === false, master);
}
assert("founder_input_pending", master.required_input?.owner === "founder" && master.required_input?.state === "PENDING", master.required_input);
assert("founder_input_exact", master.required_input?.items?.length === 5 && master.required_input.items.every(filled), master.required_input);

const target = contract.target_system ?? {};
assert("header_colors", target.header?.foreground_nominal === "#000000" && target.header?.background_nominal === "#FFFFFF", target.header);
assert("header_no_blue", target.header?.blue_or_navy_allowed_in_source === false, target.header);
assert("footer_white", target.footer?.foreground_nominal === "#FFFFFF" && target.footer?.background === "DARK", target.footer);
assert("footer_no_blue", target.footer?.blue_or_navy_allowed_in_source === false, target.footer);
const sourceRules = target.source_rules ?? {};
for (const key of ["raster_image_element_allowed", "css_filter_allowed", "css_sharpen_allowed", "raster_upscale_allowed"]) {
  assert(`rule_${key}_false`, sourceRules[key] === false, sourceRules);
}
for (const key of ["intrinsic_ratio_required", "width_height_required", "non_empty_alt_required"]) {
  assert(`rule_${key}_true`, sourceRules[key] === true, sourceRules);
}
assert("click_minimum", sourceRules.click_target_minimum_px === 44, sourceRules.click_target_minimum_px);
assert("viewport_matrix", JSON.stringify(target.viewports_px) === JSON.stringify([320, 390, 768, 1024, 1366, 1440]), target.viewports_px);
assert("dpr_matrix", JSON.stringify(target.dpr) === JSON.stringify([1, 2]), target.dpr);

const legacy = contract.observed_legacy_assets ?? [];
assert("legacy_four", legacy.length === 4, legacy);
assert("legacy_roles", JSON.stringify(legacy.map((item) => item.role)) === JSON.stringify([
  "header_export",
  "header_primary_legacy",
  "footer_export",
  "footer_primary_legacy",
]), legacy);
const intrinsicByUrl = new Map();
for (const asset of legacy) {
  const absolute = path.join(root, asset.path);
  assert(`asset_${asset.role}_exists`, fs.existsSync(absolute), asset.path);
  assert(`asset_${asset.role}_png`, asset.format === "PNG" && asset.path.endsWith(".png"), asset);
  assert(`asset_${asset.role}_sha`, sha256(absolute) === asset.sha256, [sha256(absolute), asset.sha256]);
  const header = pngHeader(absolute);
  assert(`asset_${asset.role}_dimensions`, header.width === asset.width && header.height === asset.height, [header, asset]);
  assert(`asset_${asset.role}_ratio`, Math.abs(header.width / header.height - 50 / 13) < 1e-12, header);
  assert(`asset_${asset.role}_bit_depth`, header.bitDepth === 8, header);
  intrinsicByUrl.set(`/${asset.path}`, { width: asset.width, height: asset.height });
}

const svgCandidates = listFiles(path.join(root, "assets"), (file) => /logo-confenge.*\.svg$/i.test(file));
if (master.state === "ABSENT") {
  assert("no_fabricated_svg", svgCandidates.length === 0, svgCandidates.map((file) => path.relative(root, file)));
  assert("target_master_absent", !fs.existsSync(path.join(root, master.target_path)), master.target_path);
  assert("live_swap_forbidden_while_blocked", master.may_swap_live_asset === false, master);
} else {
  const targetPath = path.join(root, master.target_path);
  assert("authorized_svg_exists", fs.existsSync(targetPath), master.target_path);
  const svg = fs.readFileSync(targetPath, "utf8");
  assert("svg_no_raster_image", !/<image\b/i.test(svg), master.target_path);
  assert("svg_no_blue_or_navy", !/(?:fill|stroke)\s*=\s*["'](?:#0[0-9a-f]{2,5}|blue|navy)["']/i.test(svg), master.target_path);
  assert("svg_nominal_color", /#000000|#FFFFFF/i.test(svg), master.target_path);
}

const observation = contract.current_surface_observation ?? {};
assert("legacy_retained", observation.state === "LEGACY_RASTER_RETAINED", observation.state);
assert("legacy_primary_exact", observation.header_primary === "/assets/logo-confenge-500-f8a83f6d.png" && observation.footer_primary === "/assets/logo-confenge-white-500-1677038e.png", observation);
assert("legacy_ratio", observation.intrinsic_ratio === "50:13", observation.intrinsic_ratio);
assert("observed_html_count", observation.source_html_files_scanned === 276, observation.source_html_files_scanned);
assert("observed_logo_count", observation.logo_image_occurrences === 462, observation.logo_image_occurrences);
assert("observed_header_count", observation.header_lockup_occurrences === 238, observation.header_lockup_occurrences);
assert("observed_footer_count", observation.footer_lockup_occurrences === 224, observation.footer_lockup_occurrences);
assert("observed_asset_counts", JSON.stringify(observation.legacy_asset_occurrences) === JSON.stringify({
  "/assets/logo-confenge.png": 6,
  "/assets/logo-confenge-500-f8a83f6d.png": 232,
  "/assets/logo-confenge-white.png": 6,
  "/assets/logo-confenge-white-500-1677038e.png": 218,
}), observation.legacy_asset_occurrences);
assert("current_noncompliance_honest", observation.header_black_on_white === "NON_COMPLIANT" && observation.master_svg === "MISSING", observation);
assert("unexecuted_visual_proof", observation.sharpness_viewport_matrix === "NOT_EXECUTED" && observation.tagline_minimum_legibility === "NOT_APPROVED" && observation.screenshot_regression === "MISSING", observation);
assert("production_blocked", observation.production_svg_delivery === "BLOCKED_AWAITING_FOUNDER_ARTWORK", observation);

const promotion = contract.promotion ?? {};
assert("promotion_blocked", promotion.current === "BLOCKED_AWAITING_FOUNDER_ARTWORK" && promotion.terminal === "PROMOTED", promotion);
assert("promotion_requires_all", promotion.advance_requires_all_conditions_satisfied === true, promotion);
const evidenceFields = ["recorded_at", "recorded_by", "artifact_ref", "verification_note_pt_br"];
assert("evidence_fields", JSON.stringify(promotion.required_evidence_fields) === JSON.stringify(evidenceFields), promotion.required_evidence_fields);
assert("four_conditions", promotion.conditions?.length === 4, promotion.conditions);
assert("condition_ids", JSON.stringify(promotion.conditions?.map((item) => item.condition_id)) === JSON.stringify([
  "authorized_vector_received",
  "source_contract_validated",
  "viewport_and_dpr_regression_approved",
  "production_svg_parity_proved",
]), promotion.conditions);
for (const [index, condition] of (promotion.conditions ?? []).entries()) {
  assert(`condition_${condition.condition_id}_order`, condition.order === index + 1, condition);
  assert(`condition_${condition.condition_id}_pending`, condition.satisfied === false, condition);
  for (const field of evidenceFields) assert(`condition_${condition.condition_id}_${field}_empty`, condition.evidence?.[field] === null, condition.evidence);
}

const acceptance = new Map((contract.acceptance_matrix ?? []).map((item) => [item.criterion, item]));
assert("acceptance_eight", acceptance.size === 8, contract.acceptance_matrix);
for (const criterion of [
  "authorized_master_svg",
  "header_black_on_white",
  "footer_white_variant",
  "viewport_dpr_sharpness",
  "tagline_legibility",
  "screenshot_regression",
  "production_svg_primary",
]) {
  assert(`acceptance_${criterion}_not_passed`, acceptance.has(criterion) && acceptance.get(criterion).state !== "PASSED", acceptance.get(criterion));
  assert(`acceptance_${criterion}_blocked_by_artwork`, filled(acceptance.get(criterion)?.blocker), acceptance.get(criterion));
}
assert("acceptance_scope_enforced", acceptance.get("lockup_only_scope")?.state === "ENFORCED" && acceptance.get("lockup_only_scope")?.blocker === null, acceptance.get("lockup_only_scope"));

const htmlFiles = listFiles(root, (file) => file.endsWith(".html"));
assert("html_inventory", htmlFiles.length >= 200, htmlFiles.length);
let logoImages = 0;
let headerPrimary = 0;
let footerPrimary = 0;
let headerBrandBlocks = 0;
let footerBrandBlocks = 0;
const logoOccurrencesBySrc = new Map();
const allowedHeaderSources = new Set(legacy.filter((asset) => asset.role.startsWith("header_")).map((asset) => `/${asset.path}`));
const allowedFooterSources = new Set(legacy.filter((asset) => asset.role.startsWith("footer_")).map((asset) => `/${asset.path}`));
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  for (const block of elementsWithClass(html, "a", "brand")) {
    headerBrandBlocks += 1;
    const images = [...block.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    assert(`html_${relative}_brand_one_image_${headerBrandBlocks}`, images.length === 1, block);
    const parsed = attrs(images[0] ?? "");
    assert(`html_${relative}_brand_legacy_source_${headerBrandBlocks}`, allowedHeaderSources.has(parsed.src), parsed.src);
    assert(`html_${relative}_brand_no_alternate_vector_${headerBrandBlocks}`, !/<(?:svg|picture|source)\b/i.test(block) && !("srcset" in parsed), block);
  }
  for (const block of elementsWithClass(html, "div", "footer-brand")) {
    footerBrandBlocks += 1;
    const images = [...block.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    assert(`html_${relative}_footer_brand_one_image_${footerBrandBlocks}`, images.length === 1, block);
    const parsed = attrs(images[0] ?? "");
    assert(`html_${relative}_footer_brand_legacy_source_${footerBrandBlocks}`, allowedFooterSources.has(parsed.src), parsed.src);
    assert(`html_${relative}_footer_brand_no_alternate_vector_${footerBrandBlocks}`, !/<(?:svg|picture|source)\b/i.test(block) && !("srcset" in parsed), block);
  }
  for (const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["'][^"']*logo-confenge[^"']*["'][^>]*>/gi)) {
    logoImages += 1;
    const tag = match[0];
    const parsed = attrs(tag);
    logoOccurrencesBySrc.set(parsed.src, (logoOccurrencesBySrc.get(parsed.src) ?? 0) + 1);
    assert(`html_${relative}_logo_src_known_${logoImages}`, intrinsicByUrl.has(parsed.src), parsed.src);
    assert(`html_${relative}_logo_alt_${logoImages}`, filled(parsed.alt), tag);
    assert(`html_${relative}_logo_width_${logoImages}`, /^\d+$/.test(parsed.width ?? ""), tag);
    assert(`html_${relative}_logo_height_${logoImages}`, /^\d+$/.test(parsed.height ?? ""), tag);
    const intrinsic = intrinsicByUrl.get(parsed.src);
    if (intrinsic && /^\d+$/.test(parsed.width ?? "") && /^\d+$/.test(parsed.height ?? "")) {
      const declaredRatio = Number(parsed.width) / Number(parsed.height);
      assert(`html_${relative}_logo_ratio_${logoImages}`, Math.abs(declaredRatio - intrinsic.width / intrinsic.height) < 0.02, [parsed.width, parsed.height, intrinsic]);
      assert(`html_${relative}_logo_no_declared_upscale_${logoImages}`, Number(parsed.width) <= intrinsic.width && Number(parsed.height) <= intrinsic.height, [parsed, intrinsic]);
    }
    if (parsed.src === observation.header_primary) headerPrimary += 1;
    if (parsed.src === observation.footer_primary) footerPrimary += 1;
  }
}
assert("html_inventory_matches_observation", htmlFiles.length === observation.source_html_files_scanned, htmlFiles.length);
assert("logo_inventory_matches_observation", logoImages === observation.logo_image_occurrences, logoImages);
for (const [src, expected] of Object.entries(observation.legacy_asset_occurrences ?? {})) {
  assert(`asset_occurrence_${path.basename(src)}`, logoOccurrencesBySrc.get(src) === expected, [logoOccurrencesBySrc.get(src), expected]);
}
assert("header_lockup_inventory_matches_observation", headerBrandBlocks === observation.header_lockup_occurrences, headerBrandBlocks);
assert("footer_lockup_inventory_matches_observation", footerBrandBlocks === observation.footer_lockup_occurrences, footerBrandBlocks);
assert("every_logo_occurrence_is_accounted_for", [...logoOccurrencesBySrc.values()].reduce((sum, count) => sum + count, 0) === logoImages, logoOccurrencesBySrc);

const cssFile = path.join(root, "styles.css");
assert("styles_exists", fs.existsSync(cssFile), cssFile);
const css = fs.readFileSync(cssFile, "utf8");
const logoBlocks = cssBlocks(css).filter((block) => block.selectors.some((selector) => /(?:^|\s)\.(?:brand|footer-brand)\s+img\b/.test(selector)));
assert("logo_css_blocks", logoBlocks.length >= 2, logoBlocks);
for (const [index, block] of logoBlocks.entries()) {
  assert(`css_logo_${index}_no_filter`, !/(?:^|;)\s*(?:-webkit-)?filter\s*:/i.test(block.declarations), block);
  assert(`css_logo_${index}_no_sharpen`, !/image-rendering\s*:/i.test(block.declarations), block);
  for (const width of block.declarations.matchAll(/(?:^|;)\s*width\s*:\s*(\d+)px/gi)) {
    assert(`css_logo_${index}_no_upscale_${width[1]}`, Number(width[1]) <= 500, block);
  }
}

assert("rollback_no_public_impact", contract.rollback?.public_asset_impact === "NONE" && contract.rollback?.public_route_impact === "NONE", contract.rollback);
assert("repetition_systemic", contract.repetition_test?.one_hundred_repetitions_improve_system === true && filled(contract.repetition_test?.reason_pt_br), contract.repetition_test);

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert("npm_script", pkg.scripts?.["test:logo-contract"] === "node tests/brand/test_logo_contract.mjs", pkg.scripts?.["test:logo-contract"]);
assert("npm_chain", String(pkg.scripts?.test ?? "").includes("npm run test:brand && npm run test:logo-contract"), pkg.scripts?.test);
const workflow = fs.readFileSync(path.join(root, ".github/workflows/site-ci.yml"), "utf8");
assert("workflow", workflow.includes("npm run test:brand\n          npm run test:logo-contract"), "site-ci.yml");
const graph = fs.readFileSync(path.join(root, "scripts/site/affected_graph.mjs"), "utf8");
for (const needle of [
  '"test:logo-contract"',
  "tests/brand/test_logo_contract.mjs",
  "data/brand/logo-contract.v1.json",
  "assets/logo-confenge-500-f8a83f6d.png",
  "assets/logo-confenge-white-500-1677038e.png",
]) assert(`graph_${needle}`, graph.includes(needle), needle);

const emDash = String.fromCodePoint(0x2014);
const enDash = String.fromCodePoint(0x2013);
const selfRaw = fs.readFileSync(selfPath, "utf8");
assert("no_em_dash_contract", !raw.includes(emDash), raw.indexOf(emDash));
assert("no_en_dash_contract", !raw.includes(enDash), raw.indexOf(enDash));
assert("no_em_dash_test", !selfRaw.includes(emDash), selfRaw.indexOf(emDash));
assert("no_en_dash_test", !selfRaw.includes(enDash), selfRaw.indexOf(enDash));

const failed = checks.filter((check) => !check.ok);
console.log(`logo-contract: ${checks.length - failed.length}/${checks.length} checks passed`);
console.log(`logo-contract: scanned ${htmlFiles.length} public HTML files and ${logoImages} logo images`);
if (failed.length) {
  console.error(`logo-contract: ${failed.length} check(s) failed`);
  process.exit(1);
}
