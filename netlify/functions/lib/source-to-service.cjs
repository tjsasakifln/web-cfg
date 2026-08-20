/**
 * Source → service attribution (#153).
 * Canonical dest path, UNKNOWN_SERVICE fail-closed, click/event_id helpers.
 * Consumed by event-contract admit and analytics-agg. No PII, no query join.
 */
const REGISTRY = require("./event-registry.json");

const SOURCE_TO_SERVICE = REGISTRY.source_to_service || {};
const UNKNOWN_SERVICE = SOURCE_TO_SERVICE.unknown_service || "UNKNOWN_SERVICE";
const CANONICAL_DESTINATIONS = Object.freeze({ ...(SOURCE_TO_SERVICE.destinations || {}) });
const ORIGIN_PREFIXES = Object.freeze({ ...(SOURCE_TO_SERVICE.origin_prefixes || {}) });
const CHROME_PREFIXES = Object.freeze([...(SOURCE_TO_SERVICE.chrome_prefixes || [])]);
const CONFENGE_HOSTS = new Set(["confenge.com.br", "www.confenge.com.br", "localhost", "127.0.0.1"]);

function canonicalizePath(value) {
  let s = String(value || "").trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\/[^/?#]+/i, "");
  s = s.replace(/^\/\/[^/?#]+/, "");
  const cut = s.search(/[?#]/);
  if (cut !== -1) s = s.slice(0, cut);
  if (!s.startsWith("/")) s = `/${s}`;
  s = s.replace(/\/{2,}/g, "/");
  if (s.length > 1 && !s.endsWith("/")) s += "/";
  return s.slice(0, 180);
}

function hostFromHref(href) {
  const raw = String(href || "").trim();
  const m = raw.match(/^https?:\/\/([^/?#]+)/i) || raw.match(/^\/\/([^/?#]+)/);
  return m ? String(m[1]).toLowerCase().replace(/:\d+$/, "") : "";
}

function isConfengeHost(host) {
  if (!host) return true;
  return CONFENGE_HOSTS.has(String(host).toLowerCase());
}

function pathLooksPii(path) {
  const s = String(path || "");
  if (!s) return false;
  if (/@/.test(s)) return true;
  if (/\+?\d{8,}/.test(s)) return true;
  return false;
}

function isChromePath(path) {
  const p = canonicalizePath(path);
  if (!p || p === "/") return true;
  return CHROME_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix));
}

function originFamilyFromPath(path) {
  const p = canonicalizePath(path);
  const entries = Object.entries(ORIGIN_PREFIXES).sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, family] of entries) {
    if (p === prefix || p.startsWith(prefix)) return family;
  }
  return null;
}

function assetIdFromPath(path) {
  const segs = canonicalizePath(path).split("/").filter(Boolean);
  return segs.length ? segs[segs.length - 1].slice(0, 80) : "";
}

function lookupDestinationServiceId(path) {
  const p = canonicalizePath(path);
  if (!p) return null;
  if (Object.prototype.hasOwnProperty.call(CANONICAL_DESTINATIONS, p)) {
    return CANONICAL_DESTINATIONS[p];
  }
  return null;
}

function canonicalizeDestination(href) {
  const raw = String(href || "").trim();
  if (!raw) return { kind: "empty", path: "" };
  const lower = raw.toLowerCase();
  if (lower.startsWith("mailto:")) return { kind: "email", path: "" };
  if (lower.startsWith("tel:") || lower.startsWith("sms:")) return { kind: "tel", path: "" };
  if (/wa\.me|whatsapp\.com/i.test(raw)) return { kind: "whatsapp", path: "" };
  const host = hostFromHref(raw);
  if (host && !isConfengeHost(host)) return { kind: "external", path: "" };
  const path = canonicalizePath(
    raw.startsWith("/") || /^https?:/i.test(raw) || raw.startsWith("//") ? raw : `/${raw}`,
  );
  if (!path) return { kind: "empty", path: "" };
  if (pathLooksPii(path)) return { kind: "pii", path: "" };
  return { kind: "internal", path };
}

function classifyTransition(input) {
  const href = input && input.href != null ? String(input.href) : "";
  const originPath = canonicalizePath((input && (input.origin_path || input.originPath)) || "");
  const attrs = (input && (input.attributes || input.attrs)) || {};
  const family = originFamilyFromPath(originPath);
  const dest = canonicalizeDestination(href);

  if (dest.kind === "whatsapp") return { kind: "whatsapp", event: "whatsapp_click" };
  if (dest.kind === "email") return { kind: "email", event: "email_click" };
  if (dest.kind === "tel" || dest.kind === "external") {
    return { kind: dest.kind, event: "outbound_click" };
  }
  if (dest.kind === "pii" || dest.kind === "empty") {
    return { kind: dest.kind, event: null };
  }
  if (/#contato/.test(href) || /^\/\?tema=/.test(href)) {
    return { kind: "contact", event: "cta_click" };
  }
  if (!family) {
    return { kind: "not_transition", event: null, origin_family: null, origin_path: originPath };
  }

  const knownId = lookupDestinationServiceId(dest.path);
  const destFamily = originFamilyFromPath(dest.path);
  if (!knownId && (destFamily || isChromePath(dest.path))) {
    return { kind: "not_transition", event: null, origin_family: family, origin_path: originPath };
  }

  const sourceAssetId = String(attrs.source_asset_id || attrs.asset_id || "").slice(0, 80)
    || assetIdFromPath(originPath);
  const sourceAssetFamily = String(attrs.source_asset_family || attrs.asset_family || "").slice(0, 80)
    || family;
  return {
    kind: "transition",
    event: "content_to_service",
    origin_family: family,
    origin_path: originPath,
    source_path: originPath,
    source_asset_id: sourceAssetId,
    source_asset_family: sourceAssetFamily,
    destination_path: dest.path,
    destination_service_id: knownId || UNKNOWN_SERVICE,
    cta_id: String(attrs.cta_id || "").slice(0, 80) || "unspecified",
    route_family: String(attrs.route_family || "").slice(0, 80) || "unspecified",
  };
}

function normalizeTransitionProps(canonical, props, meta) {
  const next = { ...(props || {}) };
  if (canonical !== "content_to_service") {
    if (next.destination_path) next.destination_path = canonicalizePath(next.destination_path);
    return next;
  }
  const originPath = canonicalizePath(next.source_path || (meta && meta.path) || next.page_path || "");
  const classified = classifyTransition({
    href: next.destination_path || next.href || "",
    origin_path: originPath,
    attributes: {
      source_asset_id: next.source_asset_id || next.asset_id,
      source_asset_family: next.source_asset_family || next.asset_family,
      cta_id: next.cta_id,
      route_family: next.route_family,
    },
  });
  if (classified.kind === "transition") {
    next.source_path = classified.source_path;
    next.source_asset_id = classified.source_asset_id;
    next.source_asset_family = classified.source_asset_family;
    next.destination_path = classified.destination_path;
    next.destination_service_id = classified.destination_service_id;
    if (classified.cta_id && !next.cta_id) next.cta_id = classified.cta_id;
    if (classified.route_family && !next.route_family) next.route_family = classified.route_family;
    if (!next.asset_id) next.asset_id = classified.source_asset_id;
    if (!next.asset_family) next.asset_family = classified.source_asset_family;
  } else if (next.destination_path) {
    const dest = canonicalizeDestination(next.destination_path);
    next.destination_path = dest.path || "";
    next.destination_service_id = lookupDestinationServiceId(next.destination_path) || UNKNOWN_SERVICE;
    if (originPath) next.source_path = originPath;
  } else {
    next.destination_service_id = UNKNOWN_SERVICE;
  }
  delete next.href;
  return next;
}

function maps() {
  return {
    schema_version: SOURCE_TO_SERVICE.schema_version || REGISTRY.schema_version,
    unknown_service: UNKNOWN_SERVICE,
    destinations: { ...CANONICAL_DESTINATIONS },
    origin_prefixes: { ...ORIGIN_PREFIXES },
    chrome_prefixes: [...CHROME_PREFIXES],
  };
}

module.exports = {
  UNKNOWN_SERVICE,
  CANONICAL_DESTINATIONS,
  ORIGIN_PREFIXES,
  CHROME_PREFIXES,
  canonicalizePath,
  canonicalizeDestination,
  classifyTransition,
  lookupDestinationServiceId,
  originFamilyFromPath,
  normalizeTransitionProps,
  maps,
};
