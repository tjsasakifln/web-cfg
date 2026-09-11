/**
 * POS-INB-20260911 campaign 05: four partner kits, no-JS hrefs, share honesty.
 * Imports the shipped resolver. Mutates catalog/files/clipboard for counterproofs.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import {
  DEDICATED_PURCHASE_PATHS,
  REQUIRED_KIT_IDS,
  SUBSTITUTE_DESTINATION,
  buildShareUrl,
  htmlAgreesWithSurfaces,
  loadKitCatalog,
  publicHtmlForbiddenPhrases,
  publicHtmlHasUtmOnInternalAnchors,
  publicSurfaces,
  resolveKits,
  routeExists,
} from "../../../scripts/distribution/partner_reference.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

function fail(name, detail) {
  console.error("FAIL", name, detail);
  process.exit(1);
}
function pass(name, detail) {
  console.log("PASS", name, detail || "");
}

const catalog = loadKitCatalog(root);
const kits = resolveKits(root);
const surfaces = publicSurfaces(root);
const html = fs.readFileSync(path.join(root, "parcerias-engenharia/index.html"), "utf8");
const shareJs = fs.readFileSync(path.join(root, "parcerias-engenharia/share.js"), "utf8");

if (kits.length !== 4) fail("four_kits", kits.map((k) => k.id));
for (const id of REQUIRED_KIT_IDS) {
  const kit = kits.find((item) => item.id === id);
  if (!kit || kit.status !== "ok") fail("kit_not_ok", id);
  if (kit.destination.path !== DEDICATED_PURCHASE_PATHS[id]) fail("dedicated_mismatch", id);
  if (!routeExists(root, kit.destination.path)) fail("dest_file", id);
  if (kit.destination.path === SUBSTITUTE_DESTINATION) fail("substitute", id);
  if (!kit.destination.proposal_href) fail("no_proposal", id);
}
pass("four_dedicated_kits_with_proposal");

const orc = kits.find((k) => k.id === "orcamento-quantitativos");
if (orc.sample.kind !== "quantitativos_planilha") fail("orc_kind", orc.sample);
if (String(orc.sample.path).includes("modelo-base-quantitativa-canonica")) fail("orc_legacy_sample");
if (!String(orc.sample.href).includes("#quantitativos")) fail("orc_fragment", orc.sample);
const rev = kits.find((k) => k.id === "revisao-tecnica");
if (rev.sample.kind !== "review_findings") fail("rev_kind", rev.sample);
if (!String(rev.sample.href).includes("apontamento") && !String(rev.sample.href).includes("#extrato-demonstrativo")) {
  fail("rev_fragment", rev.sample);
}
const compat = kits.find((k) => k.id === "compatibilizacao-interfaces");
if (compat.sample.kind !== "clash_interfaces") fail("compat_kind", compat.sample);
if (!String(compat.sample.href).includes("#registro-interferencias")) fail("compat_fragment", compat.sample);
const elab = kits.find((k) => k.id === "elaboracao-complementar");
if (elab.sample.kind === "clash_interfaces") fail("elab_clash");
if (elab.sample.kind !== "illustrative_schema" || !elab.sample.labeled_as_illustration) {
  fail("elab_illustration", elab.sample);
}
pass("sample_kinds_and_fragments");

const mismatches = htmlAgreesWithSurfaces(html, surfaces);
if (mismatches.length) fail("html_vs_resolver", mismatches);
if (publicHtmlHasUtmOnInternalAnchors(html)) fail("internal_utm");
const forbidden = publicHtmlForbiddenPhrases(html);
if (forbidden.length) fail("forbidden", forbidden);
if (html.includes(SUBSTITUTE_DESTINATION)) fail("html_substitute");
if (!/property="og:image"/.test(html) || !html.includes("https://confenge.com.br/assets/og-confenge.jpg")) {
  fail("og_image");
}
if (!fs.existsSync(path.join(root, "assets/og-confenge.jpg"))) fail("og_file");
pass("html_agrees_og_no_utm");

for (const surface of surfaces) {
  const article = html.split(`id="kit-${surface.id}"`)[1];
  if (!article) fail("article_missing", surface.id);
  const chunk = article.split("</article>")[0];
  if (!chunk.includes(`href="${surface.destinationHref}"`)) fail("nojs_dest", surface.id);
  if (!chunk.includes(`href="${surface.sampleHref}"`)) fail("nojs_sample", surface.id);
  if (!chunk.includes(`href="${surface.proposalHref}"`)) fail("nojs_proposal", surface.id);
  if (!chunk.includes(surface.shareCanonical)) fail("nojs_share_canonical", surface.id);
  if (!chunk.includes(surface.copyable_summary.split("\n")[0])) fail("nojs_summary", surface.id);
  if (!chunk.includes("hidden=\"\"") && !chunk.includes("hidden=")) fail("copy_btn_not_hidden_nojs", surface.id);
}
pass("nojs_hrefs_and_selectable_summary");

const mutated = JSON.parse(JSON.stringify(catalog));
const revKit = mutated.kits.find((k) => k.id === "revisao-tecnica");
const elabKit = mutated.kits.find((k) => k.id === "elaboracao-complementar");
revKit.destination = { ...elabKit.destination };
revKit.sample = { ...elabKit.sample };
const swapped = resolveKits(root, { catalog: mutated });
const swappedRev = swapped.find((k) => k.id === "revisao-tecnica");
if (swappedRev.status !== "refused" || swappedRev.reason !== "kit_sample_mismatch") {
  fail("swap_not_refused", swappedRev);
}
for (const id of ["orcamento-quantitativos", "compatibilizacao-interfaces", "elaboracao-complementar"]) {
  const kit = swapped.find((k) => k.id === id);
  if (kit.status !== "ok" || kit.destination.status !== "present") fail("swap_blocked_legit", id);
}
const restoredAfterSwap = resolveKits(root);
if (restoredAfterSwap.find((k) => k.id === "revisao-tecnica").status !== "ok") {
  fail("swap_did_not_restore");
}
pass("counterproof_swap_revisao_elaboracao");

const csvRel = "casos/demonstrativo-projeto-privado/data/quantitativos.csv";
if (!fs.existsSync(path.join(root, csvRel))) fail("csv_fixture_missing", csvRel);
const withoutCsv = resolveKits(root, {
  fileExists: (innerRoot, rel) => {
    if (rel === csvRel) return false;
    return fs.existsSync(path.join(innerRoot, rel));
  },
});
const orcMissing = withoutCsv.find((k) => k.id === "orcamento-quantitativos");
if (orcMissing.sample.status === "present") fail("csv_still_present", orcMissing.sample);
if (orcMissing.destination.status !== "present") fail("csv_blocked_destination", orcMissing.destination);
if (orcMissing.destination.path !== DEDICATED_PURCHASE_PATHS["orcamento-quantitativos"]) {
  fail("csv_changed_destination", orcMissing.destination.path);
}
if (!routeExists(root, orcMissing.destination.path)) fail("canonical_dest_gone_after_csv");
const restoredAfterCsv = resolveKits(root);
if (restoredAfterCsv.find((k) => k.id === "orcamento-quantitativos").sample.status !== "present") {
  fail("csv_did_not_restore");
}
pass("counterproof_remove_orcamento_csv");

const sandbox = {
  window: { dataLayer: [] },
  document: {
    readyState: "complete",
    querySelectorAll: () => [],
    addEventListener: () => {},
    execCommand: () => false,
  },
  navigator: {
    clipboard: {
      writeText() {
        return Promise.reject(new Error("clipboard_denied"));
      },
    },
  },
  console,
};
vm.runInNewContext(shareJs, sandbox);
const api = sandbox.window.confengePartnerShare;
const status = { hidden: true, textContent: "", setAttribute() {} };
const input = {
  value: surfaces[0].shareCanonical,
  focus() {},
  select() {},
  setSelectionRange() {},
};
const listeners = {};
const copyBtn = {
  hidden: true,
  addEventListener(type, fn) {
    listeners[type] = fn;
  },
};
const fakeRoot = {
  querySelector(sel) {
    if (sel === "[data-share-status]") return status;
    if (sel === "[data-share-url]") return input;
    if (sel === "[data-share-copy]") return copyBtn;
    return null;
  },
  getAttribute(name) {
    if (name === "data-share-attributed") return surfaces[0].external.url;
    if (name === "data-share-canonical") return surfaces[0].shareCanonical;
    if (name === "data-cta-id") return "share-copy-kit-orcamento";
    if (name === "data-share-title") return surfaces[0].title;
    return "";
  },
};
api.bindRoot(fakeRoot);
await listeners.click();
if (status.textContent === api.COPY_LINK_OK || /link copiado/i.test(status.textContent)) {
  fail("clipboard_reject_claimed_success", status.textContent);
}
if (status.textContent !== api.COPY_FAIL) fail("clipboard_reject_message", status.textContent);
pass("counterproof_clipboard_reject");

const utmInternal = buildShareUrl({
  destination: DEDICATED_PURCHASE_PATHS["revisao-tecnica"],
  mode: "internal",
  params: { utm_source: "partner_kit", utm_campaign: "overwrite_acquisition", utm_medium: "cpc" },
}, root);
if (!utmInternal.ok) fail("utm_internal_build", utmInternal);
if (/utm_/i.test(utmInternal.url)) fail("utm_internal_kept", utmInternal.url);
if (utmInternal.url !== DEDICATED_PURCHASE_PATHS["revisao-tecnica"]) {
  fail("utm_internal_path", utmInternal.url);
}
if (publicHtmlHasUtmOnInternalAnchors(html)) fail("html_internal_utm_after_builder");
pass("counterproof_internal_utm_stripped");

const evilCatalog = JSON.parse(JSON.stringify(catalog));
evilCatalog.kits[0].destination.path = "https://evil.example/phish";
const evilResolved = resolveKits(root, { catalog: evilCatalog });
const evilShare = buildShareUrl({
  destination: evilCatalog.kits[0].destination.path,
  mode: "external",
  params: { utm_source: "partner_kit" },
}, root);
if (evilShare.ok || evilShare.reason !== "destination_not_allowlisted") {
  fail("evil_catalog_share", evilShare);
}
const jsShare = buildShareUrl({ destination: "javascript:alert(1)", mode: "external" }, root);
if (jsShare.ok) fail("javascript_share", jsShare);
const legit = buildShareUrl({
  destination: DEDICATED_PURCHASE_PATHS["compatibilizacao-interfaces"],
  mode: "external",
  params: { utm_source: "partner_kit" },
}, root);
if (!legit.ok || !legit.url.startsWith("https://confenge.com.br/compatibilizacao-projetos-engenharia/")) {
  fail("evil_blocked_legit", legit);
}
if (evilResolved.find((k) => k.id === "revisao-tecnica").status !== "ok") {
  fail("evil_blocked_other_kit");
}
pass("counterproof_malicious_destination");

if (/fetch\s*\(|XMLHttpRequest|auto_send/.test(shareJs) && /lead/.test(shareJs)) {
  fail("share_js_lead");
}
pass("share_js_no_lead_fetch");

console.log("OK pos-inb-20260911/05 partner kits");
