/**
 * Funnel event contract — single source for names, envelope, minimize, admit, reconcile.
 * Registry: ./event-registry.json
 * Public source is always CONFENGE_WEB. Aggregate PII allowlist is empty.
 */
const REGISTRY = require("./event-registry.json");
const sts = require("./source-to-service.cjs");

const SOURCE = REGISTRY.source;
const SCHEMA_VERSION = REGISTRY.schema_version;
const PII_POLICY = REGISTRY.pii_policy;
const AGGREGATE_PII_ALLOWLIST = Object.freeze([...(REGISTRY.aggregate_pii_allowlist || [])]);
const PII_KEYS = new Set((REGISTRY.pii_keys || []).map((k) => String(k).toLowerCase()));
const REJECT_PREFIXES = REGISTRY.reject_prefixes || [];
const DENOMINATORS = Object.freeze([...(REGISTRY.denominators || [])]);
const ENVELOPE_FIELDS = Object.freeze([...(REGISTRY.envelope_fields || [])]);
const CTA_KIND_FROM_ALIAS = REGISTRY.cta_kind_from_alias || {};
// Envelope identifiers may contain Date.now() / UUID digits. Match lead-core.cjs:82.
const ENVELOPE_ID_KEYS = new Set(["correlation_id", "idempotency_key", "event_id"]);

const LAYER_RANK = Object.freeze({
  session: 0,
  page_view: 1,
  engagement: 2,
  completion: 3,
  lead: 4,
  qualified_lead: 5,
  pipeline: 6,
});

function getRegistry() {
  return REGISTRY;
}

function isObservedOnly(name) {
  const def = REGISTRY.events[name];
  return !!(def && def.admission === "observed_only");
}

function admittedNames() {
  return Object.keys(REGISTRY.events)
    .filter((name) => !isObservedOnly(name))
    .sort();
}

function observedOnlyNames() {
  return Object.keys(REGISTRY.events)
    .filter((name) => isObservedOnly(name))
    .sort();
}

function aliasNames() {
  return Object.keys(REGISTRY.aliases).sort();
}

function retiredNames() {
  return Object.keys(REGISTRY.retired).sort();
}

function classifyName(raw) {
  const name = String(raw || "").slice(0, 64);
  if (!name) return { classification: "reject", reason: "empty_name", name };
  if (REJECT_PREFIXES.some((p) => name.startsWith(p))) {
    return { classification: "retire", reason: "custom_prefix_forbidden", name, prefix: true };
  }
  if (REGISTRY.retired[name]) {
    return {
      classification: "retire",
      reason: "retired",
      name,
      detail: REGISTRY.retired[name].reason,
    };
  }
  if (REGISTRY.aliases[name]) {
    const alias = REGISTRY.aliases[name];
    return {
      classification: "alias",
      name,
      canonical: alias.canonical,
      rule: alias.rule,
      same_layer: alias.same_layer === true,
      semantic: alias.semantic,
    };
  }
  if (REGISTRY.events[name]) {
    return { classification: "keep", name, canonical: name };
  }
  return { classification: "reject", reason: "unknown_event", name };
}

function resolveName(raw) {
  const classified = classifyName(raw);
  if (classified.classification === "alias") return classified.canonical;
  if (classified.classification === "keep") return classified.canonical;
  return null;
}

function resolveCollectName(raw) {
  const canonical = resolveName(raw);
  if (!canonical || isObservedOnly(canonical)) return null;
  return canonical;
}

function eventDef(name) {
  const canonical = resolveName(name) || name;
  return REGISTRY.events[canonical] || null;
}

function looksLikePiiValue(value, key) {
  if (typeof value !== "string") return false;
  const s = value;
  if (!s) return false;
  if (/@/.test(s)) return true;
  const k = String(key || "").toLowerCase();
  if (ENVELOPE_ID_KEYS.has(k)) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return false;
  if (s.startsWith("c-")) return false;
  if (/@|\+?\d{8,}/.test(s)) return true;
  const compact = s.replace(/[\s()-]/g, "");
  if (/^\+?\d{10,15}$/.test(compact)) return true;
  if (/^\d{14}$/.test(s.trim())) return true;
  if (/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(s)) return true;
  return false;
}

function keyLooksPii(key) {
  const k = String(key || "").toLowerCase();
  if (PII_KEYS.has(k)) return true;
  if (AGGREGATE_PII_ALLOWLIST.includes(k)) return false;
  return /email|phone|tel|nome|name|mensagem|message|whatsapp|cpf|cnpj|document|valor|causa|observacao|qid/.test(k);
}

