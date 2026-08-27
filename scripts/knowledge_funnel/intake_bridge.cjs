#!/usr/bin/env node
/**
 * Drive shipped conversion intake / X-Ray / minimize. Not a reimplementation.
 * Usage: node scripts/knowledge_funnel/intake_bridge.cjs --in REQ.json --out OUT.json
 */
const fs = require("fs");
const path = require("path");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] || fallback;
}

const root = path.join(__dirname, "../..");
const intake = require(path.join(root, "scripts/conversion/intake-core.cjs"));
const xray = require(path.join(root, "scripts/conversion/xray.cjs"));
const minimize = require(path.join(root, "scripts/conversion/minimize.cjs"));
const persistOrder = require(path.join(root, "scripts/conversion/persist-order.cjs"));
const { MemoryStore, FileStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.LEAD_ALLOW_MEMORY_FALLBACK = process.env.LEAD_ALLOW_MEMORY_FALLBACK || "1";

const reqPath = arg("in");
if (!reqPath) {
  process.stderr.write("intake_bridge requires --in REQ.json\n");
  process.exit(2);
}
const req = JSON.parse(fs.readFileSync(reqPath, "utf8"));
const storeDir = req.store_dir || "";
const store = storeDir ? new FileStore(storeDir) : new MemoryStore();
const now = req.now ? new Date(req.now) : new Date("2026-08-16T12:00:00.000Z");
const env = {
  ...process.env,
  NODE_ENV: "test",
  CONVERSION_CANARY: "1",
  CONFENGE_INBOUND_WEBHOOK_URL:
    req.webhook_url || "http://127.0.0.1:9/api/v1/webhooks/confenge/inbound",
  CONFENGE_INBOUND_WEBHOOK_SECRET: req.webhook_secret || "kf-web002-fixture-secret",
};

function fetchFor(mode) {
  if (mode === "timeout") {
    return async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    };
  }
  if (mode === "unavailable") {
    return async () => {
      const err = new Error("connect ECONNREFUSED 127.0.0.1:9");
      err.code = "ECONNREFUSED";
      throw err;
    };
  }
  return async (_url, init = {}) => {
    let payload = {};
    try {
      payload = JSON.parse(init.body || "{}");
    } catch (_) {
      // The shipped adapter must reject a malformed fixture response below.
    }
    return {
      status: 201,
      json: async () => ({
        ok: true,
        data: {
          receipt_id: payload.receipt_id || payload.lead_id || null,
          action: { id: "act-fixture" },
        },
      }),
    };
  };
}

function semanticTrace(trace) {
  const steps = ((trace && trace.steps) || []).map((step) => ({
    step: step.step,
    status: step.status || null,
    reason: step.reason || null,
    error: step.error || null,
    commercial: step.commercial,
    receipt_id: step.receipt_id || null,
    lead_id: step.lead_id || null,
    state: step.state || null,
    catalog_mode: step.catalog_mode || null,
    field: step.field || null,
    kind: step.kind || null,
    stage: step.stage || null,
  }));
  return {
    steps,
    persist_before_handoff: persistOrder.persistBeforeHandoff(trace),
  };
}

function summarize(result, kind) {
  const body = result.body || {};
  const receipt = result.receipt || null;
  return {
    kind,
    status_code: result.statusCode,
    ok: Boolean(body.ok),
    error: body.error || null,
    persisted: Boolean(result.persisted),
    idempotent: Boolean(body.idempotent),
    receipt_id: body.receipt_id || body.lead_id || (receipt && (receipt.receipt_id || receipt.lead_id)) || null,
    correlation_id: body.correlation_id || (receipt && receipt.correlation_id) || null,
    source: receipt && receipt.source ? receipt.source : null,
    auto_send: body.auto_send === false ? false : body.auto_send || false,
    sla: body.sla || "UNKNOWN",
    consent_state: body.consent_state || (receipt && receipt.consent_state) || null,
    handoff_status: body.handoff_status || (receipt && receipt.handoff && receipt.handoff.status) || null,
    persist_before_handoff:
      body.persist_before_handoff === true ||
      body.trace_persist_before_handoff === true ||
      persistOrder.persistBeforeHandoff(result.trace),
    xray_state: body.xray && body.xray.state ? body.xray.state : receipt && receipt.xray_state ? receipt.xray_state : null,
    claimed_live: body.xray && body.xray.claimed_live === true,
    catalog_mode: body.xray && body.xray.catalog_mode ? body.xray.catalog_mode : "fixture",
    limitations: (body.xray && body.xray.limitations) || [],
    public_url: body.public_url || null,
    analytics: result.analytics || null,
    trace: semanticTrace(result.trace),
  };
}

