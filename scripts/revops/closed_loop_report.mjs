#!/usr/bin/env node
/**
 * Fixture-only closed-loop report. Never reads production, never POSTs a lead.
 *
 *   node scripts/revops/closed_loop_report.mjs
 *   node scripts/revops/closed_loop_report.mjs --fixture scripts/revops/fixtures/closed-loop-synthetic.v1.json
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const closedLoop = require(path.join(root, "netlify/functions/lib/closed-loop.cjs"));
const { MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));

function parseArgs(argv) {
  const out = { fixture: closedLoop.defaultFixturePath(), json: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--fixture" && argv[i + 1]) {
      out.fixture = argv[++i];
    }
  }
  return out;
}

export async function renderClosedLoopReport(options = {}) {
  const fixtureRel = options.fixture || closedLoop.defaultFixturePath();
  const store = options.store || new MemoryStore();
  const result = await closedLoop.runFixture(fixtureRel, store, { requireStableSession: true });
  const report = result.report;
  const body = `${JSON.stringify(report, null, 2)}\n`;
  closedLoop.assertAnalyticsNoPii(body);
  return { report, body, duplicated: result.duplicated, store };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { body } = await renderClosedLoopReport({ fixture: args.fixture });
  process.stdout.write(body);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((err) => {
    console.error(err && err.code ? `${err.code}: ${err.message}` : err);
    process.exit(1);
  });
}
