const { loadPin, enabledNuclei, NUCLEI } = require("./lib/adaptive-intake.cjs");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { ...headers, Allow: "GET" }, body: JSON.stringify({ ok: false }) };
  }
  const result = loadPin();
  const nuclei = [...enabledNuclei()].filter((id) => Object.hasOwn(NUCLEI, id));
  if (!result.ok || !nuclei.length) {
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: "intake_unavailable" }) };
  }
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      intake_contract_version: result.pin.intake,
      intake_pin_hash: result.hash,
      source_asset_id: result.pin.source_asset_id,
      offer_candidate_id: result.pin.offer_candidate_id,
      nuclei,
    }),
  };
};
