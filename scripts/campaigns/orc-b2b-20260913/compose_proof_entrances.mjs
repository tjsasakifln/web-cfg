/**
 * Compose the two summarized proof entrances into the quantity-takeoff and
 * budgeting landing page (campaign ORC-B2B-20260913).
 *
 * This producer owns one slot only. It does not touch the pos-inb-20260911/02
 * sample-trail slot, the project-review extract or the coordination register:
 * those producers are closed and stay closed.
 *
 * Precondition: both demonstrative pilots and their eight public CSVs exist.
 * A missing input fails closed instead of publishing a promise.
 *
 *   node scripts/campaigns/orc-b2b-20260913/compose_proof_entrances.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  injectProofEntrances,
  loadEntrances,
} from "../../../quantitativos-orcamento-obras/proof-entrances.mjs";

export const LANDING_REL = "quantitativos-orcamento-obras/index.html";

function resolveRoot(argv = process.argv.slice(2), cwd = process.cwd()) {
  const idx = argv.indexOf("--root");
  if (idx >= 0 && argv[idx + 1]) return path.resolve(argv[idx + 1]);
  return path.resolve(cwd);
}

export function composeProofEntrances(rootDir) {
  const root = path.resolve(rootDir);
  const landingPath = path.join(root, LANDING_REL);
  if (!fs.existsSync(landingPath)) {
    throw new Error(`required_landing_html_missing:${LANDING_REL}`);
  }
  const entrances = loadEntrances(root);
  const html = injectProofEntrances(fs.readFileSync(landingPath, "utf8"), entrances);
  fs.writeFileSync(landingPath, html);
  return {
    written: [LANDING_REL],
    entrances: entrances.map((entrance) => ({
      key: entrance.key,
      proof_id: entrance.proof_id,
      quantity_id: entrance.quantity_id,
      quantity: entrance.quantity_value,
      unit: entrance.quantity_unit,
      budget_id: entrance.budget_id,
      url: entrance.url,
    })),
  };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = composeProofEntrances(resolveRoot());
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message || error}\n`);
    process.exit(1);
  }
}
