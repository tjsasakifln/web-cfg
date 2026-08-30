/**
 * Drive the shipped event contract, collect handler, and confengeTrack.
 * Proves inventory classification, envelope, unknown/custom rejection,
 * alias compatibility, funnel denominators, and empty PII allowlist.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import crypto from "crypto";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const contract = require(path.join(root, "netlify/functions/lib/event-contract.cjs"));
const collect = require(path.join(root, "netlify/functions/collect.cjs"));

const REQUIRED_ENVELOPE = [
  "source",
  "asset_id",
  "asset_family",
  "route_family",
  "intent",
  "cta_id",
  "cta_position",
  "offer_id",
  "next_action_id",
  "correlation_id",
  "idempotency_key",
  "consent",
  "pii_policy",
];
const DENOMINATORS = [
  "page_view",
  "engagement",
  "completion",
  "lead",
  "qualified_lead",
  "pipeline",
];

function fail(msg, extra) {
  console.error("FAIL", msg, extra ? JSON.stringify(extra) : "");
  process.exit(1);
}

function extractProducerNames() {
  const files = [
    "js/modules/analytics.js",
    "js/modules/nav.js",
    "js/modules/form.js",
    "assets/js/tools-common.js",
    "assets/js/market-answer.js",
    "assets/js/conversion-journey.js",
    "ferramentas/diagnostico-defesa-margem/index.html",
    "ferramentas/limite-acrescimos-supressoes/index.html",
    "ferramentas/checklist-reequilibrio/index.html",
    "ferramentas/matriz-atraso-obra/index.html",
    "guias-contratos-obras/checklist-pedido-aditivo/index.html",
    "scripts/market_answers/events.py",
    "index.html",
  ];
  const names = new Set();
  const re = /(?:track|emit|confengeTrack|T\.track)\(\s*["']([a-z0-9_]+)["']/g;
  const attrRe = /data-(?:event-name|ma-event|pseo-event)=["']([a-z0-9_]+)["']/g;
  for (const rel of files) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) fail("missing_producer_file", rel);
    const text = fs.readFileSync(full, "utf8");
    let m;
    while ((m = re.exec(text))) names.add(m[1]);
    while ((m = attrRe.exec(text))) names.add(m[1]);
    if (rel.endsWith(".py")) {
      const block = text.match(/EVENT_NAMES\s*=\s*\(([\s\S]*?)\)/);
      if (block) {
        const quoted = /"([a-z0-9_]+)"/g;
        let q;
        while ((q = quoted.exec(block[1]))) names.add(q[1]);
      }
    }
  }
  const collectSrc = fs.readFileSync(path.join(root, "netlify/functions/collect.cjs"), "utf8");
  if (/custom_\*/.test(collectSrc) || /startsWith\("custom_"\)/.test(collectSrc)) {
    fail("collect_still_allows_custom_prefix");
  }
  return [...names].sort();
}

