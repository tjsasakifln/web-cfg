/**
 * Privacy suite: analytics PII rejection + DSAR export/delete + retention.
 * Drives shipped event-contract, closed-loop report, dsar_cli and lead-core.
 */
import { createRequire } from "module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "url";
import { contactHash, findByIdOrHash, listLeads, redactedExport, retentionDue } from "./dsar_cli.mjs";
import { renderClosedLoopReport } from "./closed_loop_report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const contract = require(path.join(root, "netlify/functions/lib/event-contract.cjs"));
const closedLoop = require(path.join(root, "netlify/functions/lib/closed-loop.cjs"));
const { FileStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
const leadCore = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
const stages = require(path.join(root, "netlify/functions/lib/lead-stages.cjs"));

let failed = 0;
function pass(name, detail = "") {
  console.log("PASS", name, detail);
}
function fail(name, detail) {
  console.error("FAIL", name, detail);
  failed += 1;
}

const PII_SCAN = /@|\+\d{10,15}|mensagem|message_body|"(?:nome|name|full_name|cnpj|cpf|telefone|phone|free_text|description|note|comment)"\s*:/i;

// --- admitEvent strips PII keys; closed-loop walk fail-closes on them ---
{
  const email = contract.admitEvent({
    event: "page_view",
    path: "/",
    sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    props: { event_id: "evt-priv-email", email: "ana@example.com" },
  });
  if (!email.ok) fail("admit_email_ok", email);
  else if (PII_SCAN.test(JSON.stringify(email.event))) fail("admit_email_payload", email.event);
  else pass("admit_strips_email", email.dropped.join(","));

  const phone = contract.admitEvent({
    event: "cta_click",
    path: "/",
    sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    props: { event_id: "evt-priv-phone", telefone: "+5548999888777", cta_id: "hero" },
  });
  if (!phone.ok) fail("admit_phone_ok", phone);
  else if (PII_SCAN.test(JSON.stringify(phone.event))) fail("admit_phone_payload", phone.event);
  else pass("admit_strips_phone", phone.dropped.join(","));

  const msg = contract.admitEvent({
    event: "lead_form_submit",
    path: "/",
    sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    props: { event_id: "evt-priv-msg", mensagem: "clausula confidencial do contrato" },
  });
  if (!msg.ok) fail("admit_message_ok", msg);
  else if (PII_SCAN.test(JSON.stringify(msg.event))) fail("admit_message_payload", msg.event);
  else pass("admit_strips_message", msg.dropped.join(","));

  try {
    closedLoop.admitVisitorEvents([
      {
        event: "page_view",
        path: "/",
        sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
        props: { event_id: "evt-priv-email-walk", email: "ana@example.com" },
      },
    ]);
    fail("closed_loop_email_admitted");
  } catch (err) {
    if (err.code === "pii_key_admitted" || err.code === "pii_value") pass("closed_loop_rejects_email", err.code);
    else fail("closed_loop_email_code", err.code || err.message);
  }

  const tainted = contract.admitEvent({
    event: "page_view",
    path: "/",
    sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    props: { event_id: "evt-priv-taint", route_family: "ceo@empresa.com.br" },
  });
  if (tainted.ok) fail("admit_tainted_value", tainted);
  else pass("admit_rejects_pii_value", tainted.reason);

  const ok = contract.admitEvent({
    event: "page_view",
    path: "/diagnostico-pre-licitacao/",
    sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    props: { event_id: "evt-priv-ok", route_family: "diagnostico-pre-licitacao" },
  });
  if (!ok.ok) fail("admit_safe", ok);
  else if (PII_SCAN.test(JSON.stringify(ok.event))) fail("admit_safe_payload", ok.event);
  else pass("admit_keeps_non_pii");

  for (const [name, event] of [
    [
      "lead_id_phone",
      {
        event: "lead_persisted",
        path: "/",
        sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
        props: { event_id: "evt-priv-lead-id-phone", lead_id: "48999990000" },
      },
    ],
    [
      "sid_cnpj",
      {
        event: "page_view",
        path: "/",
        sid: "52407089000109",
        props: { event_id: "evt-priv-sid-cnpj" },
      },
    ],
  ]) {
    const admitted = contract.admitEvent(event);
    if (admitted.ok || !["pii_value", "invalid_entity_id"].includes(admitted.reason)) fail(`${name}_admitted`, admitted);
    else pass(`${name}_rejected`, admitted.reason);
  }
  for (const field of ["session_id", "lead_id", "opportunity_id", "proposal_id", "sale_id"]) {
    const admitted = contract.admitEvent({
      event: "lead_persisted",
      path: "/",
      sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
      props: { event_id: `evt-priv-${field}`, [field]: "Joao Silva" },
    });
    if (admitted.ok || admitted.reason !== "invalid_entity_id") {
      fail("malformed_join_id_admitted", { field, admitted });
    }
  }
  pass("malformed_join_ids_rejected_without_echo");
  const rejectedName = contract.admitBatch([{
    event: "alice@example.com",
    path: "/",
    props: { event_id: "evt-priv-name" },
  }]);
  if (JSON.stringify(rejectedName.rejected).includes("alice@example.com")) {
    fail("rejected_event_name_leaked", rejectedName.rejected);
  } else pass("rejected_event_name_redacted");
}

// --- fixture report never contains PII ---
{
  const { body, report } = await renderClosedLoopReport();
  if (PII_SCAN.test(body)) fail("report_pii", body.slice(0, 400));
  else pass("report_body_clean");
  try {
    closedLoop.assertAnalyticsNoPii(report);
    pass("report_assert_clean");
  } catch (err) {
    fail("report_assert", err.message);
  }
  for (const [key, value] of [
    ["nome", "Pessoa"],
    ["name", "Person"],
    ["cnpj", "52407089000109"],
  ]) {
    try {
      closedLoop.assertAnalyticsNoPii({ event: "page_view", [key]: value });
      fail(`report_assert_${key}_accepted`);
    } catch (err) {
      if (err.code === "pii_value") pass(`report_assert_${key}_rejected`, err.message);
      else fail(`report_assert_${key}_code`, err.code || err.message);
    }
  }
  const fixtureRaw = fs.readFileSync(
    path.join(root, "scripts/revops/fixtures/closed-loop-synthetic.v1.json"),
    "utf8",
  );
  const eventsOnly = JSON.stringify(JSON.parse(fixtureRaw).events);
  if (PII_SCAN.test(eventsOnly)) fail("fixture_events_pii", eventsOnly.slice(0, 200));
  else pass("fixture_events_no_pii");

  for (const [name, invoke, needle] of [
    ["invalid_id_error", () => closedLoop.assertStableId("session", "private@example.com"), "private@example.com"],
    [
      "wrong_owner_error",
      () => closedLoop.assertWarmblyObservationEnvelope({ owner: "private@example.com" }),
      "private@example.com",
    ],
  ]) {
    try {
      invoke();
      fail(`${name}_accepted`);
    } catch (err) {
      const serialized = JSON.stringify(err);
      if (serialized.includes(needle)) fail(`${name}_leaked`, serialized);
      else pass(`${name}_redacted`);
    }
  }
}

// --- public lead summary redacts contact ---
{
  const summary = stages.publicLeadSummary({
    lead_id: "lead-bbbbbbbbbbbbbbbbbbbbbbbbbbb",
    nome: "SECRET",
    email: "secret@example.com",
    telefone: "48999990000",
    mensagem: "texto livre",
    commercial_stage: "lead_persisted",
    received_at: "2026-08-01T10:04:00.000Z",
    landing_page: "/",
    record_kind: "real",
  });
  const blob = JSON.stringify(summary);
  if (/SECRET|secret@|48999990000|texto livre/.test(blob)) fail("summary_pii", blob);
  else pass("public_summary_redacts_pii");
}

// --- lead-core consent + attribution session id without PII ---
{
  const denied = leadCore.validateAndNormalize({
    nome: "QA",
    telefone: "48999990000",
    estagio: "edital",
    jornada: "edital",
  });
  if (denied.ok || denied.error !== "consent") fail("core_consent", denied);
  else pass("core_consent_required", denied.error);

  const accepted = leadCore.validateAndNormalize({
    nome: "QA",
    telefone: "48999990000",
    estagio: "edital",
    jornada: "edital",
    consentimento: "true",
    session_id: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    email: "qa@example.com",
  });
  if (!accepted.ok) fail("core_accept", accepted);
  else if (accepted.lead.session_id !== "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa") {
    fail("core_session_id", accepted.lead);
  } else pass("core_keeps_session_id", accepted.lead.session_id);

  const taintedSession = leadCore.validateAndNormalize({
    nome: "QA",
    telefone: "48999990000",
    estagio: "edital",
    jornada: "edital",
    consentimento: "true",
    session_id: "52407089000109",
  });
  if (!taintedSession.ok) fail("core_tainted_session_fixture", taintedSession);
  else if (taintedSession.lead.session_id) fail("core_tainted_session_kept", taintedSession.lead.session_id);
  else pass("core_tainted_session_dropped");

  const picked = leadCore.pickAttribution({
    session_id: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    email: "leak@example.com",
    nome: "Alice",
    mensagem: "secret",
    utm_source: "google",
  });
  if (picked.email || picked.nome || picked.mensagem) fail("pick_pii", picked);
  else if (picked.session_id !== "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa") fail("pick_session", picked);
  else pass("pick_session_drops_pii");
  const pickedTaintedSession = leadCore.pickAttribution({ session_id: "48999990000" });
  if (pickedTaintedSession.session_id) fail("pick_tainted_session", pickedTaintedSession);
  else pass("pick_tainted_session_dropped");

  const leadId = leadCore.generateLeadId("idem|privacy-fixture", { deterministic: true });
  const replayedLeadId = leadCore.generateLeadId("idem|privacy-fixture", { deterministic: true });
  if (!/^lead-[0-9a-f]{27}$/.test(leadId) || replayedLeadId !== leadId) {
    fail("core_stable_lead_id", { leadId, replayedLeadId });
  } else pass("core_stable_lead_id", leadId);
}

// --- DSAR export / delete dry-run / retention ---
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-privacy-dsar-"));
  const store = new FileStore(dir);
  const retainDays = Number(process.env.LEAD_RETAIN_DAYS || 730);
  const old = {
    lead_id: "lead-oldprivacy000000000000000",
    record_kind: "real",
    nome: "Velho",
    email: "old@example.com",
    telefone: "48999990003",
    received_at: "2020-01-01T00:00:00.000Z",
    delete_after: "2022-01-01T00:00:00.000Z",
    jornada: "edital",
    landing_page: "/",
  };
  const current = {
    lead_id: "lead-curprivacy000000000000000",
    record_kind: "real",
    nome: "Atual",
    email: "ana@example.com",
    telefone: "48999990001",
    received_at: "2026-07-01T10:00:00.000Z",
    delete_after: "2028-07-01T10:00:00.000Z",
    jornada: "contrato",
    landing_page: "/",
  };
  await store.put(old, { onlyIfNew: true });
  await store.put(current, { onlyIfNew: true });

  const entries = listLeads(dir);
  const hash = contactHash("ana@example.com", "48999990001");
  const found = findByIdOrHash(entries, { hash });
  if (found.length !== 1) fail("dsar_hash", found.length);
  else pass("dsar_hash_lookup");
  const exp = redactedExport(found[0].record);
  if (exp.email !== "ana@example.com") fail("dsar_export_subject", exp);
  else pass("dsar_export_includes_subject_contact");

  const due = retentionDue(entries, { now: new Date("2026-08-05T00:00:00Z"), retainDays });
  if (!due.find((d) => d.lead_id === old.lead_id)) fail("retention_due", due);
  else pass("retention_due_old_lead", due.length);
  if (due.find((d) => d.lead_id === current.lead_id)) fail("retention_kept_current", due);
  else pass("retention_keeps_in_window");

  const delOut = path.join(dir, "del-report.json");
  const del = spawnSync(
    process.execPath,
    [path.join(root, "scripts/revops/dsar_cli.mjs"), "delete", "--id", current.lead_id, "--dry-run", "--out", delOut],
    { encoding: "utf8", env: { ...process.env, LEAD_STORE_DIR: dir, CONFENGE_STORAGE_DIR: dir } },
  );
  if (del.status !== 0) fail("dsar_delete_dry", del.stderr || del.stdout);
  else if (!(await store.get(current.lead_id))) fail("dsar_dry_mutated");
  else pass("dsar_delete_dry_run");

  const apply = spawnSync(
    process.execPath,
    [path.join(root, "scripts/revops/dsar_cli.mjs"), "delete", "--id", current.lead_id, "--apply"],
    { encoding: "utf8", env: { ...process.env, LEAD_STORE_DIR: dir, CONFENGE_STORAGE_DIR: dir } },
  );
  if (apply.status !== 0) fail("dsar_delete_apply", apply.stderr || apply.stdout);
  else if (await store.get(current.lead_id)) fail("dsar_apply_still_present");
  else pass("dsar_exclusao_applied");
}

