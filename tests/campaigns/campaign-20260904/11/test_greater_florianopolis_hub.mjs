/**
 * Campaign 11: fail-closed honesty over the shipped Greater Florianópolis hub.
 * Reads the real HTML and ledger. Does not reimplement the page, does not
 * hard-code a golden HTML blob, and does not require _site membership.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const CAMPAIGN_DIR = path.join(ROOT, "docs/campaigns/campaign-20260904/11");
const HUB_REL = "docs/campaigns/campaign-20260904/11/hub/grande-florianopolis/index.html";
const HUB_PATH = path.join(ROOT, HUB_REL);
const LEDGER_PATH = path.join(CAMPAIGN_DIR, "demand-ledger.json");
const DISTINCT_PATH = path.join(CAMPAIGN_DIR, "distinct-answer.md");
const SCHEMA_PATH = path.join(CAMPAIGN_DIR, "schema-decision.md");
const RESEARCH_PATH = path.join(CAMPAIGN_DIR, "intent-research.md");
const CONTRACTS_PATH = path.join(__dirname, "fixtures/contracts.draft.json");
const PUBLIC_ARTIFACT = path.join(ROOT, "scripts/pseo/public_artifact.py");
const FAMILY_REGISTRY = path.join(ROOT, "data/organic/public-family-registry.json");
const NOINDEX_GOV = path.join(ROOT, "data/organic/noindex-governance-registry.json");

const REQUIRED_FAMILIES = [
  "assistencia-tecnica-pericia",
  "avaliacao-de-imovel",
  "laudo-reforma-condominio",
  "inspecao-patologia",
  "orcamento-quantitativos",
  "bim-compatibilizacao",
  "sst",
];
const LEDGER_COLUMNS = [
  "query_visitor_job",
  "icp",
  "economic_relevance",
  "local_specificity",
  "current_owner",
  "proof",
  "canonical_route",
  "terminal_action",
  "measurement",
  "kill_condition",
];
const CITIES = ["Florianópolis", "São José", "Palhoça", "Biguaçu"];
const FORBIDDEN_CREDENTIALS = [
  "52.407.089/0001-09",
  "52407089000109",
  "205402-8",
  "2054028",
  "166954-1",
  "1669541",
  "2613212632",
  "Osmar Cunha",
  "88015-100",
  "Avenida Prefeito",
];
const PII_QUERY_KEYS = [
  "cpf",
  "nome",
  "name",
  "email",
  "telefone",
  "phone",
  "whatsapp",
  "processo",
  "autos",
  "prontuario",
  "prontuário",
  "rg",
  "endereco",
  "endereço",
  "matricula",
  "matrícula",
];
const STOREFRONT_CLAIMS = [
  "visite nosso escritório",
  "visite nosso escritorio",
  "horário de funcionamento",
  "horario de funcionamento",
  "como chegar",
  "openinghours",
  "walk-in office",
];

function deniedInWindow(text, phrase) {
  const lower = text.toLowerCase();
  const needle = phrase.toLowerCase();
  let from = 0;
  let found = false;
  while (from < lower.length) {
    const i = lower.indexOf(needle, from);
    if (i < 0) break;
    found = true;
    const window = lower.slice(Math.max(0, i - 96), i + needle.length + 48);
    if (!/\bn[aã]o\b|\bsem\b|\bnunca\b|\bjamais\b/.test(window)) return false;
    from = i + needle.length;
  }
  return true; // absent or every hit is denied
}
const EXTRA_SLUG_RE =
  /(^|\/)(florianopolis|sao-jose|sao_jose|palhoca|biguacu|bairro|forum|fórum)(\/|$)/i;
const B2G_HREFS = [
  "/diagnostico-b2g-360/",
  "/diretoria-b2g/",
  "/bid-room-licitacoes-obras/",
  "/defesa-margem-contratos-publicos/",
];

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
function assert(name, cond, detail) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

function extractHrefs(html) {
  const out = [];
  const re = /\bhref\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function queryKeys(href) {
  const qIndex = href.indexOf("?");
  if (qIndex < 0) return [];
  const q = href.slice(qIndex + 1).split("#")[0];
  return q.split("&").map((part) => decodeURIComponent(part.split("=")[0] || "").toLowerCase());
}

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    blocks.push(JSON.parse(m[1]));
  }
  return blocks;
}

function flattenNodes(node, acc = []) {
  if (!node) return acc;
  if (Array.isArray(node)) {
    for (const child of node) flattenNodes(child, acc);
    return acc;
  }
  if (typeof node === "object") {
    acc.push(node);
    if (node["@graph"]) flattenNodes(node["@graph"], acc);
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") flattenNodes(value, acc);
    }
  }
  return acc;
}

function typesOf(node) {
  const raw = node?.["@type"];
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map(String);
}

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

assert("hub_html_exists", fs.existsSync(HUB_PATH), HUB_PATH);
assert("ledger_exists", fs.existsSync(LEDGER_PATH), LEDGER_PATH);
assert("distinct_answer_exists", fs.existsSync(DISTINCT_PATH), DISTINCT_PATH);
assert("schema_decision_exists", fs.existsSync(SCHEMA_PATH), SCHEMA_PATH);
assert("intent_research_exists", fs.existsSync(RESEARCH_PATH), RESEARCH_PATH);
assert("draft_contracts_exist", fs.existsSync(CONTRACTS_PATH), CONTRACTS_PATH);

const html = fs.readFileSync(HUB_PATH, "utf8");
const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
const contracts = JSON.parse(fs.readFileSync(CONTRACTS_PATH, "utf8"));
const distinct = fs.readFileSync(DISTINCT_PATH, "utf8");
const schemaDoc = fs.readFileSync(SCHEMA_PATH, "utf8");
const research = fs.readFileSync(RESEARCH_PATH, "utf8");
const vis = visibleText(html);
const visLower = vis.toLowerCase();
const htmlLower = html.toLowerCase();

assert("single_canonical_link", (html.match(/rel=["']canonical["']/gi) || []).length === 1, html.match(/rel=["']canonical["'][^>]*>/gi));
assert(
  "canonical_is_grande_florianopolis",
  /rel=["']canonical["'][^>]*href=["']https:\/\/confenge\.com\.br\/grande-florianopolis\/["']/i.test(html) ||
    /href=["']https:\/\/confenge\.com\.br\/grande-florianopolis\/["'][^>]*rel=["']canonical["']/i.test(html),
  "canonical href",
);
assert("robots_meta_present", /<meta\b[^>]*name=["']robots["'][^>]*>/i.test(html), "robots meta");
assert("robots_contains_noindex", /name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html) || /content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(html), "noindex");
assert("robots_not_indexable", !/\bcontent=["'][^"']*\bindex\b/i.test(html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0] || "") || /noindex/i.test(html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0] || ""), "index token");

const robotsTag = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0] || "";
assert("robots_has_noindex_token", /noindex/i.test(robotsTag), robotsTag);
assert("robots_lacks_bare_index", !/(?:^|[,;\s])index(?:[,;\s]|$)/i.test(robotsTag.replace(/noindex/gi, "")), robotsTag);

for (const city of CITIES) {
  assert(`visible_city_${city}`, vis.includes(city), city);
}

assert("visible_inspection_area", /área de atendimento e inspeção|área de inspeção/i.test(vis), "inspection");
assert("visible_contract_address_not_storefront", /endereço contratual/i.test(vis) && /não é vitrine|não é publicado nesta página/i.test(vis), "contract address");
assert("visible_no_walkin", /não existe escritório de walk-in|sem walk-in|não há escritório de atendimento espontâneo/i.test(vis), "walk-in");
assert("visible_b2g_national", /capacidade nacional b2g|b2g nacional permanece/i.test(vis), "b2g");
assert("visible_not_availability_guarantee", /não é garantia de disponibilidade/i.test(vis), "availability");

for (const claim of STOREFRONT_CLAIMS) {
  assert(`no_storefront_claim_${claim}`, deniedInWindow(`${visLower} ${htmlLower}`, claim), claim);
}

assert("no_opening_hours_schema", !/"openingHours"/i.test(html), "openingHours");
assert("no_hasMap", !/"hasMap"/i.test(html), "hasMap");
assert("no_streetAddress", !/"streetAddress"/i.test(html), "streetAddress");
assert("no_PostalAddress", !/"PostalAddress"/i.test(html), "PostalAddress");
assert("no_LocalBusiness", !/"LocalBusiness"/i.test(html), "LocalBusiness");
assert("no_geo_node", !/"geo"\s*:/i.test(html), "geo");

let graphOk = true;
let nodes = [];
try {
  const blocks = jsonLdBlocks(html);
  assert("jsonld_parses", blocks.length >= 1, blocks.length);
  nodes = flattenNodes(blocks);
  const types = new Set(nodes.flatMap(typesOf));
  assert("schema_has_WebPage", types.has("WebPage"), [...types]);
  assert("schema_omits_LocalBusiness", !types.has("LocalBusiness"), [...types]);
  assert("schema_omits_ProfessionalService", !types.has("ProfessionalService"), [...types]);
  assert("schema_omits_PostalAddress", !types.has("PostalAddress"), [...types]);
  const cityNodes = nodes.filter((n) => typesOf(n).includes("City")).map((n) => n.name);
  for (const city of CITIES) {
    assert(`schema_city_${city}`, cityNodes.includes(city), cityNodes);
  }
} catch (err) {
  graphOk = false;
  fail("jsonld_parses", String(err));
}
assert("jsonld_graph_ok", graphOk, graphOk);

for (const cred of FORBIDDEN_CREDENTIALS) {
  assert(`no_copied_credential_${cred}`, !html.includes(cred) && !vis.includes(cred), cred);
}

assert("art_is_qualified_placeholder", /quando o ato e a atribuição profissional o exigirem/i.test(vis) && /não promete ART para todo ato/i.test(vis), "ART");
assert("credential_placeholder_present", /não são publicados aqui|não é publicado nesta página/i.test(vis), "credential placeholder");

const hrefs = extractHrefs(html);
const ctaHrefs = hrefs.filter((h) => h.includes("source=CONFENGE_WEB") || h.includes("wa.me"));
assert("cta_has_confenge_web_source", hrefs.some((h) => h.includes("source=CONFENGE_WEB")), hrefs.filter((h) => h.includes("source=")));
assert("cta_has_landing_family", hrefs.some((h) => /landing_family=grande-florianopolis-hub/.test(h)), "landing_family");
assert("cta_has_service_area", hrefs.some((h) => /service_area=grande-florianopolis/.test(h)), "service_area");
assert("outbound_eligible_false", /data-outbound-eligible="false"/.test(html) && ledger.invariants.outbound_eligible === false, ledger.invariants);
assert("auto_send_false", /data-auto-send="false"/.test(html) && ledger.invariants.auto_send === false, ledger.invariants);
assert("draft_invariants_match", contracts.invariants.outbound_eligible === false && contracts.invariants.auto_send === false, contracts.invariants);

for (const href of hrefs) {
  const keys = queryKeys(href);
  const leaked = keys.filter((k) => PII_QUERY_KEYS.includes(k));
  assert(`href_no_pii_keys_${href.slice(0, 80)}`, leaked.length === 0, { href, leaked });
}

const wa = hrefs.filter((h) => h.includes("wa.me"));
for (const href of wa) {
  assert("whatsapp_prefill_has_no_person_name", !/tiago|sasaki|cpf|processo/i.test(decodeURIComponent(href)), href);
}

assert("links_conflitos", hrefs.some((h) => h === "/conflitos/" || h.startsWith("/conflitos/")), hrefs);
assert("links_especialista", hrefs.some((h) => h.includes("/especialista/tiago-jun-sasaki/")), hrefs);
for (const route of B2G_HREFS) {
  assert(`links_b2g_${route}`, hrefs.includes(route), route);
  assert(`b2g_unmodified_${route}`, !hrefs.some((h) => h.includes(route) && /florianopolis|sao-jose|palhoca|biguacu/i.test(h)), hrefs.filter((h) => h.includes(route)));
}

const campaignFiles = walkFiles(CAMPAIGN_DIR).map((p) => path.relative(ROOT, p).replaceAll("\\", "/"));
const campaignHubHtml = campaignFiles.filter((p) => p.includes("/hub/") && p.endsWith(".html"));
assert("exactly_one_campaign_hub_html", campaignHubHtml.length === 1, campaignHubHtml);
assert("campaign_html_is_hub", campaignHubHtml[0] === HUB_REL, campaignHubHtml);
const extraHtml = campaignFiles.filter(
  (p) => p.endsWith(".html") && !p.includes("/hub/") && !p.includes("/evidence/"),
);
assert("no_extra_html_outside_hub_and_evidence", extraHtml.length === 0, extraHtml);

const extra = campaignFiles.filter((p) => EXTRA_SLUG_RE.test(p) && !p.includes("/hub/grande-florianopolis/"));
assert("no_extra_city_bairro_forum_paths", extra.length === 0, extra);

const topLevelSuspects = [
  "florianopolis",
  "sao-jose",
  "palhoca",
  "biguacu",
  "grande-florianopolis",
];
for (const slug of topLevelSuspects) {
  const abs = path.join(ROOT, slug, "index.html");
  assert(`no_public_top_level_${slug}`, !fs.existsSync(abs), abs);
}

const artifactSrc = fs.readFileSync(PUBLIC_ARTIFACT, "utf8");
const dirsMatch = artifactSrc.match(/PUBLIC_TOP_DIRS = frozenset\(\s*\{([\s\S]*?)\}\s*\)/);
assert("public_top_dirs_block_found", Boolean(dirsMatch), "PUBLIC_TOP_DIRS");
const dirBlock = dirsMatch ? dirsMatch[1] : "";
assert("hub_not_in_PUBLIC_TOP_DIRS", !/"grande-florianopolis"/.test(dirBlock), dirBlock.slice(0, 400));
assert("docs_is_forbidden_top", /"docs"/.test(artifactSrc), "docs forbidden");

const sitemapFiles = fs.readdirSync(ROOT).filter((n) => n.startsWith("sitemap") && n.endsWith(".xml"));
for (const name of sitemapFiles) {
  const body = fs.readFileSync(path.join(ROOT, name), "utf8");
  assert(`sitemap_${name}_omits_hub`, !body.includes("/grande-florianopolis/"), name);
}

assert("ledger_has_seven_families", Array.isArray(ledger.families) && ledger.families.length === 7, ledger.families?.map((f) => f.id));
const familyIds = new Set((ledger.families || []).map((f) => f.id));
for (const id of REQUIRED_FAMILIES) {
  assert(`ledger_family_${id}`, familyIds.has(id), id);
}
for (const col of LEDGER_COLUMNS) {
  assert(`ledger_declares_column_${col}`, (ledger.columns || []).includes(col), ledger.columns);
  for (const fam of ledger.families || []) {
    assert(`ledger_${fam.id}_${col}_filled`, typeof fam[col] === "string" && fam[col].trim().length > 0, { id: fam.id, col });
  }
}
for (const fam of ledger.families || []) {
  assert(`family_stays_on_hub_${fam.id}`, String(fam.canonical_route).startsWith("/grande-florianopolis/"), fam.canonical_route);
}
assert("distinct_answer_forbids_new_urls", /Answer: no|nenhuma delas vira slug|None of the seven families mints a new URL/i.test(distinct), "distinct-answer");
assert("research_records_unknown_volume", /Volume UNKNOWN|volume UNKNOWN|UNKNOWN/.test(research), "research UNKNOWN");
assert("schema_decision_omits_localbusiness", /Omit LocalBusiness/i.test(schemaDoc), "schema-decision");

assert("taxonomy_draft_id", ledger.taxonomy_version === contracts.taxonomy, ledger.taxonomy_version);
assert("intake_draft_id", ledger.intake_version === contracts.intake, ledger.intake_version);
assert("source_CONFENGE_WEB", ledger.source === "CONFENGE_WEB" && contracts.source === "CONFENGE_WEB", ledger.source);

assert("hub_not_in_public_family_registry", !fs.readFileSync(FAMILY_REGISTRY, "utf8").includes("/grande-florianopolis/"), "family registry");
assert("hub_not_in_noindex_governance_yet", !fs.readFileSync(NOINDEX_GOV, "utf8").includes("/grande-florianopolis/"), "noindex gov — fragment pending");

assert("visitor_job_nucleo", /qual núcleo/i.test(vis), "nucleo");
assert("visitor_job_visita", /visita/i.test(vis), "visita");
assert("visitor_job_documentos", /documentos mínimos/i.test(vis), "documentos");
assert("visitor_job_triagem", /triagem/i.test(vis) && /material sensível/i.test(vis), "triagem");
assert("mentions_triage_08", /#580|campanha 08/i.test(vis), "08");
assert("mentions_canary_09", /canário 09|campanha 09|private_project_technical_readiness/i.test(html), "09");
assert("lang_pt_br", /<html[^>]*lang=["']pt-BR["']/i.test(html), "lang");
assert("skip_link", /class="skip-link"/.test(html) && /href="#conteudo"/.test(html), "skip");
assert("h1_present", /<h1[\s>]/.test(html), "h1");
assert("no_em_dash", !html.includes("\u2014") && !html.includes("\u2013"), "dash");

const evidenceDir = path.join(CAMPAIGN_DIR, "evidence");
for (const shot of ["hub-390x844.png", "hub-1366x768.png"]) {
  const p = path.join(evidenceDir, shot);
  const size = fs.existsSync(p) ? fs.statSync(p).size : 0;
  assert(`evidence_${shot}_material`, size > 10_000, { p, size });
}
const headDump = path.join(evidenceDir, "hub-head.html");
assert("evidence_head_dump", fs.existsSync(headDump) && fs.readFileSync(headDump, "utf8").includes("noindex"), headDump);

const failed = results.filter((r) => !r.ok);
const passed = results.filter((r) => r.ok);
console.log(`greater-florianopolis-hub: ${passed.length}/${results.length} checks passed`);
if (failed.length) {
  process.exit(1);
}
