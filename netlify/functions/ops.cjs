/**
 * Authenticated RevOps API — CONFENGE.
 *
 * Security:
 * - Requires OPS_TOKEN (Bearer or X-Ops-Token). Fail-closed if unset in production.
 * - Never returns public success without auth.
 * - Lead list with PII only when token valid; public HTML dashboard is noindex + token gated via client.
 * - Strategic GSC insights only via authenticated gsc_insights (never public static JSON).
 * - Commercial metrics default to record_kind === "real" only.
 *
 * Routes (query ?action=):
 *   GET  health
 *   GET  leads
 *   GET  lead&id=
 *   POST stage  { lead_id, stage, ... }
 *   GET  funnel              (real-only commercial)
 *   GET  system_health       (probes/QA separated)
 *   GET  analytics_summary
 *   GET  weekly_report       (real-only)
 *   POST weekly_email        (real-only)
 *   GET  gsc_history         (auth required, versioned/hash-verified)
 *   GET  gsc_insights        (auth required)
 *   POST gsc_insights_ingest { producer, history, insights? } (redacted, durable, auth required)
 *   POST gsc_insights_rollback { snapshot_sha256, reason } (exact version, auth required)
 *   POST backfill_record_kind { dry_run?, apply_ids? }
 *   POST rollback_record_kind { snapshot_id }
 *   GET  inbound_handoff
 *   GET  audit_inbound_requeue
 *   POST requeue_inbound { mode: "eligible_only", dry_run: boolean, limit: 1, approval_reference?: string }
 *   POST drain_inbound
 *   GET  search_observation
 *   POST produce_search_observation
 *   POST drain_search_observation
 */
const crypto = require("crypto");
const { corsHeaders, clientIp, safeLog } = require("./lib/lead-core.cjs");
const { createStore } = require("./lib/lead-store.cjs");
const {
  isProductionProfile,
  resolveStorageConfig,
  createHostBackend,
  loadLegacyNetlifyStore,
  storageReadiness,
} = require("./lib/storage-config.cjs");
const {
  applyStageChange,
  publicLeadSummary,
  funnelRates,
  systemHealth,
  STAGES,
  LOSS_REASONS,
} = require("./lib/lead-stages.cjs");
const {
  classifyForBackfill,
  kindAuditEntry,
  filterCommercialLeads,
  countByKind,
  isCommercialReal,
  normalizeKind,
} = require("./lib/record-kind.cjs");
const { aggregateEvents, attributeLeads, summarizeMoneyAssetLoop } = require("./lib/analytics-agg.cjs");
const { deliverResendEmail } = require("./lib/lead-delivery.cjs");
const { validateHistoryState } = require("./lib/gsc-history.cjs");
const {
  persistPrivateGscSnapshot,
  readPrivateGscHistory,
  readPrivateGscSnapshot,
  rollbackPrivateGscSnapshot,
} = require("./lib/gsc-private-snapshot.cjs");
const {
  drainPendingHandoffs,
  resolveInboundConfig,
  summarizeHandoffs,
  auditSkippedHandoffs,
  inboundDestinationFingerprint,
  probeInboundDestinationHealth,
  requeueEligibleHandoffs,
} = require("./lib/inbound-handoff.cjs");
const {
  loadInboundBacklogDecision,
  loadInboundBacklogExecutionAuthority,
  validateInboundBacklogDecision,
  authorizeInboundBacklogReplay,
} = require("./lib/inbound-backlog-policy.cjs");
const {
  createObservationStore,
  produceFromShippedOverlay,
  drainHeld,
  summarizeObservations,
} = require("./lib/search-observation.cjs");

/** Simple per-IP rate limit for authenticated ops (in-memory, best-effort). */
const _opsHits = new Map();
function opsRateLimit(event, { limit = 120, windowMs = 60_000 } = {}) {
  const ip = clientIp(event) || "unknown";
  const now = Date.now();
  let bucket = _opsHits.get(ip);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, n: 0 };
    _opsHits.set(ip, bucket);
  }
  bucket.n += 1;
  if (bucket.n > limit) return { ok: false, retryAfter: Math.ceil((bucket.start + windowMs - now) / 1000) };
  return { ok: true };
}

const SAFE_GSC_QUERY_KEYS = new Set([
  "query_class",
  "query_count",
  "query_hash",
  "query_text_redacted",
  "raw_query_rows_in_git",
]);

