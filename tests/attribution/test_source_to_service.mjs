/**
 * Drive shipped click/track, collector admit, and aggregator for #153.
 * Fixtures are current HTML data attributes / href — this file does not edit pages.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const contract = require(path.join(root, "netlify/functions/lib/event-contract.cjs"));
const collect = require(path.join(root, "netlify/functions/collect.cjs"));
const agg = require(path.join(root, "netlify/functions/lib/analytics-agg.cjs"));
const sourceToService = require(path.join(root, "netlify/functions/lib/source-to-service.cjs"));

const MIN_FIELDS = [
  "source_path",
  "source_asset_id",
  "source_asset_family",
  "destination_path",
  "destination_service_id",
  "cta_id",
  "route_family",
  "event_id",
  "schema_version",
];

function fail(msg, extra) {
  console.error("FAIL", msg, extra ? JSON.stringify(extra, null, 2) : "");
  process.exit(1);
}

function parseOpenTag(tag) {
  const attrs = {};
  const re = /([a-zA-Z0-9:_-]+)=["']([^"']*)["']/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1]] = m[2];
  return attrs;
}

function bodyAttrs(html) {
  const m = html.match(/<body\b[^>]*>/i);
  return m ? parseOpenTag(m[0]) : {};
}

function findAnchor(html, pred) {
  const re = /<a\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = parseOpenTag(m[0]);
    if (pred(attrs)) return attrs;
  }
  return null;
}

function htmlOf(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) fail("missing_html_fixture", rel);
  return fs.readFileSync(full, "utf8");
}

function makeEl(attrMap, text) {
  const clickFns = [];
  const attrs = { ...attrMap };
  return {
    attrs,
    textContent: text || "CTA",
    classList: { contains: () => false },
    getAttribute(name) {
      if (Object.prototype.hasOwnProperty.call(attrs, name)) return attrs[name];
      return null;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    closest() {
      return null;
    },
    addEventListener(type, fn) {
      if (type === "click") clickFns.push(fn);
    },
    click() {
      const evt = { preventDefault() {} };
      for (const fn of clickFns) fn(evt);
    },
    _clicks: clickFns,
  };
}

function driveScript({ pathname, body, hrefEls, namedEls, waEls, mailEls, telEls }) {
  const dataLayer = [];
  const fetches = [];
  const bodyEl = {
    classList: { add() {}, remove() {} },
    getAttribute(name) {
      return (body && body[name]) || null;
    },
  };
  const document = {
    readyState: "complete",
    body: bodyEl,
    documentElement: { scrollHeight: 2000, classList: { replace() {} } },
    head: { appendChild() {} },
    referrer: "",
    querySelector: () => null,
    querySelectorAll(sel) {
      const s = String(sel || "");
      if (s.includes("wa.me")) return waEls || [];
      if (s.includes("mailto")) return mailEls || [];
      if (s.includes("tel:") || s.includes("sms:")) return telEls || [];
      if (s === "a[href]") return hrefEls || [];
      if (s === "[data-event-name]") return namedEls || [];
      return [];
    },
    getElementById: () => null,
    addEventListener: () => {},
    createElement: () => ({ setAttribute() {}, querySelector: () => null }),
  };
  const storage = new Map();
  const windowObj = {
    dataLayer,
    matchMedia: () => ({ matches: false }),
    location: { pathname, search: "", hash: "" },
    document,
    addEventListener: () => {},
    innerHeight: 800,
    scrollY: 0,
    innerWidth: 1200,
    sessionStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
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
    URL,
    setTimeout: windowObj.setTimeout,
    clearTimeout: windowObj.clearTimeout,
    fetch: windowObj.fetch,
    navigator: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "script.js"), "utf8"), sandbox);
  const track = sandbox.window.confengeTrack;
  if (typeof track !== "function") fail("confengeTrack_missing", pathname);
  const api = sandbox.window.__CONFENGE_EVENT_CONTRACT;
  if (!api || typeof api.classifyTransition !== "function") fail("client_classify_missing");
  return { windowObj, track, api, fetches, dataLayer, document };
}

function transitionsOf(dataLayer) {
  return dataLayer.filter((e) => e.event === "content_to_service");
}

function flushedEvents(fetches) {
  const out = [];
  for (const f of fetches || []) {
    try {
      const body = JSON.parse(f.body);
      for (const ev of body.events || []) out.push(ev);
    } catch (_) { /* ignore */ }
  }
  return out;
}

function assertMinFields(ev, extra) {
  if (!ev) fail("missing_transition_event", extra);
  if (ev.source !== "CONFENGE_WEB") fail("source_not_confenge_web", ev);
  for (const key of MIN_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(ev, key)) fail("missing_min_field", { key, extra, ev });
  }
  if (ev.email || ev.phone || ev.cnpj || ev.document || ev.query || ev.nome) {
    fail("pii_on_transition", ev);
  }
}

async function postCollect(events) {
  return collect.handler({
    httpMethod: "POST",
    headers: { "content-type": "application/json", origin: "https://confenge.com.br" },
    body: JSON.stringify({ events }),
  });
}