// --- 1. Registry completeness ---
const inventory = contract.inventoryArtifact();
if (inventory.source !== "CONFENGE_WEB") fail("source", inventory.source);
if (inventory.pii_policy !== "aggregate_allowlist_empty") fail("pii_policy", inventory.pii_policy);
if (!Array.isArray(inventory.aggregate_pii_allowlist) || inventory.aggregate_pii_allowlist.length !== 0) {
  fail("allowlist_not_empty", inventory.aggregate_pii_allowlist);
}
for (const field of REQUIRED_ENVELOPE) {
  if (!inventory.envelope_fields.includes(field)) fail("missing_envelope_field", field);
}
for (const ev of inventory.events) {
  for (const need of ["name", "owner", "schema_version", "producers", "consumers", "semantic", "layer"]) {
    if (ev[need] == null || ev[need] === "") fail("event_missing_field", { name: ev.name, need });
  }
  if (!Array.isArray(ev.producers) || !Array.isArray(ev.consumers)) fail("event_roles", ev.name);
  if (!ev.consumers.length) fail("event_no_consumer", ev.name);
  if (ev.source !== "CONFENGE_WEB") fail("event_source", ev);
  if (ev.admission !== "collect" && ev.admission !== "observed_only") {
    fail("event_admission", ev);
  }
  if ((ev.name === "qualified_lead" || ev.name === "pipeline")) {
    if (ev.admission !== "observed_only" || ev.owner !== "warmbly") {
      fail("outcome_not_observed_only", ev);
    }
  }
  if (ev.admission === "collect") {
    if (!ev.producers.length) fail("admitted_event_without_emitter", ev.name);
    const emittedNames = [
      ev.name,
      ...inventory.aliases.filter((alias) => alias.canonical === ev.name).map((alias) => alias.name),
    ];
    const emitterEvidence = ev.producers.some((rel) => {
      const full = path.join(root, rel);
      if (!fs.existsSync(full)) fail("event_producer_missing", { name: ev.name, rel });
      const source = fs.readFileSync(full, "utf8");
      return emittedNames.some((name) => source.includes(name));
    });
    if (!emitterEvidence) fail("admitted_event_without_emitter", ev.name);
  }
}
for (const alias of inventory.aliases) {
  if (alias.classification !== "alias" || !alias.canonical || alias.same_layer !== true) {
    fail("alias_shape", alias);
  }
  if (!inventory.events.some((e) => e.name === alias.canonical)) fail("alias_canonical_missing", alias);
}

const EVENTISH = /^(page|session|cta|whatsapp|email|lead|tool|answer|method|evidence|analysis|xray|contract|asset|organic|scroll|qualified|content|service|offer|diagnostic|editorial|legal|case_law|checklist|data_insight|pseo|form|field|handraise|nurture|web_vital|outbound|return_visit|confirmation|comparison|proof|internal|correction|conversion|custom|journey|critical)/;
const producerNames = extractProducerNames();
const classified = {};
for (const name of producerNames) {
  if (!EVENTISH.test(name)) continue;
  const row = contract.classifyName(name);
  if (row.classification === "reject") fail("unclassified_producer", { name, row });
  classified[name] = row.classification;
}

// --- 2. Client/server name lockstep ---
const maps = contract.clientMaps();
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const analyticsMod = fs.readFileSync(path.join(root, "js/modules/analytics.js"), "utf8");
if (!analyticsMod.includes("EVENT_CONTRACT_CLIENT_START") || !script.includes("EVENT_CONTRACT_CLIENT_START")) {
  fail("client_contract_markers_missing");
}
for (const name of contract.admittedNames()) {
  if (!maps.admitted[name]) fail("client_map_missing_admitted", name);
  if (maps.observed_only && maps.observed_only[name]) fail("collect_name_marked_observed", name);
  if (!new RegExp(`${name}: 1`).test(analyticsMod) && !analyticsMod.includes(`${name}:`)) {
    fail("analytics_module_missing_admitted", name);
  }
}
for (const name of contract.observedOnlyNames()) {
  if (maps.admitted[name]) fail("observed_only_in_admitted", name);
  if (!maps.observed_only || !maps.observed_only[name]) fail("client_map_missing_observed", name);
  if (!analyticsMod.includes("OBSERVED_ONLY_EVENTS") || !analyticsMod.includes(`${name}: 1`)) {
    fail("analytics_module_missing_observed_only", name);
  }
}
if (!classified.journey_nav_click || classified.journey_nav_click !== "retire") {
  fail("journey_nav_click_not_retired", classified.journey_nav_click);
}
if (!inventory.retired.some((r) => r.name === "journey_nav_click")) {
  fail("journey_nav_click_missing_from_retired");
}
for (const [alias, canonical] of Object.entries(maps.aliases)) {
  if (!analyticsMod.includes(`${alias}: '${canonical}'`)) fail("analytics_alias_drift", { alias, canonical });
}
if (maps.aggregate_pii_allowlist.length !== 0) fail("client_map_allowlist");

// --- 3. Collect handler: accept / reject ---
async function postCollect(events) {
  return collect.handler({
    httpMethod: "POST",
    headers: { "content-type": "application/json", origin: "https://confenge.com.br" },
    body: JSON.stringify({ events }),
  });
}

