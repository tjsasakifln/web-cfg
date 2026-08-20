/**
 * Persist-first confenge.search_observation.v1 tick.
 * Runs on Netlify schedule so Blobs context is real. Produce then drain.
 * HELD when Warmbly omits the v1 capability; records are not dropped.
 */
const { produceFromShippedOverlay, drainHeld } = require("./lib/search-observation.cjs");

function bindBlobs(event) {
  try {
    const { connectLambda } = require("@netlify/blobs");
    if (event && event.blobs) connectLambda(event);
  } catch {
    /* optional */
  }
}

exports.handler = async (event) => {
  bindBlobs(event);
  const produced = await produceFromShippedOverlay({ env: process.env });
  const drained = await drainHeld({ env: process.env, limit: 20 });
  const producedOk = Boolean(produced && produced.ok);
  const drainedOk = Boolean(drained && drained.ok);
  const outbox = (produced && produced.record && produced.record.outbox) || {};
  return {
    statusCode: producedOk || produced?.error === "overlay_missing" ? 200 : 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
    body: JSON.stringify({
      ok: producedOk && drainedOk,
      produced: {
        ok: producedOk,
        replay: Boolean(produced && produced.replay),
        status: outbox.status || null,
        error: (produced && produced.error) || null,
      },
      drained,
    }),
  };
};
