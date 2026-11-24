/* Local, fixed-purpose Mapshaper worker. No console, URLs or arbitrary commands. */
// Keep Mapshaper's official browser loading order. modules.js provides the
// browser Buffer and other bundled adapters that mapshaper.js expects.
// A Worker has the necessary global capabilities under self, without a DOM.
self.window = self;
importScripts('./vendor/mapshaper-modules-0.8.7.js');
importScripts('./vendor/mapshaper-0.8.7.js');

function percentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 100) throw new Error('Escolha uma retenção entre 1% e 100%.');
  return Math.round(numeric);
}

self.onmessage = async ({ data }) => {
  try {
    const keep = percentage(data?.keep);
    if (!data?.geojson || typeof data.geojson !== 'object') throw new Error('A camada a simplificar é inválida.');
    // Use Mapshaper's documented browser internals directly instead of its
    // command parser: our fixed operation does not need expressions or dynamic
    // command text, so it remains compatible with the production CSP.
    const dataset = self.mapshaper.internal.importGeoJSON(data.geojson);
    self.mapshaper.internal.buildTopology(dataset);
    self.mapshaper.cmd.simplify(dataset, {
      percentage: keep / 100,
      method: 'weighted',
      keep_shapes: true,
      no_repair: false
    });
    const [output] = self.mapshaper.internal.exportGeoJSON(dataset, { rfc7946: true });
    const text = typeof output.content === 'string' ? output.content : output.content.toString('utf8');
    const geojson = JSON.parse(text);
    self.postMessage({ id: data.id, ok: true, geojson, keep });
  } catch (error) {
    self.postMessage({ id: data?.id, ok: false, error: error?.message || 'Não foi possível simplificar a camada.' });
  }
};