async function collectPair() {
  const acceptRes = await postCollect([
    {
      event: "page_view",
      props: {
        page_path: "/",
        asset_id: "home",
        intent: "aprender_mercado",
        cta_id: "",
        correlation_id: "c-test-1",
        idempotency_key: "idk-test-1",
      },
      path: "/",
      sid: "sess-111111111111111111111111111",
    },
  ]);
  const acceptBody = JSON.parse(acceptRes.body);
  if (acceptRes.statusCode !== 202 || acceptBody.ok !== true || acceptBody.accepted !== 1) {
    fail("collect_accept", { status: acceptRes.statusCode, body: acceptBody });
  }
  const stored = collect._recent().slice(-1)[0];
  if (!stored || stored.event !== "page_view") fail("collect_recent", stored);

  const aliasRes = await postCollect([
    {
      event: "lead_created",
      props: { asset_id: "diagnostico-defesa-margem", route_family: "defesa-margem-diagnostico" },
      path: "/ferramentas/diagnostico-defesa-margem/",
    },
  ]);
  const aliasBody = JSON.parse(aliasRes.body);
  if (aliasRes.statusCode !== 202 || aliasBody.accepted !== 1) fail("collect_alias", aliasBody);
  const aliasStored = collect._recent().slice(-1)[0];
  if (!aliasStored || aliasStored.event !== "lead_persisted") fail("collect_alias_rewrite", aliasStored);
  if (aliasStored.alias_from !== "lead_created") fail("collect_alias_from", aliasStored);
  if (aliasStored.layer !== "lead") fail("alias_collapsed_layer", aliasStored);

  const rejectRes = await postCollect([
    { event: "not_a_real_event", props: { page_path: "/" } },
    { event: "custom_anything", props: { page_path: "/" } },
    { event: "conversion", props: { page_path: "/" } },
    { event: "journey_nav_click", props: { page_path: "/" } },
    { event: "qualified_lead", props: { page_path: "/" } },
    { event: "pipeline", props: { page_path: "/" } },
  ]);
  const rejectBody = JSON.parse(rejectRes.body);
  if (rejectRes.statusCode !== 202 || rejectBody.accepted !== 0 || rejectBody.rejected !== 6) {
    fail("collect_reject", rejectBody);
  }
  const reasons = (rejectBody.rejected_events || []).map((r) => r.reason).sort();
  if (!reasons.includes("unknown_event") || !reasons.includes("custom_prefix_forbidden") || !reasons.includes("retired")) {
    fail("collect_reject_reasons", rejectBody);
  }
  if (!reasons.includes("observed_owner_only")) {
    fail("collect_admitted_warmbly_outcome", rejectBody);
  }
  return { acceptBody, aliasBody, rejectBody };
}

const collectA = await collectPair();
const collectB = await collectPair();
if (collectA.acceptBody.accepted !== collectB.acceptBody.accepted) fail("collect_accept_inconsistent");
if (collectA.rejectBody.rejected !== collectB.rejectBody.rejected) fail("collect_reject_inconsistent");

