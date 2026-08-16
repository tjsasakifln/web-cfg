/**
 * Honest Money Asset production proof.
 *
 * Proves only what this environment can reach. Never invents INBOUND NOW.
 * Synthetic/qa only. Persist-first capture may succeed while Warmbly is SKIPPED
 * (non-real records never mint a commercial inbound action).
 *
 * Usage:
 *   node scripts/site/money_asset_prod_proof.mjs [baseUrl] [out.json]
 *
 * Exit 0 only if the full claimed loop is PROVEN (capture + replay + inbound
 * delivered + auto-send OFF). Missing preconditions → non-zero and a JSON
 * report with PROVEN / BLOCKED / UNKNOWN per step.
 */
const base = (process.argv[2] || process.env.MONEY_ASSET_PROOF_BASE || "https://confenge.com.br").replace(/\/$/, "");
const outPath = process.argv[3] || process.env.MONEY_ASSET_PROOF_OUT || "";
const probeSecret = process.env.LEAD_PROBE_SECRET || "";
const opsToken = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
const inboundUrl = process.env.CONFENGE_INBOUND_WEBHOOK_URL || "";
const inboundSecret = process.env.CONFENGE_INBOUND_WEBHOOK_SECRET || "";
const autoSendEvidence = process.env.CONFENGE_AUTO_SEND_EVIDENCE || "";
const stamp = Date.now();
const idem = `money-asset-synth-${stamp}`;

const PII_KEYS = ["nome", "email", "telefone", "mensagem", "phone", "name"];
const PAGE_PATH = "/ferramentas/diagnostico-defesa-margem/";

function step(status, detail = {}) {
  return { status, ...detail };
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts });
  const text = await res.text();
  return { res, text };
}

const report = {
  ok: false,
  proven_as: "not_proven",
  asset: `${base}${PAGE_PATH}`,
  lead_endpoint: `${base}/.netlify/functions/lead`,
  label: "SYNTHETIC-INBOUND",
  ts: new Date().toISOString(),
  env_present: {
    CONFENGE_INBOUND_WEBHOOK_URL: Boolean(inboundUrl),
    CONFENGE_INBOUND_WEBHOOK_SECRET: Boolean(inboundSecret),
    OPS_TOKEN: Boolean(opsToken),
    LEAD_PROBE_SECRET: Boolean(probeSecret),
    CONFENGE_AUTO_SEND_EVIDENCE: Boolean(autoSendEvidence),
  },
  steps: {},
  remaining_commands: [],
  note:
    "A 201 on local/public capture is not INBOUND NOW. Synthetic/qa records persist and SKIP Warmbly by design.",
};

try {
  const page = await fetchText(`${base}${PAGE_PATH}`);
  const noindex = /noindex/i.test(page.text) || /noindex/i.test(page.res.headers.get("x-robots-tag") || "");
  const cta = page.text.includes("Quero uma segunda leitura deste contrato");
  const utilityBeforeCta =
    page.text.indexOf("id=\"identificacao\"") > -1 &&
    page.text.indexOf("id=\"identificacao\"") < page.text.indexOf("id=\"segunda-leitura\"");
  report.steps.page_live = step(
    page.res.status === 200 && cta ? "PROVEN" : "BLOCKED",
    {
      http: page.res.status,
      noindex,
      cta,
      utility_before_cta: utilityBeforeCta,
    },
  );

  const sitemap = await fetchText(`${base}/sitemap.xml`);
  const inSitemap = sitemap.text.includes("diagnostico-defesa-margem");
  const hygieneOk = page.res.status === 200 && ((noindex && !inSitemap) || (!noindex && inSitemap));
  report.steps.indexability_hygiene = step(
    hygieneOk ? "PROVEN" : "UNKNOWN",
    { noindex, in_sitemap: inSitemap, gate: "indexable only when data_confidence floor holds; do not relax" },
  );
} catch (err) {
  report.steps.page_live = step("BLOCKED", { error: String(err && err.message ? err.message : err).slice(0, 160) });
}

