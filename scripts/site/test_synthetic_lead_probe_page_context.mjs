/**
 * A06-RECEBIMENTO-08 (campanha BOFU-FECHAMENTO-20260919): a sonda sintética
 * com PROBE_PAGE_PATH lê o <form> servido e:
 *   1. bloqueia ANTES do POST quando o contexto passado por env difere dos
 *      atributos data-asset-id/data-cta-id/data-route-family do formulário
 *      (nenhum registro sintético é criado com contexto que não é o publicado);
 *   2. com contexto igual ao servido, posta e exige que o registro persistido
 *      carregue asset_id/route_family/cta_id iguais ao formulário servido
 *      (served_form_context_persisted); um servidor que persiste sem o
 *      contexto reprova (TRANSPORT_PROOF_FAILED).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

const probePath = fileURLToPath(new URL("./synthetic_lead_probe.mjs", import.meta.url));
const receiptId = "synthetic:fixture:receipt:0002";

const servedPage = `<!doctype html><html><body>
<section id="captura-pilar">
<form class="pillar-capture-form" name="diagnostico-confenge" method="post" action="/.netlify/functions/lead" data-offer-id="" data-cta-id="medicoes-glosas-obras-publicas-handraise" data-asset-id="medicoes-glosas-obras-publicas" data-route-family="medicoes-glosas" data-cta-position="pillar_capture">
<input type="hidden" name="jornada" value="contrato">
<input type="hidden" name="estagio" value="medicoes-glosas-obras-publicas">
<input type="hidden" name="origem" value="medicoes-glosas-obras-publicas">
<input type="hidden" name="asset_id" value="medicoes-glosas-obras-publicas">
<input type="hidden" name="cta_id" value="medicoes-glosas-obras-publicas-handraise">
<input type="hidden" name="route_family" value="medicoes-glosas">
<label>Nome<input name="nome"></label>
</form></section></body></html>`;

const zeroCounts = {
  visitor: 0, cta_triggered: 0, form_started: 0, lead_persisted: 0, contacted: 0,
  qualified: 0, meeting: 0, proposal: 0, won: 0, lost: 0,
};

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// scenario.persistContext: whether the fake store keeps asset/cta/route_family.
let scenario = { persistContext: true };
let created = false;
let postCount = 0;
let persisted = {};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/medicoes-glosas-obras-publicas/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(servedPage);
    return;
  }
  if (url.pathname === "/.well-known/build-info.json") {
    send(res, 200, { commit: "a".repeat(40) });
    return;
  }
  if (url.pathname === "/.netlify/functions/ops") {
    const action = url.searchParams.get("action");
    if (action === "funnel") {
      send(res, 200, { ok: true, commercial_only: true, funnel: { counts: zeroCounts, pipeline_value: 0, revenue: 0 } });
      return;
    }
    if (action === "system_health") {
      send(res, 200, { ok: true, counts_by_kind: { synthetic: created ? 6 : 5 } });
      return;
    }
    if (action === "weekly_report") {
      send(res, 200, { ok: true, commercial_only: true, leads_total: 0, leads_new_7d: 0, leads_excluded_non_real: created ? 6 : 5, system_health: { pipeline_real: 0, revenue_real: 0 } });
      return;
    }
    if (action === "inbound_handoff") {
      const requested = url.searchParams.get("lead_id");
      send(res, 200, {
        ok: true,
        configuration: { contract: "READY", destination_fingerprint: "WARMBLY_PRODUCTION_V1" },
        safety_gate: { ok: true, contract: "READY", auto_send_off: true, dispatch_attempted: false },
        receipt: created && requested === receiptId ? {
          lead_id: receiptId,
          record_kind: "synthetic",
          authenticated_probe: true,
          source: "CONFENGE_WEB",
          next_action: "exclude_from_commercial",
          ...(scenario.persistContext ? persisted : {}),
          handoff: { status: "DELIVERED", attempts: 1, downstream: { http: 201, duplicate: false, downstream_receipt: receiptId } },
        } : null,
      });
      return;
    }
  }
  if (url.pathname === "/.netlify/functions/lead" && req.method === "POST") {
    postCount += 1;
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      let body = {};
      try { body = JSON.parse(raw); } catch { body = {}; }
      if (!created) {
        created = true;
        persisted = { asset_id: body.asset_id, cta_id: body.cta_id, route_family: body.route_family };
        send(res, 201, { ok: true, lead_id: receiptId, status: "persisted", notify_status: "skipped", email_status: "skipped" });
      } else {
        send(res, 200, { ok: true, lead_id: receiptId, idempotent: true, notify_status: "skipped", email_status: "skipped" });
      }
    });
    return;
  }
  send(res, 404, { ok: false });
});

function runProbe(base, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [probePath, base], {
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
const auth = {
  LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters",
  OPS_TOKEN: "ops-fixture-token-at-least-16",
  EXPECTED_SHA: "a".repeat(40),
  PROBE_PAGE_PATH: "/medicoes-glosas-obras-publicas/",
  PROBE_ROUTE_FAMILY: "medicoes-glosas",
  PROBE_JORNADA: "contrato",
};

try {
  // 1) context typed into the environment differs from the served form → blocked before POST.
  const mismatch = await runProbe(base, {
    ...auth,
    PROBE_ASSET_ID: "entregas-exemplos-hub",
    PROBE_CTA_ID: "medicoes-glosas-obras-publicas-handraise",
  });
  assert.equal(mismatch.code, 1, mismatch.stdout || mismatch.stderr);
  const blocked = JSON.parse(mismatch.stdout);
  assert.equal(blocked.state, "BLOCKED_BEFORE_POST");
  assert.equal(blocked.reason, "page_context_differs_from_served_form");
  assert.deepEqual(blocked.mismatch, ["asset_id"]);
  assert.equal(postCount, 0, "a mismatching context must never reach the lead endpoint");
  console.log("PASS probe_page_context_mismatch_blocks_before_post", JSON.stringify(blocked.mismatch));

  // 2) matching context, store drops it → TRANSPORT_PROOF_FAILED on served_form_context_persisted.
  scenario = { persistContext: false };
  const dropped = await runProbe(base, {
    ...auth,
    PROBE_ASSET_ID: "medicoes-glosas-obras-publicas",
    PROBE_CTA_ID: "medicoes-glosas-obras-publicas-handraise",
  });
  assert.equal(dropped.code, 1, dropped.stdout || dropped.stderr);
  const droppedProof = JSON.parse(dropped.stdout);
  assert.equal(droppedProof.state, "TRANSPORT_PROOF_FAILED");
  assert.equal(droppedProof.checks.served_form_context_persisted, false);
  assert.equal(droppedProof.checks.page_context_persisted, false);
  assert.equal(postCount, 2);
  console.log("PASS probe_served_form_context_not_persisted_fails");

  // 3) matching context, store keeps it → TRANSPORT_READY and the served form is in the proof.
  scenario = { persistContext: true };
  created = false;
  postCount = 0;
  const ready = await runProbe(base, {
    ...auth,
    PROBE_ASSET_ID: "medicoes-glosas-obras-publicas",
    PROBE_CTA_ID: "medicoes-glosas-obras-publicas-handraise",
  });
  assert.equal(ready.code, 0, ready.stdout || ready.stderr);
  const proof = JSON.parse(ready.stdout);
  assert.equal(proof.state, "TRANSPORT_READY");
  assert.equal(proof.checks.served_form_context_persisted, true);
  assert.equal(proof.page_path, "/medicoes-glosas-obras-publicas/");
  assert.deepEqual(proof.served_form, {
    asset_id: "medicoes-glosas-obras-publicas",
    cta_id: "medicoes-glosas-obras-publicas-handraise",
    route_family: "medicoes-glosas",
    jornada: "contrato",
    estagio: "medicoes-glosas-obras-publicas",
    origem: "medicoes-glosas-obras-publicas",
  });
  assert.deepEqual(proof.persisted_context, {
    asset_id: "medicoes-glosas-obras-publicas",
    route_family: "medicoes-glosas",
    cta_id: "medicoes-glosas-obras-publicas-handraise",
  });
  assert.equal(ready.stdout.includes(receiptId), false, "raw receipt must not be emitted");
  console.log("PASS probe_served_form_context_persisted_ready");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