// --- 4. Client track path ---
function driveClient() {
  const dataLayer = [];
  const fetches = [];
  const document = {
    readyState: "complete",
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    documentElement: { scrollHeight: 2000 },
    addEventListener: () => {},
    body: { classList: { remove() {}, add() {} }, getAttribute: () => null },
  };
  const windowObj = {
    dataLayer,
    matchMedia: () => ({ matches: false }),
    location: { pathname: "/", search: "", hash: "" },
    document,
    addEventListener: () => {},
    innerHeight: 800,
    scrollY: 0,
    sessionStorage: { getItem: () => "sid-client", setItem: () => {} },
    CONFENGE_DEBUG_ANALYTICS: false,
    fetch: async (url, opts) => {
      fetches.push({ url, body: opts && opts.body });
      return { ok: true, status: 202 };
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    clearTimeout: () => {},
  };
  windowObj.window = windowObj;
  const sandbox = {
    window: windowObj,
    document,
    console,
    URLSearchParams,
    setTimeout: windowObj.setTimeout,
    clearTimeout: windowObj.clearTimeout,
    fetch: windowObj.fetch,
    navigator: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "script.js"), "utf8"), sandbox);
  const track = sandbox.window.confengeTrack;
  if (typeof track !== "function") fail("confengeTrack_missing");
  const clientContract = sandbox.window.__CONFENGE_EVENT_CONTRACT;
  if (!clientContract || clientContract.source !== "CONFENGE_WEB") fail("client_contract_export", clientContract);
  if (!Array.isArray(clientContract.aggregate_pii_allowlist) || clientContract.aggregate_pii_allowlist.length !== 0) {
    fail("client_allowlist", clientContract.aggregate_pii_allowlist);
  }

  const envelopeUuid = crypto.randomUUID();
  const envelopeTs = `idk-${Date.now()}-envelope`;
  track("page_view", {
    page_path: "/",
    asset_id: "home",
    correlation_id: envelopeUuid,
    idempotency_key: envelopeTs,
  });
  track("lead_created", { asset_id: "diagnostico-defesa-margem", route_family: "defesa-margem-diagnostico" });
  track("lead_created", { asset_id: "diagnostico-defesa-margem", route_family: "defesa-margem-diagnostico" });
  track("not_a_real_event", { page_path: "/" });
  track("custom_foo", { page_path: "/" });
  track("conversion", { page_path: "/" });
  track("journey_nav_click", { page_path: "/" });
  track("qualified_lead", { page_path: "/" });
  track("pipeline", { page_path: "/" });
  track("qualified_scroll", { page_path: "/", cta_position: "scroll_50" });

  const names = dataLayer.map((e) => e.event);
  if (!names.includes("page_view")) fail("client_missing_page_view", names);
  if (!names.includes("lead_persisted")) fail("client_alias_not_rewritten", names);
  if (names.includes("lead_created")) fail("client_emitted_alias", names);
  const persistedCount = names.filter((n) => n === "lead_persisted").length;
  if (persistedCount !== 2) fail("client_alias_dual_canonical", { persistedCount, names });
  if (names.includes("not_a_real_event") || names.includes("custom_foo") || names.includes("conversion")
    || names.includes("journey_nav_click") || names.includes("qualified_lead") || names.includes("pipeline")) {
    fail("client_emitted_rejected", names);
  }
  if (!names.includes("scroll_depth")) fail("client_scroll_alias", names);
  const persisted = dataLayer.find((e) => e.event === "lead_persisted");
  if (persisted.source !== "CONFENGE_WEB" || persisted.pii_policy !== "aggregate_allowlist_empty") {
    fail("client_envelope", persisted);
  }
  const viewed = dataLayer.find((e) => e.event === "page_view");
  if (!viewed || viewed.correlation_id !== envelopeUuid || viewed.idempotency_key !== envelopeTs) {
    fail("client_dropped_envelope_ids", viewed);
  }
  const flushed = fetches.map((f) => {
    try { return JSON.parse(f.body); } catch { return null; }
  }).filter(Boolean);
  const flushedView = flushed.flatMap((b) => b.events || []).find((e) => e.event === "page_view");
  if (!flushedView || !flushedView.props || flushedView.props.correlation_id !== envelopeUuid
    || flushedView.props.idempotency_key !== envelopeTs) {
    fail("client_flush_dropped_envelope_ids", { flushedView, fetches: flushed });
  }
  return { names, dataLayer, envelopeUuid, envelopeTs };
}

const clientA = driveClient();
const clientB = driveClient();
if (JSON.stringify(clientA.names) !== JSON.stringify(clientB.names)) fail("client_inconsistent", { a: clientA.names, b: clientB.names });

