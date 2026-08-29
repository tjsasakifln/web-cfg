import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tmp = mkdtempSync(join(tmpdir(), "confenge-tools-e2e-fail-closed-"));
const fakeChrome = join(tmp, "not-a-browser");
writeFileSync(fakeChrome, "not executable\n", { mode: 0o600 });

try {
  const child = spawnSync(
    process.execPath,
    ["scripts/site/verify_tools_uiux_e2e.mjs", join(tmp, "evidence")],
    {
      cwd: root,
      env: { ...process.env, CHROME_PATH: fakeChrome, PUPPETEER_EXECUTABLE_PATH: fakeChrome },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  const output = `${child.stdout || ""}\n${child.stderr || ""}`;
  if (child.status === 0 || !output.includes("CHROME_UNAVAILABLE")) {
    console.error("FAIL tools_uiux_chrome_unavailable_must_fail", {
      status: child.status,
      signal: child.signal,
      output: output.slice(-1200),
    });
    process.exit(1);
  }
  console.log("PASS tools_uiux_chrome_unavailable_must_fail", child.status);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