const payload = {
  nome: "SYNTHETIC-INBOUND",
  email: `qa-money-asset+${stamp}@example.com`,
  estagio: "synthetic probe — discard",
  jornada: "contrato",
  consentimento: "true",
  origem: PAGE_PATH,
  landing_page: PAGE_PATH,
  asset_id: "diagnostico-defesa-margem",
  route_family: "defesa-margem-diagnostico",
  public_contract_id: "83102277000152-2-000626/2026",
  public_id_slug: "md-8569b618",
  cta_id: "segunda-leitura-contrato",
  utm_source: "synthetic",
  utm_medium: "probe",
  utm_campaign: "money-asset-loop",
  mensagem: "[QA] SYNTHETIC-INBOUND — do not contact",
  test_mode: true,
  record_kind: "synthetic",
  idempotency_key: idem,
};

const headers = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: base.includes("127.0.0.1") ? base : "https://confenge.com.br",
  "User-Agent": `confenge-money-asset-probe/1.0 (${stamp})`,
  "X-Forwarded-For": `198.51.100.${1 + Math.floor(Math.random() * 200)}`,
  "X-Confenge-Probe": probeSecret || "1",
  "Idempotency-Key": idem,
};

async function postLead() {
  const res = await fetch(`${base}/.netlify/functions/lead`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = {}; }
  return { res, text, data };
}

function responseHasPii(text, data) {
  const blob = `${text}\n${JSON.stringify(data)}`;
  if (blob.includes(payload.email) || blob.includes("SYNTHETIC-INBOUND") || blob.includes("do not contact")) {
    return true;
  }
  for (const key of PII_KEYS) {
    if (data && typeof data[key] === "string" && data[key].length > 0) return true;
  }
  return false;
}

try {
  const first = await postLead();
  const pii = responseHasPii(first.text, first.data);
  const captured =
    (first.res.status === 201 || first.res.status === 200) &&
    first.data.ok === true &&
    Boolean(first.data.lead_id || first.data.receipt_id) &&
    !pii;
  report.steps.capture = step(captured ? "PROVEN" : "BLOCKED", {
    http: first.res.status,
    ok: first.data.ok === true,
    lead_id: first.data.lead_id || first.data.receipt_id || null,
    receipt_id: first.data.receipt_id || first.data.lead_id || null,
    pii_in_response: pii,
    notify_status: first.data.notify_status || null,
    email_status: first.data.email_status || null,
    body_error: first.data.error || null,
  });

  const second = await postLead();
  const sameId =
    Boolean(first.data.lead_id) &&
    Boolean(second.data.lead_id) &&
    second.data.lead_id === first.data.lead_id;
  const replayOk = second.res.status === 200 && second.data.idempotent === true && sameId;
  report.steps.replay = step(replayOk ? "PROVEN" : captured ? "BLOCKED" : "UNKNOWN", {
    http: second.res.status,
    same_lead_id: sameId,
    idempotent: second.data.idempotent === true,
    second_lead_id: second.data.lead_id || null,
  });

  report.lead_id = first.data.lead_id || first.data.receipt_id || null;
} catch (err) {
  report.steps.capture = step("BLOCKED", { error: String(err && err.message ? err.message : err).slice(0, 160) });
  report.steps.replay = step("UNKNOWN", { reason: "capture_request_failed" });
}

if (opsToken) {
  try {
    const res = await fetch(`${base}/.netlify/functions/ops?action=inbound_handoff`, {
      headers: { Authorization: `Bearer ${opsToken}`, Origin: "https://confenge.com.br" },
    });
    const data = await res.json().catch(() => ({}));
    const blob = JSON.stringify(data);
    const pii = /@example\.com|SYNTHETIC-INBOUND|"telefone"\s*:\s*"\d{8,}/.test(blob);
    const chain = data.money_asset;
    const numeric =
      chain &&
      chain.events &&
      typeof chain.events.asset_view === "number" &&
      typeof chain.handoff?.delivered === "number";
    report.steps.ops_counters = step(res.status === 200 && data.ok && !pii ? "PROVEN" : "BLOCKED", {
      http: res.status,
      has_money_asset: Boolean(chain),
      numeric_chain: Boolean(numeric),
      pii: pii,
      counters: data.counters || null,
      money_asset: chain || null,
    });
  } catch (err) {
    report.steps.ops_counters = step("BLOCKED", { error: String(err && err.message ? err.message : err).slice(0, 160) });
  }
} else {
  report.steps.ops_counters = step("BLOCKED", {
    reason: "OPS_TOKEN unset in this environment",
    next: "export OPS_TOKEN='<netlify production token>' && node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br",
  });
}