// --- 5. Reconcile denominators ---
const sample = [
  { event: "page_view", path: "/" },
  { event: "service_page_view", path: "/defesa-margem-contratos-publicos/" },
  { event: "cta_click", props: { cta_id: "hero" } },
  { event: "tool_complete", props: { tool: "limite" } },
  { event: "lead_created", props: { asset_id: "diagnostico-defesa-margem" } },
  { event: "lead_form_success", path: "/obrigado-contrato" },
];
const reconciled = contract.reconcileFunnel({ events: sample });
if (reconciled.denominators.page_view !== 2) fail("reconcile_page_view", reconciled);
if (reconciled.denominators.engagement < 2) fail("reconcile_engagement", reconciled);
if (reconciled.denominators.completion !== 1) fail("reconcile_completion", reconciled);
if (reconciled.denominators.lead !== 1) fail("reconcile_lead", reconciled);
if (reconciled.denominators.qualified_lead !== 0) fail("reconcile_qlead_derived", reconciled);
if (reconciled.denominators.pipeline !== 0) fail("reconcile_pipeline_derived", reconciled);
if (reconciled.observed.qualified_lead !== "UNKNOWN") fail("reconcile_qlead_unknown", reconciled);
if (reconciled.observed.pipeline !== "UNKNOWN") fail("reconcile_pipeline_unknown", reconciled);
if (reconciled.derived_qualified_lead !== false || reconciled.derived_pipeline !== false) {
  fail("reconcile_derived_flags", reconciled);
}
if (reconciled.by_event.lead_persisted !== 1 || reconciled.by_event.lead_created) {
  fail("reconcile_lead_alias", reconciled.by_event);
}
for (const key of DENOMINATORS) {
  if (typeof reconciled.denominators[key] !== "number") fail("denominator_missing", key);
}

let promoted = false;
try {
  contract.reconcileFunnel({ events: sample, treat_as: { page_view: "qualified_lead" } });
} catch (err) {
  promoted = err && err.code === "cannot_derive_outcome";
}
if (!promoted) fail("page_view_promoted_to_qualified_lead");
promoted = false;
try {
  contract.reconcileFunnel({ events: sample, treat_as: { lead: "pipeline" } });
} catch (err) {
  promoted = err && err.code === "cannot_derive_outcome";
}
if (!promoted) fail("lead_promoted_to_pipeline");

for (const [from, to] of [
  ["cta_click", "qualified_lead"],
  ["tool_complete", "pipeline"],
  ["lead_form_success", "pipeline"],
  ["lead_persisted", "qualified_lead"],
]) {
  let blocked = false;
  try {
    contract.reconcileFunnel({ events: sample, treat_as: { [from]: to } });
  } catch (err) {
    blocked = err && err.code === "cannot_derive_outcome";
  }
  if (!blocked) fail("later_stage_derived", { from, to });
}

const withWarmbly = contract.reconcileFunnel({
  events: sample,
  warmbly: { owner: "warmbly", qualified_lead: 1, pipeline: 1 },
});
if (withWarmbly.denominators.qualified_lead !== 1 || withWarmbly.denominators.pipeline !== 1) {
  fail("warmbly_observed", withWarmbly);
}
if (withWarmbly.derived_qualified_lead !== false) fail("warmbly_marked_derived");

const withoutWarmblyOwner = contract.reconcileFunnel({
  events: sample,
  warmbly: { qualified_lead: 1, pipeline: 1 },
});
if (
  withoutWarmblyOwner.denominators.qualified_lead !== 0
  || withoutWarmblyOwner.denominators.pipeline !== 0
  || withoutWarmblyOwner.observation_reason !== "wrong_owner"
) {
  fail("warmbly_owner_must_be_explicit", withoutWarmblyOwner);
}

const fixtureWarmbly = contract.reconcileFunnel({
  events: sample,
  warmbly: { owner: "warmbly", qualified_lead: 3, pipeline: 2, kind: "synthetic" },
});
if (fixtureWarmbly.denominators.qualified_lead !== 0 || fixtureWarmbly.denominators.pipeline !== 0) {
  fail("fixture_promoted_stage", fixtureWarmbly);
}
if (fixtureWarmbly.observed.qualified_lead !== "UNKNOWN" || fixtureWarmbly.observed.pipeline !== "UNKNOWN") {
  fail("fixture_observed_not_unknown", fixtureWarmbly);
}
if (fixtureWarmbly.observation_reason !== "fixture_or_synthetic") {
  fail("fixture_reason", fixtureWarmbly);
}

