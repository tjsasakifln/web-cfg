/**
 * Correction-request intake — CONFENGE.
 *
 * Persist-first receipt. Not a CRM. Public response is receipt + prazo UNKNOWN.
 * Extra PII (CPF, RG, date of birth, home address) is rejected before persist.
 */
const fs = require("fs");
const path = require("path");
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
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }
  _path(id) {
    return path.join(this.dir, `${id}.json`);
  }
  async put(record) {
    fs.writeFileSync(this._path(record.receipt_id), JSON.stringify(record), "utf8");
    return record;
  }
  async get(id) {
    try {
      return JSON.parse(fs.readFileSync(this._path(id), "utf8"));
    } catch {
      return null;
    }
  }
}

function bindBlobsContext(event) {
  try {
    // eslint-disable-next-line import/no-unresolved
    const { connectLambda } = require("@netlify/blobs");
    if (event && event.blobs) {
      connectLambda(event);
      return true;
    }
  } catch (err) {
    safeLog("warn", "correction_blobs_connect_skip", {
      reason: err && err.message ? String(err.message).slice(0, 120) : "skip",
    });
  }
  return false;
}

async function getStore(event) {
  if (_storeOverride) return _storeOverride;
  if (process.env.CORRECTION_STORE_DIR) {
    return new FileCorrectionStore(process.env.CORRECTION_STORE_DIR);
  }
  bindBlobsContext(event);
  try {
    // eslint-disable-next-line import/no-unresolved
    const blobs = require("@netlify/blobs");
    const store = blobs.getStore("confenge-corrections");
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
  if (process.env.NODE_ENV === "test") {
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
