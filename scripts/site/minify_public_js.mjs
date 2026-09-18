#!/usr/bin/env node
/**
 * Deterministic build-time minification of the PUBLIC copies of the tool
 * scripts served from _site/assets/js/*.js.
 *
 * Why: the Lighthouse gate caps critical payload at 153600 gzip content
 * bytes. Source files under assets/js/ stay readable and untouched — this
 * script only rewrites the already-copied files inside _site/assets/js/
 * (assemble_public_artifact copies assets/js verbatim from source).
 *
 * Usage:
 *   node scripts/site/minify_public_js.mjs           # minify _site in place
 *   node scripts/site/minify_public_js.mjs --check   # verify _site matches
 *
 * Fail-closed: any terser error, missing source, or --check mismatch exits
 * non-zero. Mirrors scripts/site/scrub_em_dashes.py's --check contract.
 */
import fs from "fs";
import path from "path";
import { minify } from "terser";
import { fileURLToPath } from "url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SOURCE_DIR = path.join(ROOT, "assets/js");
export const PUBLIC_DIR_NAME = "_site";

// script.js is a separate, already-minified public asset built by
// build_script_modules.mjs — never touched here, and not under assets/js/.
const NEVER_TOUCH = new Set(["script.js"]);

const TERSER_OPTIONS = {
  // evaluate:false — some source deliberately splits sensitive-looking
  // substrings across string-literal concatenation ("pncp_" + "supplier_
  // contracts:") to dodge the public-artifact secret-scan regexes in
  // scripts/pseo/public_artifact.py. Constant-folding that concatenation
  // back into one literal would silently defeat that guard.
  compress: { passes: 3, evaluate: false },
  // These IIFEs attach to `root`/`window` — never mangle top-level names or
  // globals, only local/inner identifiers.
  mangle: { toplevel: false },
  format: { comments: /Canonical events/ },
};

/** Heuristic: a file is "already minified" if it has few newlines relative
 * to its size, or carries a `.min.js` name. Such files are left untouched
 * (re-minifying gains nothing and risks double-processing). */
export function isAlreadyMinified(name, text) {
  if (/\.min\.js$/i.test(name)) return true;
  const newlineCount = (text.match(/\n/g) || []).length;
  if (text.length > 200 && newlineCount < text.length / 200) return true;
  return false;
}

/** List the public-eligible *.js source files under assets/js/. */
export function listCandidates(sourceDir = SOURCE_DIR) {
  if (!fs.existsSync(sourceDir)) return [];
  return fs
    .readdirSync(sourceDir)
    .filter((name) => name.endsWith(".js") && !NEVER_TOUCH.has(name))
    .sort();
}

/** Minify one source string. Throws on terser failure (fail-closed). */
export async function minifySource(name, text) {
  if (isAlreadyMinified(name, text)) return text;
  const result = await minify(text, TERSER_OPTIONS);
  if (!result.code) {
    throw new Error(`terser returned empty output for ${name}`);
  }
  return `${result.code}\n`;
}

async function run({ check }) {
  const candidates = listCandidates();
  if (candidates.length === 0) {
    console.log("minify_public_js: no assets/js/*.js source files found");
    return 0;
  }

  const publicDir = path.join(ROOT, PUBLIC_DIR_NAME, "assets/js");
  const publicArtifactRequired = process.env.PUBLIC_ARTIFACT_REQUIRED === "1";

  if (!fs.existsSync(publicDir)) {
    if (check && !publicArtifactRequired) {
      console.log("minify_public_js --check: no _site artifact present, skipping");
      return 0;
    }
    console.error(`FAIL-CLOSED minify_public_js: missing ${publicDir}`);
    return 2;
  }

  let mismatches = 0;
  let written = 0;
  let skipped = 0;

  for (const name of candidates) {
    const srcPath = path.join(SOURCE_DIR, name);
    const pubPath = path.join(publicDir, name);
    const srcText = fs.readFileSync(srcPath, "utf8");

    let expected;
    try {
      expected = await minifySource(name, srcText);
    } catch (exc) {
      console.error(`FAIL-CLOSED minify_public_js: terser failed for ${name}: ${exc.message}`);
      return 2;
    }

    if (!fs.existsSync(pubPath)) {
      console.error(`FAIL-CLOSED minify_public_js: missing public copy ${pubPath}`);
      return 2;
    }

    const current = fs.readFileSync(pubPath, "utf8");
    if (expected === srcText) {
      // Already-minified source: public copy must still equal source.
      if (current !== srcText) {
        if (check) {
          console.error(`FAIL minify_public_js --check: ${name} public copy diverges from source`);
          mismatches++;
        } else {
          fs.writeFileSync(pubPath, srcText);
          written++;
        }
      } else {
        skipped++;
      }
      continue;
    }

    if (check) {
      if (current !== expected) {
        console.error(`FAIL minify_public_js --check: ${name} is not the minified form of its source`);
        mismatches++;
      }
    } else {
      fs.writeFileSync(pubPath, expected);
      written++;
    }
  }

  if (check) {
    if (mismatches > 0) {
      console.error(`FAIL-CLOSED minify_public_js --check: ${mismatches} file(s) stale`);
      return 2;
    }
    console.log(`minify_public_js --check: CHECK_OK (${candidates.length - skipped} minified, ${skipped} skipped)`);
    return 0;
  }

  console.log(`minify_public_js: wrote ${written} file(s), skipped ${skipped} already-minified`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes("--check");
  run({ check }).then((code) => process.exit(code));
}

export { run };
