/**
 * Drives shipped partner-reference kit resolution and share-link construction.
 * Mutations restore after each failure case. No mock of the unit under test.
 */
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import {
  REQUIRED_KIT_IDS,
  DEDICATED_PURCHASE_PATHS,
  SUBSTITUTE_DESTINATION,
  SITE_ORIGIN,
  buildShareUrl,
  classifyShareAction,
  draftsLeakIntoPublicArtifact,
  htmlAgreesWithSurfaces,
  loadKitCatalog,
  publicHtmlForbiddenPhrases,
  publicHtmlHasUtmOnInternalAnchors,
  publicSurfaces,
  resolveKits,
  routeExists,
  send,
  shareScriptSendsOutreach,
} from "../partner_reference.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);
const leadCore = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));

function fail(name, detail) {
  console.error("FAIL", name, detail);
  process.exit(1);
}
function pass(name, detail) {
  console.log("PASS", name, detail || "");
}

const catalog = loadKitCatalog(root);
if (catalog.auto_send !== false) fail("catalog_auto_send", catalog.auto_send);
if (catalog.send_forbidden !== true) fail("catalog_send_forbidden", catalog.send_forbidden);
if (catalog.kits.length !== 4) fail("four_kits_catalog", catalog.kits.map((k) => k.id));
pass("catalog_prepare_only");

const kits = resolveKits(root);
if (kits.length !== 4) fail("four_kits", kits.map((k) => k.id));
const byId = Object.fromEntries(kits.map((k) => [k.id, k]));
for (const id of REQUIRED_KIT_IDS) {
  if (!byId[id]) fail("missing_kit", id);
  if (byId[id].status !== "ok") fail("kit_not_ok", { id, status: byId[id].status, reason: byId[id].reason });
  if (byId[id].destination.status !== "present") fail("destination_missing", id);
  if (byId[id].destination.path !== DEDICATED_PURCHASE_PATHS[id]) {
    fail("destination_not_dedicated", { id, path: byId[id].destination.path, expected: DEDICATED_PURCHASE_PATHS[id] });
  }
  if (byId[id].destination.path === "/" || byId[id].destination.path === "") {
    fail("destination_is_home", id);
  }
  if (byId[id].destination.path === SUBSTITUTE_DESTINATION) {
    fail("destination_is_substitute", id);
  }
  if (!routeExists(root, byId[id].destination.path)) fail("destination_file_missing", id);
  if (!byId[id].conversation?.needed?.length) fail("conversation_missing", id);
  if (byId[id].sample.status !== "present") fail("sample_missing", { id, sample: byId[id].sample });
  if (!byId[id].destination.proposal_href) fail("proposal_missing", id);
}

if (byId["orcamento-quantitativos"].sample.kind !== "quantitativos_planilha") {
  fail("orcamento_sample_kind", byId["orcamento-quantitativos"].sample);
}
if (byId["orcamento-quantitativos"].sample.path === "/casos/modelo-base-quantitativa-canonica/") {
  fail("orcamento_sample_legacy", byId["orcamento-quantitativos"].sample);
}
if (!byId["orcamento-quantitativos"].sample.href.includes("#quantitativos")) {
  fail("orcamento_sample_fragment", byId["orcamento-quantitativos"].sample);
}
if (byId["revisao-tecnica"].sample.kind !== "review_findings") {
  fail("revisao_sample_kind", byId["revisao-tecnica"].sample);
}
if (!byId["revisao-tecnica"].sample.href.includes("#extrato-demonstrativo")) {
  fail("revisao_sample_fragment", byId["revisao-tecnica"].sample);
}
if (byId["compatibilizacao-interfaces"].sample.kind !== "clash_interfaces") {
  fail("compat_sample_kind", byId["compatibilizacao-interfaces"].sample);
}
if (!byId["compatibilizacao-interfaces"].sample.href.includes("#registro-interferencias")) {
  fail("compat_sample_fragment", byId["compatibilizacao-interfaces"].sample);
}
if (byId["elaboracao-complementar"].sample.kind !== "illustrative_schema") {
  fail("elaboracao_sample_kind", byId["elaboracao-complementar"].sample);
}
if (byId["elaboracao-complementar"].sample.kind === "clash_interfaces") {
  fail("elaboracao_uses_clash", byId["elaboracao-complementar"].sample);
}
if (!byId["elaboracao-complementar"].sample.labeled_as_illustration) {
  fail("elaboracao_not_labeled_illustration", byId["elaboracao-complementar"].sample);
}
pass("kits_resolve_destination_sample_conversation");

