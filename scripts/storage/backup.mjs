#!/usr/bin/env node
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { snapshotStore, restoreSnapshot, pruneSnapshots, verifySnapshot } = require("./lib.cjs");

function parse(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--apply") out.apply = true;
    else if (item.startsWith("--")) out[item.slice(2).replace(/-/g, "_")] = argv[++i];
    else if (!out.command) out.command = item;
    else throw new Error(`unexpected_argument:${item}`);
  }
  return out;
}

function main() {
  const options = parse(process.argv.slice(2));
  let result;
  if (options.command === "snapshot") {
    if (!options.store || !options.out) throw new Error("--store and --out are required");
    result = snapshotStore(options.store, options.out, { apply: options.apply });
    if (options.apply && options.retain) {
      result.retention = pruneSnapshots(options.out, options.retain, { apply: true });
    }
  } else if (options.command === "restore") {
    if (!options.snapshot || !options.target) throw new Error("--snapshot and --target are required");
    result = restoreSnapshot(options.snapshot, options.target, { apply: options.apply });
  } else if (options.command === "verify") {
    if (!options.snapshot) throw new Error("--snapshot is required");
    const checked = verifySnapshot(options.snapshot);
    result = {
      dry_run: true,
      status: "SNAPSHOT_VERIFIED",
      file_count: checked.manifest.file_count,
      aggregate_sha256: checked.manifest.aggregate_sha256,
    };
  } else if (options.command === "prune") {
    if (!options.out || !options.retain) throw new Error("--out and --retain are required");
    result = pruneSnapshots(options.out, options.retain, { apply: options.apply });
  } else {
    throw new Error("command must be snapshot, restore, verify, or prune");
  }
  process.stdout.write(JSON.stringify(result) + "\n");
}

try {
  main();
} catch (err) {
  process.stderr.write(JSON.stringify({ ok: false, error: String(err.code || err.message || "storage_backup_failed").slice(0, 120) }) + "\n");
  process.exit(1);
}
