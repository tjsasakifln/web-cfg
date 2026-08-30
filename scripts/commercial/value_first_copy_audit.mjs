#!/usr/bin/env node

/**
 * Shadow diagnostic for issues #527 and #534.
 *
 * Route coverage is derived from the public-family registry, its BOFU source,
 * the published index.html census and the first-fold authority. The diagnostic
 * intentionally does not block public copy: human calibration is NOT_STARTED.
 */

import childProcess from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT_REL = "data/commercial/value-first-copy-contract.v1.json";
const FAMILY_REL = "data/organic/public-family-registry.json";
const BOFU_REL = "data/organic/bofu-intent-matrix.json";
const FIRST_FOLD_REL = "data/commercial/first-fold-contract.v1.json";
const DELIVERABLES_REL = "data/commercial/deliverables-registry.v1.json";
const UNLOCK_REL = "data/bofu-dominance/frozen-specs/unlock-plan.v1.json";
const PUBLIC_SKIP_PARTS = new Set([
  ".git",
  ".github",
  ".claude",
  ".netlify",
  ".pytest_cache",
  "_site",
  "data",
  "docs",
  "netlify",
  "node_modules",
  "ops",
  "scripts",
  "seo",
  "supabase",
  "tests",
]);

function git(args) {
  return childProcess.execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function assertRef(ref) {
  if (ref !== null && !/^[0-9a-f]{7,40}$/i.test(ref)) {
    throw new Error(`VALUE_FIRST_INVALID_REF: ${ref}`);
  }
}

function readRelative(relative, ref = null) {
  assertRef(ref);
  if (ref) return git(["show", `${ref}:${relative}`]);
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function publicFiles(ref = null) {
  assertRef(ref);
  const files = ref
    ? git(["ls-tree", "-r", "--name-only", ref]).split(/\r?\n/).filter(Boolean)
    : walkFiles(root);
  return files
    .filter((relative) => relative === "index.html" || relative.endsWith("/index.html"))
    .filter((relative) => !relative.split("/").some((part) => PUBLIC_SKIP_PARTS.has(part)))
    .sort();
}

function walkFiles(directory, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (PUBLIC_SKIP_PARTS.has(entry.name)) continue;
    const nextRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path.join(directory, entry.name), nextRelative));
    else files.push(nextRelative);
  }
  return files;
}

export function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;/gi, " ");
}