// --- Lockstep maps ---
{
  const maps = contract.clientMaps();
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const analyticsMod = fs.readFileSync(path.join(root, "js/modules/analytics.js"), "utf8");
  if (maps.source_to_service.unknown_service !== "UNKNOWN_SERVICE") {
    fail("registry_unknown_service", maps.source_to_service);
  }
  for (const [dest, id] of Object.entries(maps.source_to_service.destinations)) {
    if (!script.includes(dest) || !analyticsMod.includes(`'${dest}': '${id}'`)) {
      fail("client_dest_drift", { dest, id });
    }
  }
  const intentMatrix = JSON.parse(
    fs.readFileSync(path.join(root, "data/organic/bofu-intent-matrix.json"), "utf8"),
  );
  for (const row of intentMatrix.rows || []) {
    const route = row.canonical_service_route;
    if (maps.source_to_service.destinations[route] !== row.destination_service_id) {
      fail("canonical_service_missing_from_registry", {
        route,
        expected: row.destination_service_id,
        actual: maps.source_to_service.destinations[route] || null,
      });
    }
  }
  const caseTransition = sourceToService.classifyTransition({
    origin_path: "/casos/aditivo-art125-demonstrativo/",
    href: "/aditivos-obras-publicas/",
    attributes: { cta_id: "case-to-aditivos", route_family: "case" },
  });
  if (caseTransition.kind !== "transition" || caseTransition.event !== "content_to_service") {
    fail("case_origin_not_transition", caseTransition);
  }
  const panoramaTransition = sourceToService.classifyTransition({
    origin_path: "/panorama-mercado-obras-publicas/",
    href: "/diagnostico-b2g-expansao/",
    attributes: { cta_id: "panorama-to-diagnostico", route_family: "panorama" },
  });
  if (panoramaTransition.destination_service_id !== "diagnostico-b2g-expansao") {
    fail("paid_offer_destination_unknown", panoramaTransition);
  }
  if (!contract.ENVELOPE_ID_KEYS.has("event_id")) fail("event_id_not_envelope");
}

// --- Named HTML journeys ---
const journeys = [
  {
    name: "sinapi_auditoria",
    html: "conteudos/sinapi-desonerado-nao-desonerado/index.html",
    pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
    pick: (a) => a.href === "/auditoria-orcamento-licitacao/" && a["data-cta-id"] === "conferir-base-sinapi",
    expectDest: "/auditoria-orcamento-licitacao/",
    expectService: "auditoria-orcamento-licitacao",
    expectAsset: "sinapi-desonerado-nao-desonerado",
    expectFamily: "editorial",
  },
  {
    name: "limite_aditivos",
    html: "ferramentas/limite-acrescimos-supressoes/index.html",
    pathname: "/ferramentas/limite-acrescimos-supressoes/",
    pick: (a) => a.href === "/aditivos-obras-publicas/",
    expectDest: "/aditivos-obras-publicas/",
    expectService: "aditivos-obras-publicas",
    expectAsset: "limite-acrescimos-supressoes",
    expectFamily: "tool",
  },
  {
    name: "market_answer_diagnostico",
    html: "inteligencia/valor-tipico-contratos-pavimentacao/index.html",
    pathname: "/inteligencia/valor-tipico-contratos-pavimentacao/",
    pick: (a) => a.href === "/ferramentas/diagnostico-defesa-margem/" && a["data-cta-id"] === "analise-contrato",
    expectDest: "/ferramentas/diagnostico-defesa-margem/",
    expectService: "diagnostico-defesa-margem",
    expectAsset: "valor-tipico-contratos-pavimentacao",
    expectFamily: "market-answer",
  },
  {
    // #390: medicao/glosa has one commercial transfer route from the hub.
    name: "hub_servicos_medicoes_glosas",
    html: "servicos-obras-publicas/index.html",
    pathname: "/servicos-obras-publicas/",
    pick: (a) => a["data-cta-id"] === "hub-servicos-medicoes-glosas",
    expectDest: "/medicoes-glosas-obras-publicas/",
    expectService: "medicoes-glosas-obras-publicas",
    expectAsset: "servicos-obras-publicas",
    expectFamily: "hub",
  },
  {
    name: "hub_problemas_defesa_margem",
    html: "problemas-que-resolvemos/index.html",
    pathname: "/problemas-que-resolvemos/",
    pick: (a) => a["data-cta-id"] === "hub-problemas-defesa-margem",
    expectDest: "/defesa-margem-contratos-publicos/",
    expectService: "defesa-margem-contratos-publicos",
    expectAsset: "problemas-que-resolvemos",
    expectFamily: "hub",
  },
  {
    name: "hub_ferramentas_expansao",
    html: "ferramentas/index.html",
    pathname: "/ferramentas/",
    pick: (a) => a["data-cta-id"] === "ferramentas-hub-diagnostico-expansao",
    expectDest: "/diagnostico-b2g-expansao/",
    expectService: "diagnostico-b2g-expansao",
    expectAsset: "ferramentas-hub",
    expectFamily: "tool",
  },
];

