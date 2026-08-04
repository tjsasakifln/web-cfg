/**
 * Smoke: production /.well-known/build-info.json must match expected commit.
 * Fails when production does not serve the expected main/HEAD commit.
 *
 * Usage:
 *   node scripts/site/test_prod_build_info.mjs
 *   EXPECTED_SHA=… node scripts/site/test_prod_build_info.mjs https://confenge.com.br
 */
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.argv[2] || process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");

function expectedSha() {
  if (process.env.EXPECTED_SHA) return process.env.EXPECTED_SHA.trim();
  try {
    return execSync("git rev-parse origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return execSync("git rev-parse main", { cwd: ROOT, encoding: "utf8" }).trim();
  }
}

const expected = expectedSha();
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) console.log("PASS", name, detail);
  else {
    console.error("FAIL", name, detail);
    failures.push(`${name}: ${detail}`);
  }
}

const res = await fetch(`${BASE}/.well-known/build-info.json`, {
  headers: { Accept: "application/json", "Cache-Control": "no-cache" },
});
ok("build_info_http_200", res.status === 200, `status=${res.status}`);
let info = {};
try {
  info = await res.json();
} catch (e) {
  failures.push(`build_info_json: ${e}`);
}

ok("has_commit", Boolean(info.commit), JSON.stringify(info));
ok("has_build_time", Boolean(info.build_time), info.build_time);
ok("has_environment", Boolean(info.environment), info.environment);
// deploy_id / artifact_hash required after PR1 lands in production
const hasDeploy = info.deploy_id != null && info.deploy_id !== "";
const hasHash = info.artifact_hash != null && String(info.artifact_hash).length >= 8;
if (process.env.REQUIRE_FULL_BUILD_INFO === "1") {
  ok("has_deploy_id", hasDeploy, info.deploy_id);
  ok("has_artifact_hash", hasHash, info.artifact_hash);
} else {
  // Soft: report presence without failing pre-deploy main
  console.log("INFO deploy_id", info.deploy_id || "(absent — expected until PR1 deploy)");
  console.log("INFO artifact_hash", info.artifact_hash ? String(info.artifact_hash).slice(0, 16) + "…" : "(absent)");
}

ok(
  "commit_matches_expected",
  info.commit === expected,
  `live=${info.commit} expected=${expected}`
);

// Cross-check pseo-build when present
const pseo = await fetch(`${BASE}/.well-known/pseo-build.json`).then((r) => r.json()).catch(() => ({}));
if (pseo.web_cfg_sha) {
  ok("pseo_sha_matches_build_info", pseo.web_cfg_sha === info.commit, `pseo=${pseo.web_cfg_sha}`);
}

const out = {
  ok: failures.length === 0,
  base: BASE,
  expected,
  live: info,
  failures,
};
console.log(JSON.stringify(out, null, 2));
if (failures.length) process.exit(1);
