"use strict";

const { spawn } = require("node:child_process");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { createHmac, randomBytes } = require("node:crypto");

const ROOT = resolve(__dirname, "../../runtime/science-tools");
const PYTHON = join(ROOT, "python/bin/python3.12");
const OPERATIONS = new Set(["memory", "section", "concrete", "frame", "geotechnical", "comfort", "solar"]);
const MAX_BODY = 480 * 1024;
const MAX_OUTPUT = 2 * 1024 * 1024;
const WINDOW = 5 * 60_000;
const LIMIT = 12;
const buckets = new Map();
const salt = randomBytes(32);
let active = false;
let compiledCache;

function compilerCache() {
  if (!compiledCache) {
    // Numba stores compiled upstream functions, never calculation inputs or
    // outputs. A private directory per Node process/release avoids recompiling
    // every request and cannot load a cache supplied by a visitor.
    compiledCache = mkdtempSync(join(tmpdir(), "confenge-science-code-"));
    process.once("exit", () => rmSync(compiledCache, { recursive: true, force: true }));
  }
  return compiledCache;
}

const response = (statusCode, body, headers = {}) => ({ statusCode, headers: {
  "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff", ...headers,
}, body: JSON.stringify(body) });

function allowedOrigin(headers) {
  if (headers["sec-fetch-site"] === "cross-site") return false;
  if (!headers.origin) return true;
  try {
    const url = new URL(headers.origin);
    if (url.origin === "https://confenge.com.br" || url.origin === "https://www.confenge.com.br") return true;
    return process.env.NODE_ENV !== "production" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch { return false; }
}

function rateLimit(headers) {
  const now = Date.now();
  for (const [key, entry] of buckets) if (entry.until <= now) buckets.delete(key);
  // The portable adapter strips untrusted forwarded headers before invoking us.
  const ip = String(headers["x-forwarded-for"] || headers["client-ip"] || "unknown").split(",")[0].trim().slice(0, 80);
  const key = createHmac("sha256", salt).update(ip).digest("hex");
  let entry = buckets.get(key);
  if (!entry) {
    if (buckets.size >= 2048) return 60;
    entry = { count: 0, until: now + WINDOW };
    buckets.set(key, entry);
  }
  if (entry.count >= LIMIT) return Math.max(1, Math.ceil((entry.until - now) / 1000));
  entry.count += 1;
  return 0;
}

function boundedStructure(value) {
  const pending = [[value, 0]];
  let count = 0;
  while (pending.length) {
    const [entry, depth] = pending.pop();
    if (++count > 100000 || depth > 12) return false;
    if (typeof entry === "number" && !Number.isFinite(entry)) return false;
    if (entry && typeof entry === "object") for (const child of Object.values(entry)) pending.push([child, depth + 1]);
  }
  return true;
}

async function run(serialized) {
  const directory = mkdtempSync(join(tmpdir(), "confenge-science-"));
  try {
    return await new Promise((accept) => {
      const child = spawn(PYTHON, ["-I", "-B", join(ROOT, "worker.py")], {
        cwd: directory, shell: false, windowsHide: true,
        env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
          OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1", MKL_NUM_THREADS: "1", NUMBA_NUM_THREADS: "1",
          MPLBACKEND: "Agg", MPLCONFIGDIR: directory, NUMBA_CACHE_DIR: compilerCache(), TMPDIR: directory,
          PYTHONDONTWRITEBYTECODE: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = [], bytes = 0, timedOut = false, finished = false;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 21_000);
      const finish = (value) => { if (finished) return; finished = true; clearTimeout(timer); accept(value); };
      child.on("error", () => finish(response(503, { ok: false, error: "CALCULATION_UNAVAILABLE" })));
      child.stderr.on("data", () => {}); // No inputs, model data, paths or provider diagnostics are logged.
      child.stdout.on("data", chunk => {
        bytes += chunk.length;
        if (bytes > MAX_OUTPUT) child.kill("SIGKILL"); else stdout.push(chunk);
      });
      child.on("close", (code) => {
        if (timedOut) return finish(response(422, { ok: false, error: "MODEL_LIMIT", message: "O modelo excedeu o tempo de cálculo. Reduza sua complexidade." }));
        if (code !== 0 || bytes > MAX_OUTPUT) return finish(response(422, { ok: false, error: "MODEL_LIMIT", message: "O modelo excede os limites de cálculo." }));
        try {
          const body = JSON.parse(Buffer.concat(stdout).toString("utf8"));
          if (body?.ok === true && body.result?.schema === "confenge.science-result/v1") return finish(response(200, body));
          if (body?.ok === false && typeof body.error === "string") return finish(response(body.error === "CALCULATION_UNAVAILABLE" ? 503 : 422, body));
        } catch {}
        finish(response(503, { ok: false, error: "CALCULATION_UNAVAILABLE" }));
      });
      child.stdin.on("error", () => {});
      child.stdin.end(serialized);
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

exports.handler = async (event) => {
  const method = String(event.httpMethod || "GET").toUpperCase();
  if (method !== "POST") return response(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, { Allow: "POST" });
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  if (!allowedOrigin(headers)) return response(403, { ok: false, error: "ORIGIN_REJECTED" });
  if (!/^application\/json(?:;|$)/i.test(headers["content-type"] || "")) return response(415, { ok: false, error: "JSON_REQUIRED" });
  const raw = event.isBase64Encoded ? Buffer.from(String(event.body || ""), "base64").toString("utf8") : String(event.body || "");
  if (Buffer.byteLength(raw) > MAX_BODY) return response(413, { ok: false, error: "MODEL_LIMIT" });
  let request;
  try { request = JSON.parse(raw); } catch { return response(400, { ok: false, error: "INVALID_MODEL" }); }
  if (!request || Array.isArray(request) || Object.keys(request).length !== 2 || !OPERATIONS.has(request.operation)
      || !request.data || typeof request.data !== "object" || Array.isArray(request.data)) return response(422, { ok: false, error: "INVALID_MODEL" });
  if (!boundedStructure(request)) return response(422, { ok: false, error: "MODEL_LIMIT", message: "Estrutura de dados inválida ou excessivamente profunda." });
  // Serialize before starting a process. A nested hostile JSON must never leave
  // an untracked worker waiting for stdin after the concurrency slot is freed.
  let serialized;
  try { serialized = JSON.stringify(request); } catch { return response(422, { ok: false, error: "INVALID_MODEL" }); }
  const retry = rateLimit(headers);
  if (retry) return response(429, { ok: false, error: "RATE_LIMIT", message: "Aguarde alguns minutos antes de calcular novamente." }, { "Retry-After": String(retry) });
  if (!existsSync(PYTHON)) return response(503, { ok: false, error: "CALCULATION_UNAVAILABLE" });
  if (active) return response(429, { ok: false, error: "CALCULATION_BUSY", message: "Há um cálculo em andamento. Tente novamente em instantes." }, { "Retry-After": "5" });
  active = true;
  try { return await run(serialized); } finally { active = false; }
};