function isSensitiveGscKey(key) {
  const normalized = String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (SAFE_GSC_QUERY_KEYS.has(normalized) || /^\d+_emerging_terms$/.test(normalized)) return false;
  const tokens = new Set(normalized.split("_").filter(Boolean));
  return [
    "query", "queries", "term", "terms", "keyword", "keywords", "termo", "termos",
    "consulta", "consultas", "email", "telefone", "phone", "nome", "name", "cpf",
    "cnpj", "whatsapp", "pii", "contact", "contato", "person", "pessoa", "customer",
    "cliente", "user", "usuario", "fullname", "username",
  ].some((token) => tokens.has(token));
}

function isSensitiveGscValue(value) {
  if (typeof value !== "string") return false;
  if (/^(?:sha256:)?[a-f0-9]{16,64}$/i.test(value)) return false;
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  ) return false;
  if (/^(?:https?:\/\/|\/)[^\s]*[?#]/i.test(value)) return true;
  return /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value) ||
    /(?:\+?\d[\s().-]*){10,15}/.test(value) ||
    /(?:wa\.me|whatsapp\.com)\//i.test(value);
}

/** Strip any accidental PII or raw-search keys from GSC payload (defense in depth). */
function sanitizeGscForOps(data) {
  if (!data || typeof data !== "object") return data;
  function walk(v) {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (isSensitiveGscKey(k)) continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  }
  return walk(data);
}

const GSC_INSIGHTS_STATE_ID = "gsc-insights-latest-v1";

function findSensitiveGscData(data) {
  let badKey = null;
  let sensitiveValue = false;
  function walk(value) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (isSensitiveGscKey(key)) badKey = badKey || key;
        walk(item);
      }
      return;
    }
    if (isSensitiveGscValue(value)) sensitiveValue = true;
  }
  walk(data);
  return { badKey, sensitiveValue };
}

function validateGscInsights(data, { now = Date.now(), allowStale = false } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "gsc_insights_invalid" };
  }
  const { badKey, sensitiveValue } = findSensitiveGscData(data);
  if (badKey || sensitiveValue) {
    return { ok: false, error: "gsc_insights_sensitive_field", field: badKey || "sensitive_value" };
  }
  if (
    data.source !== "search_analytics_api" ||
    data.ready_for_product_decisions !== true ||
    data.synthetic !== false ||
    data.fixture !== false ||
    data.live_baseline_invented !== false ||
    data.query_text_redacted !== true ||
    data.raw_query_rows_in_git !== false
  ) {
    return { ok: false, error: "gsc_insights_not_product_ready" };
  }
  const asOf = String(data.as_of || "");
  const generatedAt = String(data.generated_at || "");
  const asOfStart = Date.parse(`${asOf}T00:00:00Z`);
  const generatedAtMs = Date.parse(generatedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
    !Number.isFinite(asOfStart) ||
    new Date(asOfStart).toISOString().slice(0, 10) !== asOf ||
    !Number.isFinite(generatedAtMs)
  ) {
    return { ok: false, error: "gsc_insights_invalid_freshness" };
  }
  const maxAgeMs = 14 * 864e5;
  const asOfEnd = asOfStart + 864e5 - 1;
  const stale = (
    now - generatedAtMs > maxAgeMs ||
    now - asOfEnd > maxAgeMs ||
    generatedAtMs > now + 5 * 60_000 ||
    asOfStart > now + 864e5
  );
  if (stale && !allowStale) {
    return { ok: false, error: "gsc_insights_stale" };
  }
  return { ok: true, stale };
}

