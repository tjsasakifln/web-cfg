/**
 * Declared interface-quality coverage for the public CONFENGE artifact (#293).
 *
 * The axe and Lighthouse gates must not be hand-written route lists that age.
 * This module derives them from data:
 *   - the built public artifact (seo/PUBLIC-ARTIFACT-MANIFEST.json + _site HTML);
 *   - the risk rules and commercial families declared in
 *     data/quality/interface-coverage-policy.json.
 *
 * Every route with a price or a capture form is an axe route. Every commercial
 * family must declare one Lighthouse representative. A route that matches no
 * family is a hard failure, so a new URL family cannot ship without deciding
 * how it is measured.
 */
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

export const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const POLICY_PATH = join(ROOT, "data/quality/interface-coverage-policy.json");
const MANIFEST_PATH = join(ROOT, "seo/PUBLIC-ARTIFACT-MANIFEST.json");

/** Prefer the built public artifact; fall back to the repo root working copy. */
export function resolveSiteRoot() {
  const site = join(ROOT, "_site");
  return existsSync(join(site, "index.html")) ? site : ROOT;
}

export function loadPolicy() {
  return JSON.parse(readFileSync(POLICY_PATH, "utf8"));
}

export function loadManifestRoutes() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const routes = manifest.html_routes || [];
  if (!routes.length) throw new Error("PUBLIC-ARTIFACT-MANIFEST.json has no html_routes");
  // html_routes covers directory routes only; root .html files (404, obrigado*)
  // are public surfaces too and live in root_files.
  const rootFiles = (manifest.root_files || [])
    .filter((name) => name.endsWith(".html") && name !== "index.html")
    .map((name) => `/${name}`);
  return [...new Set([...routes, ...rootFiles])].sort((a, b) => a.localeCompare(b));
}

