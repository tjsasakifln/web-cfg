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

function registeredNameRanges(text, names) {
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

function classifyOccurrence(entry, text, index, matched, contract, ranges, registeredRoute) {
  const exceptionIds = entry.exemption_ids || [];
  if (exceptionIds.includes("GX-04") && ranges.some(([start, end]) => index >= start && index < end)) return "registered_name";
  if (exceptionIds.includes("GX-04") && registeredRoute) return "registered_route_term";
  const guarantee = contract.gate_exceptions.find((item) => item.id === "GX-03");
  if (exceptionIds.includes("GX-03")) {
    const forms = guarantee.promise_forms.map(normalize);
    const tail = text.slice(index, index + matched.length + 16);
    if ((guarantee.market_institute_forms || []).map(normalize).some((form) => tail.startsWith(form))) return "market_institute";
    if (!forms.some((form) => tail.startsWith(form))) return "market_institute";
  }
  const negation = contract.gate_exceptions.find((item) => item.id === "GX-01");
  if (exceptionIds.includes("GX-01")) {
    const before = text.slice(Math.max(0, index - negation.window_chars), index);
    const marker = new RegExp(`\\b(${negation.negation_markers.map((value) => normalize(value).replace(/\s/g, "\\s")).join("|")})\\b`);
    if (marker.test(before)) return "explicit_negation";
  }
  return null;
}

function scanLanguage(routes, contract) {
  const violations = [];
  const observations = [];
  const boundaries = [];
  const registeredNames = contract.gate_exceptions.find((item) => item.id === "GX-04").registered_public_names;
  const terms = contract.forbidden_language_without_immediate_proof.filter((item) => item.checker === "term_scan");
  for (const route of routes) {
    const html = fs.readFileSync(routePath(route), "utf8");
    const text = normalize(visibleText(html));
    const ranges = registeredNameRanges(text, registeredNames);
    const registeredRoute = registeredNames.some((name) => new RegExp(`<h1[^>]*>[\\s\\S]{0,180}${normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(normalize(html)));
    for (const entry of terms) {
      const expression = new RegExp(entry.pattern, "g");
      let match;
      while ((match = expression.exec(text)) !== null) {
        const exemption = classifyOccurrence(entry, text, match.index, match[0], contract, ranges, registeredRoute);
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

export function auditCopyContract({ contract, registry, taskDoors, familyRegistry, catalogHtml }) {
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
    if (!catalogHtml.includes(`data-copy-contract-id="${entry.deliverable_id}"`)) problems.push(`missing_public_contract:${entry.deliverable_id}`);
  }
  for (const clause of clauses) {
    const count = (catalogHtml.match(new RegExp(`data-copy-clause="${clause}"`, "g")) || []).length;
    if (count !== ids.length) problems.push(`clause_coverage:${clause}:${count}`);
  }
  if ((catalogHtml.match(/data-copy-contract-id=/g) || []).length !== ids.length) problems.push("public_contract_count");
  if (!catalogHtml.includes("Compre quando") || catalogHtml.includes(">Saiba mais<")) problems.push("catalog_action_copy");

  const language = scanLanguage(routes, contract);
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
  const report = auditCopyContract({ contract, registry, taskDoors, familyRegistry, catalogHtml });
  if (!report.ok) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log(`COPY_CONTRACT_AUDIT_OK deliverables=${report.metrics.deliverables} clauses=${report.metrics.clause_instances} routes=${report.metrics.routes_derived}`);
}
