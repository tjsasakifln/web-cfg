/**
 * Runtime gate for netlify.toml `external_node_modules`.
 *
 * Why this exists: modules listed in external_node_modules are deliberately kept
 * out of the esbuild bundle so Netlify can inject runtime context. They are
 * resolved from node_modules at function runtime instead, which means no CI job
 * ever loads them. Dependabot PR #265 (@netlify/blobs 10 -> 11, engine floor
 * raised to Node >=22.12) passed every required check for exactly that reason:
 * a green pipeline proved the site built, not that the functions could start.
 *
 * This gate closes that blind spot. It loads each external module for real, on
 * the CI Node, outside the try/catch that the function code wraps it in, and
 * asserts the exact API surface the functions call.
 *
 * Whole-tree engine compatibility is enforced separately by `npm ci
 * --engine-strict` in site-ci.yml and pseo.yml, which uses npm's own semver.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(path.join(root, "package.json"));

let failures = 0;
function pass(name, detail) {
  console.log("PASS", name, detail || "");
}
function fail(name, detail) {
  console.error("FAIL", name, detail || "");
  failures += 1;
}

// --- inputs -----------------------------------------------------------------

const netlifyToml = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function parseExternalModules(text) {
  const m = text.match(/external_node_modules\s*=\s*\[([^\]]*)\]/);
  if (!m) return null;
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
}

const externals = parseExternalModules(netlifyToml);
if (externals === null) {
  fail("external_node_modules_declared", "netlify.toml has no external_node_modules key");
} else if (externals.length === 0) {
  fail("external_node_modules_declared", "external_node_modules is empty");
} else {
  pass("external_node_modules_declared", externals.join(", "));
}

// Source trees that ship to the function runtime: the functions themselves plus
// the helper trees netlify.toml copies in via included_files.
const SOURCE_DIRS = ["netlify/functions", "scripts/offers"];

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(c?js|mjs)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const sources = SOURCE_DIRS.flatMap((d) => walk(d)).map((rel) => ({
  rel,
  text: fs.readFileSync(path.join(root, rel), "utf8"),
}));

/**
 * Collect the export names the repo actually calls on `moduleName`.
 *
 * Scope-aware on purpose. A naive grep for `<alias>.<prop>` matches unrelated
 * locals: netlify/functions/ops.cjs has `const blobs = listed.blobs || []`
 * followed by `blobs.slice(0, 200)`, which is an Array, not the Blobs client.
 * Only aliases actually bound to require("<moduleName>") are followed.
 */
function usedExports(moduleName) {
  const quoted = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const used = new Map(); // name -> Set of "file:line"
  const files = new Set();

  const record = (name, rel, index, text) => {
    const line = text.slice(0, index).split("\n").length;
    if (!used.has(name)) used.set(name, new Set());
    used.get(name).add(`${rel}:${line}`);
  };

  for (const { rel, text } of sources) {
    // const { a, b } = require("mod")
    const destructure = new RegExp(
      `const\\s*\\{([^}]*)\\}\\s*=\\s*require\\(\\s*["']${quoted}["']\\s*\\)`,
      "g"
    );
    for (const m of text.matchAll(destructure)) {
      files.add(rel);
      for (const raw of m[1].split(",")) {
        const name = raw.split(":")[0].trim();
        if (name) record(name, rel, m.index, text);
      }
    }

    // const alias = require("mod")  ->  alias.prop
    const namespace = new RegExp(
      `const\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*require\\(\\s*["']${quoted}["']\\s*\\)`,
      "g"
    );
    for (const m of text.matchAll(namespace)) {
      files.add(rel);
      const alias = m[1];
      const member = new RegExp(`\\b${alias}\\.([A-Za-z_$][\\w$]*)`, "g");
      for (const hit of text.matchAll(member)) record(hit[1], rel, hit.index, text);
    }
  }
  return { used, files };
}

// --- per-module assertions --------------------------------------------------

for (const name of externals || []) {
  // 1) Netlify installs production dependencies only. A module that is external
  //    (not bundled) and lives in devDependencies is absent at function runtime.
  const inDeps = Boolean(pkg.dependencies && pkg.dependencies[name]);
  const inDev = Boolean(pkg.devDependencies && pkg.devDependencies[name]);
  if (!inDeps) {
    fail(
      `${name}:in_dependencies`,
      inDev
        ? "listed in devDependencies; Netlify installs prod deps only, so it is missing at runtime"
        : "not declared in package.json dependencies"
    );
  } else {
    pass(`${name}:in_dependencies`, pkg.dependencies[name]);
  }

  const { used, files } = usedExports(name);

  // 2) No stale entries: keeping the bundler exclusion honest.
  if (files.size === 0) {
    fail(
      `${name}:actually_used`,
      `no require("${name}") found in ${SOURCE_DIRS.join(", ")} - stale external_node_modules entry`
    );
  } else {
    pass(`${name}:actually_used`, `${files.size} file(s)`);
  }

  // 3) Load it for real. The function code wraps this require in try/catch and
  //    degrades to another store, so a genuine load failure is invisible there.
  //    Here it is deliberately unguarded: if it throws, CI goes red.
  let mod;
  try {
    mod = require(name);
    pass(`${name}:loads`, `node ${process.version}`);
  } catch (err) {
    fail(`${name}:loads`, `require() threw on ${process.version}: ${err && err.message}`);
    continue;
  }

  // 4) The API surface the functions call must exist and be callable.
  if (used.size === 0) {
    fail(`${name}:api_surface`, "could not derive any used export - detection is broken");
    continue;
  }
  for (const [exportName, sites] of [...used.entries()].sort()) {
    const where = [...sites].sort().join(", ");
    if (typeof mod[exportName] !== "function") {
      fail(
        `${name}:export:${exportName}`,
        `called at ${where} but module exports ${typeof mod[exportName]}`
      );
    } else {
      pass(`${name}:export:${exportName}`, where);
    }
  }
}

if (failures) {
  console.error(`EXTERNAL_RUNTIME_MODULES_FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("EXTERNAL_RUNTIME_MODULES_OK");
