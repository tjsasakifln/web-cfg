import http from "node:http";
import { createHttpAdapter, writeJson } from "./adapter.mjs";
import {
  evaluateReadiness,
  fatalStartupCodes,
  loadRuntimeConfig,
} from "./config.mjs";
import { createFunctionRegistry } from "./functions.mjs";
import { createStructuredLogger } from "./logger.mjs";

function allSettled(values) {
  return Promise.allSettled([...values]);
}

export function createPortableRuntime({
  config = loadRuntimeConfig(),
  registry,
  logger = createStructuredLogger(),
} = {}) {
  const functionRegistry = registry || createFunctionRegistry({
    functionsDir: config.functionsDir,
    netlifyTomlPath: config.netlifyTomlPath,
  });
  const activeRequests = new Set();
  const activeHandlers = new Set();
  const sockets = new Set();
  let shutdownPromise = null;

  const readiness = () => evaluateReadiness(config, functionRegistry);
  const trackInvocation = (promise) => {
    activeHandlers.add(promise);
    promise.then(
      () => activeHandlers.delete(promise),
      () => activeHandlers.delete(promise),
    );
    return promise;
  };
  const adapter = createHttpAdapter({
    config,
    registry: functionRegistry,
    identity: config.identity,
    readiness,
    logger,
    trackInvocation,
  });

  const server = http.createServer((req, res) => {
    const request = adapter(req, res);
    activeRequests.add(request);
    request.then(
      () => activeRequests.delete(request),
      () => {
        activeRequests.delete(request);
        writeJson(res, 500, { ok: false, error: "internal_error" }, "unavailable");
      },
    );
  });
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = config.headersTimeoutMs;
  server.keepAliveTimeout = config.keepAliveTimeoutMs;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("clientError", (_error, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    }
  });

  async function listen() {
    const initial = readiness();
    const fatal = fatalStartupCodes(config, initial);
    if (fatal.length) {
      const error = new Error("runtime_startup_refused");
      error.code = "runtime_startup_refused";
      error.failures = fatal;
      throw error;
    }
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(config.port, config.host);
    });
    const address = server.address();
    logger("info", "runtime_listening", {
      host: typeof address === "object" && address ? address.address : config.host,
      port: typeof address === "object" && address ? address.port : config.port,
      release_sha: config.identity.release_sha,
      storage_backend: config.identity.storage_backend,
      environment: config.identity.environment,
      profile: config.identity.profile,
      contract_version: config.identity.contract_version,
    });
    return address;
  }

  async function shutdown(signal = "manual") {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      logger("info", "runtime_shutdown_started", {
        signal,
        active_requests: activeRequests.size,
        active_handlers: activeHandlers.size,
      });
      let closeResolved = !server.listening;
      const closePromise = server.listening
        ? new Promise((resolve) => {
            server.close(() => {
              closeResolved = true;
              resolve();
            });
            if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
          })
        : Promise.resolve();
      let forced = false;
      let timer;
      const grace = new Promise((resolve) => {
        timer = setTimeout(() => {
          forced = true;
          for (const socket of sockets) socket.destroy();
          resolve();
        }, config.shutdownGraceMs);
      });
      const drained = (async () => {
        await allSettled(activeRequests);
        await allSettled(activeHandlers);
        if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
        await closePromise;
      })();
      await Promise.race([drained, grace]);
      clearTimeout(timer);
      if (!closeResolved && server.listening) {
        for (const socket of sockets) socket.destroy();
      }
      logger(forced ? "error" : "info", "runtime_shutdown_complete", {
        signal,
        status: forced ? 1 : 0,
        active_requests: activeRequests.size,
        active_handlers: activeHandlers.size,
      });
      return { ok: !forced, forced };
    })();
    return shutdownPromise;
  }

  return Object.freeze({
    server,
    config,
    registry: functionRegistry,
    readiness,
    listen,
    shutdown,
    activeRequests,
    activeHandlers,
  });
}
