import { decide, evaluateSafety, commercialExclusionProven, main } from "../../../scripts/campaigns/pos-inb-20260911/01/netcup_proof_gate.mjs";
import { pass, fail, getResults } from "./helpers.mjs";

{
  const blocked = decide({ execute: true, allowProdPost: false });
  if (blocked.state !== "BLOCKED_BEFORE_POST") fail("execute_without_consult", blocked);
  if (!blocked.blockers.includes("execute_reserved_to_campaign_10")) fail("execute_not_reserved", blocked);
  if (blocked.post_authorized !== false) fail("post_authorized_true");
  pass("gate_blocks_execute_from_campaign_01");
}

{
  const readySafety = {
    ok: true,
    configuration: { contract: "READY", destination_fingerprint: "WARMBLY_PRODUCTION_V1" },
    safety_gate: {
      ok: true,
      contract: "READY",
      auto_send_off: true,
      dispatch_attempted: false,
    },
  };
  const missingDispatch = decide({
    consult: {
      ...readySafety,
      safety_gate: { ...readySafety.safety_gate, auto_send_off: false },
    },
    identityIsolated: true,
    zeroCommercialAction: true,
    zeroExternalDispatch: true,
  });
  if (missingDispatch.state !== "BLOCKED_BEFORE_POST") fail("auto_send_on_not_blocked", missingDispatch);
  if (!missingDispatch.blockers.includes("auto_send_not_proven_off")) fail("auto_send_blocker", missingDispatch);
  pass("gate_requires_auto_send_off");
}

{
  const snapshot = {
    ok: true,
    configuration: { contract: "READY", destination_fingerprint: "WARMBLY_PRODUCTION_V1" },
    safety_gate: { ok: true, contract: "READY", auto_send_off: true, dispatch_attempted: false },
  };
  const consultOnly = decide({
    consult: snapshot,
    identityIsolated: true,
    zeroCommercialAction: true,
    zeroExternalDispatch: true,
  });
  if (consultOnly.state !== "CONSULT_ONLY") fail("consult_only", consultOnly);
  if (consultOnly.post_authorized !== false) fail("consult_posted");
  const exec10 = decide({
    consult: snapshot,
    execute: true,
    allowProdPost: true,
    identityIsolated: true,
    zeroCommercialAction: true,
    zeroExternalDispatch: true,
    commercialBefore: { weekly_leads_total: 4 },
    commercialAfter: { weekly_leads_total: 4 },
  });
  if (exec10.state !== "READY_FOR_CAMPAIGN_10") fail("ready_10", exec10);
  if (exec10.post_authorized !== false) fail("gate_must_not_self_authorize_post");
  pass("consult_only_until_campaign_10");
}

{
  const safety = evaluateSafety({ ok: true, configuration: { contract: "UNSET" }, safety_gate: {} });
  if (safety.ok) fail("unset_considered_ready");
  if (commercialExclusionProven({ a: 1 }, { a: 2 }).ok) fail("totals_drift_accepted");
  if (!commercialExclusionProven({ a: 1 }, { a: 1 }).ok) fail("totals_same_rejected");
  pass("safety_and_exclusion_helpers");
}

{
  const report = await main(["--execute"], { POS_INB_01_ALLOW_PROD_POST: "nope" });
  if (report.decision.state !== "BLOCKED_BEFORE_POST") fail("main_execute", report);
  if (report.decision.post_authorized !== false) fail("main_authorized");
  const blob = JSON.stringify(report);
  if (/OPS_TOKEN|Bearer |@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(blob)) fail("gate_leaked_secret");
  pass("main_cli_blocks_and_redacts");
}

console.log("POS_INB_01_PROOF_GATE_OK", JSON.stringify({ tests: getResults().length }));
