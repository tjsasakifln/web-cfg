#!/usr/bin/env node
import { resolve } from "node:path";

import { HostContractError } from "./lib/contract.mjs";
import { writeRenderedContract } from "./lib/nginx.mjs";

function usage() {
  console.error("Usage: node scripts/migration/netcup/render.mjs [--root DIR] [--output DIR]");
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function args(argv) {
  const parsed = {
    root: resolve(new URL("../../..", import.meta.url).pathname),
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      parsed.root = resolve(requiredValue(argv, index, arg));
      index += 1;
    } else if (arg === "--output") {
      parsed.output = resolve(requiredValue(argv, index, arg));
      index += 1;
    }
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  parsed.output ||= resolve(parsed.root, "build/netcup-host-contract");
  return parsed;
}

try {
  const options = args(process.argv.slice(2));
  const result = writeRenderedContract({ root: options.root, outputDir: options.output });
  console.log(
    JSON.stringify(
      {
        ok: true,
        output_dir: result.outputDir,
        contract_hash: result.contractHash,
        manifest_hash: result.manifestHash,
        host_architecture_version: result.contract.hostArchitectureVersion,
        state: result.contract.state,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const nominal = error instanceof HostContractError ? error.code : "HC_RENDER_FAILED";
  console.error(`${nominal}: ${error.message}`);
  process.exit(2);
}
