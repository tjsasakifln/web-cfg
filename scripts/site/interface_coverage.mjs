/**
 * Fail-closed interface-quality coverage for the public CONFENGE artifact.
 *
 * Axe routes come only from rendered visitor risk: a visible BRL amount or a
 * capture/checkout form. Lighthouse families come from the canonical public
 * family registry; this policy only chooses one owned representative per
 * canonical family and classifies the intentionally noindex remainder.
 */
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

export const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const POLICY_PATH = join(ROOT, "data/quality/interface-coverage-policy.json");
export const FAMILY_REGISTRY_PATH = join(ROOT, "data/organic/public-family-registry.json");
const BOFU_MATRIX_PATH = join(ROOT, "data/organic/bofu-intent-matrix.json");
const MANIFEST_PATH = join(ROOT, "seo/PUBLIC-ARTIFACT-MANIFEST.json");
const PUBLIC_PREVIEW_DECISIONS_PATH = join(ROOT, "data/editorial/public-preview-route-decisions.json");
const RELEASE_CONTROL_PATH = join(ROOT, "deploy/netcup/lib/release_control.py");
const BOFU_SOURCE = "data/organic/bofu-intent-matrix.json#rows[].canonical_service_route";
const OFFICIAL_OVERLAY_OWNER = "deploy/netcup/lib/release_control.py::_publish_live_intelligence_overlay";
const OFFICIAL_OVERLAY_SOURCE_CONTRACT = "data/live_intelligence/accepted/opportunities.json#official_live-indexable-projection";
const OFFICIAL_OVERLAY_PROJECTION_ROUTE = "/.well-known/live-intelligence-overlay.json";
const OFFICIAL_OVERLAY_PROJECTION_SCHEMA = "confenge.live-intelligence-overlay/v1";
const OFFICIAL_OPPORTUNITY_ROUTE_PATTERN = "^/oportunidades/[A-Za-z0-9][A-Za-z0-9._-]{0,80}(?:/[A-Za-z0-9][A-Za-z0-9._-]{0,20}){0,3}/$";
const OFFICIAL_OVERLAY_ABSENCE_VERIFIER = "deploy/netcup/lib/release_control.py::_withdraw_packaged_opportunity_pages";

/** Prefer the built public artifact; fall back to the repo root working copy. */
export function resolveSiteRoot(root = ROOT) {
  const site = join(root, "_site");
  return existsSync(join(site, "index.html")) ? site : root;
}

export function loadPolicy() {
  return JSON.parse(readFileSync(POLICY_PATH, "utf8"));
}

export function loadPublicFamilyRegistry() {
  return JSON.parse(readFileSync(FAMILY_REGISTRY_PATH, "utf8"));
}

export function loadManifestRoutes() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const routes = manifest.html_routes || [];
  if (!routes.length) throw new Error("PUBLIC-ARTIFACT-MANIFEST.json has no html_routes");
  const rootFiles = (manifest.root_files || [])
    .filter((name) => name.endsWith(".html") && name !== "index.html")
    .map((name) => `/${name}`);
  return [...new Set([...routes, ...rootFiles])].sort((a, b) => a.localeCompare(b));
}

