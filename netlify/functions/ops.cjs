/**
 * Authenticated RevOps API — CONFENGE.
 *
 * Security:
 * - Requires OPS_TOKEN (Bearer or X-Ops-Token). Fail-closed if unset in production.
 * - Never returns public success without auth.
 * - Lead list with PII only when token valid; public HTML dashboard is noindex + token gated via client.
 *
 * Routes (query ?action=):
 *   GET  health
 *   GET  leads
 *   GET  lead&id=
 *   POST stage  { lead_id, stage, ... }
 *   GET  funnel
 *   GET  analytics_summary
 *   GET  weekly_report
 *   POST weekly_email
 *   POST synthetic_probe_ack (internal)
 */
const crypto = require("crypto");
const { corsHeaders, clientIp, safeLog } = require("./lib/lead-core.cjs");
const { createStore } = require("./lib/lead-store.cjs");
const {
  applyStageChange,
  publicLeadSummary,
  funnelRates,
  STAGES,
  LOSS_REASONS,
} = require("./lib/lead-stages.cjs");
const { aggregateEvents, attributeLeads } = require("./lib/analytics-agg.cjs");
const { deliverResendEmail } = require("./lib/lead-delivery.cjs");

function bindBlobs(event) {
  try {
    const { connectLambda } = require("@netlify/blobs");
    if (event && event.blobs) connectLambda(event);
  } catch {
    /* optional */
  }
}

function authOk(event) {
  const expected = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
  if (!expected) {
    if (process.env.NODE_ENV === "test" || process.env.LEAD_ALLOW_MEMORY_FALLBACK === "1") {
      // tests may set OPS_TOKEN; without it deny
    }
    return { ok: false, reason: "ops_token_not_configured" };
  }
  const h = event.headers || {};
  const auth = String(h.authorization || h.Authorization || "");
  const headerTok = String(h["x-ops-token"] || h["X-Ops-Token"] || "");
  let token = headerTok;
  if (auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  if (!token) {
    try {
      const q = new URL(event.rawUrl || `https://x/?${event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : ""}`);
      token = q.searchParams.get("token") || "";
    } catch {
      token = (event.queryStringParameters && event.queryStringParameters.token) || "";
    }
  }
  if (!token || token.length < 16) return { ok: false, reason: "unauthorized" };
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true };
}

