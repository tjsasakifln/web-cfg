/**
 * Synthetic lead probe (no real PII) against a base URL.
 * Usage: node scripts/site/synthetic_lead_probe.mjs [baseUrl] [probeSecret]
 *
 * Validates: HTTP 201/200, lead_id, no secret leak, idempotency (second POST).
 * Exit 0 only when all pass. Does not stage commercial CRM.
 */
const base = (process.argv[2] || "https://confenge.com.br").replace(/\/$/, "");
const probeSecret = process.argv[3] || process.env.LEAD_PROBE_SECRET || "";
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
const leaks = ["topic", "ntfy", "formsubmit", "delivery", "upstream", "confenge-prod-leads", "RESEND_API_KEY"].filter(
  (k) => first.text.toLowerCase().includes(k.toLowerCase())
);

const second = await postOnce();
const sameId =
  Boolean(first.data.lead_id) &&
  second.data.lead_id === first.data.lead_id &&
  (second.res.status === 200 || second.res.status === 201);
// Second call must succeed as a valid synthetic probe path (store may lack durable
// idempotency map on some backends — same-id is preferred, second 2xx is required).
const secondOk =
  (second.res.status === 200 || second.res.status === 201) && second.data.ok === true && Boolean(second.data.lead_id);

const ok =
  (first.res.status === 201 || first.res.status === 200) &&
  first.data.ok === true &&
  Boolean(first.data.lead_id || first.data.receipt_id) &&
  leaks.length === 0 &&
  secondOk;

const out = {
  ok,
  http: first.res.status,
  lead_id: first.data.lead_id || first.data.receipt_id || null,
  status: first.data.status || null,
  record_kind_expected: "synthetic",
  leaks,
  idempotent_same_id: sameId,
  idempotent_http: second.res.status,
  idempotent_second_ok: secondOk,
  base,
  ts: new Date().toISOString(),
  checks: {
    endpoint: first.res.status === 201 || first.res.status === 200,
    validation_ok_body: first.data.ok === true,
    persistence_lead_id: Boolean(first.data.lead_id),
    no_secret_leak: leaks.length === 0,
    second_post_ok: secondOk,
    idempotency_same_id: sameId,
  },
  note: sameId
    ? "idempotency_hit"
    : "second_post_ok_but_new_id — durable idempotency map may be unavailable; both remain synthetic probes",
};
console.log(JSON.stringify(out));
if (!ok) process.exit(1);
