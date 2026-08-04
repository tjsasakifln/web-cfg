/**
 * Synthetic lead probe (no real PII) against a base URL.
 * Usage: node scripts/site/synthetic_lead_probe.mjs [baseUrl] [probeSecret]
 * Exit 0 only on HTTP 201 + lead_id + no secret leak in body.
 *
 * Always multi-signal synthetic so commercial funnels exclude this record.
 */
const base = (process.argv[2] || "https://confenge.com.br").replace(/\/$/, "");
const probeSecret = process.argv[3] || process.env.LEAD_PROBE_SECRET || "";

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
};

const headers = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: base.includes("127.0.0.1") ? base : "https://confenge.com.br",
  // Unique technical fingerprint per run so rate-limit buckets do not collide with E2E
  "User-Agent": `confenge-synthetic-probe/1.0 (${Date.now()}-${Math.random().toString(36).slice(2, 8)})`,
  "X-Forwarded-For": `198.51.100.${1 + Math.floor(Math.random() * 200)}`,
  "X-Confenge-Probe": probeSecret || "1",
};
if (probeSecret) headers["X-Confenge-Probe"] = probeSecret;

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

const leaks = ["topic", "ntfy", "formsubmit", "delivery", "upstream", "confenge-prod-leads"].filter(
  (k) => text.toLowerCase().includes(k),
);

const ok =
  (res.status === 201 || res.status === 200) &&
  data.ok === true &&
  Boolean(data.lead_id || data.receipt_id) &&
  leaks.length === 0;

const out = {
  ok,
  http: res.status,
  lead_id: data.lead_id || data.receipt_id || null,
  status: data.status || null,
  record_kind_expected: "synthetic",
  leaks,
  base,
  ts: new Date().toISOString(),
};
console.log(JSON.stringify(out));
if (!ok) process.exit(1);