const wrongOwner = contract.reconcileFunnel({
  events: sample,
  warmbly: { qualified_lead: 1, pipeline: 1, owner: "web-cfg" },
});
if (wrongOwner.denominators.qualified_lead !== 0 || wrongOwner.denominators.pipeline !== 0) {
  fail("wrong_owner_promoted", wrongOwner);
}
if (wrongOwner.observation_reason !== "wrong_owner") fail("wrong_owner_reason", wrongOwner);

const outcomeAsEvent = contract.reconcileFunnel({
  events: [
    { event: "qualified_lead", props: { page_path: "/" } },
    { event: "pipeline", props: { page_path: "/" } },
  ],
});
if (outcomeAsEvent.denominators.qualified_lead !== 0 || outcomeAsEvent.denominators.pipeline !== 0) {
  fail("outcome_event_counted", outcomeAsEvent);
}
if (!outcomeAsEvent.rejected.some((r) => r.reason === "observed_owner_only")) {
  fail("outcome_event_not_rejected", outcomeAsEvent);
}

// --- 6. PII allowlist empty; admission cannot keep PII ---
if (contract.AGGREGATE_PII_ALLOWLIST.length !== 0) fail("allowlist_runtime");
const piiAdmit = contract.admitEvent({
  event: "page_view",
  props: {
    page_path: "/",
    nome: "Alice",
    email: "alice@example.com",
    telefone: "48988887777",
    cnpj: "12345678000199",
    query: "valor tipico contrato",
    asset_id: "home",
  },
});
if (!piiAdmit.ok) fail("pii_keys_should_strip_then_admit", piiAdmit);
const admittedBlob = JSON.stringify(piiAdmit.event);
for (const bad of ["Alice", "alice@example.com", "48988887777", "12345678000199", "valor tipico contrato", "nome", "email", "telefone", "cnpj", "query"]) {
  if (bad === "nome" || bad === "email" || bad === "telefone" || bad === "cnpj" || bad === "query") {
    if (piiAdmit.event.props[bad] != null) fail("pii_key_admitted", { key: bad, event: piiAdmit.event });
    continue;
  }
  if (admittedBlob.includes(bad)) fail("pii_value_admitted", { bad, event: piiAdmit.event });
}
const piiValue = contract.admitEvent({
  event: "page_view",
  props: { page_path: "/", note: "alice@example.com" },
});
if (!piiValue.ok || piiValue.event.props.note != null || !piiValue.dropped.includes("note")) {
  fail("pii_like_value_admitted", piiValue);
}
const cnpjValue = contract.admitEvent({
  event: "internal_search",
  props: { page_path: "/", note: "12345678000199" },
});
if (!cnpjValue.ok || cnpjValue.event.props.note != null || !cnpjValue.dropped.includes("note")) {
  fail("cnpj_like_value_admitted", cnpjValue);
}

const collectPii = await postCollect([
  {
    event: "asset_view",
    props: {
      asset_id: "diagnostico-defesa-margem",
      nome: "Maria",
      email: "maria@example.com",
      telefone: "48999999999",
    },
    path: "/ferramentas/diagnostico-defesa-margem/",
  },
]);
const collectPiiBody = JSON.parse(collectPii.body);
if (collectPii.statusCode !== 202 || collectPiiBody.accepted !== 1) fail("collect_pii_strip", collectPiiBody);
const recentPii = collect._recent().slice(-1)[0];
const recentBlob = JSON.stringify(recentPii);
if (/Maria|maria@example.com|48999999999/.test(recentBlob)) fail("collect_pii_in_recent", recentPii);
const scrubbed = collect._scrubProps({
  asset_id: "diagnostico-defesa-margem",
  nome: "Maria",
  email: "maria@example.com",
  telefone: "48999999999",
});
if (scrubbed.nome || scrubbed.email || scrubbed.telefone) fail("collect_pii_keys", scrubbed);
if (!scrubbed.asset_id) fail("scrub_dropped_asset");

