#!/usr/bin/env node
/**
 * Operator audit for WEB-011. Fetches the shipped live surfaces, drives the
 * shipped diagnose transform (use path), and fail-closes the commercial loop
 * without POSTing a person.
 *
 * Usage:
 *   node scripts/money_asset/audit_commercial_dod.mjs [--out file] [--facts file] [--skip-live]
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_INBOUND_URL,
  MONEY_ASSET_PATH,
  PILLAR_PATH,
  NEXT_COMMAND,
  buildReview,
  envPresenceFromProcess,
  extractDiagnosticoSignals,
  extractPillarSignals,
  extractSitemapSignals,
  stripPii,
} from "./commercial_dod.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const {
  diagnoseMargin,
  selectContract,
} = require(path.join(root, "assets/js/diagnose-margin.cjs"));

const args = process.argv.slice(2);
function flagValue(name) {
  const i = args.indexOf(name);
  if (i < 0) return null;
  return args[i + 1] || null;
}
const outPath = flagValue("--out");
const factsPath = flagValue("--facts");
const skipLive = args.includes("--skip-live");
const base = (flagValue("--base") || "https://confenge.com.br").replace(/\/$/, "");

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "User-Agent": "confenge-web-011-audit/1.0" },
  });
  const text = await res.text();
  return { http: res.status, text, headers: Object.fromEntries(res.headers.entries()) };
}

function loadFacts() {
  if (!factsPath) return {};
  return JSON.parse(fs.readFileSync(factsPath, "utf8"));
}

async function liveObservations() {
  const diagnostico = await fetchText(`${base}${MONEY_ASSET_PATH}`);
  const pillar = await fetchText(`${base}${PILLAR_PATH}`);
  const sitemap = await fetchText(`${base}/sitemap.xml`);
  const robots = await fetchText(`${base}/robots.txt`);
  const buildInfo = await fetchText(`${base}/.well-known/build-info.json`);
  const snapshot = await fetchText(`${base}${MONEY_ASSET_PATH}snapshot.json`);

  let inbound = { http: null, body: null, error: null };
  try {
    const res = await fetch(CANONICAL_INBOUND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "confenge-web-011-audit/1.0" },
      body: "{}",
    });
    inbound = { http: res.status, body: await res.text(), error: null };
  } catch (err) {
    inbound = { http: null, body: null, error: String(err && err.message ? err.message : err).slice(0, 160) };
  }

  let usePath = { status: "BLOCKED", reason: "snapshot_unavailable" };
  try {
    const snap = JSON.parse(snapshot.text);
    const selected = selectContract(snap, "83102277000152-2-000626/2026");
    const rec = selected && selected.ok ? selected.record : snap.records?.[0];
    const diagnosis = diagnoseMargin(rec, snap);
    usePath = {
      status: diagnosis && diagnosis.public_id ? "PROVEN" : "BLOCKED",
      schema: snap.schema || null,
      public_id: diagnosis.public_id?.value || null,
      public_id_slug: diagnosis.public_id_slug || null,
      unknown_count: diagnosis.unknown_count,
      official_count: diagnosis.official_count,
      events: (diagnosis.eventos_defesa_margem || []).map((e) => ({
        family: e.family,
        classification: e.classification,
        reason: e.reason || null,
      })),
    };
  } catch (err) {
    usePath = { status: "BLOCKED", reason: String(err && err.message ? err.message : err).slice(0, 160) };
  }

  let build = {};
  try {
    build = JSON.parse(buildInfo.text);
  } catch {
    build = {};
  }

  const page = extractDiagnosticoSignals(diagnostico.text);
  const pillarSignals = extractPillarSignals(pillar.text);
  const map = extractSitemapSignals(sitemap.text, { indexable: page.robots_indexable });

  return {
    live: {
      diagnostico_http: diagnostico.http,
      pillar_http: pillar.http,
      sitemap_http: sitemap.http,
      robots_http: robots.http,
      x_robots_tag: diagnostico.headers["x-robots-tag"] || null,
      build_commit: build.commit || null,
      inbound_unsigned_post_http: inbound.http,
      inbound_unsigned_post_body: String(inbound.body || "").slice(0, 200),
      inbound_error: inbound.error,
      robots_disallow_asset: /Disallow:\s*\/ferramentas\/diagnostico-defesa-margem/i.test(robots.text),
    },
    page,
    pillar: pillarSignals,
    sitemap: map,
    use_path: usePath,
  };
}

const fileFacts = loadFacts();
const env = envPresenceFromProcess(process.env);

const observed = skipLive
  ? {}
  : await liveObservations();

const facts = {
  consented_real_contact: false,
  lead_id: null,
  record_kind: null,
  outcome: "UNKNOWN",
  human_route_action: null,
  operator_or_warmbly_evidence: false,
  probe: false,
  test_mode: false,
  product_volume_only: false,
  product_change_required: false,
  named_friction: null,
  friction_requires_change: false,
  reduces_uncertainty: true,
  reduces_time_to_evidence: true,
  reduces_risk: true,
  reduces_cost: false,
  already_shipped: ["#76", "#79", "#80", "#81", "#82"],
  ...env,
  ...fileFacts,
};

if (facts.consented_real_contact === true && !fileFacts.consented_real_contact) {
  throw new Error("refusing to mark consented_real_contact without --facts");
}

const review = buildReview(facts);

const report = stripPii({
  ok: review.exit === "READY",
  campaign: "WEB-011",
  generated_from: skipLive ? "facts_only" : "live+facts",
  env_present: env,
  observed,
  facts_used: {
    consented_real_contact: facts.consented_real_contact,
    inbound_url_set: facts.inbound_url_set,
    inbound_secret_set: facts.inbound_secret_set,
    ops_token_set: facts.ops_token_set,
    auto_send_off_evidenced: facts.auto_send_off_evidenced,
    record_kind: facts.record_kind,
    lead_id: facts.lead_id || null,
  },
  review,
  real_loop: {
    status: review.real_loop.status,
    prerequisite: (review.real_loop.missing_prerequisites || [])[0]?.prerequisite || "consented_real_contact",
    next_command: NEXT_COMMAND,
    note: "Did not POST a person. Did not send WhatsApp/email.",
  },
});

const json = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(json);
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, json, "utf8");
}
if (review.exit === "BLOCKED" || review.exit === "NO_GO" || review.exit === "ADJUST") {
  process.exitCode = 2;
}
