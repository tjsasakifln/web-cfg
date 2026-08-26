import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { isolatedTestEnv } from "./helpers.mjs";

const CLI = resolve("runtime/schedule.mjs");

function lastJsonLine(output) {
  const lines = String(output || "").trim().split("\n").filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Business handlers can write safe operational lines before the CLI summary.
    }
  }
  return null;
}

test("Netlify scheduled semantics run from the portable CLI", () => {
  const result = spawnSync(
    process.execPath,
    [CLI, "search-observation-tick"],
    {
      cwd: resolve("."),
      env: isolatedTestEnv({
        RUNTIME_FUNCTIONS_DIR: "",
        RUNTIME_HANDLER_TIMEOUT_MS: "5000",
      }),
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = lastJsonLine(result.stdout);
  assert.deepEqual(summary, {
    ok: true,
    scheduled_job: "search-observation-tick",
    cron: "30 11 * * *",
    timezone: "UTC",
    status_code: 200,
    handler_ok: true,
  });
});

test("unknown schedule is rejected without invoking an HTTP route", () => {
  const result = spawnSync(
    process.execPath,
    [CLI, "not-a-schedule"],
    {
      cwd: resolve("."),
      env: isolatedTestEnv({ RUNTIME_FUNCTIONS_DIR: "" }),
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.equal(result.status, 64);
  assert.equal(lastJsonLine(result.stdout).error, "scheduled_function_not_found");
});
