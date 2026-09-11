/**
 * Campaign 10-facing Netcup proof gate.
 *
 * Default: consult-only. Never POSTs a lead from campaign 01.
 * Production mutation is reserved to campaign 10 after proven preconditions.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
const require = createRequire(import.meta.url);
const inbound = require(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"));

function redacted(value) {
  if (value == null) return value;
  const text = String(value);
  if (/token|secret|bearer|authorization/i.test(text)) return "[redacted]";
  if (/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) return "[redacted-email]";
  if (/\+?\d{10,}/.test(text)) return "[redacted-phone]";
  return text;
}

export function evaluateSafety(snapshot) {
  const cfg = snapshot && snapshot.configuration ? snapshot.configuration : {};
  const safety = snapshot && snapshot.safety_gate ? snapshot.safety_gate : {};
  const blockers = [];
  if (cfg.contract !== "READY") blockers.push("contract_not_ready");
  if (cfg.destination_fingerprint !== "WARMBLY_PRODUCTION_V1") {
    blockers.push("destination_fingerprint_not_canonical");
  }
  if (safety.ok !== true) blockers.push("safety_gate_not_ok");
  if (safety.contract !== "READY") blockers.push("safety_contract_not_ready");
  if (safety.auto_send_off !== true) blockers.push("auto_send_not_proven_off");
  if (safety.dispatch_attempted !== false) blockers.push("dispatch_attempted_not_false");
  if (!snapshot || snapshot.ok !== true) blockers.push("ops_snapshot_unreadable");
  return { ok: blockers.length === 0, blockers };
}

export function commercialExclusionProven(before, after) {
  if (!before || !after) return { ok: false, reason: "commercial_totals_not_compared" };
  try {
    return { ok: JSON.stringify(before) === JSON.stringify(after), reason: "compared" };
  } catch {
    return { ok: false, reason: "commercial_totals_unreadable" };
  }
}

export function decide(input = {}) {
  const consult = input.consult || null;
  const execute = input.execute === true;
  const allow = input.allowProdPost === true;
  const identityIsolated = input.identityIsolated === true;
  const zeroCommercialAction = input.zeroCommercialAction === true;
  const zeroExternalDispatch = input.zeroExternalDispatch === true;
  const commercial = commercialExclusionProven(input.commercialBefore, input.commercialAfter);
  const safety = evaluateSafety(consult);
  const blockers = [];
  if (!consult) blockers.push("read_only_config_not_consulted");
  if (!safety.ok) blockers.push(...safety.blockers);
  if (!identityIsolated) blockers.push("test_identity_not_isolated");
  if (!zeroCommercialAction) blockers.push("commercial_action_not_proven_zero");
  if (!zeroExternalDispatch) blockers.push("external_dispatch_not_proven_zero");
  if (execute && !allow) blockers.push("execute_reserved_to_campaign_10");
  if (execute && allow && !commercial.ok) blockers.push("commercial_exclusion_not_proven");
  const ready = blockers.length === 0;
  return {
    ok: ready && !execute,
    state: !ready ? "BLOCKED_BEFORE_POST" : (execute ? "READY_FOR_CAMPAIGN_10" : "CONSULT_ONLY"),
    post_authorized: false,
    blockers: [...new Set(blockers)].map(redacted),
    destination_fingerprint: consult?.configuration?.destination_fingerprint || "MISSING",
    note: "Campaign 01 never POSTs a lead on the real domain. HTTP 201 is not operator availability.",
  };
}

export function localSanitizedConfig() {
  const fingerprint = inbound.inboundDestinationFingerprint(
    process.env.CONFENGE_INBOUND_WEBHOOK_URL || "",
  );
  return {
    ok: true,
    configuration: {
      contract: fingerprint === "WARMBLY_PRODUCTION_V1" ? "READY" : (fingerprint === "MISSING" ? "UNSET" : "BLOCKED"),
      destination_fingerprint: fingerprint,
      url: process.env.CONFENGE_INBOUND_WEBHOOK_URL ? "SET" : "UNSET",
      secret: process.env.CONFENGE_INBOUND_WEBHOOK_SECRET ? "SET" : "UNSET",
    },
    safety_gate: {
      ok: false,
      contract: "UNSET",
      auto_send_off: true,
      dispatch_attempted: false,
      reason: "local_gate_does_not_claim_production_safety",
    },
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = new Set(argv);
  const consultLive = args.has("--consult-live");
  const executeRequested = args.has("--execute");
  const allowProdPost = env.POS_INB_01_ALLOW_PROD_POST === "campaign-10";
  let consult = localSanitizedConfig();
  if (consultLive) {
    const token = env.OPS_TOKEN || "";
    if (token.length < 16) {
      consult = { ok: false, error: "ops_token_absent_local_session" };
    } else {
      consult = { ok: false, error: "consult_live_disabled_in_campaign_01" };
    }
  }
  const decision = decide({
    consult,
    execute: executeRequested,
    allowProdPost,
    identityIsolated: false,
    zeroCommercialAction: false,
    zeroExternalDispatch: false,
    commercialBefore: null,
    commercialAfter: null,
  });
  if (executeRequested && !decision.blockers.includes("execute_reserved_to_campaign_10")) {
    decision.blockers.push("execute_reserved_to_campaign_10");
    decision.state = "BLOCKED_BEFORE_POST";
  }
  decision.post_authorized = false;
  return {
    campaign: "POS-INB-20260911/01",
    consult_live: consultLive,
    decision: {
      state: decision.state,
      post_authorized: false,
      blockers: decision.blockers,
      destination_fingerprint: decision.destination_fingerprint,
      note: decision.note,
    },
    existing_probes: [
      "scripts/site/synthetic_lead_probe.mjs",
      "scripts/site/money_asset_prod_proof.mjs",
    ],
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const report = await main();
  console.log(JSON.stringify(report, null, 2));
}
