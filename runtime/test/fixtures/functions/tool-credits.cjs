// This fixture exists solely to exercise the adapter's route-specific body
// ceiling without loading Firebase or a payment provider in unit tests.
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ bytes: Buffer.byteLength(event.body || "", "utf8") }),
});
