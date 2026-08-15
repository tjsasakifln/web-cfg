/**
 * Safe analytics aggregation — no PII, no raw IP hashes in public output.
 * Consumes event batches shaped like collect.cjs accepted events.
 */

const FUNNEL_EVENTS = [
  "page_view",
  "session_start",
  "cta_view",
  "cta_click",
  "whatsapp_click",
  "lead_form_start",
  "lead_form_submit",
  "lead_form_success",
  "lead_persisted",
  "content_to_service",
  "conversion",
  "web_vital",
];

const MONEY_ASSET_ID = "diagnostico-defesa-margem";
const MONEY_ASSET_ROUTE = "defesa-margem-diagnostico";
const MONEY_ASSET_PATH = "/ferramentas/diagnostico-defesa-margem";
const MONEY_ASSET_EVENT_NAMES = [
  "asset_view",
  "contract_analyzed",
  "cta_view",
  "cta_click",
  "lead_created",
];

function dayKey(iso) {
  return String(iso || new Date().toISOString()).slice(0, 10);
}

function weekKey(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return "unknown";
  // ISO week
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp - yearStart) / 864e5 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Aggregate raw events into daily rollups.
 * @param {Array<{event:string,path?:string,sid?:string,ts?:string,props?:object}>} events
 */
function aggregateEvents(events) {
  const byDay = new Map();
  const sessions = new Map(); // day -> Set sid
  const paths = new Map(); // day -> path -> counts
  const ctas = new Map();
  const clusters = new Map();
  const journeys = new Map();
  const vitals = { lcp: [], inp: [], cls: [], ttfb: [] };

  for (const ev of events || []) {
    const name = String(ev.event || "");
    const day = dayKey(ev.ts);
    const path = String(ev.path || ev.props?.page_path || "/").slice(0, 180);
    const sid = String(ev.sid || "").slice(0, 32);
    const props = ev.props || {};

    if (!byDay.has(day)) {
      byDay.set(day, {
        day,
        events: 0,
        by_event: {},
        unique_sessions: 0,
        page_views: 0,
        cta_clicks: 0,
        whatsapp_clicks: 0,
        form_starts: 0,
        form_success: 0,
        content_to_service: 0,
      });
    }
    const dayRow = byDay.get(day);
    dayRow.events += 1;
    dayRow.by_event[name] = (dayRow.by_event[name] || 0) + 1;

    if (sid) {
      if (!sessions.has(day)) sessions.set(day, new Set());
      sessions.get(day).add(sid);
    }

    if (!paths.has(day)) paths.set(day, new Map());
    const pm = paths.get(day);
    if (!pm.has(path)) {
      pm.set(path, {
        path,
        page_view: 0,
        cta_click: 0,
        whatsapp_click: 0,
        form_start: 0,
        form_success: 0,
        content_to_service: 0,
      });
    }
    const pr = pm.get(path);

    if (name === "page_view" || name === "session_start") {
      dayRow.page_views += 1;
      pr.page_view += 1;
    }
    if (name === "cta_click" || name === "critical_decision_cta_click") {
      dayRow.cta_clicks += 1;
      pr.cta_click += 1;
      const cta = String(props.cta_id || props.position || "unknown").slice(0, 80);
      ctas.set(cta, (ctas.get(cta) || 0) + 1);
    }
    if (MONEY_ASSET_EVENT_NAMES.includes(name) && isMoneyAssetEvent(ev)) {
      pr[name] = (pr[name] || 0) + 1;
    }
    if (name === "whatsapp_click") {
      dayRow.whatsapp_clicks += 1;
      pr.whatsapp_click += 1;
    }
    if (name === "lead_form_start") {
      dayRow.form_starts += 1;
      pr.form_start += 1;
    }
    if (name === "lead_form_success" || name === "lead_persisted") {
      dayRow.form_success += 1;
      pr.form_success += 1;
    }
    if (name === "content_to_service" || name === "pseo_to_service") {
      dayRow.content_to_service += 1;
      pr.content_to_service += 1;
    }

    const cluster = String(props.cluster || props.content_cluster || "").slice(0, 80);
    if (cluster) clusters.set(cluster, (clusters.get(cluster) || 0) + 1);
    const journey = String(props.jornada || props.journey || "").slice(0, 40);
    if (journey) journeys.set(journey, (journeys.get(journey) || 0) + 1);

    if (name === "web_vital") {
      const metric = String(props.metric || props.name || "").toLowerCase();
      const value = Number(props.value);
      if (Number.isFinite(value) && vitals[metric]) vitals[metric].push(value);
    }
  }

  for (const [day, set] of sessions) {
    const row = byDay.get(day);
    if (row) row.unique_sessions = set.size;
  }

  const daily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const funnel_by_path = [];
  for (const [day, pm] of paths) {
    for (const row of pm.values()) {
      funnel_by_path.push({ day, ...row });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    daily,
    funnel_by_path: funnel_by_path.sort((a, b) => b.page_view - a.page_view).slice(0, 500),
    cta_totals: Object.fromEntries([...ctas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50)),
    cluster_totals: Object.fromEntries([...clusters.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50)),
    journey_totals: Object.fromEntries(journeys),
    web_vitals: summarizeVitals(vitals),
    attribution_note:
      "Search Console queries are aggregate; never join a single GSC query to an individual lead. Attribution is first/last touch path cohort only.",
  };
}

function summarizeVitals(vitals) {
  const out = {};
  for (const [k, arr] of Object.entries(vitals)) {
    if (!arr.length) {
      out[k] = { n: 0, p75: null, avg: null };
      continue;
    }
    const sorted = arr.slice().sort((a, b) => a - b);
    const p75 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))];
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    out[k] = {
      n: arr.length,
      p75: Math.round(p75 * 1000) / 1000,
      avg: Math.round(avg * 1000) / 1000,
    };
  }
  return out;
}

