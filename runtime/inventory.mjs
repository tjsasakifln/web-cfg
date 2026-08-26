import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FUNCTIONS_DIR,
  DEFAULT_NETLIFY_TOML,
  REPO_ROOT,
} from "./lib/config.mjs";
import {
  createFunctionRegistry,
  discoverFunctionDefinitions,
} from "./lib/functions.mjs";

const NETLIFY_SCHEDULE_DOC = "https://docs.netlify.com/build/functions/scheduled-functions/";
const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".toml",
  ".txt",
  ".yaml",
  ".yml",
]);

function gitFiles(root) {
  try {
    return execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }).split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

function filesBelow(directory, root, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) filesBelow(path, root, output);
    else output.push(relative(root, path).replaceAll("\\", "/"));
  }
  return output;
}

function readText(root, path) {
  if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) return "";
  try {
    const absolute = resolve(root, path);
    if (statSync(absolute).size > 2 * 1024 * 1024) return "";
    const value = readFileSync(absolute, "utf8");
    return value.includes("\0") ? "" : value;
  } catch {
    return "";
  }
}

function usageCategory(path) {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized === "netlify.toml"
    || normalized.startsWith(".github/workflows/")
    || /(?:^|\/)scheduled[_-]/.test(normalized)
  ) return "workflows_schedules";
  if (
    normalized.startsWith("tests/")
    || /(?:^|\/)test[^/]*\.(?:cjs|js|mjs|py)$/.test(normalized)
    || /(?:^|\/)[^/]*probe[^/]*\.(?:cjs|js|mjs|py)$/.test(normalized)
  ) return "probes_tests";
  if (
    normalized.startsWith("ops/")
    || normalized.startsWith("scripts/revops/")
    || normalized.startsWith("docs/ops/")
    || normalized.startsWith("docs/revops/")
    || normalized === "package.json"
  ) return "ops";
  if (
    normalized.endsWith(".html")
    || normalized === "script.js"
    || normalized.startsWith("js/")
    || normalized.startsWith("assets/js/")
    || normalized.startsWith("scripts/conversion/")
    || normalized === "scripts/offers/render.cjs"
    || normalized.startsWith("scripts/commercial/")
    || normalized.startsWith("scripts/market_answers/")
  ) return "frontend";
  if (normalized.startsWith("docs/")) return "documentation";
  return "internal";
}

function addReference(bucket, category, path, kind) {
  if (!bucket[category]) bucket[category] = [];
  const existing = bucket[category].find((entry) => entry.path === path);
  if (existing) {
    if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
    return;
  }
  bucket[category].push({ path, kinds: [kind] });
}

function usageState(definition, consumers) {
  if (definition.schedule) return "scheduled";
  if ((consumers.frontend || []).length) return "public_runtime";
  if (
    (consumers.ops || []).length
    || (consumers.workflows_schedules || []).length
  ) return "operational_runtime";
  if ((consumers.probes_tests || []).length) return "test_or_legacy_only";
  return "unreferenced_legacy_candidate";
}

export function buildFunctionInventory({
  root = REPO_ROOT,
  functionsDir = DEFAULT_FUNCTIONS_DIR,
  netlifyTomlPath = DEFAULT_NETLIFY_TOML,
} = {}) {
  const definitions = discoverFunctionDefinitions({ functionsDir, netlifyTomlPath });
  const tracked = gitFiles(root);
  const sources = tracked.map((path) => ({ path, text: readText(root, path) }));
  const functions = definitions.map((definition) => {
    const consumers = {};
    if (definition.schedule) {
      addReference(
        consumers,
        "workflows_schedules",
        relative(root, netlifyTomlPath).replaceAll("\\", "/"),
        "netlify_schedule",
      );
    }
    const routePattern = new RegExp(
      "/(?:\\.netlify/functions|api/web)/" + definition.name + "(?:[^A-Za-z0-9_-]|$)",
    );
    const modulePattern = new RegExp(
      "netlify/functions/" + definition.name + "\\.cjs(?:[^A-Za-z0-9_.-]|$)",
    );
    for (const source of sources) {
      if (!source.text) continue;
      if (routePattern.test(source.text)) {
        addReference(consumers, usageCategory(source.path), source.path, "http_route");
      }
      routePattern.lastIndex = 0;
      if (modulePattern.test(source.text)) {
        addReference(consumers, usageCategory(source.path), source.path, "direct_module");
      }
      modulePattern.lastIndex = 0;
    }
    for (const values of Object.values(consumers)) {
      values.sort((a, b) => a.path.localeCompare(b.path));
      for (const entry of values) entry.kinds.sort();
    }
    return {
      name: definition.name,
      file: relative(root, definition.file).replaceAll("\\", "/"),
      usage_state: usageState(definition, consumers),
      routes: definition.http_routes,
      schedule: definition.schedule
        ? {
            cron: definition.schedule,
            timezone: definition.schedule_timezone,
            portable_command: "node runtime/schedule.mjs " + definition.name,
            timezone_authority: NETLIFY_SCHEDULE_DOC,
          }
        : null,
      consumers,
    };
  });

  const files = filesBelow(functionsDir, root)
    .sort()
    .map((path) => ({
      path,
      role: path.startsWith("netlify/functions/lib/")
        ? "support_library"
        : path.startsWith("netlify/functions/data/")
          ? "bundled_data"
          : "function_entrypoint",
    }));
  const registry = createFunctionRegistry({ functionsDir, netlifyTomlPath });
  return {
    inventory_version: "confenge-function-inventory/v1",
    generated_from_sha: (() => {
      try {
        return execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: root,
          encoding: "utf8",
        }).trim();
      } catch {
        return "unknown";
      }
    })(),
    file_count: files.length,
    function_count: functions.length,
    files,
    functions,
    validation: {
      loaded_handlers: registry.loadedCount,
      errors: registry.errors,
      ok: registry.errors.length === 0 && registry.loadedCount === functions.length,
    },
  };
}

export function main(args = process.argv.slice(2)) {
  const inventory = buildFunctionInventory();
  console.log(JSON.stringify(inventory, null, args.includes("--compact") ? 0 : 2));
  if (args.includes("--check") && !inventory.validation.ok) process.exitCode = 1;
  return inventory;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
