/**
 * Scheduled nurture tick — double opt-in / suppression handled server-side.
 *   OPS_TOKEN=… node scripts/revops/scheduled_nurture.mjs
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");
const TOKEN = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";

const out = { job: "nurture_tick", base: BASE, ts: new Date().toISOString() };

if (!TOKEN) {
  console.error(JSON.stringify({ ok: false, error: "OPS_TOKEN_required" }));
  process.exit(2);
}

// Health (public)
const health = await fetch(`${BASE}/.netlify/functions/nurture?action=health`).then((r) => r.json()).catch(() => ({}));
out.health = health;

// Tick (auth)
const res = await fetch(`${BASE}/.netlify/functions/nurture?action=tick`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({ source: "scheduled_nurture" }),
});
const body = await res.json().catch(() => ({}));
out.http = res.status;
out.tick = body;
out.ok = res.status === 200 && body.ok !== false;

const runDir = resolve(ROOT, "data/revops/schedule-runs");
mkdirSync(runDir, { recursive: true });
writeFileSync(
  resolve(runDir, `nurture-${out.ts.slice(0, 10)}.json`),
  JSON.stringify(out, null, 2) + "\n"
);
console.log(JSON.stringify(out, null, 2));
if (!out.ok) process.exit(1);
