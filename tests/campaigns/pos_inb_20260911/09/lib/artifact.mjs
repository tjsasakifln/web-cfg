/**
 * Drive the shipped public-artifact ignore rules. Do not reimplement the
 * allowlist; ask public_artifact.py whether a relative path would be copied.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

export function artifactWouldCopy(root, rel) {
  const py = `
from pathlib import Path
import sys
sys.path.insert(0, ${JSON.stringify(root)})
from scripts.pseo.public_artifact import FORBIDDEN_DIR_NAMES, FORBIDDEN_EXTENSIONS
rel = Path(sys.argv[1])
if any(part in FORBIDDEN_DIR_NAMES for part in rel.parts):
    print("skip:forbidden_dir")
elif rel.suffix.lower() in FORBIDDEN_EXTENSIONS:
    print("skip:forbidden_ext")
else:
    print("copy")
`;
  const result = spawnSync("python3", ["-c", py, rel], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return { ok: false, copy: false, error: result.stderr || result.stdout, rel };
  }
  const line = String(result.stdout || "").trim();
  return { ok: true, copy: line === "copy", observed: line, rel };
}