function minimizeProps(props) {
  const out = {};
  const dropped = [];
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return { props: out, dropped, tainted: false };
  }
  let tainted = false;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === "") continue;
    if (keyLooksPii(k)) {
      dropped.push(k);
      continue;
    }
    if (typeof v === "string") {
      if (looksLikePiiValue(v, k)) {
        tainted = true;
        dropped.push(k);
        continue;
      }
      out[k] = v.slice(0, 120);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return { props: out, dropped, tainted };
}

function applyEnvelope(canonical, props, meta = {}) {
  const def = REGISTRY.events[canonical];
  const next = { ...props };
  next.source = SOURCE;
  next.pii_policy = PII_POLICY;
  next.schema_version = (def && def.schema_version) || SCHEMA_VERSION;
  next.event_layer = (def && def.layer) || "";
  if (!next.consent) next.consent = "not_required";
  if (meta.cta_kind && !next.cta_kind) next.cta_kind = meta.cta_kind;
  return next;
}

function admitEvent(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const original = String(input.event || input.name || "").slice(0, 64);
  const classified = classifyName(original);
  if (classified.classification === "retire") {
    return {
      ok: false,
      reason: classified.reason || "retired",
      original,
      classification: classified.classification,
    };
  }
  if (classified.classification === "reject") {
    return {
      ok: false,
      reason: classified.reason || "unknown_event",
      original,
      classification: classified.classification,
    };
  }
  const canonical = classified.canonical;
  const def = REGISTRY.events[canonical];
  if (!def) {
    return { ok: false, reason: "unknown_event", original, classification: "reject" };
  }
  if (def.admission === "observed_only") {
    return {
      ok: false,
      reason: "observed_owner_only",
      original,
      canonical,
      owner: def.owner,
      classification: "reject",
    };
  }

  const rawProps = input.props && typeof input.props === "object" && !Array.isArray(input.props)
    ? input.props
    : Object.fromEntries(
        Object.entries(input).filter(([k]) => !["event", "name", "props", "path", "sid", "session_id", "ts"].includes(k)),
      );
  const minimized = minimizeProps(rawProps);
  if (minimized.tainted) {
    return {
      ok: false,
      reason: "pii_value",
      original,
      canonical,
      classification: classified.classification,
      dropped: minimized.dropped,
    };
  }
  if (AGGREGATE_PII_ALLOWLIST.length !== 0) {
    return { ok: false, reason: "pii_allowlist_not_empty", original, canonical };
  }
  for (const key of Object.keys(minimized.props)) {
    if (keyLooksPii(key)) {
      return {
        ok: false,
        reason: "pii_key_admitted",
        original,
        canonical,
        key,
      };
    }
  }

  const aliasMeta = classified.classification === "alias"
    ? { cta_kind: CTA_KIND_FROM_ALIAS[original] }
    : {};
  const path = String(input.path || minimized.props.page_path || minimized.props.path || "").slice(0, 180);
  const safePath = /@|whatsapp|telefone/i.test(path) ? "/[redacted]" : (sts.canonicalizePath(path) || path);
  const transitionProps = sts.normalizeTransitionProps(canonical, minimized.props, { path: safePath });
  const props = applyEnvelope(canonical, transitionProps, aliasMeta);

  return {
    ok: true,
    original,
    canonical,
    classification: classified.classification,
    layer: def.layer,
    owner: def.owner,
    schema_version: def.schema_version || SCHEMA_VERSION,
    dropped: minimized.dropped,
    event: {
      event: canonical,
      schema_version: def.schema_version || SCHEMA_VERSION,
      source: SOURCE,
      layer: def.layer,
      owner: def.owner,
      alias_from: classified.classification === "alias" ? original : undefined,
      props,
      path: safePath,
      sid: String(input.sid || input.session_id || "").slice(0, 32),
    },
  };
}

function admitBatch(events, seen) {
  const seenIds = seen instanceof Set ? seen : new Set();
  const admitted = [];
  const rejected = [];
  for (const ev of events || []) {
    const result = admitEvent(ev);
    if (!result.ok) {
      rejected.push({
        event: ev && (ev.event || ev.name),
        reason: result.reason,
      });
      continue;
    }
    const eventId = String((result.event.props && result.event.props.event_id) || "").slice(0, 80);
    if (eventId && seenIds.has(eventId)) {
      rejected.push({ event: result.canonical, reason: "duplicate_event_id", event_id: eventId });
      continue;
    }
    if (eventId) seenIds.add(eventId);
    admitted.push(result);
  }
  return { admitted, rejected, seen: seenIds };
}

