/**
 * Directed gate for INB-20260911 campaign 14.
 * Reads shipped 14A/14B HTML and campaign receipts. Does not reimplement copy.
 *
 *   node tests/commercial/test_inb14_pericias_sst.mjs
 *   node tests/commercial/test_inb14_pericias_sst.mjs --mutate
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MUTATE = process.argv.includes("--mutate");
const results = [];

function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) {
    console.error("FAIL", name, detail === undefined || detail === "" ? "" : detail);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonLd(html) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      blocks.push(null);
    }
  }
  return blocks.filter(Boolean);
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  for (const value of Object.values(node)) walk(value, visit);
}

function jsonLdServiceFields(html) {
  const fields = [];
  for (const block of parseJsonLd(html)) {
    walk(block, (node) => {
      if (node["@type"] === "Service" || (Array.isArray(node["@type"]) && node["@type"].includes("Service"))) {
        fields.push([node.name, node.serviceType, node.description].filter(Boolean).join(" "));
      }
    });
  }
  return fields.join(" | ");
}

function metaBlob(html) {
  const bits = [];
  const title = html.match(/<title>([^<]*)<\/title>/i);
  if (title) bits.push(title[1]);
  const re = /<meta\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const tag = match[0];
    const content = tag.match(/\bcontent="([^"]*)"/i);
    if (content) bits.push(content[1]);
  }
  return bits.join(" | ");
}

function mainHtml(html) {
  return html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
}

function contactHrefs(html) {
  const hrefs = [];
  const re = /href="((?:https:\/\/wa\.me\/|mailto:|tel:)[^"]+)"/gi;
  let match;
  while ((match = re.exec(html))) hrefs.push(match[1]);
  return hrefs;
}

function decodeHref(href) {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

const PII_IN_CONTACT = /processo|autos|trabalhador|cpf|reclamante|\br[eé]u\b|atestado|laudo pericial anexo/i;
const SCHEMA_OVERCLAIM = /perito nomeado|êxito garantido|êxito jur[ií]dico|parecer favor[aá]vel|PGR incluso no pacote|ato m[eé]dico|exame m[eé]dico ocupacional|engenheiro de seguran[cç]a do trabalho/i;

function scanPage(label, html, spec) {
  const visible = visibleText(html);
  const main = visibleText(mainHtml(html));
  const schema = jsonLdServiceFields(html);
  const meta = metaBlob(html);
  const hrefs = contactHrefs(html);
  const decoded = hrefs.map(decodeHref).join(" ");

  assert(`${label}_file_nonempty`, html.length > 2000, html.length);
  assert(`${label}_h1`, new RegExp(`<h1[^>]*>\\s*${spec.h1}\\s*</h1>`, "i").test(html), spec.h1);
  assert(`${label}_canonical`, html.includes(`rel="canonical"`) && html.includes(spec.canonical), spec.canonical);
  assert(`${label}_robots_index`, /<meta(?=[^>]*name="robots")(?=[^>]*content="index,follow)/i.test(html), "robots");
  assert(`${label}_no_file_input`, !/\btype=["']file["']/i.test(html), "type=file");
  assert(`${label}_no_capture_form`, !/data-adaptive-intake-form/.test(html) && !/<form\b/i.test(html), "form");
  assert(`${label}_three_channels`, (html.match(/data-fallback-channel=/g) || []).length === 3, html.match(/data-fallback-channel=/g));
  assert(`${label}_whatsapp`, hrefs.some((h) => h.startsWith("https://wa.me/5548988344559")), hrefs);
  assert(`${label}_mailto`, hrefs.some((h) => h.startsWith("mailto:tiago.sasaki@confenge.com.br")), hrefs);
  assert(`${label}_tel`, hrefs.some((h) => h.replace(/\s/g, "").startsWith("tel:+5548988344559")), hrefs);
  assert(`${label}_contact_no_pii`, !PII_IN_CONTACT.test(decoded), decoded);
  assert(`${label}_schema_no_overclaim`, !SCHEMA_OVERCLAIM.test(schema), schema);
  assert(`${label}_meta_no_overclaim`, !SCHEMA_OVERCLAIM.test(meta), meta);
  assert(`${label}_demonstrative`, /exemplo demonstrativo/i.test(main), "exemplo demonstrativo");
  for (const needle of spec.must) {
    const haystack = needle.startsWith("/") ? html : main;
    assert(`${label}_has_${needle.slice(0, 40)}`, haystack.toLowerCase().includes(needle.toLowerCase()), needle);
  }
  for (const re of spec.mustRe) {
    assert(`${label}_re_${re.source.slice(0, 40)}`, re.test(main), re.source);
  }
  for (const re of spec.forbidRe) {
    assert(`${label}_forbid_${re.source.slice(0, 40)}`, !re.test(html), re.source);
  }
}

function mutate(html) {
  return html.replaceAll(
    '"name":"Assistência técnica de engenharia em disputas"',
    '"name":"perito nomeado com êxito garantido"',
  );
}

function scanCampaignReceipts() {
  const handoffPath = "docs/campaigns/inb-20260911/14/handoff.json";
  const sharedPath = "docs/campaigns/inb-20260911/14/shared-changes.json";
  assert("handoff_exists", fs.existsSync(path.join(root, handoffPath)), handoffPath);
  assert("shared_exists", fs.existsSync(path.join(root, sharedPath)), sharedPath);
  const handoff = JSON.parse(read(handoffPath));
  const shared = JSON.parse(read(sharedPath));
  assert("handoff_schema", handoff.schema === "confenge.inbound-campaign-handoff/2.0", handoff.schema);
  assert("handoff_campaign_id", handoff.campaign_id === "14" || handoff.campaign_id === 14, handoff.campaign_id);
  assert("handoff_prompt_version", handoff.prompt_version === "2.0.0", handoff.prompt_version);
  assert("handoff_set", handoff.campaign_set === "INB-20260911", handoff.campaign_set);
  assert("subunit_14a", Boolean(handoff.subunits?.["14A"]?.status), handoff.subunits);
  assert("subunit_14b", Boolean(handoff.subunits?.["14B"]?.status), handoff.subunits);
  assert("subunits_independent", handoff.subunits["14A"].status !== undefined && handoff.subunits["14B"].status !== undefined, handoff.subunits);
  const routes = handoff.routes || [];
  const byPath = new Map(routes.map((r) => [r.path, r]));
  for (const expected of [
    {
      path: "/assistencia-tecnica-pericial-engenharia/",
      intent_family: "produzir_prova_tecnica",
      offer_id: "civil_building_technical_assistance",
    },
    {
      path: "/seguranca-trabalho-apoio-tecnico/",
      intent_family: "organizar_sst",
      offer_id: "sst_risk_documentation_diagnosis",
    },
  ]) {
    const row = byPath.get(expected.path);
    assert(`route_${expected.path}_present`, Boolean(row), expected.path);
    if (!row) continue;
    assert(`route_${expected.path}_family`, row.intent_family === expected.intent_family, row.intent_family);
    assert(`route_${expected.path}_offer`, row.offer_id === expected.offer_id, row.offer_id);
    assert(`route_${expected.path}_canonical`, row.canonical === `https://confenge.com.br${expected.path}`, row.canonical);
    assert(`route_${expected.path}_index`, row.requested_indexability === "index,follow" || row.requested_indexability === true, row.requested_indexability);
    assert(`route_${expected.path}_contact`, Boolean(row.contact_mode), row.contact_mode);
    assert(`route_${expected.path}_release`, row.release_unit === "EXPANSION", row.release_unit);
  }
  const deps = handoff.dependencies || [];
  const providers = new Set(deps.map((d) => String(d.provider_campaign)));
  assert("hard_01", providers.has("01"), [...providers]);
  assert("hard_02", providers.has("02"), [...providers]);
  for (const dep of deps.filter((d) => ["01", "02"].includes(String(d.provider_campaign)))) {
    assert(`dep_${dep.provider_campaign}_level`, dep.level === "HARD_AT_RELEASE" || dep.level === "ALREADY_SATISFIED", dep);
  }

  const changes = shared.changes || [];
  assert("shared_has_changes", changes.length >= 5, changes.length);
  const requiredPaths = [
    "data/organic/public-family-registry.json",
    "sitemap.xml",
    "data/organic/sitemap-hygiene.json",
    "scripts/pseo/public_artifact.py",
    "data/site/public-ia-map.json",
  ];
  const byFile = new Map(changes.map((c) => [c.path, c]));
  for (const p of requiredPaths) {
    const row = changes.find((c) => c.path === p);
    assert(`shared_${p}`, Boolean(row), p);
    if (!row) continue;
    assert(`shared_${p}_owner`, row.owner_campaign === "16" || row.owner_campaign === 16, row.owner_campaign);
    assert(`shared_${p}_sha`, typeof row.base_blob_sha === "string" && /^[0-9a-f]{40}$/.test(row.base_blob_sha), row.base_blob_sha);
    assert(`shared_${p}_key`, typeof row.key_or_anchor === "string" && row.key_or_anchor.length > 0, row.key_or_anchor);
    assert(`shared_${p}_desired`, row.desired_new !== undefined && row.desired_new !== null, row.desired_new);
    assert(`shared_${p}_rationale`, typeof row.rationale === "string" && row.rationale.length > 8, row.rationale);
    assert(`shared_${p}_accept`, typeof row.acceptance_test === "string" && row.acceptance_test.length > 8, row.acceptance_test);
  }
  const families = changes.filter((c) => c.path === "data/organic/public-family-registry.json");
  for (const fam of families) {
    const neu = fam.desired_new;
    const terminal = neu?.terminal_action || neu?.family?.terminal_action;
    assert(`family_${fam.change_id}_terminal`, terminal === "capture_form_or_whatsapp", terminal);
  }
  void byFile;
}

const specA = {
  h1: "Assistência técnica de engenharia em disputas",
  canonical: "https://confenge.com.br/assistencia-tecnica-pericial-engenharia/",
  must: [
    "assistência da parte",
    "perícia do juízo",
    "inspeção",
    "advocacia",
    "/conflitos/",
  ],
  mustRe: [
    /quesitos/i,
    /evid[eê]ncias/i,
    /manifesta[cç][aã]o t[eé]cnica/i,
  ],
  forbidRe: [
    /êxito garantido/i,
    /type=["']file["']/i,
  ],
};

const specB = {
  h1: "Apoio técnico de segurança do trabalho",
  canonical: "https://confenge.com.br/seguranca-trabalho-apoio-tecnico/",
  must: ["PGR", "LTCAT", "AET", "finalidade", "insumos", "responsabilidade"],
  mustRe: [
    /n[aã]o s[aã]o sin[oô]nimos|n[aã]o s[aã]o intercambi[aá]veis|n[aã]o s[aã]o o mesmo documento/i,
    /ato m[eé]dico/i,
  ],
  forbidRe: [
    /PGR incluso no pacote/i,
    /type=["']file["']/i,
    /emitimos (o )?ASO/i,
  ],
};

let htmlA = read("assistencia-tecnica-pericial-engenharia/index.html");
let htmlB = read("seguranca-trabalho-apoio-tecnico/index.html");
if (MUTATE) {
  htmlA = mutate(htmlA);
  htmlB = htmlB.replace(
    /"name":"Apoio técnico de segurança do trabalho"/,
    '"name":"PGR incluso no pacote com ato médico"',
  );
}

scanPage("14a", htmlA, specA);
scanPage("14b", htmlB, specB);
if (!MUTATE) scanCampaignReceipts();

const failed = results.filter((r) => !r.ok);
const passed = results.filter((r) => r.ok);
console.log(`${passed.length} passed, ${failed.length} failed, mutate=${MUTATE}`);
if (failed.length) {
  process.exit(1);
}
if (MUTATE) {
  console.error("MUTATION_DID_NOT_FAIL scanner accepted overclaim");
  process.exit(1);
}
console.log("PASS inb14 pericias sst");
