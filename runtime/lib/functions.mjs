import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const FUNCTION_NAME = /^[a-z0-9][a-z0-9-]*$/;

export function readNetlifySchedules(netlifyTomlPath) {
  let source = "";
  try {
    source = readFileSync(netlifyTomlPath, "utf8");
  } catch {
    return new Map();
  }
  const schedules = new Map();
  const block = /\[functions\."([a-z0-9-]+)"\]([\s\S]*?)(?=\n\s*\[|$)/gi;
  let match;
  while ((match = block.exec(source))) {
    const cron = match[2].match(/^\s*schedule\s*=\s*"([^"]+)"/m);
    if (cron) schedules.set(match[1], cron[1]);
  }
  return schedules;
}

export function discoverFunctionDefinitions({
  functionsDir,
  netlifyTomlPath,
} = {}) {
  const directory = resolve(functionsDir);
  const schedules = readNetlifySchedules(netlifyTomlPath);
  const definitions = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name) !== ".cjs") continue;
    const name = basename(entry.name, ".cjs");
    if (!FUNCTION_NAME.test(name)) continue;
    definitions.push({
      name,
      file: join(directory, entry.name),
      schedule: schedules.get(name) || null,
      schedule_timezone: schedules.has(name) ? "UTC" : null,
      http_routes: schedules.has(name)
        ? []
        : [
            "/.netlify/functions/" + name,
            "/api/web/" + name,
          ],
    });
  }
  return definitions.sort((a, b) => a.name.localeCompare(b.name));
}

export function createFunctionRegistry({
  functionsDir,
  netlifyTomlPath,
  requireFrom = import.meta.url,
} = {}) {
  const definitions = discoverFunctionDefinitions({ functionsDir, netlifyTomlPath });
  const require = createRequire(requireFrom);
  const handlers = new Map();
  const errors = [];

  for (const definition of definitions) {
    try {
      const loaded = require(definition.file);
      if (!loaded || typeof loaded.handler !== "function") {
        errors.push({ name: definition.name, code: "handler_export_missing" });
        continue;
      }
      handlers.set(definition.name, loaded.handler);
    } catch {
      errors.push({ name: definition.name, code: "handler_module_load_failed" });
    }
  }

  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  return Object.freeze({
    definitions,
    errors,
    getDefinition(name) {
      return byName.get(String(name || "")) || null;
    },
    getHttpHandler(name) {
      const definition = byName.get(String(name || ""));
      if (!definition || definition.schedule) return null;
      return handlers.get(definition.name) || null;
    },
    getScheduledHandler(name) {
      const definition = byName.get(String(name || ""));
      if (!definition || !definition.schedule) return null;
      return handlers.get(definition.name) || null;
    },
    getHandler(name) {
      return handlers.get(String(name || "")) || null;
    },
    hasLoadedHandler(name) {
      return handlers.has(String(name || ""));
    },
    loadedCount: handlers.size,
  });
}

export function isSafeFunctionName(name) {
  return FUNCTION_NAME.test(String(name || ""));
}