const journeyResults = [];
for (const j of journeys) {
  const html = htmlOf(j.html);
  const attrs = findAnchor(html, j.pick);
  if (!attrs) fail("html_anchor_missing", { name: j.name, file: j.html });
  const body = bodyAttrs(html);
  const el = makeEl(attrs, "CTA");
  const driven = driveScript({
    pathname: j.pathname,
    body,
    hrefEls: [el],
    namedEls: attrs["data-event-name"] ? [el] : [],
  });
  el.click();
  const hits = transitionsOf(driven.dataLayer);
  if (hits.length !== 1) fail("journey_event_count", { name: j.name, count: hits.length, events: driven.dataLayer.map((e) => e.event) });
  const ev = hits[0];
  assertMinFields(ev, j.name);
  if (ev.destination_path !== j.expectDest) fail("journey_dest_path", { name: j.name, got: ev.destination_path, expect: j.expectDest });
  if (ev.destination_service_id !== j.expectService) fail("journey_dest_id", { name: j.name, got: ev.destination_service_id });
  if (ev.source_path !== j.pathname) fail("journey_source_path", { name: j.name, got: ev.source_path });
  if (ev.source_asset_id !== j.expectAsset) fail("journey_asset", { name: j.name, got: ev.source_asset_id });
  if (ev.source_asset_family !== j.expectFamily) fail("journey_family", { name: j.name, got: ev.source_asset_family });
  if (ev.destination_path.includes("?") || ev.destination_path.includes("#") || /https?:/i.test(ev.destination_path)) {
    fail("journey_dest_not_canonical", ev);
  }

  const flushed = flushedEvents(driven.fetches).filter((e) => e.event === "content_to_service");
  if (flushed.length !== 1) fail("journey_flush_count", { name: j.name, flushed });
  const payload = flushed[0];
  if (!payload.props || !payload.props.correlation_id) fail("journey_flush_no_correlation_id", payload);
  if (!payload.sid) fail("journey_flush_no_sid", payload);
  const admitted = contract.admitEvent(payload);
  if (!admitted.ok) fail("journey_admit_rejected", { name: j.name, admitted });
  if (admitted.event.event !== "content_to_service") fail("journey_admit_name", admitted.event);
  if (admitted.event.props.destination_service_id !== j.expectService) {
    fail("journey_admit_dest", admitted.event.props);
  }
  if (admitted.event.props.correlation_id !== payload.props.correlation_id) {
    fail("journey_admit_dropped_correlation", admitted.event.props);
  }
  const collectRes = await postCollect([payload]);
  const collectBody = JSON.parse(collectRes.body);
  if (collectRes.statusCode !== 202 || collectBody.accepted !== 1) {
    fail("journey_collect", { name: j.name, collectBody });
  }
  journeyResults.push({
    name: j.name,
    count: hits.length,
    destination_path: ev.destination_path,
    destination_service_id: ev.destination_service_id,
    event_id: ev.event_id,
    href: attrs.href,
    data_cta_id: attrs["data-cta-id"] || "",
    data_asset_id: attrs["data-asset-id"] || body["data-asset-id"] || "",
  });
}

// --- Production identity: flushed click correlation_id joins a lead with no session_id ---
{
  const html = htmlOf("conteudos/sinapi-desonerado-nao-desonerado/index.html");
  const attrs = findAnchor(html, (a) => a.href === "/auditoria-orcamento-licitacao/" && a["data-cta-id"] === "conferir-base-sinapi");
  const el = makeEl(attrs, "CTA");
  const driven = driveScript({
    pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
    body: bodyAttrs(html),
    hrefEls: [el],
  });
  el.click();
  const payload = flushedEvents(driven.fetches).find((e) => e.event === "content_to_service");
  if (!payload || !payload.props || !payload.props.correlation_id) {
    fail("flush_missing_correlation_id", payload);
  }
  const admitted = contract.admitEvent(payload);
  if (!admitted.ok) fail("flush_admit_rejected", admitted);
  const joined = agg.attributeLeads(
    [{
      lead_id: "L-prod-flush",
      correlation_id: payload.props.correlation_id,
      destination_path: payload.props.destination_path,
      destination_service_id: payload.props.destination_service_id,
      received_at: "2026-08-19T10:05:00Z",
    }],
    [{
      event: admitted.event.event,
      props: admitted.event.props,
      path: admitted.event.path,
      sid: admitted.event.sid,
    }],
  )[0];
  if (joined.discrepancy !== null) fail("flush_correlation_not_joined", joined);
  if (joined.destination_service_id !== "auditoria-orcamento-licitacao") {
    fail("flush_correlation_dest_dropped", joined);
  }
  const assisted = (joined.assisted_paths || []).find((p) => p.role === "transition");
  if (!assisted || assisted.destination_path !== "/auditoria-orcamento-licitacao/") {
    fail("flush_correlation_assisted_lost", joined.assisted_paths);
  }
}

// --- Duplicate listeners: generic href + data-event-name on one physical click ---
{
  const html = htmlOf("conteudos/sinapi-desonerado-nao-desonerado/index.html");
  const attrs = findAnchor(html, (a) => a.href === "/auditoria-orcamento-licitacao/" && a["data-cta-id"] === "conferir-base-sinapi");
  attrs["data-event-name"] = "offer_cta_click";
  const el = makeEl(attrs, "CTA");
  const driven = driveScript({
    pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
    body: bodyAttrs(html),
    hrefEls: [el],
    namedEls: [el],
  });
  el.click();
  const hits = transitionsOf(driven.dataLayer);
  const ctaClicks = driven.dataLayer.filter((e) => e.event === "cta_click");
  if (hits.length !== 1) fail("duplicate_listener_count", { hits: hits.length, events: driven.dataLayer.map((e) => e.event) });
  if (ctaClicks.length !== 0) fail("duplicate_listener_also_cta", ctaClicks);
  assertMinFields(hits[0], "duplicate_listener");
}

