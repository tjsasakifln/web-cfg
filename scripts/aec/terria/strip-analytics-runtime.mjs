import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const runtime = process.argv[2];
if (!runtime) throw new Error("Use: node strip-analytics-runtime.mjs <runtime-directory>");
const path = resolve(runtime, "build/704.TerriaMap.js");
const source = await readFile(path, "utf8");
const marker = "2874(e,t,r){";
const upstreamModuleSha256 = "5f3e7627353113a699cd3bb588bf626955829e8061e7c2cfffb5af6b21f51ae1";
const replacement = "2874(e,t,r){\"use strict\";Object.defineProperty(t,\"__esModule\",{value:!0}),t.GA4=void 0,t.default={initialize:function(){},set:function(){},pageview:function(){},send:function(){},event:function(){},exception:function(){},timing:function(){}}}";
const legacyReplacement = "2874(e,t,r){\"use strict\";Object.defineProperty(t,\"__esModule\",{value:!0}),t.GA4=void 0,t.default={}}";
if (source.includes(replacement)) process.exit(0);
if (source.includes(legacyReplacement)) {
  await writeFile(path, source.replace(legacyReplacement, replacement));
  process.exit(0);
}
const start = source.indexOf(marker);
if (start < 0) {
  throw new Error("Expected react-ga4 module was not found exactly where the pinned bundle declares it.");
}
if (source.indexOf(marker, start + marker.length) >= 0) throw new Error("react-ga4 module marker is not unique.");

let depth = 0, quote = "", escaped = false, end = -1;
for (let index = start + marker.length - 1; index < source.length; index += 1) {
  const character = source[index];
  if (quote) {
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === quote) quote = "";
    continue;
  }
  if (character === "'" || character === '"' || character === "`") { quote = character; continue; }
  if (character === "{") depth += 1;
  if (character === "}" && --depth === 0) { end = index + 1; break; }
}
if (end < 0) throw new Error("Could not delimit the pinned react-ga4 module.");
const moduleSource = source.slice(start, end);
if (!moduleSource.includes("GA_MEASUREMENT_ID") || !moduleSource.includes("_loadGA")) {
  throw new Error("The selected module is not the expected third-party GA4 runtime.");
}
if (createHash("sha256").update(moduleSource).digest("hex") !== upstreamModuleSha256) {
  throw new Error("The selected react-ga4 module does not match the pinned TerriaMap input.");
}
await writeFile(path, source.slice(0, start) + replacement + source.slice(end));