// Envelope identifiers: UUID + Date.now() key must survive admit, collect, and confengeTrack.
if (!contract.ENVELOPE_ID_KEYS || !contract.ENVELOPE_ID_KEYS.has("correlation_id")
  || !contract.ENVELOPE_ID_KEYS.has("idempotency_key")) {
  fail("envelope_id_keys_missing", [...(contract.ENVELOPE_ID_KEYS || [])]);
}
const envelopeUuid = crypto.randomUUID();
const envelopeTs = `idk-${Date.now()}-envelope`;
const cPrefix = `c-${Date.now()}`;
const envelopeAdmit = contract.admitEvent({
  event: "page_view",
  props: {
    page_path: "/",
    asset_id: "home",
    correlation_id: envelopeUuid,
    idempotency_key: envelopeTs,
    intent: cPrefix,
  },
});
if (!envelopeAdmit.ok) fail("envelope_ids_admit_rejected", envelopeAdmit);
if (envelopeAdmit.event.props.correlation_id !== envelopeUuid) {
  fail("envelope_uuid_dropped", envelopeAdmit.event.props);
}
if (envelopeAdmit.event.props.idempotency_key !== envelopeTs) {
  fail("envelope_ts_key_dropped", envelopeAdmit.event.props);
}
const collectEnvelope = await postCollect([{
  event: "cta_click",
  props: {
    page_path: "/",
    cta_id: "hero",
    correlation_id: envelopeUuid,
    idempotency_key: envelopeTs,
  },
  path: "/",
}]);
const collectEnvelopeBody = JSON.parse(collectEnvelope.body);
if (collectEnvelope.statusCode !== 202 || collectEnvelopeBody.accepted !== 1) {
  fail("collect_envelope_ids_rejected", collectEnvelopeBody);
}
const recentEnvelope = collect._recent().slice(-1)[0];
if (!recentEnvelope || recentEnvelope.correlation_id !== envelopeUuid
  || recentEnvelope.idempotency_key !== envelopeTs) {
  fail("collect_envelope_ids_not_stored", recentEnvelope);
}
if (clientA.envelopeUuid === clientA.envelopeTs) fail("client_envelope_ids_collapsed");
const emailInCorr = contract.admitEvent({
  event: "page_view",
  props: { page_path: "/", correlation_id: "alice@example.com" },
});
if (emailInCorr.ok) fail("email_in_correlation_id_admitted", emailInCorr);

// --- 7. Dual-count guard: lead_form_success is not lead ---
const dual = contract.reconcileFunnel({
  events: [
    { event: "lead_form_success" },
    { event: "lead_persisted" },
    { event: "lead_created" },
  ],
});
if (dual.denominators.lead !== 2) fail("dual_lead", dual);
if (dual.denominators.engagement !== 1) fail("success_not_engagement", dual);

const artifact = {
  inventory,
  producer_names: producerNames,
  classified,
  collect: { accept: collectA.acceptBody, reject: collectA.rejectBody },
  client: { names: clientA.names },
  reconcile: reconciled,
  pii: {
    aggregate_pii_allowlist: [...contract.AGGREGATE_PII_ALLOWLIST],
    stripped_keys: piiAdmit.dropped,
    value_rejected: piiValue.reason,
    cnpj_rejected: cnpjValue.reason,
  },
  envelope_ids: {
    admit_ok: envelopeAdmit.ok,
    correlation_id: envelopeAdmit.event.props.correlation_id,
    idempotency_key: envelopeAdmit.event.props.idempotency_key,
    collect_accepted: collectEnvelopeBody.accepted,
    collect_recent: recentEnvelope,
    client_uuid: clientA.envelopeUuid,
    client_ts: clientA.envelopeTs,
  },
};

console.log("EVENT_DICTIONARY_OK", JSON.stringify({
  admitted: inventory.events.length,
  aliases: inventory.aliases.length,
  retired: inventory.retired.length,
  producers_classified: Object.keys(classified).length,
  denominators: reconciled.denominators,
  observed: reconciled.observed,
  collect_rejected: collectA.rejectBody.rejected,
  client_names: clientA.names,
  pii_allowlist: contract.AGGREGATE_PII_ALLOWLIST,
}));

if (process.env.EVENT_DICTIONARY_OUT) {
  fs.writeFileSync(process.env.EVENT_DICTIONARY_OUT, JSON.stringify(artifact, null, 2));
}
