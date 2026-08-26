/** Explicit backend selection shared by every dynamic CONFENGE store. */
const { HostFileBackend, StorageError } = require("./host-file-store.cjs");

const BACKENDS = new Set(["filesystem", "netlify-blobs", "memory", "http"]);

function isProductionProfile(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  const context = String(env.CONTEXT || env.NETLIFY_CONTEXT || "").trim().toLowerCase();
  return nodeEnv === "production" || context === "production";
}

function hasNetlifyBlobsContext(env = process.env, event = null) {
  return Boolean(
    env.NETLIFY_BLOBS_CONTEXT ||
    (event && event.blobs) ||
    ((env.NETLIFY_BLOBS_SITE_ID || env.SITE_ID || env.NETLIFY_SITE_ID) &&
      (env.NETLIFY_BLOBS_TOKEN || env.NETLIFY_API_TOKEN || env.NETLIFY_AUTH_TOKEN)),
  );
}

function resolveStorageConfig(env = process.env, event = null, options = {}) {
  const explicit = String(env.CONFENGE_STORAGE_BACKEND || "").trim().toLowerCase();
  if (explicit && !BACKENDS.has(explicit)) {
    return { ok: false, code: "storage_backend_invalid", backend: explicit };
  }
  let backend = explicit;
  let legacy = false;

  if (!backend && env.LEAD_STORE_DIR) {
    backend = "filesystem";
    legacy = true;
  } else if (!backend && String(env.LEAD_STORE || "").toLowerCase() === "memory") {
    backend = "memory";
    legacy = true;
  } else if (!backend && env.LEAD_STORE_HTTP_URL) {
    backend = "http";
    legacy = true;
  } else if (!backend && hasNetlifyBlobsContext(env, event)) {
    // Temporary rollback compatibility. There is deliberately no "else memory".
    backend = "netlify-blobs";
    legacy = true;
  } else if (!backend && String(env.NODE_ENV || "").toLowerCase() === "test" && options.allowTestMemory) {
    backend = "memory";
    legacy = true;
  }

  if (!backend) return { ok: false, code: "storage_backend_required", backend: null };
  if (isProductionProfile(env) && backend === "memory") {
    return { ok: false, code: "memory_store_forbidden_in_production", backend };
  }
  if (isProductionProfile(env) && backend === "http") {
    return { ok: false, code: "http_store_atomic_create_unproven", backend };
  }
  if (backend === "filesystem") {
    const root = String(env.CONFENGE_STORAGE_DIR || env.LEAD_STORE_DIR || "").trim();
    if (!root) return { ok: false, code: "storage_directory_required", backend };
    return { ok: true, backend, root, legacy };
  }
  if (backend === "netlify-blobs" && !hasNetlifyBlobsContext(env, event)) {
    return { ok: false, code: "netlify_blobs_context_required", backend };
  }
  return { ok: true, backend, legacy };
}

function createHostBackend(env = process.env, options = {}) {
  const cfg = resolveStorageConfig(env, options.event, { allowTestMemory: options.allowTestMemory });
  if (!cfg.ok || cfg.backend !== "filesystem") return { config: cfg, backend: null };
  try {
    return {
      config: cfg,
      backend: new HostFileBackend(cfg.root, {
        releaseRoot: options.releaseRoot,
        allowInsideRelease: options.allowInsideRelease,
      }),
    };
  } catch (err) {
    return {
      config: {
        ...cfg,
        ok: false,
        code: err instanceof StorageError ? err.code : "storage_open_failed",
      },
      backend: null,
    };
  }
}

function loadLegacyNetlifyStore(name, env = process.env, event = null) {
  // This is the only shared production dependency load. Filesystem startup never
  // resolves @netlify/blobs, so Netcup remains independent of its context/package.
  // eslint-disable-next-line import/no-unresolved
  const blobs = require("@netlify/blobs");
  if (event && event.blobs && typeof blobs.connectLambda === "function") {
    blobs.connectLambda(event);
  }
  const siteID = env.NETLIFY_BLOBS_SITE_ID || env.SITE_ID || env.NETLIFY_SITE_ID || "";
  const token =
    env.NETLIFY_BLOBS_TOKEN || env.NETLIFY_API_TOKEN || env.NETLIFY_AUTH_TOKEN || "";
  return siteID && token
    ? blobs.getStore({ name, siteID, token })
    : blobs.getStore(name);
}

function storageReadiness(env = process.env, options = {}) {
  const cfg = resolveStorageConfig(env, options.event, { allowTestMemory: false });
  if (!cfg.ok) return { ok: false, backend: cfg.backend, code: cfg.code };
  if (cfg.backend === "memory" || cfg.backend === "http") {
    return { ok: false, backend: cfg.backend, code: "storage_not_durable" };
  }
  if (cfg.backend === "filesystem") {
    const opened = createHostBackend(env, options);
    if (!opened.backend) {
      return { ok: false, backend: "filesystem", code: opened.config.code };
    }
    try {
      opened.backend.validate({ writeProbe: options.writeProbe !== false });
      return { ok: true, backend: "filesystem", legacy: cfg.legacy };
    } catch (err) {
      return {
        ok: false,
        backend: "filesystem",
        code: err instanceof StorageError ? err.code : "storage_probe_failed",
      };
    }
  }
  try {
    const store = loadLegacyNetlifyStore("confenge-leads", env, options.event);
    if (!store) return { ok: false, backend: "netlify-blobs", code: "storage_open_failed" };
    return { ok: true, backend: "netlify-blobs", legacy: true };
  } catch {
    return { ok: false, backend: "netlify-blobs", code: "netlify_blobs_unavailable" };
  }
}

module.exports = {
  BACKENDS,
  isProductionProfile,
  hasNetlifyBlobsContext,
  resolveStorageConfig,
  createHostBackend,
  loadLegacyNetlifyStore,
  storageReadiness,
};