const htmlPath = path.join(root, "parcerias-engenharia/index.html");
const html = fs.readFileSync(htmlPath, "utf8");
if (!html.includes('rel="canonical"') || !html.includes("https://confenge.com.br/parcerias-engenharia/")) {
  fail("canonical_missing", "page canonical");
}
if (html.includes(SUBSTITUTE_DESTINATION)) {
  fail("html_still_uses_substitute", SUBSTITUTE_DESTINATION);
}
if (html.includes("/casos/modelo-base-quantitativa-canonica/")) {
  fail("html_legacy_orcamento_sample");
}
const surfaces = publicSurfaces(root);
const htmlMismatches = htmlAgreesWithSurfaces(html, surfaces);
if (htmlMismatches.length) fail("html_vs_resolver", htmlMismatches);
if (/em breve|quando estiver pront|entrega pendente|página em construção/i.test(html)) {
  fail("pending_promise", "announced a missing delivery");
}
if (!html.includes('id="share-url-orcamento"')) fail("share_fallback_canonical", "orcamento input");
if (publicHtmlHasUtmOnInternalAnchors(html)) fail("internal_utm", "anchor href carries utm_");
const forbidden = publicHtmlForbiddenPhrases(html);
if (forbidden.length) fail("forbidden_public_phrases", forbidden);
if (!html.includes("Descrever uma necessidade") || /agendar reuni[aã]o|marcar demonstra[cç][aã]o/i.test(html)) {
  fail("cta_imposes_meeting", "hero/contact cta");
}
if (!html.includes('property="og:image"') || !html.includes("https://confenge.com.br/assets/og-confenge.jpg")) {
  fail("og_image_missing");
}
const ogImageRel = "assets/og-confenge.jpg";
if (!fs.existsSync(path.join(root, ogImageRel))) fail("og_image_file_missing", ogImageRel);
if (!html.includes('property="og:title"') || !html.includes('property="og:description"')) {
  fail("og_title_description_missing");
}
if (!html.includes("<title>") || !html.includes('name="description"')) {
  fail("title_description_missing");
}
for (const kit of kits) {
  if (!html.includes(`id="share-summary-${kit.id === "orcamento-quantitativos" ? "orcamento" : kit.id === "revisao-tecnica" ? "revisao" : kit.id === "compatibilizacao-interfaces" ? "compatibilizacao" : "elaboracao"}"`)) {
    fail("copyable_summary_missing", kit.id);
  }
}
pass("public_html_kits_canonical_no_utm_no_forbidden");

const internal = buildShareUrl({
  destination: byId["orcamento-quantitativos"].destination.path,
  mode: "internal",
  params: { utm_source: "partner_kit", utm_campaign: "posinb05_orcamento" },
}, root);
if (!internal.ok) fail("internal_share_ok", internal);
if (internal.url !== byId["orcamento-quantitativos"].destination.path) fail("internal_share_path", internal.url);
if (/utm_/i.test(internal.url)) fail("internal_share_utm", internal.url);
pass("internal_share_strips_utm");

const orcShare = surfaces.find((s) => s.id === "orcamento-quantitativos");
if (!orcShare.external.ok) fail("external_share_ok", orcShare.external);
for (const key of Object.keys(orcShare.external.params)) {
  if (!leadCore.ATTR_ALLOWLIST.includes(key)) fail("param_not_allowlisted", key);
}
pass("external_share_allowlisted_params");