export function routeToFile(siteRoot, route) {
  const relative = route.endsWith("/") ? `${route}index.html` : route;
  return join(siteRoot, relative.replace(/^\//, ""));
}

const PRICE_RE = /R\$\s*\d/;
const FORM_RE = /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
const CONTROL_RE = /<(input|select|textarea)\b/i;

/** A capture surface is a <form> that actually collects something. */
export function hasCaptureForm(html) {
  FORM_RE.lastIndex = 0;
  let match;
  while ((match = FORM_RE.exec(html)) !== null) {
    if (CONTROL_RE.test(match[1] || "")) return true;
  }
  return false;
}

export function hasPrice(html) {
  return PRICE_RE.test(html);
}

function familyFor(policy, route) {
  for (const family of policy.commercial_families) {
    for (const pattern of family.patterns) {
      if (new RegExp(pattern).test(route)) return family;
    }
  }
  return null;
}

/**
 * Derive the whole coverage plan. Throws when the policy has aged out of the
 * built artifact (unknown family, missing representative, phantom route).
 */
export function deriveCoverage(options = {}) {
  const policy = options.policy || loadPolicy();
  const siteRoot = options.siteRoot || resolveSiteRoot();
  const routes = options.routes || loadManifestRoutes();

  const risks = new Map();
  const families = new Map();
  const unassigned = [];

  for (const family of policy.commercial_families) {
    families.set(family.id, { ...family, routes: [] });
  }

  for (const route of routes) {
    const file = routeToFile(siteRoot, route);
    if (!existsSync(file)) {
      throw new Error(`manifest route has no rendered file: ${route} (${file})`);
    }
    const html = readFileSync(file, "utf8");
    const reasons = [];
    if (hasPrice(html)) reasons.push("price");
    if (hasCaptureForm(html)) reasons.push("capture_form");
    if (reasons.length) risks.set(route, reasons);

    const family = familyFor(policy, route);
    if (!family) unassigned.push(route);
    else families.get(family.id).routes.push(route);
  }

  if (unassigned.length) {
    throw new Error(
      "routes match no commercial family in data/quality/interface-coverage-policy.json — "
        + "declare the family and its Lighthouse representative before shipping: "
        + unassigned.join(", "),
    );
  }

  const emptyFamilies = [...families.values()].filter((f) => !f.routes.length);
  if (emptyFamilies.length) {
    throw new Error(
      `commercial families declared but absent from the built artifact: ${emptyFamilies
        .map((f) => f.id)
        .join(", ")}`,
    );
  }

  const routeSet = new Set(routes);
  const alwaysInclude = policy.axe.always_include || [];
  const phantom = alwaysInclude.map((e) => e.route).filter((r) => !routeSet.has(r));
  if (phantom.length) {
    throw new Error(`axe.always_include names routes absent from the artifact: ${phantom.join(", ")}`);
  }

  const missingRepresentative = [...families.values()].filter(
    (f) => !routeSet.has(f.lighthouse_representative),
  );
  if (missingRepresentative.length) {
    throw new Error(
      `lighthouse_representative absent from the artifact: ${missingRepresentative
        .map((f) => `${f.id} -> ${f.lighthouse_representative}`)
        .join(", ")}`,
    );
  }

  const familyOf = new Map();
  for (const family of families.values()) {
    for (const route of family.routes) familyOf.set(route, family.id);
  }

  // Selected axe routes: risk-derived union always_include, minus declared exclusions.
  const exclusions = policy.axe.exclusions || [];
  const excludedMap = new Map();
  const selected = new Map();

  const consider = (route, why) => {
    const hit = exclusions.find((e) => new RegExp(e.route_pattern).test(route));
    if (hit) {
      excludedMap.set(route, { route, reason: hit.reason, matched_by: why, rule: hit.route_pattern });
      return;
    }
    const entry = selected.get(route) || { route, family: familyOf.get(route), reasons: [] };
    for (const value of why) if (!entry.reasons.includes(value)) entry.reasons.push(value);
    selected.set(route, entry);
  };

  for (const [route, reasons] of risks) consider(route, reasons);
  for (const entry of alwaysInclude) consider(entry.route, ["always_include"]);

  // Declared rotating sampling, only if the policy turns it on.
  const sampling = policy.axe.sampling || { enabled: false };
  const sampled = { enabled: Boolean(sampling.enabled), reason: sampling.reason, dropped: [] };
  if (sampling.enabled && Number(sampling.max_routes_per_family) > 0) {
    const cap = Number(sampling.max_routes_per_family);
    const seed = isoWeekSeed();
    sampled.seed = seed;
    sampled.max_routes_per_family = cap;
    const mandatory = new Set(alwaysInclude.map((e) => e.route));
    const byFamily = new Map();
    for (const entry of selected.values()) {
      if (!byFamily.has(entry.family)) byFamily.set(entry.family, []);
      byFamily.get(entry.family).push(entry.route);
    }
    for (const [familyId, familyRoutes] of byFamily) {
      const optional = familyRoutes.filter((r) => !mandatory.has(r)).sort();
      const keepCount = Math.max(0, cap - (familyRoutes.length - optional.length));
      if (optional.length <= keepCount) continue;
      const offset = seed % optional.length;
      const drawn = new Set();
      for (let i = 0; i < keepCount; i += 1) drawn.add(optional[(offset + i) % optional.length]);
      for (const route of optional) {
        if (drawn.has(route)) continue;
        selected.delete(route);
        sampled.dropped.push({ route, family: familyId });
        excludedMap.set(route, {
          route,
          reason: `declared rotating sample (seed ${seed}, max ${cap} per family) — covered on another rotation`,
          matched_by: ["sampling"],
        });
      }
    }
  }

  const axeRoutes = [...selected.values()].sort((a, b) => a.route.localeCompare(b.route));
  const notSampled = routes
    .filter((r) => !selected.has(r))
    .map((route) => {
      const excluded = excludedMap.get(route);
      if (excluded) return excluded;
      return {
        route,
        family: familyOf.get(route),
        reason:
          "no price and no capture form — geometry is proved sitewide by npm run audit:layout-sitewide "
          + "and the template semantics are proved by this family's covered representative",
        matched_by: [],
      };
    });

  return {
    site_root: siteRoot === ROOT ? "." : "_site",
    policy_path: "data/quality/interface-coverage-policy.json",
    route_count: routes.length,
    viewports: policy.axe.viewports,
    axe: {
      route_count: axeRoutes.length,
      page_loads: axeRoutes.length * policy.axe.viewports.length,
      routes: axeRoutes,
      price_route_count: [...risks.values()].filter((r) => r.includes("price")).length,
      capture_form_route_count: [...risks.values()].filter((r) => r.includes("capture_form")).length,
      sampling: sampled,
      not_sampled_count: notSampled.length,
      not_sampled: notSampled,
    },
    lighthouse: {
      form_factor: policy.lighthouse.form_factor,
      viewport: policy.lighthouse.viewport,
      thresholds: policy.lighthouse.thresholds,
      families: [...families.values()].map((f) => ({
        id: f.id,
        label: f.label,
        route_count: f.routes.length,
        lighthouse_representative: f.lighthouse_representative,
        representative_reason: f.representative_reason,
        seo_exempt: Boolean(f.seo_exempt),
        seo_exempt_reason: f.seo_exempt_reason || null,
      })),
      pages: [...families.values()].map((f) => f.lighthouse_representative),
      seo_exempt_pages: [...families.values()]
        .filter((f) => f.seo_exempt)
        .map((f) => f.lighthouse_representative),
      exclusions: policy.lighthouse_exclusions || [],
    },
    known_exceptions: policy.known_exceptions || [],
  };
}

function isoWeekSeed() {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
  return target.getUTCFullYear() * 100 + week;
}

/** Human-readable coverage declaration printed by every gate that uses it. */
export function formatCoverageDeclaration(coverage) {
  const lines = [];
  lines.push(
    `coverage: ${coverage.axe.route_count}/${coverage.route_count} routes x `
      + `${coverage.viewports.length} viewports (${coverage.viewports
        .map((v) => `${v.id} ${v.width}x${v.height}`)
        .join(", ")}) = ${coverage.axe.page_loads} page loads`,
  );
  lines.push(
    `risk rules: price=${coverage.axe.price_route_count} routes, `
      + `capture_form=${coverage.axe.capture_form_route_count} routes`,
  );
  lines.push(
    `sampling: ${coverage.axe.sampling.enabled ? `on (seed ${coverage.axe.sampling.seed})` : "off"} — ${coverage.axe.sampling.reason}`,
  );
  lines.push(
    `not sampled: ${coverage.axe.not_sampled_count} routes, each with a recorded reason in the report`,
  );
  lines.push(
    `lighthouse families: ${coverage.lighthouse.families.length} — `
      + coverage.lighthouse.families.map((f) => `${f.id}:${f.lighthouse_representative}`).join(" "),
  );
  if (coverage.known_exceptions.length) {
    lines.push(`known exceptions (${coverage.known_exceptions.length}):`);
    for (const item of coverage.known_exceptions) {
      lines.push(
        `  - ${item.route} @ ${item.viewport} rule=${item.rule} registered=${item.registered_at} `
          + `review=${item.review_by} — ${item.reason}`,
      );
    }
  } else {
    lines.push("known exceptions: none registered");
  }
  return lines.join("\n");
}
