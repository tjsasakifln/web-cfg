import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "./lib/config.mjs";
import { createFunctionRegistry } from "./lib/functions.mjs";
import { createStructuredLogger } from "./lib/logger.mjs";
import { createPortableRuntime } from "./lib/server.mjs";

export async function main() {
  const logger = createStructuredLogger();
  const config = loadRuntimeConfig();
  const registry = createFunctionRegistry({
    functionsDir: config.functionsDir,
    netlifyTomlPath: config.netlifyTomlPath,
  });
  const runtime = createPortableRuntime({ config, registry, logger });

  try {
    await runtime.listen();
  } catch (error) {
    const failures = Array.isArray(error && error.failures) ? error.failures : [];
    logger("error", "runtime_start_refused", {
      status: 78,
      error_code: failures.join(",") || "listen_failed",
      environment: config.identity.environment,
      profile: config.identity.profile,
      storage_backend: config.identity.storage_backend,
    });
    process.exitCode = 78;
    return null;
  }

  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    const result = await runtime.shutdown(signal);
    if (!result.ok) process.exit(1);
  };
  process.once("SIGTERM", () => void stop("SIGTERM"));
  process.once("SIGINT", () => void stop("SIGINT"));
  return runtime;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
