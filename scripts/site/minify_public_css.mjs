#!/usr/bin/env node
/** Minify a batch of already-flattened publication stylesheets without pruning. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

export const CSS_MINIFY_SCHEMA = "CONFENGE_PUBLIC_CSS_MINIFY/1.0";

export async function minifyStylesheets(sources) {
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) {
    throw new TypeError("CSS sources must be an object of stylesheet strings");
  }
  const output = Object.create(null);
  for (const [name, css] of Object.entries(sources)) {
    if (typeof css !== "string") throw new TypeError(`${name}: CSS source must be a string`);
    const result = await transform(css, {
      loader: "css",
      sourcefile: name,
      minifyWhitespace: true,
      minifySyntax: false,
      minifyIdentifiers: false,
      legalComments: "none",
    });
    // A recovered parse could silently discard a declaration. Publication must
    // stop instead of shipping that recovery as an apparently successful asset.
    if (result.warnings.length) {
      throw new Error(`${name}: CSS parser warning: ${result.warnings.map(item => item.text).join("; ")}`);
    }
    output[name] = result.code;
  }
  return output;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const request = JSON.parse(fs.readFileSync(0, "utf8"));
    if (request.schema_version !== CSS_MINIFY_SCHEMA) throw new Error("Unsupported CSS minification request");
    const files = await minifyStylesheets(request.files);
    process.stdout.write(JSON.stringify({ schema_version: CSS_MINIFY_SCHEMA, files }));
  } catch (error) {
    console.error(`FAIL-CLOSED public CSS minification: ${error.message}`);
    process.exitCode = 1;
  }
}
