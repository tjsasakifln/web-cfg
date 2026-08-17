/**
 * Thin persist adapter on the existing lead store. Not a CRM.
 */
const crypto = require("crypto");

function recordId(kind, key) {
  const digest = crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 20);
  return `offer:${kind}:${digest}`;
}

async function persistRecord(store, kind, key, data) {
  const lead_id = recordId(kind, key);
  const existing = store.getByIdempotency ? await store.getByIdempotency(lead_id) : await store.get(lead_id);
  if (existing) {
    return { record: existing, idempotent: true };
  }
  const record = {
    lead_id,
    idempotency_key: lead_id,
    kind,
    ...data,
    persisted_at: new Date().toISOString(),
  };
  try {
    await store.put(record, { onlyIfNew: true });
  } catch (err) {
    if (err && err.code === "ALREADY_EXISTS" && err.existing) {
      return { record: err.existing, idempotent: true };
    }
    throw err;
  }
  return { record, idempotent: false };
}

async function getRecord(store, kind, key) {
  const lead_id = recordId(kind, key);
  if (store.getByIdempotency) {
    const byIdem = await store.getByIdempotency(lead_id);
    if (byIdem) return byIdem;
  }
  return store.get(lead_id);
}

module.exports = {
  recordId,
  persistRecord,
  getRecord,
};