// --- Deliverables evidence: one named CTA click from the shipped bundle ---
{
  const html = htmlOf("entregas/index.html");
  const attrs = findAnchor(
    html,
    (a) => a["data-cta-id"] === "deliverables-open-report",
  );
  if (!attrs) fail("deliverables_open_report_missing");
  if (attrs["data-event-name"] !== "cta_click") {
    fail("deliverables_event_name", attrs);
  }
  const el = makeEl(attrs, "Consultar o relatório completo");
  const driven = driveScript({
    pathname: "/entregas/",
    body: bodyAttrs(html),
    hrefEls: [el],
    namedEls: [el],
  });
  el.click();
  const hits = driven.dataLayer.filter((event) => event.event === "cta_click");
  if (hits.length !== 1) {
    fail("deliverables_cta_click_count", {
      count: hits.length,
      events: driven.dataLayer.map((event) => event.event),
    });
  }
  const event = hits[0];
  if (event.cta_id !== "deliverables-open-report") fail("deliverables_cta_id", event);
  if (event.asset_id !== "entregas-exemplos-hub") fail("deliverables_asset_id", event);
  if (event.source !== "CONFENGE_WEB") fail("deliverables_source", event);
  if (event.page_path !== "/entregas/") fail("deliverables_page_path", event);
  for (const key of ["email", "phone", "cnpj", "document", "nome", "empresa", "query"]) {
    if (Object.prototype.hasOwnProperty.call(event, key)) {
      fail("deliverables_pii_key", { key, event });
    }
  }
  for (const [key, value] of Object.entries(event)) {
    if (typeof value !== "string") continue;
    if (value.includes("@")) fail("deliverables_pii_email_value", { key, value });
    const compact = value.replace(/[\s()+-]/g, "");
    if (/^\d{10,15}$/.test(compact)) {
      fail("deliverables_pii_phone_value", { key, value });
    }
  }

  const flushed = flushedEvents(driven.fetches).filter((item) => item.event === "cta_click");
  if (flushed.length !== 1) fail("deliverables_flush_count", flushed);
  const admitted = contract.admitEvent(flushed[0]);
  if (!admitted.ok) fail("deliverables_collect_rejected", admitted);
  if (admitted.event.props.cta_id !== "deliverables-open-report") {
    fail("deliverables_collect_cta_id", admitted.event.props);
  }
  if (admitted.event.props.asset_id !== "entregas-exemplos-hub") {
    fail("deliverables_collect_asset_id", admitted.event.props);
  }
}

// --- Duplicate event_id on track + collect ---
{
  const driven = driveScript({ pathname: "/conteudos/sinapi-desonerado-nao-desonerado/", body: {}, hrefEls: [] });
  const props = {
    source_path: "/conteudos/sinapi-desonerado-nao-desonerado/",
    source_asset_id: "sinapi-desonerado-nao-desonerado",
    source_asset_family: "editorial",
    destination_path: "/auditoria-orcamento-licitacao/",
    destination_service_id: "auditoria-orcamento-licitacao",
    cta_id: "conferir-base-sinapi",
    route_family: "orcamento-bdi",
    event_id: "e-dup-fixed-key",
  };
  driven.track("content_to_service", props);
  driven.track("content_to_service", props);
  const hits = transitionsOf(driven.dataLayer);
  if (hits.length !== 1) fail("client_duplicate_event_id", { count: hits.length });

  const batch = contract.admitBatch([
    { event: "content_to_service", props, path: props.source_path, sid: "sess-ddddddddddddddddddddddddddd" },
    { event: "content_to_service", props, path: props.source_path, sid: "sess-ddddddddddddddddddddddddddd" },
  ]);
  if (batch.admitted.length !== 1) fail("admit_duplicate_event_id", batch);
  if (!batch.rejected.some((r) => r.reason === "duplicate_event_id")) {
    fail("admit_duplicate_reason", batch.rejected);
  }
  const collectDup = await postCollect([
    { event: "content_to_service", props: { ...props, event_id: "e-collect-dup" }, path: props.source_path, sid: "sess-ddddddddddddddddddddddddddd" },
    { event: "content_to_service", props: { ...props, event_id: "e-collect-dup" }, path: props.source_path, sid: "sess-ddddddddddddddddddddddddddd" },
  ]);
  const collectDupBody = JSON.parse(collectDup.body);
  if (collectDupBody.accepted !== 1 || collectDupBody.rejected !== 1) {
    fail("collect_duplicate_event_id", collectDupBody);
  }
}

// --- External / wa.me / mailto / tel: are not content_to_service ---
{
  const wa = makeEl({ href: "https://wa.me/5548988344559?text=Oi" }, "WhatsApp");
  const mail = makeEl({ href: "mailto:tiago.sasaki@confenge.com.br" }, "Email");
  const tel = makeEl({ href: "tel:+5548988344559" }, "Tel");
  const ext = makeEl({ href: "https://example.com/oferta" }, "External");
  const driven = driveScript({
    pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
    body: {},
    hrefEls: [ext],
    waEls: [wa],
    mailEls: [mail],
    telEls: [tel],
  });
  wa.click();
  mail.click();
  tel.click();
  ext.click();
  const names = driven.dataLayer.map((e) => e.event);
  if (transitionsOf(driven.dataLayer).length !== 0) fail("channel_emitted_transition", names);
  if (!names.includes("whatsapp_click")) fail("missing_whatsapp_click", names);
  if (!names.includes("email_click")) fail("missing_email_click", names);
  if (!names.includes("outbound_click")) fail("missing_outbound_click", names);
}

