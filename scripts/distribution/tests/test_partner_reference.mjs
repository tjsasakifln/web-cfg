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
  buildShareUrl,
  classifyShareAction,
  draftsLeakIntoPublicArtifact,
  loadKitCatalog,
  publicHtmlForbiddenPhrases,
  publicHtmlHasUtmOnInternalAnchors,
  resolveKits,
  routeExists,
  send,
  shareScriptSendsOutreach,
  SITE_ORIGIN,
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
pass("catalog_prepare_only");

const kits = resolveKits(root);
if (kits.length !== 3) fail("three_kits", kits.map((k) => k.id));
const byId = Object.fromEntries(kits.map((k) => [k.id, k]));
for (const id of ["orcamento-quantitativos", "revisao-compatibilizacao", "complementares"]) {
  if (!byId[id]) fail("missing_kit", id);
  if (byId[id].destination.status !== "present") fail("destination_missing", id);
  if (byId[id].destination.path === "/" || byId[id].destination.path === "") {
    fail("destination_is_home", id);
  }
  if (!byId[id].conversation?.needed?.length) fail("conversation_missing", id);
}
if (byId["orcamento-quantitativos"].sample.status !== "present") {
  fail("orcamento_sample", byId["orcamento-quantitativos"].sample);
}
if (byId["revisao-compatibilizacao"].sample.status !== "present") {
  fail("revisao_sample", byId["revisao-compatibilizacao"].sample);
}
if (byId.complementares.sample.status === "present") {
  if (!routeExists(root, byId.complementares.sample.path)) {
    fail("complementares_sample_unresolved", byId.complementares.sample);
  }
} else if (byId.complementares.sample.status !== "not_included") {
  fail("complementares_sample_status", byId.complementares.sample);
}
pass("kits_resolve_destination_sample_conversation");

const htmlPath = path.join(root, "parcerias-engenharia/index.html");
const html = fs.readFileSync(htmlPath, "utf8");
if (!html.includes('rel="canonical"') || !html.includes("https://confenge.com.br/parcerias-engenharia/")) {
  fail("canonical_missing", "page canonical");
}
for (const kit of kits) {
  if (!html.includes(kit.destination.path)) fail("html_missing_destination", kit.id);
  if (kit.sample.status === "present" && kit.sample.path && !html.includes(kit.sample.path)) {
    fail("html_missing_sample", kit.id);
  }
}
if (/em breve|quando estiver pront|entrega pendente|página em construção/i.test(html)) {
  fail("pending_promise", "complementares announced a missing delivery");
}
if (!html.includes('id="share-url-orcamento"') || !html.includes("https://confenge.com.br/quantitativos-orcamento-obras/")) {
  fail("share_fallback_canonical", "orcamento input");
}
if (publicHtmlHasUtmOnInternalAnchors(html)) fail("internal_utm", "anchor href carries utm_");
const forbidden = publicHtmlForbiddenPhrases(html);
if (forbidden.length) fail("forbidden_public_phrases", forbidden);
if (!html.includes("Descrever uma necessidade") || /agendar reuni[aã]o|marcar demonstra[cç][aã]o/i.test(html)) {
  fail("cta_imposes_meeting", "hero/contact cta");
}
pass("public_html_kits_canonical_no_utm_no_forbidden");

const internal = buildShareUrl({
  destination: "/quantitativos-orcamento-obras/",
  mode: "internal",
  params: { utm_source: "partner_kit", utm_campaign: "inb11_orcamento" },
}, root);
if (!internal.ok) fail("internal_share_ok", internal);
if (internal.url !== "/quantitativos-orcamento-obras/") fail("internal_share_path", internal.url);
if (/utm_/i.test(internal.url)) fail("internal_share_utm", internal.url);
pass("internal_share_strips_utm");

const external = buildShareUrl({
  destination: "/quantitativos-orcamento-obras/",
  mode: "external",
  params: {
    utm_source: "partner_kit",
    utm_medium: "referral",
    utm_campaign: "inb11_orcamento",
    cta_id: "share-copy-kit-orcamento",
    asset_id: "partner-reference-kits-v1",
    route_family: "parcerias-engenharia",
  },
}, root);
if (!external.ok) fail("external_share_ok", external);
for (const key of ["utm_source", "utm_medium", "utm_campaign", "cta_id", "asset_id", "route_family"]) {
  if (!leadCore.ATTR_ALLOWLIST.includes(key)) fail("param_not_allowlisted", key);
  if (external.params[key] == null) fail("external_missing_allowlisted", key);
}
pass("external_share_allowlisted_params");

const attributedFromPage = html.match(/data-share-attributed="([^"]+)"/);
if (!attributedFromPage) fail("html_attributed_missing");
const decodedAttr = attributedFromPage[1].replaceAll("&amp;", "&");
const rebuilt = buildShareUrl({
  destination: "/quantitativos-orcamento-obras/",
  mode: "external",
  params: {
    utm_source: "partner_kit",
    utm_medium: "referral",
    utm_campaign: "inb11_orcamento",
    cta_id: "share-copy-kit-orcamento",
    asset_id: "partner-reference-kits-v1",
    route_family: "parcerias-engenharia",
  },
}, root);
const rebuiltUrl = new URL(rebuilt.url);
const htmlUrl = new URL(decodedAttr);
if (rebuiltUrl.origin + rebuiltUrl.pathname !== htmlUrl.origin + htmlUrl.pathname) {
  fail("html_attributed_path", { rebuilt: rebuilt.url, html: decodedAttr });
}
for (const key of rebuiltUrl.searchParams.keys()) {
  if (htmlUrl.searchParams.get(key) !== rebuiltUrl.searchParams.get(key)) {
    fail("html_attributed_param", { key, rebuilt: rebuiltUrl.searchParams.get(key), html: htmlUrl.searchParams.get(key) });
  }
}
for (const key of htmlUrl.searchParams.keys()) {
  if (!leadCore.ATTR_ALLOWLIST.includes(key)) fail("html_attr_not_allowlisted", key);
  if (htmlUrl.searchParams.get(key) !== rebuiltUrl.searchParams.get(key)) {
    fail("html_extra_or_mismatch_param", key);
  }
}
pass("html_attributed_url_matches_builder");

const piiAttempt = buildShareUrl({
  destination: "/quantitativos-orcamento-obras/",
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
  destination: "/quantitativos-orcamento-obras/",
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
  destination: `${SITE_ORIGIN}/servicos/#servico-projeto`,
  mode: "external",
  params: { utm_source: "partner_kit" },
}, root);
if (!restoredDest.ok || !restoredDest.url.startsWith("https://confenge.com.br/servicos/")) {
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
const sandbox = {
  window: { dataLayer: [] },
  document: {
    readyState: "complete",
    querySelectorAll: () => [],
    addEventListener: () => {},
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
