/**
 * Loaders for shipped units. Checks must enter through these, not copies.
 */
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function requireFrom(root) {
  const req = createRequire(path.join(root, "package.json"));
  return req;
}

export function loadLead(root) {
  const req = requireFrom(root);
  const leadPath = path.join(root, "netlify/functions/lead.cjs");
  const ratePath = path.join(root, "netlify/functions/lib/lead-rate-limit.cjs");
  const storePath = path.join(root, "netlify/functions/lib/lead-store.cjs");
  const corePath = path.join(root, "netlify/functions/lib/lead-core.cjs");
  const deliveryPath = path.join(root, "netlify/functions/lib/lead-delivery.cjs");
  for (const p of [leadPath, ratePath, storePath, corePath, deliveryPath]) {
    try {
      delete req.cache[req.resolve(p)];
    } catch {
      /* not loaded */
    }
  }
  const lead = req(leadPath);
  const { MemoryStore } = req(storePath);
  const { _reset } = req(ratePath);
  return { handler: lead.handler, setStoreForTests: lead.setStoreForTests, MemoryStore, _reset };
}

export function loadEventContract(root) {
  const req = requireFrom(root);
  const p = path.join(root, "netlify/functions/lib/event-contract.cjs");
  try {
    delete req.cache[req.resolve(p)];
  } catch {
    /* not loaded */
  }
  return req(p);
}

export function loadPersistOrder(root) {
  const req = requireFrom(root);
  const p = path.join(root, "scripts/conversion/persist-order.cjs");
  try {
    delete req.cache[req.resolve(p)];
  } catch {
    /* not loaded */
  }
  return req(p);
}

export function loadReadiness(root) {
  const req = requireFrom(root);
  const p = path.join(root, "assets/js/private-project-technical-readiness.cjs");
  try {
    delete req.cache[req.resolve(p)];
  } catch {
    /* not loaded */
  }
  return req(p);
}

export function loadCollect(root) {
  const req = requireFrom(root);
  const p = path.join(root, "netlify/functions/collect.cjs");
  try {
    delete req.cache[req.resolve(p)];
  } catch {
    /* not loaded */
  }
  return req(p);
}

export async function loadProofRegistry(root) {
  return import(path.join(root, "scripts/commercial/real_proof_registry.mjs"));
}

export function loadConfengeTrack(root) {
  const code = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const dataLayer = [];
  const sessionValues = new Map();
  const sessionStorage = {
    getItem: (key) => sessionValues.get(key) || null,
    setItem: (key, value) => sessionValues.set(key, String(value)),
  };
  const document = {
    readyState: "complete",
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    documentElement: { scrollHeight: 2000 },
    addEventListener: () => {},
    body: { classList: { remove() {}, add() {} } },
  };
  const windowObj = {
    dataLayer,
    matchMedia: () => ({ matches: false }),
    location: { pathname: "/", search: "", hash: "" },
    document,
    addEventListener: () => {},
    innerHeight: 800,
    scrollY: 0,
    sessionStorage,
    crypto: { randomUUID: () => "8e0bdd75-a332-45d8-8ec9-5d98843f0099" },
    CONFENGE_DEBUG_ANALYTICS: false,
  };
  windowObj.window = windowObj;
  const sandbox = { window: windowObj, document, console, URLSearchParams, sessionStorage };
  createContext(sandbox);
  runInContext(code, sandbox);
  return { track: sandbox.window.confengeTrack, dataLayer, window: sandbox.window };
}

export function leadEvent(body, method = "POST", extraHeaders = {}) {
  return {
    httpMethod: method,
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-inb15/1.0",
      "x-forwarded-for": extraHeaders.ip || "203.0.113.77",
      ...extraHeaders,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

export function validLead(overrides = {}) {
  return {
    nome: "QA Construtora Independente",
    telefone: "48999990001",
    estagio: "contrato sob pressao",
    jornada: "contrato",
    consentimento: "on",
    origem: "/quantitativos-orcamento-obras/",
    landing_page: "https://confenge.com.br/quantitativos-orcamento-obras/",
    ...overrides,
  };
}

export function familyMembership(root, routes) {
  const py = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "python",
    "family_membership.py",
  );
  const result = spawnSync("python3", [py, "--root", root], {
    encoding: "utf8",
    input: JSON.stringify({ routes }),
    cwd: root,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || "python_failed").slice(0, 800),
      matches: [],
    };
  }
  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    return { ok: false, error: String(err), matches: [] };
  }
}
