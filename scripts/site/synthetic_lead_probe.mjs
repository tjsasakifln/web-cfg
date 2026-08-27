/**
 * Synthetic lead probe (no real PII) against a base URL.
 * Usage: node scripts/site/synthetic_lead_probe.mjs [baseUrl] [probeSecret]
 *
 * Requires: first POST 201/200 with lead_id; second POST same Idempotency-Key
 * returns HTTP 200 with identical lead_id and idempotent:true; no secret leak;
 * notify_status/email_status present. Exit non-zero if idempotency fails.
 */
const base = (process.argv[2] || "https://confenge.com.br").replace(/\/$/, "");
const probeSecret = process.argv[3] || process.env.LEAD_PROBE_SECRET || "";
const opsToken = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
const stamp = Date.now();
const idem = `synthetic-probe-${stamp}`;

const payload = {
  nome: "SYNTHETIC-PROBE",
  email: "probe@example.com",
  estagio: "synthetic probe — discard",
  jornada: "operacao",
  consentimento: "true",
  origem: "/synthetic-probe",
  utm_source: "synthetic",
  utm_medium: "probe",
  utm_campaign: "slo",
  landing_page: "/",
  mensagem: "[QA] synthetic probe — do not contact",
  test_mode: true,
  record_kind: "synthetic",
  idempotency_key: idem,
};

const headers = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: base.includes("127.0.0.1") ? base : "https://confenge.com.br",
  "User-Agent": `confenge-synthetic-probe/1.0 (${stamp}-${Math.random().toString(36).slice(2, 8)})`,
  "X-Forwarded-For": `198.51.100.${1 + Math.floor(Math.random() * 200)}`,
  "X-Confenge-Probe": probeSecret || "1",
  "Idempotency-Key": idem,
};

async function postOnce() {
  const res = await fetch(`${base}/.netlify/functions/lead`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }
  return { res, text, data };
}

const first = await postOnce();
const leaks = ["topic", "ntfy", "formsubmit", "upstream", "confenge-prod-leads", "RESEND_API_KEY"].filter(
  (k) => first.text.toLowerCase().includes(k.toLowerCase())
);

const second = await postOnce();
const sameId =
  Boolean(first.data.lead_id) &&
  Boolean(second.data.lead_id) &&
  second.data.lead_id === first.data.lead_id;
// Contract: replay is HTTP 200 with idempotent:true (not a second create/201)
const secondIsIdempotent =
  second.res.status === 200 &&
  second.data.idempotent === true &&
  sameId;
const no5xx = first.res.status < 500 && second.res.status < 500;

const allowedSt = /^(ok|pending|skipped|error)$/;
const deliveryOk =
  allowedSt.test(String(first.data.notify_status || "")) &&
  allowedSt.test(String(first.data.email_status || ""));

let ops = null;
if (opsToken && first.data.lead_id) {
  const response = await fetch(
    `${base}/.netlify/functions/ops?action=inbound_handoff&lead_id=${encodeURIComponent(first.data.lead_id)}`,
    { headers: { Authorization: `Bearer ${opsToken}`, Accept: "application/json" } },
  );
  const data = await response.json().catch(() => ({}));
  ops = { http: response.status, data };
}
const opsReceipt = ops && ops.data && ops.data.receipt;
const opsContractOk = !opsToken || Boolean(
  ops && ops.http === 200 && ops.data.ok === true &&
  ops.data.configuration?.contract === "READY" &&
  ops.data.configuration?.destination_fingerprint === "WARMBLY_PRODUCTION_V1" &&
  opsReceipt?.lead_id === first.data.lead_id &&
  opsReceipt?.record_kind === "synthetic" &&
  opsReceipt?.source === "CONFENGE_WEB" &&
  opsReceipt?.handoff?.status === "DELIVERED" &&
  opsReceipt?.handoff?.attempts === 1 &&
  opsReceipt?.handoff?.downstream?.downstream_receipt === first.data.lead_id &&
  !opsReceipt?.handoff?.downstream?.action_id
);

const ok =
  (first.res.status === 201 || first.res.status === 200) &&
  first.data.ok === true &&
  Boolean(first.data.lead_id || first.data.receipt_id) &&
  leaks.length === 0 &&
  secondIsIdempotent &&
  no5xx &&
  deliveryOk &&
  opsContractOk;

const out = {
  ok,
  http: first.res.status,
  lead_id: first.data.lead_id || first.data.receipt_id || null,
  status: first.data.status || null,
  record_kind_expected: "synthetic",
  leaks,
  idempotent_same_id: sameId,
  idempotent_http: second.res.status,
  second_lead_id: second.data.lead_id || null,
  second_idempotent_flag: second.data.idempotent === true,
  notify_status: first.data.notify_status || null,
  email_status: first.data.email_status || null,
  inbound: ops ? {
    http: ops.http,
    contract: ops.data.configuration?.contract || null,
    destination_fingerprint: ops.data.configuration?.destination_fingerprint || null,
    record_kind: opsReceipt?.record_kind || null,
    source: opsReceipt?.source || null,
    handoff_status: opsReceipt?.handoff?.status || null,
    handoff_attempts: opsReceipt?.handoff?.attempts ?? null,
    downstream_receipt_matches: opsReceipt?.handoff?.downstream?.downstream_receipt === first.data.lead_id,
    downstream_action_absent: !opsReceipt?.handoff?.downstream?.action_id,
  } : { status: "OPS_TOKEN_NOT_PROVIDED" },
  base,
  ts: new Date().toISOString(),
  checks: {
    endpoint: first.res.status === 201 || first.res.status === 200,
    validation_ok_body: first.data.ok === true,
    persistence_lead_id: Boolean(first.data.lead_id),
    no_secret_leak: leaks.length === 0,
    idempotency_same_id: sameId,
    second_post_http_200: second.res.status === 200,
    second_post_idempotent_true: second.data.idempotent === true,
    no_http_5xx: no5xx,
    delivery_status_present: deliveryOk,
    ops_receipt_contract: opsContractOk,
  },
};
console.log(JSON.stringify(out));
if (!ok) process.exit(1);
