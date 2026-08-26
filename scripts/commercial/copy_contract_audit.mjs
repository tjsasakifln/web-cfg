#!/usr/bin/env node

/**
 * Auditoria derivada do registro para o contrato editorial da issue #338.
 *
 * Não mantém allowlist de páginas: rotas vêm do registro de entregáveis, dos
 * contêineres e das famílias públicas precificadas. O catálogo precisa expor
 * as 15 cláusulas para cada um dos 54 itens. Revisão humana continua separada.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function normalize(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function visibleText(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");
}

function allIndexRoutes(directory = root, relative = "") {
  const routes = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "_site", ".netlify"].includes(entry.name)) continue;
    const nextRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) routes.push(...allIndexRoutes(path.join(directory, entry.name), nextRelative));
    else if (entry.name === "index.html") routes.push(`/${relative ? `${relative}/` : ""}`);
  }
  return routes;
}

function routePath(route) {
  return path.join(root, route.replace(/^\//, ""), "index.html");
}

export function deriveMoneyRoutes(registry, taskDoors, familyRegistry) {
  const allRoutes = allIndexRoutes();
  const routes = new Set(["/entregas/"]);
  registry.deliverables.forEach((entry) => {
    if (entry.route) routes.add(entry.route);
  });
  taskDoors.containers.forEach((container) => routes.add(container.route));
  familyRegistry.families
    .filter((family) => family.profile === "priced_offer")
    .forEach((family) => {
      (family.match.routes || []).forEach((route) => routes.add(route));
      if (family.match.prefix) allRoutes.filter((route) => route.startsWith(family.match.prefix)).forEach((route) => routes.add(route));
    });
  return [...routes].filter((route) => fs.existsSync(routePath(route))).sort();
}

export function registeredNameRanges(text, names) {
  const ranges = [];
  for (const rawName of names) {
    const name = normalize(rawName);
    let index = 0;
    while ((index = text.indexOf(name, index)) !== -1) {
      ranges.push([index, index + name.length]);
      index += name.length;
    }
  }
  return ranges;
}

export function explicitExclusionRanges(html, text) {
  const ranges = [];
  const sectionPattern = /<section\b[^>]*>[\s\S]*?<h[2-6]\b[^>]*>\s*N(?:ã|&atilde;)o inclui\s*<\/h[2-6]>[\s\S]*?<\/section>/gi;
  for (const match of String(html).matchAll(sectionPattern)) {
    const sectionText = normalize(visibleText(match[0])).trim();
    if (!sectionText) continue;
    let index = 0;
    while ((index = text.indexOf(sectionText, index)) !== -1) {
      ranges.push([index, index + sectionText.length]);
      index += sectionText.length;
    }
  }
  return ranges;
}

export function classifyOccurrence(entry, text, index, matched, contract, ranges, exclusionRanges = []) {
  const exceptionIds = entry.exemption_ids || [];
  if (exceptionIds.includes("GX-04") && ranges.some(([start, end]) => index >= start && index < end)) return "registered_name";
  const negation = contract.gate_exceptions.find((item) => item.id === "GX-01");
  if (exceptionIds.includes("GX-01")) {
    if (exclusionRanges.some(([start, end]) => index >= start && index < end)) return "explicit_exclusion";
    const window = text.slice(Math.max(0, index - negation.window_chars), index);
    const before = window.slice(Math.max(window.lastIndexOf("."), window.lastIndexOf("!"), window.lastIndexOf("?")) + 1);
    const marker = new RegExp(`\\b(${negation.negation_markers.map((value) => normalize(value).replace(/\s/g, "\\s")).join("|")})\\b`);
    if (marker.test(before)) return "explicit_negation";
  }
  const guarantee = contract.gate_exceptions.find((item) => item.id === "GX-03");
  if (exceptionIds.includes("GX-03")) {
    const tail = text.slice(index, index + matched.length + 16);
    if ((guarantee.market_institute_forms || []).map(normalize).some((form) => tail.startsWith(form))) return "market_institute";
    const promiseForms = (guarantee.promise_forms || []).map(normalize);
    if (!promiseForms.some((form) => tail.startsWith(form))) return "market_institute";
  }
  return null;
}

export function frozenRouteExemption(entry, route, html, contract) {
  if (!(entry.exemption_ids || []).includes("GX-05")) return null;
  const frozen = contract.gate_exceptions.find((item) => item.id === "GX-05");
  if (!frozen || frozen.route !== route || frozen.forbidden_id !== entry.id) return null;
  const digest = crypto.createHash("sha256").update(html).digest("hex");
  return digest === frozen.content_sha256 ? "hash_pinned_frozen_route" : null;
}

function scanLanguage(routes, contract, extraSurfaces = []) {
  const violations = [];
  const observations = [];
  const boundaries = [];
  const registeredNames = contract.gate_exceptions.find((item) => item.id === "GX-04")?.registered_public_names || [];
  const terms = contract.forbidden_language_without_immediate_proof.filter((item) => item.checker === "term_scan");
  const surfaces = [
    ...routes.map((route) => ({ route, html: fs.readFileSync(routePath(route), "utf8") })),
    ...extraSurfaces,
  ];
  for (const { route, html } of surfaces) {
    const text = normalize(visibleText(html));
    const ranges = registeredNameRanges(text, registeredNames);
    const exclusionRanges = explicitExclusionRanges(html, text);
    for (const entry of terms) {
      const expression = new RegExp(entry.pattern, "g");
      let match;
      while ((match = expression.exec(text)) !== null) {
        const exemption = classifyOccurrence(entry, text, match.index, match[0], contract, ranges, exclusionRanges) ||
          frozenRouteExemption(entry, route, html, contract);
        const finding = { route, forbidden_id: entry.id, matched: match[0], exemption };
        if (exemption) boundaries.push(finding);
        else if (entry.finding_kind === "count_only") observations.push(finding);
        else violations.push(finding);
      }
    }
  }
  return { violations, observations, boundaries };
}

function scanStructuredData(routes, contract) {
  const forbidden = new Set(contract.structured_data_ban.forbidden_types);
  const hits = [];
  for (const route of routes) {
    const html = fs.readFileSync(routePath(route), "utf8");
    for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script[^>]*>/gi)) {
      let parsed;
      try {
        parsed = JSON.parse(block[1]);
      } catch {
        hits.push({ route, type: "INVALID_JSON_LD" });
        continue;
      }
      const stack = [parsed];
      while (stack.length) {
        const value = stack.pop();
        if (Array.isArray(value)) stack.push(...value);
        else if (value && typeof value === "object") {
          const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
          types.filter((type) => forbidden.has(type)).forEach((type) => hits.push({ route, type }));
          stack.push(...Object.values(value));
        }
      }
    }
    if (/itemtype=["'][^"']*schema\.org\/(Review|AggregateRating)/i.test(html)) hits.push({ route, type: "MICRODATA_REVIEW" });
  }
  return hits;
}

function words(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function scanClauseDuplicates(catalogHtml, expectedClauses) {
  const duplicates = [];
  const signatures = new Map();
  let observed = 0;
  for (const contractMatch of catalogHtml.matchAll(/<details[^>]+data-copy-contract-id="([^"]+)"[^>]*>([\s\S]*?)<\/details>/g)) {
    const deliverableId = contractMatch[1];
    for (const clauseMatch of contractMatch[2].matchAll(/<section[^>]+data-copy-clause="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
      const clause = clauseMatch[1];
      observed += 1;
      if (!expectedClauses.includes(clause)) continue;
      const signature = normalize(visibleText(clauseMatch[2])).trim();
      const key = signature;
      if (signatures.has(key)) duplicates.push({ clause, deliverable_id: deliverableId, duplicates: signatures.get(key) });
      else signatures.set(key, deliverableId);
    }
  }
  return { duplicates, observed, unique: signatures.size };
}

export function catalogContractsFromClientData(script) {
  const match = /^window\.CONFENGE_CATALOG_DATA=(\{.*\});\s*$/.exec(String(script));
  if (!match) throw new Error("invalid public catalog data asset");
  const payload = JSON.parse(match[1]);
  const idIndex = payload.fields?.indexOf("id") ?? -1;
  const contractIndex = payload.fields?.indexOf("contractHtml") ?? -1;
  if (idIndex < 0 || contractIndex < 0 || !Array.isArray(payload.items)) {
    throw new Error("public catalog data omits copy-contract fields");
  }
  return payload.items.map((row) => {
    const id = row?.[idIndex];
    const contractHtml = row?.[contractIndex];
    if (typeof id !== "string" || typeof contractHtml !== "string") {
      throw new Error("invalid copy-contract row in public catalog data");
    }
    return `<details data-copy-contract-id="${id}"><div>${contractHtml}</div></details>`;
  }).join("\n");
}

export function auditCopyContract({ contract, registry, taskDoors, familyRegistry, catalogHtml, catalogContractsHtml = catalogHtml }) {
  const problems = [];
  const clauses = contract.per_offer_contract.map((clause) => clause.key);
  const routes = deriveMoneyRoutes(registry, taskDoors, familyRegistry);
  const ids = registry.deliverables.map((entry) => entry.deliverable_id);
  const signatures = new Map();

  if (registry.deliverables.length !== 54) problems.push("catalog_count");
  for (const entry of registry.deliverables) {
    const signature = normalize([entry.trigger, entry.decision_question, entry.included_outputs[0]].join(" | "));
    if (signatures.has(signature)) problems.push(`duplicate_titleless_signature:${entry.deliverable_id}:${signatures.get(signature)}`);
    signatures.set(signature, entry.deliverable_id);
    if (words(entry.public_name_pt_br) > 8) problems.push(`title_over_8_words:${entry.deliverable_id}`);
    if (words(entry.trigger) > 24) problems.push(`trigger_over_24_words:${entry.deliverable_id}`);
    if (!entry.data_contract?.provenance_required || !entry.data_contract?.freshness_required) problems.push(`provenance:${entry.deliverable_id}`);
    if (!catalogContractsHtml.includes(`data-copy-contract-id="${entry.deliverable_id}"`)) problems.push(`missing_public_contract:${entry.deliverable_id}`);
  }
  for (const clause of clauses) {
    const count = (catalogContractsHtml.match(new RegExp(`data-copy-clause="${clause}"`, "g")) || []).length;
    if (count !== ids.length) problems.push(`clause_coverage:${clause}:${count}`);
  }
  if ((catalogContractsHtml.match(/data-copy-contract-id=/g) || []).length !== ids.length) problems.push("public_contract_count");
  if (!catalogContractsHtml.includes("Compre quando") || catalogContractsHtml.includes(">Saiba mais<")) problems.push("catalog_action_copy");
  const clauseScan = scanClauseDuplicates(catalogContractsHtml, clauses);
  if (clauseScan.observed !== ids.length * clauses.length) problems.push(`clause_scan_count:${clauseScan.observed}`);
  clauseScan.duplicates.forEach((finding) => problems.push(`duplicate_copy_clause:${finding.clause}:${finding.deliverable_id}:${finding.duplicates}`));

  const extraSurfaces = catalogContractsHtml === catalogHtml
    ? []
    : [{ route: "/entregas/catalog-data.js", html: catalogContractsHtml }];
  const language = scanLanguage(routes, contract, extraSurfaces);
  language.violations.forEach((finding) => problems.push(`forbidden_language:${finding.route}:${finding.forbidden_id}`));
  const structuredDataHits = scanStructuredData(routes, contract);
  structuredDataHits.forEach((finding) => problems.push(`structured_social_proof:${finding.route}:${finding.type}`));

  return {
    ok: problems.length === 0,
    problems,
    metrics: {
      deliverables: ids.length,
      clauses_per_deliverable: clauses.length,
      clause_instances: ids.length * clauses.length,
      clause_bodies_unique: clauseScan.unique,
      clause_body_duplicates: clauseScan.duplicates.length,
      titleless_unique: signatures.size,
      routes_derived: routes.length,
      language_boundaries: language.boundaries.length,
      language_observations: language.observations.length,
      language_violations: language.violations.length,
      structured_social_proof_hits: structuredDataHits.length,
    },
    routes,
    language,
    structured_data_hits: structuredDataHits,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const contract = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/copy-contract.v1.json"), "utf8"));
  const registry = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/deliverables-registry.v1.json"), "utf8"));
  const taskDoors = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/task-doors.v1.json"), "utf8"));
  const familyRegistry = JSON.parse(fs.readFileSync(path.join(root, "data/organic/public-family-registry.json"), "utf8"));
  const catalogHtml = fs.readFileSync(path.join(root, "entregas/index.html"), "utf8");
  const catalogContractsHtml = catalogContractsFromClientData(fs.readFileSync(path.join(root, "entregas/catalog-data.js"), "utf8"));
  const report = auditCopyContract({ contract, registry, taskDoors, familyRegistry, catalogHtml, catalogContractsHtml });
  if (!report.ok) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log(`COPY_CONTRACT_AUDIT_OK deliverables=${report.metrics.deliverables} clauses=${report.metrics.clause_instances} routes=${report.metrics.routes_derived}`);
}