export function routeToFile(siteRoot, route) {
  const relative = route.endsWith("/") ? `${route}index.html` : route;
  return join(siteRoot, relative.replace(/^\//, ""));
}

const PRICE_RE = /R\s*\$\s*\d/u;
const FORM_RE = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
const CONTROL_RE = /<(input|select|textarea)\b/i;
const CAPTURE_ACTION_RE = /\baction\s*=\s*["']\/\.netlify\/functions\/(?:lead|nurture|conversion-intake|offer-eligibility|correction)(?:\?[^"']*)?["']/i;
const CAPTURE_MARKER_RE = /\bdata-capture-form(?:\s*=\s*["'][^"']*["'])?(?=\s|\/?>|$)/i;
const ROBOTS_META_RE = /<meta\b[^>]*\bname=["']robots["'][^>]*>/i;

/** Strip non-visible payloads and normalize the entity forms used around BRL. */
export function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#0*160|#x0*a0);/gi, "\u00a0")
    .replace(/&(?:dollar|#0*36|#x0*24);/gi, "$")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/gu, " ");
}

/** A capture form has a persistent endpoint or an explicit positive marker. */
export function hasCaptureForm(html) {
  FORM_RE.lastIndex = 0;
  let match;
  while ((match = FORM_RE.exec(html)) !== null) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    if (!CONTROL_RE.test(body)) continue;
    if (CAPTURE_ACTION_RE.test(attrs) || CAPTURE_MARKER_RE.test(attrs)) return true;
  }
  return false;
}

export function hasPrice(html) {
  return PRICE_RE.test(visibleText(html));
}

export function isNoindex(html) {
  const robots = html.match(ROBOTS_META_RE)?.[0] || "";
  return /\bcontent=["'][^"']*\bnoindex\b[^"']*["']/i.test(robots);
}

/** Load the canonical BOFU service-route set once for callers doing a census. */
export function loadBofuServiceRoutes() {
  const matrix = JSON.parse(readFileSync(BOFU_MATRIX_PATH, "utf8"));
  return new Set((matrix.rows || []).map((row) => row.canonical_service_route));
}

function canonicalMatchSpec(family, bofuRoutes) {
  const match = family.match || {};
  if (match.source === BOFU_SOURCE) return { routes: bofuRoutes, prefix: null };
  if (Array.isArray(match.routes)) return { routes: new Set(match.routes), prefix: null };
  if (typeof match.prefix === "string" && match.prefix.startsWith("/") && match.prefix !== "/") {
    return { routes: new Set(), prefix: match.prefix };
  }
  throw new Error(`canonical family has an unsupported match contract: ${family.id}`);
}

/** Mirror inbound_gates.py: exact route first, then the longest prefix. */
function canonicalFamilyFor(route, families, bofuRoutes) {
  let best = null;
  let bestLength = -1;
  for (const family of families) {
    const spec = canonicalMatchSpec(family, bofuRoutes);
    if (spec.routes.has(route)) return family;
    if (spec.prefix && route.startsWith(spec.prefix) && spec.prefix.length > bestLength) {
      best = family;
      bestLength = spec.prefix.length;
    }
  }
  return best;
}

/** Resolve the canonical family contract for one public route. */
export function publicFamilyForRoute(
  route,
  registry = loadPublicFamilyRegistry(),
  bofuRoutes = loadBofuServiceRoutes(),
) {
  return canonicalFamilyFor(route, registry.families, bofuRoutes);
}

function supplementalFamilyFor(route, families) {
  const matches = families.filter((family) =>
    family.patterns.some((pattern) => new RegExp(pattern).test(route))
  );
  if (matches.length > 1) {
    throw new Error(`route matches multiple supplemental Lighthouse families: ${route}`);
  }
  return matches[0] || null;
}

function validateRuntimeOnlyRepresentative(entry, family) {
  const runtime = entry.runtime_only;
  if (!runtime || entry.route) {
    throw new Error(`canonical representative requires exactly one of route or runtime_only: ${entry.family_id}`);
  }
  const exact = runtime.mode === "official_live_overlay"
    && runtime.owner === OFFICIAL_OVERLAY_OWNER
    && runtime.source_contract === OFFICIAL_OVERLAY_SOURCE_CONTRACT
    && runtime.required_source_kind === "official_live"
    && runtime.accepted_projection_route === OFFICIAL_OVERLAY_PROJECTION_ROUTE
    && runtime.accepted_projection_schema === OFFICIAL_OVERLAY_PROJECTION_SCHEMA
    && runtime.inventory_route === "/sitemap-oportunidades.xml"
    && runtime.route_pattern === OFFICIAL_OPPORTUNITY_ROUTE_PATTERN
    && runtime.absence_behavior === "withdraw_family"
    && runtime.absence_verifier === OFFICIAL_OVERLAY_ABSENCE_VERIFIER
    && runtime.post_stage_lighthouse_required === true
    && family?.match?.prefix === "/oportunidades/";
  if (!exact) {
    throw new Error(`invalid official runtime Lighthouse contract: ${entry.family_id}`);
  }

  const decisions = JSON.parse(readFileSync(PUBLIC_PREVIEW_DECISIONS_PATH, "utf8"));
  const sourceDecision = (decisions.groups || []).find((group) => group.id === "packaged-opportunity-fixtures");
  const controller = readFileSync(RELEASE_CONTROL_PATH, "utf8");
  const ownerVerified = sourceDecision?.source_root === "oportunidades/"
    && sourceDecision?.public_decision === "EXCLUDE_FIXTURE_PACKAGE_KEEP_OFFICIAL_OVERLAY"
    && decisions.counterproof?.official_opportunity_owner === OFFICIAL_OVERLAY_OWNER
    && /source_kind=official_live/.test(decisions.counterproof?.official_opportunity_contract || "")
    && /def _publish_live_intelligence_overlay\(release: Path\)/.test(controller)
    && /def _accepted_overlay_identity\(release: Path\)/.test(controller)
    && /def _write_live_intelligence_overlay_manifest\(/.test(controller)
    && /LIVE_INTEL_PUBLIC_MANIFEST/.test(controller)
    && /def _withdraw_packaged_opportunity_pages\(release: Path\)/.test(controller)
    && /CONFENGE_LI_OFFICIAL_DIR/.test(controller)
    && /result = publish\(/.test(controller);
  if (!ownerVerified) {
    throw new Error(`official runtime owner contract is not verifiable: ${entry.family_id}`);
  }
  return runtime;
}

function validatePolicyShape(policy, registry) {
  if (policy.axe?.always_include?.length) {
    throw new Error("axe.always_include is forbidden: axe coverage must derive from price/capture risk");
  }
  if (policy.axe?.exclusions?.length) {
    throw new Error("axe exclusions are forbidden while acceptance requires every price/capture route");
  }
  if (policy.known_exceptions?.length) {
    throw new Error("critical/serious axe known exceptions are forbidden by #293");
  }

  const canonicalIds = registry.families.map((family) => family.id);
  const representatives = policy.lighthouse?.canonical_representatives || [];
  const representativeIds = representatives.map((entry) => entry.family_id);
  const duplicateIds = representativeIds.filter((id, index) => representativeIds.indexOf(id) !== index);
  const missing = canonicalIds.filter((id) => !representativeIds.includes(id));
  const unknown = representativeIds.filter((id) => !canonicalIds.includes(id));
  if (duplicateIds.length || missing.length || unknown.length) {
    throw new Error(
      `canonical Lighthouse representatives must match public-family-registry exactly; `
        + `duplicate=${[...new Set(duplicateIds)].join(",") || "none"} `
        + `missing=${missing.join(",") || "none"} unknown=${unknown.join(",") || "none"}`,
    );
  }
  const duplicateRoutes = representatives
    .map((entry) => entry.route)
    .filter((route, index, all) => all.indexOf(route) !== index);
  if (duplicateRoutes.length) {
    throw new Error(`canonical Lighthouse representatives must be unique: ${duplicateRoutes.join(", ")}`);
  }
  for (const entry of representatives) {
    const family = registry.families.find((candidate) => candidate.id === entry.family_id);
    if (entry.runtime_only) validateRuntimeOnlyRepresentative(entry, family);
    else if (!entry.route) throw new Error(`canonical representative has no route: ${entry.family_id}`);
  }
}

/** Resolve and verify one real post-stage route owned by a runtime-only family. */
export function runtimeLighthouseContractForRoute(
  route,
  policy = loadPolicy(),
  registry = loadPublicFamilyRegistry(),
) {
  validatePolicyShape(policy, registry);
  const family = publicFamilyForRoute(route, registry);
  if (!family) throw new Error(`runtime Lighthouse route has no canonical family: ${route}`);
  const representative = policy.lighthouse.canonical_representatives
    .find((entry) => entry.family_id === family.id);
  if (!representative?.runtime_only) {
    throw new Error(`runtime Lighthouse route belongs to a packaged family: ${route}`);
  }
  const runtime = validateRuntimeOnlyRepresentative(representative, family);
  if (!(new RegExp(runtime.route_pattern)).test(route)) {
    throw new Error(`runtime Lighthouse route does not match the owned detail-route contract: ${route}`);
  }
  return {
    family_id: family.id,
    route,
    reason: representative.reason,
    ...runtime,
  };
}

/** Prove that a selected post-stage route came from the runtime inventory. */
export function verifyRuntimeInventoryDocument(route, sitemapXml, contract, acceptedRoutes = null) {
  if (!contract?.post_stage_lighthouse_required || contract.route !== route) {
    throw new Error(`runtime Lighthouse inventory check has no matching contract: ${route}`);
  }
  const inventoried = [...String(sitemapXml || "").matchAll(/<loc>([^<]+)<\/loc>/gi)]
    .map((match) => match[1].replace(/&amp;/g, "&"))
    .map((value) => {
      try { return new URL(value, "https://runtime.invalid").pathname; }
      catch { return ""; }
    });
  if (!inventoried.includes(route)) {
    throw new Error(`runtime Lighthouse route is absent from ${contract.inventory_route}: ${route}`);
  }
  if (acceptedRoutes) {
    const accepted = [...new Set(acceptedRoutes)];
    if (accepted.length !== acceptedRoutes.length) {
      throw new Error("runtime Lighthouse accepted route inventory contains duplicates");
    }
    const observed = [...new Set(inventoried)];
    if (
      observed.length !== accepted.length
      || observed.some((value) => !accepted.includes(value))
      || accepted.some((value) => !observed.includes(value))
    ) {
      throw new Error(
        `runtime Lighthouse sitemap differs from the exact accepted projection: accepted=${accepted.length} inventoried=${observed.length}`,
      );
    }
  }
  return true;
}

/**
 * Bind a post-stage Lighthouse route to the consumer-accepted official projection.
 * The route prefix and runtime sitemap are insufficient evidence on their own:
 * both could contain an unaccepted file. The stage-owned document is emitted only
 * after consumer hash identity and per-record publication checks pass.
 */
export function verifyRuntimeAcceptedProjectionDocument(
  route,
  document,
  contract,
  expectedSha,
) {
  if (!contract?.post_stage_lighthouse_required || contract.route !== route) {
    throw new Error(`runtime Lighthouse accepted-projection check has no matching contract: ${route}`);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("runtime Lighthouse accepted-projection document is not an object");
  }
  if (document.schema !== contract.accepted_projection_schema) {
    throw new Error(`runtime Lighthouse accepted-projection schema mismatch: ${document.schema || "missing"}`);
  }
  if (document.release_sha !== expectedSha || !/^[0-9a-f]{40}$/.test(String(expectedSha || ""))) {
    throw new Error(
      `runtime Lighthouse accepted-projection release mismatch: expected=${expectedSha || "missing"} observed=${document.release_sha || "missing"}`,
    );
  }
  if (document.official_live !== true || document.source_kind !== contract.required_source_kind) {
    throw new Error("runtime Lighthouse accepted projection is not official_live");
  }
  for (const field of ["manifest_hash", "consumer_observed_manifest_hash", "accepted_projection_sha256"]) {
    if (!/^[0-9a-f]{64}$/.test(String(document[field] || ""))) {
      throw new Error(`runtime Lighthouse accepted projection has invalid ${field}`);
    }
  }
  if (document.manifest_hash !== document.consumer_observed_manifest_hash) {
    throw new Error("runtime Lighthouse accepted projection has divergent producer/consumer manifest hashes");
  }
  for (const field of ["source_run_id", "as_of"]) {
    if (typeof document[field] !== "string" || !document[field].trim()) {
      throw new Error(`runtime Lighthouse accepted projection has no ${field}`);
    }
  }
  if (!Array.isArray(document.routes) || document.routes.length === 0) {
    throw new Error("runtime Lighthouse accepted projection has no exact routes");
  }
  if (!Array.isArray(document.removed_html_paths)) {
    throw new Error("runtime Lighthouse accepted projection has invalid removed_html_paths");
  }
  if (
    !Array.isArray(document.static_html_paths)
    || document.static_html_paths.length > 1
    || (document.static_html_paths.length === 1
      && document.static_html_paths[0] !== "_site/oportunidades/index.html")
  ) {
    throw new Error("runtime Lighthouse accepted projection has invalid static_html_paths allowlist");
  }
  if (
    !document.static_html_sha256
    || typeof document.static_html_sha256 !== "object"
    || Array.isArray(document.static_html_sha256)
    || Object.keys(document.static_html_sha256).length !== document.static_html_paths.length
    || document.static_html_paths.some((path) => !/^[0-9a-f]{64}$/.test(String(document.static_html_sha256[path] || "")))
    || Object.keys(document.static_html_sha256).some((path) => !document.static_html_paths.includes(path))
  ) {
    throw new Error("runtime Lighthouse accepted projection has invalid static_html_sha256 identity");
  }
  const removedPaths = new Set();
  for (const value of document.removed_html_paths) {
    const path = String(value || "");
    if (!/^_site\/oportunidades\/.+\/index\.html$/.test(path) || removedPaths.has(path)) {
      throw new Error(`runtime Lighthouse accepted projection has invalid removed html path: ${path || "missing"}`);
    }
    removedPaths.add(path);
  }

  const routePattern = new RegExp(contract.route_pattern);
  const routes = new Set();
  const ids = new Set();
  const htmlPaths = new Set();
  for (const item of document.routes) {
    const opportunityId = String(item?.opportunity_id || "");
    const acceptedRoute = String(item?.route || "");
    const htmlPath = String(item?.html_path || "").replace(/^_site\//, "");
    if (!opportunityId || acceptedRoute !== `/oportunidades/${opportunityId}/` || !routePattern.test(acceptedRoute)) {
      throw new Error(`runtime Lighthouse accepted projection has inconsistent route: ${acceptedRoute || "missing"}`);
    }
    if (htmlPath !== `oportunidades/${opportunityId}/index.html`) {
      throw new Error(`runtime Lighthouse accepted projection has inconsistent html_path: ${item?.html_path || "missing"}`);
    }
    for (const field of ["content_hash", "sha256"]) {
      if (!/^[0-9a-f]{64}$/.test(String(item?.[field] || ""))) {
        throw new Error(`runtime Lighthouse accepted projection route has invalid ${field}: ${acceptedRoute}`);
      }
    }
    if (routes.has(acceptedRoute) || ids.has(opportunityId) || htmlPaths.has(htmlPath)) {
      throw new Error(`runtime Lighthouse accepted projection has duplicate route identity: ${acceptedRoute}`);
    }
    routes.add(acceptedRoute);
    ids.add(opportunityId);
    htmlPaths.add(htmlPath);
  }
  for (const htmlPath of htmlPaths) {
    if (removedPaths.has(`_site/${htmlPath}`)) {
      throw new Error(`runtime Lighthouse accepted projection both publishes and removes: ${htmlPath}`);
    }
  }
  if (!routes.has(route)) {
    throw new Error(`runtime Lighthouse route is absent from the accepted official projection: ${route}`);
  }
  return document.routes.find((item) => item.route === route);
}

/** Derive the complete axe and Lighthouse coverage plan. */
export function deriveCoverage(options = {}) {
  const policy = options.policy || loadPolicy();
  const registry = options.registry || loadPublicFamilyRegistry();
  const siteRoot = options.siteRoot || resolveSiteRoot();
  const routes = options.routes || loadManifestRoutes();
  validatePolicyShape(policy, registry);

  const routeSet = new Set(routes);
  const bofuRoutes = loadBofuServiceRoutes();
  const representativeById = new Map(
    policy.lighthouse.canonical_representatives.map((entry) => [entry.family_id, entry]),
  );
  const canonicalFamilies = new Map(
    registry.families.map((family) => {
      const representative = representativeById.get(family.id);
      return [family.id, {
        id: family.id,
        label: family.visitor_job,
        kind: "canonical",
        routes: [],
        lighthouse_representative: representative.route || null,
        representative_reason: representative.reason,
        runtime_only: representative.runtime_only || null,
        image_gate: Boolean(representative.image_gate),
        seo_exempt: Boolean(representative.seo_exempt_reason),
        seo_exempt_reason: representative.seo_exempt_reason || null,
      }];
    }),
  );
  const supplementalFamilies = new Map(
    (policy.supplemental_families || []).map((family) => [family.id, {
      ...family,
      kind: "supplemental_noindex",
      routes: [],
      seo_exempt: true,
    }]),
  );
  if (supplementalFamilies.size !== (policy.supplemental_families || []).length) {
    throw new Error("supplemental Lighthouse family ids must be unique");
  }

  const risks = new Map();
  const familyOf = new Map();
  const unassigned = [];
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

    const canonical = canonicalFamilyFor(route, registry.families, bofuRoutes);
    if (canonical) {
      canonicalFamilies.get(canonical.id).routes.push(route);
      familyOf.set(route, canonical.id);
      continue;
    }
    const supplemental = supplementalFamilyFor(route, policy.supplemental_families || []);
    if (!supplemental) {
      unassigned.push(route);
      continue;
    }
    supplementalFamilies.get(supplemental.id).routes.push(route);
    familyOf.set(route, supplemental.id);
  }

  if (unassigned.length) {
    throw new Error(
      "routes match neither the canonical public-family-registry nor a supplemental noindex family: "
        + unassigned.join(", "),
    );
  }

  const families = [...canonicalFamilies.values(), ...supplementalFamilies.values()];
  const unexpectedPackagedRuntimeFamilies = families.filter(
    (family) => family.runtime_only && family.routes.length,
  );
  if (unexpectedPackagedRuntimeFamilies.length) {
    throw new Error(
      `runtime-only Lighthouse families must be absent from the package: ${unexpectedPackagedRuntimeFamilies.map((f) => f.id).join(", ")}`,
    );
  }
  const emptyFamilies = families.filter((family) => !family.routes.length && !family.runtime_only);
  if (emptyFamilies.length) {
    throw new Error(`Lighthouse families absent from the artifact: ${emptyFamilies.map((f) => f.id).join(", ")}`);
  }
  const invalidRepresentatives = families.filter(
    (family) => !family.runtime_only && !family.routes.includes(family.lighthouse_representative),
  );
  if (invalidRepresentatives.length) {
    throw new Error(
      "Lighthouse representative must belong to its resolved family: "
        + invalidRepresentatives
          .map((family) => `${family.id} -> ${family.lighthouse_representative}`)
          .join(", "),
    );
  }
  const missingReasons = families.filter((family) => !family.representative_reason);
  if (missingReasons.length) {
    throw new Error(`Lighthouse representatives require reasons: ${missingReasons.map((f) => f.id).join(", ")}`);
  }

  const invalidCanonicalSeo = [...canonicalFamilies.values()].filter((family) => {
    if (family.runtime_only) return false;
    const representativeNoindex = isNoindex(
      readFileSync(routeToFile(siteRoot, family.lighthouse_representative), "utf8"),
    );
    const allNoindex = family.routes.every((route) =>
      isNoindex(readFileSync(routeToFile(siteRoot, route), "utf8"))
    );
    if (!representativeNoindex) return family.seo_exempt;
    return !family.seo_exempt_reason || !allNoindex;
  });
  if (invalidCanonicalSeo.length) {
    throw new Error(
      "canonical family representatives must exercise SEO when an indexable family route exists; "
        + "an all-noindex family requires an explicit exemption reason: "
        + invalidCanonicalSeo.map((family) => family.id).join(", "),
    );
  }
  const invalidSupplemental = [...supplementalFamilies.values()].filter((family) => {
    if (!family.seo_exempt_reason) return true;
    return family.routes.some((route) => !isNoindex(readFileSync(routeToFile(siteRoot, route), "utf8")));
  });
  if (invalidSupplemental.length) {
    throw new Error(
      "supplemental Lighthouse families require a reason and must contain only noindex routes: "
        + invalidSupplemental.map((family) => family.id).join(", "),
    );
  }

  const additionalLighthousePages = policy.lighthouse.additional_pages || [];
  const invalidAdditionalPages = additionalLighthousePages.filter(
    (entry) => !entry.route || !entry.reason || !routeSet.has(entry.route),
  );
  if (invalidAdditionalPages.length) {
    throw new Error(
      "lighthouse.additional_pages entries require an existing route and a reason: "
        + invalidAdditionalPages.map((entry) => entry.route || "<missing route>").join(", "),
    );
  }
  const invalidAdditionalSeoExemptions = additionalLighthousePages.filter((entry) => {
    if (!entry.seo_exempt) return false;
    if (!entry.seo_exempt_reason) return true;
    return !isNoindex(readFileSync(routeToFile(siteRoot, entry.route), "utf8"));
  });
  if (invalidAdditionalSeoExemptions.length) {
    throw new Error(
      "additional-page SEO exemptions require a reason and an intentional noindex route: "
        + invalidAdditionalSeoExemptions.map((entry) => entry.route).join(", "),
    );
  }

  const selected = new Map(
    [...risks].map(([route, reasons]) => [route, { route, family: familyOf.get(route), reasons }]),
  );
  const sampling = policy.axe.sampling || { enabled: false };
  const sampled = { enabled: Boolean(sampling.enabled), reason: sampling.reason, dropped: [] };
  if (sampling.enabled && Number(sampling.max_routes_per_family) > 0) {
    const cap = Number(sampling.max_routes_per_family);
    const seed = isoWeekSeed();
    sampled.seed = seed;
    sampled.max_routes_per_family = cap;
    const byFamily = new Map();
    for (const entry of selected.values()) {
      if (!byFamily.has(entry.family)) byFamily.set(entry.family, []);
      byFamily.get(entry.family).push(entry.route);
    }
    for (const [familyId, familyRoutes] of byFamily) {
      if (familyRoutes.length <= cap) continue;
      const ordered = familyRoutes.sort();
      const offset = seed % ordered.length;
      const drawn = new Set();
      for (let i = 0; i < cap; i += 1) drawn.add(ordered[(offset + i) % ordered.length]);
      for (const route of ordered) {
        if (drawn.has(route)) continue;
        selected.delete(route);
        sampled.dropped.push({ route, family: familyId });
      }
    }
  }

  const axeRoutes = [...selected.values()].sort((a, b) => a.route.localeCompare(b.route));
  const axeNotSampled = routes
    .filter((route) => !selected.has(route))
    .map((route) => {
      const dropped = sampled.dropped.find((entry) => entry.route === route);
      return {
        route,
        family: familyOf.get(route),
        reason: dropped
          ? `declared rotating sample (seed ${sampled.seed}, max ${sampled.max_routes_per_family} per family)`
          : "no visible BRL amount and no capture/checkout form; geometry is proved by npm run audit:layout-sitewide",
        matched_by: dropped ? ["sampling"] : [],
      };
    });

  const representativePages = families
    .filter((family) => !family.runtime_only)
    .map((family) => family.lighthouse_representative);
  const lighthousePages = [
    ...representativePages,
    ...additionalLighthousePages.map((entry) => entry.route),
  ];
  if (new Set(lighthousePages).size !== lighthousePages.length) {
    throw new Error("Lighthouse family representatives and additional pages must be unique");
  }
  const lighthouseSelected = new Set(lighthousePages);
  const lighthouseNotSampled = routes
    .filter((route) => !lighthouseSelected.has(route))
    .map((route) => {
      const familyId = familyOf.get(route);
      const family = families.find((entry) => entry.id === familyId);
      return {
        route,
        family: familyId,
        reason: `template semantics represented by ${family.lighthouse_representative} for family ${familyId}`,
      };
    });

  return {
    site_root: siteRoot === ROOT ? "." : "_site",
    policy_path: "data/quality/interface-coverage-policy.json",
    family_registry_path: "data/organic/public-family-registry.json",
    route_count: routes.length,
    viewports: policy.axe.viewports,
    axe: {
      route_count: axeRoutes.length,
      page_loads: axeRoutes.length * policy.axe.viewports.length,
      routes: axeRoutes,
      price_route_count: [...risks.values()].filter((reasons) => reasons.includes("price")).length,
      capture_form_route_count: [...risks.values()].filter((reasons) => reasons.includes("capture_form")).length,
      sampling: sampled,
      not_sampled_count: axeNotSampled.length,
      not_sampled: axeNotSampled,
    },
    lighthouse: {
      form_factor: policy.lighthouse.form_factor,
      viewport: policy.lighthouse.viewport,
      thresholds: policy.lighthouse.thresholds,
      canonical_family_count: canonicalFamilies.size,
      supplemental_family_count: supplementalFamilies.size,
      families: families.map((family) => ({
        id: family.id,
        label: family.label,
        kind: family.kind,
        route_count: family.routes.length,
        lighthouse_representative: family.lighthouse_representative,
        representative_reason: family.representative_reason,
        image_gate: Boolean(family.image_gate),
        seo_exempt: Boolean(family.seo_exempt),
        seo_exempt_reason: family.seo_exempt_reason || null,
        runtime_only: family.runtime_only,
      })),
      runtime_families: families
        .filter((family) => family.runtime_only)
        .map((family) => ({
          id: family.id,
          label: family.label,
          execution_state: "post_stage_required_if_published_otherwise_verified_withdrawal",
          representative_reason: family.representative_reason,
          ...family.runtime_only,
        })),
      additional_pages: additionalLighthousePages,
      pages: lighthousePages,
      image_gate_pages: [
        ...families.filter((family) => family.image_gate).map((family) => family.lighthouse_representative),
        ...additionalLighthousePages.filter((entry) => entry.image_gate).map((entry) => entry.route),
      ],
      seo_exempt_pages: [
        ...families.filter((family) => family.seo_exempt).map((family) => family.lighthouse_representative),
        ...additionalLighthousePages.filter((entry) => entry.seo_exempt).map((entry) => entry.route),
      ],
      not_sampled_count: lighthouseNotSampled.length,
      not_sampled: lighthouseNotSampled,
    },
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
  return [
    `coverage: ${coverage.axe.route_count}/${coverage.route_count} routes x `
      + `${coverage.viewports.length} viewports (${coverage.viewports
        .map((viewport) => `${viewport.id} ${viewport.width}x${viewport.height}`)
        .join(", ")}) = ${coverage.axe.page_loads} page loads`,
    `risk rules: price=${coverage.axe.price_route_count} routes, `
      + `capture_form=${coverage.axe.capture_form_route_count} routes`,
    `sampling: ${coverage.axe.sampling.enabled ? `on (seed ${coverage.axe.sampling.seed})` : "off"} — `
      + coverage.axe.sampling.reason,
    `axe not sampled: ${coverage.axe.not_sampled_count} routes, each with a recorded reason`,
    `lighthouse families: ${coverage.lighthouse.canonical_family_count} canonical + `
      + `${coverage.lighthouse.supplemental_family_count} supplemental noindex; `
      + `${coverage.lighthouse.pages.length} package pages, ${coverage.lighthouse.runtime_families.length} runtime family pending post-stage, `
      + `${coverage.lighthouse.not_sampled_count} package omissions recorded`,
    "axe critical/serious exceptions: unsupported",
  ].join("\n");
}