// --- Versioned report order entry: one physical click, one enriched event ---
{
  const html = htmlOf("casos/modelo-relatorio-inteligencia-licitacoes/index.html");
  const attrs = findAnchor(html, (a) =>
    a["data-cta-id"] === "report-599-hero" &&
    a["data-next-action-id"] === "contratar_relatorio_inteligencia_599"
  );
  if (!attrs) fail("report_handraise_anchor_missing");
  const el = makeEl(attrs, "Quero meu relatório por R$ 599");
  const driven = driveScript({
    pathname: "/casos/modelo-relatorio-inteligencia-licitacoes/",
    body: bodyAttrs(html),
    hrefEls: [el],
    namedEls: [el],
  });
  el.click();
  const physicalClickEvents = driven.dataLayer.filter((e) =>
    e.event === "whatsapp_click" || e.event === "cta_click"
  );
  if (physicalClickEvents.length !== 1 || physicalClickEvents[0].event !== "cta_click") {
    fail("report_order_entry_dual_count", physicalClickEvents);
  }
  const ev = physicalClickEvents[0];
  const expected = {
    asset_id: "relatorio-inteligencia-licitacoes-demonstrativo",
    route_family: "edital-proposta",
    cta_id: "report-599-hero",
    cta_position: "report_hero",
    cta_kind: "offer",
    offer_id: "handraise-report-intelligence-599-v1",
    next_action_id: "contratar_relatorio_inteligencia_599",
    source: "CONFENGE_WEB",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (ev[key] !== value) fail("report_order_entry_attribution", { key, expected: value, event: ev });
  }
  if (!ev.event_id) fail("report_order_entry_event_id", ev);
  if (!/^(?:c-[a-z0-9-]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(ev.correlation_id || "")) {
    fail("report_order_entry_journey_correlation", ev);
  }
  if (/^CFG-WA-/i.test(ev.correlation_id || "")) {
    fail("report_order_entry_invented_whatsapp_protocol", ev);
  }
  if (el.attrs.href !== "/comercial/radar-decisorio/") {
    fail("report_order_entry_destination_mutated", { href: el.attrs.href, event: ev });
  }
  const reconciled = contract.reconcileFunnel({ events: [{ event: ev.event, props: ev }] });
  if (reconciled.denominators.engagement !== 1) {
    fail("report_order_entry_engagement_inflated", reconciled);
  }
  const admission = contract.admitEvent({ event: ev.event, props: ev });
  if (!admission.ok) fail("report_order_entry_rejected", admission);
  const admitted = admission.event.props;
  if (
    admitted?.offer_id !== expected.offer_id ||
    admitted?.next_action_id !== expected.next_action_id ||
    admitted?.event_id !== ev.event_id ||
    admitted?.correlation_id !== ev.correlation_id ||
    Object.prototype.hasOwnProperty.call(admitted || {}, "whatsapp_protocol")
  ) {
    fail("report_order_entry_context_dropped", admitted);
  }
  const collectResult = await postCollect([{
    event: ev.event,
    props: ev,
    path: "/casos/modelo-relatorio-inteligencia-licitacoes/",
    sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }]);
  const collectBody = JSON.parse(collectResult.body);
  const persisted = collect._recent().slice(-1)[0];
  if (
    collectResult.statusCode !== 202 ||
    collectBody.accepted !== 1 ||
    persisted?.correlation_id !== ev.correlation_id ||
    persisted?.offer_id !== expected.offer_id ||
    persisted?.next_action_id !== expected.next_action_id ||
    persisted?.event_id !== ev.event_id ||
    Object.prototype.hasOwnProperty.call(persisted || {}, "whatsapp_protocol")
  ) {
    fail("report_order_entry_collector_persistence", { collectBody, persisted });
  }
}

// --- Query and fragment stripped from destination_path ---
{
  const html = htmlOf("conteudos/sinapi-desonerado-nao-desonerado/index.html");
  const attrs = findAnchor(html, (a) => a.href === "/auditoria-orcamento-licitacao/" && a["data-cta-id"] === "conferir-base-sinapi");
  attrs.href = "/auditoria-orcamento-licitacao/?utm_source=test#frag";
  const el = makeEl(attrs, "CTA");
  const driven = driveScript({
    pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
    body: bodyAttrs(html),
    hrefEls: [el],
  });
  el.click();
  const hits = transitionsOf(driven.dataLayer);
  if (hits.length !== 1) fail("query_fragment_count", hits.length);
  if (hits[0].destination_path !== "/auditoria-orcamento-licitacao/") {
    fail("query_fragment_not_stripped", hits[0].destination_path);
  }
  const admitted = contract.admitEvent({
    event: "content_to_service",
    props: {
      source_path: "/conteudos/sinapi-desonerado-nao-desonerado/",
      destination_path: "https://confenge.com.br/auditoria-orcamento-licitacao/?q=secret#x",
      source_asset_id: "sinapi-desonerado-nao-desonerado",
      source_asset_family: "editorial",
    },
    path: "/conteudos/sinapi-desonerado-nao-desonerado/",
  });
  if (!admitted.ok) fail("admit_query_rejected", admitted);
  if (admitted.event.props.destination_path !== "/auditoria-orcamento-licitacao/") {
    fail("admit_query_not_stripped", admitted.event.props.destination_path);
  }
  if (JSON.stringify(admitted.event).includes("secret")) fail("admit_kept_query_text", admitted.event);
}

// --- Unknown destination is UNKNOWN_SERVICE, not a guessed service ---
{
  const el = makeEl({
    href: "/servico-inventado-nao-canônico/",
    "data-asset-id": "sinapi-desonerado-nao-desonerado",
    "data-cta-id": "ghost",
  }, "Ghost");
  const driven = driveScript({
    pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
    body: { "data-asset-id": "sinapi-desonerado-nao-desonerado" },
    hrefEls: [el],
  });
  el.click();
  const hits = transitionsOf(driven.dataLayer);
  if (hits.length !== 1) fail("unknown_count", { count: hits.length, events: driven.dataLayer.map((e) => e.event) });
  if (hits[0].destination_service_id !== "UNKNOWN_SERVICE") {
    fail("unknown_not_fail_closed", hits[0]);
  }
  if (hits[0].destination_service_id === "auditoria-orcamento-licitacao") {
    fail("unknown_guessed_service", hits[0]);
  }
  const classified = contract.classifyTransition({
    href: "/oferta-fantasma/",
    origin_path: "/conteudos/sinapi-desonerado-nao-desonerado/",
    attributes: { source_asset_id: "sinapi-desonerado-nao-desonerado" },
  });
  if (classified.destination_service_id !== contract.UNKNOWN_SERVICE) {
    fail("classify_unknown", classified);
  }
}

// --- PII / CNPJ / document / raw query rejected or dropped; IDs without document admitted ---
{
  const pii = contract.admitEvent({
    event: "content_to_service",
    props: {
      source_path: "/conteudos/sinapi-desonerado-nao-desonerado/",
      destination_path: "/auditoria-orcamento-licitacao/",
      source_asset_id: "sinapi-desonerado-nao-desonerado",
      destination_service_id: "auditoria-orcamento-licitacao",
      cnpj: "52407089000109",
      document: "edital.pdf",
      query: "sinapi desonerado licitacao",
      email: "alice@example.com",
    },
  });
  if (!pii.ok) fail("pii_keys_should_strip", pii);
  const blob = JSON.stringify(pii.event);
  for (const bad of ["52407089000109", "edital.pdf", "sinapi desonerado licitacao", "alice@example.com"]) {
    if (blob.includes(bad)) fail("pii_value_kept", { bad, event: pii.event });
  }
  if (pii.event.props.cnpj || pii.event.props.document || pii.event.props.query || pii.event.props.email) {
    fail("pii_keys_kept", pii.event.props);
  }
  const tainted = contract.admitEvent({
    event: "content_to_service",
    props: {
      source_path: "/conteudos/sinapi-desonerado-nao-desonerado/",
      destination_path: "/auditoria-orcamento-licitacao/",
      note: "alice@example.com",
    },
  });
  if (!tainted.ok || tainted.event.props.note != null || !tainted.dropped.includes("note")) {
    fail("pii_note_admitted", tainted);
  }
  const idsOnly = contract.admitEvent({
    event: "content_to_service",
    props: {
      source_path: "/inteligencia/valor-tipico-contratos-pavimentacao/",
      source_asset_id: "valor-tipico-contratos-pavimentacao",
      source_asset_family: "market-answer",
      destination_path: "/ferramentas/diagnostico-defesa-margem/",
      destination_service_id: "diagnostico-defesa-margem",
      cta_id: "analise-contrato",
      route_family: "market-answer",
      event_id: "e-ids-only",
    },
    path: "/inteligencia/valor-tipico-contratos-pavimentacao/",
    sid: "sess-bbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  if (!idsOnly.ok) fail("ids_without_document_rejected", idsOnly);
  if (idsOnly.event.props.destination_service_id !== "diagnostico-defesa-margem") {
    fail("ids_without_document_dest", idsOnly.event.props);
  }
  if (idsOnly.event.props.cnpj != null || idsOnly.event.props.document != null) {
    fail("ids_grew_document", idsOnly.event.props);
  }
}

// --- Aggregator matrix, denominators, coverage, UNKNOWN, uncollapsed funnel ---
{
  const day = "2026-08-19T10:00:00Z";
  const events = [
    {
      event: "page_view",
      path: "/conteudos/sinapi-desonerado-nao-desonerado/",
      sid: "sess-111111111111111111111111111",
      ts: day,
      props: { page_path: "/conteudos/sinapi-desonerado-nao-desonerado/" },
    },
    {
      event: "page_view",
      path: "/conteudos/sinapi-desonerado-nao-desonerado/",
      sid: "sess-222222222222222222222222222",
      ts: day,
      props: { page_path: "/conteudos/sinapi-desonerado-nao-desonerado/" },
    },
    {
      event: "content_to_service",
      path: "/conteudos/sinapi-desonerado-nao-desonerado/",
      sid: "sess-111111111111111111111111111",
      ts: "2026-08-19T10:01:00Z",
      props: {
        source_path: "/conteudos/sinapi-desonerado-nao-desonerado/",
        source_asset_id: "sinapi-desonerado-nao-desonerado",
        source_asset_family: "editorial",
        destination_path: "/auditoria-orcamento-licitacao/",
        destination_service_id: "auditoria-orcamento-licitacao",
        cta_id: "conferir-base-sinapi",
        event_id: "e-matrix-1",
      },
    },
    {
      event: "content_to_service",
      path: "/conteudos/sinapi-desonerado-nao-desonerado/",
      sid: "sess-222222222222222222222222222",
      ts: "2026-08-19T10:02:00Z",
      props: {
        source_path: "/conteudos/sinapi-desonerado-nao-desonerado/",
        destination_path: "/servico-inventado/",
        destination_service_id: "UNKNOWN_SERVICE",
        event_id: "e-matrix-unknown",
      },
    },
    {
      event: "content_to_service",
      path: "/ferramentas/limite-acrescimos-supressoes/",
      sid: "sess-333333333333333333333333333",
      ts: "2026-08-19T10:03:00Z",
      props: {
        source_path: "/ferramentas/limite-acrescimos-supressoes/",
        source_asset_id: "limite-acrescimos-supressoes",
        source_asset_family: "tool",
        destination_path: "/aditivos-obras-publicas/",
        destination_service_id: "aditivos-obras-publicas",
        event_id: "e-matrix-2",
      },
    },
  ];
  const rolled = agg.aggregateEvents(events);
  if (!rolled.origin_destination || !Array.isArray(rolled.origin_destination.by_day)) {
    fail("matrix_missing", rolled.origin_destination);
  }
  const dayRow = rolled.origin_destination.by_day.find((d) => d.day === "2026-08-19");
  if (!dayRow) fail("matrix_day_missing", rolled.origin_destination);
  const sinapiCell = dayRow.cells.find((c) => c.destination_service_id === "auditoria-orcamento-licitacao");
  if (!sinapiCell) fail("matrix_cell_missing", dayRow.cells);
  if (sinapiCell.count !== 1) fail("matrix_count", sinapiCell);
  if (typeof sinapiCell.rate !== "number") fail("matrix_rate_missing", sinapiCell);
  if (sinapiCell.view_denominator !== 2) fail("matrix_view_denom", sinapiCell);
  if (sinapiCell.engagement_denominator === "UNKNOWN" && sinapiCell.count > 0) {
    fail("matrix_engagement_absent_while_transition", sinapiCell);
  }
  if (typeof dayRow.coverage.known !== "number" || typeof dayRow.coverage.unknown !== "number") {
    fail("matrix_coverage", dayRow.coverage);
  }
  if (dayRow.unknown.destination_service_id < 1) fail("matrix_unknown_hidden", dayRow.unknown);
  const missingDay = rolled.origin_destination.by_day.find((d) => d.day === "2026-08-01");
  if (missingDay) fail("missing_day_materialized", missingDay);
  if (rolled.origin_destination.missing_day !== "UNKNOWN") fail("missing_day_not_unknown");

  const layers = rolled.funnel_layers;
  for (const key of ["transition", "lead", "qualified", "pipeline", "won_lost"]) {
    if (!layers[key]) fail("funnel_layer_missing", { key, layers });
  }
  if (layers.transition.count !== 3) fail("funnel_transition_count", layers.transition);
  if (layers.lead.count !== "UNKNOWN") fail("clicks_inferred_lead", layers.lead);
  if (layers.qualified.count !== "UNKNOWN") fail("clicks_inferred_qualified", layers.qualified);
  if (layers.pipeline.count !== "UNKNOWN") fail("clicks_inferred_pipeline", layers.pipeline);
  if (layers.won_lost.count !== "UNKNOWN") fail("clicks_inferred_won_lost", layers.won_lost);

  const clickOnly = agg.aggregateEvents([
    {
      event: "content_to_service",
      path: "/conteudos/sinapi-desonerado-nao-desonerado/",
      ts: "2026-08-20T00:00:00Z",
      props: {
        source_path: "/conteudos/sinapi-desonerado-nao-desonerado/",
        destination_path: "/auditoria-orcamento-licitacao/",
        destination_service_id: "auditoria-orcamento-licitacao",
        event_id: "e-click-only",
      },
    },
  ]);
  const onlyCell = clickOnly.origin_destination.by_day[0].cells[0];
  if (onlyCell.view_denominator !== "UNKNOWN") fail("absence_as_zero", onlyCell);
  if (onlyCell.rate !== "UNKNOWN") fail("rate_from_absent_views", onlyCell);
  if (clickOnly.funnel_layers.qualified.count !== "UNKNOWN") fail("click_only_qualified", clickOnly.funnel_layers);
  if (clickOnly.funnel_layers.pipeline.count !== "UNKNOWN") fail("click_only_pipeline", clickOnly.funnel_layers);
  if (clickOnly.funnel_layers.won_lost.count !== "UNKNOWN") fail("click_only_won_lost", clickOnly.funnel_layers);

  const withWarmbly = agg.aggregateEvents(events, {
    warmbly: { qualified_lead: 1, pipeline: 1, won: 0, lost: 1, owner: "warmbly" },
  });
  if (withWarmbly.funnel_layers.qualified.count !== 1) fail("warmbly_qualified", withWarmbly.funnel_layers);
  if (withWarmbly.funnel_layers.pipeline.count !== 1) fail("warmbly_pipeline", withWarmbly.funnel_layers);
  if (withWarmbly.funnel_layers.won_lost.lost !== 1) fail("warmbly_lost", withWarmbly.funnel_layers);
  if (withWarmbly.funnel_layers.qualified.derived !== false) fail("qualified_marked_derived");
}

// --- Assisted destination preserved; query never joins; discrepancy visible ---
{
  const events = [
    {
      event: "page_view",
      path: "/conteudos/sinapi-desonerado-nao-desonerado/",
      sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ts: "2026-08-19T10:00:00Z",
      props: { correlation_id: "c-assist" },
    },
    {
      event: "content_to_service",
      path: "/conteudos/sinapi-desonerado-nao-desonerado/",
      sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ts: "2026-08-19T10:01:00Z",
      props: {
        source_path: "/conteudos/sinapi-desonerado-nao-desonerado/",
        destination_path: "/auditoria-orcamento-licitacao/",
        destination_service_id: "auditoria-orcamento-licitacao",
        correlation_id: "c-assist",
        event_id: "e-assist",
      },
    },
  ];
  const matched = agg.attributeLeads(
    [{
      lead_id: "L-match",
      session_id: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
      destination_path: "/auditoria-orcamento-licitacao/",
      destination_service_id: "auditoria-orcamento-licitacao",
      received_at: "2026-08-19T10:05:00Z",
      query: "sinapi desonerado nao deve juntar",
      gsc_query: "sinapi desonerado",
    }],
    events,
  );
  const row = matched[0];
  const trans = (row.assisted_paths || []).find((p) => p.role === "transition");
  if (!trans || trans.destination_path !== "/auditoria-orcamento-licitacao/") {
    fail("assisted_lost_destination", row.assisted_paths);
  }
  if (trans.path === trans.destination_path && trans.path === "/conteudos/sinapi-desonerado-nao-desonerado/") {
    fail("assisted_only_origin", trans);
  }
  if (row.destination_service_id !== "auditoria-orcamento-licitacao") fail("matched_dest_dropped", row);
  const blob = JSON.stringify(row);
  if (blob.includes("sinapi desonerado nao deve juntar") || blob.includes("gsc_query")) {
    fail("query_joined_person", row);
  }

  const missingLeadDest = agg.attributeLeads(
    [{ lead_id: "L-miss", session_id: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa", received_at: "2026-08-19T10:05:00Z" }],
    events,
  )[0];
  if (missingLeadDest.discrepancy !== "lead_missing_destination") {
    fail("missing_lead_dest_not_visible", missingLeadDest);
  }
  if (missingLeadDest.destination_service_id !== "UNKNOWN_SERVICE") {
    fail("missing_lead_dest_inferred", missingLeadDest);
  }

  const missingEvent = agg.attributeLeads(
    [{
      lead_id: "L-ev",
      session_id: "sess-eeeeeeeeeeeeeeeeeeeeeeeeeee",
      destination_path: "/aditivos-obras-publicas/",
      received_at: "2026-08-19T10:05:00Z",
    }],
    events,
  )[0];
  if (missingEvent.discrepancy !== "event_missing_transition") fail("missing_event_not_visible", missingEvent);
  if (missingEvent.destination_path !== "UNKNOWN") fail("missing_event_inferred", missingEvent);

  const mismatch = agg.attributeLeads(
    [{
      lead_id: "L-mm",
      session_id: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
      destination_path: "/aditivos-obras-publicas/",
      destination_service_id: "aditivos-obras-publicas",
      received_at: "2026-08-19T10:05:00Z",
    }],
    events,
  )[0];
  if (mismatch.discrepancy !== "event_lead_mismatch") fail("mismatch_not_visible", mismatch);
  if (mismatch.destination_service_id !== "UNKNOWN_SERVICE") fail("mismatch_inferred", mismatch);

  const prodShape = agg.attributeLeads(
    [{
      lead_id: "L-corr-only",
      correlation_id: "c-assist",
      destination_path: "/auditoria-orcamento-licitacao/",
      destination_service_id: "auditoria-orcamento-licitacao",
      received_at: "2026-08-19T10:05:00Z",
    }],
    events,
  )[0];
  if (prodShape.discrepancy !== null) fail("correlation_only_lead_not_joined", prodShape);
  if (prodShape.destination_service_id !== "auditoria-orcamento-licitacao") {
    fail("correlation_only_dest_dropped", prodShape);
  }
  const prodAssist = (prodShape.assisted_paths || []).find((p) => p.role === "transition");
  if (!prodAssist || prodAssist.destination_path !== "/auditoria-orcamento-licitacao/") {
    fail("correlation_only_assisted_lost", prodShape.assisted_paths);
  }

  const queryJoin = agg.attributeLeads(
    [{
      lead_id: "L-q",
      query: "valor tipico pavimentacao",
      gsc_query: "valor tipico",
      received_at: "2026-08-19T10:05:00Z",
    }],
    events,
  )[0];
  if (queryJoin.discrepancy === null && queryJoin.destination_service_id === "auditoria-orcamento-licitacao") {
    fail("query_used_as_join", queryJoin);
  }
}

const primary = {
  journeys: journeyResults.map((j) => ({
    name: j.name,
    count: j.count,
    destination_service_id: j.destination_service_id,
    destination_path: j.destination_path,
  })),
  duplicate_listener: 1,
  unknown_service: "UNKNOWN_SERVICE",
  coverage_unknown: true,
};

console.log("ATTRIBUTION_OK", JSON.stringify(primary));