export function visibleText(html) {
  return decodeEntities(String(html || "")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function mainHtml(html) {
  const match = String(html).match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return match ? match[1] : String(html);
}

function isIndexable(html) {
  const tag = String(html).match(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i)?.[0];
  if (!tag) return true;
  const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] || "";
  return !/\bnoindex\b/i.test(content);
}

function routeFromFile(relative) {
  return relative === "index.html" ? "/" : `/${relative.slice(0, -"index.html".length)}`;
}

function fileFromRoute(route) {
  return route === "/" ? "index.html" : `${route.replace(/^\//, "")}index.html`;
}

function attrValue(attrs, name) {
  return String(attrs || "").match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
}

export function extractBlocks(html) {
  const main = mainHtml(html)
    .replace(/<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1[^>]*>/gi, " ")
    .replace(/<([a-z][a-z0-9:-]*)\b[^>]*(?:\bhidden\b|\baria-hidden=["']true["']|\bstyle=["'][^"']*display\s*:\s*none)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const blocks = [];
  const pattern = /<(h[1-6]|p|li|dt|dd|summary|figcaption|label|button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = pattern.exec(main)) !== null) {
    const text = visibleText(match[3]);
    const words = text.split(/\s+/).filter(Boolean).length;
    if (!text || (words < 3 && !["a", "button"].includes(match[1].toLowerCase()))) continue;
    blocks.push({
      index: blocks.length,
      tag: match[1].toLowerCase(),
      attrs: match[2],
      text,
      normalized: normalize(text),
      source_index: match.index,
    });
  }
  return blocks;
}

const SIGNALS = {
  value_outcome: [
    /\bdecid\w*\b/,
    /\bdecis\w*\b/,
    /\bprioriz\w*\b/,
    /\bproteg\w*\b/,
    /\bpreserv\w*\b/,
    /\breduz\w*\b/,
    /\bevit\w*\b/,
    /\bmargem\b/,
    /\bcaixa\b/,
    /\bprazo\b/,
    /\brisco\w*\b/,
    /\bcapacidade\b/,
    /\baloc\w*\b/,
    /\bescolh\w*\b/,
    /\bfoco\b/,
    /\bviabil\w*\b/,
    /\baderenc\w*\b/,
  ],
  artifact: [
    /\bmatriz\w*\b/,
    /\bmemoria de calculo\b/,
    /\bcronologia\b/,
    /\bdossie\b/,
    /\brelatorio\b/,
    /\bplanilha\b/,
    /\bbase\b/,
    /\bmapa\b/,
    /\bpainel\b/,
    /\bplano\b/,
    /\btabela\b/,
    /\bchecklist\b/,
    /\btrilha\b/,
    /\bartefato\b/,
    /\bapresentacao\b/,
    /\brecomendac\w*\b/,
    /\bprioridades\b/,
  ],
  mechanism: [
    /\breconcili\w*\b/,
    /\bcruz\w*\b/,
    /\bcalcul\w*\b/,
    /\bclassific\w*\b/,
    /\bcompar\w*\b/,
    /\borganiz\w*\b/,
    /\banalis\w*\b/,
    /\brevis\w*\b/,
    /\bprioriz\w*\b/,
    /\bnormaliz\w*\b/,
    /\bvincul\w*\b/,
    /\bmodel\w*\b/,
    /\bmetodo\b/,
  ],
  proof: [
    /\bfonte\w*\b/,
    /\bdata de corte\b/,
    /\batualizad\w*\b/,
    /\bfreshness\b/,
    /\bmetodo\b/,
    /\bformula\w*\b/,
    /\brastre\w*\b/,
    /\breprodu\w*\b/,
    /\bamostra\b/,
    /\bexemplo\b/,
    /\bsintetic\w*\b/,
    /\bexperiencia\b/,
    /\bprovenien\w*\b/,
    /\bcobertura\b/,
  ],
  action: [
    /\bsolicit\w*\b/,
    /\bregistr\w*\b/,
    /\bconfigur\w*\b/,
    /\bcalcul\w*\b/,
    /\bexamin\w*\b/,
    /\binspecion\w*\b/,
    /\bpedir\w*\b/,
    /\benviar\w*\b/,
    /\bfalar\w*\b/,
    /\bconvers\w*\b/,
    /\bavali\w*\b/,
    /\bconsult\w*\b/,
    /\babrir\w*\b/,
  ],
  limitation: [
    /\blimita?c?o?e?s?\b/,
    /\bexclus\w*\b/,
    /\bfronteira\w*\b/,
    /\bsomente\b/,
    /\bapenas\b/,
    /\bsujeit\w*\b/,
    /\bdepende\w*\b/,
    /\bobrigacao de meio\b/,
    /\bunknown\b/,
    /\bnao informado\b/,
    /\bfora do escopo\b/,
    /\bindisponivel\b/,
    /\bbloquead\w*\b/,
    /\bnao inclui\b/,
    /\bnao substitui\b/,
    /\bnao promete\b/,
    /\bsem garantia\b/,
    /\bnao (?:ha|e|sao|faz|aceita|recebe|conclui|publica|inicia|pode)\b/,
  ],
};
const NEGATION_RE = /\b(?:nao|sem|nunca|jamais)\b/g;
const BENEFIT_WITHOUT_RE = /\bsem (?:o )?(?:custo|precisar|montar|refazer|reunir|conciliar|pesquisar|improvisar|duplicar|perder)\b/;
const HYPE_ONLY_RE = /\b(?:revolucionari\w*|transformador\w*|lider\w*|complet\w*|excelen\w*|incomparavel|unico)\b/;

function signalCount(text, expressions) {
  return expressions.reduce((count, expression) => count + (expression.test(text) ? 1 : 0), 0);
}

export function classifyBlock(block) {
  const text = block.normalized || normalize(block.text);
  const scores = Object.fromEntries(
    Object.entries(SIGNALS).map(([role, expressions]) => [role, signalCount(text, expressions)]),
  );
  if (["a", "button"].includes(block.tag) || /\btype=["']submit["']/.test(block.attrs || "")) {
    scores.action = Math.max(scores.action, 2);
  }
  const negations = [...text.matchAll(NEGATION_RE)].length;
  const benefitWithout = BENEFIT_WITHOUT_RE.test(text);
  if (negations > 0 && !benefitWithout) scores.limitation = Math.max(scores.limitation, 1);
  if (benefitWithout && scores.limitation === 0) scores.value_outcome = Math.max(scores.value_outcome, 2);
  if (benefitWithout && scores.limitation === 1 && !/\b(?:garantia|inclui|substitui|promete|escopo|unknown)\b/.test(text)) {
    scores.limitation = 0;
    scores.value_outcome = Math.max(scores.value_outcome, 2);
  }
  if (HYPE_ONLY_RE.test(text) && scores.value_outcome <= 1 && scores.artifact === 0 && scores.mechanism === 0) {
    scores.value_outcome = 0;
    scores.proof = 0;
  }
  const roles = Object.entries(scores).filter(([, score]) => score > 0).map(([role]) => role);
  let primary = "other";
  if (scores.action >= 2) primary = "action";
  else if (scores.limitation > 0 && (negations > 0 || /^h[1-6]$/.test(block.tag))) primary = "limitation";
  else {
    const priority = ["value_outcome", "artifact", "mechanism", "proof", "limitation", "action"];
    primary = priority.reduce((best, role) => scores[role] > (scores[best] || 0) ? role : best, "other");
    if ((scores[primary] || 0) === 0) primary = "other";
  }
  return { ...block, scores, roles, primary, negations, benefit_without: benefitWithout };
}

function sectionBodies(html) {
  const main = mainHtml(html);
  const sections = [...main.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)].map((match) => match[0]);
  return sections.length ? sections : [main];
}

export function sequenceFindings(html, profile) {
  if (profile === "trust_legal") return [];
  const findings = [];
  sectionBodies(html).forEach((section, sectionIndex) => {
    const blocks = extractBlocks(`<main>${section}</main>`).map(classifyBlock);
    if (blocks.length < 3) return;
    const firstEnabling = blocks.findIndex((block) =>
      ["value_outcome", "artifact", "action"].some((role) => block.roles.includes(role)) && block.primary !== "limitation"
    );
    let initialRestrictions = 0;
    for (const block of blocks) {
      if (block.primary !== "limitation") break;
      initialRestrictions += 1;
    }
    if (profile === "commercial" && initialRestrictions >= 2 && (firstEnabling < 0 || firstEnabling >= initialRestrictions)) {
      findings.push({
        kind: "defensive_opening",
        section_index: sectionIndex,
        initial_restriction_blocks: initialRestrictions,
        first_enabling_block: firstEnabling,
        excerpt: blocks.slice(0, Math.min(3, blocks.length)).map((block) => block.text).join(" | ").slice(0, 360),
      });
    }
  });
  return findings;
}

export function boundaryIds(html) {
  return [...String(html).matchAll(/\bdata-boundary-id=["']([^"']+)["']/gi)].map((match) => match[1]);
}

export function evaluateFixture(fixture) {
  const blocks = extractBlocks(fixture.html).map(classifyBlock);
  const findings = sequenceFindings(fixture.html, fixture.profile);
  const observedRoles = [...new Set(blocks.flatMap((block) => block.roles))].sort();
  return {
    id: fixture.id,
    profile: fixture.profile,
    blocks,
    metrics: metricsForBlocks(blocks),
    observed_roles: observedRoles,
    defensive_opening: findings.some((finding) => finding.kind === "defensive_opening"),
    sequence_findings: findings,
    boundary_ids: boundaryIds(fixture.html),
  };
}

function metricsForBlocks(blocks) {
  const countRole = (role) => blocks.filter((block) => block.roles.includes(role)).length;
  return {
    substantive_blocks: blocks.length,
    value_outcome_blocks: countRole("value_outcome"),
    artifact_blocks: countRole("artifact"),
    mechanism_blocks: countRole("mechanism"),
    proof_blocks: countRole("proof"),
    action_blocks: countRole("action"),
    limitation_blocks: countRole("limitation"),
    negation_occurrences: blocks.reduce((total, block) => total + block.negations, 0),
    primarily_restrictive_blocks: blocks.filter((block) => block.primary === "limitation").length,
  };
}

function familyRoutes(family, publishedRoutes, bofuRoutes) {
  const routes = new Set(family.match?.routes || []);
  const prefix = family.match?.prefix;
  if (prefix) publishedRoutes.filter((route) => route.startsWith(prefix)).forEach((route) => routes.add(route));
  if (family.match?.source === "data/organic/bofu-intent-matrix.json#rows[].canonical_service_route") {
    bofuRoutes.forEach((route) => routes.add(route));
  }
  return routes;
}

export function deriveCoverage({ familyRegistry, bofu, firstFold, files, readFile }) {
  const published = files.map((relative) => ({
    relative,
    route: routeFromFile(relative),
    html: readFile(relative),
  })).filter((entry) => isIndexable(entry.html));
  const publishedRoutes = published.map((entry) => entry.route);
  const publishedSet = new Set(publishedRoutes);
  const bofuRoutes = [...new Set((bofu.rows || []).map((row) => row.canonical_service_route).filter(Boolean))];
  const familyMembership = new Map();
  for (const family of familyRegistry.families || []) {
    for (const route of familyRoutes(family, publishedRoutes, bofuRoutes)) {
      if (!publishedSet.has(route)) continue;
      if (!familyMembership.has(route)) familyMembership.set(route, []);
      familyMembership.get(route).push(family);
    }
  }
  const firstFoldRoutes = new Set((firstFold.census || []).map((entry) => entry.route));
  const routes = [];
  const problems = [];
  for (const entry of published) {
    const candidates = familyMembership.get(entry.route) || [];
    const exact = candidates.filter((family) => (family.match?.routes || []).includes(entry.route));
    const prefixed = candidates.filter((family) => family.match?.prefix)
      .sort((left, right) => right.match.prefix.length - left.match.prefix.length);
    const sourced = candidates.filter((family) => family.match?.source);
    const family = exact[0] || prefixed[0] || sourced[0] || null;
    if (!family) {
      problems.push({ kind: "indexable_route_without_family", route: entry.route });
      continue;
    }
    const profile = family.profile === "trust_or_legal"
      ? "trust_legal"
      : firstFoldRoutes.has(entry.route) || ["priced_offer", "service_pillar"].includes(family.profile)
        ? "commercial"
        : "public_data";
    routes.push({
      ...entry,
      family_id: family.id,
      family_profile: family.profile,
      family_visitor_job: family.visitor_job,
      profile,
      terminal_action: family.terminal_action,
    });
  }
  return { routes, problems, published_indexable_count: published.length };
}

function formsAndActions(html) {
  const main = mainHtml(html);
  const forms = [...main.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((match) => {
    const attrs = match[1];
    const body = match[2];
    const submitButton = [...body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)]
      .find((button) => !attrValue(button[1], "type") || attrValue(button[1], "type") === "submit");
    const submitInput = body.match(/<input\b(?=[^>]*\btype=["']submit["'])[^>]*\bvalue=["']([^"']*)["'][^>]*>/i);
    return {
      action: attrValue(attrs, "action"),
      cta_id: attrValue(attrs, "data-cta-id"),
      offer_id: attrValue(attrs, "data-offer-id"),
      fields: [...body.matchAll(/<(?:input|select|textarea)\b/gi)].length,
      submit_label: submitButton ? visibleText(submitButton[2]) : (submitInput?.[1] || ""),
      has_receipt_contract: attrValue(attrs, "data-receipt-required") === "true",
    };
  });
  const primaryActions = [...main.matchAll(/<a\b([^>]*(?:button-primary|data-cta-position=["'](?:hero|offer_hero|page_close|pillar_capture)["'])[^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      label: visibleText(match[2]),
      href: attrValue(match[1], "href"),
      cta_id: attrValue(match[1], "data-cta-id"),
    }));
  return { forms, primary_actions: primaryActions };
}

function sumMetrics(rows) {
  const result = {
    substantive_blocks: 0,
    value_outcome_blocks: 0,
    artifact_blocks: 0,
    mechanism_blocks: 0,
    proof_blocks: 0,
    action_blocks: 0,
    limitation_blocks: 0,
    negation_occurrences: 0,
    primarily_restrictive_blocks: 0,
  };
  for (const row of rows) {
    for (const key of Object.keys(result)) result[key] += row.metrics[key] || 0;
  }
  return result;
}

function firstRoleIndex(blocks, role) {
  return blocks.findIndex((block) => block.roles.includes(role) && block.primary !== "limitation");
}

function contractValueForRoute(route, deliverables, familyVisitorJob) {
  const item = (deliverables.deliverables || []).find((entry) => entry.route === route);
  if (item) {
    return {
      source: `${DELIVERABLES_REL}#deliverables[deliverable_id=${item.deliverable_id}]`,
      owner: "deliverables_registry",
      deliverable_id: item.deliverable_id,
      trigger: item.trigger,
      decision: item.decision_question,
      artifact: item.included_outputs,
    };
  }
  const container = (deliverables.containers || []).find((entry) => entry.route === route);
  if (container) {
    return {
      source: `${DELIVERABLES_REL}#containers[container_id=${container.container_id}]`,
      owner: "deliverables_registry",
      container_id: container.container_id,
      decision: familyVisitorJob,
      artifact: container.composes_deliverables || [],
    };
  }
  return {
    source: `${FAMILY_REL}#families[].visitor_job`,
    owner: "public_family_registry",
    decision: familyVisitorJob,
    artifact: [],
  };
}

function routeMatrix({ entry, blocks, interaction, findings, deliverables, protectedSlugs, unlock, hierarchy }) {
  const current = blocks.find((block) => block.primary === "value_outcome") || blocks.find((block) => /^h[1-2]$/.test(block.tag)) || blocks[0];
  const slug = entry.route.replace(/^\//, "").replace(/\/$/, "");
  const frozen = protectedSlugs.has(slug);
  return {
    current_proposition: current?.text || null,
    actual_contract_value: contractValueForRoute(entry.route, deliverables, entry.family_visitor_job),
    diagnosed_gap: {
      first_value_outcome_block: firstRoleIndex(blocks, "value_outcome"),
      first_artifact_block: firstRoleIndex(blocks, "artifact"),
      first_positive_proof_block: firstRoleIndex(blocks, "proof"),
      first_action_block: firstRoleIndex(blocks, "action"),
      first_limitation_block: blocks.findIndex((block) => block.primary === "limitation"),
      defensive_opening_findings: findings.length,
    },
    message_direction: hierarchy.map((entry) => entry.role),
    retained_limitations: "Preservar preço, dado, interpretação jurídica, evidência sintética e escopo no destino semântico declarado pelo contrato #527.",
    cta_next_state: {
      primary_labels: interaction.primary_actions.map((action) => action.label),
      submit_labels: interaction.forms.map((form) => form.submit_label).filter(Boolean),
      terminal_action: entry.terminal_action,
    },
    mutation_state: frozen
      ? {
          state: "MEASUREMENT_WAIT",
          authority: UNLOCK_REL,
          html_mutation_authorized: unlock.html_mutation_authorized === true,
          earliest_safe_action_at: unlock.earliest_safe_action_at,
          note: "Preparação e diagnóstico apenas. Data isolada não autoriza mutação."
        }
      : {
          state: "ELIGIBLE_FOR_CHILD_IMPLEMENTATION",
          authority: entry.family_id,
        },
  };
}

export function buildReport({ ref = null } = {}) {
  assertRef(ref);
  // The classifier contract is the version being evaluated. Historical refs
  // supply only the public surface and its route authorities, so a new
  // classifier can reproduce an old baseline without having existed at that SHA.
  const contract = JSON.parse(readRelative(CONTRACT_REL));
  const familyRegistry = JSON.parse(readRelative(FAMILY_REL, ref));
  const bofu = JSON.parse(readRelative(BOFU_REL, ref));
  const firstFold = JSON.parse(readRelative(FIRST_FOLD_REL, ref));
  const deliverables = JSON.parse(readRelative(DELIVERABLES_REL, ref));
  const unlock = JSON.parse(readRelative(UNLOCK_REL, ref));
  const files = publicFiles(ref);
  const coverage = deriveCoverage({
    familyRegistry,
    bofu,
    firstFold,
    files,
    readFile: (relative) => readRelative(relative, ref),
  });
  const routeRows = coverage.routes.map((entry) => {
    const blocks = extractBlocks(entry.html).map(classifyBlock);
    const interaction = formsAndActions(entry.html);
    const findings = sequenceFindings(entry.html, entry.profile);
    const protectedSlugs = new Set(unlock.protected_pillars || []);
    return {
      route: entry.route,
      family_id: entry.family_id,
      family_profile: entry.family_profile,
      diagnostic_profile: entry.profile,
      terminal_action: entry.terminal_action,
      metrics: metricsForBlocks(blocks),
      sequence_findings: findings,
      forms: interaction.forms,
      primary_actions: interaction.primary_actions,
      value_first_matrix: routeMatrix({
        entry,
        blocks,
        interaction,
        findings,
        deliverables,
        protectedSlugs,
        unlock,
        hierarchy: contract.canonical_hierarchy,
      }),
    };
  });
  const familyRows = [];
  for (const familyId of [...new Set(routeRows.map((row) => row.family_id))].sort()) {
    const members = routeRows.filter((row) => row.family_id === familyId);
    familyRows.push({
      family_id: familyId,
      routes: members.length,
      metrics: sumMetrics(members),
      defensive_opening_findings: members.reduce((total, row) => total + row.sequence_findings.length, 0),
    });
  }
  const sourceSha = ref || git(["rev-parse", "HEAD"]).trim();
  return {
    schema: "confenge.value-first-copy-shadow-report/1.0",
    contract_version: contract.contract_version,
    classifier_version: contract.diagnostic.classifier_version,
    mode: contract.diagnostic.mode,
    ci_blocking: false,
    decision: contract.diagnostic.decision,
    source_sha: sourceSha,
    measured_on: contract.diagnostic.baseline.measured_on,
    coverage: {
      authority: contract.coverage_derivation.public_authority,
      first_fold_authority: contract.coverage_derivation.first_fold_authority,
      manual_route_allowlist: false,
      published_indexable_routes: coverage.published_indexable_count,
      classified_routes: routeRows.length,
      problems: coverage.problems,
    },
    totals: sumMetrics(routeRows),
    families: familyRows,
    routes: routeRows,
    interpretation: {
      quality_score: null,
      universal_ratio: null,
      human_persuasion_claimed: false,
      note: contract.semantic_taxonomy.non_goal,
    },
  };
}

function cliValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ref = cliValue("--ref");
  const writeTo = cliValue("--write");
  const report = buildReport({ ref });
  if (writeTo) {
    const absolute = path.resolve(root, writeTo);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`VALUE_FIRST_REPORT_OUTSIDE_ROOT: ${absolute}`);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`VALUE_FIRST_SHADOW_REPORT_WRITTEN routes=${report.routes.length} path=${path.relative(root, absolute)}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (report.coverage.problems.length) process.exitCode = 1;
}
