/**
 * Correction-request intake — CONFENGE.
 *
 * Persist-first receipt. Not a CRM. Public response is receipt + prazo UNKNOWN.
 * Extra PII (CPF, RG, date of birth, home address) is rejected before persist.
 */
const crypto = require("crypto");
const {
  parseBody,
  originAllowed,
  corsHeaders,
  publicErrorBody,
  validateCorrectionRequest,
  issueReceipt,
  publicCorrectionBody,
  loadCurrentPolicyVersion,
} = require("./lib/correction-core.cjs");
const { safeLog } = require("./lib/lead-core.cjs");
const { HostFileBackend } = require("./lib/host-file-store.cjs");
const {
  isProductionProfile,
  resolveStorageConfig,
  createHostBackend,
  loadLegacyNetlifyStore,
} = require("./lib/storage-config.cjs");

let _storeOverride = null;
function setStoreForTests(store) {
  _storeOverride = store;
}

class MemoryCorrectionStore {
  constructor() {
    this.map = new Map();
  }
  async put(record) {
    this.map.set(record.receipt_id, record);
    return record;
  }
  async get(id) {
    return this.map.get(id) || null;
  }
}

class FileCorrectionStore {
  constructor(dir, options = {}) {
    this.dir = dir;
    this.backend = options.backend || new HostFileBackend(dir, options);
    this.records = this.backend.namespace("corrections");
  }
  async put(record) {
    const result = this.records.put(String(record.receipt_id), record, { onlyIfNew: true });
    return result.value;
  }
  async get(id) {
    return this.records.get(String(id));
  }
  async list() {
    return this.records.list().map((row) => row.value);
  }
  async delete(id) {
    return this.records.delete(String(id));
  }
}

async function getStore(event) {
  if (_storeOverride) return _storeOverride;
  const cfgEnv = process.env.CORRECTION_STORE_DIR && !process.env.CONFENGE_STORAGE_BACKEND
    ? { ...process.env, LEAD_STORE_DIR: process.env.CORRECTION_STORE_DIR }
    : process.env;
  const cfg = resolveStorageConfig(cfgEnv, event, { allowTestMemory: true });
  if (cfg.ok && cfg.backend === "filesystem") {
    const opened = createHostBackend(cfgEnv, { event });
    return opened.backend
      ? new FileCorrectionStore(cfg.root, { backend: opened.backend })
      : null;
  }
  if (cfg.ok && cfg.backend === "netlify-blobs") try {
    const store = loadLegacyNetlifyStore("confenge-corrections", process.env, event);
    return {
      async put(record) {
        await store.setJSON(record.receipt_id, record);
        return record;
      },
      async get(id) {
        try {
          return (await store.get(id, { type: "json" })) || null;
        } catch {
          return null;
        }
      },
    };
  } catch (err) {
    safeLog("warn", "correction_store_blobs_unavailable", {
      reason: err && err.message ? String(err.message).slice(0, 120) : "skip",
    });
  }
  if (process.env.NODE_ENV === "test" && !isProductionProfile(process.env)) {
    return new MemoryCorrectionStore();
  }
  return null;
}

function contactHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

exports.setStoreForTests = setStoreForTests;
exports.MemoryCorrectionStore = MemoryCorrectionStore;
exports.FileCorrectionStore = FileCorrectionStore;

exports.handler = async (event) => {
  const originCheck = originAllowed(event);
  const headers = corsHeaders(originCheck.origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify(publicErrorBody({ error: "method_not_allowed", message: "Método não permitido." })),
    };
  }
  if (!originCheck.ok) {
    return {
      statusCode: originCheck.status || 403,
      headers,
      body: JSON.stringify(publicErrorBody({ error: originCheck.error, message: originCheck.message })),
    };
  }

  const parsed = parseBody(event);
  if (!parsed.ok) {
    return {
      statusCode: parsed.status || 400,
      headers,
      body: JSON.stringify(
        publicErrorBody({
          error: parsed.error,
          message: parsed.error === "payload_too_large" ? "Payload muito grande." : "Requisição inválida.",
        }),
      ),
    };
  }

  const validated = validateCorrectionRequest(parsed.data);
  if (validated.honeypot) {
    const fake = issueReceipt({ page_url: "/", contested_excerpt: "hp", proposed_correction: "hp", contact: "hp" });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(publicCorrectionBody(fake)),
    };
  }
  if (!validated.ok) {
    return {
      statusCode: validated.status || 400,
      headers,
      body: JSON.stringify(publicErrorBody({ error: validated.error, message: validated.message })),
    };
  }

  const store = await getStore(event);
  if (!store) {
    safeLog("error", "correction_store_unavailable", {});
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify(
        publicErrorBody({
          error: "store_unavailable",
          message: "Serviço temporariamente indisponível. Use o e-mail indicado na página de correções.",
        }),
      ),
    };
  }

  const policyVersion = loadCurrentPolicyVersion();
  const receipt = issueReceipt(validated.request, { policyVersion });
  const record = {
    receipt_id: receipt.receipt_id,
    received_at: new Date().toISOString(),
    page_url: validated.request.page_url,
    contested_excerpt: validated.request.contested_excerpt,
    proposed_correction: validated.request.proposed_correction,
    contact_kind: validated.request.contact_kind,
    contact_hash: contactHash(validated.request.contact),
    contact: validated.request.contact,
    contact_name: validated.request.contact_name,
    consentimento: true,
    prazo: "UNKNOWN",
    policy_version: policyVersion,
    source: "CONFENGE_WEB",
    kind: "correction_request",
    delete_after: new Date(
      Date.now() + Number(process.env.CORRECTION_RETAIN_DAYS || 730) * 864e5,
    ).toISOString(),
  };

  try {
    await store.put(record);
  } catch (err) {
    safeLog("error", "correction_persist_fail", {
      reason: err && err.message ? String(err.message).slice(0, 120) : "fail",
    });
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify(
        publicErrorBody({
          error: "persist_failed",
          message: "Não foi possível registrar o pedido. Use o e-mail indicado na página de correções.",
        }),
      ),
    };
  }

  safeLog("info", "correction_persisted", {
    receipt_id: receipt.receipt_id,
    prazo: "UNKNOWN",
    policy_version: policyVersion,
    contact_kind: validated.request.contact_kind,
  });

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify(publicCorrectionBody(receipt)),
  };
};
