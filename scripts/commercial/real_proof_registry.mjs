/** Public-surface adapter for the canonical permissioned-proof registry. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(HERE, "../..");
export const AUDIT_REL = "data/commercial/real-proof-registry.v1.json";
export const CANONICAL_REGISTRY_REL = "data/site/permissioned-proof-registry.json";
export const SYNTHETIC_LABEL = "DADOS SINTÉTICOS";
export const DEMONSTRATIVE_LABEL = "DEMONSTRATIVO";
export const PROOF_STATE_NONE = "none";
export const PROOF_STATE_PUBLISHED = "published";

const PROOF_ID_RE = /\bdata-proof-id=["']([^"']+)["']/gi;
const PROOF_FIELD_BLOCK_RE = /<([a-z][\w:-]*)\b([^>]*\bdata-proof-field=["']([^"']+)["'][^>]*)>[\s\S]*?<\/\1>/gi;
const LD_RE = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;
const H1_RE = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i;
const PROOF_STATE_RE = /<section\b[^>]*\bdata-proof-state=["']([^"']+)["'][^>]*>([\s\S]*?)<\/section>/i;
const RESULT_VERBS = /\b(economizou|recuperou|reduziu|aumentou|cresceu|gerou|ganhou|venceu|evitou|recebeu|obteve|conquistou|poupou|melhorou)\b/i;
const RESULT_DIMENSION = /\b(economia|redu[cç][aã]o|aumento|crescimento|ganho|recupera[cç][aã]o|retorno|receita|margem|prazo|custo|valor)\b/i;
const RESULT_QUANTITY_OR_COMPARISON = /R\$\s*\d[\d.,]*|\d[\d.,]*\s*(?:%|(?:reais|mil|milh(?:a|ã)o|dias?|meses?|pontos?)\b)|\b(maior|menor|melhor|pior|acima|abaixo)\b/i;
const CLIENT_SUBJECT = /\b(cliente|construtora|empresa)\b|\b(?:a|uma)\s+contratada\b|\b(?:o|um)\s+contratante\b/i;
const TESTIMONIAL_CLAIM = /\b(depoimento de cliente|segundo (?:o|a) cliente|review de cliente|cliente afirmou)\b/i;
const HONEST_NEGATION = /\b(n[aã]o (?:[ée]|h[aá]|representa|promete|existe|foi)|nenhum[ao]?|zero|sem cliente|hipot[eé]tic|sint[eé]tic|demonstrativ)\b/i;

export function loadAuditConfig(root = DEFAULT_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, AUDIT_REL), "utf8"));
}

export function loadCanonicalRegistry(root = DEFAULT_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, CANONICAL_REGISTRY_REL), "utf8"));
}

export function surfaceToRelPath(surface) {
  const slug = String(surface ?? "").replace(/^\/+|\/+$/g, "");
  return slug ? `${slug}/index.html` : "index.html";
}

function stripMarkup(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function labelToken(value, explicitLabelPattern) {
  if (!explicitLabelPattern) throw new Error("synthetic_surfaces.explicit_label_pattern is required");
  return new RegExp(explicitLabelPattern, "i").test(stripMarkup(value));
}

function jsonLdPayloads(html) {
  const out = [];
  for (const match of String(html ?? "").matchAll(LD_RE)) {
    try { out.push(JSON.parse(match[1])); } catch { out.push(null); }
  }
  return out;
}

function flattenNodes(value, out = []) {
  if (Array.isArray(value)) {
    value.forEach((child) => flattenNodes(child, out));
  } else if (value && typeof value === "object") {
    out.push(value);
    Object.values(value).forEach((child) => flattenNodes(child, out));
  }
  return out;
}

function anchorsToModels(html) {
  const anchors = [];
  const re = /<a\b([^>]*)href=["'](\/casos\/modelo-[^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html ?? "").matchAll(re)) {
    const attrs = `${match[1]} ${match[3]}`;
    const aria = attrs.match(/\baria-label=["']([^"']+)["']/i)?.[1] ?? "";
    anchors.push({ href: match[2], ariaLabel: aria, visibleLabel: stripMarkup(match[4]) });
  }
  return anchors;
}

export function labelIntegrityProblems(html, kind, explicitLabelPattern) {
  const page = String(html ?? "");
  const problems = [];
  const title = TITLE_RE.exec(page)?.[1] ?? "";
  const h1 = H1_RE.exec(page)?.[1] ?? "";
  const schemaText = jsonLdPayloads(page).filter(Boolean).map((value) => JSON.stringify(value)).join(" ");
  if (!labelToken(title, explicitLabelPattern)) problems.push("title_label_absent");
  if (!labelToken(h1, explicitLabelPattern)) problems.push("h1_label_absent");
  if (!labelToken(schemaText, explicitLabelPattern)) problems.push("schema_label_absent");

  if (kind === "library") {
    const cards = [...page.matchAll(/<article\b[^>]*class=["'][^"']*\bvitrine-item\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi)];
    if (cards.length !== 8) problems.push(`library_card_count:${cards.length}`);
    cards.forEach((match, index) => {
      if (!match[1].includes(SYNTHETIC_LABEL)) problems.push(`library_card_label_absent:${index + 1}`);
    });
    const itemLists = flattenNodes(jsonLdPayloads(page).filter(Boolean)).filter((node) => node["@type"] === "ItemList");
    const items = itemLists.flatMap((node) => node.itemListElement ?? []);
    if (items.length !== 8 || items.some((item) => !labelToken(item?.name, explicitLabelPattern))) problems.push("library_schema_items_unlabelled");
    const ctas = anchorsToModels(page);
    if (ctas.length < 8) problems.push(`library_relevant_cta_count:${ctas.length}`);
    ctas.forEach((anchor) => {
      if (!labelToken(anchor.visibleLabel, explicitLabelPattern)) problems.push(`library_relevant_cta_unlabelled:${anchor.href}`);
    });
  } else {
    if (!page.includes('data-permission-class="demonstrativo"') || !labelToken(page, explicitLabelPattern)) {
      problems.push("card_label_absent");
    }
    const relevant = [...page.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => stripMarkup(match[1]))
      .filter((text) => /consult|ler|exemplo|demonstr|biblioteca|entender|enviar/i.test(text));
    if (!relevant.some((text) => labelToken(text, explicitLabelPattern))) problems.push("relevant_cta_label_absent");
  }
  return [...new Set(problems)];
}

function visibleText(html) {
  return stripMarkup(String(html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:address|article|aside|blockquote|dd|div|dl|dt|figcaption|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|section|table|td|th|tr|ul)>/gi, ". ")
    .replace(/<br\s*\/?>/gi, ". "));
}

function withoutAuthorizedClaimFields(html, authorization) {
  const page = String(html ?? "");
  if (!authorization) return page;
  const ids = new Set([...page.matchAll(PROOF_ID_RE)].map((match) => match[1]));
  if (ids.size !== 1 || !ids.has(authorization.proofId)) return page;
  const allowed = new Set(authorization.publicFields ?? []);
  return page.replace(PROOF_FIELD_BLOCK_RE, (block, _tag, _attrs, field) => (
    allowed.has(field) ? " " : block
  ));
}

function matchPositions(pattern, text) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return [...String(text).matchAll(new RegExp(pattern.source, flags))].map((match) => match.index ?? 0);
}

function nearby(left, right, maxDistance) {
  return left.some((a) => right.some((b) => Math.abs(a - b) <= maxDistance));
}

function hasClientResultClaim(sentence) {
  const clients = matchPositions(CLIENT_SUBJECT, sentence);
  if (!clients.length) return false;
  const verbs = matchPositions(RESULT_VERBS, sentence);
  if (nearby(clients, verbs, 160)) return true;
  const dimensions = matchPositions(RESULT_DIMENSION, sentence);
  const quantities = matchPositions(RESULT_QUANTITY_OR_COMPARISON, sentence);
  const quantifiedDimensions = dimensions.filter((position) =>
    quantities.some((quantity) => Math.abs(position - quantity) <= 80)
  );
  return nearby(clients, quantifiedDimensions, 160);
}

export function unregisteredClientClaimProblems(html, relPath, authorization = null) {
  const problems = [];
  const sentences = visibleText(withoutAuthorizedClaimFields(html, authorization)).split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (HONEST_NEGATION.test(sentence)) continue;
    if (hasClientResultClaim(sentence) || TESTIMONIAL_CLAIM.test(sentence)) {
      problems.push(`unregistered_client_result_claim:${relPath}:${sentence.slice(0, 140)}`);
    }
  }
  return problems;
}

export function readPublicPages(root = DEFAULT_ROOT, config = loadAuditConfig(root)) {
  const excluded = config.public_scan_scope?.excluded_path_prefixes ?? [];
  const pages = new Map();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (excluded.some((prefix) => rel === prefix.replace(/\/$/, "") || rel.startsWith(prefix))) continue;
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && rel.endsWith(".html")) pages.set(rel, fs.readFileSync(abs, "utf8"));
    }
  }
  walk(root);
  return pages;
}

export function evaluateProofGate({
  config = loadAuditConfig(),
  registry = loadCanonicalRegistry(),
  pages = readPublicPages(DEFAULT_ROOT, config),
} = {}) {
  const problems = [];
  const records = Array.isArray(registry.records) ? registry.records : [];
  const published = records.filter((record) => record?.state === "PUBLISHED");
  const publishedIds = new Set(published.map((record) => record.proof_id));
  if (config.canonical_proof?.registry !== CANONICAL_REGISTRY_REL) problems.push("canonical_registry_pointer_invalid");
  if (config.canonical_proof?.other_editable_proof_record_registries !== "FORBIDDEN") problems.push("duplicate_record_registry_not_forbidden");
  if (Object.hasOwn(config, "entries")) problems.push("audit_manifest_must_not_store_entries");
  if (registry.approved_public_proof_count !== published.length) problems.push("canonical_published_count_mismatch");

  const expectedResidual = config.addressable_trust?.allowed_residual_when_empty;
  const nextTest = registry.next_test ?? {};
  if (published.length === 0 && (nextTest.status !== expectedResidual || nextTest.blocker !== expectedResidual)) {
    problems.push("external_blocker_not_exact");
  }
  const statePath = config.public_state_surface?.path;
  const stateHtml = pages.get(statePath) ?? "";
  const stateMatch = PROOF_STATE_RE.exec(stateHtml);
  const expectedState = published.length ? PROOF_STATE_PUBLISHED : PROOF_STATE_NONE;
  if (!stateMatch) problems.push(`proof_state_block_missing:${statePath}`);
  else {
    if (stateMatch[1] !== expectedState) problems.push(`proof_state_mismatch:${statePath}`);
    if (!published.length && !/\b(zero|nenhum[ao]?)\b/i.test(stripMarkup(stateMatch[2]))) problems.push(`zero_proof_state_not_rendered:${statePath}`);
  }

  const surfaceByProof = new Map();
  const authorizationBySurface = new Map();
  for (const record of published) {
    const rel = surfaceToRelPath(record.publication?.public_url?.replace("https://confenge.com.br", ""));
    surfaceByProof.set(record.proof_id, rel);
    authorizationBySurface.set(rel, {
      proofId: record.proof_id,
      publicFields: record.consent?.scope?.public_fields ?? [],
    });
    const html = pages.get(rel) ?? "";
    if (!html) problems.push(`published_proof_surface_missing:${record.proof_id}:${rel}`);
    if (!html.includes(`data-proof-id="${record.proof_id}"`)) problems.push(`published_proof_marker_missing:${record.proof_id}:${rel}`);
    if (!html.includes(`data-permission-class="${record.permission_class}"`)) problems.push(`published_proof_permission_missing:${record.proof_id}:${rel}`);
  }

  const modelPages = new Set(config.synthetic_surfaces?.model_pages ?? []);
  const demoPages = new Set(config.synthetic_surfaces?.demonstrative_pages ?? []);
  const library = config.synthetic_surfaces?.library_index;
  const explicitLabelPattern = config.synthetic_surfaces?.explicit_label_pattern;
  for (const rel of modelPages) problems.push(...labelIntegrityProblems(pages.get(rel), "model", explicitLabelPattern).map((code) => `${rel}:${code}`));
  for (const rel of demoPages) problems.push(...labelIntegrityProblems(pages.get(rel), "demonstrative", explicitLabelPattern).map((code) => `${rel}:${code}`));
  problems.push(...labelIntegrityProblems(pages.get(library), "library", explicitLabelPattern).map((code) => `${library}:${code}`));
  for (const card of config.synthetic_surfaces?.inline_cards ?? []) {
    const html = pages.get(card.path) ?? "";
    const marker = String(card.marker ?? "");
    const block = marker
      ? html.match(new RegExp(`<[^>]+${marker}[^>]*>[\\s\\S]*?<\\/(?:aside|div|article)>`, "i"))?.[0] ?? ""
      : "";
    if (!block || !labelToken(block, explicitLabelPattern)) problems.push(`inline_synthetic_card_unlabelled:${card.path}`);
  }

  const forbiddenMarkers = config.public_scan_scope?.forbidden_social_proof_markers ?? [];
  for (const [rel, html] of pages) {
    for (const match of String(html).matchAll(PROOF_ID_RE)) {
      if (!publishedIds.has(match[1]) || surfaceByProof.get(match[1]) !== rel) problems.push(`orphan_real_proof_marker:${rel}:${match[1]}`);
    }
    const authorization = authorizationBySurface.get(rel);
    for (const field of String(html).matchAll(/\bdata-proof-field=["']([^"']+)["']/gi)) {
      if (!authorization || !(authorization.publicFields ?? []).includes(field[1])) problems.push(`orphan_proof_field:${rel}:${field[1]}`);
    }
    for (const payload of jsonLdPayloads(html)) {
      if (!payload) { problems.push(`invalid_jsonld:${rel}`); continue; }
      for (const node of flattenNodes(payload)) {
        const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
        for (const type of config.public_scan_scope?.forbidden_schema_types ?? []) {
          if (types.includes(type)) problems.push(`forbidden_schema_type:${rel}:${type}`);
        }
      }
    }
    for (const marker of forbiddenMarkers) if (html.includes(marker)) problems.push(`forbidden_social_proof_marker:${rel}:${marker}`);
    for (const anchor of anchorsToModels(html)) {
      if (!labelToken(anchor.visibleLabel, explicitLabelPattern)) problems.push(`linked_model_cta_unlabelled:${rel}:${anchor.href}`);
    }
    problems.push(...unregisteredClientClaimProblems(html, rel, authorization));
  }
  return [...new Set(problems)];
}
