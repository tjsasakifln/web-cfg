/**
 * Persist-first confenge.search_observation.v1 tick.
 * Runs on Netlify schedule so Blobs context is real. Produce then drain.
 * HELD when Warmbly omits the v1 capability; records are not dropped.
 */
const { produceFromShippedOverlay, drainHeld } = require("./lib/search-observation.cjs");
const { resolveStorageConfig, loadLegacyNetlifyStore } = require("./lib/storage-config.cjs");

function bindBlobs(event) {
  const cfg = resolveStorageConfig(process.env, event);
  if (!cfg.ok || cfg.backend !== "netlify-blobs") return;
  try {
    loadLegacyNetlifyStore("confenge-leads", process.env, event);
  } catch {
    /* optional */
  }
}

exports.handler = async (event) => {
  bindBlobs(event);
  const produced = await produceFromShippedOverlay({ env: process.env, event });
  const drained = await drainHeld({ env: process.env, event, limit: 20 });
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