function assertNotPromoted(fromLayer, toLayer) {
  const from = String(fromLayer || "");
  const to = String(toLayer || "");
  if ((to === "qualified_lead" || to === "pipeline") && LAYER_RANK[from] < LAYER_RANK[to]) {
    const err = new Error(`cannot_derive_${to}_from_${from}`);
    err.code = "cannot_derive_outcome";
    err.fromLayer = from;
    err.toLayer = to;
    throw err;
  }
  return true;
}

/**
 * Reconcile funnel counts. Warmbly stages are observed inputs.
 * Never derives qualified_lead or pipeline from an earlier stage.
 */
function reconcileFunnel(input) {
  const events = (input && input.events) || [];
  const treatAs = (input && input.treat_as) || null;
  if (treatAs && typeof treatAs === "object") {
    for (const [from, to] of Object.entries(treatAs)) {
      const fromDef = eventDef(from);
      const fromLayer = (fromDef && fromDef.layer) || from;
      assertNotPromoted(fromLayer, to);
    }
  }

  const denominators = {
    page_view: 0,
    engagement: 0,
    completion: 0,
    lead: 0,
    qualified_lead: 0,
    pipeline: 0,
  };
  const byEvent = {};
  const rejected = [];
  const admitted = [];

  for (const ev of events) {
    const result = admitEvent(ev);
    if (!result.ok) {
      rejected.push({ event: ev && (ev.event || ev.name), reason: result.reason });
      continue;
    }
    admitted.push(result.event);
    byEvent[result.canonical] = (byEvent[result.canonical] || 0) + 1;
    if (Object.prototype.hasOwnProperty.call(denominators, result.layer)) {
      denominators[result.layer] += 1;
    }
  }

  const observation = acceptWarmblyObservation((input && input.warmbly) || {});
  const observed = {
    qualified_lead: observation.qualified_lead,
    pipeline: observation.pipeline,
  };

  if (observation.accepted) {
    if (observed.qualified_lead !== "UNKNOWN" && Number.isFinite(Number(observed.qualified_lead))) {
      denominators.qualified_lead = Number(observed.qualified_lead);
    }
    if (observed.pipeline !== "UNKNOWN" && Number.isFinite(Number(observed.pipeline))) {
      denominators.pipeline = Number(observed.pipeline);
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    source: SOURCE,
    denominators,
    by_event: byEvent,
    observed,
    derived_qualified_lead: false,
    derived_pipeline: false,
    rejected,
    admitted_count: admitted.length,
    observation_reason: observation.reason || undefined,
  };
}

function isFixtureOrSynthetic(meta) {
  if (!meta || typeof meta !== "object") return false;
  if (meta.fixture === true || meta.synthetic === true) return true;
  const kind = String(meta.kind || meta.record_kind || "").toLowerCase();
  if (kind === "fixture" || kind === "synthetic" || kind === "qa") return true;
  const source = String(meta.source || "").toLowerCase();
  if (source === "fixture" || source === "synthetic") return true;
  if (meta.official_live === false) return true;
  return false;
}

function acceptWarmblyObservation(warmbly) {
  const unknown = { qualified_lead: "UNKNOWN", pipeline: "UNKNOWN", accepted: false, reason: null };
  if (!warmbly || typeof warmbly !== "object" || Array.isArray(warmbly)) {
    return { ...unknown, reason: null };
  }
  const owner = String(warmbly.owner || "warmbly").toLowerCase();
  if (owner !== "warmbly") {
    return { ...unknown, reason: "wrong_owner" };
  }
  if (isFixtureOrSynthetic(warmbly)) {
    return { ...unknown, reason: "fixture_or_synthetic" };
  }
  const hasQl = Object.prototype.hasOwnProperty.call(warmbly, "qualified_lead");
  const hasPipe = Object.prototype.hasOwnProperty.call(warmbly, "pipeline");
  if (!hasQl && !hasPipe) {
    return { ...unknown, reason: null };
  }
  return {
    qualified_lead: hasQl ? warmbly.qualified_lead : "UNKNOWN",
    pipeline: hasPipe ? warmbly.pipeline : "UNKNOWN",
    accepted: true,
    reason: null,
  };
}

function inventoryArtifact() {
  const events = Object.entries(REGISTRY.events).map(([name, def]) => ({
    name,
    classification: "keep",
    layer: def.layer,
    owner: def.owner,
    schema_version: def.schema_version,
    producers: def.producers,
    consumers: def.consumers,
    semantic: def.semantic,
    admission: def.admission || "collect",
    envelope_fields: ENVELOPE_FIELDS,
    source: SOURCE,
    pii_policy: PII_POLICY,
  }));
  const aliases = Object.entries(REGISTRY.aliases).map(([name, def]) => ({
    name,
    classification: "alias",
    canonical: def.canonical,
    rule: def.rule,
    same_layer: def.same_layer === true,
    semantic: def.semantic,
    layer: REGISTRY.events[def.canonical] && REGISTRY.events[def.canonical].layer,
    owner: REGISTRY.events[def.canonical] && REGISTRY.events[def.canonical].owner,
    schema_version: REGISTRY.events[def.canonical] && REGISTRY.events[def.canonical].schema_version,
  }));
  const retired = Object.entries(REGISTRY.retired).map(([name, def]) => ({
    name,
    classification: "retire",
    reason: def.reason,
    replacement: def.replacement,
  }));
  return {
    schema_version: SCHEMA_VERSION,
    source: SOURCE,
    pii_policy: PII_POLICY,
    aggregate_pii_allowlist: [...AGGREGATE_PII_ALLOWLIST],
    envelope_fields: [...ENVELOPE_FIELDS],
    denominators: [...DENOMINATORS],
    events: events.sort((a, b) => a.name.localeCompare(b.name)),
    aliases: aliases.sort((a, b) => a.name.localeCompare(b.name)),
    retired: retired.sort((a, b) => a.name.localeCompare(b.name)),
    reject_prefixes: [...REJECT_PREFIXES],
  };
}

function clientMaps() {
  const admitted = {};
  const layers = {};
  const observedOnly = {};
  for (const [name, def] of Object.entries(REGISTRY.events)) {
    layers[name] = def.layer;
    if (def.admission === "observed_only") {
      observedOnly[name] = 1;
      continue;
    }
    admitted[name] = 1;
  }
  const aliases = {};
  for (const [name, def] of Object.entries(REGISTRY.aliases)) {
    aliases[name] = def.canonical;
  }
  return {
    schema_version: SCHEMA_VERSION,
    source: SOURCE,
    pii_policy: PII_POLICY,
    aggregate_pii_allowlist: [...AGGREGATE_PII_ALLOWLIST],
    pii_keys: [...PII_KEYS].sort(),
    admitted,
    observed_only: observedOnly,
    aliases,
    layers,
    retired: retiredNames(),
    reject_prefixes: [...REJECT_PREFIXES],
    cta_kind_from_alias: { ...CTA_KIND_FROM_ALIAS },
    source_to_service: sts.maps(),
  };
}

function scrubProps(props) {
  return minimizeProps(props).props;
}

module.exports = {
  SOURCE,
  SCHEMA_VERSION,
  PII_POLICY,
  AGGREGATE_PII_ALLOWLIST,
  PII_KEYS,
  DENOMINATORS,
  ENVELOPE_FIELDS,
  ENVELOPE_ID_KEYS,
  LAYER_RANK,
  UNKNOWN_SERVICE: sts.UNKNOWN_SERVICE,
  CANONICAL_DESTINATIONS: sts.CANONICAL_DESTINATIONS,
  ORIGIN_PREFIXES: sts.ORIGIN_PREFIXES,
  canonicalizePath: sts.canonicalizePath,
  canonicalizeDestination: sts.canonicalizeDestination,
  classifyTransition: sts.classifyTransition,
  lookupDestinationServiceId: sts.lookupDestinationServiceId,
  originFamilyFromPath: sts.originFamilyFromPath,
  normalizeTransitionProps: sts.normalizeTransitionProps,
  getRegistry,
  admittedNames,
  observedOnlyNames,
  aliasNames,
  retiredNames,
  classifyName,
  resolveName,
  resolveCollectName,
  isObservedOnly,
  isFixtureOrSynthetic,
  acceptWarmblyObservation,
  eventDef,
  looksLikePiiValue,
  keyLooksPii,
  minimizeProps,
  applyEnvelope,
  admitEvent,
  admitBatch,
  assertNotPromoted,
  reconcileFunnel,
  inventoryArtifact,
  clientMaps,
  scrubProps,
};
