#!/usr/bin/env node
/**
 * SYS-03: verify modular source partitions exist and cover public script.js needles.
 * Default --check verifies script.js is the deterministic minified assembly.
 * Use --write to rebuild script.js from modules (strips MODULE banners).
 */
import fs from "fs";
import path from "path";
import { minify } from "terser";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const names = ["analytics", "nav", "offer-fit", "form"];
const mods = names.map((n) => {
  const p = path.join(root, "js/modules", `${n}.js`);
  if (!fs.existsSync(p)) {
    console.error("missing module", p);
    process.exit(1);
  }
  return { n, text: fs.readFileSync(p, "utf8") };
});

const needles = {
  analytics: ["PII_PARAM_PATTERN", "track(", "no PII"],
  nav: ["menu-toggle", "menu-open"],
  "offer-fit": ["confengeRouteOfferFit", "CONFENGE_OFFER_FIT_MATRIX"],
  form: ["data-form-next", "setStep", "lead_form_step", "firstInvalid", "readOfferFitInput"],
};

let failed = 0;
for (const { n, text } of mods) {
  for (const needle of needles[n]) {
    if (!text.includes(needle)) {
      console.error(`FAIL module ${n} missing needle: ${needle}`);
      failed++;
    }
  }
}
const scriptPath = path.join(root, "script.js");
const script = fs.readFileSync(scriptPath, "utf8");
for (const n of ["data-form-next", "menu-toggle", "firstInvalid"]) {
  if (!script.includes(n)) {
    console.error("FAIL script.js missing", n);
    failed++;
  }
}
if (failed) {
  console.error("build_script_modules FAIL", failed);
  process.exit(1);
}

const header = `/* CONFENGE public site JS — modular assembly (SYS-03).
 * Source modules: js/modules/analytics.js, nav.js, offer-fit.js, form.js
 * Rebuild: node scripts/site/build_script_modules.mjs --write
 */
`;
const bodies = mods.map((m) => m.text.replace(/^\/\* MODULE[\s\S]*?\*\/\n/, ""));
const result = await minify(header + bodies.join("\n"), {
  compress: { passes: 5, drop_console: true, unsafe: true },
  mangle: { toplevel: true, reserved: ["PII_PARAM_PATTERN", "firstInvalid", "applyJourneyToForm", "confengeRouteOfferFit"] },
  format: { comments: /CONFENGE public site JS|EVENT_CONTRACT_CLIENT_/ },
});
if (!result.code) {
  console.error("terser returned an empty script");
  process.exit(1);
}
const expected = `${result.code}\n`;

if (process.argv.includes("--write")) {
  fs.writeFileSync(scriptPath, expected);
  console.log("wrote minified script.js from modules");
} else if (script !== expected) {
  console.error("FAIL script.js is stale; run build_script_modules.mjs --write");
  process.exit(1);
} else {
  console.log("build_script_modules: CHECK_OK");
}
