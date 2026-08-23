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
  buildCommercialLoopReport,
  envPresenceFromProcess,
  extractDiagnosticoSignals,
  extractLoopSurfaceSignals,
  extractPillarSignals,
  extractSitemapSignals,
  stripPii,
  validateCommercialLoopRegistry,
} from "./commercial_dod.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = path.join(root, "data/money_asset/commercial-loops.v1.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const registryValidation = validateCommercialLoopRegistry(registry);
if (!registryValidation.ok) {
  throw new Error(`invalid commercial loop registry: ${registryValidation.errors.join(",")}`);
}
const loops = registry.loops.filter((loop) => loop.enabled === true);
const primaryLoop = loops[0];
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
  const diagnostico = await fetchText(`${base}${primaryLoop.asset_path}`);
  const pillar = await fetchText(`${base}${primaryLoop.service_path}`);
  const sitemap = await fetchText(`${base}/sitemap.xml`);
  const robots = await fetchText(`${base}/robots.txt`);
  const buildInfo = await fetchText(`${base}/.well-known/build-info.json`);
  const snapshot = await fetchText(`${base}${primaryLoop.asset_path}snapshot.json`);

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

  const page = extractDiagnosticoSignals(diagnostico.text, primaryLoop);
  const pillarSignals = extractPillarSignals(pillar.text, primaryLoop);
  const map = extractSitemapSignals(sitemap.text, primaryLoop, { indexable: page.robots_indexable });
  const loopSurfaces = [];
  for (const loop of loops) {
    const asset = loop.id === primaryLoop.id ? diagnostico : await fetchText(`${base}${loop.asset_path}`);
    const service = loop.id === primaryLoop.id
      ? pillar
      : loop.service_path === loop.asset_path
        ? asset
        : await fetchText(`${base}${loop.service_path}`);
    loopSurfaces.push({
      ...extractLoopSurfaceSignals(loop, { asset_html: asset.text, service_html: service.text }),
      asset_http: asset.http,
      service_http: service.http,
    });
  }

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
    loop_surfaces: loopSurfaces,
  };
}

function localLoopSurfaces() {
  return loops.map((loop) => {
    const assetHtml = fs.readFileSync(path.join(root, loop.asset_path.replace(/^\//, ""), "index.html"), "utf8");
    const serviceHtml = loop.service_path === loop.asset_path
      ? assetHtml
      : fs.readFileSync(path.join(root, loop.service_path.replace(/^\//, ""), "index.html"), "utf8");
    return extractLoopSurfaceSignals(loop, { asset_html: assetHtml, service_html: serviceHtml });
  });
}

const fileFacts = loadFacts();
const env = envPresenceFromProcess(process.env);

const observed = skipLive
  ? { loop_surfaces: localLoopSurfaces() }
  : await liveObservations();

const defaultFacts = {
  consented_real_contact: false,
  lead_id: null,
  record_kind: null,
  outcome: "UNKNOWN",
  human_route_action: null,
  operator_or_warmbly_evidence: false,
  warmbly_handoff_observed: false,
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
};

const surfaceById = new Map((observed.loop_surfaces || []).map((item) => [item.loop_id, item]));
const loopReports = loops.map((loop) => {
  const scopedFacts = fileFacts.loops?.[loop.id] || {};
  const facts = {
    ...defaultFacts,
    ...(fileFacts.scope === "all_enabled_loops" || loop.id === primaryLoop.id ? fileFacts : {}),
    ...scopedFacts,
  };
  if (facts.consented_real_contact === true && !factsPath) {
    throw new Error(`refusing to mark consented_real_contact for ${loop.id} without --facts`);
  }
  return buildCommercialLoopReport(loop, facts, surfaceById.get(loop.id) || {});
});

const review = loopReports[0].review;
const generalizedReady = loopReports.length >= 2 && loopReports.every((item) =>
  item.surface_ready && item.capture_ready && item.attribution_ready,
);
const fullLoopReady = generalizedReady && loopReports.every((item) => item.review.exit === "READY");

const factsUsed = {};
for (const item of loopReports) {
  const real = item.review.real_loop;
  factsUsed[item.loop_id] = {
    consented_real_contact: real.missing_prerequisites?.every((row) => row.prerequisite !== "consented_real_contact") || false,
    record_kind: real.record_kind,
    lead_id: real.lead_id || null,
    outcome: real.outcome,
  };
}
const loopSummaries = loopReports.map(({ review: loopReview, ...summary }) => ({
  ...summary,
  learning: loopReview.learning,
  exit: loopReview.exit,
}));

const report = stripPii({
  schema: "confenge.commercial-dod-report/1.0",
  ok: fullLoopReady,
  commercial_dod_generalized: generalizedReady,
  registry: {
    path: "data/money_asset/commercial-loops.v1.json",
    version: registry.version,
    decision_state: registry.decision_state,
    enabled_loop_count: loops.length,
  },
  generated_from: skipLive ? "local_surfaces+facts" : "live+facts",
  audit_shell_env_present: env,
  observed,
  facts_used: factsUsed,
  loops: loopSummaries,
  // Compatibility view for WEB-011 consumers; the decision is now registry-driven.
  review,
  real_loop: {
    status: review.real_loop.status,
    prerequisite: (review.real_loop.missing_prerequisites || [])[0]?.prerequisite || "consented_real_contact",
    next_command: review.next_command,
    note: "Did not POST a person. Did not send WhatsApp/email.",
  },
});

const json = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(json);
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, json, "utf8");
}
if (!report.ok) {
  process.exitCode = 2;
}