const attributedAttrs = [...html.matchAll(/data-share-attributed="([^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
if (attributedAttrs.length !== 4) fail("html_attributed_count", attributedAttrs.length);
for (const surface of surfaces) {
  const decoded = attributedAttrs.find((url) => url.includes(surface.destinationHref.replace(/\/$/, "")));
  if (!decoded) fail("html_attributed_missing_kit", surface.id);
  const rebuiltUrl = new URL(surface.external.url);
  const htmlUrl = new URL(decoded);
  if (rebuiltUrl.origin + rebuiltUrl.pathname !== htmlUrl.origin + htmlUrl.pathname) {
    fail("html_attributed_path", { kit: surface.id, rebuilt: surface.external.url, html: decoded });
  }
  if (rebuiltUrl.hash !== htmlUrl.hash) {
    fail("html_attributed_hash", { kit: surface.id, rebuilt: rebuiltUrl.hash, html: htmlUrl.hash });
  }
  for (const key of rebuiltUrl.searchParams.keys()) {
    if (htmlUrl.searchParams.get(key) !== rebuiltUrl.searchParams.get(key)) {
      fail("html_attributed_param", { kit: surface.id, key });
    }
  }
  for (const key of htmlUrl.searchParams.keys()) {
    if (!leadCore.ATTR_ALLOWLIST.includes(key)) fail("html_attr_not_allowlisted", key);
  }
}
pass("html_attributed_url_matches_builder");

const piiAttempt = buildShareUrl({
  destination: byId["orcamento-quantitativos"].destination.path,
  mode: "external",
  params: {
    utm_source: "partner_kit",
    utm_campaign: "alice@escritorio.com",
    email: "alice@escritorio.com",
    nome: "Alice Silva",
    cpf: "123.456.789-09",
    partner_email: "bob@parceiro.com",
    destinatario_nome: "Carla",
    cta_id: "share-copy-kit-orcamento",
  },
}, root);
if (!piiAttempt.ok) fail("pii_attempt_should_still_build", piiAttempt);
if (piiAttempt.params.email || piiAttempt.params.nome || piiAttempt.params.cpf) {
  fail("pii_keys_kept", piiAttempt.params);
}
if (piiAttempt.params.partner_email || piiAttempt.params.destinatario_nome) {
  fail("partner_identity_kept", piiAttempt.params);
}
if (piiAttempt.params.utm_campaign) fail("pii_in_utm_campaign", piiAttempt.params.utm_campaign);
if (/alice@|123\.456\.789-09|Alice Silva|Carla/i.test(piiAttempt.url)) {
  fail("pii_leaked_into_url", piiAttempt.url);
}
const restored = buildShareUrl({
  destination: byId["orcamento-quantitativos"].destination.path,
  mode: "external",
  params: { utm_source: "partner_kit", cta_id: "share-copy-kit-orcamento" },
}, root);
if (!restored.ok || restored.params.utm_source !== "partner_kit") {
  fail("pii_mutation_restore", restored);
}
pass("mutation_pii_dropped_then_restored");

const evil = buildShareUrl({
  destination: "https://evil.example/phish",
  mode: "external",
  params: { utm_source: "partner_kit" },
}, root);
if (evil.ok || evil.url) fail("evil_destination_accepted", evil);
if (evil.reason !== "destination_not_allowlisted") fail("evil_reason", evil);
const javascriptUrl = buildShareUrl({ destination: "javascript:alert(1)", mode: "external" }, root);
if (javascriptUrl.ok) fail("javascript_destination_accepted", javascriptUrl);
const protocolRelative = buildShareUrl({ destination: "//evil.example/x", mode: "external" }, root);
if (protocolRelative.ok) fail("protocol_relative_accepted", protocolRelative);
const restoredDest = buildShareUrl({
  destination: `${SITE_ORIGIN}${DEDICATED_PURCHASE_PATHS["orcamento-quantitativos"]}`,
  mode: "external",
  params: { utm_source: "partner_kit" },
}, root);
if (!restoredDest.ok || !restoredDest.url.startsWith(`${SITE_ORIGIN}/quantitativos-orcamento-obras/`)) {
  fail("evil_mutation_restore", restoredDest);
}
pass("mutation_open_redirect_refused_then_restored");

const classified = classifyShareAction(root);
if (classified.event !== "cta_click") fail("share_event", classified);
if (classified.layer !== "engagement") fail("share_layer", classified);
if (classified.is_lead || classified.is_relationship || classified.is_partner_contact) {
  fail("share_classified_as_relationship", classified);
}
if (!classified.lead_events.includes("lead_persisted")) fail("lead_events_missing", classified);
pass("share_is_engagement_not_lead");

const shareJs = fs.readFileSync(path.join(root, "parcerias-engenharia/share.js"), "utf8");
if (shareScriptSendsOutreach(shareJs)) fail("share_js_outreach", "fetch/smtp detected");
if (/\/\.netlify\/functions\/lead/.test(shareJs)) fail("share_js_lead_endpoint");
if (/wa\.me|mailto:|location\.href\s*=/.test(shareJs)) fail("share_js_opens_app");
const sandbox = {
  window: { dataLayer: [] },
  document: {
    readyState: "complete",
    querySelectorAll: () => [],
    addEventListener: () => {},
    execCommand: () => false,
  },
  navigator: {},
  console,
};
sandbox.window.confengePartnerShare = undefined;
vm.runInNewContext(shareJs, sandbox);
const runtimeClassified = sandbox.window.confengePartnerShare.classifyShareAction();
if (runtimeClassified.is_lead || runtimeClassified.is_partner_contact) {
  fail("share_js_classifies_lead", runtimeClassified);
}
pass("share_js_no_send_not_lead");

const draftsDir = path.join(root, "docs/campaigns/inb-20260911/11");
for (const name of ["approach-drafts.md", "external-directories-plan.md", "inventory.md"]) {
  if (!fs.existsSync(path.join(draftsDir, name))) fail("missing_draft", name);
}
const leaked = draftsLeakIntoPublicArtifact(root);
if (Array.isArray(leaked) && leaked.length) fail("drafts_in_site", leaked);
if (html.toLowerCase().includes("approach-drafts") || html.includes("auto_send")) {
  fail("drafts_linked_from_public_html");
}
pass("internal_drafts_not_public");

let sendThrew = false;
try {
  send();
} catch (err) {
  sendThrew = String(err.message) === "partner_reference_send_forbidden";
}
if (!sendThrew) fail("send_did_not_fail_closed");
pass("send_fails_closed");

console.log("OK partner_reference");
