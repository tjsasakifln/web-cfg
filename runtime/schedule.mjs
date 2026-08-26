import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateReadiness,
  fatalStartupCodes,
  loadRuntimeConfig,
} from "./lib/config.mjs";
import { createFunctionRegistry } from "./lib/functions.mjs";
import { createStructuredLogger } from "./lib/logger.mjs";

function parseHandlerBody(response) {
  try {
    return response && response.body ? JSON.parse(response.body) : {};
  } catch {
    return {};
  }
}

export async function executeScheduledFunction(name, {
  config = loadRuntimeConfig(),
  registry,
  logger = createStructuredLogger(),
} = {}) {
  const functionRegistry = registry || createFunctionRegistry({
    functionsDir: config.functionsDir,
    netlifyTomlPath: config.netlifyTomlPath,
  });
  const readiness = evaluateReadiness(config, functionRegistry);
  const fatal = fatalStartupCodes(config, readiness);
  if (fatal.length) {
    return {
      ok: false,
      exitCode: 78,
      summary: {
        ok: false,
        scheduled_job: String(name || ""),
        error: "runtime_not_ready",
        failure_codes: fatal,
      },
    };
  }

  const definition = functionRegistry.getDefinition(name);
  const handler = functionRegistry.getScheduledHandler(name);
  if (!definition || !handler) {
    return {
      ok: false,
      exitCode: 64,
      summary: {
        ok: false,
        scheduled_job: String(name || ""),
        error: "scheduled_function_not_found",
      },
    };
  }

  const event = {
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      "x-confenge-runtime-schedule": "1",
    },
    body: "",
    isBase64Encoded: false,
    path: "/.netlify/functions/" + definition.name,
    rawUrl: "/.netlify/functions/" + definition.name,
    rawQuery: "",
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    requestContext: {
      requestId: "schedule-" + Date.now().toString(36),
      identity: { sourceIp: "127.0.0.1" },
    },
  };
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error("schedule_timeout"), { code: "schedule_timeout" })),
        config.handlerTimeoutMs,
      );
    });
    const response = await Promise.race([
      Promise.resolve().then(() => handler(event, {
        functionName: definition.name,
        scheduled: true,
      })),
      timeout,
    ]);
    clearTimeout(timer);
    const statusCode = Number(response && response.statusCode) || 500;
    const body = parseHandlerBody(response);
    const ok = statusCode >= 200 && statusCode < 300 && body.ok !== false;
    const summary = {
      ok,
      scheduled_job: definition.name,
      cron: definition.schedule,
      timezone: definition.schedule_timezone,
      status_code: statusCode,
      handler_ok: body.ok !== false,
    };
    logger(ok ? "info" : "error", "runtime_schedule_complete", {
      scheduled_job: definition.name,
      status: statusCode,
      handler_ok: body.ok !== false,
    });
    return { ok, exitCode: ok ? 0 : 1, summary, response };
  } catch (error) {
    clearTimeout(timer);
    logger("error", "runtime_schedule_failed", {
      scheduled_job: definition.name,
      status: 1,
      error_code: error && error.code === "schedule_timeout"
        ? "schedule_timeout"
        : "schedule_handler_exception",
    });
    return {
      ok: false,
      exitCode: error && error.code === "schedule_timeout" ? 124 : 1,
      summary: {
        ok: false,
        scheduled_job: definition.name,
        error: error && error.code === "schedule_timeout"
          ? "schedule_timeout"
          : "schedule_handler_exception",
      },
    };
  }
}

export async function main(args = process.argv.slice(2)) {
  const name = args[0] || "";
  const result = await executeScheduledFunction(name);
  console.log(JSON.stringify(result.summary));
  process.exitCode = result.exitCode;
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
