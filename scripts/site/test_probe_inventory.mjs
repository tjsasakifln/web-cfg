/**
 * Every package.json script whose name looks like a production probe, smoke,
 * canary, verifier or proof must have a row in
 * docs/ops/PRODUCTION-PROBE-INVENTORY.md with one of the three classifications.
 * A new probe cannot appear without saying what it does to production.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Same literal as the inventory header; keep both in sync.
const PROBE_NAME = /prod|production|smoke|probe|canary|verify|proof|e2e/i;
const CLASSIFICATIONS = ["READ_ONLY", "SYNTHETIC_MUTATING_AUTHORIZED", "REAL_MUTATING"];

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const inventory = fs.readFileSync(path.join(root, "docs/ops/PRODUCTION-PROBE-INVENTORY.md"), "utf8");
assert.ok(inventory.includes(`\`/${PROBE_NAME.source}/i\``), "inventory header must state the same regex as this test");

const rows = inventory
  .split("\n")
  .filter((line) => line.startsWith("| `") || line.startsWith("| (") || line.startsWith("| workflow"))
  .map((line) => line.split("|").map((cell) => cell.trim()));
assert.ok(rows.length > 10, "inventory table rows missing");

const matching = Object.keys(pkg.scripts).filter((name) => PROBE_NAME.test(name));
assert.ok(matching.length > 0, "no package.json script matches the probe regex; the regex drifted");
const missing = [];
const unclassified = [];
for (const name of matching) {
  const row = rows.find((cells) => cells[1] && cells[1].includes(`\`${name}\``));
  if (!row) {
    missing.push(name);
    continue;
  }
  const classification = row[5] || "";
  if (!CLASSIFICATIONS.some((token) => classification.startsWith(token))) unclassified.push(name);
}
assert.deepEqual(missing, [], `package.json scripts missing from the inventory: ${missing.join(", ")}`);
assert.deepEqual(unclassified, [], `rows without a classification: ${unclassified.join(", ")}`);
for (const cells of rows) assert.equal(/\bUNKNOWN\b/.test(cells[5] || ""), false, `UNKNOWN classification: ${cells[1]}`);
for (const cells of rows) {
  assert.ok(
    cells.length >= 6 && (CLASSIFICATIONS.some((token) => (cells[5] || "").startsWith(token)) || cells.length >= 9),
    `row lacks a classification: ${cells[1]}`,
  );
}
console.log(`PROBE_INVENTORY_OK scripts=${matching.length} rows=${rows.length}`);