function bindBlobs(event) {
  const cfg = resolveStorageConfig(process.env, event);
  if (!cfg.ok || cfg.backend !== "netlify-blobs") return;
  try {
    loadLegacyNetlifyStore("confenge-leads", process.env, event);
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

function loadLocalAnalytics(event) {
  const cfg = resolveStorageConfig(process.env, event);
  if (!cfg.ok || cfg.backend !== "filesystem") return [];
  const opened = createHostBackend(process.env, { event });
  if (!opened.backend) return [];
  const namespace = opened.backend.namespace("analytics-events");
  const events = [];
  const cutoff = Date.now() - 14 * 864e5;
  for (const row of namespace.list()) {
    const data = row.value;
    if (!data || !Array.isArray(data.events)) continue;
    for (const analyticsEvent of data.events) {
      if (Date.parse(analyticsEvent.ts || 0) >= cutoff) events.push(analyticsEvent);
    }
  }
  return events;
}

async function loadRecentAnalytics(event) {
  const events = loadLocalAnalytics(event);
  const cfg = resolveStorageConfig(process.env, event);
  if (!cfg.ok || cfg.backend !== "netlify-blobs") return events;
  try {
    const store = loadLegacyNetlifyStore("confenge-analytics", process.env, event);
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
    return events;
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
    const persistence = storageReadiness(process.env, {
      event,
      writeProbe: isProductionProfile(process.env),
    });
    const ready = persistence.ok || !isProductionProfile(process.env);
    return json(
      ready ? 200 : 503,
      {
        ok: ready,
        service: "confenge-ops",
        storage: { ok: persistence.ok, backend: persistence.backend || null, code: persistence.code || null },
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

  const rl = opsRateLimit(event);
  if (!rl.ok) {
    safeLog("warn", "ops_rate_limited", { ip: clientIp(event).slice(0, 20) });
    return json(429, { ok: false, error: "rate_limited", retry_after: rl.retryAfter }, origin);
  }

  bindBlobs(event);
  const gscReadOnly = event.httpMethod === "GET" && ["gsc_history", "gsc_insights"].includes(action);
  const store = await createStore({ event, readOnly: gscReadOnly });

  if (action === "gsc_history" && event.httpMethod === "GET") {
    if (!store || typeof store.getSystemRecord !== "function") {
      return json(503, { ok: false, error: "gsc_history_store_unavailable" }, origin);
    }
    const current = await readPrivateGscHistory(store);
    if (!current.ok) {
      // One-way bootstrap compatibility: an old unversioned state may seed the
      // next producer run, but it can never satisfy the CURRENT consumer gate.
      const legacy = await store.getSystemRecord(GSC_INSIGHTS_STATE_ID);
      if (!legacy?.history) {
        const missing = current.error === "gsc_private_pointer_missing";
        return json(missing ? 404 : 409, {
          ok: false,
          status: "UNKNOWN",
          error: missing ? "gsc_history_empty" : current.error,
        }, origin);
      }
      const validation = validateHistoryState(legacy.history);
      const sensitive = findSensitiveGscData(legacy.history);
      if (!validation.ok || sensitive.badKey || sensitive.sensitiveValue) {
        return json(409, { ok: false, status: "UNKNOWN", error: validation.error || "gsc_history_sensitive_field" }, origin);
      }
      return json(200, {
        ok: true,
        status: "UNKNOWN",
        history: legacy.history,
        meta: {
          state_sha256: legacy.history.state_sha256,
          stored_at: legacy.state_published_at || null,
          schema_version: "legacy-unversioned/v2",
          reason_codes: ["legacy_unversioned_state"],
        },
      }, origin);
    }
    return json(200, current, origin);
  }

  if (action === "gsc_insights_ingest" && event.httpMethod === "POST") {
    if (!store || typeof store.putSystemRecord !== "function" || typeof store.getSystemRecord !== "function") {
      return json(503, { ok: false, error: "gsc_insights_store_unavailable" }, origin);
    }
    if (Buffer.byteLength(String(event.body || ""), "utf8") > 512 * 1024) {
      return json(413, { ok: false, error: "gsc_insights_too_large" }, origin);
    }
    const body = parseBody(event);
    if (!body) return json(400, { ok: false, error: "invalid_json" }, origin);
    const historyValidation = validateHistoryState(body.history);
    const historySensitive = findSensitiveGscData(body.history);
    if (!historyValidation.ok || historySensitive.badKey || historySensitive.sensitiveValue) {
      return json(
        422,
        {
          ok: false,
          error: historyValidation.error || "gsc_history_sensitive_field",
        },
        origin,
      );
    }
    const durableHistory = await readPrivateGscHistory(store);
    const legacyCurrent = durableHistory.ok ? null : await store.getSystemRecord(GSC_INSIGHTS_STATE_ID);
    const currentHistory = durableHistory.ok ? durableHistory.history : legacyCurrent?.history || null;
    if (currentHistory) {
      const currentHistoryValidation = validateHistoryState(currentHistory);
      if (!currentHistoryValidation.ok) return json(409, { ok: false, error: "gsc_history_store_corrupt" }, origin);
      if (
        body.history.state_sha256 !== currentHistory.state_sha256 &&
        body.history.parent_state_sha256 !== currentHistory.state_sha256
      ) {
        return json(409, { ok: false, error: "gsc_history_write_conflict" }, origin);
      }
      const currentEnd = String(currentHistory.readiness?.window_end || "");
      const incomingEnd = String(body.history.readiness?.window_end || "");
      if (currentEnd && (!incomingEnd || currentEnd > incomingEnd)) {
        return json(409, { ok: false, error: "gsc_history_stale_overwrite" }, origin);
      }
    }

    let insights = null;
    if (body.insights != null) {
      const validation = validateGscInsights(body.insights);
      if (!validation.ok) return json(422, { ok: false, ...validation }, origin);
      if (
        body.history.readiness?.ready_for_product_decisions !== true ||
        body.history.last_known_good?.as_of !== body.insights.as_of ||
        body.insights.readiness_contract_version !== "gsc-readiness/v2" ||
        body.insights.history_state_sha256 !== body.history.state_sha256 ||
        body.insights.snapshot_sha256 !== body.history.last_known_good?.snapshot_sha256
      ) {
        return json(422, { ok: false, error: "gsc_insights_history_provenance_invalid" }, origin);
      }
      insights = sanitizeGscForOps(body.insights);
      const currentRead = durableHistory.ok ? await readPrivateGscSnapshot(store) : null;
      const currentInsights = currentRead?.insights || legacyCurrent?.insights || null;
      const olderAsOf = currentInsights?.as_of && String(currentInsights.as_of) > String(insights.as_of);
      const olderGeneration = currentInsights?.as_of === insights.as_of &&
        Date.parse(currentInsights.generated_at || "") > Date.parse(insights.generated_at || "");
      if (olderAsOf || olderGeneration) {
        return json(409, { ok: false, error: "gsc_insights_stale_overwrite" }, origin);
      }
    }
    let receipt;
    try {
      receipt = await persistPrivateGscSnapshot(store, {
        producer: body.producer,
        history: body.history,
        insights,
      });
    } catch (error) {
      const code = String(error.message || error);
      const status = /conflict|overwrite/.test(code) ? 409 : /invalid|mismatch|stale|partial/.test(code) ? 422 : 503;
      return json(status, { ok: false, status: "UNKNOWN", error: code }, origin);
    }
    safeLog("info", "gsc_insights_ingested", {
      status: receipt.status,
      as_of: receipt.as_of,
      manifest_sha256: receipt.consumer_manifest_sha256?.slice(0, 16) || null,
      history_state_sha256: receipt.history_state_sha256.slice(0, 16),
      promoted: receipt.promoted,
    });
    return json(200, {
      ...receipt,
      durable: true,
      published_at: receipt.published_at,
    }, origin);
  }

  if (action === "gsc_insights" && event.httpMethod === "GET") {
    if (!store || typeof store.getSystemRecord !== "function") {
      return json(503, { ok: false, status: "UNKNOWN", error: "gsc_insights_store_unavailable" }, origin);
    }
    const consumed = await readPrivateGscSnapshot(store);
    if (!consumed.meta) {
      return json(200, {
        ok: false,
        status: "UNKNOWN",
        access_mode: "NONE",
        insights: null,
        meta: {
          delivery_source: "durable_store",
          ready_for_product_decisions: false,
          reason_codes: [consumed.error || "snapshot_absent"],
          note: "Authenticated ops only. No versioned durable snapshot is CURRENT.",
        },
      }, origin);
    }
    safeLog("info", "gsc_insights_served", {
      status: consumed.status,
      manifest_sha256: consumed.meta.consumer_manifest_sha256?.slice(0, 16) || null,
    });
    return json(200, {
      ...consumed,
      meta: {
        ...consumed.meta,
        published_at: consumed.meta.ingested_at,
        note: "Authenticated ops only. Versioned host-owned durable snapshot.",
      },
    }, origin);
  }

  if (action === "gsc_insights_rollback" && event.httpMethod === "POST") {
    if (!store || typeof store.getSystemRecord !== "function" || typeof store.putSystemRecord !== "function") {
      return json(503, { ok: false, status: "UNKNOWN", error: "gsc_insights_store_unavailable" }, origin);
    }
    const body = parseBody(event);
    if (!body) return json(400, { ok: false, error: "invalid_json" }, origin);
    try {
      const receipt = await rollbackPrivateGscSnapshot(store, body);
      return json(200, { ...receipt, durable: true }, origin);
    } catch (error) {
      return json(422, { ok: false, status: "UNKNOWN", error: String(error.message || error) }, origin);
    }
  }

  if (action === "leads" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const leads = await listLeads(store);
    const includePii = qs.pii === "1";
    const stage = qs.stage || "";
    const kindFilter = String(qs.kind || "real").toLowerCase(); // real | all | synthetic | qa | spam | internal
    let filtered = leads;
    if (kindFilter === "real") {
      filtered = filterCommercialLeads(filtered);
    } else if (kindFilter !== "all") {
      filtered = filtered.filter((l) => (normalizeKind(l.record_kind) || "real") === kindFilter);
    }
    if (stage) filtered = filtered.filter((l) => (l.commercial_stage || l.status) === stage);
    const summaries = filtered
      .map((l) => redactLeadForExport(l, { includePii }))
      .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
    return json(
      200,
      {
        ok: true,
        count: summaries.length,
        kind_filter: kindFilter,
        counts_by_kind: countByKind(leads),
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
    // Commercial funnel: real-only by default
    const real = filterCommercialLeads(leads);
    const funnel = funnelRates(real, { commercialOnly: false });
    const health = systemHealth(leads);
    const by_cluster = {};
    const by_offer = {};
    const by_landing = {};
    for (const l of real) {
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
        commercial_only: true,
        funnel,
        system_health: health,
        by_cluster: Object.fromEntries(
          Object.entries(by_cluster).map(([k, v]) => [k, funnelRates(v, { commercialOnly: false }).counts])
        ),
        by_offer: Object.fromEntries(
          Object.entries(by_offer).map(([k, v]) => [k, funnelRates(v, { commercialOnly: false }).counts])
        ),
        by_landing: Object.fromEntries(
          Object.entries(by_landing)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 40)
            .map(([k, v]) => [k, funnelRates(v, { commercialOnly: false }).counts])
        ),
        loss_reasons: real
          .filter((l) => l.loss_reason)
          .reduce((acc, l) => {
            acc[l.loss_reason] = (acc[l.loss_reason] || 0) + 1;
            return acc;
          }, {}),
      },
      origin
    );
  }

  if (action === "system_health" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const leads = await listLeads(store);
    const health = systemHealth(leads);
    return json(
      200,
      {
        ok: true,
        ...health,
        store_available: Boolean(store),
        ts: new Date().toISOString(),
      },
      origin
    );
  }

  if (action === "analytics_summary" && event.httpMethod === "GET") {
    const events = await loadRecentAnalytics(event);
    const agg = aggregateEvents(events);
    let attribution = [];
    let leads = [];
    if (store) {
      leads = await listLeads(store);
      // Attribution cohorts use real commercial leads only
      attribution = attributeLeads(filterCommercialLeads(leads), events);
    }
    const money_asset = summarizeMoneyAssetLoop(events, leads);
    return json(
      200,
      {
        ok: true,
        events_loaded: events.length,
        aggregate: agg,
        money_asset,
        attribution_cohorts: attribution,
        note: agg.attribution_note,
      },
      origin
    );
  }

  if (action === "weekly_report" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const leads = await listLeads(store);
    const real = filterCommercialLeads(leads);
    const events = await loadRecentAnalytics(event);
    const agg = aggregateEvents(events);
    const funnel = funnelRates(real, { commercialOnly: false });
    const health = systemHealth(leads);
    const weekAgo = Date.now() - 7 * 864e5;
    const newLeads = real.filter((l) => Date.parse(l.received_at || 0) >= weekAgo);
    const report = {
      ok: true,
      period: "7d",
      generated_at: new Date().toISOString(),
      primary_metric: "pipeline_and_revenue",
      commercial_only: true,
      leads_total: real.length,
      leads_new_7d: newLeads.length,
      leads_excluded_non_real: leads.length - real.length,
      funnel,
      system_health: {
        real_leads: health.real_leads,
        synthetic_leads: health.synthetic_leads,
        qa_leads: health.qa_leads,
        spam_leads: health.spam_leads,
        pipeline_real: health.pipeline_real,
        revenue_real: health.revenue_real,
        last_real_conversion: health.last_real_conversion,
      },
      sla_breaches: real.filter((l) => publicLeadSummary(l).needs_contact).length,
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
    const real = filterCommercialLeads(leads);
    const funnel = funnelRates(real, { commercialOnly: false });
    const health = systemHealth(leads);
    const weekAgo = Date.now() - 7 * 864e5;
    const newLeads = real.filter((l) => Date.parse(l.received_at || 0) >= weekAgo);
    const html = `
      <h1>CONFENGE — relatório semanal RevOps (real-only)</h1>
      <p>Gerado em ${new Date().toISOString()}</p>
      <ul>
        <li>Leads reais (total): ${real.length}</li>
        <li>Leads reais novos (7d): ${newLeads.length}</li>
        <li>Excluídos (synthetic/qa/spam/internal): ${leads.length - real.length}</li>
        <li>Pipeline real: R$ ${funnel.pipeline_value}</li>
        <li>Receita real: R$ ${funnel.revenue}</li>
        <li>Contatados: ${funnel.counts.contacted}</li>
        <li>Reuniões: ${funnel.counts.meeting}</li>
        <li>Propostas: ${funnel.counts.proposal}</li>
        <li>Ganhos: ${funnel.counts.won}</li>
        <li>Perdidos: ${funnel.counts.lost}</li>
        <li>Última conversão real: ${health.last_real_conversion || "—"}</li>
      </ul>
      <p>Probes/QA nunca entram nestes totais. System Health: synthetic=${health.synthetic_leads} qa=${health.qa_leads} spam=${health.spam_leads}.</p>
      <p>Métrica principal: pipeline qualificado e receita atribuível ao conteúdo — não sessões.</p>
      <p>Dashboard: https://confenge.com.br/ops/</p>
    `;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "CONFENGE Ops <ops@confenge.com.br>",
        to: [to],
        subject: `[CONFENGE] Semanal real — ${newLeads.length} leads · pipeline R$${funnel.pipeline_value}`,
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return json(502, { ok: false, error: "resend_failed", detail: t.slice(0, 200) }, origin);
    }
    return json(200, { ok: true, emailed: true, commercial_only: true, to_domain: to.split("@")[1] || "redacted" }, origin);
  }

  if (action === "backfill_record_kind" && event.httpMethod === "POST") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const body = parseBody(event) || {};
    const dryRun = body.dry_run !== false && body.apply !== true;
    const leads = await listLeads(store);
    const candidates = [];
    for (const lead of leads) {
      const clf = classifyForBackfill(lead);
      if (clf.action !== "mark") continue;
      candidates.push({
        lead_id: lead.lead_id,
        from: lead.record_kind || "real",
        to: clf.record_kind,
        signals: clf.signals,
        reason: clf.reason,
        commercial_stage: lead.commercial_stage || lead.status,
      });
    }
    if (dryRun) {
      return json(
        200,
        {
          ok: true,
          dry_run: true,
          candidates,
          candidate_count: candidates.length,
          total_leads: leads.length,
          counts_by_kind_before: countByKind(leads),
          note: "Pass apply:true (or dry_run:false) to write. Rollback via rollback_record_kind with snapshot_id.",
        },
        origin
      );
    }
    const snapshot_id = `kind-snap-${Date.now().toString(36)}`;
    const snapshot = {
      snapshot_id,
      at: new Date().toISOString(),
      entries: candidates.map((c) => ({ lead_id: c.lead_id, previous_kind: c.from, new_kind: c.to, signals: c.signals })),
    };
    if (typeof store.putSystemRecord !== "function") {
      return json(503, { ok: false, error: "snapshot_store_unavailable" }, origin);
    }
    try {
      await store.putSystemRecord(`record-kind:${snapshot_id}`, snapshot, { onlyIfNew: true });
    } catch (err) {
      safeLog("error", "record_kind_snapshot_failed", { code: String(err?.code || "write_failed") });
      return json(503, { ok: false, error: "snapshot_persist_failed" }, origin);
    }
    let applied = 0;
    for (const c of candidates) {
      const cur = await store.get(c.lead_id);
      if (!cur) continue;
      const audit = [
        ...(cur.audit || []),
        kindAuditEntry({
          from: c.from,
          to: c.to,
          signals: c.signals,
          actor: body.actor || "backfill",
          note: "backfill_record_kind",
        }),
      ];
      await store.update(c.lead_id, {
        record_kind: c.to,
        record_kind_signals: c.signals,
        record_kind_classified_at: new Date().toISOString(),
        next_action: c.to === "real" ? cur.next_action : "exclude_from_commercial",
        audit,
      });
      applied += 1;
    }
    const after = await listLeads(store);
    safeLog("info", "backfill_record_kind", { applied, snapshot_id });
    return json(
      200,
      {
        ok: true,
        dry_run: false,
        applied,
        snapshot_id,
        candidates,
        counts_by_kind_after: countByKind(after),
        system_health: systemHealth(after),
      },
      origin
    );
  }

  if (action === "rollback_record_kind" && event.httpMethod === "POST") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const body = parseBody(event) || {};
    const snapshot_id = String(body.snapshot_id || "");
    if (!snapshot_id) return json(400, { ok: false, error: "snapshot_id_required" }, origin);
    const snapshot = typeof store.getSystemRecord === "function"
      ? await store.getSystemRecord(`record-kind:${snapshot_id}`)
      : null;
    // Legacy body entries remain a manual recovery escape hatch for snapshots
    // created before system-record persistence was mandatory.
    const entries = (snapshot && snapshot.entries) || body.entries || [];
    if (!entries.length) return json(404, { ok: false, error: "snapshot_not_found" }, origin);
    let restored = 0;
    for (const e of entries) {
      const cur = await store.get(e.lead_id);
      if (!cur) continue;
      const prev = e.previous_kind || "real";
      await store.update(e.lead_id, {
        record_kind: prev,
        audit: [
          ...(cur.audit || []),
          kindAuditEntry({
            from: cur.record_kind,
            to: prev,
            signals: ["rollback"],
            actor: body.actor || "rollback",
            note: `rollback ${snapshot_id}`,
          }),
        ],
        next_action: prev === "real" ? "first_contact" : "exclude_from_commercial",
      });
      restored += 1;
    }
    return json(200, { ok: true, restored, snapshot_id }, origin);
  }

  if (action === "inbound_handoff" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const leads = await listLeads(store);
    const counters = summarizeHandoffs(leads);
    const events = await loadRecentAnalytics(event);
    const money_asset = summarizeMoneyAssetLoop(events, leads);
    const inboundConfig = resolveInboundConfig(process.env);
    // Read-only destination safety proof. This is deliberately evaluated by the
    // server, where the canonical destination is configured, so callers never
    // receive a URL, credential or signed request. A synthetic live proof must
    // observe these controls before it is allowed to create its flagged row.
    const destinationSafety = await probeInboundDestinationHealth({ env: process.env });
    const requestedLeadId = String(event.queryStringParameters?.lead_id || "").trim();
    const requestedLead = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(requestedLeadId)
      ? await store.get(requestedLeadId)
      : null;
    const configuration = {
      webhook_url: process.env.CONFENGE_INBOUND_WEBHOOK_URL ? "SET" : "UNSET",
      webhook_secret: process.env.CONFENGE_INBOUND_WEBHOOK_SECRET ? "SET" : "UNSET",
      contract: inboundConfig.ok ? "READY" : inboundConfig.skip ? "UNSET" : "BLOCKED",
      reason: inboundConfig.ok ? null : inboundConfig.reason || "UNKNOWN",
      destination_fingerprint: inboundDestinationFingerprint(
        process.env.CONFENGE_INBOUND_WEBHOOK_URL
      ),
    };
    return json(
      200,
      {
        ok: true,
        counters,
        money_asset,
        configuration,
        safety_gate: {
          ok: destinationSafety.ok === true,
          contract: destinationSafety.contract || "BLOCKED",
          auto_send_off: destinationSafety.auto_send_off === true,
          status: destinationSafety.status || "UNKNOWN",
          dispatch_attempted: destinationSafety.dispatch_attempted === true,
          reason: destinationSafety.reason || null,
        },
        receipt: requestedLead
          ? {
              lead_id: requestedLead.lead_id,
              receipt_id: requestedLead.receipt_id || requestedLead.lead_id,
              record_kind: requestedLead.record_kind || "real",
              authenticated_probe: requestedLead.synthetic_probe_authenticated === true,
              source: requestedLead.source || "CONFENGE_WEB",
              next_action: requestedLead.next_action || null,
              asset_id: requestedLead.asset_id || null,
              route_family: requestedLead.route_family || null,
              cta_id: requestedLead.cta_id || null,
              handoff: requestedLead.handoff
                ? {
                    status: requestedLead.handoff.status,
                    attempts: requestedLead.handoff.attempts,
                    delivered_at: requestedLead.handoff.delivered_at || null,
                    downstream: requestedLead.handoff.downstream || null,
                    last_error: requestedLead.handoff.last_error || null,
                    next_attempt_at: requestedLead.handoff.next_attempt_at || null,
                  }
                : null,
              delivery: requestedLead.delivery
                ? {
                    notify_status: requestedLead.delivery.notify?.status || null,
                    email_status: requestedLead.delivery.email?.status || null,
                  }
                : null,
            }
          : null,
        ts: new Date().toISOString(),
        note: "Operational counters only. No PII. Warmbly auto-send is not controlled here.",
      },
      origin
    );
  }

  if (action === "audit_inbound_requeue" && event.httpMethod === "GET") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const leads = await listLeads(store);
    return json(
      200,
      {
        ok: true,
        audit: auditSkippedHandoffs(leads),
        ts: new Date().toISOString(),
        note: "Aggregate-only SKIPPED audit. No IDs, PII, or secret values.",
      },
      origin
    );
  }

  if (action === "requeue_inbound" && event.httpMethod === "POST") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const body = parseBody(event);
    if (!body) return json(400, { ok: false, error: "invalid_json" }, origin);
    if (body.mode !== "eligible_only") {
      return json(400, { ok: false, error: "eligible_only_mode_required" }, origin);
    }
    if (typeof body.dry_run !== "boolean") {
      return json(400, { ok: false, error: "explicit_dry_run_required" }, origin);
    }
    if (body.dry_run) {
      const result = await requeueEligibleHandoffs(store, { dryRun: true });
      return json(200, result, origin);
    }
    const backlogDecision = loadInboundBacklogDecision();
    const backlogExecutionAuthority = loadInboundBacklogExecutionAuthority();
    const limit = Number(body.limit);
    const replayNow = new Date();
    const policyAuthorization = authorizeInboundBacklogReplay(
      backlogDecision,
      backlogExecutionAuthority,
      {
        approvalReference: String(body.approval_reference || "").trim(),
        limit,
        now: replayNow,
      }
    );
    if (!policyAuthorization.ok) {
      safeLog("warn", "ops_requeue_inbound_policy_abort", {
        decision_state: backlogDecision?.decision_state || "MISSING",
        reason: policyAuthorization.reason,
      });
      return json(409, {
        ok: false,
        error: "backlog_policy_blocked",
        decision_state: backlogDecision?.decision_state || "MISSING",
        reason: policyAuthorization.reason,
      }, origin);
    }
    const gate = await probeInboundDestinationHealth({ env: process.env });
    if (!gate.ok) {
      safeLog("warn", "ops_requeue_inbound_global_abort", {
        contract: gate.contract,
        auto_send_off: gate.auto_send_off,
        status: gate.status,
        reason: gate.reason,
      });
      return json(409, { ok: false, error: "global_safety_gate_blocked", gate }, origin);
    }
    const result = await requeueEligibleHandoffs(store, {
      dryRun: false,
      limit,
      now: replayNow,
      safetyGate: gate,
      backlogDecision,
      backlogExecutionAuthority,
      approvalReference: policyAuthorization.approval_reference,
    });
    safeLog("info", "ops_requeue_inbound", {
      eligible: result.eligible_count,
      selected: result.selected_count,
      requeued: result.requeued_count,
    });
    return json(200, { ...result, gate }, origin);
  }

  if (action === "drain_inbound" && event.httpMethod === "POST") {
    if (!store) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const body = parseBody(event) || {};
    const limit = Math.min(50, Math.max(1, Number(body.limit || 20)));
    const backlogDecision = loadInboundBacklogDecision();
    const backlogExecutionAuthority = loadInboundBacklogExecutionAuthority();
    const backlogPolicyErrors = validateInboundBacklogDecision(backlogDecision);
    const backlogSafetyGate = backlogPolicyErrors.length || !backlogExecutionAuthority
      ? null
      : await probeInboundDestinationHealth({ env: process.env });
    const result = await drainPendingHandoffs(store, {
      limit,
      backlogDecision,
      backlogExecutionAuthority,
      backlogSafetyGate,
    });
    safeLog("info", "ops_drain_inbound", {
      attempted: result.attempted,
      delivered: result.delivered,
      retryable: result.retryable,
      dead: result.dead,
      aborted: result.aborted,
      abort_reason: result.abort_reason,
      backlog_attempted: result.backlog_attempted,
      backlog_policy_blocked: result.backlog_policy_blocked,
    });
    return json(200, { ok: true, ...result }, origin);
  }

  if (action === "search_observation" && event.httpMethod === "GET") {
    const obsStore = await createObservationStore(process.env, event);
    if (!obsStore) return json(503, { ok: false, error: "store_unavailable" }, origin);
    const records = typeof obsStore.list === "function" ? await obsStore.list() : [];
    const counters = summarizeObservations(records);
    return json(
      200,
      {
        ok: true,
        counters,
        ts: new Date().toISOString(),
        note: "Window/cohort aggregates only. No query text. HELD means Warmbly omitted confenge.search_observation.v1; records are persisted.",
      },
      origin
    );
  }

  if (action === "produce_search_observation" && event.httpMethod === "POST") {
    const result = await produceFromShippedOverlay({ env: process.env, event });
    if (!result.ok) {
      const code = result.error === "store_unavailable" ? 503 : 422;
      return json(code, { ok: false, error: result.error, field: result.field }, origin);
    }
    const outbox = (result.record && result.record.outbox) || {};
    safeLog("info", "ops_produce_search_observation", {
      replay: Boolean(result.replay),
      status: outbox.status || null,
      synthetic: Boolean(result.synthetic),
    });
    return json(
      200,
      {
        ok: true,
        replay: Boolean(result.replay),
        synthetic: Boolean(result.synthetic),
        status: outbox.status || null,
        reason: outbox.reason || outbox.last_error || null,
      },
      origin
    );
  }

  if (action === "drain_search_observation" && event.httpMethod === "POST") {
    const body = parseBody(event) || {};
    const limit = Math.min(50, Math.max(1, Number(body.limit || 20)));
    const result = await drainHeld({ env: process.env, event, limit });
    if (!result.ok) {
      return json(result.error === "store_unavailable" ? 503 : 422, { ok: false, ...result }, origin);
    }
    safeLog("info", "ops_drain_search_observation", {
      attempted: result.attempted,
      delivered: result.delivered,
      held: result.held,
      retryable: result.retryable,
    });
    return json(200, { ok: true, ...result }, origin);
  }

  // prevent unused import lint in some bundlers
  void deliverResendEmail;
  void isCommercialReal;

  return json(404, { ok: false, error: "unknown_action", action }, origin);
};

// test helpers
exports._authOk = authOk;
exports._listLeads = listLeads;
exports._sanitizeGscForOps = sanitizeGscForOps;
exports._validateGscInsights = validateGscInsights;
