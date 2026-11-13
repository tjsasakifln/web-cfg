#!/usr/bin/env node
/**
 * Unit test for scripts/site/minify_public_js.mjs.
 *
 * Self-contained: builds fixtures in a tmpdir and asserts minify-then-evaluate
 * equivalence there. Never touches the real assets/js/ or _site/ trees, so it
 * runs safely on a clean checkout with no built artifact (registered in the
 * `npm test` chain next to test:script-modules).
 */
import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import { isAlreadyMinified, minifySource, PUBLIC_MODULE_PATHS, run } from "./minify_public_js.mjs";

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (exc) {
    failures++;
    console.error(`FAIL - ${name}: ${exc.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (exc) {
    failures++;
    console.error(`FAIL - ${name}: ${exc.message}`);
  }
}

const IIFE_SOURCE = `(function () {
  "use strict";
  var greeting = "hello";
  function greet(name) {
    var innerNoise = 1 + 1;
    return greeting + ", " + name + "!";
  }
  window.confengeGreet = greet;
  root.confengeGreetExport = greet;
})();
`;

check("isAlreadyMinified: newline-rich source is not already minified", () => {
  assert.strictEqual(isAlreadyMinified("tools-common.js", IIFE_SOURCE), false);
});

check("isAlreadyMinified: .min.js name is always already minified", () => {
  assert.strictEqual(isAlreadyMinified("vendor.min.js", "var x=1;"), true);
});

check("isAlreadyMinified: dense single-line source is already minified", () => {
  const dense = `var x=1;${"a".repeat(500)}`;
  assert.strictEqual(isAlreadyMinified("dense.js", dense), true);
});

await checkAsync("minifySource: shrinks a newline-rich IIFE", async () => {
  const out = await minifySource("fixture.js", IIFE_SOURCE);
  assert.ok(out.length < IIFE_SOURCE.length, "minified output should be smaller");
  assert.notStrictEqual(out, IIFE_SOURCE);
});

await checkAsync("minifySource: preserves toplevel global assignment (window.*)", async () => {
  const out = await minifySource("fixture.js", IIFE_SOURCE);
  assert.ok(out.includes("window.confengeGreet"), "window global assignment must survive mangling");
});

await checkAsync("minifySource: preserves toplevel global assignment (root.*)", async () => {
  const out = await minifySource("fixture.js", IIFE_SOURCE);
  assert.ok(out.includes("root.confengeGreetExport"), "root global assignment must survive mangling");
});

await checkAsync("minifySource: output evaluates equivalently to source", async () => {
  const out = await minifySource("fixture.js", IIFE_SOURCE);

  function evalInSandbox(code) {
    const sandbox = { window: {}, root: {}, console };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
  }

  const srcSandbox = evalInSandbox(IIFE_SOURCE);
  const outSandbox = evalInSandbox(out);

  assert.strictEqual(typeof srcSandbox.window.confengeGreet, "function");
  assert.strictEqual(typeof outSandbox.window.confengeGreet, "function");
  assert.strictEqual(
    srcSandbox.window.confengeGreet("Ana"),
    outSandbox.window.confengeGreet("Ana"),
    "minified function must return the same value as source"
  );
  assert.strictEqual(
    srcSandbox.root.confengeGreetExport("Ana"),
    outSandbox.root.confengeGreetExport("Ana")
  );
});

check("minifySource: leaves already-minified content untouched (name heuristic)", () => {
  const dense = "var x=1;window.confengeX=x;";
  // isAlreadyMinified is sync; minifySource is async but short-circuits on it.
  assert.strictEqual(isAlreadyMinified("vendor.min.js", dense), true);
});

await checkAsync("minifySource: real repo tools-common.js fixture shrinks and preserves global", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minify-public-js-test-"));
  try {
    const fixturePath = path.join(tmp, "tools-common.js");
    const fixture = `(function () {\n  "use strict";\n  var P = "confenge.tool.";\n  function emit(name, props) {\n    var local = 1 + 1;\n    return name + local;\n  }\n  window.confengeToolsCommon = { emit: emit };\n})();\n`;
    fs.writeFileSync(fixturePath, fixture);
    const text = fs.readFileSync(fixturePath, "utf8");
    const out = await minifySource("tools-common.js", text);
    assert.ok(out.length < text.length);
    assert.ok(out.includes("window.confengeToolsCommon"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

await checkAsync("minifySource: module exports and literal boundaries survive", async () => {
  const source = `
    export const prefix = "pncp_" + "supplier_" + "contracts:";
    export function describe(value) {
      const label = "keep  two spaces";
      return label + ": " + value;
    }
    export const load = () => import('/assets/js/tool-credits.mjs');
  `;
  const compact = await minifySource("fixture.mjs", source);
  const moduleFor = code => import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  const before = await moduleFor(source);
  const after = await moduleFor(compact);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  assert.equal(after.prefix, before.prefix);
  assert.equal(after.describe("contrato"), before.describe("contrato"));
  assert.ok(!compact.includes("pncp_supplier_contracts:"), "evaluate:false must preserve the intentional literal boundary");
  assert.ok(compact.includes("/assets/js/tool-credits.mjs"), "dynamic import target must stay exact");
});

await checkAsync("minifySource: malformed modules fail closed", async () => {
  await assert.rejects(minifySource("broken.mjs", "export const = ;\n"));
});

await checkAsync("publication: only the two explicit modules join existing JS candidates", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "minify-public-modules-test-"));
  const source = "export function describe(value) {\n  const label = 'contrato';\n  return label + value;\n}\n";
  const paths = [...PUBLIC_MODULE_PATHS, "assets/js/unrelated.mjs", "assets/js/fixture.js"];
  const originals = new Map();
  try {
    assert.deepEqual(PUBLIC_MODULE_PATHS, ["assets/tool-showcase/showcase.mjs", "assets/js/tool-referral.mjs"]);
    for (const rel of paths) {
      const text = rel.endsWith(".js") ? IIFE_SOURCE : source;
      originals.set(rel, text);
      for (const base of [root, path.join(root, "_site")]) {
        const target = path.join(base, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, text);
      }
    }
    assert.equal(await run({ check: false, root }), 0);
    assert.equal(await run({ check: true, root }), 0);
    for (const rel of paths) assert.equal(fs.readFileSync(path.join(root, rel), "utf8"), originals.get(rel));
    for (const rel of PUBLIC_MODULE_PATHS) {
      assert.equal(fs.readFileSync(path.join(root, "_site", rel), "utf8"), await minifySource(rel, source));
    }
    assert.equal(fs.readFileSync(path.join(root, "_site/assets/js/unrelated.mjs"), "utf8"), source);
    fs.rmSync(path.join(root, "_site", PUBLIC_MODULE_PATHS[0]));
    assert.equal(await run({ check: true, root }), 2, "a missing declared public module must fail closed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

if (failures > 0) {
  console.error(`test_minify_public_js FAIL: ${failures} failure(s)`);
  process.exit(1);
}
console.log("test_minify_public_js: CHECK_OK");
