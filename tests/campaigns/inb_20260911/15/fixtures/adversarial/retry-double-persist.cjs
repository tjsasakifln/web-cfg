/**
 * Adversarial local handler: retry with the same idempotency key writes a
 * second durable record and returns a new 201. Not shipped.
 */
module.exports = {
  createDoublePersistHandler(store) {
    return {
      async handler(event) {
        const body = JSON.parse(event.body || "{}");
        const key =
          body.idempotency_key ||
          (event.headers && (event.headers["Idempotency-Key"] || event.headers["idempotency-key"])) ||
          "retry-key";
        const n = (store.map && store.map.size) || 0;
        const lead_id = `lead-dup-${String(n + 1).padStart(2, "0")}`;
        const rec = { lead_id, idempotency_key: key, status: "persisted" };
        await store.put(rec);
        return {
          statusCode: 201,
          headers: {},
          body: JSON.stringify({
            ok: true,
            lead_id,
            receipt_id: lead_id,
            status: "persisted",
            idempotent: false,
          }),
        };
      },
    };
  },
};
