import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { useConfengeControlSurfaces } from "../vendor-controls.mjs";

const require = createRequire(resolve(process.env.AEC_TERRIA_DEPS || process.cwd(), "package.json"));
const postcss = require("postcss");

for (const stylesheet of process.argv.slice(2)) {
  const source = await readFile(stylesheet, "utf8");
  const result = await postcss([useConfengeControlSurfaces]).process(source, { from: stylesheet });
  await writeFile(stylesheet, result.css.replace(/compose:[^;}]*(?:;|})/g, match => match.endsWith("}") ? "}" : ""));
}
