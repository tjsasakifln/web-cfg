/**
 * Adversarial local handler: claims a public receipt before any store write.
 * Used only by the mutation runner. Not shipped.
 */
module.exports = {
  async handler() {
    return {
      statusCode: 201,
      headers: {},
      body: JSON.stringify({
        ok: true,
        lead_id: "lead-unpersisted-receipt",
        receipt_id: "lead-unpersisted-receipt",
        status: "persisted",
      }),
    };
  },
};
