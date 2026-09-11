import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = [
  "test_local_capture.mjs",
  "test_local_handoff.mjs",
  "test_attribution_context.mjs",
  "test_netcup_proof_gate.mjs",
  "test_browser_journey.mjs",
];

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(dir, file)], {
    stdio: "inherit",
    env: { ...process.env },
    cwd: path.resolve(dir, "../../.."),
  });
  if (result.status !== 0) {
    failed += 1;
    console.error("SUITE_FAIL", file, result.status);
  }
}
if (failed) {
  process.exit(1);
}
console.log("POS_INB_01_ALL_OK", JSON.stringify({ files: files.length }));
