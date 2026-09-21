#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { createOpsJsonClient } from "./ops_fetch.mjs";

export async function runInboundDrain({
  base = process.env.BASE_URL || "https://confenge.com.br",
  token = process.env.OPS_TOKEN || "",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!token) throw new Error("OPS_TOKEN_required");
  const request = createOpsJsonClient({ base, token, fetchImpl, maxAttempts: 1 });
  const response = await request("/.netlify/functions/ops?action=drain_inbound", {
    method: "POST",
    body: JSON.stringify({ limit: 20 }),
  });
  const body = response.body || {};
  const reconcile = Number.isInteger(body.email_reconcile_required) &&
    body.email_reconcile_required >= 0
    ? body.email_reconcile_required
    : null;
  const retryable = Number.isInteger(body.retryable) && body.retryable >= 0 ? body.retryable : null;
  const blocked = Number.isInteger(body.blocked) && body.blocked >= 0 ? body.blocked : null;
  const dead = Number.isInteger(body.dead) && body.dead >= 0 ? body.dead : null;
  const emailRetryOk = body.email_retry?.ok === true;
  return {
    ok: response.status === 200
      && body.ok === true
      && body.aborted === false
      && emailRetryOk
      && reconcile === 0
      && retryable === 0
      && blocked === 0
      && dead === 0,
    status: response.status,
    attempted: Number(body.attempted || 0),
    delivered: Number(body.delivered || 0),
    retryable,
    blocked,
    dead,
    aborted: body.aborted === true,
    abort_reason: body.abort_reason || null,
    email_attempted: Number(body.email_attempted || 0),
    email_delivered: Number(body.email_delivered || 0),
    email_retry_ok: emailRetryOk,
    email_reconcile_required: reconcile,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runInboundDrain()
    .then((result) => {
      console.log(JSON.stringify(result));
      process.exit(result.ok ? 0 : 1);
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: String(error?.message || error).slice(0, 160) }));
      process.exit(1);
    });
}