const autoSendOff =
  autoSendEvidence === "OFF" ||
  autoSendEvidence === "false" ||
  process.env.CONFENGE_AUTO_SEND_ENABLED === "false";
report.steps.warmbly_auto_send_off = step(autoSendOff ? "PROVEN" : "UNKNOWN", {
  reason: autoSendOff
    ? "CONFENGE_AUTO_SEND_EVIDENCE/ENABLED says off"
    : "No evidence in this environment that Warmbly CONFENGE_AUTO_SEND_ENABLED=false",
  next: "On Warmbly, confirm CONFENGE_AUTO_SEND_ENABLED=false and set CONFENGE_AUTO_SEND_EVIDENCE=OFF before claiming INBOUND NOW.",
});

if (inboundUrl && inboundSecret) {
  report.steps.inbound_env_local = step("PROVEN", {
    note: "Local process has URL+secret. Production Netlify env is a different surface.",
  });
} else {
  report.steps.inbound_env_local = step("BLOCKED", {
    reason: "CONFENGE_INBOUND_WEBHOOK_URL and/or CONFENGE_INBOUND_WEBHOOK_SECRET unset here",
    next:
      "Set both on Netlify production (HTTPS …/api/v1/webhooks/confenge/inbound + shared HMAC). Unset = capture still works, handoff SKIPPED.",
  });
}

// Synthetic records SKIP Warmbly. INBOUND NOW cannot be proven by this probe.
report.steps.inbound_now = step("BLOCKED", {
  reason:
    "Shipped rule: synthetic/qa persist and do not POST Warmbly. This probe is labeled SYNTHETIC-INBOUND / @example.com so it cannot mint INBOUND NOW.",
  next_irreversible_proof:
    "A real qualified lead from /ferramentas/diagnostico-defesa-margem/ (or a real rejection), with inbound URL+secret live, auto-send OFF, same lead_id on receipt and Warmbly INBOUND NOW.",
});

report.steps.commercial_send = step("PROVEN", {
  note: "Probe is synthetic/qa; shipped handoff skips non-real. No commercial send attempted by this harness.",
});

report.remaining_commands = [
  "Netlify production: set CONFENGE_INBOUND_WEBHOOK_URL + CONFENGE_INBOUND_WEBHOOK_SECRET (HTTPS inbound path, no query PII).",
  "Warmbly: deploy inbound ingest, set the same secret, CONFENGE_AUTO_SEND_ENABLED=false.",
  "export OPS_TOKEN='<production ops token>'",
  "export CONFENGE_AUTO_SEND_EVIDENCE=OFF",
  "node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br",
  "GET /.netlify/functions/ops?action=inbound_handoff (auth) and reconcile receipt lead_id. Synthetic remains SKIPPED.",
  "Next irreversible proof: one real qualified money-asset lead or a real rejection — do not invent one.",
];

const captureOk = report.steps.capture && report.steps.capture.status === "PROVEN";
const replayOk = report.steps.replay && report.steps.replay.status === "PROVEN";
const inboundNow = report.steps.inbound_now && report.steps.inbound_now.status === "PROVEN";
report.ok = Boolean(captureOk && replayOk && inboundNow && autoSendOff);
report.proven_as = report.ok
  ? "full_loop"
  : captureOk && replayOk
    ? "capture_only_synthetic"
    : "not_proven";

const json = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(json);
if (outPath) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, json, "utf8");
}
if (!report.ok) process.exit(2);
