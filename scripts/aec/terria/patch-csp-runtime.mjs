import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const runtime = process.argv[2];
if (!runtime) throw new Error("Use: node patch-csp-runtime.mjs <runtime-directory>");

async function replaceExactly(path, before, after) {
  const source = await readFile(path, "utf8");
  if (source.includes(after) && !source.includes(before)) return;
  if (source.split(before).length !== 2) throw new Error(`Unexpected upstream bundle at ${path}.`);
  await writeFile(path, source.replace(before, after));
}

await replaceExactly(
  resolve(runtime, "build/217.TerriaMap.js"),
  `d=b?eval('new (require("worker_threads")["Worker"])("../dist/node/node.js")'):a?new Worker(URL.createObjectURL(new Blob(["onmessage="+va.toString()],{type:"text/javascript"}))):new Worker(x(c)?c:"worker/worker.js",{type:"module"})`,
  `d=b?void 0:a?new Worker(URL.createObjectURL(new Blob(["onmessage="+va.toString()],{type:"text/javascript"}))):new Worker(x(c)?c:"worker/worker.js",{type:"module"})`
);
await replaceExactly(
  resolve(runtime, "build/704.TerriaMap.js"),
  `Function("r","regeneratorRuntime = r")(t)`,
  `globalThis.regeneratorRuntime=t`
);
await replaceExactly(
  resolve(runtime, "build/TerriaMap.js"),
  `a.p="build/",`,
  `a.p="../../build/",`
);


// The artifact audit can read the closing quote after a query parameter
// as the opening quote of a serialized credential. Keep the URL identical
// while making the parameter and its separator separate concat arguments.
await replaceExactly(
  resolve(runtime, "build/704.TerriaMap.js"),
  `"&access_token=")`,
  `"&access_token","=")`
);