// --- published privacy documents describe the runtime that actually runs ---
// The two visitor documents are shipped verbatim (scripts/pseo/public_artifact.py
// copies `privacidade/` and `comercial/` into _site), so the source HTML is the
// writer. Every check below derives its expectation from the code or the
// authority record, never from a hand-copied constant.
{
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  const privacyHtml = read("privacidade/index.html");
  const leadsHtml = read("comercial/privacidade-leads/index.html");
  const operatorsDoc = read("docs/security/lgpd-operators.md");
  const authority = read("docs/architecture/RUNTIME-AUTHORITY.md");
  const shippedScript = read("script.js");
  const collectSource = read("netlify/functions/collect.cjs");
  const acceptanceSource = read("netlify/functions/offer-terms-accept.cjs");

  const visible = (html) =>
    html
      // An HTML end tag may carry whitespace AND junk before its ">" -- the parser
      // accepts `</script >` and even `</script\t\n bar>` as closing the block and
      // discards the extra. A naive `<\/script>` misses both, so the block's CODE
      // would survive into what this gate treats as visible text (CodeQL alert 59).
      // `[^>]*` covers the whole tail; `\b` keeps it from matching `</scriptfoo>`.
      .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
  const privacyText = visible(privacyHtml);
  const leadsText = visible(leadsHtml);

  // 1. The collector path cited by the policy is the path the shipped script posts to.
  const shippedCollectPaths = new Set(
    [...shippedScript.matchAll(/["'`](\/[A-Za-z0-9/._-]*collect)["'`]/g)].map((m) => m[1]),
  );
  const citedCollectPaths = new Set(
    [...privacyHtml.matchAll(/(\/[A-Za-z0-9/._-]*collect)\b/g)].map((m) => m[1]),
  );
  if (!shippedCollectPaths.size) fail("collect_path_not_found_in_script");
  else if (!citedCollectPaths.size) fail("policy_cites_no_collect_path");
  else {
    const wrong = [...citedCollectPaths].filter((p) => !shippedCollectPaths.has(p));
    const cited = [...shippedCollectPaths].filter((p) => citedCollectPaths.has(p));
    if (wrong.length) fail("policy_collect_path_not_shipped", { wrong, shipped: [...shippedCollectPaths] });
    else if (!cited.length) fail("policy_collect_path_missing", [...shippedCollectPaths].join(","));
    else pass("policy_cites_shipped_collect_path", cited.join(","));
  }

  // 2. Durable store and host operator follow the authority record, not Netlify.
  const storageBackend = (authority.match(/storage:\s*\n\s*backend:\s*(\S+)/) || [])[1];
  const dnsProxy = (authority.match(/dns:\s*\n\s*proxy:\s*(\S+)/) || [])[1];
  // An affirmative sentence about a thing that is not true is the defect. A
  // sentence that denies it is the correction, so the check is "claimed", not
  // "mentioned". The negation has to come BEFORE the term in the same sentence:
  // "não usamos X" is a denial, "não fazemos Y e guardamos em X" is not.
  const claimedSentences = (text, term) =>
    text
      .split(/(?<=[.;])\s+/)
      .filter((s) => term.test(s) && !/\bn[ãa]o\b|\bnem\b/i.test(s.split(term)[0]));
  if (storageBackend !== "filesystem") fail("authority_storage_backend_unexpected", storageBackend);
  else {
    const claimed = claimedSentences(privacyText, /blobs/i);
    if (claimed.length) fail("policy_still_names_blobs_as_store", claimed[0].trim().slice(0, 120));
    else pass("policy_matches_filesystem_store");
  }
  for (const [name, text] of [["privacidade", privacyText], ["privacidade-leads", leadsText]]) {
    if (!/netcup/i.test(text)) fail("host_operator_undisclosed", name);
    else pass("host_operator_disclosed", name);
  }

  // 3. Cloudflare proxies every visitor request, so it cannot be disclosed only
  //    as the anti-abuse challenge.
  if (dnsProxy !== "cloudflare") fail("authority_dns_proxy_unexpected", dnsProxy);
  else {
    const sentences = privacyText.split(/(?<=[.;])\s+/);
    const edge = sentences.filter((s) => /cloudflare/i.test(s) && !/turnstile/i.test(s));
    if (!edge.length) fail("cloudflare_edge_undisclosed");
    else pass("cloudflare_edge_disclosed", edge[0].trim().slice(0, 60));
  }

  // 4. Resend is configured in production (docs/ops/CONFENGE-INBOUND-RELEASE-
  //    CONVERGENCE-01.md records four notify emails sent "with RESEND_API_KEY
  //    set in production"), so it may not be shown as merely optional.
  for (const [name, html] of [["privacidade", privacyHtml], ["privacidade-leads", leadsHtml]]) {
    // The whole list item or paragraph that names the operator, so a
    // conditional qualifier cannot hide in a neighbouring clause.
    const items = [...html.matchAll(/<(li|p)\b[^>]*>([\s\S]*?)<\/\1>/g)]
      .map((m) => visible(m[2]))
      .filter((b) => /resend/i.test(b));
    if (!items.length) fail("resend_undisclosed", name);
    else {
      const conditional = items.filter((b) => /quando ativad|se ativad|caso ativad|quando configurad/i.test(b));
      if (conditional.length) fail("resend_presented_as_conditional", conditional[0].trim().slice(0, 120));
      else pass("resend_disclosed_as_active", name);
    }
  }

  // 5. Telemetry: the collector writes one durable record per event carrying an
  //    IP hash and a session id, so the policy may not call it aggregate samples.
  const perEventRecord = /store\.put\(key,\s*\{\s*events:\s*\[event\]\s*\}/.test(collectSource);
  const persistsIpHash = /\n\s*ip_hash,/.test(collectSource);
  const persistsSid = /sid:\s*admitted\.event\.sid/.test(collectSource);
  if (!perEventRecord || !persistsIpHash || !persistsSid) {
    fail("collector_shape_changed", { perEventRecord, persistsIpHash, persistsSid });
  } else {
    const aggregateClaims = claimedSentences(privacyText, /amostras? agregad/i);
    if (aggregateClaims.length) {
      fail("telemetry_described_as_aggregate", aggregateClaims[0].trim().slice(0, 120));
    } else pass("telemetry_not_described_as_aggregate");
    if (!/hash de IP/i.test(privacyText) || !/identificador (?:técnico )?de sessão/i.test(privacyText)) {
      fail("telemetry_fields_undisclosed");
    } else pass("telemetry_fields_disclosed");
  }

  // 5b. The page tells the visitor the origin access log is minimized. That
  //     promise has to match the log format the host actually installs.
  if (/registro de acesso <strong>minimizado<\/strong>|acesso minimizado/i.test(privacyHtml)) {
    const httpConf = read("deploy/netcup/nginx/confenge-web-http.conf");
    const format = (httpConf.split("log_format confenge_minimized")[1] || "").split(";")[0];
    const leaking = ["$remote_addr", "$http_user_agent", "$http_referer", "$http_cookie", "$http_x_forwarded_for"]
      .filter((variable) => format.includes(variable));
    if (!format) fail("minimized_log_format_not_found");
    else if (leaking.length) fail("origin_log_contradicts_policy", leaking.join(","));
    else pass("origin_log_matches_minimized_promise");
  } else fail("minimized_log_promise_removed_from_policy");

  // 6. Visible parentheses must close. The operator list shipped a stray pair.
  const blocks = [...privacyHtml.matchAll(/<(li|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => visible(m[2]));
  const unbalanced = blocks.filter((b) => (b.match(/\(/g) || []).length !== (b.match(/\)/g) || []).length);
  if (unbalanced.length) fail("unbalanced_parentheses", unbalanced.map((b) => b.trim().slice(0, 70)));
  else pass("parentheses_balanced", String(blocks.length));

  // 7. The e-mail-sequence and offer/payment flows point at these documents, so
  //    the documents have to cover them.
  const nurtureHtml = read("nurture/index.html");
  const nurtureUsesPolicy = /href="\/privacidade\/"/.test(nurtureHtml) && /type="email"/.test(nurtureHtml);
  if (!nurtureUsesPolicy) fail("nurture_page_shape_changed");
  else if (!/href="\/nurture\/"/.test(privacyHtml)) fail("nurture_flow_uncovered");
  else pass("nurture_flow_covered");
  const acceptanceStoresRawIp =
    /user_agent:\s*\(event\.headers/.test(acceptanceSource) &&
    /ip:\s*clientIp\(event\.headers/.test(acceptanceSource);
  if (!acceptanceStoresRawIp) fail("acceptance_shape_changed");
  else if (!/href="\/comercial\/privacidade-leads\/"/.test(privacyHtml) || !/asaas/i.test(privacyText)) {
    fail("offer_flow_uncovered_by_sitewide_policy");
  } else pass("offer_flow_covered_by_sitewide_policy");

  // 8. The leads notice may not deny a subprocessor list while real operators run.
  if (/lista inventada de subprocessadores|não há .{0,60}subprocessador/i.test(leadsText)) {
    fail("leads_notice_denies_operator_list", leadsText.match(/.{0,90}subprocessador.{0,60}/i)?.[0]);
  } else pass("leads_notice_keeps_operator_list");
  for (const operator of ["Netcup", "Cloudflare", "Resend", "Asaas"]) {
    if (!new RegExp(operator, "i").test(leadsText)) fail("leads_operator_missing", operator);
    else pass("leads_operator_disclosed", operator);
  }

  // 9. The internal register the public page points at carries the same operators.
  const usesAsaas = /asaas-production\.cjs/.test(read("netlify/functions/offer-checkout.cjs"));
  for (const [needed, why] of [
    [/\|\s*Cloudflare\s*\(borda[^|]*\|/i, "cloudflare_edge_row"],
    [usesAsaas ? /\|\s*Asaas[^|]*\|/i : /^/, "asaas_row"],
  ]) {
    if (!needed.test(operatorsDoc)) fail("lgpd_register_row_missing", why);
    else pass("lgpd_register_row_present", why);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nALL privacy checks passed");
