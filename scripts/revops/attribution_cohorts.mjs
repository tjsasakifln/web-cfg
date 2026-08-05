#!/usr/bin/env node
/**
 * Story 1.6 — Attribution cohorts precompute (path/source level only).
 * ADR-007: never join individual GSC query ↔ individual lead identity.
 *
 * Usage:
 *   LEAD_STORE_DIR=./.leads node scripts/revops/attribution_cohorts.mjs --out data/revops/cohorts/latest.json
 *   node scripts/revops/attribution_cohorts.mjs --fixture
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildExportPackage,
  filterLeads,
  SCHEMA_VERSION as LEAD_SCHEMA,
} from "./export_leads.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

export const COHORT_SCHEMA_VERSION = "1.0.0";

export function loadLeadsFromDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
    } catch {
      /* skip */
    }
  }
  return out;
}

export function loadAnalyticsEvents(fixturePath) {
  if (!fixturePath || !fs.existsSync(fixturePath)) return [];
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  if (Array.isArray(raw)) return raw;
  return raw.events || raw.items || [];
}

/**
 * Pure cohort aggregation — path/source/campaign counts only.
 * Never emits lead_id next to query strings.
 */
export function buildCohorts({
  leads = [],
  events = [],
  kind = "real",
  now = new Date().toISOString(),
} = {}) {
  const commercial = filterLeads(leads, { kind });
  const byLanding = new Map();
  const byUtmSource = new Map();
  const byJourney = new Map();

  const bump = (map, key) => {
    const k = key || "(none)";
    map.set(k, (map.get(k) || 0) + 1);
  };

  for (const l of commercial) {
    bump(byLanding, l.landing_page || l.origem || "/");
    bump(byUtmSource, l.utm_source || "(direct)");
    bump(byJourney, l.jornada || "(unset)");
  }

  const eventsByPath = new Map();
  const eventsByName = new Map();
  for (const e of events) {
    const p = e.page_path || e.path || e.landing_page || "(unknown)";
    const n = e.event || e.name || e.event_name || "event";
    // drop any accidental PII keys
    bump(eventsByPath, p);
    bump(eventsByName, n);
  }

  // Cohort join is path-level only: same landing path counts (not person-level)
  const pathCohorts = [];
  const paths = new Set([...byLanding.keys(), ...eventsByPath.keys()]);
  for (const p of paths) {
    pathCohorts.push({
      path: p,
      leads: byLanding.get(p) || 0,
      events: eventsByPath.get(p) || 0,
      // probability-style ratio, not identity
      event_per_lead:
        (byLanding.get(p) || 0) > 0
          ? Number(((eventsByPath.get(p) || 0) / (byLanding.get(p) || 1)).toFixed(4))
          : null,
    });
  }
  pathCohorts.sort((a, b) => b.leads - a.leads || a.path.localeCompare(b.path));

  return {
    schema_version: COHORT_SCHEMA_VERSION,
    lead_export_schema_version: LEAD_SCHEMA,
    generated_at: now,
    freshness: {
      expected_cadence: "daily",
      note: "Ops may read this package instead of live O(n) joins. Never join query↔person.",
    },
    policy: {
      commercial_kind_default: kind,
      excludes_non_real: kind === "real",
      adr_007: "cohort_or_path_only_never_query_to_lead",
    },
    totals: {
      leads_commercial: commercial.length,
      leads_input: leads.length,
      events: events.length,
    },
    by_utm_source: Object.fromEntries([...byUtmSource.entries()].sort()),
    by_journey: Object.fromEntries([...byJourney.entries()].sort()),
    by_event_name: Object.fromEntries([...eventsByName.entries()].sort()),
    path_cohorts: pathCohorts,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const o = { out: null, fixture: false, events: null, kind: "real" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") o.out = argv[++i];
    else if (a === "--fixture") o.fixture = true;
    else if (a === "--events") o.events = argv[++i];
    else if (a === "--kind") o.kind = argv[++i];
  }
  return o;
}

async function main() {
  const args = parseArgs();
  let leads;
  let events = [];
  if (args.fixture) {
    const fixDir = path.join(root, "scripts/revops/fixtures/leads");
    const evPath = path.join(root, "scripts/revops/fixtures/analytics-events.json");
    leads = loadLeadsFromDir(fixDir);
    events = loadAnalyticsEvents(evPath);
  } else {
    const dir = process.env.LEAD_STORE_DIR;
    leads = loadLeadsFromDir(dir);
    if (args.events) events = loadAnalyticsEvents(args.events);
  }
  const frozen = process.env.COHORT_NOW || "2026-08-05T12:00:00.000Z";
  const pkg = buildCohorts({ leads, events, kind: args.kind, now: frozen });
  const outPath =
    args.out ||
    path.join(root, "data", "revops", "cohorts", "attribution-cohorts-latest.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(pkg, null, 2), "utf8");
  // path-only stdout
  console.log(
    JSON.stringify({
      ok: true,
      path: outPath,
      schema_version: pkg.schema_version,
      leads_commercial: pkg.totals.leads_commercial,
      path_cohorts: pkg.path_cohorts.length,
    }),
  );
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }));
    process.exit(1);
  });
}
