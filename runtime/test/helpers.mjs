import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "../lib/config.mjs";
import { createFunctionRegistry } from "../lib/functions.mjs";
import { createStructuredLogger } from "../lib/logger.mjs";
import { createPortableRuntime } from "../lib/server.mjs";

export const TEST_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
export const FIXTURE_FUNCTIONS = resolve(TEST_ROOT, "fixtures/functions");

export function isolatedTestEnv(overrides = {}, sourceEnv = process.env) {
  const env = { ...sourceEnv };
  for (const key of [
    "BUILD_TIME",
    "BUILD_TIMESTAMP",
    "CACHED_COMMIT_REF",
    "COMMIT_REF",
    "CONFENGE_STORAGE_BACKEND",
    "CONFENGE_STORAGE_DIR",
    "CONTEXT",
    "CORRECTION_STORE_DIR",
    "LEAD_STORE_DIR",
    "LEAD_STORE_HTTP_URL",
    "NETLIFY_API_TOKEN",
    "NETLIFY_AUTH_TOKEN",
    "NETLIFY_BLOBS_CONTEXT",
    "NETLIFY_BLOBS_SITE_ID",
    "NETLIFY_BLOBS_TOKEN",
    "NETLIFY_SITE_ID",
    "GITHUB_SHA",
    "RELEASE_SHA",
    "RUNTIME_BUILD_TIMESTAMP",
    "RUNTIME_PUBLIC_ARTIFACT_HASH",
    "RUNTIME_RELEASE_BUNDLE_HASH",
    "RUNTIME_RELEASE_SHA",
    "SITE_ID",
  ]) {
    delete env[key];
  }
  return {
    ...env,
    NODE_ENV: "test",
    LEAD_STORE: "memory",
    RUNTIME_FUNCTIONS_DIR: FIXTURE_FUNCTIONS,
    RUNTIME_PORT: "0",
    RUNTIME_MAX_BODY_BYTES: "1024",
    RUNTIME_HANDLER_TIMEOUT_MS: "2000",
    ...overrides,
  };
}

export async function startFixtureRuntime(overrides = {}) {
  const logs = [];
  const env = isolatedTestEnv(overrides);
  const config = loadRuntimeConfig({ env });
  const registry = createFunctionRegistry({
    functionsDir: config.functionsDir,
    netlifyTomlPath: config.netlifyTomlPath,
  });
  const logger = createStructuredLogger({ sink: (line) => logs.push(line) });
  const runtime = createPortableRuntime({ config, registry, logger });
  const address = await runtime.listen();
  return {
    runtime,
    logs,
    baseUrl: "http://127.0.0.1:" + address.port,
  };
}

export function temporaryDirectory(prefix = "confenge-runtime-test-") {
  return mkdtempSync(resolve(tmpdir(), prefix));
}

export async function waitForChildJson(child, predicate, timeoutMs = 5000) {
  return new Promise((resolvePromise, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(new Error("child_json_timeout"));
    }, timeoutMs);
    const onData = (chunk) => {
      buffer += String(chunk);
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const value = JSON.parse(line);
          if (predicate(value)) {
            clearTimeout(timer);
            child.stdout.off("data", onData);
            resolvePromise(value);
            return;
          }
        } catch {
          // Handler business logs may be non-JSON; only runtime records matter here.
        }
      }
    };
    child.stdout.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("child_exited_before_json:" + code));
    });
  });
}

export async function childExit(child, timeoutMs = 5000) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("child_exit_timeout")), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal });
    });
  });
}