function json(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(origin || "https://confenge.com.br"),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  let raw = event.body || "";
  if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listLeads(store) {
  if (typeof store.list === "function") {
    return store.list();
  }
  // NetlifyBlobs without list: try list from underlying store
  if (store.store && typeof store.store.list === "function") {
    const out = [];
    const result = await store.store.list({ prefix: "leads/" });
    const blobs = result.blobs || result || [];
    for (const b of blobs) {
      const key = b.key || b;
      if (!String(key).startsWith("leads/")) continue;
      const id = String(key).replace(/^leads\//, "");
      const rec = await store.get(id);
      if (rec) out.push(rec);
    }
    return out;
  }
  return [];
}

async function loadRecentAnalytics(event) {
  try {
    bindBlobs(event);
    const { getStore } = require("@netlify/blobs");
    const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "";
    const token =
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.NETLIFY_API_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN ||
      "";
    const store =
      siteID && token
        ? getStore({ name: "confenge-analytics", siteID, token })
        : getStore({ name: "confenge-analytics" });
    const events = [];
    if (typeof store.list === "function") {
      // last ~14 days prefixes
      const days = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
        days.push(d);
      }
      for (const day of days) {
        try {
          const listed = await store.list({ prefix: `events/${day}/` });
          const blobs = listed.blobs || [];
          for (const b of blobs.slice(0, 200)) {
            try {
              const data = await store.get(b.key, { type: "json" });
              if (data && Array.isArray(data.events)) events.push(...data.events);
            } catch {
              /* skip */
            }
          }
        } catch {
          /* skip day */
        }
      }
    }
    return events;
  } catch (err) {
    safeLog("warn", "ops_analytics_load_skip", {
      reason: err && err.message ? String(err.message).slice(0, 80) : "skip",
    });
    return [];
  }
}

function redactLeadForExport(record, { includePii }) {
  if (!includePii) return publicLeadSummary(record);
  return {
    ...publicLeadSummary(record),
    nome: record.nome,
    telefone: record.telefone,
    email: record.email,
    empresa: record.empresa,
    mensagem: record.mensagem ? "[present]" : null,
    stage_history: record.stage_history || [],
    delivery: record.delivery || null,
  };
}

exports.handler = async (event) => {
  const originCheck = (() => {
    try {
      const { originAllowed } = require("./lib/lead-core.cjs");
      return originAllowed(event);
    } catch {
      return { ok: true, origin: "https://confenge.com.br" };
    }
  })();
  const origin = originCheck.origin || "https://confenge.com.br";

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }

  const qs = event.queryStringParameters || {};
  const action = String(qs.action || "health").toLowerCase();

  if (action === "health") {
    return json(
      200,
      {
        ok: true,
        service: "confenge-ops",
        stages: STAGES,
        loss_reasons: LOSS_REASONS,
        auth_configured: Boolean(process.env.OPS_TOKEN || process.env.REVOPS_TOKEN),
        ts: new Date().toISOString(),
      },
      origin
    );
  }

  const auth = authOk(event);
  if (!auth.ok) {
    safeLog("warn", "ops_auth_fail", { reason: auth.reason, ip: clientIp(event).slice(0, 20) });
    return json(auth.reason === "ops_token_not_configured" ? 503 : 401, { ok: false, error: auth.reason }, origin);
  }

  bindBlobs(event);
  const store = await createStore(event);

  if (action === "leads" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const leads = await listLeads(store);
    const includePii = qs.pii === "1";
    const stage = qs.stage || "";
    let filtered = leads;
    if (stage) filtered = leads.filter((l) => (l.commercial_stage || l.status) === stage);
    const summaries = filtered
      .map((l) => redactLeadForExport(l, { includePii }))
      .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
    return json(
      200,
      {
        ok: true,
        count: summaries.length,
        leads: summaries,
        sla_breaches: summaries.filter((l) => l.needs_contact).length,
      },
      origin
    );
  }

  if (action === "lead" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const id = String(qs.id || "");
    if (!id) return json(400, { ok: false, error: "id_required" }, origin);
    const rec = await store.get(id);
    if (!rec) return json(404, { ok: false, error: "not_found" }, origin);
    return json(200, { ok: true, lead: redactLeadForExport(rec, { includePii: qs.pii === "1" }) }, origin);
  }

  if (action === "stage" && event.httpMethod === "POST") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const body = parseBody(event);
    if (!body) return json(400, { ok: false, error: "invalid_json" }, origin);
    const id = String(body.lead_id || body.id || "");
    if (!id) return json(400, { ok: false, error: "lead_id_required" }, origin);
    const cur = await store.get(id);
    if (!cur) return json(404, { ok: false, error: "not_found" }, origin);
    try {
      const patch = applyStageChange(cur, {
        stage: body.stage,
        actor: body.actor || "ops",
        note: body.note,
        loss_reason: body.loss_reason,
        next_action: body.next_action,
        owner: body.owner,
        proposal_value: body.proposal_value,
        contract_value: body.contract_value,
        revenue_received: body.revenue_received,
      });
      const next = await store.update(id, patch);
      safeLog("info", "ops_stage_change", {
        lead_id: id,
        to: patch.commercial_stage,
        actor: body.actor || "ops",
      });
      return json(200, { ok: true, lead: publicLeadSummary(next) }, origin);
    } catch (err) {
      return json(400, { ok: false, error: err.code || "stage_error", message: err.message }, origin);
    }
  }

  if (action === "funnel" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const leads = await listLeads(store);
    const funnel = funnelRates(leads);
    const by_cluster = {};
    const by_offer = {};
    const by_landing = {};
    for (const l of leads) {
      const c = l.content_cluster || "unknown";
      if (!by_cluster[c]) by_cluster[c] = [];
      by_cluster[c].push(l);
      const o = l.offer_id || l.jornada || "unknown";
      if (!by_offer[o]) by_offer[o] = [];
      by_offer[o].push(l);
      const lp = l.landing_page || "unknown";
      if (!by_landing[lp]) by_landing[lp] = [];
      by_landing[lp].push(l);
    }
    return json(
      200,
      {
        ok: true,
        funnel,
        by_cluster: Object.fromEntries(
          Object.entries(by_cluster).map(([k, v]) => [k, funnelRates(v).counts])
        ),
        by_offer: Object.fromEntries(
          Object.entries(by_offer).map(([k, v]) => [k, funnelRates(v).counts])
        ),
        by_landing: Object.fromEntries(
          Object.entries(by_landing)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 40)
            .map(([k, v]) => [k, funnelRates(v).counts])
        ),
        loss_reasons: leads
          .filter((l) => l.loss_reason)
          .reduce((acc, l) => {
            acc[l.loss_reason] = (acc[l.loss_reason] || 0) + 1;
            return acc;
          }, {}),
      },
      origin
    );
  }

  if (action === "analytics_summary" && event.httpMethod === "GET") {
    const events = await loadRecentAnalytics(event);
    const agg = aggregateEvents(events);
    let attribution = [];
    if (store) {
      const leads = await listLeads(store);
      attribution = attributeLeads(leads, events);
    }
    return json(
      200,
      {
        ok: true,
        events_loaded: events.length,
        aggregate: agg,
        attribution_cohorts: attribution,
        note: agg.attribution_note,
      },
      origin
    );
  }

  if (action === "weekly_report" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const leads = await listLeads(store);
    const events = await loadRecentAnalytics(event);
    const agg = aggregateEvents(events);
    const funnel = funnelRates(leads);
    const weekAgo = Date.now() - 7 * 864e5;
    const newLeads = leads.filter((l) => Date.parse(l.received_at || 0) >= weekAgo);
    const report = {
      ok: true,
      period: "7d",
      generated_at: new Date().toISOString(),
      primary_metric: "pipeline_and_revenue",
      leads_total: leads.length,
      leads_new_7d: newLeads.length,
      funnel,
      sla_breaches: leads.filter((l) => publicLeadSummary(l).needs_contact).length,
      analytics: {
        daily: agg.daily.slice(-7),
        web_vitals: agg.web_vitals,
        top_paths: agg.funnel_by_path.slice(0, 15),
        cta_totals: agg.cta_totals,
      },
      next_experiments: [
        "CTR titles for pages with impressions and low CTR (GSC observatory)",
        "CTA test on high-traffic zero-lead pages",
        "Tool vs checklist for acréscimos/supressões intent",
      ],
    };
    return json(200, report, origin);
  }

  if (action === "weekly_email" && event.httpMethod === "POST") {
    const to = process.env.OPS_REPORT_EMAIL || process.env.LEAD_NOTIFY_EMAIL;
    if (!to) return json(503, { ok: false, error: "ops_report_email_not_configured" }, origin);
    if (!process.env.RESEND_API_KEY) {
      return json(503, { ok: false, error: "resend_not_configured" }, origin);
    }
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const leads = await listLeads(store);
    const funnel = funnelRates(leads);
    const weekAgo = Date.now() - 7 * 864e5;
    const newLeads = leads.filter((l) => Date.parse(l.received_at || 0) >= weekAgo);
    const html = `
      <h1>CONFENGE — relatório semanal RevOps</h1>
      <p>Gerado em ${new Date().toISOString()}</p>
      <ul>
        <li>Leads (total): ${leads.length}</li>
        <li>Leads novos (7d): ${newLeads.length}</li>
        <li>Pipeline: R$ ${funnel.pipeline_value}</li>
        <li>Receita: R$ ${funnel.revenue}</li>
        <li>Contatados: ${funnel.counts.contacted}</li>
        <li>Reuniões: ${funnel.counts.meeting}</li>
        <li>Propostas: ${funnel.counts.proposal}</li>
        <li>Ganhos: ${funnel.counts.won}</li>
        <li>Perdidos: ${funnel.counts.lost}</li>
      </ul>
      <p>Métrica principal: pipeline qualificado e receita atribuível ao conteúdo — não sessões.</p>
      <p>Dashboard: https://confenge.com.br/ops/</p>
    `;
    // Reuse Resend path via minimal fake record for deliverResendEmail is wrong;
    // send directly.
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "CONFENGE Ops <ops@confenge.com.br>",
        to: [to],
        subject: `[CONFENGE] Relatório semanal — ${newLeads.length} leads novos · pipeline R$${funnel.pipeline_value}`,
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return json(502, { ok: false, error: "resend_failed", detail: t.slice(0, 200) }, origin);
    }
    return json(200, { ok: true, emailed: true, to_domain: to.split("@")[1] || "redacted" }, origin);
  }

  // prevent unused import lint in some bundlers
  void deliverResendEmail;

  return json(404, { ok: false, error: "unknown_action", action }, origin);
};

// test helpers
exports._authOk = authOk;
exports._listLeads = listLeads;