(async () => {
  const fetchFn = fetchFor(req.handoff || "ok");
  const attr = req.attribution || {};
  const cnpj = req.cnpj;
  const correlation_id = req.correlation_id;
  const out = {
    schema: "knowledge-funnel-intake-bridge/1.0",
    claimed_live: false,
    official_live: false,
    source: "CONFENGE_WEB",
  };

  const factual = xray.requestFactualPayload({
    cnpj,
    fixture_state: req.xray_state,
  });
  out.factual = {
    state: factual.state,
    ok: factual.ok,
    labeled_non_live: xray.isLabeledNonLive(factual.payload),
    claimed_live: Boolean(factual.payload && factual.payload.claimed_live),
    catalog_mode: factual.payload && factual.payload.catalog_mode,
    limitations: (factual.payload && factual.payload.limitations) || [],
    sla: "UNKNOWN",
  };
  if (req.mutate === "fixture_as_live") {
    const poisoned = JSON.parse(JSON.stringify(factual.payload || {}));
    poisoned.claimed_live = true;
    out.factual.poisoned_labeled_non_live = xray.isLabeledNonLive(poisoned);
    out.factual.poisoned_claimed_live = true;
  }

  const xrayBody = {
    action: "xray",
    cnpj,
    idempotency_key: req.xray_idempotency_key,
    correlation_id,
    fixture_state: req.xray_state,
    intent: "ver_propria_empresa",
    cta: req.cta || "Veja sua empresa neste mercado",
    cta_id: req.cta_id || "veja-sua-empresa-neste-mercado",
    market_answer_id: attr.market_answer_id || "ma-pavimentacao-valor-tipico-v0",
    asset_family: "market_answer",
    source: "CONFENGE_WEB",
    drill_down_origin: "answer_to_xray",
    ...attr,
  };

  const x1 = await intake.handleXrayRequest({
    store,
    body: xrayBody,
    env,
    fetchFn,
    now,
  });
  out.xray = summarize(x1, "xray");

  let x2 = null;
  if (req.replay) {
    x2 = await intake.handleXrayRequest({
      store,
      body: xrayBody,
      env,
      fetchFn,
      now,
    });
    out.xray_replay = summarize(x2, "xray_replay");
  }

  const handBody = {
    action: "handraise",
    cnpj,
    nome: req.nome || "QA Funnel",
    email: req.email || "qa-funnel@example.com",
    estagio: "segunda leitura de contrato",
    jornada: "contrato",
    consentimento: req.consent === true,
    idempotency_key: req.handraise_idempotency_key,
    correlation_id,
    intent: "revisar_contrato",
    question_class: "contract_review",
    cta: req.cta || "Veja sua empresa neste mercado",
    cta_id: req.cta_id || "veja-sua-empresa-neste-mercado",
    market_answer_id: attr.market_answer_id || "ma-pavimentacao-valor-tipico-v0",
    asset_family: "market_answer",
    source: "CONFENGE_WEB",
    drill_down_origin: "answer_to_analysis",
    ...attr,
  };

  const h1 = await intake.handleHandraise({
    store,
    body: handBody,
    env,
    fetchFn,
    now,
  });
  out.handraise = summarize(h1, "handraise");

  if (req.replay) {
    const h2 = await intake.handleHandraise({
      store,
      body: handBody,
      env,
      fetchFn: async () => {
        throw new Error("should_not_run_on_replay");
      },
      now,
    });
    out.handraise_replay = summarize(h2, "handraise_replay");
  }

  const listed = typeof store.list === "function" ? await store.list() : [];
  const ids = listed.map((row) => row.lead_id || row.receipt_id).filter(Boolean);
  const recoverable = [];
  for (const id of ids) {
    const got = store.get ? await store.get(id) : null;
    if (got && (got.lead_id || got.receipt_id)) {
      recoverable.push({
        id: got.lead_id || got.receipt_id,
        handoff_status: got.handoff && got.handoff.status,
        source: got.source || null,
        consent_state: got.consent_state || null,
      });
    }
  }
  out.store = {
    count: listed.length,
    ids: ids.slice().sort(),
    recoverable,
  };

  const publicUrl = minimize.publicUrlForJourney("/inteligencia/valor-tipico-contratos-pavimentacao/");
  const poisonedUrl = `${publicUrl}?cnpj=${cnpj}&email=${req.email || "qa-funnel@example.com"}`;
  const urlHits = minimize.findPiiNeedles(poisonedUrl, {
    cnpj,
    email: req.email || "qa-funnel@example.com",
  });
  const analytics = minimize.sanitizeAnalytics(
    "lead_receipt_correlated",
    {
      correlation_id,
      cnpj,
      email: req.email || "qa-funnel@example.com",
      nome: req.nome || "QA Funnel",
      telefone: req.telefone || "48999990000",
      source: "CONFENGE_WEB",
      asset_family: "market_answer",
    },
    { cnpj },
  );
  const eventHits = minimize.findPiiNeedles(analytics, {
    cnpj,
    email: req.email || "qa-funnel@example.com",
    nome: req.nome || "QA Funnel",
  });
  out.pii = {
    public_url: publicUrl,
    poisoned_url_hits: urlHits,
    analytics,
    analytics_hits: eventHits,
    public_url_has_query: publicUrl.includes("?"),
  };

  const dest = arg("out", "");
  const text = JSON.stringify(out, null, 2);
  if (dest) fs.writeFileSync(dest, `${text}\n`, "utf8");
  process.stdout.write(`${text}\n`);
})().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + "\n");
  process.exit(1);
});