/**
 * First/last touch path attribution for leads using session events.
 * Returns cohort-level only (no PII).
 */
function attributeLeads(leads, events) {
  const bySid = new Map();
  for (const ev of events || []) {
    const sid = String(ev.sid || "");
    if (!sid) continue;
    if (!bySid.has(sid)) bySid.set(sid, []);
    bySid.get(sid).push(ev);
  }
  for (const arr of bySid.values()) {
    arr.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  }

  const rows = [];
  for (const lead of leads || []) {
    const sid = lead.session_id || lead.sid;
    const landing = lead.landing_page || null;
    const evs = sid ? bySid.get(sid) || [] : [];
    const first = evs.find((e) => e.event === "page_view") || evs[0];
    const last = [...evs].reverse().find((e) => e.event === "page_view") || evs[evs.length - 1];
    const assisted = [
      ...new Set(
        evs
          .filter((e) => e.event === "page_view" || e.event === "content_to_service")
          .map((e) => e.path)
          .filter(Boolean)
      ),
    ].slice(0, 20);

    let first_to_lead_hours = null;
    if (first?.ts && lead.received_at) {
      first_to_lead_hours =
        Math.round(((Date.parse(lead.received_at) - Date.parse(first.ts)) / 36e5) * 10) / 10;
    }
    let lead_to_proposal_hours = null;
    const propHist = (lead.stage_history || []).find((h) => h.to === "proposal");
    if (propHist?.at && lead.received_at) {
      lead_to_proposal_hours =
        Math.round(((Date.parse(propHist.at) - Date.parse(lead.received_at)) / 36e5) * 10) / 10;
    }
    let proposal_to_contract_hours = null;
    const wonHist = (lead.stage_history || []).find((h) => h.to === "won");
    if (wonHist?.at && propHist?.at) {
      proposal_to_contract_hours =
        Math.round(((Date.parse(wonHist.at) - Date.parse(propHist.at)) / 36e5) * 10) / 10;
    }

    rows.push({
      lead_id: lead.lead_id,
      first_touch_path: first?.path || landing,
      last_touch_path: last?.path || landing,
      assisted_paths: assisted,
      commercial_stage: lead.commercial_stage || lead.status,
      first_to_lead_hours,
      lead_to_proposal_hours,
      proposal_to_contract_hours,
      content_cluster: lead.content_cluster || null,
      jornada: lead.jornada || null,
    });
  }
  return rows;
}

function isMoneyAssetEvent(ev) {
  const props = (ev && ev.props) || {};
  const asset = String(props.asset_id || "");
  const route = String(props.route_family || "");
  const path = String((ev && ev.path) || props.page_path || "");
  return (
    asset === MONEY_ASSET_ID ||
    route === MONEY_ASSET_ROUTE ||
    path.includes(MONEY_ASSET_PATH)
  );
}

function isMoneyAssetLead(lead) {
  if (!lead || typeof lead !== "object") return false;
  const landing = String(lead.landing_page || lead.origem || "");
  return (
    lead.asset_id === MONEY_ASSET_ID ||
    lead.route_family === MONEY_ASSET_ROUTE ||
    landing.includes(MONEY_ASSET_PATH)
  );
}

/**
 * Operational chain for Diagnóstico de Defesa de Margem.
 * Event counts from collect; handoff counts from persisted leads.
 * Never includes nome/email/telefone/mensagem.
 */
function summarizeMoneyAssetLoop(events, leads) {
  const event_counters = {
    asset_view: 0,
    contract_analyzed: 0,
    cta_view: 0,
    cta_click: 0,
    lead_created: 0,
  };
  for (const ev of events || []) {
    const name = String(ev && ev.event || "");
    if (!(name in event_counters)) continue;
    if (isMoneyAssetEvent(ev)) event_counters[name] += 1;
  }

  const handoff = {
    delivered: 0,
    blocked: 0,
    pending: 0,
    retryable: 0,
    skipped: 0,
    dead: 0,
  };
  let persisted = 0;
  for (const lead of leads || []) {
    if (!isMoneyAssetLead(lead)) continue;
    persisted += 1;
    const status = String((lead.handoff && lead.handoff.status) || "").toUpperCase();
    if (status === "DELIVERED") handoff.delivered += 1;
    else if (status === "BLOCKED") handoff.blocked += 1;
    else if (status === "PENDING") handoff.pending += 1;
    else if (status === "RETRYABLE") handoff.retryable += 1;
    else if (status === "SKIPPED") handoff.skipped += 1;
    else if (status === "DEAD") handoff.dead += 1;
  }

  return {
    asset_id: MONEY_ASSET_ID,
    route_family: MONEY_ASSET_ROUTE,
    events: event_counters,
    lead_created_persisted: persisted,
    handoff,
  };
}

module.exports = {
  FUNNEL_EVENTS,
  MONEY_ASSET_ID,
  MONEY_ASSET_ROUTE,
  MONEY_ASSET_EVENT_NAMES,
  dayKey,
  weekKey,
  aggregateEvents,
  attributeLeads,
  summarizeVitals,
  isMoneyAssetEvent,
  isMoneyAssetLead,
  summarizeMoneyAssetLoop,
};
